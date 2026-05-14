import { httpRequest } from "./http";
import type {
  HiringDecision,
  HiringDecisionEnvelope,
  HiringDecisionHistory,
  HiringDecisionPayload,
} from "../types/domain";

export async function getHiringDecision(
  jobId: string,
  candidateId: string,
): Promise<HiringDecisionEnvelope> {
  return httpRequest<HiringDecisionEnvelope>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/hiring-decision`,
  );
}

export async function getHiringDecisionHistory(
  jobId: string,
  candidateId: string,
): Promise<HiringDecisionHistory> {
  return httpRequest<HiringDecisionHistory>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/hiring-decision/history`,
  );
}

export async function createHiringDecision(
  jobId: string,
  candidateId: string,
  payload: HiringDecisionPayload,
): Promise<HiringDecision> {
  return httpRequest<HiringDecision>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/hiring-decision`,
    {
      method: "POST",
      body: payload,
    },
  );
}
