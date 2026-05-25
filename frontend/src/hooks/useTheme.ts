import { useEffect, useState } from "react";

export type AppTheme = "light" | "dark";

const THEME_EVENT = "resume_ai_theme_changed";

function resolveInitialTheme(): AppTheme {
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
      // Sincroniza estado se alterado em outro lugar
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
    setThemeState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  function toggleTheme() {
    setTheme(theme === "light" ? "dark" : "light");
  }

  return { theme, setTheme, toggleTheme };
}
