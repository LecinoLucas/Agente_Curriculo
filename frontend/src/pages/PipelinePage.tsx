import { PanelRightClose, PanelRightOpen, RefreshCw, UserPlus, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CandidatePreviewDrawer } from "../features/candidates/components/CandidatePreviewDrawer";
import { JobCombobox } from "../features/pipeline/JobCombobox";
import { CandidateSearchModal } from "../features/pipeline/CandidateSearchModal";
import { InterviewQuickScheduleModal } from "../features/pipeline/InterviewQuickScheduleModal";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { PipelineTransitionBlockedModal } from "../features/pipeline/PipelineTransitionBlockedModal";
import {
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
import type { JobCandidate, JobRanking, JobRankingEntry, PipelineStage } from "../types/domain";
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
  const {
    blockedTransition,
    handleBlockedError,
    closeBlocked,
    submitForce,
    forceSubmitting,
    forceError,
  } = usePipelineTransitionBlockedHandler();
  const resolveBlockedAction = usePipelineGateActionResolver(closeBlocked);

  const {
    activeJobId,
    board,
    boardLoading,
    boardError,
    rankingSyncTick,
    setActiveJob,
    moveCandidateStage,
    refreshBoard,
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
  const triggerRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const kanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const topKanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [kanbanScrollWidth, setKanbanScrollWidth] = useState(0);
  const [kanbanHasHorizontalOverflow, setKanbanHasHorizontalOverflow] = useState(false);

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

  // Reset timer on job selection change
  useEffect(() => {
    if (activeJobId) {
      setSecondsLeft(30);
      setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
    }
  }, [activeJobId]);

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
  triggerRefreshRef.current = triggerRefresh;

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

  // Refresh immediately when the user returns to the pipeline.
  useEffect(() => {
    const handleVisibleRefresh = () => {
      const visible = document.visibilityState === "visible";
      setIsTabVisible(visible);

      if (!visible || !autoRefreshActiveRef.current || !activeJobIdRef.current) return;
      setSecondsLeft(30);
      void triggerRefreshRef.current?.();
    };

    document.addEventListener("visibilitychange", handleVisibleRefresh);
    window.addEventListener("focus", handleVisibleRefresh);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibleRefresh);
      window.removeEventListener("focus", handleVisibleRefresh);
    };
  }, []);

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

  // Sort columns without local filtering; candidate discovery/search lives in CandidateSearchModal.
  const mainCols = useMemo(
    () =>
      (board?.columns ?? [])
        .filter((c) => (MAIN_STAGES as ReadonlyArray<string>).includes(c.stage))
        .map((col) => ({
          ...col,
          candidates: sortCandidatesByScore(col.candidates, sortOrder),
        })),
    [board, sortOrder],
  );

  const rejectedCol = useMemo(() => {
    const col = board?.columns.find((c) => c.stage === "rejected") ?? null;
    if (!col) return null;
    return {
      ...col,
      candidates: sortCandidatesByScore(col.candidates, sortOrder),
    };
  }, [board, sortOrder]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateKanbanScrollMetrics);
    window.addEventListener("resize", updateKanbanScrollMetrics);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateKanbanScrollMetrics);
    };
  }, [board, mainCols.length, rejectedCol?.stage, showRanking, updateKanbanScrollMetrics]);

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

  const selectedJobMeta = useMemo(() => {
    if (!selectedJob) return [];
    return [
      formatJobStatus(selectedJob.status),
      selectedJob.seniority_level ? formatSeniority(selectedJob.seniority_level) : null,
      selectedJob.work_model ? formatWorkModel(selectedJob.work_model) : null,
      selectedJob.location,
      `${totalCandidatos} candidato${totalCandidatos === 1 ? "" : "s"}`,
    ].filter(Boolean);
  }, [selectedJob, totalCandidatos]);

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
    void loadRanking(activeJobId);
    setShowSourceCandidates(true);
  };

  const resetDragState = useCallback(() => {
    setDraggingCandidate(null);
    setDropTargetStage(null);
  }, []);

  const syncAfterStageMutation = useCallback(async () => {
    try {
      await refreshBoard();
      setPreviewRefreshToken((current) => current + 1);
    } catch {
      // The board already receives an optimistic update; keep the UI usable.
    }
    setLastUpdated(new Date().toLocaleTimeString("pt-BR", { hour12: false }));
  }, [refreshBoard]);

  const moveCandidateOnBoard = useCallback(
    async (candidateId: string, toStage: PipelineStage, candidateName?: string | null) => {
      feedback.moveCandidate.processing();
      setIsStageMoveSaving(true);
      try {
        await moveCandidateStage(candidateId, toStage);
        await syncAfterStageMutation();
        feedback.moveCandidate.success();
      } catch (err: unknown) {
        const handled = handleBlockedError(err, { candidateId, candidateName });
        if (handled) {
          // Dismiss the optimistic-move loading toast. The PipelineContext
          // already restored the card to its original column; force a server
          // refetch to be safe.
          toast.dismissKey(MOVE_CANDIDATE_TOAST_KEY);
          await syncAfterStageMutation();
        } else {
          feedback.moveCandidate.error(err);
        }
      } finally {
        setIsStageMoveSaving(false);
      }
    },
    [handleBlockedError, moveCandidateStage, syncAfterStageMutation],
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
      create_google_event?: boolean;
      create_google_meet?: boolean;
    }) => {
      if (!activeJobId || !interviewCandidate) return;

      feedback.moveCandidate.processing();
      setIsStageMoveSaving(true);
      try {
        await pipelineService.schedulePipelineInterview(activeJobId, interviewCandidate.candidateId, {
          ...payload,
          timezone: SCHEDULE_TIMEZONE,
          title: "Entrevista com candidato",
          interview_type: interviewTypeForStage(interviewCandidate.targetStage),
        });
        setInterviewCandidate(null);
        await syncAfterStageMutation();
        feedback.moveCandidate.success();
      } catch (err: unknown) {
        const handled = handleBlockedError(err, {
          candidateId: interviewCandidate.candidateId,
          candidateName: interviewCandidate.candidateName,
        });
        if (handled) {
          toast.dismissKey(MOVE_CANDIDATE_TOAST_KEY);
          setInterviewCandidate(null);
          await syncAfterStageMutation();
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8 text-slate-800 dark:text-slate-100">
      
      {/* ── SaaS Breadcrumb and Header Control Area ── */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Recrutamento</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-[hsl(var(--primary))]">Pipeline</span>
          </nav>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
            Pipeline
          </h1>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            Acompanhe o andamento dos candidatos em cada etapa do processo seletivo.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {/* Jobs Selector Combobox */}
          {pipelineJobsError ? (
            <span className="text-xs text-rose-500 font-bold">{pipelineJobsError}</span>
          ) : (
            <JobCombobox
              jobs={pipelineJobs}
              loading={pipelineJobsLoading}
              value={activeJobId ?? null}
              onChange={handleSelectJob}
            />
          )}

          {/* Action Buttons Group */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {/* Main Sourcing Red Button */}
            <button
              type="button"
              onClick={handleOpenSourceCandidates}
              disabled={!canUse}
              className={`inline-flex w-full sm:w-auto h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-bold transition ${
                canUse
                  ? "border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))] text-white shadow-sm hover:opacity-90 dark:border-[hsl(var(--primary))]/30"
                  : "cursor-not-allowed border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))] dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <Search className="h-4 w-4" />
              Vincular candidato
            </button>
            {activeJobId && (
              <button
                type="button"
                onClick={() => setShowRanking((current) => !current)}
                className={`inline-flex w-full sm:w-auto h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-bold transition ${
                  showRanking
                    ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] shadow-sm hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                }`}
                aria-expanded={showRanking}
              >
                {showRanking ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                {showRanking ? "Ocultar Ranking" : "Ver Ranking IA"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPIs Metric Cards Top Bar (using real calculated data) ── */}
      {activeJobId && board && !boardError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="rounded-xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] px-3 py-2.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Total de Candidatos
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xl font-black tracking-tight text-[hsl(var(--text))]">
                {totalCandidatos}
              </span>
              <span className="rounded bg-[hsl(var(--surface-muted))] dark:bg-slate-800 border border-[hsl(var(--border))]/40 dark:border-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-[hsl(var(--text-muted))]">
                Inscritos
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] px-3 py-2.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Em andamento
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xl font-black tracking-tight text-[hsl(var(--text))]">
                {emAndamento}
              </span>
              <span className="rounded bg-[hsl(var(--accent-soft))] border border-[hsl(var(--accent-soft))]/85 px-1.5 py-0.5 text-[9px] font-bold text-[hsl(var(--accent-foreground))]">
                {totalCandidatos > 0 ? `${Math.round((emAndamento / totalCandidatos) * 100)}%` : "0%"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] px-3 py-2.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Entrevistas
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xl font-black tracking-tight text-[hsl(var(--text))]">
                {entrevistas}
              </span>
              <span className="rounded bg-[hsl(var(--warning-soft))] border border-[hsl(var(--warning-soft))]/85 px-1.5 py-0.5 text-[9px] font-bold text-[hsl(var(--warning))]">
                Agendadas
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] px-3 py-2.5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Contratações
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xl font-black tracking-tight text-[hsl(var(--text))]">
                {contratacoes}
              </span>
              <span className="rounded bg-[hsl(var(--success-soft))] border border-[hsl(var(--success-soft))]/85 px-1.5 py-0.5 text-[9px] font-bold text-[hsl(var(--success))]">
                Efetivadas
              </span>
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
            <div className="min-w-0 rounded-2xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:p-4">
              
              {/* Header inside Board panel */}
              <div className="mb-3 flex flex-col gap-3 border-b border-[hsl(var(--border))]/40 pb-3 dark:border-slate-800 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-black tracking-tight text-[hsl(var(--text))] dark:text-slate-100 truncate">
                    {selectedJob ? selectedJob.title : "Candidatos"}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-[hsl(var(--text-muted))]">
                    <span>{`Kanban · ${totalActive} em processo`}</span>
                    {selectedJobMeta.map((item) => (
                      <span key={String(item)} className="inline-flex items-center gap-2">
                        <span className="text-[hsl(var(--border))]/80">·</span>
                        <span>{item}</span>
                      </span>
                    ))}
                  </div>
                </div>
 
                {/* Filters and Refresh State */}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <div className="flex w-full sm:w-auto items-center gap-1 rounded-xl border border-[hsl(var(--border))]/55 bg-[hsl(var(--surface-muted))] p-1 dark:border-slate-800 dark:bg-slate-950">
                    <button
                      onClick={() => setSortOrder("score_desc")}
                      className={`flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${sortOrder === "score_desc" ? "bg-[hsl(var(--surface))] text-[hsl(var(--primary))] shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-[hsl(var(--border))]/40 dark:border-slate-800" : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))] dark:text-slate-500 dark:hover:text-slate-350"}`}
                    >
                      Top Match IA
                    </button>
                    <button
                      onClick={() => setSortOrder("name_az")}
                      className={`flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${sortOrder === "name_az" ? "bg-[hsl(var(--surface))] text-[hsl(var(--primary))] shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-[hsl(var(--border))]/40 dark:border-slate-800" : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))] dark:text-slate-500 dark:hover:text-slate-350"}`}
                    >
                      Ordem A-Z
                    </button>
                  </div>

                  {activeJobId && (
                    <div className="flex w-full sm:w-auto flex-wrap items-center justify-between sm:justify-start gap-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${autoRefreshActive ? "bg-cyan-500" : "bg-slate-300 dark:bg-slate-700"}`} />
                      <span>Atualizado às <strong className="font-mono font-semibold">{lastUpdated}</strong></span>
                      <span>· Auto em <strong className="font-mono text-[hsl(var(--primary))]">{autoRefreshActive ? `${secondsLeft}s` : "Pausada"}</strong></span>
                      <button
                        type="button"
                        onClick={() => setAutoRefreshActive((prev) => !prev)}
                        className="font-bold text-[hsl(var(--primary))] hover:underline"
                      >
                        {autoRefreshActive ? "Pausar" : "Iniciar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleManualRefresh()}
                        disabled={boardLoading}
                        className="inline-flex items-center gap-1 font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        <RefreshCw className={["h-3.5 w-3.5", boardLoading ? "animate-spin" : ""].join(" ")} />
                        {boardLoading ? "Sincronizando" : "Sincronizar"}
                      </button>
                    </div>
                  )}

                  {isBoardRefreshing && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 animate-pulse">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Sincronizando
                    </span>
                  )}
                </div>
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

              {/* Kanban columns scroll */}
              {board && !boardError && (
                <>
                {kanbanHasHorizontalOverflow ? (
                  <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <span>Rolagem das etapas</span>
                      <span>Arraste a barra para navegar pelas colunas</span>
                    </div>
                    <div
                      ref={topKanbanScrollRef}
                      className="h-4 overflow-x-auto overflow-y-hidden"
                      onScroll={syncTopKanbanScroll}
                      data-testid="kanban-top-scroll"
                    >
                      <div style={{ width: kanbanScrollWidth, height: 1 }} />
                    </div>
                  </div>
                ) : null}

                <div
                  ref={kanbanScrollRef}
                  className="-mx-1 w-[calc(100%+0.5rem)] min-w-0 overflow-x-auto overflow-y-hidden px-1 pb-6 pt-1"
                  onScroll={syncMainKanbanScroll}
                  data-testid="kanban-scroll-container"
                >
                  <div className="flex w-full min-w-max items-stretch gap-3 min-h-[620px] h-[calc(100vh-280px)] max-h-[calc(100vh-220px)] xl:gap-4">
                    {mainCols.map((col, idx) => (
                      <KanbanColumn
                        key={col.stage}
                        column={col}
                        colIndex={idx}
                        onCardClick={setPreviewCandidateId}
                        disabled={!canUse}
                        showTopMatchHighlight={sortOrder === "score_desc"}
                        onAddCandidate={activeJobAcceptsCandidates ? () => handleOpenSourceCandidates() : undefined}
                        draggableCards={canUse && !isStageMoveSaving}
                        draggingCandidateId={draggingCandidate?.candidateId ?? null}
                        isDropTarget={dropTargetStage === col.stage}
                        onCardDragStart={handleCardDragStart}
                        onCardDragEnd={resetDragState}
                        onColumnDragOver={handleColumnDragOver}
                        onColumnDragLeave={handleColumnDragLeave}
                        onColumnDrop={(stage) => void handleColumnDrop(stage)}
                      />
                    ))}

                    {rejectedCol && (
                      <>
                        <div className="mx-0.5 w-px self-stretch border-r border-dashed border-slate-200 bg-slate-100 dark:border-slate-800/80 dark:bg-slate-800" />
                        <KanbanColumn
                          column={rejectedCol}
                          colIndex={mainCols.length}
                          onCardClick={setPreviewCandidateId}
                          disabled={!canUse}
                          showTopMatchHighlight={sortOrder === "score_desc"}
                          draggableCards={canUse && !isStageMoveSaving}
                          draggingCandidateId={draggingCandidate?.candidateId ?? null}
                          isDropTarget={dropTargetStage === rejectedCol.stage}
                          onCardDragStart={handleCardDragStart}
                          onCardDragEnd={resetDragState}
                          onColumnDragOver={handleColumnDragOver}
                          onColumnDragLeave={handleColumnDragLeave}
                          onColumnDrop={(stage) => void handleColumnDrop(stage)}
                        />
                      </>
                    )}
                  </div>
                </div>
                </>
              )}

              {/* Empty state: Board empty */}
              {!showInitialBoardLoading && board && !boardError && totalCandidatos === 0 && (
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
                        Vincular candidatos
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
                onOpenCandidate={setPreviewCandidateId}
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
          setPreviewCandidateId(candidateId);
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
        onClose={() => setPreviewCandidateId(null)}
        refreshToken={previewRefreshToken}
        onPipelineChanged={async () => {
          setSecondsLeft(30);
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
            await syncAfterStageMutation();
            feedback.moveCandidate.success();
          }
        }}
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
      className="sticky top-6 flex h-[720px] max-h-[85vh] flex-col rounded-2xl border border-[hsl(var(--border))]/40 dark:border-slate-800 bg-[hsl(var(--surface))] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))]/40 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))]">
            Ranking IA Marajó
          </p>
          <h3 className="mt-1 text-sm font-bold text-[hsl(var(--text))] dark:text-slate-100 truncate" title={jobTitle}>{jobTitle}</h3>
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
          ? "border-[hsl(var(--danger-soft))]/60 dark:border-rose-900 bg-[hsl(var(--danger-soft))]/20 hover:border-rose-350 hover:shadow-sm"
          : "border-[hsl(var(--border))]/40 dark:border-slate-800 bg-[hsl(var(--surface))] shadow-[0_1px_2px_rgba(0,0,0,0.01)] hover:border-slate-350 dark:hover:border-slate-700 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]",
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
