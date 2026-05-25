import { ReactNode, useEffect } from "react";
import { useVisualTheme } from "../hooks/useVisualTheme";
import { DEFAULT_PUBLIC_THEME } from "../hooks/visualThemeStorage";
import { useTheme } from "../hooks/useTheme";

type PublicRouteThemeGuardProps = {
  children: ReactNode;
};

export function PublicRouteThemeGuard({ children }: PublicRouteThemeGuardProps) {
  const { setVisualTheme } = useVisualTheme();
  const { setTheme } = useTheme();

  useEffect(() => {
    // Força o Tema 1 institucional (VisualTheme)
    setVisualTheme(DEFAULT_PUBLIC_THEME);
    
    // Força o tema light como padrão para rotas públicas (AppTheme)
    setTheme("light");

    // Limpar chaves antigas
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.removeItem("resume_ai_theme");
        window.localStorage.removeItem("visual-theme");
        window.localStorage.removeItem("theme:guest");
        // Também remove chaves theme:user:*
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
      console.error("Erro ao limpar chaves antigas no PublicRouteThemeGuard:", e);
    }
  }, [setVisualTheme, setTheme]);

  return <>{children}</>;
}
