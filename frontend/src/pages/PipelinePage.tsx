import { RefreshCw, Search, Users, Clock, Calendar, CheckCircle2, Plus, BarChart3, Home, MapPin, Sparkles, Inbox, Activity, Target, Filter, ToggleRight, ToggleLeft, AlertTriangle, X, ChevronDown, Briefcase, Info } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

import { CandidatePreviewDrawer } from "../features/candidates/components/CandidatePreviewDrawer";
import { JobCombobox } from "../features/pipeline/JobCombobox";
import { CandidateSearchModal } from "../features/pipeline/CandidateSearchModal";
import { InterviewQuickScheduleModal } from "../features/pipeline/InterviewQuickScheduleModal";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { PipelineRejectionReasonModal } from "../features/pipeline/PipelineRejectionReasonModal";
import { PipelineTransitionBlockedModal } from "../features/pipeline/PipelineTransitionBlockedModal";
import { PipelineRankingPanel } from "../features/pipeline/components/PipelineRankingPanel";
import { useAuth } from "../features/auth/useAuth";
import {
  resolvePreAdmissionNavigationPath,
  usePipelineGateActionResolver,
  usePipelineTransitionBlockedHandler,
} from "../features/pipeline/usePipelineTransitionBlocked";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { formatContextError } from "../services/errorMessages";
import { feedback } from "../services/feedback";
import { toast } from "../shared/utils/toast";
import { canMutatePipeline } from "../shared/auth/roles";
import { getJobRanking } from "../services/jobsService";
import { pipelineService, type PipelineJobSummary } from "../services/pipelineService";
import type { JobCandidate, JobRanking, PipelineBoardFilters, PipelineStage } from "../types/domain";
import { formatJobStatus, formatWorkModel } from "../utils/jobFormatters";
import { sortCandidatesByScore } from "../utils/pipelineSort";
import { groupCandidatesByMacroColumn } from "../features/pipeline/utils/pipelineKanbanColumns";
import {
  PIPELINE_SHOW_RANKING_STORAGE_KEY,
  PIPELINE_LAST_SELECTED_JOB_KEY,
  INTERVIEW_STAGES,
  SCHEDULE_TIMEZONE,
  interviewTypeForStage,
  canUsePipeline,
  resolveInitialShowRanking,
  getLastSelectedJobId,
  getDefaultPipelineDateRange,
  hasAnyPipelineDateFilter,
  readPipelineBoardFilters,
  loadSavedPipelineFilters,
  savePipelineFilters,
} from "../features/pipeline/pipelinePageUtils";

