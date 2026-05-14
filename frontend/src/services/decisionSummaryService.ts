import { httpRequest } from "./http";
import type { CandidateFinalDecisionSummary } from "../types/domain";

export async function getCandidateFinalDecisionSummary(
  jobId: string,
  candidateId: string,
): Promise<CandidateFinalDecisionSummary> {
  return httpRequest<CandidateFinalDecisionSummary>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/decision-summary`,
  );
}
