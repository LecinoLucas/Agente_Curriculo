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
import {
  AnalysisStatus,
  CandidateOverview,
  Job,
  JobCandidate,
  JobPipelineBoard,
  PipelineStage,
} from "../../types/domain";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PanelTab = "documents" | "analysis" | "ranking" | "history";

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
}

export interface PipelineContextValue extends PipelineState {
  // Jobs
  loadJobs: () => Promise<void>;

  // Board
  setActiveJob: (jobId: string) => void;
  refreshBoard: () => Promise<void>;

  // Candidate panel
  openCandidate: (candidateId: string) => Promise<void>;
  closeCandidate: () => void;
  switchPanelTab: (tab: PanelTab) => void;
  refreshCandidateOverview: () => Promise<void>;

  // Kanban drag
  moveCandidateStage: (candidateId: string, toStage: PipelineStage) => Promise<void>;

  // Polling
  startPolling: (analysisId: string) => void;
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
  activePanelTab: "ranking",
  pollingAnalysisId: null,
  pollingStatus: null,
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

  // Candidate overview cache: serves repeated openCandidate() calls instantly.
  // Invalidated on: closeCandidate, moveCandidateStage, refreshCandidateOverview.
  const candidateCacheRef = useRef<Map<string, CandidateOverview>>(new Map());

  // Fetch deduplication for loadJobs — prevents concurrent or duplicate calls.
  const jobsFetchInFlightRef = useRef(false);
  const jobsLoadedRef = useRef(false);

  // Polling state — all mutable, never need to trigger renders directly.
  const pollingTimerRef = useRef<number | null>(null);
  const pollingAnalysisIdRef = useRef<string | null>(null);
  const pollingPrevStatusRef = useRef<string | null>(null);
  const pollingStaleCountRef = useRef(0);
  const isPageVisibleRef = useRef(true);

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

  const loadBoard = useCallback(async (jobId: string) => {
    setState((prev) => ({ ...prev, boardLoading: true, boardError: null }));
    try {
      const board = await getJobPipeline(jobId);
      setState((prev) => ({ ...prev, board, boardLoading: false }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        boardLoading: false,
        boardError: err instanceof Error ? err.message : "Falha ao carregar pipeline",
      }));
    }
  }, []); // stable

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
    if (jobId) await loadBoard(jobId);
  }, [loadBoard]);

  // ── Candidate panel ────────────────────────────────────────────────────────

  const openCandidate = useCallback(async (candidateId: string) => {
    selectedCandidateIdRef.current = candidateId;

    // Cache hit: no network call, no loading flash
    const cached = candidateCacheRef.current.get(candidateId);
    if (cached) {
      setState((prev) => ({
        ...prev,
        selectedCandidateId: candidateId,
        candidateOverview: cached,
        candidateLoading: false,
        candidateError: null,
        activePanelTab: "ranking",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      selectedCandidateId: candidateId,
      candidateOverview: null,
      candidateLoading: true,
      candidateError: null,
      activePanelTab: "ranking",
    }));

    try {
      const overview = await candidatesService.getOverview(candidateId);
      candidateCacheRef.current.set(candidateId, overview);
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
  }, []); // stable — reads only refs and candidateCacheRef

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
      const overview = await candidatesService.getOverview(candidateId);
      candidateCacheRef.current.set(candidateId, overview);
      setState((prev) =>
        prev.selectedCandidateId === candidateId
          ? { ...prev, candidateOverview: overview }
          : prev,
      );
    } catch {
      // Keep existing overview — a silent refresh failure is not fatal
    }
  }, []); // stable — reads only refs

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

        return { ...prev, board: { ...prev.board!, columns: inserted } };
      });

      try {
        await candidatesService.updateStage(candidateId, { job_id: jobId, stage: toStage });
        // Invalidate cache: pipeline_entries inside the overview are now stale
        candidateCacheRef.current.delete(candidateId);
      } catch (err) {
        // Revert: reload board from server (authoritative source)
        void loadBoard(jobId);
        throw err; // bubble up so the caller (UI) can show a toast
      }
    },
    [loadBoard],
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
    (analysisId: string) => {
      // No-op if already polling the same analysis
      if (pollingAnalysisIdRef.current === analysisId) return;

      clearPollingTimer();
      pollingAnalysisIdRef.current = analysisId;
      pollingPrevStatusRef.current = null;
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
      moveCandidateStage,
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
      moveCandidateStage,
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
