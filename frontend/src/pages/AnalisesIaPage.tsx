import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { analysisService } from "../services/analysisService";
import { formatContextError } from "../services/errorMessages";
import { feedback } from "../services/feedback";
import { AnalysisGlobalItem } from "../types/domain";
import { Paginated } from "../types/api";
import { useAsyncState } from "../hooks/useAsyncState";

// ── Types ──────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "pending" | "processing" | "completed" | "failed" | "cancelled";
type AiFilter = "all" | "real" | "mock";

const PAGE_SIZE = 20;

// ── Formatters ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Aguardando",   cls: "bg-gray-100 text-gray-600" },
  processing: { label: "Processando",  cls: "bg-blue-100 text-blue-700" },
  completed:  { label: "Concluída",    cls: "bg-green-100 text-green-700" },
  failed:     { label: "Falhou",       cls: "bg-red-100 text-red-700" },
  cancelled:  { label: "Cancelado",    cls: "bg-yellow-100 text-yellow-700" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-400">—</span>;
  const r = Math.round(score);
  const cls =
    r >= 80 ? "font-semibold text-green-700" :
    r >= 60 ? "font-semibold text-yellow-700" :
    "font-semibold text-red-600";
  return <span className={`text-sm ${cls}`}>{r}</span>;
}

