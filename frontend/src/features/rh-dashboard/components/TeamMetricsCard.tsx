import { useState, useEffect } from "react";
import { Info, Layers } from "lucide-react";
import { adminBiService, type BIOverviewResponse } from "../../../services/adminBiService";
import { EmptyState } from "../../../components/common/EmptyState";
import { cn } from "../../../lib/utils";

const STAGE_BAR_COLORS = [
  "bg-purple-600",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-indigo-600",
];

export function TeamMetricsCard() {
  const [biData, setBiData] = useState<BIOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminBiService
      .getBiOverview()
      .then(setBiData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const summary = biData?.summary;
  const stageTotals = biData?.pipeline_by_stage ?? [];

  const totalCandidates = summary?.total_candidates ?? 0;
  const hiredCandidates = summary?.hired_candidates ?? 0;
  const publishedJobs = summary?.published_jobs ?? 0;
  const completedAnalyses = summary?.completed_analyses ?? 0;
  const avgScore = summary?.average_score ? Math.round(summary.average_score) : null;

  return (
    <section className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface p-5 shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
          <h2 className="text-base font-bold tracking-tight text-text">Indicadores BI de talentos</h2>
          <span className="text-xs font-semibold text-text-muted">Dados em tempo real</span>
        </div>

        {/* Real Stage Distribution */}
        <div className="mt-4">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
            <Info className="h-3 w-3" />
            <span>Distribuição por etapa no pipeline</span>
          </div>

          {loading ? (
            <div className="mt-3 space-y-2.5 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 rounded-md bg-surface-muted" />
              ))}
            </div>
          ) : stageTotals.length === 0 ? (
            <div className="py-4">
              <EmptyState icon="0" title="Sem dados de BI registrados." />
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-4">
              {/* Stage Progress Bars */}
              <div className="flex-1 space-y-2.5">
                {stageTotals.slice(0, 4).map((stg, idx) => {
                  const barColor = STAGE_BAR_COLORS[idx % STAGE_BAR_COLORS.length];
                  const percent = totalCandidates > 0 ? Math.round((stg.total / totalCandidates) * 100) : 0;

                  return (
                    <div key={stg.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-text capitalize truncate max-w-[10rem]">{stg.stage}</span>
                        <span className="font-bold text-text-muted">{stg.total}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", barColor)}
                          style={{ width: `${Math.max(percent, stg.total > 0 ? 8 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Real Total Circle */}
              <div className="relative shrink-0 flex items-center justify-center w-24 h-24 rounded-full border-4 border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/20">
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-xl font-black text-text leading-none">{totalCandidates}</span>
                  <span className="text-[10px] font-bold text-text-muted leading-tight mt-0.5">Total</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Real BI Aggregated Metrics */}
      <div className="mt-5 pt-3 border-t border-border/70 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-text-muted">Vagas publicadas</p>
          <p className="text-base font-extrabold text-text mt-0.5">{publishedJobs}</p>
          <p className="text-[10px] font-medium text-text-muted mt-0.5">
            {completedAnalyses} análises IA concluídas
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold text-text-muted">Média de aderência IA</p>
          <p className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {avgScore !== null ? `${avgScore}%` : "—"}
          </p>
          <p className="text-[10px] font-medium text-text-muted mt-0.5">
            {hiredCandidates} contratados
          </p>
        </div>
      </div>
    </section>
  );
}
