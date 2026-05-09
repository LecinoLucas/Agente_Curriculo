export type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  internal_notes: string | null;
  tags: string[];
  user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  data_quality_status?: "valid" | "unknown" | "no_resume" | "empty_resume" | "parsing_failed" | "invalid_manual";
  data_quality_reason?: string | null;
  data_quality_marked_at?: string | null;
};

export type CandidateListSummary = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  tags: string[];
  created_at: string;
  resume_count: number;
  linked_job_count: number;
  latest_job_id: string | null;
  latest_job_title: string | null;
  latest_job_stage: string | null;
  latest_relationship_status: string | null;
  active_job_id: string | null;
  active_job_title: string | null;
  active_job_stage: string | null;
  active_job_final_score: number | null;
  ai_status: string | null;
};

export type CandidateResumeOverview = {
  resume_id: string;
  title: string;
  status: string;
  current_version: number;
  current_version_id: string | null;
  current_file_name: string | null;
  extraction_status: string | null;
  updated_at: string;
};

export type CandidateLatestAnalysisOverview = {
  analysis_id: string;
  job_id: string | null;
  resume_id: string;
  resume_title: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded";
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  used_real_ai: boolean | null;
  task_id: string | null;
  worker_id: string | null;
  seniority_level: string | null;
  total_experience_years: number | null;
  created_at: string;
  updated_at: string;
};

export type CandidateLatestAnalysisPipelineOverview = {
  analysis_id: string;
  job_id: string | null;
  matching_status: "waiting_analysis" | "processing" | "completed" | "blocked" | "idle";
  matching_error?: string | null;
  published_jobs_total: number;
  matched_jobs_count: number;
  pending_jobs_count: number;
};

export type CandidateJobMatchOverview = {
  analysis_id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  final_score: number | null;
  recommendation: string | null;
  seniority_level: string | null;
  total_experience_years: number | null;
  created_at: string;
};

export type CandidateActiveJobOverview = {
  id: string;
  title: string;
  status: string;
};

export type CandidateOverview = {
  candidate: Candidate;
  resumes: CandidateResumeOverview[];
  latest_analysis: CandidateLatestAnalysisOverview | null;
  latest_analysis_pipeline: CandidateLatestAnalysisPipelineOverview | null;
  top_matches: CandidateJobMatchOverview[];
  active_job_id: string | null;
  active_job: CandidateActiveJobOverview | null;
  pipeline_entries: CandidatePipelineEntryOverview[];
};

export type CandidatePipelineEntryOverview = {
  candidate_id: string;
  job_id: string;
  job_title: string;
  stage: PipelineStage;
  relationship_status: string;
  is_terminal: boolean;
  terminated_at: string | null;
  termination_reason: string | null;
  candidate_status: string;
  updated_at: string;
};

export type Skill = {
  id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  aliases: string[];
  is_verified: boolean;
  created_at: string;
};

export type JobQualityResult = {
  job_id?: string | null;
  quality_score: number;
  status: "weak" | "acceptable" | "good";
  can_publish: boolean;
  publication_blockers: string[];
  missing_fields: string[];
  suggestions: string[];
  warnings: string[];
};

export type JobSkill = {
  id: string;
  job_id: string;
  skill_id: string;
  skill_name: string;
  is_mandatory: boolean;
  minimum_level: string | null;
  minimum_years: number | null;
  weight: number;
};

export type UserSummary = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string | null;
  avatar_url?: string | null;
};

export type AIModel = {
  id: string;
  provider: string;
  model_id: string;
  model_name: string;
  context_window: number | null;
  is_active: boolean;
  activated_at: string;
  created_at: string;
};

export type PromptTemplate = {
  id: string;
  name: string;
  version: number;
  description: string | null;
  template_type: string;
  is_active: boolean;
  max_tokens: number;
  temperature: number;
  activated_at: string | null;
  created_at: string;
};

export type AnalysisMatch = {
  analysis_id: string;
  job_id: string;
  final_score: number;
  recommendation: string;
  mandatory_skills_matched: number;
  mandatory_skills_total: number;
  optional_skills_matched: number;
  optional_skills_total: number;
  seniority_score: number;
  candidate_seniority: string | null;
  job_seniority: string | null;
  ranking_refresh_status?: "updated" | "skipped" | "failed" | "unknown" | null;
  ranking_freshness_status?: "fresh" | "stale" | null;
  ranking_refreshed_at?: string | null;
  ranking_warning?: string | null;
};

