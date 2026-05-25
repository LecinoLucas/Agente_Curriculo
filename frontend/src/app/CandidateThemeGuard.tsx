import { ReactNode, useEffect } from "react";
import { useVisualTheme } from "../hooks/useVisualTheme";
import { useTheme } from "../hooks/useTheme";

type CandidateThemeGuardProps = {
  children: ReactNode;
};

export function CandidateThemeGuard({ children }: CandidateThemeGuardProps) {
  const { visualTheme, setVisualTheme } = useVisualTheme();
  const { theme } = useTheme();

  useEffect(() => {
    // A gestão de tema agora é feita explicitamente pelo botão de toggle
    // no CandidatePortalPage. O Guard apenas garante o contexto.
  }, []);

  return <>{children}</>;
}
