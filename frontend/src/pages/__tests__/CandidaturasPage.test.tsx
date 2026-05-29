import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { CandidaturasPage } from "../CandidaturasPage";
import { candidatesService } from "../../services/candidatesService";
import { pipelineService } from "../../services/pipelineService";

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

  it("score ≥ 80 mostra 'Alta aderência'", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: 85 })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText(/alta aderência/i)).toBeInTheDocument());
  });

  it("score 60-79 mostra 'Avaliar'", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: 65 })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText(/avaliar/i)).toBeInTheDocument());
  });

  it("score < 60 mostra 'Baixa aderência'", async () => {
    listSummariesMock.mockResolvedValue(
      makePaginatedResponse([makeCandidate({ active_job_job_fit_score: 40 })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText(/baixa aderência/i)).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByTestId("action-profile-cand-1")).toBeInTheDocument());

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

    await waitFor(() => expect(screen.getByTestId("action-whatsapp-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-whatsapp-cand-1"));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalled());
    const msg = writeTextMock.mock.calls[0][0] as string;
    expect(msg).toContain("Ana Silva");
    expect(msg).toContain("Frentista");
    expect(msg).toContain("Rede de Postos Marajó");
    expect(msg).not.toMatch(/marcada para/i);
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

    await waitFor(() => expect(screen.getByTestId("action-reject-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));

    expect(screen.getByTestId("reject-modal")).toBeInTheDocument();
    expect(screen.getByTestId("reject-reason")).toBeInTheDocument();
  });

  it("motivo vem preenchido com padrão", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-reject-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));

    const textarea = screen.getByTestId("reject-reason") as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/não avançou/i);
  });

  it("botão Confirmar chama pipelineService.moveCandidateStage com rejected", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-reject-cand-1")).toBeInTheDocument());
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

    fireEvent.click(screen.getByTestId("action-reject-cand-1"));
    fireEvent.click(screen.getByTestId("reject-confirm"));

    await waitFor(() =>
      expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument(),
    );
  });

  it("modal fecha após reprovação", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("action-reject-cand-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-reject-cand-1"));
    fireEvent.click(screen.getByTestId("reject-confirm"));

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

    await waitFor(() => expect(screen.getByTestId("action-pipeline-cand-1")).toBeInTheDocument());
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
});
