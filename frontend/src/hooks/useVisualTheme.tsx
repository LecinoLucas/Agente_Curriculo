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
  const [visualTheme, setVisualThemeState] = useState<VisualTheme>(() => {
    if (typeof window !== "undefined") {
      return (window.localStorage.getItem("visual-theme") as VisualTheme) || DEFAULT_PUBLIC_THEME;
    }
    return DEFAULT_PUBLIC_THEME;
  });

  useEffect(() => {
    const initialTheme = (typeof window !== "undefined" ? window.localStorage.getItem("visual-theme") as VisualTheme : null) || DEFAULT_PUBLIC_THEME;
    setDocumentVisualTheme(initialTheme);
    setVisualThemeState(initialTheme);
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
