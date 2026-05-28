import { ReactNode } from "react";
import { ChevronDown, LogOut, Menu, Moon, Search, Sun, UserRound, HelpCircle } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";
import { TopNavDropdown, type TopNavGroup } from "./TopNavDropdown";

type TopNavbarProps = {
  groups: TopNavGroup[];
  openDropdownLabel: string | null;
  mobileMenuOpen: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onCloseDropdown: () => void;
  onToggleDropdown: (groupLabel: string) => void;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

export function TopNavbar({
  groups,
  openDropdownLabel,
  mobileMenuOpen,
  theme,
  onToggleMobileMenu,
  onCloseDropdown,
  onToggleDropdown,
  onNavigate,
  onLogout,
  onToggleTheme,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: TopNavbarProps) {
  return (
    <header
      className="sticky top-0 z-40 flex h-14 w-full items-center gap-2 border-b border-[hsl(var(--nav-border))] bg-[hsl(var(--nav-bg))] px-3 shadow-sm backdrop-blur-md sm:px-4"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          aria-label={mobileMenuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileMenuOpen}
          onClick={onToggleMobileMenu}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[hsl(var(--nav-text))] outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))] xl:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate("/dashboard")}
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-left outline-none transition-colors hover:border-white/10 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]"
          aria-label="Ir para o dashboard"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[hsl(var(--nav-active-bg))] text-[10px] font-extrabold text-white">
            RA
          </span>
          <span className="hidden min-w-0 sm:block lg:w-[5.4rem] min-[1360px]:w-[6.25rem]">
            <span className="block truncate font-heading text-[13px] font-extrabold leading-tight tracking-tight text-[hsl(var(--nav-text))]">
              Marajo RH
            </span>
            <span className="block truncate text-[10px] leading-tight text-[hsl(var(--nav-muted))]">
              ATS & Recrutamento IA
            </span>
          </span>
        </button>

        <nav
          aria-label="Navegação principal"
          className="hidden min-w-0 flex-1 items-center justify-start gap-1 overflow-visible xl:flex"
        >
          {groups.map((group) => {
            if (!group.isDropdown) {
              const item = group.items[0];
              const active = isItemActive(item.to);
              const isDashboard = item.to === "/dashboard";

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={isDashboard ? "Dashboard" : undefined}
                  aria-current={active ? "page" : undefined}
                  title={isDashboard ? "Dashboard" : undefined}
                  onClick={() => {
                    onCloseDropdown();
                    if (item.to === "/pipeline") {
                      onPipelineClick();
                    }
                  }}
                  className={cn(
                    "group inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-[13px] font-semibold outline-none transition-colors",
                    isDashboard ? "w-9 px-0" : "gap-1.5 px-2.5",
                    "focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                    active
                      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                  )}
                >
                  {renderIcon(item.to)}
                  {isDashboard ? null : <span className="whitespace-nowrap">{item.label}</span>}
                </NavLink>
              );
            }

            const isOpen = openDropdownLabel === group.label;
            const isActive = group.items.some((item) => isItemActive(item.to));

            return (
              <TopNavDropdown
                key={group.label}
                group={group}
                isOpen={isOpen}
                isActive={isActive}
                onToggle={() => onToggleDropdown(group.label)}
                onClose={onCloseDropdown}
                isItemActive={isItemActive}
                renderIcon={renderIcon}
                onPipelineClick={onPipelineClick}
              />
            );
          })}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden min-[1400px]:block">
          <VisualThemeSwitcher />
        </div>
        
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
          title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[hsl(var(--nav-muted))] outline-none transition-colors hover:bg-white/10 hover:text-[hsl(var(--nav-text))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))] sm:inline-flex"
        >
          {theme === "light" ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
        </button>
        <NotificationsBell />
        <button
          type="button"
          onClick={() => onNavigate("/perfil")}
          aria-label="Abrir perfil"
          title="Perfil"
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[hsl(var(--nav-muted))] outline-none transition-colors hover:bg-white/10 hover:text-[hsl(var(--nav-text))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))] sm:inline-flex"
        >
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </button>
        
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sair"
          title="Sair"
          className="hidden h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] outline-none transition-colors hover:bg-[hsl(var(--danger))] hover:text-white focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))] sm:inline-flex"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
