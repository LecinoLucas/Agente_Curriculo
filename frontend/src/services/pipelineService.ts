import type {
  CandidatePipelineHistory,
  MovePipelineCandidatePayload,
  MovePipelineCandidateResponse,
  PipelineStageTransition,
} from "../types/domain";
import { httpRequest } from "./http";

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
};
