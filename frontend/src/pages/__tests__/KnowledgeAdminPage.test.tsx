import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

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
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockImplementation(() => true);

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza tabela de documentos com dados resumidos e botoes de acao", async () => {
    renderPage();

    expect(await screen.findByText("Base de Conhecimento")).toBeInTheDocument();
    
    // Summary
    expect(screen.getByText("Publicados")).toBeInTheDocument();
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    
    // Table content
    expect(screen.getByText("Guia do assistente")).toBeInTheDocument();
    expect(screen.getByText("Checklist Protheus")).toBeInTheDocument();
    
    // Should not render textareas by default
    expect(screen.queryByPlaceholderText(/Insira o conteúdo completo do documento aqui/i)).not.toBeInTheDocument();
  });

  it("nao mostra formulario de novo documento por padrao e abre no drawer", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");
    
    expect(screen.queryByPlaceholderText(/Insira o conteúdo completo do documento aqui/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("new-document-btn"));
    
    const input = await screen.findByPlaceholderText(/Insira o conteúdo completo do documento aqui/i);
    expect(input).toBeInTheDocument();
    expect(screen.getByText("Criar documento")).toBeInTheDocument();
  });

  it("bloqueia dados sensiveis ao salvar documento", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getByTestId("new-document-btn"));
    
    const titleInput = await screen.findByPlaceholderText("Ex: Política de Férias 2026");
    fireEvent.change(titleInput, { target: { value: "Nova política" } });
    
    const contentInput = screen.getByPlaceholderText(/Insira o conteúdo completo do documento aqui/i);
    fireEvent.change(contentInput, {
      target: {
        value: "CPF 123.456.789-00 email qa@example.test telefone (11) 91234-5678 api_key: AIzaExample payload_json: {}",
      },
    });
    
    fireEvent.click(screen.getByTestId("save-document-btn"));

    expect(createMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Este conteúdo parece conter dados sensíveis. Remova essas informações antes de salvar na Base de Conhecimento."
      )
    ).toBeInTheDocument();
  });

  it("editar documento abre drawer em modo edicao e preenche dados", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getByTestId("edit-doc-doc-1"));

    expect(await screen.findByDisplayValue("Conteúdo completo seguro")).toBeInTheDocument();
    expect(screen.getByText("Salvar alterações")).toBeInTheDocument();
  });

  it("ver detalhes do documento abre metadados e chunks sanitizados e esconde campos internos", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    // Click on view details
    fireEvent.click(screen.getByTestId("view-details-doc-1"));

    // Form opened with chunks
    expect(await screen.findByText("Detalhes e Chunks Sanitizados")).toBeInTheDocument();
    expect(screen.getByText("Chunk #1")).toBeInTheDocument();
    
    const text = screen.getByText("Trecho seguro").closest("article")?.textContent ?? "";
    expect(text).not.toContain("vector_json");
    expect(text).not.toContain("payload_json");
  });

  it("arquivar pede confirmacao", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getByTestId("archive-doc-doc-1"));

    await waitFor(() => expect(archiveMock).toHaveBeenCalledWith("doc-1"));
  });

  it("reindexar funciona", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getByTestId("reindex-doc-doc-1"));

    await waitFor(() => expect(reindexMock).toHaveBeenCalledWith("doc-1"));
  });

  it("sanitiza mensagens de erro de reindexacao na visualizacao de detalhes", async () => {
    getMock.mockResolvedValueOnce({
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
      last_index_error: 'Traceback (most recent call last): File "/app/main.py", line 10, in <module>',
      chunk_count: 0,
      chunks: [],
    });
    
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.click(screen.getByTestId("view-details-doc-2"));

    // The detail drawer is opened
    expect(await screen.findByText("Detalhes e Chunks Sanitizados")).toBeInTheDocument();
    
    // the error Traceback is not there
    expect(screen.queryByText(/Traceback/i)).not.toBeInTheDocument();
    expect(screen.getByText("Detalhes técnicos internos foram ocultados.")).toBeInTheDocument();
  });

  it("pesquisa na busca chama o assistant service, renderiza compactamente e oculta sensiveis", async () => {
    renderPage();
    await screen.findByText("Guia do assistente");

    fireEvent.change(screen.getByPlaceholderText(/Pesquisar recuperação de fontes reais\.\.\./i), {
      target: { value: "Quais documentos ajudam na exportação?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pesquisar" }));

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
    expect(results).not.toHaveTextContent("12345678900");
    expect(results).not.toHaveTextContent("qa@example.test");
  });

  it("does not use dangerouslySetInnerHTML", () => {
    const source = readFileSync("src/pages/KnowledgeAdminPage.tsx", "utf-8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
