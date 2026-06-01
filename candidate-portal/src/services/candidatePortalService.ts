import { publicApiClient } from './publicApiClient';

// ── Analysis status display helper ───────────────────────────────────────────

export interface AnalysisStatusInfo {
  label: string;
  description: string | null;
  variant: 'progress' | 'done' | 'muted';
}

const _ANALYSIS_INFO_MAP: Record<string, AnalysisStatusInfo> = {
  waiting_extraction: {
    label: 'Extraindo currículo',
    description: 'O texto do seu PDF está sendo preparado para análise.',
    variant: 'progress',
  },
  pending: {
    label: 'Análise na fila',
    description: 'Seu currículo aguarda a fila de análise pela IA.',
    variant: 'progress',
  },
  processing: {
    label: 'Análise em andamento',
    description: 'A IA está avaliando seu currículo para esta vaga.',
    variant: 'progress',
  },
  retry_scheduled: {
    label: 'Reprocessando análise',
    description: 'A análise será tentada novamente em breve.',
    variant: 'progress',
  },
  completed: {
    label: 'Análise concluída',
    description: null,
    variant: 'done',
  },
  failed: {
    label: 'Em revisão pela equipe',
    description: 'Sua candidatura segue para avaliação pela equipe de RH.',
    variant: 'muted',
  },
  cancelled: {
    label: 'Em revisão pela equipe',
    description: null,
    variant: 'muted',
  },
};

/** Returns display info for a given analysis status, or null when nothing should be shown. */
export function getAnalysisStatusInfo(status: string | null | undefined): AnalysisStatusInfo | null {
  if (!status || status === 'not_requested') return null;
  return _ANALYSIS_INFO_MAP[status] ?? null;
}

// ── Polling guard ─────────────────────────────────────────────────────────────

// Statuses that indicate analysis is still running — page should poll for updates.
export const IN_PROGRESS_ANALYSIS_STATUSES = new Set<string>([
  'waiting_extraction',
  'pending',
  'processing',
  'retry_scheduled',
]);

/** Returns true only when the analysis is actively running and a status update is expected. */
export function shouldPollAnalysis(status: string | null | undefined): boolean {
  if (!status) return false;
  return IN_PROGRESS_ANALYSIS_STATUSES.has(status);
}

// ── Raw API shapes (snake_case from backend) ──────────────────────────────────

interface ApiCandidate {
  id: string;
  full_name: string;
  cpf_masked: string | null;
  email: string | null;
  email_masked: string | null;
  phone: string | null;
  phone_masked: string | null;
  city: string | null;
  state: string | null;
  application_source_label: string;
}

interface ApiActiveApplication {
  pipeline_id: string;
  job_id: string;
  job_title: string | null;
  pipeline_stage: string;
  status_public: string;
  submitted_at: string;
  is_talent_pool: boolean;
  resume_filename: string | null;
  analysis_status: string | null;
  current_analysis_id: string | null;
}

interface ApiTimelineStep {
  key: string;
  label: string;
  status: string; // 'completed' | 'current' | 'pending'
  description: string;
}

interface ApiTimeline {
  current_step_key: string;
  current_step_label: string;
  steps: ApiTimelineStep[];
}

interface ApiApplicationHistory {
  job_title: string | null;
  status: string;
  status_label: string;
  submitted_at: string;
  talent_pool: boolean;
}

interface ApiPublicInterview {
  status: string;
  status_label: string;
  scheduled_at: string | null;
  interview_type_label: string | null;
  interview_format_label: string | null;
  location: string | null;
  meeting_url: string | null;
  public_notes: string | null;
  is_online: boolean | null;
}

interface ApiCandidateMe {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  application_source: string | null;
  application_source_label: string;
  created_at: string;
}

interface ApiCandidateApplication {
  application_id: string;
  job_id: string;
  job_title: string;
  company_unit: string | null;
  location: string | null;
  submitted_at: string;
  current_stage: string;
  current_stage_label: string;
  status: string;
  status_label: string;
  analysis_status: string | null;
  next_action: string | null;
  updated_at: string;
}

interface ApiApplicationTimelineEvent {
  id: string;
  event_type: string;
  from_stage: string | null;
  to_stage: string | null;
  created_at: string;
}

