import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VisualThemeProvider } from "../../../hooks/useVisualTheme";
import { SidebarUserMenu } from "../SidebarUserMenu";

// jsdom neste projeto não expõe window.localStorage por padrão (mesmo padrão
// usado em AppShell.nav.test.tsx) — precisa de um mock explícito.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
}

function renderMenu(theme: "light" | "dark" = "light") {
  const onToggleTheme = vi.fn();
  const onLogout = vi.fn();
  const onNavigateProfile = vi.fn();

  render(
    <VisualThemeProvider>
      <SidebarUserMenu
        userName="Ana Souza"
        userEmail="ana@marajo.com"
        isExpanded
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        onNavigateProfile={onNavigateProfile}
      />
    </VisualThemeProvider>,
  );

  return { onToggleTheme, onLogout, onNavigateProfile };
}

describe("SidebarUserMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("mostra nome e e-mail do usuário no gatilho", () => {
    renderMenu();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("ana@marajo.com")).toBeInTheDocument();
  });

  it("concentra perfil, tema claro/escuro e logout em um único controle", () => {
    const { onNavigateProfile, onToggleTheme, onLogout } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /meu perfil/i }));
    expect(onNavigateProfile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /modo escuro/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /^sair$/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("permite trocar a paleta de tema visual pelo mesmo menu", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /cobre executivo/i }));

    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
  });
});
