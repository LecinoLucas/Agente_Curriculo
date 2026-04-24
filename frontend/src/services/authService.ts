import { AuthUser, LoginPayload, LoginResponse } from "../types/auth";
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
};
