import { httpRequest } from "./http";
import type {
  InterviewScorecard,
  InterviewScorecardEnvelope,
  InterviewScorecardPayload,
} from "../types/domain";

export async function getInterviewScorecard(
  jobId: string,
  candidateId: string,
): Promise<InterviewScorecardEnvelope> {
  return httpRequest<InterviewScorecardEnvelope>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/interview-scorecard`,
  );
}

export async function createInterviewScorecard(
  jobId: string,
  candidateId: string,
  payload: InterviewScorecardPayload,
): Promise<InterviewScorecard> {
  return httpRequest<InterviewScorecard>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/interview-scorecard`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updateInterviewScorecard(
  scorecardId: string,
  payload: InterviewScorecardPayload,
): Promise<InterviewScorecard> {
  return httpRequest<InterviewScorecard>(`/api/v1/interview-scorecards/${scorecardId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function submitInterviewScorecard(scorecardId: string): Promise<InterviewScorecard> {
  return httpRequest<InterviewScorecard>(`/api/v1/interview-scorecards/${scorecardId}/submit`, {
    method: "POST",
  });
}
