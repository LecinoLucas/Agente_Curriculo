import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { analysisService, matchToJob } from "../../services/analysisService";
import { candidatesService } from "../../services/candidatesService";
import { formatErrorDetails, handleApiError } from "../../shared/utils/errorHandler";
import { getJobPipeline, listJobs } from "../../services/jobsService";
import { pipelineService } from "../../services/pipelineService";
import { moveBoardCandidate, updateBoardCandidate } from "./pipelineBoardState";
import {
  AIAnalysisStatus,
  AnalysisStatus,
  CandidateOverview,
  Job,
  JobCandidate,
  JobPipelineBoard,
  PipelineStage,
} from "../../types/domain";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PanelTab = "summary" | "score" | "analysis" | "documents" | "history" | "actions";

interface PipelineState {
  // Jobs catalog — loaded lazily by candidate-centric flows that need the full job payload
  jobs: Job[];
  jobsLoading: boolean;
  jobsError: string | null;

  // Active job and its kanban board
  activeJobId: string | null;
  board: JobPipelineBoard | null;
  boardLoading: boolean;
  boardError: string | null;

  // Candidate detail panel
  selectedCandidateId: string | null;
  candidateOverview: CandidateOverview | null;
  candidateLoading: boolean;
  candidateError: string | null;
  activePanelTab: PanelTab;

  // Centralized analysis polling — at most one in-flight at a time
  pollingAnalysisId: string | null;
  pollingStatus: AnalysisStatus | null;

  // Local invalidation counters for screens with their own fetch state
  candidatesSyncTick: number;
  analysesSyncTick: number;
  rankingSyncTick: number;
}

export interface PipelineContextValue extends PipelineState {
  // Jobs
  loadJobs: (force?: boolean) => Promise<void>;
  invalidateJobs: (reload?: boolean) => Promise<void>;

  // Board
  setActiveJob: (jobId: string) => void;
  refreshBoard: () => Promise<void>;
  invalidateBoard: (jobId?: string | null, reload?: boolean) => Promise<void>;

  // Candidate panel
  openCandidate: (candidateId: string, initialTab?: PanelTab) => Promise<void>;
  closeCandidate: () => void;
  switchPanelTab: (tab: PanelTab) => void;
  refreshCandidateOverview: () => Promise<void>;
  syncCandidateOverview: (candidateId: string) => Promise<void>;
  invalidateCandidateOverview: (candidateId?: string | null, reload?: boolean) => Promise<void>;
  invalidateCandidate: (
    candidateId: string,
    options?: {
      reloadOverview?: boolean;
      reloadBoard?: boolean;
      jobId?: string | null;
      notify?: boolean;
    },
  ) => Promise<void>;
  patchCandidate: (
    candidateId: string,
    payload: Partial<CandidateOverview["candidate"]>,
  ) => void;

  // Kanban drag
  moveCandidateStage: (candidateId: string, toStage: PipelineStage) => Promise<void>;
  setCandidateAiStatus: (candidateId: string, status: AIAnalysisStatus | null) => void;
  syncAnalysisStart: (input: {
    candidateId: string;
    analysisId: string;
    status?: AIAnalysisStatus | null;
    jobId?: string | null;
    resumeId?: string | null;
    resumeTitle?: string | null;
  }) => Promise<void>;
  ensureAnalysisMatch: (input: {
    analysisId: string;
    candidateId: string;
    jobId: string;
  }) => Promise<void>;
  notifyCandidatesChanged: () => void;
  notifyAnalysesChanged: () => void;
  invalidateJobState: (jobId?: string | null) => Promise<void>;
  invalidateRanking: () => void;

