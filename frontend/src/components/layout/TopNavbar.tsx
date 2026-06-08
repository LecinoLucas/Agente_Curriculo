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
    <header className="absolute top-0 left-0 right-0 z-50 flex h-16 w-full items-center justify-between bg-transparent px-3 shadow-none sm:px-4 pointer-events-none">
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

      <div className="pointer-events-none absolute inset-x-0 top-1.5 flex flex-col items-center justify-center select-none">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Cyan sparkle star logo */}
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-black tracking-tight text-slate-800 dark:text-slate-100">
            Marajó <span className="text-teal-600 dark:text-teal-400">RH IA</span>
          </span>
        </div>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wide mt-0.5">
          Inteligência que conecta pessoas e resultados ✨
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pointer-events-auto pr-2">
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
