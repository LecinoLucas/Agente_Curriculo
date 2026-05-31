import { PanelRightClose, PanelRightOpen, RefreshCw, Search, Users, Clock, Calendar, CheckCircle2, Plus, BarChart3, Home, MapPin, Sparkles, Inbox, Activity, Filter, ToggleRight, ToggleLeft, AlertTriangle, X, ChevronDown, Briefcase } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { CandidatePreviewDrawer } from "../features/candidates/components/CandidatePreviewDrawer";
import { JobCombobox } from "../features/pipeline/JobCombobox";
import { CandidateSearchModal } from "../features/pipeline/CandidateSearchModal";
import { InterviewQuickScheduleModal } from "../features/pipeline/InterviewQuickScheduleModal";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { PipelineRejectionReasonModal } from "../features/pipeline/PipelineRejectionReasonModal";
import { PipelineTransitionBlockedModal } from "../features/pipeline/PipelineTransitionBlockedModal";
import {
  resolvePreAdmissionNavigationPath,
  usePipelineGateActionResolver,
  usePipelineTransitionBlockedHandler,
} from "../features/pipeline/usePipelineTransitionBlocked";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { DataQualityBanner } from "../components/data-quality/DataQualityBanner";
import { formatContextError } from "../services/errorMessages";
import { feedback } from "../services/feedback";
import { toast } from "../shared/utils/toast";

const MOVE_CANDIDATE_TOAST_KEY = "feedback-move-candidate";
import { getJobRanking } from "../services/jobsService";
import { pipelineService, type PipelineJobSummary } from "../services/pipelineService";
import type { JobCandidate, JobRanking, JobRankingEntry, PipelineBoardFilters, PipelineStage } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
} from "../utils/jobFormatters";
import { isPipelineOperationalJob } from "../utils/jobStatusRules";
import { sortCandidatesByScore } from "../utils/pipelineSort";
import {
  buildDealBreakerViolationDisplay,
  isDealBreakerReasonCode,
} from "../features/pipeline/dealBreakerDisplay";
import { groupCandidatesByMacroColumn } from "../features/pipeline/utils/pipelineKanbanColumns";

const PIPELINE_SHOW_RANKING_STORAGE_KEY = "pipeline:showRanking";
const PIPELINE_LAST_SELECTED_JOB_KEY = "pipeline:lastSelectedJobId";
const INTERVIEW_STAGES = new Set<PipelineStage>(["hr_interview", "technical_interview"]);
const SCHEDULE_TIMEZONE = "America/Sao_Paulo";

function interviewTypeForStage(stage: PipelineStage) {
  return stage === "technical_interview" ? "technical" : "hr";
}

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

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultPipelineDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return {
    entered_from: formatDateInputValue(from),
    entered_to: formatDateInputValue(to),
  };
}

function hasAnyPipelineDateFilter(searchParams: URLSearchParams) {
  return (
    searchParams.has("entered_from") ||
    searchParams.has("entered_to") ||
    searchParams.has("updated_from") ||
    searchParams.has("updated_to")
  );
}

