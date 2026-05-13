import { httpRequest } from "./http";

export type BIStatusTotal = {
  status: string;
  total: number;
};

export type BIPipelineStageTotal = {
  stage: string;
  total: number;
};

export type BIAnalysesDaily = {
  date: string;
  total: number;
};

export type BIAIUsageDaily = {
  date: string;
  tokens: number;
  calls: number;
};

export type BITopJob = {
  job_id: string;
  title: string;
  status: string;
  total_candidates: number;
};

export type BITopExpensiveAnalysis = {
  analysis_id: string;
  candidate_name: string;
  tokens: number;
  estimated_cost_usd: number | null;
};

export type BIRecentFailure = {
  analysis_id: string;
  candidate_name: string;
  job_title: string;
  status: string;
  failed_at: string | null;
  failure_reason: string | null;
};

export type BIAggregatedUsageSummary = {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  avg_latency_ms: number | null;
};

export type BIOverviewSummary = {
  total_candidates: number;
  active_candidates: number;
  archived_candidates: number;
  total_jobs: number;
  published_jobs: number;
  archived_jobs: number;
  completed_analyses: number;
  failed_analyses: number;
  average_score: number | null;
  hired_candidates: number;
  ai_total_tokens: number;
  ai_total_calls: number;
  ai_estimated_cost_usd: number | null;
};

export type BIOverviewResponse = {
  summary: BIOverviewSummary;
  jobs_by_status: BIStatusTotal[];
  candidates_by_status: BIStatusTotal[];
  analyses_by_status: BIStatusTotal[];
  pipeline_by_stage: BIPipelineStageTotal[];
  analyses_daily: BIAnalysesDaily[];
  ai_usage_daily: BIAIUsageDaily[];
  top_jobs_by_candidates: BITopJob[];
  top_expensive_analyses: BITopExpensiveAnalysis[];
  latest_analysis_failures: BIRecentFailure[];
  ai_usage: BIAggregatedUsageSummary;
  total_analyses: number;
};

export type BIOverviewParams = {
  date_from?: string;
  date_to?: string;
  job_id?: string;
  job_area?: string;
  provider?: string;
};

function buildQuery(params: BIOverviewParams) {
  const urlParams = new URLSearchParams();
  if (params.date_from) urlParams.set("date_from", params.date_from);
  if (params.date_to) urlParams.set("date_to", params.date_to);
  if (params.job_id) urlParams.set("job_id", params.job_id);
  if (params.job_area) urlParams.set("job_area", params.job_area);
  if (params.provider) urlParams.set("provider", params.provider);
  return urlParams.toString();
}

export const adminBiService = {
  async getBiOverview(params: BIOverviewParams = {}): Promise<BIOverviewResponse> {
    const query = buildQuery(params);
    return httpRequest<BIOverviewResponse>(`/api/v1/admin/bi/overview${query ? `?${query}` : ""}`);
  },
};
