import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Database, Gauge, HeartPulse, Server, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { SimpleDonutChart } from "../components/charts/SimpleDonutChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { PerformanceHealthPanel } from "../features/admin/components/PerformanceHealthPanel";
import { useAsyncState } from "../hooks/useAsyncState";
import {
  type AIPricingCatalog,
  type DatabaseHealth,
  type HealthOverview,
  type QueueHealth,
  type SystemErrors,
  systemHealthService,
} from "../services/systemHealthService";
import { aiLimitsService, type AILimitsUsage } from "../services/aiLimitsService";
import { AILimitIncreaseModal } from "../features/admin/AILimitIncreaseModal";

type HealthTab = "overview" | "performance" | "ai" | "queues" | "database" | "errors";

const TAB_ITEMS: Array<{ key: HealthTab; label: string }> = [
  { key: "overview", label: "Visão Geral" },
  { key: "performance", label: "Performance" },
  { key: "ai", label: "IA / Limites" },
  { key: "queues", label: "Filas" },
  { key: "database", label: "Banco" },
  { key: "errors", label: "Erros" },
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
    <Card className="border-border">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
          <p className="text-2xl font-semibold text-text">{value}</p>
          {note ? <p className="text-xs text-text-muted">{note}</p> : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface-muted p-3 text-[hsl(var(--text-secondary))]">
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
          <p className="text-sm text-text-muted">Carregando status do sistema...</p>
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
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<HealthTab>("overview");

  const { data: overviewData, error: overviewError, loading: overviewLoading, run: runOverview } = useAsyncState<HealthOverview>();
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
    } catch (error) {
      setBackfillStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Falha ao recalcular custos.",
      });
    }
  }, []);

  useEffect(() => {
    if (activeTab === "ai" && !pricingData) void loadPricing();
    if (activeTab === "ai" && !limitsData) void loadLimits();
    if (activeTab === "queues" && !queuesData && !queuesLoading) void loadQueues();
    if (activeTab === "database" && !databaseData && !databaseLoading) void loadDatabase();
    if (activeTab === "errors" && !errorsData && !errorsLoading) void loadErrors();
  }, [activeTab, databaseData, databaseLoading, errorsData, errorsLoading, limitsData, loadDatabase, loadErrors, loadLimits, loadPricing, loadQueues, pricingData, queuesData, queuesLoading]);
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

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-surface-muted text-text shadow-sm"
                : "text-text-muted hover:bg-surface-muted/60 hover:text-text",
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
                      <div key={item.label} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-text">{item.label}</p>
                          <p className="text-xs text-text-muted">
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
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-text">Provider configurado</p>
                        <p className="text-xs text-text-muted">
                          {overviewData.ai_provider.configured_provider}
                          {overviewData.ai_provider.configured_key_count != null
                            ? ` · ${formatNumber(overviewData.ai_provider.available_key_count ?? 0)}/${formatNumber(overviewData.ai_provider.configured_key_count)} chaves disponíveis`
                            : ""}
                        </p>
                        {(overviewData.ai_provider.cooldown_key_count ?? 0) > 0 ? (
                          <p className="mt-1 text-xs text-warning">
                            {formatNumber(overviewData.ai_provider.cooldown_key_count ?? 0)} chave(s) Gemini em cooldown por rate limit.
                          </p>
                        ) : null}
                      </div>
                      <Badge variant={getStatusVariant(overviewData.ai_provider.status)}>{overviewData.ai_provider.status}</Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-border px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-text-muted">Processando</p>
                        <p className="mt-1 text-xl font-semibold text-text">{formatNumber(overviewData.processing_analyses)}</p>
                      </div>
                      <div className="rounded-xl border border-border px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-text-muted">Pendentes</p>
                        <p className="mt-1 text-xl font-semibold text-text">{formatNumber(overviewData.pending_analyses)}</p>
                      </div>
                      <div className="rounded-xl border border-border px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-text-muted">Última análise</p>
                        <p className="mt-1 text-sm font-medium text-text">{formatDateTime(overviewData.last_analysis_at)}</p>
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
        <SectionShell title="IA / Limites" description="Limites administrativos, pricing e manutenção de custo." loading={false} error={null} onRetry={() => undefined}>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Uso operacional centralizado</CardTitle>
                <CardDescription>
                  A visão detalhada de tokens, custos, modelos, eventos recentes e gaps agora fica na central única de uso de IA.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1 text-sm text-text-muted">
                  <p>Health continua responsável por limites administrativos, pricing e manutenção.</p>
                  <p>Esta aba não replica mais breakdown operacional de consumo.</p>
                </div>
                <Button type="button" onClick={() => navigate("/admin/ia/uso")}>
                  Ver central de uso
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

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
                        <div className="rounded-xl border border-border p-3 text-sm">
                          <div className="text-text-muted">Padrão por usuário</div>
                          <div className="text-base font-semibold">{limitsData.defaults.per_user}/dia</div>
                        </div>
                        <div className="rounded-xl border border-border p-3 text-sm">
                          <div className="text-text-muted">Padrão por vaga</div>
                          <div className="text-base font-semibold">{limitsData.defaults.per_job}/dia</div>
                        </div>
                        <div className="rounded-xl border border-border p-3 text-sm">
                          <div className="text-text-muted">Padrão global</div>
                          <div className="text-base font-semibold">{limitsData.defaults.global}/dia</div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border p-3 text-sm">
                        <div className="text-text-muted">Uso global hoje</div>
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
                          <p className="text-sm text-text-muted">Nenhum override ativo no momento.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="border-b border-border text-left text-text-muted">
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
                                  <tr key={ov.id} className="border-b border-border/60">
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
                    <p className="text-sm text-text-muted">Carregando limites...</p>
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
                          <tr className="border-b border-border text-left text-text-muted">
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
                              <tr key={`${item.provider}:${item.model}`} className="border-b border-border/60">
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
                    <p className="text-sm text-text-muted">Carregando catálogo de preços...</p>
                  )}

                  <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-text-muted">
                      Recalcula <code>estimated_cost_usd</code> em <code>ai_usage_logs</code> para registros antigos cujo provider/modelo agora tem preço configurado. Não chama provider de IA e não altera tokens.
                    </div>
                    <Button type="button" onClick={() => void handleBackfillCosts()} disabled={backfillStatus.kind === "running"}>
                      {backfillStatus.kind === "running" ? "Recalculando..." : "Recalcular custos históricos"}
                    </Button>
                  </div>
                  {backfillStatus.kind === "done" ? (
                    <p className="text-sm text-success">
                      Atualizados {backfillStatus.updated} de {backfillStatus.total} registros. {backfillStatus.skipped} sem preço configurado foram mantidos como null.
                    </p>
                  ) : null}
                  {backfillStatus.kind === "error" ? (
                    <p className="text-sm text-danger">{backfillStatus.message}</p>
                  ) : null}
                </CardContent>
            </Card>
          </div>
        </SectionShell>
      ) : null}

      {activeTab === "performance" ? (
        <SectionShell
          title="Performance"
          description="Budgets operacionais, cobertura de regressão e sinais leves para telas críticas."
          loading={overviewLoading}
          error={overviewError}
          onRetry={() => void loadOverview()}
        >
          <PerformanceHealthPanel overviewStatus={overviewData?.status} onOpenAiTab={() => setActiveTab("ai")} />
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
                      <p className="text-sm text-text">Latência</p>
                      <p className="text-xs text-text-muted">{queuesData.redis.latency_ms != null ? `${formatNumber(queuesData.redis.latency_ms)} ms` : "Sem medição"}</p>
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
                      <p className="text-sm text-text">Workers online</p>
                      <Badge variant={getStatusVariant(queuesData.celery.status)}>{queuesData.celery.status}</Badge>
                    </div>
                    <p className="text-sm text-text-muted">
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
                    <div className="rounded-xl border border-border px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Horário do banco</p>
                      <p className="mt-1 text-sm text-text">{formatDateTime(databaseData.database_time)}</p>
                    </div>
                    <pre className="overflow-x-auto rounded-xl border border-border bg-surface-muted p-4 text-xs text-text-muted">
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
                          <div key={item.provider} className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm">
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
                          <div key={`${item.source}-${item.analysis_id ?? index}`} className="rounded-xl border border-border px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{item.source}</Badge>
                              {item.provider ? <Badge variant="secondary">{item.provider}</Badge> : null}
                              {item.model ? <Badge variant="neutral">{item.model}</Badge> : null}
                            </div>
                            <p className="mt-2 text-sm text-text">{item.error_message || "Falha sem mensagem detalhada."}</p>
                            <p className="mt-1 text-xs text-text-muted">{formatDateTime(item.created_at)}</p>
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
