import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Database, Gauge, HeartPulse, RefreshCw, Server, TriangleAlert } from "lucide-react";

import { SimpleBarChart } from "../components/charts/SimpleBarChart";
import { SimpleDonutChart } from "../components/charts/SimpleDonutChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { useAsyncState } from "../hooks/useAsyncState";
import {
  type AIPricingCatalog,
  type AIUsageSummary,
  type DatabaseHealth,
  type HealthOverview,
  type QueueHealth,
  type SystemErrors,
  systemHealthService,
} from "../services/systemHealthService";
import { aiLimitsService, type AILimitsUsage } from "../services/aiLimitsService";
import { AILimitIncreaseModal } from "../features/admin/AILimitIncreaseModal";

type HealthTab = "overview" | "ai" | "queues" | "database" | "errors";

const TAB_ITEMS: Array<{ key: HealthTab; label: string }> = [
  { key: "overview", label: "Visão Geral" },
  { key: "ai", label: "IA / Tokens" },
  { key: "queues", label: "Filas" },
  { key: "database", label: "Banco" },
  { key: "errors", label: "Erros" },
];

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--danger))",
  "hsl(var(--info))",
];

function formatNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDecimal(value: number | null | undefined, fractionDigits = 2) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return "Custo não configurado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getStatusVariant(status: string) {
  if (status === "ok") return "success" as const;
  if (status === "degraded") return "warning" as const;
  if (status === "down") return "danger" as const;
  return "outline" as const;
}

