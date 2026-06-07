import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeAdminPage } from "../KnowledgeAdminPage";

const listMock = vi.fn();
const getMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const reindexMock = vi.fn();
const archiveMock = vi.fn();
const assistantQueryMock = vi.fn();

vi.mock("../../services/knowledgeAdminService", () => ({
  knowledgeAdminService: {
    list: (...args: unknown[]) => listMock(...args),
    get: (...args: unknown[]) => getMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    reindex: (...args: unknown[]) => reindexMock(...args),
    archive: (...args: unknown[]) => archiveMock(...args),
  },
}));

vi.mock("../../features/ai-assistant/services/aiAssistantService", () => ({
  aiAssistantService: {
    query: (...args: unknown[]) => assistantQueryMock(...args),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <KnowledgeAdminPage />
    </MemoryRouter>,
  );
}

describe("KnowledgeAdminPage", () => {
  beforeEach(() => {
    listMock.mockReset();
    getMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    reindexMock.mockReset();
    archiveMock.mockReset();
    assistantQueryMock.mockReset();

    listMock.mockResolvedValue({
      items: [
        {
          id: "doc-1",
          title: "Guia do assistente",
          source_type: "internal_guide",
          domain: "ai_assistant",
          content: "Resumo seguro do documento",
          visibility: "internal",
          allowed_roles: ["ADMIN", "HR"],
          sensitivity_level: "low",
          tags: ["assistente"],
          status: "published",
          reviewed_by: "QA",
          reviewed_at: null,
          source_uri: null,
          indexing_status: "indexed",
          last_indexed_at: "2026-06-07T11:30:00Z",
          last_index_error: null,
          chunk_count: 2,
          chunks: [
            {
              id: "chunk-1",
              chunk_index: 0,
              content_preview: "Trecho seguro do chunk 1",
              token_count: 12,
            },
            {
              id: "chunk-2",
              chunk_index: 1,
              content_preview:
                "CPF 123.456.789-00 payload_json: {\"x\":1} vector_json: [1,2] embedding: [0.1]",
              token_count: 18,
            },
          ],
          created_at: "2026-06-07T10:00:00Z",
          updated_at: "2026-06-07T10:00:00Z",
          archived_at: null,
        },
        {
          id: "doc-2",
          title: "Checklist Protheus",
          source_type: "procedure",
          domain: "protheus",
          content: "Procedimento operacional",
          visibility: "admin_only",
          allowed_roles: ["ADMIN"],
          sensitivity_level: "medium",
          tags: ["protheus"],
          status: "draft",
          reviewed_by: null,
          reviewed_at: null,
          source_uri: null,
          indexing_status: "indexing_error",
          last_indexed_at: null,
          last_index_error:
            'Traceback (most recent call last): File "/app/main.py", line 10, in <module>',
          chunk_count: 0,
          chunks: [],
          created_at: "2026-06-07T10:00:00Z",
          updated_at: "2026-06-07T10:00:00Z",
          archived_at: null,
        },
      ],
      total: 2,
      embedding_provider_status: "gemini",
      embedding_provider_message:
        "Não foi possível gerar embeddings agora. Verifique a configuração do provider ou tente novamente em instantes.",
    });

    getMock.mockResolvedValue({
      id: "doc-1",
      title: "Guia do assistente",
      source_type: "internal_guide",
      domain: "ai_assistant",
      content: "Conteúdo completo seguro",
      visibility: "internal",
      allowed_roles: ["ADMIN", "HR"],
      sensitivity_level: "low",
      tags: ["assistente"],
      status: "published",
      reviewed_by: "QA",
      reviewed_at: null,
      source_uri: null,
      indexing_status: "indexed",
      last_indexed_at: "2026-06-07T11:30:00Z",
      last_index_error: null,
      chunk_count: 1,
      chunks: [{ id: "chunk-1", chunk_index: 0, content_preview: "Trecho seguro", token_count: 12 }],
      created_at: "2026-06-07T10:00:00Z",
      updated_at: "2026-06-07T10:00:00Z",
      archived_at: null,
    });

    createMock.mockResolvedValue({});
    updateMock.mockResolvedValue({});
    reindexMock.mockResolvedValue({
      ok: true,
      document_id: "doc-1",
      indexing_status: "indexed",
      chunks_created: 2,
      embeddings_created: 2,
      warnings: [],
    });
    archiveMock.mockResolvedValue({});
    assistantQueryMock.mockResolvedValue({
      ok: true,
      intent: "knowledge.search",
      tool_name: "search_knowledge",
      data: {
        chunks: [
          {
            source_title: "Documento com CPF",
            content: "CPF 12345678900 email qa@example.test telefone (11) 91234-5678",
            score: 0.92,
          },
        ],
      },
      error_code: null,
      message: null,
      requires_approval: false,
      warnings: ["embedding_provider_error: RuntimeError"],
    });
  });

  it("renders title summary cards and pt-br labels", async () => {
    renderPage();

    expect(await screen.findByText("Base de Conhecimento")).toBeInTheDocument();
    expect(
      screen.getByText("Gerencie documentos usados pelo Assistente IA para responder com fontes."),
    ).toBeInTheDocument();
    expect(screen.getByText("Documentos publicados")).toBeInTheDocument();
    expect(screen.getByText("Rascunhos")).toBeInTheDocument();
    expect(screen.getByText("Arquivados")).toBeInTheDocument();
    expect(screen.getByText("Chunks indexados")).toBeInTheDocument();
    expect(screen.getByText("Embeddings gerados")).toBeInTheDocument();
    expect(screen.getByText("Documentos com erro")).toBeInTheDocument();
    expect(screen.getAllByText("Última indexação").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tipo de fonte/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Status:/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Guia interno/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Publicado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rascunho/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Indexado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Erro de indexação/i).length).toBeGreaterThan(0);
  });

  it("keeps new document form closed by default and opens on button click", async () => {
    renderPage();

    await screen.findByText("Guia do assistente");
    expect(screen.queryByLabelText("Conteúdo")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Novo documento" })[0]);

    expect(screen.getByLabelText("Conteúdo")).toBeInTheDocument();
  });

  it("blocks cpf email phone api key and payload_json before save", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getAllByRole("button", { name: "Novo documento" })[0]);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Nova política" } });
    fireEvent.change(screen.getByLabelText("Conteúdo"), {
      target: {
        value:
          "CPF 123.456.789-00 email qa@example.test telefone (11) 91234-5678 api_key: AIzaExample payload_json: {}",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar documento" }));

    expect(createMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Este conteúdo parece conter dados sensíveis. Remova essas informações antes de salvar na Base de Conhecimento.",
      ),
    ).toBeInTheDocument();
  });

  it("blocks sensitive business terms before save", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getAllByRole("button", { name: "Novo documento" })[0]);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Documento pessoal" } });
    fireEvent.change(screen.getByLabelText("Conteúdo"), {
      target: { value: "Este conteúdo fala de currículo bruto e laudo médico." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar documento" }));

    expect(createMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Este conteúdo parece conter dados sensíveis/i)).toBeInTheDocument();
  });

  it("requires confirmation before archive", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getAllByRole("button", { name: "Arquivar" })[0]);

    expect(screen.getByText("Arquivar documento?")).toBeInTheDocument();
    expect(archiveMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar arquivamento" }));

    await waitFor(() => expect(archiveMock).toHaveBeenCalledWith("doc-1"));
  });

  it("shows loading only for the document being reindexed", async () => {
    let resolveReindex: (() => void) | null = null;
    reindexMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReindex = () =>
            resolve({
              ok: true,
              document_id: "doc-1",
              indexing_status: "indexed",
              chunks_created: 2,
              embeddings_created: 2,
              warnings: [],
            });
        }),
    );

    renderPage();
    await screen.findByText("Guia do assistente");

    const reindexButtons = screen.getAllByRole("button", { name: "Reindexar" });
    fireEvent.click(reindexButtons[0]);

    expect(screen.getByRole("button", { name: "Reindexando..." })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Reindexar" }).length).toBeGreaterThan(0);

    resolveReindex?.();
    await waitFor(() =>
      expect(screen.getByTestId("knowledge-reindex-feedback-doc-1")).toHaveTextContent(
        /Reindexação concluída/i,
      ),
    );
  });

  it("shows friendly embedding error on reindex failure", async () => {
    reindexMock.mockRejectedValueOnce(new Error("RuntimeError: Gemini embedding provider failed"));
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getAllByRole("button", { name: "Reindexar" })[0]);

    await waitFor(() =>
      expect(screen.getByTestId("knowledge-reindex-feedback-doc-1")).toHaveTextContent(
        /Não foi possível gerar embeddings agora/i,
      ),
    );
    expect(screen.getByTestId("knowledge-reindex-feedback-doc-1")).not.toHaveTextContent(
      /RuntimeError/i,
    );
  });

  it("sanitizes chunks and hides internal fields", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getByRole("button", { name: "Ver mais" }));

    const text = screen.getByText("Chunk 2").closest("div")?.parentElement?.textContent ?? "";
    expect(text).toContain("[cpf_removido]");
    expect(text).not.toContain("123.456.789-00");
    expect(text).not.toContain("payload_json");
    expect(text).not.toContain("vector_json");
    expect(text).not.toContain("embedding");
    expect(text).not.toContain("content_hash");
  });

  it("sanitizes indexing error details", async () => {
    renderPage();
    await screen.findByText("Checklist Protheus");

    expect(screen.getByText("Detalhes técnicos internos foram ocultados.")).toBeInTheDocument();
    expect(screen.queryByText(/Traceback/i)).not.toBeInTheDocument();
  });

  it("calls knowledge.search and renders sanitized search sources", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.change(screen.getByLabelText("Pergunta de teste"), {
      target: { value: "Quais documentos ajudam na exportação?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar fontes" }));

    await waitFor(() =>
      expect(assistantQueryMock).toHaveBeenCalledWith({
        intent: "knowledge.search",
        arguments: { query: "Quais documentos ajudam na exportação?", limit: 3 },
      }),
    );

    const results = await screen.findByTestId("knowledge-search-results");
    expect(results).toHaveTextContent("Documento com CPF");
    expect(results).toHaveTextContent("[cpf_removido]");
    expect(results).toHaveTextContent("[email_removido]");
    expect(results).toHaveTextContent("[telefone_removido]");
    expect(results).toHaveTextContent("Limitações e avisos");
    expect(results).not.toHaveTextContent("12345678900");
    expect(results).not.toHaveTextContent("qa@example.test");
    expect(results).not.toHaveTextContent("91234-5678");
  });

  it("loads a document for editing with comfortable textarea", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Guia do assistente" }));

    expect(await screen.findByDisplayValue("Conteúdo completo seguro")).toBeInTheDocument();
    expect(screen.getByLabelText("Conteúdo")).toHaveClass("min-h-64");
  });

  it("does not use dangerouslySetInnerHTML", () => {
    const source = readFileSync("src/pages/KnowledgeAdminPage.tsx", "utf-8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("shows sanitized warning text from provider diagnostics", async () => {
    renderPage();

    expect(
      await screen.findByText(/Não foi possível gerar embeddings agora/i),
    ).toBeInTheDocument();
  });

  it("shows summary cards with fallback dash for unavailable embeddings", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    const card = screen.getByText("Embeddings gerados").closest("article");
    expect(within(card as HTMLElement).getByText("—")).toBeInTheDocument();
  });
});
