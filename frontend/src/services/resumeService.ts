import { Resume, ResumeFileUploadResponse, ResumeSummary, ResumeUploadResponse } from "../types/domain";
import { httpRequest } from "./http";

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

export const resumeService = {
  list: () =>
    httpRequest<ResumeSummary[]>("/api/v1/resumes").then((payload) =>
      Array.isArray(payload) ? payload.map(normalizeResumeSummary) : [],
    ),

  get: (id: string) => httpRequest<Resume>(`/api/v1/resumes/${id}`),

  initiateUpload: () =>
    httpRequest<ResumeUploadResponse>("/api/v1/resumes", { method: "POST" }),

  uploadPdf: (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return httpRequest<ResumeFileUploadResponse>(`/api/v1/resumes/${id}/upload`, {
      method: "POST",
      body: formData,
    });
  },

  update: (id: string, payload: { title?: string; status?: "active" | "archived" }) =>
    httpRequest<Resume>(`/api/v1/resumes/${id}`, { method: "PATCH", body: payload }),

  archive: (id: string) =>
    httpRequest<Resume>(`/api/v1/resumes/${id}/archive`, { method: "PATCH" }),

  activate: (id: string) =>
    httpRequest<Resume>(`/api/v1/resumes/${id}/activate`, { method: "PATCH" }),

  delete: (id: string) =>
    httpRequest<void>(`/api/v1/resumes/${id}`, { method: "DELETE" }),
};
