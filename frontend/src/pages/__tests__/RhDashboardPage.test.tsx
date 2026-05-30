import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ProtectedRoute } from "../../app/ProtectedRoute";
import { RhDashboardPage } from "../RhDashboardPage";
import { rhDashboardService } from "../../services/rhDashboardService";

const { mockGetDashboard, mockUseAuth } = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("../../services/rhDashboardService", () => ({
  rhDashboardService: {
    getDashboard: mockGetDashboard,
  },
}));

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: mockUseAuth,
}));

function makeDashboardResponse(overrides = {}) {
  return {
    summary: {
      new_candidates: 4,
      interviews_today: 2,
      pending_decisions: 3,
      pending_pre_admissions: 1,
      admitted_this_month: 5,
    },
    pending_actions: [
      {
        type: "interview_today",
        candidate_id: "cand-1",
        candidate_name: "Ana Silva",
        job_id: "job-1",
        job_title: "Analista de RH",
        label: "Entrevista hoje às 14:00",
        action_label: "Abrir Agenda",
        href: "/agenda",
      },
      {
        type: "register_decision",
        candidate_id: "cand-2",
        candidate_name: "Bruno Costa",
        job_id: "job-2",
        job_title: "Operador de Caixa",
        label: "Registrar decisão",
        action_label: "Abrir Pipeline",
        href: "/pipeline/job-2?candidateId=cand-2",
      },
    ],
    ...overrides,
  };
}

function authUser(role: "admin" | "hr" | "recruiter" | "viewer" | "candidate" = "admin") {
  return {
    id: "user-1",
    email: `${role}@test.com`,
    full_name: "Test User",
    role,
    status: "active",
    real_ai_token_spend_enabled: false,
    must_change_password: false,
    last_login_at: null,
    created_at: null,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RhDashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: authUser("admin"),
  });
  mockGetDashboard.mockResolvedValue(makeDashboardResponse());
});

describe("RhDashboardPage", () => {
  it("renderiza Central RH com cards", async () => {
    renderPage();

    expect(await screen.findByText("Candidatos novos")).toBeInTheDocument();
    expect(screen.getByText("Central RH")).toBeInTheDocument();
    expect(screen.getByText("Veja o que precisa de atenção hoje.")).toBeInTheDocument();

    expect(screen.getByText("Entrevistas de hoje")).toBeInTheDocument();
    expect(screen.getByText("Aguardando decisão")).toBeInTheDocument();
    expect(screen.getByText("Pré-admissões pendentes")).toBeInTheDocument();
    expect(screen.getByText("Admitidos no mês")).toBeInTheDocument();
  });

  it("mostra pendências do dia com próxima ação", async () => {
    renderPage();

    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Analista de RH")).toBeInTheDocument();
    expect(screen.getByText("Entrevista hoje")).toBeInTheDocument();
    expect(screen.getByText("Entrevista hoje às 14:00")).toBeInTheDocument();
    expect(screen.getAllByText("Registrar decisão").length).toBeGreaterThan(0);
  });

  it("mostra estado vazio quando não há pendências", async () => {
    mockGetDashboard.mockResolvedValue(
      makeDashboardResponse({
        pending_actions: [],
      }),
    );

    renderPage();

    expect(await screen.findByText("Nenhuma pendência para hoje")).toBeInTheDocument();
    expect(screen.getByText("Não há candidatos, entrevistas ou decisões pedindo ação neste momento.")).toBeInTheDocument();
  });

  it("mantém atalho para candidaturas", async () => {
    renderPage();

    const link = await screen.findByRole("link", { name: "Abrir Candidaturas" });
    expect(link).toHaveAttribute("href", "/candidaturas");
  });

  it("candidate não acessa a rota protegida", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: authUser("candidate"),
    });

    render(
      <MemoryRouter initialEntries={["/rh"]}>
        <ProtectedRoute allowedRoles={["admin", "hr", "recruiter", "viewer"]}>
          <RhDashboardPage />
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Acesso negado")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Central RH" })).not.toBeInTheDocument();
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it("viewer vê a Central RH sem ações de escrita", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: authUser("viewer"),
    });

    render(
      <MemoryRouter initialEntries={["/rh"]}>
        <ProtectedRoute allowedRoles={["admin", "hr", "recruiter", "viewer"]}>
          <RhDashboardPage />
        </ProtectedRoute>
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockGetDashboard).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Central RH" })).toBeInTheDocument();
    expect(screen.queryByText("Adicionar candidato")).not.toBeInTheDocument();
    expect(screen.queryByText("Importar CSV")).not.toBeInTheDocument();
    expect(screen.queryByText("Reprovar")).not.toBeInTheDocument();
  });
});