export type ResumeUploadResponse = {
  resume_id: string;
  candidate_id: string;
  version_id: string;
  upload_url: string;
  upload_fields: Record<string, string>;
};

export type ResumeFileUploadResponse = {
  resume_id: string;
  candidate_id: string;
  candidate_full_name: string;
  version_id: string;
  analysis_auto_requested: boolean;
  analysis_id: string | null;
  analysis_status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded" | null;
  original_file_name: string;
  file_size_bytes: number;
  file_hash_sha256: string;
  extraction_status: string;
  page_count: number | null;
  word_count: number | null;
  prefilled_fields: string[];
};

export type ResumeSummary = {
  id: string;
  candidate_id: string;
  candidate_name: string | null;
  title: string;
  status: string;
  current_version: number;
  current_version_id: string | null;
  current_file_name: string | null;
  extraction_status: string | null;
  updated_at: string;
};

export type DealBreaker = {
  field: string;
  operator: "equals" | "not_equals" | "not_contains" | "contains" | "in";
  value?: string | null;
  values?: string[] | null;
  reason: string;
  is_active: boolean;
};

export type Job = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  status: string;
  seniority_level: string | null;
  minimum_education_level: string | null;
  minimum_years_experience: number | null;
  deal_breakers: DealBreaker[];
  work_model: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  job_area: string | null;
  responsibilities: string | null;
  experience_context: string | null;
  behavioral_requirements: string[];
  priority: "low" | "normal" | "high" | "urgent";
  quality_score: number | null;
  quality_status: "weak" | "acceptable" | "good" | null;
  created_by: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_reason_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchingFeedback = {
  job_id: string;
  candidate_id: string;
  liked: boolean | null;
  rejected: boolean | null;
  hired: boolean | null;
  comment: string | null;
  feedback_by: string | null;
  feedback_at: string | null;
};

export type RankingReasonCode = {
  type: string;
  field: string;
  impact: number;
  description: string;
  expected?: string | null;
  actual?: string | null;
  reason?: string | null;
};

export type JobRankingBreakdown = {
  skill_match_score: number;
  experience_match_score: number;
  seniority_match_score: number;
  education_score: number;
  confidence_score: number;
  ai_confidence_score: number;
  penalty_score: number;
  final_score: number;
};

export type JobRankingEntry = {
  rank: number;
  candidate_id: string;
  candidate_name: string;
  stage: string;
  pipeline_status: string;
  score_breakdown: JobRankingBreakdown;
  final_score: number;
  decision_suggestion: "approved" | "review" | "rejected_suggested";
  reason_codes: RankingReasonCode[];
  explanation_text: string;
  entered_at: string | null;
  computed_at: string;
  freshness_status?: "fresh" | "stale";
  score_computed_at?: string | null;
  source_analysis_id?: string | null;
  source_analysis_created_at?: string | null;
  score_model_version?: string | null;
  match_updated_at?: string | null;
  ranking_updated_at?: string | null;
  version: string;
  ranking_version?: string | null;
  data_quality_status?: "valid" | "unknown" | "no_resume" | "empty_resume" | "parsing_failed" | "invalid_manual";
};

export type DataQualityStats = {
  total_candidates: number;
  valid_candidates: number;
  unknown_candidates: number;
  invalid_candidates: number;
  filtered_candidates: number;
};

export type JobRanking = {
  job_id: string;
  total_candidates: number;
  threshold_high: number;
  threshold_low: number;
  score_version: string;
  candidates: JobRankingEntry[];
  data_quality_stats?: DataQualityStats;
};

export type AIAnalysisStatus = "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded";

export type JobCandidate = {
  candidate_id: string;
  candidate_name: string;
  email?: string;
  job_id?: string;
  // Human-controlled: which kanban column the candidate occupies.
  // Only changed by recruiter actions (drag-and-drop, dropdown). Never by AI workers.
  stage?: PipelineStage;
  candidate_status?: string;
  final_score?: number | null;
  recommendation?: string | null;
  seniority_level?: string | null;
  total_experience_years?: number | null;
  top_skills?: string[];
  updated_at?: string;
  // AI-controlled: processing state of the candidate's latest analysis.
  // null means no analysis has been requested yet. Never affects `stage`.
  ai_status?: AIAnalysisStatus | null;
};

export type PipelineStage =
  | "entry"
  | "screening"
  | "hr_interview"
  | "technical_interview"
  | "final"
  | "offer"
  | "hired"
  | "rejected";

