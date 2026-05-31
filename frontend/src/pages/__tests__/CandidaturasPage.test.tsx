import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { CandidaturasPage } from "../CandidaturasPage";
import { candidatesService } from "../../services/candidatesService";
import { pipelineService } from "../../services/pipelineService";
import { candidaturasService } from "../../services/candidaturasService";

// ── Hoisted mock factories ─────────────────────────────────────────────────────

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({ user: { id: "user-1", role: "admin" as const } })),
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../../services/candidatesService", async () => {
  const actual = await vi.importActual<typeof import("../../services/candidatesService")>(
    "../../services/candidatesService",
  );
  return {
    ...actual,
    candidatesService: {
      ...actual.candidatesService,
      listSummaries: vi.fn(),
    },
  };
});

vi.mock("../../services/pipelineService", async () => {
  const actual = await vi.importActual<typeof import("../../services/pipelineService")>(
    "../../services/pipelineService",
  );
  return {
    ...actual,
    pipelineService: {
      ...actual.pipelineService,
      schedulePipelineInterview: vi.fn(),
      moveCandidateStage: vi.fn(),
    },
  };
});

vi.mock("../../services/candidaturasService", () => ({
  candidaturasService: {
    createManual: vi.fn(),
    importCSV: vi.fn(),
    buildCSVTemplate: vi.fn(() => "nome,email,telefone,vaga,observacao\n"),
  },
}));

vi.mock("../../services/jobsService", () => ({
  listJobs: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, page_size: 50, total_pages: 1 }),
}));

const listSummariesMock = vi.mocked(candidatesService.listSummaries);
const schedulePipelineInterviewMock = vi.mocked(pipelineService.schedulePipelineInterview);
const moveCandidateStageMock = vi.mocked(pipelineService.moveCandidateStage);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCandidate(
  overrides: Partial<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    active_job_id: string | null;
    active_job_title: string | null;
    active_job_stage: string | null;
    active_job_job_fit_score: number | null;
    ai_status: string | null;
    next_interview: {
      scheduled_start: string;
      scheduled_end: string;
      interview_type: string;
      interview_format: string;
    } | null;
  }> = {},
) {
  return {
    id: "cand-1",
    full_name: "Ana Silva",
    email: "ana@test.com",
    phone: "(11) 99999-0001",
    cpf: null,
    application_source: "manual",
    tags: [],
    created_at: new Date().toISOString(),
    archived_at: null,
    archive_reason: null,
    resume_count: 1,
    linked_job_count: 1,
    latest_job_id: "job-1",
    latest_job_title: "Frentista",
    latest_job_stage: "screening",
    latest_relationship_status: "active",
    active_job_id: "job-1",
    active_job_title: "Frentista",
    active_job_stage: "screening",
    active_job_job_fit_score: 85,
    ai_status: "completed",
    next_interview: null,
    ...overrides,
  };
}

function makePaginatedResponse(data: ReturnType<typeof makeCandidate>[]) {
  return { data, total: data.length, page: 1, page_size: 30, total_pages: 1 };
}

function makeInterviewResponse() {
  return {
    id: "interview-1",
    candidate_id: "cand-1",
    candidate_name: "Ana Silva",
    job_id: "job-1",
    job_title: "Frentista",
    scheduled_start: "2026-06-15T09:00:00.000Z",
    scheduled_end: "2026-06-15T10:00:00.000Z",
    timezone: "America/Sao_Paulo",
    status: "scheduled" as const,
    interview_type: "hr" as const,
    interview_format: "online" as const,
    title: "Entrevista RH — Ana Silva",
    location: null,
    meeting_url: null,
    public_notes: null,
    internal_notes: null,
    interviewer_name: null,
    interviewer_email: null,
    pipeline_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    google_event_id: null,
    google_meet_url: null,
    requested_by_user_id: "user-1",
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CandidaturasPage />
    </MemoryRouter>,
  );
}

async function openMoreActions(candidateId = "cand-1") {
  await waitFor(() => expect(screen.getByTestId(`action-more-${candidateId}`)).toBeInTheDocument());
  fireEvent.click(screen.getByTestId(`action-more-${candidateId}`));
  await waitFor(() => expect(screen.getByTestId(`actions-menu-${candidateId}`)).toBeInTheDocument());
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: "user-1", role: "admin" as const } });
  listSummariesMock.mockResolvedValue(makePaginatedResponse([makeCandidate()]));
  schedulePipelineInterviewMock.mockResolvedValue(makeInterviewResponse());
  moveCandidateStageMock.mockResolvedValue({
    candidate_id: "cand-1",
    job_id: "job-1",
    stage: "rejected",
    candidate_status: "Reprovado",
    status: "rejected",
    transition_id: "t-1",
    updated_at: new Date().toISOString(),
    required_action: null,
    pre_admission_case_id: null,
    analysis: null,
  });
});

