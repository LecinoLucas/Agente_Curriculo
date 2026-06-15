import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../../services/http";

const { analysisServiceMock, getJobRankingMock, getCandidateRankingEntryMock } = vi.hoisted(() => ({
  analysisServiceMock: {
    result: vi.fn(),
  },
  getJobRankingMock: vi.fn(),
  getCandidateRankingEntryMock: vi.fn(),
}));

vi.mock("../../../../../services/analysisService", () => ({
  analysisService: analysisServiceMock,
}));

vi.mock("../../../../../services/jobsService", () => ({
  getJobRanking: getJobRankingMock,
  getCandidateRankingEntry: getCandidateRankingEntryMock,
}));

import { useCandidateData } from "../useCandidateData";

const overview = {
  candidate: { id: "candidate-1" },
  latest_analysis: {
    analysis_id: "analysis-old",
    status: "completed",
    job_id: "job-old",
  },
  active_job_decision: {
    current_analysis_id: "analysis-1",
    analysis_status: "completed",
  },
} as never;

describe("useCandidateData", () => {
  beforeEach(() => {
    analysisServiceMock.result.mockReset();
    getJobRankingMock.mockReset();
    getCandidateRankingEntryMock.mockReset();
    analysisServiceMock.result.mockResolvedValue({ analysis_id: "analysis-1" });
  });

  it("não busca ranking nem resultado completo fora das abas de score/análise", () => {
    renderHook(() =>
      useCandidateData({
        candidateOverview: overview,
        candidateActiveJobId: "job-1",
        activePanelTab: "summary",
        rankingSyncTick: 0,
      }),
    );

    expect(analysisServiceMock.result).not.toHaveBeenCalled();
    expect(getJobRankingMock).not.toHaveBeenCalled();
  });

  it("busca dados sob demanda ao entrar na aba de score", async () => {
    analysisServiceMock.result.mockResolvedValue({ analysis_id: "analysis-1" });
    getJobRankingMock.mockResolvedValue({
      job_id: "job-1",
      candidates: [{ candidate_id: "candidate-1", job_fit_score: 82 }],
    });
    getCandidateRankingEntryMock.mockResolvedValue({
      candidate_id: "candidate-1",
      job_fit_score: 82,
    });

    renderHook(() =>
      useCandidateData({
        candidateOverview: overview,
        candidateActiveJobId: "job-1",
        activePanelTab: "score",
        rankingSyncTick: 0,
      }),
    );

    await waitFor(() => {
      expect(analysisServiceMock.result).toHaveBeenCalledWith("analysis-1");
      expect(getCandidateRankingEntryMock).toHaveBeenCalledWith("job-1", "candidate-1");
    });
  });

  it("trata 409 candidate_score_not_ready como estado controlado", async () => {
    getCandidateRankingEntryMock.mockRejectedValue(
      new HttpError(409, "Score ainda não disponível.", "candidate_score_not_ready"),
    );

    const { result } = renderHook(() =>
      useCandidateData({
        candidateOverview: overview,
        candidateActiveJobId: "job-1",
        activePanelTab: "score",
        rankingSyncTick: 0,
      }),
    );

    await waitFor(() => {
      expect(result.current.rankingEntryScoreNotReady).toBe(true);
    });
    expect(result.current.rankingEntryError).toBeNull();
  });

  it("trata 409 ranking_not_ready como estado controlado", async () => {
    getCandidateRankingEntryMock.mockRejectedValue(
      new HttpError(409, "Ranking ainda não disponível.", "ranking_not_ready"),
    );

    const { result } = renderHook(() =>
      useCandidateData({
        candidateOverview: overview,
        candidateActiveJobId: "job-1",
        activePanelTab: "score",
        rankingSyncTick: 0,
      }),
    );

    await waitFor(() => {
      expect(result.current.rankingEntryScoreNotReady).toBe(true);
    });
    expect(result.current.rankingEntryError).toBeNull();
  });
});
