import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
}));

vi.mock("../http", () => ({
  httpRequest: httpRequestMock,
}));

import { getJobPipeline, listJobCandidates } from "../jobsService";

describe("getJobPipeline", () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
  });

  it("preserva job_fit_score do board para o card da pipeline", async () => {
    httpRequestMock.mockResolvedValue({
      job_id: "job-1",
      columns: [
        {
          stage: "entry",
          label: "Entrada",
          candidates: [
            {
              candidate_id: "candidate-1",
              candidate_name: "Lecino Lucas",
              job_id: "job-1",
              stage: "entry",
              candidate_status: "Recebido",
              job_fit_score: "51.48",
              top_skills: ["Protheus", "ADVPL", "SQL"],
              updated_at: "2026-05-09T22:11:00.648147Z",
              ai_status: "completed",
            },
          ],
        },
      ],
    });

    const board = await getJobPipeline("job-1");

    expect(board.columns[0].candidates[0].job_fit_score).toBe(51.48);
    expect(board.columns[0].candidates[0].ai_status).toBe("completed");
  });

  it("preserva waiting_extraction no board da pipeline", async () => {
    httpRequestMock.mockResolvedValue({
      job_id: "job-1",
      columns: [
        {
          stage: "entry",
          label: "Entrada",
          candidates: [
            {
              candidate_id: "candidate-1",
              candidate_name: "Larissa Oliveira",
              job_id: "job-1",
              stage: "entry",
              candidate_status: "Recebido",
              job_fit_score: null,
              top_skills: [],
              updated_at: "2026-05-09T22:11:00.648147Z",
              ai_status: "waiting_extraction",
            },
          ],
        },
      ],
    });

    const board = await getJobPipeline("job-1");

    expect(board.columns[0].candidates[0].ai_status).toBe("waiting_extraction");
  });

  it("serializa filtros de data do vínculo da pipeline", async () => {
    httpRequestMock.mockResolvedValue({
      job_id: "job-1",
      columns: [],
    });

    await getJobPipeline("job-1", {
      entered_from: "2026-05-01",
      entered_to: "2026-05-31",
      updated_from: "2026-06-01",
      updated_to: "2026-06-30",
    });

    const [requestUrl] = httpRequestMock.mock.calls[0];
    const url = new URL(requestUrl, "http://localhost");

    expect(url.pathname).toBe("/api/v1/pipeline/job-1");
    expect(url.searchParams.get("entered_from")).toMatch(/^2026-05-01T00:00:00\.000[+-]\d{2}:\d{2}$/);
    expect(url.searchParams.get("entered_to")).toMatch(/^2026-05-31T23:59:59\.999[+-]\d{2}:\d{2}$/);
    expect(url.searchParams.get("updated_from")).toMatch(/^2026-06-01T00:00:00\.000[+-]\d{2}:\d{2}$/);
    expect(url.searchParams.get("updated_to")).toMatch(/^2026-06-30T23:59:59\.999[+-]\d{2}:\d{2}$/);
  });
});

describe("listJobCandidates", () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
  });

  it("usa a paginacao do ranking em vez de buscar tudo e fatiar localmente", async () => {
    httpRequestMock.mockResolvedValue({
      job_id: "job-1",
      total_candidates: 12,
      threshold_high: 70,
      threshold_low: 40,
      score_version: "v1",
      page: 2,
      page_size: 5,
      total_pages: 3,
      candidates: [
        {
          rank: 6,
          candidate_id: "candidate-6",
          candidate_name: "Ana Souza",
          stage: "screening",
          pipeline_status: "Triagem",
          score_breakdown: {
            skill_match_score: 80,
            experience_match_score: 70,
            seniority_match_score: 75,
            education_score: 60,
            confidence_score: 90,
            penalty_score: 0,
            job_fit_score: 78,
          },
          job_fit_score: 78,
          decision_suggestion: "good_match",
          reason_tags: [],
          score_factors: null,
          ranking_summary_text: "",
          computed_at: "2026-06-01T10:00:00Z",
          ranking_freshness_status: "fresh",
          version: "v1",
        },
      ],
    });

    const response = await listJobCandidates("job-1", 2, 5);

    const [requestUrl] = httpRequestMock.mock.calls[0];
    const url = new URL(requestUrl, "http://localhost");

    expect(url.pathname).toBe("/api/v1/jobs/job-1/ranking");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("page_size")).toBe("5");
    expect(response.total).toBe(12);
    expect(response.page).toBe(2);
    expect(response.page_size).toBe(5);
    expect(response.total_pages).toBe(3);
    expect(response.data).toHaveLength(1);
  });
});