// ── Existing core tests ───────────────────────────────────────────────────────

describe("CandidaturasPage — core", () => {
  it("renderiza a tela Candidaturas com heading e tabela", async () => {
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());

    expect(screen.getByRole("heading", { name: /candidaturas/i })).toBeInTheDocument();
    expect(screen.getByTestId("candidaturas-table")).toBeInTheDocument();
  });

  it("lista candidatos retornados pela API", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());
    expect(screen.getByText("ana@test.com")).toBeInTheDocument();
    expect(screen.getAllByText("Frentista").length).toBeGreaterThanOrEqual(1);
  });

  it("chama listSummaries com link_status_filter=with_active_job", async () => {
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());
    expect(listSummariesMock.mock.calls[0][2]).toMatchObject({ link_status_filter: "with_active_job" });
  });

  it("filtros aparecem: busca, vaga, atualizar e pipeline", async () => {
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());

    expect(screen.getByTestId("search-input")).toBeInTheDocument();
    expect(screen.getByTestId("job-filter")).toBeInTheDocument();
    expect(screen.getByTestId("refresh-button")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-link")).toBeInTheDocument();
  });

  it("score ≥ 80 mostra label curta de alta aderência", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: 85 })]),
    );
    renderPage();

    const row = await screen.findByTestId("row-cand-1");
    expect(within(row).getByText("Alta")).toBeInTheDocument();
  });

  it("score 60-79 mostra label curta de aderência média", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: 65 })]),
    );
    renderPage();

    const row = await screen.findByTestId("row-cand-1");
    expect(within(row).getByText("Média")).toBeInTheDocument();
  });

  it("score < 60 mostra label curta de baixa aderência", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: 40 })]),
    );
    renderPage();

    const row = await screen.findByTestId("row-cand-1");
    expect(within(row).getByText("Baixa")).toBeInTheDocument();
  });

  it("sem score mostra 'Aguardando IA'", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: null, ai_status: null })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("score-awaiting")).toBeInTheDocument());
  });

  it("botão Abrir perfil navega para /candidatos/:id", async () => {
    renderPage();

    await openMoreActions();

    fireEvent.click(screen.getByTestId("action-profile-cand-1"));
    expect(mockNavigate).toHaveBeenCalledWith("/candidatos/cand-1");
  });

  it("clicar em uma linha abre o drawer", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.getByTestId("candidatura-drawer")).toBeInTheDocument();
  });

  it("viewer não vê botão Marcar entrevista na tabela", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "viewer-1", role: "viewer" as const } });

    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());

    expect(screen.queryByTestId("action-interview-cand-1")).not.toBeInTheDocument();
  });

  it("viewer não vê Marcar entrevista nem Reprovar no drawer", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "viewer-1", role: "viewer" as const } });

    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.queryByTestId("drawer-schedule")).not.toBeInTheDocument();
    expect(screen.queryByTestId("drawer-reject")).not.toBeInTheDocument();
  });
});

// ── Phase 7 — Polimento visual e usabilidade ────────────────────────────────

