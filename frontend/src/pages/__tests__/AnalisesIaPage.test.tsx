import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AnalisesIaPage } from "../AnalisesIaPage";
import { ProtectedRoute } from "../../app/ProtectedRoute";
import { analysisService } from "../../services/analysisService";
import { listBehavioralAIQueue, retryBehavioralAI } from "../../services/behavioralAIEvaluationService";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../features/pipeline/PipelineContext", () => ({
  usePipeline: () => ({
    analysesSyncTick: 0,
    syncAnalysisStart: vi.fn(),
    startPolling: vi.fn(),
  }),
}));

vi.mock("../../features/auth/useAuth", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("../../features/candidates/components/CandidatePreviewDrawer", () => ({
  CandidatePreviewDrawer: ({ candidateId }: { candidateId: string | null }) =>
    candidateId ? <div data-testid="candidate-preview-drawer">preview:{candidateId}</div> : null,
}));

vi.mock("../../services/analysisService", async () => {
  const actual = await vi.importActual<typeof import("../../services/analysisService")>(
    "../../services/analysisService",
  );
  return {
    ...actual,
    analysisService: {
      ...actual.analysisService,
      listGlobal: vi.fn(),
      retry: vi.fn(),
      forceFail: vi.fn(),
      discard: vi.fn(),
    },
  };
});

vi.mock("../../services/behavioralAIEvaluationService", async () => {
  const actual = await vi.importActual<typeof import("../../services/behavioralAIEvaluationService")>(
    "../../services/behavioralAIEvaluationService",
  );
  return {
    ...actual,
    listBehavioralAIQueue: vi.fn(),
    retryBehavioralAI: vi.fn(),
  };
});

const listGlobalMock = vi.mocked(analysisService.listGlobal);
const listBehavioralAIQueueMock = vi.mocked(listBehavioralAIQueue);
const retryBehavioralAIMock = vi.mocked(retryBehavioralAI);

function renderPage() {
  return render(
    <MemoryRouter future={routerFuture}>
      <AnalisesIaPage />
    </MemoryRouter>,
  );
}

function renderProtectedPage() {
  return render(
    <MemoryRouter initialEntries={["/analises-ia"]} future={routerFuture}>
      <Routes>
        <Route
          path="/analises-ia"
          element={
            <ProtectedRoute allowedRoles={["admin", "recruiter"]}>
              <AnalisesIaPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: "user-1",
      role: "recruiter",
      must_change_password: false,
    },
  });
  listGlobalMock.mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 1,
  });
  listBehavioralAIQueueMock.mockResolvedValue({
    data: [
      {
        id: "behavioral-eval-1",
        type: "behavioral_ai",
        job_id: "job-1",
        job_title: "Tecnologia e Suporte",
        candidate_id: "candidate-1",
        candidate_name: "Ana Candidata",
        candidate_email: "ana@example.com",
        resume_file_name: null,
        resume_version_id: null,
        status: "retry_scheduled",
        failure_reason: "Limite temporário do provedor IA.",
        discarded_at: null,
        discarded_by: null,
        discard_reason: null,
        discard_reason_note: null,
        used_real_ai: null,
        retry_count: 2,
        next_retry_at: "2026-05-24T21:30:00Z",
        provider_error_type: "rate_limited",
        provider_status_code: 429,
        provider: "google",
        model: "gemini-2.5-flash",
        stuck: false,
        reason: null,
        created_at: "2026-05-24T21:00:00Z",
        updated_at: "2026-05-24T21:02:00Z",
        started_at: null,
        completed_at: null,
        failed_at: null,
      },
      {
        id: "behavioral-eval-2",
        type: "behavioral_ai",
        job_id: "job-2",
        job_title: "Produto",
        candidate_id: "candidate-2",
        candidate_name: "Bruno Candidato",
        candidate_email: "bruno@example.com",
        resume_file_name: null,
        resume_version_id: null,
        status: "failed",
        failure_reason: "api_key=secret traceback prompt bruto",
        discarded_at: null,
        discarded_by: null,
        discard_reason: null,
        discard_reason_note: null,
        used_real_ai: null,
        retry_count: 1,
        next_retry_at: null,
        provider_error_type: "ai_credential_invalid",
        provider_status_code: 401,
        provider: "google",
        model: "gemini-2.5-pro",
        stuck: false,
        reason: null,
        created_at: "2026-05-24T20:00:00Z",
        updated_at: "2026-05-24T20:01:00Z",
        started_at: "2026-05-24T20:00:10Z",
        completed_at: null,
        failed_at: "2026-05-24T20:01:00Z",
      },
    ],
    total: 2,
    page: 1,
    page_size: 20,
    total_pages: 1,
  });
  retryBehavioralAIMock.mockResolvedValue({
    evaluation_id: "behavioral-eval-2",
    assignment_id: "assignment-2",
    status: "pending",
    enqueued: true,
    retry_count: 2,
    message: "Avaliação enfileirada para retry",
  });
});

