import { API_BASE_URL, httpRequest, HttpError } from "./http";
import type {
  PreAdmissionChecklistItem,
  PreAdmissionDocument,
  PreAdmissionStatus,
} from "../types/domain";

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

export interface BehavioralAssignmentAnswer {
  question_id: string;
  answer_text: string | null;
  answer_value: number | null;
  selected_options_json: string[] | null;
}

export interface BehavioralAssignmentQuestion {
  id: string;
  question_text: string;
  answer_type: "text" | "scale" | "multiple_choice" | string;
  is_required: boolean;
  display_order: number;
  options_json: string[] | Record<string, unknown> | null;
  answer: BehavioralAssignmentAnswer | null;
}

export interface BehavioralAssignmentCompetency {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  questions: BehavioralAssignmentQuestion[];
}

export interface BehavioralAssignmentSummary {
  id: string;
  candidate_id: string;
  job_id: string;
  job_title: string | null;
  template_id: string;
  template_name: string;
  status: "pending" | "in_progress" | "submitted" | "expired" | "cancelled" | string;
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  expires_at: string | null;
  ai_evaluation_status?: "pending" | "processing" | "completed" | "failed" | null;
  answered_count: number;
  question_count: number;
}

export interface BehavioralAssignmentDetail extends BehavioralAssignmentSummary {
  competencies: BehavioralAssignmentCompetency[];
}

export interface BehavioralAssignmentAnswerPayload {
  question_id: string;
  answer_text?: string | null;
  answer_value?: number | null;
  selected_options_json?: string[] | null;
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
  application_status: "active" | "rejected" | "hired" | "talent_pool" | "no_active_application" | string;
  current_process_status_label: string;
  is_process_closed: boolean;
  closed_reason_public_label: string | null;
  can_request_contact: boolean;
  can_apply_to_other_jobs: boolean;
  public_timeline: CandidatePortalTimeline | null;
}

export interface CandidatePortalPreAdmissionCase {
  id: string;
  status: PreAdmissionStatus;
  salary_offer: string | number | null;
  start_date: string | null;
  work_model: string | null;
  checklist_items: Array<PreAdmissionChecklistItem & { documents: PreAdmissionDocument[] }>;
}

export interface CandidatePortalPreAdmissionEnvelope {
  case: CandidatePortalPreAdmissionCase | null;
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

  listBehavioralAssessments() {
    return httpRequest<BehavioralAssignmentSummary[]>(
      "/api/v1/candidate-portal/behavioral-assessments",
      {
        method: "GET",
        withAuth: false,
      }
    );
  },

  getBehavioralAssessment(assignmentId: string) {
    return httpRequest<BehavioralAssignmentDetail>(
      `/api/v1/candidate-portal/behavioral-assessments/${assignmentId}`,
      {
        method: "GET",
        withAuth: false,
      }
    );
  },

  startBehavioralAssessment(assignmentId: string) {
    return httpRequest<BehavioralAssignmentDetail>(
      `/api/v1/candidate-portal/behavioral-assessments/${assignmentId}/start`,
      {
        method: "POST",
        withAuth: false,
      }
    );
  },

  saveBehavioralAnswers(assignmentId: string, answers: BehavioralAssignmentAnswerPayload[]) {
    return httpRequest<BehavioralAssignmentDetail>(
      `/api/v1/candidate-portal/behavioral-assessments/${assignmentId}/answers`,
      {
        method: "PUT",
        withAuth: false,
        body: { answers },
      }
    );
  },

  submitBehavioralAssessment(assignmentId: string, answers: BehavioralAssignmentAnswerPayload[]) {
    return httpRequest<BehavioralAssignmentDetail>(
      `/api/v1/candidate-portal/behavioral-assessments/${assignmentId}/submit`,
      {
        method: "POST",
        withAuth: false,
        body: { answers },
      }
    );
  },

  getPreAdmission() {
    return httpRequest<CandidatePortalPreAdmissionEnvelope>(
      "/api/v1/candidate-portal/pre-admission",
      {
        method: "GET",
        withAuth: false,
      }
    );
  },

  uploadPreAdmissionDocument(caseId: string, itemId: string, formData: FormData) {
    return httpRequest<PreAdmissionDocument>(
      `/api/v1/candidate-portal/pre-admission/${caseId}/checklist-items/${itemId}/documents`,
      {
        method: "POST",
        withAuth: false,
        body: formData,
      }
    );
  },

  async downloadPreAdmissionDocument(documentId: string) {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/candidate-portal/pre-admission/documents/${documentId}/download`,
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new HttpError(response.status, "Não foi possível baixar o documento.");
    }

    return response.blob();
  },
};