interface ApiApplicationMessage {
  id: string;
  subject: string | null;
  body: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

interface ApiApplicationDocument {
  id: string;
  title: string;
  status: string | null;
  uploaded_at: string | null;
}

interface ApiApplicationJob {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  location: string | null;
  job_area: string | null;
  work_model: string | null;
  seniority_level: string | null;
  benefits: string[];
  working_hours: string | null;
}

interface ApiApplicationDetail {
  application: ApiCandidateApplication;
  job: ApiApplicationJob;
  timeline: ApiTimeline | null;
  timeline_events: ApiApplicationTimelineEvent[];
  interview: ApiPublicInterview | null;
  messages: ApiApplicationMessage[];
  documents: ApiApplicationDocument[];
}

interface ApiOverviewResponse {
  candidate: ApiCandidate;
  active_application: ApiActiveApplication | null;
  application_history: ApiApplicationHistory[];
  public_interview: ApiPublicInterview | null;
  talent_pool: boolean;
  status_public: string;
  application_status: string;
  current_process_status_label: string;
  is_process_closed: boolean;
  closed_reason_public_label: string | null;
  can_apply_to_other_jobs: boolean;
  public_timeline: ApiTimeline | null;
  requires_behavioral_assessment: boolean;
}

// ── Internal type consumed by CandidateHomePage ───────────────────────────────

export interface TimelineStep {
  key: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'upcoming' | 'closed';
}

export interface ScheduledInterview {
  statusLabel: string;
  scheduledAt: string | null;
  typeLabel: string | null;
  formatLabel: string | null;
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  isOnline: boolean | null;
}

export interface CandidateOverview {
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  activeApplication: {
    jobTitle: string;
    statusPublic: string;
    isTalentPool: boolean;
    resumeFilename: string | null;
    analysisStatus: string | null;
  } | null;
  timelineCurrentStep: string | null;
  timelineCurrentLabel: string | null;
  timelineSteps: TimelineStep[];
  applicationHistoryCount: number;
  statusLabel: string;
  isProcessClosed: boolean;
  closedReasonLabel: string | null;
  requiresBehavioralAssessment: boolean;
  talentPool: boolean;
  publicInterview: ScheduledInterview | null;
}

export interface CandidateProfile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  applicationSource: string | null;
  applicationSourceLabel: string;
  createdAt: string;
}

export interface CandidateApplication {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  companyUnit: string | null;
  location: string | null;
  submittedAt: string;
  currentStage: string;
  currentStageLabel: string;
  status: string;
  statusLabel: string;
  analysisStatus: string | null;
  nextAction: string | null;
  updatedAt: string;
}

export interface ApplicationTimelineEvent {
  id: string;
  eventType: string;
  fromStage: string | null;
  toStage: string | null;
  createdAt: string;
}

