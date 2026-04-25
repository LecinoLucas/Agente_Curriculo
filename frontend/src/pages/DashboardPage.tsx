import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Bot,
  FileText,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SkeletonCards, SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { useAsyncState } from "../hooks/useAsyncState";
import { loadDashboardSummary } from "../services/dashboardService";

function jobStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "published") return "success";
  if (status === "closed" || status === "cancelled") return "danger";
  if (status === "paused") return "warning";
  return "neutral";
}

function analysisStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  return "warning";
}

function formatAnalysisStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "Na fila",
    processing: "Processando",
    completed: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function formatJobStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    published: "Publicada",
    paused: "Pausada",
    closed: "Encerrada",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function formatRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Administrador",
    recruiter: "Recrutador",
    candidate: "Candidato",
    viewer: "Visualizador",
  };
  return labels[role] ?? role;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function getBarWidth(value: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(8, Math.round((value / max) * 100))}%`;
}

function formatTrendLabel(date: Date): string {
  return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

function getRecentDays(days = 7): Date[] {
  return Array.from({ length: days }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (days - 1 - index));
    return day;
  });
}

type MetricCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  note: string;
  accentClassName: string;
};

function MetricCard({ icon, label, value, note, accentClassName }: MetricCardProps) {
  return (
    <Card className="overflow-hidden border-gray-200 bg-white shadow-sm">
      <CardContent className="p-0">
        <div className={`flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 ${accentClassName}`}>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
            <div className="text-3xl font-semibold tracking-tight text-gray-950">{value}</div>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/85 text-gray-900 shadow-sm">
            {icon}
          </div>
        </div>
        <div className="px-5 py-3">
          <p className="text-sm text-gray-500">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "blue" | "emerald" | "amber" | "rose" | "violet";
}) {
  const toneMap = {
    blue: "from-blue-500 to-indigo-500",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
    violet: "from-violet-500 to-fuchsia-500",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-gray-900">{label}</span>
        <span className="text-gray-500">
          {value} {total > 0 ? `· ${Math.round((value / total) * 100)}%` : ""}
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-100">
        <div className={`h-3 rounded-full bg-gradient-to-r ${toneMap[tone]}`} style={{ width: getBarWidth(value, total) }} />
      </div>
    </div>
  );
}

function TrendCard({
  items,
}: {
  items: Array<{ label: string; count: number; completed: number; pending: number }>;
}) {
  const maxValue = Math.max(1, ...items.map((item) => item.count));

  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          Tendência de análises
        </CardTitle>
        <CardDescription>Últimos 7 dias consolidados a partir dos registros recentes do pipeline.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4">
          <svg viewBox="0 0 700 220" className="h-56 w-full">
            {items.map((item, index) => {
              const x = 40 + index * 92;
              const totalHeight = 150;
              const completedHeight = Math.max(8, (item.completed / maxValue) * totalHeight);
              const pendingHeight = Math.max(8, (item.pending / maxValue) * totalHeight);
              const totalBarHeight = Math.max(10, (item.count / maxValue) * totalHeight);

              return (
                <g key={item.label}>
                  <line x1={x} y1="180" x2={x} y2={180 - totalBarHeight} stroke="rgba(148,163,184,0.20)" strokeWidth="28" strokeLinecap="round" />
                  <line x1={x} y1="180" x2={x} y2={180 - completedHeight} stroke="url(#trend-completed)" strokeWidth="16" strokeLinecap="round" />
                  <line x1={x + 18} y1="180" x2={x + 18} y2={180 - pendingHeight} stroke="url(#trend-pending)" strokeWidth="8" strokeLinecap="round" />
                  <text x={x} y="205" textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">
                    {item.label}
                  </text>
                  <text x={x} y={180 - totalBarHeight - 10} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold">
                    {item.count}
                  </text>
                </g>
              );
            })}
            <defs>
              <linearGradient id="trend-completed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="trend-pending" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-blue-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Total no período</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">
              {items.reduce((sum, item) => sum + item.count, 0)}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Concluídas</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">
              {items.reduce((sum, item) => sum + item.completed, 0)}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-amber-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Em fila</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">
              {items.reduce((sum, item) => sum + item.pending, 0)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, error, loading, run } = useAsyncState<Awaited<ReturnType<typeof loadDashboardSummary>>>();

  useEffect(() => {
    void run(loadDashboardSummary);
  }, [run]);

  const metrics = useMemo(() => {
    const jobs = data?.jobs ?? [];
    const analyses = data?.recentAnalyses ?? [];
    const totalAnalyses = data?.analysesCount ?? 0;
    const completed = analyses.filter((item) => item.status === "completed").length;
    const pending = analyses.filter((item) => item.status === "pending" || item.status === "processing").length;
    const failed = analyses.filter((item) => item.status === "failed" || item.status === "cancelled").length;
    const realAi = analyses.filter((item) => item.used_real_ai).length;
    const avgProcessingTime = analyses.length
      ? Math.round(analyses.reduce((sum, item) => sum + (item.processing_time_ms ?? 0), 0) / analyses.length)
      : 0;
    const jobPublished = jobs.filter((job) => job.status === "published").length;
    const jobPaused = jobs.filter((job) => job.status === "paused").length;
    const jobClosed = jobs.filter((job) => job.status === "closed" || job.status === "cancelled").length;

    return {
      totalAnalyses,
      completed,
      pending,
      failed,
      realAi,
      avgProcessingTime,
      completionRate: totalAnalyses > 0 ? ((data?.completedAnalysesCount ?? 0) / totalAnalyses) * 100 : 0,
      aiUsageRate: analyses.length > 0 ? (realAi / analyses.length) * 100 : 0,
      jobPublished,
      jobPaused,
      jobClosed,
      jobTotal: data?.jobsCount ?? 0,
    };
  }, [data]);

  const trendData = useMemo(() => {
    const days = getRecentDays(7);
    const analyses = data?.recentAnalyses ?? [];

    return days.map((day) => {
      const dayKey = day.toISOString().slice(0, 10);
      const dayItems = analyses.filter((item) => item.created_at.slice(0, 10) === dayKey);
      return {
        label: formatTrendLabel(day),
        count: dayItems.length,
        completed: dayItems.filter((item) => item.status === "completed").length,
        pending: dayItems.filter((item) => item.status === "pending" || item.status === "processing").length,
      };
    });
  }, [data]);

  const topAnalyses = useMemo(() => {
    return [...(data?.recentAnalyses ?? [])]
      .filter((item) => item.status === "completed" && typeof item.overall_score === "number")
      .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
      .slice(0, 5);
  }, [data]);

  const alerts = useMemo(() => {
    const items: Array<{ tone: "warning" | "danger" | "info"; title: string; description: string }> = [];

    if (metrics.pending > 0) {
      items.push({
        tone: "warning",
        title: "Há fila ativa",
        description: `${metrics.pending} análises ainda estão aguardando ou em processamento.`,
      });
    }
    if (metrics.failed > 0) {
      items.push({
        tone: "danger",
        title: "Falhas recentes",
        description: `${metrics.failed} análises falharam ou foram canceladas recentemente.`,
      });
    }
    if (metrics.jobPaused > 0) {
      items.push({
        tone: "info",
        title: "Vagas pausadas",
        description: `${metrics.jobPaused} vagas estão pausadas e podem precisar de revisão.`,
      });
    }
    if (metrics.aiUsageRate < 35) {
      items.push({
        tone: "warning",
        title: "Uso real de IA baixo",
        description: "O painel ainda depende bastante de mock ou de análises sem token real.",
      });
    }

    return items.slice(0, 3);
  }, [metrics.aiUsageRate, metrics.failed, metrics.jobPaused, metrics.pending]);

  const insightCards = useMemo(
    () => [
      {
        title: "Fila viva",
        value: metrics.pending,
        tone: metrics.pending > 0 ? "amber" : "emerald",
        description:
          metrics.pending > 0 ? "há análises aguardando triagem ou processamento" : "não há pendências no pipeline agora",
      },
      {
        title: "Falhas recentes",
        value: metrics.failed,
        tone: metrics.failed > 0 ? "rose" : "emerald",
        description:
          metrics.failed > 0 ? "existem análises que merecem revisão" : "nenhuma falha recente foi detectada",
      },
      {
        title: "IA real",
        value: formatPercent(metrics.aiUsageRate),
        tone: metrics.aiUsageRate >= 50 ? "blue" : "violet",
        description:
          metrics.aiUsageRate >= 50 ? "boa parte das análises está usando modelo real" : "o uso real de IA ainda está baixo",
      },
      {
        title: "Top score",
        value: topAnalyses.length > 0 && topAnalyses[0].overall_score != null ? topAnalyses[0].overall_score : "—",
        tone: "emerald",
        description:
          topAnalyses.length > 0
            ? `${topAnalyses[0].candidate_name ?? "Candidato"} lidera a lista recente`
            : "aguardando análises concluídas para ranqueamento",
      },
    ],
    [metrics.aiUsageRate, metrics.failed, metrics.pending, topAnalyses],
  );

  const hotJobs = useMemo(() => {
    const priority = (status: string) => {
      if (status === "published") return 3;
      if (status === "paused") return 2;
      if (status === "draft") return 1;
      return 0;
    };

    return [...(data?.jobs ?? [])].sort((a, b) => priority(b.status) - priority(a.status)).slice(0, 4);
  }, [data]);

  const rankingHighlights = data?.jobRankings ?? [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Painel executivo"
        subtitle="Uma leitura de BI do funil, da fila de análises e do ritmo de contratação"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/ranking")}>
              Ver ranking
            </Button>
            <Button variant="outline" onClick={() => navigate("/curriculos")}>
              Ver currículos
            </Button>
            <Button onClick={() => navigate("/vagas")}>Abrir vagas</Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <>
          <SkeletonCards count={4} columns={4} />
          <SkeletonCards count={2} columns={2} />
          <SkeletonRows rows={4} />
          <SkeletonRows rows={4} />
        </>
      ) : null}

      {data ? (
        <>
          <Card className="overflow-hidden border-gray-200 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 shadow-lg shadow-blue-950/10">
            <CardContent className="grid gap-6 p-6 text-white lg:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
                  <Activity className="h-3.5 w-3.5" />
                  Visão consolidada
                </div>
                <div className="space-y-3">
                  <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                    Recrutamento com leitura de negócio, não só contagem de registros.
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                    Monitore oportunidades, análises e uso real de IA em um painel que destaca ritmo, gargalos e qualidade da operação.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                    {metrics.jobPublished} vagas publicadas
                  </Badge>
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                    {metrics.completed} análises concluídas
                  </Badge>
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                    {metrics.aiUsageRate.toFixed(0)}% com IA real
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Taxa de conclusão</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{formatPercent(metrics.completionRate)}</div>
                  <p className="mt-2 text-sm text-slate-200">Análises concluídas sobre o total monitorado.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Tempo médio</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{metrics.avgProcessingTime || "—"}</div>
                  <p className="mt-2 text-sm text-slate-200">ms por análise nos últimos registros.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Fila ativa</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{metrics.pending}</div>
                  <p className="mt-2 text-sm text-slate-200">itens aguardando ou processando.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">IA real</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{metrics.realAi}</div>
                  <p className="mt-2 text-sm text-slate-200">análises que consumiram token de verdade.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-4">
            <MetricCard
              icon={<BriefcaseBusiness className="h-5 w-5 text-blue-600" />}
              label="Vagas"
              value={metrics.jobTotal}
              note={`${metrics.jobPublished} publicadas, ${metrics.jobPaused} pausadas e ${metrics.jobClosed} encerradas.`}
              accentClassName="bg-gradient-to-br from-blue-50 to-indigo-50"
            />
            <MetricCard
              icon={<FileText className="h-5 w-5 text-emerald-600" />}
              label="Análises"
              value={metrics.totalAnalyses}
              note={`${metrics.completed} concluídas dentro do recorte monitorado.`}
              accentClassName="bg-gradient-to-br from-emerald-50 to-teal-50"
            />
            <MetricCard
              icon={<TrendingUp className="h-5 w-5 text-amber-600" />}
              label="Conclusão"
              value={formatPercent(metrics.completionRate)}
              note="Percentual de análises concluídas no conjunto carregado."
              accentClassName="bg-gradient-to-br from-amber-50 to-orange-50"
            />
            <MetricCard
              icon={<Bot className="h-5 w-5 text-violet-600" />}
              label="IA real"
              value={formatPercent(metrics.aiUsageRate)}
              note="Proporção de análises que consumiram modelo real."
              accentClassName="bg-gradient-to-br from-violet-50 to-fuchsia-50"
            />
          </div>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Alertas operacionais
              </CardTitle>
              <CardDescription>Leituras que merecem atenção do time agora.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {alerts.length === 0 ? (
                <EmptyState
                  icon="✅"
                  title="Tudo sob controle"
                  description="Nenhum alerta operacional foi identificado com os dados atuais."
                />
              ) : (
                alerts.map((alert) => {
                  const toneClasses: Record<typeof alert.tone, string> = {
                    warning: "border-amber-200 bg-amber-50 text-amber-900",
                    danger: "border-rose-200 bg-rose-50 text-rose-900",
                    info: "border-blue-200 bg-blue-50 text-blue-900",
                  };

                  return (
                    <div key={alert.title} className={`rounded-2xl border p-4 shadow-sm ${toneClasses[alert.tone]}`}>
                      <div className="text-sm font-semibold">{alert.title}</div>
                      <p className="mt-1 text-sm opacity-90">{alert.description}</p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  Funil operacional
                </CardTitle>
                <CardDescription>Leitura rápida do fluxo do time nas últimas execuções.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <ProgressRow label="Vagas publicadas" value={metrics.jobPublished} total={Math.max(metrics.jobTotal, 1)} tone="blue" />
                <ProgressRow label="Análises concluídas" value={metrics.completed} total={Math.max(metrics.totalAnalyses, 1)} tone="emerald" />
                <ProgressRow label="Análises em fila" value={metrics.pending} total={Math.max(metrics.totalAnalyses, 1)} tone="amber" />
                <ProgressRow label="Falhas / canceladas" value={metrics.failed} total={Math.max(metrics.totalAnalyses, 1)} tone="rose" />

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Sessão</div>
                    <div className="mt-2 text-lg font-semibold text-gray-950">{data.user.full_name}</div>
                    <p className="mt-1 text-sm text-gray-500">{formatRoleLabel(data.user.role)}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Conta</div>
                    <div className="mt-2">
                      <StatusPill label={data.user.status === "active" ? "Ativa" : data.user.status} tone={data.user.status === "active" ? "success" : "warning"} />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">Acesso e contexto da plataforma.</p>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Uso de IA</div>
                    <div className="mt-2 text-lg font-semibold text-gray-950">{metrics.realAi}</div>
                    <p className="mt-1 text-sm text-gray-500">análises com token real consumido.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-600" />
                  Distribuição de status
                </CardTitle>
                <CardDescription>Onde o sistema está concentrando esforço agora.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-4">
                  <ProgressRow label="Publicadas" value={metrics.jobPublished} total={Math.max(metrics.jobTotal, 1)} tone="blue" />
                  <ProgressRow label="Pausadas" value={metrics.jobPaused} total={Math.max(metrics.jobTotal, 1)} tone="amber" />
                  <ProgressRow label="Encerradas" value={metrics.jobClosed} total={Math.max(metrics.jobTotal, 1)} tone="rose" />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Radar de leitura</div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="text-xs text-gray-500">Conclusão</div>
                      <div className="mt-1 text-2xl font-extrabold text-gray-950">{formatPercent(metrics.completionRate)}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="text-xs text-gray-500">IA real</div>
                      <div className="mt-1 text-2xl font-extrabold text-gray-950">{formatPercent(metrics.aiUsageRate)}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="text-xs text-gray-500">Fila</div>
                      <div className="mt-1 text-2xl font-extrabold text-gray-950">{metrics.pending}</div>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="text-xs text-gray-500">Tempo médio</div>
                      <div className="mt-1 text-2xl font-extrabold text-gray-950">{metrics.avgProcessingTime || "—"}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-blue-600" />
                Insights rápidos
              </CardTitle>
              <CardDescription>Leitura instantânea do que está quente, do que exige atenção e do que já está performando bem.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {insightCards.map((card) => {
                const toneClasses: Record<string, string> = {
                  amber: "from-amber-50 to-orange-50 border-amber-200 text-amber-700",
                  rose: "from-rose-50 to-pink-50 border-rose-200 text-rose-700",
                  emerald: "from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700",
                  blue: "from-blue-50 to-indigo-50 border-blue-200 text-blue-700",
                  violet: "from-violet-50 to-fuchsia-50 border-violet-200 text-violet-700",
                };

                return (
                  <div key={card.title} className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${toneClasses[card.tone]}`}>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{card.title}</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{card.value}</div>
                    <p className="mt-2 text-sm text-gray-600">{card.description}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BriefcaseBusiness className="h-5 w-5 text-blue-600" />
                Ranking de vagas
              </CardTitle>
              <CardDescription>Resumo das oportunidades com maior tração e melhor match nos currículos recentes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {rankingHighlights.length === 0 ? (
                <EmptyState
                  icon="🎯"
                  title="Sem ranking consolidado"
                  description="Assim que houver candidatos ranqueados por vaga, esse resumo aparece aqui."
                  action={{ label: "Abrir ranking", onClick: () => navigate("/ranking") }}
                />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {rankingHighlights.map((job) => (
                      <div key={job.job_id} className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{job.job_title}</div>
                            <p className="mt-1 text-sm text-gray-500">{formatJobStatus(job.job_status)}</p>
                          </div>
                          <Badge variant="outline">{job.total_candidates} candidatos</Badge>
                        </div>
                        <div className="mt-4 space-y-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Top match</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">
                              {job.top_match_score != null ? `${Math.round((job.top_match_score > 1 ? job.top_match_score : job.top_match_score * 100))}%` : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Melhor candidato</div>
                            <div className="mt-1 text-sm font-medium text-gray-900">{job.top_candidate_name ?? "—"}</div>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm text-gray-500">
                            <span>{job.qualified_count} acima de 75%</span>
                            <span>Média {job.avg_match_score != null ? `${Math.round(job.avg_match_score > 1 ? job.avg_match_score : job.avg_match_score * 100)}%` : "—"}</span>
                          </div>
                          <Button variant="outline" className="w-full" onClick={() => navigate(`/ranking?jobId=${job.job_id}`)}>
                            Ver ranking
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <TrendCard items={trendData} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-5 w-5 text-blue-600" />
                  Vagas mais quentes
                </CardTitle>
                <CardDescription>Oportunidades prioritárias para acompanhamento do time.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hotJobs.length === 0 ? (
                  <EmptyState
                    icon="🔥"
                    title="Nenhuma vaga disponível"
                    description="As vagas cadastradas aparecem aqui por prioridade e status."
                  />
                ) : (
                  hotJobs.map((job, index) => (
                    <div key={job.id} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                            {index + 1}
                          </span>
                          <p className="font-semibold text-gray-950">{job.title}</p>
                        </div>
                        <p className="text-sm text-gray-500">{job.location ?? "Local não informado"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
                        <span className="text-xs text-gray-500">{job.seniority_level ?? "Perfil não informado"}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  Top análises recentes
                </CardTitle>
                <CardDescription>Melhores resultados recentes ordenados por score geral.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {topAnalyses.length === 0 ? (
                  <EmptyState
                    icon="🏅"
                    title="Ainda sem ranking recente"
                    description="Quando houver análises concluídas, os melhores resultados aparecem aqui."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Candidato</th>
                          <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Score</th>
                          <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Senioridade</th>
                          <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">IA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {topAnalyses.map((analysis) => (
                          <tr key={analysis.id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-950">{analysis.candidate_name ?? "Candidato não identificado"}</p>
                              <p className="text-xs text-gray-500">{analysis.resume_title ?? "Currículo sem título"}</p>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">{analysis.overall_score ?? "—"}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{analysis.seniority_level ?? "—"}</td>
                            <td className="px-4 py-3">
                              <Badge variant={analysis.used_real_ai ? "success" : "neutral"}>
                                {analysis.used_real_ai ? "Real" : "Mock"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
