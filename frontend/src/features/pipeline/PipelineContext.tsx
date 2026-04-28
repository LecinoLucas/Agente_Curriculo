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

import { analysisService } from "../../services/analysisService";
import { candidatesService } from "../../services/candidatesService";
import { getJobPipeline, listJobs } from "../../services/jobsService";
import { pipelineService } from "../../services/pipelineService";
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
  // Jobs list — loaded once on mount, shared across all consumers
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
}

export interface PipelineContextValue extends PipelineState {
  // Jobs
  loadJobs: () => Promise<void>;

  // Board
  setActiveJob: (jobId: string) => void;
  refreshBoard: () => Promise<void>;

  // Candidate panel
  openCandidate: (candidateId: string, initialTab?: PanelTab) => Promise<void>;
  closeCandidate: () => void;
  switchPanelTab: (tab: PanelTab) => void;
  refreshCandidateOverview: () => Promise<void>;
  syncCandidateOverview: (candidateId: string) => Promise<void>;

  // Kanban drag
  moveCandidateStage: (candidateId: string, toStage: PipelineStage) => Promise<void>;
  setCandidateAiStatus: (candidateId: string, status: AIAnalysisStatus | null) => void;
  syncAnalysisStart: (input: {
    candidateId: string;
    analysisId: string;
    status?: AIAnalysisStatus | null;
    resumeId?: string | null;
    resumeTitle?: string | null;
  }) => Promise<void>;
  notifyCandidatesChanged: () => void;
  notifyAnalysesChanged: () => void;

