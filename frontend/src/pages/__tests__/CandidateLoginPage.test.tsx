import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateLoginPage } from "../CandidateLoginPage";
import { candidateAuthService } from "../../services/candidateAuthService";
import { candidatePortalService } from "../../services/candidatePortalService";

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    login: vi.fn(),
  },
}));

vi.mock("../../services/candidateAuthService", () => ({
  candidateAuthService: {
    googleLogin: vi.fn(),
  },
}));

vi.mock("../../components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: ({ onCredential, onError }: { onCredential: (idToken: string) => void; onError: (message: string) => void }) => (
    <div>
      <button type="button" onClick={() => onCredential("google-credential")}>
        Continuar com Google
      </button>
      <button type="button" onClick={() => onError("Falha no Google")}>
        Simular erro Google
      </button>
    </div>
  ),
}));

describe("CandidateLoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite login com Google", async () => {
    (candidateAuthService.googleLogin as any).mockResolvedValue({
      status: "authenticated",
      message: "ok",
      redirect_to: "/candidato/portal",
      session_expires_at: "2026-05-17T14:00:00Z",
      candidate: {
        id: "candidate-1",
        full_name: "Maria Google",
        email: "maria.google@example.com",
        phone: "11999999999",
        cpf: "12345678909",
        salary_expectation: "5500.00",
        has_resume: true,
        picture_url: null,
        email_locked: true,
      },
      missing_fields: [],
    });

    render(
      <MemoryRouter initialEntries={["/candidato/login"]}>
        <Routes>
          <Route path="/candidato/login" element={<CandidateLoginPage />} />
          <Route path="/candidato/portal" element={<div>Portal destino</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /continuar com google/i }));
    expect(await screen.findByText("Portal destino")).toBeInTheDocument();
  });

  it("continua suportando login por e-mail e senha", async () => {
    (candidatePortalService.login as any).mockResolvedValue({
      message: "ok",
      redirect_to: "/candidato/portal",
      session_expires_at: "2026-05-17T14:00:00Z",
    });

    render(
      <MemoryRouter initialEntries={["/candidato/login"]}>
        <Routes>
          <Route path="/candidato/login" element={<CandidateLoginPage />} />
          <Route path="/candidato/portal" element={<div>Portal destino</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "maria@example.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "SenhaSegura123" } });
    fireEvent.click(screen.getByRole("button", { name: /acessar minha conta/i }));

    expect(await screen.findByText("Portal destino")).toBeInTheDocument();
  });
});