function AiBadge({ used }: { used: boolean | null }) {
  if (used === null) return <span className="text-xs text-gray-400">—</span>;
  return used ? (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
      IA Real
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      Mock
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function AnalisesIaPage() {
  const {
    openCandidate,
    syncAnalysisStart,
    startPolling,
    analysesSyncTick,
  } = usePipeline();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const hasActiveFilters = search || statusFilter !== "all" || aiFilter !== "all";

  const { data, loading, error, run } = useAsyncState<Paginated<AnalysisGlobalItem>>();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchData = useCallback(() => {
    const usedRealAi =
      aiFilter === "real" ? true :
      aiFilter === "mock" ? false :
      undefined;

    void run(() =>
      analysisService
        .listGlobal(
          page,
          PAGE_SIZE,
          statusFilter === "all" ? undefined : statusFilter,
          search || undefined,
          usedRealAi,
        )
        .catch((err: unknown) => {
          throw new Error(
            formatContextError(
              err,
              "Não foi possível carregar as análises.",
              hasActiveFilters ? "Revise os filtros ou tente novamente." : "Tente novamente.",
            ),
          );
        }),
    );
  }, [page, search, statusFilter, aiFilter, run, hasActiveFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData, analysesSyncTick]);

  function handleStatusFilter(v: StatusFilter) {
    setStatusFilter(v);
    setPage(1);
  }

  function handleAiFilter(v: AiFilter) {
    setAiFilter(v);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setStatusFilter("all");
    setAiFilter("all");
  }

  async function handleReprocess(item: AnalysisGlobalItem) {
    if (!item.resume_version_id) return;
    setReprocessingId(item.id);
    feedback.reprocessAnalysis.processing();
    try {
      const response = await analysisService.request(item.resume_version_id);
      if (item.candidate_id) {
        await syncAnalysisStart({
          candidateId: item.candidate_id,
          analysisId: response.analysis_id,
          status: "pending",
        });
      } else {
        fetchData();
      }
      startPolling(response.analysis_id, item.candidate_id, "pending");
      feedback.reprocessAnalysis.success();
    } catch (err) {
      feedback.reprocessAnalysis.error(err);
    } finally {
      setReprocessingId(null);
    }
  }

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-5">
        <PageHeader
          title="Análises IA"
          subtitle={
            loading ? "Carregando…" :
            total === 0
              ? hasActiveFilters
                ? "Nenhuma análise corresponde aos filtros atuais"
                : "Ainda não há análises registradas"
              :
            `${total} análise${total !== 1 ? "s" : ""} no total`
          }
          actions={
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <div className="relative min-w-[220px] flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por candidato…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">Todos os status</option>
          <option value="pending">Aguardando</option>
          <option value="processing">Processando</option>
          <option value="completed">Concluída</option>
          <option value="failed">Falhou</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <select
          value={aiFilter}
          onChange={(e) => handleAiFilter(e.target.value as AiFilter)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">IA real e mock</option>
          <option value="real">Somente IA real</option>
          <option value="mock">Somente mock</option>
        </select>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="text-sm text-gray-500">Carregando análises…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={fetchData} className="text-sm text-blue-600 hover:underline">
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-lg font-medium text-gray-500">
              {hasActiveFilters
                ? "Nenhuma análise corresponde aos filtros atuais"
                : "Ainda não há análises registradas"}
            </p>
            <p className="text-sm text-gray-400">
              {hasActiveFilters
                ? "Ajuste ou limpe os filtros para ver outras execuções."
                : "Envie um currículo e inicie uma análise para acompanhar as execuções aqui."}
            </p>
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="mt-1 text-sm text-blue-600 hover:underline">
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-[200px]">
                      Candidato
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Arquivo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      IA
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Criado em
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Duração
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {items.map((item) => (
                    <AnalysisRow
                      key={item.id}
                      item={item}
                      reprocessing={reprocessingId === item.id}
                      onOpen={() => {
                        if (item.candidate_id) void openCandidate(item.candidate_id);
                      }}
                      onReprocess={() => void handleReprocess(item)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="border-t border-gray-100 px-6 py-4">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  total={total}
                  pageSize={PAGE_SIZE}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <CandidateDrawer />
    </div>
  );
}

// ── AnalysisRow ────────────────────────────────────────────────────────────────

function AnalysisRow({
  item,
  reprocessing,
  onOpen,
  onReprocess,
}: {
  item: AnalysisGlobalItem;
  reprocessing: boolean;
  onOpen: () => void;
  onReprocess: () => void;
}) {
  const isFailed = item.status === "failed";
  const hasCandidate = Boolean(item.candidate_id);

  return (
    <tr className="group transition-colors hover:bg-gray-50">
      {/* Candidato */}
      <td className="px-6 py-4">
        <button
          type="button"
          disabled={!hasCandidate}
          onClick={onOpen}
          className="text-left disabled:cursor-default"
        >
          <div className={`font-medium leading-tight ${hasCandidate ? "text-blue-700 hover:underline cursor-pointer" : "text-gray-900"}`}>
            {item.candidate_name ?? <span className="text-gray-400 italic">Sem nome</span>}
          </div>
          {item.candidate_email ? (
            <div className="mt-0.5 text-xs text-gray-500">{item.candidate_email}</div>
          ) : null}
        </button>
      </td>

      {/* Arquivo */}
      <td className="px-4 py-4">
        {item.resume_file_name ? (
          <span className="max-w-[180px] truncate block text-xs text-gray-600" title={item.resume_file_name}>
            {item.resume_file_name}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Status + erro */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <StatusBadge status={item.status} />
          {isFailed && item.failure_reason ? (
            <span
              className="max-w-[200px] truncate text-xs text-red-500"
              title={item.failure_reason}
            >
              {item.failure_reason}
            </span>
          ) : null}
          {item.retry_count > 0 ? (
            <span className="text-xs text-gray-400">{item.retry_count} tentativa{item.retry_count !== 1 ? "s" : ""}</span>
          ) : null}
        </div>
      </td>

      {/* Score */}
      <td className="px-4 py-4">
        <ScoreCell score={item.overall_score} />
      </td>

      {/* IA real */}
      <td className="px-4 py-4">
        <AiBadge used={item.used_real_ai} />
      </td>

      {/* Criado em */}
      <td className="px-4 py-4 text-xs text-gray-500">
        {fmtDate(item.created_at)}
      </td>

      {/* Duração */}
      <td className="px-4 py-4 text-xs text-gray-500">
        {fmtDuration(item.started_at, item.completed_at ?? item.failed_at)}
      </td>

      {/* Ações */}
      <td className="px-4 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {hasCandidate ? (
            <button
              type="button"
              onClick={onOpen}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Abrir
            </button>
          ) : null}
          {isFailed ? (
            <button
              type="button"
              onClick={onReprocess}
              disabled={reprocessing}
              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {reprocessing ? "…" : "Reprocessar"}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
