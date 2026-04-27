const ACCESS_TOKEN_KEY = "resume_ai_access_token";
export const AUTH_SESSION_CLEARED_EVENT = "resume-ai:auth-session-cleared";

export const tokenStorage = {
  get: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  set: (token: string) => localStorage.setItem(ACCESS_TOKEN_KEY, token),
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
  },
};