function readPipelineBoardFilters(searchParams: URLSearchParams): PipelineBoardFilters {
  const read = (key: keyof PipelineBoardFilters) => {
    const value = searchParams.get(key);
    return value?.trim() ? value : undefined;
  };

  return {
    entered_from: read("entered_from"),
    entered_to: read("entered_to"),
    updated_from: read("updated_from"),
    updated_to: read("updated_to"),
  };
}

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [showSourceCandidates, setShowSourceCandidates] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showRanking, setShowRanking] = useState(resolveInitialShowRanking);
  const [sortOrder, setSortOrder] = useState<"score_desc" | "score_asc" | "name_az">("score_desc");
  // Local UI-only filters applied on top of the server-side board.
  // Backend pipeline endpoint does not support text search or "pending" filter,
  // so we filter the already-fetched board on the client without re-fetching.
  const [searchTerm, setSearchTerm] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJobSummary[]>([]);
  const [pipelineJobsLoading, setPipelineJobsLoading] = useState(true);
  const [pipelineJobsError, setPipelineJobsError] = useState<string | null>(null);
  const rankingCacheRef = useRef<Map<string, JobRanking>>(new Map());
  const rankingFetchInFlightRef = useRef<Map<string, Promise<JobRanking>>>(new Map());

  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);
  const [draggingCandidate, setDraggingCandidate] = useState<{
    candidateId: string;
    candidateName: string;
    fromStage: PipelineStage;
  } | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<PipelineStage | null>(null);
  const [interviewCandidate, setInterviewCandidate] = useState<{
    candidateId: string;
    candidateName: string;
    targetStage: PipelineStage;
  } | null>(null);
  const [isStageMoveSaving, setIsStageMoveSaving] = useState(false);
  const [rejectionCandidate, setRejectionCandidate] = useState<{
    candidateId: string;
    candidateName: string;
  } | null>(null);
  const [rejectionSubmitting, setRejectionSubmitting] = useState(false);

  const {
    blockedTransition,
    handleBlockedError,
    closeBlocked,
    submitForce,
    forceSubmitting,
    forceError,
  } = usePipelineTransitionBlockedHandler();

  const handleOpenRejectionModal = useCallback(
    (candidateId: string) => {
      const candidateName =
        blockedTransition?.candidateId === candidateId
          ? (blockedTransition.candidateName ?? "")
          : "";
      setRejectionCandidate({ candidateId, candidateName });
    },
    [blockedTransition],
  );

  const resolveBlockedAction = usePipelineGateActionResolver(closeBlocked, handleOpenRejectionModal);

  const {
    activeJobId,
    board,
    boardFilters,
    boardLoading,
    boardError,
    rankingSyncTick,
    setActiveJob,
    setBoardFilters,
    moveCandidateStage,
    refreshBoard,
    openCandidate,
    closeCandidate,
    syncCandidateOverview,
  } = usePipeline();

  const urlBoardFilters = useMemo(
    () => readPipelineBoardFilters(searchParams),
    [searchParams],
  );

  const [lastUpdated, setLastUpdated] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour12: false })
  );

  const activeJobIdRef = useRef(activeJobId);
  const boardLoadingRef = useRef(boardLoading);
  const rankingLoadingRef = useRef(rankingLoading);
  const showRankingRef = useRef(showRanking);
  const kanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const topKanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const previewCandidateIdRef = useRef(previewCandidateId);
  const initialDateRangeResolvedRef = useRef(false);
  const [kanbanScrollWidth, setKanbanScrollWidth] = useState(0);
  const [kanbanHasHorizontalOverflow, setKanbanHasHorizontalOverflow] = useState(false);

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

  useEffect(() => {
    previewCandidateIdRef.current = previewCandidateId;
  }, [previewCandidateId]);

  // Manual refresh function
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

  const updateKanbanScrollMetrics = useCallback(() => {
    const scrollElement = kanbanScrollRef.current;
    if (!scrollElement) {
      setKanbanScrollWidth(0);
      setKanbanHasHorizontalOverflow(false);
      return;
    }

    setKanbanScrollWidth(scrollElement.scrollWidth);
    setKanbanHasHorizontalOverflow(scrollElement.scrollWidth > scrollElement.clientWidth + 1);
    if (topKanbanScrollRef.current) {
      topKanbanScrollRef.current.scrollLeft = scrollElement.scrollLeft;
    }
  }, []);

  const syncTopKanbanScroll = useCallback(() => {
    const topScroll = topKanbanScrollRef.current;
    const kanbanScroll = kanbanScrollRef.current;
    if (!topScroll || !kanbanScroll) return;
    kanbanScroll.scrollLeft = topScroll.scrollLeft;
  }, []);

  const syncMainKanbanScroll = useCallback(() => {
    const topScroll = topKanbanScrollRef.current;
    const kanbanScroll = kanbanScrollRef.current;
    if (!topScroll || !kanbanScroll) return;
    topScroll.scrollLeft = kanbanScroll.scrollLeft;
  }, []);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    if (boardLoading || !activeJobId) return;
    await triggerRefresh();
  };

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
    if (initialDateRangeResolvedRef.current) return;
    initialDateRangeResolvedRef.current = true;
    if (hasAnyPipelineDateFilter(searchParams)) return;
    const defaults = getDefaultPipelineDateRange();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("entered_from", defaults.entered_from);
      next.set("entered_to", defaults.entered_to);
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const current = JSON.stringify(boardFilters);
    const next = JSON.stringify(urlBoardFilters);
    if (current === next) return;
    void setBoardFilters(urlBoardFilters);
  }, [boardFilters, setBoardFilters, urlBoardFilters]);

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

  // Local client-side filter predicate applied on top of the server board.
  // - Search by candidate name (case-insensitive, accent-insensitive)
  // - "Pendências" toggle: keeps cards with at least one expected step pending.
  const candidateMatchesLocalFilters = useCallback(
    (c: JobCandidate): boolean => {
      const term = searchTerm.trim();
      if (term) {
        const normalize = (s: string) =>
          s
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase();
        const name = normalize(c.candidate_name ?? "");
        if (!name.includes(normalize(term))) return false;
      }
      if (onlyPending) {
        const isBehavioralPending =
          Boolean(c.requires_behavioral_assessment) &&
          c.behavioral_assessment_status !== "submitted" &&
          c.behavioral_assessment_status !== "evaluated";
        const isBehavioralAiPending =
          Boolean(c.requires_behavioral_ai_evaluation) &&
          c.behavioral_ai_evaluation_status !== "completed" &&
          c.behavioral_ai_evaluation_status !== "submitted";
        const isInterviewPending =
          Boolean(c.requires_interview) &&
          c.interview_status !== "completed" &&
          c.interview_status !== "submitted";
        const isScorecardPending =
          Boolean(c.requires_scorecard) &&
          c.interview_scorecard_status !== "submitted" &&
          c.interview_scorecard_status !== "completed";
        const hasAnyPending =
          isBehavioralPending ||
          isBehavioralAiPending ||
          isInterviewPending ||
          isScorecardPending;
        if (!hasAnyPending) return false;
      }
      return true;
    },
    [searchTerm, onlyPending],
  );

  const filteredBoardColumns = useMemo(() => {
    if (!board) return [];
    return board.columns.map((col) => ({
      ...col,
      candidates: col.candidates.filter(candidateMatchesLocalFilters),
    }));
  }, [board, candidateMatchesLocalFilters]);

  // Macro grouping is visual only. Each card keeps its real candidate.stage from the API.
  const mainCols = useMemo(
    () =>
      groupCandidatesByMacroColumn(filteredBoardColumns).map((col) => ({
        ...col,
        candidates: sortCandidatesByScore(col.candidates, sortOrder),
      })),
    [filteredBoardColumns, sortOrder],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateKanbanScrollMetrics);
    window.addEventListener("resize", updateKanbanScrollMetrics);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateKanbanScrollMetrics);
    };
  }, [board, mainCols.length, showRanking, updateKanbanScrollMetrics]);

  const totalCandidatos = useMemo(() => {
    if (!board) return 0;
    return board.columns.reduce((sum, col) => sum + col.candidates.length, 0);
  }, [board]);

  const emAndamento = useMemo(() => {
    if (!board) return 0;
    return board.columns
      .filter((col) => col.stage !== "rejected" && col.stage !== "admitted")
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
    return board.columns
      .filter((c) => c.stage === "hired" || c.stage === "pre_admission" || c.stage === "protheus" || c.stage === "admitted")
      .reduce((sum, col) => sum + col.candidates.length, 0);
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
    ? "grid grid-cols-1 gap-4 xl:items-start xl:grid-cols-[minmax(0,1fr)_340px] xl:transition-[grid-template-columns] xl:duration-200"
    : "grid grid-cols-1 gap-4 xl:items-start xl:grid-cols-[minmax(0,1fr)] xl:transition-[grid-template-columns] xl:duration-200";

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleSelectJob(nextJobId: string) {
    window.sessionStorage.setItem(PIPELINE_LAST_SELECTED_JOB_KEY, nextJobId);
    navigate(`/pipeline/${nextJobId}`, { replace: true });
  }

  const handleOpenSourceCandidates = () => {
    if (!canUse || !activeJobId) return;
    if (ranking?.job_id !== activeJobId) {
      setRanking(null);
    }
    setRankingLoading(true);
    setRankingError(null);
    void loadRanking(activeJobId)
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
    setShowSourceCandidates(true);
  };

  const resetDragState = useCallback(() => {
    setDraggingCandidate(null);
    setDropTargetStage(null);
  }, []);

  const handleOpenCandidate = useCallback((candidateId: string) => {
    setPreviewCandidateId(candidateId);
    void openCandidate(candidateId);
  }, [openCandidate]);

  useEffect(() => {
    const autoOpenCandidateId = searchParams.get("candidateId");
    if (autoOpenCandidateId && autoOpenCandidateId !== previewCandidateIdRef.current) {
      const t = setTimeout(() => {
        handleOpenCandidate(autoOpenCandidateId);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [searchParams, handleOpenCandidate]);

  const handleCloseDrawer = useCallback(() => {
    setPreviewCandidateId(null);
    closeCandidate();
    setSearchParams((prev) => {
      if (prev.has("candidateId")) {
        prev.delete("candidateId");
        return prev;
      }
      return prev;
    }, { replace: true });
  }, [closeCandidate, setSearchParams]);

  const handleBoardDateFilterChange = useCallback(
    (key: keyof PipelineBoardFilters, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const handleClearBoardFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("entered_from");
      next.delete("entered_to");
      next.delete("updated_from");
      next.delete("updated_to");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const syncAfterStageMutation = useCallback(async (affectedCandidateId?: string) => {
    try {
      await refreshBoard();
      if (affectedCandidateId && affectedCandidateId === previewCandidateIdRef.current) {
        void syncCandidateOverview(affectedCandidateId);
      }
      setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
    } catch {
      // The board already receives an optimistic update; keep the UI usable.
    }
  }, [refreshBoard, syncCandidateOverview]);

  const moveCandidateOnBoard = useCallback(
    async (candidateId: string, toStage: PipelineStage, candidateName?: string | null) => {
      feedback.moveCandidate.processing();
      setIsStageMoveSaving(true);
      try {
        const moveResult = await moveCandidateStage(candidateId, toStage);
        await syncAfterStageMutation(candidateId);
        const preAdmissionPath = resolvePreAdmissionNavigationPath(moveResult);
        if (preAdmissionPath) {
          navigate(preAdmissionPath);
          return;
        }
        feedback.moveCandidate.success();
      } catch (err: unknown) {
        const handled = handleBlockedError(err, { candidateId, candidateName });
        if (handled) {
          // Dismiss the optimistic-move loading toast. The PipelineContext
          // already restored the card to its original column; force a server
          // refetch to be safe.
          toast.dismissKey(MOVE_CANDIDATE_TOAST_KEY);
          await syncAfterStageMutation(candidateId);
        } else {
          feedback.moveCandidate.error(err);
        }
      } finally {
        setIsStageMoveSaving(false);
      }
    },
    [handleBlockedError, moveCandidateStage, navigate, syncAfterStageMutation],
  );

  const handleCardDragStart = useCallback(
    (candidate: JobCandidate) => {
      if (!canUse || isStageMoveSaving) return;
      setDraggingCandidate({
        candidateId: candidate.candidate_id,
        candidateName: candidate.candidate_name || "Candidato",
        fromStage: candidate.stage,
      });
    },
    [canUse, isStageMoveSaving],
  );

  const handleColumnDragOver = useCallback((stage: PipelineStage) => {
    if (!draggingCandidate || stage === draggingCandidate.fromStage) {
      setDropTargetStage(null);
      return;
    }
    setDropTargetStage(stage);
  }, [draggingCandidate]);

  const handleColumnDragLeave = useCallback((stage: PipelineStage) => {
    setDropTargetStage((current) => (current === stage ? null : current));
  }, []);

  const handleColumnDrop = useCallback(
    async (stage: PipelineStage) => {
      if (!draggingCandidate || !canUse || isStageMoveSaving) {
        resetDragState();
        return;
      }

      if (stage === draggingCandidate.fromStage) {
        resetDragState();
        return;
      }

      if (stage === "rejected") {
        setRejectionCandidate({
          candidateId: draggingCandidate.candidateId,
          candidateName: draggingCandidate.candidateName,
        });
        resetDragState();
        return;
      }

      if (INTERVIEW_STAGES.has(stage)) {
        setInterviewCandidate({
          candidateId: draggingCandidate.candidateId,
          candidateName: draggingCandidate.candidateName,
          targetStage: stage,
        });
        resetDragState();
        return;
      }

      const candidateName = draggingCandidate.candidateName;
      resetDragState();
      await moveCandidateOnBoard(draggingCandidate.candidateId, stage, candidateName);
    },
    [canUse, draggingCandidate, isStageMoveSaving, moveCandidateOnBoard, resetDragState],
  );

  const handleColumnDropVoid = useCallback(
    (stage: PipelineStage) => {
      void handleColumnDrop(stage);
    },
    [handleColumnDrop],
  );

  const handleMoveInterviewWithoutScheduling = useCallback(async () => {
    if (!interviewCandidate) return;
    const pending = interviewCandidate;
    setInterviewCandidate(null);
    await moveCandidateOnBoard(pending.candidateId, pending.targetStage, pending.candidateName);
  }, [interviewCandidate, moveCandidateOnBoard]);

  const handleScheduleInterview = useCallback(
    async (payload: {
      scheduled_start: string;
      scheduled_end: string;
      interview_format: "online" | "presencial" | "telefone";
      location: string | null;
      meeting_url: string | null;
      public_notes: string | null;
    }) => {
      if (!activeJobId || !interviewCandidate) return;

      const affectedId = interviewCandidate.candidateId;
      feedback.moveCandidate.processing();
      setIsStageMoveSaving(true);
      try {
        await pipelineService.schedulePipelineInterview(activeJobId, affectedId, {
          ...payload,
          timezone: SCHEDULE_TIMEZONE,
          title: "Entrevista com candidato",
          interview_type: interviewTypeForStage(interviewCandidate.targetStage),
        });
        setInterviewCandidate(null);
        await syncAfterStageMutation(affectedId);
        feedback.moveCandidate.success();
      } catch (err: unknown) {
        const handled = handleBlockedError(err, {
          candidateId: affectedId,
          candidateName: interviewCandidate.candidateName,
        });
        if (handled) {
          toast.dismissKey(MOVE_CANDIDATE_TOAST_KEY);
          setInterviewCandidate(null);
          await syncAfterStageMutation(affectedId);
        } else {
          feedback.moveCandidate.error(err);
        }
      } finally {
        setIsStageMoveSaving(false);
      }
    },
    [activeJobId, handleBlockedError, interviewCandidate, syncAfterStageMutation],
  );

  const handleCloseInterviewModal = useCallback(() => {
    if (!isStageMoveSaving) {
      setInterviewCandidate(null);
    }
  }, [isStageMoveSaving]);

  const handleOpenBlockedProfile = useCallback(
    (candidateId: string) => {
      navigate(`/candidatos/${candidateId}`);
      closeBlocked();
    },
    [closeBlocked, navigate],
  );

  const handleRejectionConfirm = useCallback(
    async (reason: string) => {
      if (!rejectionCandidate || !activeJobId) return;
      const affectedId = rejectionCandidate.candidateId;
      setRejectionSubmitting(true);
      feedback.moveCandidate.processing();
      try {
        await pipelineService.moveCandidateStage(activeJobId, affectedId, {
          stage: "rejected",
          reason,
        });
        setRejectionCandidate(null);
        await syncAfterStageMutation(affectedId);
        feedback.moveCandidate.success();
      } catch (err: unknown) {
        feedback.moveCandidate.error(err);
      } finally {
        setRejectionSubmitting(false);
      }
    },
    [activeJobId, rejectionCandidate, syncAfterStageMutation],
  );

  const activeFiltersCount =
    (urlBoardFilters.entered_from ? 1 : 0) +
    (urlBoardFilters.entered_to ? 1 : 0) +
    (urlBoardFilters.updated_from ? 1 : 0) +
    (urlBoardFilters.updated_to ? 1 : 0) +
    (searchTerm.trim() ? 1 : 0) +
    (onlyPending ? 1 : 0);
  const hasActiveFilters = activeFiltersCount > 0;
  const hasLocalFilters = Boolean(searchTerm.trim()) || onlyPending;

  // Total visible (after local filters). If the board has cards but local
  // filters removed them all, we show a clear empty-state message.
  const visibleCandidateCount = useMemo(
    () => filteredBoardColumns.reduce((sum, col) => sum + col.candidates.length, 0),
    [filteredBoardColumns],
  );
  const showLocalEmptyState =
    Boolean(board) && hasLocalFilters && visibleCandidateCount === 0 && totalCandidatos > 0;

  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setOnlyPending(false);
    handleClearBoardFilters();
  }, [handleClearBoardFilters]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pipeline-page flex h-full w-full min-w-0 flex-col gap-3 px-1 pb-1 pt-1 text-slate-800 bg-[#F4F7FB] dark:bg-[#09090b] dark:text-slate-100 sm:px-2 sm:pt-2 lg:px-3">
      
      {/* ── Header Area ── */}
      <div className="mb-2 mt-0 flex flex-col gap-3">
        {/* Top Row: Breadcrumb */}
        <nav aria-label="breadcrumb" className="sr-only">
          <span>Recrutamento</span>
          <span className="text-slate-300 dark:text-slate-600">›</span>
          <span className="font-bold text-slate-800 dark:text-slate-100">Pipeline</span>
        </nav>

        {/* Second Row: Title, Combobox, Actions */}
        <div className="relative z-30 flex flex-col gap-3 pr-14 xl:flex-row xl:items-start xl:justify-between">
          <div className="relative z-10 min-w-0 flex-1 rounded-[22px] border border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <h1 className="shrink-0 text-3xl font-black tracking-tight text-[#0f172a] dark:text-white">Pipeline</h1>

              {pipelineJobsError ? (
                <span className="text-xs font-bold text-rose-500">{pipelineJobsError}</span>
              ) : (
                <div className="relative z-20 min-w-[350px] max-w-full flex-1 rounded-[18px] border border-slate-200/80 bg-slate-50/85 px-3 py-2 shadow-inner shadow-white/80 dark:border-slate-800 dark:bg-slate-900">
                  <JobCombobox
                    jobs={pipelineJobs}
                    loading={pipelineJobsLoading}
                    value={activeJobId ?? null}
                    onChange={handleSelectJob}
                  />
                </div>
              )}
            </div>

            {selectedJob && (selectedJob.seniority_level || selectedJob.work_model || selectedJob.location) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {selectedJob.seniority_level && (
                  <div className="flex h-[42px] items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 shadow-sm shadow-slate-200/30">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-400">
                      <Briefcase className="h-3 w-3" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Senioridade</span>
                      <span className="mt-0.5 text-[10.5px] font-bold text-slate-700">{selectedJob.seniority_level}</span>
                    </div>
                  </div>
                )}

                {selectedJob.work_model && (
                  <div className="flex h-[42px] items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 shadow-sm shadow-slate-200/30">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-400">
                      <Home className="h-3 w-3" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Modalidade</span>
                      <span className="mt-0.5 text-[10.5px] font-bold text-slate-700">{formatWorkModel(selectedJob.work_model)}</span>
                    </div>
                  </div>
                )}

                {selectedJob.location && (
                  <div className="flex h-[42px] items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 shadow-sm shadow-slate-200/30">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-400">
                      <MapPin className="h-3 w-3" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Localização</span>
                      <span className="mt-0.5 text-[10.5px] font-bold text-slate-700">{selectedJob.location}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap gap-2 rounded-[18px] border border-slate-200/80 bg-white/95 p-2 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.42)] backdrop-blur sm:flex-nowrap sm:items-center">
            <button
              type="button"
              onClick={handleOpenSourceCandidates}
              disabled={!canUse}
              className={`pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-4 text-xs font-bold transition-all ${
                canUse
                  ? "border-[#5a111e] bg-[#6b1e2e] text-white shadow-sm hover:bg-[#5a111e]"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              Vincular candidato
            </button>
            
            {activeJobId && (
              <button
                type="button"
                onClick={() => setShowRanking((current) => !current)}
                className={`pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 ${showRanking ? "bg-slate-50 text-slate-800" : ""}`}
              >
                <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
                Ver Ranking IA
              </button>
            )}

            {activeJobId && (
              <button
                type="button"
                aria-label="Atualizar board"
                onClick={() => void handleManualRefresh()}
                disabled={boardLoading}
                className="pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${boardLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* ── KPIs (Métricas) ── */}
      {/* 
      {activeJobId && !pipelineJobsLoading && selectedJob && board && !boardError && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 px-1 -mt-1 hidden">
          <span><strong className="text-slate-700 dark:text-slate-300">{totalCandidatos}</strong> candidato{totalCandidatos === 1 ? "" : "s"}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span><strong className="text-slate-700 dark:text-slate-300">{emAndamento}</strong> em andamento</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span><strong className="text-slate-700 dark:text-slate-300">{entrevistas}</strong> entrevista{entrevistas === 1 ? "" : "s"}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span><strong className="text-slate-700 dark:text-slate-300">{contratacoes}</strong> contrataç{contratacoes === 1 ? "ão" : "ões"}</span>
        </div>
      )}
      */}

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
            <div className="min-w-0">
              

                {/* Filters Toolbar */}
                <div className="pipeline-toolbar mb-3 mt-0 flex flex-col gap-2 rounded-[20px] border border-slate-200/80 bg-white/95 px-3 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.38)] backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    
                    {/* Left: Search & Toggles */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Search Bar */}
                      <div className="flex w-full items-center gap-2 rounded-[14px] border border-slate-200 bg-slate-50/80 px-4 py-2 shadow-sm transition-all focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100 dark:border-slate-800 dark:bg-slate-900 sm:w-64">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar candidato..."
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          aria-label="Buscar candidato"
                          data-testid="pipeline-search-input"
                          className="flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                        />
                        {searchTerm && (
                          <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            aria-label="Limpar busca"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            data-testid="pipeline-search-clear"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Melhor match IA */}
                      <button
                        onClick={() => setSortOrder(sortOrder === "score_desc" ? "name_az" : "score_desc")}
                        className={`flex h-10 items-center gap-2 rounded-[14px] border px-4 text-sm font-bold shadow-sm transition-all ${
                          sortOrder === "score_desc"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-200"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                        }`}
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${sortOrder === "score_desc" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                          <CheckCircle2 className="h-3 w-3" />
                        </span>
                        Melhor match IA
                      </button>

                      {/* Pendências */}
                      <button
                        type="button"
                        onClick={() => setOnlyPending((prev) => !prev)}
                        aria-pressed={onlyPending}
                        data-testid="pipeline-pending-toggle"
                        className={`flex h-10 items-center gap-2 rounded-[14px] border px-4 text-sm font-bold shadow-sm transition-all ${
                          onlyPending
                            ? "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-900/50 dark:text-orange-300"
                            : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-400 dark:hover:bg-orange-900/40"
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Pendências
                      </button>
                    </div>

                    {/* Right: Filtros Button */}
                    <div className="flex flex-wrap items-center gap-2">
                      {isBoardRefreshing && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500 animate-pulse dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowFilters((prev) => !prev)}
                        className={`flex h-10 items-center gap-2 rounded-[14px] border px-4 text-sm font-bold shadow-sm transition-all ${
                          showFilters || hasActiveFilters
                            ? "border-indigo-200 bg-indigo-50/50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-400"
                            : "border-slate-200 bg-white text-indigo-600 hover:bg-indigo-50 dark:border-slate-800 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-950/20"
                        }`}
                      >
                        <Filter className="h-4 w-4" />
                        Filtros
                        {activeFiltersCount > 0 && (
                          <span
                            data-testid="pipeline-active-filters-badge"
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              showFilters || hasActiveFilters
                                ? "bg-indigo-100/80 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {activeFiltersCount}
                          </span>
                        )}
                        <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showFilters ? "rotate-180" : ""}`} />
                      </button>

                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          data-testid="pipeline-clear-filters"
                          className="flex h-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-rose-900/50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title="Limpar filtros"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Filters Area */}
                  {showFilters && (
                    <div className="pipeline-filter-panel mt-1 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] border border-slate-200 bg-slate-50/65 p-3 shadow-inner shadow-white/70 dark:border-slate-800 dark:bg-slate-900/50 animate-in slide-in-from-top-2 fade-in duration-200">
                      {/* Period */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Período</span>
                        <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-900">
                          <input
                            type="date"
                            value={urlBoardFilters.entered_from ?? ""}
                            onChange={(event) => handleBoardDateFilterChange("entered_from", event.target.value)}
                            className="w-[110px] bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-200"
                            aria-label="Entrada no processo de"
                          />
                          <span className="text-slate-300 dark:text-slate-600">-</span>
                          <input
                            type="date"
                            value={urlBoardFilters.entered_to ?? ""}
                            onChange={(event) => handleBoardDateFilterChange("entered_to", event.target.value)}
                            className="w-[110px] bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-200"
                            aria-label="Entrada no processo até"
                          />
                        </div>
                      </div>

                      {/* Last activity */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Última atividade</span>
                        <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-sm border border-slate-200 dark:border-slate-700 dark:bg-slate-900">
                          <input
                            type="date"
                            value={urlBoardFilters.updated_to ?? ""}
                            onChange={(event) => handleBoardDateFilterChange("updated_to", event.target.value)}
                            className="w-[110px] bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-200"
                            title="Última atividade até"
                            aria-label="Última atividade até"
                          />
                        </div>
                      </div>

                      {/* Order By */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Ordenar por</span>
                        <select 
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value as any)}
                          className="rounded-lg bg-white py-1.5 pl-2 pr-6 text-sm font-medium text-slate-700 shadow-sm border border-slate-200 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <option value="score_desc">Maior aderência</option>
                          <option value="name_az">A-Z</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

              {selectedJob && !activeJobAcceptsCandidates && !isDraft && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                  Esta vaga está em status <span className="font-bold">{formatJobStatus(selectedJob.status)}</span>.
                  Adicionar novos candidatos só é permitido para vagas publicadas ou pausadas.
                </div>
              )}

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

              {/* Empty state when local filters hide everything */}
              {showLocalEmptyState && (
                <div
                  className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300"
                  data-testid="pipeline-local-empty-state"
                >
                  <span className="font-bold">Nenhum candidato corresponde aos filtros aplicados.</span>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs font-bold underline hover:no-underline"
                  >
                    Limpar filtros
                  </button>
                </div>
              )}

              {/* Kanban columns scroll */}
              {board && !boardError && (
                <>
                {kanbanHasHorizontalOverflow ? (
                  <div
                    ref={topKanbanScrollRef}
                    className="mb-1 h-2 overflow-x-auto overflow-y-hidden rounded-full bg-white/80 opacity-70 shadow-inner shadow-slate-200/70 transition-opacity hover:opacity-100 dark:bg-slate-800"
                    onScroll={syncTopKanbanScroll}
                    data-testid="kanban-top-scroll"
                  >
                    <div style={{ width: kanbanScrollWidth, height: 1 }} />
                  </div>
                ) : null}

                <div
                  ref={kanbanScrollRef}
                  className="pipeline-kanban-scroll -mx-1 w-[calc(100%+0.5rem)] min-w-0 overflow-x-auto overflow-y-hidden px-1 pb-4 pt-1"
                  onScroll={syncMainKanbanScroll}
                  data-testid="kanban-scroll-container"
                >
                  <div className="flex w-full min-w-0 items-stretch gap-2 min-h-[620px] h-[calc(100vh-230px)] max-h-[calc(100vh-180px)] xl:gap-2">
                    {mainCols.map((col, idx) => (
                      <KanbanColumn
                        key={col.macroId}
                        column={col}
                        colIndex={idx}
                        onCardClick={handleOpenCandidate}
                        disabled={!canUse}
                        showTopMatchHighlight={sortOrder === "score_desc"}
                        draggableCards={canUse && !isStageMoveSaving}
                        draggingCandidateId={draggingCandidate?.candidateId ?? null}
                        isDropTarget={col.dropTargetStage !== null && dropTargetStage === (col.dropTargetStage ?? col.stage)}
                        onCardDragStart={handleCardDragStart}
                        onCardDragEnd={resetDragState}
                        onColumnDragOver={handleColumnDragOver}
                        onColumnDragLeave={handleColumnDragLeave}
                        onColumnDrop={handleColumnDropVoid}
                      />
                    ))}
                  </div>
                </div>
                </>
              )}

              {/* Empty state: Board empty */}
              {!showInitialBoardLoading && board && !boardError && totalCandidatos === 0 && (
                <div className="flex flex-col items-center justify-center gap-4 py-12">
                  <div className="pipeline-empty-board max-w-sm rounded-[22px] border border-slate-200/80 bg-white/95 p-8 text-center shadow-[0_18px_42px_-34px_rgba(15,23,42,0.38)] dark:border-slate-800 dark:bg-slate-900/50">
                    <span className="mb-3 block text-3xl">🧭</span>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                      Nenhum talento nesta vaga
                    </h3>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400">
                      Aguardando perfis para iniciar a triagem desta vaga.
                    </p>
                    <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
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
                onOpenCandidate={handleOpenCandidate}
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
        onOpenCandidate={(candidateId, targetUrl) => {
          setShowSourceCandidates(false);
          if (targetUrl) {
            navigate(targetUrl);
            return;
          }
          handleOpenCandidate(candidateId);
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
            navigate(`/candidatos/${id}?tab=documents`);
          }}
        />
      )}

      {interviewCandidate && selectedJob ? (
        <InterviewQuickScheduleModal
          candidateName={interviewCandidate.candidateName}
          jobTitle={selectedJob.title}
          isSaving={isStageMoveSaving}
          onClose={handleCloseInterviewModal}
          onMoveWithoutScheduling={handleMoveInterviewWithoutScheduling}
          onSchedule={handleScheduleInterview}
          onOpenFullAgenda={() => {
            setInterviewCandidate(null);
            navigate("/agenda");
          }}
        />
      ) : null}

      <CandidatePreviewDrawer
        candidateId={previewCandidateId}
        onClose={handleCloseDrawer}
        onPipelineChanged={async () => {
          await triggerRefresh();
        }}
      />

      <PipelineTransitionBlockedModal
        open={blockedTransition !== null}
        candidateId={blockedTransition?.candidateId ?? null}
        candidateName={blockedTransition?.candidateName ?? null}
        blocked={blockedTransition?.response ?? null}
        onClose={closeBlocked}
        onResolveAction={resolveBlockedAction}
        onOpenProfile={handleOpenBlockedProfile}
        forceSubmitting={forceSubmitting}
        forceError={forceError}
        onForceSubmit={async ({ candidateId, targetStage, forceReason }) => {
          if (!activeJobId) return;
          const result = await submitForce({
            candidateId,
            jobId: activeJobId,
            targetStage,
            forceReason,
          });
          if (result) {
            await syncAfterStageMutation(candidateId);
            feedback.moveCandidate.success();
          }
        }}
      />

      <PipelineRejectionReasonModal
        open={rejectionCandidate !== null}
        candidateName={rejectionCandidate?.candidateName}
        submitting={rejectionSubmitting}
        onClose={() => setRejectionCandidate(null)}
        onConfirm={handleRejectionConfirm}
      />
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
  onOpenCandidate: (candidateId: string) => void;
  onRefresh?: () => void;
}) {
  const showInitialLoading = loading && ranking === null;

  return (
    <aside
      id="pipeline-ranking-panel"
      className="pipeline-ranking-panel sticky top-6 flex h-[720px] max-h-[85vh] flex-col rounded-2xl border border-border/40 dark:border-slate-800 bg-surface p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/40 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))]">
            Ranking IA Marajó
          </p>
          <h3 className="mt-1 text-sm font-bold text-text dark:text-slate-100 truncate" title={jobTitle}>{jobTitle}</h3>
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

      <div id="pipeline-ranking-content" className="mt-4 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full pr-0.5">
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
  onOpenCandidate: (candidateId: string) => void;
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
      onClick={() => onOpenCandidate(entry.candidate_id)}
      className={[
        "w-full rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5",
        hasDealBreakerRejection
          ? "border-[hsl(var(--danger-soft))]/60 dark:border-rose-900 bg-danger-soft/20 hover:border-rose-350 hover:shadow-sm"
          : "border-border/40 dark:border-slate-800 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-slate-350 dark:hover:border-slate-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]",
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
