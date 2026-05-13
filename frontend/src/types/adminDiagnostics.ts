export type CandidateJobFlowReasonCode =
  | "flow_consistent"
  | "missing_active_pipeline"
  | "missing_current_analysis"
  | "analysis_not_completed"
  | "completed_analysis_missing_score"
  | "score_source_analysis_mismatch"
  | "match_points_to_inactive_job_profile"
  | "missing_active_job_profile"
  | "ranking_score_unavailable";

export type CandidateJobFlowDiagnostic = {
  candidate_id: string;
  job_id: string;
  active_pipeline_exists: boolean;
  current_analysis_id_exists: boolean;
  current_analysis_exists: boolean;
  current_analysis_status: string | null;
  active_job_profile_exists: boolean;
  match_exists: boolean;
  match_points_to_active_job_profile: boolean;
  score_exists: boolean;
  score_source_analysis_matches_current: boolean;
  candidate_in_ranking: boolean;
  reason_code: CandidateJobFlowReasonCode;
};

export type CandidateJobFlowRepairResponse = {
  candidate_id: string;
  job_id: string;
  repaired: boolean;
  actions: string[];
  before: CandidateJobFlowDiagnostic;
  after: CandidateJobFlowDiagnostic;
};
