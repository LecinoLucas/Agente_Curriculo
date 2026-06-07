import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Gauge, HeartPulse, RefreshCw, Server, TriangleAlert } from "lucide-react";

import { SimpleBarChart } from "../../../components/charts/SimpleBarChart";
import { EmptyState } from "../../../components/common/EmptyState";
import {
  type AIUsageSummary,
  systemHealthService,
} from "../../../services/systemHealthService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--danger))",
  "hsl(var(--info))",
];

type AiUsageFilters = {
  date_from: string;
  date_to: string;
  provider: string;
  model: string;
};

type AiUsagePanelProps = {
  refreshKey?: number;
};

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

export function AiUsagePanel({ refreshKey = 0 }: AiUsagePanelProps) {
  const [filters, setFilters] = useState<AiUsageFilters>({
    date_from: "",
    date_to: "",
    provider: "",
    model: "",
  });
  const [data, setData] = useState<AIUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async (nextFilters: AiUsageFilters) => {
    setLoading(true);
    setError(null);
    try {
      const response = await systemHealthService.getAIUsage({
        date_from: nextFilters.date_from || undefined,
        date_to: nextFilters.date_to || undefined,
        provider: nextFilters.provider || undefined,
        model: nextFilters.model || undefined,
      });
      setData(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar métricas de IA.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage(filters);
  }, [loadUsage, refreshKey]);

  const aiDailyUsageChartData = useMemo(
    () =>
      (data?.daily_usage ?? []).map((item, index) => ({
        label: item.date ?? "—",
        value: item.total_tokens,
        note: `${formatNumber(item.total_calls)} chamadas`,
        color: COLORS[index % COLORS.length],
      })),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface-muted/40 p-4 text-sm text-text-muted">
        O consumo exibido é calculado a partir das chamadas registradas pelo sistema. Para billing oficial, consulte Google AI Studio ou Google Cloud Billing.
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Métricas IA / Tokens</CardTitle>
          <CardDescription>Refine o período, provider ou modelo para análise operacional.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <input
            aria-label="Data inicial"
            type="date"
            value={filters.date_from}
            onChange={(event) => setFilters((prev) => ({ ...prev, date_from: event.target.value }))}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            aria-label="Data final"
            type="date"
            value={filters.date_to}
            onChange={(event) => setFilters((prev) => ({ ...prev, date_to: event.target.value }))}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            aria-label="Provider"
            placeholder="Provider"
            value={filters.provider}
            onChange={(event) => setFilters((prev) => ({ ...prev, provider: event.target.value }))}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            aria-label="Modelo"
            placeholder="Modelo"
            value={filters.model}
            onChange={(event) => setFilters((prev) => ({ ...prev, model: event.target.value }))}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <Button type="button" onClick={() => void loadUsage(filters)}>
              Aplicar filtros
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const cleared = { date_from: "", date_to: "", provider: "", model: "" };
                setFilters(cleared);
                void loadUsage(cleared);
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-text-muted">Carregando métricas de IA...</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-danger">{error}</p>
            <Button type="button" variant="outline" onClick={() => void loadUsage(filters)}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HealthMetricCard label="Chamadas totais" value={formatNumber(data.total_calls)} icon={<Activity className="h-5 w-5" />} />
            <HealthMetricCard label="Tokens de entrada" value={formatNumber(data.input_tokens)} icon={<Server className="h-5 w-5" />} />
            <HealthMetricCard label="Tokens de saída" value={formatNumber(data.output_tokens)} icon={<Server className="h-5 w-5" />} />
            <HealthMetricCard label="Total de tokens" value={formatNumber(data.total_tokens)} icon={<Gauge className="h-5 w-5" />} />
            <HealthMetricCard label="Custo estimado" value={formatCurrency(data.estimated_cost_usd)} icon={<HeartPulse className="h-5 w-5" />} />
            <HealthMetricCard label="Falhas" value={formatNumber(data.failed_calls)} icon={<TriangleAlert className="h-5 w-5" />} />
            <HealthMetricCard
              label="Latência média"
              value={data.avg_latency_ms != null ? `${formatDecimal(data.avg_latency_ms, 0)} ms` : "—"}
              icon={<RefreshCw className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Uso por provider</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_provider.length === 0 ? (
                  <EmptyState icon="🤖" title="Sem uso registrado" description="Nenhuma chamada de IA encontrada para os filtros selecionados." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted">
                          <th className="px-2 py-2">Provider</th>
                          <th className="px-2 py-2">Chamadas</th>
                          <th className="px-2 py-2">Tokens</th>
                          <th className="px-2 py-2">Falhas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_provider.map((item) => (
                          <tr key={item.provider ?? "provider"} className="border-b border-border/60">
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
                {data.by_model.length === 0 ? (
                  <EmptyState icon="📦" title="Sem modelos registrados" description="Os modelos aparecem aqui conforme as chamadas são gravadas." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-text-muted">
                          <th className="px-2 py-2">Modelo</th>
                          <th className="px-2 py-2">Chamadas</th>
                          <th className="px-2 py-2">Latência média</th>
                          <th className="px-2 py-2">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_model.map((item) => (
                          <tr key={`${item.provider}:${item.model}`} className="border-b border-border/60">
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
                {data.daily_usage.length === 0 ? (
                  <EmptyState icon="📈" title="Sem histórico diário" description="Quando houver chamadas registradas, o consumo diário aparecerá aqui." />
                ) : (
                  <SimpleBarChart ariaLabel="Uso diário de tokens de IA" data={aiDailyUsageChartData} valueFormatter={formatNumber} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Análises mais caras</CardTitle>
              </CardHeader>
              <CardContent>
                {data.top_expensive_analyses.length === 0 ? (
                  <EmptyState icon="💸" title="Sem custos agregados" description="As análises mais caras aparecem aqui quando houver pricing configurado ou logs com custo." />
                ) : (
                  <div className="space-y-3">
                    {data.top_expensive_analyses.map((item) => (
                      <div key={item.analysis_id} className="rounded-xl border border-border px-4 py-3">
                        <p className="text-sm font-medium text-text">{item.model}</p>
                        <p className="text-xs text-text-muted">{item.provider}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
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
        </>
      ) : null}
    </div>
  );
}
