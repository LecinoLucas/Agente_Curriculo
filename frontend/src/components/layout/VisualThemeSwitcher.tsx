import { useState } from "react";
import { Check, Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { VisualTheme, useVisualTheme } from "../../hooks/useVisualTheme";

const THEMES: Array<{
  value: VisualTheme;
  label: string;
  description: string;
}> = [
  {
    value: "theme-1",
    label: "Tema 1",
    description: "Marajó clássico",
  },
  {
    value: "theme-2",
    label: "Tema 2",
    description: "Marajó suave",
  },
  {
    value: "theme-3",
    label: "Tema 3",
    description: "Nova modernidade",
  },
  {
    value: "theme-4",
    label: "Tema 4",
    description: "Vermelho corporativo",
  },
];

export function VisualThemeSwitcher() {
  const { visualTheme, setVisualTheme } = useVisualTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="visual-theme-switcher">
      <button
        type="button"
        className="visual-theme-trigger"
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
            className="visual-theme-popover ui-card"
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
                      className={cn("visual-theme-option-indicator", isActive && "is-active")}
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
