import { Resume, ResumeFileUploadResponse, ResumeSummary, ResumeUploadResponse } from "../types/domain";
import { httpRequest } from "./http";

export const resumeService = {
  list: () => httpRequest<ResumeSummary[]>("/api/v1/resumes"),

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
