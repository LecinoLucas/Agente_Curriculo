import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AnalisesIaPage } from "../AnalisesIaPage";
import { analysisService } from "../../services/analysisService";
import { listBehavioralAIQueue, retryBehavioralAI } from "../../services/behavioralAIEvaluationService";

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

beforeEach(() => {
  vi.clearAllMocks();
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
  it("mostra avaliações comportamentais na tela de acompanhamento ao selecionar o tipo", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(listGlobalMock).toHaveBeenCalledWith(1, 20, undefined, undefined, undefined);
    });

    await user.selectOptions(screen.getByDisplayValue("Currículo"), "behavioral_ai");

    await waitFor(() => {
      expect(listBehavioralAIQueueMock).toHaveBeenCalledWith(1, 20, undefined, undefined);
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

  it("permite retry contextual para IA comportamental com falha", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByDisplayValue("Currículo"), "behavioral_ai");
    await screen.findByText("Bruno Candidato");

    const actionButtons = screen.getAllByLabelText(/Ações da análise/);
    await user.click(actionButtons[1]);
    await user.click(await screen.findByText("Tentar novamente"));

    await waitFor(() => {
      expect(retryBehavioralAIMock).toHaveBeenCalledWith("behavioral-eval-2");
    });
    await waitFor(() => {
      expect(listBehavioralAIQueueMock).toHaveBeenCalledTimes(2);
    });
  });
});
