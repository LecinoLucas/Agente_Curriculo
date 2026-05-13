import { httpRequest } from "../../../services/http";
import type { ApplyResponse, Job } from "../types";

const API_BASE = "/api/v1/public";

export const publicApplicationService = {
  /**
   * Busca vagas publicadas disponíveis para candidatura
   */
  async listPublishedJobs(): Promise<Job[]> {
    return httpRequest<Job[]>(`${API_BASE}/jobs`, {
      method: "GET",
      withAuth: false,
    });
  },

  /**
   * Envia candidatura pública
   * Multipart form data com campos + arquivo PDF
   */
  async submitApplication(formData: FormData): Promise<ApplyResponse> {
    return httpRequest<ApplyResponse>(`${API_BASE}/candidates/apply`, {
      method: "POST",
      withAuth: false,
      body: formData,
    });
  },
};
