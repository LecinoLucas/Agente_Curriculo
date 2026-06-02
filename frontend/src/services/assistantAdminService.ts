import type { Paginated } from "../types/api";
import { httpRequest } from "./http";

export type AssistantSessionCandidate = {
  id: string | null;
  display_name: string;
  cpf_last4: string | null;
  identity_verified: boolean;
};

export type AssistantSessionApplication = {
  id: string;
  status: string;
  job_id: string | null;
};

export type AssistantSessionPipeline = {
  id: string;
  stage: string;
};

export type AssistantContextSummary = {
  identifier_type: string | null;
  identity_verified: boolean;
  location_hint: string | null;
  desired_function: string | null;
  desired_shift: string | null;
};

export type AssistantSessionListItem = {
  session_id: string;
  candidate: AssistantSessionCandidate;
  channel: string;
  current_state: string;
  status: string;
  last_message_at: string;
  created_at: string;
  application: AssistantSessionApplication | null;
  pipeline: AssistantSessionPipeline | null;
  context_summary: AssistantContextSummary;
};

export type AssistantSessionDetail = AssistantSessionListItem;

export type AssistantMessageItem = {
  id: string;
  role: "candidate" | "assistant" | "system";
  direction: "inbound" | "outbound" | "system";
  content: string;
  message_type: string;
  quick_replies: Array<{ value: string; label: string }>;
  state_at_message: string | null;
  created_at: string;
};

export type ListSessionsParams = {
  status?: string;
  current_state?: string;
  channel?: string;
  has_application?: boolean;
  has_pipeline?: boolean;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
};

// ── Assistant failures ──────────────────────────────────────────────────────

export type AssistantFailureStatus = "open" | "reviewed" | "resolved" | "ignored";

export type AssistantFailureClassification =
  | "location"
  | "unit"
  | "function"
  | "shift"
  | "identity"
  | "spam"
  | "talk_to_hr"
  | "other";

export type AssistantFailureApplicationInfo = {
  id: string;
  status: string;
};

export type AssistantFailureSessionInfo = {
  id: string;
  channel: string;
  current_state: string;
  status: string;
};

export type AssistantFailureListItem = {
  id: string;
  session_id: string;
  message_id: string | null;
  candidate_id: string | null;
  candidate_label: string;
  application: AssistantFailureApplicationInfo | null;
  state: string;
  sanitized_message: string;
  reason: string;
  status: AssistantFailureStatus;
  classification: AssistantFailureClassification | null;
  attempts_count: number | null;
  created_at: string;
  updated_at: string;
};

