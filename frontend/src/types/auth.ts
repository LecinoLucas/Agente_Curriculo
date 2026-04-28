export type UserRole = "admin" | "recruiter" | "candidate" | "viewer";
export type UserStatus = "pending_verification" | "active" | "suspended" | "inactive";

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  real_ai_token_spend_enabled: boolean;
  last_login_at: string | null;
  created_at: string | null;
  avatar_url?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
};
