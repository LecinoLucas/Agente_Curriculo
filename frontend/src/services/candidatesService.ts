import {
  Candidate,
  CandidateLatestAnalysisOverview,
  CandidateListSummary,
  CandidateNote,
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
export type CandidateNotePayload = {
  note_text: string;
};
export type DeleteCandidatePayload = {
  reason: string;
  note?: string;
  confirmation: string;
};

export type ArchiveCandidatePayload = {
  reason: string;
  note?: string;
};

export type UpdateCandidateStagePayload = {
  job_id: string;
  stage: PipelineStage;
};

export type UpdateCandidateStageResponse = {
  candidate_id: string;
  job_id: string;
  stage: PipelineStage;
  candidate_status: string;
  updated_at: string;
};

export type ListCandidatesParams = {
  search?: string;
  archived?: boolean;
  application_source?: string;
  city?: string;
  state?: string;
  salary_min?: number;
  salary_max?: number;
  desired_contract_type?: string;
  link_status_filter?: string;
  has_resume?: boolean;
  skill?: string;
  seniority?: string;
};

export type ListCandidateSummariesParams = {
  search?: string;
  has_resume?: boolean;
  ai_status?: string[];
  archived?: boolean;
  application_source?: string;
  city?: string;
  state?: string;
  salary_min?: number;
  salary_max?: number;
  desired_contract_type?: string;
  link_status_filter?: string;
  skill?: string;
  seniority?: string;
};

function normalizeCandidate(candidate: Partial<Candidate> & { id?: string; full_name?: string; created_by?: string; created_at?: string; updated_at?: string }): Candidate {
  return {
    id: candidate.id ?? "",
    full_name: candidate.full_name ?? "Candidato sem nome",
    email: candidate.email ?? null,
    phone: candidate.phone ?? null,
    cpf: candidate.cpf ?? null,
    application_source: candidate.application_source ?? null,
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
    archived_at: candidate.archived_at ?? null,
    archived_by: candidate.archived_by ?? null,
    archive_reason: candidate.archive_reason ?? null,
    archive_reason_note: candidate.archive_reason_note ?? null,
  };
}

function normalizeLatestAnalysis(
  item: Partial<CandidateLatestAnalysisOverview>,
): CandidateLatestAnalysisOverview {
  return {
    analysis_id: item.analysis_id ?? "",
    job_id: item.job_id ?? null,
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
    seniority_level: item.seniority_level ?? null,
    total_experience_years:
      item.total_experience_years != null ? Number(item.total_experience_years) : null,
    created_at: item.created_at ?? new Date(0).toISOString(),
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeLatestAnalysisPipeline(
  item: Partial<NonNullable<CandidateOverview["latest_analysis_pipeline"]>> | null | undefined,
): CandidateOverview["latest_analysis_pipeline"] {
  if (!item) return null;
  return {
    analysis_id: item.analysis_id ?? "",
    job_id: item.job_id ?? null,
    matching_status: item.matching_status ?? "waiting_analysis",
    matching_error: item.matching_error ?? null,
    published_jobs_total: item.published_jobs_total ?? 0,
    matched_jobs_count: item.matched_jobs_count ?? 0,
    pending_jobs_count: item.pending_jobs_count ?? 0,
  };
}

function normalizeSkillPreview(
  item: Partial<NonNullable<CandidateOverview["active_job_skill_preview"]>> | null | undefined,
): CandidateOverview["active_job_skill_preview"] {
  if (!item) return null;
  return {
    matched_skills: Array.isArray(item.matched_skills) ? item.matched_skills.filter(Boolean) : [],
    attention_points: Array.isArray(item.attention_points) ? item.attention_points.filter(Boolean) : [],
  };
}

function normalizeScoreDimensions(
  item: Partial<NonNullable<CandidateOverview["active_job_score_dimensions"]>> | null | undefined,
): CandidateOverview["active_job_score_dimensions"] {
  if (!item) return null;

  const parseValue = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    skills: parseValue(item.skills),
    experience: parseValue(item.experience),
    seniority: parseValue(item.seniority),
    education: parseValue(item.education),
    confidence: parseValue(item.confidence),
  };
}

function normalizeCandidateOverview(item: Partial<CandidateOverview> & { candidate?: Partial<Candidate> }): CandidateOverview {
  const normalizedEntries = Array.isArray(item.pipeline_entries)
    ? item.pipeline_entries.map((entry) => ({
        candidate_id: entry?.candidate_id ?? "",
        job_id: entry?.job_id ?? "",
        job_title: entry?.job_title ?? "",
        stage: (entry?.stage ?? "entry") as PipelineStage,
        resume_version_id: entry?.resume_version_id ?? null,
        relationship_status: entry?.relationship_status ?? "active",
        is_terminal: Boolean(entry?.is_terminal),
        terminated_at: entry?.terminated_at ?? null,
        termination_reason: entry?.termination_reason ?? null,
        candidate_status: entry?.candidate_status ?? "Em processo",
        updated_at: entry?.updated_at ?? new Date(0).toISOString(),
      }))
    : [];

  return {
    candidate: normalizeCandidate(item.candidate ?? {}),
    resumes: Array.isArray(item.resumes)
      ? item.resumes.map((resume) => ({
          ...resume,
          resume_url: resume.resume_url ?? null,
          document_url: resume.document_url ?? null,
        }))
      : [],
    latest_analysis: item.latest_analysis ? normalizeLatestAnalysis(item.latest_analysis) : null,
    latest_analysis_pipeline: normalizeLatestAnalysisPipeline(item.latest_analysis_pipeline),
    top_matches: Array.isArray(item.top_matches) ? item.top_matches : [],
    active_job_id: typeof item.active_job_id === "string" ? item.active_job_id : null,
    active_job:
      item.active_job &&
      typeof item.active_job.id === "string" &&
      typeof item.active_job.title === "string" &&
      typeof item.active_job.status === "string"
        ? {
            id: item.active_job.id,
            title: item.active_job.title,
            status: item.active_job.status,
          }
        : null,
    pipeline_entries: normalizedEntries,
    active_job_decision: item.active_job_decision ?? null,
    active_job_skill_preview: normalizeSkillPreview(item.active_job_skill_preview),
    active_job_score_dimensions: normalizeScoreDimensions(item.active_job_score_dimensions),
    latest_note: item.latest_note ?? null,
    preview_pendencies: Array.isArray(item.preview_pendencies) ? item.preview_pendencies : [],
    latest_movement: item.latest_movement ?? null,
  };
}

function normalizeCandidateSummary(item: Partial<CandidateListSummary>): CandidateListSummary {
  return {
    id: item.id ?? "",
    full_name: item.full_name ?? "Candidato sem nome",
    email: item.email ?? null,
    phone: item.phone ?? null,
    cpf: item.cpf ?? null,
    application_source: item.application_source ?? null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    created_at: item.created_at ?? new Date(0).toISOString(),
    archived_at: item.archived_at ?? null,
    archive_reason: item.archive_reason ?? null,
    resume_count: item.resume_count ?? 0,
    linked_job_count: item.linked_job_count ?? 0,
    latest_job_id: typeof item.latest_job_id === "string" ? item.latest_job_id : null,
    latest_job_title: item.latest_job_title ?? null,
    latest_job_stage: item.latest_job_stage ?? null,
    latest_relationship_status: item.latest_relationship_status ?? null,
    active_job_id: typeof item.active_job_id === "string" ? item.active_job_id : null,
    active_job_title: item.active_job_title ?? null,
    active_job_stage: item.active_job_stage ?? null,
    active_job_job_fit_score:
      item.active_job_job_fit_score != null ? Number(item.active_job_job_fit_score) : null,
    ai_status: item.ai_status ?? null,
  };
}

export const candidatesService = {
  async list(
    page = 1,
    pageSize = 20,
    params: string | ListCandidatesParams = {},
  ): Promise<Paginated<Candidate>> {
    const urlParams = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const search = typeof params === "string" ? params : params.search;
    const archived = typeof params === "string" ? undefined : params.archived;
    const applicationSource = typeof params === "string" ? undefined : params.application_source;
    const city = typeof params === "string" ? undefined : params.city;
    const state = typeof params === "string" ? undefined : params.state;
    const salaryMin = typeof params === "string" ? undefined : params.salary_min;
    const salaryMax = typeof params === "string" ? undefined : params.salary_max;
    const desiredContractType =
      typeof params === "string" ? undefined : params.desired_contract_type;
    const linkStatusFilter = typeof params === "string" ? undefined : params.link_status_filter;
    const hasResume = typeof params === "string" ? undefined : params.has_resume;
    const skill = typeof params === "string" ? undefined : params.skill;
    const seniority = typeof params === "string" ? undefined : params.seniority;
    if (search) urlParams.set("search", search);
    if (archived !== undefined) urlParams.set("archived", String(archived));
    if (applicationSource) urlParams.set("application_source", applicationSource);
    if (city) urlParams.set("city", city);
    if (state) urlParams.set("state", state);
    if (salaryMin !== undefined) urlParams.set("salary_min", String(salaryMin));
    if (salaryMax !== undefined) urlParams.set("salary_max", String(salaryMax));
    if (desiredContractType) urlParams.set("desired_contract_type", desiredContractType);
    if (linkStatusFilter) urlParams.set("link_status_filter", linkStatusFilter);
    if (hasResume !== undefined) urlParams.set("has_resume", String(hasResume));
    if (skill) urlParams.set("skill", skill);
    if (seniority) urlParams.set("seniority", seniority);
    return httpRequest<Paginated<Candidate>>(`/api/v1/candidates?${urlParams.toString()}`).then((payload) => ({
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
    searchOrParams?: string | ListCandidateSummariesParams,
    hasResume?: boolean,
    aiStatus?: string[],
    archived?: boolean,
    applicationSource?: string,
  ): Promise<Paginated<CandidateListSummary>> {
    const paramsInput: ListCandidateSummariesParams =
      typeof searchOrParams === "string"
        ? {
            search: searchOrParams,
            has_resume: hasResume,
            ai_status: aiStatus,
            archived,
            application_source: applicationSource,
          }
        : (searchOrParams ?? {});

    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (paramsInput.search) params.set("search", paramsInput.search);
    if (paramsInput.has_resume !== undefined) params.set("has_resume", String(paramsInput.has_resume));
    if (paramsInput.ai_status?.length) paramsInput.ai_status.forEach((s) => params.append("ai_status", s));
    if (paramsInput.archived !== undefined) params.set("archived", String(paramsInput.archived));
    if (paramsInput.application_source) params.set("application_source", paramsInput.application_source);
    if (paramsInput.city) params.set("city", paramsInput.city);
    if (paramsInput.state) params.set("state", paramsInput.state);
    if (paramsInput.salary_min !== undefined) params.set("salary_min", String(paramsInput.salary_min));
    if (paramsInput.salary_max !== undefined) params.set("salary_max", String(paramsInput.salary_max));
    if (paramsInput.desired_contract_type) {
      params.set("desired_contract_type", paramsInput.desired_contract_type);
    }
    if (paramsInput.link_status_filter) params.set("link_status_filter", paramsInput.link_status_filter);
    if (paramsInput.skill) params.set("skill", paramsInput.skill);
    if (paramsInput.seniority) params.set("seniority", paramsInput.seniority);
    return httpRequest<Paginated<CandidateListSummary>>(
      `/api/v1/candidates/summaries?${params.toString()}`,
    ).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data.map(normalizeCandidateSummary) : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
    }));
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

  async delete(id: string, payload: DeleteCandidatePayload): Promise<void> {
    return httpRequest<void>(`/api/v1/candidates/${id}`, { method: "DELETE", body: payload });
  },

  async archive(id: string, payload: ArchiveCandidatePayload): Promise<Candidate> {
    return httpRequest<Candidate>(`/api/v1/candidates/${id}/archive`, { method: "PATCH", body: payload });
  },

  async restore(id: string): Promise<Candidate> {
    return httpRequest<Candidate>(`/api/v1/candidates/${id}/restore`, { method: "PATCH" });
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
      updated_at: item.updated_at ?? new Date(0).toISOString(),
    }));
  },

  async listNotes(candidateId: string): Promise<CandidateNote[]> {
    return httpRequest<CandidateNote[]>(`/api/v1/candidates/${candidateId}/notes`);
  },

  async createNote(candidateId: string, payload: CandidateNotePayload): Promise<CandidateNote> {
    return httpRequest<CandidateNote>(`/api/v1/candidates/${candidateId}/notes`, {
      method: "POST",
      body: payload,
    });
  },

  async updateNote(
    candidateId: string,
    noteId: string,
    payload: CandidateNotePayload,
  ): Promise<CandidateNote> {
    return httpRequest<CandidateNote>(`/api/v1/candidates/${candidateId}/notes/${noteId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deleteNote(candidateId: string, noteId: string): Promise<void> {
    return httpRequest<void>(`/api/v1/candidates/${candidateId}/notes/${noteId}`, {
      method: "DELETE",
    });
  },
};
