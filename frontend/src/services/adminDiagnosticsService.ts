import { httpRequest } from "./http";
import type {
  CandidateJobFlowDiagnostic,
  CandidateJobFlowRepairResponse,
} from "../types/adminDiagnostics";

function buildQuery(params: Record<string, string>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    query.set(key, value);
  });
  return query.toString();
}

export const adminDiagnosticsService = {
  getCandidateJobFlowDiagnostic: (candidateId: string, jobId: string) => {
    const query = buildQuery({ candidate_id: candidateId, job_id: jobId });
    return httpRequest<CandidateJobFlowDiagnostic>(
      `/api/v1/admin/diagnostics/candidate-job-flow?${query}`,
    );
  },

  repairCandidateJobFlow: (candidateId: string, jobId: string) => {
    return httpRequest<CandidateJobFlowRepairResponse>(
      "/api/v1/admin/diagnostics/candidate-job-flow/repair",
      {
        method: "POST",
        body: {
          candidate_id: candidateId,
          job_id: jobId,
        },
      },
    );
  },
};
