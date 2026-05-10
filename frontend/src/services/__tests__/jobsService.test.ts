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
});
