import { useState } from "react";
import { Check, Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVisualTheme } from "../../hooks/useVisualTheme";
import { type VisualTheme } from "../../hooks/visualThemeStorage";

const THEMES: Array<{
  value: VisualTheme;
  label: string;
  description: string;
}> = [
  {
    value: "theme-1",
    label: "Tema 1",
    description: "Vermelho Marajó",
  },
  {
    value: "theme-2",
    label: "Tema 2",
    description: "Azul Industrial",
  },
];

export function VisualThemeSwitcher() {
  const { visualTheme, setVisualTheme } = useVisualTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="visual-theme-switcher">
      <button
        type="button"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface))]",
          open
            ? "border-white/20 bg-white/10 text-text"
            : "border-white/10 bg-white/5 text-text-muted hover:bg-white/10 hover:text-text"
        )}
        aria-label="Selecionar tema visual"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Selecionar tema visual"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Palette className="h-4 w-4" />
      </button>

      {open ? (
        <>
          <div
            className="visual-theme-backdrop"
            onClick={() => setOpen(false)}
          />

          <div
            className="visual-theme-popover z-50 rounded-2xl border border-border bg-surface p-4 text-text shadow-lg"
            role="dialog"
            aria-modal="false"
            aria-label="Escolher tema"
          >
            <div className="visual-theme-popover-header">
              <p className="visual-theme-popover-title">Escolher tema</p>
            </div>

            <div className="visual-theme-options">
              {THEMES.map((themeOption) => {
                const isActive = visualTheme === themeOption.value;

                return (
                  <button
                    key={themeOption.value}
                    type="button"
                    className={cn("visual-theme-option", isActive && "is-active")}
                    onClick={() => {
                      setVisualTheme(themeOption.value);
                      setOpen(false);
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

                    <span
                      className="visual-theme-option-indicator"
                      aria-hidden="true"
                    >
                      {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
