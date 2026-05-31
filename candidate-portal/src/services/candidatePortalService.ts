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
  status: 'completed' | 'current' | 'pending';
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
      status: s.status as 'completed' | 'current' | 'pending',
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
