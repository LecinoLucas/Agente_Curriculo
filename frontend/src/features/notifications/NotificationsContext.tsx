import { createContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";

import { HttpError } from "../../services/http";
import { canAccessInternalNotifications } from "../../shared/auth/roles";
import { useAuth } from "../auth/useAuth";
import { tokenStorage } from "../../utils/storage";
import { Notification } from "./types";
import { notificationStorage } from "./notificationStorage";
import { notificationService } from "./notificationService";

export interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
}

export const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const DISMISSED_KEY = "ats-notifications-dismissed-ids";
function isPublicNotificationRoute(pathname: string, isAuthenticated: boolean): boolean {
  if (pathname === "/login" || pathname === "/candidato" || pathname === "/candidato/cadastro") {
    return true;
  }

  if (pathname === "/candidato" || pathname.startsWith("/candidatura")) {
    return true;
  }

  return pathname.startsWith("/candidato/portal") && !isAuthenticated;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [isPollingStoppedByUnauthorized, setIsPollingStoppedByUnauthorized] = useState(false);
  const [readStates, setReadStates] = useState<Record<string, boolean>>(() =>
    notificationStorage.loadReadStates()
  );

  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem(DISMISSED_KEY);
        return stored ? JSON.parse(stored) : [];
      }
    } catch {
      // Ignora erro silenciando
    }
    return [];
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const shouldFetchNotifications = useMemo(() => {
    if (isLoading || isPollingStoppedByUnauthorized) return false;
    if (!isAuthenticated || !user) return false;
    if (!tokenStorage.get()) return false;
    if (isPublicNotificationRoute(location.pathname, isAuthenticated)) return false;
    return canAccessInternalNotifications(user.role);
  }, [isAuthenticated, isLoading, isPollingStoppedByUnauthorized, location.pathname, user]);

  const fetchNotifications = useCallback(async () => {
    if (!shouldFetchNotifications) {
      setNotifications([]);
      return;
    }

    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    const currentReadStates = notificationStorage.loadReadStates();

    try {
      const backendNotifs = await notificationService.getNotifications();

      const merged = backendNotifs
        .filter((n) => !dismissedIds.includes(n.id))
        .map((n): Notification => ({
          ...n,
          read: currentReadStates[n.id] ?? false,
          timestamp: n.timestamp ?? new Date().toISOString(),
        }));

      setNotifications(merged);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        setIsPollingStoppedByUnauthorized(true);
        setNotifications([]);
        return;
      }

      console.error("[NotificationsContext] Failed to fetch notifications", error);
      setNotifications([]);
    }
  }, [dismissedIds, shouldFetchNotifications]);

  useEffect(() => {
    if (!shouldFetchNotifications) {
      setNotifications([]);
      return;
    }

    fetchNotifications();

    const intervalId = window.setInterval(fetchNotifications, 60 * 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchNotifications();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications, shouldFetchNotifications]);

  useEffect(() => {
    setIsPollingStoppedByUnauthorized(false);
  }, [user?.id, location.pathname]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setReadStates((prev) => {
      const next = { ...prev, [id]: true };
      notificationStorage.saveReadStates(next);
      return next;
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setReadStates((prev) => {
      const next = { ...prev };
      notifications.forEach((n) => {
        next[n.id] = true;
      });
      notificationStorage.saveReadStates(next);
      return next;
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    const allIds = notifications.map((n) => n.id);
    const nextDismissed = [...dismissedIds, ...allIds];
    setDismissedIds(nextDismissed);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(nextDismissed));
      }
    } catch (e) {
      console.error(e);
    }
    setNotifications([]);
  };

  const addNotification = (n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const newNotif: Notification = {
      ...n,
      id: `notif-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev]);
  };

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
        addNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
