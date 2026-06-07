import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiSettingsPage } from "../pages/AiSettingsPage";
import { aiSettingsService, type AiStatusResponse } from "../services/aiSettingsService";
import type { AiAssistantResponse } from "../../ai-assistant/types";

vi.mock("../services/aiSettingsService", () => ({
  aiSettingsService: {
    getStatus: vi.fn(),
    runAssistantTest: vi.fn(),
  },
}));

const STATUS: AiStatusResponse = {
  ok: true,
  environment: "development",
  assistant: {
    enabled: true,
    read_only: true,
    free_text_enabled: false,
  },
  rag: {
    embedding_provider: "gemini",
    gemini_embedding_enabled: true,
    embedding_model: "text-embedding-004",
    synthesis_enabled: false,
    synthesis_provider: "gemini",
    synthesis_model: "gemini-2.5-flash",
    vector_storage_mode: "json_fallback",
    pgvector_available: false,
  },
  providers: {
    provider: "google",
    model: "gemini-2.5-flash",
    gemini_api_key_configured: true,
  },
  protheus: {
    real_send_enabled: false,
    erp_allow_real_send: false,
  },
  warnings: ["pgvector_not_available"],
};

function assistantResponse(overrides: Partial<AiAssistantResponse> = {}): AiAssistantResponse {
  return {
    ok: true,
    intent: "knowledge.search",
    tool_name: "search_knowledge",
    data: {
      answer: "Pode exportar após aprovação documental.",
      sources: [{ source_title: "Manual Protheus", excerpt: "Somente após aprovação.", score: 0.91 }],
    },
    error_code: null,
    message: null,
    requires_approval: false,
    warnings: [],
    ...overrides,
  };
}

describe("AiSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiSettingsService.getStatus).mockResolvedValue(STATUS);
  });

  it("renders the Laboratório IA title", async () => {
    render(<AiSettingsPage />);

    expect(await screen.findByText("Laboratório IA")).toBeInTheDocument();
  });

  it("shows Gemini status without exposing API key values", async () => {
    render(<AiSettingsPage />);

    await screen.findByText("Gemini");
    expect(screen.getByText("Chave configurada")).toBeInTheDocument();
    expect(screen.queryByText(/GEMINI_API_KEY/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AIza/i)).not.toBeInTheDocument();
  });

  it("shows RAG synthesis status", async () => {
    render(<AiSettingsPage />);

    await screen.findByText("RAG");
    expect(screen.getByText("Síntese RAG")).toBeInTheDocument();
    expect(screen.getAllByText("Desligado").length).toBeGreaterThan(0);
  });

  it("shows Assistant read-only status", async () => {
    render(<AiSettingsPage />);

    await screen.findByText("Assistente");
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getAllByText("Ligado").length).toBeGreaterThan(0);
  });

  it("shows Protheus real send disabled", async () => {
    render(<AiSettingsPage />);

    await screen.findByText("Protheus");
    expect(screen.getByText("Envio real")).toBeInTheDocument();
    expect(screen.getByText("ERP allow real send")).toBeInTheDocument();
    expect(screen.getAllByText("Desligado").length).toBeGreaterThan(0);
  });

  it("calls assistant endpoint with knowledge.search when Buscar fontes is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(aiSettingsService.runAssistantTest).mockResolvedValueOnce(assistantResponse());
    render(<AiSettingsPage />);

    await user.click(await screen.findByTestId("ai-lab-test-search-protheus"));

    expect(aiSettingsService.runAssistantTest).toHaveBeenCalledWith({
      intent: "knowledge.search",
      arguments: {
        query: "Quando posso exportar admissão para o Protheus?",
        limit: 5,
      },
    });
  });

  it("calls assistant endpoint with knowledge.answer when Responder com fontes is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(aiSettingsService.runAssistantTest).mockResolvedValueOnce(
      assistantResponse({ intent: "knowledge.answer", tool_name: "answer_knowledge" }),
    );
    render(<AiSettingsPage />);

    await user.click(await screen.findByTestId("ai-lab-test-answer-protheus"));

    expect(aiSettingsService.runAssistantTest).toHaveBeenCalledWith({
      intent: "knowledge.answer",
      arguments: {
        query: "Quando posso exportar admissão para o Protheus?",
        limit: 5,
      },
    });
  });

  it("renders warnings from status and test result", async () => {
    const user = userEvent.setup();
    vi.mocked(aiSettingsService.runAssistantTest).mockResolvedValueOnce(
      assistantResponse({ warnings: ["rag_synthesis_disabled_by_flag"] }),
    );
    render(<AiSettingsPage />);

    expect(await screen.findByText("pgvector_not_available")).toBeInTheDocument();
    await user.click(screen.getByTestId("ai-lab-test-answer-protheus"));

    const warnings = await screen.findByTestId("ai-lab-warnings");
    expect(within(warnings).getByText("rag_synthesis_disabled_by_flag")).toBeInTheDocument();
  });

  it("does not render sensitive RAG metadata from test results", async () => {
    const user = userEvent.setup();
    vi.mocked(aiSettingsService.runAssistantTest).mockResolvedValueOnce(
      assistantResponse({
        data: {
          answer: "Resposta segura",
          content_hash: "hash-secreto",
          vector_json: [1, 2, 3],
          embedding: [0.1, 0.2],
          embeddings: [[0.3]],
          sources: [
            {
              source_title: "Manual Seguro",
              excerpt: "Trecho seguro",
              content_hash: "hash-fonte",
              vector_json: [4, 5, 6],
            },
          ],
        },
      }),
    );
    render(<AiSettingsPage />);

    await user.click(await screen.findByTestId("ai-lab-test-answer-protheus"));
    await screen.findByTestId("ai-lab-result");

    expect(screen.getByText("Resposta segura")).toBeInTheDocument();
    expect(screen.getByText("Manual Seguro")).toBeInTheDocument();
    expect(screen.queryByText("hash-secreto")).not.toBeInTheDocument();
    expect(screen.queryByText("hash-fonte")).not.toBeInTheDocument();
    expect(screen.queryByText("vector_json")).not.toBeInTheDocument();
    expect(screen.queryByText("embedding")).not.toBeInTheDocument();
    expect(screen.queryByText("embeddings")).not.toBeInTheDocument();
  });

  it("renders HTML-like API content as plain text", async () => {
    const user = userEvent.setup();
    vi.mocked(aiSettingsService.runAssistantTest).mockResolvedValueOnce(
      assistantResponse({ data: { answer: "<strong>texto bruto</strong>", sources: [] } }),
    );
    render(<AiSettingsPage />);

    await user.click(await screen.findByTestId("ai-lab-test-answer-policy"));
    expect(await screen.findByText("<strong>texto bruto</strong>")).toBeInTheDocument();
    expect(document.querySelector("strong")).not.toBeInTheDocument();
  });

  it("does not call assistant test before the user clicks a predefined test", async () => {
    render(<AiSettingsPage />);

    await screen.findByText("Laboratório IA");
    await waitFor(() => expect(aiSettingsService.getStatus).toHaveBeenCalledOnce());
    expect(aiSettingsService.runAssistantTest).not.toHaveBeenCalled();
  });
});
