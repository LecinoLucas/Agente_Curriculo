import { httpRequest } from "./http";

export type RhDashboardSummary = {
  new_candidates: number;
  interviews_today: number;
  pending_decisions: number;
  pending_pre_admissions: number;
  admitted_this_month: number;
};

export type RhDashboardPendingAction = {
  type:
    | "awaiting_ai"
    | "schedule_interview"
    | "interview_today"
    | "register_decision"
    | "start_pre_admission"
    | "document_pending"
    | string;
  candidate_id: string;
  candidate_name: string;
  job_id: string | null;
  job_title: string | null;
  label: string;
  action_label: string;
  href: string;
};

export type RhDashboardResponse = {
  summary: RhDashboardSummary;
  pending_actions: RhDashboardPendingAction[];
};

export const rhDashboardService = {
  async getDashboard(): Promise<RhDashboardResponse> {
    return httpRequest<RhDashboardResponse>("/api/v1/rh/dashboard");
  },
};
