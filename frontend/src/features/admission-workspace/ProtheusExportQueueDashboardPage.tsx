"use client";

import { AlertTriangle, ExternalLink, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import { formatContextError } from "../../services/errorMessages";
import type {
  ProtheusExportDashboardItem,
  ProtheusExportDashboardItemsResponse,
  ProtheusExportDashboardSummary,
  ProtheusExportQueueStatus,
} from "../../types/domain";
import {
  getPayloadStatusLabel,
  getQueueStatusDescription,
  getQueueStatusLabel,
  getQueueStatusTone,
  PROTHEUS_QUEUE_STATUS_OPTIONS,
} from "./protheusExportStatus";

const PAGE_SIZE = 20;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function statusAttentionText(item: ProtheusExportDashboardItem): string {
  if (item.status === "failed_permanent") return "Revisão manual necessária";
  if (item.status === "blocked") return "Revisão técnica obrigatória";
  if (item.status === "retry_scheduled") return `Próxima tentativa: ${formatDateTime(item.next_attempt_at)}`;
  if (item.status === "queued") return "Aguardando processamento";
  return getQueueStatusDescription(item.status, item.recommended_action);
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={["mt-2 text-2xl font-semibold", tone ?? "text-text"].join(" ")}>{value}</p>
    </div>
  );
}

function ItemDetails({ item }: { item: ProtheusExportDashboardItem }) {
  return (
    <dl className="grid gap-3 border-t border-border bg-surface-muted/30 p-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-text-muted">Trace ID</dt>
        <dd className="mt-1 font-mono text-xs text-text">{item.last_trace_id ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Status do payload</dt>
        <dd className="mt-1 text-text">
          {getPayloadStatusLabel(item.payload_status, item.payload_status_label)}
        </dd>
      </div>
      <div>
        <dt className="text-text-muted">Finalizado em</dt>
        <dd className="mt-1 text-text">{formatDateTime(item.finished_at)}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Código de erro</dt>
        <dd className="mt-1 text-text">{item.last_error_code ?? "—"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-text-muted">Mensagem redigida</dt>
        <dd className="mt-1 text-text">{item.last_error_message_redacted ?? item.blocked_reason ?? "—"}</dd>
      </div>
    </dl>
  );
}

export function ProtheusExportQueueDashboardPage() {
  const [summary, setSummary] = useState<ProtheusExportDashboardSummary | null>(null);
  const [itemsPage, setItemsPage] = useState<ProtheusExportDashboardItemsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProtheusExportQueueStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, itemsResult] = await Promise.all([
        admissionWorkspaceService.getProtheusExportDashboard(),
        admissionWorkspaceService.getProtheusExportDashboardItems({
          status: statusFilter,
          limit: PAGE_SIZE,
          offset,
        }),
      ]);
      setSummary(summaryResult);
      setItemsPage(itemsResult);
    } catch (err) {
      setError(
        formatContextError(
          err,
          "Não foi possível carregar o dashboard operacional Protheus.",
          "Atualize a página ou tente novamente em instantes.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleStatusChange(nextStatus: string) {
    setStatusFilter(nextStatus as ProtheusExportQueueStatus | "");
    setOffset(0);
    setExpandedId(null);
  }

  const items = itemsPage?.items ?? [];
  const total = summary?.total ?? 0;
  const active = summary?.active ?? 0;
  const terminal = summary?.terminal ?? 0;
  const actionRequired = summary?.action_required ?? 0;
  const failed = summary?.totals_by_status.failed_permanent ?? 0;
  const blocked = summary?.totals_by_status.blocked ?? 0;
  const retryScheduled = summary?.totals_by_status.retry_scheduled ?? 0;
  const queued = summary?.totals_by_status.queued ?? 0;

  return (
    <div className="space-y-6" data-testid="protheus-export-dashboard-page">
      <header className="rounded-lg border border-border bg-surface px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Admissão RH</p>
            <h1 className="mt-1 text-2xl font-semibold text-text">Fila operacional Protheus</h1>
            <p className="mt-2 max-w-3xl text-sm text-text-muted">
              Acompanhamento seguro das solicitações de exportação via bridge, sem payload operacional ou dados sensíveis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text transition hover:bg-surface-muted disabled:opacity-50"
          >
            <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Totais da fila">
        <MetricCard label="Total geral" value={total} />
        <MetricCard label="Ativos" value={active} tone="text-blue-700" />
        <MetricCard label="Terminais" value={terminal} tone="text-emerald-700" />
        <MetricCard label="Ação requerida" value={actionRequired} tone="text-red-700" />
        <MetricCard label="Falha permanente" value={failed} tone="text-red-700" />
        <MetricCard label="Bloqueados" value={blocked} tone="text-red-700" />
        <MetricCard label="Retry agendado" value={retryScheduled} tone="text-amber-700" />
        <MetricCard label="Enfileirados" value={queued} tone="text-blue-700" />
      </section>

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">Solicitações</h2>
            <p className="text-sm text-text-muted">{itemsPage?.total ?? 0} registro(s) encontrados</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <Search className="h-4 w-4 text-text-muted" />
            <select
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={(event) => handleStatusChange(event.target.value)}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text"
            >
              <option value="">Todos os status</option>
              {PROTHEUS_QUEUE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {getQueueStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="p-4">
            <EmptyState
              icon="⚠️"
              title="Dashboard indisponível"
              description={error}
              action={{ label: "Atualizar", onClick: () => void load() }}
            />
          </div>
        ) : null}

        {!error && loading && items.length === 0 ? (
          <div className="space-y-3 p-4">
            <div className="h-12 animate-pulse rounded-lg bg-surface-muted" />
            <div className="h-12 animate-pulse rounded-lg bg-surface-muted" />
            <div className="h-12 animate-pulse rounded-lg bg-surface-muted" />
          </div>
        ) : null}

        {!error && !loading && items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="📋"
              title="Nenhuma solicitação encontrada"
              description="Ajuste o filtro ou atualize a fila operacional."
            />
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div className="divide-y divide-border" data-testid="protheus-export-dashboard-list">
            {items.map((item) => {
              const expanded = expandedId === item.id;
              return (
                <article key={item.id} className="bg-surface">
                  <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                          getQueueStatusTone(item.status),
                        ].join(" ")}
                      >
                        {getQueueStatusLabel(item.status, item.status_label)}
                      </div>
                      <p className="mt-2 truncate font-mono text-xs text-text-muted">ID {item.id}</p>
                      <p className="mt-1 truncate font-mono text-xs text-text-muted">Caso {item.case_id}</p>
                    </div>

                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-text-muted">Tentativas</p>
                        <p className="font-semibold text-text">
                          {item.attempt_count}/{item.max_attempts}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">Trace ID</p>
                        <p className="font-mono text-xs text-text">{item.last_trace_id ?? "—"}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-text-muted">Ação recomendada</p>
                        <p className="font-medium text-text">{statusAttentionText(item)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted"
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Ver detalhes
                      </button>
                      <Link
                        to={`/admissao/${item.case_id}`}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text transition hover:bg-surface-muted"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir caso
                      </Link>
                    </div>
                  </div>
                  {expanded ? <ItemDetails item={item} /> : null}
                </article>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-xs text-text-muted">
            <ShieldCheck className="h-4 w-4" />
            Operação somente leitura nesta fase, sem payload operacional nesta tela.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              className="min-h-9 rounded-lg border border-border px-3 text-sm font-semibold text-text disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={!itemsPage?.has_next || loading}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              className="min-h-9 rounded-lg border border-border px-3 text-sm font-semibold text-text disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
