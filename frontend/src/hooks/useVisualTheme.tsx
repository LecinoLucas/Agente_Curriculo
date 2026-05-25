import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import {
  clearLegacyVisualTheme,
  DEFAULT_PUBLIC_THEME,
  setDocumentVisualTheme,
  type VisualTheme,
} from "./visualThemeStorage";

type VisualThemeContextValue = {
  visualTheme: VisualTheme;
  setVisualTheme: (next: VisualTheme) => void;
};

const VisualThemeContext = createContext<VisualThemeContextValue | undefined>(undefined);

export function VisualThemeProvider({ children }: PropsWithChildren) {
  const [visualTheme, setVisualThemeState] = useState<VisualTheme>(DEFAULT_PUBLIC_THEME);

  useEffect(() => {
    clearLegacyVisualTheme();
    // Limpar outras chaves antigas de tema
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.removeItem("resume_ai_theme");
        window.localStorage.removeItem("visual-theme");
        window.localStorage.removeItem("theme:guest");
        Object.keys(window.localStorage).forEach((key) => {
          if (key.startsWith("theme:user:")) {
            window.localStorage.removeItem(key);
          }
        });
      }
      if (typeof window !== "undefined" && typeof window.sessionStorage !== "undefined") {
        window.sessionStorage.removeItem("resume_ai_theme");
      }
    } catch (e) {
      console.error("Erro ao limpar chaves no VisualThemeProvider:", e);
    }
    
    setDocumentVisualTheme(DEFAULT_PUBLIC_THEME);
    setVisualThemeState(DEFAULT_PUBLIC_THEME);
  }, []);

  function setVisualTheme(next: VisualTheme) {
    setDocumentVisualTheme(next);
    setVisualThemeState(next);
  }

  const value = useMemo(
    () => ({
      visualTheme,
      setVisualTheme,
    }),
    [visualTheme],
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
