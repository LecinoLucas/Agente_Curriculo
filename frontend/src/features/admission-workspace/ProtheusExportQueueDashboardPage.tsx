"use client";

import { AlertTriangle, ExternalLink, RefreshCw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import { formatContextError } from "../../services/errorMessages";
import type {
  AdmissionCaseOverview,
  ProtheusExportDashboardItem,
  ProtheusExportDashboardItemsResponse,
  ProtheusExportDashboardSummary,
  ProtheusExportQueueStatus,
} from "../../types/domain";
import {
  getBlockedReasonLabel,
  getErrorCodeLabel,
  getPayloadStatusLabel,
  getQueueStatusDescription,
  getQueueStatusLabel,
  getQueueStatusTone,
  PROTHEUS_QUEUE_STATUS_OPTIONS,
} from "./protheusExportStatus";

const PAGE_SIZE = 20;

type DashboardQuickFilter = "all" | "errors" | "pending" | "completed";

type DashboardCaseContext = {
  candidateName: string | null;
  jobTitle: string | null;
};

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

function getInitials(name: string | null | undefined): string {
  if (!name) return "RH";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "RH";
}

function resolveLastAttempt(item: ProtheusExportDashboardItem): string {
  return formatDateTime(item.finished_at ?? item.updated_at ?? item.created_at);
}

function resolveOperationalError(item: ProtheusExportDashboardItem): string {
  if (item.last_error_code) return getErrorCodeLabel(item.last_error_code);
  if (item.blocked_reason) return getBlockedReasonLabel(item.blocked_reason);
  return "Sem erro operacional";
}

function extractCaseContext(overview: AdmissionCaseOverview): DashboardCaseContext {
  return {
    candidateName: overview.candidate.name,
    jobTitle: overview.job.title,
  };
}

function matchesQuickFilter(
  item: ProtheusExportDashboardItem,
  quickFilter: DashboardQuickFilter,
): boolean {
  if (quickFilter === "errors") {
    return item.status === "failed_permanent" || item.status === "blocked";
  }
  if (quickFilter === "pending") {
    return item.status === "queued" || item.status === "processing" || item.status === "retry_scheduled";
  }
  if (quickFilter === "completed") {
    return item.status === "success";
  }
  return true;
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
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
      <div>
        <dt className="text-text-muted">Retry manual</dt>
        <dd className="mt-1 text-text">{item.can_retry_manually ? "Disponível via fluxo seguro" : "Não disponível"}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Nova solicitação segura</dt>
        <dd className="mt-1 text-text">{item.can_request_new ? "Permitida" : "Bloqueada"}</dd>
      </div>
      <div>
        <dt className="text-text-muted">Modo operacional</dt>
        <dd className="mt-1 text-text">{item.is_stub_mode ? "STUB / dry-run seguro" : "Indisponível nesta fase"}</dd>
      </div>
    </dl>
  );
}

