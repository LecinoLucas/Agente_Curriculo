export type InterviewStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show"
  | "awaiting_feedback";

export type InterviewType =
  | "screening"
  | "technical"
  | "manager"
  | "hr"
  | "final"
  | "other";

export type InterviewFormat = "online" | "presencial" | "telefone";

export type InterviewSchedule = {
  id: string;
  candidate_id: string;
  candidate_name: string;
  job_id: string | null;
  job_title: string | null;
  pipeline_id?: string | null;
  title: string;
  description: string | null;
  public_notes: string | null;
  internal_notes: string | null;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  interview_type: InterviewType;
  interview_format: InterviewFormat;
  status: InterviewStatus;
  location: string | null;
  meeting_url: string | null;
  interviewer_name: string | null;
  interviewer_email: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  calendar_provider?: string | null;
  calendar_sync_status?: string | null;
  calendar_sync_error?: string | null;
  calendar_synced_at?: string | null;
  meeting_provider?: string | null;
  external_calendar_html_link?: string | null;
  external_calendar_event_id?: string | null;
  scorecard_id?: string | null;
  scorecard_status?: "draft" | "submitted" | null;
  scorecard_final_recommendation?: string | null;
  scorecard_submitted_at?: string | null;
  counts_for_current_gate?: boolean;
};

export type AgendaKpis = {
  total_scheduled: number;
  today_count: number;
  upcoming_count: number;
  completed_count: number;
  cancelled_count: number;
  unique_interviewers_count: number;
};

export type AgendaListParams = {
  date_from?: string;
  date_to?: string;
  status?: InterviewStatus | "all";
  candidate_id?: string;
  job_id?: string;
  interviewer?: string;
  search?: string;
  page?: number;
  page_size?: number;
};

export type InterviewScheduleCreatePayload = {
  candidate_id: string;
  job_id?: string | null;
  pipeline_id?: string | null;
  title: string;
  description?: string | null;
  public_notes?: string | null;
  internal_notes?: string | null;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  interview_type: InterviewType;
  interview_format?: InterviewFormat;
  status: InterviewStatus;
  location?: string | null;
  meeting_url?: string | null;
  interviewer_name?: string | null;
  interviewer_email?: string | null;
  create_google_event?: boolean;
  create_google_meet?: boolean;
};

export type InterviewScheduleUpdatePayload = {
  title?: string | null;
  description?: string | null;
  public_notes?: string | null;
  internal_notes?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  timezone?: string | null;
  interview_type?: InterviewType | null;
  interview_format?: InterviewFormat | null;
  status?: InterviewStatus | null;
  location?: string | null;
  meeting_url?: string | null;
  interviewer_name?: string | null;
  interviewer_email?: string | null;
  sync_google_event?: boolean;
  create_google_meet?: boolean;
};

export type InterviewScheduleCancelPayload = {
  cancel_reason: string;
  sync_google_event?: boolean;
};

export type InterviewScheduleReschedulePayload = {
  scheduled_start: string;
  scheduled_end: string;
  timezone?: string | null;
  location?: string | null;
  meeting_url?: string | null;
  interviewer_name?: string | null;
  interviewer_email?: string | null;
  sync_google_event?: boolean;
  create_google_meet?: boolean;
};

export type InterviewScheduleCompletePayload = {
  internal_notes?: string | null;
};

export type InterviewScheduleNoShowPayload = {
  reason?: string | null;
};