describe("CandidaturasPage — Phase 7 UX", () => {
  it("mostra resumo operacional com contadores da lista visível", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([
        makeCandidate({ id: "cand-1", full_name: "Ana Silva", active_job_stage: "screening", active_job_job_fit_score: 85 }),
        makeCandidate({ id: "cand-2", full_name: "Bruno Costa", active_job_stage: "final", active_job_job_fit_score: 55 }),
        makeCandidate({ id: "cand-3", full_name: "Carla Souza", active_job_stage: "hr_interview", active_job_job_fit_score: 72 }),
        makeCandidate({ id: "cand-4", full_name: "Diego Lima", active_job_job_fit_score: null, ai_status: "pending" }),
      ]),
    );

    renderPage();

    expect(await screen.findByTestId("operational-summary-primary")).toHaveTextContent(
      "1 com alta aderência · 1 prontos para entrevista · 1 prontos para decisão",
    );
    expect(screen.getByTestId("operational-summary-secondary")).toHaveTextContent(
      "Atenção: 1 sem entrevista marcada · 1 aguardando ação",
    );
  });

  it("mostra próxima ação derivada dos dados da candidatura", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_stage: "screening", active_job_job_fit_score: 85 })]),
    );

    renderPage();

    const row = await screen.findByTestId("row-cand-1");
    expect(within(row).getAllByText("Marcar entrevista").length).toBeGreaterThan(0);
    expect(within(row).getByText("Alta aderência")).toBeInTheDocument();
  });

  it("mostra prioridade discreta de alta aderência e ação pendente", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([
        makeCandidate({ id: "cand-1", full_name: "Ana Silva", active_job_job_fit_score: 85 }),
        makeCandidate({ id: "cand-2", full_name: "Bruno Costa", active_job_job_fit_score: 65 }),
      ]),
    );

    renderPage();

    const highPriorityRow = await screen.findByTestId("row-cand-1");
    const pendingPriorityRow = await screen.findByTestId("row-cand-2");

    expect(within(highPriorityRow).getByTestId("candidate-priority")).toHaveTextContent("Alta aderência");
    expect(within(pendingPriorityRow).getByTestId("candidate-priority")).toHaveTextContent("Ação pendente");
  });

  it("ações destrutivas ficam separadas no drawer", async () => {
    renderPage();

    const row = await screen.findByTestId("row-cand-1");
    fireEvent.click(row);

    expect(screen.getByTestId("drawer-danger-actions")).toContainElement(screen.getByTestId("drawer-reject"));
  });

  it("mostra empty state quando não há candidatos", async () => {
    listSummariesMock.mockResolvedValue(makePaginatedResponse([]));

    renderPage();

    expect(await screen.findByTestId("empty-state")).toHaveTextContent(/nenhuma candidatura ativa/i);
  });

  it("mostra estado sem resultado quando a busca não retorna candidatos", async () => {
    listSummariesMock
      .mockResolvedValueOnce(makePaginatedResponse([makeCandidate()]))
      .mockResolvedValueOnce(makePaginatedResponse([]));

    renderPage();

    await screen.findByTestId("row-cand-1");
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "sem resultado" } });

    expect(await screen.findByTestId("filtered-empty-state")).toHaveTextContent(/nenhum resultado/i);
  });

  it("drawer mostra resumo e próxima ação", async () => {
    renderPage();

    const row = await screen.findByTestId("row-cand-1");
    fireEvent.click(row);

    expect(screen.getByTestId("drawer-summary")).toHaveTextContent(/frentista/i);
    expect(screen.getByTestId("drawer-next-action")).toHaveTextContent(/marcar entrevista/i);
  });

  it("mantém ações rápidas principais na linha", async () => {
    renderPage();

    expect(await screen.findByTestId("action-open-profile-cand-1")).toBeInTheDocument();
    expect(screen.getByTestId("action-open-pipeline-cand-1")).toBeInTheDocument();
    expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument();
    expect(screen.getByTestId("action-more-cand-1")).toBeInTheDocument();
  });

  it("viewer continua sem ações de escrita no menu e no drawer", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "viewer-1", role: "viewer" as const } });

    renderPage();

    await openMoreActions();
    expect(screen.queryByTestId("action-reject-cand-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-interview-cand-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Fechar menu"));
    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.queryByTestId("drawer-schedule")).not.toBeInTheDocument();
    expect(screen.queryByTestId("drawer-reject")).not.toBeInTheDocument();
  });

  it("manager continua sem ações de escrita no menu e no drawer", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "manager-1", role: "manager" as const } });

    renderPage();

    await openMoreActions();
    expect(screen.queryByTestId("action-reject-cand-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-interview-cand-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Fechar menu"));
    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.queryByTestId("drawer-schedule")).not.toBeInTheDocument();
    expect(screen.queryByTestId("drawer-reject")).not.toBeInTheDocument();
  });

  it("importação concluída sem candidato válido mostra aviso claro", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 0,
      linked: 0,
      duplicates: 1,
      errors: [{ row: 2, message: "Nome em branco" }],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\n,semnome@test.com"], "sem-validos.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    expect(await screen.findByTestId("import-no-valid-candidates")).toHaveTextContent(/nenhum candidato válido/i);
  });
});

// ── Marcar entrevista ─────────────────────────────────────────────────────────

