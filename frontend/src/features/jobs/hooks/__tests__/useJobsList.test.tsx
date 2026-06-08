import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../../../types/domain";

const {
  archiveJobMock,
  closeJobMock,
  deleteJobMock,
  listJobCandidatesMock,
  listJobsMock,
  listPipelineJobsMock,
  pauseJobMock,
  restoreJobMock,
} = vi.hoisted(() => ({
  archiveJobMock: vi.fn(),
  closeJobMock: vi.fn(),
  deleteJobMock: vi.fn(),
  listJobCandidatesMock: vi.fn(),
  listJobsMock: vi.fn(),
  listPipelineJobsMock: vi.fn(),
  pauseJobMock: vi.fn(),
  restoreJobMock: vi.fn(),
}));

vi.mock("../../../../services/jobsService", () => ({
  archiveJob: archiveJobMock,
  closeJob: closeJobMock,
  deleteJob: deleteJobMock,
  listJobCandidates: listJobCandidatesMock,
  listJobs: listJobsMock,
  pauseJob: pauseJobMock,
  restoreJob: restoreJobMock,
}));

vi.mock("../../../../services/pipelineService", () => ({
  pipelineService: {
    listPipelineJobs: listPipelineJobsMock,
  },
}));

vi.mock("../../../../shared/utils/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { useJobsList } from "../useJobsList";

const summary = {
  all: 2,
  published: 2,
  draft: 0,
  paused: 0,
  closed: 0,
  cancelled: 0,
  archived: 0,
  attention: 0,
};

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Desenvolvedor React",
    description: "Vaga para React",
    requirements: null,
    status: "published",
    seniority_level: "senior",
    minimum_education_level: null,
    minimum_years_experience: null,
    deal_breakers: [],
    work_model: "remote",
    location: "São Paulo",
    salary_min: null,
    salary_max: null,
    salary_currency: "BRL",
    job_area: "Tecnologia",
    responsibilities: null,
    experience_context: null,
    behavioral_requirements: [],
    mandatory_skills: ["React"],
    nice_to_have_skills: [],
    screening_questions: [],
    benefits: [],
    working_hours: null,
    priority: "normal",
    quality_score: 90,
    quality_status: "good",
    behavioral_template_id: null,
    selection_flow_type: "standard",
    requires_behavioral_assessment: false,
    requires_behavioral_ai_evaluation: false,
    requires_interview: true,
    requires_scorecard: false,
    requires_manager_review: false,
    created_by: "user-1",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-02T10:00:00Z",
    ...overrides,
  };
}

function mockJobsResponse(jobs: Job[] = [makeJob(), makeJob({ id: "job-2", title: "Pessoa QA" })]) {
  listJobsMock.mockResolvedValue({
    data: jobs,
    total: jobs.length,
    page: 1,
    page_size: 20,
    total_pages: 1,
    summary,
  });
}

describe("useJobsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobsResponse();
    listPipelineJobsMock.mockResolvedValue([
      {
        id: "job-1",
        title: "Desenvolvedor React",
        status: "published",
        total_candidates: 7,
        stage_counts: { entry: 3, screening: 2, offer: 1, hired: 1 },
        latest_activity: "2026-06-05T10:00:00Z",
      },
      {
        id: "job-2",
        title: "Pessoa QA",
        status: "published",
        total_candidates: 2,
        stage_counts: { entry: 2 },
        latest_activity: null,
      },
    ]);
  });

  it("carrega Vagas sem fan-out de candidatos/ranking por vaga", async () => {
    const { result } = renderHook(() => useJobsList());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(listPipelineJobsMock).toHaveBeenCalledTimes(1));

    expect(listJobsMock).toHaveBeenCalledTimes(1);
    expect(listJobCandidatesMock).not.toHaveBeenCalled();
    expect(result.current.jobOperationalData["job-1"]).toMatchObject({
      totalCandidates: 7,
      stageCounts: { entry: 3, screening: 2, offer: 1, hired: 1 },
      latestActivity: "2026-06-05T10:00:00Z",
      strongCandidates: 0,
      topScore: null,
    });
  });

  it("mantem a listagem principal mesmo quando o resumo operacional falha", async () => {
    listPipelineJobsMock.mockRejectedValueOnce(new Error("pipeline indisponivel"));

    const { result } = renderHook(() => useJobsList());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(listPipelineJobsMock).toHaveBeenCalledTimes(1));

    expect(result.current.error).toBeNull();
    expect(result.current.filteredJobs).toHaveLength(2);
    expect(result.current.jobOperationalData).toEqual({});
    expect(listJobCandidatesMock).not.toHaveBeenCalled();
  });

  it("preserva paginacao sem buscar todas as vagas para calculos locais", async () => {
    const { result } = renderHook(() => useJobsList());

    await waitFor(() => expect(result.current.loading).toBe(false));
    listJobsMock.mockClear();

    act(() => {
      result.current.setPage(2);
    });

    await waitFor(() => expect(listJobsMock).toHaveBeenCalledTimes(1));
    expect(listJobsMock).toHaveBeenCalledWith(
      2,
      20,
      expect.objectContaining({
        search: "",
        statusFilter: "all",
      }),
    );
    expect(listJobCandidatesMock).not.toHaveBeenCalled();
  });
});
