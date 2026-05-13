import { describe, expect, it, vi } from "vitest";

import { adminDiagnosticsService } from "../adminDiagnosticsService";

const httpRequestMock = vi.fn();

vi.mock("../http", () => ({
  httpRequest: (...args: unknown[]) => httpRequestMock(...args),
}));

describe("adminDiagnosticsService", () => {
  it("chama endpoint de diagnóstico com query candidate_id/job_id", async () => {
    httpRequestMock.mockResolvedValue({});

    await adminDiagnosticsService.getCandidateJobFlowDiagnostic("cand-1", "job-1");

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/diagnostics/candidate-job-flow?candidate_id=cand-1&job_id=job-1",
    );
  });

  it("chama endpoint de repair com payload", async () => {
    httpRequestMock.mockResolvedValue({});

    await adminDiagnosticsService.repairCandidateJobFlow("cand-1", "job-1");

    expect(httpRequestMock).toHaveBeenCalledWith(
      "/api/v1/admin/diagnostics/candidate-job-flow/repair",
      {
        method: "POST",
        body: {
          candidate_id: "cand-1",
          job_id: "job-1",
        },
      },
    );
  });
});
