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
          "focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
          isActive
            ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
            : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]",
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
          className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-[hsl(var(--nav-border))]/80 bg-[hsl(var(--nav-bg))]/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
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
                  "flex min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-all duration-200",
                  "focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                  active
                    ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
                    : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]",
                )}
              >
                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors", active ? "bg-[hsl(var(--nav-active-bg))]/60 text-[hsl(var(--nav-active-text))]" : "bg-[hsl(var(--nav-active-bg))]/20 text-[hsl(var(--nav-muted))] group-hover:text-[hsl(var(--nav-text))]")}>
                  {renderIcon(item.to)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13px] font-bold", active ? "text-[hsl(var(--nav-active-text))]" : "text-[hsl(var(--nav-text))]")}>
                    {item.label}
                  </span>
                  <span className={cn("block truncate text-[11px]", active ? "text-[hsl(var(--nav-active-text))]/80" : "text-[hsl(var(--nav-muted))]")}>
                    {item.caption}
                  </span>
                </div>
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
