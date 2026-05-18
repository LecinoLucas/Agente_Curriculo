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
  behavioral_template_id?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  selection_flow_type?: "simple" | "standard" | "technical" | "leadership";
  requires_behavioral_assessment?: boolean;
  requires_behavioral_ai_evaluation?: boolean;
  requires_interview?: boolean;
  requires_scorecard?: boolean;
  requires_manager_review?: boolean;
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
  behavioral_template_id?: string | null;
  priority?: "low" | "normal" | "high" | "urgent" | null;
  selection_flow_type?: "simple" | "standard" | "technical" | "leadership" | null;
  requires_behavioral_assessment?: boolean | null;
  requires_behavioral_ai_evaluation?: boolean | null;
  requires_interview?: boolean | null;
  requires_scorecard?: boolean | null;
  requires_manager_review?: boolean | null;
};

function normalizeAiStatus(value: unknown): JobCandidate["ai_status"] {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "retry_scheduled" ||
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
  throw new Error("Invalid ranking_freshness_status");
}

function parseScoreFactors(value: any) {
  const buckets = ["positive", "negative", "contextual"] as const;
  return Object.fromEntries(
    buckets.map((bucket) => [
      bucket,
      Array.isArray(value?.[bucket])
        ? value[bucket].map((item: any) => ({
            factor_type: item?.factor_type ?? "",
            factor_key: item?.factor_key ?? "",
            factor_label: item?.factor_label ?? "",
            impact_score: item?.impact_score != null ? Number(item.impact_score) : 0,
            direction: item?.direction ?? "neutral",
          }))
        : [],
    ]),
  ) as {
    positive: Array<any>;
    negative: Array<any>;
    contextual: Array<any>;
  };
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
    job_fit_score: entry.job_fit_score,
    recommendation: entry.decision_suggestion,
    top_skills: [],
    updated_at: entry.ranking_updated_at ?? entry.computed_at,
  }));

  let filtered = candidates;
  if (min_score != null) {
    filtered = filtered.filter((c) => (c.job_fit_score ?? 0) >= min_score);
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
            job_fit_score: item.job_fit_score != null ? requireNumber(item.job_fit_score, "pipeline.job_fit_score") : null,
            top_skills: Array.isArray(item.top_skills) ? item.top_skills.filter(Boolean) : [],
            entered_at: item.entered_at ?? null,
            updated_at: item.updated_at,
            ai_status: normalizeAiStatus(item.ai_status),
          }))
        : [],
    })),
  };
}

export async function getJobRanking(
  jobId: string,
  params?: { page?: number; pageSize?: number },
): Promise<JobRanking> {
  const url = new URL(`/api/v1/jobs/${jobId}/ranking`, window.location.origin);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.pageSize != null) url.searchParams.set("page_size", String(params.pageSize));

  const response = await httpRequest<any>(url.pathname + url.search);
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
        job_fit_score: requireNumber(
          item?.score_breakdown?.job_fit_score,
          "score_breakdown.job_fit_score",
        ),
      },
      job_fit_score: requireNumber(item?.job_fit_score, "job_fit_score"),
      decision_suggestion: item?.decision_suggestion ?? "review",
      reason_tags: Array.isArray(item?.reason_tags)
        ? item.reason_tags.map((reason: any) => ({
            type: reason?.type ?? "",
            field: reason?.field ?? "",
            impact: reason?.impact != null ? Number(reason.impact) : 0,
            description: reason?.description ?? "",
            expected: reason?.expected ?? null,
            actual: reason?.actual ?? null,
            reason: reason?.reason ?? null,
          }))
        : [],
      score_factors: parseScoreFactors(item?.score_factors),
      data_confidence_score:
        item?.data_confidence_score != null
          ? requireNumber(item?.data_confidence_score, "data_confidence_score")
          : undefined,
      ranking_summary_text: item?.ranking_summary_text ?? "",
      entered_at: item?.entered_at ?? null,
      computed_at: item?.computed_at ?? new Date(0).toISOString(),
      ranking_freshness_status: requireFreshnessStatus(item?.ranking_freshness_status),
      match_freshness_status:
        item?.match_freshness_status != null
          ? requireFreshnessStatus(item?.match_freshness_status)
          : undefined,
      score_computed_at: item?.score_computed_at ?? item?.computed_at ?? null,
      source_analysis_id: item?.source_analysis_id ?? null,
      source_analysis_created_at: item?.source_analysis_created_at ?? null,
      score_model_version: item?.score_model_version ?? null,
      match_updated_at: item?.match_updated_at ?? null,
      ranking_updated_at: item?.ranking_updated_at ?? null,
      version: item?.version ?? "",
      ranking_version: item?.ranking_version ?? item?.version ?? "",
    })),
    page: response?.page,
    page_size: response?.page_size,
    total_pages: response?.total_pages,
  };
}

