import type {
  AddCandidateToJobPayload,
  AddCandidateToJobResponse,
  CandidatePipelineHistory,
  Job,
  MovePipelineCandidatePayload,
  MovePipelineCandidateResponse,
  PipelineAnalysisDecision,
  PipelineStage,
  PipelineStageTransition,
  TransferCandidateJobPayload,
  TransferCandidateJobResponse,
} from "../types/domain";
import type { InterviewFormat, InterviewSchedule } from "../types/agenda";
import { httpRequest, HttpError } from "./http";

// ---------------------------------------------------------------------------
// Pipeline stage gate blocking — Fase 3 (frontend)
// ---------------------------------------------------------------------------

export type PipelineGateActionCode =
  | "open_interview"
  | "open_scorecard"
  | "open_behavioral_assessment"
  | "open_behavioral_ai"
  | "open_decision"
  | "add_reason";

export type PipelineMissingGate = {
  code: string;
  label: string;
  description: string;
  action: PipelineGateActionCode;
  action_payload?: Record<string, unknown> | null;
  severity: "block";
  forceable: boolean;
};

export type PipelineTransitionBlockedResponse = {
  code: "pipeline_transition_blocked";
  message: string;
  current_stage: PipelineStage | null;
  target_stage: PipelineStage;
  missing_gates: PipelineMissingGate[];
  can_force: boolean;
  force_requires_reason: boolean;
};

const GATE_ACTION_CODES: ReadonlySet<PipelineGateActionCode> = new Set([
  "open_interview",
  "open_scorecard",
  "open_behavioral_assessment",
  "open_behavioral_ai",
  "open_decision",
  "add_reason",
]);

function isGateActionCode(value: unknown): value is PipelineGateActionCode {
  return typeof value === "string" && GATE_ACTION_CODES.has(value as PipelineGateActionCode);
}

function normalizeMissingGate(raw: unknown): PipelineMissingGate | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const action = isGateActionCode(record.action) ? record.action : null;
  if (!action) return null;
  return {
    code: typeof record.code === "string" ? record.code : "unknown_gate",
    label: typeof record.label === "string" ? record.label : "Pendência",
    description: typeof record.description === "string" ? record.description : "",
    action,
    action_payload:
      record.action_payload && typeof record.action_payload === "object"
        ? (record.action_payload as Record<string, unknown>)
        : null,
    severity: "block",
    forceable: Boolean(record.forceable),
  };
}

/**
 * Detects the structured 409 returned by the backend when a pipeline stage
 * move is blocked by structural gates. The payload lives at the top level
 * of the response body (NOT under `detail`), so we read it from
 * `HttpError.data`.
 */
export function isPipelineTransitionBlockedError(
  error: unknown,
): error is HttpError & { data: PipelineTransitionBlockedResponse } {
  if (!(error instanceof HttpError) || error.status !== 409) return false;
  const data = error.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return false;
  if (data.code !== "pipeline_transition_blocked") return false;
  if (!Array.isArray(data.missing_gates)) return false;
  return true;
}

/**
 * Returns a sanitized PipelineTransitionBlockedResponse from a blocked error.
 * Filters out any gate with an unrecognized action so the UI never tries to
 * render a button with no behavior.
 */
export function readPipelineTransitionBlockedResponse(
  error: unknown,
): PipelineTransitionBlockedResponse | null {
  if (!isPipelineTransitionBlockedError(error)) return null;
  const raw = error.data;
  const gates: PipelineMissingGate[] = [];
  for (const gate of raw.missing_gates) {
    const normalized = normalizeMissingGate(gate);
    if (normalized) gates.push(normalized);
  }
  return {
    code: "pipeline_transition_blocked",
    message: typeof raw.message === "string" ? raw.message : "Não é possível avançar candidato para esta etapa.",
    current_stage: (raw.current_stage as PipelineStage | null) ?? null,
    target_stage: raw.target_stage as PipelineStage,
    missing_gates: gates,
    can_force: Boolean(raw.can_force),
    force_requires_reason: raw.force_requires_reason !== false,
  };
}

export type SchedulePipelineInterviewPayload = {
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  interview_format: InterviewFormat;
  location?: string | null;
  meeting_url?: string | null;
  public_notes?: string | null;
  internal_notes?: string | null;
  title?: string | null;
  interview_type?: string;
  create_google_event?: boolean;
  create_google_meet?: boolean;
};

export type PipelineJobSummary = {
  id: string;
  title: string;
  status: string;
  seniority_level: string | null;
  work_model: string | null;
  location: string | null;
  deal_breakers: Job["deal_breakers"];
  total_candidates: number;
  stage_counts: Record<string, number>;
  latest_activity: string | null;
};

function normalizeTransition(item: any): PipelineStageTransition {
  return {
    id: item?.id ?? "",
    candidate_id: item?.candidate_id ?? "",
    job_id: item?.job_id ?? "",
    from_stage: item?.from_stage ?? null,
    to_stage: item?.to_stage ?? "entry",
    moved_by: item?.moved_by ?? null,
    moved_by_name: item?.moved_by_name ?? null,
    moved_at: item?.moved_at ?? new Date(0).toISOString(),
    trigger: item?.trigger ?? "system",
    notes: item?.notes ?? null,
    reason: item?.reason ?? null,
  };
}

