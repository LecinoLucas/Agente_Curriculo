import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { CandidateLoginPage } from "../CandidateLoginPage";
import { candidateAuthService } from "../../services/candidateAuthService";
import { candidatePortalService } from "../../services/candidatePortalService";
import { __resetGoogleIdentityForTests } from "../../services/googleIdentityService";

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

function installGoogleMock() {
  let credentialCallback: ((response: { credential?: string }) => void) | null = null;

  window.google = {
    accounts: {
      id: {
        initialize: vi.fn((options) => {
          credentialCallback = options.callback;
        }),
        renderButton: vi.fn((element) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Continuar com Google";
          button.addEventListener("click", () => {
            credentialCallback?.({ credential: "google-credential" });
          });
          element.appendChild(button);
        }),
        prompt: vi.fn(),
      },
    },
  };
}

describe("CandidateLoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete window.google;
    __resetGoogleIdentityForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.google;
    __resetGoogleIdentityForTests();
  });

  it("permite login com Google", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
    installGoogleMock();
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
      <MemoryRouter future={routerFuture} initialEntries={["/candidato/login"]}>
        <Routes>
          <Route path="/candidato/login" element={<CandidateLoginPage />} />
          <Route path="/candidato/portal" element={<div>Portal destino</div>} />
        </Routes>
      </MemoryRouter>
    );

    const googleButton = await screen.findByRole("button", { name: /continuar com google/i });
    expect(screen.queryByText(/apenas contas @redemarajo\.com\.br/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(googleButton).toBeEnabled();
    });
    fireEvent.click(googleButton);
    await waitFor(() => {
      expect(candidateAuthService.googleLogin).toHaveBeenCalledWith({ id_token: "google-credential" });
    });
    expect(await screen.findByText("Portal destino")).toBeInTheDocument();
  });

  it("continua suportando login por e-mail e senha", async () => {
    (candidatePortalService.login as any).mockResolvedValue({
      message: "ok",
      redirect_to: "/candidato/portal",
      session_expires_at: "2026-05-17T14:00:00Z",
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidato/login"]}>
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

  it("usa autocomplete correto nos campos de e-mail e senha", () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidato/login"]}>
        <Routes>
          <Route path="/candidato/login" element={<CandidateLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("E-mail")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "current-password");
  });

  it("não renderiza botão Google e mostra aviso seguro sem VITE_GOOGLE_CLIENT_ID", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/candidato/login"]}>
        <Routes>
          <Route path="/candidato/login" element={<CandidateLoginPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /continuar com google/i })).not.toBeInTheDocument();
    expect(screen.getByText(/defina `VITE_GOOGLE_CLIENT_ID`/i)).toBeInTheDocument();
  });
});
