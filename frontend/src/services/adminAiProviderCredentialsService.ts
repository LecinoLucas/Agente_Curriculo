import { httpRequest } from "./http";

export type AIProviderCredentialStatus = "active" | "disabled" | "rate_limited" | "invalid";

export type AIProviderCredential = {
  id: string;
  provider: string;
  model_id: string | null;
  label: string;
  masked_key: string;
  key_last4: string;
  status: AIProviderCredentialStatus;
  priority: number;
  cooldown_until: string | null;
  last_used_at: string | null;
  last_error_at: string | null;
  last_error_type: string | null;
  consecutive_rate_limit_count: number;
  created_at: string;
  updated_at: string;
};

export type AIProviderCredentialCreatePayload = {
  provider: string;
  model_id?: string | null;
  label: string;
  api_key: string;
};

export type AIProviderCredentialListParams = {
  provider?: string;
  model_id?: string;
  status?: AIProviderCredentialStatus;
  limit?: number;
  offset?: number;
};

function buildQuery(params: AIProviderCredentialListParams = {}) {
  const query = new URLSearchParams();
  if (params.provider) query.set("provider", params.provider);
  if (params.model_id) query.set("model_id", params.model_id);
  if (params.status) query.set("status", params.status);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  const value = query.toString();
  return value ? `?${value}` : "";
}

export const adminAiProviderCredentialsService = {
  list(params: AIProviderCredentialListParams = {}) {
    return httpRequest<AIProviderCredential[]>(
      `/api/v1/admin/ai-provider-credentials${buildQuery(params)}`,
    );
  },

  create(payload: AIProviderCredentialCreatePayload) {
    return httpRequest<AIProviderCredential>("/api/v1/admin/ai-provider-credentials", {
      method: "POST",
      body: {
        provider: payload.provider,
        model_id: payload.model_id || null,
        label: payload.label,
        api_key: payload.api_key,
      },
    });
  },

  rotate(id: string, apiKey: string) {
    return httpRequest<AIProviderCredential>(`/api/v1/admin/ai-provider-credentials/${id}/rotate`, {
      method: "PATCH",
      body: { api_key: apiKey },
    });
  },

  enable(id: string) {
    return httpRequest<AIProviderCredential>(`/api/v1/admin/ai-provider-credentials/${id}/enable`, {
      method: "PATCH",
    });
  },

  disable(id: string) {
    return httpRequest<AIProviderCredential>(`/api/v1/admin/ai-provider-credentials/${id}/disable`, {
      method: "PATCH",
    });
  },
};
