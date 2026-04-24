import { AuthUser } from "../types/auth";
import { AnalysisSummary, Job } from "../types/domain";
import { Paginated } from "../types/api";
import { authService } from "./authService";
import { analysisService } from "./analysisService";
import { httpRequest } from "./http";

export type DashboardSummary = {
  user: AuthUser;
  jobsCount: number;
  jobs: Job[];
  analysesCount: number;
  recentAnalyses: AnalysisSummary[];
  pendingAnalysesCount: number;
  completedAnalysesCount: number;
};

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const user = await authService.me();

  try {
    const jobsResponse = await httpRequest<Paginated<Job>>("/api/v1/jobs?page=1&page_size=5");
    const jobs = jobsResponse.data ?? [];
    const jobsCount = jobsResponse.total ?? jobs.length;

    const analysesResponse = await analysisService.list(1, 5);
    const recentAnalyses = analysesResponse.data;
    const pendingAnalysesCount = recentAnalyses.filter(
      (a) => a.status === "pending" || a.status === "processing",
    ).length;
    const completedAnalysesCount = recentAnalyses.filter((a) => a.status === "completed").length;

    return {
      user,
      jobs,
      jobsCount,
      analysesCount: analysesResponse.total,
      recentAnalyses,
      pendingAnalysesCount,
      completedAnalysesCount,
    };
  } catch {
    return {
      user,
      jobs: [],
      jobsCount: 0,
      analysesCount: 0,
      recentAnalyses: [],
      pendingAnalysesCount: 0,
      completedAnalysesCount: 0,
    };
  }
}
