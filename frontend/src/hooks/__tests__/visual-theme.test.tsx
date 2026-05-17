import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../features/auth/AuthContext";
import { useAuth } from "../../features/auth/useAuth";
import { AuthUser, UserPreferredTheme } from "../../types/auth";
import { useVisualTheme, VisualThemeProvider } from "../useVisualTheme";
import { initializeVisualTheme } from "../visualThemeStorage";

const mockAuthService = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  updateMyPreferences: vi.fn(),
}));

vi.mock("../../services/authService", () => ({
  authService: mockAuthService,
}));

function makeUser(id: string, preferredTheme: UserPreferredTheme | null | string): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    full_name: `User ${id}`,
    role: "recruiter",
    status: "active",
    real_ai_token_spend_enabled: true,
    must_change_password: false,
    last_login_at: null,
    created_at: null,
    avatar_url: null,
    preferred_theme: preferredTheme as UserPreferredTheme | null,
  };
}

function Providers({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <VisualThemeProvider>{children}</VisualThemeProvider>
    </AuthProvider>
  );
}

function Probe() {
  const { visualTheme, setVisualTheme } = useVisualTheme();
  const { login, logout } = useAuth();

  return (
    <div>
      <span data-testid="theme">{visualTheme}</span>
      <button type="button" onClick={() => void login("user@example.com", "password123")}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
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
    mockAuthService.login.mockResolvedValue({
      access_token: "token",
      must_change_password: false,
      token_type: "bearer",
    });
    mockAuthService.logout.mockResolvedValue(undefined);
    mockAuthService.me.mockRejectedValue(new Error("not authenticated"));
    mockAuthService.updateMyPreferences.mockResolvedValue({ preferred_theme: "theme_2" });
  });

  it("aplica theme_4 sem usuário autenticado e ignora chave global antiga", () => {
    window.localStorage.setItem("visual-theme", "theme-1");

    initializeVisualTheme();
    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("theme-4");
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-4");
    expect(window.localStorage.getItem("visual-theme")).toBeNull();
  });

  it("aplica o tema retornado pelo usuário no login", async () => {
    mockAuthService.me.mockResolvedValueOnce(makeUser("user-a", "theme_1"));
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-1");
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-1");
  });

  it("volta para theme_4 no logout", async () => {
    mockAuthService.me.mockResolvedValueOnce(makeUser("user-a", "theme_1"));
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "login" }));
    await screen.findByText("theme-1");

    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-4");
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-4");
  });

  it("login de outro usuário aplica o tema dele e não herda o anterior", async () => {
    mockAuthService.me
      .mockResolvedValueOnce(makeUser("user-a", "theme_1"))
      .mockResolvedValueOnce(makeUser("user-b", "theme_3"));
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "login" }));
    await screen.findByText("theme-1");
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await screen.findByText("theme-4");
    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-3");
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-3");
  });

  it("usuário sem tema salvo usa theme_4", async () => {
    mockAuthService.me.mockResolvedValueOnce(makeUser("user-empty", null));
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-4");
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-4");
  });

  it("troca de tema logada chama endpoint e usa cache por usuário", async () => {
    mockAuthService.me.mockResolvedValueOnce(makeUser("user-b", "theme_3"));
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "login" }));
    await screen.findByText("theme-3");

    fireEvent.click(screen.getByRole("button", { name: "theme 2" }));

    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
    await waitFor(() => {
      expect(mockAuthService.updateMyPreferences).toHaveBeenCalledWith({ preferred_theme: "theme_2" });
    });
    expect(window.localStorage.getItem("theme:user:user-b")).toBe("theme-2");
    expect(window.localStorage.getItem("visual-theme")).toBeNull();
  });

  it("tema inválido vindo do usuário não quebra a UI", async () => {
    mockAuthService.me.mockResolvedValueOnce(makeUser("user-invalid", "theme_99"));
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-4");
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("theme-4");
  });

  it("sincroniza storage event apenas para o usuário atual", async () => {
    mockAuthService.me.mockResolvedValueOnce(makeUser("user-b", "theme_3"));
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "login" }));
    await screen.findByText("theme-3");

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "theme:user:user-a", newValue: "theme-1" }));
      window.dispatchEvent(new StorageEvent("storage", { key: "theme:user:user-b", newValue: "theme-2" }));
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("theme-2");
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
  });
});
