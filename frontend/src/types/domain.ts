export type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  application_source?: string | null;
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
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_reason_note?: string | null;
  data_quality_status?: "valid" | "unknown" | "no_resume" | "empty_resume" | "parsing_failed" | "invalid_manual";
  data_quality_reason?: string | null;
  data_quality_marked_at?: string | null;
};

export type NextInterviewSummary = {
  scheduled_start: string;
  scheduled_end: string;
  interview_type: string;
  interview_format: string;
};

export type CandidateListSummary = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  application_source: string | null;
  tags: string[];
  created_at: string;
  archived_at?: string | null;
  archive_reason?: string | null;
  resume_count: number;
  linked_job_count: number;
  latest_job_id: string | null;
  latest_job_title: string | null;
  latest_job_stage: string | null;
  latest_relationship_status: string | null;
  active_job_id: string | null;
  active_job_title: string | null;
  active_job_stage: string | null;
  active_job_job_fit_score: number | null;
  ai_status: string | null;
  next_interview: NextInterviewSummary | null;
};

export type CommunicationStatus =
  | "draft"
  | "queued"
  | "sent"
  | "failed"
  | "read"
  | "cancelled";

export type CandidateCommunication = {
  id: string;
  candidate_id: string;
  job_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  template_key: string | null;
  channel: "internal" | "email" | string;
  audience: "candidate" | "recruiter" | "manager" | "hr" | string;
  subject: string | null;
  body: string;
  status: CommunicationStatus;
  created_by: string | null;
  created_at: string;
  queued_at: string | null;
  sent_at: string | null;
  read_at: string | null;
  error_message: string | null;
};

export type CommunicationTemplate = {
  id: string;
  key: string;
  channel: "internal" | "email" | string;
  audience: "candidate" | "recruiter" | "manager" | "hr" | string;
  subject_template: string | null;
  body_template: string;
  status: "active" | "inactive" | string;
  created_at: string;
  updated_at: string;
};

export type CommunicationListResponse = {
  communications: CandidateCommunication[];
};

export type CommunicationTemplateListResponse = {
  templates: CommunicationTemplate[];
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
  resume_url?: string | null;
  document_url?: string | null;
};

export type ResumeAnalysisStatus =
  | "waiting_extraction"
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled"
  | "discarded";