describe("CandidaturasPage — Marcar entrevista", () => {
  it("botão Marcar entrevista abre modal", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("action-interview-cand-1"));

    expect(screen.getByTestId("schedule-interview-modal")).toBeInTheDocument();
    expect(screen.getByTestId("interview-date")).toBeInTheDocument();
    expect(screen.getByTestId("interview-time")).toBeInTheDocument();
  });

  it("validação bloqueia salvar sem data — submit desabilitado", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-interview-cand-1"));

    // clear date → submit button must become disabled
    fireEvent.change(screen.getByTestId("interview-date"), { target: { value: "" } });

    const submitBtn = screen.getByTestId("interview-submit") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(schedulePipelineInterviewMock).not.toHaveBeenCalled();
  });

  it("salvar entrevista chama pipelineService.schedulePipelineInterview", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    await user.click(screen.getByTestId("action-interview-cand-1"));

    // date is pre-filled with today, time with 09:00 — just submit
    await user.click(screen.getByTestId("interview-submit"));

    await waitFor(() => expect(schedulePipelineInterviewMock).toHaveBeenCalled());
    const call = schedulePipelineInterviewMock.mock.calls[0];
    expect(call[0]).toBe("job-1"); // jobId
    expect(call[1]).toBe("cand-1"); // candidateId
    expect(call[2]).toMatchObject({
      interview_format: "online",
      interview_type: "hr",
      create_google_event: false,
    });
  });

  it("linha mostra badge 'Entrevista marcada' após sucesso", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    await user.click(screen.getByTestId("action-interview-cand-1"));
    await user.click(screen.getByTestId("interview-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("interview-badge-cand-1")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("interview-badge-cand-1").textContent).toMatch(/entrevista marcada/i);
  });

  it("modal fecha após sucesso e modal não aparece mais", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    await user.click(screen.getByTestId("action-interview-cand-1"));
    await user.click(screen.getByTestId("interview-submit"));

    await waitFor(() =>
      expect(screen.queryByTestId("schedule-interview-modal")).not.toBeInTheDocument(),
    );
  });

  it("ESC fecha o modal de entrevista", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-interview-cand-1"));

    expect(screen.getByTestId("schedule-interview-modal")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("schedule-interview-modal")).not.toBeInTheDocument(),
    );
  });

  it("após entrevista RH, etapa da linha muda para Entrevista RH", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());

    // Candidate starts at 'screening'
    const row = screen.getByTestId("row-cand-1");
    expect(row.textContent).toMatch(/triagem/i);

    await user.click(screen.getByTestId("action-interview-cand-1"));
    // interview_type is "hr" by default
    await user.click(screen.getByTestId("interview-submit"));

    await waitFor(() =>
      expect(screen.queryByTestId("schedule-interview-modal")).not.toBeInTheDocument(),
    );

    // Stage badge should now show hr_interview label
    expect(screen.getByTestId("row-cand-1").textContent).toMatch(/entrevista rh/i);
  });
});

// ── Copiar WhatsApp ───────────────────────────────────────────────────────────

describe("CandidaturasPage — Copiar WhatsApp", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });
  });

  it("antes de entrevista gera mensagem genérica", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-whatsapp-cand-1"));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalled());
    const msg = writeTextMock.mock.calls[0][0] as string;
    expect(msg).toContain("Ana Silva");
    expect(msg).toContain("Frentista");
    expect(msg).toContain("Rede de Postos Marajó");
    expect(msg).not.toMatch(/marcada para/i);
  });

  it("quando clipboard falha mostra toast de erro", async () => {
    writeTextMock.mockRejectedValue(new Error("denied"));

    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-whatsapp-cand-1"));

    const { toast } = await import("../../shared/utils/toast");
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(vi.mocked(toast.success)).not.toHaveBeenCalledWith("Mensagem copiada para o clipboard.");
  });

  it("depois de entrevista marcada inclui data e hora", async () => {
    renderPage();

    // schedule interview — date/time already pre-filled with defaults, just submit
    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-interview-cand-1"));

    // ensure date and time fields have values
    fireEvent.change(screen.getByTestId("interview-date"), { target: { value: "2026-06-15" } });
    fireEvent.change(screen.getByTestId("interview-time"), { target: { value: "09:00" } });

    fireEvent.click(screen.getByTestId("interview-submit"));

    await waitFor(() =>
      expect(screen.queryByTestId("schedule-interview-modal")).not.toBeInTheDocument(),
    );

    // now copy WhatsApp — should use interview message
    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-whatsapp-cand-1"));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalled());
    const msg = writeTextMock.mock.calls.at(-1)![0] as string;
    expect(msg).toMatch(/marcada para/i);
    expect(msg).toContain("Frentista");
  });
});

