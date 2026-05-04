import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeToasts, toast, ToastItem } from "../../services/toast";

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONE_CLASSES: Record<ToastItem["type"], string> = {
  success: "ui-badge-success",
  error: "ui-badge-danger",
  warning: "ui-badge-warning",
  info: "ui-badge-info",
};

const ICON_CLASSES: Record<ToastItem["type"], string> = {
  success: "text-[hsl(var(--success))]",
  error:   "text-[hsl(var(--danger))]",
  warning: "text-[hsl(var(--warning))]",
  info:    "text-[hsl(var(--primary))]",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full"
      role="region"
      aria-label="Notificações"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-in slide-in-from-right-5",
              TONE_CLASSES[t.type]
            )}
          >
            <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", ICON_CLASSES[t.type])} />
            <span className="text-sm flex-1 leading-snug whitespace-pre-line">{t.message}</span>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              aria-label="Fechar notificação"
              className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
