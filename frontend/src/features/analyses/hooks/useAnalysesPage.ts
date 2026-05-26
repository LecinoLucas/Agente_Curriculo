import { useCallback, useEffect, useRef, useState } from "react";
import { useAsyncState } from "../../../hooks/useAsyncState";
import { analysisService } from "../../../services/analysisService";
import { listBehavioralAIQueue, retryBehavioralAI } from "../../../services/behavioralAIEvaluationService";
import { formatContextError } from "../../../services/errorMessages";
import { AnalysisGlobalItem } from "../../../types/domain";
import { Paginated } from "../../../types/api";
import { usePipeline } from "../../pipeline/PipelineContext";
import { feedback } from "../../../services/feedback";
import { toast } from "../../../shared/utils/toast";

export type StatusFilter =
  | "all"
  | "waiting_extraction"
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled"
  | "discarded";
export type AiFilter = "all" | "real" | "mock";
export type AnalysisTypeFilter = "all" | "resume" | "behavioral_ai";

const PAGE_SIZE = 20;

const BEHAVIORAL_QUEUE_STATUSES = new Set([
  "all",
  "pending",
  "processing",
  "retry_scheduled",
  "completed",
  "failed",
]);

function getItemTime(item: AnalysisGlobalItem): number {
  return new Date(
    item.completed_at ??
      item.failed_at ??
      item.updated_at ??
      item.started_at ??
      item.created_at,
  ).getTime();
}

export function useAnalysesPage() {
  const { syncAnalysisStart, startPolling, analysesSyncTick } = usePipeline();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [typeFilter, setTypeFilter] = useState<AnalysisTypeFilter>("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [actionId, setActionId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<AnalysisGlobalItem | null>(null);

  const { data, loading, error, run } = useAsyncState<Paginated<AnalysisGlobalItem>>();
  const loadingRef = useRef(loading);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const hasActiveFilters =
    Boolean(search) ||
    statusFilter !== "all" ||
    aiFilter !== "all" ||
    typeFilter !== "all" ||
    providerFilter !== "all" ||
    modelFilter !== "all";

  const fetchData = useCallback(() => {
    const usedRealAi = aiFilter === "real" ? true : aiFilter === "mock" ? false : undefined;

    void run(() => {
      const normalizedStatus = statusFilter === "all" ? undefined : statusFilter;
      const request =
        typeFilter === "behavioral_ai"
          ? listBehavioralAIQueue(page, PAGE_SIZE, normalizedStatus, search || undefined)
          : typeFilter === "resume"
            ? analysisService.listGlobal(page, PAGE_SIZE, normalizedStatus, search || undefined, usedRealAi)
            : Promise.all([
                analysisService.listGlobal(
                  1,
                  page * PAGE_SIZE,
                  normalizedStatus,
                  search || undefined,
                  usedRealAi,
                ),
                BEHAVIORAL_QUEUE_STATUSES.has(statusFilter)
                  ? listBehavioralAIQueue(
                      1,
                      page * PAGE_SIZE,
                      normalizedStatus,
                      search || undefined,
                    )
                  : Promise.resolve({
                      data: [],
                      total: 0,
                      page: 1,
                      page_size: page * PAGE_SIZE,
                      total_pages: 1,
                    }),
              ]).then(([resumePayload, behavioralPayload]) => {
                const combined = [...resumePayload.data, ...behavioralPayload.data].sort(
                  (a, b) => getItemTime(b) - getItemTime(a),
                );
                const start = (page - 1) * PAGE_SIZE;
                const total = resumePayload.total + behavioralPayload.total;
                return {
                  data: combined.slice(start, start + PAGE_SIZE),
                  total,
                  page,
                  page_size: PAGE_SIZE,
                  total_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
                };
              });
      return request.catch((err: unknown) => {
        throw new Error(
          formatContextError(
            err,
            "Não foi possível carregar as análises.",
            hasActiveFilters ? "Revise os filtros ou tente novamente." : "Tente novamente.",
          ),
        );
      });
    });
  }, [page, search, statusFilter, aiFilter, typeFilter, run, hasActiveFilters]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

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

  function handleTypeFilter(v: AnalysisTypeFilter) {
    setTypeFilter(v);
    setProviderFilter("all");
    setModelFilter("all");
    setPage(1);
  }

  function handleProviderFilter(v: string) {
    setProviderFilter(v);
    setPage(1);
  }

  function handleModelFilter(v: string) {
    setModelFilter(v);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setStatusFilter("all");
    setAiFilter("all");
    setTypeFilter("all");
    setProviderFilter("all");
    setModelFilter("all");
  }

  async function handleRetry(item: AnalysisGlobalItem) {
    setActionId(item.id);
    feedback.reprocessAnalysis.processing();
    try {
      const response =
        item.type === "behavioral_ai"
          ? await retryBehavioralAI(item.id)
          : await analysisService.retry(item.id);
      if (item.candidate_id) {
        if (item.type !== "behavioral_ai") {
          await syncAnalysisStart({
            candidateId: item.candidate_id,
            analysisId: response.analysis_id,
            status: "pending",
            jobId: item.job_id,
          });
        }
      } else {
        fetchData();
      }
      if (item.type !== "behavioral_ai") {
        startPolling(response.analysis_id, item.candidate_id, "pending", item.job_id);
      } else {
        fetchData();
      }
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

  const rawItems = data?.data ?? [];
  const providerOptions = Array.from(
    new Set(rawItems.map((item) => item.provider).filter((value): value is string => Boolean(value))),
  ).sort();
  const modelOptions = Array.from(
    new Set(rawItems.map((item) => item.model).filter((value): value is string => Boolean(value))),
  ).sort();
  const hasLocalOperationalFilter =
    typeFilter === "behavioral_ai" && (providerFilter !== "all" || modelFilter !== "all");
  const items = hasLocalOperationalFilter
    ? rawItems.filter((item) => {
        const providerMatches = providerFilter === "all" || item.provider === providerFilter;
        const modelMatches = modelFilter === "all" || item.model === modelFilter;
        return providerMatches && modelMatches;
      })
    : rawItems;
  const hasInFlightAnalyses = items.some(
    (item) =>
      item.status === "pending" ||
      item.status === "waiting_extraction" ||
      item.status === "processing" ||
      item.status === "retry_scheduled",
  );

  useEffect(() => {
    if (!hasInFlightAnalyses) return;

    const poll = () => {
      if (document.hidden) return;
      if (loadingRef.current) return;
      fetchData();
    };

    const intervalId = window.setInterval(poll, 4000);

    const handleVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchData, hasInFlightAnalyses]);

  const total = hasLocalOperationalFilter ? items.length : (data?.total ?? 0);
  const totalPages = hasLocalOperationalFilter ? 1 : (data?.total_pages ?? 1);
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
    typeFilter,
    handleTypeFilter,
    providerFilter,
    handleProviderFilter,
    modelFilter,
    handleModelFilter,
    providerOptions,
    modelOptions,
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
