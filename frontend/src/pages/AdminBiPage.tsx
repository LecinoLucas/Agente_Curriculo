import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Briefcase,
  Gauge,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { ChartCard } from "../features/admin/components/ChartCard";
import { useAsyncState } from "../hooks/useAsyncState";
import { formatContextError } from "../services/errorMessages";
import { jobAreasService, type JobArea } from "../services/jobAreasService";
import { listJobs } from "../services/jobsService";
import {
  adminBiService,
  type BIOverviewResponse,
} from "../services/adminBiService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PeriodKey = "all" | "today" | "7" | "30" | "90";

type JobOption = {
  id: string;
  title: string;
};

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "all", label: "Todo período" },
  { value: "today", label: "Hoje" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--brand-glow))",
  "hsl(var(--warning))",
  "hsl(var(--success))",
  "hsl(var(--danger))",
  "hsl(var(--border-strong))",
];

function formatNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDecimal(value: number | null | undefined, digits = 1) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "Custo não configurado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function labelize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getJobStatusLabel(status: string) {
  return {
    draft: "Rascunho",
    published: "Publicada",
    paused: "Pausada",
    closed: "Encerrada",
    cancelled: "Cancelada",
    archived: "Arquivada",
  }[status] ?? labelize(status);
}

function getAnalysisStatusLabel(status: string) {
  return {
    pending: "Pendente",
    processing: "Processando",
    retry_scheduled: "Reagendada",
    completed: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
    discarded: "Descartada",
  }[status] ?? labelize(status);
}

function getPipelineStageLabel(stage: string) {
  return {
    entry: "Entrada",
    screening: "Triagem",
    hr_interview: "Entrevista RH",
    technical_interview: "Entrevista Técnica",
    final: "Final",
    offer: "Proposta",
    hired: "Contratado",
    rejected: "Reprovado",
  }[stage] ?? labelize(stage);
}

function toDateRange(period: PeriodKey) {
  if (period === "all") {
    return {
      date_from: undefined,
      date_to: undefined,
    };
  }
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  if (period === "today") {
    return {
      date_from: end.toISOString().slice(0, 10),
      date_to: end.toISOString().slice(0, 10),
    };
  }
  start.setDate(start.getDate() - (Number(period) - 1));
  return {
    date_from: start.toISOString().slice(0, 10),
    date_to: end.toISOString().slice(0, 10),
  };
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">{title}</p>
          <p className="text-2xl font-semibold text-[hsl(var(--text))]">{value}</p>
          {hint ? <p className="text-xs text-[hsl(var(--text-muted))]">{hint}</p> : null}
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-3 text-[hsl(var(--text))]">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-[hsl(var(--text))]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] outline-none ring-0 transition focus:border-[hsl(var(--primary))]"
      >
        {children}
      </select>
    </label>
  );
}

function AnalyticsTable({
  title,
  description,
  headers,
  rows,
}: {
  title: string;
  description: string;
  headers: string[];
  rows: React.ReactNode;
}) {
  return (
    <Card className="border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
      <div className="space-y-1 p-6 pb-4">
        <h3 className="text-base font-semibold text-[hsl(var(--text))]">{title}</h3>
        <p className="text-sm text-[hsl(var(--text-muted))]">{description}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{rows}</TableBody>
      </Table>
    </Card>
  );
}

