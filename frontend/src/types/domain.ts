export type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
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
  resume_id: string;
  resume_title: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  overall_score: number | null;
  seniority_level: string | null;
  total_experience_years: number | null;
  created_at: string;
  updated_at: string;
};

export type CandidateLatestAnalysisPipelineOverview = {
  analysis_id: string;
  matching_status: "waiting_analysis" | "processing" | "completed" | "blocked" | "idle";
  published_jobs_total: number;
  matched_jobs_count: number;
  pending_jobs_count: number;
};

export type CandidateJobMatchOverview = {
  analysis_id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  match_score: number | null;
  recommendation: string | null;
  overall_score: number | null;
  seniority_level: string | null;
  total_experience_years: number | null;
  created_at: string;
};

export type CandidateOverview = {
  candidate: Candidate;
  resumes: CandidateResumeOverview[];
  latest_analysis: CandidateLatestAnalysisOverview | null;
  latest_analysis_pipeline: CandidateLatestAnalysisPipelineOverview | null;
  top_matches: CandidateJobMatchOverview[];
  pipeline_entries: CandidatePipelineEntryOverview[];
};

export type CandidatePipelineEntryOverview = {
  candidate_id: string;
  job_id: string;
  job_title: string;
  stage: PipelineStage;
  candidate_status: string;
  match_score: number | null;
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
};

export type AIModel = {
  id: string;
  provider: string;
  model_id: string;
  model_name: string;
  context_window: number | null;
  is_active: boolean;
  activated_at: string;
  deprecated_at: string | null;
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
  match_score: number;
  recommendation: string;
  mandatory_skills_matched: number;
  mandatory_skills_total: number;
  optional_skills_matched: number;
  optional_skills_total: number;
  seniority_score: number;
  candidate_seniority: string | null;
  job_seniority: string | null;
};

export type ResumeUploadResponse = {
  resume_id: string;
  version_id: string;
  upload_url: string;
  upload_fields: Record<string, string>;
};

export type ResumeFileUploadResponse = {
  resume_id: string;
  candidate_id: string;
  candidate_full_name: string;
  version_id: string;
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

export type Job = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  status: string;
  seniority_level: string | null;
  work_model: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AIAnalysisStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type JobCandidate = {
  candidate_id: string;
  candidate_name: string;
  email?: string;
  job_id?: string;
  // Human-controlled: which kanban column the candidate occupies.
  // Only changed by recruiter actions (drag-and-drop, dropdown). Never by AI workers.
  stage?: PipelineStage;
  candidate_status?: string;
  match_score?: number | null;
  recommendation?: string | null;
  overall_score?: number | null;
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

export type AnalysisStatus = {
  analysis_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
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
  match_score: number | null;
  recommendation: string | null;
  created_at: string;
};

export type AnalysisPipelineStatus = {
  analysis_id: string;
  analysis_status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  matching_status: "waiting_analysis" | "processing" | "completed" | "blocked" | "idle";
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
  overall_score: number | null;
  technical_score: number | null;
  experience_score: number | null;
  education_score: number | null;
  communication_score: number | null;
  leadership_score: number | null;
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

export type AnalysisSummary = {
  id: string;
  resume_id: string | null;
  resume_version_id: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  resume_title: string | null;
  resume_file_name: string | null;
  job_id: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  priority: number;
  retry_count: number;
  requested_by: string;
  requested_by_name: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};