export interface ApplicationMessage {
  id: string;
  subject: string | null;
  body: string;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ApplicationDocument {
  id: string;
  title: string;
  status: string | null;
  uploadedAt: string | null;
}

export interface ApplicationJob {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  location: string | null;
  jobArea: string | null;
  workModel: string | null;
  seniorityLevel: string | null;
  benefits: string[];
  workingHours: string | null;
}

export interface CandidateApplicationDetail {
  application: CandidateApplication;
  job: ApplicationJob;
  timelineSteps: TimelineStep[];
  timelineEvents: ApplicationTimelineEvent[];
  interview: ScheduledInterview | null;
  messages: ApplicationMessage[];
  documents: ApplicationDocument[];
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapOverview(api: ApiOverviewResponse): CandidateOverview {
  return {
    candidateName: api.candidate.full_name,
    // Prefer masked versions when available to avoid exposing full PII in the UI.
    candidateEmail: api.candidate.email_masked ?? api.candidate.email,
    candidatePhone: api.candidate.phone_masked ?? api.candidate.phone,
    activeApplication: api.active_application
      ? {
          jobTitle: api.active_application.job_title ?? 'Vaga',
          statusPublic: api.active_application.status_public,
          isTalentPool: api.active_application.is_talent_pool,
          resumeFilename: api.active_application.resume_filename,
          analysisStatus: api.active_application.analysis_status ?? null,
        }
      : null,
    timelineCurrentStep: api.public_timeline?.current_step_key ?? null,
    timelineCurrentLabel: api.public_timeline?.current_step_label ?? null,
    timelineSteps: (api.public_timeline?.steps ?? []).map((s) => ({
      key: s.key,
      label: s.label,
      status: s.status as TimelineStep['status'],
    })),
    applicationHistoryCount: api.application_history.length,
    statusLabel: api.current_process_status_label,
    isProcessClosed: api.is_process_closed,
    closedReasonLabel: api.closed_reason_public_label ?? null,
    requiresBehavioralAssessment: api.requires_behavioral_assessment,
    talentPool: api.talent_pool,
    publicInterview: api.public_interview
      ? {
          statusLabel: api.public_interview.status_label,
          scheduledAt: api.public_interview.scheduled_at,
          typeLabel: api.public_interview.interview_type_label,
          formatLabel: api.public_interview.interview_format_label,
          location: api.public_interview.location,
          meetingUrl: api.public_interview.meeting_url,
          notes: api.public_interview.public_notes,
          isOnline: api.public_interview.is_online,
        }
      : null,
  };
}

function mapProfile(api: ApiCandidateMe): CandidateProfile {
  return {
    id: api.id,
    fullName: api.full_name,
    email: api.email,
    phone: api.phone,
    city: api.city,
    state: api.state,
    applicationSource: api.application_source,
    applicationSourceLabel: api.application_source_label,
    createdAt: api.created_at,
  };
}

function mapApplication(api: ApiCandidateApplication): CandidateApplication {
  return {
    applicationId: api.application_id,
    jobId: api.job_id,
    jobTitle: api.job_title,
    companyUnit: api.company_unit,
    location: api.location,
    submittedAt: api.submitted_at,
    currentStage: api.current_stage,
    currentStageLabel: api.current_stage_label,
    status: api.status,
    statusLabel: api.status_label,
    analysisStatus: api.analysis_status,
    nextAction: api.next_action,
    updatedAt: api.updated_at,
  };
}

function mapInterview(api: ApiPublicInterview | null): ScheduledInterview | null {
  if (!api) return null;
  return {
    statusLabel: api.status_label,
    scheduledAt: api.scheduled_at,
    typeLabel: api.interview_type_label,
    formatLabel: api.interview_format_label,
    location: api.location,
    meetingUrl: api.meeting_url,
    notes: api.public_notes,
    isOnline: api.is_online,
  };
}

function mapDetail(api: ApiApplicationDetail): CandidateApplicationDetail {
  return {
    application: mapApplication(api.application),
    job: {
      id: api.job.id,
      title: api.job.title,
      description: api.job.description,
      requirements: api.job.requirements,
      responsibilities: api.job.responsibilities,
      location: api.job.location,
      jobArea: api.job.job_area,
      workModel: api.job.work_model,
      seniorityLevel: api.job.seniority_level,
      benefits: api.job.benefits,
      workingHours: api.job.working_hours,
    },
    timelineSteps: (api.timeline?.steps ?? []).map((step) => ({
      key: step.key,
      label: step.label,
      status: step.status as TimelineStep['status'],
    })),
    timelineEvents: api.timeline_events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      fromStage: event.from_stage,
      toStage: event.to_stage,
      createdAt: event.created_at,
    })),
    interview: mapInterview(api.interview),
    messages: api.messages.map((message) => ({
      id: message.id,
      subject: message.subject,
      body: message.body,
      sentAt: message.sent_at,
      readAt: message.read_at,
      createdAt: message.created_at,
    })),
    documents: api.documents.map((document) => ({
      id: document.id,
      title: document.title,
      status: document.status,
      uploadedAt: document.uploaded_at,
    })),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

// In-flight deduplicator: when App hydration and CandidateHomePage both call
// getOverview() in the same render cycle (e.g. opening /minha-area directly),
// they share a single HTTP request. Cleared after resolve OR reject so polling
// always fires a fresh request rather than replaying a cached one.
let _overviewInflight: Promise<CandidateOverview> | null = null;

export interface SessionResult {
  authenticated: boolean;
  candidateName: string | null;
}

export const candidatePortalService = {
  // Not `async` so both concurrent callers receive the exact same Promise
  // instance (identity equality), making deduplication verifiable in tests.
  getOverview(): Promise<CandidateOverview> {
    if (_overviewInflight) return _overviewInflight;
    _overviewInflight = publicApiClient
      .get<ApiOverviewResponse>('/candidate-portal/overview')
      .then(mapOverview)
      .finally(() => { _overviewInflight = null; });
    return _overviewInflight;
  },

  async getMe(): Promise<CandidateProfile> {
    return mapProfile(await publicApiClient.get<ApiCandidateMe>('/candidate-portal/me'));
  },

  async getApplications(): Promise<CandidateApplication[]> {
    const raw = await publicApiClient.get<ApiCandidateApplication[]>(
      '/candidate-portal/me/applications',
    );
    return raw.map(mapApplication);
  },

  async getApplicationDetail(applicationId: string): Promise<CandidateApplicationDetail> {
    const raw = await publicApiClient.get<ApiApplicationDetail>(
      `/candidate-portal/me/applications/${applicationId}`,
    );
    return mapDetail(raw);
  },

  // Silent session probe — always resolves (never rejects with 401).
  // Used by App.tsx to hydrate candidateName without polluting the console.
  async getSession(): Promise<SessionResult> {
    const raw = await publicApiClient.get<{ authenticated: boolean; candidate_name: string | null }>(
      '/auth/session',
    );
    return {
      authenticated: raw.authenticated,
      candidateName: raw.candidate_name,
    };
  },
};