export type AssistantFailureDetail = AssistantFailureListItem & {
  session: AssistantFailureSessionInfo;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type ListFailuresParams = {
  status?: string;
  reason?: string;
  classification?: string;
  state?: string;
  from_date?: string;
  to_date?: string;
  session_id?: string;
  has_candidate?: boolean;
  has_application?: boolean;
  page?: number;
  page_size?: number;
};

// ── Assistant flow content (read-only) ──────────────────────────────────────

export type AssistantState = {
  state: string;
  label: string;
  description: string;
  is_sensitive: boolean;
  is_editable: boolean;
  order: number;
  allowed_quick_reply_values: string[];
  allowed_placeholders: string[];
};

export type AssistantStateContent = {
  state: string;
  prompt_text: string;
  helper_text: string | null;
  fallback_text: string | null;
  input_placeholder: string | null;
  is_editable: boolean;
  is_active: boolean;
  version: number;
  updated_at: string;
};

export type AssistantQuickReply = {
  id: string;
  state: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AssistantSettingValue =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null;

export type AssistantSetting = {
  key: string;
  value_json: AssistantSettingValue;
  is_sensitive: boolean;
  description: string | null;
  updated_at: string;
};

export type ListStateContentsParams = {
  state?: string;
  is_active?: boolean;
  is_editable?: boolean;
};

export type ListQuickRepliesParams = {
  state?: string;
  is_active?: boolean;
};

export type UpdateFailurePayload = {
  status?: AssistantFailureStatus;
  classification?: AssistantFailureClassification;
};

function appendParam(parts: string[], key: string, value: unknown): void {
  if (value == null || value === "") return;
  parts.push(`${key}=${encodeURIComponent(String(value))}`);
}

function buildQuery(params: ListSessionsParams): string {
  const parts: string[] = [];
  appendParam(parts, "status", params.status);
  appendParam(parts, "current_state", params.current_state);
  appendParam(parts, "channel", params.channel);
  if (params.has_application != null) parts.push(`has_application=${params.has_application}`);
  if (params.has_pipeline != null) parts.push(`has_pipeline=${params.has_pipeline}`);
  appendParam(parts, "from_date", params.from_date);
  appendParam(parts, "to_date", params.to_date);
  if (params.page) parts.push(`page=${params.page}`);
  if (params.page_size) parts.push(`page_size=${params.page_size}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function buildFailureQuery(params: ListFailuresParams): string {
  const parts: string[] = [];
  appendParam(parts, "status", params.status);
  appendParam(parts, "reason", params.reason);
  appendParam(parts, "classification", params.classification);
  appendParam(parts, "state", params.state);
  appendParam(parts, "session_id", params.session_id);
  if (params.has_candidate != null) parts.push(`has_candidate=${params.has_candidate}`);
  if (params.has_application != null) parts.push(`has_application=${params.has_application}`);
  appendParam(parts, "from_date", params.from_date);
  appendParam(parts, "to_date", params.to_date);
  if (params.page) parts.push(`page=${params.page}`);
  if (params.page_size) parts.push(`page_size=${params.page_size}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function buildStateContentsQuery(params: ListStateContentsParams): string {
  const parts: string[] = [];
  appendParam(parts, "state", params.state);
  if (params.is_active != null) parts.push(`is_active=${params.is_active}`);
  if (params.is_editable != null) parts.push(`is_editable=${params.is_editable}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function buildQuickRepliesQuery(params: ListQuickRepliesParams): string {
  const parts: string[] = [];
  appendParam(parts, "state", params.state);
  if (params.is_active != null) parts.push(`is_active=${params.is_active}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export const assistantAdminService = {
  listSessions(params: ListSessionsParams = {}): Promise<Paginated<AssistantSessionListItem>> {
    return httpRequest<Paginated<AssistantSessionListItem>>(
      `/api/v1/admin/assistant/sessions${buildQuery(params)}`
    );
  },

  getSession(sessionId: string): Promise<AssistantSessionDetail> {
    return httpRequest<AssistantSessionDetail>(
      `/api/v1/admin/assistant/sessions/${sessionId}`
    );
  },

  listMessages(sessionId: string): Promise<AssistantMessageItem[]> {
    return httpRequest<AssistantMessageItem[]>(
      `/api/v1/admin/assistant/sessions/${sessionId}/messages`
    );
  },

  listFailures(
    params: ListFailuresParams = {}
  ): Promise<Paginated<AssistantFailureListItem>> {
    return httpRequest<Paginated<AssistantFailureListItem>>(
      `/api/v1/admin/assistant/failures${buildFailureQuery(params)}`
    );
  },

  getFailure(failureId: string): Promise<AssistantFailureDetail> {
    return httpRequest<AssistantFailureDetail>(
      `/api/v1/admin/assistant/failures/${failureId}`
    );
  },

  updateFailure(
    failureId: string,
    payload: UpdateFailurePayload
  ): Promise<AssistantFailureDetail> {
    return httpRequest<AssistantFailureDetail>(
      `/api/v1/admin/assistant/failures/${failureId}`,
      { method: "PATCH", body: payload }
    );
  },

  // ── Flow content (read-only) ──────────────────────────────────────────────

  listAssistantStates(): Promise<AssistantState[]> {
    return httpRequest<AssistantState[]>("/api/v1/admin/assistant/states");
  },

  listStateContents(
    params: ListStateContentsParams = {}
  ): Promise<AssistantStateContent[]> {
    return httpRequest<AssistantStateContent[]>(
      `/api/v1/admin/assistant/state-contents${buildStateContentsQuery(params)}`
    );
  },

  getStateContent(state: string): Promise<AssistantStateContent> {
    return httpRequest<AssistantStateContent>(
      `/api/v1/admin/assistant/state-contents/${state}`
    );
  },

  listQuickReplies(
    params: ListQuickRepliesParams = {}
  ): Promise<AssistantQuickReply[]> {
    return httpRequest<AssistantQuickReply[]>(
      `/api/v1/admin/assistant/quick-replies${buildQuickRepliesQuery(params)}`
    );
  },

  listAssistantSettings(): Promise<AssistantSetting[]> {
    return httpRequest<AssistantSetting[]>("/api/v1/admin/assistant/settings");
  },
};
