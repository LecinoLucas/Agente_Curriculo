import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { authService } from "../services/authService";
import { UserPreferredTheme } from "../types/auth";
import { useAuth } from "../features/auth/useAuth";
import {
  clearLegacyVisualTheme,
  DEFAULT_PUBLIC_THEME,
  setDocumentVisualTheme,
  type VisualTheme,
} from "./visualThemeStorage";

const GUEST_THEME_KEY = "theme:guest";

type VisualThemeContextValue = {
  visualTheme: VisualTheme;
  setVisualTheme: (next: VisualTheme) => void;
};

const VisualThemeContext = createContext<VisualThemeContextValue | undefined>(undefined);

function isVisualTheme(value: string | null): value is VisualTheme {
  return value === "theme-1" || value === "theme-2" || value === "theme-3" || value === "theme-4";
}

function isUserPreferredTheme(value: string | null | undefined): value is UserPreferredTheme {
  return value === "theme_1" || value === "theme_2" || value === "theme_3" || value === "theme_4";
}

function apiThemeToVisualTheme(theme: string | null | undefined): VisualTheme {
  if (!isUserPreferredTheme(theme)) return DEFAULT_PUBLIC_THEME;
  return theme.replace("_", "-") as VisualTheme;
}

function visualThemeToApiTheme(theme: VisualTheme): UserPreferredTheme {
  return theme.replace("-", "_") as UserPreferredTheme;
}

function userThemeKey(userId: string): string {
  return `theme:user:${userId}`;
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Cache local é apenas otimização; o backend continua sendo a fonte oficial.
  }
}

function resolveUserTheme(theme: string | null | undefined): VisualTheme {
  return apiThemeToVisualTheme(theme);
}

export function VisualThemeProvider({ children }: PropsWithChildren) {
  const { user, updateUser } = useAuth();
  const [visualTheme, setVisualThemeState] = useState<VisualTheme>(DEFAULT_PUBLIC_THEME);

  useEffect(() => {
    clearLegacyVisualTheme();

    if (!user) {
      setDocumentVisualTheme(DEFAULT_PUBLIC_THEME);
      setVisualThemeState(DEFAULT_PUBLIC_THEME);
      safeLocalStorageSet(GUEST_THEME_KEY, DEFAULT_PUBLIC_THEME);
      return;
    }

    const next = resolveUserTheme(user.preferred_theme);
    setDocumentVisualTheme(next);
    setVisualThemeState(next);
    safeLocalStorageSet(userThemeKey(user.id), next);
  }, [user?.id, user?.preferred_theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!user || event.key !== userThemeKey(user.id) || !isVisualTheme(event.newValue)) return;
      setDocumentVisualTheme(event.newValue);
      setVisualThemeState(event.newValue);
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user?.id]);

  function setVisualTheme(next: VisualTheme) {
    setDocumentVisualTheme(next);
    setVisualThemeState(next);
    safeLocalStorageSet(user ? userThemeKey(user.id) : GUEST_THEME_KEY, next);

    if (!user) return;

    const previousTheme = resolveUserTheme(user.preferred_theme);
    void authService
      .updateMyPreferences({ preferred_theme: visualThemeToApiTheme(next) })
      .then((response) => {
        updateUser({ preferred_theme: response.preferred_theme });
      })
      .catch(() => {
        setDocumentVisualTheme(previousTheme);
        setVisualThemeState(previousTheme);
        safeLocalStorageSet(userThemeKey(user.id), previousTheme);
      });
  }

  const value = useMemo(
    () => ({
      visualTheme,
      setVisualTheme,
    }),
    [visualTheme, user?.id],
  );

  return <VisualThemeContext.Provider value={value}>{children}</VisualThemeContext.Provider>;
}

export function useVisualTheme() {
  const context = useContext(VisualThemeContext);
  if (!context) {
    throw new Error("useVisualTheme deve ser usado dentro de VisualThemeProvider");
  }
  return context;
}
