import { httpRequest } from "./http";

export type ManagerJobResponse = {
  id: string;
  title: string;
  candidate_count: number;
  assigned_count: number;
};

export type ManagerCandidateSummary = {
  id: string;
  name: string;
  email: string;
  pipeline_stage: string | null;
  scorecard_status: string | null;
};

export type ManagerScorecardSummary = {
  status: string;
  recommendation: string | null;
  submitted_at: string | null;
};

export type ManagerCandidateDetailResponse = {
  id: string;
  name: string;
  email: string;
  pipeline_stage: string | null;
  scorecard: ManagerScorecardSummary | null;
};

export type ManagerJobListResponse = {
  jobs: ManagerJobResponse[];
};

export type ManagerJobCandidatesResponse = {
  job_id: string;
  candidates: ManagerCandidateSummary[];
};

export type ScorecardFinalRecommendation = "strong_yes" | "yes" | "no" | "strong_no";

export type ScorecardResponse = {
  id: string;
  candidate_id: string;
  job_id: string;
  evaluator_id: string;
  status: "draft" | "submitted";
  final_recommendation: ScorecardFinalRecommendation | null;
  overall_notes: string | null;
  submitted_at: string | null;
  items: Array<{
    id: string;
    competency_name: string;
    question_text: string | null;
    rating: number | null;
    evidence: string | null;
    display_order: number;
  }>;
};

export type ScorecardEnvelopeResponse = {
  scorecard: ScorecardResponse | null;
  suggested_behavioral_questions: string[];
};

export const managerService = {
  listJobs: () =>
    httpRequest<ManagerJobListResponse>("/api/v1/manager/jobs"),

  listCandidates: (jobId: string) =>
    httpRequest<ManagerJobCandidatesResponse>(`/api/v1/manager/jobs/${jobId}/candidates`),

  getCandidateSummary: (jobId: string, candidateId: string) =>
    httpRequest<ManagerCandidateDetailResponse>(`/api/v1/manager/jobs/${jobId}/candidates/${candidateId}/summary`),

  getScorecard: (jobId: string, candidateId: string) =>
    httpRequest<ScorecardEnvelopeResponse>(`/api/v1/jobs/${jobId}/candidates/${candidateId}/interview-scorecard`),

  createScorecard: (jobId: string, candidateId: string, body: { items: Array<{ competency_name: string; question_text?: string; display_order: number }> }) =>
    httpRequest<ScorecardResponse>(`/api/v1/jobs/${jobId}/candidates/${candidateId}/interview-scorecard`, {
      method: "POST",
      body,
    }),

  patchScorecard: (scorecardId: string, body: Partial<{ final_recommendation: ScorecardFinalRecommendation; overall_notes: string; items: Array<{ competency_name: string; rating?: number; evidence?: string; display_order?: number }> }>) =>
    httpRequest<ScorecardResponse>(`/api/v1/interview-scorecards/${scorecardId}`, {
      method: "PATCH",
      body,
    }),

  submitScorecard: (scorecardId: string) =>
    httpRequest<ScorecardResponse>(`/api/v1/interview-scorecards/${scorecardId}/submit`, {
      method: "POST",
    }),
};
