import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../useNotifications";
import { NotificationsPanel } from "./NotificationsPanel";

type NotificationsBellProps = {
  buttonClassName?: string;
};

export function NotificationsBell({ buttonClassName = "" }: NotificationsBellProps) {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative z-50">
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        type="button"
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300 outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] ${
          isOpen
            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]"
            : "border-border/80 bg-surface-muted/40 text-text-muted hover:bg-surface-muted/80 hover:text-text"
        } ${buttonClassName}`}
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />

        {/* Pulsing indicator badge */}
        {unreadCount > 0 && (
          <span className="absolute top-2.5 right-2.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
        )}
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-80 sm:w-96"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <NotificationsPanel onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
