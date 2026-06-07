import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiAssistantDrawer } from "../components/AiAssistantDrawer";
import { aiAssistantService } from "../services/aiAssistantService";
import type { AiAssistantHistoryItem, AiAssistantResponse } from "../types";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

vi.mock("../services/aiAssistantService", () => ({
  aiAssistantService: {
    query: vi.fn(),
  },
}));

function renderDrawer(path = "/vagas/job-123") {
  const onClose = vi.fn();
  const result = render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AiAssistantDrawer onClose={onClose} />
    </MemoryRouter>,
  );
  return { ...result, onClose };
}

function PersistentHistoryHarness({ path = "/vagas/job-123" }: { path?: string }) {
  const [open, setOpen] = useState(true);
  const [history, setHistory] = useState<AiAssistantHistoryItem[]>([]);

  return (
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <div>
        <button type="button" onClick={() => setOpen(true)} data-testid="open-assistant">
          abrir
        </button>
        {open ? (
          <AiAssistantDrawer
            onClose={() => setOpen(false)}
            sessionHistory={history}
            onSessionHistoryChange={setHistory}
          />
        ) : null}
        <pre data-testid="history-json">{JSON.stringify(history)}</pre>
      </div>
    </MemoryRouter>
  );
}

function makeResponse(overrides: Partial<AiAssistantResponse> = {}): AiAssistantResponse {
  return {
    ok: true,
    intent: "job.summary",
    tool_name: "get_job_summary",
    data: { title: "Engenheiro Backend", area: "Tecnologia", status: "open" },
    error_code: null,
    message: null,
    requires_approval: false,
    warnings: [],
    ...overrides,
  };
}