const MOVE_CANDIDATE_TOAST_KEY = "feedback-move-candidate";

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("header-actions-portal"));
  }, []);
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
    scheduleCandidateInterview,
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

  // Persist current filters whenever they change via URL
  useEffect(() => {
    if (!initialDateRangeResolvedRef.current) return;
    savePipelineFilters(urlBoardFilters);
  }, [urlBoardFilters]);

  useEffect(() => {
    if (initialDateRangeResolvedRef.current) return;
    initialDateRangeResolvedRef.current = true;
    
    // If URL already has any pipeline parameters, respect URL
    if (hasAnyPipelineDateFilter(searchParams)) {
      return;
    }

    // If URL is empty of filters, check saved preference
    const saved = loadSavedPipelineFilters();
    if (saved !== null) {
      if (Object.keys(saved).length > 0) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          if (saved.entered_from) next.set("entered_from", saved.entered_from);
          if (saved.entered_to) next.set("entered_to", saved.entered_to);
          if (saved.updated_from) next.set("updated_from", saved.updated_from);
          if (saved.updated_to) next.set("updated_to", saved.updated_to);
          return next;
        }, { replace: true });
      }
      return;
    }

    // No URL filters and no saved preference: apply defaults
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

  const melhorMatchScore = useMemo(() => {
    if (!board) return 0;
    let maxScore = 0;
    for (const col of board.columns) {
      for (const c of col.candidates) {
        if (c.job_fit_score && c.job_fit_score > maxScore) {
          maxScore = c.job_fit_score;
        }
      }
    }
    return maxScore;
  }, [board]);

  const totalPendencias = useMemo(() => {
    if (!board) return 0;
    let count = 0;
    for (const col of board.columns) {
      for (const c of col.candidates) {
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
        if (
          isBehavioralPending ||
          isBehavioralAiPending ||
          isInterviewPending ||
          isScorecardPending
        ) {
          count++;
        }
      }
    }
    return count;
  }, [board]);

  const isBoardRefreshing = boardLoading && board !== null;
  const showInitialBoardLoading = boardLoading && board === null;
  const isRankingRefreshing = rankingLoading && ranking !== null;

  // Status flags
  const isDraft = selectedJob?.status === "draft";
  const canUseByStatus = canUsePipeline(selectedJob?.status);
  const canMutate = canMutatePipeline(user?.role);
  const canUse = canMutate && canUseByStatus;

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

  const syncAfterStageMutation = useCallback(async (
    affectedCandidateId?: string,
    options: { reloadBoard?: boolean } = {},
  ) => {
    try {
      if (options.reloadBoard || board?.truncated) {
        await refreshBoard();
      }
      if (affectedCandidateId && affectedCandidateId === previewCandidateIdRef.current) {
        void syncCandidateOverview(affectedCandidateId);
      }
      setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
    } catch {
      // The board already receives an optimistic update; keep the UI usable.
    }
  }, [board?.truncated, refreshBoard, syncCandidateOverview]);

  const moveCandidateOnBoard = useCallback(
    async (candidateId: string, toStage: PipelineStage, candidateName?: string | null) => {
      if (!canUse) return;
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
          await syncAfterStageMutation(candidateId, { reloadBoard: true });
        } else {
          await syncAfterStageMutation(candidateId, { reloadBoard: true });
          feedback.moveCandidate.error(err);
        }
      } finally {
        setIsStageMoveSaving(false);
      }
    },
    [canUse, handleBlockedError, moveCandidateStage, navigate, syncAfterStageMutation],
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
      if (!canUse || !activeJobId || !interviewCandidate) return;

      const affectedId = interviewCandidate.candidateId;
      feedback.moveCandidate.processing();
      setIsStageMoveSaving(true);
      try {
        await scheduleCandidateInterview(affectedId, interviewCandidate.targetStage, {
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
          await syncAfterStageMutation(affectedId, { reloadBoard: true });
        } else {
          feedback.moveCandidate.error(err);
        }
      } finally {
        setIsStageMoveSaving(false);
      }
    },
    [activeJobId, canUse, handleBlockedError, interviewCandidate, syncAfterStageMutation],
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
      if (!canUse || !rejectionCandidate || !activeJobId) return;
      const affectedId = rejectionCandidate.candidateId;
      setRejectionSubmitting(true);
      feedback.moveCandidate.processing();
      try {
        await pipelineService.moveCandidateStage(activeJobId, affectedId, {
          stage: "rejected",
          reason,
        });
        setRejectionCandidate(null);
        await syncAfterStageMutation(affectedId, { reloadBoard: true });
        feedback.moveCandidate.success();
      } catch (err: unknown) {
        feedback.moveCandidate.error(err);
      } finally {
        setRejectionSubmitting(false);
      }
    },
    [activeJobId, canUse, rejectionCandidate, syncAfterStageMutation],
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
    <div className="pipeline-page flex flex-1 h-full w-full min-h-0 min-w-0 flex-col gap-2 px-1 pb-1 pt-4 text-slate-800 bg-[#F4F7FB] dark:bg-background dark:text-text sm:px-2 sm:pt-4 lg:px-3">
      
      {/* ── Header Area ── */}
      <div className="mb-2 mt-0 flex flex-col gap-2">
        {/* Top Row: Breadcrumb */}
        <nav aria-label="breadcrumb" className="sr-only">
          <span>Recrutamento</span>
          <span className="text-slate-300 dark:text-text-muted">›</span>
          <span className="font-bold text-slate-800 dark:text-text">Pipeline</span>
        </nav>
        {/* sr-only heading for accessibility and tests */}
        <h1 className="sr-only">Pipeline</h1>

        {/* Two-Column Grid: Vacancy details + Marajó RH IA Co-pilot */}
        <div className="relative z-30 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_1fr] xl:grid-cols-[minmax(0,1.4fr)_1fr] mb-2 pr-14">
          
          {/* Column 1: Vacancy Card */}
          <div className="relative z-10 flex flex-col justify-between rounded-[22px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.015)] backdrop-blur dark:border-border dark:bg-surface dark:shadow-none min-h-[135px]">
            <div className="flex flex-col lg:flex-row lg:items-center">
              {/* Job Combobox */}
              {pipelineJobsError ? (
                <span className="text-xs font-bold text-rose-500">{pipelineJobsError}</span>
              ) : (
                <div className="relative z-20 flex-1 min-w-0">
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
              <>
                <div className="my-3 border-t border-dashed border-slate-200 dark:border-border/60" />
                <div className="flex flex-wrap items-center gap-y-2 gap-x-8">
                  {selectedJob.seniority_level && (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-slate-400 dark:border-border dark:bg-surface dark:text-text-muted">
                        <Users className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-text-muted leading-none">Senioridade</span>
                        <span className="text-[11px] font-bold text-slate-700 dark:text-text mt-1 leading-none">{selectedJob.seniority_level}</span>
                      </div>
                    </div>
                  )}

                  {selectedJob.work_model && (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-slate-400 dark:border-border dark:bg-surface dark:text-text-muted">
                        <Home className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-text-muted leading-none">Modalidade</span>
                        <span className="text-[11px] font-bold text-slate-700 dark:text-text mt-1 leading-none">{formatWorkModel(selectedJob.work_model)}</span>
                      </div>
                    </div>
                  )}

                  {selectedJob.location && (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-slate-400 dark:border-border dark:bg-surface dark:text-text-muted">
                        <MapPin className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-text-muted leading-none">Localização</span>
                        <span className="text-[11px] font-bold text-slate-700 dark:text-text mt-1 leading-none">{selectedJob.location}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Column 2: Co-pilot Info Card */}
          <div className="relative z-10 flex justify-between items-center rounded-[22px] border border-slate-200/60 bg-gradient-to-br from-[#E6F3FF]/45 via-[#E6FDF9]/45 to-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.01)] dark:border-border dark:bg-surface dark:shadow-none overflow-hidden min-h-[135px]">
            <div className="flex flex-col justify-center max-w-[65%] z-10">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="h-4.5 w-4.5 text-teal-500 animate-pulse" />
                <h2 className="text-[15px] font-black tracking-tight text-slate-800 dark:text-slate-100">
                  Marajó <span className="text-[#14B8A6]">RH IA</span>
                </h2>
              </div>
              <p className="text-xs font-bold text-slate-600 dark:text-text-muted mb-1 leading-snug">
                Seu copiloto de recrutamento inteligente
              </p>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-text-muted leading-snug">
                Dados, IA e pessoas trabalhando juntas
              </p>
            </div>
            
            {/* 3D Glass Sphere asset */}
            <div className="absolute right-0 top-0 bottom-0 w-[42%] flex items-center justify-end z-0">
              <img
                src="/images/copilot_glass_sphere.png"
                alt="Copilot 3D sphere"
                className="h-full object-contain pointer-events-none scale-[1.08] translate-x-2"
              />
            </div>
          </div>

        </div>

        {/* Action Controls hidden on desktop since portal renders them */}
        <div className={`flex flex-wrap gap-2 rounded-[18px] border border-slate-200/80 bg-white/95 p-1.5 shadow-sm backdrop-blur dark:border-border dark:bg-surface dark:shadow-none sm:flex-nowrap sm:items-center ${portalTarget ? "lg:hidden" : ""}`}>
          {canMutate && (
            <button
              type="button"
              onClick={handleOpenSourceCandidates}
              disabled={!canUse}
              className={`pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold transition-all shadow-sm ${
                canUse
                  ? "bg-[#7B1829] text-white hover:bg-[#60121E]"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-border dark:bg-surface-muted dark:text-text-muted"
              }`}
            >
              <Plus className="h-4 w-4" />
              Vincular candidato
            </button>
          )}
          
          {activeJobId && (
            <button
              type="button"
              onClick={() => setShowRanking((current) => !current)}
              className={`pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 dark:border-border dark:bg-surface dark:text-text-muted dark:shadow-none dark:hover:bg-surface-muted ${showRanking ? "bg-slate-50 text-slate-800 dark:bg-surface-muted dark:text-text" : ""}`}
            >
              <BarChart3 className="h-4 w-4 text-slate-400 dark:text-text-muted" />
              Ver Ranking IA
            </button>
          )}

          {activeJobId && (
            <button
              type="button"
              aria-label="Atualizar board"
              onClick={() => void handleManualRefresh()}
              disabled={boardLoading}
              className="pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-border dark:bg-surface dark:text-text-muted dark:shadow-none dark:hover:bg-surface-muted"
            >
              <RefreshCw className={`h-4 w-4 text-slate-400 dark:text-text-muted ${boardLoading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          )}
        </div>

        {portalTarget && createPortal(
          <>
            {canMutate && (
              <button
                type="button"
                onClick={handleOpenSourceCandidates}
                disabled={!canUse}
                className={`pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold transition-all shadow-sm ${
                  canUse
                    ? "bg-[#7B1829] text-white hover:bg-[#60121E]"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-border dark:bg-surface-muted dark:text-text-muted"
                }`}
              >
                <Plus className="h-4 w-4" />
                Vincular candidato
              </button>
            )}
            
            {activeJobId && (
              <button
                type="button"
                onClick={() => setShowRanking((current) => !current)}
                className={`pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 dark:border-border dark:bg-surface dark:text-text-muted dark:shadow-none dark:hover:bg-surface-muted ${showRanking ? "bg-slate-50 text-slate-800 dark:bg-surface-muted dark:text-text" : ""}`}
              >
                <BarChart3 className="h-4 w-4 text-slate-400 dark:text-text-muted" />
                Ver Ranking IA
              </button>
            )}

            {activeJobId && (
              <button
                type="button"
                aria-label="Atualizar board"
                onClick={() => void handleManualRefresh()}
                disabled={boardLoading}
                className="pipeline-action-button inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-border dark:bg-surface dark:text-text-muted dark:shadow-none dark:hover:bg-surface-muted"
              >
                <RefreshCw className={`h-4 w-4 text-slate-400 dark:text-text-muted ${boardLoading ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            )}
          </>,
          portalTarget
        )}
      </div>
      
      {/* ── KPIs (Métricas) ── */}
      {activeJobId && !pipelineJobsLoading && selectedJob && board && !boardError && (
        <div className="mb-3 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.01)] dark:divide-slate-800 dark:border-border dark:bg-surface">
          {/* Segment 1: Total de candidatos */}
          <div className="flex items-center gap-3.5 pb-3 md:pb-0 md:pr-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black text-slate-800 dark:text-text leading-none">{totalCandidatos}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-text-muted leading-none">Total de candidatos</span>
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-slate-350 cursor-pointer shrink-0 hover:text-slate-500" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-white text-slate-700 border border-slate-200 shadow-md dark:bg-popover dark:border-border dark:text-popover-foreground text-xs p-2 rounded-lg z-[100]">
                      Total de currículos vinculados a este processo seletivo
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-text-muted mt-1 leading-none">Candidatos na pipeline</span>
            </div>
          </div>

          {/* Segment 2: Melhor match IA */}
          <div className="flex items-center gap-3.5 py-3 md:py-0 md:px-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#14B8A6] dark:bg-teal-950/30 dark:text-teal-400">
              <Target className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black text-slate-800 dark:text-text leading-none">{melhorMatchScore}%</span>
                <span className="text-xs font-bold text-slate-500 dark:text-text-muted leading-none">Melhor match IA</span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-text-muted mt-1 leading-none">Pontuação máxima</span>
            </div>
          </div>

          {/* Segment 3: Pendências */}
          <div className="flex items-center gap-3.5 pt-3 md:pt-0 md:pl-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-950/30 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black text-slate-800 dark:text-text leading-none">{totalPendencias}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-text-muted leading-none">Pendências</span>
              </div>
              <span className="text-[10px] font-semibold text-slate-405 dark:text-text-muted mt-1 leading-none">Itens que precisam de atenção</span>
            </div>
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
            <div className="min-w-0">
              

                {/* Filters Toolbar */}
                <div className="pipeline-toolbar mb-3 mt-0 flex flex-col gap-2 rounded-[20px] border border-slate-200/80 bg-white/95 px-3 py-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.38)] backdrop-blur dark:border-border dark:bg-surface dark:shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    
                    {/* Left: Search & Toggles */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Search Bar */}
                      <div className="flex w-full items-center gap-2 rounded-[14px] border border-slate-200 bg-slate-50/80 px-4 py-2 shadow-sm transition-all focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100 dark:border-border dark:bg-surface-muted dark:shadow-none dark:focus-within:bg-surface dark:focus-within:ring-emerald-900/30 sm:w-64">
                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar candidato..."
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          aria-label="Buscar candidato"
                          data-testid="pipeline-search-input"
                          className="flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 dark:text-text"
                        />
                        {searchTerm && (
                          <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            aria-label="Limpar busca"
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-surface-muted"
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
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/45 dark:bg-emerald-950/24 dark:text-emerald-200"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-border dark:bg-surface dark:text-text-muted"
                        }`}
                      >
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${sortOrder === "score_desc" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/45 dark:text-emerald-200" : "bg-slate-100 text-slate-400 dark:bg-surface-muted"}`}>
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
                            ? "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900/55 dark:bg-orange-950/26 dark:text-orange-200"
                            : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-950/45 dark:bg-transparent dark:text-orange-300 dark:hover:bg-orange-950/18"
                        }`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Pendências
                      </button>
                    </div>

                    {/* Right: Filtros Button */}
                    <div className="flex flex-wrap items-center gap-2">
                      {isBoardRefreshing && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500 animate-pulse dark:border-border dark:bg-surface-muted dark:text-text-muted">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowFilters((prev) => !prev)}
                        className={`flex h-10 items-center gap-2 rounded-[14px] border px-4 text-sm font-bold shadow-sm transition-all ${
                          showFilters || hasActiveFilters
                            ? "border-indigo-200 bg-indigo-50/50 text-indigo-700 dark:border-indigo-950/55 dark:bg-indigo-950/22 dark:text-indigo-200"
                            : "border-slate-200 bg-white text-indigo-600 hover:bg-indigo-50 dark:border-border dark:bg-surface dark:text-indigo-400 dark:hover:bg-indigo-950/20"
                        }`}
                      >
                        <Filter className="h-4 w-4" />
                        Filtros
                        {activeFiltersCount > 0 && (
                          <span
                            data-testid="pipeline-active-filters-badge"
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              showFilters || hasActiveFilters
                                ? "bg-indigo-100/80 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
                                : "bg-slate-100 text-slate-500 dark:bg-surface-muted dark:text-text-muted"
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
                          className="flex h-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 dark:border-border dark:bg-surface dark:hover:border-rose-900/50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title="Limpar filtros"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Filters Area */}
                  {showFilters && (
                    <div className="pipeline-filter-panel mt-1 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[18px] border border-slate-200 bg-slate-50/65 p-3 shadow-inner shadow-white/70 dark:border-border dark:bg-surface-muted/50 animate-in slide-in-from-top-2 fade-in duration-200">
                      {/* Period */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-text-muted">Período</span>
                        <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-sm border border-slate-200 dark:border-border dark:bg-surface">
                          <input
                            type="date"
                            value={urlBoardFilters.entered_from ?? ""}
                            onChange={(event) => handleBoardDateFilterChange("entered_from", event.target.value)}
                            className="w-[110px] bg-transparent text-sm text-slate-700 focus:outline-none dark:text-text"
                            aria-label="Entrada no processo de"
                          />
                          <span className="text-slate-300 dark:text-text-muted">-</span>
                          <input
                            type="date"
                            value={urlBoardFilters.entered_to ?? ""}
                            onChange={(event) => handleBoardDateFilterChange("entered_to", event.target.value)}
                            className="w-[110px] bg-transparent text-sm text-slate-700 focus:outline-none dark:text-text"
                            aria-label="Entrada no processo até"
                          />
                        </div>
                      </div>

                      {/* Last activity */}
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-600 dark:text-text-muted">Última atividade</span>
                        <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 shadow-sm border border-slate-200 dark:border-border dark:bg-surface">
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
                  className="pipeline-kanban-scroll -mx-1 w-[calc(100%+0.5rem)] min-w-0 flex-1 flex flex-col overflow-x-auto overflow-y-hidden px-1 pb-4 pt-1"
                  onScroll={syncMainKanbanScroll}
                  data-testid="kanban-scroll-container"
                >
                  <div className="flex flex-1 w-full min-w-0 items-stretch gap-2 min-h-[620px] xl:gap-2">
                    {mainCols.map((col, idx) => (
                      <KanbanColumn
                        key={col.macroId}
                        column={col}
                        colIndex={idx}
                        onCardClick={handleOpenCandidate}
                        disabled={!canUseByStatus}
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
                    {canMutate && (
                      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                        <button
                          onClick={() => canUse && setShowNewCandidate(true)}
                          disabled={!canUse}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 text-xs font-bold text-slate-500 dark:text-slate-400 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-250 disabled:opacity-50"
                        >
                          Criar Manualmente
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* IA Ranking panel side sticky panel */}
            {showRanking && (
              <PipelineRankingPanel
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
          if (previewCandidateIdRef.current) {
            await syncCandidateOverview(previewCandidateIdRef.current);
          }
          setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
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
          if (!canUse || !activeJobId) return;
          const result = await submitForce({
            candidateId,
            jobId: activeJobId,
            targetStage,
            forceReason,
          });
          if (result) {
            await syncAfterStageMutation(candidateId, { reloadBoard: true });
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
