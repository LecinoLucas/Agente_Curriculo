import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    analysis_id: "analysis-1",
    status: "completed",
    job_id: "job-1",
  },
} as never;

describe("useCandidateData", () => {
  beforeEach(() => {
    analysisServiceMock.result.mockReset();
    getJobRankingMock.mockReset();
    getCandidateRankingEntryMock.mockReset();
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
});