// ── Reprovar ──────────────────────────────────────────────────────────────────

describe("CandidaturasPage — Reprovar", () => {
  it("botão Reprovar na tabela abre modal de confirmação", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));

    expect(screen.getByTestId("reject-modal")).toBeInTheDocument();
    expect(screen.getByTestId("reject-reason")).toBeInTheDocument();
  });

  it("motivo vem preenchido com padrão", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));

    const textarea = screen.getByTestId("reject-reason") as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/não avançou/i);
  });

  it("botão Confirmar chama pipelineService.moveCandidateStage com rejected", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));

    fireEvent.click(screen.getByTestId("reject-confirm"));

    await waitFor(() => expect(moveCandidateStageMock).toHaveBeenCalled());
    expect(moveCandidateStageMock).toHaveBeenCalledWith(
      "job-1",
      "cand-1",
      expect.objectContaining({ stage: "rejected" }),
    );
  });

  it("após reprovação o candidato some da lista", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Ana Silva")).toBeInTheDocument());

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));
    fireEvent.click(screen.getByTestId("reject-confirm"));

    await waitFor(() =>
      expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument(),
    );
  });

  it("modal fecha após reprovação", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));
    fireEvent.click(screen.getByTestId("reject-confirm"));

    await waitFor(() =>
      expect(screen.queryByTestId("reject-modal")).not.toBeInTheDocument(),
    );
  });

  it("ESC fecha o modal de reprovação", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));

    expect(screen.getByTestId("reject-modal")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("reject-modal")).not.toBeInTheDocument(),
    );
  });

  it("botão Reprovar no drawer abre modal", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.getByTestId("drawer-reject")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("drawer-reject"));

    expect(screen.getByTestId("reject-modal")).toBeInTheDocument();
  });
});

// ── Abrir Pipeline ────────────────────────────────────────────────────────────

describe("CandidaturasPage — Abrir Pipeline", () => {
  it("navega para /pipeline/:jobId?candidateId=:id", async () => {
    renderPage();

    await openMoreActions();
    fireEvent.click(screen.getByTestId("action-pipeline-cand-1"));

    expect(mockNavigate).toHaveBeenCalledWith("/pipeline/job-1?candidateId=cand-1");
  });

  it("Abrir Pipeline no drawer navega com candidateId", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("row-cand-1"));

    fireEvent.click(screen.getByTestId("drawer-pipeline"));

    expect(mockNavigate).toHaveBeenCalledWith("/pipeline/job-1?candidateId=cand-1");
  });

  it("ESC fecha o drawer lateral", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.getByTestId("candidatura-drawer")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("candidatura-drawer")).not.toBeInTheDocument(),
    );
  });
});

// ── Adicionar candidatos ──────────────────────────────────────────────────────

