import { Menu, Moon, Sun, UserRound, LogOut } from "lucide-react";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";

type TopNavbarProps = {
  mobileMenuOpen: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
};

export function TopNavbar({
  mobileMenuOpen,
  theme,
  onToggleMobileMenu,
  onLogout,
  onToggleTheme,
  onNavigate,
}: TopNavbarProps) {
  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex h-14 w-full items-center justify-between bg-transparent px-3 shadow-none sm:px-4 pointer-events-none">
      <div className="flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          aria-label={mobileMenuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileMenuOpen}
          onClick={onToggleMobileMenu}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] outline-none transition-colors hover:bg-[hsl(var(--surface-muted))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pointer-events-auto pr-2">
        <NotificationsBell />
      </div>
    </header>
  );
}
