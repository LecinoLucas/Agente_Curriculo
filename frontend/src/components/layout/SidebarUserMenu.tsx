import { useState } from "react";
import { Check, ChevronsUpDown, LogOut, Moon, Palette, Sun, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVisualTheme } from "../../hooks/useVisualTheme";
import { type VisualTheme } from "../../hooks/visualThemeStorage";

const THEMES: Array<{ value: VisualTheme; label: string; description: string }> = [
  { value: "theme-1", label: "Tema 1", description: "Vermelho com Cinza Escuro" },
  { value: "theme-2", label: "Cobre Executivo", description: "Premium, quente e corporativo" },
  { value: "theme-3", label: "Aurora Corporativa", description: "Moderno e Tecnológico" },
  { value: "theme-4", label: "Tema 4", description: "Creme Vibrante" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type SidebarUserMenuProps = {
  userName: string;
  userEmail: string;
  isExpanded: boolean;
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigateProfile: () => void;
};

export function SidebarUserMenu({
  userName,
  userEmail,
  isExpanded,
  theme,
  onToggleTheme,
  onLogout,
  onNavigateProfile,
}: SidebarUserMenuProps) {
  const { visualTheme, setVisualTheme } = useVisualTheme();
  const [open, setOpen] = useState(false);
  const initials = getInitials(userName || "?");

  return (
    <div className="sidebar-user-menu">
      <button
        type="button"
        className={cn("sidebar-user-menu-trigger", !isExpanded && "justify-center")}
        aria-label="Menu do usuário"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="sidebar-user-menu-avatar">{initials}</span>
        {isExpanded && (
          <>
            <span className="sidebar-user-menu-copy">
              <span className="sidebar-user-menu-name">{userName}</span>
              <span className="sidebar-user-menu-email">{userEmail}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--nav-muted))]" />
          </>
        )}
      </button>

      {open ? (
        <>
          <div className="visual-theme-backdrop" onClick={() => setOpen(false)} />
          <div
            className="sidebar-user-menu-popover"
            role="dialog"
            aria-modal="false"
            aria-label="Menu do usuário"
          >
            <button
              type="button"
              className="sidebar-user-menu-row"
              onClick={() => {
                setOpen(false);
                onNavigateProfile();
              }}
            >
              <UserRound className="h-4 w-4 shrink-0" />
              Meu perfil
            </button>

            <button
              type="button"
              className="sidebar-user-menu-row"
              onClick={() => {
                setOpen(false);
                onToggleTheme();
              }}
            >
              {theme === "light" ? <Moon className="h-4 w-4 shrink-0" /> : <Sun className="h-4 w-4 shrink-0" />}
              {theme === "light" ? "Modo escuro" : "Modo claro"}
            </button>

            <div className="sidebar-user-menu-divider" />

            <p className="sidebar-user-menu-section-title">
              <Palette className="h-3 w-3" />
              Tema visual
            </p>
            <div className="visual-theme-options">
              {THEMES.map((themeOption) => {
                const isActive = visualTheme === themeOption.value;
                return (
                  <button
                    key={themeOption.value}
                    type="button"
                    className={cn("visual-theme-option", isActive && "is-active")}
                    onClick={() => {
                      setOpen(false);
                      setVisualTheme(themeOption.value);
                    }}
                  >
                    <span
                      className={cn("visual-theme-preview", `visual-theme-preview-${themeOption.value}`)}
                      aria-hidden="true"
                    />
                    <span className="visual-theme-option-copy">
                      <span className="visual-theme-option-label">{themeOption.label}</span>
                      <span className="visual-theme-option-description">{themeOption.description}</span>
                    </span>
                    <span className="visual-theme-option-indicator" aria-hidden="true">
                      {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-user-menu-divider" />

            <button
              type="button"
              className="sidebar-user-menu-row is-danger"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sair
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
