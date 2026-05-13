import { httpRequest } from "./http";

export type HealthStatus = "ok" | "degraded" | "down" | "unknown";

export type ComponentStatus = {
  status: HealthStatus;
  latency_ms: number | null;
  message?: string | null;
};

export type HealthOverview = {
  status: "ok" | "degraded" | "down";
  environment: string;
  version: string;
  uptime_seconds: number;
  backend: ComponentStatus;
  database: ComponentStatus;
  redis: ComponentStatus;
  ai_provider: {
    configured_provider: string;
    status: HealthStatus;
    configured_key_count?: number | null;
    available_key_count?: number | null;
    cooldown_key_count?: number | null;
    cooldowns?: Array<{ key_label?: string; retry_after_seconds?: number }>;
  };
  last_analysis_at: string | null;
  pending_analyses: number;
  processing_analyses: number;
  failed_analyses_24h: number;
};

export type AIUsageAggregate = {
  provider?: string | null;
  model?: string | null;
  date?: string | null;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  avg_latency_ms: number | null;
};

export type TopExpensiveAnalysis = {
  analysis_id: string;
  provider: string;
  model: string;
  calls: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
};

export type AIUsageSummary = {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  avg_latency_ms: number | null;
  by_provider: AIUsageAggregate[];
  by_model: AIUsageAggregate[];
  daily_usage: AIUsageAggregate[];
  top_expensive_analyses: TopExpensiveAnalysis[];
};

export type QueueHealth = {
  redis: ComponentStatus;
  celery: {
    status: HealthStatus;
    message?: string | null;
    workers_online?: number | null;
  };
  pending_analyses: number;
  processing_analyses: number;
  stale_processing: number;
  failed_last_24h: number;
  retries_pending: number;
};

export type DatabaseHealth = {
  status: HealthStatus;
  latency_ms: number | null;
  total_candidates: number;
  total_jobs: number;
  total_analyses: number;
  analyses_by_status: Array<{ status: string; count: number }>;
  database_time: string | null;
  pool_info: Record<string, unknown>;
};

export type SystemErrors = {
  failed_analyses_24h: number;
  ai_errors_by_provider: Array<{ provider: string; failed_calls: number }>;
  recent_failures: Array<{
    source: string;
    analysis_id: string | null;
    provider: string | null;
    model: string | null;
    operation: string | null;
    error_message: string | null;
    provider_error_type: string | null;
    provider_status_code: number | null;
    created_at: string | null;
  }>;
  worker_status: {
    status: HealthStatus;
    message?: string | null;
    workers_online?: number | null;
  };
};

export type AIUsageParams = {
  date_from?: string;
  date_to?: string;
  provider?: string;
  model?: string;
};

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

export const systemHealthService = {
  getOverview: () => httpRequest<HealthOverview>("/api/v1/admin/health/overview"),
  getAIUsage: (params: AIUsageParams = {}) => {
    const query = buildQuery(params);
    return httpRequest<AIUsageSummary>(`/api/v1/admin/health/ai-usage${query ? `?${query}` : ""}`);
  },
  getQueues: () => httpRequest<QueueHealth>("/api/v1/admin/health/queues"),
  getDatabase: () => httpRequest<DatabaseHealth>("/api/v1/admin/health/database"),
  getErrors: () => httpRequest<SystemErrors>("/api/v1/admin/health/errors"),
};
