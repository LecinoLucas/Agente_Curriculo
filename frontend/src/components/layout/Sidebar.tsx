import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, X, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { TopNavGroup, TopNavDropdown } from "./TopNavDropdown";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";

type SidebarProps = {
  groups: TopNavGroup[];
  mobileMenuOpen: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

export function Sidebar({
  groups,
  mobileMenuOpen,
  theme,
  onToggleMobileMenu,
  onLogout,
  onToggleTheme,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: SidebarProps) {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isHovered, setIsHovered] = useState(false);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  useEffect(() => {
    if (!isHovered && !mobileMenuOpen) {
      setExpandedGroups({});
    }
  }, [isHovered, mobileMenuOpen]);

  return (
    <>
      {/* ── Mobile Drawer Backdrop ── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggleMobileMenu}
      />

      {/* ── Sidebar Container ── */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "group/sidebar z-50 flex bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] transition-all duration-300 ease-in-out",
          "fixed inset-y-0 left-0 flex-col border-r border-[hsl(var(--nav-border))]/50 shadow-xl",
          mobileMenuOpen ? "translate-x-0 w-56" : "-translate-x-full",
          "lg:static lg:translate-x-0 lg:flex-row lg:h-14 lg:w-full lg:border-b lg:border-r-0 lg:shadow-none lg:items-center"
        )}
      >
        {/* Header / Logo */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--nav-border))]/50 px-4 lg:border-b-0 lg:w-auto lg:pr-8">
          <button
            type="button"
            onClick={() => {
              navigate("/pipeline");
              onPipelineClick();
              if (mobileMenuOpen) onToggleMobileMenu();
            }}
            className="flex items-center gap-3 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] rounded-lg transition-transform hover:scale-[1.02]"
            title="Ir para Pipeline"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[hsl(var(--nav-active-bg))] text-[10px] font-extrabold text-white">
              RA
            </div>
            <div className="flex flex-col min-w-0 transition-opacity duration-300 opacity-100">
              <span className="truncate font-heading text-[13px] font-extrabold leading-tight tracking-tight text-[hsl(var(--nav-text))]">
                Marajo RH
              </span>
              <span className="truncate text-[10px] leading-tight text-[hsl(var(--nav-muted))]">
                ATS & Recrutamento IA
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-1 rounded-lg hover:bg-white/10 text-[hsl(var(--nav-muted))] hover:text-[hsl(var(--nav-text))] transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Navegação principal" className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20",
          "lg:flex lg:flex-row lg:items-center lg:overflow-visible lg:p-0 lg:space-y-0 lg:space-x-1 lg:ml-2"
        )}>
          {groups.map((group) => {
            if (!group.isDropdown) {
              const item = group.items[0];
              const active = isItemActive(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => {
                    if (mobileMenuOpen) onToggleMobileMenu();
                    if (item.to === "/pipeline") onPipelineClick();
                  }}
                  className={cn(
                    "group flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                    active
                      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                    "lg:h-9 lg:px-2.5 lg:py-0 lg:text-[13px]"
                  )}
                  title={item.label}
                >
                  <div className="flex shrink-0 items-center justify-center">
                    {renderIcon(item.to)}
                  </div>
                  <span className={cn(
                    "ml-3 truncate transition-opacity duration-300",
                    "lg:ml-2 opacity-100"
                  )}>
                    {item.label}
                  </span>
                </NavLink>
              );
            }

            const isGroupActive = group.items.some((item) => isItemActive(item.to));
            const isOpen = expandedGroups[group.label];

            return (
              <div key={group.label} className="relative flex flex-col lg:flex-row lg:items-center">
                {/* Mobile Accordion */}
                <div className="lg:hidden flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                      isGroupActive && !isOpen
                        ? "text-[hsl(var(--nav-active-text))] bg-white/5"
                        : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                    )}
                    title={group.label}
                  >
                    <div className="flex items-center min-w-0">
                      <div className="flex shrink-0 items-center justify-center">
                        {renderIcon(group.label)}
                      </div>
                      <span className="ml-3 truncate transition-opacity duration-300 opacity-100">
                        {group.label}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-300 opacity-60",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "flex flex-col gap-1 overflow-hidden transition-all duration-300",
                      isOpen ? "max-h-[400px] mt-1" : "max-h-0"
                    )}
                  >
                    {group.items.map((item) => {
                      const active = isItemActive(item.to);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => {
                            if (mobileMenuOpen) onToggleMobileMenu();
                            if (item.to === "/pipeline") onPipelineClick();
                          }}
                          className={cn(
                            "flex items-center rounded-lg py-2 pl-10 pr-3 text-[13px] font-medium transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))]",
                            active
                              ? "bg-[hsl(var(--nav-active-bg))]/50 text-[hsl(var(--nav-active-text))] font-semibold"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                          )}
                          title={item.label}
                        >
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>

                {/* Desktop Dropdown */}
                <div className="hidden lg:block">
                  <TopNavDropdown
                    group={group as any}
                    isOpen={isOpen || false}
                    isActive={isGroupActive}
                    onToggle={() => toggleGroup(group.label)}
                    onClose={() => setExpandedGroups({})}
                    isItemActive={isItemActive}
                    renderIcon={renderIcon}
                    onPipelineClick={onPipelineClick}
                  />
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-[hsl(var(--nav-border))]/40 p-2 flex flex-col gap-1 lg:border-t-0 lg:flex-row lg:items-center lg:p-0 lg:pr-4 lg:ml-auto">
          <div className={cn(
            "flex items-center justify-between px-1 pb-1",
            "lg:px-0 lg:pb-0 lg:flex"
          )}>
            <div className="lg:hidden"><VisualThemeSwitcher /></div>
            <div className="flex items-center gap-1 lg:gap-2 lg:ml-4">
              <div className="hidden lg:block"><NotificationsBell /></div>
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] transition hover:bg-white/10 hover:text-[hsl(var(--nav-text))]"
                title={theme === "light" ? "Modo escuro" : "Modo claro"}
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mobileMenuOpen) onToggleMobileMenu();
                  navigate("/perfil");
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] transition hover:bg-white/10 hover:text-[hsl(var(--nav-text))]"
                title="Meu perfil"
              >
                <UserRound className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="group/logout flex items-center rounded-lg px-3 py-2 text-[hsl(var(--nav-muted))] transition hover:bg-red-900/30 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))] lg:h-9 lg:px-2.5 lg:ml-2"
            title="Sair"
          >
            <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" />
            <span className="ml-3 truncate text-[13px] font-medium lg:hidden">
              Sair
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
