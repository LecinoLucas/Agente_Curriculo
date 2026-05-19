import { httpRequest } from "./http";

export type LimitScope = "user" | "job" | "global";
export type LimitSource = "override" | "default";

export type AILimitOverride = {
  id: string;
  scope: LimitScope;
  scope_id: string | null;
  limit_type: string;
  old_limit: number;
  new_limit: number;
  reason: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type AILimitUsageEntry = {
  scope: LimitScope;
  scope_id: string | null;
  label: string | null;
  used_today: number;
  effective_limit: number;
  limit_source: LimitSource;
  override_id: string | null;
};

export type AILimitsUsage = {
  today: string;
  defaults: {
    per_user: number;
    per_job: number;
    global: number;
    override_max_days: number;
  };
  active_overrides: AILimitOverride[];
  by_user: AILimitUsageEntry[];
  by_job: AILimitUsageEntry[];
  global_usage: AILimitUsageEntry;
};

export type CreateOverrideInput = {
  scope: LimitScope;
  scope_id: string | null;
  new_limit: number;
  expires_at: string;
  reason: string;
};

export const aiLimitsService = {
  getUsage: () => httpRequest<AILimitsUsage>("/api/v1/admin/ai-limits/usage"),
  listOverrides: () =>
    httpRequest<AILimitOverride[]>("/api/v1/admin/ai-limits/overrides"),
  createOverride: (body: CreateOverrideInput) =>
    httpRequest<AILimitOverride>("/api/v1/admin/ai-limits/overrides", {
      method: "POST",
      body,
    }),
  revokeOverride: (id: string) =>
    httpRequest<AILimitOverride>(`/api/v1/admin/ai-limits/overrides/${id}`, {
      method: "DELETE",
    }),
};
