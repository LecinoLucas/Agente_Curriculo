import { useNotifications } from "../useNotifications";
import { NotificationItem } from "./NotificationItem";
import { useState } from "react";
import { Check, Trash2, Inbox } from "lucide-react";

interface NotificationsPanelProps {
  onClose?: () => void;
}

type TabType = "all" | "operational" | "messages";

export function NotificationsPanel({ onClose }: NotificationsPanelProps) {
  const { notifications, markAllAsRead, clearAll } = useNotifications();
  const [activeTab, setActiveTab] = useState<TabType>("all");

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "operational") {
      return ["health", "queue", "ai", "calendar", "system"].includes(n.category);
    }
    if (activeTab === "messages") {
      return n.category === "candidate";
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/85 bg-surface-muted/40">
        <h3 className="text-xs font-bold tracking-tight text-text">
          Notificações
        </h3>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <>
              <button
                onClick={markAllAsRead}
                title="Marcar todas como lidas"
                type="button"
                className="p-1.5 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text transition"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={clearAll}
                title="Limpar todas"
                type="button"
                className="p-1.5 rounded-lg text-text-muted hover:bg-[hsl(var(--danger))]/10 hover:text-danger transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 py-1.5 border-b border-border/50 gap-1 bg-surface-muted/20">
        {(["all", "operational", "messages"] as const).map((tab) => {
          const label = {
            all: "Todas",
            operational: "Operacionais",
            messages: "Mensagens",
          }[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                activeTab === tab
                  ? "bg-[hsl(var(--primary))] text-white"
                  : "text-text-muted hover:bg-surface-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 max-h-[380px] overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notif) => (
            <NotificationItem
              key={notif.id}
              notification={notif}
              onItemClick={onClose}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-text-muted opacity-60">
              <Inbox className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-bold text-text">
                Tudo limpo por aqui!
              </p>
              <p className="text-[9px] text-text-muted max-w-[200px]">
                Nenhuma notificação nesta categoria no momento.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
