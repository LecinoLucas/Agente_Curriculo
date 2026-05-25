import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AnalisesIaComportamentalPage } from "../AnalisesIaComportamentalPage";
import {
  getBehavioralAIEvaluationDetail,
  getBehavioralAIMetrics,
  listBehavioralAIEvaluations,
  retryBehavioralAIEvaluation,
} from "../../services/behavioralAIEvaluationService";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../../services/behavioralAIEvaluationService", async () => {
  const actual = await vi.importActual<typeof import("../../services/behavioralAIEvaluationService")>(
    "../../services/behavioralAIEvaluationService",
  );
  return {
    ...actual,
    getBehavioralAIMetrics: vi.fn(),
    listBehavioralAIEvaluations: vi.fn(),
    getBehavioralAIEvaluationDetail: vi.fn(),
    retryBehavioralAIEvaluation: vi.fn(),
  };
});

const getMetricsMock = vi.mocked(getBehavioralAIMetrics);
const listMock = vi.mocked(listBehavioralAIEvaluations);
const detailMock = vi.mocked(getBehavioralAIEvaluationDetail);
const retryMock = vi.mocked(retryBehavioralAIEvaluation);

const listPayload = {
  data: [
    {
      id: "eval-1",
      evaluation_id: "eval-1",
      assignment_id: "assignment-1",
      candidate_id: "candidate-1",
      candidate_name: "Ana Candidata",
      candidate_email: "ana@example.com",
      job_id: "job-1",
      job_title: "Tecnologia e Suporte",
      type: "behavioral_ai" as const,
      status: "completed" as const,
      operational_status: "completed" as const,
      provider: "google",
      model: "gemini-2.5-flash",
      retry_count: 0,
      can_retry: false,
      retry_allowed_reason: "completed",
      requested_at: "2026-05-24T20:00:00Z",
      queued_at: "2026-05-24T20:01:00Z",
      started_at: "2026-05-24T20:02:00Z",
      completed_at: "2026-05-24T20:03:00Z",
      failed_at: null,
      next_retry_at: null,
      provider_error_type: null,
      provider_status_code: null,
      safe_error_message: null,
      stuck: false,
      created_at: "2026-05-24T20:00:00Z",
      updated_at: "2026-05-24T20:03:00Z",
    },
    {
      id: "eval-2",
      evaluation_id: "eval-2",
      assignment_id: "assignment-2",
      candidate_id: "candidate-2",
      candidate_name: "Bruno Candidato",
      candidate_email: "bruno@example.com",
      job_id: "job-2",
      job_title: "Produto",
      type: "behavioral_ai" as const,
      status: "failed" as const,
      operational_status: "failed" as const,
      provider: "google",
      model: "gemini-2.5-pro",
      retry_count: 1,
      can_retry: true,
      retry_allowed_reason: "failed",
      requested_at: "2026-05-24T19:00:00Z",
      queued_at: "2026-05-24T19:01:00Z",
      started_at: "2026-05-24T19:02:00Z",
      completed_at: null,
      failed_at: "2026-05-24T19:03:00Z",
      next_retry_at: null,
      provider_error_type: "provider_timeout",
      provider_status_code: null,
      safe_error_message: "Tempo limite ao chamar o provedor IA.",
      stuck: false,
      created_at: "2026-05-24T19:00:00Z",
      updated_at: "2026-05-24T19:03:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

function renderPage() {
  return render(
    <MemoryRouter future={routerFuture}>
      <AnalisesIaComportamentalPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMetricsMock.mockResolvedValue({
    pending: 1,
    processing: 2,
    retry_scheduled: 3,
    completed_last_24h: 4,
    failed_last_24h: 5,
    rate_limited: 6,
    credential_invalid: 7,
    next_retries: 8,
    stuck: 9,
  });
  listMock.mockResolvedValue(listPayload);
  detailMock.mockResolvedValue({
    ...listPayload.data[0],
    prompt_version: 1,
    confidence: "medium",
    summary: "Resumo seguro da IA comportamental.",
  });
  retryMock.mockResolvedValue({
    evaluation_id: "eval-2",
    assignment_id: "assignment-2",
    status: "pending",
    enqueued: true,
    retry_count: 2,
    message: "Avaliação enfileirada para retry",
  });
});

describe("AnalisesIaComportamentalPage", () => {
  it("renderiza KPIs e linhas da fila operacional", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "IA Comportamental" })).toBeInTheDocument();
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.getAllByText("Processando").length).toBeGreaterThan(0);
    expect(screen.getByText("Concluídas 24h")).toBeInTheDocument();
    expect(screen.getAllByText("Rate limited").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Ana Candidata")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tecnologia e Suporte").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tempo limite ao chamar o provedor IA.").length).toBeGreaterThan(0);
  });

  it("aplica filtros e dispara nova busca", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("Ana Candidata");
    expect(screen.getByLabelText("Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de erro")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Provider"), "google");

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ provider: "google", page: 1 }),
      );
    });

    await user.selectOptions(screen.getByLabelText("Status operacional"), "failed");

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ operational_status: "failed", page: 1 }),
      );
    });
  });

  it("abre detalhe seguro sem renderizar campos proibidos", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("Ana Candidata");
    await user.click(screen.getAllByText("Ver detalhes")[0]);

    expect(await screen.findByText("Resumo seguro da IA comportamental.")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Detalhes da IA comportamental" });
    expect(within(dialog).queryByText(/api_key/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/encrypted_api_key/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Authorization/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Bearer/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/raw_response/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/traceback/i)).not.toBeInTheDocument();
  });

  it("mostra retry apenas quando permitido e chama endpoint correto", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findAllByText("Bruno Candidato");
    expect(screen.getAllByText("Reprocessar").length).toBeGreaterThan(0);
    await user.click(screen.getAllByText("Reprocessar")[0]);

    await waitFor(() => {
      expect(retryMock).toHaveBeenCalledWith("eval-2");
    });
    expect(await screen.findByText("Avaliação enfileirada para retry")).toBeInTheDocument();
  });

  it("renderiza estado vazio e estado de erro", async () => {
    listMock.mockResolvedValueOnce({ data: [], total: 0, page: 1, page_size: 20, total_pages: 1 });
    const { unmount } = renderPage();

    expect(await screen.findByText("Ainda não há avaliações comportamentais IA")).toBeInTheDocument();
    unmount();

    listMock.mockRejectedValueOnce(new Error("Falha controlada"));
    renderPage();
    expect(await screen.findByText(/Não foi possível carregar a fila de IA comportamental/)).toBeInTheDocument();
  });
});
