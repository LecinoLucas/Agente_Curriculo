import {
  Candidate,
  CandidateLatestAnalysisOverview,
  CandidateListSummary,
  CandidateOverview,
  PipelineStage,
} from "../types/domain";
import { Paginated } from "../types/api";
import { httpRequest } from "./http";

export type CandidateCheckResponse = {
  exists: boolean;
  candidate_id: string | null;
  full_name: string | null;
};

export type CreateCandidatePayload = {
  full_name: string;
  email: string;
  phone?: string;
  cpf?: string;
  location_city?: string;
  location_state?: string;
  location_country?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  internal_notes?: string;
  tags?: string[];
};

export type UpdateCandidatePayload = Partial<CreateCandidatePayload>;
export type UpdateCandidateStagePayload = {
  job_id: string;
  stage: PipelineStage;
};

export type UpdateCandidateStageResponse = {
  candidate_id: string;
  job_id: string;
  stage: PipelineStage;
  candidate_status: string;
  match_score: number | null;
  updated_at: string;
};

function normalizeCandidate(candidate: Partial<Candidate> & { id?: string; full_name?: string; created_by?: string; created_at?: string; updated_at?: string }): Candidate {
  return {
    id: candidate.id ?? "",
    full_name: candidate.full_name ?? "Candidato sem nome",
    email: candidate.email ?? null,
    phone: candidate.phone ?? null,
    cpf: candidate.cpf ?? null,
    location_city: candidate.location_city ?? null,
    location_state: candidate.location_state ?? null,
    location_country: candidate.location_country ?? "Brasil",
    linkedin_url: candidate.linkedin_url ?? null,
    github_url: candidate.github_url ?? null,
    portfolio_url: candidate.portfolio_url ?? null,
    internal_notes: candidate.internal_notes ?? null,
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    user_id: candidate.user_id ?? null,
    created_by: candidate.created_by ?? "",
    created_at: candidate.created_at ?? new Date(0).toISOString(),
    updated_at: candidate.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeLatestAnalysis(
  item: Partial<CandidateLatestAnalysisOverview>,
): CandidateLatestAnalysisOverview {
  return {
    analysis_id: item.analysis_id ?? "",
    resume_id: item.resume_id ?? "",
    resume_title: item.resume_title ?? "",
    status: item.status ?? "pending",
    started_at: item.started_at ?? null,
    completed_at: item.completed_at ?? null,
    failed_at: item.failed_at ?? null,
    failure_reason: item.failure_reason ?? null,
    used_real_ai: item.used_real_ai ?? null,
    task_id: item.task_id ?? null,
    worker_id: item.worker_id ?? null,
    overall_score: item.overall_score != null ? Number(item.overall_score) : null,
    seniority_level: item.seniority_level ?? null,
    total_experience_years:
      item.total_experience_years != null ? Number(item.total_experience_years) : null,
    created_at: item.created_at ?? new Date(0).toISOString(),
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeCandidateOverview(item: Partial<CandidateOverview> & { candidate?: Partial<Candidate> }): CandidateOverview {
  return {
    candidate: normalizeCandidate(item.candidate ?? {}),
    resumes: Array.isArray(item.resumes) ? item.resumes : [],
    latest_analysis: item.latest_analysis ? normalizeLatestAnalysis(item.latest_analysis) : null,
    latest_analysis_pipeline: item.latest_analysis_pipeline ?? null,
    top_matches: Array.isArray(item.top_matches) ? item.top_matches : [],
    pipeline_entries: Array.isArray(item.pipeline_entries) ? item.pipeline_entries : [],
  };
}

export const candidatesService = {
  async list(page = 1, pageSize = 20, search?: string): Promise<Paginated<Candidate>> {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    return httpRequest<Paginated<Candidate>>(`/api/v1/candidates?${params.toString()}`).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data.map(normalizeCandidate) : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
    }));
  },

  async get(id: string): Promise<Candidate> {
    return httpRequest<Candidate>(`/api/v1/candidates/${id}`);
  },

  async getOverview(id: string): Promise<CandidateOverview> {
    return httpRequest<CandidateOverview>(`/api/v1/candidates/${id}/overview`).then(normalizeCandidateOverview);
  },

  async listSummaries(
    page = 1,
    pageSize = 20,
    search?: string,
    hasResume?: boolean,
    aiStatus?: string[],
  ): Promise<Paginated<CandidateListSummary>> {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (hasResume !== undefined) params.set("has_resume", String(hasResume));
    if (aiStatus?.length) aiStatus.forEach((s) => params.append("ai_status", s));
    return httpRequest<Paginated<CandidateListSummary>>(
      `/api/v1/candidates/summaries?${params.toString()}`,
    );
  },

  async checkDuplicate(email?: string, cpf?: string): Promise<CandidateCheckResponse> {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (cpf) params.set("cpf", cpf);
    return httpRequest<CandidateCheckResponse>(`/api/v1/candidates/search?${params.toString()}`);
  },

  async create(payload: CreateCandidatePayload): Promise<Candidate> {
    return httpRequest<Candidate>("/api/v1/candidates", { method: "POST", body: payload });
  },

  async update(id: string, payload: UpdateCandidatePayload): Promise<Candidate> {
    return httpRequest<Candidate>(`/api/v1/candidates/${id}`, { method: "PATCH", body: payload });
  },

  async delete(id: string): Promise<void> {
    return httpRequest<void>(`/api/v1/candidates/${id}`, { method: "DELETE" });
  },

  async updateStage(id: string, payload: UpdateCandidateStagePayload): Promise<UpdateCandidateStageResponse> {
    return httpRequest<UpdateCandidateStageResponse>(`/api/v1/candidates/${id}/stage`, {
      method: "PATCH",
      body: payload,
    }).then((item) => ({
      candidate_id: item.candidate_id,
      job_id: item.job_id,
      stage: item.stage,
      candidate_status: item.candidate_status ?? "Em processo",
      match_score: item.match_score != null ? Number(item.match_score) : null,
      updated_at: item.updated_at ?? new Date(0).toISOString(),
    }));
  },
};
