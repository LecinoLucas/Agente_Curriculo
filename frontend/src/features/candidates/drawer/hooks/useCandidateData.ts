import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, CandidateOverview, JobRankingEntry } from "../../../../types/domain";
import { analysisService } from "../../../../services/analysisService";
import { getCandidateRankingEntry } from "../../../../services/jobsService";
import { formatContextError } from "../../../../services/errorMessages";
import { HttpError } from "../../../../services/http";
import type { PanelTab } from "../../../pipeline/PipelineContext";

function isCandidateScoreNotReadyError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false;
  if (error.status !== 409) return false;
  if (error.code === "candidate_score_not_ready") return true;
  const detail = error.detail;
  if (detail && typeof detail === "object") {
    return (detail as Record<string, unknown>).code === "candidate_score_not_ready";
  }
  return false;
}

interface UseCandidateDataInput {
  candidateOverview: CandidateOverview | null | undefined;
  candidateActiveJobId: string | null;
  activePanelTab: PanelTab;
  rankingSyncTick: number;
}

export function useCandidateData({
  candidateOverview,
  candidateActiveJobId,
  activePanelTab,
  rankingSyncTick,
}: UseCandidateDataInput) {
  const shouldLoadScoreData = activePanelTab === "score" || activePanelTab === "analysis";
  const candidateId = candidateOverview?.candidate.id ?? null;
  const analysisResultCacheRef = useRef<Map<string, AnalysisResult>>(new Map());
  const rankingEntryCacheRef = useRef<Map<string, JobRankingEntry | null>>(new Map());

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisResultLoading, setAnalysisResultLoading] = useState(false);
  const [analysisResultError, setAnalysisResultError] = useState<string | null>(null);

  const [rankingEntry, setRankingEntry] = useState<JobRankingEntry | null>(null);
  const [rankingEntryLoading, setRankingEntryLoading] = useState(false);
  const [rankingEntryError, setRankingEntryError] = useState<string | null>(null);
  const [rankingEntryScoreNotReady, setRankingEntryScoreNotReady] = useState(false);

  useEffect(() => {
    analysisResultCacheRef.current.clear();
    rankingEntryCacheRef.current.clear();
    setAnalysisResult(null);
    setAnalysisResultError(null);
    setRankingEntry(null);
    setRankingEntryError(null);
    setRankingEntryScoreNotReady(false);
  }, [rankingSyncTick, candidateActiveJobId, candidateId]);

  useEffect(() => {
    if (!shouldLoadScoreData) {
      setAnalysisResultLoading(false);
      return;
    }

    if (!candidateActiveJobId) {
      setAnalysisResult(null);
      setAnalysisResultError(null);
      setAnalysisResultLoading(false);
      return;
    }
    const analysisId = candidateOverview?.active_job_decision?.current_analysis_id;
    const status = candidateOverview?.active_job_decision?.analysis_status;
    if (!analysisId || status !== "completed") {
      setAnalysisResult(null);
      setAnalysisResultLoading(false);
      return;
    }

    const cached = analysisResultCacheRef.current.get(analysisId);
    if (cached) {
      setAnalysisResult(cached);
      return;
    }

    const abortController = new AbortController();
    setAnalysisResultLoading(true);
    setAnalysisResultError(null);

    analysisService
      .result(analysisId)
      .then((result) => {
        if (abortController.signal.aborted) return;
        analysisResultCacheRef.current.set(analysisId, result);
        setAnalysisResult(result);
      })
      .catch((err: unknown) => {
        if (abortController.signal.aborted) return;
        setAnalysisResultError(
          formatContextError(
            err,
            "Não foi possível carregar o resultado completo da análise.",
            "Tente novamente em alguns instantes.",
          ),
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setAnalysisResultLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [
    shouldLoadScoreData,
    candidateOverview?.active_job_decision?.current_analysis_id,
    candidateOverview?.active_job_decision?.analysis_status,
    rankingSyncTick,
    candidateActiveJobId,
  ]);

  useEffect(() => {
    if (!shouldLoadScoreData) {
      setRankingEntryLoading(false);
      return;
    }

    if (!candidateActiveJobId || !candidateId) {
      setRankingEntry(null);
      setRankingEntryError(null);
      setRankingEntryScoreNotReady(false);
      setRankingEntryLoading(false);
      return;
    }

    const cacheKey = `${candidateActiveJobId}:${candidateId}`;
    const cached = rankingEntryCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      setRankingEntry(cached);
      setRankingEntryError(null);
      setRankingEntryScoreNotReady(false);
      setRankingEntryLoading(false);
      return;
    }

    const abortController = new AbortController();
    setRankingEntryLoading(true);
    setRankingEntryError(null);
    setRankingEntryScoreNotReady(false);

    void getCandidateRankingEntry(candidateActiveJobId, candidateId)
      .then((entry) => {
        if (abortController.signal.aborted) return;
        rankingEntryCacheRef.current.set(cacheKey, entry);
        setRankingEntry(entry);
        setRankingEntryScoreNotReady(false);
      })
      .catch((err: unknown) => {
        if (abortController.signal.aborted) return;
        setRankingEntry(null);
        if (isCandidateScoreNotReadyError(err)) {
          setRankingEntryScoreNotReady(true);
          setRankingEntryError(null);
          return;
        }
        setRankingEntryError(
          formatContextError(
            err,
            "Não foi possível carregar o score detalhado desta vaga.",
            "Tente novamente.",
          ),
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setRankingEntryLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [shouldLoadScoreData, candidateActiveJobId, candidateId, rankingSyncTick]);

  return {
    analysisResult,
    analysisResultLoading,
    analysisResultError,
    analysisResultCacheRef,
    rankingEntry,
    rankingEntryLoading,
    rankingEntryError,
    rankingEntryScoreNotReady,
    rankingEntryCacheRef,
  };
}
