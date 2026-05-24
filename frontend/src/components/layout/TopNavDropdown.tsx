import { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

export type TopNavItem = {
  to: string;
  label: string;
  caption: string;
};

export type TopNavGroup = {
  label: string;
  caption: string;
  isDropdown: boolean;
  items: TopNavItem[];
};

type TopNavDropdownProps = {
  group: TopNavGroup;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onClose: () => void;
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

export function TopNavDropdown({
  group,
  isOpen,
  isActive,
  onToggle,
  onClose,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: TopNavDropdownProps) {
  const menuId = `top-nav-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-current={isActive ? "page" : undefined}
        title={group.label === "Adm" ? "Administração" : group.label}
        onClick={onToggle}
        className={cn(
          "group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[13px] font-semibold outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
          isActive
            ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
            : "text-[hsl(var(--text-muted))] hover:bg-white/5 hover:text-[hsl(var(--text))]",
        )}
      >
        {renderIcon(group.label)}
        <span className="whitespace-nowrap">{group.label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", isOpen && "rotate-180 opacity-100")}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] p-1.5 shadow-xl shadow-black/15"
        >
          {group.items.map((item) => {
            const active = isItemActive(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onClose();
                  if (item.to === "/pipeline") {
                    onPipelineClick();
                  }
                }}
                className={cn(
                  "flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
                  active
                    ? "bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/60",
                )}
              >
                <span className="mt-0.5">{renderIcon(item.to)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className="block truncate text-xs text-[hsl(var(--text-muted))]">{item.caption}</span>
                </span>
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
