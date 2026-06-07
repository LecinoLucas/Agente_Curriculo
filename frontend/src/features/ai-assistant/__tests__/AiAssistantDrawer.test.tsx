import { useState } from "react";
import { readFileSync } from "node:fs";
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

  it("renders the drawer with readonly notice", () => {
    renderDrawer();
    expect(screen.getByTestId("ai-assistant-drawer")).toBeInTheDocument();
    expect(screen.getByText(/Somente leitura/i)).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      "Contexto atual: Vaga",
    );
  });

  it("renders friendly warning for embedding_provider_error", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.search",
        data: { chunks: [] },
        warnings: ["embedding_provider_error: RuntimeError"],
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "protheus");
    await user.click(screen.getByTestId("ai-knowledge-search"));

    await waitFor(() => screen.getByTestId("ai-assistant-warnings"));
    expect(
      screen.getByText(/Não foi possível consultar os embeddings agora/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/embedding_provider_error/i)).not.toBeInTheDocument();
  });

  it("renders friendly warning for PROVIDER_UNAVAILABLE", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        data: { answer: "Sem síntese." },
        warnings: ["PROVIDER_UNAVAILABLE"],
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "protheus");
    await user.click(screen.getByTestId("ai-knowledge-answer"));

    await waitFor(() => screen.getByTestId("ai-assistant-warnings"));
    expect(
      screen.getAllByText(/O provedor de IA está temporariamente indisponível/i).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("PROVIDER_UNAVAILABLE")).not.toBeInTheDocument();
  });

  it("renders friendly warning for PROVIDER_RATE_LIMITED", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        data: { answer: "Sem síntese." },
        warnings: ["PROVIDER_RATE_LIMITED"],
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "protheus");
    await user.click(screen.getByTestId("ai-knowledge-answer"));

    await waitFor(() => screen.getByTestId("ai-assistant-warnings"));
    expect(
      screen.getByText(/O limite de uso do provedor foi atingido temporariamente/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("PROVIDER_RATE_LIMITED")).not.toBeInTheDocument();
  });

  it("renders knowledge.search with the 'Fontes encontradas' section", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.search",
        data: {
          query: "home office",
          chunks: [
            {
              source_title: "Manual RH",
              content: "O home office é permitido em até dois dias por semana.",
              score: 0.95,
            },
          ],
        },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "home office");
    await user.click(screen.getByTestId("ai-knowledge-search"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(screen.getByText("Fontes encontradas")).toBeInTheDocument();
    expect(screen.getByText("Manual RH")).toBeInTheDocument();
  });

  it("renders friendly empty message for empty knowledge.search", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.search",
        data: { query: "política inexistente", chunks: [] },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "política inexistente");
    await user.click(screen.getByTestId("ai-knowledge-search"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(screen.getByText("Nenhuma fonte encontrada para essa pergunta.")).toBeInTheDocument();
    expect(
      screen.getByText(/Tente consultar com termos mais específicos/i),
    ).toBeInTheDocument();
  });

  it("renders knowledge.answer with the 'Resposta' section", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        data: {
          answer: "O home office é permitido em até dois dias por semana.",
          sources: [{ source_title: "Manual RH", excerpt: "Regra de home office..." }],
        },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "home office");
    await user.click(screen.getByTestId("ai-knowledge-answer"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(screen.getByText("Resposta")).toBeInTheDocument();
    expect(screen.getByText(/O home office é permitido/i)).toBeInTheDocument();
  });

  it("renders sources for knowledge.answer", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        data: {
          answer: "Use o checklist antes de exportar.",
          sources: [
            { source_title: "Checklist Admissional", excerpt: "Revise todos os itens..." },
            { source_title: "Regras Protheus", excerpt: "Somente exporte após validação..." },
          ],
        },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "exportação");
    await user.click(screen.getByTestId("ai-knowledge-answer"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(screen.getByText("Checklist Admissional")).toBeInTheDocument();
    expect(screen.getByText("Regras Protheus")).toBeInTheDocument();
  });

  it("renders provider unavailable for knowledge.answer without raw RuntimeError", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        ok: false,
        intent: "knowledge.answer",
        error_code: "PROVIDER_UNAVAILABLE",
        message: "RuntimeError: provider unavailable",
        data: null,
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "exportação");
    await user.click(screen.getByTestId("ai-knowledge-answer"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(
      screen.getAllByText(/O provedor de IA está temporariamente indisponível/i).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/RuntimeError/)).not.toBeInTheDocument();
  });

  it("does not render content_hash, vector_json, embedding or payload_json", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        data: {
          title: "Resultado seguro",
          content_hash: "hash-secreto",
          vector_json: [1, 2, 3],
          embedding: [0.1, 0.2],
          payload_json: { raw: true },
        },
      }),
    );
    renderDrawer("/vagas/job-123");

    await user.click(screen.getByTestId("ai-action-job.summary"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText(/Resultado seguro/)).toBeInTheDocument();
    expect(screen.queryByText(/hash-secreto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vector_json/)).not.toBeInTheDocument();
    expect(screen.queryByText(/payload_json/)).not.toBeInTheDocument();
  });

  it("does not render stack traces", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        ok: false,
        error_code: "INTERNAL_ERROR",
        message: 'Traceback (most recent call last)\nFile "/tmp/x.py", line 2',
      }),
    );
    renderDrawer("/vagas/job-123");

    await user.click(screen.getByTestId("ai-action-job.summary"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText(/Não foi possível concluir a consulta agora/i)).toBeInTheDocument();
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument();
  });

  it("shows a safe suggested next step when applicable", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "admission.documents_status",
        data: {
          candidate_name: "Ana Souza",
          documents: [{ checklist_title: "CPF", status: "pending" }],
          total_documents: 1,
          ready_for_export: false,
          progress: { pending: 1, rejected: 0 },
        },
      }),
    );
    renderDrawer("/admissao/case-123");

    await user.click(screen.getByTestId("ai-action-admission.documents_status"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText("Próximo passo sugerido")).toBeInTheDocument();
    expect(
      screen.getByText(/Revise os documentos pendentes antes de tentar exportar/i),
    ).toBeInTheDocument();
  });

  it("shows generic empty state on non-contextual routes", () => {
    renderDrawer("/rh");
    expect(screen.getByTestId("ai-assistant-empty")).toBeInTheDocument();
    expect(
      screen.getByText("Não encontrei uma vaga, candidato ou admissão nesta tela."),
    ).toBeInTheDocument();
    expect(screen.getByText("Você ainda pode consultar a Base de Conhecimento.")).toBeInTheDocument();
  });

  it("shows route-specific empty state for candidates without candidateId", () => {
    renderDrawer("/candidatos");
    expect(screen.getByText("Não identifiquei o candidato atual")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-action-candidate.summary")).not.toBeInTheDocument();
  });

  it("hides job actions when the job id is missing", () => {
    renderDrawer("/vagas");
    expect(screen.getByText("Não identifiquei a vaga atual")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-action-job.summary")).not.toBeInTheDocument();
  });

  it("derives job context and keeps job actions visible on job routes", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      "Contexto atual: Vaga",
    );
    expect(screen.getByTestId("ai-action-job.summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-job.requirements")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-pipeline.overview")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-knowledge.job_quality_rules")).toBeInTheDocument();
  });

  it("shows job suggestions on job routes", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.getByText("Sugestões para esta tela")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.structured_job")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.requirements")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.anti_discrimination")).toBeInTheDocument();
  });

  it("derives candidate context and keeps candidate actions visible on candidate routes", () => {
    renderDrawer("/candidatos/cand-456");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      "Contexto atual: Candidato",
    );
    expect(screen.getByTestId("ai-action-candidate.summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-candidate.active_pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-knowledge.fair_evaluation_rules")).toBeInTheDocument();
  });

  it("shows candidate suggestions on candidate routes", () => {
    renderDrawer("/candidatos/cand-456");
    expect(screen.getByTestId("ai-suggestion-suggestion.candidate.summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.candidate.active_pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.candidate.bias")).toBeInTheDocument();
  });

  it("uses job_id on job routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
    renderDrawer("/vagas/123");

    await user.click(screen.getByTestId("ai-action-job.summary"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "job.summary",
        arguments: { job_id: "123" },
      }),
    );
  });

  it("uses job_id on job suggestions with safe payload", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "job.requirements" }),
    );
    renderDrawer("/vagas/123");

    await user.click(screen.getByTestId("ai-suggestion-suggestion.job.requirements"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "job.requirements",
        arguments: { job_id: "123" },
      }),
    );
  });

  it("uses admission_case_id on admission routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "admission.case_summary" }),
    );
    renderDrawer("/admission/cases/case-456");

    await user.click(screen.getByTestId("ai-action-admission.case_summary"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "admission.case_summary",
        arguments: { admission_case_id: "case-456" },
      }),
    );
  });

  it("derives admission context and renders admission actions", () => {
    renderDrawer("/admission/cases/case-456");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      "Contexto atual: Admissão",
    );
    expect(screen.getByTestId("ai-action-admission.case_summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-admission.documents_status")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-admission.events_summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-knowledge.pre_admission_rules")).toBeInTheDocument();
  });

  it("shows admission suggestions on admission routes", () => {
    renderDrawer("/admission/cases/case-456");
    expect(screen.getByTestId("ai-suggestion-suggestion.admission.export_readiness")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admission.documents")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admission.pre_admission_rules")).toBeInTheDocument();
  });

  it("hides actions that require a missing ID", () => {
    renderDrawer("/admission/cases/case-456");
    expect(screen.queryByTestId("ai-action-protheus.export_status")).not.toBeInTheDocument();
  });

  it("does not show protheus suggestion without package_id", () => {
    renderDrawer("/admission/cases/case-456");
    expect(
      screen.queryByTestId("ai-suggestion-suggestion.admission.protheus_status"),
    ).not.toBeInTheDocument();
  });

  it("shows protheus action when package_id is available in the route", () => {
    renderDrawer("/admission/cases/case-456?packageId=pkg-9");
    expect(screen.getByTestId("ai-action-protheus.export_status")).toBeInTheDocument();
  });

  it("shows protheus suggestion when package_id is available in the route", () => {
    renderDrawer("/admission/cases/case-456?packageId=pkg-9");
    expect(
      screen.getByTestId("ai-suggestion-suggestion.admission.protheus_status"),
    ).toBeInTheDocument();
  });

  it("derives admin context and renders safe admin shortcuts", () => {
    renderDrawer("/admin");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      "Contexto atual: Administração",
    );
    expect(screen.getByTestId("ai-action-nav.admin.ia")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-nav.admin.health")).toBeInTheDocument();
    expect(screen.getByTestId("ai-action-knowledge.assistant_policy")).toBeInTheDocument();
  });

  it("shows admin governance suggestions on admin routes", () => {
    renderDrawer("/admin");
    expect(screen.getByTestId("ai-suggestion-suggestion.admin.assistant_policy")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admin.safe_ai_rules")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admin.lab")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admin.credentials")).toBeInTheDocument();
  });

  it("shows knowledge suggestions on generic routes", () => {
    renderDrawer("/rh");
    expect(screen.getByTestId("ai-suggestion-suggestion.generic.pre_admission_rules")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.generic.protheus_rules")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.generic.anti_discrimination")).toBeInTheDocument();
  });

  it("clicking a suggestion calls assistant endpoint with the correct intent", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "candidate.summary" }),
    );
    renderDrawer("/candidatos/cand-456");

    await user.click(screen.getByTestId("ai-suggestion-suggestion.candidate.summary"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "candidate.summary",
        arguments: { candidate_id: "cand-456" },
      }),
    );
  });

  it("uses the predefined query for knowledge suggestions", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "knowledge.search", data: { query: "", chunks: [] } }),
    );
    renderDrawer("/admin");

    await user.click(screen.getByTestId("ai-suggestion-suggestion.admin.assistant_policy"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "knowledge.search",
        arguments: {
          query: "O assistente pode executar ações automaticamente?",
          limit: 5,
        },
      }),
    );
  });

  it("does not render prohibited write suggestions", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.queryByText("Contratar candidato")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejeitar candidato")).not.toBeInTheDocument();
    expect(screen.queryByText("Aprovar documento")).not.toBeInTheDocument();
    expect(screen.queryByText("Exportar para Protheus")).not.toBeInTheDocument();
    expect(screen.queryByText("Enviar e-mail")).not.toBeInTheDocument();
    expect(screen.queryByText("Alterar vaga")).not.toBeInTheDocument();
    expect(screen.queryByText("Mover no pipeline")).not.toBeInTheDocument();
  });

  it("does not use dangerouslySetInnerHTML in the assistant drawer implementation", () => {
    const drawerSource = readFileSync(
      "src/features/ai-assistant/components/AiAssistantDrawer.tsx",
      "utf-8",
    );
    const rendererSource = readFileSync(
      "src/features/ai-assistant/components/AiAssistantResultRenderer.tsx",
      "utf-8",
    );

    expect(drawerSource).not.toContain("dangerouslySetInnerHTML");
    expect(rendererSource).not.toContain("dangerouslySetInnerHTML");
  });

  it("stores sanitized and translated snapshots in session history", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        ok: false,
        error_code: "PROVIDER_UNAVAILABLE",
        message: "RuntimeError: provider unavailable",
        warnings: ["embedding_provider_error: RuntimeError"],
      }),
    );
    render(<PersistentHistoryHarness />);

    await user.type(screen.getByTestId("ai-knowledge-input"), "exportação");
    await user.click(screen.getByTestId("ai-knowledge-answer"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).toContain('"domain":"job"');
    expect(historyJson).toContain('"entityId":"job-123"');
    expect(historyJson).not.toContain("embedding_provider_error");
    expect(historyJson).not.toContain("RuntimeError");
    expect(historyJson).toContain("temporariamente indisponível");
  });

  it("stores the clicked suggestion label in history", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "knowledge.search", data: { query: "", chunks: [] } }),
    );
    render(<PersistentHistoryHarness path="/vagas/job-123" />);

    await user.click(screen.getByTestId("ai-suggestion-suggestion.job.structured_job"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).toContain("Essa vaga está bem estruturada?");
  });

  it("keeps base de conhecimento available in every context", () => {
    renderDrawer("/admin");
    expect(screen.getByTestId("ai-knowledge-section")).toBeInTheDocument();
  });

  it("reopens history without issuing a new request", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ data: { title: "Snapshot salvo" } }),
    );
    renderDrawer("/vagas/job-123");

    await user.click(screen.getByTestId("ai-action-job.summary"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    await user.click(screen.getByTestId("ai-assistant-new-query"));

    expect(aiAssistantService.query).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getAllByRole("button").find((node) =>
        node.dataset.testid?.startsWith("ai-session-history-item-"),
      )!,
    );

    expect(aiAssistantService.query).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Snapshot salvo/)).toBeInTheDocument();
  });

  it("clears the session history", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
    renderDrawer("/vagas/job-123");

    await user.click(screen.getByTestId("ai-action-job.summary"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    await user.click(screen.getByTestId("ai-assistant-new-query"));
    await user.click(screen.getByTestId("ai-session-history-clear"));

    expect(screen.getByTestId("ai-session-history-empty")).toBeInTheDocument();
  });

  it("renders html-like text as plain text", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        data: { answer: "<strong>texto bruto</strong>", sources: [] },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-knowledge-input"), "html");
    await user.click(screen.getByTestId("ai-knowledge-answer"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText("<strong>texto bruto</strong>")).toBeInTheDocument();
    expect(document.querySelector("strong")).not.toBeInTheDocument();
  });
});
