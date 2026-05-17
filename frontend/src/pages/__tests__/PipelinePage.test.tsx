import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PipelinePage } from "../PipelinePage";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { pipelineService } from "../../services/pipelineService";
import { getJobRanking } from "../../services/jobsService";
import "@testing-library/jest-dom";

// Mock the usePipeline hook
vi.mock("../../features/pipeline/PipelineContext", () => ({
  usePipeline: vi.fn(),
}));

// Mock services
vi.mock("../../services/pipelineService", () => ({
  pipelineService: {
    listPipelineJobs: vi.fn(),
  },
}));

vi.mock("../../services/jobsService", () => ({
  getJobRanking: vi.fn(),
}));

// Mock child modals/drawers to keep test output clean and isolated
vi.mock("../../features/pipeline/NewCandidateModal", () => ({
  NewCandidateModal: () => <div data-testid="new-candidate-modal" />,
}));

vi.mock("../../features/pipeline/CandidateSearchModal", () => ({
  CandidateSearchModal: () => <div data-testid="candidate-search-modal" />,
}));

vi.mock("../../features/pipeline/CandidateDrawer", () => ({
  CandidateDrawer: () => <div data-testid="candidate-drawer" />,
}));

describe("PipelinePage", () => {
  const mockSetActiveJob = vi.fn();
  const mockRefreshBoard = vi.fn();
  const mockOpenCandidate = vi.fn();

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
    (usePipeline as any).mockReturnValue({
      activeJobId: "job-1",
      board: mockBoard,
      boardLoading: false,
      boardError: null,
      rankingSyncTick: 0,
      selectedCandidateId: null,
      setActiveJob: mockSetActiveJob,
      refreshBoard: mockRefreshBoard,
      openCandidate: mockOpenCandidate,
    });
  });

  it("1. Renderiza o título 'Pipeline'", async () => {
    render(
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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

  it("3. Renderiza a barra de buscas e filtros integrados", async () => {
    render(
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Buscar candidato ou vaga...")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Filtros/i })).toBeInTheDocument();
    });
  });

  it("4. Renderiza os cards de KPI (total, em andamento, entrevistas, contratados)", async () => {
    render(
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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

  it("8. Clicar em um card de candidato chama openCandidate", async () => {
    render(
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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

    expect(mockOpenCandidate).toHaveBeenCalledWith("c-1");
  });

  it("9. Permite buscar candidatos pelo campo de busca dinâmico", async () => {
    render(
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
        <Routes>
          <Route path="/pipeline/:jobId" element={<PipelinePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Aline Santos")).toBeInTheDocument();
      expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Buscar candidato ou vaga...");
    fireEvent.change(searchInput, { target: { value: "Aline" } });

    // "Aline Santos" should stay, but "Bruno Lima" should be filtered out
    expect(screen.getByText("Aline Santos")).toBeInTheDocument();
    expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument();
  });

  it("10. Renderiza banner com erro se a busca de vagas falhar", async () => {
    (pipelineService.listPipelineJobs as any).mockRejectedValue(new Error("Erro de rede"));
    
    render(
      <MemoryRouter initialEntries={["/pipeline/job-1"]}>
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
});
