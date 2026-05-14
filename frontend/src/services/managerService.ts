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

export const managerService = {
  listJobs: () =>
    httpRequest<ManagerJobListResponse>("/api/v1/manager/jobs"),

  listCandidates: (jobId: string) =>
    httpRequest<ManagerJobCandidatesResponse>(`/api/v1/manager/jobs/${jobId}/candidates`),

  getCandidateSummary: (jobId: string, candidateId: string) =>
    httpRequest<ManagerCandidateDetailResponse>(`/api/v1/manager/jobs/${jobId}/candidates/${candidateId}/summary`),
};
