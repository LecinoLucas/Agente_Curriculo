import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { DashboardPage } from "../DashboardPage";
import { rhDashboardService } from "../../services/rhDashboardService";

const {
  mockGetDashboard,
  mockGetTrends,
  mockGetPipelineFunnel,
  mockListPipelineJobs,
  mockListInterviews,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockGetDashboard: vi.fn(),
  mockGetTrends: vi.fn(),
  mockGetPipelineFunnel: vi.fn(),
  mockListPipelineJobs: vi.fn(),
  mockListInterviews: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("../../services/rhDashboardService", () => ({
  rhDashboardService: {
    getDashboard: mockGetDashboard,
    getTrends: mockGetTrends,
    getPipelineFunnel: mockGetPipelineFunnel,
  },
}));

vi.mock("../../services/pipelineService", () => ({
  pipelineService: { listPipelineJobs: mockListPipelineJobs },
}));

vi.mock("../../services/agendaService", () => ({
  agendaService: { listInterviews: mockListInterviews },
}));

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: mockUseAuth,
}));

function mockTrendsResponse(days = 14, empty = false) {
  const points = Array.from({ length: days }).map((_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    candidates: empty ? 0 : i + 1,
    interviews: empty ? 0 : Math.floor(i / 2),
    hires: empty ? 0 : Math.floor(i / 4),
  }));

  return {
    days,
    points,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "u1", role: "admin", full_name: "Test User" },
  });
  mockGetTrends.mockResolvedValue(mockTrendsResponse(14));
  mockGetPipelineFunnel.mockResolvedValue({ total: 0, stages: [] });
  mockGetDashboard.mockResolvedValue({
    summary: {
      new_candidates: 0,
      interviews_today: 2,
      pending_decisions: 1,
      active_jobs: 9,
      pending_pre_admissions: 0,
      admitted_this_month: 0,
    },
    pending_actions: [],
  });
  mockListPipelineJobs.mockResolvedValue([]);
  mockListInterviews.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 5, total_pages: 0 });
});

describe("DashboardPage", () => {
  it("renderiza cabeçalho, card de tendências e totais do período", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Dashboard de recrutamento" })).toBeInTheDocument();
    expect(screen.getByTestId("rh-trends-chart-card")).toBeInTheDocument();
    expect((await screen.findAllByText("Vagas em andamento")).length).toBeGreaterThan(0);
    expect(screen.getByText("Próximas entrevistas")).toBeInTheDocument();
    expect(screen.getByText("Pendências do dia")).toBeInTheDocument();

    expect(await screen.findByText("Candidatos no período")).toBeInTheDocument();
    expect(screen.getByText("Entrevistas no período")).toBeInTheDocument();
    expect(screen.getByText("Contratações no período")).toBeInTheDocument();
  });

  it("busca cards operacionais nas APIs reais, sem total fixo no frontend", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockGetDashboard).toHaveBeenCalledTimes(1);
      expect(mockListPipelineJobs).toHaveBeenCalledTimes(1);
      expect(mockListInterviews).toHaveBeenCalledWith(
        expect.objectContaining({ date_from: expect.any(String), page_size: 20 }),
      );
    });

    expect(await screen.findByText("9")).toBeInTheDocument();
  });

  it("altera o seletor de período e refaz a busca com novos dias", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId("rh-trends-chart-card")).toBeInTheDocument();
    expect(mockGetTrends).toHaveBeenCalledWith(14);

    const toggle = screen.getByTestId("rh-trends-period-toggle");
    const btn30 = within(toggle).getByRole("button", { name: "30 dias" });

    await user.click(btn30);

    await waitFor(() => {
      expect(mockGetTrends).toHaveBeenCalledWith(30);
    });
  });

  it("exibe estado de erro amigável ao falhar a busca de tendências", async () => {
    mockGetTrends.mockRejectedValue(new Error("API network failure"));

    renderPage();

    expect(await screen.findByText("Não foi possível carregar as tendências.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("exibe estado de período sem dados quando todas as métricas forem zero", async () => {
    mockGetTrends.mockResolvedValue(mockTrendsResponse(14, true));

    renderPage();

    expect(await screen.findByText("Sem dados no período")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma atividade registrada no intervalo selecionado.")).toBeInTheDocument();
  });
});
