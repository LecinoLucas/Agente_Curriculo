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

export type UserStats = {
  total_users: number;
  active_users: number;
  inactive_users: number;
  suspended_users: number;
  pending_users: number;
  admins: number;
  recruiters: number;
  viewers: number;
  candidates: number;
};

export const usersService = {
  list: (page = 1, pageSize = 20, search?: string, role?: string, status?: string): Promise<Paginated<UserSummary>> => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (search) params.set("search", search);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
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

  stats: (): Promise<UserStats> =>
    httpRequest<UserStats>("/api/v1/users/stats"),

  uploadAvatar: (formData: FormData): Promise<UserSummary> =>
    fetch("/api/v1/users/me/avatar", {
      method: "POST",
      body: formData,
      credentials: "include",
    }).then(async (response) => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Falha ao enviar foto de perfil");
      }
      return response.json();
    }),

  deleteAvatar: (): Promise<UserSummary> =>
    fetch("/api/v1/users/me/avatar", {
      method: "DELETE",
      credentials: "include",
    }).then(async (response) => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Falha ao remover foto de perfil");
      }
      return response.json();
    }),
};