export function AdminBiPage() {
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [jobId, setJobId] = useState("");
  const [jobArea, setJobArea] = useState("");
  const [provider, setProvider] = useState("");
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [areas, setAreas] = useState<JobArea[]>([]);
  const { data, error, loading, run } = useAsyncState<BIOverviewResponse>();

  const loadOverview = useCallback(async () => {
    const { date_from, date_to } = toDateRange(period);
    await run(async () => {
      try {
        return await adminBiService.getBiOverview({
          date_from,
          date_to,
          job_id: jobId || undefined,
          job_area: jobArea || undefined,
          provider: provider.trim() || undefined,
        });
      } catch (err) {
        throw new Error(formatContextError(err, "Não foi possível carregar os indicadores de BI."));
      }
    });
  }, [jobArea, jobId, period, provider, run]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listJobs(1, 100, { statusFilter: "all" }),
      jobAreasService.listJobAreas({ page: 1, page_size: 100, is_active: true }),
    ]).then(([jobsResponse, areasResponse]) => {
      if (!active) return;
      setJobs((jobsResponse.data ?? []).map((item) => ({ id: item.id, title: item.title })));
      setAreas(areasResponse.data ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const jobsChartData = useMemo(
    () => (data?.jobs_by_status ?? []).map((item) => ({ ...item, label: getJobStatusLabel(item.status) })),
    [data?.jobs_by_status],
  );
  const analysesChartData = useMemo(
    () => (data?.analyses_by_status ?? []).map((item) => ({ ...item, label: getAnalysisStatusLabel(item.status) })),
    [data?.analyses_by_status],
  );
  const pipelineChartData = useMemo(
    () => (data?.pipeline_by_stage ?? []).map((item) => ({ ...item, label: getPipelineStageLabel(item.stage) })),
    [data?.pipeline_by_stage],
  );
  const aiUsageChartData = useMemo(
    () => data?.ai_usage_daily ?? [],
    [data?.ai_usage_daily],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="BI de Recrutamento"
        subtitle="Acompanhe indicadores de vagas, candidatos, análises e eficiência do processo seletivo."
      />

      <Card className="border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SelectField label="Período" value={period} onChange={(value) => setPeriod(value as PeriodKey)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <SelectField label="Vaga" value={jobId} onChange={setJobId}>
              <option value="">Todas as vagas</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </SelectField>

            <SelectField label="Área" value={jobArea} onChange={setJobArea}>
              <option value="">Todas as áreas</option>
              {areas.map((area) => (
                <option key={area.id} value={area.name}>
                  {area.name}
                </option>
              ))}
            </SelectField>

            <label className="flex flex-col gap-2 text-sm text-[hsl(var(--text))]">
              <span className="font-medium">Provider IA</span>
              <Input
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                placeholder="google, anthropic..."
              />
            </label>

            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={() => void loadOverview()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Aplicar filtros
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--text-muted))]">
            <Badge variant="outline">Admin</Badge>
            <span>Dados agregados reais do sistema.</span>
            <span>Nenhuma API key ou prompt completo é exibido.</span>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          <CardContent className="p-6">
            <EmptyState
              icon="⚠️"
              title="Falha ao carregar BI"
              description={error}
              action={{ label: "Tentar novamente", onClick: () => void loadOverview() }}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total de candidatos" value={formatNumber(data?.summary.total_candidates ?? 0)} hint="Base do período filtrado" icon={<Users className="h-5 w-5" />} />
        <MetricCard title="Vagas publicadas" value={formatNumber(data?.summary.published_jobs ?? 0)} hint={`${formatNumber(data?.summary.total_jobs ?? 0)} vagas no total`} icon={<Briefcase className="h-5 w-5" />} />
        <MetricCard title="Análises concluídas" value={formatNumber(data?.summary.completed_analyses ?? 0)} hint={`${formatNumber(data?.summary.failed_analyses ?? 0)} com falha`} icon={<Activity className="h-5 w-5" />} />
        <MetricCard title="Média de score" value={formatDecimal(data?.summary.average_score, 1)} hint={`${formatNumber(data?.summary.hired_candidates ?? 0)} contratados`} icon={<Gauge className="h-5 w-5" />} />
        <MetricCard title="Tokens IA usados" value={formatNumber(data?.summary.ai_total_tokens ?? 0)} hint="Consumo interno registrado" icon={<Sparkles className="h-5 w-5" />} />
        <MetricCard title="Chamadas IA" value={formatNumber(data?.summary.ai_total_calls ?? 0)} hint={`${formatNumber(data?.ai_usage.failed_calls ?? 0)} falhas`} icon={<BarChart3 className="h-5 w-5" />} />
        <MetricCard title="Custo estimado" value={formatCurrency(data?.summary.ai_estimated_cost_usd)} hint="Depende de pricing configurado" icon={<Gauge className="h-5 w-5" />} />
        <MetricCard title="Análises com falha" value={formatNumber(data?.summary.failed_analyses ?? 0)} hint={`${formatNumber(data?.total_analyses ?? 0)} análises no período`} icon={<TriangleAlert className="h-5 w-5" />} />
      </div>

      {!loading && !data ? (
        <Card className="border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
          <CardContent className="p-6">
            <EmptyState
              icon="◌"
              title="Nenhum dado encontrado"
              description="Ajuste os filtros para visualizar indicadores de recrutamento."
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          title="Vagas por status"
          description="Distribuição das vagas no período selecionado."
          loading={loading}
          empty={!loading && jobsChartData.length === 0}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={jobsChartData} dataKey="total" nameKey="label" innerRadius={55} outerRadius={95}>
                  {jobsChartData.map((entry, index) => (
                    <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Análises por status"
          description="Volume de análises por etapa técnica."
          loading={loading}
          empty={!loading && analysesChartData.length === 0}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysesChartData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Pipeline por etapa"
          description="Onde os candidatos estão distribuídos hoje."
          loading={loading}
          empty={!loading && pipelineChartData.length === 0}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineChartData} layout="vertical" margin={{ left: 18 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <YAxis type="category" dataKey="label" tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} width={130} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--success))" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Análises por dia"
          description="Cadência diária de análises executadas."
          loading={loading}
          empty={!loading && (data?.analyses_daily.length ?? 0) === 0}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.analyses_daily ?? []}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Uso de IA por dia"
          description="Tokens e chamadas registradas pelo sistema."
          loading={loading}
          empty={!loading && aiUsageChartData.length === 0}
          emptyMessage="Sem dados de uso de IA ainda."
        >
          <div className="mb-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/60 p-3 text-sm text-[hsl(var(--text-muted))]">
            O consumo exibido é calculado a partir das chamadas registradas pelo sistema. Para billing oficial, consulte Google AI Studio ou Google Cloud Billing.
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={aiUsageChartData}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" fill="hsl(var(--accent))" fillOpacity={0.8} />
                <Line type="monotone" dataKey="calls" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Top vagas por candidatos"
          description="Quais vagas concentram mais candidatos no período."
          loading={loading}
          empty={!loading && (data?.top_jobs_by_candidates.length ?? 0) === 0}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.top_jobs_by_candidates ?? []}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="title" tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} interval={0} angle={-12} height={60} textAnchor="end" />
                <YAxis tick={{ fill: "hsl(var(--text-muted))", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total_candidates" fill="hsl(var(--warning))" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <AnalyticsTable
          title="Top análises mais caras"
          description="Baseado nos logs internos de uso de IA."
          headers={["Candidato", "Tokens", "Custo estimado"]}
          rows={
            data?.top_expensive_analyses.length ? (
              data.top_expensive_analyses.map((item) => (
                <TableRow key={item.analysis_id}>
                  <TableCell className="font-medium text-[hsl(var(--text))]">{item.candidate_name}</TableCell>
                  <TableCell>{formatNumber(item.tokens)}</TableCell>
                  <TableCell>{formatCurrency(item.estimated_cost_usd)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[hsl(var(--text-muted))]">
                  Nenhuma análise cara registrada no período.
                </TableCell>
              </TableRow>
            )
          }
        />

        <AnalyticsTable
          title="Últimas falhas de análise"
          description="Falhas recentes sem expor prompts ou dados sensíveis."
          headers={["Candidato", "Vaga", "Quando"]}
          rows={
            data?.latest_analysis_failures.length ? (
              data.latest_analysis_failures.map((item) => (
                <TableRow key={item.analysis_id}>
                  <TableCell className="font-medium text-[hsl(var(--text))]">{item.candidate_name}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p>{item.job_title}</p>
                      {item.failure_reason ? (
                        <p className="text-xs text-[hsl(var(--text-muted))]">{item.failure_reason}</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(item.failed_at)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[hsl(var(--text-muted))]">
                  Nenhuma falha recente no período.
                </TableCell>
              </TableRow>
            )
          }
        />

        <AnalyticsTable
          title="Vagas com mais candidatos"
          description="Resumo rápido das vagas mais disputadas."
          headers={["Vaga", "Candidatos", "Status"]}
          rows={
            data?.top_jobs_by_candidates.length ? (
              data.top_jobs_by_candidates.map((item) => (
                <TableRow key={item.job_id}>
                  <TableCell className="font-medium text-[hsl(var(--text))]">{item.title}</TableCell>
                  <TableCell>{formatNumber(item.total_candidates)}</TableCell>
                  <TableCell>{getJobStatusLabel(item.status)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-[hsl(var(--text-muted))]">
                  Nenhuma vaga com candidatos no período.
                </TableCell>
              </TableRow>
            )
          }
        />
      </div>
    </div>
  );
}
