import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Clock3,
  Coins,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { useAsyncState } from "../hooks/useAsyncState";
import { formatContextError } from "../services/errorMessages";
import {
  systemHealthService,
  type AIUsageCenterResponse,
} from "../services/systemHealthService";
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

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "all", label: "Todo período" },
  { value: "today", label: "Hoje" },
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
];

function toDateRange(period: PeriodKey) {
  if (period === "all") {
    return { date_from: undefined, date_to: undefined };
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

function formatDateTime(value: string | null | undefined) {
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

function statusLabel(value: string) {
  return {
    success: "Sucesso",
    failed: "Falha",
    rate_limited: "Rate limit",
    blocked: "Bloqueado",
    unknown: "Desconhecido",
    error: "Erro",
  }[value] ?? labelize(value);
}

function statusTone(value: string) {
  return {
    success: "bg-emerald-100 text-emerald-800",
    failed: "bg-rose-100 text-rose-800",
    rate_limited: "bg-amber-100 text-amber-900",
    blocked: "bg-slate-200 text-slate-900",
    unknown: "bg-zinc-200 text-zinc-900",
    error: "bg-rose-100 text-rose-800",
  }[value] ?? "bg-slate-200 text-slate-900";
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
    <Card className="border-border bg-surface">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
          <p className="text-2xl font-semibold text-text">{value}</p>
          {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface-muted p-3 text-text">
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
    <label className="flex flex-col gap-2 text-sm text-text">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none ring-0 transition focus:border-[hsl(var(--primary))]"
      >
        {children}
      </select>
    </label>
  );
}

export function AIUsageCenterPage() {
  const [period, setPeriod] = useState<PeriodKey>("30");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const { data, error, loading, run } = useAsyncState<AIUsageCenterResponse>();

  const loadCenter = useCallback(async () => {
    const { date_from, date_to } = toDateRange(period);
    await run(async () => {
      try {
        return await systemHealthService.getAIUsageCenter({
          date_from,
          date_to,
          provider: provider.trim() || undefined,
          model: model.trim() || undefined,
        });
      } catch (err) {
        throw new Error(formatContextError(err, "Não foi possível carregar a central de uso de IA."));
      }
    });
  }, [model, period, provider, run]);

  useEffect(() => {
    void loadCenter().catch(() => undefined);
  }, [loadCenter]);

  const warningBadges = useMemo(() => data?.gaps.warnings ?? [], [data?.gaps.warnings]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Uso de IA"
        subtitle="Tokens, custos, modelos e eventos por fluxo."
      />

      <Card className="border-border bg-surface">
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Período" value={period} onChange={(value) => setPeriod(value as PeriodKey)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <label className="flex flex-col gap-2 text-sm text-text">
              <span className="font-medium">Provider</span>
              <Input
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                placeholder="google, anthropic..."
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-text">
              <span className="font-medium">Modelo</span>
              <Input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gemini-2.5-flash..."
              />
            </label>

            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={() => void loadCenter().catch(() => undefined)} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Aplicar filtros
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Badge variant="outline">Admin</Badge>
            <span>Fonte principal: `ai_usage_logs` agregada pelo backend.</span>
            <span>Sem prompt, currículo ou resposta bruta.</span>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-border bg-surface">
          <CardContent className="p-6">
            <EmptyState
              icon="⚠️"
              title="Falha ao carregar uso de IA"
              description={error}
              action={{ label: "Tentar novamente", onClick: () => void loadCenter().catch(() => undefined) }}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Chamadas totais"
          value={formatNumber(data?.summary.total_calls ?? 0)}
          hint={`${formatNumber(data?.summary.success_calls ?? 0)} com sucesso`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <MetricCard
          title="Custo estimado"
          value={formatCurrency(data?.summary.estimated_cost_usd)}
          hint="Pricing interno estático"
          icon={<Coins className="h-5 w-5" />}
        />
        <MetricCard
          title="Tokens totais"
          value={formatNumber(data?.summary.total_tokens ?? 0)}
          hint={`${formatNumber(data?.summary.total_input_tokens ?? 0)} entrada / ${formatNumber(data?.summary.total_output_tokens ?? 0)} saída`}
          icon={<Server className="h-5 w-5" />}
        />
        <MetricCard
          title="Falhas"
          value={formatNumber(data?.summary.failed_calls ?? 0)}
          hint={`${formatNumber(data?.summary.unknown_calls ?? 0)} status desconhecidos`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <MetricCard
          title="Rate limit / bloqueios"
          value={formatNumber((data?.summary.rate_limited_calls ?? 0) + (data?.summary.blocked_calls ?? 0))}
          hint={`${formatNumber(data?.summary.rate_limited_calls ?? 0)} rate limit / ${formatNumber(data?.summary.blocked_calls ?? 0)} bloqueados`}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <MetricCard
          title="Latência média"
          value={data ? `${formatDecimal(data.summary.avg_duration_ms, 0)} ms` : "—"}
          hint="Somente eventos com duração registrada"
          icon={<Clock3 className="h-5 w-5" />}
        />
      </div>

      {!loading && data && data.by_operation.length === 0 ? (
        <Card className="border-border bg-surface">
          <CardContent className="p-6">
            <EmptyState
              icon="◌"
              title="Sem eventos de IA no período"
              description="Ajuste os filtros ou aguarde novas execuções para popular a central."
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border bg-surface">
        <div className="space-y-1 p-6 pb-4">
          <h3 className="text-base font-semibold text-text">Por fluxo</h3>
          <p className="text-sm text-text-muted">Volume, status, tokens, custo e latência média por operação.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fluxo</TableHead>
              <TableHead>Chamadas</TableHead>
              <TableHead>Sucesso</TableHead>
              <TableHead>Falha</TableHead>
              <TableHead>Rate limit</TableHead>
              <TableHead>Blocked</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Custo</TableHead>
              <TableHead>Latência média</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.by_operation.length ? (
              data.by_operation.map((item) => (
                <TableRow key={item.operation}>
                  <TableCell className="font-medium text-text">{labelize(item.operation)}</TableCell>
                  <TableCell>{formatNumber(item.calls)}</TableCell>
                  <TableCell>{formatNumber(item.success_calls)}</TableCell>
                  <TableCell>{formatNumber(item.failed_calls)}</TableCell>
                  <TableCell>{formatNumber(item.rate_limited_calls)}</TableCell>
                  <TableCell>{formatNumber(item.blocked_calls)}</TableCell>
                  <TableCell>{formatNumber(item.total_tokens)}</TableCell>
                  <TableCell>{formatCurrency(item.estimated_cost_usd)}</TableCell>
                  <TableCell>{item.avg_duration_ms == null ? "—" : `${formatDecimal(item.avg_duration_ms, 0)} ms`}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-text-muted">
                  Nenhum fluxo registrado no período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-border bg-surface">
        <div className="space-y-1 p-6 pb-4">
          <h3 className="text-base font-semibold text-text">Por modelo</h3>
          <p className="text-sm text-text-muted">Consumo consolidado por provider e modelo.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Chamadas</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Custo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.by_model.length ? (
              data.by_model.map((item) => (
                <TableRow key={`${item.provider}:${item.model}`}>
                  <TableCell>{item.provider}</TableCell>
                  <TableCell className="font-medium text-text">{item.model}</TableCell>
                  <TableCell>{formatNumber(item.calls)}</TableCell>
                  <TableCell>{formatNumber(item.total_tokens)}</TableCell>
                  <TableCell>{formatCurrency(item.estimated_cost_usd)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-muted">
                  Nenhum modelo observado no período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-border bg-surface">
        <div className="space-y-1 p-6 pb-4">
          <h3 className="text-base font-semibold text-text">Eventos recentes</h3>
          <p className="text-sm text-text-muted">Últimos eventos com status, custo e erro seguro quando existir.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Fluxo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Custo</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Erro seguro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.recent_events.length ? (
              data.recent_events.map((item, index) => (
                <TableRow key={`${item.created_at ?? "none"}:${item.operation}:${index}`}>
                  <TableCell>{formatDateTime(item.created_at)}</TableCell>
                  <TableCell>{labelize(item.operation)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(item.normalized_status)}`}>
                      {statusLabel(item.normalized_status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-text">{item.model}</p>
                      <p className="text-xs text-text-muted">{item.provider}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatNumber(item.tokens)}</TableCell>
                  <TableCell>{formatCurrency(item.estimated_cost_usd)}</TableCell>
                  <TableCell>{item.duration_ms == null ? "—" : `${formatNumber(item.duration_ms)} ms`}</TableCell>
                  <TableCell className="max-w-[24rem] text-xs text-text-muted">
                    {item.safe_error_message ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-text-muted">
                  Nenhum evento recente encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-border bg-surface">
        <div className="space-y-1 p-6 pb-4">
          <h3 className="text-base font-semibold text-text">Lacunas de observabilidade</h3>
          <p className="text-sm text-text-muted">Alertas para dados ausentes, incompletos ou com classificação limitada.</p>
        </div>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Operation unknown"
              value={formatNumber(data?.gaps.unknown_operation_count ?? 0)}
              icon={<BrainCircuit className="h-5 w-5" />}
            />
            <MetricCard
              title="Tokens faltando"
              value={formatNumber(data?.gaps.missing_token_count ?? 0)}
              icon={<Server className="h-5 w-5" />}
            />
            <MetricCard
              title="Custo faltando"
              value={formatNumber(data?.gaps.missing_cost_count ?? 0)}
              icon={<Coins className="h-5 w-5" />}
            />
            <MetricCard
              title="Status unknown"
              value={formatNumber(data?.gaps.unknown_status_count ?? 0)}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {warningBadges.length ? (
              warningBadges.map((warning) => (
                <Badge key={warning} variant="outline">
                  {labelize(warning)}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">Sem alertas adicionais no recorte atual</Badge>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface-muted/60 p-4 text-sm text-text-muted">
            Pricing: {data?.pricing.source ?? "internal_static"}.
            {` `}
            Modelos observados no catálogo: {formatNumber(data?.pricing.models.length ?? 0)}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