export function ProtheusExportQueueDashboardPage() {
  const [summary, setSummary] = useState<ProtheusExportDashboardSummary | null>(null);
  const [itemsPage, setItemsPage] = useState<ProtheusExportDashboardItemsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProtheusExportQueueStatus | "">("");
  const [quickFilter, setQuickFilter] = useState<DashboardQuickFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [caseContextById, setCaseContextById] = useState<Record<string, DashboardCaseContext>>({});
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const enrichVisibleCases = useCallback(async (items: ProtheusExportDashboardItem[]) => {
    const missingCaseIds = Array.from(new Set(items.map((item) => item.case_id))).filter(
      (caseId) => !(caseId in caseContextById),
    );
    if (missingCaseIds.length === 0) return;

    setContextLoading(true);
    try {
      const results = await Promise.allSettled(
        missingCaseIds.map(async (caseId) => ({
          caseId,
          context: extractCaseContext(await admissionWorkspaceService.getOverview(caseId)),
        })),
      );
      setCaseContextById((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === "fulfilled") {
            next[result.value.caseId] = result.value.context;
          }
        }
        return next;
      });
    } finally {
      setContextLoading(false);
    }
  }, [caseContextById]);

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

  useEffect(() => {
    if (!itemsPage?.items.length) return;
    void enrichVisibleCases(itemsPage.items);
  }, [enrichVisibleCases, itemsPage]);

  function handleStatusChange(nextStatus: string) {
    setStatusFilter(nextStatus as ProtheusExportQueueStatus | "");
    setOffset(0);
    setExpandedId(null);
  }

  const items = itemsPage?.items ?? [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleItems = items.filter((item) => {
    if (!matchesQuickFilter(item, quickFilter)) return false;
    if (!normalizedSearch) return true;
    const context = caseContextById[item.case_id];
    const haystack = [
      item.case_id,
      item.id,
      item.status,
      item.status_label,
      item.last_trace_id,
      context?.candidateName,
      context?.jobTitle,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const total = summary?.total ?? 0;
  const failed = summary?.totals_by_status.failed_permanent ?? 0;
  const blocked = summary?.totals_by_status.blocked ?? 0;
  const retryScheduled = summary?.totals_by_status.retry_scheduled ?? 0;
  const queued = summary?.totals_by_status.queued ?? 0;
  const processing = summary?.totals_by_status.processing ?? 0;
  const success = summary?.totals_by_status.success ?? 0;
  const latestVisibleUpdate = visibleItems.reduce<string | null>((latest, item) => {
    const candidate = item.updated_at ?? item.created_at ?? item.finished_at;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest;
  }, null);

  const emptyStateTitle = normalizedSearch
    ? "Nenhum candidato ou caso encontrado"
    : quickFilter === "errors"
      ? "Nenhum erro encontrado"
      : quickFilter === "pending"
        ? "Nenhuma solicitação pendente"
        : quickFilter === "completed"
          ? "Nenhuma solicitação concluída"
          : "Nenhuma solicitação encontrada";
  const emptyStateDescription = normalizedSearch
    ? "Refine a busca ou limpe os filtros para voltar à visão completa."
    : quickFilter === "errors"
      ? "A fila atual não possui bloqueios ou falhas permanentes neste recorte."
      : quickFilter === "pending"
        ? "Não há itens aguardando processamento no recorte atual."
        : quickFilter === "completed"
          ? "Nenhuma exportação segura foi concluída neste recorte."
          : "Ajuste os filtros ou atualize a fila operacional.";

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
        {summary ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              {summary.operational_flags.is_stub_mode ? "Modo seguro STUB ativo" : "Modo seguro indisponível"}
            </span>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Bridge {summary.operational_flags.bridge_enabled ? "habilitada" : "indisponível"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              <ShieldAlert className="h-3.5 w-3.5" />
              {summary.operational_flags.real_send_enabled ? "Envio real habilitado" : "Envio real bloqueado"}
            </span>
          </div>
        ) : null}
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Totais da fila">
        <MetricCard label="Total de solicitações" value={total} />
        <MetricCard label="Pendentes" value={queued} tone="text-blue-700" />
        <MetricCard label="Em processamento" value={processing} tone="text-amber-700" />
        <MetricCard label="Com erro" value={failed} tone="text-red-700" />
        <MetricCard label="Bloqueados" value={blocked} tone="text-red-700" />
        <MetricCard label="Concluídas" value={success} tone="text-emerald-700" />
        <MetricCard label="Retry agendado" value={retryScheduled} tone="text-amber-700" />
        <MetricCard label="Última atualização" value={formatDateTime(latestVisibleUpdate)} tone="text-text" />
      </section>

      {summary?.top_errors.length ? (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text">Erros mais frequentes</h2>
              <p className="text-sm text-text-muted">Tradução operacional dos incidentes recorrentes da fila.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.top_errors.map((errorItem, index) => (
              <div key={`${errorItem.code ?? "sem-codigo"}-${index}`} className="rounded-lg border border-border bg-surface-muted/35 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {errorItem.code ? getErrorCodeLabel(errorItem.code) : "Erro sem código"}
                </p>
                <p className="mt-1 text-sm font-medium text-text">{errorItem.message_redacted ?? "Sem mensagem adicional"}</p>
                <p className="mt-2 text-xs text-text-muted">{errorItem.count} ocorrência(s)</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">Solicitações</h2>
            <p className="text-sm text-text-muted">
              {visibleItems.length} de {itemsPage?.total ?? 0} registro(s) visíveis
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2 text-sm text-text">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar candidato ou caso"
                  className="min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text sm:w-64"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-text">
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
            <div className="flex flex-wrap gap-2">
              {([
                { key: "all", label: "Todos" },
                { key: "errors", label: "Somente erros" },
                { key: "pending", label: "Somente pendentes" },
                { key: "completed", label: "Somente concluídos" },
              ] as const).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setQuickFilter(option.key)}
                  className={[
                    "min-h-9 rounded-full border px-3 text-xs font-semibold transition",
                    quickFilter === option.key
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                      : "border-border bg-surface text-text-muted hover:bg-surface-muted",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
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

        {!error && !loading && visibleItems.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={quickFilter === "errors" ? "🛡️" : normalizedSearch ? "🔎" : "📋"}
              title={emptyStateTitle}
              description={emptyStateDescription}
            />
          </div>
        ) : null}

        {!error && visibleItems.length > 0 ? (
          <div className="divide-y divide-border" data-testid="protheus-export-dashboard-list">
            {visibleItems.map((item) => {
              const expanded = expandedId === item.id;
              const caseContext = caseContextById[item.case_id];
              const candidateName = caseContext?.candidateName ?? null;
              const jobTitle = caseContext?.jobTitle ?? null;
              const jobAndUnitLabel = [jobTitle, item.unit_name].filter(Boolean).join(" / ");
              return (
                <article key={item.id} className="bg-surface">
                  <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text">
                          {getInitials(candidateName ?? item.case_id)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text">
                            {candidateName ?? (contextLoading ? "Carregando candidato..." : "Candidato não disponível")}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-text-muted">
                            {jobAndUnitLabel || "Vaga/unidade indisponivel neste snapshot seguro"}
                          </p>
                          <p className="mt-1 truncate font-mono text-[11px] text-text-muted">
                            Caso {item.case_id}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <div
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
                            getQueueStatusTone(item.status),
                          ].join(" ")}
                        >
                          {getQueueStatusLabel(item.status, item.status_label)}
                        </div>
                        <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {item.is_stub_mode ? "STUB / dry-run seguro" : "Somente leitura"}
                        </div>
                        {item.payload_status ? (
                          <div className="inline-flex rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-muted">
                            {getPayloadStatusLabel(item.payload_status, item.payload_status_label)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-text-muted">Ultima tentativa</p>
                        <p className="font-semibold text-text">{resolveLastAttempt(item)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Tentativas</p>
                        <p className="font-semibold text-text">{item.attempt_count}/{item.max_attempts}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Proximo retry</p>
                        <p className="font-semibold text-text">{formatDateTime(item.next_attempt_at)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Erro traduzido</p>
                        <p className="font-medium text-text">{resolveOperationalError(item)}</p>
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
            Operacao segura nesta fase, sem envio real nem payload operacional nesta tela.
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
