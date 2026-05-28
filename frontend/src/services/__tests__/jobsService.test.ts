import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
}));

vi.mock("../http", () => ({
  httpRequest: httpRequestMock,
}));

import { getJobPipeline } from "../jobsService";

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
