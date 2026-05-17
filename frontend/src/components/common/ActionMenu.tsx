import { useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

type ActionMenuProps = {
  items: ActionMenuItem[];
  className?: string;
  buttonClassName?: string;
  buttonLabel?: string;
  direction?: "up" | "down";
};

export function ActionMenu({ items, className, buttonClassName, buttonLabel = "Abrir menu", direction = "down" }: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  const visibleItems = useMemo(() => items.filter(Boolean), [items]);

  if (visibleItems.length === 0) return null;

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        className={cn(
          "ui-btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
          buttonClassName,
        )}
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className={cn(
            "ui-card absolute right-0 z-30 w-48 overflow-hidden rounded-xl",
            direction === "up" ? "bottom-11" : "top-11"
          )}>
            {visibleItems.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  "flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors hover:bg-[hsl(var(--surface-muted))] disabled:cursor-not-allowed disabled:opacity-50",
                  item.tone === "danger" ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--text))]"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
