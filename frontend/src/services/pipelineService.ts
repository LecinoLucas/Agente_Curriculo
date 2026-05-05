import type {
  AddCandidateToJobPayload,
  AddCandidateToJobResponse,
  CandidatePipelineHistory,
  Job,
  MovePipelineCandidatePayload,
  MovePipelineCandidateResponse,
  PipelineStageTransition,
  TransferCandidateJobPayload,
  TransferCandidateJobResponse,
} from "../types/domain";
import { httpRequest } from "./http";

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
      match_score: item?.match_score != null ? Number(item.match_score) : null,
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
      match_score: item?.match_score != null ? Number(item.match_score) : null,
      transition_id: item?.transition_id ?? "",
      updated_at: item?.updated_at ?? new Date(0).toISOString(),
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
    };
  },
};
