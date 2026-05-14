import { httpRequest } from "./http";
import type { BehavioralAssignmentDetailResponse } from "../types/domain";

export async function getCandidateBehavioralAssessment(
  jobId: string,
  candidateId: string,
): Promise<BehavioralAssignmentDetailResponse | null> {
  try {
    return await httpRequest<BehavioralAssignmentDetailResponse>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/behavioral-assessment`,
    );
  } catch {
    return null;
  }
}
