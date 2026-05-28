import { httpRequest } from "./http";
import type { AdmittedCandidatesPage } from "../types/domain";

export type ListAdmittedCandidatesParams = {
  page?: number;
  page_size?: number;
  search?: string;
  status?: "all" | "admitted" | "dismissed";
};

export type DismissAdmissionPayload = {
  reason: string;
};

export type DismissAdmissionResponse = {
  admission_case_id: string;
  admission_status: string;
  admitted_at: string | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
};

export const admittedCandidatesService = {
  async list(params: ListAdmittedCandidatesParams = {}): Promise<AdmittedCandidatesPage> {
    const page = params.page ?? 1;
    const pageSize = params.page_size ?? 20;
    const searchParams = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    const search = params.search?.trim();
    if (search) {
      searchParams.set("search", search);
    }
    if (params.status && params.status !== "all") {
      searchParams.set("status", params.status);
    }

    return httpRequest<AdmittedCandidatesPage>(
      `/api/v1/admissions/admitted?${searchParams.toString()}`,
    ).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
      summary: {
        total_admitted: payload?.summary?.total_admitted ?? payload?.total ?? 0,
        admitted_this_month: payload?.summary?.admitted_this_month ?? 0,
        latest_admitted_at: payload?.summary?.latest_admitted_at ?? null,
      },
    }));
  },

  dismiss(admissionCaseId: string, payload: DismissAdmissionPayload) {
    return httpRequest<DismissAdmissionResponse>(`/api/v1/admissions/${admissionCaseId}/dismiss`, {
      method: "POST",
      body: payload,
    });
  },
};
