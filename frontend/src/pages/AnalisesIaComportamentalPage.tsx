import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Eye,
  FilterX,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  TimerReset,
  XCircle,
  Zap,
} from "lucide-react";

import { Modal } from "../components/common/Modal";
import Pagination from "../components/common/Pagination";
import {
  getBehavioralAIEvaluationDetail,
  getBehavioralAIMetrics,
  listBehavioralAIEvaluations,
  retryBehavioralAIEvaluation,
  type BehavioralAIEvaluationDetail,
  type BehavioralAIEvaluationListItem,
  type BehavioralAIMetrics,
  type BehavioralAIOperationalStatus,
  type BehavioralAIStatus,
} from "../services/behavioralAIEvaluationService";
import { formatContextError } from "../services/errorMessages";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type FilterState = {
  search: string;
  status: BehavioralAIStatus | "all";
  operational_status: BehavioralAIOperationalStatus | "all";
  provider: string;
  model: string;
  provider_error_type: string;
  date_from: string;
  date_to: string;
};

const defaultFilters: FilterState = {
  search: "",
  status: "all",
  operational_status: "all",
  provider: "",
  model: "",
  provider_error_type: "",
  date_from: "",
  date_to: "",
};

const statusOptions: Array<{ value: BehavioralAIStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "processing", label: "Processando" },
  { value: "retry_scheduled", label: "Retry agendado" },
  { value: "completed", label: "Concluída" },
  { value: "failed", label: "Falhou" },
];

const operationalStatusOptions: Array<{ value: BehavioralAIOperationalStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "processing", label: "Processando" },
  { value: "completed", label: "Concluída" },
  { value: "failed", label: "Falhou" },
  { value: "retry_scheduled", label: "Retry agendado" },
  { value: "rate_limited", label: "Rate limited" },
  { value: "credential_invalid", label: "Credencial inválida" },
];

const statusMeta: Record<BehavioralAIOperationalStatus, { label: string; cls: string }> = {
  pending: {
    label: "Pendente",
    cls: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  },
  processing: {
    label: "Processando",
    cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300",
  },
  completed: {
    label: "Concluída",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  failed: {
    label: "Falhou",
    cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300",
  },
  retry_scheduled: {
    label: "Retry agendado",
    cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
  },
  rate_limited: {
    label: "Rate limited",
    cls: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-300",
  },
  credential_invalid: {
    label: "Credencial inválida",
    cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300",
  },
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function finalTimestamp(item: BehavioralAIEvaluationListItem): string {
  return formatDateTime(item.completed_at ?? item.failed_at);
}

function retryReasonLabel(value: string | null): string {
  const map: Record<string, string> = {
    completed: "Avaliação concluída",
    credential_action_required: "Corrigir credencial antes de reprocessar",
    already_in_progress: "Já está em andamento",
    waiting_next_retry: "Aguardando próxima tentativa",
    retry_due: "Retry vencido",
    retry_not_due: "Retry ainda não vencido",
    failed: "Falha pode ser reprocessada",
    stuck: "Processamento travado",
    retry_not_allowed: "Retry não permitido",
  };
  return value ? map[value] ?? value : "-";
}

function StatusBadge({ status }: { status: BehavioralAIOperationalStatus }) {
  const meta = statusMeta[status] ?? statusMeta.pending;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", meta.cls)}>
      {meta.label}
    </span>
  );
}

function deriveMetricsFromRows(items: BehavioralAIEvaluationListItem[]): BehavioralAIMetrics {
  return {
    pending: items.filter((item) => item.status === "pending").length,
    processing: items.filter((item) => item.status === "processing").length,
    retry_scheduled: items.filter((item) => item.status === "retry_scheduled").length,
    completed_last_24h: items.filter((item) => item.status === "completed").length,
    failed_last_24h: items.filter((item) => item.status === "failed").length,
    rate_limited: items.filter((item) => item.operational_status === "rate_limited").length,
    credential_invalid: items.filter((item) => item.operational_status === "credential_invalid").length,
    next_retries: items.filter((item) => item.next_retry_at).length,
    stuck: items.filter((item) => item.stuck).length,
  };
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-[hsl(var(--bg))]/50 p-3">
      <dt className="text-[11px] font-semibold uppercase text-text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-text">{value || "-"}</dd>
    </div>
  );
}

