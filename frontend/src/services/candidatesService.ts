import { Candidate, CandidateOverview } from "../types/domain";
import { Paginated } from "../types/api";
import { httpRequest } from "./http";

export type CreateCandidatePayload = {
  full_name: string;
  email?: string;
  phone?: string;
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

function normalizeCandidate(candidate: Partial<Candidate> & { id?: string; full_name?: string; created_by?: string; created_at?: string; updated_at?: string }): Candidate {
  return {
    id: candidate.id ?? "",
    full_name: candidate.full_name ?? "Candidato sem nome",
    email: candidate.email ?? null,
    phone: candidate.phone ?? null,
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

function normalizeCandidateOverview(item: Partial<CandidateOverview> & { candidate?: Partial<Candidate> }): CandidateOverview {
  return {
    candidate: normalizeCandidate(item.candidate ?? {}),
    resumes: Array.isArray(item.resumes) ? item.resumes : [],
    latest_analysis: item.latest_analysis ?? null,
    latest_analysis_pipeline: item.latest_analysis_pipeline ?? null,
    top_matches: Array.isArray(item.top_matches) ? item.top_matches : [],
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

  async create(payload: CreateCandidatePayload): Promise<Candidate> {
    return httpRequest<Candidate>("/api/v1/candidates", { method: "POST", body: payload });
  },

  async update(id: string, payload: UpdateCandidatePayload): Promise<Candidate> {
    return httpRequest<Candidate>(`/api/v1/candidates/${id}`, { method: "PATCH", body: payload });
  },

  async delete(id: string): Promise<void> {
    return httpRequest<void>(`/api/v1/candidates/${id}`, { method: "DELETE" });
  },
};
