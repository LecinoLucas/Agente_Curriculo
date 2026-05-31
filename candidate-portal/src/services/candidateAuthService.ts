import { publicApiClient } from './publicApiClient';

interface LoginResponse {
  message: string;
  redirect_to: string;
  session_expires_at: string;
}

interface PasswordSetupResponse {
  message: string;
}

export const candidateAuthService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return publicApiClient.post<LoginResponse>('/auth/login', { email, password });
  },

  async requestPasswordSetup(email: string): Promise<PasswordSetupResponse> {
    return publicApiClient.post<PasswordSetupResponse>('/auth/request-password-setup', { email });
  },

  async confirmPasswordSetup(token: string, password: string): Promise<PasswordSetupResponse> {
    return publicApiClient.post<PasswordSetupResponse>('/auth/confirm-password-setup', {
      token,
      password,
    });
  },

  // Idempotent — backend always returns 204, even without an active session.
  async logout(): Promise<void> {
    await publicApiClient.post<void>('/auth/logout');
  },
};
