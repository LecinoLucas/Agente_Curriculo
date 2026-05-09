import { Job, JobCandidate, JobPipelineBoard, JobQualityResult, JobRanking, PipelineStage } from "../types/domain";
import { Paginated, PaginatedJobs } from "../types/api";
import { httpRequest } from "./http";

export type CreateJobRequestPayload = {
  title: string;
  description: string;
  status: string;
  requirements?: string;
  seniority_level?: string;
  minimum_education_level?: string;
  minimum_years_experience?: number | string;
  deal_breakers?: Job["deal_breakers"];
  work_model?: string;
  location?: string;
  salary_min?: number | string;
  salary_max?: number | string;
  job_area?: string;
  responsibilities?: string;
  experience_context?: string;
  behavioral_requirements?: string[];
  priority?: "low" | "normal" | "high" | "urgent";
};

export type UpdateJobRequestPayload = {
  title: string;
  description: string;
  status: string;
  requirements?: string | null;
  seniority_level?: string | null;
  minimum_education_level?: string | null;
  minimum_years_experience?: number | string | null;
  deal_breakers?: Job["deal_breakers"];
  work_model?: string | null;
  location?: string | null;
  salary_min?: number | string | null;
  salary_max?: number | string | null;
  job_area?: string | null;
  responsibilities?: string | null;
  experience_context?: string | null;
  behavioral_requirements?: string[];
  priority?: "low" | "normal" | "high" | "urgent" | null;
};

function normalizeAiStatus(value: unknown): JobCandidate["ai_status"] {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "discarded"
  ) {
    return value;
  }
  return null;
}

function requireFreshnessStatus(value: unknown): "fresh" | "stale" {
  if (value === "fresh" || value === "stale") {
    return value;
  }
  throw new Error("Invalid ranking freshness_status");
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Invalid numeric field: ${label}`);
}

export type ListJobsFilters = {
  search?: string;
  statusFilter?: "draft" | "published" | "paused" | "closed" | "cancelled" | "archived" | "all";
  jobArea?: string;
  workModel?: string;
};

export type JobLifecyclePayload = {
  reason: string;
  note?: string;
};

export async function listJobs(
  page = 1,
  page_size = 20,
  filters?: ListJobsFilters,
): Promise<PaginatedJobs<Job>> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(page_size));

  if (filters?.search?.trim()) {
    params.set("search", filters.search.trim());
  }
  if (filters?.statusFilter && filters.statusFilter !== "all") {
    params.set("status_filter", filters.statusFilter);
  }
  if (filters?.jobArea && filters.jobArea !== "all") {
    params.set("job_area", filters.jobArea);
  }
  if (filters?.workModel && filters.workModel !== "all") {
    params.set("work_model", filters.workModel);
  }

  return httpRequest<PaginatedJobs<Job>>(`/api/v1/jobs?${params.toString()}`);
}

export async function getJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}`);
}

export async function createJob(payload: CreateJobRequestPayload): Promise<Job> {
  return httpRequest<Job>("/api/v1/jobs", { method: "POST", body: payload });
}

export async function updateJob(jobId: string, payload: UpdateJobRequestPayload): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}`, { method: "PATCH", body: payload });
}

export async function publishJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}/publish`, { method: "PATCH" });
}

export async function pauseJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}/pause`, { method: "PATCH" });
}

export async function closeJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}/close`, { method: "PATCH" });
}

export async function cancelJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}/cancel`, { method: "PATCH" });
}

export async function archiveJob(jobId: string, payload: JobLifecyclePayload): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}/archive`, { method: "PATCH", body: payload });
}

