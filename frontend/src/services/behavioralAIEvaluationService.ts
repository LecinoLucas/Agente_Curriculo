import { httpRequest } from "./http";
import type { AnalysisGlobalItem, BehavioralAIEvaluationResponse } from "../types/domain";
import type { PaginatedResponse } from "./analysisService";

export async function triggerBehavioralAnalysis(
  jobId: string,
  candidateId: string,
  options: { retryFailed?: boolean } = {},
): Promise<{
  evaluation_id: string;
  assignment_id: string;
  status: BehavioralAIEvaluationResponse["status"];
  queued_at?: string | null;
  next_retry_at?: string | null;
  retry_count?: number | null;
  message: string;
}> {
  const retryQuery = options.retryFailed ? "?retry_failed=true" : "";
  return httpRequest<{
    evaluation_id: string;
    assignment_id: string;
    status: BehavioralAIEvaluationResponse["status"];
    queued_at?: string | null;
    next_retry_at?: string | null;
    retry_count?: number | null;
    message: string;
  }>(
    `/api/v1/jobs/${jobId}/candidates/${candidateId}/behavioral-assessment/evaluate${retryQuery}`,
    {
      method: "POST",
    },
  );
}

export async function getBehavioralEvaluation(
  jobId: string,
  candidateId: string,
): Promise<BehavioralAIEvaluationResponse | null> {
  try {
    return await httpRequest<BehavioralAIEvaluationResponse>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/behavioral-assessment/evaluation`,
    );
  } catch {
    return null;
  }
}

function normalizeBehavioralAIQueueItem(
  item: Partial<AnalysisGlobalItem> & { error_message?: string | null },
): AnalysisGlobalItem {
  return {
    id: item.id ?? "",
    type: "behavioral_ai",
    job_id: item.job_id ?? null,
    job_title: item.job_title ?? null,
    candidate_id: item.candidate_id ?? null,
    candidate_name: item.candidate_name ?? null,
    candidate_email: item.candidate_email ?? null,
    resume_file_name: null,
    resume_version_id: null,
    status: item.status ?? "pending",
    failure_reason: item.failure_reason ?? item.error_message ?? null,
    discarded_at: null,
    discarded_by: null,
    discard_reason: null,
    discard_reason_note: null,
    used_real_ai: item.used_real_ai ?? null,
    retry_count: item.retry_count ?? 0,
    next_retry_at: item.next_retry_at ?? null,
    provider_error_type: item.provider_error_type ?? null,
    provider_status_code: item.provider_status_code ?? null,
    provider: item.provider ?? null,
    model: item.model ?? null,
    stuck: Boolean(item.stuck),
    reason: item.reason ?? null,
    created_at: item.created_at ?? new Date(0).toISOString(),
    updated_at: item.updated_at ?? item.created_at ?? new Date(0).toISOString(),
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    failed_at: item.failed_at ?? null,
  };
}

export async function listBehavioralAIQueue(
  page = 1,
  pageSize = 20,
  statusFilter?: string,
  search?: string,
): Promise<PaginatedResponse<AnalysisGlobalItem>> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
  if (search) params.set("search", search);
  return httpRequest<PaginatedResponse<AnalysisGlobalItem>>(
    `/api/v1/admin/behavioral-ai/evaluations?${params.toString()}`,
  ).then((payload) => ({
    data: Array.isArray(payload?.data) ? payload.data.map(normalizeBehavioralAIQueueItem) : [],
    total: payload?.total ?? 0,
    page: payload?.page ?? page,
    page_size: payload?.page_size ?? pageSize,
    total_pages: payload?.total_pages ?? 1,
  }));
}

export async function retryBehavioralAI(evaluationId: string): Promise<{
  evaluation_id: string;
  assignment_id: string;
  status: BehavioralAIEvaluationResponse["status"];
  enqueued: boolean;
  retry_count: number;
  message: string;
}> {
  return httpRequest<{
    evaluation_id: string;
    assignment_id: string;
    status: BehavioralAIEvaluationResponse["status"];
    enqueued: boolean;
    retry_count: number;
    message: string;
  }>(`/api/v1/admin/behavioral-ai/${evaluationId}/retry`, {
    method: "POST",
  });
}
