import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidatesService } from "../../../../services/candidatesService";
import type { CandidateOverview } from "../../../../types/domain";
import { CandidatePreviewDrawer } from "../CandidatePreviewDrawer";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../../../services/candidatesService", () => ({
  candidatesService: {
    getOverview: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

const baseOverview: CandidateOverview = {
  candidate: {
    id: "candidate-1",
    full_name: "Ana Souza",
    email: "ana@example.com",
    phone: "(11) 99999-9999",
    cpf: null,
    application_source: null,
    location_city: "São Paulo",
    location_state: "SP",
    location_country: "BR",
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
    internal_notes: null,
    tags: [],
    user_id: null,
    created_by: "user-1",
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
  },
  resumes: [
    {
      resume_id: "resume-1",
      title: "Currículo Ana",
      status: "active",
      current_version: 1,
      current_version_id: "version-1",
      current_file_name: "ana.pdf",
      extraction_status: "completed",
      updated_at: "2026-05-12T10:00:00Z",
    },
  ],
  latest_analysis: {
    analysis_id: "analysis-1",
    job_id: "job-1",
    resume_id: "resume-1",
    resume_title: "Currículo Ana",
    status: "completed",
    started_at: null,
    completed_at: "2026-05-12T10:00:00Z",
    failed_at: null,
    failure_reason: null,
    used_real_ai: true,
    task_id: null,
    worker_id: null,
    seniority_level: "pleno",
    total_experience_years: 4,
    created_at: "2026-05-12T09:00:00Z",
    updated_at: "2026-05-12T10:00:00Z",
  },
  latest_analysis_pipeline: null,
  top_matches: [
    {
      analysis_id: "analysis-1",
      job_id: "job-1",
      job_title: "Analista Protheus",
      job_status: "published",
      job_fit_score: 0.82,
      recommendation: "interview",
      seniority_level: "pleno",
      total_experience_years: 4,
      created_at: "2026-05-12T10:00:00Z",
    },
  ],
  active_job_id: "job-1",
  active_job: {
    id: "job-1",
    title: "Analista Protheus",
    status: "published",
  },
  pipeline_entries: [
    {
      candidate_id: "candidate-1",
      job_id: "job-1",
      job_title: "Analista Protheus",
      stage: "screening",
      relationship_status: "active",
      is_terminal: false,
      terminated_at: null,
      termination_reason: null,
      candidate_status: "Em análise",
      updated_at: "2026-05-15T10:00:00Z",
    },
  ],
  active_job_decision: {
    score_status: "score_ready",
    analysis_status: "completed",
    current_analysis_id: "analysis-1",
    match_score: 0.82,
    warnings: [],
    next_action: "review_candidate",
  },
  active_job_skill_preview: {
    matched_skills: ["Protheus", "SQL", "Atendimento"],
    attention_points: ["ADVPL", "Experiência contábil"],
  },
  active_job_score_dimensions: {
    skills: 0,
    experience: 50,
    seniority: 41,
    education: 50,
    confidence: 30,
  },
  latest_note: {
    note_text: "Boa comunicação na triagem.",
    created_at: "2026-05-16T10:00:00Z",
  },
  preview_pendencies: [
    { id: "behavioral_assignment", label: "Teste comportamental pendente", tone: "warning" },
    { id: "interview", label: "Entrevista não agendada", tone: "warning" },
  ],
  latest_movement: {
    event_type: "stage_moved",
    to_stage: "screening",
    actor_name: "Juliana",
    moved_at: "2026-05-16T10:00:00Z",
  },
};

function mockOverview(override: Partial<CandidateOverview> = {}) {
  vi.mocked(candidatesService.getOverview).mockResolvedValue({
    ...baseOverview,
    ...override,
  });
}

function renderDrawer(onClose = vi.fn()) {
  render(
    <MemoryRouter future={routerFuture}>
      <CandidatePreviewDrawer candidateId="candidate-1" onClose={onClose} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return onClose;
}

describe("CandidatePreviewDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza bloco Skills da vaga quando há dados", async () => {
    mockOverview();
    renderDrawer();

    expect(await screen.findByText("Skills da vaga")).toBeInTheDocument();
    const matched = screen.getByTestId("preview-matched-skills");
    expect(within(matched).getByText("Protheus")).toBeInTheDocument();
    expect(within(matched).getByText("SQL")).toBeInTheDocument();
    expect(within(matched).getByText("Atendimento")).toBeInTheDocument();
    const attention = screen.getByTestId("preview-attention-skills");
    expect(within(attention).getByText("ADVPL")).toBeInTheDocument();
    expect(within(attention).getByText("Experiência contábil")).toBeInTheDocument();
  });

  it("mostra fallback quando skills ainda não estão disponíveis", async () => {
    mockOverview({ active_job_skill_preview: null });
    renderDrawer();

    expect(await screen.findByText("Skills ainda não disponíveis.")).toBeInTheDocument();
  });

  it("renderiza card de Dimensões com percentuais e barras", async () => {
    mockOverview();
    renderDrawer();

    const section = await screen.findByTestId("preview-score-dimensions");
    expect(within(section).getByText("Dimensões")).toBeInTheDocument();
    expect(within(section).getByText("Skills")).toBeInTheDocument();
    expect(within(section).getByText("Experiência")).toBeInTheDocument();
    expect(within(section).getByText("Senioridade")).toBeInTheDocument();
    expect(within(section).getByText("Educação")).toBeInTheDocument();
    expect(within(section).getByText("Confiança")).toBeInTheDocument();
    expect(within(section).getByText("0%")).toBeInTheDocument();
    expect(within(section).getAllByText("50%")).toHaveLength(2);
    expect(within(section).getByText("41%")).toBeInTheDocument();
    expect(within(section).getByText("30%")).toBeInTheDocument();

    expect(screen.getByTestId("preview-dimension-bar-skills")).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId("preview-dimension-bar-experience")).toHaveStyle({ width: "50%" });
    expect(screen.getByTestId("preview-dimension-bar-seniority")).toHaveStyle({ width: "41%" });
    expect(screen.getByTestId("preview-dimension-bar-education")).toHaveStyle({ width: "50%" });
    expect(screen.getByTestId("preview-dimension-bar-confidence")).toHaveStyle({ width: "30%" });
  });

  it("mostra fallback quando dimensões não estão disponíveis", async () => {
    mockOverview({ active_job_score_dimensions: null });
    renderDrawer();

    expect(await screen.findByText("Dimensões ainda não disponíveis.")).toBeInTheDocument();
  });

  it("não usa dimensões de análise antiga", async () => {
    mockOverview({
      active_job_decision: {
        ...baseOverview.active_job_decision,
        current_analysis_id: "analysis-active",
      },
      latest_analysis: {
        ...baseOverview.latest_analysis,
        analysis_id: "analysis-old",
      },
      active_job_score_dimensions: null,
    });
    renderDrawer();

    expect(await screen.findByText("Dimensões ainda não disponíveis.")).toBeInTheDocument();
  });

  it("mostra botão Ver currículo quando há currículo", async () => {
    mockOverview();
    renderDrawer();

    expect(await screen.findByRole("button", { name: /Ver currículo/i })).toBeInTheDocument();
  });

  it("não mostra botão Ver currículo quando não há currículo", async () => {
    mockOverview({ resumes: [] });
    renderDrawer();

    expect(await screen.findByText("Currículo não enviado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver currículo/i })).not.toBeInTheDocument();
  });

  it("navega para documentos ao clicar Ver currículo mesmo quando há URL direta", async () => {
    const user = userEvent.setup();
    mockOverview({
      resumes: [
        {
          ...baseOverview.resumes[0],
          resume_url: "https://example.com/resume.pdf",
        },
      ],
    });
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: /Ver currículo/i }));

    expect(screen.getByTestId("location")).toHaveTextContent("/candidatos/candidate-1?tab=documents");
  });

  it("navega para documentos ao clicar Ver currículo sem URL direta", async () => {
    const user = userEvent.setup();
    mockOverview();
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: /Ver currículo/i }));

    expect(screen.getByTestId("location")).toHaveTextContent("/candidatos/candidate-1?tab=documents");
  });

  it("mostra pendências principais", async () => {
    mockOverview();
    renderDrawer();

    const section = await screen.findByTestId("preview-pendencies");
    expect(within(section).getByText("Teste comportamental pendente")).toBeInTheDocument();
    expect(within(section).getByText("Entrevista não agendada")).toBeInTheDocument();
  });

  it("mostra Nenhuma pendência quando vazio", async () => {
    mockOverview({ preview_pendencies: [] });
    renderDrawer();

    expect(await screen.findByText("Nenhuma pendência.")).toBeInTheDocument();
  });

  it("mostra última movimentação quando disponível", async () => {
    mockOverview();
    renderDrawer();

    const section = await screen.findByTestId("preview-latest-movement");
    expect(within(section).getByText(/Movido para Triagem por Juliana/)).toBeInTheDocument();
  });

  it("mostra fallback quando não há movimentação", async () => {
    mockOverview({ latest_movement: null });
    renderDrawer();

    expect(await screen.findByText("Nenhuma movimentação recente.")).toBeInTheDocument();
  });

  it("continua não renderizando abas", async () => {
    mockOverview();
    renderDrawer();

    expect(await screen.findByTestId("preview-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("continua navegando para o perfil completo", async () => {
    const user = userEvent.setup();
    mockOverview();
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: "Abrir perfil completo" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/candidatos/candidate-1");
  });

  it("continua fechando por X, backdrop e footer", async () => {
    const user = userEvent.setup();
    mockOverview();
    const onClose = renderDrawer();

    await user.click(await screen.findByTestId("preview-close"));
    await user.click(screen.getByTestId("preview-backdrop"));
    await user.click(screen.getByTestId("preview-close-action"));

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