describe("AnalisesIaPage", () => {
  it("bloqueia acesso direto para viewer na rota protegida", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: "user-viewer",
        role: "viewer",
        must_change_password: false,
      },
    });

    renderProtectedPage();

    expect(await screen.findByText("Acesso negado")).toBeInTheDocument();
    expect(screen.getByText("Você não tem permissão para acessar esta página")).toBeInTheDocument();
    expect(listGlobalMock).not.toHaveBeenCalled();
  });

  it("mantém acesso direto para recruiter na rota protegida", async () => {
    renderProtectedPage();

    expect(await screen.findByText("Análises IA")).toBeInTheDocument();
    await waitFor(() => {
      expect(listGlobalMock).toHaveBeenCalled();
    });
  });

  it("mostra análises pending e waiting_extraction imediatamente", async () => {
    const user = userEvent.setup();
    listGlobalMock.mockResolvedValueOnce({
      data: [
        {
          id: "analysis-waiting",
          type: "resume",
          job_id: "job-1",
          job_title: null,
          candidate_id: "candidate-1",
          candidate_name: "Candidata Extração",
          candidate_email: "extracao@example.com",
          resume_file_name: "curriculo.pdf",
          resume_version_id: "version-1",
          status: "waiting_extraction",
          failure_reason: null,
          discarded_at: null,
          discarded_by: null,
          discard_reason: null,
          discard_reason_note: null,
          used_real_ai: null,
          retry_count: 0,
          next_retry_at: null,
          provider_error_type: null,
          provider_status_code: null,
          stuck: false,
          reason: null,
          created_at: "2026-05-24T21:00:00Z",
          updated_at: "2026-05-24T21:00:00Z",
          started_at: null,
          completed_at: null,
          failed_at: null,
        },
        {
          id: "analysis-pending",
          type: "resume",
          job_id: "job-2",
          job_title: null,
          candidate_id: "candidate-2",
          candidate_name: "Candidato Fila",
          candidate_email: "fila@example.com",
          resume_file_name: "fila.pdf",
          resume_version_id: "version-2",
          status: "pending",
          failure_reason: null,
          discarded_at: null,
          discarded_by: null,
          discard_reason: null,
          discard_reason_note: null,
          used_real_ai: null,
          retry_count: 0,
          next_retry_at: null,
          provider_error_type: null,
          provider_status_code: null,
          stuck: false,
          reason: null,
          created_at: "2026-05-24T21:01:00Z",
          updated_at: "2026-05-24T21:01:00Z",
          started_at: null,
          completed_at: null,
          failed_at: null,
        },
      ],
      total: 2,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    renderPage();

    expect(await screen.findByText("Candidata Extração")).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando extração").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("A análise já foi criada e aguarda a extração do currículo.")).toBeInTheDocument();
    expect(screen.getByText("Candidato Fila")).toBeInTheDocument();
    expect(screen.getByText("Na fila")).toBeInTheDocument();

    listGlobalMock.mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    await user.click(screen.getByRole("button", { name: /Atualizar/i }));
    await waitFor(() => {
      expect(listGlobalMock).toHaveBeenCalledTimes(2);
    });
  });

  it("mostra avaliações comportamentais na tela de acompanhamento ao selecionar o tipo", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(listGlobalMock).toHaveBeenCalledWith(1, 20, undefined, undefined, undefined);
    });
    await waitFor(() => {
      expect(listBehavioralAIQueueMock).toHaveBeenCalledWith(1, 20, undefined, undefined);
    });

    await user.selectOptions(screen.getByDisplayValue("Todas"), "behavioral_ai");

    await waitFor(() => {
      expect(listBehavioralAIQueueMock).toHaveBeenLastCalledWith(1, 20, undefined, undefined);
    });

    expect(await screen.findByText("Ana Candidata")).toBeInTheDocument();
    expect(screen.getAllByText("Comportamental").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Tecnologia e Suporte")).toBeInTheDocument();
    expect(screen.getAllByText("google").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("gemini-2.5-flash").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText((_content, node) => node?.textContent === "2 tentativas")).toBeInTheDocument();
    expect(screen.getByText("Retry agendado")).toBeInTheDocument();
    expect(screen.getByText("Credencial IA inválida ou indisponível.")).toBeInTheDocument();
    expect(screen.queryByText(/api_key=secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prompt bruto/i)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Todos os providers")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Todos os modelos")).toBeInTheDocument();
  });

  it("filtro de concluídas mostra análises de currículo e comportamentais quando tipo é Todas", async () => {
    const user = userEvent.setup();
    listGlobalMock.mockResolvedValue({
      data: [
        {
          id: "resume-completed",
          type: "resume",
          job_id: "job-resume",
          job_title: "Analista de DP",
          candidate_id: "candidate-resume",
          candidate_name: "Carla Currículo",
          candidate_email: "carla@example.com",
          resume_file_name: "carla.pdf",
          resume_version_id: "version-resume",
          status: "completed",
          failure_reason: null,
          discarded_at: null,
          discarded_by: null,
          discard_reason: null,
          discard_reason_note: null,
          used_real_ai: true,
          retry_count: 0,
          next_retry_at: null,
          provider_error_type: null,
          provider_status_code: null,
          stuck: false,
          reason: null,
          created_at: "2026-05-24T19:00:00Z",
          updated_at: "2026-05-24T19:20:00Z",
          started_at: "2026-05-24T19:01:00Z",
          completed_at: "2026-05-24T19:20:00Z",
          failed_at: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
    listBehavioralAIQueueMock.mockResolvedValue({
      data: [
        {
          id: "behavioral-completed",
          type: "behavioral_ai",
          job_id: "job-behavioral",
          job_title: "Assistente de RH",
          candidate_id: "candidate-behavioral",
          candidate_name: "Bruna Comportamental",
          candidate_email: "bruna@example.com",
          resume_file_name: null,
          resume_version_id: null,
          status: "completed",
          failure_reason: null,
          discarded_at: null,
          discarded_by: null,
          discard_reason: null,
          discard_reason_note: null,
          used_real_ai: null,
          retry_count: 0,
          next_retry_at: null,
          provider_error_type: null,
          provider_status_code: null,
          provider: "google",
          model: "gemini-2.5-flash",
          stuck: false,
          reason: null,
          created_at: "2026-05-24T20:00:00Z",
          updated_at: "2026-05-24T20:10:00Z",
          started_at: "2026-05-24T20:01:00Z",
          completed_at: "2026-05-24T20:10:00Z",
          failed_at: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    renderPage();
    await user.selectOptions(await screen.findByDisplayValue("Todos os status"), "completed");

    await waitFor(() => {
      expect(listGlobalMock).toHaveBeenLastCalledWith(1, 20, "completed", undefined, undefined);
    });
    await waitFor(() => {
      expect(listBehavioralAIQueueMock).toHaveBeenLastCalledWith(1, 20, "completed", undefined);
    });
    expect(await screen.findByText("Carla Currículo")).toBeInTheDocument();
    expect(screen.getByText("Bruna Comportamental")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Todas")).toBeInTheDocument();
  });

  it("permite retry contextual para IA comportamental com falha", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByDisplayValue("Todas"), "behavioral_ai");
    await screen.findByText("Bruno Candidato");

    const actionButtons = screen.getAllByLabelText(/Ações da análise/);
    await user.click(actionButtons[1]);
    await user.click(await screen.findByText("Tentar novamente"));

    await waitFor(() => {
      expect(retryBehavioralAIMock).toHaveBeenCalledWith("behavioral-eval-2");
    });
    await waitFor(() => {
      expect(listBehavioralAIQueueMock).toHaveBeenCalledTimes(3);
    });
  });
});
