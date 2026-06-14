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

export type AIUsageCenterSummary = {
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  rate_limited_calls: number;
  blocked_calls: number;
  unknown_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  avg_duration_ms: number | null;
};

export type AIUsageCenterModelSummary = {
  provider: string;
  model: string;
  calls: number;
  success_calls: number;
  failed_calls: number;
  rate_limited_calls: number;
  blocked_calls: number;
  unknown_calls: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
};

export type AIUsageCenterOperationSummary = {
  operation: string;
  calls: number;
  success_calls: number;
  failed_calls: number;
  rate_limited_calls: number;
  blocked_calls: number;
  unknown_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  avg_duration_ms: number | null;
  models: AIUsageCenterModelSummary[];
};

export type AIUsageCenterRecentEvent = {
  created_at: string | null;
  operation: string;
  provider: string;
  model: string;
  status: string;
  normalized_status: string;
  tokens: number;
  estimated_cost_usd: number | null;
  duration_ms: number | null;
  safe_error_message: string | null;
};

export type AIUsageCenterPricing = {
  source: string;
  updated_at: string | null;
  models: AIPricingItem[];
};

export type AIUsageCenterGaps = {
  unknown_operation_count: number;
  missing_token_count: number;
  missing_cost_count: number;
  unknown_status_count: number;
  warnings: string[];
};

export type AIUsageCenterResponse = {
  period: {
    from: string | null;
    to: string | null;
  };
  summary: AIUsageCenterSummary;
  by_operation: AIUsageCenterOperationSummary[];
  by_model: AIUsageCenterModelSummary[];
  recent_events: AIUsageCenterRecentEvent[];
  pricing: AIUsageCenterPricing;
  gaps: AIUsageCenterGaps;
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

export type AIPricingItem = {
  provider: string;
  model: string;
  input_per_1m_tokens: number | string | null;
  output_per_1m_tokens: number | string | null;
  currency: string;
  source: string | null;
  last_reviewed_at: string | null;
  status: "configured" | "not_configured";
};

export type AIPricingCatalog = {
  items: AIPricingItem[];
};

export type AICostBackfillResult = {
  total_null_rows: number;
  updated: number;
  skipped_unpriced: number;
};

export const systemHealthService = {
  getOverview: () => httpRequest<HealthOverview>("/api/v1/admin/health/overview"),
  getAIUsageCenter: (params: AIUsageParams = {}) => {
    const query = buildQuery(params);
    return httpRequest<AIUsageCenterResponse>(`/api/v1/admin/health/ai-usage-center${query ? `?${query}` : ""}`);
  },
  getQueues: () => httpRequest<QueueHealth>("/api/v1/admin/health/queues"),
  getDatabase: () => httpRequest<DatabaseHealth>("/api/v1/admin/health/database"),
  getErrors: () => httpRequest<SystemErrors>("/api/v1/admin/health/errors"),
  getAIPricingCatalog: () =>
    httpRequest<AIPricingCatalog>("/api/v1/admin/health/ai-usage/pricing"),
  backfillAICosts: () =>
    httpRequest<AICostBackfillResult>("/api/v1/admin/health/ai-usage/backfill-costs", {
      method: "POST",
    }),
};
