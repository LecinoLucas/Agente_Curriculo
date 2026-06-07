import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          last_indexed_at: null,
          last_index_error: null,
          chunk_count: 1,
          chunks: [{ id: "chunk-1", chunk_index: 0, content_preview: "Trecho seguro", token_count: 12 }],
          created_at: "2026-06-07T10:00:00Z",
          updated_at: "2026-06-07T10:00:00Z",
          archived_at: null,
        },
      ],
      total: 1,
      embedding_provider_status: "fake",
      embedding_provider_message:
        "Não foi possível gerar embedding da consulta. Verifique se Gemini está configurado ou use provider fake.",
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
      last_indexed_at: null,
      last_index_error: null,
      chunk_count: 1,
      chunks: [{ id: "chunk-1", chunk_index: 0, content_preview: "Trecho seguro", token_count: 12 }],
      created_at: "2026-06-07T10:00:00Z",
      updated_at: "2026-06-07T10:00:00Z",
      archived_at: null,
    });
    createMock.mockResolvedValue({});
    updateMock.mockResolvedValue({});
    reindexMock.mockResolvedValue({});
    archiveMock.mockResolvedValue({});
    assistantQueryMock.mockResolvedValue({
      ok: true,
      intent: "knowledge.search",
      tool_name: "search_knowledge",
      data: { total: 1 },
      error_code: null,
      message: null,
      requires_approval: false,
      warnings: ["friendly_warning"],
    });
  });

  it("lista documentos e não renderiza campos sensíveis", async () => {
    render(
      <MemoryRouter>
        <KnowledgeAdminPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Guia do assistente")).toBeInTheDocument();
    expect(screen.getByText("Trecho seguro")).toBeInTheDocument();
    expect(screen.getByText(/Verifique se Gemini está configurado ou use provider fake/i)).toBeInTheDocument();
    expect(screen.queryByText(/content_hash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vector_json/i)).not.toBeInTheDocument();
  });

  it("cria documento e mostra erro de validação", async () => {
    createMock.mockRejectedValueOnce(new Error("Conteúdo bloqueado: padrão sensível detectado (CPF)."));

    render(
      <MemoryRouter>
        <KnowledgeAdminPage />
      </MemoryRouter>,
    );

    await screen.findByText("Guia do assistente");

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Nova política" } });
    fireEvent.change(screen.getByLabelText("Domínio"), { target: { value: "compliance" } });
    fireEvent.change(screen.getByLabelText("Source type"), { target: { value: "rh_policy" } });
    fireEvent.change(screen.getByLabelText("Conteúdo"), {
      target: { value: "CPF 123.456.789-10 não deve ser publicado nesta base administrativa." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar documento" }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(await screen.findByText(/Conteúdo bloqueado/i)).toBeInTheDocument();
  });

  it("permite testar busca e abrir documento para edição", async () => {
    render(
      <MemoryRouter>
        <KnowledgeAdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Guia do assistente" }));
    expect(await screen.findByDisplayValue("Conteúdo completo seguro")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Testar busca" }));

    await waitFor(() => expect(assistantQueryMock).toHaveBeenCalled());
    expect(await screen.findByText("Intent: knowledge.search")).toBeInTheDocument();
    expect(screen.getByText("Warnings: friendly_warning")).toBeInTheDocument();
  });
});
