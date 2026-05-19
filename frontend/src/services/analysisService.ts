import {
  AnalysisGlobalItem,
  AnalysisMatch,
  AnalysisPipelineStatus,
  AnalysisResult,
  AnalysisStatus,
  AnalysisSummary,
} from "../types/domain";
import { HttpError, httpRequest } from "./http";

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type AnalysisLifecyclePayload = {
  reason: string;
  note?: string;
};

export type AnalysisRequestResult = {
  analysis_id: string;
  status: AnalysisStatus["status"];
  created: boolean;
  blocked: boolean;
  reused: boolean;
  stuck: boolean;
  reason: string;
};

export type AnalysisRequestOptions = {
  force?: boolean;
};

function formatRetryAfter(seconds: number): string {
  const rounded = Math.max(1, Math.ceil(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  if (remaining === 0) return `${minutes}min`;
  return `${minutes}min ${remaining}s`;
}

function rethrowAnalysisRateLimit(error: unknown): never {
  if (error instanceof HttpError && error.status === 429) {
    // P0.2C: when the backend signals the daily limit was hit (vs. the generic
    // per-minute throttler), surface a distinct, actionable message and keep
    // the `code` so the UI can branch on it (admin-only "Aumentar limite" CTA).
    if (error.code === "ai_daily_limit_exceeded") {
      throw new HttpError(
        429,
        "Limite diário de análises atingido.",
        error.code,
        error.data,
        error.detail,
        error.retryAfterSeconds,
      );
    }
    const base = "🚫 Limite de uso da IA atingido. Aguarde alguns minutos ou troque a chave da API.";
    const withRetryAfter =
      typeof error.retryAfterSeconds === "number" && Number.isFinite(error.retryAfterSeconds)
        ? `${base} Tempo estimado para nova tentativa: ${formatRetryAfter(error.retryAfterSeconds)}.`
        : base;
    throw new HttpError(
      429,
      withRetryAfter,
      error.code,
      error.data,
      error.detail,
      error.retryAfterSeconds,
    );
  }
  throw error;
}

function normalizeAnalysisSummary(item: Partial<AnalysisSummary> & { id?: string }): AnalysisSummary {
  return {
    id: item.id ?? "",
    resume_id: item.resume_id ?? null,
    resume_version_id: item.resume_version_id ?? null,
    candidate_id: item.candidate_id ?? null,
    candidate_name: item.candidate_name ?? null,
    resume_title: item.resume_title ?? null,
    resume_file_name: item.resume_file_name ?? null,
    job_id: item.job_id ?? null,
    status: item.status ?? "pending",
    priority: item.priority ?? 0,
    retry_count: item.retry_count ?? 0,
    requested_by: item.requested_by ?? "",
    requested_by_name: item.requested_by_name ?? null,
    failure_reason: item.failure_reason ?? null,
    discarded_at: item.discarded_at ?? null,
    discarded_by: item.discarded_by ?? null,
    discard_reason: item.discard_reason ?? null,
    discard_reason_note: item.discard_reason_note ?? null,
    created_at: item.created_at ?? new Date(0).toISOString(),
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeAnalysisStatus(item: Partial<AnalysisStatus>): AnalysisStatus {
  return {
    analysis_id: item.analysis_id ?? "",
    status: item.status ?? "pending",
    retry_count: item.retry_count ?? 0,
    stuck: Boolean(item.stuck),
    reason: item.reason ?? null,
    failure_reason: item.failure_reason ?? null,
    next_retry_at: item.next_retry_at ?? null,
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    failed_at: item.failed_at ?? null,
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeAnalysisGlobalItem(item: Partial<AnalysisGlobalItem>): AnalysisGlobalItem {
  return {
    id: item.id ?? "",
    job_id: item.job_id ?? null,
    candidate_id: item.candidate_id ?? null,
    candidate_name: item.candidate_name ?? null,
    candidate_email: item.candidate_email ?? null,
    resume_file_name: item.resume_file_name ?? null,
    resume_version_id: item.resume_version_id ?? "",
    status: item.status ?? "pending",
    failure_reason: item.failure_reason ?? null,
    discarded_at: item.discarded_at ?? null,
    discarded_by: item.discarded_by ?? null,
    discard_reason: item.discard_reason ?? null,
    discard_reason_note: item.discard_reason_note ?? null,
    used_real_ai: item.used_real_ai ?? null,
    retry_count: item.retry_count ?? 0,
    next_retry_at: item.next_retry_at ?? null,
    provider_error_type: item.provider_error_type ?? null,
    provider_status_code: item.provider_status_code ?? null,
    stuck: Boolean(item.stuck),
    reason: item.reason ?? null,
    created_at: item.created_at ?? new Date(0).toISOString(),
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    failed_at: item.failed_at ?? null,
  };
}

function normalizePipelineStatus(item: Partial<AnalysisPipelineStatus>): AnalysisPipelineStatus {
  return {
    analysis_id: item.analysis_id ?? "",
    job_id: item.job_id ?? null,
    analysis_status: item.analysis_status ?? "pending",
    matching_status: item.matching_status ?? "waiting_analysis",
    matching_error: item.matching_error ?? null,
    published_jobs_total: item.published_jobs_total ?? 0,
    matched_jobs_count: item.matched_jobs_count ?? 0,
    pending_jobs_count: item.pending_jobs_count ?? 0,
    recent_matches: Array.isArray(item.recent_matches) ? item.recent_matches : [],
  };
}

function normalizeAnalysisResult(item: Partial<AnalysisResult>): AnalysisResult {
  return {
    analysis_id: item.analysis_id ?? "",
    resume_id: item.resume_id ?? null,
    resume_version_id: item.resume_version_id ?? null,
    candidate_id: item.candidate_id ?? null,
    candidate_name: item.candidate_name ?? null,
    resume_title: item.resume_title ?? null,
    resume_file_name: item.resume_file_name ?? null,
    requested_by: item.requested_by ?? "",
    requested_by_name: item.requested_by_name ?? null,
    worker_id: item.worker_id ?? null,
    task_id: item.task_id ?? null,
    used_real_ai: item.used_real_ai ?? false,
    candidate_summary: item.candidate_summary ?? null,
    seniority_level: item.seniority_level ?? null,
    total_experience_years: item.total_experience_years ?? null,
    strengths: Array.isArray(item.strengths) ? item.strengths : [],
    weaknesses: Array.isArray(item.weaknesses) ? item.weaknesses : [],
    recommendations: Array.isArray(item.recommendations) ? item.recommendations : [],
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    input_tokens: item.input_tokens ?? null,
    output_tokens: item.output_tokens ?? null,
    cache_read_tokens: item.cache_read_tokens ?? null,
    cache_write_tokens: item.cache_write_tokens ?? null,
    processing_time_ms: item.processing_time_ms ?? null,
    created_at: item.created_at ?? new Date(0).toISOString(),
  };
}

export const analysisService = {
  request: (resumeVersionId: string, jobId: string, options: AnalysisRequestOptions = {}) => {
    if (!jobId?.trim()) {
      throw new Error("job_id é obrigatório para solicitar análise manual");
    }
    const params = new URLSearchParams({
      resume_version_id: resumeVersionId,
      job_id: jobId,
    });
    if (options.force) {
      params.set("force", "true");
    }
    return httpRequest<AnalysisRequestResult>(`/api/v1/analyses?${params.toString()}`, {
      method: "POST",
    }).catch((error) => rethrowAnalysisRateLimit(error));
  },

  list: (
    page = 1,
    pageSize = 10,
    status?: AnalysisSummary["status"] | "all",
  ): Promise<PaginatedResponse<AnalysisSummary>> => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });

    if (status && status !== "all") {
      params.set("status", status);
    }

    return httpRequest<PaginatedResponse<AnalysisSummary>>(`/api/v1/analyses?${params.toString()}`).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data.map(normalizeAnalysisSummary) : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
    }));
  },
  status: (analysisId: string) =>
    httpRequest<AnalysisStatus>(`/api/v1/analyses/${analysisId}/status`).then(normalizeAnalysisStatus),
  pipeline: (analysisId: string) =>
    httpRequest<AnalysisPipelineStatus>(`/api/v1/analyses/${analysisId}/pipeline`).then(normalizePipelineStatus),
  result: (analysisId: string) =>
    httpRequest<AnalysisResult>(`/api/v1/analyses/${analysisId}/result`).then(normalizeAnalysisResult),

  retry: (analysisId: string) =>
    httpRequest<{ analysis_id: string; status: string }>(
      `/api/v1/analyses/${analysisId}/retry`,
      { method: "POST" }
    ).catch((error) => rethrowAnalysisRateLimit(error)),

  discard: (analysisId: string, payload: AnalysisLifecyclePayload) =>
    httpRequest<AnalysisSummary>(
      `/api/v1/analyses/${analysisId}/discard`,
      { method: "PATCH", body: payload }
    ).then(normalizeAnalysisSummary),

  forceFail: (analysisId: string) =>
    httpRequest<{ status: string }>(
      `/api/v1/analyses/${analysisId}/force-fail`,
      { method: "POST" }
    ),

  bulkForceFail: (analysisIds: string[]) =>
    httpRequest<{ processed: number; skipped: number }>(
      `/api/v1/analyses/bulk-force-fail`,
      { method: "POST", body: { analysis_ids: analysisIds } }
    ),

  bulkRetry: (analysisIds: string[]) =>
    httpRequest<{ processed: number; skipped: number }>(
      `/api/v1/analyses/bulk-retry`,
      { method: "POST", body: { analysis_ids: analysisIds } }
    ).catch((error) => rethrowAnalysisRateLimit(error)),

  listGlobal: (
    page = 1,
    pageSize = 20,
    statusFilter?: string,
    search?: string,
    usedRealAi?: boolean,
  ): Promise<PaginatedResponse<AnalysisGlobalItem>> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (usedRealAi !== undefined) params.set("used_real_ai", String(usedRealAi));
    return httpRequest<PaginatedResponse<AnalysisGlobalItem>>(
      `/api/v1/analyses/global?${params.toString()}`,
    ).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data.map(normalizeAnalysisGlobalItem) : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
    }));
  },
};

export async function matchToJob(analysisId: string, jobId: string): Promise<AnalysisMatch> {
  return httpRequest<AnalysisMatch>(`/api/v1/analyses/${analysisId}/match/${jobId}`, {
    method: "POST",
  });
}
