import { httpRequest } from "./http";
import { PaginatedResponse } from "../types/domain";

export type JobArea = {
  id: string;
  name: string;
  normalized_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type ListJobAreasParams = {
  search?: string;
  page?: number;
  page_size?: number;
  is_active?: boolean;
};

export type CreateJobAreaPayload = {
  name: string;
  description?: string;
};

export const jobAreasService = {
  async listJobAreas(params: ListJobAreasParams = {}): Promise<PaginatedResponse<JobArea>> {
    const urlParams = new URLSearchParams();
    if (params.search) urlParams.set("search", params.search);
    if (params.page) urlParams.set("page", params.page.toString());
    if (params.page_size) urlParams.set("page_size", params.page_size.toString());
    if (params.is_active !== undefined) urlParams.set("is_active", params.is_active.toString());
    
    return httpRequest<PaginatedResponse<JobArea>>(`/api/v1/job-areas?${urlParams.toString()}`);
  },

  async createJobArea(payload: CreateJobAreaPayload): Promise<JobArea> {
    return httpRequest<JobArea>("/api/v1/job-areas", {
      method: "POST",
      body: payload,
    });
  },

  async updateJobArea(id: string, payload: Partial<JobArea>): Promise<JobArea> {
    return httpRequest<JobArea>(`/api/v1/job-areas/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async deactivateJobArea(id: string): Promise<JobArea> {
    return httpRequest<JobArea>(`/api/v1/job-areas/${id}/deactivate`, {
      method: "PATCH",
    });
  },

  async activateJobArea(id: string): Promise<JobArea> {
    return httpRequest<JobArea>(`/api/v1/job-areas/${id}/activate`, {
      method: "PATCH",
    });
  },

  async deleteJobArea(id: string): Promise<void> {
    return httpRequest<void>(`/api/v1/job-areas/${id}`, {
      method: "DELETE",
    });
  },
};
