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

export const candidatesService = {
  async list(page = 1, pageSize = 20, search?: string): Promise<Paginated<Candidate>> {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    return httpRequest<Paginated<Candidate>>(`/api/v1/candidates?${params.toString()}`);
  },

  async get(id: string): Promise<Candidate> {
    return httpRequest<Candidate>(`/api/v1/candidates/${id}`);
  },

  async getOverview(id: string): Promise<CandidateOverview> {
    return httpRequest<CandidateOverview>(`/api/v1/candidates/${id}/overview`);
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
