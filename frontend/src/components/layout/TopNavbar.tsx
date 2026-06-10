import { Menu, BrainCircuit, Sparkles } from "lucide-react";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";

type TopNavbarProps = {
  mobileMenuOpen: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onOpenAssistant: () => void;
};

export function TopNavbar({
  mobileMenuOpen,
  onToggleMobileMenu,
  onOpenAssistant,
}: TopNavbarProps) {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center justify-between bg-[hsl(var(--surface))]/60 backdrop-blur-md border-b border-[hsl(var(--border))]/60 px-3 sm:px-4 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label={mobileMenuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={mobileMenuOpen}
          onClick={onToggleMobileMenu}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] outline-none transition-colors hover:bg-[hsl(var(--surface-muted))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        {/* Logo and Tagline on the left */}
        <div className="flex items-center gap-3 select-none">
          <div className="flex items-center gap-1.5">
            {/* Cyan sparkle star logo */}
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] dark:bg-[hsl(var(--primary))]/20">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-[15px] font-black tracking-tight text-[hsl(var(--text))]">
              Marajó <span className="text-[hsl(var(--primary))]">RH IA</span>
            </span>
          </div>
          <div className="hidden md:block h-4 w-[1px] bg-[hsl(var(--border))] mx-1" />
          <span className="hidden md:inline text-[10px] font-bold text-[hsl(var(--text-muted))] tracking-wide">
            Inteligência que conecta pessoas e resultados ✨
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pr-2">
        <div id="header-actions-portal" className="hidden lg:flex items-center gap-2 empty:hidden mr-1" />
        <button
          type="button"
          onClick={onOpenAssistant}
          aria-label="Abrir Assistente IA"
          data-testid="topnav-open-assistant"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] transition-colors hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--primary))]"
        >
          <BrainCircuit className="h-4 w-4" aria-hidden="true" />
        </button>
        <NotificationsBell />
      </div>
    </header>
  );
}
