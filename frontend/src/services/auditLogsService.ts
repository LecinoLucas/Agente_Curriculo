import { Paginated } from "../types/api";
import { httpRequest } from "./http";

export type AuditLogItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  metadata: Record<string, unknown>;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
  request_id: string | null;
  correlation_id: string | null;
};

export type ListAuditLogsParams = {
  page?: number;
  page_size?: number;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
};

function normalizeAuditLogItem(item: Partial<AuditLogItem>): AuditLogItem {
  return {
    id: item.id ?? "",
    action: item.action ?? "",
    entity_type: item.entity_type ?? "",
    entity_id: item.entity_id ?? null,
    user_id: item.user_id ?? null,
    user_name: item.user_name ?? null,
    user_email: item.user_email ?? null,
    metadata: item.metadata ?? {},
    before_state: item.before_state ?? null,
    after_state: item.after_state ?? null,
    created_at: item.created_at ?? "",
    request_id: item.request_id ?? null,
    correlation_id: item.correlation_id ?? null,
  };
}

export const auditLogsService = {
  listAuditLogs: async (params: ListAuditLogsParams = {}): Promise<Paginated<AuditLogItem>> => {
    const page = params.page ?? 1;
    const pageSize = params.page_size ?? 20;
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });

    if (params.action) query.set("action", params.action);
    if (params.entity_type) query.set("entity_type", params.entity_type);
    if (params.entity_id) query.set("entity_id", params.entity_id);
    if (params.user_id) query.set("user_id", params.user_id);
    if (params.search) query.set("search", params.search);
    if (params.date_from) query.set("date_from", params.date_from);
    if (params.date_to) query.set("date_to", params.date_to);

    return httpRequest<Paginated<AuditLogItem>>(`/api/v1/admin/audit-logs?${query.toString()}`).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data.map(normalizeAuditLogItem) : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
    }));
  },
};
