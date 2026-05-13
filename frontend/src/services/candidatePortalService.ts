import { httpRequest } from "./http";

const API_BASE = "/api/v1/public";

export interface CandidatePortalResume {
  resume_id: string;
  resume_version_id: string | null;
  file_name: string | null;
  extraction_status: string | null;
  uploaded_at: string;
}

export interface CandidatePortalCandidateOverview {
  id: string;
  full_name: string;
  cpf_masked: string | null;
  email: string | null;
  email_masked: string | null;
  phone: string | null;
  phone_masked: string | null;
  city: string | null;
  state: string | null;
  application_source: string | null;
  application_source_label: string;
}

export interface CandidatePortalActiveApplication {
  pipeline_id: string;
  job_id: string;
  job_title: string | null;
  pipeline_stage: string;
  status_public: string;
  submitted_at: string;
  current_analysis_id: string | null;
  analysis_status: string | null;
  resume_version_id: string | null;
  resume_filename: string | null;
  is_talent_pool: boolean;
}

export interface CandidatePortalPublicInterview {
  status: string;
  scheduled_at: string | null;
  interview_format: string | null;
  location: string | null;
  meeting_url: string | null;
  public_notes: string | null;
}

export interface CandidatePortalTimelineStep {
  key: string;
  label: string;
  status: "completed" | "current" | "upcoming" | "closed" | string;
  description: string;
  interview: CandidatePortalPublicInterview | null;
}

export interface CandidatePortalTimeline {
  current_step_key: string;
  current_step_label: string;
  steps: CandidatePortalTimelineStep[];
}

export interface CandidateAssessmentSummary {
  id: string;
  type: "behavioral_test" | "behavioral_survey";
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "expired" | "cancelled";
  required: boolean;
  due_at: string | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
}

export interface CandidateAssessmentOption {
  id: string;
  option_text: string;
  order_index: number;
}

export interface CandidateAssessmentQuestion {
  id: string;
  question_text: string;
  question_type: "single_choice" | "multiple_choice" | "scale" | "text";
  required: boolean;
  order_index: number;
  metadata: Record<string, unknown> | null;
  options: CandidateAssessmentOption[];
}

export interface CandidateAssessmentDetail {
  id: string;
  type: "behavioral_test" | "behavioral_survey";
  title: string;
  description: string | null;
  status: CandidateAssessmentSummary["status"];
  required: boolean;
  due_at: string | null;
  questions: CandidateAssessmentQuestion[];
  privacy_notice: string;
}

export interface CandidateAssessmentAnswerPayload {
  question_id: string;
  option_id?: string | null;
  option_ids?: string[] | null;
  answer_text?: string | null;
  answer_value?: unknown;
}

export interface CandidatePortalApplication {
  pipeline_id: string | null;
  job_id: string | null;
  job_title: string | null;
  status: string;
  status_label: string;
  submitted_at: string;
  updated_at: string;
  resume_file_name: string | null;
  analysis_status: string | null;
  application_source: string | null;
  talent_pool: boolean;
  talent_pool_profile_status: string | null;
}

export interface CandidatePortalOverview {
  candidate: CandidatePortalCandidateOverview;
  active_application: CandidatePortalActiveApplication | null;
  application_history: CandidatePortalApplication[];
  latest_resume: CandidatePortalResume | null;
  talent_pool: boolean;
  status_public: string;
  public_timeline: CandidatePortalTimeline | null;
  assessments: CandidateAssessmentSummary[];
}

export interface CandidatePortalLoginPayload {
  email: string;
  password: string;
}

export interface CandidatePortalLoginResponse {
  message: string;
  redirect_to: string;
  session_expires_at: string;
}

export interface CandidatePortalUpdateProfilePayload {
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface CandidatePortalResumeUploadResponse {
  resume_id: string;
  resume_version_id: string;
  extraction_status: string;
  message: string;
}

export const candidatePortalService = {
  login(payload: CandidatePortalLoginPayload) {
    return httpRequest<CandidatePortalLoginResponse>(
      `${API_BASE}/candidate-auth/login`,
      {
        method: "POST",
        withAuth: false,
        body: payload,
      }
    );
  },

  logout() {
    return httpRequest<null>(`${API_BASE}/candidate-auth/logout`, {
      method: "POST",
      withAuth: false,
    });
  },

  getOverview() {
    return httpRequest<CandidatePortalOverview>(`${API_BASE}/candidate-portal/overview`, {
      method: "GET",
      withAuth: false,
    });
  },

  updateProfile(payload: CandidatePortalUpdateProfilePayload) {
    return httpRequest<CandidatePortalOverview>(`${API_BASE}/candidate-portal/profile`, {
      method: "PATCH",
      withAuth: false,
      body: payload,
    });
  },

  uploadResume(formData: FormData) {
    return httpRequest<CandidatePortalResumeUploadResponse>(
      `${API_BASE}/candidate-portal/resume`,
      {
        method: "POST",
        withAuth: false,
        body: formData,
      }
    );
  },

  listAssessments() {
    return httpRequest<CandidateAssessmentSummary[]>(
      `${API_BASE}/candidate-portal/assessments`,
      {
        method: "GET",
        withAuth: false,
      }
    );
  },

  getAssessment(assignmentId: string) {
    return httpRequest<CandidateAssessmentDetail>(
      `${API_BASE}/candidate-portal/assessments/${assignmentId}`,
      {
        method: "GET",
        withAuth: false,
      }
    );
  },

  startAssessment(assignmentId: string) {
    return httpRequest<CandidateAssessmentDetail>(
      `${API_BASE}/candidate-portal/assessments/${assignmentId}/start`,
      {
        method: "POST",
        withAuth: false,
      }
    );
  },

  submitAssessment(assignmentId: string, answers: CandidateAssessmentAnswerPayload[]) {
    return httpRequest<{ id: string; status: string; message: string }>(
      `${API_BASE}/candidate-portal/assessments/${assignmentId}/submit`,
      {
        method: "POST",
        withAuth: false,
        body: { answers },
      }
    );
  },
};