describe("AiAssistantDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Core rendering ───────────────────────────────────────────────────────────

  it("renders the drawer panel with title and Beta badge", () => {
    renderDrawer();
    expect(screen.getByTestId("ai-assistant-drawer")).toBeInTheDocument();
    expect(screen.getByText("Assistente IA")).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-beta-badge")).toBeInTheDocument();
  });

  it("shows readonly notice in idle state", () => {
    renderDrawer();
    expect(screen.getByText(/Somente leitura/i)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma ação será executada/i)).toBeInTheDocument();
  });

  it("closes when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByTestId("ai-assistant-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByTestId("ai-assistant-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Job page context ─────────────────────────────────────────────────────────

  describe("on job page (/vagas/:jobId)", () => {
    it("shows job-related actions", () => {
      renderDrawer("/vagas/job-123");
      expect(screen.getByTestId("ai-action-job.summary")).toBeInTheDocument();
      expect(screen.getByTestId("ai-action-job.requirements")).toBeInTheDocument();
      expect(screen.getByTestId("ai-action-pipeline.overview")).toBeInTheDocument();
    });

    it("does not show candidate or admission actions", () => {
      renderDrawer("/vagas/job-123");
      expect(screen.queryByTestId("ai-action-candidate.summary")).not.toBeInTheDocument();
      expect(screen.queryByTestId("ai-action-admission.case_summary")).not.toBeInTheDocument();
    });

    it("calls service with correct intent and job_id arg when action is clicked", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));

      expect(aiAssistantService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "job.summary",
          arguments: { job_id: "job-123" },
        }),
      );
    });

    it("shows loading indicator while fetching", async () => {
      const user = userEvent.setup();
      let resolve!: (v: AiAssistantResponse) => void;
      vi.mocked(aiAssistantService.query).mockReturnValueOnce(
        new Promise<AiAssistantResponse>((r) => {
          resolve = r;
        }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      expect(screen.getByTestId("ai-assistant-loading")).toBeInTheDocument();

      resolve(makeResponse());
      await waitFor(() =>
        expect(screen.queryByTestId("ai-assistant-loading")).not.toBeInTheDocument(),
      );
    });

    it("renders response data after successful query", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: { title: "Dev Sênior", area: "TI", status: "open" } }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByText("Dev Sênior")).toBeInTheDocument();
    });

    it("shows back button after action and returns to idle on click", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      await user.click(screen.getByTestId("ai-assistant-back"));
      expect(screen.getByTestId("ai-assistant-actions")).toBeInTheDocument();
    });

    it("shows Nova consulta button in result view and resets to idle on click", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByTestId("ai-assistant-new-query")).toBeInTheDocument();
      await user.click(screen.getByTestId("ai-assistant-new-query"));
      expect(screen.getByTestId("ai-assistant-actions")).toBeInTheDocument();
    });

    it("shows error state when service throws (network error)", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockRejectedValueOnce(new Error("Falha na rede"));
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-error"));

      expect(screen.getByText(/Falha na rede/)).toBeInTheDocument();
    });

    it("shows friendly permission error for PERMISSION_DENIED error_code", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({
          ok: false,
          error_code: "PERMISSION_DENIED",
          message: "PERMISSION_DENIED: Acesso negado para tool 'get_job_summary'",
        }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(
        screen.getByText("Você não tem permissão para usar esta consulta."),
      ).toBeInTheDocument();
      // Must NOT show raw internal message
      expect(
        screen.queryByText(/Acesso negado para tool/),
      ).not.toBeInTheDocument();
    });

    it("shows friendly error for INTERNAL_ERROR error_code", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ ok: false, error_code: "INTERNAL_ERROR", message: "stack trace..." }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(
        screen.getByText("Erro interno ao processar a consulta. Tente novamente."),
      ).toBeInTheDocument();
      expect(screen.queryByText("stack trace...")).not.toBeInTheDocument();
    });
  });

  // ── Candidate page context ───────────────────────────────────────────────────

  describe("on candidate page (/candidatos/:candidateId)", () => {
    it("shows candidate-related actions", () => {
      renderDrawer("/candidatos/cand-456");
      expect(screen.getByTestId("ai-action-candidate.summary")).toBeInTheDocument();
      expect(screen.getByTestId("ai-action-candidate.active_pipeline")).toBeInTheDocument();
    });

    it("does not show job or admission actions", () => {
      renderDrawer("/candidatos/cand-456");
      expect(screen.queryByTestId("ai-action-job.summary")).not.toBeInTheDocument();
      expect(screen.queryByTestId("ai-action-admission.case_summary")).not.toBeInTheDocument();
    });

    it("calls service with correct candidate_id arg", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ intent: "candidate.summary" }),
      );
      renderDrawer("/candidatos/cand-456");

      await user.click(screen.getByTestId("ai-action-candidate.summary"));

      expect(aiAssistantService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "candidate.summary",
          arguments: { candidate_id: "cand-456" },
        }),
      );
    });
  });

  // ── Admission page context ───────────────────────────────────────────────────

  describe("on admission page (/admitidos/:admissionId)", () => {
    it("shows admission-related actions", () => {
      renderDrawer("/admitidos/adm-789");
      expect(screen.getByTestId("ai-action-admission.case_summary")).toBeInTheDocument();
      expect(screen.getByTestId("ai-action-admission.documents_status")).toBeInTheDocument();
    });

    it("calls service with correct admission_id arg", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ intent: "admission.case_summary" }),
      );
      renderDrawer("/admitidos/adm-789");

      await user.click(screen.getByTestId("ai-action-admission.case_summary"));

      expect(aiAssistantService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "admission.case_summary",
          arguments: { admission_id: "adm-789" },
        }),
      );
    });
  });

  // ── No context (generic page) ────────────────────────────────────────────────

  describe("on a generic page with no context", () => {
    it("shows empty state message", () => {
      renderDrawer("/admin/usuarios");
      expect(screen.getByTestId("ai-assistant-empty")).toBeInTheDocument();
    });

    it("shows the correct contextual empty message", () => {
      renderDrawer("/dashboard");
      expect(
        screen.getByText(/Abra uma vaga, candidato ou caso admissional/i),
      ).toBeInTheDocument();
    });

    it("does NOT call the API when no context is available", async () => {
      renderDrawer("/admin/usuarios");
      // No action buttons should be rendered — so no call is possible
      expect(screen.queryByTestId(/^ai-action-/)).not.toBeInTheDocument();
      expect(aiAssistantService.query).not.toHaveBeenCalled();
    });
  });

  // ── Sensitive data filtering ─────────────────────────────────────────────────

  describe("sensitive data filtering", () => {
    it("does not render sensitive keys in the result", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({
          data: {
            title: "Vaga Segura",
            vector_json: [1, 2, 3],
            content_hash: "abc123",
            embedding: [0.1, 0.2],
            embeddings: [[0.1]],
            payload_json: { secret: true },
            review_notes: "notas internas",
            internal_notes: "não expor",
          },
        }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByText("Vaga Segura")).toBeInTheDocument();
      expect(screen.queryByText("abc123")).not.toBeInTheDocument();
      expect(screen.queryByText("notas internas")).not.toBeInTheDocument();
      expect(screen.queryByText("não expor")).not.toBeInTheDocument();
      // Embedded values should not appear
      expect(screen.queryByText(/\[1,2,3\]/)).not.toBeInTheDocument();
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("renders gracefully when data is null", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: null, message: "Sem dados disponíveis." }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByText("Sem dados disponíveis.")).toBeInTheDocument();
    });

    it("renders gracefully when data is an empty object", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: {}, message: "Resultado vazio." }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      // Should not crash and should show the fallback message
      expect(screen.getByTestId("ai-assistant-result")).toBeInTheDocument();
    });

    it("renders gracefully when data is an empty array", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: [] }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByTestId("ai-assistant-result")).toBeInTheDocument();
    });

    it("renders array of primitives as comma-separated values", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: { skills: ["Python", "FastAPI", "SQL"] } }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByText("Python, FastAPI, SQL")).toBeInTheDocument();
    });
  });

  // ── Knowledge Base (RAG) ───────────────────────────────────────────────────

  describe("Knowledge Base (RAG)", () => {
    it("renders the Knowledge Base section", () => {
      renderDrawer();
      expect(screen.getByTestId("ai-knowledge-section")).toBeInTheDocument();
      expect(screen.getByText(/Base de conhecimento/i)).toBeInTheDocument();
    });

    it("disables search and answer buttons when input is empty", () => {
      renderDrawer();
      const searchBtn = screen.getByTestId("ai-knowledge-search");
      const answerBtn = screen.getByTestId("ai-knowledge-answer");
      expect(searchBtn).toBeDisabled();
      expect(answerBtn).toBeDisabled();
    });

    it("enables buttons when text is entered", async () => {
      const user = userEvent.setup();
      renderDrawer();
      const input = screen.getByTestId("ai-knowledge-input");
      await user.type(input, "como funciona o reembolso?");

      expect(screen.getByTestId("ai-knowledge-search")).toBeEnabled();
      expect(screen.getByTestId("ai-knowledge-answer")).toBeEnabled();
    });

    it("calls service with knowledge.search when 'Buscar fontes' is clicked", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ intent: "knowledge.search" }),
      );
      renderDrawer();

      const input = screen.getByTestId("ai-knowledge-input");
      await user.type(input, "feriados 2024");
      await user.click(screen.getByTestId("ai-knowledge-search"));

      expect(aiAssistantService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "knowledge.search",
          arguments: { query: "feriados 2024", limit: 5 },
        }),
      );
    });

    it("calls service with knowledge.answer when 'Responder' is clicked", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ intent: "knowledge.answer" }),
      );
      renderDrawer();

      const input = screen.getByTestId("ai-knowledge-input");
      await user.type(input, "política de home office");
      await user.click(screen.getByTestId("ai-knowledge-answer"));

      expect(aiAssistantService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: "knowledge.answer",
          arguments: { query: "política de home office", limit: 5 },
        }),
      );
    });

    it("renders chunks/sources from knowledge.search result", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: [{ source_title: "Manual RH", excerpt: "O home office é permitido...", score: 0.95 }],
        }),
      );
      renderDrawer();

      await user.type(screen.getByTestId("ai-knowledge-input"), "home office");
      await user.click(screen.getByTestId("ai-knowledge-search"));

      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      expect(screen.getByText("Manual RH")).toBeInTheDocument();
      expect(screen.getByText(/home office é permitido/)).toBeInTheDocument();
    });

    it("renders answer and sources from knowledge.answer result", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.answer",
          data: {
            answer: "Sim, o home office é permitido 2x por semana.",
            sources: [{ source_title: "Manual RH", excerpt: "Regra de home office..." }],
          },
        }),
      );
      renderDrawer();

      await user.type(screen.getByTestId("ai-knowledge-input"), "regras home office");
      await user.click(screen.getByTestId("ai-knowledge-answer"));

      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      expect(screen.getByText(/Sim, o home office é permitido/)).toBeInTheDocument();
      expect(screen.getByText("Manual RH")).toBeInTheDocument();
    });
  });

  describe("session history", () => {
    it("shows the session history section with an empty state", () => {
      renderDrawer();
      expect(screen.getByTestId("ai-session-history")).toBeInTheDocument();
      expect(screen.getByTestId("ai-session-history-empty")).toBeInTheDocument();
    });

    it("adds a successful action to history with label, time and summary", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: { title: "Dev Sênior" } }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      await user.click(screen.getByTestId("ai-assistant-new-query"));

      const history = screen.getByTestId("ai-session-history-list");
      expect(history).toBeInTheDocument();
      expect(within(history).getByText(/Resumo da vaga/)).toBeInTheDocument();
      expect(within(history).getByText(/Dev Sênior/)).toBeInTheDocument();
      expect(within(history).getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
    });

    it("registers RAG queries in history", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: [{ source_title: "Manual RH", excerpt: "Trecho", score: 0.91 }],
        }),
      );
      renderDrawer();

      await user.type(screen.getByTestId("ai-knowledge-input"), "exportação Protheus");
      await user.click(screen.getByTestId("ai-knowledge-search"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      await user.click(screen.getByTestId("ai-assistant-new-query"));

      const history = screen.getByTestId("ai-session-history-list");
      expect(within(history).getByText("Buscar fontes")).toBeInTheDocument();
      expect(within(history).getByText("exportação Protheus")).toBeInTheDocument();
    });

    it("limits history to the latest five items", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query)
        .mockResolvedValueOnce(makeResponse({ data: { title: "Item 1" } }))
        .mockResolvedValueOnce(makeResponse({ data: { title: "Item 2" } }))
        .mockResolvedValueOnce(makeResponse({ data: { title: "Item 3" } }))
        .mockResolvedValueOnce(makeResponse({ data: { title: "Item 4" } }))
        .mockResolvedValueOnce(makeResponse({ data: { title: "Item 5" } }))
        .mockResolvedValueOnce(makeResponse({ data: { title: "Item 6" } }));
      renderDrawer("/vagas/job-123");

      for (let i = 0; i < 6; i += 1) {
        await user.click(screen.getByTestId("ai-action-job.summary"));
        await waitFor(() => screen.getByTestId("ai-assistant-result"));
        await user.click(screen.getByTestId("ai-assistant-new-query"));
      }

      expect(screen.getAllByRole("button").filter((node) => node.dataset.testid?.startsWith("ai-session-history-item-"))).toHaveLength(5);
      expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
      expect(screen.getByText("Item 6")).toBeInTheDocument();
    });

    it("reopens a history item without calling the API again", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: { title: "Snapshot salvo" } }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      await user.click(screen.getByTestId("ai-assistant-new-query"));

      expect(aiAssistantService.query).toHaveBeenCalledTimes(1);
      await user.click(screen.getAllByRole("button").find((node) => node.dataset.testid?.startsWith("ai-session-history-item-"))!);

      expect(aiAssistantService.query).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Snapshot salvo")).toBeInTheDocument();
    });

    it("clears history when requested", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      await user.click(screen.getByTestId("ai-assistant-new-query"));
      await user.click(screen.getByTestId("ai-session-history-clear"));

      expect(screen.getByTestId("ai-session-history-empty")).toBeInTheDocument();
    });

    it("records thrown errors in history", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockRejectedValueOnce(new Error("Erro de permissão"));
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-error"));
      await user.click(screen.getByTestId("ai-assistant-back"));

      expect(screen.getByText("Erro de permissão")).toBeInTheDocument();
      expect(screen.getByText(/erro/)).toBeInTheDocument();
    });

    it("stores sanitized results in history snapshots", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({
          data: {
            title: "Resultado seguro",
            content_hash: "hash-secreto",
            vector_json: [1, 2, 3],
            embedding: [0.1, 0.2],
            embeddings: [[0.3, 0.4]],
          },
        }),
      );
      render(<PersistentHistoryHarness />);

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      const historyJson = screen.getByTestId("history-json").textContent ?? "";
      expect(historyJson).toContain("Resultado seguro");
      expect(historyJson).not.toContain("content_hash");
      expect(historyJson).not.toContain("vector_json");
      expect(historyJson).not.toContain("embedding");
      expect(historyJson).not.toContain("embeddings");
    });

    it("keeps history after close and reopen while parent remains mounted", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: { title: "Persistido no shell" } }),
      );
      render(<PersistentHistoryHarness />);

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));
      await user.click(screen.getByTestId("ai-assistant-new-query"));
      await user.click(screen.getByTestId("ai-assistant-close"));
      await user.click(screen.getByTestId("open-assistant"));

      expect(screen.getByText("Persistido no shell")).toBeInTheDocument();
    });

    it("does not use localStorage or sessionStorage while recording history", async () => {
      const user = userEvent.setup();
      const localSpy = vi.spyOn(Storage.prototype, "setItem");
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(localSpy).not.toHaveBeenCalled();
      localSpy.mockRestore();
    });

    it("renders HTML-like text as plain text", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ data: { summary: "<strong>texto bruto</strong>" } }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-result"));

      expect(screen.getByText("<strong>texto bruto</strong>")).toBeInTheDocument();
      expect(document.querySelector("strong")).not.toBeInTheDocument();
    });
  });

  // ── Warnings ─────────────────────────────────────────────────────────────────

  describe("warnings", () => {
    it("displays warnings when present in response", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ warnings: ["rag_synthesis_disabled_by_flag"] }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-warnings"));

      expect(screen.getByTestId("ai-assistant-warnings")).toBeInTheDocument();
    });

    it("translates known warning codes to Portuguese", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ warnings: ["rag_synthesis_disabled_by_flag"] }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-warnings"));

      expect(
        screen.getByText("Síntese de resposta desabilitada (modo busca simples ativo)."),
      ).toBeInTheDocument();
      // Should NOT show the raw English code
      expect(
        screen.queryByText("rag_synthesis_disabled_by_flag"),
      ).not.toBeInTheDocument();
    });

    it("shows unknown warning codes as-is", async () => {
      const user = userEvent.setup();
      vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
        makeResponse({ warnings: ["unknown_warning_code"] }),
      );
      renderDrawer("/vagas/job-123");

      await user.click(screen.getByTestId("ai-action-job.summary"));
      await waitFor(() => screen.getByTestId("ai-assistant-warnings"));

      expect(screen.getByText("unknown_warning_code")).toBeInTheDocument();
    });
  });
});
