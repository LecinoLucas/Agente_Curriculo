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
  buttonLabel?: string;
};

export function ActionMenu({ items, className, buttonLabel = "Abrir menu" }: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  const visibleItems = useMemo(() => items.filter(Boolean), [items]);

  if (visibleItems.length === 0) return null;

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-11 z-30 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
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
                  "flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50",
                  item.tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-gray-700"
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
