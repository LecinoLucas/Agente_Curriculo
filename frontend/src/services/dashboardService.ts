import { httpRequest } from "./http";

export interface DashboardStats {
  total_candidates: number;
  candidates_waiting_job: number;
  open_jobs: number;
  candidates_in_pipeline: number;
  candidates_by_stage: Record<string, number>;
  recent_analyses: Array<{
    id: string;
    candidate_name: string;
    job_title: string;
    status: string;
    created_at: string;
  }>;
}

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    return await httpRequest<DashboardStats>("/api/v1/dashboard/stats");
  },
};
