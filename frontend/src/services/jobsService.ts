import { Job, JobCandidate, JobPipelineBoard, PipelineStage } from "../types/domain";
import { Paginated } from "../types/api";
import { httpRequest } from "./http";

export async function listJobs(page = 1, page_size = 20): Promise<Paginated<Job>> {
  return httpRequest<Paginated<Job>>(`/api/v1/jobs?page=${page}&page_size=${page_size}`);
}

export async function getJob(jobId: string): Promise<Job> {
  return httpRequest<Job>(`/api/v1/jobs/${jobId}`);
}

export async function createJob(payload: Record<string, unknown>): Promise<Job> {
  return httpRequest<Job>("/api/v1/jobs", { method: "POST", body: payload });
}

export async function updateJob(jobId: string, payload: Record<string, unknown>): Promise<Job> {
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
  const response = await httpRequest<{ job_id: string; candidates: any[] }>(`/api/v1/jobs/${jobId}/candidates`);
  const candidatesRaw = response?.candidates ?? [];

  const candidates: JobCandidate[] = candidatesRaw.map((c: any) => ({
    candidate_id: c.candidate_id,
    candidate_name: c.candidate_name,
    email: c.email,
    job_id: response.job_id,
    stage: "entry",
    candidate_status: "Recebido",
    match_score: c.match_score != null ? Number(c.match_score) : null,
    recommendation: c.recommendation ?? null,
    overall_score: c.overall_score != null ? Number(c.overall_score) : null,
    seniority_level: c.seniority_level ?? null,
    total_experience_years: c.total_experience_years != null ? Number(c.total_experience_years) : null,
    top_skills: [],
  }));

  let filtered = candidates;
  if (min_score != null) {
    filtered = filtered.filter((c) => (c.match_score ?? 0) >= min_score);
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

export async function listJobMatches(jobId: string): Promise<JobCandidate[]> {
  const response = await httpRequest<any[]>(`/api/v1/jobs/${jobId}/matches`);
  const raw = Array.isArray(response) ? response : [];
  return raw
    .map((item) => ({
      candidate_id: item.candidate_id ?? "",
      candidate_name: item.candidate_name ?? "Candidato sem nome",
      job_id: item.job_id ?? jobId,
      stage: (item.stage ?? "entry") as PipelineStage,
      candidate_status: item.candidate_status ?? "Recebido",
      match_score: item.match_score != null ? Number(item.match_score) : null,
      top_skills: Array.isArray(item.top_skills) ? item.top_skills.filter(Boolean) : [],
      updated_at: item.updated_at ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
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
            match_score: item.match_score != null ? Number(item.match_score) : null,
            top_skills: Array.isArray(item.top_skills) ? item.top_skills.filter(Boolean) : [],
            updated_at: item.updated_at,
          }))
        : [],
    })),
  };
}
