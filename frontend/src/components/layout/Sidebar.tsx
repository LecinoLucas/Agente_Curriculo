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
          "fixed inset-y-0 left-0 z-[60] flex flex-col bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] shadow-md transition-all duration-300 ease-in-out border-r border-[hsl(var(--nav-border))]",
          mobileMenuOpen
            ? "translate-x-0 w-56"
            : "-translate-x-full lg:translate-x-0",
          !mobileMenuOpen && (sidebarExpanded ? "lg:w-56" : "lg:w-16")
        )}
      >
        {/* Toggle flutuante — único controle de recolher/expandir, sempre visível no desktop */}
        <button
          type="button"
          onClick={onToggleSidebarExpanded}
          aria-label={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
          title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
          className="hidden lg:flex absolute top-14 -right-3 z-10 h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--nav-border))] bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] shadow-sm transition-all hover:scale-110 hover:border-[hsl(var(--primary)/0.4)] hover:text-[hsl(var(--primary))]"
        >
          {sidebarExpanded ? <PanelLeftClose className="h-3 w-3" /> : <PanelLeftOpen className="h-3 w-3" />}
        </button>

        <div className="flex flex-col flex-1 min-w-0">
          {/* Header / Logo + Dedicated Toggle Button */}
          <div
            className={cn(
              "flex h-13 shrink-0 items-center justify-between border-b border-[hsl(var(--nav-border))] px-3",
              !isExpanded && "lg:px-0 lg:justify-center"
            )}
          >
            <button
              type="button"
              onClick={() => {
                navigate("/pipeline");
                onPipelineClick();
                if (mobileMenuOpen) onToggleMobileMenu();
              }}
              className={cn(
                "flex items-center overflow-hidden text-left outline-none rounded-lg transition-transform hover:scale-[1.01]",
                !isExpanded ? "justify-center w-auto" : "flex-1 min-w-0"
              )}
              title="Ir para Pipeline"
            >
              <div className="flex h-8 px-2 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-[10.5px] font-extrabold text-white shadow-xs">
                RH IA
              </div>
              {isExpanded && (
                <div className="flex flex-col min-w-0 ml-2">
                  <span className="truncate text-[12.5px] font-extrabold tracking-tight text-slate-900 dark:text-white">
                    ATS Marajó
                  </span>
                  <span className="truncate text-[9.5px] font-medium text-slate-500 dark:text-text-muted">
                    ATS & Recrutamento IA
                  </span>
                </div>
              )}
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-1 rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-600 rounded-r-sm" />
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
                      <span className="truncate text-[12px] font-semibold ml-2">
                        {item.label}
                      </span>
                    )}
                  </>
                );

                const navItemClasses = cn(
                  "group relative flex items-center transition-all duration-150 outline-none w-full py-1 rounded-lg",
                  isExpanded ? "justify-start px-2" : "justify-center px-0",
                  active
                    ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] font-semibold shadow-xs"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 hover:text-slate-950 dark:hover:bg-slate-800/80 dark:hover:text-white"
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
                  ? "bg-slate-100 text-slate-900 font-semibold dark:bg-slate-800 dark:text-white"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 hover:text-slate-950 dark:hover:bg-slate-800/80 dark:hover:text-white"
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
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-600 rounded-r-sm" />
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
                        <span className="truncate text-[12px] font-semibold ml-2">
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
                          "relative flex items-center py-1 px-2.5 text-[11.5px] font-medium rounded-md transition-all duration-150 outline-none",
                          active
                            ? "bg-[hsl(var(--nav-active-bg))]/50 text-slate-900 font-bold shadow-2xs dark:text-white"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/80 hover:text-slate-900 dark:hover:bg-slate-800/80 dark:hover:text-white"
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
