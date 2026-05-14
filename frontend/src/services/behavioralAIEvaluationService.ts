import { httpRequest } from "./http";
import type { BehavioralAIEvaluationResponse } from "../types/domain";

export async function triggerBehavioralAnalysis(
  jobId: string,
  candidateId: string,
): Promise<{ status: string; message: string } | null> {
  try {
    return await httpRequest<{ status: string; message: string }>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/behavioral-assessment/evaluate`,
      {
        method: "POST",
      },
    );
  } catch {
    return null;
  }
}

export async function getBehavioralEvaluation(
  jobId: string,
  candidateId: string,
): Promise<BehavioralAIEvaluationResponse | null> {
  try {
    return await httpRequest<BehavioralAIEvaluationResponse>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/behavioral-assessment/evaluation`,
    );
  } catch {
    return null;
  }
}
