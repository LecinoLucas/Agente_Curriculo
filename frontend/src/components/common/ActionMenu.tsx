import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const visibleItems = useMemo(() => items.filter(Boolean), [items]);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: direction === "down" ? rect.bottom + 4 : "auto",
      bottom: direction === "up" ? window.innerHeight - rect.top + 4 : "auto",
      right: window.innerWidth - rect.right,
    });
  };

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [open, direction]);

  if (visibleItems.length === 0) return null;

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
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

      {open ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div 
            className="ui-card z-[9999] w-48 overflow-hidden rounded-xl shadow-lg border border-[hsl(var(--border))]"
            style={menuStyle}
          >
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
        </>,
        document.body
      ) : null}
    </div>
  );
}
