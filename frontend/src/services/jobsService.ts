import { Job, JobCandidate } from "../types/domain";
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
    match_score: c.match_score != null ? Number(c.match_score) : null,
    recommendation: c.recommendation ?? null,
    overall_score: c.overall_score != null ? Number(c.overall_score) : null,
    seniority_level: c.seniority_level ?? null,
    total_experience_years: c.total_experience_years != null ? Number(c.total_experience_years) : null,
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
