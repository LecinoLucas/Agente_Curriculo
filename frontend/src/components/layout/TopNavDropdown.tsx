import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

export type TopNavItem = {
  to: string;
  label: string;
  caption: string;
  external?: boolean;
  iconKey?: string;
  children?: TopNavItem[];
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
  const [openNestedLabel, setOpenNestedLabel] = useState<string | null>(null);
  const [nestedDirection, setNestedDirection] = useState<"left" | "right">("right");
  const nestedButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isCompactGroup = group.label === "Administração";
  const menuId = `top-nav-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    if (!isOpen) setOpenNestedLabel(null);
  }, [isOpen]);

  const isItemOrChildActive = (item: TopNavItem) =>
    isItemActive(item.to) || Boolean(item.children?.some(isItemOrChildActive));

  const getItemContent = (item: TopNavItem, active: boolean) => (
    <>
      <div className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-[hsl(var(--nav-active-bg))]/60 text-[hsl(var(--nav-active-text))]"
          : "bg-[hsl(var(--nav-active-bg))]/20 text-[hsl(var(--nav-muted))] group-hover:text-[hsl(var(--nav-text))]",
      )}>
        {renderIcon(item.iconKey ?? item.to)}
      </div>
      <div className="min-w-0 flex-1">
        <span className={cn(
          "block truncate text-[13px] font-bold",
          active ? "text-[hsl(var(--nav-active-text))]" : "text-[hsl(var(--nav-text))]",
        )}>
          {item.label}
        </span>
        <span className={cn(
          "block truncate text-[11px]",
          active ? "text-[hsl(var(--nav-active-text))]/80" : "text-[hsl(var(--nav-muted))]",
        )}>
          {item.caption}
        </span>
      </div>
    </>
  );

  const itemClassName = (active: boolean) => cn(
    "flex min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-all duration-200",
    "focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
    active
      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
      : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]",
  );

  const toggleNested = (itemLabel: string) => {
    const button = nestedButtonRefs.current[itemLabel];
    const availableRight = button ? window.innerWidth - button.getBoundingClientRect().right : 0;
    const availableLeft = button?.getBoundingClientRect().left ?? 0;
    const submenuWidth = 288;
    const direction = availableRight >= submenuWidth || availableRight >= availableLeft ? "right" : "left";

    setNestedDirection(direction);
    setOpenNestedLabel((current) => current === itemLabel ? null : itemLabel);
  };

  const renderLink = (item: TopNavItem) => {
    const active = isItemOrChildActive(item);
    const content = getItemContent(item, active);

    if (item.external) {
      return (
        <a
          key={`${item.label}-${item.to}`}
          href={item.to}
          target="_blank"
          rel="noreferrer"
          aria-label={item.label}
          onClick={onClose}
          className={itemClassName(active)}
        >
          {content}
        </a>
      );
    }

    return (
      <NavLink
        key={`${item.label}-${item.to}`}
        to={item.to}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          onClose();
          if (item.to === "/pipeline") onPipelineClick();
        }}
        className={itemClassName(active)}
      >
        {content}
      </NavLink>
    );
  };

  const renderItem = (item: TopNavItem) => {
    if (!item.children?.length) return renderLink(item);

    const active = isItemOrChildActive(item);
    const isNestedOpen = openNestedLabel === item.label;

    return (
      <div key={`${item.label}-${item.to}`} className="relative">
        <button
          type="button"
          aria-label={item.label}
          aria-haspopup="menu"
          aria-expanded={isNestedOpen}
          ref={(element) => {
            nestedButtonRefs.current[item.label] = element;
          }}
          onClick={() => toggleNested(item.label)}
          className={cn(itemClassName(active), "group w-full")}
        >
          {getItemContent(item, active)}
          <ChevronRight className={cn("mt-2 h-4 w-4 shrink-0 text-[hsl(var(--nav-muted))] transition-transform", isNestedOpen && "rotate-90")} aria-hidden="true" />
        </button>

        {isNestedOpen && (
          <div
            className={cn(
              "absolute top-0 z-50 flex w-72 flex-col gap-1 rounded-2xl border border-[hsl(var(--nav-border))]/80 bg-[hsl(var(--nav-bg))]/95 p-2 shadow-2xl backdrop-blur-xl",
              nestedDirection === "right" ? "left-full ml-2" : "right-full mr-2",
            )}
            role="group"
            aria-label={`${item.label} subabas`}
          >
            {item.children.map(renderLink)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={group.label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-current={isActive ? "page" : undefined}
        title={group.label === "Adm" ? "Administração" : group.label}
        onClick={onToggle}
        className={cn(
          "group relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-transparent text-[13px] font-bold outline-none transition-colors after:absolute after:inset-x-1.5 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-[hsl(var(--brand))] after:transition-opacity",
          isCompactGroup ? "w-10 justify-center px-0" : "px-3",
          "focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
          isActive
            ? "text-[hsl(var(--brand-dark))] dark:text-[hsl(var(--brand-glow))] after:opacity-100"
            : "text-[hsl(var(--nav-muted))] after:opacity-0 hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]",
        )}
      >
        {renderIcon(group.label)}
        {!isCompactGroup && <span className="whitespace-nowrap">{group.label}</span>}
        {!isCompactGroup && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", isOpen && "rotate-180 opacity-100")}
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-[hsl(var(--nav-border))]/80 bg-[hsl(var(--nav-bg))]/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
        >
          {group.items.map(renderItem)}
        </div>
      ) : null}
    </div>
  );
}
