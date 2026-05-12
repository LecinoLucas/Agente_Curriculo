import { useCallback, useEffect, useState } from "react";
import { useAsyncState } from "../../../hooks/useAsyncState";
import { analysisService } from "../../../services/analysisService";
import { formatContextError } from "../../../services/errorMessages";
import { AnalysisGlobalItem } from "../../../types/domain";
import { Paginated } from "../../../types/api";
import { usePipeline } from "../../pipeline/PipelineContext";
import { feedback } from "../../../services/feedback";
import { toast } from "../../../shared/utils/toast";

export type StatusFilter =
  | "all"
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled"
  | "discarded";
export type AiFilter = "all" | "real" | "mock";

const PAGE_SIZE = 20;

export function useAnalysesPage() {
  const { syncAnalysisStart, startPolling, analysesSyncTick } = usePipeline();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [actionId, setActionId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<AnalysisGlobalItem | null>(null);

  const { data, loading, error, run } = useAsyncState<Paginated<AnalysisGlobalItem>>();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const hasActiveFilters = search || statusFilter !== "all" || aiFilter !== "all";

  const fetchData = useCallback(() => {
    const usedRealAi = aiFilter === "real" ? true : aiFilter === "mock" ? false : undefined;

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

  async function handleRetry(item: AnalysisGlobalItem) {
    setActionId(item.id);
    feedback.reprocessAnalysis.processing();
    try {
      const response = await analysisService.retry(item.id);
      if (item.candidate_id) {
        await syncAnalysisStart({
          candidateId: item.candidate_id,
          analysisId: response.analysis_id,
          status: "pending",
          jobId: item.job_id,
        });
      } else {
        fetchData();
      }
      startPolling(response.analysis_id, item.candidate_id, "pending", item.job_id);
      feedback.reprocessAnalysis.success();
    } catch (err) {
      feedback.reprocessAnalysis.error(err);
    } finally {
      setActionId(null);
    }
  }

  async function handleForceFail(item: AnalysisGlobalItem) {
    setActionId(item.id);
    feedback.reprocessAnalysis.processing();
    try {
      await analysisService.forceFail(item.id);
      fetchData();
      feedback.reprocessAnalysis.success();
    } catch (err) {
      feedback.reprocessAnalysis.error(err);
    } finally {
      setActionId(null);
    }
  }

  async function handleDiscard(payload: { reason: string; note?: string }) {
    if (!discardTarget) return;
    setActionId(discardTarget.id);
    try {
      await analysisService.discard(discardTarget.id, payload);
      setDiscardTarget(null);
      fetchData();
      toast.success("Análise descartada com sucesso.");
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível descartar a análise.",
          "Tente novamente.",
        ),
      );
    } finally {
      setActionId(null);
    }
  }

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const isRefreshing = loading && items.length > 0;
  const showInitialLoading = loading && items.length === 0 && !error;

  return {
    page,
    setPage,
    searchInput,
    setSearchInput,
    search,
    statusFilter,
    handleStatusFilter,
    aiFilter,
    handleAiFilter,
    actionId,
    discardTarget,
    setDiscardTarget,
    loading,
    error,
    items,
    total,
    totalPages,
    isRefreshing,
    showInitialLoading,
    hasActiveFilters,
    fetchData,
    clearFilters,
    handleRetry,
    handleForceFail,
    handleDiscard,
  };
}
