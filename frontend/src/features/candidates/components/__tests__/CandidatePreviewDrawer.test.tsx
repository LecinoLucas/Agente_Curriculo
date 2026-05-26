import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pipelineService } from "../../../../services/pipelineService";
import { toast } from "../../../../shared/utils/toast";
import type { CandidateOverview } from "../../../../types/domain";
import type { PipelineContextValue } from "../../../../features/pipeline/PipelineContext";
import { usePipeline } from "../../../../features/pipeline/PipelineContext";
import { CandidatePreviewDrawer } from "../CandidatePreviewDrawer";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../../../features/pipeline/PipelineContext", () => ({
  usePipeline: vi.fn(),
}));

vi.mock("../../../../services/pipelineService", async () => {
  const actual = await vi.importActual<typeof import("../../../../services/pipelineService")>(
    "../../../../services/pipelineService",
  );
  return {
    ...actual,
    pipelineService: {
      moveCandidateStage: vi.fn(),
      schedulePipelineInterview: vi.fn(),
    },
  };
});

vi.mock("../../../../services/agendaService", () => ({
  agendaService: {
    getGoogleCalendarStatus: vi.fn().mockResolvedValue({ connected: false }),
  },
}));

vi.mock("../../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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

const mockRefreshCandidateOverview = vi.fn().mockResolvedValue(undefined);

function createMockContext(override: Partial<PipelineContextValue> = {}): PipelineContextValue {
  return {
    jobs: [],
    jobsLoading: false,
    jobsError: null,
    activeJobId: null,
    board: null,
    boardLoading: false,
    boardError: null,
    selectedCandidateId: "candidate-1",
    candidateOverview: null,
    candidateLoading: false,
    candidateError: null,
    activePanelTab: "summary",
    pollingAnalysisId: null,
    pollingStatus: null,
    candidatesSyncTick: 0,
    analysesSyncTick: 0,
    rankingSyncTick: 0,
    loadJobs: vi.fn(),
    invalidateJobs: vi.fn(),
    setActiveJob: vi.fn(),
    refreshBoard: vi.fn(),
    invalidateBoard: vi.fn(),
    openCandidate: vi.fn(),
    closeCandidate: vi.fn(),
    switchPanelTab: vi.fn(),
    refreshCandidateOverview: mockRefreshCandidateOverview,
    syncCandidateOverview: vi.fn(),
    invalidateCandidateOverview: vi.fn(),
    invalidateCandidate: vi.fn(),
    patchCandidate: vi.fn(),
    moveCandidateStage: vi.fn(),
    setCandidateAiStatus: vi.fn(),
    syncAnalysisStart: vi.fn(),
    ensureAnalysisMatch: vi.fn(),
    notifyCandidatesChanged: vi.fn(),
    notifyAnalysesChanged: vi.fn(),
    invalidateJobState: vi.fn(),
    invalidateRanking: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    ...override,
  } as PipelineContextValue;
}

function mockOverview(override: Partial<CandidateOverview> = {}) {
  vi.mocked(usePipeline).mockReturnValue(
    createMockContext({
      candidateOverview: { ...baseOverview, ...override },
      candidateLoading: false,
      candidateError: null,
    }),
  );
}

function renderDrawer(onClose = vi.fn(), onPipelineChanged?: () => Promise<void> | void) {
  render(
    <MemoryRouter future={routerFuture}>
      <CandidatePreviewDrawer
        candidateId="candidate-1"
        onClose={onClose}
        onPipelineChanged={onPipelineChanged}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
  return onClose;
}

describe("CandidatePreviewDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshCandidateOverview.mockResolvedValue(undefined);
    vi.mocked(pipelineService.moveCandidateStage).mockResolvedValue({
      candidate_id: "candidate-1",
      job_id: "job-1",
      stage: "hr_interview",
      candidate_status: "Em processo",
      status: "active",
      transition_id: "transition-1",
      updated_at: "2026-05-16T10:00:00Z",
    });
    vi.mocked(pipelineService.schedulePipelineInterview).mockResolvedValue({
      id: "interview-1",
      candidate_id: "candidate-1",
      candidate_name: "Ana Souza",
      job_id: "job-1",
      job_title: "Analista Protheus",
      title: "Entrevista com candidato",
      description: null,
      public_notes: null,
      internal_notes: null,
      scheduled_start: "2099-01-01T12:00:00.000Z",
      scheduled_end: "2099-01-01T13:00:00.000Z",
      timezone: "America/Sao_Paulo",
      interview_type: "hr",
      interview_format: "online",
      status: "scheduled",
      location: null,
      meeting_url: null,
      interviewer_name: null,
      interviewer_email: null,
      cancel_reason: null,
      calendar_provider: null,
      calendar_sync_status: "not_synced",
      calendar_sync_error: null,
      external_calendar_event_id: null,
      external_calendar_html_link: null,
      meeting_provider: null,
      created_at: "2026-05-16T10:00:00Z",
      updated_at: "2026-05-16T10:00:00Z",
    });
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

  it("mostra aviso discreto quando análise IA está em andamento", async () => {
    mockOverview({
      active_job_decision: {
        ...baseOverview.active_job_decision,
        score_status: "analysis_processing",
        analysis_status: "processing",
        match_score: null,
      },
      top_matches: [],
    });
    renderDrawer();

    expect(await screen.findByTestId("preview-ai-processing-notice")).toHaveTextContent(
      "Análise IA em andamento. O ranking será atualizado automaticamente.",
    );
    expect(screen.getByText("Aguardando IA")).toBeInTheDocument();
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

  it("abre agendamento ao avançar para entrevista e permite mover sem agendar", async () => {
    const user = userEvent.setup();
    const onPipelineChanged = vi.fn().mockResolvedValue(undefined);
    mockOverview();
    renderDrawer(vi.fn(), onPipelineChanged);

    await user.click(await screen.findByRole("button", { name: /Avançar para fase Entrevista RH/i }));

    expect(await screen.findByRole("dialog", { name: /Agendar entrevista/i })).toBeInTheDocument();
    expect(pipelineService.moveCandidateStage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Mover sem agendar/i }));

    expect(pipelineService.moveCandidateStage).toHaveBeenCalledWith("job-1", "candidate-1", {
      stage: "hr_interview",
      notes: null,
      reason: "Avanço pelo preview da pipeline.",
    });
    await waitFor(() => {
      expect(onPipelineChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("agenda entrevista pelo preview e sincroniza a pipeline", async () => {
    const user = userEvent.setup();
    const onPipelineChanged = vi.fn().mockResolvedValue(undefined);
    mockOverview();
    renderDrawer(vi.fn(), onPipelineChanged);

    await user.click(await screen.findByRole("button", { name: /Avançar para fase Entrevista RH/i }));
    await user.clear(await screen.findByLabelText("Data"));
    await user.type(screen.getByLabelText("Data"), "2099-01-01");
    await user.click(screen.getByRole("button", { name: /^Agendar entrevista$/i }));

    expect(pipelineService.schedulePipelineInterview).toHaveBeenCalledWith(
      "job-1",
      "candidate-1",
      expect.objectContaining({
        interview_type: "hr",
        timezone: "America/Sao_Paulo",
        title: "Entrevista com candidato",
      }),
    );
    await waitFor(() => {
      expect(onPipelineChanged).toHaveBeenCalledTimes(1);
    });
  });

  it("abre PipelineTransitionBlockedModal e não mostra toast genérico quando backend retorna 409 estruturado", async () => {
    const user = userEvent.setup();
    const blockedPayload = {
      code: "pipeline_transition_blocked",
      message: "Não é possível avançar candidato para esta etapa.",
      current_stage: "technical_interview",
      target_stage: "final",
      missing_gates: [
        {
          code: "scorecard_not_submitted",
          label: "Scorecard final pendente",
          description: "Submeta o scorecard.",
          action: "open_scorecard",
          action_payload: null,
          severity: "block",
          forceable: false,
        },
        {
          code: "exotic_gate",
          label: "Pendência exótica",
          description: "Backend introduziu uma ação nova.",
          action: "open_brand_new_thing",
          action_payload: null,
          severity: "block",
          forceable: false,
        },
      ],
      can_force: false,
      force_requires_reason: true,
    };
    vi.mocked(pipelineService.moveCandidateStage).mockRejectedValueOnce(
      new (await import("../../../../services/http")).HttpError(409, "Conflict", undefined, blockedPayload, undefined),
    );

    mockOverview({
      pipeline_entries: [
        {
          ...baseOverview.pipeline_entries[0],
          stage: "technical_interview",
          candidate_status: "Entrevista Técnica",
        },
      ],
    });
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: /Avançar para fase Final/i }));

    const modal = await screen.findByTestId("pipeline-transition-blocked-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-gate-scorecard_not_submitted")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-gate-exotic_gate")).toBeInTheDocument();
    expect(
      screen.getByTestId("pipeline-blocked-gate-exotic_gate-action"),
    ).toHaveTextContent(/abrir perfil/i);

    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(screen.queryByText(/forçar avanço/i)).not.toBeInTheDocument();
  });

  it("mantém avanço direto para etapa que não é entrevista", async () => {
    const user = userEvent.setup();
    mockOverview({
      pipeline_entries: [
        {
          ...baseOverview.pipeline_entries[0],
          stage: "technical_interview",
          candidate_status: "Entrevista Técnica",
        },
      ],
    });
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: /Avançar para fase Final/i }));

    expect(pipelineService.moveCandidateStage).toHaveBeenCalledWith("job-1", "candidate-1", {
      stage: "final",
      notes: null,
      reason: "Avanço pelo preview da pipeline.",
    });
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

  it("mostra atalho claro para pré-admissão quando candidato está contratado", async () => {
    const user = userEvent.setup();
    mockOverview({
      pipeline_entries: [
        {
          ...baseOverview.pipeline_entries[0],
          stage: "hired",
          relationship_status: "active",
          candidate_status: "Contratado",
        },
      ],
      preview_pendencies: [],
    });
    renderDrawer();

    const section = await screen.findByTestId("preview-pre-admission");
    expect(within(section).getByText("Pré-admissão")).toBeInTheDocument();

    await user.click(screen.getByTestId("preview-open-pre-admission"));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/candidatos/candidate-1?tab=pre_admission",
    );
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

  it("exibe esqueleto de loading quando candidateLoading é verdadeiro", () => {
    vi.mocked(usePipeline).mockReturnValue(
      createMockContext({ candidateOverview: null, candidateLoading: true, candidateError: null }),
    );
    renderDrawer();

    expect(screen.getByTestId("preview-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-name")).not.toBeInTheDocument();
  });

  it("exibe mensagem de erro e botão de retry quando o overview falha", async () => {
    vi.mocked(usePipeline).mockReturnValue(
      createMockContext({
        candidateOverview: null,
        candidateLoading: false,
        candidateError: "Falha ao carregar candidato.",
      }),
    );
    renderDrawer();

    expect(await screen.findByTestId("preview-error")).toBeInTheDocument();
    expect(screen.getByText("Falha ao carregar candidato.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it("chama refreshCandidateOverview ao clicar Tentar novamente", async () => {
    const user = userEvent.setup();
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(usePipeline).mockReturnValue(
      createMockContext({
        candidateOverview: null,
        candidateLoading: false,
        candidateError: "Falha ao carregar candidato.",
        refreshCandidateOverview: mockRefresh,
      }),
    );
    renderDrawer();

    await user.click(await screen.findByRole("button", { name: /tentar novamente/i }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
