import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidatePortalPage } from "../CandidatePortalPage";
import { candidatePortalService } from "../../services/candidatePortalService";
import { communicationService } from "../../services/communicationService";
import { HttpError } from "../../services/http";
import { toast } from "../../shared/utils/toast";

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

describe("CandidatePortalPage.behavioralAssessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBaseOverview();
  });

  it("ao concluir avaliação volta para Início, mostra card de conclusão e toast", async () => {
    const summary = {
      id: "assignment-1",
      candidate_id: "cand-1",
      job_id: "job-1",
      job_title: "Analista",
      template_id: "template-1",
      template_name: "Perfil comportamental",
      status: "pending",
      assigned_at: "2026-05-01T00:00:00Z",
      started_at: null,
      submitted_at: null,
      expires_at: null,
      answered_count: 0,
      question_count: 1,
    };
    const detail = {
      ...summary,
      status: "in_progress",
      started_at: "2026-05-01T01:00:00Z",
      competencies: [
        {
          id: "comp-1",
          name: "Organização",
          description: null,
          display_order: 0,
          questions: [
            {
              id: "question-1",
              question_text: "Como você prioriza suas tarefas?",
              answer_type: "text",
              is_required: true,
              display_order: 0,
              options_json: null,
              answer: null,
            },
          ],
        },
      ],
    };

    (candidatePortalService.listBehavioralAssessments as any).mockResolvedValue([summary]);
    (candidatePortalService.startBehavioralAssessment as any).mockResolvedValue(detail);
    (candidatePortalService.submitBehavioralAssessment as any).mockResolvedValue({
      ...detail,
      status: "submitted",
      submitted_at: "2026-05-01T02:00:00Z",
      answered_count: 1,
    });

    renderPortal();

    await screen.findByText("Resumo da Situação");
    fireEvent.click(screen.getByTitle("Avaliações"));
    fireEvent.click(await screen.findByRole("button", { name: /responder avaliação/i }));
    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Uso matriz de prioridade." },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    expect(await screen.findByText("Avaliação concluída")).toBeInTheDocument();
    expect(screen.getByText(/Perfil comportamental foi enviada com sucesso/i)).toBeInTheDocument();
    expect(screen.queryByText("Como você prioriza suas tarefas?")).not.toBeInTheDocument();
    expect(candidatePortalService.submitBehavioralAssessment).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Avaliação concluída com sucesso.");
  });
});
