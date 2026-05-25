import { fireEvent, render, screen } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../features/auth/AuthContext";
import { useVisualTheme, VisualThemeProvider } from "../useVisualTheme";
import { initializeVisualTheme } from "../visualThemeStorage";

function Providers({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <VisualThemeProvider>{children}</VisualThemeProvider>
    </AuthProvider>
  );
}

function Probe() {
  const { visualTheme, setVisualTheme } = useVisualTheme();

  return (
    <div>
      <span data-testid="theme">{visualTheme}</span>
      <button type="button" onClick={() => setVisualTheme("theme-2")}>
        theme 2
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <Providers>
      <Probe />
    </Providers>,
  );
}

describe("useVisualTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-visual-theme");
  });

  it("aplica theme-1 sem usuário autenticado e ignora chave global antiga", () => {
    window.localStorage.setItem("visual-theme", "theme-2");
    window.localStorage.setItem("resume_ai_theme", "theme-2");

    initializeVisualTheme();
    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("theme-1");
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-1");
    
    // As chaves antigas devem ter sido removidas pelo provider no mount
    expect(window.localStorage.getItem("visual-theme")).toBeNull();
    expect(window.localStorage.getItem("resume_ai_theme")).toBeNull();
  });

  it("permite mudar o tema em memória", () => {
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-1");

    fireEvent.click(screen.getByRole("button", { name: "theme 2" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("theme-2");
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
    
    // Nenhuma persistência em localStorage
    expect(window.localStorage.getItem("visual-theme")).toBeNull();
  });
});
