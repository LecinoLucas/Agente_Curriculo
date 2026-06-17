const STORAGE_KEY = 'candidate_portal_bot_session_id';

export const candidateBotSessionStorage = {
  get(): string | null {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(sessionId: string): void {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, sessionId);
    } catch {
      /* storage unavailable */
    }
  },
  clear(): void {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};
