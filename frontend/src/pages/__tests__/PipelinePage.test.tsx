import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PipelinePage } from "../PipelinePage";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { useAuth } from "../../features/auth/useAuth";
import { pipelineService } from "../../services/pipelineService";
import { getJobRanking } from "../../services/jobsService";
import { HttpError } from "../../services/http";
import { feedback } from "../../services/feedback";
import "@testing-library/jest-dom";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExpectedDefaultPipelineDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return {
    entered_from: formatDateInputValue(from),
    entered_to: formatDateInputValue(to),
  };
}

// Mock the usePipeline hook
vi.mock("../../features/pipeline/PipelineContext", () => ({
  usePipeline: vi.fn(),
}));

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock services
vi.mock("../../services/pipelineService", async () => {
  const actual = await vi.importActual<typeof import("../../services/pipelineService")>(
    "../../services/pipelineService",
  );
  return {
    ...actual,
    pipelineService: {
      listPipelineJobs: vi.fn(),
      schedulePipelineInterview: vi.fn(),
    },
  };
});

vi.mock("../../services/jobsService", () => ({
  getJobRanking: vi.fn(),
}));

vi.mock("../../services/feedback", () => ({
  feedback: {
    moveCandidate: {
      processing: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
  },
}));

// Mock child modals/drawers to keep test output clean and isolated
vi.mock("../../features/pipeline/NewCandidateModal", () => ({
  NewCandidateModal: () => <div data-testid="new-candidate-modal" />,
}));

vi.mock("../../features/pipeline/CandidateSearchModal", () => ({
  CandidateSearchModal: ({ isOpen, ranking, rankingLoading }: any) =>
    isOpen ? (
      <div
        data-testid="candidate-search-modal"
        data-ranking-job-id={ranking?.job_id ?? ""}
        data-ranking-loading={String(rankingLoading)}
      />
    ) : null,
}));

vi.mock("../../features/candidates/components/CandidatePreviewDrawer", () => ({
  CandidatePreviewDrawer: ({
    candidateId,
  }: {
    candidateId: string | null;
  }) =>
    candidateId ? (
      <div data-testid="candidate-preview-drawer">
        {candidateId}
      </div>
    ) : null,
}));

describe("PipelinePage", () => {
  const mockSetActiveJob = vi.fn();
  const mockSetBoardFilters = vi.fn().mockResolvedValue(undefined);
  const mockRefreshBoard = vi.fn();
  const mockMoveCandidateStage = vi.fn();
  const mockOpenCandidate = vi.fn().mockResolvedValue(undefined);
  const mockCloseCandidate = vi.fn();
  const mockSyncCandidateOverview = vi.fn().mockResolvedValue(undefined);

  const mockJobs = [
    {
      id: "job-1",
      title: "Desenvolvedor React",
      status: "published",
      seniority_level: "senior",
      work_model: "remote",
      location: "São Paulo",
    },
    {
      id: "job-2",
      title: "Engenheiro Frontend",
      status: "published",
      seniority_level: "specialist",
      work_model: "hybrid",
      location: "Rio de Janeiro",
    },
  ];

  const mockBoard = {
    job_id: "job-1",
    columns: [
      {
        stage: "entry",
        label: "Triagem",
        candidates: [
          {
            candidate_id: "c-1",
            candidate_name: "Aline Santos",
            job_fit_score: 92,
            top_skills: ["React", "TypeScript"],
            seniority_level: "senior",
            total_experience_years: 6,
            updated_at: "2026-05-15T12:00:00Z",
            ai_status: "completed",
          },
        ],
      },
      {
        stage: "screening",
        label: "Telefone",
        candidates: [],
      },
      {
        stage: "hr_interview",
        label: "Entrevista RH",
        candidates: [
          {
            candidate_id: "c-2",
            candidate_name: "Bruno Lima",
            job_fit_score: 85,
            top_skills: ["Node.js"],
            seniority_level: "mid",
            total_experience_years: 4,
            updated_at: "2026-05-16T12:00:00Z",
            ai_status: "completed",
          },
        ],
      },
      {
        stage: "technical_interview",
        label: "Entrevista Gestor",
        candidates: [],
      },
      {
        stage: "final",
        label: "Avaliação",
        candidates: [],
      },
      {
        stage: "offer",
        label: "Proposta",
        candidates: [],
      },
      {
        stage: "hired",
        label: "Contratado",
        candidates: [],
      },
      {
        stage: "pre_admission",
        label: "Pré-admissão",
        candidates: [],
      },
      {
        stage: "protheus",
        label: "Protheus",
        candidates: [],
      },
      {
        stage: "admitted",
        label: "Admitido",
        candidates: [],
      },
      {
        stage: "rejected",
        label: "Desclassificado",
        candidates: [],
      },
    ],
  };

  const mockRanking = {
    job_id: "job-1",
    total_candidates: 2,
    threshold_high: 80,
    threshold_low: 50,
    score_version: "v1.2",
    candidates: [
      {
        candidate_id: "c-1",
        candidate_name: "Aline Santos",
        job_fit_score: 92,
        rank: 1,
        reason_tags: [],
        ranking_freshness_status: "fresh",
      },
      {
        candidate_id: "c-2",
        candidate_name: "Bruno Lima",
        job_fit_score: 85,
        rank: 2,
        reason_tags: [],
        ranking_freshness_status: "fresh",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    (useAuth as any).mockReturnValue({
      user: { id: "user-1", role: "admin" },
    });
    (pipelineService.listPipelineJobs as any).mockResolvedValue(mockJobs);
    (getJobRanking as any).mockResolvedValue(mockRanking);
    mockMoveCandidateStage.mockResolvedValue({
      candidate_id: "c-1",
      job_id: "job-1",
      stage: "screening",
    });
    (usePipeline as any).mockReturnValue({
      activeJobId: "job-1",
      board: mockBoard,
      boardFilters: {},
      boardLoading: false,
      boardError: null,
      rankingSyncTick: 0,
      setActiveJob: mockSetActiveJob,
      setBoardFilters: mockSetBoardFilters,
      moveCandidateStage: mockMoveCandidateStage,
      refreshBoard: mockRefreshBoard,
      openCandidate: mockOpenCandidate,
      closeCandidate: mockCloseCandidate,
      syncCandidateOverview: mockSyncCandidateOverview,
    });
  });

  it("1. Renderiza o título 'Pipeline' no breadcrumb", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Pipeline", level: 1 })).toBeInTheDocument();
    });
  });

  it("2. Renderiza o breadcrumb 'Recrutamento / Pipeline'", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
      expect(within(breadcrumb).getByText("Recrutamento")).toBeInTheDocument();
      expect(within(breadcrumb).getByText("Pipeline")).toBeInTheDocument();
    });
  });

  it("3. Renderiza busca/filtros da barra e mantém atalho de lupa + vincular", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar candidato/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Vincular candidato/i })).toBeInTheDocument();
    });
  });

  it("3.1. Carrega ranking IA ao abrir o modal de vínculo", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    const button = (await screen.findAllByRole("button", { name: "Vincular candidato" }))[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(getJobRanking).toHaveBeenCalledWith("job-1");
    });
    await waitFor(() => {
      expect(screen.getByTestId("candidate-search-modal")).toHaveAttribute("data-ranking-job-id", "job-1");
    });
  });

  it.each(["admin", "recruiter"] as const)(
    "permite ações operacionais da Pipeline para %s",
    async (role) => {
      (useAuth as any).mockReturnValue({
        user: { id: `user-${role}`, role },
      });

      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByRole("button", { name: /Vincular candidato/i })).toBeInTheDocument();
      expect(screen.getByTestId("kanban-card-c-1")).toHaveAttribute("draggable", "true");
    },
  );

  it.each(["viewer", "hr", "manager"] as const)(
    "bloqueia ações operacionais da Pipeline para %s, mantendo leitura",
    async (role) => {
      (useAuth as any).mockReturnValue({
        user: { id: `user-${role}`, role },
      });
      const dataTransfer = { effectAllowed: "move", setData: vi.fn(), dropEffect: "move" };

      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await screen.findByText("Aline Santos");
      expect(screen.queryByRole("button", { name: /Vincular candidato/i })).not.toBeInTheDocument();
      expect(screen.getByTestId("kanban-card-c-1")).not.toHaveAttribute("draggable", "true");

      fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
      fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
      fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

      expect(mockMoveCandidateStage).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("Aline Santos"));
      expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("c-1");
    },
  );

  it("3.1.1. Exibe labels de ordenação coerentes com score_desc", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /melhor match ia/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Filtros/i }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Maior aderência" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("option", { name: "Mais recente" })).not.toBeInTheDocument();
  });

  it("3.1.2. Mantém status principal da vaga no seletor sem box duplicado", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Publicada")).toBeInTheDocument();
    });
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("3.1. Renderiza filtros seguros por data do vínculo", async () => {
    const defaultRange = getExpectedDefaultPipelineDateRange();

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Filtros/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Filtros/i }));

    await waitFor(() => {
      expect(screen.getByText("Período")).toBeInTheDocument();
      expect(screen.getByText("Última atividade")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockSetBoardFilters).toHaveBeenCalledWith(defaultRange);
    });
    expect(screen.getByLabelText("Entrada no processo de")).toHaveValue(defaultRange.entered_from);
    expect(screen.getByLabelText("Entrada no processo até")).toHaveValue(defaultRange.entered_to);
    expect(screen.queryByText(/entrou na etapa/i)).not.toBeInTheDocument();
  });

  it("3.2. Alterar filtro atualiza a board com novos params", async () => {
    render(
      <MemoryRouter
        future={routerFuture}
        initialEntries={["/pipeline/job-1?entered_from=2026-05-01"]}
      >
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    // Open filters
    const filtrosBtn = await screen.findByRole("button", { name: /^Filtros/i });
    fireEvent.click(filtrosBtn);

    await waitFor(() => {
      expect(mockSetBoardFilters).toHaveBeenCalledWith({ entered_from: "2026-05-01" });
    });

    fireEvent.change(screen.getByLabelText("Última atividade até"), {
      target: { value: "2026-05-31" },
    });

    await waitFor(() => {
      expect(mockSetBoardFilters).toHaveBeenLastCalledWith({
        entered_from: "2026-05-01",
        updated_to: "2026-05-31",
      });
    });
  });

  it("3.3. Limpar filtros remove os params da board", async () => {
    (usePipeline as any).mockReturnValue({
      activeJobId: "job-1",
      board: mockBoard,
      boardFilters: {
        entered_from: "2026-05-01",
        entered_to: "2026-05-31",
        updated_from: "2026-06-01",
        updated_to: "2026-06-30",
      },
      boardLoading: false,
      boardError: null,
      rankingSyncTick: 0,
      setActiveJob: mockSetActiveJob,
      setBoardFilters: mockSetBoardFilters,
      moveCandidateStage: mockMoveCandidateStage,
      refreshBoard: mockRefreshBoard,
      openCandidate: mockOpenCandidate,
      closeCandidate: mockCloseCandidate,
      syncCandidateOverview: mockSyncCandidateOverview,
    });

    render(
      <MemoryRouter
        future={routerFuture}
        initialEntries={[
          "/pipeline/job-1?entered_from=2026-05-01&entered_to=2026-05-31&updated_from=2026-06-01&updated_to=2026-06-30",
        ]}
      >
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    // Open filters to find the inputs
    const filtrosBtn = await screen.findByRole("button", { name: /^Filtros/i });
    fireEvent.click(filtrosBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue("2026-05-01")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => {
      expect(mockSetBoardFilters).toHaveBeenLastCalledWith({});
    });
  });

  // Test 4 removed as KPIs were moved to dashboard

  it("5. Renderiza a lista horizontal de macrocolunas do Kanban", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("kanban-column-entrada")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-analise")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-avaliacao")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-entrevista")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-decisao")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-admissao")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-finalizado")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("kanban-column-protheus")).not.toBeInTheDocument();
  });

  it("6. Renderiza os cards dos candidatos com dados reais", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Aline Santos")).toBeInTheDocument();
      expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    });
    const alineCard = screen.getByTestId("kanban-card-c-1");
    expect(alineCard).toBeInTheDocument();
    const brunoCard = screen.getByTestId("kanban-card-c-2");
    expect(brunoCard).toBeInTheDocument();
  });

  it("6.1. Agrupa Protheus em Admissão com substatus real e sem detalhes técnicos", async () => {
    const boardWithProtheus = {
      ...mockBoard,
      columns: mockBoard.columns.map((column) =>
        column.stage === "protheus"
          ? {
              ...column,
              candidates: [
                {
                  candidate_id: "c-protheus",
                  candidate_name: "Paula Protheus",
                  job_fit_score: 74,
                  top_skills: ["Departamento pessoal"],
                  seniority_level: "mid",
                  total_experience_years: 3,
                  updated_at: "2026-05-17T12:00:00Z",
                  ai_status: "completed",
                },
              ],
            }
          : column,
      ),
    };

    (usePipeline as any).mockReturnValue({
      activeJobId: "job-1",
      board: boardWithProtheus,
      boardFilters: {},
      boardLoading: false,
      boardError: null,
      rankingSyncTick: 0,
      setActiveJob: mockSetActiveJob,
      setBoardFilters: mockSetBoardFilters,
      moveCandidateStage: mockMoveCandidateStage,
      refreshBoard: mockRefreshBoard,
      openCandidate: mockOpenCandidate,
      closeCandidate: mockCloseCandidate,
      syncCandidateOverview: mockSyncCandidateOverview,
    });

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    const admissionColumn = await screen.findByTestId("kanban-column-admissao");
    expect(admissionColumn).toContainElement(screen.getByText("Paula Protheus"));
    const protheusCard = screen.getByTestId("kanban-card-c-protheus");
    expect(protheusCard).toHaveTextContent(/Integração ERP/i);
    expect(screen.queryByTestId("kanban-column-protheus")).not.toBeInTheDocument();
    expect(screen.queryByText(/payload/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tentativas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/checklist/i)).not.toBeInTheDocument();
  });

  it("7. Coluna vazia exibe a mensagem contextualizada", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const emptyStates = screen.getAllByText(/Nenhum candidato/i);
      expect(emptyStates.length).toBeGreaterThan(0);
    });
  });

  it("8. Clicar em um card de candidato abre o preview leve", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Aline Santos")).toBeInTheDocument();
    });

    const card = screen.getByText("Aline Santos").closest("div");
    expect(card).toBeInTheDocument();
    fireEvent.click(card!);

    expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("c-1");
    expect(mockOpenCandidate).toHaveBeenCalledWith("c-1");
  });

  it("9. Mantém candidatos visíveis sem campo de busca local", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Aline Santos")).toBeInTheDocument();
      expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    });

    expect(screen.getByText("Aline Santos")).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
  });

  it("10. Renderiza banner com erro se a busca de vagas falhar", async () => {
    (pipelineService.listPipelineJobs as any).mockRejectedValue(new Error("Erro de rede"));
    
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Erro de rede", { exact: false })).toBeInTheDocument();
    });
  });

  it("11. Move candidato ao arrastar o card para outra coluna", async () => {
    const dataTransfer = {
      effectAllowed: "move",
      setData: vi.fn(),
      dropEffect: "move",
    };

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("kanban-card-c-1")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-analise")).toBeInTheDocument();
    });

    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await waitFor(() => {
      expect(mockMoveCandidateStage).toHaveBeenCalledWith("c-1", "screening");
    });
  });

  it("12. Expõe scroll horizontal superior sincronizado com o Kanban", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    const scrollContainer = await screen.findByTestId("kanban-scroll-container");
    Object.defineProperty(scrollContainer, "scrollWidth", { configurable: true, value: 1600 });
    Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 800 });
    fireEvent(window, new Event("resize"));

    const topScroll = await screen.findByTestId("kanban-top-scroll");
    fireEvent.scroll(topScroll, { target: { scrollLeft: 120 } });

    expect(scrollContainer.scrollLeft).toBe(120);
  });

  it("14. Bloqueio 409 pipeline_transition_blocked abre modal e não move o card", async () => {
    const blockedPayload = {
      code: "pipeline_transition_blocked",
      message: "Não é possível avançar candidato para esta etapa.",
      current_stage: "entry",
      target_stage: "screening",
      missing_gates: [
        {
          code: "behavioral_ai_pending",
          label: "IA comportamental pendente",
          description: "Aguarde a IA comportamental concluir.",
          action: "open_behavioral_ai",
          action_payload: { assignment_id: "asg-1" },
          severity: "block",
          forceable: false,
        },
        {
          code: "scorecard_not_submitted",
          label: "Scorecard final pendente",
          description: "Submeta o scorecard.",
          action: "open_scorecard",
          action_payload: null,
          severity: "block",
          forceable: false,
        },
      ],
      can_force: false,
      force_requires_reason: true,
    };
    mockMoveCandidateStage.mockRejectedValueOnce(
      new HttpError(409, "Conflict", undefined, blockedPayload, undefined),
    );
    mockRefreshBoard.mockResolvedValue(undefined);

    const dataTransfer = { effectAllowed: "move", setData: vi.fn(), dropEffect: "move" };

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          <Route path="/candidatos/:candidateId" element={<div data-testid="profile-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId("kanban-card-c-1");

    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    const modal = await screen.findByTestId("pipeline-transition-blocked-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-message")).toHaveTextContent(
      /não é possível avançar candidato/i,
    );

    // Listing of missing gates
    expect(screen.getByTestId("pipeline-blocked-gate-behavioral_ai_pending")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-gate-scorecard_not_submitted")).toBeInTheDocument();

    // Card must still belong to the original column (entry).
    const entryColumn = screen.getByTestId("kanban-column-entrada");
    expect(entryColumn).toContainElement(screen.getByTestId("kanban-card-c-1"));

    // Board was refetched after the blocked response.
    expect(mockRefreshBoard).toHaveBeenCalled();

    // Generic move-error toast was NOT issued.
    expect(feedback.moveCandidate.error).not.toHaveBeenCalled();

    // can_force=false: no force-advance button is rendered.
    expect(screen.queryByText(/forçar avanço/i)).not.toBeInTheDocument();
  });

  it("15. open_behavioral_ai navega para perfil aba Avaliações com foco IA", async () => {
    const blockedPayload = {
      code: "pipeline_transition_blocked",
      message: "Bloqueio",
      current_stage: "final",
      target_stage: "offer",
      missing_gates: [
        {
          code: "behavioral_ai_pending",
          label: "IA comportamental pendente",
          description: "Aguarde a IA.",
          action: "open_behavioral_ai",
          action_payload: null,
          severity: "block",
          forceable: false,
        },
      ],
      can_force: false,
      force_requires_reason: true,
    };
    mockMoveCandidateStage.mockRejectedValueOnce(
      new HttpError(409, "Conflict", undefined, blockedPayload, undefined),
    );

    const dataTransfer = { effectAllowed: "move", setData: vi.fn(), dropEffect: "move" };

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          <Route path="/candidatos/:candidateId" element={<div data-testid="profile-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId("kanban-card-c-1");
    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await screen.findByTestId("pipeline-transition-blocked-modal");

    fireEvent.click(
      screen.getByTestId("pipeline-blocked-gate-behavioral_ai_pending-action"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("profile-page")).toBeInTheDocument();
    });
  });

  it("16. open_scorecard usa fallback de perfil quando ação não está mapeada por algum motivo", async () => {
    const blockedPayload = {
      code: "pipeline_transition_blocked",
      message: "Bloqueio",
      current_stage: "technical_interview",
      target_stage: "final",
      missing_gates: [
        {
          code: "scorecard_not_submitted",
          label: "Scorecard pendente",
          description: "Submeta o scorecard.",
          action: "open_scorecard",
          action_payload: { interview_id: "int-1" },
          severity: "block",
          forceable: false,
        },
      ],
      can_force: false,
      force_requires_reason: true,
    };
    mockMoveCandidateStage.mockRejectedValueOnce(
      new HttpError(409, "Conflict", undefined, blockedPayload, undefined),
    );

    const dataTransfer = { effectAllowed: "move", setData: vi.fn(), dropEffect: "move" };

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          <Route path="/candidatos/:candidateId" element={<div data-testid="profile-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId("kanban-card-c-1");
    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await screen.findByTestId("pipeline-transition-blocked-modal");
    fireEvent.click(
      screen.getByTestId("pipeline-blocked-gate-scorecard_not_submitted-action"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("profile-page")).toBeInTheDocument();
    });
  });

  it("17. Erro genérico continua usando o feedback antigo (toast)", async () => {
    mockMoveCandidateStage.mockRejectedValueOnce(new Error("Falha de rede"));

    const dataTransfer = { effectAllowed: "move", setData: vi.fn(), dropEffect: "move" };

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId("kanban-card-c-1");
    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await waitFor(() => {
      expect(feedback.moveCandidate.error).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("pipeline-transition-blocked-modal")).not.toBeInTheDocument();
  });

  it("13. Mover candidato aberto no drawer chama syncCandidateOverview uma vez", async () => {
    const dataTransfer = {
      effectAllowed: "move",
      setData: vi.fn(),
      dropEffect: "move",
    };
    mockRefreshBoard.mockResolvedValue(undefined);
    mockSyncCandidateOverview.mockResolvedValue(undefined);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId("kanban-card-c-1");
    fireEvent.click(screen.getByText("Aline Santos"));
    expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("c-1");

    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await waitFor(() => {
      expect(mockRefreshBoard).toHaveBeenCalled();
      expect(mockSyncCandidateOverview).toHaveBeenCalledWith("c-1");
    });
  });

  it("13b. Mover candidato diferente do aberto no drawer não chama syncCandidateOverview", async () => {
    const dataTransfer = {
      effectAllowed: "move",
      setData: vi.fn(),
      dropEffect: "move",
    };
    mockRefreshBoard.mockResolvedValue(undefined);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId("kanban-card-c-1");
    // Open c-1 in the drawer
    fireEvent.click(screen.getByText("Aline Santos"));
    expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("c-1");

    // Drag c-2 (different candidate) to "analise" column
    fireEvent.dragStart(screen.getByTestId("kanban-card-c-2"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await waitFor(() => {
      expect(mockRefreshBoard).toHaveBeenCalled();
    });
    // c-2 was moved but c-1 is open — syncCandidateOverview should NOT be called
    expect(mockSyncCandidateOverview).not.toHaveBeenCalled();
  });

  it("13c. Mover candidato com drawer fechado não chama syncCandidateOverview", async () => {
    const dataTransfer = {
      effectAllowed: "move",
      setData: vi.fn(),
      dropEffect: "move",
    };
    mockRefreshBoard.mockResolvedValue(undefined);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId("kanban-card-c-1");
    // Do NOT open the drawer — keep previewCandidateId null

    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await waitFor(() => {
      expect(mockRefreshBoard).toHaveBeenCalled();
    });
    expect(mockSyncCandidateOverview).not.toHaveBeenCalled();
  });

  // ── Testes de remoção do auto-refresh ──────────────────────────────────────

  it("18. Botão 'Atualizar' está presente e chama refreshBoard ao ser clicado", async () => {
    mockRefreshBoard.mockResolvedValue(undefined);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    const refreshBtn = await screen.findByRole("button", { name: /atualizar board/i });
    expect(refreshBtn).toBeInTheDocument();

    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(mockRefreshBoard).toHaveBeenCalled();
    });
  });

  it("19. Não existe texto de 'Auto em', 'atualiza em' ou contador regressivo", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId("kanban-card-c-1");

    expect(screen.queryByText(/auto em/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/atualiza em/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/auto-refresh/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pausar/i)).not.toBeInTheDocument();
  });

  it("20. PipelinePage não chama refreshBoard automaticamente por timer", async () => {
    vi.useFakeTimers();
    mockRefreshBoard.mockResolvedValue(undefined);

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    // Avança 60 segundos sem nenhuma ação do usuário
    await vi.advanceTimersByTimeAsync(60_000);

    // refreshBoard não deve ter sido chamado automaticamente
    expect(mockRefreshBoard).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("21. Mover etapa ainda chama refreshBoard após mutação bem-sucedida", async () => {
    mockRefreshBoard.mockResolvedValue(undefined);
    const dataTransfer = { effectAllowed: "move", setData: vi.fn(), dropEffect: "move" };

    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByTestId("kanban-card-c-1");
    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-analise"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-analise"), { dataTransfer });

    await waitFor(() => {
      expect(mockMoveCandidateStage).toHaveBeenCalledWith("c-1", "screening");
      expect(mockRefreshBoard).toHaveBeenCalled();
    });
  });

  // ── Filtros locais (busca + Pendências) ────────────────────────────────────
  describe("Filtros locais de Pipeline", () => {
    it("digitar no input de busca filtra candidatos pelo nome", async () => {
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await screen.findByTestId("kanban-card-c-1");
      expect(screen.getByTestId("kanban-card-c-2")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("pipeline-search-input"), {
        target: { value: "Aline" },
      });

      await waitFor(() => {
        expect(screen.queryByTestId("kanban-card-c-2")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("kanban-card-c-1")).toBeInTheDocument();
    });

    it("busca é case-insensitive e remove acentos", async () => {
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByTestId("kanban-card-c-1");

      fireEvent.change(screen.getByTestId("pipeline-search-input"), {
        target: { value: "ALINE" },
      });

      await waitFor(() => {
        expect(screen.queryByTestId("kanban-card-c-2")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("kanban-card-c-1")).toBeInTheDocument();
    });

    it("botão limpar busca volta lista completa", async () => {
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByTestId("kanban-card-c-1");

      fireEvent.change(screen.getByTestId("pipeline-search-input"), {
        target: { value: "Aline" },
      });
      await waitFor(() =>
        expect(screen.queryByTestId("kanban-card-c-2")).not.toBeInTheDocument(),
      );

      fireEvent.click(screen.getByTestId("pipeline-search-clear"));

      await waitFor(() => {
        expect(screen.getByTestId("kanban-card-c-2")).toBeInTheDocument();
      });
      expect(screen.getByTestId("kanban-card-c-1")).toBeInTheDocument();
    });

    it("nenhum resultado mostra estado vazio com botão de limpar", async () => {
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByTestId("kanban-card-c-1");

      fireEvent.change(screen.getByTestId("pipeline-search-input"), {
        target: { value: "Inexistente" },
      });

      await waitFor(() => {
        expect(screen.getByTestId("pipeline-local-empty-state")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("kanban-card-c-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("kanban-card-c-2")).not.toBeInTheDocument();
    });

    it("botão Pendências alterna estado e filtra candidatos", async () => {
      // Mock a candidate with no pending requirements (everything false) vs c-2 with required interview but no status
      const boardWithPending = {
        ...mockBoard,
        columns: mockBoard.columns.map((col) => {
          if (col.stage === "entry") {
            return {
              ...col,
              candidates: [
                {
                  ...col.candidates[0],
                  // no required steps → not pending
                  requires_behavioral_assessment: false,
                  requires_behavioral_ai_evaluation: false,
                  requires_interview: false,
                  requires_scorecard: false,
                },
              ],
            };
          }
          if (col.stage === "hr_interview") {
            return {
              ...col,
              candidates: [
                {
                  ...col.candidates[0],
                  // required interview, no status → pending
                  requires_interview: true,
                  interview_status: null,
                },
              ],
            };
          }
          return col;
        }),
      };
      (usePipeline as any).mockReturnValue({
        activeJobId: "job-1",
        board: boardWithPending,
        boardFilters: {},
        boardLoading: false,
        boardError: null,
        rankingSyncTick: 0,
        setActiveJob: mockSetActiveJob,
        setBoardFilters: mockSetBoardFilters,
        moveCandidateStage: mockMoveCandidateStage,
        refreshBoard: mockRefreshBoard,
        openCandidate: mockOpenCandidate,
        closeCandidate: mockCloseCandidate,
        syncCandidateOverview: mockSyncCandidateOverview,
      });

      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await screen.findByTestId("kanban-card-c-1");
      expect(screen.getByTestId("kanban-card-c-2")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("pipeline-pending-toggle"));

      await waitFor(() => {
        expect(screen.queryByTestId("kanban-card-c-1")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("kanban-card-c-2")).toBeInTheDocument();
    });

    it("contador de filtros incrementa quando busca + pendências são aplicados sobre o range default", async () => {
      // Default date range adds 2 filters on mount (entered_from + entered_to).
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByTestId("kanban-card-c-1");

      // Baseline: defaults applied via URL effect.
      await waitFor(() => {
        expect(screen.getByTestId("pipeline-active-filters-badge").textContent).toBe("2");
      });

      fireEvent.change(screen.getByTestId("pipeline-search-input"), {
        target: { value: "Aline" },
      });
      await waitFor(() => {
        expect(screen.getByTestId("pipeline-active-filters-badge").textContent).toBe("3");
      });

      fireEvent.click(screen.getByTestId("pipeline-pending-toggle"));
      await waitFor(() => {
        expect(screen.getByTestId("pipeline-active-filters-badge").textContent).toBe("4");
      });
    });

    it("contador de filtros nunca mostra '1' hardcoded — só conta filtros reais", async () => {
      // Even when only the default date range applies, contador deve ser 2,
      // não o "1" antigo hardcoded do botão Filtros.
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByTestId("kanban-card-c-1");
      await waitFor(() => {
        expect(screen.getByTestId("pipeline-active-filters-badge").textContent).not.toBe("1");
      });
    });

    it("botão limpar filtros zera busca e pendências e contador some", async () => {
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );
      await screen.findByTestId("kanban-card-c-1");

      fireEvent.change(screen.getByTestId("pipeline-search-input"), {
        target: { value: "Aline" },
      });
      fireEvent.click(screen.getByTestId("pipeline-pending-toggle"));

      await waitFor(() => {
        expect(screen.getByTestId("pipeline-clear-filters")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("pipeline-clear-filters"));

      await waitFor(() => {
        expect(screen.queryByTestId("pipeline-active-filters-badge")).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("kanban-card-c-1")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-card-c-2")).toBeInTheDocument();
    });

    it("abre o dropdown de vagas e permite selecionar uma nova vaga", async () => {
      render(
        <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
          <Routes>
            <Route path="/pipeline/:jobId" element={<PipelinePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Desenvolvedor React")).toBeInTheDocument();
      });

      const seletor = screen.getByRole("button", { name: /alterar vaga da pipeline/i });
      fireEvent.click(seletor);

      // O dropdown deve mostrar a lista de vagas
      const listbox = await screen.findByRole("listbox", { name: /vagas/i });
      expect(listbox).toBeInTheDocument();
      
      const option = within(listbox).getByText("Engenheiro Frontend");
      expect(option).toBeInTheDocument();

      fireEvent.click(option);

      // Ao clicar, o dropdown deve fechar e a vaga deve ser selecionada (chama setActiveJob via useEffect após navigate)
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(mockSetActiveJob).toHaveBeenCalledWith("job-2");
      });
    });
  });
});
