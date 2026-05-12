import {
  ArrowRight,
  Briefcase,
  Calendar,
  Clock,
  FileSearch,
  FileUp,
  PlusCircle,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { dashboardService, type DashboardStats } from "../services/dashboardService";
import { formatContextError } from "../services/errorMessages";
import { cn } from "../lib/utils";

// ── Mock supplements ─────────────────────────────────────────────────────────
const MOCK_INTERVIEWS = [
  { id: "i1", name: "Ana Lima",       role: "Full Stack Sênior",   time: "10:00", platform: "Meet",  score: 87, avatar: "AL" },
  { id: "i2", name: "Bruno Tavares",  role: "Tech Lead Backend",   time: "11:30", platform: "Zoom",  score: 79, avatar: "BT" },
  { id: "i3", name: "Carla Mendes",   role: "Analista de RH",      time: "14:00", platform: "Teams", score: 91, avatar: "CM" },
  { id: "i4", name: "Diego Carvalho", role: "DevOps Engineer",     time: "15:30", platform: "Meet",  score: 83, avatar: "DC" },
];

const MOCK_PENDING = [
  { id: "p1", label: "Feedbacks pendentes de avaliador", count: 3, dot: "bg-amber-400"  },
  { id: "p2", label: "Propostas aguardando resposta",    count: 2, dot: "bg-rose-400"   },
  { id: "p3", label: "Análises IA em processamento",     count: 5, dot: "bg-blue-400"   },
  { id: "p4", label: "Transferências solicitadas",       count: 1, dot: "bg-violet-400" },
];

const STAGE_LABELS: Record<string, string> = {
  entry:               "Recebido",
  screening:           "Triagem",
  hr_interview:        "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final:               "Final",
  offer:               "Proposta",
  hired:               "Contratado",
  rejected:            "Reprovado",
};

// ── KPI Card — clean, sem glow ───────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, accent, link,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
  link: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(link)}
      className="group flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-5 text-left transition hover:border-[hsl(var(--border))] hover:shadow-sm"
    >
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--surface))]", accent)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-extrabold tracking-tight text-[hsl(var(--text))]">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-[hsl(var(--text-muted))]">{label}</p>
      </div>
      <div className="flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--primary))] opacity-0 transition group-hover:opacity-100">
        Ver <ArrowRight className="h-3 w-3" />
      </div>
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title, action, children, className,
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className={cn("rounded-2xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-tight text-[hsl(var(--text))]">{title}</h3>
        {action && (
          <button
            onClick={() => navigate(action.href)}
            className="text-xs font-semibold text-[hsl(var(--primary))] transition hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardService.getStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err)  => { if (!cancelled) setError(formatContextError(err, "Não foi possível carregar as métricas do dashboard.")); })
      .finally(()   => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-5 px-6 py-6">
        <PageHeader title="Dashboard" subtitle="Carregando..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-[hsl(var(--surface-muted))]/60" />)}
        </div>
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5 px-6 py-6">
        <PageHeader title="Dashboard" subtitle="Ocorreu um erro." />
        <EmptyState icon="⚠️" title="Falha na conexão" description={error} action={{ label: "Tentar novamente", onClick: () => window.location.reload() }} />
      </div>
    );
  }

  const totalPipeline = stats?.candidates_in_pipeline ?? 1;
  const stageEntries  = Object.entries(stats?.candidates_by_stage ?? {});

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium capitalize text-[hsl(var(--text-muted))]">{today}</p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-[hsl(var(--text))]">Visão geral</h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => navigate("/importar")}
            className="flex items-center gap-1.5 rounded-xl border border-[hsl(var(--border))]/70 px-3 py-2 text-sm font-medium text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))]/40"
          >
            <FileUp className="h-3.5 w-3.5" /> Importar
          </button>
          <button
            onClick={() => navigate("/vagas/nova")}
            className="flex items-center gap-1.5 rounded-xl bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90"
          >
            <PlusCircle className="h-3.5 w-3.5" /> Nova Vaga
          </button>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Candidatos"     value={stats?.total_candidates ?? 0}       icon={Users}      accent="bg-blue-500"    link="/candidatos" />
        <KpiCard label="No pipeline"    value={stats?.candidates_in_pipeline ?? 0} icon={TrendingUp} accent="bg-indigo-500"  link="/pipeline"   />
        <KpiCard label="Vagas abertas"  value={stats?.open_jobs ?? 0}              icon={Briefcase}  accent="bg-emerald-600" link="/vagas"      />
        <KpiCard label="Sem vaga"       value={stats?.candidates_waiting_job ?? 0} icon={Clock}      accent="bg-amber-500"   link="/candidatos" />
      </div>

      {/* ── Main 2-col ─────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-5">

        {/* Entrevistas do dia — coluna dominante */}
        <Section
          title="Entrevistas de hoje"
          action={{ label: "Ver agenda", href: "/agenda" }}
          className="lg:col-span-3"
        >
          <div className="divide-y divide-[hsl(var(--border))]/40">
            {MOCK_INTERVIEWS.map((iv) => (
              <div key={iv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                {/* Avatar */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-muted))]/60 text-[11px] font-bold text-[hsl(var(--text))]">
                  {iv.avatar}
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{iv.name}</p>
                  <p className="truncate text-xs text-[hsl(var(--text-muted))]">{iv.role}</p>
                </div>
                {/* Time */}
                <div className="text-right">
                  <p className="text-sm font-bold text-[hsl(var(--text))]">{iv.time}</p>
                  <p className="text-[11px] text-[hsl(var(--text-muted))]">{iv.platform}</p>
                </div>
                {/* Score — único acento de cor */}
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold",
                  iv.score >= 85 ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600",
                )}>
                  {iv.score}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Pendências — coluna menor */}
        <Section title="Pendências" className="lg:col-span-2">
          <div className="space-y-2.5">
            {MOCK_PENDING.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))]/40 px-3 py-2.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", p.dot)} />
                <p className="min-w-0 flex-1 text-sm text-[hsl(var(--text))]">{p.label}</p>
                <span className="shrink-0 text-sm font-bold text-[hsl(var(--text))]">{p.count}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate("/pipeline")}
            className="mt-4 w-full rounded-xl border border-[hsl(var(--primary))]/25 py-2.5 text-sm font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))]/5"
          >
            Abrir Pipeline
          </button>
        </Section>
      </div>

      {/* ── Bottom 2-col ───────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Funil por etapa */}
        <Section title="Candidatos por etapa" action={{ label: "Pipeline", href: "/pipeline" }}>
          {stageEntries.length > 0 ? (
            <div className="space-y-3">
              {stageEntries.map(([stage, count]) => {
                const pct = Math.round((count / totalPipeline) * 100);
                return (
                  <div key={stage}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--text))]">{STAGE_LABELS[stage] ?? stage}</span>
                      <span className="font-bold text-[hsl(var(--text))]">{count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-muted))]/60">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--primary))]/70 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <TrendingUp className="mb-2 h-7 w-7 text-[hsl(var(--text-muted))]" />
              <p className="text-sm text-[hsl(var(--text-muted))]">Nenhum candidato em pipeline.</p>
            </div>
          )}
        </Section>

        {/* Análises recentes */}
        <Section title="Análises IA recentes" action={{ label: "Ver todas", href: "/analises-ia" }}>
          {stats && stats.recent_analyses.length > 0 ? (
            <div className="divide-y divide-[hsl(var(--border))]/40">
              {stats.recent_analyses.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--surface-muted))]/60">
                    <FileSearch className="h-4 w-4 text-[hsl(var(--text-muted))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{a.candidate_name}</p>
                    <p className="truncate text-xs text-[hsl(var(--text-muted))]">{a.job_title}</p>
                  </div>
                  <div className="text-right">
                    <StatusPill
                      label={a.status === "completed" ? "Concluída" : "Processando"}
                      tone={a.status === "completed" ? "success" : "warning"}
                    />
                    <p className="mt-1 text-[10px] text-[hsl(var(--text-muted))]">
                      {new Date(a.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <FileSearch className="mb-2 h-7 w-7 text-[hsl(var(--text-muted))]" />
              <p className="text-sm text-[hsl(var(--text-muted))]">Nenhuma análise recente.</p>
            </div>
          )}
        </Section>
      </div>

    </div>
  );
}
