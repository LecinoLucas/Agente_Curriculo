import { Menu, BrainCircuit, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";
import { useAuth } from "../../features/auth/useAuth";
import { Link } from "react-router-dom";
import { TopNavDropdown, type TopNavGroup } from "./TopNavDropdown";

type TopNavbarProps = {
  mobileMenuOpen: boolean;
  sidebarExpanded: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onOpenAssistant: () => void;
  groups: TopNavGroup[];
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

export function TopNavbar({
  mobileMenuOpen,
  sidebarExpanded,
  theme,
  onToggleMobileMenu,
  onToggleTheme,
  onOpenAssistant,
  groups,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: TopNavbarProps) {
  const { user } = useAuth();
  const userName = user?.full_name || "Usuário";
  const userRole = user?.role === "admin" ? "Admin" : "Gestor RH";
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null);
  const navigationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setOpenGroupLabel(null);
  }, [user?.role]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !navigationRef.current?.contains(target)) {
        setOpenGroupLabel(null);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center gap-4 rounded-b-2xl border-x-0 border-b border-t-0 border-[hsl(var(--border-strong))]/75 bg-[hsl(var(--nav-bg))]/95 px-4 shadow-[0_16px_28px_-22px_hsl(var(--text)/0.45)] backdrop-blur-xl sm:px-5">
      <div className="flex shrink-0 items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          aria-label={mobileMenuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileMenuOpen}
          onClick={onToggleMobileMenu}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-text transition-colors hover:bg-surface-muted lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Logo (Visible on mobile or when sidebar collapsed) */}
        <Link
          to="/pipeline"
          onClick={onPipelineClick}
          aria-label="Ir para o Pipeline"
          title="Ir para o Pipeline"
          className="flex min-h-10 items-center gap-2.5 rounded-xl px-1.5 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-[hsl(var(--petroleum))] focus-visible:ring-offset-2"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--brand))] text-sm font-black text-white shadow-sm">
            B
          </div>
          <span className="text-[13px] font-extrabold tracking-tight text-text">
            ATS Marajó
          </span>
        </Link>

      </div>

      <nav
        ref={navigationRef}
        aria-label="Navegação principal"
        className="hidden min-w-0 flex-1 items-center justify-center gap-1.5 overflow-visible px-2 lg:flex"
      >
        {groups.map((group) => {
          const groupActive = group.items.some((item) => isItemActive(item.to));

          if (!group.isDropdown) {
            const item = group.items[0];
            if (!item) return null;
            return (
              <Link
                key={`${group.label}-${item.to}`}
                to={item.to}
                onClick={() => {
                  setOpenGroupLabel(null);
                  if (item.to === "/pipeline") onPipelineClick();
                }}
                className={`relative inline-flex h-10 shrink-0 items-center rounded-xl px-3 text-[13px] font-bold transition-colors after:absolute after:inset-x-1.5 after:-bottom-2 after:h-0.5 after:rounded-full after:bg-[hsl(var(--brand))] after:transition-opacity ${
                  groupActive
                    ? "text-[hsl(var(--brand-dark))] dark:text-[hsl(var(--brand-glow))] after:opacity-100"
                    : "text-[hsl(var(--nav-muted))] after:opacity-0 hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]"
                }`}
              >
                {group.label}
              </Link>
            );
          }

          return (
            <TopNavDropdown
              key={group.label}
              group={group}
              isOpen={openGroupLabel === group.label}
              // A dropdown is highlighted only while it is open. After the
              // user chooses a subaba, the parent returns to its neutral state.
              isActive={openGroupLabel === group.label}
              onToggle={() => setOpenGroupLabel((current) => current === group.label ? null : group.label)}
              onClose={() => setOpenGroupLabel(null)}
              isItemActive={isItemActive}
              renderIcon={renderIcon}
              onPipelineClick={onPipelineClick}
            />
          );
        })}
      </nav>

      {/* Right Side Header Controls */}
      <div className="flex shrink-0 items-center gap-2.5">
        {/* Light/dark theme toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-surface text-[hsl(var(--petroleum))] transition-colors hover:bg-surface-muted hover:text-[hsl(var(--brand-dark))]"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>

        {/* AI Assistant Trigger */}
        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label="Abrir Assistente IA"
          data-testid="topnav-open-assistant"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-surface text-text transition-colors hover:bg-surface-muted hover:text-[hsl(var(--petroleum))]"
          title="Assistente IA"
        >
          <BrainCircuit className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Notifications Bell Component */}
        <NotificationsBell />

        <div className="h-3.5 w-px bg-border/70" />

        {/* User Profile Pill */}
        <Link
          to="/perfil"
          className="flex items-center gap-2 rounded-xl p-1 pr-2.5 transition-colors hover:bg-surface-muted shrink-0"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-[hsl(var(--brand))] to-[hsl(var(--petroleum))] text-xs font-bold text-white shadow-sm">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={userName} className="h-full w-full object-cover rounded-full" />
            ) : (
              <span className="text-xs font-bold leading-none">{userName.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}</span>
            )}
          </div>
          <div className="hidden sm:flex flex-col text-left min-w-0">
            <span className="text-[11.5px] font-bold leading-none text-text truncate max-w-28">{userName}</span>
            <span className="text-[9.5px] font-medium leading-tight text-text-muted mt-0.5">{userRole}</span>
          </div>
        </Link>
      </div>
    </header>
  );
}
