export type Step = "method" | "personal-data" | "job-resume" | "review";

export type ApplicationStatus = "awaiting_job" | "entered_pipeline";
export type PublicApplyAnalysisStatus =
  | "waiting_extraction"
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled"
  | "discarded";

export interface FormData {
  authMethod: "manual" | "google";
  emailLocked: boolean;
  googlePictureUrl: string | null;

  // Personal data
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  password: string;
  confirmPassword: string;

  // Preferences
  salaryExpectation: string;
  desiredContractType: "CLT" | "PJ" | "Indiferente";
  worksAtMarajoGroup: boolean;

  // Job selection
  jobId: string | null;

  // File
  resumeFile: File | null;

  // Consent
  lgpdConsent: boolean;
}

export interface Job {
  id: string;
  title: string;
  location?: string;
  job_area?: string;
}

export interface ApplyResponse {
  candidate_id: string;
  resume_id: string;
  resume_version_id: string;
  job_id: string | null;
  pipeline_id: string | null;
  analysis_auto_requested: boolean;
  analysis_id: string | null;
  analysis_status: PublicApplyAnalysisStatus | null;
  talent_pool: boolean;
  talent_pool_profile_status: "pending" | "processing" | "completed" | "failed" | null;
  portal_access_hint: string | null;
  status: ApplicationStatus;
  message: string;
}

export interface ApplicationErrors {
  fullName?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  password?: string;
  confirmPassword?: string;
  salaryExpectation?: string;
  desiredContractType?: string;
  jobId?: string;
  resumeFile?: string;
  lgpdConsent?: string;
  form?: string;
}