function HealthMetricCard({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  note?: string;
}) {
  return (
    <Card className="border-[hsl(var(--border))]">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">{label}</p>
          <p className="text-2xl font-semibold text-[hsl(var(--text))]">{value}</p>
          {note ? <p className="text-xs text-[hsl(var(--text-muted))]">{note}</p> : null}
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-3 text-[hsl(var(--text-secondary))]">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionShell({
  title,
  description,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[hsl(var(--text-muted))]">Carregando status do sistema...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-red-600">{error}</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

type SystemHealthPageProps = {
  hideHeader?: boolean;
};

export function SystemHealthPage({ hideHeader = false }: SystemHealthPageProps = {}) {
  const [activeTab, setActiveTab] = useState<HealthTab>("overview");
  const [aiFilters, setAiFilters] = useState({
    date_from: "",
    date_to: "",
    provider: "",
    model: "",
  });

  const { data: overviewData, error: overviewError, loading: overviewLoading, run: runOverview } = useAsyncState<HealthOverview>();
  const { data: aiUsageData, error: aiUsageError, loading: aiUsageLoading, run: runAIUsage } = useAsyncState<AIUsageSummary>();
  const { data: queuesData, error: queuesError, loading: queuesLoading, run: runQueues } = useAsyncState<QueueHealth>();
  const { data: databaseData, error: databaseError, loading: databaseLoading, run: runDatabase } = useAsyncState<DatabaseHealth>();
  const { data: errorsData, error: errorsError, loading: errorsLoading, run: runErrors } = useAsyncState<SystemErrors>();
  const { data: pricingData, run: runPricing } = useAsyncState<AIPricingCatalog>();
  const [backfillStatus, setBackfillStatus] = useState<
    { kind: "idle" } | { kind: "running" } | { kind: "done"; updated: number; total: number; skipped: number } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const { data: limitsData, run: runLimits } = useAsyncState<AILimitsUsage>();
  const [increaseModalOpen, setIncreaseModalOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      await runOverview(() => systemHealthService.getOverview());
    } catch {
      return null;
    }
    return null;
  }, [runOverview]);

  const loadAIUsage = useCallback(async () => {
    try {
      await runAIUsage(() =>
        systemHealthService.getAIUsage({
          date_from: aiFilters.date_from || undefined,
          date_to: aiFilters.date_to || undefined,
          provider: aiFilters.provider || undefined,
          model: aiFilters.model || undefined,
        }),
      );
    } catch {
      return null;
    }
    return null;
  }, [aiFilters.date_from, aiFilters.date_to, aiFilters.model, aiFilters.provider, runAIUsage]);

  const loadQueues = useCallback(async () => {
    try {
      await runQueues(() => systemHealthService.getQueues());
    } catch {
      return null;
    }
    return null;
  }, [runQueues]);

  const loadDatabase = useCallback(async () => {
    try {
      await runDatabase(() => systemHealthService.getDatabase());
    } catch {
      return null;
    }
    return null;
  }, [runDatabase]);

  const loadErrors = useCallback(async () => {
    try {
      await runErrors(() => systemHealthService.getErrors());
    } catch {
      return null;
    }
    return null;
  }, [runErrors]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadPricing = useCallback(async () => {
    try {
      await runPricing(() => systemHealthService.getAIPricingCatalog());
    } catch {
      return null;
    }
    return null;
  }, [runPricing]);

  const loadLimits = useCallback(async () => {
    try {
      await runLimits(() => aiLimitsService.getUsage());
    } catch {
      return null;
    }
    return null;
  }, [runLimits]);

  const handleRevokeOverride = useCallback(async (id: string) => {
    setRevokingId(id);
    try {
      await aiLimitsService.revokeOverride(id);
      await loadLimits();
    } finally {
      setRevokingId(null);
    }
  }, [loadLimits]);

  const handleBackfillCosts = useCallback(async () => {
    setBackfillStatus({ kind: "running" });
    try {
      const result = await systemHealthService.backfillAICosts();
      setBackfillStatus({
        kind: "done",
        updated: result.updated,
        total: result.total_null_rows,
        skipped: result.skipped_unpriced,
      });
      await loadAIUsage();
    } catch (error) {
      setBackfillStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao recalcular custos.",
      });
    }
  }, [loadAIUsage]);

  useEffect(() => {
    if (activeTab === "ai" && !aiUsageData && !aiUsageLoading) void loadAIUsage();
    if (activeTab === "ai" && !pricingData) void loadPricing();
    if (activeTab === "ai" && !limitsData) void loadLimits();
    if (activeTab === "queues" && !queuesData && !queuesLoading) void loadQueues();
    if (activeTab === "database" && !databaseData && !databaseLoading) void loadDatabase();
    if (activeTab === "errors" && !errorsData && !errorsLoading) void loadErrors();
  }, [activeTab, aiUsageData, aiUsageLoading, databaseData, databaseLoading, errorsData, errorsLoading, limitsData, loadAIUsage, loadDatabase, loadErrors, loadLimits, loadPricing, loadQueues, pricingData, queuesData, queuesLoading]);

  const aiDailyUsageChartData = useMemo(
    () => (aiUsageData?.daily_usage ?? []).map((item, index) => ({
      label: item.date ?? "—",
      value: item.total_tokens,
      note: `${formatNumber(item.total_calls)} chamadas`,
      color: COLORS[index % COLORS.length],
    })),
    [aiUsageData],
  );
  const databaseStatusChartData = useMemo(
    () => (databaseData?.analyses_by_status ?? []).map((item, index) => ({
      label: item.status,
      value: item.count,
      color: COLORS[index % COLORS.length],
    })),
    [databaseData],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      {!hideHeader && (
        <PageHeader
          title="Health do Sistema"
          subtitle="Acompanhe status técnico, filas, banco de dados e consumo de IA."
        />
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-2">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-[hsl(var(--surface-muted))] text-[hsl(var(--text))] shadow-sm"
                : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))]/60 hover:text-[hsl(var(--text))]",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <SectionShell
          title="Visão Geral"
          description="Status consolidado do backend, banco, Redis e análises."
          loading={overviewLoading}
          error={overviewError}
          onRetry={() => void loadOverview()}
        >
          {overviewData ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <HealthMetricCard label="Status geral" value={overviewData.status} icon={<HeartPulse className="h-5 w-5" />} note={`Ambiente ${overviewData.environment}`} />
                <HealthMetricCard label="Uptime" value={formatDuration(overviewData.uptime_seconds)} icon={<Gauge className="h-5 w-5" />} note={`Versão ${overviewData.version}`} />
                <HealthMetricCard label="Análises pendentes" value={formatNumber(overviewData.pending_analyses)} icon={<Activity className="h-5 w-5" />} />
                <HealthMetricCard label="Falhas 24h" value={formatNumber(overviewData.failed_analyses_24h)} icon={<TriangleAlert className="h-5 w-5" />} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Componentes</CardTitle>
                    <CardDescription>Saúde instantânea dos serviços principais.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                      {[
                      { label: "Backend", data: overviewData.backend },
                      { label: "Banco", data: overviewData.database },
                      { label: "Redis", data: overviewData.redis },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-[hsl(var(--text))]">{item.label}</p>
                          <p className="text-xs text-[hsl(var(--text-muted))]">
                            {item.data.latency_ms != null ? `${formatNumber(item.data.latency_ms)} ms` : item.data.message ?? "Sem latência disponível"}
                          </p>
                        </div>
                        <Badge variant={getStatusVariant(item.data.status)}>{item.data.status}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>IA e análises</CardTitle>
                    <CardDescription>Provider ativo e volume operacional recente.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--text))]">Provider configurado</p>
                        <p className="text-xs text-[hsl(var(--text-muted))]">
                          {overviewData.ai_provider.configured_provider}
                          {overviewData.ai_provider.configured_key_count != null
                            ? ` · ${formatNumber(overviewData.ai_provider.available_key_count ?? 0)}/${formatNumber(overviewData.ai_provider.configured_key_count)} chaves disponíveis`
                            : ""}
                        </p>
                        {(overviewData.ai_provider.cooldown_key_count ?? 0) > 0 ? (
                          <p className="mt-1 text-xs text-[hsl(var(--warning))]">
                            {formatNumber(overviewData.ai_provider.cooldown_key_count ?? 0)} chave(s) Gemini em cooldown por rate limit.
                          </p>
                        ) : null}
                      </div>
                      <Badge variant={getStatusVariant(overviewData.ai_provider.status)}>{overviewData.ai_provider.status}</Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-[hsl(var(--text-muted))]">Processando</p>
                        <p className="mt-1 text-xl font-semibold text-[hsl(var(--text))]">{formatNumber(overviewData.processing_analyses)}</p>
                      </div>
                      <div className="rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-[hsl(var(--text-muted))]">Pendentes</p>
                        <p className="mt-1 text-xl font-semibold text-[hsl(var(--text))]">{formatNumber(overviewData.pending_analyses)}</p>
                      </div>
                      <div className="rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-[hsl(var(--text-muted))]">Última análise</p>
                        <p className="mt-1 text-sm font-medium text-[hsl(var(--text))]">{formatDateTime(overviewData.last_analysis_at)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </SectionShell>
      ) : null}

      {activeTab === "ai" ? (
        <SectionShell
          title="IA / Tokens"
          description="Consumo interno de chamadas registradas pelo sistema."
          loading={aiUsageLoading}
          error={aiUsageError}
          onRetry={() => void loadAIUsage()}
        >
          {aiUsageData ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 p-4 text-sm text-[hsl(var(--text-muted))]">
                O consumo exibido é calculado a partir das chamadas registradas pelo sistema. Para billing oficial, consulte Google AI Studio ou Google Cloud Billing.
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Filtros</CardTitle>
                  <CardDescription>Refine o período, provider ou modelo para análise operacional.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                  <input type="date" value={aiFilters.date_from} onChange={(event) => setAiFilters((prev) => ({ ...prev, date_from: event.target.value }))} className="ui-input h-11 rounded-xl px-3 text-sm" />
                  <input type="date" value={aiFilters.date_to} onChange={(event) => setAiFilters((prev) => ({ ...prev, date_to: event.target.value }))} className="ui-input h-11 rounded-xl px-3 text-sm" />
                  <input placeholder="Provider" value={aiFilters.provider} onChange={(event) => setAiFilters((prev) => ({ ...prev, provider: event.target.value }))} className="ui-input h-11 rounded-xl px-3 text-sm" />
                  <input placeholder="Modelo" value={aiFilters.model} onChange={(event) => setAiFilters((prev) => ({ ...prev, model: event.target.value }))} className="ui-input h-11 rounded-xl px-3 text-sm" />
                  <div className="md:col-span-4 flex flex-wrap gap-2">
                    <Button type="button" onClick={() => void loadAIUsage()}>
                      Aplicar filtros
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAiFilters({ date_from: "", date_to: "", provider: "", model: "" });
                        void runAIUsage(() => systemHealthService.getAIUsage()).catch(() => undefined);
                      }}
                    >
                      Limpar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <HealthMetricCard label="Chamadas totais" value={formatNumber(aiUsageData.total_calls)} icon={<Activity className="h-5 w-5" />} />
                <HealthMetricCard label="Tokens de entrada" value={formatNumber(aiUsageData.input_tokens)} icon={<Server className="h-5 w-5" />} />
                <HealthMetricCard label="Tokens de saída" value={formatNumber(aiUsageData.output_tokens)} icon={<Server className="h-5 w-5" />} />
                <HealthMetricCard label="Total de tokens" value={formatNumber(aiUsageData.total_tokens)} icon={<Gauge className="h-5 w-5" />} />
                <HealthMetricCard label="Custo estimado" value={formatCurrency(aiUsageData.estimated_cost_usd)} icon={<HeartPulse className="h-5 w-5" />} />
                <HealthMetricCard label="Falhas" value={formatNumber(aiUsageData.failed_calls)} icon={<TriangleAlert className="h-5 w-5" />} />
                <HealthMetricCard label="Latência média" value={aiUsageData.avg_latency_ms != null ? `${formatDecimal(aiUsageData.avg_latency_ms, 0)} ms` : "—"} icon={<RefreshCw className="h-5 w-5" />} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Limites de IA</CardTitle>
                  <CardDescription>
                    Limite diário de análises IA por usuário, vaga e global. Overrides administrativos têm validade obrigatória e ficam registrados em log estruturado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {limitsData ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                          <div className="text-[hsl(var(--text-muted))]">Padrão por usuário</div>
                          <div className="text-base font-semibold">{limitsData.defaults.per_user}/dia</div>
                        </div>
                        <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                          <div className="text-[hsl(var(--text-muted))]">Padrão por vaga</div>
                          <div className="text-base font-semibold">{limitsData.defaults.per_job}/dia</div>
                        </div>
                        <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                          <div className="text-[hsl(var(--text-muted))]">Padrão global</div>
                          <div className="text-base font-semibold">{limitsData.defaults.global}/dia</div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                        <div className="text-[hsl(var(--text-muted))]">Uso global hoje</div>
                        <div className="text-base font-semibold">
                          {limitsData.global_usage.used_today} / {limitsData.global_usage.effective_limit}
                          {limitsData.global_usage.limit_source === "override" ? (
                            <Badge className="ml-2" variant="warning">Override ativo</Badge>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-semibold">Overrides ativos</div>
                        {limitsData.active_overrides.length === 0 ? (
                          <p className="text-sm text-[hsl(var(--text-muted))]">Nenhum override ativo no momento.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--text-muted))]">
                                  <th className="px-2 py-2">Escopo</th>
                                  <th className="px-2 py-2">Alvo</th>
                                  <th className="px-2 py-2">Anterior</th>
                                  <th className="px-2 py-2">Novo</th>
                                  <th className="px-2 py-2">Expira em</th>
                                  <th className="px-2 py-2">Motivo</th>
                                  <th className="px-2 py-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {limitsData.active_overrides.map((ov) => (
                                  <tr key={ov.id} className="border-b border-[hsl(var(--border))]/60">
                                    <td className="px-2 py-2">{ov.scope}</td>
                                    <td className="px-2 py-2 truncate max-w-[10rem]">{ov.scope_id ?? "—"}</td>
                                    <td className="px-2 py-2">{ov.old_limit}</td>
                                    <td className="px-2 py-2 font-semibold">{ov.new_limit}</td>
                                    <td className="px-2 py-2">{formatDateTime(ov.expires_at)}</td>
                                    <td className="px-2 py-2 truncate max-w-[16rem]">{ov.reason}</td>
                                    <td className="px-2 py-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={revokingId === ov.id}
                                        onClick={() => void handleRevokeOverride(ov.id)}
                                      >
                                        {revokingId === ov.id ? "Revogando..." : "Revogar"}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button type="button" onClick={() => setIncreaseModalOpen(true)}>
                          Aumentar limite
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[hsl(var(--text-muted))]">Carregando limites...</p>
                  )}
                </CardContent>
              </Card>

              {limitsData ? (
                <AILimitIncreaseModal
                  open={increaseModalOpen}
                  onClose={() => setIncreaseModalOpen(false)}
                  onCreated={() => void loadLimits()}
                  defaults={limitsData.defaults}
                />
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Preços IA</CardTitle>
                  <CardDescription>
                    Tabela versionada em <code>backend/src/core/ai_pricing.py</code>. O custo é calculado a partir destes valores; modelos sem entrada aparecem como "Não configurado" e o custo fica nulo até que sejam adicionados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pricingData && pricingData.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--text-muted))]">
                            <th className="px-2 py-2">Modelo</th>
                            <th className="px-2 py-2">Provider</th>
                            <th className="px-2 py-2">Input (USD/1M)</th>
                            <th className="px-2 py-2">Output (USD/1M)</th>
                            <th className="px-2 py-2">Última revisão</th>
                            <th className="px-2 py-2">Fonte</th>
                            <th className="px-2 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pricingData.items.map((item) => {
                            const inputPrice = item.input_per_1m_tokens != null ? Number(item.input_per_1m_tokens) : null;
                            const outputPrice = item.output_per_1m_tokens != null ? Number(item.output_per_1m_tokens) : null;
                            return (
                              <tr key={`${item.provider}:${item.model}`} className="border-b border-[hsl(var(--border))]/60">
                                <td className="px-2 py-2 font-medium">{item.model}</td>
                                <td className="px-2 py-2">{item.provider}</td>
                                <td className="px-2 py-2">{inputPrice != null ? formatCurrency(inputPrice) : "—"}</td>
                                <td className="px-2 py-2">{outputPrice != null ? formatCurrency(outputPrice) : "—"}</td>
                                <td className="px-2 py-2">{item.last_reviewed_at ?? "—"}</td>
                                <td className="px-2 py-2 truncate max-w-[14rem]">
                                  {item.source ? (
                                    <a href={item.source} target="_blank" rel="noreferrer" className="text-[hsl(var(--primary))] underline">
                                      link
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <Badge variant={item.status === "configured" ? "success" : "warning"}>
                                    {item.status === "configured" ? "Configurado" : "Não configurado"}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-[hsl(var(--text-muted))]">Carregando catálogo de preços...</p>
                  )}

                  <div className="flex flex-col gap-2 border-t border-[hsl(var(--border))]/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-[hsl(var(--text-muted))]">
                      Recalcula <code>estimated_cost_usd</code> em <code>ai_usage_logs</code> para registros antigos cujo provider/modelo agora tem preço configurado. Não chama provider de IA e não altera tokens.
                    </div>
                    <Button type="button" onClick={() => void handleBackfillCosts()} disabled={backfillStatus.kind === "running"}>
                      {backfillStatus.kind === "running" ? "Recalculando..." : "Recalcular custos históricos"}
                    </Button>
                  </div>
                  {backfillStatus.kind === "done" ? (
                    <p className="text-sm text-[hsl(var(--success))]">
                      Atualizados {backfillStatus.updated} de {backfillStatus.total} registros. {backfillStatus.skipped} sem preço configurado foram mantidos como null.
                    </p>
                  ) : null}
                  {backfillStatus.kind === "error" ? (
                    <p className="text-sm text-[hsl(var(--danger))]">{backfillStatus.message}</p>
                  ) : null}
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Uso por provider</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiUsageData.by_provider.length === 0 ? (
                      <EmptyState icon="🤖" title="Sem uso registrado" description="Nenhuma chamada de IA encontrada para os filtros selecionados." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--text-muted))]">
                              <th className="px-2 py-2">Provider</th>
                              <th className="px-2 py-2">Chamadas</th>
                              <th className="px-2 py-2">Tokens</th>
                              <th className="px-2 py-2">Falhas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiUsageData.by_provider.map((item) => (
                              <tr key={item.provider ?? "provider"} className="border-b border-[hsl(var(--border))]/60">
                                <td className="px-2 py-2">{item.provider ?? "—"}</td>
                                <td className="px-2 py-2">{formatNumber(item.total_calls)}</td>
                                <td className="px-2 py-2">{formatNumber(item.total_tokens)}</td>
                                <td className="px-2 py-2">{formatNumber(item.failed_calls)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Uso por modelo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiUsageData.by_model.length === 0 ? (
                      <EmptyState icon="📦" title="Sem modelos registrados" description="Os modelos aparecem aqui conforme as chamadas são gravadas." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--text-muted))]">
                              <th className="px-2 py-2">Modelo</th>
                              <th className="px-2 py-2">Chamadas</th>
                              <th className="px-2 py-2">Latência média</th>
                              <th className="px-2 py-2">Custo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aiUsageData.by_model.map((item) => (
                              <tr key={`${item.provider}:${item.model}`} className="border-b border-[hsl(var(--border))]/60">
                                <td className="px-2 py-2">{item.model ?? "—"}</td>
                                <td className="px-2 py-2">{formatNumber(item.total_calls)}</td>
                                <td className="px-2 py-2">{item.avg_latency_ms != null ? `${formatDecimal(item.avg_latency_ms, 0)} ms` : "—"}</td>
                                <td className="px-2 py-2">{formatCurrency(item.estimated_cost_usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Uso diário</CardTitle>
                    <CardDescription>Visualização simples dos tokens totais por dia.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] pt-4">
                    {aiUsageData.daily_usage.length === 0 ? (
                      <EmptyState icon="📈" title="Sem histórico diário" description="Quando houver chamadas registradas, o consumo diário aparecerá aqui." />
                    ) : (
                      <SimpleBarChart
                        ariaLabel="Uso diário de tokens de IA"
                        data={aiDailyUsageChartData}
                        valueFormatter={formatNumber}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Análises mais caras</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiUsageData.top_expensive_analyses.length === 0 ? (
                      <EmptyState icon="💸" title="Sem custos agregados" description="As análises mais caras aparecem aqui quando houver pricing configurado ou logs com custo." />
                    ) : (
                      <div className="space-y-3">
                        {aiUsageData.top_expensive_analyses.map((item) => (
                          <div key={item.analysis_id} className="rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                            <p className="text-sm font-medium text-[hsl(var(--text))]">{item.model}</p>
                            <p className="text-xs text-[hsl(var(--text-muted))]">{item.provider}</p>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-[hsl(var(--text-muted))]">
                              <span>{formatNumber(item.calls)} chamadas</span>
                              <span>{formatNumber(item.total_tokens)} tokens</span>
                              <span>{formatCurrency(item.estimated_cost_usd)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </SectionShell>
      ) : null}

      {activeTab === "queues" ? (
        <SectionShell title="Filas" description="Redis, Celery e estados operacionais das análises." loading={queuesLoading} error={queuesError} onRetry={() => void loadQueues()}>
          {queuesData ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <HealthMetricCard label="Pendentes" value={formatNumber(queuesData.pending_analyses)} icon={<Activity className="h-5 w-5" />} />
                <HealthMetricCard label="Processando" value={formatNumber(queuesData.processing_analyses)} icon={<RefreshCw className="h-5 w-5" />} />
                <HealthMetricCard label="Stale" value={formatNumber(queuesData.stale_processing)} icon={<TriangleAlert className="h-5 w-5" />} />
                <HealthMetricCard label="Retries pendentes" value={formatNumber(queuesData.retries_pending)} icon={<Server className="h-5 w-5" />} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Redis</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[hsl(var(--text))]">Latência</p>
                      <p className="text-xs text-[hsl(var(--text-muted))]">{queuesData.redis.latency_ms != null ? `${formatNumber(queuesData.redis.latency_ms)} ms` : "Sem medição"}</p>
                    </div>
                    <Badge variant={getStatusVariant(queuesData.redis.status)}>{queuesData.redis.status}</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Celery</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-[hsl(var(--text))]">Workers online</p>
                      <Badge variant={getStatusVariant(queuesData.celery.status)}>{queuesData.celery.status}</Badge>
                    </div>
                    <p className="text-sm text-[hsl(var(--text-muted))]">
                      {queuesData.celery.workers_online != null
                        ? `${formatNumber(queuesData.celery.workers_online)} workers`
                        : queuesData.celery.message ?? "Sem resposta do inspect"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </SectionShell>
      ) : null}

      {activeTab === "database" ? (
        <SectionShell title="Banco" description="Latência, contadores e status da base." loading={databaseLoading} error={databaseError} onRetry={() => void loadDatabase()}>
          {databaseData ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <HealthMetricCard label="Status" value={databaseData.status} icon={<Database className="h-5 w-5" />} note={databaseData.latency_ms != null ? `${formatNumber(databaseData.latency_ms)} ms` : undefined} />
                <HealthMetricCard label="Candidatos" value={formatNumber(databaseData.total_candidates)} icon={<Server className="h-5 w-5" />} />
                <HealthMetricCard label="Vagas" value={formatNumber(databaseData.total_jobs)} icon={<Server className="h-5 w-5" />} />
                <HealthMetricCard label="Análises" value={formatNumber(databaseData.total_analyses)} icon={<Activity className="h-5 w-5" />} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Análises por status</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {databaseData.analyses_by_status.length === 0 ? (
                      <EmptyState icon="📊" title="Sem dados" description="Nenhuma análise encontrada." />
                    ) : (
                      <SimpleDonutChart
                        ariaLabel="Distribuição de análises por status"
                        data={databaseStatusChartData}
                        valueFormatter={formatNumber}
                      />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Pool e horário do banco</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-[hsl(var(--text-muted))]">Horário do banco</p>
                      <p className="mt-1 text-sm text-[hsl(var(--text))]">{formatDateTime(databaseData.database_time)}</p>
                    </div>
                    <pre className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-4 text-xs text-[hsl(var(--text-muted))]">
                      {JSON.stringify(databaseData.pool_info, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </SectionShell>
      ) : null}

      {activeTab === "errors" ? (
        <SectionShell title="Erros" description="Falhas recentes de análise e providers de IA." loading={errorsLoading} error={errorsError} onRetry={() => void loadErrors()}>
          {errorsData ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <HealthMetricCard label="Falhas 24h" value={formatNumber(errorsData.failed_analyses_24h)} icon={<TriangleAlert className="h-5 w-5" />} />
                <HealthMetricCard label="Workers" value={errorsData.worker_status.workers_online != null ? formatNumber(errorsData.worker_status.workers_online) : "—"} icon={<Server className="h-5 w-5" />} note={errorsData.worker_status.message ?? errorsData.worker_status.status} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Erros por provider</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {errorsData.ai_errors_by_provider.length === 0 ? (
                      <EmptyState icon="✅" title="Sem falhas por provider" description="Nenhuma falha recente de provider foi registrada." />
                    ) : (
                      <div className="space-y-2">
                        {errorsData.ai_errors_by_provider.map((item) => (
                          <div key={item.provider} className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-sm">
                            <span>{item.provider}</span>
                            <Badge variant="warning">{formatNumber(item.failed_calls)}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Últimas falhas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {errorsData.recent_failures.length === 0 ? (
                      <EmptyState icon="🧩" title="Sem falhas recentes" description="As falhas relevantes aparecerão aqui quando houver ocorrências." />
                    ) : (
                      <div className="space-y-3">
                        {errorsData.recent_failures.map((item, index) => (
                          <div key={`${item.source}-${item.analysis_id ?? index}`} className="rounded-xl border border-[hsl(var(--border))] px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{item.source}</Badge>
                              {item.provider ? <Badge variant="secondary">{item.provider}</Badge> : null}
                              {item.model ? <Badge variant="neutral">{item.model}</Badge> : null}
                            </div>
                            <p className="mt-2 text-sm text-[hsl(var(--text))]">{item.error_message || "Falha sem mensagem detalhada."}</p>
                            <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{formatDateTime(item.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </SectionShell>
      ) : null}
    </div>
  );
}
