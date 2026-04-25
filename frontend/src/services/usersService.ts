import { UserSummary } from "../types/domain";
import { Paginated } from "../types/api";
import { httpRequest } from "./http";

export type CreateUserPayload = {
  email: string;
  password: string;
  full_name: string;
  role: string;
};

export type PatchUserPayload = {
  full_name?: string;
  role?: string;
  status?: string;
};

export const usersService = {
  list: (page = 1, pageSize = 20, search?: string, role?: string): Promise<Paginated<UserSummary>> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (role) params.set("role", role);
    return httpRequest<Paginated<UserSummary>>(`/api/v1/users?${params.toString()}`).then((payload) => ({
      data: Array.isArray(payload?.data) ? payload.data : [],
      total: payload?.total ?? 0,
      page: payload?.page ?? page,
      page_size: payload?.page_size ?? pageSize,
      total_pages: payload?.total_pages ?? 1,
    }));
  },

  create: (payload: CreateUserPayload): Promise<UserSummary> =>
    httpRequest<UserSummary>("/api/v1/users", { method: "POST", body: payload }),

  patch: (id: string, payload: PatchUserPayload): Promise<UserSummary> =>
    httpRequest<UserSummary>(`/api/v1/users/${id}`, { method: "PATCH", body: payload }),

  activate: (id: string): Promise<UserSummary> =>
    httpRequest<UserSummary>(`/api/v1/users/${id}/activate`, { method: "PATCH" }),

  deactivate: (id: string): Promise<UserSummary> =>
    httpRequest<UserSummary>(`/api/v1/users/${id}/deactivate`, { method: "PATCH" }),

  delete: (id: string): Promise<void> =>
    httpRequest<void>(`/api/v1/users/${id}`, { method: "DELETE" }),
};
