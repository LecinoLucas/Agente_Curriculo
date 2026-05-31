import { publicApiClient } from './publicApiClient';

interface LoginResponse {
  message: string;
  redirect_to: string;
  session_expires_at: string;
}

export const candidateAuthService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return publicApiClient.post<LoginResponse>('/auth/login', { email, password });
  },

  // Idempotent — backend always returns 204, even without an active session.
  async logout(): Promise<void> {
    await publicApiClient.post<void>('/auth/logout');
  },
};
