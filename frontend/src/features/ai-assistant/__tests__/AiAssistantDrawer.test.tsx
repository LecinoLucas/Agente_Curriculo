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
    expect(screen.getByText(/Ações recomendadas para esta tela/i)).toBeInTheDocument();
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      /Contexto: Vaga/i,
    );
  });

  it("renders the controlled text intent field", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.getByTestId("ai-text-intent-section")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Essa vaga está bem estruturada/i)).toBeInTheDocument();
  });

  it("uses the job placeholder in text intent input", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.getByTestId("ai-text-intent-input")).toHaveAttribute(
      "placeholder",
      "Ex.: Essa vaga está bem estruturada?",
    );
  });

  it("uses the candidate placeholder in text intent input", () => {
    renderDrawer("/candidatos/cand-456");
    expect(screen.getByTestId("ai-text-intent-input")).toHaveAttribute(
      "placeholder",
      "Ex.: Onde esse candidato está no processo?",
    );
  });

  it("uses the admission placeholder in text intent input", () => {
    renderDrawer("/admission/cases/case-456");
    expect(screen.getByTestId("ai-text-intent-input")).toHaveAttribute(
      "placeholder",
      "Ex.: O que falta para exportar essa admissão?",
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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-warnings"));
    expect(
      screen.getByText(/O limite de uso do provedor foi atingido temporariamente/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("PROVIDER_RATE_LIMITED")).not.toBeInTheDocument();
  });

  it("sanitizes warning with stack trace", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.search",
        data: { chunks: [] },
        warnings: ['Traceback (most recent call last): File "/app/main.py", line 10'],
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-warnings"));
    const warningsText = screen.getByTestId("ai-assistant-warnings").textContent ?? "";
    expect(warningsText).toContain("Detalhes técnicos internos foram ocultados.");
    expect(warningsText).not.toContain("Traceback");
    expect(warningsText).not.toContain("/app/main.py");
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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(screen.getByText("Fontes encontradas")).toBeInTheDocument();
    expect(screen.getByText("Manual RH")).toBeInTheDocument();
  });

  it("does not render cpf phone or email in knowledge.search snippets", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.search",
        data: {
          query: "dados pessoais",
          chunks: [
            {
              source_title: "Documento com CPF",
              content: "CPF 123.456.789-00 telefone (11) 91234-5678 email qa@example.test",
              score: 0.91,
            },
          ],
        },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    const resultText = screen.getByTestId("ai-assistant-result").textContent ?? "";
    expect(resultText).toContain("[cpf_removido]");
    expect(resultText).toContain("[telefone_removido]");
    expect(resultText).toContain("[email_removido]");
    expect(resultText).not.toContain("123.456.789-00");
    expect(resultText).not.toContain("91234-5678");
    expect(resultText).not.toContain("qa@example.test");
  });

  it("does not render internal fields in knowledge.search snippets", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.search",
        data: {
          query: "campos internos",
          chunks: [
            {
              source_title: "payload_json confidencial",
              content:
                'payload_json: {"cpf":"12345678900"} vector_json: [1,2] embedding: [0.1]',
              content_hash: "abc123",
              score: 0.82,
            },
          ],
        },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    const resultText = screen.getByTestId("ai-assistant-result").textContent ?? "";
    expect(resultText).toContain("[segredo_removido]");
    expect(resultText).not.toContain("payload_json");
    expect(resultText).not.toContain("vector_json");
    expect(resultText).not.toContain("embedding");
    expect(resultText).not.toContain("content_hash");
    expect(resultText).not.toContain("12345678900");
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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

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

    await user.type(screen.getByTestId("ai-text-intent-input"), "responda politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    expect(screen.getByText("Resposta")).toBeInTheDocument();
    expect(screen.getByText(/O home office é permitido/i)).toBeInTheDocument();
  });

  it("does not render cpf in knowledge.answer", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        data: {
          answer: "O CPF 123.456.789-00 foi localizado para validação.",
          sources: [{ source_title: "Documento com CPF", excerpt: "CPF 12345678900" }],
        },
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-text-intent-input"), "responda politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    const resultText = screen.getByTestId("ai-assistant-result").textContent ?? "";
    expect(resultText).toContain("[cpf_removido]");
    expect(resultText).not.toContain("123.456.789-00");
    expect(resultText).not.toContain("12345678900");
  });

  it("renders friendly provider error without technical details", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({
        intent: "knowledge.answer",
        ok: false,
        error_code: null,
        message:
          'Traceback (most recent call last): File "/app/main.py", line 10, in <module>',
      }),
    );
    renderDrawer();

    await user.type(screen.getByTestId("ai-text-intent-input"), "responda politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    const resultText = screen.getByTestId("ai-assistant-result").textContent ?? "";
    expect(resultText).toContain("Detalhes técnicos internos foram ocultados");
    expect(resultText).not.toContain("Traceback");
    expect(resultText).not.toContain("/app/main.py");
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

    await user.type(screen.getByTestId("ai-text-intent-input"), "responda politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

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

    await user.type(screen.getByTestId("ai-text-intent-input"), "responda politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

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

    await user.click(screen.getByTestId("ai-suggestion-job.summary"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText(/Resultado seguro/)).toBeInTheDocument();
    expect(screen.queryByText(/hash-secreto/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vector_json/)).not.toBeInTheDocument();
    expect(screen.queryByText(/payload_json/)).not.toBeInTheDocument();
    expect(screen.queryByText(/embedding/)).not.toBeInTheDocument();
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

    await user.click(screen.getByTestId("ai-suggestion-job.summary"));
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

    await user.click(screen.getByTestId("ai-suggestion-admission.documents_status"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText("Próximo passo sugerido")).toBeInTheDocument();
    expect(
      screen.getByText(/Revise os documentos pendentes antes de tentar exportar/i),
    ).toBeInTheDocument();
  });

  

  

  

  it("derives job context and keeps job actions visible on job routes", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      /Contexto: Vaga/i,
    );
    expect(screen.getByTestId("ai-suggestion-job.summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-job.requirements")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-pipeline.overview")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-knowledge.job_quality_rules")).toBeInTheDocument();
  });

  it("shows job suggestions on job routes", () => {
    renderDrawer("/vagas/job-123");
    expect(screen.getByText("Sugestões rápidas")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.structured_job")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.requirements")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.job.anti_discrimination")).toBeInTheDocument();
  });

  it("derives candidate context and keeps candidate actions visible on candidate routes", () => {
    renderDrawer("/candidatos/cand-456");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      /Contexto: Candidato/i,
    );
    expect(screen.getByTestId("ai-suggestion-candidate.summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-candidate.active_pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-knowledge.fair_evaluation_rules")).toBeInTheDocument();
  });

  it("shows candidate suggestions on candidate routes", () => {
    renderDrawer("/candidatos/cand-456");
    expect(screen.getByTestId("ai-suggestion-suggestion.candidate.summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.candidate.active_pipeline")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.candidate.bias")).toBeInTheDocument();
  });

  it("classifies 'resumo do candidato' to candidate.summary", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "candidate.summary" }),
    );
    renderDrawer("/candidatos/456");

    await user.type(screen.getByTestId("ai-text-intent-input"), "resumo do candidato");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "candidate.summary",
        arguments: { candidate_id: "456" },
      }),
    );
  });

  it("uses job_id on job routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
    renderDrawer("/vagas/123");

    await user.click(screen.getByTestId("ai-suggestion-job.summary"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "job.summary",
        arguments: { job_id: "123" },
      }),
    );
  });

  it("classifies 'resumo da vaga' to job.summary on job routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(makeResponse());
    renderDrawer("/vagas/123");

    await user.type(screen.getByTestId("ai-text-intent-input"), "resumo da vaga");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "job.summary",
        arguments: { job_id: "123" },
      }),
    );
    
  });

  it("classifies 'quais requisitos da vaga' to job.requirements on job routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "job.requirements" }),
    );
    renderDrawer("/vagas/123");

    await user.type(screen.getByTestId("ai-text-intent-input"), "quais requisitos da vaga");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "job.requirements",
        arguments: { job_id: "123" },
      }),
    );
  });

  it("classifies 'como está a pipeline' to pipeline.overview on job routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "pipeline.overview" }),
    );
    renderDrawer("/vagas/123");

    await user.type(screen.getByTestId("ai-text-intent-input"), "como está a pipeline");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "pipeline.overview",
        arguments: { job_id: "123" },
      }),
    );
  });

  it("creates a composite plan for 'essa vaga está pronta' on job routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(makeResponse({ intent: "job.summary", data: { title: "Vaga A" } }))
      .mockResolvedValueOnce(
        makeResponse({ intent: "job.requirements", data: { required_items: ["Python"] } }),
      )
      .mockResolvedValueOnce(
        makeResponse({ intent: "pipeline.overview", data: { total_candidates: 3 } }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: { query: "", chunks: [{ source_title: "Guia", content: "Texto seguro" }] },
        }),
      );
    renderDrawer("/vagas/123");

    await user.type(screen.getByTestId("ai-text-intent-input"), "essa vaga está pronta?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));
    expect(aiAssistantService.query).toHaveBeenCalledTimes(4);
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        intent: "job.summary",
        arguments: { job_id: "123" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        intent: "job.requirements",
        arguments: { job_id: "123" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        intent: "pipeline.overview",
        arguments: { job_id: "123" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        intent: "knowledge.search",
        arguments: {
          query: "Quais critérios tornam uma vaga objetiva, segura e bem estruturada?",
          limit: 5,
        },
      }),
    );
    expect(screen.getByText("Consultas realizadas")).toBeInTheDocument();
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

    await user.click(screen.getByTestId("ai-suggestion-admission.case_summary"));

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
      /Contexto: Admissão/i,
    );
    expect(screen.getByTestId("ai-suggestion-admission.case_summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-admission.documents_status")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-admission.events_summary")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-knowledge.pre_admission_rules")).toBeInTheDocument();
  });

  it("shows admission suggestions on admission routes", () => {
    renderDrawer("/admission/cases/case-456");
    expect(screen.getByTestId("ai-suggestion-suggestion.admission.export_readiness")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admission.documents")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-suggestion.admission.pre_admission_rules")).toBeInTheDocument();
  });

  it("creates a composite plan for 'o que falta para exportar' on admission routes", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(
        makeResponse({ intent: "admission.case_summary", data: { candidate_name: "Ana" } }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          intent: "admission.documents_status",
          data: { documents: [{ checklist_title: "CPF", status: "pending" }] },
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({ intent: "admission.events_summary", data: { events: ["Envio"] } }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: { query: "", chunks: [{ source_title: "Regras", content: "Texto seguro" }] },
        }),
      );
    renderDrawer("/admission/cases/case-456");

    await user.type(screen.getByTestId("ai-text-intent-input"), "o que falta para exportar");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));
    expect(aiAssistantService.query).toHaveBeenCalledTimes(4);
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        intent: "admission.case_summary",
        arguments: { admission_case_id: "case-456" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        intent: "admission.documents_status",
        arguments: { admission_case_id: "case-456" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        intent: "admission.events_summary",
        arguments: { admission_case_id: "case-456" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        intent: "knowledge.search",
        arguments: {
          query:
            "Quais documentos e condições precisam estar aprovados antes da exportação admissional para o Protheus?",
          limit: 5,
        },
      }),
    );
    expect(screen.getByText("Consultas realizadas")).toBeInTheDocument();
  });

  it("does not render cpf inside composite step results", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(
        makeResponse({ intent: "admission.case_summary", data: { candidate_name: "Ana" } }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          intent: "admission.documents_status",
          data: { documents: [{ checklist_title: "CPF", status: "pending" }] },
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({ intent: "admission.events_summary", data: { events: ["CPF 123.456.789-00"] } }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: {
            query: "",
            chunks: [{ source_title: "Documento com CPF", content: "CPF 123.456.789-00" }],
          },
        }),
      );
    render(<PersistentHistoryHarness path="/admission/cases/case-456" />);

    await user.type(screen.getByTestId("ai-text-intent-input"), "o que falta para exportar");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));
    const compositeText = screen.getByTestId("ai-assistant-composite-result").textContent ?? "";
    expect(compositeText).toContain("[cpf_removido]");
    expect(compositeText).not.toContain("123.456.789-00");
  });

  it("classifies 'quais documentos estão pendentes' to admission.documents_status", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "admission.documents_status" }),
    );
    renderDrawer("/admission/cases/case-456");

    await user.type(screen.getByTestId("ai-text-intent-input"), "quais documentos estão pendentes");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "admission.documents_status",
        arguments: { admission_case_id: "case-456" },
      }),
    );
  });

  it("hides actions that require a missing ID", () => {
    renderDrawer("/admission/cases/case-456");
    expect(screen.queryByTestId("ai-suggestion-protheus.export_status")).not.toBeInTheDocument();
  });

  it("does not show protheus suggestion without package_id", () => {
    renderDrawer("/admission/cases/case-456");
    expect(
      screen.queryByTestId("ai-suggestion-suggestion.admission.protheus_status"),
    ).not.toBeInTheDocument();
  });

  it("shows protheus action when package_id is available in the route", () => {
    renderDrawer("/admission/cases/case-456?packageId=pkg-9");
    expect(screen.getByTestId("ai-suggestion-protheus.export_status")).toBeInTheDocument();
  });

  it("shows protheus suggestion when package_id is available in the route", () => {
    renderDrawer("/admission/cases/case-456?packageId=pkg-9");
    expect(
      screen.getByTestId("ai-suggestion-suggestion.admission.protheus_status"),
    ).toBeInTheDocument();
  });

  it("includes protheus.export_status in admission composite only when package_id exists", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(makeResponse({ intent: "admission.case_summary", data: {} }))
      .mockResolvedValueOnce(makeResponse({ intent: "admission.documents_status", data: {} }))
      .mockResolvedValueOnce(makeResponse({ intent: "admission.events_summary", data: {} }))
      .mockResolvedValueOnce(
        makeResponse({ intent: "knowledge.search", data: { query: "", chunks: [] } }),
      )
      .mockResolvedValueOnce(makeResponse({ intent: "protheus.export_status", data: {} }));
    renderDrawer("/admission/cases/case-456?packageId=pkg-9");

    await user.type(screen.getByTestId("ai-text-intent-input"), "o que falta para exportar");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));
    expect(aiAssistantService.query).toHaveBeenCalledTimes(5);
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        intent: "protheus.export_status",
        arguments: { package_id: "pkg-9" },
      }),
    );
  });

  it("derives admin context and renders safe admin shortcuts", () => {
    renderDrawer("/admin");
    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      /Contexto: Administração/i,
    );
    expect(screen.getByTestId("ai-suggestion-nav.admin.ia")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-nav.admin.health")).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-knowledge.assistant_policy")).toBeInTheDocument();
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

  it("creates a composite plan for 'qual próximo passo com esse candidato'", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(makeResponse({ intent: "candidate.summary", data: { name: "Ana" } }))
      .mockResolvedValueOnce(
        makeResponse({ intent: "candidate.resume_analysis", data: { stage: "triagem" } }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: { query: "", chunks: [{ source_title: "Guia", content: "Sem viés" }] },
        }),
      );
    renderDrawer("/candidatos/456");

    await user.type(
      screen.getByTestId("ai-text-intent-input"),
      "qual próximo passo com esse candidato?",
    );
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));
    expect(aiAssistantService.query).toHaveBeenCalledTimes(3);
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        intent: "candidate.summary",
        arguments: { candidate_id: "456" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        intent: "candidate.resume_analysis",
        arguments: { candidate_id: "456" },
      }),
    );
    expect(aiAssistantService.query).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        intent: "knowledge.search",
        arguments: {
          query: "Quais cuidados devem ser observados para avaliar candidatos sem viés?",
          limit: 5,
        },
      }),
    );
  });

  it("renders partial composite results when one step fails", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(makeResponse({ intent: "admission.case_summary", data: { ok: true } }))
      .mockResolvedValueOnce(
        makeResponse({ intent: "admission.documents_status", data: { ready_for_export: false } }),
      )
      .mockRejectedValueOnce(new Error("events timeout"))
      .mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: { query: "", chunks: [{ source_title: "Base", content: "Regra" }] },
        }),
      );
    renderDrawer("/admission/cases/case-456");

    await user.type(screen.getByTestId("ai-text-intent-input"), "o que falta para exportar");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));
    expect(screen.getByText("Limitações")).toBeInTheDocument();
    expect(screen.getByText(/não consegui consultar eventos recentes agora/i)).toBeInTheDocument();
    expect(screen.getByText("Evidências")).toBeInTheDocument();
  });

  it("classifies knowledge question to knowledge.search", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "knowledge.search", data: { query: "", chunks: [] } }),
    );
    renderDrawer("/rh");

    await user.type(
      screen.getByTestId("ai-text-intent-input"),
      "quais critérios não podem ser usados em uma vaga",
    );
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "knowledge.search",
        arguments: {
          query: "quais criterios nao podem ser usados em uma vaga",
          limit: 5,
        },
      }),
    );
  });

  it("responds locally for knowledge admin onboarding without calling the backend", async () => {
    const user = userEvent.setup();
    renderDrawer("/rh");

    await user.type(
      screen.getByTestId("ai-text-intent-input"),
      "como posso cadastrar novos conhecimentos?",
    );
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(await screen.findByTestId("ai-assistant-local-answer")).toBeInTheDocument();
    expect(screen.getByText("Base de Conhecimento")).toBeInTheDocument();
    expect(screen.getByText(/Você pode cadastrar documentos revisados na Base de Conhecimento/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir Base de Conhecimento/i })).toBeInTheDocument();
  });

  it("responds locally for token usage questions without calling Gemini", async () => {
    const user = userEvent.setup();
    renderDrawer("/admin");

    await user.type(screen.getByTestId("ai-text-intent-input"), "como vejo o uso de tokens e faturamento?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(await screen.findByTestId("ai-assistant-local-answer")).toBeInTheDocument();
    expect(screen.getByText(/O consumo de tokens e custos estimados fica nas áreas administrativas/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir System Health/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir BI & Métricas/i })).toBeInTheDocument();
  });

  it("navigates from a local admin answer shortcut", async () => {
    const user = userEvent.setup();
    renderDrawer("/rh");

    await user.type(screen.getByTestId("ai-text-intent-input"), "como cadastro conhecimento?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await screen.findByTestId("ai-assistant-local-answer");

    await user.click(screen.getByRole("button", { name: /Abrir Base de Conhecimento/i }));
    await user.click(screen.getByTestId("ai-assistant-back"));

    expect(screen.getByTestId("ai-assistant-context-label")).toHaveTextContent(
      /Contexto: Base de conhecimento/i,
    );
  });

  it("does not execute contextual intent without required id", async () => {
    const user = userEvent.setup();
    renderDrawer("/vagas");

    await user.type(screen.getByTestId("ai-text-intent-input"), "resumo da vaga");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(screen.getByTestId("ai-text-intent-feedback")).toHaveTextContent(
      /Abra uma vaga específica/i,
    );
  });

  it("does not execute a composite plan when the required id is missing", async () => {
    const user = userEvent.setup();
    renderDrawer("/vagas");

    await user.type(screen.getByTestId("ai-text-intent-input"), "essa vaga está pronta?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(screen.getByTestId("ai-text-intent-feedback")).toHaveTextContent(
      /Abra uma vaga específica/i,
    );
  });

  it("blocks prohibited write commands in controlled text input", async () => {
    const user = userEvent.setup();
    renderDrawer("/admission/cases/case-456?packageId=pkg-9");

    await user.type(screen.getByTestId("ai-text-intent-input"), "aprovar documento");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await user.clear(screen.getByTestId("ai-text-intent-input"));
    await user.type(screen.getByTestId("ai-text-intent-input"), "mover candidato");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await user.clear(screen.getByTestId("ai-text-intent-input"));
    await user.type(screen.getByTestId("ai-text-intent-input"), "exportar agora para Protheus");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await user.clear(screen.getByTestId("ai-text-intent-input"));
    await user.type(screen.getByTestId("ai-text-intent-input"), "rejeitar candidato");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(screen.getByTestId("ai-text-intent-feedback")).toHaveTextContent(
      /não executa ações de escrita/i,
    );
  });

  it("does not execute empty controlled text input", async () => {
    const user = userEvent.setup();
    renderDrawer("/vagas/123");

    expect(screen.getByTestId("ai-text-intent-submit")).toBeDisabled();
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    expect(aiAssistantService.query).not.toHaveBeenCalled();
  });

  it("does not execute overly long controlled text input", async () => {
    const user = userEvent.setup();
    renderDrawer("/vagas/123");

    await user.type(screen.getByTestId("ai-text-intent-input"), "a".repeat(301));
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(screen.getByTestId("ai-text-intent-feedback")).toHaveTextContent(/no máximo 300/i);
  });

  it("shows friendly error when controlled text input cannot be classified", async () => {
    const user = userEvent.setup();
    renderDrawer("/rh");

    await user.type(screen.getByTestId("ai-text-intent-input"), "banana cinza orbital");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    expect(aiAssistantService.query).not.toHaveBeenCalled();
    expect(screen.getByTestId("ai-text-intent-feedback")).toHaveTextContent(
      /Não consegui associar sua pergunta/i,
    );
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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).toContain('"domain":"job"');
    expect(historyJson).toContain('"entityId":"job-123"');
    expect(historyJson).not.toContain("embedding_provider_error");
    expect(historyJson).not.toContain("RuntimeError");
    expect(historyJson).toContain("temporariamente indisponível");
  });

  it("does not save cpf in history after composite result", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(
        makeResponse({
          intent: "job.summary",
          data: { title: "CPF 123.456.789-00" },
        }),
      ).mockResolvedValueOnce(makeResponse({ intent: "job.requirements", data: { required_items: ["Email qa@example.test"] } }))
      .mockResolvedValueOnce(makeResponse({ intent: "pipeline.overview", data: { total_candidates: 3 } }))
      .mockResolvedValueOnce(
        makeResponse({
          intent: "knowledge.search",
          data: { query: "", chunks: [{ source_title: "Telefone", content: "(11) 91234-5678" }] },
        }),
      );
    render(<PersistentHistoryHarness path="/vagas/123" />);

    await user.type(screen.getByTestId("ai-text-intent-input"), "essa vaga está pronta?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).not.toContain("12345678900");
    expect(historyJson).not.toContain("qa@example.test");
    expect(historyJson).not.toContain("91234-5678");
    expect(historyJson).toContain("[cpf_removido]");
    expect(historyJson).toContain("[email_removido]");
    expect(historyJson).toContain("[telefone_removido]");
  });

  

  it("stores friendly label and text_intent source in history for controlled text input", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ intent: "job.summary" }),
    );
    render(<PersistentHistoryHarness path="/vagas/123" />);

    await user.type(screen.getByTestId("ai-text-intent-input"), "resumo da vaga");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).toContain('"label":"Resumo da vaga"');
    expect(historyJson).toContain('"source":"text_intent"');
  });

  it("stores composite_intent source in history for composite answers", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query)
      .mockResolvedValueOnce(makeResponse({ intent: "job.summary", data: { title: "Vaga A" } }))
      .mockResolvedValueOnce(
        makeResponse({ intent: "job.requirements", data: { required_items: ["Python"] } }),
      )
      .mockResolvedValueOnce(
        makeResponse({ intent: "pipeline.overview", data: { total_candidates: 3 } }),
      )
      .mockResolvedValueOnce(
        makeResponse({ intent: "knowledge.search", data: { query: "", chunks: [] } }),
      );
    render(<PersistentHistoryHarness path="/vagas/123" />);

    await user.type(screen.getByTestId("ai-text-intent-input"), "essa vaga está pronta?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await waitFor(() => screen.getByTestId("ai-assistant-composite-result"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).toContain('"source":"composite_intent"');
    expect(historyJson).toContain("Diagnóstico de prontidão da vaga");
  });

  it("does not save blocked controlled text content in history", async () => {
    const user = userEvent.setup();
    render(<PersistentHistoryHarness path="/candidatos/456" />);

    await user.type(screen.getByTestId("ai-text-intent-input"), "rejeitar candidato");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    const historyJson = screen.getByTestId("history-json").textContent ?? "";
    expect(historyJson).toBe("[]");
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
    expect(screen.getByTestId("ai-text-intent-section")).toBeInTheDocument();
  });

  it("reopens history without issuing a new request", async () => {
    const user = userEvent.setup();
    vi.mocked(aiAssistantService.query).mockResolvedValueOnce(
      makeResponse({ data: { title: "Snapshot salvo" } }),
    );
    renderDrawer("/vagas/job-123");

    await user.click(screen.getByTestId("ai-suggestion-job.summary"));
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

    await user.click(screen.getByTestId("ai-suggestion-job.summary"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));
    await user.click(screen.getByTestId("ai-assistant-new-query"));
    await user.click(screen.getByTestId("ai-session-history-clear"));

    expect(screen.queryByTestId("ai-session-history")).not.toBeInTheDocument();
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

    await user.type(screen.getByTestId("ai-text-intent-input"), "politica");
    await user.click(screen.getByTestId("ai-text-intent-submit"));
    await waitFor(() => screen.getByTestId("ai-assistant-result"));

    expect(screen.getByText("<strong>texto bruto</strong>")).toBeInTheDocument();
    expect(document.querySelector("strong")).not.toBeInTheDocument();
  });

  it("tenho tela de vagas? retorna resposta local e nao chama endpoint", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByTestId("ai-text-intent-input"), "tenho tela de vagas?");
    await user.click(screen.getByTestId("ai-text-intent-submit"));

    await waitFor(() => {
      expect(screen.getByText(/Você tem telas relacionadas a Vagas/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId("ai-local-next-action-/vagas")).toBeInTheDocument();
    expect(screen.getByTestId("ai-local-next-action-/vagas/nova")).toBeInTheDocument();

    expect(aiAssistantService.query).not.toHaveBeenCalled();
  });
});
