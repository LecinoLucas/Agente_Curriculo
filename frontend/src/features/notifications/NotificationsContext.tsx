import { createContext, useState, useEffect, ReactNode, useCallback } from "react";
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

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-1",
    title: "Banco de dados com latência elevada",
    description: "Conexões com o banco PostgreSQL registraram picos de 450ms. Recomenda-se checar queries lentas.",
    type: "warning",
    category: "health",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/admin",
    actionLabel: "Ver Diagnósticos",
  },
  {
    id: "notif-2",
    title: "Fila de processamento de IA engargalada",
    description: "Há 12 candidatos aguardando processamento da análise de currículo por IA na fila principal.",
    type: "error",
    category: "queue",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/admin",
    actionLabel: "Ver Health",
  },
  {
    id: "notif-3",
    title: "Limite de tokens Gemini atingido (85%)",
    description: "Consumo diário de tokens da API Gemini se aproxima do teto seguro. IA operando em modo econômico.",
    type: "warning",
    category: "ai",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/admin/bi",
    actionLabel: "Ver BI de IA",
  },
  {
    id: "notif-4",
    title: "Falha na sincronização do Google Calendar",
    description: "O token do integrador do Google Calendar expirou. Entrevistas agendadas podem não ser sincronizadas.",
    type: "error",
    category: "calendar",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/agenda",
    actionLabel: "Reconectar Agenda",
  },
  {
    id: "notif-5",
    title: "Mensagem pendente de candidato",
    description: "Lucas Lecino enviou uma mensagem solicitando feedback sobre a etapa técnica da vaga Frontend Engineer.",
    type: "info",
    category: "candidate",
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    actionUrl: "/pipeline",
    actionLabel: "Responder Candidato",
  },
];

const DISMISSED_KEY = "ats-notifications-dismissed-ids";

export function NotificationsProvider({ children }: { children: ReactNode }) {
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

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const isDev =
      import.meta.env?.DEV ||
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test";

    if (isDev) {
      const initialReadStates = notificationStorage.loadReadStates();
      return MOCK_NOTIFICATIONS.map((n) => ({
        ...n,
        read: initialReadStates[n.id] ?? n.read,
      }));
    }

    return [];
  });

  const fetchNotifications = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";
    const isDev =
      import.meta.env?.DEV ||
      process.env.NODE_ENV === "development";

    const currentReadStates = notificationStorage.loadReadStates();

    if (isTest) {
      const mockMerged = MOCK_NOTIFICATIONS.filter((n) => !dismissedIds.includes(n.id)).map(
        (n): Notification => ({
          ...n,
          read: currentReadStates[n.id] ?? n.read,
        })
      );
      setNotifications(mockMerged);
      return;
    }

    const backendNotifs = await notificationService.getNotifications();

    // Filtra dismissed e mescla dados
    const merged = backendNotifs
      .filter((n) => !dismissedIds.includes(n.id))
      .map((n): Notification => ({
        ...n,
        read: currentReadStates[n.id] ?? false,
        timestamp: n.timestamp ?? new Date().toISOString(),
      }));

    if (merged.length === 0 && isDev) {
      // Retorna mocks em desenvolvimento caso não haja notificações ativas do backend
      const mockMerged = MOCK_NOTIFICATIONS.filter((n) => !dismissedIds.includes(n.id)).map(
        (n): Notification => ({
          ...n,
          read: currentReadStates[n.id] ?? n.read,
        })
      );
      setNotifications(mockMerged);
      return;
    }

    setNotifications(merged);
  }, [dismissedIds]);

  useEffect(() => {
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
  }, [fetchNotifications]);

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
