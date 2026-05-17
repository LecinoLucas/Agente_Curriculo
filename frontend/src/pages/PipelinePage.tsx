import { ChevronDown, PanelRightClose, PanelRightOpen, RefreshCw, UserPlus, Search, SlidersHorizontal, Plus, Briefcase, MapPin, Award, Layers, X, Globe } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { CandidateSearchModal } from "../features/pipeline/CandidateSearchModal";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { EmptyState } from "../components/common/EmptyState";
import { DataQualityBanner } from "../components/data-quality/DataQualityBanner";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { getJobRanking } from "../services/jobsService";
import { pipelineService, type PipelineJobSummary } from "../services/pipelineService";
import type { CandidateListSummary, JobRanking, JobRankingEntry, PipelineStage } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";
import { isPipelineOperationalJob } from "../utils/jobStatusRules";
import { sortCandidatesByScore } from "../utils/pipelineSort";
import {
  buildDealBreakerViolationDisplay,
  isDealBreakerReasonCode,
} from "../features/pipeline/dealBreakerDisplay";

// ── Phase 27E: filter types & constants ─────────────────────────────────────
type ActiveFilters = {
  aiStatus: string;
  minMatchScore: number | null;
};
const DEFAULT_FILTERS: ActiveFilters = { aiStatus: "all", minMatchScore: null };

const AI_STATUS_LABELS: Record<string, string> = {
  all: "Todos",
  pending: "Aguardando",
  processing: "Processando",
  completed: "Concluído",
  failed: "Falhou",
};

const MIN_SCORE_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: "Todos", value: null },
  { label: "≥ 30%", value: 30 },
  { label: "≥ 50%", value: 50 },
  { label: "≥ 70%", value: 70 },
  { label: "≥ 90%", value: 90 },
];

const MAIN_STAGES: ReadonlyArray<PipelineStage> = [
  "entry",
  "screening",
  "hr_interview",
  "technical_interview",
  "final",
  "offer",
  "hired",
];
const PIPELINE_SHOW_RANKING_STORAGE_KEY = "pipeline:showRanking";
const PIPELINE_LAST_SELECTED_JOB_KEY = "pipeline:lastSelectedJobId";

// ── Helpers ─────────────────────────────────────────────────────────────────
function canUsePipeline(status: string | undefined) {
  return isPipelineOperationalJob(status);
}

function getRankingFreshnessLabel(status: JobRankingEntry["ranking_freshness_status"] | null | undefined) {
  if (status === "fresh") return "Atualizado";
  if (status === "stale") return "Aderência desatualizada";
  return "Aguardando reprocessamento";
}

function resolveInitialShowRanking() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PIPELINE_SHOW_RANKING_STORAGE_KEY) === "true";
}

