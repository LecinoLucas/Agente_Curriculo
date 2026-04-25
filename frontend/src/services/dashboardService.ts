import { AuthUser } from "../types/auth";
import { AnalysisSummary, Job, JobCandidate } from "../types/domain";
import { Paginated } from "../types/api";
import { authService } from "./authService";
import { analysisService } from "./analysisService";
import { listJobCandidates } from "./jobsService";
import { httpRequest } from "./http";

export type DashboardJobRankingSummary = {
  job_id: string;
  job_title: string;
  job_status: string;
  total_candidates: number;
  top_candidate_name: string | null;
  top_match_score: number | null;
  avg_match_score: number | null;
  qualified_count: number;
};

export type DashboardSummary = {
  user: AuthUser;
  jobsCount: number;
  jobs: Job[];
  analysesCount: number;
  recentAnalyses: AnalysisSummary[];
  pendingAnalysesCount: number;
  completedAnalysesCount: number;
  jobRankings: DashboardJobRankingSummary[];
};

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const user = await authService.me();

  try {
    const jobsResponse = await httpRequest<Paginated<Job>>("/api/v1/jobs?page=1&page_size=8");
    const jobs = jobsResponse.data ?? [];
    const jobsCount = jobsResponse.total ?? jobs.length;

    const analysesResponse = await analysisService.list(1, 10);
    const recentAnalyses = analysesResponse.data ?? [];
    const pendingAnalysesCount = recentAnalyses.filter(
      (a) => a.status === "pending" || a.status === "processing",
    ).length;
    const completedAnalysesCount = recentAnalyses.filter((a) => a.status === "completed").length;

    const hotJobs = jobs
      .filter((job) => job.status === "published" || job.status === "paused")
      .slice(0, 4);

    const jobRankings = await Promise.all(
      hotJobs.map(async (job) => {
        const rankingResponse = await listJobCandidates(job.id, 1, 10);
        const candidates = rankingResponse.data ?? [];
        const scoredCandidates = candidates.filter((candidate) => candidate.match_score != null);
        const scoreValues = scoredCandidates.map((candidate) => Number(candidate.match_score));
        const avgMatchScore = scoreValues.length > 0
          ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(2))
          : null;
        const topCandidate = [...scoredCandidates].sort((a: JobCandidate, b: JobCandidate) => Number(b.match_score ?? 0) - Number(a.match_score ?? 0))[0] ?? null;

        return {
          job_id: job.id,
          job_title: job.title,
          job_status: job.status,
          total_candidates: rankingResponse.total ?? candidates.length,
          top_candidate_name: topCandidate?.candidate_name ?? null,
          top_match_score: topCandidate?.match_score ?? null,
          avg_match_score: avgMatchScore,
          qualified_count: scoredCandidates.filter((candidate) => Number(candidate.match_score ?? 0) >= 0.75).length,
        };
      }),
    );

    return {
      user,
      jobs,
      jobsCount,
      analysesCount: analysesResponse.total ?? recentAnalyses.length,
      recentAnalyses,
      pendingAnalysesCount,
      completedAnalysesCount,
      jobRankings,
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
      jobRankings: [],
    };
  }
}