function CompactField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase text-text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-text">{value || "-"}</dd>
    </div>
  );
}

function RowActions({
  item,
  retryingId,
  onOpenDetail,
  onRetry,
  compact = false,
}: {
  item: BehavioralAIEvaluationListItem;
  retryingId: string | null;
  onOpenDetail: (evaluationId: string) => void;
  onRetry: (item: BehavioralAIEvaluationListItem) => void;
  compact?: boolean;
}) {
  const buttonClass = compact
    ? "ui-btn-secondary inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold"
    : "ui-btn-secondary inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold";
  const retryClass = compact
    ? "ui-btn-primary inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold disabled:opacity-50"
    : "ui-btn-primary inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold disabled:opacity-50";
  const linkClass = compact
    ? "ui-btn-secondary inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold"
    : "ui-btn-secondary inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold";

  return (
    <div className={cn("flex gap-2", compact ? "flex-wrap" : "justify-end whitespace-nowrap")}>
      <button
        type="button"
        onClick={() => onOpenDetail(item.evaluation_id)}
        className={buttonClass}
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Ver detalhes
      </button>
      {item.can_retry ? (
        <button
          type="button"
          disabled={retryingId === item.evaluation_id}
          onClick={() => onRetry(item)}
          className={retryClass}
        >
          {retryingId === item.evaluation_id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Reprocessar
        </button>
      ) : null}
      <Link
        to={`/candidatos/${item.candidate_id}?tab=assessments&focus=behavioral_ai`}
        className={linkClass}
      >
        Abrir candidato
      </Link>
      <Link
        to={`/vagas/${item.job_id}/editar`}
        className={linkClass}
      >
        Abrir vaga
      </Link>
    </div>
  );
}

function CompactEvaluationCard({
  item,
  retryingId,
  onOpenDetail,
  onRetry,
}: {
  item: BehavioralAIEvaluationListItem;
  retryingId: string | null;
  onOpenDetail: (evaluationId: string) => void;
  onRetry: (item: BehavioralAIEvaluationListItem) => void;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-text">{item.candidate_name}</h2>
          <p className="mt-1 break-words text-xs text-text-muted">{item.candidate_email || "-"}</p>
        </div>
        <StatusBadge status={item.operational_status} />
      </div>

      <p className="mt-3 break-words text-sm font-medium text-text">{item.job_title}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <CompactField
          label="Provider/modelo"
          value={
            <>
              <span className="font-medium">{item.provider}</span>
              <span className="block text-xs text-text-muted">{item.model}</span>
            </>
          }
        />
        <CompactField label="Tentativas" value={item.retry_count} />
        <CompactField label="Solicitado" value={formatDateTime(item.requested_at)} />
        <CompactField label="Finalizado" value={finalTimestamp(item)} />
      </dl>

      <div className="mt-4 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/50 p-3">
        <p className="text-[11px] font-semibold uppercase text-text-muted">Erro seguro</p>
        <p className="mt-1 line-clamp-3 break-words text-sm text-text">
          {item.safe_error_message || "-"}
        </p>
      </div>

      <div className="mt-4">
        <RowActions
          item={item}
          retryingId={retryingId}
          onOpenDetail={onOpenDetail}
          onRetry={onRetry}
          compact
        />
      </div>
    </article>
  );
}

export function AnalisesIaComportamentalPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<BehavioralAIEvaluationListItem[]>([]);
  const [metrics, setMetrics] = useState<BehavioralAIMetrics | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BehavioralAIEvaluationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters.search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listBehavioralAIEvaluations({
        page,
        page_size: PAGE_SIZE,
        status: filters.status,
        operational_status: filters.operational_status,
        provider: filters.provider,
        model: filters.model,
        provider_error_type: filters.provider_error_type,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        search: debouncedSearch || undefined,
      });

      if (!mountedRef.current) return;
      setItems(list.data);
      setTotal(list.total);
      setTotalPages(list.total_pages);

      try {
        const loadedMetrics = await getBehavioralAIMetrics();
        if (mountedRef.current) setMetrics(loadedMetrics);
      } catch {
        if (mountedRef.current) setMetrics(deriveMetricsFromRows(list.data));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(formatContextError(err, "Não foi possível carregar a fila de IA comportamental.", "Tente novamente."));
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [debouncedSearch, filters, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const hasInFlight = items.some((item) =>
    item.status === "pending" || item.status === "processing" || item.status === "retry_scheduled"
  );

  useEffect(() => {
    if (!hasInFlight) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) void loadData();
    }, 7000);
    return () => window.clearInterval(interval);
  }, [hasInFlight, loadData]);

  const hasActiveFilters = useMemo(
    () => Object.entries(filters).some(([key, value]) => key !== "search" ? Boolean(value && value !== "all") : Boolean(value.trim())),
    [filters],
  );

  const providerOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.provider).filter(Boolean))).sort(),
    [items],
  );
  const modelOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.model).filter(Boolean))).sort(),
    [items],
  );
  const errorTypeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.provider_error_type).filter((value): value is string => Boolean(value)))).sort(),
    [items],
  );

  const visibleMetrics = metrics ?? deriveMetricsFromRows(items);
  const kpis = [
    { label: "Pendentes", value: visibleMetrics.pending, icon: Clock3, tone: "text-slate-500" },
    { label: "Processando", value: visibleMetrics.processing, icon: Zap, tone: "text-sky-600" },
    { label: "Concluídas 24h", value: visibleMetrics.completed_last_24h, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Falhas 24h", value: visibleMetrics.failed_last_24h, icon: XCircle, tone: "text-rose-600" },
    { label: "Retry agendado", value: visibleMetrics.retry_scheduled, icon: TimerReset, tone: "text-amber-600" },
    { label: "Rate limited", value: visibleMetrics.rate_limited, icon: AlertTriangle, tone: "text-orange-600" },
    { label: "Credencial inválida", value: visibleMetrics.credential_invalid, icon: ShieldAlert, tone: "text-red-600" },
    { label: "Travadas", value: visibleMetrics.stuck, icon: AlertTriangle, tone: "text-rose-700" },
  ];

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(defaultFilters);
    setDebouncedSearch("");
    setPage(1);
  }

  async function openDetail(evaluationId: string) {
    setDetailId(evaluationId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await getBehavioralAIEvaluationDetail(evaluationId));
    } catch (err) {
      setDetailError(formatContextError(err, "Não foi possível carregar os detalhes.", "Tente novamente."));
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRetry(item: BehavioralAIEvaluationListItem) {
    if (!item.can_retry || retryingId) return;
    setRetryingId(item.evaluation_id);
    setNotice(null);
    try {
      const response = await retryBehavioralAIEvaluation(item.evaluation_id);
      setNotice(response.message || "Retry solicitado.");
      await loadData();
      if (detailId === item.evaluation_id) {
        await openDetail(item.evaluation_id);
      }
    } catch (err) {
      setNotice(formatContextError(err, "Não foi possível reprocessar a IA comportamental.", "Tente novamente."));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-[hsl(var(--bg))] text-[hsl(var(--primary))]">
                <BrainCircuit className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h1 className="font-heading text-2xl font-semibold text-text">IA Comportamental</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Acompanhe fila, falhas, retries e conclusões das avaliações comportamentais assistidas por IA.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="ui-btn-secondary inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            Atualizar
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase text-text-muted">{label}</p>
              <Icon className={cn("h-4 w-4", tone)} aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(6,minmax(150px,1fr))_auto]">
            <label className="relative block">
              <span className="sr-only">Busca</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Buscar candidato ou vaga"
                className="ui-input h-10 w-full rounded-lg pl-9 text-sm"
              />
            </label>
            <select
              aria-label="Status"
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value as FilterState["status"])}
              className="ui-input h-10 rounded-lg text-sm"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              aria-label="Status operacional"
              value={filters.operational_status}
              onChange={(event) => updateFilter("operational_status", event.target.value as FilterState["operational_status"])}
              className="ui-input h-10 rounded-lg text-sm"
            >
              {operationalStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label className="block">
              <span className="sr-only">Provider</span>
              <input
                list="behavioral-ai-providers"
                value={filters.provider}
                onChange={(event) => updateFilter("provider", event.target.value)}
                placeholder="Provider"
                className="ui-input h-10 w-full rounded-lg text-sm"
              />
            </label>
            <datalist id="behavioral-ai-providers">
              {providerOptions.map((value) => <option key={value} value={value} />)}
            </datalist>
            <label className="block">
              <span className="sr-only">Modelo</span>
              <input
                list="behavioral-ai-models"
                value={filters.model}
                onChange={(event) => updateFilter("model", event.target.value)}
                placeholder="Modelo"
                className="ui-input h-10 w-full rounded-lg text-sm"
              />
            </label>
            <datalist id="behavioral-ai-models">
              {modelOptions.map((value) => <option key={value} value={value} />)}
            </datalist>
            <label className="block">
              <span className="sr-only">Tipo de erro</span>
              <input
                list="behavioral-ai-error-types"
                value={filters.provider_error_type}
                onChange={(event) => updateFilter("provider_error_type", event.target.value)}
                placeholder="Tipo de erro"
                className="ui-input h-10 w-full rounded-lg text-sm"
              />
            </label>
            <datalist id="behavioral-ai-error-types">
              {errorTypeOptions.map((value) => <option key={value} value={value} />)}
            </datalist>
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="ui-btn-secondary inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
            >
              <FilterX className="h-4 w-4" aria-hidden="true" />
              Limpar
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-lg">
            <label className="text-xs font-semibold text-text-muted">
              Período inicial
              <input
                type="date"
                value={filters.date_from}
                onChange={(event) => updateFilter("date_from", event.target.value)}
                className="ui-input mt-1 h-10 w-full rounded-lg text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-text-muted">
              Período final
              <input
                type="date"
                value={filters.date_to}
                onChange={(event) => updateFilter("date_to", event.target.value)}
                className="ui-input mt-1 h-10 w-full rounded-lg text-sm"
              />
            </label>
          </div>
        </div>

        {notice ? (
          <div className="border-b border-border bg-[hsl(var(--bg))]/60 px-4 py-3 text-sm text-text">
            {notice}
          </div>
        ) : null}

        <div className="min-h-[420px]">
          {loading && items.length === 0 ? (
            <div className="space-y-3 p-4" aria-label="Carregando IA comportamental">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-lg bg-[hsl(var(--bg))]" />
              ))}
            </div>
          ) : error ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-rose-600" aria-hidden="true" />
              <p className="max-w-md text-sm text-text">{error}</p>
              <button type="button" className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold" onClick={() => void loadData()}>
                Tentar novamente
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
              <BrainCircuit className="h-8 w-8 text-text-muted" aria-hidden="true" />
              <p className="text-base font-semibold text-text">
                {hasActiveFilters ? "Nenhuma avaliação encontrada" : "Ainda não há avaliações comportamentais IA"}
              </p>
              <p className="max-w-md text-sm text-text-muted">
                {hasActiveFilters
                  ? "Ajuste os filtros para ampliar a busca operacional."
                  : "As avaliações solicitadas no perfil do candidato aparecerão aqui."}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 p-3 lg:hidden">
                {items.map((item) => (
                  <CompactEvaluationCard
                    key={item.evaluation_id}
                    item={item}
                    retryingId={retryingId}
                    onOpenDetail={(evaluationId) => void openDetail(evaluationId)}
                    onRetry={(evaluation) => void handleRetry(evaluation)}
                  />
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-[1320px] w-full divide-y divide-[hsl(var(--border))] text-sm">
                  <thead className="bg-[hsl(var(--bg))]/70">
                    <tr className="text-left text-xs font-semibold uppercase text-text-muted">
                      <th className="px-4 py-3">Candidato</th>
                      <th className="px-4 py-3">Vaga</th>
                      <th className="px-4 py-3">Status operacional</th>
                      <th className="px-4 py-3">Provider/modelo</th>
                      <th className="px-4 py-3">Tentativas</th>
                      <th className="px-4 py-3">Solicitado</th>
                      <th className="px-4 py-3">Enfileirado</th>
                      <th className="px-4 py-3">Iniciado</th>
                      <th className="px-4 py-3">Concluído/falhou</th>
                      <th className="px-4 py-3">Próxima tentativa</th>
                      <th className="px-4 py-3">Erro seguro</th>
                      <th className="sticky right-0 border-l border-border bg-[hsl(var(--bg))] px-4 py-3 text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))]">
                    {items.map((item) => (
                      <tr key={item.evaluation_id} className="group align-top hover:bg-[hsl(var(--bg))]/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-text">{item.candidate_name}</div>
                          <div className="text-xs text-text-muted">{item.candidate_email || "-"}</div>
                        </td>
                        <td className="px-4 py-3 text-text">{item.job_title}</td>
                        <td className="px-4 py-3"><StatusBadge status={item.operational_status} /></td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-text">{item.provider}</div>
                          <div className="text-xs text-text-muted">{item.model}</div>
                        </td>
                        <td className="px-4 py-3 text-text">{item.retry_count}</td>
                        <td className="px-4 py-3 text-text-muted">{formatDateTime(item.requested_at)}</td>
                        <td className="px-4 py-3 text-text-muted">{formatDateTime(item.queued_at)}</td>
                        <td className="px-4 py-3 text-text-muted">{formatDateTime(item.started_at)}</td>
                        <td className="px-4 py-3 text-text-muted">{finalTimestamp(item)}</td>
                        <td className="px-4 py-3 text-text-muted">{formatDateTime(item.next_retry_at)}</td>
                        <td className="max-w-[220px] px-4 py-3 text-xs text-text-muted">
                          <span className="line-clamp-3">{item.safe_error_message || "-"}</span>
                        </td>
                        <td className="sticky right-0 border-l border-border bg-surface px-4 py-3 group-hover:bg-[hsl(var(--bg))]">
                          <RowActions
                            item={item}
                            retryingId={retryingId}
                            onOpenDetail={(evaluationId) => void openDetail(evaluationId)}
                            onRetry={(evaluation) => void handleRetry(evaluation)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-border p-4">
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </div>
      </section>

      {detailId ? (
        <Modal
          title="Detalhes da IA comportamental"
          onClose={() => {
            setDetailId(null);
            setDetail(null);
            setDetailError(null);
          }}
          contentClassName="sm:max-w-3xl"
        >
          <div className="max-h-[75vh] overflow-y-auto p-5">
            {detailLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Carregando detalhes...
              </div>
            ) : detailError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                {detailError}
              </div>
            ) : detail ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={detail.operational_status} />
                  <span className="text-sm text-text-muted">
                    {detail.provider} / {detail.model}
                  </span>
                </div>

                <dl className="grid gap-3 sm:grid-cols-2">
                  <DetailRow label="Candidato" value={detail.candidate_name} />
                  <DetailRow label="Vaga" value={detail.job_title} />
                  <DetailRow label="Confiança" value={detail.confidence ?? "-"} />
                  <DetailRow label="Tentativas" value={detail.retry_count} />
                  <DetailRow label="Solicitado em" value={formatDateTime(detail.requested_at)} />
                  <DetailRow label="Enfileirado em" value={formatDateTime(detail.queued_at)} />
                  <DetailRow label="Iniciado em" value={formatDateTime(detail.started_at)} />
                  <DetailRow label="Concluído em" value={formatDateTime(detail.completed_at)} />
                  <DetailRow label="Falhou em" value={formatDateTime(detail.failed_at)} />
                  <DetailRow label="Próxima tentativa" value={formatDateTime(detail.next_retry_at)} />
                  <DetailRow label="Tipo de erro" value={detail.provider_error_type ?? "-"} />
                  <DetailRow label="Status provider" value={detail.provider_status_code ?? "-"} />
                  <DetailRow label="Retry" value={retryReasonLabel(detail.retry_allowed_reason)} />
                </dl>

                <div className="rounded-lg border border-border bg-[hsl(var(--bg))]/50 p-4">
                  <h3 className="text-sm font-semibold text-text">Resumo seguro</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-muted">
                    {detail.summary || detail.safe_error_message || "Sem resumo disponível."}
                  </p>
                </div>

                {detail.can_retry ? (
                  <button
                    type="button"
                    disabled={retryingId === detail.evaluation_id}
                    onClick={() => void handleRetry(detail)}
                    className="ui-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
                  >
                    {retryingId === detail.evaluation_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Reprocessar avaliação
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
