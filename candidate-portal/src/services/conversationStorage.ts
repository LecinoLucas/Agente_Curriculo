// Simple persistence for the Portal 2 conversation session id.
//
// Stored in localStorage so a page reload can resume the same conversation.
// Every access is wrapped in try/catch because storage can throw (private mode,
// disabled cookies) — a failure here must never break the chat, only disable
// resume-on-reload.
const STORAGE_KEY = 'candidate_portal2_session_id';

export const conversationStorage = {
  get(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(sessionId: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, sessionId);
    } catch {
      /* storage unavailable — resume-on-reload simply won't work */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },
};
