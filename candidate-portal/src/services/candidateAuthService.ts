import { publicApiClient } from './publicApiClient';

interface LoginResponse {
  message: string;
  redirect_to: string;
  session_expires_at: string;
}

interface DevLoginRequest {
  email: string;
  name?: string;
}

interface PasswordSetupResponse {
  message: string;
}

export interface GoogleAuthCandidate {
  id: string;
  full_name: string;
  email: string | null;
  picture_url: string | null;
}

export interface GoogleAuthResponse {
  status: string; // 'authenticated' | 'needs_completion'
  message: string;
  redirect_to: string;
  session_expires_at: string;
  candidate: GoogleAuthCandidate;
  missing_fields: string[];
}

export const candidateAuthService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return publicApiClient.post<LoginResponse>('/auth/login', { email, password });
  },

  async devLoginCandidate(payload: DevLoginRequest): Promise<LoginResponse> {
    return publicApiClient.post<LoginResponse>('/auth/dev-login', payload);
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

  // Google Identity Services — sends the id_token received from GSI to the backend.
  // The id_token is used only for this request and is never stored locally.
  async loginWithGoogle(idToken: string): Promise<GoogleAuthResponse> {
    return publicApiClient.post<GoogleAuthResponse>('/auth/google', { id_token: idToken });
  },
};
