export const ACCESS_TOKEN_KEY = "resume_ai_access_token";
export const REFRESH_SESSION_PRESENT_KEY = "resume_ai_refresh_session_present";
export const AUTH_SESSION_CLEARED_EVENT = "resume-ai:auth-session-cleared";

export const tokenStorage = {
  get: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  hasRefreshSession: () => localStorage.getItem(REFRESH_SESSION_PRESENT_KEY) === "true",
  set: (token: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    localStorage.setItem(REFRESH_SESSION_PRESENT_KEY, "true");
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_SESSION_PRESENT_KEY);
    window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
  },
};