export async function getCandidateRankingEntry(
  jobId: string,
  candidateId: string,
): Promise<JobRankingEntry> {
  const response = await httpRequest<any>(
    `/api/v1/jobs/${jobId}/ranking/${candidateId}`,
  );

  return {
    rank: requireNumber(response?.rank, "rank"),
    candidate_id: response?.candidate_id ?? "",
    candidate_name: response?.candidate_name ?? "Candidato sem nome",
    stage: response?.stage ?? "",
    pipeline_status: response?.pipeline_status ?? "",
    score_breakdown: {
      skill_match_score: requireNumber(
        response?.score_breakdown?.skill_match_score,
        "score_breakdown.skill_match_score",
      ),
      experience_match_score: requireNumber(
        response?.score_breakdown?.experience_match_score,
        "score_breakdown.experience_match_score",
      ),
      seniority_match_score: requireNumber(
        response?.score_breakdown?.seniority_match_score,
        "score_breakdown.seniority_match_score",
      ),
      education_score: requireNumber(
        response?.score_breakdown?.education_score,
        "score_breakdown.education_score",
      ),
      confidence_score: requireNumber(
        response?.score_breakdown?.confidence_score,
        "score_breakdown.confidence_score",
      ),
      penalty_score: requireNumber(
        response?.score_breakdown?.penalty_score,
        "score_breakdown.penalty_score",
      ),
      job_fit_score: requireNumber(
        response?.score_breakdown?.job_fit_score,
        "score_breakdown.job_fit_score",
      ),
    },
    job_fit_score: requireNumber(response?.job_fit_score, "job_fit_score"),
    decision_suggestion: response?.decision_suggestion ?? "review",
    reason_tags: Array.isArray(response?.reason_tags)
      ? response.reason_tags.map((reason: any) => ({
          type: reason?.type ?? "",
          field: reason?.field ?? "",
          impact: reason?.impact != null ? Number(reason.impact) : 0,
          description: reason?.description ?? "",
          expected: reason?.expected ?? null,
          actual: reason?.actual ?? null,
          reason: reason?.reason ?? null,
        }))
      : [],
    score_factors: parseScoreFactors(response?.score_factors),
    data_confidence_score:
      response?.data_confidence_score != null
        ? requireNumber(response?.data_confidence_score, "data_confidence_score")
        : undefined,
    ranking_summary_text: response?.ranking_summary_text ?? "",
    entered_at: response?.entered_at ?? null,
    computed_at: response?.computed_at ?? new Date(0).toISOString(),
    ranking_freshness_status: requireFreshnessStatus(
      response?.ranking_freshness_status,
    ),
    match_freshness_status:
      response?.match_freshness_status != null
        ? requireFreshnessStatus(response?.match_freshness_status)
        : undefined,
    score_computed_at: response?.score_computed_at ?? response?.computed_at ?? null,
    source_analysis_id: response?.source_analysis_id ?? null,
    source_analysis_created_at: response?.source_analysis_created_at ?? null,
    score_model_version: response?.score_model_version ?? null,
    match_updated_at: response?.match_updated_at ?? null,
    ranking_updated_at: response?.ranking_updated_at ?? null,
    version: response?.version ?? "",
    ranking_version: response?.ranking_version ?? response?.version ?? "",
  };
}

export async function getJobQuality(jobId: string): Promise<JobQualityResult> {
  return httpRequest<JobQualityResult>(`/api/v1/jobs/${jobId}/quality`);
}