describe("CandidaturasPage — Adicionar candidatos", () => {
  it("admin vê botão 'Adicionar candidatos'", async () => {
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());
    expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument();
  });

  it("hr vê botão 'Adicionar candidatos'", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-hr", role: "hr" as const } });
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());
    expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument();
  });

  it("recruiter vê botão 'Adicionar candidatos'", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-rec", role: "recruiter" as const } });
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());
    expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument();
  });

  it("viewer não vê botão 'Adicionar candidatos'", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "viewer-1", role: "viewer" as const } });
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());
    expect(screen.queryByTestId("add-candidates-btn")).not.toBeInTheDocument();
  });

  it("manager não vê botão 'Adicionar candidatos'", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "manager-1", role: "manager" as const } });
    renderPage();

    await waitFor(() => expect(listSummariesMock).toHaveBeenCalled());
    expect(screen.queryByTestId("add-candidates-btn")).not.toBeInTheDocument();
  });

  it("botão abre modal com abas Manual e Importar planilha", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));

    expect(screen.getByTestId("add-candidate-modal")).toBeInTheDocument();
    expect(screen.getByTestId("tab-manual")).toBeInTheDocument();
    expect(screen.getByTestId("tab-import")).toBeInTheDocument();
  });

  it("ESC fecha o modal de adicionar candidatos", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));
    expect(screen.getByTestId("add-candidate-modal")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("add-candidate-modal")).not.toBeInTheDocument(),
    );
  });

  it("aba Manual valida nome obrigatório", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));

    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("manual-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("manual-error").textContent).toMatch(/nome/i);
  });

  it("aba Manual valida que precisa de email ou telefone", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));

    await user.type(screen.getByTestId("manual-name"), "João Teste");
    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("manual-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("manual-error").textContent).toMatch(/e-mail ou telefone/i);
  });

  it("salvar candidato manual chama candidaturasService.createManual", async () => {
    const createManualMock = vi.mocked(candidaturasService.createManual);
    createManualMock.mockResolvedValue({
      candidate_id: "new-cand-1",
      full_name: "Novo Candidato",
      email: "novo@test.com",
      phone: null,
      job_id: null,
      job_linked: false,
      duplicate_warning: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));

    await user.type(screen.getByTestId("manual-name"), "Novo Candidato");
    await user.type(screen.getByTestId("manual-email"), "novo@test.com");
    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() => expect(createManualMock).toHaveBeenCalled());
    expect(createManualMock).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: "Novo Candidato", email: "novo@test.com" }),
    );
  });

  it("sucesso no manual recarrega lista e fecha modal", async () => {
    const createManualMock = vi.mocked(candidaturasService.createManual);
    createManualMock.mockResolvedValue({
      candidate_id: "new-cand-2",
      full_name: "Reload Test",
      email: "reload@test.com",
      phone: null,
      job_id: null,
      job_linked: false,
      duplicate_warning: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));

    await user.type(screen.getByTestId("manual-name"), "Reload Test");
    await user.type(screen.getByTestId("manual-email"), "reload@test.com");
    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() =>
      expect(screen.queryByTestId("add-candidate-modal")).not.toBeInTheDocument(),
    );
    // listSummaries deve ser chamado novamente (reload)
    expect(listSummariesMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("duplicata exibe aviso no modal manual", async () => {
    const createManualMock = vi.mocked(candidaturasService.createManual);
    createManualMock.mockResolvedValue({
      candidate_id: "dup-cand-1",
      full_name: "Duplicado",
      email: "dup@test.com",
      phone: null,
      job_id: null,
      job_linked: false,
      duplicate_warning: "Candidato com este e-mail já existe.",
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));

    await user.type(screen.getByTestId("manual-name"), "Duplicado");
    await user.type(screen.getByTestId("manual-email"), "dup@test.com");
    await user.click(screen.getByTestId("manual-submit"));

    await waitFor(() =>
      expect(screen.getByText(/já existe/i)).toBeInTheDocument(),
    );
  });

  it("aba Importar exibe área de upload e botão de modelo", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));
    fireEvent.click(screen.getByTestId("tab-import"));

    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();
    expect(screen.getByTestId("download-template")).toBeInTheDocument();
    expect(screen.getByTestId("import-submit")).toBeInTheDocument();
  });

  it("botão Importar fica desabilitado sem arquivo selecionado", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));
    fireEvent.click(screen.getByTestId("tab-import"));

    const btn = screen.getByTestId("import-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("importar CSV com sucesso exibe resumo de criados/vinculados/duplicados", async () => {
    const importMock = vi.mocked(candidaturasService.importCSV);
    importMock.mockResolvedValue({
      created: 5,
      linked: 3,
      duplicates: 2,
      errors: [],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    const input = screen.getByTestId("import-file-input");
    await user.upload(input, file);

    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(importMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/importação concluída/i)).toBeInTheDocument());
    expect(screen.getByTestId("stat-criados").textContent).toMatch(/5 criado/i);
    expect(screen.getByTestId("stat-vinculados").textContent).toMatch(/3 vinculado/i);
    expect(screen.getByTestId("stat-duplicados").textContent).toMatch(/2 duplicado/i);
  });

  it("erros de importação aparecem no modal", async () => {
    const importMock = vi.mocked(candidaturasService.importCSV);
    importMock.mockResolvedValue({
      created: 1,
      linked: 0,
      duplicates: 0,
      errors: [{ row: 3, message: "E-mail inválido" }],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com\nErro,x"], "test.csv", { type: "text/csv" });
    const input = screen.getByTestId("import-file-input");
    await user.upload(input, file);

    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("import-errors")).toBeInTheDocument(),
    );
    expect(screen.getByText(/linha 3/i)).toBeInTheDocument();
    expect(screen.getByText(/e-mail inválido/i)).toBeInTheDocument();
  });
});

// ── Phase 6 — Polimento da importação ────────────────────────────────────────