export type PipelineColumn = {
  stage: PipelineStage;
  label: string;
  candidates: JobCandidate[];
};

export type JobPipelineBoard = {
  job_id: string;
  columns: PipelineColumn[];
};

export type PipelineTrigger = "manual" | "auto_match" | "system";

export type PipelineStageTransition = {
  id: string;
  candidate_id: string;
  job_id: string;
  from_stage: PipelineStage | null;
  to_stage: PipelineStage;
  moved_by: string | null;
  moved_by_name: string | null;
  moved_at: string;
  trigger: PipelineTrigger;
  notes: string | null;
  reason: string | null;
};

export type CandidatePipelineHistory = {
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  current_stage: PipelineStage;
  status: "active" | "hired" | "rejected" | "transferred";
  entered_at: string | null;
  updated_at: string;
  transitions: PipelineStageTransition[];
};

export type MovePipelineCandidatePayload = {
  stage: PipelineStage;
  notes?: string | null;
  reason?: string | null;
};

export type MovePipelineCandidateResponse = {
  candidate_id: string;
  job_id: string;
  stage: PipelineStage;
  candidate_status: string;
  status: "active" | "hired" | "rejected" | "transferred";
  transition_id: string;
  updated_at: string;
};

export type AddCandidateToJobPayload = {
  job_id: string;
  initial_stage?: PipelineStage;
};

export type AddCandidateToJobResponse = {
  candidate_id: string;
  job_id: string;
  stage: PipelineStage;
  candidate_status: string;
  status: "active" | "hired" | "rejected" | "transferred";
  transition_id: string;
  updated_at: string;
};

export type TransferCandidateJobPayload = {
  from_job_id: string;
  to_job_id: string;
  reason: string;
};

export type TransferCandidateJobResponse = {
  candidate_id: string;
  from_job_id: string;
  to_job_id: string;
  from_stage: PipelineStage;
  to_stage: PipelineStage;
  source_status: "active" | "hired" | "rejected" | "transferred";
  destination_status: "active" | "hired" | "rejected" | "transferred";
  source_transition_id: string;
  destination_transition_id: string;
  updated_at: string;
};

export type AnalysisStatus = {
  analysis_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded";
  retry_count: number;
  failure_reason: string | null;
  next_retry_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  updated_at: string;
};

export type AnalysisPipelineMatch = {
  job_id: string;
  job_title: string;
  job_status: string;
  final_score: number | null;
  recommendation: string | null;
  created_at: string;
};

export type AnalysisPipelineStatus = {
  analysis_id: string;
  job_id: string | null;
  analysis_status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded";
  matching_status: "waiting_analysis" | "processing" | "completed" | "blocked" | "idle";
  matching_error?: string | null;
  published_jobs_total: number;
  matched_jobs_count: number;
  pending_jobs_count: number;
  recent_matches: AnalysisPipelineMatch[];
};

export type AnalysisResult = {
  analysis_id: string;
  resume_id: string | null;
  resume_version_id: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  resume_title: string | null;
  resume_file_name: string | null;
  requested_by: string;
  requested_by_name: string | null;
  worker_id: string | null;
  task_id: string | null;
  used_real_ai: boolean;
  candidate_summary: string | null;
  seniority_level: string | null;
  total_experience_years: number | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  keywords: string[];
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  processing_time_ms: number | null;
  created_at: string;
};

export type ResumeVersion = {
  id: string;
  version_number: number;
  original_file_name: string;
  mime_type: string;
  extraction_status: string;
  uploaded_at: string;
};

export type Resume = {
  id: string;
  candidate_id: string;
  title: string;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
  versions: ResumeVersion[];
};

export type AnalysisGlobalItem = {
  id: string;
  job_id: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  resume_file_name: string | null;
  resume_version_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded";
  failure_reason: string | null;
  discarded_at?: string | null;
  discarded_by?: string | null;
  discard_reason?: string | null;
  discard_reason_note?: string | null;
  used_real_ai: boolean | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
};

export type AnalysisSummary = {
  id: string;
  resume_id: string | null;
  resume_version_id: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  resume_title: string | null;
  resume_file_name: string | null;
  job_id: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | "discarded";
  priority: number;
  retry_count: number;
  requested_by: string;
  requested_by_name: string | null;
  failure_reason: string | null;
  discarded_at?: string | null;
  discarded_by?: string | null;
  discard_reason?: string | null;
  discard_reason_note?: string | null;
  created_at: string;
  updated_at: string;
};
