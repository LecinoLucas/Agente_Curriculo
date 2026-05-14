import { Paginated } from "../types/api";
import { httpRequest } from "./http";
import {
  InterviewSchedule,
  AgendaKpis,
  AgendaListParams,
  InterviewScheduleCreatePayload,
  InterviewScheduleUpdatePayload,
  InterviewScheduleCancelPayload,
  InterviewScheduleCompletePayload,
  InterviewScheduleNoShowPayload,
  InterviewScheduleReschedulePayload,
} from "../types/agenda";

export const agendaService = {
  async listInterviews(
    params?: AgendaListParams
  ): Promise<Paginated<InterviewSchedule>> {
    const qs = new URLSearchParams();

    if (params) {
      if (params.date_from) qs.append("date_from", params.date_from);
      if (params.date_to) qs.append("date_to", params.date_to);
      if (params.status && params.status !== "all")
        qs.append("status", params.status);
      if (params.candidate_id) qs.append("candidate_id", params.candidate_id);
      if (params.job_id) qs.append("job_id", params.job_id);
      if (params.interviewer) qs.append("interviewer", params.interviewer);
      if (params.search) qs.append("search", params.search);
      if (params.page) qs.append("page", String(params.page));
      if (params.page_size) qs.append("page_size", String(params.page_size));
    }

    const query = qs.toString();
    const url = `/api/v1/agenda/interviews${query ? "?" + query : ""}`;

    return httpRequest<Paginated<InterviewSchedule>>(url);
  },

  async getAgendaKpis(
    params?: Partial<Pick<
      AgendaListParams,
      "date_from" | "date_to" | "status" | "search" | "job_id" | "interviewer"
    >>
  ): Promise<AgendaKpis> {
    const qs = new URLSearchParams();

    if (params) {
      if (params.date_from) qs.append("date_from", params.date_from);
      if (params.date_to) qs.append("date_to", params.date_to);
      if (params.status && params.status !== "all")
        qs.append("status", params.status);
      if (params.search) qs.append("search", params.search);
      if (params.job_id) qs.append("job_id", params.job_id);
      if (params.interviewer) qs.append("interviewer", params.interviewer);
    }

    const query = qs.toString();
    const url = `/api/v1/agenda/kpis${query ? "?" + query : ""}`;

    return httpRequest<AgendaKpis>(url);
  },

  async getInterview(scheduleId: string): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(`/api/v1/agenda/interviews/${scheduleId}`);
  },

  async createInterview(
    payload: InterviewScheduleCreatePayload
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>("/api/v1/agenda/interviews", {
      method: "POST",
      body: payload,
    });
  },

  async listCandidateJobInterviews(
    jobId: string,
    candidateId: string,
    params?: Pick<AgendaListParams, "page" | "page_size">
  ): Promise<Paginated<InterviewSchedule>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.append("page", String(params.page));
    if (params?.page_size) qs.append("page_size", String(params.page_size));
    const query = qs.toString();
    return httpRequest<Paginated<InterviewSchedule>>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/interviews${query ? "?" + query : ""}`
    );
  },

  async createCandidateJobInterview(
    jobId: string,
    candidateId: string,
    payload: Omit<InterviewScheduleCreatePayload, "candidate_id" | "job_id">
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/jobs/${jobId}/candidates/${candidateId}/interviews`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async updateInterview(
    scheduleId: string,
    payload: InterviewScheduleUpdatePayload
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/agenda/interviews/${scheduleId}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },

  async cancelInterview(
    scheduleId: string,
    payload: InterviewScheduleCancelPayload
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/agenda/interviews/${scheduleId}/cancel`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },

  async cancelInterviewOperational(
    scheduleId: string,
    payload: InterviewScheduleCancelPayload
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/interviews/${scheduleId}/cancel`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async rescheduleInterview(
    scheduleId: string,
    payload: InterviewScheduleReschedulePayload
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/interviews/${scheduleId}/reschedule`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },

  async completeInterview(
    scheduleId: string,
    payload: InterviewScheduleCompletePayload = {}
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/interviews/${scheduleId}/complete`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async markNoShow(
    scheduleId: string,
    payload: InterviewScheduleNoShowPayload = {}
  ): Promise<InterviewSchedule> {
    return httpRequest<InterviewSchedule>(
      `/api/v1/interviews/${scheduleId}/no-show`,
      {
        method: "POST",
        body: payload,
      }
    );
  },

  async getGoogleCalendarStatus(): Promise<{ connected: boolean; google_account_email?: string }> {
    return httpRequest<{ connected: boolean; google_account_email?: string }>("/api/v1/integrations/google-calendar/status");
  },

  async getGoogleCalendarAuthUrl(options?: {
    frontendOrigin?: string;
    returnPath?: string;
  }): Promise<{ auth_url: string }> {
    const qs = new URLSearchParams();

    if (options?.frontendOrigin) {
      qs.set("frontend_origin", options.frontendOrigin);
    }
    if (options?.returnPath) {
      qs.set("return_path", options.returnPath);
    }

    const path = `/api/v1/integrations/google-calendar/auth-url${
      qs.toString() ? `?${qs.toString()}` : ""
    }`;

    const response = await httpRequest<{ auth_url?: string; url?: string }>(
      path
    );

    return { auth_url: response.auth_url ?? response.url ?? "" };
  },
};
