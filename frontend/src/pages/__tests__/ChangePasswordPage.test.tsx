import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChangePasswordPage } from "../ChangePasswordPage";
import { useAuth } from "../../features/auth/useAuth";
import { authService } from "../../services/authService";
import { toast } from "../../shared/utils/toast";
import type { AuthUser } from "../../types/auth";

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../services/authService", () => ({
  authService: {
    updateMyPassword: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const adminUser: AuthUser = {
  id: "user-1",
  email: "admin@example.com",
  full_name: "Admin",
  role: "admin",
  status: "active",
  real_ai_token_spend_enabled: false,
  must_change_password: true,
  last_login_at: null,
  created_at: null,
};

function renderPage(user: AuthUser = adminUser, updateUser = vi.fn()) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser,
  });

  render(
    <MemoryRouter initialEntries={["/trocar-senha"]}>
      <Routes>
        <Route path="/trocar-senha" element={<ChangePasswordPage />} />
        <Route path="/dashboard" element={<div>Dashboard destino</div>} />
        <Route path="/candidato/portal" element={<div>Portal candidato destino</div>} />
      </Routes>
    </MemoryRouter>,
  );

  return { updateUser };
}

async function fillValidPasswordForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Senha atual"), "SenhaTemp123!");
  await user.type(screen.getByLabelText("Nova senha"), "NovaSenha123!");
  await user.type(screen.getByLabelText("Confirmar nova senha"), "NovaSenha123!");
  return user;
}

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.updateMyPassword).mockResolvedValue({
      ...adminUser,
      must_change_password: false,
    });
  });

  it("ao trocar senha provisória redireciona para dashboard e limpa must_change_password", async () => {
    const updateUser = vi.fn();
    renderPage(adminUser, updateUser);

    const user = await fillValidPasswordForm();
    await user.click(screen.getByRole("button", { name: /salvar nova senha/i }));

    expect(await screen.findByText("Dashboard destino")).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ must_change_password: false }));
    expect(toast.success).toHaveBeenCalledWith("Senha alterada com sucesso.");
  });

  it("redireciona candidato para o portal do candidato após sucesso", async () => {
    vi.mocked(authService.updateMyPassword).mockResolvedValue({
      ...adminUser,
      role: "candidate",
      must_change_password: false,
    });
    renderPage({ ...adminUser, role: "candidate" });

    const user = await fillValidPasswordForm();
    await user.click(screen.getByRole("button", { name: /salvar nova senha/i }));

    expect(await screen.findByText("Portal candidato destino")).toBeInTheDocument();
  });

  it("duplo clique no envio não dispara duas trocas de senha", async () => {
    let resolveRequest: (value: AuthUser) => void = () => undefined;
    vi.mocked(authService.updateMyPassword).mockReturnValue(
      new Promise<AuthUser>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderPage();

    const user = await fillValidPasswordForm();
    await user.dblClick(screen.getByRole("button", { name: /salvar nova senha/i }));

    expect(authService.updateMyPassword).toHaveBeenCalledTimes(1);
    resolveRequest({ ...adminUser, must_change_password: false });
    await waitFor(() => expect(screen.getByText("Dashboard destino")).toBeInTheDocument());
  });
});
