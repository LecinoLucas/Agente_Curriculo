import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PipelinePage } from "../PipelinePage";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { pipelineService } from "../../services/pipelineService";
import { getJobRanking } from "../../services/jobsService";
import { HttpError } from "../../services/http";
import { feedback } from "../../services/feedback";
import "@testing-library/jest-dom";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

// Mock the usePipeline hook
vi.mock("../../features/pipeline/PipelineContext", () => ({
  usePipeline: vi.fn(),
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
  CandidateSearchModal: () => <div data-testid="candidate-search-modal" />,
}));

vi.mock("../../features/candidates/components/CandidatePreviewDrawer", () => ({
  CandidatePreviewDrawer: ({
    candidateId,
    refreshToken,
  }: {
    candidateId: string | null;
    refreshToken?: number;
  }) =>
    candidateId ? (
      <div data-testid="candidate-preview-drawer">
        {candidateId}:{refreshToken ?? 0}
      </div>
    ) : null,
}));

describe("PipelinePage", () => {
  const mockSetActiveJob = vi.fn();
  const mockRefreshBoard = vi.fn();
  const mockMoveCandidateStage = vi.fn();

  const mockJobs = [
    {
      id: "job-1",
      title: "Desenvolvedor React",
      status: "published",
      seniority_level: "senior",
      work_model: "remote",
      location: "São Paulo",
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
        stage: "rejected",
        label: "Desclassificado",
        candidates: [],
      },
    ],
  };

  const mockRanking = {
    total_candidates: 2,
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
      boardLoading: false,
      boardError: null,
      rankingSyncTick: 0,
      setActiveJob: mockSetActiveJob,
      moveCandidateStage: mockMoveCandidateStage,
      refreshBoard: mockRefreshBoard,
    });
  });

  it("1. Renderiza o título 'Pipeline'", async () => {
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

  it("2. Renderiza o breadcrumb 'Recrutamento > Pipeline'", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Recrutamento")).toBeInTheDocument();
      expect(screen.getByText("Pipeline", { selector: "span" })).toBeInTheDocument();
    });
  });

  it("3. Remove busca/filtros da barra e mantém atalho de lupa + vincular", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/buscar candidato/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Filtros/i })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Vincular candidato/i }).length).toBeGreaterThan(0);
    });
  });

  it("4. Renderiza os cards de KPI (total, em andamento, entrevistas, contratados)", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Total de Candidatos")).toBeInTheDocument();
      expect(screen.getByText("Em andamento")).toBeInTheDocument();
      expect(screen.getByText("Entrevistas")).toBeInTheDocument();
      expect(screen.getByText("Contratações")).toBeInTheDocument();
    });

    // Check calculated dynamic KPI values based on mockBoard (total: 2, emAndamento: 2, entrevistas: 1, contratados: 0)
    expect(screen.getAllByText("2")[0]).toBeInTheDocument(); // total
  });

  it("5. Renderiza a lista horizontal de colunas do Kanban", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("kanban-column-entry")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-screening")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-hr_interview")).toBeInTheDocument();
      expect(screen.getByTestId("kanban-column-technical_interview")).toBeInTheDocument();
    });
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
  });

  it("7. Coluna vazia exibe a mensagem 'Vazio'", async () => {
    render(
      <MemoryRouter future={routerFuture} initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      // screening column is empty and should display "Vazio"
      const emptyStates = screen.getAllByText("Vazio");
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
      expect(screen.getByTestId("kanban-column-screening")).toBeInTheDocument();
    });

    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-screening"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-screening"), { dataTransfer });

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
    fireEvent.dragOver(screen.getByTestId("kanban-column-screening"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-screening"), { dataTransfer });

    const modal = await screen.findByTestId("pipeline-transition-blocked-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-message")).toHaveTextContent(
      /não é possível avançar candidato/i,
    );

    // Listing of missing gates
    expect(screen.getByTestId("pipeline-blocked-gate-behavioral_ai_pending")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-gate-scorecard_not_submitted")).toBeInTheDocument();

    // Card must still belong to the original column (entry).
    const entryColumn = screen.getByTestId("kanban-column-entry");
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
    fireEvent.dragOver(screen.getByTestId("kanban-column-screening"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-screening"), { dataTransfer });

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
    fireEvent.dragOver(screen.getByTestId("kanban-column-screening"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-screening"), { dataTransfer });

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
    fireEvent.dragOver(screen.getByTestId("kanban-column-screening"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-screening"), { dataTransfer });

    await waitFor(() => {
      expect(feedback.moveCandidate.error).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("pipeline-transition-blocked-modal")).not.toBeInTheDocument();
  });

  it("13. Mover candidato atualiza Kanban e força refresh do drawer aberto", async () => {
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
    fireEvent.click(screen.getByText("Aline Santos"));
    expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("c-1:0");

    fireEvent.dragStart(screen.getByTestId("kanban-card-c-1"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("kanban-column-screening"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("kanban-column-screening"), { dataTransfer });

    await waitFor(() => {
      expect(mockRefreshBoard).toHaveBeenCalled();
      expect(screen.getByTestId("candidate-preview-drawer")).toHaveTextContent("c-1:1");
    });
  });
});
