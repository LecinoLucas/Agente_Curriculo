import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";

const {
  listJobsMock,
  getJobPipelineMock,
  getOverviewMock,
  moveCandidateStageMock,
  analysisPipelineMock,
  analysisStatusMock,
  matchToJobMock,
} = vi.hoisted(() => ({
  listJobsMock: vi.fn(),
  getJobPipelineMock: vi.fn(),
  getOverviewMock: vi.fn(),
  moveCandidateStageMock: vi.fn(),
  analysisPipelineMock: vi.fn(),
  analysisStatusMock: vi.fn(),
  matchToJobMock: vi.fn(),
}));

vi.mock("../../../services/jobsService", () => ({
  listJobs: listJobsMock,
  getJobPipeline: getJobPipelineMock,
}));

vi.mock("../../../services/candidatesService", () => ({
  candidatesService: {
    getOverview: getOverviewMock,
  },
}));

vi.mock("../../../services/pipelineService", () => ({
  pipelineService: {
    moveCandidateStage: moveCandidateStageMock,
  },
}));

vi.mock("../../../services/analysisService", () => ({
  analysisService: {
    pipeline: analysisPipelineMock,
    status: analysisStatusMock,
  },
  matchToJob: matchToJobMock,
}));

import { PipelineProvider, usePipeline } from "../PipelineContext";

const boardFixture = {
  job_id: "job-1",
  columns: [
    {
      stage: "entry",
      label: "Recebido",
      candidates: [
        {
          candidate_id: "candidate-1",
          candidate_name: "Alice",
          job_id: "job-1",
          stage: "entry",
          candidate_status: "Recebido",
          job_fit_score: null,
          ai_status: "processing",
        },
      ],
    },
    {
      stage: "screening",
      label: "Triagem",
      candidates: [
        {
          candidate_id: "candidate-2",
          candidate_name: "Bruno",
          job_id: "job-1",
          stage: "screening",
          candidate_status: "Triagem",
          job_fit_score: 81,
          ai_status: "completed",
        },
      ],
    },
    {
      stage: "final",
      label: "Final",
      candidates: [
        {
          candidate_id: "candidate-3",
          candidate_name: "Carla",
          job_id: "job-1",
          stage: "final",
          candidate_status: "Final",
          job_fit_score: 90,
          ai_status: "completed",
        },
      ],
    },
  ],
};