function normalizeAnalysisDecision(item: any): PipelineAnalysisDecision | null {
  if (!item) return null;
  return {
    analysis_id: item?.analysis_id ?? null,
    status: item?.status ?? null,
    created: Boolean(item?.created),
    blocked: Boolean(item?.blocked),
    reused: Boolean(item?.reused),
    stuck: Boolean(item?.stuck),
    reason: item?.reason ?? "analysis_unknown",
    stage: item?.stage ?? null,
    trigger_source: item?.trigger_source === "manual" ? "manual" : "automatic",
  };
}

export const pipelineService = {
  async listPipelineJobs(includeClosed = false): Promise<PipelineJobSummary[]> {
    const params = new URLSearchParams();
    if (includeClosed) {
      params.set("include_closed", "true");
    }

    const query = params.toString();
    const response = await httpRequest<any[]>(`/api/v1/pipeline/jobs${query ? `?${query}` : ""}`);
    const raw = Array.isArray(response) ? response : [];

    return raw.map((item) => ({
      id: item?.job_id ?? "",
      title: item?.job_title ?? "",
      status: item?.job_status ?? "draft",
      seniority_level: item?.seniority_level ?? null,
      work_model: item?.work_model ?? null,
      location: item?.location ?? null,
      deal_breakers: Array.isArray(item?.deal_breakers) ? item.deal_breakers : [],
      total_candidates: item?.total_candidates ?? 0,
      stage_counts: item?.stage_counts ?? {},
      latest_activity: item?.latest_activity ?? null,
    }));
  },

  async getCandidateHistory(jobId: string, candidateId: string): Promise<CandidatePipelineHistory> {
    const item = await httpRequest<any>(`/api/v1/pipeline/${jobId}/${candidateId}/history`);
    return {
      candidate_id: item?.candidate_id ?? candidateId,
      candidate_name: item?.candidate_name ?? "",
      job_id: item?.job_id ?? jobId,
      job_title: item?.job_title ?? "",
      current_stage: item?.current_stage ?? "entry",
      status: item?.status ?? "active",
      entered_at: item?.entered_at ?? null,
      updated_at: item?.updated_at ?? new Date(0).toISOString(),
      transitions: Array.isArray(item?.transitions)
        ? item.transitions.map(normalizeTransition)
        : [],
    };
  },

  async moveCandidateStage(
    jobId: string,
    candidateId: string,
    payload: MovePipelineCandidatePayload,
  ): Promise<MovePipelineCandidateResponse> {
    const item = await httpRequest<any>(`/api/v1/pipeline/${jobId}/${candidateId}/stage`, {
      method: "PATCH",
      body: {
        stage: payload.stage,
        notes: payload.notes ?? null,
        reason: payload.reason ?? null,
      },
    });

    return {
      candidate_id: item?.candidate_id ?? candidateId,
      job_id: item?.job_id ?? jobId,
      stage: item?.stage ?? payload.stage,
      candidate_status: item?.candidate_status ?? "Em processo",
      status: item?.status ?? "active",
      transition_id: item?.transition_id ?? "",
      updated_at: item?.updated_at ?? new Date(0).toISOString(),
      analysis: normalizeAnalysisDecision(item?.analysis),
    };
  },

  async addCandidateToJob(
    candidateId: string,
    payload: AddCandidateToJobPayload,
  ): Promise<AddCandidateToJobResponse> {
    const item = await httpRequest<any>(`/api/v1/pipeline/${candidateId}/add-to-job`, {
      method: "POST",
      body: {
        job_id: payload.job_id,
        initial_stage: payload.initial_stage ?? "entry",
      },
    });

    return {
      candidate_id: item?.candidate_id ?? candidateId,
      job_id: item?.job_id ?? payload.job_id,
      stage: item?.stage ?? (payload.initial_stage ?? "entry"),
      candidate_status: item?.candidate_status ?? "Recebido",
      status: item?.status ?? "active",
      transition_id: item?.transition_id ?? "",
      updated_at: item?.updated_at ?? new Date(0).toISOString(),
      analysis: normalizeAnalysisDecision(item?.analysis),
    };
  },

  async transferCandidateJob(
    candidateId: string,
    payload: TransferCandidateJobPayload,
  ): Promise<TransferCandidateJobResponse> {
    const item = await httpRequest<any>(`/api/v1/pipeline/${candidateId}/transfer-job`, {
      method: "PATCH",
      body: {
        from_job_id: payload.from_job_id,
        to_job_id: payload.to_job_id,
        reason: payload.reason,
      },
    });

    return {
      candidate_id: item?.candidate_id ?? candidateId,
      from_job_id: item?.from_job_id ?? payload.from_job_id,
      to_job_id: item?.to_job_id ?? payload.to_job_id,
      from_stage: item?.from_stage ?? "entry",
      to_stage: item?.to_stage ?? "entry",
      source_status: item?.source_status ?? "transferred",
      destination_status: item?.destination_status ?? "active",
      source_transition_id: item?.source_transition_id ?? "",
      destination_transition_id: item?.destination_transition_id ?? "",
      updated_at: item?.updated_at ?? new Date(0).toISOString(),
      analysis: normalizeAnalysisDecision(item?.analysis),
    };
  },

  async schedulePipelineInterview(
    jobId: string,
    candidateId: string,
    payload: SchedulePipelineInterviewPayload,
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(`/api/v1/pipeline/${jobId}/${candidateId}/interviews`, {
      method: "POST",
      body: payload,
    });
  },
};