  // Polling
  startPolling: (
    analysisId: string,
    candidateId?: string | null,
    initialStatus?: AnalysisStatus["status"] | null,
    jobId?: string | null,
  ) => void;
  stopPolling: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const INITIAL_STATE: PipelineState = {
  jobs: [],
  jobsLoading: false,
  jobsError: null,
  activeJobId: null,
  board: null,
  boardLoading: false,
  boardError: null,
  selectedCandidateId: null,
  candidateOverview: null,
  candidateLoading: false,
  candidateError: null,
  activePanelTab: "summary",
  pollingAnalysisId: null,
  pollingStatus: null,
  candidatesSyncTick: 0,
  analysesSyncTick: 0,
  rankingSyncTick: 0,
};

const PIPELINE_STAGE_STATUS_LABEL: Record<PipelineStage, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

// Backoff: 1.5s → 5s (after 5 identical statuses) → 15s (after 10)
function pollingDelay(staleCount: number): number {
  if (staleCount < 5) return 1500;
  if (staleCount < 10) return 5000;
  return 15000;
}

function toFriendlyText(error: unknown, defaultMessage: string): string {
  const detail = formatErrorDetails(handleApiError(error)).join(" ");
  return detail || defaultMessage;
}

// ── Context ────────────────────────────────────────────────────────────────────

const PipelineContext = createContext<PipelineContextValue | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────────────────

export function PipelineProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);

  // ── Refs: stable access to mutable values without stale closures ─────────────
  //
  // Why refs instead of reading from state inside callbacks?
  // useCallback with [] deps creates a function once. If that function reads
  // state directly, it captures the initial value forever (stale closure).
  // Refs are mutable containers — always reflect the latest value without
  // requiring the callback to be recreated on every render.

  const activeJobIdRef = useRef<string | null>(null);
  const selectedCandidateIdRef = useRef<string | null>(null);

  const boardCacheRef = useRef<Map<string, JobPipelineBoard>>(new Map());
  const boardFetchInFlightRef = useRef<Map<string, Promise<JobPipelineBoard>>>(new Map());

  // Candidate overview cache: serves repeated openCandidate() calls instantly.
  // Invalidated on: closeCandidate, moveCandidateStage, refreshCandidateOverview.
  const candidateCacheRef = useRef<Map<string, CandidateOverview>>(new Map());
  const candidateFetchInFlightRef = useRef<Map<string, Promise<CandidateOverview>>>(new Map());

  // Fetch deduplication for loadJobs — prevents concurrent or duplicate calls.
  const jobsFetchInFlightRef = useRef<Promise<void> | null>(null);
  const jobsLoadedRef = useRef(false);

  // Polling state — all mutable, never need to trigger renders directly.
  const pollingTimerRef = useRef<number | null>(null);
  const pollingAnalysisIdRef = useRef<string | null>(null);
  const pollingCandidateIdRef = useRef<string | null>(null);
  const pollingJobIdRef = useRef<string | null>(null);
  const pollingPrevStatusRef = useRef<string | null>(null);
  const pollingStaleCountRef = useRef(0);
  const isPageVisibleRef = useRef(true);
  const matchingAttemptRef = useRef<Map<string, { status: "in_flight" | "completed" | "failed"; error?: string }>>(
    new Map(),
  );

  const notifyCandidatesChanged = useCallback(() => {
    setState((prev) => ({ ...prev, candidatesSyncTick: prev.candidatesSyncTick + 1 }));
  }, []);

  const notifyAnalysesChanged = useCallback(() => {
    setState((prev) => ({ ...prev, analysesSyncTick: prev.analysesSyncTick + 1 }));
  }, []);

  const invalidateRanking = useCallback(() => {
    setState((prev) => ({ ...prev, rankingSyncTick: prev.rankingSyncTick + 1 }));
  }, []);

  // ── Jobs ───────────────────────────────────────────────────────────────────

  // Guard: concurrent or redundant calls are no-ops.
  // jobsFetchInFlightRef prevents a second call while one is in flight.
  // jobsLoadedRef prevents re-fetching after a successful load.
  // Both checks are synchronous so no race condition between them and setState.
  const loadJobs = useCallback(async (force = false) => {
    if (!force && jobsLoadedRef.current) return;
    if (jobsFetchInFlightRef.current) {
      await jobsFetchInFlightRef.current;
      return;
    }

    setState((prev) => ({ ...prev, jobsLoading: true, jobsError: null }));

    const request = (async () => {
      try {
        const result = await listJobs(1, 100);
        jobsLoadedRef.current = true;
        const activeJobStillExists = activeJobIdRef.current
          ? result.data.some((job) => job.id === activeJobIdRef.current)
          : false;

        if (activeJobIdRef.current && !activeJobStillExists) {
          activeJobIdRef.current = null;
        }

        setState((prev) => ({
          ...prev,
          jobs: result.data,
          jobsLoading: false,
          activeJobId: activeJobStillExists ? prev.activeJobId : null,
          board: activeJobStillExists ? prev.board : null,
          boardError: activeJobStillExists ? prev.boardError : null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          jobsLoading: false,
          jobsError: toFriendlyText(err, "Falha ao carregar vagas"),
        }));
      } finally {
        jobsFetchInFlightRef.current = null;
      }
    })();

    jobsFetchInFlightRef.current = request;
    await request;
  }, []); // stable — reads only refs and calls setState (both stable)

  // ── Board ──────────────────────────────────────────────────────────────────

  const fetchBoard = useCallback(async (jobId: string, force = false): Promise<JobPipelineBoard> => {
    if (!force) {
      const cached = boardCacheRef.current.get(jobId);
      if (cached) return cached;
    }

    const inFlight = boardFetchInFlightRef.current.get(jobId);
    if (inFlight) return inFlight;

    const request = getJobPipeline(jobId)
      .then((board) => {
        boardCacheRef.current.set(jobId, board);
        return board;
      })
      .finally(() => {
        boardFetchInFlightRef.current.delete(jobId);
      });

    boardFetchInFlightRef.current.set(jobId, request);
    return request;
  }, []);

  const loadBoard = useCallback(async (jobId: string, force = false) => {
    setState((prev) => ({ ...prev, boardLoading: true, boardError: null }));

    if (!force) {
      const cached = boardCacheRef.current.get(jobId);
      if (cached) {
        setState((prev) =>
          prev.activeJobId === jobId
            ? { ...prev, board: cached, boardLoading: false, boardError: null }
            : prev,
        );
        return;
      }
    }

    try {
      const board = await fetchBoard(jobId, force);
      setState((prev) =>
        prev.activeJobId === jobId
          ? { ...prev, board, boardLoading: false, boardError: null }
          : prev,
      );
    } catch (err) {
      setState((prev) => ({
        ...prev,
        boardLoading: false,
        boardError: toFriendlyText(err, "Falha ao carregar pipeline"),
      }));
    }
  }, [fetchBoard]); // stable

  const setActiveJob = useCallback(
    (jobId: string) => {
      activeJobIdRef.current = jobId;
      selectedCandidateIdRef.current = null;
      setState((prev) => ({
        ...prev,
        activeJobId: jobId,
        selectedCandidateId: null,
        candidateOverview: null,
        candidateError: null,
      }));
      void loadBoard(jobId);
    },
    [loadBoard],
  );

  const refreshBoard = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (jobId) await loadBoard(jobId, true);
  }, [loadBoard]);

  const setCandidateAiStatus = useCallback(
    (candidateId: string, status: AIAnalysisStatus | null) => {
      setState((prev) => {
        if (!prev.board) return prev;
        const nextBoard = updateBoardCandidate(prev.board, candidateId, (candidate) => {
          if (candidate.ai_status === status) {
            return candidate;
          }

          return { ...candidate, ai_status: status };
        });
        if (nextBoard === prev.board) return prev;
        boardCacheRef.current.set(nextBoard.job_id, nextBoard);
        return { ...prev, board: nextBoard };
      });
    },
    [],
  );

  const patchBoardCandidate = useCallback(
    (candidateId: string, updater: (candidate: JobCandidate) => JobCandidate) => {
      setState((prev) => {
        if (!prev.board) return prev;
        const nextBoard = updateBoardCandidate(prev.board, candidateId, updater);
        if (nextBoard === prev.board) return prev;
        boardCacheRef.current.set(nextBoard.job_id, nextBoard);
        return { ...prev, board: nextBoard };
      });
    },
    [],
  );

  const patchCandidate = useCallback(
    (candidateId: string, payload: Partial<CandidateOverview["candidate"]>) => {
      const cached = candidateCacheRef.current.get(candidateId);
      if (cached) {
        const nextOverview: CandidateOverview = {
          ...cached,
          candidate: {
            ...cached.candidate,
            ...payload,
          },
        };

        candidateCacheRef.current.set(candidateId, nextOverview);
        setState((prev) =>
          prev.selectedCandidateId === candidateId
            ? { ...prev, candidateOverview: nextOverview, candidateError: null }
            : prev,
        );
      }

      if (payload.full_name) {
        patchBoardCandidate(candidateId, (candidate) => ({
          ...candidate,
          candidate_name: payload.full_name ?? candidate.candidate_name,
        }));
      }
    },
    [patchBoardCandidate],
  );

  const fetchCandidateOverview = useCallback(async (candidateId: string, force = false): Promise<CandidateOverview> => {
    if (!force) {
      const cached = candidateCacheRef.current.get(candidateId);
      if (cached) return cached;
    }

    const inFlight = candidateFetchInFlightRef.current.get(candidateId);
    if (inFlight) return inFlight;

    const request = candidatesService
      .getOverview(candidateId)
      .then((overview) => {
        candidateCacheRef.current.set(candidateId, overview);
        return overview;
      })
      .finally(() => {
        candidateFetchInFlightRef.current.delete(candidateId);
      });

    candidateFetchInFlightRef.current.set(candidateId, request);
    return request;
  }, []);

  const patchCandidateOverviewAnalysis = useCallback(
    (
      candidateId: string,
      payload: {
        analysisId: string;
        jobId?: string | null;
        status: AIAnalysisStatus;
        resumeId?: string | null;
        resumeTitle?: string | null;
      },
    ) => {
      const cached = candidateCacheRef.current.get(candidateId);
      if (!cached) return;

      const now = new Date().toISOString();
      const latest = cached.latest_analysis;
      const nextOverview: CandidateOverview = {
        ...cached,
        latest_analysis: {
          analysis_id: payload.analysisId,
          job_id: payload.jobId ?? latest?.job_id ?? cached.active_job_id ?? null,
          resume_id: payload.resumeId ?? latest?.resume_id ?? "",
          resume_title: payload.resumeTitle ?? latest?.resume_title ?? "",
          status: payload.status,
          started_at: payload.status === "processing" ? now : null,
          completed_at: null,
          failed_at: null,
          failure_reason: null,
          used_real_ai: latest?.used_real_ai ?? null,
          task_id: null,
          worker_id: null,
          seniority_level: null,
          total_experience_years: null,
          created_at: now,
          updated_at: now,
        },
        latest_analysis_pipeline: cached.latest_analysis_pipeline
          ? {
              ...cached.latest_analysis_pipeline,
              analysis_id: payload.analysisId,
              job_id:
                payload.jobId ??
                cached.latest_analysis_pipeline.job_id ??
                cached.active_job_id ??
                null,
              matching_status: "waiting_analysis",
              matching_error: null,
            }
          : {
              analysis_id: payload.analysisId,
              job_id: payload.jobId ?? cached.active_job_id ?? null,
              matching_status: "waiting_analysis",
              matching_error: null,
              published_jobs_total: payload.jobId ? 1 : 0,
              matched_jobs_count: 0,
              pending_jobs_count: payload.jobId ? 1 : 0,
            },
      };

      candidateCacheRef.current.set(candidateId, nextOverview);
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: nextOverview, candidateError: null }
          : prev,
      );
    },
    [],
  );

  const patchCandidateOverviewMatching = useCallback(
    (
      candidateId: string,
      payload: {
        analysisId: string;
        jobId: string;
        status: "processing" | "completed" | "blocked";
        error?: string | null;
      },
    ) => {
      const cached = candidateCacheRef.current.get(candidateId);
      if (!cached) return;

      const existingPipeline = cached.latest_analysis_pipeline;
      const nextPipeline = {
        analysis_id: payload.analysisId,
        job_id: payload.jobId,
        matching_status: payload.status,
        matching_error: payload.error ?? null,
        published_jobs_total: 1,
        matched_jobs_count: payload.status === "completed" ? 1 : 0,
        pending_jobs_count: payload.status === "processing" ? 1 : 0,
      };

      const nextOverview: CandidateOverview = {
        ...cached,
        latest_analysis: cached.latest_analysis
          ? {
              ...cached.latest_analysis,
              analysis_id: payload.analysisId,
              job_id: payload.jobId,
            }
          : cached.latest_analysis,
        latest_analysis_pipeline: existingPipeline
          ? { ...existingPipeline, ...nextPipeline }
          : nextPipeline,
      };

      candidateCacheRef.current.set(candidateId, nextOverview);
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: nextOverview, candidateError: null }
          : prev,
      );
    },
    [],
  );

  const patchCandidateOverviewStage = useCallback(
    (
      candidateId: string,
      payload: {
        jobId: string;
        stage: PipelineStage;
      },
    ) => {
      const cached = candidateCacheRef.current.get(candidateId);
      if (!cached) return;

      const now = new Date().toISOString();
      const isTerminalStage = payload.stage === "hired" || payload.stage === "rejected";
      let changed = false;
      const nextEntries = cached.pipeline_entries.map((entry) => {
        if (entry.job_id !== payload.jobId) return entry;
        changed = true;
        return {
          ...entry,
          stage: payload.stage,
          relationship_status: isTerminalStage ? payload.stage : "active",
          is_terminal: isTerminalStage,
          terminated_at: isTerminalStage ? now : null,
          termination_reason: isTerminalStage ? entry.termination_reason : null,
          candidate_status: PIPELINE_STAGE_STATUS_LABEL[payload.stage],
          updated_at: now,
        };
      });

      if (!changed) return;

      const nextOverview: CandidateOverview = {
        ...cached,
        pipeline_entries: nextEntries,
      };

      candidateCacheRef.current.set(candidateId, nextOverview);
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: nextOverview, candidateError: null }
          : prev,
      );
    },
    [],
  );

  // ── Candidate panel ────────────────────────────────────────────────────────

  const openCandidate = useCallback(async (candidateId: string, initialTab: PanelTab = "summary") => {
    selectedCandidateIdRef.current = candidateId;

    const cached = candidateCacheRef.current.get(candidateId);
    if (cached) {
      setState((prev) => ({
        ...prev,
        selectedCandidateId: candidateId,
        candidateOverview: cached,
        candidateLoading: false,
        candidateError: null,
        activePanelTab: initialTab,
      }));

      try {
        const freshOverview = await fetchCandidateOverview(candidateId, true);
        setState((prev) =>
          prev.selectedCandidateId === candidateId
            ? { ...prev, candidateOverview: freshOverview, candidateLoading: false, candidateError: null }
            : prev,
        );
      } catch {
        // Keep cached data visible if background sync fails
      }
      return;
    }

    setState((prev) => ({
      ...prev,
      selectedCandidateId: candidateId,
      candidateOverview: null,
      candidateLoading: true,
      candidateError: null,
      activePanelTab: initialTab,
    }));

    try {
      const overview = await fetchCandidateOverview(candidateId);
      // Guard: user may have switched candidates while this was in flight
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: overview, candidateLoading: false }
          : prev,
      );
    } catch (err) {
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? {
              ...prev,
              candidateLoading: false,
              candidateError: toFriendlyText(err, "Falha ao carregar candidato"),
            }
          : prev,
      );
    }
  }, [fetchCandidateOverview]); // stable — reads only refs and candidateCacheRef

  const closeCandidate = useCallback(() => {
    selectedCandidateIdRef.current = null;
    setState((prev) => ({
      ...prev,
      selectedCandidateId: null,
      candidateOverview: null,
      candidateError: null,
    }));
  }, []);

  const switchPanelTab = useCallback((tab: PanelTab) => {
    setState((prev) => ({ ...prev, activePanelTab: tab }));
  }, []);

  // Invalidates cache for the current candidate and re-fetches silently.
  // Called automatically after polling reaches a terminal status.
  const refreshCandidateOverview = useCallback(async () => {
    const candidateId = selectedCandidateIdRef.current;
    if (!candidateId) return;

    candidateCacheRef.current.delete(candidateId);

    try {
      const overview = await fetchCandidateOverview(candidateId, true);
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: overview }
          : prev,
      );
    } catch {
      // Keep existing overview — a silent refresh failure is not fatal
    }
  }, [fetchCandidateOverview]); // stable — reads only refs

  const syncCandidateOverview = useCallback(async (candidateId: string) => {
    candidateCacheRef.current.delete(candidateId);

    try {
      const overview = await fetchCandidateOverview(candidateId, true);
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: overview, candidateError: null }
          : prev,
      );
    } catch {
      // Keep existing overview — background sync should not disrupt the UI
    }
  }, [fetchCandidateOverview]);

  const invalidateJobs = useCallback(
    async (reload = true) => {
      jobsLoadedRef.current = false;
      jobsFetchInFlightRef.current = null;

      if (!reload) {
        return;
      }

      await loadJobs(true);
    },
    [loadJobs],
  );

  const invalidateBoard = useCallback(
    async (jobId?: string | null, reload = true) => {
      const targetJobId = jobId ?? activeJobIdRef.current;
      if (!targetJobId) return;

      boardCacheRef.current.delete(targetJobId);
      boardFetchInFlightRef.current.delete(targetJobId);

      if (!reload) {
        return;
      }

      if (activeJobIdRef.current === targetJobId) {
        await loadBoard(targetJobId, true);
      }
    },
    [loadBoard],
  );

  const invalidateCandidateOverview = useCallback(
    async (candidateId?: string | null, reload = true) => {
      const targetCandidateId = candidateId ?? selectedCandidateIdRef.current;
      if (!targetCandidateId) return;

      candidateCacheRef.current.delete(targetCandidateId);
      candidateFetchInFlightRef.current.delete(targetCandidateId);

      if (!reload) {
        return;
      }

      if (selectedCandidateIdRef.current === targetCandidateId) {
        await syncCandidateOverview(targetCandidateId);
      }
    },
    [syncCandidateOverview],
  );

  const invalidateCandidate = useCallback(
    async (
      candidateId: string,
      options: {
        reloadOverview?: boolean;
        reloadBoard?: boolean;
        jobId?: string | null;
        notify?: boolean;
      } = {},
    ) => {
      const {
        reloadOverview = true,
        reloadBoard = false,
        jobId,
        notify = true,
      } = options;

      await invalidateCandidateOverview(candidateId, reloadOverview);

      if (reloadBoard) {
        await invalidateBoard(jobId, true);
      }

      if (notify) {
        notifyCandidatesChanged();
      }
    },
    [invalidateBoard, invalidateCandidateOverview, notifyCandidatesChanged],
  );

  const invalidateJobState = useCallback(
    async (jobId?: string | null) => {
      invalidateRanking();
      notifyCandidatesChanged();
      await invalidateJobs(true);

      if (jobId) {
        await invalidateBoard(jobId, true);
      } else {
        boardCacheRef.current.clear();
        boardFetchInFlightRef.current.clear();
        const activeJobId = activeJobIdRef.current;
        if (activeJobId) {
          await loadBoard(activeJobId, true);
        }
      }

      const selectedCandidateId = selectedCandidateIdRef.current;
      if (selectedCandidateId) {
        await invalidateCandidateOverview(selectedCandidateId, true);
      }
    },
    [
      invalidateBoard,
      invalidateCandidateOverview,
      invalidateJobs,
      invalidateRanking,
      loadBoard,
      notifyCandidatesChanged,
    ],
  );

  const ensureAnalysisMatch = useCallback(
    async ({
      analysisId,
      candidateId,
      jobId,
    }: {
      analysisId: string;
      candidateId: string;
      jobId: string;
    }) => {
      const key = `${analysisId}:${jobId}`;
      const existingAttempt = matchingAttemptRef.current.get(key);
      if (
        existingAttempt?.status === "in_flight" ||
        existingAttempt?.status === "completed" ||
        existingAttempt?.status === "failed"
      ) {
        return;
      }

      const currentPipeline = await analysisService.pipeline(analysisId).catch(() => null);
      if (currentPipeline?.job_id && currentPipeline.job_id !== jobId) {
        return;
      }
      if (currentPipeline?.matching_status === "completed") {
        matchingAttemptRef.current.set(key, { status: "completed" });
        patchCandidateOverviewMatching(candidateId, {
          analysisId,
          jobId,
          status: "completed",
          error: null,
        });
        invalidateRanking();
        notifyCandidatesChanged();
        notifyAnalysesChanged();
        if (activeJobIdRef.current === jobId) {
          await invalidateBoard(jobId, true);
        }
        if (selectedCandidateIdRef.current === candidateId) {
          void syncCandidateOverview(candidateId);
        }
        return;
      }

      matchingAttemptRef.current.set(key, { status: "in_flight" });
      patchCandidateOverviewMatching(candidateId, {
        analysisId,
        jobId,
        status: "processing",
        error: null,
      });
      notifyCandidatesChanged();

      try {
        const match = await matchToJob(analysisId, jobId);
        matchingAttemptRef.current.set(key, { status: "completed" });
        patchCandidateOverviewMatching(candidateId, {
          analysisId,
          jobId,
          status: "completed",
          error: null,
        });
        patchBoardCandidate(candidateId, (candidate) => {
          if (candidate.job_id !== jobId) {
            return candidate;
          }

          return {
            ...candidate,
            job_fit_score: match.job_fit_score,
            recommendation: match.recommendation,
            ai_status: "completed",
          };
        });
        invalidateRanking();
        notifyCandidatesChanged();
        notifyAnalysesChanged();
        if (selectedCandidateIdRef.current === candidateId) {
          void syncCandidateOverview(candidateId);
        }
      } catch (err) {
        const message = toFriendlyText(err, "Falha ao persistir o matching explícito.");
        matchingAttemptRef.current.set(key, { status: "failed", error: message });
        patchCandidateOverviewMatching(candidateId, {
          analysisId,
          jobId,
          status: "blocked",
          error: message,
        });
        notifyCandidatesChanged();
        notifyAnalysesChanged();
      }
    },
    [
      invalidateBoard,
      invalidateRanking,
      notifyAnalysesChanged,
      notifyCandidatesChanged,
      patchBoardCandidate,
      patchCandidateOverviewMatching,
      syncCandidateOverview,
    ],
  );

  const syncAnalysisStart = useCallback(
    async ({
      candidateId,
      analysisId,
      status = "pending",
      jobId,
      resumeId,
      resumeTitle,
    }: {
      candidateId: string;
      analysisId: string;
      status?: AIAnalysisStatus | null;
      jobId?: string | null;
      resumeId?: string | null;
      resumeTitle?: string | null;
    }) => {
      const nextStatus = status ?? "pending";
      setCandidateAiStatus(candidateId, nextStatus);
      patchCandidateOverviewAnalysis(candidateId, {
        analysisId,
        jobId,
        status: nextStatus,
        resumeId,
        resumeTitle,
      });
      notifyCandidatesChanged();
      notifyAnalysesChanged();
    },
    [
      notifyAnalysesChanged,
      notifyCandidatesChanged,
      patchCandidateOverviewAnalysis,
      setCandidateAiStatus,
    ],
  );

  // ── Stage movement ─────────────────────────────────────────────────────────

  const moveCandidateStage = useCallback(
    async (candidateId: string, toStage: PipelineStage) => {
      const jobId =
        activeJobIdRef.current ??
        candidateCacheRef.current.get(candidateId)?.active_job_id ??
        null;
      if (!jobId) {
        throw new Error("Candidato sem vaga ativa para mover etapa.");
      }

      const previousOverview = candidateCacheRef.current.get(candidateId) ?? null;
      let previousBoard: JobPipelineBoard | null = null;

      patchCandidateOverviewStage(candidateId, { jobId, stage: toStage });

      // Optimistic update: move the card immediately in local state.
      // On API failure we restore the previous local snapshot.
      setState((prev) => {
        previousBoard = prev.board;
        if (!prev.board) return prev;
        const nextBoard = moveBoardCandidate(
          prev.board,
          candidateId,
          toStage,
          PIPELINE_STAGE_STATUS_LABEL[toStage],
        );
        if (nextBoard === prev.board) return prev;
        boardCacheRef.current.set(nextBoard.job_id, nextBoard);
        return { ...prev, board: nextBoard };
      });

      try {
        await pipelineService.moveCandidateStage(jobId, candidateId, { stage: toStage });
        invalidateRanking();
        notifyCandidatesChanged();
      } catch (err) {
        if (previousOverview) {
          candidateCacheRef.current.set(candidateId, previousOverview);
          setState((prev) =>
            prev.selectedCandidateId === candidateId
              ? { ...prev, candidateOverview: previousOverview, candidateError: null }
              : prev,
          );
        }

        if (previousBoard) {
          boardCacheRef.current.set(previousBoard.job_id, previousBoard);
          setState((prev) =>
            prev.board?.job_id === previousBoard?.job_id
              ? { ...prev, board: previousBoard }
              : prev,
          );
        }

        void syncCandidateOverview(candidateId);
        throw err; // bubble up so the caller (UI) can show a toast
      }
    },
    [
      invalidateRanking,
      notifyCandidatesChanged,
      patchCandidateOverviewStage,
      syncCandidateOverview,
    ],
  );

  // ── Polling ────────────────────────────────────────────────────────────────

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    clearPollingTimer();
    pollingAnalysisIdRef.current = null;
    pollingCandidateIdRef.current = null;
    pollingJobIdRef.current = null;
    pollingPrevStatusRef.current = null;
    pollingStaleCountRef.current = 0;
    setState((prev) => ({ ...prev, pollingAnalysisId: null, pollingStatus: null }));
  }, [clearPollingTimer]);

  // schedulePoll is recursive (setTimeout → callback → setTimeout).
  // We store it in a ref so the recursive call always resolves to the latest
  // closure without creating a circular useCallback dependency chain.
  // The ref is updated synchronously on every render (before effects fire),
  // so it's always fresh when a scheduled timeout finally executes.
  const schedulePollRef = useRef<(analysisId: string, delayMs: number) => void>(null!);

  // Not wrapped in useCallback: assigned to ref on every render.
  // Reads only refs → no stale closures.
  const schedulePoll = (analysisId: string, delayMs: number): void => {
    clearPollingTimer();

    pollingTimerRef.current = window.setTimeout(async () => {
      // Bail if polling was stopped or switched to a different analysis
      if (pollingAnalysisIdRef.current !== analysisId) return;

      // Pause while the browser tab is hidden; resume 2s after it becomes visible
      if (!isPageVisibleRef.current) {
        schedulePollRef.current(analysisId, 2000);
        return;
      }

      try {
        const status = await analysisService.status(analysisId);

        // Another startPolling(newId) may have fired while this was in flight
        if (pollingAnalysisIdRef.current !== analysisId) return;

        if (status.status !== pollingPrevStatusRef.current) {
          pollingPrevStatusRef.current = status.status;
          pollingStaleCountRef.current = 0;
          setState((prev) => ({ ...prev, pollingStatus: status }));
          const candidateId = pollingCandidateIdRef.current;
          if (candidateId) {
            setCandidateAiStatus(candidateId, status.status);
          }
          notifyCandidatesChanged();
          notifyAnalysesChanged();
        } else {
          pollingStaleCountRef.current += 1;
        }

        const isTerminal =
          status.status === "completed" ||
          status.status === "failed" ||
          status.status === "cancelled";

        if (isTerminal) {
          // Ensure terminal status is always reflected even if unchanged from prev
          setState((prev) => ({ ...prev, pollingStatus: status }));
          if (
            status.status === "completed" &&
            pollingCandidateIdRef.current &&
            pollingJobIdRef.current
          ) {
            await ensureAnalysisMatch({
              analysisId,
              candidateId: pollingCandidateIdRef.current,
              jobId: pollingJobIdRef.current,
            });
            stopPolling();
            return;
          } else {
            const candidateId = pollingCandidateIdRef.current;
            stopPolling();
            if (candidateId) {
              void invalidateCandidateOverview(candidateId, true);
            }
            return;
          }
        }

        schedulePollRef.current(
          analysisId,
          pollingDelay(pollingStaleCountRef.current),
        );
      } catch {
        // Network error: back off and retry
        if (pollingAnalysisIdRef.current === analysisId) {
          schedulePollRef.current(analysisId, 15000);
        }
      }
    }, delayMs);
  };
  schedulePollRef.current = schedulePoll;

  const startPolling = useCallback(
    (
      analysisId: string,
      candidateId?: string | null,
      initialStatus?: AnalysisStatus["status"] | null,
      jobId?: string | null,
    ) => {
      // No-op if already polling the same analysis
      if (pollingAnalysisIdRef.current === analysisId) return;

      clearPollingTimer();
      pollingAnalysisIdRef.current = analysisId;
      pollingCandidateIdRef.current = candidateId ?? null;
      pollingJobIdRef.current = jobId ?? null;
      pollingPrevStatusRef.current = initialStatus ?? null;
      pollingStaleCountRef.current = 0;
      setState((prev) => ({ ...prev, pollingAnalysisId: analysisId, pollingStatus: null }));

      // First poll fires immediately (0ms)
      schedulePollRef.current(analysisId, 0);
    },
    [clearPollingTimer],
  );

  // ── Side effects ───────────────────────────────────────────────────────────

  // Pause polling when the browser tab is not visible (saves bandwidth/battery)
  useEffect(() => {
    const handle = () => {
      isPageVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handle);
    return () => document.removeEventListener("visibilitychange", handle);
  }, []);

  // Cancel any pending timer on unmount
  useEffect(() => () => clearPollingTimer(), [clearPollingTimer]);

  // ── Context value ──────────────────────────────────────────────────────────

  // All action callbacks are stable (empty or minimal deps via refs).
  // useMemo only recomputes when `state` changes — i.e., on actual data updates.
  const value = useMemo<PipelineContextValue>(
    () => ({
      ...state,
      loadJobs,
      invalidateJobs,
      setActiveJob,
      refreshBoard,
      invalidateBoard,
      openCandidate,
      closeCandidate,
      switchPanelTab,
      refreshCandidateOverview,
      syncCandidateOverview,
      invalidateCandidateOverview,
      invalidateCandidate,
      patchCandidate,
      moveCandidateStage,
      setCandidateAiStatus,
      syncAnalysisStart,
      ensureAnalysisMatch,
      notifyCandidatesChanged,
      notifyAnalysesChanged,
      invalidateJobState,
      invalidateRanking,
      startPolling,
      stopPolling,
    }),
    [
      state,
      loadJobs,
      invalidateJobs,
      setActiveJob,
      refreshBoard,
      invalidateBoard,
      openCandidate,
      closeCandidate,
      switchPanelTab,
      refreshCandidateOverview,
      syncCandidateOverview,
      invalidateCandidateOverview,
      invalidateCandidate,
      patchCandidate,
      moveCandidateStage,
      setCandidateAiStatus,
      syncAnalysisStart,
      ensureAnalysisMatch,
      notifyCandidatesChanged,
      notifyAnalysesChanged,
      invalidateJobState,
      invalidateRanking,
      startPolling,
      stopPolling,
    ],
  );

  return <PipelineContext.Provider value={value}>{children}</PipelineContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within a PipelineProvider");
  return ctx;
}
