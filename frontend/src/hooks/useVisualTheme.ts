import { useEffect, useState } from "react";

export type VisualTheme = "theme-1" | "theme-2";

const VISUAL_THEME_KEY = "visual-theme";
const VISUAL_THEME_EVENT = "resume_ai_visual_theme_changed";
const DEFAULT_VISUAL_THEME: VisualTheme = "theme-1";

function isVisualTheme(value: string | null): value is VisualTheme {
  return value === "theme-1" || value === "theme-2";
}

function resolveInitialVisualTheme(): VisualTheme {
  if (typeof window === "undefined") return DEFAULT_VISUAL_THEME;

  const saved = window.localStorage.getItem(VISUAL_THEME_KEY);
  return isVisualTheme(saved) ? saved : DEFAULT_VISUAL_THEME;
}

function applyVisualTheme(theme: VisualTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-visual-theme", theme);
}

export function initializeVisualTheme() {
  const theme = resolveInitialVisualTheme();
  applyVisualTheme(theme);
  return theme;
}

export function useVisualTheme() {
  const [visualTheme, setVisualThemeState] = useState<VisualTheme>(resolveInitialVisualTheme);

  useEffect(() => {
    applyVisualTheme(visualTheme);
    window.localStorage.setItem(VISUAL_THEME_KEY, visualTheme);
  }, [visualTheme]);

  useEffect(() => {
    const handler = () => {
      setVisualThemeState(resolveInitialVisualTheme());
    };

    window.addEventListener(VISUAL_THEME_EVENT, handler);
    return () => window.removeEventListener(VISUAL_THEME_EVENT, handler);
  }, []);

  function setVisualTheme(next: VisualTheme) {
    window.localStorage.setItem(VISUAL_THEME_KEY, next);
    applyVisualTheme(next);
    setVisualThemeState(next);
    window.dispatchEvent(new Event(VISUAL_THEME_EVENT));
  }

  return { visualTheme, setVisualTheme };
}
