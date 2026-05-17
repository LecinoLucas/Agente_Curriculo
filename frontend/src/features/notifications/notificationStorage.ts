import { Notification } from "./types";

const STORAGE_KEY = "ats-notifications";
const READ_STATES_KEY = "ats-notifications-read-states";

export const notificationStorage = {
  load(): Notification[] | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored) as Notification[];
        }
      }
    } catch (e) {
      console.error("[notificationStorage] Failed to read from localStorage", e);
    }
    return null;
  },

  save(notifications: Notification[]): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
      }
    } catch (e) {
      console.error("[notificationStorage] Failed to write to localStorage", e);
    }
  },

  clear(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(READ_STATES_KEY);
        localStorage.removeItem("ats-notifications-dismissed-ids");
      }
    } catch (e) {
      console.error("[notificationStorage] Failed to clear localStorage", e);
    }
  },

  loadReadStates(): Record<string, boolean> {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem(READ_STATES_KEY);
        if (stored) {
          return JSON.parse(stored) as Record<string, boolean>;
        }
      }
    } catch (e) {
      console.error("[notificationStorage] Failed to read read states", e);
    }
    return {};
  },

  saveReadStates(states: Record<string, boolean>): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(READ_STATES_KEY, JSON.stringify(states));
      }
    } catch (e) {
      console.error("[notificationStorage] Failed to write read states", e);
    }
  },
};
