import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, X, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { TopNavGroup } from "./TopNavDropdown";
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

  // Fechar todos os grupos quando sair do menu
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

      {/* Placeholder space for the fixed sidebar so main content doesn't underlap */}
      <div className="hidden lg:block lg:w-[4.5rem] shrink-0" />

      {/* ── Sidebar Container ── */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 flex flex-col bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] shadow-xl transition-all duration-300 ease-in-out border-r border-[hsl(var(--nav-border))]/50",
          mobileMenuOpen ? "translate-x-0 w-56" : "-translate-x-full lg:translate-x-0 lg:w-[4.5rem]",
          isHovered && "lg:w-56"
        )}
      >
        {/* Header / Logo */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--nav-border))]/50 px-4">
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
            <div className={cn("flex flex-col min-w-0 transition-opacity duration-300", 
              "lg:opacity-0",
              (isHovered || mobileMenuOpen) && "lg:opacity-100",
              mobileMenuOpen ? "opacity-100" : ""
            )}>
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
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
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
                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                  )}
                  title={item.label}
                >
                  <div className="flex shrink-0 items-center justify-center">
                    {renderIcon(item.to)}
                  </div>
                  <span className={cn(
                    "ml-3 truncate transition-opacity duration-300",
                    "lg:opacity-0",
                    (isHovered || mobileMenuOpen) && "lg:opacity-100",
                    mobileMenuOpen ? "opacity-100" : ""
                  )}>
                    {item.label}
                  </span>
                </NavLink>
              );
            }

            const isGroupActive = group.items.some((item) => isItemActive(item.to));
            const isOpen = expandedGroups[group.label];

            return (
              <div key={group.label} className="flex flex-col">
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
                    <span className={cn(
                      "ml-3 truncate transition-opacity duration-300",
                      "lg:opacity-0",
                      (isHovered || mobileMenuOpen) && "lg:opacity-100",
                      mobileMenuOpen ? "opacity-100" : ""
                    )}>
                      {group.label}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-300 opacity-60",
                      isOpen && "rotate-180",
                      "lg:hidden",
                      (isHovered || mobileMenuOpen) && "lg:block",
                      mobileMenuOpen ? "block" : ""
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
                            : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                          "lg:hidden",
                          (isHovered || mobileMenuOpen) && "lg:flex",
                          mobileMenuOpen ? "flex" : ""
                        )}
                        title={item.label}
                      >
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer — logout always visible; utilities shown when expanded */}
        <div className="shrink-0 border-t border-[hsl(var(--nav-border))]/40 p-2 flex flex-col gap-1">
          {/* Expanded-only: theme switcher + profile */}
          <div className={cn(
            "flex items-center justify-between px-1 pb-1",
            "lg:hidden",
            (isHovered || mobileMenuOpen) && "lg:flex",
            mobileMenuOpen ? "flex" : ""
          )}>
            <VisualThemeSwitcher />
            <div className="flex items-center gap-1">
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

          {/* Always visible: logout (icon only when collapsed, icon+label when expanded) */}
          <button
            type="button"
            onClick={onLogout}
            className="group/logout flex items-center rounded-lg px-3 py-2 text-[hsl(var(--nav-muted))] transition hover:bg-red-900/30 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]"
            title="Sair"
          >
            <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" />
            <span className={cn(
              "ml-3 truncate text-[13px] font-medium transition-opacity duration-300",
              "lg:opacity-0",
              (isHovered || mobileMenuOpen) && "lg:opacity-100",
              mobileMenuOpen ? "opacity-100" : ""
            )}>
              Sair
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
