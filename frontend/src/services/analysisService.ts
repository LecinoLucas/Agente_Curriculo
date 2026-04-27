import {
  AnalysisGlobalItem,
  AnalysisMatch,
  AnalysisPipelineStatus,
  AnalysisResult,
  AnalysisStatus,
  AnalysisSummary,
} from "../types/domain";
import { httpRequest } from "./http";

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

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
    created_at: item.created_at ?? new Date(0).toISOString(),
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeAnalysisStatus(item: Partial<AnalysisStatus>): AnalysisStatus {
  return {
    analysis_id: item.analysis_id ?? "",
    status: item.status ?? "pending",
    retry_count: item.retry_count ?? 0,
    failure_reason: item.failure_reason ?? null,
    next_retry_at: item.next_retry_at ?? null,
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    failed_at: item.failed_at ?? null,
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizePipelineStatus(item: Partial<AnalysisPipelineStatus>): AnalysisPipelineStatus {
  return {
    analysis_id: item.analysis_id ?? "",
    analysis_status: item.analysis_status ?? "pending",
    matching_status: item.matching_status ?? "waiting_analysis",
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
    overall_score: item.overall_score ?? null,
    technical_score: item.technical_score ?? null,
    experience_score: item.experience_score ?? null,
    education_score: item.education_score ?? null,
    communication_score: item.communication_score ?? null,
    leadership_score: item.leadership_score ?? null,
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
  request: (resumeVersionId: string) =>
    httpRequest<{ analysis_id: string }>(`/api/v1/analyses?resume_version_id=${resumeVersionId}`, {
      method: "POST",
    }),

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
      data: Array.isArray(payload?.data) ? payload.data : [],
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