export async function restoreJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}/restore`, { method: "PATCH" });
}

export async function deleteJob(jobId: string): Promise<void> {
  return httpRequest<void>(`/api/v1/jobs/${jobId}`, { method: "DELETE" });
}

export async function listJobCandidates(
  jobId: string,
  page = 1,
  page_size = 10,
  min_score?: number,
  seniority?: string,
): Promise<Paginated<JobCandidate>> {
  const response = await getJobRanking(jobId);
  const candidates: JobCandidate[] = response.candidates.map((entry) => ({
    candidate_id: entry.candidate_id,
    candidate_name: entry.candidate_name,
    job_id: response.job_id,
    stage: (entry.stage || "entry") as PipelineStage,
    candidate_status: entry.pipeline_status,
    final_score: entry.final_score,
    recommendation: entry.decision_suggestion,
    top_skills: [],
    updated_at: entry.ranking_updated_at ?? entry.computed_at,
  }));

  let filtered = candidates;
  if (min_score != null) {
    filtered = filtered.filter((c) => (c.final_score ?? 0) >= min_score);
  }
  if (seniority) {
    filtered = filtered.filter((c) => (c.seniority_level ?? "").toLowerCase() === seniority.toLowerCase());
  }

  const total = filtered.length;
  const total_pages = Math.max(1, Math.ceil(total / page_size));
  const start = (page - 1) * page_size;
  const data = filtered.slice(start, start + page_size);

  return { data, total, page, page_size, total_pages };
}

export async function getJobPipeline(jobId: string): Promise<JobPipelineBoard> {
  const response = await httpRequest<JobPipelineBoard>(`/api/v1/pipeline/${jobId}`);
  const columns = Array.isArray(response?.columns) ? response.columns : [];
  return {
    job_id: response?.job_id ?? jobId,
    columns: columns.map((column) => ({
      stage: column.stage,
      label: column.label,
      candidates: Array.isArray(column.candidates)
        ? column.candidates.map((item) => ({
            candidate_id: item.candidate_id,
            candidate_name: item.candidate_name,
            job_id: item.job_id,
            stage: item.stage,
            candidate_status: item.candidate_status,
            top_skills: Array.isArray(item.top_skills) ? item.top_skills.filter(Boolean) : [],
            updated_at: item.updated_at,
            ai_status: normalizeAiStatus(item.ai_status),
          }))
        : [],
    })),
  };
}

export async function getJobRanking(jobId: string): Promise<JobRanking> {
  const response = await httpRequest<any>(`/api/v1/jobs/${jobId}/ranking`);
  const candidatesRaw = Array.isArray(response?.candidates) ? response.candidates : [];

  return {
    job_id: response?.job_id ?? jobId,
    total_candidates: requireNumber(response?.total_candidates, "total_candidates"),
    threshold_high: requireNumber(response?.threshold_high, "threshold_high"),
    threshold_low: requireNumber(response?.threshold_low, "threshold_low"),
    score_version: response?.score_version ?? "",
    candidates: candidatesRaw.map((item: any) => ({
      rank: requireNumber(item?.rank, "rank"),
      candidate_id: item?.candidate_id ?? "",
      candidate_name: item?.candidate_name ?? "Candidato sem nome",
      stage: item?.stage ?? "",
      pipeline_status: item?.pipeline_status ?? "",
      score_breakdown: {
        skill_match_score: requireNumber(item?.score_breakdown?.skill_match_score, "score_breakdown.skill_match_score"),
        experience_match_score: requireNumber(item?.score_breakdown?.experience_match_score, "score_breakdown.experience_match_score"),
        seniority_match_score: requireNumber(item?.score_breakdown?.seniority_match_score, "score_breakdown.seniority_match_score"),
        education_score: requireNumber(item?.score_breakdown?.education_score, "score_breakdown.education_score"),
        confidence_score: requireNumber(item?.score_breakdown?.confidence_score, "score_breakdown.confidence_score"),
        penalty_score: requireNumber(item?.score_breakdown?.penalty_score, "score_breakdown.penalty_score"),
        final_score: requireNumber(item?.score_breakdown?.final_score, "score_breakdown.final_score"),
      },
      final_score: requireNumber(item?.final_score, "final_score"),
      decision_suggestion: item?.decision_suggestion ?? "review",
      reason_codes: Array.isArray(item?.reason_codes)
        ? item.reason_codes.map((reason: any) => ({
            type: reason?.type ?? "",
            field: reason?.field ?? "",
            impact: reason?.impact != null ? Number(reason.impact) : 0,
            description: reason?.description ?? "",
            expected: reason?.expected ?? null,
            actual: reason?.actual ?? null,
            reason: reason?.reason ?? null,
          }))
        : [],
      explanation_text: item?.explanation_text ?? "",
      entered_at: item?.entered_at ?? null,
      computed_at: item?.computed_at ?? new Date(0).toISOString(),
      freshness_status: requireFreshnessStatus(item?.freshness_status),
      score_computed_at: item?.score_computed_at ?? item?.computed_at ?? null,
      source_analysis_id: item?.source_analysis_id ?? null,
      source_analysis_created_at: item?.source_analysis_created_at ?? null,
      score_model_version: item?.score_model_version ?? null,
      match_updated_at: item?.match_updated_at ?? null,
      ranking_updated_at: item?.ranking_updated_at ?? null,
      version: item?.version ?? "",
      ranking_version: item?.ranking_version ?? item?.version ?? "",
    })),
  };
}

export async function getJobQuality(jobId: string): Promise<JobQualityResult> {
  return httpRequest<JobQualityResult>(`/api/v1/jobs/${jobId}/quality`);
}
