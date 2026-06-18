import {
  Resume,
  ResumeExtractionRetryResponse,
  ResumeExtractionStatusResponse,
  ResumeFileUploadResponse,
  ResumeSummary,
  ResumeUploadResponse,
  PaginatedResponse,
  CandidateResumeDownloadUrl,
} from "../types/domain";
import { API_BASE_URL, HttpError, httpRequest } from "./http";
import { tokenStorage } from "../utils/storage";

function normalizeResumeSummary(item: Partial<ResumeSummary> & { id?: string; candidate_id?: string; title?: string; status?: string; current_version?: number; updated_at?: string }): ResumeSummary {
  return {
    id: item.id ?? "",
    candidate_id: item.candidate_id ?? "",
    candidate_name: item.candidate_name ?? null,
    title: item.title ?? "Curriculo sem titulo",
    status: item.status ?? "active",
    current_version: item.current_version ?? 1,
    current_version_id: item.current_version_id ?? null,
    current_file_name: item.current_file_name ?? null,
    extraction_status: item.extraction_status ?? null,
    updated_at: item.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeResumeFileUpload(item: Partial<ResumeFileUploadResponse>): ResumeFileUploadResponse {
  return {
    resume_id: item.resume_id ?? "",
    candidate_id: item.candidate_id ?? "",
    candidate_full_name: item.candidate_full_name ?? "",
    version_id: item.version_id ?? "",
    analysis_auto_requested: item.analysis_auto_requested ?? false,
    analysis_id: item.analysis_id ?? null,
    analysis_status: item.analysis_status ?? null,
    original_file_name: item.original_file_name ?? "",
    file_size_bytes: item.file_size_bytes ?? 0,
    file_hash_sha256: item.file_hash_sha256 ?? "",
    extraction_status: item.extraction_status ?? "pending",
    page_count: item.page_count ?? null,
    word_count: item.word_count ?? null,
    prefilled_fields: Array.isArray(item.prefilled_fields) ? item.prefilled_fields : [],
  };
}

function normalizeResumeExtractionStatus(
  item: Partial<ResumeExtractionStatusResponse>,
): ResumeExtractionStatusResponse {
  return {
    resume_id: item.resume_id ?? "",
    version_id: item.version_id ?? "",
    extraction_status: item.extraction_status ?? "pending",
    extraction_error: item.extraction_error ?? null,
    original_file_name: item.original_file_name ?? "",
    page_count: item.page_count ?? null,
    word_count: item.word_count ?? null,
    can_retry_extraction: item.can_retry_extraction ?? false,
    retry_extraction_reason: item.retry_extraction_reason ?? null,
    extraction_status_label: item.extraction_status_label ?? null,
  };
}

export const resumeService = {
  list: (page = 1, pageSize = 20) =>
    httpRequest<PaginatedResponse<ResumeSummary>>(`/api/v1/resumes?page=${page}&page_size=${pageSize}`).then((payload) => {
      // The backend now returns { data, page, page_size, total, total_pages }
      // We map over data to ensure format
      return {
        ...payload,
        data: Array.isArray(payload?.data) ? payload.data.map(normalizeResumeSummary) : [],
      };
    }),

  get: (id: string) => httpRequest<Resume>(`/api/v1/resumes/${id}`),

  initiateUpload: (candidateId?: string) =>
    httpRequest<ResumeUploadResponse>("/api/v1/resumes", {
      method: "POST",
      body: candidateId ? { candidate_id: candidateId } : undefined,
    }),

  uploadPdf: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return httpRequest<ResumeFileUploadResponse>(`/api/v1/resumes/${id}/upload`, {
      method: "POST",
      body: formData,
    }).then(normalizeResumeFileUpload);
  },

  getExtractionStatus: (id: string) =>
    httpRequest<ResumeExtractionStatusResponse>(`/api/v1/resumes/${id}/extraction-status`).then(
      normalizeResumeExtractionStatus,
    ),

  retryExtraction: (id: string) =>
    httpRequest<ResumeExtractionRetryResponse>(`/api/v1/resumes/${id}/retry-extraction`, {
      method: "POST",
    }),

  update: (id: string, payload: { title?: string; status?: "active" | "archived" }) =>
    httpRequest<Resume>(`/api/v1/resumes/${id}`, { method: "PATCH", body: payload }),

  archive: (id: string) =>
    httpRequest<Resume>(`/api/v1/resumes/${id}/archive`, { method: "PATCH" }),

  activate: (id: string) =>
    httpRequest<Resume>(`/api/v1/resumes/${id}/activate`, { method: "PATCH" }),

  delete: (id: string) =>
    httpRequest<void>(`/api/v1/resumes/${id}`, { method: "DELETE" }),

  getCandidateResumeDownloadUrl: (
    candidateId: string,
    resumeId: string,
    options?: { versionId?: string | null; disposition?: "inline" | "attachment" },
  ) => {
    const params = new URLSearchParams();
    if (options?.versionId) params.set("version_id", options.versionId);
    if (options?.disposition) params.set("disposition", options.disposition);
    const query = params.toString();
    return httpRequest<CandidateResumeDownloadUrl>(
      `/api/v1/candidates/${candidateId}/resumes/${resumeId}/download-url${query ? `?${query}` : ""}`,
    );
  },

  fetchCandidateResumeFile: async (
    candidateId: string,
    resumeId: string,
    options?: { versionId?: string | null; disposition?: "inline" | "attachment" },
  ): Promise<{ blob: Blob; contentType: string; filename: string }> => {
    const token = tokenStorage.get();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const params = new URLSearchParams();
    if (options?.versionId) params.set("version_id", options.versionId);
    params.set("disposition", options?.disposition ?? "attachment");
    const url = `${API_BASE_URL}/api/v1/candidates/${candidateId}/resumes/${resumeId}/download?${params.toString()}`;
    const response = await fetch(url, { headers, credentials: "include" });

    if (!response.ok) {
      if (response.status === 404) {
        throw new HttpError(404, "Currículo não encontrado para este candidato");
      }
      if (response.status === 403) {
        throw new HttpError(403, "Sem permissão para acessar o currículo");
      }
      throw new HttpError(response.status, "Não foi possível carregar o currículo");
    }

    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filenameMatch = /filename="([^"]+)"/.exec(disposition);
    const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
    return {
      blob: await response.blob(),
      contentType,
      filename: filenameMatch?.[1] ?? "curriculo",
    };
  },

  downloadCandidateResume: async (
    candidateId: string,
    resumeId: string,
    options?: { versionId?: string | null },
  ): Promise<void> => {
    const payload = await resumeService.fetchCandidateResumeFile(candidateId, resumeId, {
      versionId: options?.versionId ?? null,
      disposition: "attachment",
    });
    const url = URL.createObjectURL(payload.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.filename || "curriculo";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  downloadByCandidateId: async (candidateId: string): Promise<void> => {
    const token = tokenStorage.get();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(
      `${API_BASE_URL}/api/v1/candidates/${candidateId}/resume/download`,
      { headers, credentials: "include" },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new HttpError(404, "Currículo não encontrado para este candidato");
      }
      if (response.status === 403) {
        throw new HttpError(403, "Sem permissão para acessar o currículo");
      }
      throw new HttpError(response.status, "Não foi possível baixar o currículo");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    anchor.download = match?.[1] ?? "curriculo.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },
};
