import { act, render, screen, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../AuthContext";
import { ACCESS_TOKEN_KEY } from "../../../utils/storage";
import { AuthUser } from "../../../types/auth";
import { useVisualTheme, VisualThemeProvider } from "../../../hooks/useVisualTheme";

const mockAuthService = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  updateMyPreferences: vi.fn(),
}));

vi.mock("../../../services/authService", () => ({
  authService: mockAuthService,
}));

function makeUser(): AuthUser {
  return {
    id: "user-storage",
    email: "user-storage@example.com",
    full_name: "User Storage",
    role: "recruiter",
    status: "active",
    real_ai_token_spend_enabled: true,
    must_change_password: false,
    last_login_at: null,
    created_at: null,
    avatar_url: null,
    preferred_theme: "theme_1",
  };
}

function Providers({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <VisualThemeProvider>{children}</VisualThemeProvider>
    </AuthProvider>
  );
}

function ThemeLabel() {
  const { visualTheme } = useVisualTheme();
  return <span>{visualTheme}</span>;
}

describe("AuthProvider e tema visual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-visual-theme");
  });

  it("storage event de logout em outra aba limpa usuário e volta para theme_4", async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, "token");
    mockAuthService.me.mockResolvedValueOnce(makeUser());

    render(
      <Providers>
        <ThemeLabel />
      </Providers>,
    );

    await screen.findByText("theme-1");

    act(() => {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: ACCESS_TOKEN_KEY, newValue: null }));
    });

    await waitFor(() => {
      expect(screen.getByText("theme-4")).toBeInTheDocument();
    });
    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-4");
  });
});
