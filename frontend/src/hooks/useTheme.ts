import { useEffect, useState } from "react";

export type AppTheme = "light" | "dark";

const THEME_KEY = "resume_ai_theme";
const THEME_EVENT = "resume_ai_theme_changed";

function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const handler = () => {
      const next = resolveInitialTheme();
      setThemeState(next);
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  function setTheme(next: AppTheme) {
    window.localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
    setThemeState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light");
  }

  return { theme, setTheme, toggleTheme };
}
