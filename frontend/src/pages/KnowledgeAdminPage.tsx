import { FormEvent, useEffect, useState } from "react";

import { PageHeader } from "../components/common/PageHeader";
import { aiAssistantService } from "../features/ai-assistant/services/aiAssistantService";
import type { AiAssistantResponse } from "../features/ai-assistant/types";
import {
  knowledgeAdminService,
  type KnowledgeDocument,
  type KnowledgeDocumentPayload,
} from "../services/knowledgeAdminService";

const emptyForm: KnowledgeDocumentPayload = {
  title: "",
  source_type: "internal_guide",
  domain: "general",
  content: "",
  visibility: "internal",
  allowed_roles: ["ADMIN", "HR"],
  sensitivity_level: "low",
  tags: [],
  status: "draft",
  reviewed_by: "",
  reviewed_at: null,
  source_uri: "",
};

function safeMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function KnowledgeAdminPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeDocumentPayload>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [embeddingMessage, setEmbeddingMessage] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<AiAssistantResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("política");

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const response = await knowledgeAdminService.list();
      setDocuments(response.items);
      setEmbeddingMessage(response.embedding_provider_message);
    } catch (loadError) {
      setError(safeMessage(loadError, "Não foi possível carregar a base de conhecimento."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function selectDocument(id: string) {
    setSelectedId(id);
    setValidationError(null);
    try {
      const document = await knowledgeAdminService.get(id);
      setForm({
        title: document.title,
        source_type: document.source_type,
        domain: document.domain,
        content: document.content,
        visibility: document.visibility as "internal" | "admin_only",
        allowed_roles: document.allowed_roles,
        sensitivity_level: document.sensitivity_level as "low" | "medium" | "high" | "restricted",
        tags: document.tags,
        status: document.status,
        reviewed_by: document.reviewed_by,
        reviewed_at: document.reviewed_at,
        source_uri: document.source_uri,
      });
    } catch (loadError) {
      setError(safeMessage(loadError, "Não foi possível abrir o documento."));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setValidationError(null);
    try {
      const payload: KnowledgeDocumentPayload = {
        ...form,
        allowed_roles: form.allowed_roles,
        tags: form.tags,
        reviewed_by: form.reviewed_by?.trim() || null,
        source_uri: form.source_uri?.trim() || null,
      };
      if (selectedId) {
        await knowledgeAdminService.update(selectedId, payload);
      } else {
        await knowledgeAdminService.create(payload);
      }
      setForm(emptyForm);
      setSelectedId(null);
      await loadDocuments();
    } catch (submitError) {
      setValidationError(safeMessage(submitError, "Não foi possível salvar o documento."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    setError(null);
    try {
      await knowledgeAdminService.archive(id);
      if (selectedId === id) {
        setSelectedId(null);
        setForm(emptyForm);
      }
      await loadDocuments();
    } catch (archiveError) {
      setError(safeMessage(archiveError, "Não foi possível arquivar o documento."));
    }
  }

  async function handleReindex(id: string) {
    setError(null);
    try {
      await knowledgeAdminService.reindex(id);
      await loadDocuments();
    } catch (reindexError) {
      setError(safeMessage(reindexError, "Não foi possível reindexar o documento."));
    }
  }

  async function handleTestSearch(event: FormEvent) {
    event.preventDefault();
    setSearchResult(null);
    setError(null);
    try {
      const response = await aiAssistantService.query({
        intent: "knowledge.search",
        arguments: { query: searchQuery, limit: 3 },
      });
      setSearchResult(response);
    } catch (searchError) {
      setError(safeMessage(searchError, "Não foi possível testar a busca."));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Base de conhecimento"
        subtitle="Gerencie documentos RAG seguros, status de indexação e diagnóstico de embeddings."
      />

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-base font-semibold text-text">Warnings</h2>
        <p className="mt-2 text-sm text-text-muted">
          Esta tela mostra apenas conteúdo textual seguro e prévias sanitizadas para diagnóstico.
        </p>
        {embeddingMessage ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {embeddingMessage}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text">Documentos</h2>
              <p className="text-sm text-text-muted">Documentos publicados, rascunhos e arquivos com chunks seguros.</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text"
              onClick={() => {
                setSelectedId(null);
                setForm(emptyForm);
              }}
            >
              Novo documento
            </button>
          </div>

          {loading ? <p className="mt-4 text-sm text-text-muted">Carregando documentos...</p> : null}

          <div className="mt-4 space-y-3">
            {documents.map((document) => (
              <article key={document.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <button
                      type="button"
                      className="text-left text-sm font-semibold text-text underline-offset-4 hover:underline"
                      onClick={() => void selectDocument(document.id)}
                    >
                      {document.title}
                    </button>
                    <p className="text-sm text-text-muted">
                      {document.source_type} · {document.domain} · {document.status}
                    </p>
                    <p className="text-sm text-text-muted">
                      Indexação: {document.indexing_status} · Atualizado em {formatDateTime(document.updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text"
                      onClick={() => void handleReindex(document.id)}
                    >
                      Reindexar
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700"
                      onClick={() => void handleArchive(document.id)}
                    >
                      Arquivar
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                  {document.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border px-2 py-1">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-text">Chunks gerados</p>
                  {document.chunks.length === 0 ? (
                    <p className="text-sm text-text-muted">Nenhum chunk disponível.</p>
                  ) : (
                    document.chunks.map((chunk) => (
                      <div key={chunk.id} className="rounded-lg bg-surface-muted p-3 text-sm text-text">
                        <p className="font-medium">Chunk {chunk.chunk_index + 1}</p>
                        <p>{chunk.content_preview}</p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <form className="rounded-2xl border border-border bg-surface p-4" onSubmit={handleSubmit}>
            <h2 className="text-base font-semibold text-text">
              {selectedId ? "Editar documento" : "Novo documento"}
            </h2>
            <div className="mt-4 grid gap-4">
              <label className="text-sm font-medium text-text">
                Título
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-text">
                Domínio
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.domain}
                  onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-text">
                Source type
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.source_type}
                  onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value }))}
                />
              </label>
              <label className="text-sm font-medium text-text">
                Status
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value as KnowledgeDocument["status"] }))
                  }
                >
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </label>
              <label className="text-sm font-medium text-text">
                Tags
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.tags.join(", ")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                    }))
                  }
                />
              </label>
              <label className="text-sm font-medium text-text">
                Allowed roles
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.allowed_roles.join(", ")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      allowed_roles: event.target.value.split(",").map((role) => role.trim()).filter(Boolean),
                    }))
                  }
                />
              </label>
              <label className="text-sm font-medium text-text">
                Conteúdo
                <textarea
                  className="mt-1 min-h-48 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                />
              </label>
            </div>

            {validationError ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {validationError}
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              disabled={submitting}
            >
              {submitting ? "Salvando..." : "Salvar documento"}
            </button>
          </form>

          <form className="rounded-2xl border border-border bg-surface p-4" onSubmit={handleTestSearch}>
            <h2 className="text-base font-semibold text-text">Testar busca</h2>
            <label className="mt-4 block text-sm font-medium text-text">
              Consulta
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text"
            >
              Testar busca
            </button>

            {searchResult ? (
              <div className="mt-4 space-y-2 rounded-xl bg-surface-muted p-3 text-sm text-text">
                <p>Intent: {searchResult.intent}</p>
                <p>Warnings: {searchResult.warnings.join(", ") || "nenhum"}</p>
              </div>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}