function getLastSelectedJobId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PIPELINE_LAST_SELECTED_JOB_KEY);
}

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [showSourceCandidates, setShowSourceCandidates] = useState(false);
  const [showRanking, setShowRanking] = useState(resolveInitialShowRanking);
  const [sortOrder, setSortOrder] = useState<"score_desc" | "score_asc" | "name_az">("score_desc");
  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJobSummary[]>([]);
  const [pipelineJobsLoading, setPipelineJobsLoading] = useState(true);
  const [pipelineJobsError, setPipelineJobsError] = useState<string | null>(null);
  const rankingCacheRef = useRef<Map<string, JobRanking>>(new Map());
  const rankingFetchInFlightRef = useRef<Map<string, Promise<JobRanking>>>(new Map());

  // Search & filter state
  const [localSearch, setLocalSearch] = useState("");
  const [filters, setFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [globalSearchActive, setGlobalSearchActive] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<CandidateListSummary[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const filtersPanelRef = useRef<HTMLDivElement>(null);

  const {
    activeJobId,
    board,
    boardLoading,
    boardError,
    rankingSyncTick,
    selectedCandidateId,
    setActiveJob,
    refreshBoard,
    openCandidate,
  } = usePipeline();

  // ── Auto-Refresh & Countdown states ──
  const [autoRefreshActive, setAutoRefreshActive] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [lastUpdated, setLastUpdated] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour12: false })
  );
  const [isTabVisible, setIsTabVisible] = useState(true);

  const autoRefreshActiveRef = useRef(autoRefreshActive);
  const isTabVisibleRef = useRef(isTabVisible);
  const activeJobIdRef = useRef(activeJobId);
  const boardLoadingRef = useRef(boardLoading);
  const rankingLoadingRef = useRef(rankingLoading);
  const showRankingRef = useRef(showRanking);

  useEffect(() => {
    autoRefreshActiveRef.current = autoRefreshActive;
  }, [autoRefreshActive]);

  useEffect(() => {
    isTabVisibleRef.current = isTabVisible;
  }, [isTabVisible]);

  useEffect(() => {
    activeJobIdRef.current = activeJobId;
  }, [activeJobId]);

  useEffect(() => {
    boardLoadingRef.current = boardLoading;
  }, [boardLoading]);

  useEffect(() => {
    rankingLoadingRef.current = rankingLoading;
  }, [rankingLoading]);

  useEffect(() => {
    showRankingRef.current = showRanking;
  }, [showRanking]);

  // Tab visibility listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Reset timer on job selection change
  useEffect(() => {
    if (activeJobId) {
      setSecondsLeft(30);
      setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
    }
  }, [activeJobId]);

  // Close filter panel on click outside
  useEffect(() => {
    if (!showFiltersPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersPanelRef.current && !filtersPanelRef.current.contains(e.target as Node)) {
        setShowFiltersPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFiltersPanel]);

  // Reset global search when query or filters change
  useEffect(() => {
    setGlobalSearchActive(false);
    setGlobalSearchResults([]);
  }, [localSearch, filters]);

  // Unified refresh function
  const triggerRefresh = async () => {
    if (boardLoadingRef.current || rankingLoadingRef.current || !activeJobIdRef.current) return;

    const jobId = activeJobIdRef.current;
    const promises = [refreshBoard()];

    if (showRankingRef.current) {
      setRankingLoading(true);
      setRankingError(null);
      promises.push(
        loadRanking(jobId, true)
          .then((result) => {
            setRanking(result);
          })
          .catch((err: unknown) => {
            setRanking(null);
            setRankingError(
              formatContextError(
                err,
                "Não foi possível carregar o ranking desta vaga.",
                "Tente atualizar novamente.",
              ),
            );
          })
          .finally(() => setRankingLoading(false))
      );
    }

    await Promise.all(promises);
    setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
  };

  // Manual refresh handler
  const handleManualRefresh = async () => {
    if (boardLoading || !activeJobId) return;
    setSecondsLeft(30);
    await triggerRefresh();
  };

  // 1-second countdown ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (!autoRefreshActiveRef.current || !isTabVisibleRef.current || !activeJobIdRef.current) {
        return;
      }

      // Read current value via ref-like pattern: check if we should refresh
      // BEFORE entering a setState updater (avoids updating PipelineProvider
      // from inside PipelinePage's setState — the "Cannot update a component
      // while rendering" warning).
      let shouldRefresh = false;
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          shouldRefresh = true;
          return 30;
        }
        return prev - 1;
      });

      if (shouldRefresh) {
        void triggerRefresh();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPipelineJobsLoading(true);
    setPipelineJobsError(null);

    void pipelineService
      .listPipelineJobs()
      .then((items) => {
        if (cancelled) return;
        setPipelineJobs(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPipelineJobs([]);
        setPipelineJobsError(
          formatContextError(
            err,
            "Não foi possível carregar as vagas publicadas da pipeline.",
            "Tente atualizar a página.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setPipelineJobsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!jobIdParam) return;
    if (jobIdParam !== activeJobId) {
      const handle = setTimeout(() => {
        setActiveJob(jobIdParam);
      }, 0);
      return () => clearTimeout(handle);
    }
  }, [jobIdParam, activeJobId, setActiveJob]);

  async function loadRanking(jobId: string, force = false): Promise<JobRanking> {
    if (!force) {
      const cached = rankingCacheRef.current.get(jobId);
      if (cached) {
        return cached;
      }
    }

    let request = rankingFetchInFlightRef.current.get(jobId);
    if (!request || force) {
      request = getJobRanking(jobId)
        .then((result) => {
          rankingCacheRef.current.set(jobId, result);
          return result;
        })
        .finally(() => {
          rankingFetchInFlightRef.current.delete(jobId);
        });
      rankingFetchInFlightRef.current.set(jobId, request);
    }

    return await request;
  }

  useEffect(() => {
    rankingCacheRef.current.clear();
    rankingFetchInFlightRef.current.clear();
  }, [rankingSyncTick]);

  useEffect(() => {
    window.localStorage.setItem(
      PIPELINE_SHOW_RANKING_STORAGE_KEY,
      showRanking ? "true" : "false",
    );
  }, [showRanking]);

  useEffect(() => {
    if (!activeJobId) {
      setRanking(null);
      setRankingError(null);
      setRankingLoading(false);
      return;
    }

    if (!showRanking) {
      setRankingLoading(false);
      setRankingError(null);
      return;
    }

    let cancelled = false;
    setRankingLoading(true);
    setRankingError(null);

    void loadRanking(activeJobId)
      .then((result) => {
        if (cancelled) return;
        setRanking(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRanking(null);
        setRankingError(
          formatContextError(
            err,
            "Não foi possível carregar o ranking desta vaga.",
            "Tente atualizar novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, rankingSyncTick, showRanking]);

  useEffect(() => {
    if (jobIdParam) return;
    if (pipelineJobsLoading || pipelineJobs.length === 0) return;

    const lastJobId = getLastSelectedJobId();
    const jobToSelect = lastJobId && pipelineJobs.some((job) => job.id === lastJobId)
      ? lastJobId
      : pipelineJobs[0].id;

    navigate(`/pipeline/${jobToSelect}`, { replace: true });
  }, [jobIdParam, pipelineJobsLoading, pipelineJobs, navigate]);

  useEffect(() => {
    if (!jobIdParam || pipelineJobsLoading) return;
    const exists = pipelineJobs.some((job) => job.id === jobIdParam);
    if (exists) return;

    if (pipelineJobs.length > 0) {
      navigate(`/pipeline/${pipelineJobs[0].id}`, { replace: true });
      return;
    }

    navigate("/pipeline", { replace: true });
  }, [jobIdParam, pipelineJobsLoading, pipelineJobs, navigate]);

  // Derived selected job
  const selectedJob = useMemo(
    () => pipelineJobs.find((job) => job.id === activeJobId) ?? null,
    [pipelineJobs, activeJobId],
  );

  // All board candidates (unfiltered) for data-availability checks
  const allBoardCandidates = useMemo(
    () => (board?.columns ?? []).flatMap((col) => col.candidates),
    [board],
  );
  const hasAiStatusData = useMemo(
    () => allBoardCandidates.some((c) => c.ai_status != null),
    [allBoardCandidates],
  );
  const hasMatchScoreData = useMemo(
    () => allBoardCandidates.some((c) => c.job_fit_score != null),
    [allBoardCandidates],
  );

  // Shared candidate filter function (local scope only)
  const applyLocalFilters = useCallback(
    (candidates: typeof allBoardCandidates) => {
      let result = candidates;
      if (localSearch.trim()) {
        const q = localSearch.toLowerCase();
        result = result.filter(
          (c) =>
            c.candidate_name.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q),
        );
      }
      if (filters.aiStatus !== "all") {
        result = result.filter((c) => c.ai_status === filters.aiStatus);
      }
      if (filters.minMatchScore !== null) {
        const minScore = filters.minMatchScore;
        result = result.filter(
          (c) => c.job_fit_score != null && c.job_fit_score >= minScore,
        );
      }
      return result;
    },
    [localSearch, filters],
  );

  // Filter and sort columns based on localSearch, filters, and sortOrder
  const mainCols = useMemo(
    () =>
      (board?.columns ?? [])
        .filter((c) => (MAIN_STAGES as ReadonlyArray<string>).includes(c.stage))
        .map((col) => {
          const totalCount = col.candidates.length;
          return {
            ...col,
            candidates: sortCandidatesByScore(applyLocalFilters(col.candidates), sortOrder),
            totalCount,
          };
        }),
    [board, sortOrder, applyLocalFilters],
  );

  const rejectedCol = useMemo(() => {
    const col = board?.columns.find((c) => c.stage === "rejected") ?? null;
    if (!col) return null;
    return {
      ...col,
      candidates: sortCandidatesByScore(applyLocalFilters(col.candidates), sortOrder),
      totalCount: col.candidates.length,
    };
  }, [board, sortOrder, applyLocalFilters]);

  // Dynamic KPI calculation
  const totalActive = useMemo(() => {
    return mainCols.reduce((n, c) => n + c.candidates.length, 0);
  }, [mainCols]);

  const totalCandidatos = useMemo(() => {
    if (!board) return 0;
    return board.columns.reduce((sum, col) => sum + col.candidates.length, 0);
  }, [board]);

  const emAndamento = useMemo(() => {
    if (!board) return 0;
    return board.columns
      .filter((col) => col.stage !== "hired" && col.stage !== "rejected")
      .reduce((sum, col) => sum + col.candidates.length, 0);
  }, [board]);

  const entrevistas = useMemo(() => {
    if (!board) return 0;
    return board.columns
      .filter((col) => col.stage === "hr_interview" || col.stage === "technical_interview")
      .reduce((sum, col) => sum + col.candidates.length, 0);
  }, [board]);

  const contratacoes = useMemo(() => {
    if (!board) return 0;
    const col = board.columns.find((c) => c.stage === "hired");
    return col ? col.candidates.length : 0;
  }, [board]);

  const isBoardRefreshing = boardLoading && board !== null;
  const showInitialBoardLoading = boardLoading && board === null;
  const isRankingRefreshing = rankingLoading && ranking !== null;

  // Status flags
  const isDraft = selectedJob?.status === "draft";
  const canUse = canUsePipeline(selectedJob?.status);

  const activeJobAcceptsCandidates =
    selectedJob?.status === "published" || selectedJob?.status === "paused";

  const boardLayoutClass = showRanking
    ? "grid grid-cols-1 gap-6 xl:items-start xl:grid-cols-[minmax(0,1fr)_340px] xl:transition-[grid-template-columns] xl:duration-200"
    : "grid grid-cols-1 gap-6 xl:items-start xl:grid-cols-[minmax(0,1fr)] xl:transition-[grid-template-columns] xl:duration-200";

  // Active filter derived values
  const hasActiveLocalFilters =
    localSearch.trim() !== "" || filters.aiStatus !== "all" || filters.minMatchScore !== null;
  const activeFilterCount =
    (localSearch.trim() ? 1 : 0) +
    (filters.aiStatus !== "all" ? 1 : 0) +
    (filters.minMatchScore !== null ? 1 : 0);

  const filteredTotalVisible = useMemo(
    () =>
      mainCols.reduce((n, c) => n + c.candidates.length, 0) +
      (rejectedCol?.candidates.length ?? 0),
    [mainCols, rejectedCol],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleSelectJob(nextJobId: string) {
    window.sessionStorage.setItem(PIPELINE_LAST_SELECTED_JOB_KEY, nextJobId);
    navigate(`/pipeline/${nextJobId}`, { replace: true });
  }

  const handleOpenSourceCandidates = () => {
    if (!canUse || !activeJobId) return;
    void loadRanking(activeJobId);
    setShowSourceCandidates(true);
  };

  function clearFilters() {
    setLocalSearch("");
    setFilters(DEFAULT_FILTERS);
    setShowFiltersPanel(false);
    setGlobalSearchActive(false);
    setGlobalSearchResults([]);
  }

  async function handleGlobalSearch() {
    if (!localSearch.trim()) return;
    setGlobalSearchLoading(true);
    try {
      const result = await candidatesService.listSummaries(1, 20, localSearch.trim());
      setGlobalSearchResults(result.data);
      setGlobalSearchActive(true);
    } catch {
      setGlobalSearchResults([]);
      setGlobalSearchActive(true);
    } finally {
      setGlobalSearchLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col gap-6 pb-12 text-slate-800 dark:text-slate-100 min-w-0">
      
      {/* ── SaaS Breadcrumb and Header Control Area ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <nav className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Recrutamento</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-[hsl(var(--primary))]">Pipeline</span>
          </nav>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
            Pipeline
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
            Acompanhe o andamento dos candidatos em cada etapa do processo seletivo.
          </p>
        </div>

        {/* Action and Search Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Local search bar — scoped to current job */}
          <div className="relative min-w-[200px] sm:min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={activeJobId ? "Buscar candidato nesta vaga..." : "Buscar candidato..."}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-8 text-xs font-medium text-slate-700 dark:text-slate-100 shadow-sm outline-none transition focus:border-[hsl(var(--primary))]/40 focus:ring-2 focus:ring-[hsl(var(--primary))]/5"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick filter trigger */}
          <div className="relative" ref={filtersPanelRef}>
            <button
              type="button"
              onClick={() => setShowFiltersPanel((p) => !p)}
              className={[
                "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold shadow-sm transition",
                activeFilterCount > 0
                  ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700",
              ].join(" ")}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[9px] font-black text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Filter dropdown panel */}
            {showFiltersPanel && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Filtros</span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[10px] font-bold text-[hsl(var(--primary))] hover:underline"
                    >
                      Limpar tudo
                    </button>
                  )}
                </div>

                {hasAiStatusData && (
                  <div className="mb-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status IA</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(AI_STATUS_LABELS).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFilters((f) => ({ ...f, aiStatus: key }))}
                          className={[
                            "rounded-lg border px-2.5 py-1 text-[10px] font-bold transition",
                            filters.aiStatus === key
                              ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-300 hover:text-slate-700",
                          ].join(" ")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasMatchScoreData && (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Match IA mínimo</p>
                    <div className="flex flex-wrap gap-1">
                      {MIN_SCORE_OPTIONS.map((opt) => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setFilters((f) => ({ ...f, minMatchScore: opt.value }))}
                          className={[
                            "rounded-lg border px-2.5 py-1 text-[10px] font-bold transition",
                            filters.minMatchScore === opt.value
                              ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-300 hover:text-slate-700",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!hasAiStatusData && !hasMatchScoreData && (
                  <p className="text-xs text-slate-400">Nenhum filtro disponível para esta vaga ainda.</p>
                )}
              </div>
            )}
          </div>

          {/* Jobs Selector Select */}
          {pipelineJobsError ? (
            <span className="text-xs text-rose-500 font-bold">{pipelineJobsError}</span>
          ) : (
            <div className="relative">
              <select
                id="pipeline-job-select"
                value={activeJobId ?? ""}
                onChange={(e) => handleSelectJob(e.target.value)}
                disabled={pipelineJobsLoading || pipelineJobs.length === 0}
                className="h-10 appearance-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-3.5 pr-8 text-xs font-bold text-slate-600 dark:text-slate-350 shadow-sm outline-none transition focus:border-[hsl(var(--primary))]/40 focus:ring-2 focus:ring-[hsl(var(--primary))]/5 disabled:opacity-50"
              >
                {pipelineJobsLoading ? (
                  <option value="">Carregando vagas…</option>
                ) : pipelineJobs.length === 0 ? (
                  <option value="">Nenhuma vaga publicada</option>
                ) : (
                  pipelineJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))
                )}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          )}

          {/* Main Sourcing Red Button */}
          <button
            type="button"
            onClick={handleOpenSourceCandidates}
            disabled={!canUse}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-black transition-all ${
              canUse
                ? "bg-[hsl(var(--primary))] text-white shadow-[0_4px_12px_rgba(229,57,53,0.2)] hover:bg-[hsl(2,70%,45%)] active:scale-95"
                : "cursor-not-allowed bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-850"
            }`}
          >
            <Plus className="h-4 w-4" />
            Adicionar candidato
          </button>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {hasActiveLocalFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {localSearch.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 pl-2.5 pr-1.5 py-1 text-[11px] font-bold text-[hsl(var(--primary))]">
              <Search className="h-3 w-3" />
              "{localSearch}"
              <button type="button" onClick={() => setLocalSearch("")} className="ml-0.5 rounded hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.aiStatus !== "all" && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 pl-2.5 pr-1.5 py-1 text-[11px] font-bold text-indigo-700">
              IA: {AI_STATUS_LABELS[filters.aiStatus]}
              <button type="button" onClick={() => setFilters((f) => ({ ...f, aiStatus: "all" }))} className="ml-0.5 rounded hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.minMatchScore !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 pl-2.5 pr-1.5 py-1 text-[11px] font-bold text-emerald-700">
              Match ≥ {filters.minMatchScore}%
              <button type="button" onClick={() => setFilters((f) => ({ ...f, minMatchScore: null }))} className="ml-0.5 rounded hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      )}

      {/* ── KPIs Metric Cards Top Bar (using real calculated data) ── */}
      {activeJobId && board && !boardError && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Total de Candidatos
            </p>
            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                {totalCandidatos}
              </span>
              <span className="rounded bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 dark:text-slate-500">
                Inscritos
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Em andamento
            </p>
            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                {emAndamento}
              </span>
              <span className="rounded bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 px-1.5 py-0.5 text-[9px] font-bold text-indigo-500">
                {totalCandidatos > 0 ? `${Math.round((emAndamento / totalCandidatos) * 100)}%` : "0%"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Entrevistas
            </p>
            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                {entrevistas}
              </span>
              <span className="rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                Agendadas
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Contratações
            </p>
            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                {contratacoes}
              </span>
              <span className="rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                Efetivadas
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Filter summary bar ── */}
      {hasActiveLocalFilters && board && !boardError && (
        <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--primary))]/10 bg-[hsl(var(--primary))]/[0.03] px-4 py-2 text-xs">
          <span className="font-bold text-[hsl(var(--primary))]">
            Exibindo {filteredTotalVisible} de {totalCandidatos} candidatos
          </span>
          {filteredTotalVisible === 0 && totalCandidatos > 0 && (
            <span className="text-slate-400">— Nenhum candidato corresponde aos filtros ativos nesta vaga.</span>
          )}
        </div>
      )}

      {/* ── Context Card of the Selected Vaga ── */}
      {selectedJob && (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition-colors hover:border-slate-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-y-2 gap-x-4">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedJob.title}</span>
              </div>
              <div className="h-3 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <StatusPill
                  label={formatJobStatus(selectedJob.status)}
                  tone={jobStatusTone(selectedJob.status)}
                />
              </div>
              {selectedJob.seniority_level && (
                <>
                  <div className="h-3 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    <Award className="h-3.5 w-3.5 text-slate-400" />
                    <span>{formatSeniority(selectedJob.seniority_level)}</span>
                  </div>
                </>
              )}
              {selectedJob.work_model && (
                <>
                  <div className="h-3 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    <Layers className="h-3.5 w-3.5 text-slate-400" />
                    <span>{formatWorkModel(selectedJob.work_model)}</span>
                  </div>
                </>
              )}
              {selectedJob.location && (
                <>
                  <div className="h-3 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span>{selectedJob.location}</span>
                  </div>
                </>
              )}
            </div>

            {/* Ver Ranking IA Action Toggle */}
            <div className="flex items-center gap-3">
              {activeJobId && (
                <button
                  type="button"
                  onClick={() => setShowRanking((current) => !current)}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-bold transition-all ${
                    showRanking
                      ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                  aria-expanded={showRanking}
                >
                  {showRanking ? (
                    <>
                      <PanelRightClose className="h-4 w-4" />
                      <span>Ocultar Ranking</span>
                    </>
                  ) : (
                    <>
                      <PanelRightOpen className="h-4 w-4" />
                      <span>Ver Ranking IA</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {selectedJob && !activeJobAcceptsCandidates && !isDraft && (
            <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-950/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300">
              <span className="text-sm">⚠️</span>
              <p>
                Esta vaga está em status <span className="font-bold">{formatJobStatus(selectedJob.status)}</span>.
                Adicionar novos candidatos só é permitido para vagas publicadas ou pausadas.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Countdown and Auto-Refresh Panel */}
      {activeJobId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 font-semibold">
            <span className={`h-2 w-2 rounded-full ${autoRefreshActive ? "bg-cyan-500 animate-pulse" : "bg-slate-300 dark:bg-slate-700"}`} />
            <span>Última atualização: <strong className="font-mono">{lastUpdated}</strong></span>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-400 dark:text-slate-500">
              Atualização automática em: <strong className="font-mono text-[hsl(var(--primary))]">{autoRefreshActive ? `${secondsLeft}s` : "Pausada"}</strong>
            </span>
            <button
              type="button"
              onClick={() => setAutoRefreshActive((prev) => !prev)}
              className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))] hover:underline"
            >
              {autoRefreshActive ? "Pausar" : "Iniciar"}
            </button>
            <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={boardLoading}
              className="inline-flex items-center gap-1.5 font-bold hover:text-slate-700 dark:hover:text-slate-250 disabled:opacity-50"
            >
              <RefreshCw className={["h-3.5 w-3.5", boardLoading ? "animate-spin" : ""].join(" ")} />
              {boardLoading ? "Sincronizando" : "Sincronizar agora"}
            </button>
          </div>
        </div>
      )}

      {/* ── Empty: no jobs at all ── */}
      {!pipelineJobsLoading && pipelineJobs.length === 0 && !pipelineJobsError && (
        <EmptyState
          icon="🧭"
          title="Nenhuma vaga publicada ainda"
          description="Crie ou publique uma vaga para começar a acompanhar candidatos no pipeline."
        />
      )}

      {/* ── Kanban Board Board ── */}
      {activeJobId ? (
        isDraft ? (
          <EmptyState
            icon="📝"
            title="Publique a vaga para iniciar o pipeline"
            description="Você precisa publicar esta vaga para adicionar candidatos e acompanhá-los no pipeline."
          />
        ) : (
          <div className={boardLayoutClass}>
            
            {/* Main Board Area */}
            <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] min-w-0">
              
              {/* Header inside Board panel */}
              <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">
                    {selectedJob ? selectedJob.title : "Candidatos"}
                  </h2>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                    {hasActiveLocalFilters
                      ? `Kanban • ${filteredTotalVisible} de ${totalCandidatos} candidatos`
                      : `Visão de Quadro Kanban • ${totalActive} Candidatos em processo`}
                  </p>
                </div>

                {/* Filters and Refresh State */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-800 p-1">
                    <button
                      onClick={() => setSortOrder("score_desc")}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${sortOrder === "score_desc" ? "bg-white dark:bg-slate-900 text-[hsl(var(--primary))] shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                    >
                      Top Match IA
                    </button>
                    <button
                      onClick={() => setSortOrder("name_az")}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${sortOrder === "name_az" ? "bg-white dark:bg-slate-900 text-[hsl(var(--primary))] shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                    >
                      Ordem A-Z
                    </button>
                  </div>

                  {isBoardRefreshing && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 animate-pulse">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Sincronizando
                    </span>
                  )}
                </div>
              </div>

              {/* Error messages */}
              {boardError && (
                <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                  <span className="font-semibold">{boardError}</span>
                  <button
                    type="button"
                    onClick={() => void handleManualRefresh()}
                    className="text-xs font-bold underline hover:no-underline"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {/* Initial Loading skeletons */}
              {showInitialBoardLoading && <SkeletonRows rows={5} />}

              {/* Kanban columns scroll — shown when there are visible candidates OR no filters active */}
              {board && !boardError && (hasActiveLocalFilters ? filteredTotalVisible > 0 : true) && (
                <div className="overflow-x-auto pb-4 min-w-0 w-full">
                  <div className="flex min-w-max items-stretch gap-6 min-h-[500px] h-[calc(100vh-360px)] max-h-[85vh]">
                    {mainCols.map((col, idx) => (
                      <KanbanColumn
                        key={col.stage}
                        column={col}
                        colIndex={idx}
                        onCardClick={openCandidate}
                        disabled={!canUse}
                        showTopMatchHighlight={sortOrder === "score_desc"}
                        totalCount={hasActiveLocalFilters ? col.totalCount : undefined}
                        onAddCandidate={activeJobAcceptsCandidates ? () => handleOpenSourceCandidates() : undefined}
                      />
                    ))}

                    {rejectedCol && (
                      <>
                        <div className="mx-1 w-px self-stretch bg-slate-100 dark:bg-slate-800 border-r border-dashed border-slate-200 dark:border-slate-800/80" />
                        <KanbanColumn
                          column={rejectedCol}
                          colIndex={mainCols.length}
                          onCardClick={openCandidate}
                          disabled={!canUse}
                          showTopMatchHighlight={sortOrder === "score_desc"}
                          totalCount={hasActiveLocalFilters ? rejectedCol.totalCount : undefined}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* No results in current job when filter is active */}
              {!showInitialBoardLoading && board && !boardError && hasActiveLocalFilters && filteredTotalVisible === 0 && totalCandidatos > 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                  <span className="text-4xl">🔍</span>
                  <div>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                      Nenhum candidato encontrado nesta vaga.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Nenhum dos {totalCandidatos} candidatos corresponde aos filtros ativos.
                    </p>
                  </div>
                  {localSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => void handleGlobalSearch()}
                      disabled={globalSearchLoading}
                      className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                    >
                      <Globe className="h-4 w-4" />
                      {globalSearchLoading ? "Buscando..." : "Buscar em todas as vagas"}
                    </button>
                  )}
                  <button type="button" onClick={clearFilters} className="text-xs font-bold text-slate-400 hover:text-slate-600 hover:underline">
                    Limpar filtros
                  </button>
                </div>
              )}

              {/* Global search results panel */}
              {globalSearchActive && (
                <div className="mt-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Busca global</p>
                      <h3 className="mt-0.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                        Resultados para "{localSearch}"
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setGlobalSearchActive(false); setGlobalSearchResults([]); }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {globalSearchLoading && <SkeletonRows rows={3} />}

                  {!globalSearchLoading && globalSearchResults.length === 0 && (
                    <div className="py-8 text-center">
                      <p className="text-sm font-bold text-slate-500">Nenhum candidato encontrado.</p>
                      <p className="mt-1 text-xs text-slate-400">Tente um termo diferente.</p>
                    </div>
                  )}

                  {!globalSearchLoading && globalSearchResults.length > 0 && (
                    <div className="space-y-2">
                      {globalSearchResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{result.full_name}</p>
                            {result.email && (
                              <p className="truncate text-[10px] text-slate-400">{result.email}</p>
                            )}
                          </div>
                          <div className="hidden shrink-0 sm:block text-right">
                            {result.active_job_title ? (
                              <>
                                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[160px]">{result.active_job_title}</p>
                                {result.active_job_stage && (
                                  <p className="text-[9px] text-slate-400 uppercase tracking-wider">{result.active_job_stage}</p>
                                )}
                              </>
                            ) : (
                              <p className="text-[10px] text-slate-400">Sem vaga ativa</p>
                            )}
                          </div>
                          {result.active_job_id ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/pipeline/${result.active_job_id}`)}
                              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-700 transition hover:bg-indigo-100"
                            >
                              <Globe className="h-3 w-3" />
                              Abrir pipeline
                            </button>
                          ) : (
                            <span className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-400">Sem vaga</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state: Board empty (no filters, truly empty) */}
              {!showInitialBoardLoading && board && !boardError && totalCandidatos === 0 && !hasActiveLocalFilters && (
                <div className="flex flex-col items-center justify-center gap-4 py-16">
                  <div className="max-w-md rounded-2xl border border-slate-150 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-10 text-center">
                    <span className="text-5xl mb-4 block">🧭</span>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                      Nenhum talento nesta vaga
                    </h3>
                    <p className="mt-2 text-xs font-medium text-slate-400 leading-relaxed">
                      A vaga está pronta para receber perfis! Comece adicionando candidatos para iniciar a triagem e análise com inteligência artificial.
                    </p>
                    <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                      <button
                        onClick={handleOpenSourceCandidates}
                        disabled={!canUse}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-6 py-3 text-xs font-bold transition-all ${
                          canUse
                            ? "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(2,70%,45%)] shadow-sm"
                            : "cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        <UserPlus className="h-4 w-4" />
                        Adicionar Candidatos
                      </button>
                      <button
                        onClick={() => canUse && setShowNewCandidate(true)}
                        disabled={!canUse}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 text-xs font-bold text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-250 disabled:opacity-50"
                      >
                        Criar Manualmente
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* IA Ranking panel side sticky panel */}
            {showRanking && (
              <RankingPanel
                jobTitle={selectedJob?.title ?? "vaga selecionada"}
                job={selectedJob}
                ranking={ranking}
                loading={rankingLoading}
                isRefreshing={isRankingRefreshing}
                error={rankingError}
                onToggle={() => setShowRanking(false)}
                onOpenCandidate={openCandidate}
                onRefresh={
                  activeJobId
                    ? () => {
                        setRankingLoading(true);
                        setRankingError(null);
                        void loadRanking(activeJobId, true)
                          .then((result) => setRanking(result))
                          .catch((err: unknown) => {
                            setRanking(null);
                            setRankingError(
                              formatContextError(
                                err,
                                "Não foi possível carregar o ranking desta vaga.",
                                "Tente atualizar novamente.",
                              ),
                            );
                          })
                          .finally(() => setRankingLoading(false));
                      }
                    : undefined
                }
              />
            )}
          </div>
        )
      ) : null}

      {/* ── Candidate search (sourcing) modal ── */}
      <CandidateSearchModal
        isOpen={showSourceCandidates}
        activeJobId={activeJobId ?? ""}
        activeJobTitle={selectedJob?.title ?? ""}
        ranking={ranking}
        rankingLoading={rankingLoading}
        onClose={() => setShowSourceCandidates(false)}
        onAdded={async () => {
          await refreshBoard();
        }}
        onCreateNew={() => {
          setShowSourceCandidates(false);
          setShowNewCandidate(true);
        }}
        onOpenCandidate={(candidateId) => {
          setShowSourceCandidates(false);
          navigate(`/candidatos?candidateId=${candidateId}`);
        }}
      />

      {/* ── New candidate modal ── */}
      {showNewCandidate && (
        <NewCandidateModal
          isOpen={showNewCandidate}
          defaultJobId={activeJobId}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (id) => {
            setShowNewCandidate(false);
            await openCandidate(id, "documents");
          }}
        />
      )}

      {/* ── Candidate drawer ── */}
      <CandidateDrawer key={selectedCandidateId ?? "none"} />
    </div>
  );
}

// ── IA Ranking Panel local component ──

function RankingPanel({
  jobTitle,
  job,
  ranking,
  loading,
  isRefreshing,
  error,
  onToggle,
  onOpenCandidate,
  onRefresh,
}: {
  jobTitle: string;
  job: PipelineJobSummary | null;
  ranking: JobRanking | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onToggle: () => void;
  onOpenCandidate: (candidateId: string) => Promise<void>;
  onRefresh?: () => void;
}) {
  const showInitialLoading = loading && ranking === null;

  return (
    <aside
      id="pipeline-ranking-panel"
      className="sticky top-6 flex h-[720px] max-h-[85vh] flex-col rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))]">
            Ranking IA Marajó
          </p>
          <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={jobTitle}>{jobTitle}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              title="Atualizar ranking"
            >
              <RefreshCw className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Fechar"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div id="pipeline-ranking-content" className="mt-4 flex-1 overflow-y-auto ui-scrollbar pr-0.5">
        {showInitialLoading && <SkeletonRows rows={3} />}
        {isRefreshing && (
          <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/10 bg-[hsl(var(--primary))]/[0.02] px-3.5 py-2 text-[10px] font-bold text-[hsl(var(--primary))] animate-pulse">
            Recalculando aderência dos candidatos…
          </div>
        )}

        {!showInitialLoading && error && (
          <div className="rounded-xl border border-rose-250 dark:border-rose-950/60 bg-rose-50/50 dark:bg-rose-950/20 p-4 text-xs font-semibold text-rose-800 dark:text-rose-350">
            {error}
          </div>
        )}

        {!showInitialLoading && !error && ranking && ranking.candidates.length === 0 && (
          <div className="py-12 text-center">
            <span className="text-3xl mb-3 block">🏁</span>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Nenhum ranking disponível</p>
            <p className="mt-1 text-[10px] font-medium text-slate-400">Conclua a análise dos candidatos para gerar o ranking.</p>
          </div>
        )}

        {!showInitialLoading && !error && ranking && ranking.candidates.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <span>{ranking.total_candidates} Talentos</span>
              {ranking.score_version && <span>Versão {ranking.score_version}</span>}
            </div>

            {ranking.data_quality_stats && (
              <DataQualityBanner
                filteredCount={ranking.data_quality_stats.filtered_candidates}
                validCount={ranking.data_quality_stats.valid_candidates}
                unknownCount={ranking.data_quality_stats.unknown_candidates}
                totalCount={ranking.data_quality_stats.total_candidates}
              />
            )}

            {ranking.candidates.map((entry) => (
              <RankingCard
                key={`${entry.rank}-${entry.candidate_id}`}
                entry={entry}
                job={job}
                onOpenCandidate={onOpenCandidate}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── IA Ranking Card local component ──

function RankingCard({
  entry,
  job,
  onOpenCandidate,
}: {
  entry: JobRankingEntry;
  job: PipelineJobSummary | null;
  onOpenCandidate: (candidateId: string) => Promise<void>;
}) {
  const dealBreakerReason = entry.reason_tags.find((reason) => isDealBreakerReasonCode(reason)) ?? null;
  const dealBreakerDisplay = dealBreakerReason
    ? buildDealBreakerViolationDisplay({
        reasonCode: dealBreakerReason,
        jobDealBreakers: job?.deal_breakers ?? [],
      })
    : null;
  const hasDealBreakerRejection =
    Boolean(dealBreakerReason) &&
    entry.decision_suggestion === "rejected_suggested" &&
    Math.round(entry.job_fit_score) === 0;
  const reasonPreview = entry.reason_tags
    .filter((reason) => !isDealBreakerReasonCode(reason))
    .slice(0, 3)
    .map((reason) => reason.description)
    .filter(Boolean);
  const freshnessLabel = getRankingFreshnessLabel(entry.ranking_freshness_status);

  return (
    <button
      type="button"
      onClick={() => void onOpenCandidate(entry.candidate_id)}
      className={[
        "w-full rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5",
        hasDealBreakerRejection
          ? "border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 hover:border-rose-350 hover:shadow-sm"
          : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-slate-350 dark:hover:border-slate-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[hsl(var(--primary))]/10 text-[10px] font-black text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/15">
              {entry.rank}
            </span>
            <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{entry.candidate_name}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {freshnessLabel}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            Score
          </p>
          <p className="mt-0.5 text-base font-black tabular-nums text-[hsl(var(--primary))]">
            {Math.round(entry.job_fit_score)}%
          </p>
        </div>
      </div>

      {hasDealBreakerRejection && dealBreakerDisplay && (
        <div className="mt-3 rounded-lg border border-rose-150 dark:border-rose-900 bg-white dark:bg-slate-950 p-2.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">
            Critério Eliminatório
          </p>
          <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">
            {dealBreakerDisplay.fieldLabel}: esperado {dealBreakerDisplay.expected}
          </p>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-400">
             {dealBreakerDisplay.reason}.
          </p>
        </div>
      )}

      {reasonPreview.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {reasonPreview.map((reason) => (
              <span
                key={reason}
                className="inline-flex items-center rounded border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-450"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {entry.ranking_summary_text && (
        <p className="mt-3 line-clamp-2 text-[10.5px] font-medium leading-relaxed text-slate-400">
          {entry.ranking_summary_text}
        </p>
      )}
    </button>
  );
}
