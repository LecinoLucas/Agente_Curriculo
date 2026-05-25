import { httpRequest } from "./http";
import type { AnalysisGlobalItem, BehavioralAIEvaluationResponse } from "../types/domain";
import type { PaginatedResponse } from "./analysisService";

export type BehavioralAIStatus = "pending" | "processing" | "retry_scheduled" | "completed" | "failed";
export type BehavioralAIOperationalStatus =
  | BehavioralAIStatus
  | "rate_limited"
  | "credential_invalid";

export type BehavioralAIEvaluationListParams = {
  page?: number;
  page_size?: number;
  status?: BehavioralAIStatus | "all";
  operational_status?: BehavioralAIOperationalStatus | "all";
  candidate_id?: string;
  job_id?: string;
  provider?: string | "all";
  model?: string | "all";
  provider_error_type?: string | "all";
  date_from?: string;
  date_to?: string;
  search?: string;
};

export type BehavioralAIEvaluationListItem = {
  id: string;
  evaluation_id: string;
  assignment_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string | null;
  job_id: string;
  job_title: string;
  type: "behavioral_ai";
  status: BehavioralAIStatus;
  operational_status: BehavioralAIOperationalStatus;
  provider: string;
  model: string;
  retry_count: number;
  can_retry: boolean;
  retry_allowed_reason: string | null;
  requested_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
  provider_error_type: string | null;
  provider_status_code: number | null;
  safe_error_message: string | null;
  stuck: boolean;
  created_at: string;
  updated_at: string;
};

export type BehavioralAIEvaluationDetail = BehavioralAIEvaluationListItem & {
  prompt_version: number;
  confidence: string | null;
  summary: string | null;
};

export type BehavioralAIMetrics = {
  pending: number;
  processing: number;
  retry_scheduled: number;
  completed_last_24h: number;
  failed_last_24h: number;
  rate_limited: number;
  credential_invalid: number;
  next_retries: number;
  stuck: number;
};

export type BehavioralAIRetryResponse = {
  evaluation_id: string;
  assignment_id: string;
  status: BehavioralAIStatus;
  enqueued: boolean;
  retry_count: number;
  message: string;
};

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

function normalizeStatus(value: unknown): BehavioralAIStatus {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "retry_scheduled" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  return "pending";
}

function normalizeOperationalStatus(value: unknown): BehavioralAIOperationalStatus {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "retry_scheduled" ||
    value === "completed" ||
    value === "failed" ||
    value === "rate_limited" ||
    value === "credential_invalid"
  ) {
    return value;
  }
  return "pending";
}

function normalizeListItem(item: Partial<BehavioralAIEvaluationListItem>): BehavioralAIEvaluationListItem {
  const evaluationId = item.evaluation_id ?? item.id ?? "";
  return {
    id: item.id ?? evaluationId,
    evaluation_id: evaluationId,
    assignment_id: item.assignment_id ?? "",
    candidate_id: item.candidate_id ?? "",
    candidate_name: item.candidate_name ?? "Candidato não informado",
    candidate_email: item.candidate_email ?? null,
    job_id: item.job_id ?? "",
    job_title: item.job_title ?? "Vaga não informada",
    type: "behavioral_ai",
    status: normalizeStatus(item.status),
    operational_status: normalizeOperationalStatus(item.operational_status),
    provider: item.provider ?? "-",
    model: item.model ?? "-",
    retry_count: item.retry_count ?? 0,
    can_retry: Boolean(item.can_retry),
    retry_allowed_reason: item.retry_allowed_reason ?? null,
    requested_at: item.requested_at ?? null,
    queued_at: item.queued_at ?? null,
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    failed_at: item.failed_at ?? null,
    next_retry_at: item.next_retry_at ?? null,
    provider_error_type: item.provider_error_type ?? null,
    provider_status_code: item.provider_status_code ?? null,
    safe_error_message: item.safe_error_message ?? null,
    stuck: Boolean(item.stuck),
    created_at: item.created_at ?? new Date(0).toISOString(),
    updated_at: item.updated_at ?? item.created_at ?? new Date(0).toISOString(),
  };
}

function normalizeDetail(item: Partial<BehavioralAIEvaluationDetail>): BehavioralAIEvaluationDetail {
  return {
    ...normalizeListItem(item),
    prompt_version: item.prompt_version ?? 1,
    confidence: item.confidence ?? null,
    summary: item.summary ?? null,
  };
}

function normalizeMetrics(item: Partial<BehavioralAIMetrics>): BehavioralAIMetrics {
  return {
    pending: item.pending ?? 0,
    processing: item.processing ?? 0,
    retry_scheduled: item.retry_scheduled ?? 0,
    completed_last_24h: item.completed_last_24h ?? 0,
    failed_last_24h: item.failed_last_24h ?? 0,
    rate_limited: item.rate_limited ?? 0,
    credential_invalid: item.credential_invalid ?? 0,
    next_retries: item.next_retries ?? 0,
    stuck: item.stuck ?? 0,
  };
}

function appendOptional(params: URLSearchParams, key: string, value: string | number | undefined | null) {
  if (value == null) return;
  const normalized = String(value).trim();
  if (!normalized || normalized === "all") return;
  params.set(key, normalized);
}

export async function listBehavioralAIEvaluations(
  filters: BehavioralAIEvaluationListParams = {},
): Promise<PaginatedResponse<BehavioralAIEvaluationListItem>> {
  const page = filters.page ?? 1;
  const pageSize = filters.page_size ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  appendOptional(params, "status", filters.status);
  appendOptional(params, "operational_status", filters.operational_status);
  appendOptional(params, "candidate_id", filters.candidate_id);
  appendOptional(params, "job_id", filters.job_id);
  appendOptional(params, "provider", filters.provider);
  appendOptional(params, "model", filters.model);
  appendOptional(params, "provider_error_type", filters.provider_error_type);
  appendOptional(params, "date_from", filters.date_from);
  appendOptional(params, "date_to", filters.date_to);
  appendOptional(params, "search", filters.search);

  return httpRequest<PaginatedResponse<BehavioralAIEvaluationListItem>>(
    `/api/v1/admin/behavioral-ai/evaluations?${params.toString()}`,
  ).then((payload) => ({
    data: Array.isArray(payload?.data) ? payload.data.map(normalizeListItem) : [],
    total: payload?.total ?? 0,
    page: payload?.page ?? page,
    page_size: payload?.page_size ?? pageSize,
    total_pages: payload?.total_pages ?? 1,
  }));
}

export async function getBehavioralAIMetrics(): Promise<BehavioralAIMetrics> {
  return httpRequest<BehavioralAIMetrics>("/api/v1/admin/behavioral-ai/metrics").then(normalizeMetrics);
}

export async function getBehavioralAIEvaluationDetail(evaluationId: string): Promise<BehavioralAIEvaluationDetail> {
  return httpRequest<BehavioralAIEvaluationDetail>(
    `/api/v1/admin/behavioral-ai/evaluations/${evaluationId}`,
  ).then(normalizeDetail);
}

export async function retryBehavioralAIEvaluation(evaluationId: string): Promise<BehavioralAIRetryResponse> {
  return httpRequest<BehavioralAIRetryResponse>(`/api/v1/admin/behavioral-ai/${evaluationId}/retry`, {
    method: "POST",
  });
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
  return retryBehavioralAIEvaluation(evaluationId);
}
