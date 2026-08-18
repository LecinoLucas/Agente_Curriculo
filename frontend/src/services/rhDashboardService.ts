import { httpRequest } from "./http";

export type RhDashboardSummary = {
  new_candidates: number;
  interviews_today: number;
  pending_decisions: number;
  active_jobs: number;
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

export type RhDashboardPipelineFunnelStage = {
  id: string;
  label: string;
  count: number;
};

export type RhDashboardPipelineFunnelResponse = {
  total: number;
  stages: RhDashboardPipelineFunnelStage[];
};

export type RhDashboardTrendPoint = {
  date: string;
  candidates: number;
  interviews: number;
  hires: number;
};

export type RhDashboardTrendsResponse = {
  days: number;
  points: RhDashboardTrendPoint[];
};

export const rhDashboardService = {
  async getDashboard(): Promise<RhDashboardResponse> {
    return httpRequest<RhDashboardResponse>("/api/v1/rh/dashboard");
  },

  async getPipelineFunnel(): Promise<RhDashboardPipelineFunnelResponse> {
    return httpRequest<RhDashboardPipelineFunnelResponse>("/api/v1/rh/dashboard/pipeline-funnel");
  },

  async getTrends(days: 7 | 14 | 30 = 14): Promise<RhDashboardTrendsResponse> {
    return httpRequest<RhDashboardTrendsResponse>(`/api/v1/rh/dashboard/trends?days=${days}`);
  },
};
