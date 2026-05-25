import { useEffect, useState } from "react";

export type AppTheme = "light" | "dark";

const THEME_EVENT = "resume_ai_theme_changed";

function resolveInitialTheme(): AppTheme {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("resume_ai_theme") as AppTheme | null;
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  }
  return "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<AppTheme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    const handler = () => {
      const currentTheme = document.documentElement.dataset.theme as AppTheme;
      if (currentTheme) {
        setThemeState(currentTheme);
      }
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  function setTheme(next: AppTheme) {
    document.documentElement.dataset.theme = next;
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("resume_ai_theme", next);
    }
    setThemeState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light");
  }

  return { theme, setTheme, toggleTheme };
}
