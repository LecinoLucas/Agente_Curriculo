import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidatePortalPage } from "../CandidatePortalPage";
import { candidatePortalService } from "../../services/candidatePortalService";
import { communicationService } from "../../services/communicationService";
import { HttpError } from "../../services/http";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../services/candidatePortalService", () => ({
  candidatePortalService: {
    getOverview: vi.fn(),
    listBehavioralAssessments: vi.fn(),
    getBehavioralAssessment: vi.fn(),
    startBehavioralAssessment: vi.fn(),
    saveBehavioralAnswers: vi.fn(),
    submitBehavioralAssessment: vi.fn(),
    getPreAdmission: vi.fn(),
    uploadPreAdmissionDocument: vi.fn(),
    updateProfile: vi.fn(),
    uploadResume: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("../../services/communicationService", () => ({
  communicationService: {
    getCandidateCommunications: vi.fn(),
    markCommunicationRead: vi.fn(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function mockBaseOverview() {
  (candidatePortalService.getOverview as any).mockResolvedValue({
    candidate: {
      id: "cand-1",
      full_name: "Logout Tester",
      email: "logout@example.com",
      phone: "11999999999",
      cpf: "12345678909",
      salary_expectation: "5500.00",
      desired_contract_type: "CLT",
      city: "São Paulo",
      state: "SP",
      profile_completeness: 100,
      profile_status: "active",
    },
    resume: { has_resume: true, current_version: 1 },
    applications: [],
    interviews: [],
    documents: [],
  });
  (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([]);
  (candidatePortalService.getPreAdmission as any).mockResolvedValue({ case: null });
  (communicationService.getCandidateCommunications as any).mockResolvedValue({ communications: [] });
}

function renderPortal() {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={["/candidato/portal"]}>
      <Routes>
        <Route path="/candidato/portal" element={<CandidatePortalPage />} />
        <Route path="/candidato/login" element={<div>Login destino</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CandidatePortalPage.handleLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  it("limpa sessão local mesmo se a API de logout falhar (não deixa Uncaught Promise)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    (candidatePortalService.logout as any).mockRejectedValue(
      new HttpError(0, "ERR_EMPTY_RESPONSE", "ERR_EMPTY_RESPONSE", {}),
    );

    renderPortal();

    // Botão de sair aparece após carregamento do portal
    const logoutButton = await screen.findByRole("button", { name: /sair/i });
    fireEvent.click(logoutButton);

    // Mesmo com erro de rede, deve navegar para /candidato/login
    await waitFor(() => {
      expect(screen.getByText("Login destino")).toBeInTheDocument();
    });
    expect(candidatePortalService.logout).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("redireciona para login após logout bem-sucedido", async () => {
    (candidatePortalService.logout as any).mockResolvedValue(undefined);

    renderPortal();

    const logoutButton = await screen.findByRole("button", { name: /sair/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByText("Login destino")).toBeInTheDocument();
    });
  });
});