export type CandidateLatestAnalysisOverview = {
  analysis_id: string;
  job_id: string | null;
  resume_id: string;
  resume_title: string;
  status: ResumeAnalysisStatus;
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
  analysis_id: string | null;
  job_id: string;
  job_title: string;
  job_status: string;
  job_fit_score: number | null;
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

export type CandidateActiveJobDecision = {
  score_status:
    | "no_active_job"
    | "waiting_analysis"
    | "analysis_processing"
    | "matching_pending"
    | "score_ready"
    | "score_stale"
    | "analysis_failed"
    | "needs_repair";
  analysis_status: string | null;
  current_analysis_id: string | null;
  match_score: number | null;
  warnings: string[];
  next_action: "none" | "wait_analysis" | "review_candidate" | "request_analysis" | "run_repair";
};

export type CandidateSkillPreview = {
  matched_skills: string[];
  attention_points: string[];
};

export type CandidateScoreDimensions = {
  skills?: number | null;
  experience?: number | null;
  seniority?: number | null;
  education?: number | null;
  confidence?: number | null;
};

export type CandidateLatestNoteOverview = {
  note_text: string;
  created_at: string;
};

export type CandidatePreviewPendencyOverview = {
  id: string;
  label: string;
  tone: "warning" | "info" | "block" | string;
  action?: string | null;
  description?: string | null;
  action_payload?: Record<string, unknown> | null;
};

export type CandidateLatestMovementOverview = {
  event_type: string;
  to_stage: PipelineStage | string | null;
  actor_name: string | null;
  moved_at: string;
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
  active_job_decision: CandidateActiveJobDecision | null;
  active_job_skill_preview: CandidateSkillPreview | null;
  active_job_score_dimensions?: CandidateScoreDimensions | null;
  latest_note: CandidateLatestNoteOverview | null;
  preview_pendencies: CandidatePreviewPendencyOverview[];
  latest_movement: CandidateLatestMovementOverview | null;
};

export type CandidateNoteAuthor = {
  id: string | null;
  name: string;
};

export type CandidateNote = {
  id: string;
  candidate_id: string;
  note_text: string;
  visibility: "internal" | string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  can_edit: boolean;
  can_delete: boolean;
  author: CandidateNoteAuthor;
};

export type CandidatePipelineEntryOverview = {
  candidate_id: string;
  job_id: string;
  job_title: string;
  stage: PipelineStage;
  resume_version_id: string | null;
  relationship_status: string;
  is_terminal: boolean;
  terminated_at: string | null;
  termination_reason: string | null;
  candidate_status: string;
  updated_at: string;
};

export type SkillEquivalenceGroup = {
  id: string;
  canonical: string;
  aliases: string[];
  domains: string[];
  type: string | null;
  strength: "exact" | "strong" | "partial" | "weak";
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
  priority_level: "priority" | "complementary" | "eliminatory";
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
  job_fit_score: number;
  recommendation: string;
  mandatory_skills_matched: number;
  mandatory_skills_total: number;
  optional_skills_matched: number;
  optional_skills_total: number;
  seniority_score: number;
  candidate_seniority: string | null;
  job_seniority: string | null;
  match_freshness_status?: "fresh" | "stale" | null;
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
  analysis_status: ResumeAnalysisStatus | null;
  original_file_name: string;
  file_size_bytes: number;
  file_hash_sha256: string;
  extraction_status: string;
  page_count: number | null;
  word_count: number | null;
  prefilled_fields: string[];
};

export type ResumeExtractionStatusResponse = {
  resume_id: string;
  version_id: string;
  extraction_status: string;
  extraction_error: string | null;
  original_file_name: string;
  page_count: number | null;
  word_count: number | null;
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
  mandatory_skills: string[];
  nice_to_have_skills: string[];
  screening_questions: string[];
  benefits: string[];
  working_hours: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  quality_score: number | null;
  quality_status: "weak" | "acceptable" | "good" | null;
  behavioral_template_id: string | null;
  selection_flow_type: "simple" | "standard" | "technical" | "leadership";
  requires_behavioral_assessment: boolean;
  requires_behavioral_ai_evaluation: boolean;
  requires_interview: boolean;
  requires_scorecard: boolean;
  requires_manager_review: boolean;
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

export type RankingReasonTag = {
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
  penalty_score: number;
  job_fit_score: number;
};

export type JobRankingScoreFactorSummaryItem = {
  factor_type: string;
  factor_key: string;
  factor_label: string;
  impact_score: number;
  direction: "positive" | "negative" | "neutral";
};

export type JobRankingScoreFactors = {
  positive: JobRankingScoreFactorSummaryItem[];
  negative: JobRankingScoreFactorSummaryItem[];
  contextual: JobRankingScoreFactorSummaryItem[];
};

export type JobRankingEntry = {
  rank: number;
  candidate_id: string;
  candidate_name: string;
  stage: string;
  pipeline_status: string;
  score_breakdown: JobRankingBreakdown;
  job_fit_score: number;
  decision_suggestion: "approved" | "review" | "rejected_suggested";
  reason_tags: RankingReasonTag[];
  score_factors?: JobRankingScoreFactors;
  data_confidence_score?: number;
  entered_at: string | null;
  computed_at: string;
  ranking_summary_text: string;
  ranking_freshness_status?: "fresh" | "stale";
  match_freshness_status?: "fresh" | "stale";
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
  page?: number;
  page_size?: number;
  total_pages?: number;
};

export type AIAnalysisStatus = ResumeAnalysisStatus;

export type JobCandidate = {
  candidate_id: string;
  candidate_name: string;
  email?: string;
  job_id?: string;
  // Human-controlled: which kanban column the candidate occupies.
  // Only changed by recruiter actions (drag-and-drop, dropdown). Never by AI workers.
  stage?: PipelineStage;
  candidate_status?: string;
  job_fit_score?: number | null;
  recommendation?: string | null;
  seniority_level?: string | null;
  total_experience_years?: number | null;
  current_title?: string | null;
  current_company?: string | null;
  top_skills?: string[];
  entered_at?: string | null;
  updated_at?: string;
  // AI-controlled: processing state of the candidate's latest analysis.
  // null means no analysis has been requested yet. Never affects `stage`.
  ai_status?: AIAnalysisStatus | null;
  requires_behavioral_assessment?: boolean | null;
  requires_behavioral_ai_evaluation?: boolean | null;
  requires_interview?: boolean | null;
  requires_scorecard?: boolean | null;
  behavioral_assessment_status?: string | null;
  behavioral_submitted_at?: string | null;
  behavioral_ai_evaluation_status?: string | null;
  interview_status?: string | null;
  interview_scheduled_start?: string | null;
  interview_scorecard_status?: string | null;
};

export type PipelineStage =
  | "entry"
  | "screening"
  | "hr_interview"
  | "technical_interview"
  | "final"
  | "offer"
  | "hired"
  | "pre_admission"
  | "protheus"
  | "admitted"
  | "rejected";

export const POST_HIRING_ACTIVE_STAGES = new Set<PipelineStage>([
  "hired",
  "pre_admission",
  "protheus",
]);

export const SUCCESS_TERMINAL_STAGES = new Set<PipelineStage>(["admitted"]);

export const TRANSFER_ALLOWED_STAGES: PipelineStage[] = ["entry", "screening"];

export type PipelineColumn = {
  stage: PipelineStage;
  label: string;
  candidates: JobCandidate[];
};

export type JobPipelineBoard = {
  job_id: string;
  columns: PipelineColumn[];
  // True when the backend capped the result at PIPELINE_BOARD_MAX_ROWS.
  truncated?: boolean;
};

export type PipelineBoardFilters = {
  entered_from?: string;
  entered_to?: string;
  updated_from?: string;
  updated_to?: string;
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

export type CandidateProcessHistoryInterview = {
  id: string;
  type: string;
  status: string;
  scheduled_at: string | null;
  scorecard_status: string | null;
  final_recommendation: string | null;
};

export type CandidateProcessHistoryScorecard = {
  id: string;
  interview_id: string | null;
  status: string;
  final_recommendation: string | null;
  submitted_at: string | null;
};

export type CandidateProcessHistoryBehavioral = {
  assignment_id: string;
  status: string;
  submitted_at: string | null;
  ai_status: string | null;
  ai_completed_at: string | null;
};

export type CandidateProcessHistoryDecision = {
  id: string;
  status: string;
  outcome: string;
  submitted_at: string | null;
};

export type CandidateProcessHistoryItem = {
  pipeline_id: string;
  job_id: string;
  job_title: string;
  is_current: boolean;
  started_at: string | null;
  closed_at: string | null;
  current_or_final_stage: PipelineStage | string;
  result_label: string;
  closure_reason: string | null;
  events_count: number;
  interviews: CandidateProcessHistoryInterview[];
  scorecards: CandidateProcessHistoryScorecard[];
  behavioral_assessment: CandidateProcessHistoryBehavioral | null;
  hiring_decision: CandidateProcessHistoryDecision | null;
};

export type CandidateProcessHistory = {
  candidate_id: string;
  processes: CandidateProcessHistoryItem[];
};

export type MovePipelineCandidatePayload = {
  stage: PipelineStage;
  notes?: string | null;
  reason?: string | null;
  // Admin-only escape hatch. Backend rejects with 403 if the caller is not an
  // admin and with 422 if the justification is missing or shorter than the
  // server-side minimum.
  force?: boolean;
  force_reason?: string | null;
};

export type MovePipelineCandidateResponse = {
  candidate_id: string;
  job_id: string;
  stage: PipelineStage;
  candidate_status: string;
  status: "active" | "hired" | "rejected" | "transferred";
  transition_id: string;
  updated_at: string;
  required_action?: "open_pre_admission" | null;
  pre_admission_case_id?: string | null;
  analysis?: PipelineAnalysisDecision | null;
};

export type AddCandidateToJobPayload = {
  job_id: string;
  initial_stage?: PipelineStage;
};

export type ReconsiderCandidateJobPayload = {
  job_id: string;
  initial_stage?: PipelineStage;
  reason: string;
};

export type PipelineAnalysisDecision = {
  analysis_id: string | null;
  status:
    | "pending"
    | "processing"
    | "retry_scheduled"
    | "completed"
    | "failed"
    | "cancelled"
    | "discarded"
    | null;
  created: boolean;
  blocked: boolean;
  reused: boolean;
  stuck: boolean;
  reason: string;
  stage: PipelineStage | null;
  trigger_source: "automatic" | "manual";
};

export type AddCandidateToJobResponse = {
  candidate_id: string;
  job_id: string;
  stage: PipelineStage;
  candidate_status: string;
  status: "active" | "hired" | "rejected" | "transferred";
  transition_id: string;
  updated_at: string;
  analysis?: PipelineAnalysisDecision | null;
};

export type ReconsiderCandidateJobResponse = AddCandidateToJobResponse;

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
  analysis?: PipelineAnalysisDecision | null;
};

export type AnalysisStatus = {
  analysis_id: string;
  status: ResumeAnalysisStatus;
  retry_count: number;
  stuck: boolean;
  reason: string | null;
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
  job_fit_score: number | null;
  recommendation: string | null;
  created_at: string;
};

export type AnalysisPipelineStatus = {
  analysis_id: string;
  job_id: string | null;
  analysis_status: ResumeAnalysisStatus;
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

export type CandidateResumeDownloadUrl = {
  url: string;
  expires_at: string | null;
  content_type: string;
  filename: string;
};

export type AnalysisGlobalItem = {
  id: string;
  type?: "resume" | "behavioral_ai";
  job_id: string | null;
  job_title?: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  resume_file_name: string | null;
  resume_version_id: string | null;
  status: ResumeAnalysisStatus;
  failure_reason: string | null;
  discarded_at?: string | null;
  discarded_by?: string | null;
  discard_reason?: string | null;
  discard_reason_note?: string | null;
  used_real_ai: boolean | null;
  retry_count: number;
  next_retry_at: string | null;
  provider_error_type: string | null;
  provider_status_code: number | null;
  provider?: string | null;
  model?: string | null;
  stuck: boolean;
  reason: string | null;
  created_at: string;
  updated_at?: string | null;
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
  status: ResumeAnalysisStatus;
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

export type BehavioralTemplateQuestion = {
  id: string;
  competency_id: string;
  question_text: string;
  answer_type: "text" | "scale" | "multiple_choice";
  is_required: boolean;
  weight: number;
  display_order: number;
  options_json: string[] | null;
};

export type BehavioralTemplateCompetency = {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  weight: number;
  display_order: number;
  question_count: number;
  questions?: BehavioralTemplateQuestion[];
};

export type BehavioralAssessmentTemplate = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  version: number;
  competency_count: number;
  question_count: number;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
  competencies?: BehavioralTemplateCompetency[];
};

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type AdmittedCandidate = {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string | null;
  job_id: string;
  job_title: string;
  pipeline_id: string | null;
  admission_case_id: string;
  admission_status: string;
  admitted_at: string;
  dismissed_at: string | null;
  start_date: string | null;
  work_model: string | null;
};

export type AdmittedCandidatesSummary = {
  total_admitted: number;
  admitted_this_month: number;
  latest_admitted_at: string | null;
};

export type AdmittedCandidatesPage = PaginatedResponse<AdmittedCandidate> & {
  summary: AdmittedCandidatesSummary;
};

export type BehavioralAssignmentAnswer = {
  answer_text: string | null;
  answer_value: number | null;
  selected_options_json: string[] | null;
  updated_at?: string;
};

export type BehavioralAssignmentQuestion = {
  id: string;
  question_text: string;
  answer_type: "text" | "scale" | "multiple_choice";
  is_required: boolean;
  display_order: number;
  options_json: string[] | null;
  answer: BehavioralAssignmentAnswer | null;
};

export type BehavioralAssignmentCompetency = {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  questions: BehavioralAssignmentQuestion[];
};

export type BehavioralAssignmentDetailResponse = {
  id: string;
  candidate_id: string;
  job_id: string;
  template_id: string;
  template_name: string;
  job_title?: string | null;
  status: "pending" | "in_progress" | "submitted" | "expired" | "cancelled";
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  expires_at?: string | null;
  answered_count: number;
  question_count: number;
  competencies: BehavioralAssignmentCompetency[];
};

export type BehavioralCompetencySignal = {
  competency: string;
  signal: "weak" | "moderate" | "strong";
  evidence: string;
  concerns: string[];
};

export type BehavioralRiskFlag = {
  code: string;
  message: string;
};

export type BehavioralAIEvaluationResponse = {
  id: string;
  assignment_id: string;
  status: "pending" | "processing" | "retry_scheduled" | "completed" | "failed";
  confidence?: "low" | "medium" | "high" | null;
  summary?: string | null;
  strengths?: string[] | null;
  concerns?: string[] | null;
  competency_signals?: BehavioralCompetencySignal[] | null;
  suggested_interview_questions?: string[] | null;
  risk_flags?: BehavioralRiskFlag[] | null;
  error_message?: string | null;
  queued_at?: string | null;
  started_at?: string | null;
  failed_at?: string | null;
  next_retry_at?: string | null;
  retry_count?: number | null;
  provider?: string | null;
  model?: string | null;
  provider_error_type?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

export type InterviewFinalRecommendation =
  | "strong_yes"
  | "yes"
  | "neutral"
  | "no"
  | "strong_no";

export type InterviewScorecardStatus = "draft" | "submitted";

export type InterviewScorecardItem = {
  id: string;
  scorecard_id: string;
  competency_name: string;
  question_text: string | null;
  rating: number | null;
  evidence: string | null;
  weight: number | string;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type InterviewScorecard = {
  id: string;
  candidate_id: string;
  job_id: string;
  interview_id: string | null;
  evaluator_id: string | null;
  status: InterviewScorecardStatus;
  final_recommendation: InterviewFinalRecommendation | null;
  overall_notes: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  items: InterviewScorecardItem[];
};

export type InterviewScorecardItemInput = {
  id?: string | null;
  competency_name: string;
  question_text?: string | null;
  rating?: number | null;
  evidence?: string | null;
  weight?: number;
  display_order?: number;
};

export type InterviewScorecardPayload = {
  interview_id?: string | null;
  final_recommendation?: InterviewFinalRecommendation | null;
  overall_notes?: string | null;
  items?: InterviewScorecardItemInput[];
};

export type InterviewScorecardEnvelope = {
  scorecard: InterviewScorecard | null;
  scorecards?: InterviewScorecard[];
  suggested_behavioral_questions: string[];
};

export type CandidateFinalDecisionReadinessStatus =
  | "missing_job_match"
  | "waiting_behavioral_assessment"
  | "waiting_behavioral_ai"
  | "waiting_interview_scorecard"
  | "ready_for_human_decision"
  | "needs_attention";

export type CandidateFinalDecisionSummary = {
  candidate_id: string;
  job_id: string;
  active_job_decision: {
    score_status: string;
    match_score: number | null;
    freshness_status: "current" | "stale" | "missing";
    warnings: string[];
  };
  behavioral_assessment: {
    template_required: boolean;
    assignment_status: string | null;
    answered_count: number;
    question_count: number;
    submitted_at: string | null;
    ai_evaluation_status: string | null;
    ai_confidence: string | null;
    ai_summary: string | null;
  };
  interview_scorecard: {
    status: InterviewScorecardStatus | null;
    final_recommendation: InterviewFinalRecommendation | null;
    average_rating: number | null;
    submitted_at: string | null;
  };
  interview?: {
    id: string | null;
    status: string | null;
    interview_type: string | null;
    scheduled_start: string | null;
    scheduled_end: string | null;
  };
  decision_readiness: {
    status: CandidateFinalDecisionReadinessStatus;
    missing_items: string[];
    warnings: string[];
    next_action: string;
  };
};

export type HiringDecisionStatus = "draft" | "submitted" | "superseded";

export type HiringDecisionOutcome =
  | "advance"
  | "hold"
  | "reject"
  | "hire"
  | "request_another_interview"
  | "keep_under_review";

export type HiringDecisionReasonCode =
  | "strong_fit"
  | "partial_fit"
  | "missing_required_skill"
  | "salary_mismatch"
  | "availability_mismatch"
  | "behavioral_concern"
  | "interview_concern"
  | "better_candidates"
  | "candidate_withdrew"
  | "other";

export type HiringDecisionPipelineStage =
  | "entry"
  | "screening"
  | "hr_interview"
  | "technical_interview"
  | "final"
  | "offer"
  | "hired"
  | "pre_admission"
  | "protheus"
  | "rejected";

export type HiringDecisionPipelineActionPayload = {
  enabled: boolean;
  target_stage?: HiringDecisionPipelineStage | null;
  reason?: string | null;
};

export type HiringDecisionPayload = {
  decision_outcome: HiringDecisionOutcome;
  reason_code: HiringDecisionReasonCode;
  notes?: string | null;
  submit?: boolean;
  pipeline_action?: HiringDecisionPipelineActionPayload | null;
};

export type HiringDecision = {
  id: string;
  candidate_id: string;
  job_id: string;
  pipeline_id: string | null;
  decided_by: string | null;
  decision_status: HiringDecisionStatus;
  decision_outcome: HiringDecisionOutcome;
  reason_code: HiringDecisionReasonCode;
  notes: string | null;
  based_on_decision_summary_snapshot: Record<string, unknown> | null;
  based_on_scorecard_id: string | null;
  based_on_behavioral_assignment_id: string | null;
  based_on_behavioral_ai_evaluation_id: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  pipeline_transition_id?: string | null;
};

export type HiringDecisionEnvelope = {
  decision: HiringDecision | null;
};

export type HiringDecisionHistory = {
  decisions: HiringDecision[];
};

export type PreAdmissionStatus =
  | "draft"
  | "offer_preparing"
  | "offer_sent"
  | "offer_accepted"
  | "offer_declined"
  | "documents_pending"
  | "documents_received"
  | "ready_for_admission"
  | "admitted"
  | "dismissed"
  | "cancelled";

export type PreAdmissionChecklistItemType = string;

export type PreAdmissionChecklistItemStatus =
  | "pending"
  | "received"
  | "approved"
  | "rejected"
  | "waived";

export type PreAdmissionDocumentStatus =
  | "uploaded"
  | "approved"
  | "rejected"
  | "replaced";

export type PreAdmissionDocument = {
  id: string;
  case_id: string;
  checklist_item_id: string;
  candidate_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: PreAdmissionDocumentStatus;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  rejection_reason_public: string | null;
  created_at: string;
  updated_at: string;
};

export type PreAdmissionChecklistItem = {
  id: string;
  case_id: string;
  template_item_id?: string | null;
  document_key: string;
  item_type: PreAdmissionChecklistItemType;
  title: string;
  status: PreAdmissionChecklistItemStatus;
  required: boolean;
  notes: string | null;
  candidate_description?: string | null;
  accepted_file_types: string[];
  max_file_size_mb: number;
  display_order: number;
  created_at: string;
  updated_at: string;
  documents?: PreAdmissionDocument[];
};

export type PreAdmissionCase = {
  id: string;
  candidate_id: string;
  job_id: string;
  hiring_decision_id: string;
  checklist_template_id?: string | null;
  checklist_template_name?: string | null;
  status: PreAdmissionStatus;
  salary_offer: string | number | null;
  start_date: string | null;
  work_model: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
  checklist_items: PreAdmissionChecklistItem[];
};

export type PreAdmissionEvent = {
  id: string;
  case_id: string;
  event_type: string;
  actor_id: string | null;
  payload_json: Record<string, unknown> | null;
  created_at: string;
};

export type PreAdmissionEnvelope = {
  case: PreAdmissionCase | null;
  hiring_decision_outcome: HiringDecisionOutcome | string | null;
  can_create: boolean;
};

export type PreAdmissionPayload = {
  checklist_template_id?: string | null;
  salary_offer?: string | number | null;
  start_date?: string | null;
  work_model?: string | null;
  notes?: string | null;
};

export type PreAdmissionUpdatePayload = PreAdmissionPayload & {
  status?: PreAdmissionStatus | null;
};

export type PreAdmissionChecklistItemPayload = {
  item_type: PreAdmissionChecklistItemType;
  document_key?: string | null;
  title: string;
  status?: PreAdmissionChecklistItemStatus;
  required?: boolean;
  notes?: string | null;
  candidate_description?: string | null;
  accepted_file_types?: string[] | null;
  max_file_size_mb?: number | null;
  display_order?: number | null;
};

export type PreAdmissionChecklistItemUpdatePayload = Partial<PreAdmissionChecklistItemPayload>;

export type PreAdmissionChecklistTemplateItem = {
  id: string;
  template_id: string;
  document_key: string;
  title: string;
  candidate_description: string | null;
  is_required: boolean;
  accepted_file_types: string[];
  max_file_size_mb: number;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PreAdmissionChecklistTemplate = {
  id: string;
  name: string;
  description: string | null;
  admission_type: string | null;
  is_active: boolean;
  is_default: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type PreAdmissionChecklistTemplateDetail = PreAdmissionChecklistTemplate & {
  items: PreAdmissionChecklistTemplateItem[];
};

export type PreAdmissionChecklistTemplatePayload = {
  name: string;
  description?: string | null;
  admission_type?: string | null;
  is_active?: boolean;
  is_default?: boolean;
};

export type PreAdmissionChecklistTemplateUpdatePayload = Partial<PreAdmissionChecklistTemplatePayload>;

export type PreAdmissionChecklistTemplateItemPayload = {
  document_key: string;
  title: string;
  candidate_description?: string | null;
  is_required?: boolean;
  accepted_file_types?: string[] | null;
  max_file_size_mb?: number;
  display_order?: number | null;
  is_active?: boolean;
};

export type PreAdmissionChecklistTemplateItemUpdatePayload =
  Partial<PreAdmissionChecklistTemplateItemPayload>;

export type PreAdmissionEventsResponse = {
  events: PreAdmissionEvent[];
};

export type PreAdmissionDocumentsResponse = {
  documents: PreAdmissionDocument[];
};

export type AdmissionWorkspaceCaseStatus = PreAdmissionStatus | "in_progress";

export type AdmissionWorkspaceStage =
  | "hired"
  | "pre_admission"
  | "protheus"
  | "admitted"
  | "rejected"
  | string;

export type AdmissionWorkspaceChecklistItemStatus =
  | "pending"
  | "received"
  | "approved"
  | "rejected"
  | "not_required";

export type AdmissionWorkspaceBlockerSeverity = "high" | "medium" | "low" | string;

export type AdmissionWorkspaceReadinessStatus = "ready" | "not_ready" | string;

export type AdmissionWorkspaceDocumentStatus =
  | PreAdmissionDocumentStatus
  | "pending"
  | string;

export type AdmissionWorkspaceCase = {
  id: string;
  status: AdmissionWorkspaceCaseStatus;
  current_stage: AdmissionWorkspaceStage;
  created_at: string;
  updated_at: string;
};

export type AdmissionWorkspaceCandidate = {
  id: string;
  name: string;
  initials: string;
  avatar_url: string | null;
};

export type AdmissionWorkspaceJob = {
  id: string;
  title: string;
};

export type AdmissionWorkspaceChecklistItem = {
  id: string;
  title: string;
  status: AdmissionWorkspaceChecklistItemStatus;
  required: boolean;
  position: number;
  updated_at: string;
  updated_by_name: string | null;
  document_id: string | null;
};

export type AdmissionWorkspaceChecklist = {
  total: number;
  approved: number;
  pending: number;
  blocked: number;
  items: AdmissionWorkspaceChecklistItem[];
};

export type AdmissionWorkspaceDocument = {
  id: string;
  checklist_item_id: string;
  checklist_title: string;
  required: boolean;
  filename: string;
  document_type: PreAdmissionChecklistItemType | string;
  mime_type: string;
  size_bytes: number;
  status: AdmissionWorkspaceDocumentStatus;
  uploaded_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_notes: string | null;
  rejection_reason_public: string | null;
  approved_at: string | null;
  is_current_for_item: boolean;
};

export type AdmissionWorkspaceBlocker = {
  type: string;
  severity: AdmissionWorkspaceBlockerSeverity;
  title: string;
  description: string;
  action: string;
};

export type AdmissionWorkspaceNextAction = {
  type: string;
  label: string;
  enabled: boolean;
  disabled_reason?: string | null;
};

export type AdmissionWorkspaceSummary = {
  responsible_name: string | null;
  created_at: string;
  last_update_at: string;
  readiness_status: AdmissionWorkspaceReadinessStatus;
  ready_for_export: boolean;
};

export type AdmissionWorkspaceRecentEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
  actor_name?: string | null;
};

export type AdmissionCaseOverviewProgress = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  in_review: number;
  waived: number;
};

export type AdmissionCaseOverviewIntegrationStatus = {
  state: string;
  label: string;
  ready_for_export: boolean;
};

export type AdmissionCaseOverview = {
  case: AdmissionWorkspaceCase;
  candidate: AdmissionWorkspaceCandidate;
  job: AdmissionWorkspaceJob;
  status_label: string;
  progress: AdmissionCaseOverviewProgress;
  main_blocker: AdmissionWorkspaceBlocker | null;
  main_blockers: AdmissionWorkspaceBlocker[];
  next_action: AdmissionWorkspaceNextAction | null;
  next_actions: AdmissionWorkspaceNextAction[];
  summary: AdmissionWorkspaceSummary;
  integration_status: AdmissionCaseOverviewIntegrationStatus;
  updated_at: string;
};

export type AdmissionCaseDocumentsPayload = {
  checklist: AdmissionWorkspaceChecklist;
  documents: AdmissionWorkspaceDocument[];
};

export type AdmissionCaseEventsPage = {
  items: AdmissionWorkspaceRecentEvent[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
};

export type AdmissionProtheusBridgeLatestTrace = {
  trace_id: string | null;
  action_type: string | null;
  status: string | null;
  blocked_reason: string | null;
  error_code: string | null;
  created_at: string | null;
};

export type AdmissionProtheusBridgeSafety = {
  would_execute: boolean;
  protheus_registration: string | null;
  erp_send_attempted: boolean;
  registration_routine_called: boolean;
};

export type AdmissionProtheusBridgeSummaryStatus =
  | "ready"
  | "warning"
  | "blocked"
  | "unavailable"
  | "disabled"
  | string;

export type AdmissionProtheusBridgeSummary = {
  enabled: boolean;
  available: boolean;
  status: AdmissionProtheusBridgeSummaryStatus;
  message: string | null;
  environment: string | null;
  storage_mode: string | null;
  readiness: string | null;
  latest_trace: AdmissionProtheusBridgeLatestTrace | null;
  safety: AdmissionProtheusBridgeSafety;
  next_action: string;
  dashboard_url: string;
};

export type AdmissionCaseWorkspace = {
  case: AdmissionWorkspaceCase;
  candidate: AdmissionWorkspaceCandidate;
  job: AdmissionWorkspaceJob;
  checklist: AdmissionWorkspaceChecklist;
  documents: AdmissionWorkspaceDocument[];
  main_blockers: AdmissionWorkspaceBlocker[];
  next_actions: AdmissionWorkspaceNextAction[];
  summary: AdmissionWorkspaceSummary;
  recent_events: AdmissionWorkspaceRecentEvent[];
};

// Admission Packages
export type AdmissionPackageStatus =
  | "draft"
  | "ready_for_review"
  | "approved_for_export"
  | "exported"
  | "cancelled";

export type AdmissionPackageValidationError = {
  field: string;
  message: string;
};

export type AdmissionPackageCandidateData = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
};

export type AdmissionPackageJobData = {
  id: string | null;
  title: string | null;
  company: string | null;
  department?: string | null;
  location?: string | null;
};

export type AdmissionPackagePreAdmissionData = {
  case_id: string;
  status: string;
  start_date: string | null;
  salary_offer: number | null;
  work_model: string | null;
};

export type AdmissionPackageDocumentData = {
  checklist_item_id: string;
  title: string;
  status: PreAdmissionChecklistItemStatus;
  document_id: string;
  mime_type: string;
  size_bytes: number;
};

export type AdmissionPackageDecisionData = {
  hiring_decision_id: string | null;
  decision_outcome: HiringDecisionOutcome | string | null;
  reason_code: string | null;
  submitted_at: string | null;
};

export type AdmissionPackagePayload = {
  candidate: AdmissionPackageCandidateData;
  job: AdmissionPackageJobData;
  pre_admission: AdmissionPackagePreAdmissionData;
  documents: AdmissionPackageDocumentData[];
  decision: AdmissionPackageDecisionData;
};

export type AdmissionPackage = {
  id: string;
  case_id: string;
  candidate_id: string;
  job_id: string;
  status: AdmissionPackageStatus;
  payload: AdmissionPackagePayload;
  validation_errors: AdmissionPackageValidationError[] | null;
  created_by: string | null;
  approved_by: string | null;
  exported_by: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  exported_at: string | null;
  cancelled_at: string | null;
};

export type ErpIntegrationAttemptMode = "dry_run" | "mock" | "real";

export type ErpIntegrationAttemptStatus =
  | "draft"
  | "validation_failed"
  | "ready"
  | "simulated"
  | "failed"
  | "sent";

export type ErpDryRunPayloadPreview = {
  provider: string;
  mode: ErpIntegrationAttemptMode;
  candidate: {
    name: string | null;
    email: string | null;
    cpf: string | null;
  };
  job: {
    title: string | null;
    department: string | null;
  };
  admission: {
    start_date: string | null;
    salary_offer: number | null;
    work_model: string | null;
  };
  decision: {
    hiring_decision_id: string | null;
  };
  documents: Array<{
    title: string | null;
    status: string | null;
    document_id: string | null;
  }>;
};

export type ErpIntegrationAttemptValidationError = {
  field: string;
  message: string;
};

export type ErpIntegrationAttemptErrorSummary = {
  code: string;
  message: string;
  stage?: string | null;
  field?: string | null;
  retryable?: boolean;
  http_status?: number | null;
  timestamp?: string | null;
};

export type ErpIntegrationAttempt = {
  id: string;
  package_id: string;
  case_id: string;
  candidate_id: string;
  job_id: string;
  provider: string;
  mode: ErpIntegrationAttemptMode;
  status: ErpIntegrationAttemptStatus;
  lifecycle_status?: string;
  retryable?: boolean;
  idempotency_key?: string | null;
  external_reference?: string | null;
  http_status?: number | null;
  request_headers_json?: Record<string, unknown> | null;
  response_headers_json?: Record<string, unknown> | null;
  attempt_number?: number;
  request_payload_json: ErpDryRunPayloadPreview;
  response_payload_json: {
    success?: boolean;
    external_reference?: string;
    message?: string;
    [key: string]: unknown;
  } | null;
  validation_errors_json: ErpIntegrationAttemptValidationError[] | null;
  error_message: string | null;
  error_summary?: ErpIntegrationAttemptErrorSummary | null;
  attempted_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ErpIntegrationAttemptListResponse = {
  attempts: ErpIntegrationAttempt[];
};

export type ProtheusCapabilityState = {
  available: boolean;
  disabled_reason: string | null;
};

export type ProtheusRealSendCapabilityState = ProtheusCapabilityState & {
  missing_configuration: string[];
  blocking_flags: string[];
};

export type ProtheusCapabilities = {
  provider: "protheus";
  environment: string;
  integration_mode: "disabled" | "dry_run" | "mock" | "real" | string;
  dry_run: ProtheusCapabilityState;
  simulation: ProtheusCapabilityState;
  mock: ProtheusCapabilityState;
  real_send: ProtheusRealSendCapabilityState;
};

// Manager View Types
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

export type CollaborationComment = {
  id: string;
  author_id: string | null;
  author_role: string;
  comment_type: string;
  recommendation: string | null;
  message: string;
  target_manager_id?: string | null;
  priority?: "low" | "medium" | "high" | null;
  created_at: string;
};

export type CollaborationListResponse = {
  comments: CollaborationComment[];
};

export type CreateCommentRequest = {
  message: string;
  comment_type?: string;
  recommendation?: string;
};

export type ManagerFeedbackRequest = {
  message: string;
  recommendation: "advance" | "hold" | "reject" | "request_interview";
};

export type ReviewRequestItem = {
  request_id: string;
  candidate_id: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  requested_by: string | null;
  requested_at: string;
  latest_message: string;
  status: "pending" | "answered";
  priority: "low" | "medium" | "high" | null;
  target_manager_id: string | null;
  target_manager_name: string | null;
  is_directed_to_me: boolean;
  pipeline_stage: string | null;
  interview_status: string | null;
  scorecard_status: string | null;
};

export type ManagerListItem = {
  id: string;
  name: string;
  email: string;
  role: "manager";
};

export type ManagerListResponse = {
  managers: ManagerListItem[];
};

export type ReviewRequestListResponse = {
  requests: ReviewRequestItem[];
};
