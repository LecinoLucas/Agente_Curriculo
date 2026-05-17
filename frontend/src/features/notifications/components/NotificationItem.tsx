import { Activity, ClipboardList, Sparkles, Calendar, User, AlertTriangle } from "lucide-react";
import { Notification } from "../types";
import { useNotifications } from "../useNotifications";
import { useNavigate } from "react-router-dom";

interface NotificationItemProps {
  notification: Notification;
  onItemClick?: () => void;
}

export function NotificationItem({ notification, onItemClick }: NotificationItemProps) {
  const { markAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAsRead(notification.id);
    if (onItemClick) onItemClick();
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const handleClick = () => {
    markAsRead(notification.id);
    if (onItemClick) onItemClick();
  };

  const getCategoryStyles = () => {
    switch (notification.category) {
      case "health":
        return {
          icon: Activity,
          iconClass: "text-amber-500 bg-amber-500/10",
        };
      case "queue":
        return {
          icon: ClipboardList,
          iconClass: "text-rose-500 bg-rose-500/10",
        };
      case "ai":
        return {
          icon: Sparkles,
          iconClass: "text-purple-500 bg-purple-500/10",
        };
      case "calendar":
        return {
          icon: Calendar,
          iconClass: "text-indigo-500 bg-indigo-500/10",
        };
      case "candidate":
        return {
          icon: User,
          iconClass: "text-blue-500 bg-blue-500/10",
        };
      default:
        return {
          icon: AlertTriangle,
          iconClass: "text-gray-500 bg-gray-500/10",
        };
    }
  };

  const { icon: CategoryIcon, iconClass } = getCategoryStyles();

  function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return "Agora mesmo";
    if (diffMin < 60) return `Há ${diffMin} min`;
    if (diffHours < 24) return `Há ${diffHours} h`;
    return `Há ${diffDays} d`;
  }

  return (
    <div
      onClick={handleClick}
      className={`group relative flex gap-4 p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
        notification.read
          ? "bg-[hsl(var(--surface))] border-[hsl(var(--border))]/40 opacity-70 hover:opacity-100 hover:bg-[hsl(var(--surface-muted))]/40"
          : "bg-[hsl(var(--surface-muted))] border-[hsl(var(--border))] hover:bg-[hsl(var(--surface))]"
      }`}
    >
      {/* Category Icon */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass} transition-transform group-hover:scale-105 duration-300`}
      >
        <CategoryIcon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-xs font-bold leading-snug tracking-tight transition-colors ${
              notification.read ? "text-[hsl(var(--text-muted))]" : "text-[hsl(var(--text))]"
            }`}
          >
            {notification.title}
          </p>
          {/* Unread dot */}
          {!notification.read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--primary))] animate-pulse mt-1.5" />
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-[hsl(var(--text-muted))]">
          {notification.description}
        </p>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[9px] font-medium text-[hsl(var(--text-muted))]/70">
            {formatRelativeTime(notification.timestamp)}
          </span>

          {notification.actionUrl && notification.actionLabel && (
            <button
              onClick={handleAction}
              type="button"
              className="inline-flex items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))] hover:underline bg-transparent border-0 p-0 cursor-pointer"
            >
              {notification.actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
