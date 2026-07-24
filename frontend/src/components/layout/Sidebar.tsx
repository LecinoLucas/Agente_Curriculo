import { ReactNode, useState } from "react";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { TopNavGroup } from "./TopNavDropdown";
import { SidebarUserMenu } from "./SidebarUserMenu";

type SidebarProps = {
  groups: TopNavGroup[];
  mobileMenuOpen: boolean;
  sidebarExpanded: boolean;
  theme: string;
  userName: string;
  userEmail: string;
  onToggleMobileMenu: () => void;
  onToggleSidebarExpanded: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

export function Sidebar({
  groups,
  mobileMenuOpen,
  sidebarExpanded,
  theme,
  userName,
  userEmail,
  onToggleMobileMenu,
  onToggleSidebarExpanded,
  onLogout,
  onToggleTheme,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: SidebarProps) {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const isExpanded = sidebarExpanded || mobileMenuOpen;

  return (
    <>
      {/* ── Mobile Drawer Backdrop ── */}
      <div
        className={cn(
          "fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggleMobileMenu}
      />

      {/* ── Sidebar Fixed Container ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[60] flex flex-col bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] transition-all duration-300 ease-in-out border-r border-[hsl(var(--nav-border))]",
          mobileMenuOpen
            ? "translate-x-0 w-56"
            : "-translate-x-full lg:translate-x-0",
          !mobileMenuOpen && (sidebarExpanded ? "lg:w-56" : "lg:w-16")
        )}
      >
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header / Logo + Toggle */}
          <div
            className={cn(
              "flex h-13 shrink-0 items-center justify-between border-b border-[hsl(var(--nav-border))] px-3",
              !isExpanded && "lg:justify-center lg:px-0"
            )}
          >
            {isExpanded && (
              <button
                type="button"
                onClick={() => {
                  navigate("/pipeline");
                  onPipelineClick();
                  if (mobileMenuOpen) onToggleMobileMenu();
                }}
                className="flex flex-1 min-w-0 items-center overflow-hidden text-left outline-none rounded-lg"
                title="Ir para Pipeline"
              >
                <div className="flex h-8 px-2 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-[11px] font-bold text-[hsl(var(--primary-foreground))]">
                  RH IA
                </div>
                <div className="flex flex-col min-w-0 ml-2">
                  <span className="truncate text-[13px] font-bold tracking-tight text-[hsl(var(--nav-text))]">
                    ATS Marajó
                  </span>
                  <span className="truncate text-[11px] font-medium text-[hsl(var(--nav-muted))]">
                    ATS & Recrutamento IA
                  </span>
                </div>
              </button>
            )}

            {/* Toggle — único controle de recolher/expandir */}
            <button
              type="button"
              onClick={onToggleSidebarExpanded}
              aria-label={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--nav-muted))] transition-colors hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--nav-text))]"
            >
              {sidebarExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-1 rounded-lg text-[hsl(var(--nav-muted))] transition-colors hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--nav-text))]"
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav
            aria-label="Navegação principal"
            className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1.5 space-y-0.5"
          >
            {groups.map((group) => {
              if (!group.isDropdown) {
                const item = group.items[0];
                const active = isItemActive(item.to);
                const content = (
                  <>
                    {active && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[hsl(var(--primary))] rounded-r-sm" />
                    )}
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center w-8 h-8 transition-transform duration-200",
                        active && "scale-105"
                      )}
                    >
                      {renderIcon(item.iconKey ?? item.to)}
                    </div>
                    {isExpanded && (
                      <span className="truncate text-[13px] font-semibold ml-2">
                        {item.label}
                      </span>
                    )}
                  </>
                );

                const navItemClasses = cn(
                  "group relative flex items-center transition-all duration-150 outline-none w-full py-1 rounded-lg",
                  isExpanded ? "justify-start px-2" : "justify-center px-0",
                  active
                    ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] font-semibold"
                    : "text-[hsl(var(--nav-text))] hover:bg-[hsl(var(--surface-muted))]"
                );

                return item.external ? (
                  <a
                    key={`${item.label}-${item.to}`}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (mobileMenuOpen) onToggleMobileMenu();
                    }}
                    className={navItemClasses}
                    title={item.label}
                  >
                    {content}
                  </a>
                ) : (
                  <NavLink
                    key={`${item.label}-${item.to}`}
                    to={item.to}
                    onClick={() => {
                      if (mobileMenuOpen) onToggleMobileMenu();
                      if (item.to === "/pipeline") onPipelineClick();
                    }}
                    className={navItemClasses}
                    title={item.label}
                  >
                    {content}
                  </NavLink>
                );
              }

              const isGroupActive = group.items.some((item) => isItemActive(item.to));
              const isOpen = expandedGroups[group.label] ?? isGroupActive;
              const activeSubItem = group.items.find((item) => isItemActive(item.to));
              const groupIconKey = activeSubItem ? (activeSubItem.iconKey ?? activeSubItem.to) : group.label;

              const groupButtonClasses = cn(
                "group relative flex items-center transition-all duration-150 outline-none w-full py-1 rounded-lg",
                isExpanded ? "justify-start px-2" : "justify-center px-0",
                isGroupActive && !isOpen
                  ? "bg-[hsl(var(--surface-muted))] text-[hsl(var(--nav-text))] font-semibold"
                  : "text-[hsl(var(--nav-text))] hover:bg-[hsl(var(--surface-muted))]"
              );

              return (
                <div key={group.label} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className={groupButtonClasses}
                    title={group.label}
                  >
                    {isGroupActive && !isOpen && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[hsl(var(--primary))] rounded-r-sm" />
                    )}
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center w-8 h-8 transition-transform duration-200",
                        isGroupActive && "scale-105"
                      )}
                    >
                      {renderIcon(groupIconKey)}
                    </div>
                    {isExpanded && (
                      <>
                        <span className="truncate text-[13px] font-semibold ml-2">
                          {group.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200 opacity-60 ml-auto",
                            isOpen && "rotate-180"
                          )}
                        />
                      </>
                    )}
                  </button>

                  {/* Sub-items list */}
                  {isOpen && (
                    <div className="flex flex-col gap-0.5 mt-0.5 pl-2">
                      {group.items.map((item) => {
                        const active = isItemActive(item.to);
                        const subClasses = cn(
                          "relative flex items-center py-1 px-2.5 text-[12px] font-medium rounded-md transition-all duration-150 outline-none",
                          active
                            ? "bg-[hsl(var(--nav-active-bg))]/50 text-[hsl(var(--nav-text))] font-bold"
                            : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--nav-text))]"
                        );

                        return item.external ? (
                          <a
                            key={`${item.label}-${item.to}`}
                            href={item.to}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => {
                              if (mobileMenuOpen) onToggleMobileMenu();
                            }}
                            className={subClasses}
                            title={item.label}
                          >
                            <span className="truncate">{item.label}</span>
                          </a>
                        ) : (
                          <NavLink
                            key={`${item.label}-${item.to}`}
                            to={item.to}
                            onClick={() => {
                              if (mobileMenuOpen) onToggleMobileMenu();
                              if (item.to === "/pipeline") onPipelineClick();
                            }}
                            className={subClasses}
                            title={item.label}
                          >
                            <span className="truncate">{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer — Menu de usuário (perfil, tema, logout) */}
          <div className="shrink-0 border-t border-[hsl(var(--nav-border))] p-2">
            <SidebarUserMenu
              userName={userName}
              userEmail={userEmail}
              isExpanded={isExpanded}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onLogout={onLogout}
              onNavigateProfile={() => {
                if (mobileMenuOpen) onToggleMobileMenu();
                navigate("/perfil");
              }}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