  // Polling
  startPolling: (
    analysisId: string,
    candidateId?: string | null,
    initialStatus?: AnalysisStatus["status"] | null,
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
};

// Backoff: 1.5s → 5s (after 5 identical statuses) → 15s (after 10)
function pollingDelay(staleCount: number): number {
  if (staleCount < 5) return 1500;
  if (staleCount < 10) return 5000;
  return 15000;
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
  const jobsFetchInFlightRef = useRef(false);
  const jobsLoadedRef = useRef(false);

  // Polling state — all mutable, never need to trigger renders directly.
  const pollingTimerRef = useRef<number | null>(null);
  const pollingAnalysisIdRef = useRef<string | null>(null);
  const pollingCandidateIdRef = useRef<string | null>(null);
  const pollingPrevStatusRef = useRef<string | null>(null);
  const pollingStaleCountRef = useRef(0);
  const isPageVisibleRef = useRef(true);

  const notifyCandidatesChanged = useCallback(() => {
    setState((prev) => ({ ...prev, candidatesSyncTick: prev.candidatesSyncTick + 1 }));
  }, []);

  const notifyAnalysesChanged = useCallback(() => {
    setState((prev) => ({ ...prev, analysesSyncTick: prev.analysesSyncTick + 1 }));
  }, []);

  // ── Jobs ───────────────────────────────────────────────────────────────────

  // Guard: concurrent or redundant calls are no-ops.
  // jobsFetchInFlightRef prevents a second call while one is in flight.
  // jobsLoadedRef prevents re-fetching after a successful load.
  // Both checks are synchronous so no race condition between them and setState.
  const loadJobs = useCallback(async () => {
    if (jobsFetchInFlightRef.current || jobsLoadedRef.current) return;

    jobsFetchInFlightRef.current = true;
    setState((prev) => ({ ...prev, jobsLoading: true, jobsError: null }));

    try {
      const result = await listJobs(1, 100);
      jobsLoadedRef.current = true;
      setState((prev) => ({ ...prev, jobs: result.data, jobsLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        jobsLoading: false,
        jobsError: err instanceof Error ? err.message : "Falha ao carregar vagas",
      }));
    } finally {
      jobsFetchInFlightRef.current = false;
    }
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
        boardError: err instanceof Error ? err.message : "Falha ao carregar pipeline",
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

        let changed = false;
        const columns = prev.board.columns.map((column) => ({
          ...column,
          candidates: column.candidates.map((candidate) => {
            if (candidate.candidate_id !== candidateId || candidate.ai_status === status) {
              return candidate;
            }
            changed = true;
            return { ...candidate, ai_status: status };
          }),
        }));

        if (!changed) return prev;

        const nextBoard = { ...prev.board, columns };
        boardCacheRef.current.set(nextBoard.job_id, nextBoard);
        return { ...prev, board: nextBoard };
      });
    },
    [],
  );

  const fetchCandidateOverview = useCallback(async (candidateId: string, force = false): Promise<CandidateOverview> => {
    if (!force) {
      const cached = candidateCacheRef.current.get(candidateId);
      if (cached) return cached;
    }

    const inFlight = candidateFetchInFlightRef.current.get(candidateId);
    if (inFlight) return inFlight;

    const request = candidatesService.getOverview(candidateId)
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
          overall_score: null,
          seniority_level: null,
          total_experience_years: null,
          created_at: now,
          updated_at: now,
        },
        latest_analysis_pipeline: cached.latest_analysis_pipeline
          ? {
              ...cached.latest_analysis_pipeline,
              analysis_id: payload.analysisId,
              matching_status:
                payload.status === "processing" ? "processing" : "waiting_analysis",
            }
          : cached.latest_analysis_pipeline,
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
              candidateError:
                err instanceof Error ? err.message : "Falha ao carregar candidato",
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

  const syncAnalysisStart = useCallback(
    async ({
      candidateId,
      analysisId,
      status = "pending",
      resumeId,
      resumeTitle,
    }: {
      candidateId: string;
      analysisId: string;
      status?: AIAnalysisStatus | null;
      resumeId?: string | null;
      resumeTitle?: string | null;
    }) => {
      const nextStatus = status ?? "pending";
      setCandidateAiStatus(candidateId, nextStatus);
      patchCandidateOverviewAnalysis(candidateId, {
        analysisId,
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
      const jobId = activeJobIdRef.current;
      if (!jobId) return;

      // Optimistic update: move the card immediately in local state.
      // On API failure we reload the board from server to revert.
      setState((prev) => {
        if (!prev.board) return prev;

        let movingCard: JobCandidate | undefined;
        const stripped = prev.board.columns.map((col) => {
          const found = col.candidates.find((c) => c.candidate_id === candidateId);
          if (found) movingCard = found;
          return {
            ...col,
            candidates: col.candidates.filter((c) => c.candidate_id !== candidateId),
          };
        });

        if (!movingCard) return prev;

        const updatedCard: JobCandidate = { ...movingCard, stage: toStage };
        const inserted = stripped.map((col) =>
          col.stage === toStage
            ? { ...col, candidates: [updatedCard, ...col.candidates] }
            : col,
        );

        const nextBoard = { ...prev.board!, columns: inserted };
        boardCacheRef.current.set(nextBoard.job_id, nextBoard);
        return { ...prev, board: nextBoard };
      });

      try {
        await pipelineService.moveCandidateStage(jobId, candidateId, { stage: toStage });
        // Invalidate cache: pipeline_entries inside the overview are now stale
        candidateCacheRef.current.delete(candidateId);
        if (selectedCandidateIdRef.current === candidateId) {
          void refreshCandidateOverview();
        }
      } catch (err) {
        // Revert: reload board from server (authoritative source)
        void loadBoard(jobId);
        throw err; // bubble up so the caller (UI) can show a toast
      }
    },
    [loadBoard, refreshCandidateOverview],
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
          stopPolling();
          void refreshCandidateOverview();
          void refreshBoard();
          return;
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
    ) => {
      // No-op if already polling the same analysis
      if (pollingAnalysisIdRef.current === analysisId) return;

      clearPollingTimer();
      pollingAnalysisIdRef.current = analysisId;
      pollingCandidateIdRef.current = candidateId ?? null;
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

  // Auto-load jobs when the authenticated shell mounts
  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Cancel any pending timer on unmount
  useEffect(() => () => clearPollingTimer(), [clearPollingTimer]);

  // ── Context value ──────────────────────────────────────────────────────────

  // All action callbacks are stable (empty or minimal deps via refs).
  // useMemo only recomputes when `state` changes — i.e., on actual data updates.
  const value = useMemo<PipelineContextValue>(
    () => ({
      ...state,
      loadJobs,
      setActiveJob,
      refreshBoard,
      openCandidate,
      closeCandidate,
      switchPanelTab,
      refreshCandidateOverview,
      syncCandidateOverview,
      moveCandidateStage,
      setCandidateAiStatus,
      syncAnalysisStart,
      notifyCandidatesChanged,
      notifyAnalysesChanged,
      startPolling,
      stopPolling,
    }),
    [
      state,
      loadJobs,
      setActiveJob,
      refreshBoard,
      openCandidate,
      closeCandidate,
      switchPanelTab,
      refreshCandidateOverview,
      syncCandidateOverview,
      moveCandidateStage,
      setCandidateAiStatus,
      syncAnalysisStart,
      notifyCandidatesChanged,
      notifyAnalysesChanged,
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
