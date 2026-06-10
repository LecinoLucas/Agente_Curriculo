import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ActionMenuItem = {
  label: string;
  onClick?: () => void;
  to?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  title?: string;
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
      <Button
        variant="secondary"
        size="icon"
        ref={buttonRef}
        className={cn("h-9 w-9", buttonClassName)}
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div 
            className="z-[9999] w-48 overflow-hidden rounded-xl border border-border bg-surface text-text shadow-lg"
            style={menuStyle}
          >
            {visibleItems.map((item) => {
              const baseClassName = cn(
                "flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50",
                item.tone === "danger" ? "text-danger" : "text-text"
              );

              if (item.to) {
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={baseClassName}
                  >
                    {item.label}
                  </Link>
                );
              }

              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                  className={baseClassName}
                  title={item.title}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      ) : null}
    </div>
  );
}

