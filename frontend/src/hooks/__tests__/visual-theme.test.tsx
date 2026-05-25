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

  it("aplica o tema armazenado no localStorage, ou theme-1 por padrão", () => {
    window.localStorage.setItem("visual-theme", "theme-2");

    initializeVisualTheme();
    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("theme-2");
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
  });

  it("permite mudar o tema em memória e persiste em localStorage", () => {
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-1");

    fireEvent.click(screen.getByRole("button", { name: "theme 2" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("theme-2");
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
    
    // Agora existe persistência em localStorage
    expect(window.localStorage.getItem("visual-theme")).toBe("theme-2");
  });
});