describe("CandidaturasPage — Phase 6 polimento importação", () => {
  beforeEach(() => {
    if (!globalThis.URL.createObjectURL) {
      Object.defineProperty(globalThis.URL, "createObjectURL", {
        value: vi.fn(() => "blob:test-url"),
        writable: true,
        configurable: true,
      });
    }
    if (!globalThis.URL.revokeObjectURL) {
      Object.defineProperty(globalThis.URL, "revokeObjectURL", {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
  });

  it("botão Baixar modelo CSV chama buildCSVTemplate", async () => {
    const buildMock = vi.mocked(candidaturasService.buildCSVTemplate);

    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));
    fireEvent.click(screen.getByTestId("tab-import"));

    fireEvent.click(screen.getByTestId("download-template"));

    expect(buildMock).toHaveBeenCalled();
  });

  it("aba importar exibe exemplo visual com colunas", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));
    fireEvent.click(screen.getByTestId("tab-import"));

    expect(screen.getByTestId("csv-example")).toBeInTheDocument();
    expect(screen.getByText(/Ana Souza/i)).toBeInTheDocument();
    expect(screen.getByText(/Operador de Caixa/i)).toBeInTheDocument();
  });

  it("selecionar CSV válido mostra preview das primeiras linhas", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const csv = "nome,email,telefone\nAna Silva,ana@t.com,(11)99999\nBob Lima,bob@t.com,(22)88888";
    const file = new File([csv], "candidatos.csv", { type: "text/csv" });
    const input = screen.getByTestId("import-file-input");
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByTestId("csv-preview")).toBeInTheDocument());
    expect(screen.getByTestId("csv-row-count").textContent).toMatch(/2 linha/i);
  });

  it("CSV sem colunas esperadas mostra aviso de colunas", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["coluna1,coluna2\nValor1,Valor2"], "errado.csv", { type: "text/csv" });
    const input = screen.getByTestId("import-file-input");
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByTestId("column-warning")).toBeInTheDocument());
    expect(screen.getByTestId("column-warning").textContent).toMatch(/colunas obrigatórias/i);
  });

  it("CSV sem coluna nome mostra aviso de colunas obrigatórias", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["email,telefone\nana@t.com,(11)99999"], "semNome.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);

    await waitFor(() => expect(screen.getByTestId("column-warning")).toBeInTheDocument());
  });

  it("aviso de duplicados aparece no resultado quando duplicates > 0", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 2,
      linked: 0,
      duplicates: 3,
      errors: [],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(screen.getByTestId("duplicate-warning")).toBeInTheDocument());
    expect(screen.getByTestId("duplicate-warning").textContent).toMatch(/não foram recriados/i);
  });

  it("sem duplicados não aparece aviso de duplicados", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 2,
      linked: 0,
      duplicates: 0,
      errors: [],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(screen.getByTestId("import-result")).toBeInTheDocument());
    expect(screen.queryByTestId("duplicate-warning")).not.toBeInTheDocument();
  });

  it("resultado mostra stats individuais com data-testid", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 7,
      linked: 5,
      duplicates: 1,
      errors: [{ row: 2, message: "Nome em branco" }],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(screen.getByTestId("import-result")).toBeInTheDocument());
    expect(screen.getByTestId("stat-criados").textContent).toMatch(/7 criado/i);
    expect(screen.getByTestId("stat-vinculados").textContent).toMatch(/5 vinculado/i);
    expect(screen.getByTestId("stat-duplicados").textContent).toMatch(/1 duplicado/i);
    expect(screen.getByTestId("stat-erros").textContent).toMatch(/1 erro/i);
    expect(screen.getByText(/nome em branco/i)).toBeInTheDocument();
  });

  it("botão Importar outro arquivo reseta estado e volta ao formulário", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 1,
      linked: 0,
      duplicates: 0,
      errors: [],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(screen.getByTestId("import-result")).toBeInTheDocument());

    await user.click(screen.getByTestId("import-another-btn"));

    await waitFor(() =>
      expect(screen.queryByTestId("import-result")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("file-drop-zone")).toBeInTheDocument();
  });

  it("botão Fechar no resultado fecha o modal", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 1,
      linked: 0,
      duplicates: 0,
      errors: [],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(screen.getByTestId("import-close-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("import-close-btn"));

    await waitFor(() =>
      expect(screen.queryByTestId("add-candidate-modal")).not.toBeInTheDocument(),
    );
  });

  it("após importação com created > 0, lista recarrega", async () => {
    vi.mocked(candidaturasService.importCSV).mockResolvedValue({
      created: 3,
      linked: 0,
      duplicates: 0,
      errors: [],
      preview: [],
    });

    const user = userEvent.setup();
    renderPage();

    const callsBefore = listSummariesMock.mock.calls.length;

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    await user.click(screen.getByTestId("add-candidates-btn"));
    await user.click(screen.getByTestId("tab-import"));

    const file = new File(["nome,email\nTeste,t@t.com"], "test.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file-input"), file);
    await user.click(screen.getByTestId("import-submit"));

    await waitFor(() => expect(screen.getByTestId("import-result")).toBeInTheDocument());
    expect(listSummariesMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("botão Confirmar importação fica desabilitado sem arquivo", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("add-candidates-btn")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("add-candidates-btn"));
    fireEvent.click(screen.getByTestId("tab-import"));

    const btn = screen.getByTestId("import-submit") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/confirmar importação/i);
  });
});