const overviewFixture = {
  candidate: {
    id: "candidate-1",
    full_name: "Alice",
    email: "alice@test.com",
    phone: null,
    cpf: null,
    location_city: null,
    location_state: null,
    location_country: "BR",
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    internal_notes: null,
    tags: [],
    user_id: null,
    created_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  resumes: [],
  latest_analysis: null,
  latest_analysis_pipeline: null,
  top_matches: [],
  active_job_id: "job-1",
  active_job: { id: "job-1", title: "Vaga 1", status: "published" },
  pipeline_entries: [
    {
      candidate_id: "candidate-1",
      job_id: "job-1",
      job_title: "Vaga 1",
      stage: "entry",
      relationship_status: "active",
      is_terminal: false,
      terminated_at: null,
      termination_reason: null,
      candidate_status: "Recebido",
      updated_at: new Date().toISOString(),
    },
  ],
};

function createWrapper() {
  return function Wrapper({ children }: PropsWithChildren) {
    return <PipelineProvider>{children}</PipelineProvider>;
  };
}

describe("PipelineContext", () => {
  beforeEach(() => {
    listJobsMock.mockReset();
    getJobPipelineMock.mockReset();
    getOverviewMock.mockReset();
    moveCandidateStageMock.mockReset();
    analysisPipelineMock.mockReset();
    analysisStatusMock.mockReset();
    matchToJobMock.mockReset();

    getJobPipelineMock.mockResolvedValue(structuredClone(boardFixture));
    getOverviewMock.mockResolvedValue(structuredClone(overviewFixture));
    moveCandidateStageMock.mockResolvedValue({
      candidate_id: "candidate-1",
      job_id: "job-1",
      stage: "screening",
      candidate_status: "Triagem",
      updated_at: new Date().toISOString(),
    });
    analysisPipelineMock.mockResolvedValue(null);
    matchToJobMock.mockResolvedValue({
      analysis_id: "analysis-1",
      job_id: "job-1",
      job_fit_score: 77,
      recommendation: "approved",
    });
  });

  it("não carrega jobs gerais automaticamente ao montar o provider", () => {
    renderHook(() => usePipeline(), { wrapper: createWrapper() });

    expect(listJobsMock).not.toHaveBeenCalled();
  });

  it("abrir e fechar drawer não dispara refetch do board", async () => {
    const { result } = renderHook(() => usePipeline(), { wrapper: createWrapper() });

    act(() => {
      result.current.setActiveJob("job-1");
    });

    await waitFor(() => {
      expect(result.current.board?.job_id).toBe("job-1");
    });

    expect(getJobPipelineMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.openCandidate("candidate-1");
    });

    await waitFor(() => {
      expect(result.current.candidateOverview?.candidate.id).toBe("candidate-1");
    });

    expect(getJobPipelineMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.closeCandidate();
    });

    expect(getJobPipelineMock).toHaveBeenCalledTimes(1);
  });

  it("move candidato atualiza apenas as colunas afetadas localmente", async () => {
    const { result } = renderHook(() => usePipeline(), { wrapper: createWrapper() });

    act(() => {
      result.current.setActiveJob("job-1");
    });

    await waitFor(() => {
      expect(result.current.board?.job_id).toBe("job-1");
    });

    const previousFinalColumn = result.current.board!.columns[2];

    await act(async () => {
      await result.current.moveCandidateStage("candidate-1", "screening");
    });

    expect(getJobPipelineMock).toHaveBeenCalledTimes(1);
    const nextBoard = result.current.board!;
    expect(nextBoard.columns[0].candidates).toHaveLength(0);
    expect(nextBoard.columns[1].candidates.map((candidate) => candidate.candidate_id)).toEqual([
      "candidate-1",
      "candidate-2",
    ]);
    expect(nextBoard.columns[1].candidates[0].candidate_status).toBe("Triagem");
    expect(nextBoard.columns[2]).toBe(previousFinalColumn);
  });

  it("erro ao mover candidato restaura o board anterior", async () => {
    moveCandidateStageMock.mockRejectedValueOnce(new Error("Falha ao mover"));

    const { result } = renderHook(() => usePipeline(), { wrapper: createWrapper() });

    act(() => {
      result.current.setActiveJob("job-1");
    });

    await waitFor(() => {
      expect(result.current.board?.job_id).toBe("job-1");
    });

    const originalSnapshot = result.current.board!.columns.map((column) =>
      column.candidates.map((candidate) => candidate.candidate_id),
    );

    let capturedError: unknown = null;

    try {
      await act(async () => {
        await result.current.moveCandidateStage("candidate-1", "screening");
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(Error);
    expect((capturedError as Error).message).toBe("Falha ao mover");

    const restoredSnapshot = result.current.board!.columns.map((column) =>
      column.candidates.map((candidate) => candidate.candidate_id),
    );

    expect(restoredSnapshot).toEqual(originalSnapshot);
  });

  it("conclusão de matching atualiza score do card sem recarregar jobs gerais", async () => {
    const { result } = renderHook(() => usePipeline(), { wrapper: createWrapper() });

    act(() => {
      result.current.setActiveJob("job-1");
    });

    await waitFor(() => {
      expect(result.current.board?.job_id).toBe("job-1");
    });

    expect(getJobPipelineMock).toHaveBeenCalledTimes(1);
    expect(listJobsMock).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.ensureAnalysisMatch({
        analysisId: "analysis-1",
        candidateId: "candidate-1",
        jobId: "job-1",
      });
    });

    const updatedCandidate = result.current.board!.columns[0].candidates[0];
    expect(updatedCandidate.job_fit_score).toBe(77);
    expect(updatedCandidate.recommendation).toBe("approved");
    expect(updatedCandidate.ai_status).toBe("completed");
    expect(listJobsMock).not.toHaveBeenCalled();
    expect(getJobPipelineMock).toHaveBeenCalledTimes(1);
  });
});
