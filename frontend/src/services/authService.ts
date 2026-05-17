import { AuthUser, LoginPayload, LoginResponse, UserPreferredTheme, UserPreferencesResponse } from "../types/auth";
import { httpRequest } from "./http";

export const authService = {
  login: (payload: LoginPayload) =>
    httpRequest<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: payload,
      withAuth: false,
    }),

  logout: () =>
    httpRequest<void>("/api/v1/auth/logout", {
      method: "POST",
    }),

  me: () => httpRequest<AuthUser>("/api/v1/users/me"),

  updateMe: (payload: { full_name?: string }) =>
    httpRequest<AuthUser>("/api/v1/users/me", {
      method: "PATCH",
      body: payload,
    }),

  updateMyPassword: (payload: { current_password: string; new_password: string }) =>
    httpRequest<AuthUser>("/api/v1/users/me/password", {
      method: "PATCH",
      body: payload,
    }),

  updateMyPreferences: (payload: { preferred_theme: UserPreferredTheme }) =>
    httpRequest<UserPreferencesResponse>("/api/v1/users/me/preferences", {
      method: "PATCH",
      body: payload,
    }),
};
