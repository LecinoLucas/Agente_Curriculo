import { Info, Filter, Users, FileText, Star, ShieldCheck, ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import { cn } from "../../../lib/utils";
import type { RhDashboardPipelineFunnelResponse } from "../../../services/rhDashboardService";

type Props = {
  data: RhDashboardPipelineFunnelResponse | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

const STAGE_THEMES: Record<string, { icon: any; color: string; bg: string; bar: string }> = {
  triagem: { icon: Filter, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-950/40", bar: "bg-purple-600" },
  entrevista: { icon: Users, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-100 dark:bg-cyan-950/40", bar: "bg-cyan-500" },
  teste: { icon: FileText, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/40", bar: "bg-amber-500" },
  decisao: { icon: Star, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40", bar: "bg-emerald-500" },
  admissao: { icon: ShieldCheck, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-950/40", bar: "bg-indigo-600" },
};

function getStageTheme(id: string, label: string) {
  const normalized = (id + " " + label).toLowerCase();
  if (normalized.includes("triagem") || normalized.includes("novo")) return STAGE_THEMES.triagem;
  if (normalized.includes("entrevista")) return STAGE_THEMES.entrevista;
  if (normalized.includes("teste") || normalized.includes("avalia")) return STAGE_THEMES.teste;
  if (normalized.includes("decis")) return STAGE_THEMES.decisao;
  if (normalized.includes("admiss") || normalized.includes("contrat")) return STAGE_THEMES.admissao;
  return { icon: Layers, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-950/40", bar: "bg-indigo-600" };
}

export function RecruitmentPipelineFunnelCard({ data, loading, error, onRetry }: Props) {
  const stages = data?.stages ?? [];
  const totalCandidates = data?.total ?? 0;

  return (
    <section className="rounded-xl border border-border/80 bg-surface p-5 shadow-xs" data-testid="rh-pipeline-funnel">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-bold tracking-tight text-text">Pipeline de Recrutamento</h2>
            <Info className="h-3.5 w-3.5 text-text-muted" />
          </div>
          <p className="mt-0.5 text-xs text-text-muted">Visão geral dos candidatos por etapa do processo.</p>
        </div>

        <Link
          to="/pipeline"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text hover:bg-surface-muted transition-colors"
        >
          <span>Abrir Pipeline</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Funnel Content */}
      <div className="mt-6">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-5 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-surface-muted" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon="!"
            title="Não foi possível carregar o pipeline."
            description="Tente novamente em instantes."
            action={{ label: "Tentar novamente", onClick: onRetry }}
          />
        ) : stages.length === 0 || totalCandidates === 0 ? (
          <EmptyState
            icon="0"
            title="Nenhum candidato no pipeline."
            description="Cadastre um candidato para ver o funil de recrutamento."
          />
        ) : (
          <div className="relative">
            {/* Stages Row with Connectors */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
              {stages.map((stage, idx) => {
                const theme = getStageTheme(stage.id, stage.label);
                const Icon = theme.icon;
                const percent = totalCandidates > 0 ? Math.round((stage.count / totalCandidates) * 100) : 0;
                const isLast = idx === stages.length - 1;

                return (
                  <div key={stage.id} className="flex items-center gap-2">
                    <div
                      className="flex-1 flex flex-col justify-between rounded-xl border border-border/80 bg-surface-muted/30 p-3.5 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all"
                      data-testid={`rh-pipeline-funnel-stage-${stage.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", theme.bg, theme.color)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-bold text-text truncate">{stage.label}</span>
                      </div>

                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-2xl font-extrabold text-text">{stage.count}</span>
                        <span className="text-xs font-semibold text-text-muted">{percent}%</span>
                      </div>

                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", theme.bar)}
                          style={{ width: `${Math.max(percent, stage.count > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>

                    {!isLast && (
                      <div className="hidden md:flex items-center justify-center text-border text-xs shrink-0 px-0.5">
                        ----→
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Floating Pill Badge */}
            <div className="mt-6 flex justify-center">
              <Link
                to="/pipeline"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted/60 px-4 py-1.5 text-xs font-bold text-text hover:bg-surface-muted transition-colors shadow-2xs"
              >
                <span>{totalCandidates} candidato(s) no pipeline</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