// ── Phase 8 — Próxima entrevista real ─────────────────────────────────────────

describe("CandidaturasPage — next_interview do backend", () => {
  const NEXT_INTERVIEW_START = "2026-06-20T10:00:00.000Z";
  const NEXT_INTERVIEW_END = "2026-06-20T11:00:00.000Z";

  function makeCandidateWithInterview() {
    return makeCandidate({
      next_interview: {
        scheduled_start: NEXT_INTERVIEW_START,
        scheduled_end: NEXT_INTERVIEW_END,
        interview_type: "hr",
        interview_format: "online",
      },
    });
  }

  it("mostra badge de entrevista marcada quando next_interview existe no backend", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidateWithInterview()]),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("interview-badge-cand-1")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("interview-badge-cand-1").textContent).toMatch(/entrevista marcada/i);
  });

  it("mostra data e hora da entrevista do backend na tabela", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidateWithInterview()]),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("interview-badge-cand-1")).toBeInTheDocument(),
    );
    // Must show a formatted date/time (not just the label)
    const badge = screen.getByTestId("interview-badge-cand-1");
    // "20/06/2026" or similar formatted date should appear
    expect(badge.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("mostra 'Não marcada' quando next_interview é null", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ next_interview: null })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());

    expect(screen.queryByTestId("interview-badge-cand-1")).not.toBeInTheDocument();
    expect(screen.getByText(/não marcada/i)).toBeInTheDocument();
  });

  it("drawer mostra entrevista real do backend", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidateWithInterview()]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("row-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("row-cand-1"));

    expect(screen.getByTestId("candidatura-drawer")).toBeInTheDocument();
    // Drawer shows interview date in the summary section
    const drawer = screen.getByTestId("candidatura-drawer");
    expect(drawer.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("WhatsApp inclui data e hora quando next_interview existe", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidateWithInterview()]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId(`action-more-cand-1`)).toBeInTheDocument());
    await openMoreActions("cand-1");

    fireEvent.click(screen.getByTestId("action-whatsapp-cand-1"));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalled());
    const msg = writeTextMock.mock.calls[0][0] as string;
    expect(msg).toMatch(/marcada para/i);
    expect(msg).toContain("Frentista");
  });

  it("WhatsApp gera mensagem genérica quando next_interview é null", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ next_interview: null })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId(`action-more-cand-1`)).toBeInTheDocument());
    await openMoreActions("cand-1");

    fireEvent.click(screen.getByTestId("action-whatsapp-cand-1"));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalled());
    const msg = writeTextMock.mock.calls[0][0] as string;
    expect(msg).not.toMatch(/marcada para/i);
    expect(msg).toMatch(/rede de postos marajó/i);
  });

  it("entrevista marcada nesta sessão sobrescreve next_interview null do backend", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ next_interview: null })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-interview-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-interview-cand-1"));

    expect(screen.getByTestId("schedule-interview-modal")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("interview-date"), { target: { value: "2026-06-25" } });
    fireEvent.change(screen.getByTestId("interview-time"), { target: { value: "14:00" } });

    fireEvent.click(screen.getByTestId("interview-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("interview-badge-cand-1")).toBeInTheDocument(),
    );
  });

  it("viewer não vê botão de entrevista mas vê badge quando next_interview existe", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "viewer-1", role: "viewer" as const } });
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidateWithInterview()]),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("interview-badge-cand-1")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("action-interview-cand-1")).not.toBeInTheDocument();
  });
});
