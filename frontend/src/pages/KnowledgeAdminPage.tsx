import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronUp,
  FileSearch,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
} from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { aiAssistantService } from "../features/ai-assistant/services/aiAssistantService";
import type { AiAssistantResponse } from "../features/ai-assistant/types";
import {
  friendlyWarning,
  presentResult,
} from "../features/ai-assistant/utils/aiAssistantPresenters";
import {
  containsSensitiveAssistantText,
  normalizeErrorMessage,
  sanitizeAssistantText,
  sanitizeResponse,
} from "../features/ai-assistant/utils/aiAssistantSanitizer";
import {
  knowledgeAdminService,
  type KnowledgeDocument,
  type KnowledgeDocumentPayload,
  type KnowledgeDocumentStatus,
} from "../services/knowledgeAdminService";

const DOMAIN_OPTIONS = [
  { value: "pre_admission", label: "Pré-admissão" },
  { value: "protheus", label: "Protheus" },
  { value: "pipeline", label: "Pipeline" },
  { value: "jobs", label: "Vagas" },
  { value: "internal_policies", label: "Políticas internas" },
  { value: "ai_assistant", label: "Uso do assistente" },
  { value: "general", label: "Geral" },
] as const;

const SOURCE_TYPE_OPTIONS = [
  { value: "internal_guide", label: "Guia interno" },
  { value: "policy", label: "Política" },
  { value: "procedure", label: "Procedimento" },
  { value: "faq", label: "FAQ" },
  { value: "integration_rule", label: "Regra de integração" },
  { value: "playbook", label: "Playbook operacional" },
] as const;

const STATUS_OPTIONS: Array<{ value: KnowledgeDocumentStatus; label: string }> = [
  { value: "draft", label: "Rascunho" },
  { value: "published", label: "Publicado" },
  { value: "archived", label: "Arquivado" },
] as const;

const VISIBILITY_OPTIONS = [
  { value: "internal", label: "Interna" },
  { value: "admin_only", label: "Somente admin" },
] as const;

const SENSITIVITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "restricted", label: "Restrita" },
] as const;

const BLOCKED_CONTENT_PATTERNS = [
  /\bcurr[íi]culo bruto\b/i,
  /\brg\b/i,
  /\blaudo\b/i,
  /\bexame\b/i,
  /\bdocumento pessoal\b/i,
  /\bdados banc[áa]rios(?: reais)?\b/i,
  /\bsenha\b/i,
] as const;

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

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function labelFromOptions(options: ReadonlyArray<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? sanitizeAssistantText(value);
}

function formatIndexingStatus(value: string) {
  switch (value) {
    case "indexed":
      return "Indexado";
    case "indexing_error":
      return "Erro de indexação";
    case "pending":
      return "Pendente";
    default:
      return sanitizeAssistantText(value || "—");
  }
}

function looksSensitiveContent(value: string) {
  return containsSensitiveAssistantText(value) || BLOCKED_CONTENT_PATTERNS.some((pattern) => pattern.test(value));
}

function summarizeSearchResult(result: AiAssistantResponse | null) {
  if (!result) return null;
  const safeResult = sanitizeResponse(result);
  const presented = presentResult(safeResult);
  return {
    title: presented.title,
    summary: presented.summary ?? [],
    evidence: presented.evidence ?? [],
    warnings: safeResult.warnings.map(friendlyWarning),
  };
}

function normalizeReindexError(error: unknown) {
  const message = normalizeErrorMessage(error);
  if (
    /embedding/i.test(message) ||
    /provider/i.test(message) ||
    /gemini/i.test(message)
  ) {
    return "Não foi possível gerar embeddings agora. Verifique a configuração do provider ou tente novamente em instantes.";
  }
  if (message === "Detalhes técnicos internos foram ocultados.") {
    return "Não foi possível reindexar o documento agora. Tente novamente em instantes.";
  }
  return message;
}

function normalizeProviderDiagnostic(message: string | null) {
  if (!message) return null;
  if (/embedding|embeddings|provider|gemini/i.test(message)) {
    return "Não foi possível gerar embeddings agora. Verifique a configuração do provider ou tente novamente em instantes.";
  }
  if (/traceback|runtimeerror|stack trace/i.test(message)) {
    return "Não foi possível verificar a indexação agora. Tente novamente em instantes.";
  }
  return sanitizeAssistantText(message);
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "danger" | "success" | "muted" }) {
  const toneClasses =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : tone === "muted"
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : "border-border bg-surface text-text";

  return (
    <article className={`rounded-2xl border p-4 ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </article>
  );
}

export function KnowledgeAdminPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeDocumentPayload>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [reindexNotice, setReindexNotice] = useState<Record<string, string>>({});
  const [archiveTarget, setArchiveTarget] = useState<KnowledgeDocument | null>(null);
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<AiAssistantResponse | null>(null);

  async function loadDocuments() {
    setLoading(true);
    setPageError(null);
    try {
      const response = await knowledgeAdminService.list();
      setDocuments(response.items);
      setProviderMessage(normalizeProviderDiagnostic(response.embedding_provider_message));
      setProviderStatus(response.embedding_provider_status || null);
    } catch (error) {
      setPageError(normalizeErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  const summary = useMemo(() => {
    const published = documents.filter((document) => document.status === "published").length;
    const drafts = documents.filter((document) => document.status === "draft").length;
    const archived = documents.filter((document) => document.status === "archived").length;
    const chunkCount = documents.reduce((total, document) => total + document.chunk_count, 0);
    const errors = documents.filter((document) => document.indexing_status === "indexing_error").length;
    const lastIndexed = documents
      .map((document) => document.last_indexed_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    return {
      published,
      drafts,
      archived,
      chunkCount,
      embeddingsGenerated: "—",
      errors,
      lastIndexed: formatDateTime(lastIndexed ?? null),
    };
  }, [documents]);

  async function openNewDocument() {
    setSelectedId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormNotice(null);
    setIsComposerOpen(true);
  }

  async function selectDocument(id: string) {
    setSelectedId(id);
    setFormError(null);
    setFormNotice(null);
    setPageError(null);
    try {
      const document = await knowledgeAdminService.get(id);
      setForm({
        title: sanitizeAssistantText(document.title),
        source_type: document.source_type,
        domain: document.domain,
        content: sanitizeAssistantText(document.content),
        visibility: document.visibility as "internal" | "admin_only",
        allowed_roles: document.allowed_roles,
        sensitivity_level: document.sensitivity_level as "low" | "medium" | "high" | "restricted",
        tags: document.tags,
        status: document.status === "archived" ? "draft" : document.status,
        reviewed_by: document.reviewed_by,
        reviewed_at: document.reviewed_at,
        source_uri: document.source_uri,
      });
      setIsComposerOpen(true);
    } catch (error) {
      setPageError(normalizeErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFormNotice(null);

    if (!form.title.trim() || !form.content.trim()) {
      setFormError("Preencha pelo menos título e conteúdo antes de salvar.");
      return;
    }

    if (looksSensitiveContent(form.content) || looksSensitiveContent(form.title)) {
      setFormError(
        "Este conteúdo parece conter dados sensíveis. Remova essas informações antes de salvar na Base de Conhecimento.",
      );
      return;
    }

    setSaving(true);
    try {
      const payload: KnowledgeDocumentPayload = {
        ...form,
        title: form.title.trim(),
        content: form.content.trim(),
        reviewed_by: form.reviewed_by?.trim() || null,
        source_uri: form.source_uri?.trim() || null,
        allowed_roles: form.allowed_roles,
        tags: form.tags,
      };

      if (selectedId) {
        await knowledgeAdminService.update(selectedId, payload);
        setFormNotice("Documento atualizado com sucesso.");
      } else {
        await knowledgeAdminService.create(payload);
        setFormNotice("Documento criado com sucesso.");
      }

      setForm(emptyForm);
      setSelectedId(null);
      setIsComposerOpen(false);
      await loadDocuments();
    } catch (error) {
      setFormError(normalizeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setPageError(null);
    try {
      await knowledgeAdminService.archive(archiveTarget.id);
      if (selectedId === archiveTarget.id) {
        setSelectedId(null);
        setForm(emptyForm);
        setIsComposerOpen(false);
      }
      setArchiveTarget(null);
      await loadDocuments();
    } catch (error) {
      setArchiveTarget(null);
      setPageError(normalizeErrorMessage(error));
    }
  }

  async function handleReindex(id: string) {
    setReindexingId(id);
    setPageError(null);
    setReindexNotice((current) => ({ ...current, [id]: "" }));
    try {
      const response = await knowledgeAdminService.reindex(id);
      setReindexNotice((current) => ({
        ...current,
        [id]: `Reindexação concluída. ${response.chunks_created} chunk(s) processado(s).`,
      }));
      await loadDocuments();
    } catch (error) {
      setReindexNotice((current) => ({
        ...current,
        [id]: normalizeReindexError(error),
      }));
    } finally {
      setReindexingId(null);
    }
  }

  async function handleTestSearch(event: FormEvent) {
    event.preventDefault();
    setSearchError(null);
    setSearchResult(null);

    if (!searchQuery.trim()) {
      setSearchError("Digite uma pergunta para testar a busca nesta base.");
      return;
    }

    setSearchLoading(true);
    try {
      const response = sanitizeResponse(
        await aiAssistantService.query({
          intent: "knowledge.search",
          arguments: { query: searchQuery.trim(), limit: 3 },
        }),
      );
      setSearchResult(response);
    } catch (error) {
      setSearchError(normalizeErrorMessage(error));
    } finally {
      setSearchLoading(false);
    }
  }

  const searchView = summarizeSearchResult(searchResult);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Base de Conhecimento"
        subtitle="Gerencie documentos usados pelo Assistente IA para responder com fontes."
      />

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Aviso de segurança</p>
            <p>
              Não cadastre currículos, documentos pessoais, CPFs, telefones, e-mails reais,
              laudos, exames ou payloads internos.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Documentos publicados" value={summary.published} tone="success" />
        <SummaryCard label="Rascunhos" value={summary.drafts} />
        <SummaryCard label="Arquivados" value={summary.archived} tone="muted" />
        <SummaryCard label="Chunks indexados" value={summary.chunkCount} />
        <SummaryCard label="Embeddings gerados" value={summary.embeddingsGenerated} />
        <SummaryCard label="Documentos com erro" value={summary.errors} tone="danger" />
        <SummaryCard label="Última indexação" value={summary.lastIndexed} />
      </section>

      {pageError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {pageError}
        </section>
      ) : null}

      {providerMessage ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Diagnóstico de embeddings</p>
              <p>{providerMessage}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text">Documentos da base</h2>
              <p className="text-sm text-text-muted">
                Acompanhe status, chunks seguros e diagnóstico de indexação por documento.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void openNewDocument()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Novo documento
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando documentos...
            </div>
          ) : null}

          {!loading && documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-text-muted">
              Nenhum documento cadastrado ainda.
            </div>
          ) : null}

          <div className="space-y-4">
            {documents.map((document) => {
              const cardTitle = sanitizeAssistantText(document.title);
              const isExpanded = expandedChunks[document.id] ?? false;
              const docNotice = reindexNotice[document.id];

              return (
                <article key={document.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => void selectDocument(document.id)}
                        className="text-left text-base font-semibold text-text underline-offset-4 hover:underline"
                      >
                        {cardTitle}
                      </button>
                      <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                        <span className="rounded-full border border-border px-2 py-1">
                          Tipo de fonte: {labelFromOptions(SOURCE_TYPE_OPTIONS, document.source_type)}
                        </span>
                        <span className="rounded-full border border-border px-2 py-1">
                          Domínio: {labelFromOptions(DOMAIN_OPTIONS, document.domain)}
                        </span>
                        <span className="rounded-full border border-border px-2 py-1">
                          Status: {labelFromOptions(STATUS_OPTIONS, document.status)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReindex(document.id)}
                        disabled={reindexingId === document.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {reindexingId === document.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-4 w-4" />
                        )}
                        {reindexingId === document.id ? "Reindexando..." : "Reindexar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setArchiveTarget(document)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700"
                      >
                        <Archive className="h-4 w-4" />
                        Arquivar
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-xl bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Status</p>
                      <p className="mt-1 text-text">{formatIndexingStatus(document.indexing_status)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Provider</p>
                      <p className="mt-1 text-text">{providerStatus ? sanitizeAssistantText(providerStatus) : "—"}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Modelo</p>
                      <p className="mt-1 text-text">—</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Dimensões</p>
                      <p className="mt-1 text-text">—</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Última indexação</p>
                      <p className="mt-1 text-text">{formatDateTime(document.last_indexed_at)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Chunks</p>
                      <p className="mt-1 text-text">{document.chunk_count}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                    {document.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2 py-1">
                        {sanitizeAssistantText(tag)}
                      </span>
                    ))}
                  </div>

                  {document.last_index_error ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">Erro sanitizado</p>
                      <p>{sanitizeAssistantText(document.last_index_error)}</p>
                    </div>
                  ) : null}

                  {docNotice ? (
                    <div
                      className="mt-4 rounded-xl border border-border bg-surface-muted p-3 text-sm text-text"
                      data-testid={`knowledge-reindex-feedback-${document.id}`}
                    >
                      {docNotice}
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text">Chunks gerados</p>
                        <p className="text-sm text-text-muted">
                          Prévia sanitizada dos trechos que podem sustentar respostas do assistente.
                        </p>
                      </div>
                      {document.chunks.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedChunks((current) => ({
                              ...current,
                              [document.id]: !isExpanded,
                            }))
                          }
                          className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {isExpanded ? "Ver menos" : "Ver mais"}
                        </button>
                      ) : null}
                    </div>

                    {document.chunks.length === 0 ? (
                      <p className="text-sm text-text-muted">Nenhum chunk disponível.</p>
                    ) : (
                      (isExpanded ? document.chunks : document.chunks.slice(0, 2)).map((chunk) => (
                        <div key={chunk.id} className="rounded-xl border border-border/70 bg-surface-muted p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-text">
                              Chunk {chunk.chunk_index + 1}
                            </p>
                            <span className="text-xs text-text-muted">
                              Tokens: {chunk.token_count ?? "—"}
                            </span>
                          </div>
                          <p className="mt-2 max-h-28 overflow-hidden whitespace-pre-wrap text-sm text-text">
                            {sanitizeAssistantText(chunk.content_preview)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text">Novo documento</h2>
                <p className="text-sm text-text-muted">
                  Use texto institucional revisado. Não cole dados de candidatos, documentos pessoais ou informações sensíveis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isComposerOpen) {
                    setIsComposerOpen(false);
                    setSelectedId(null);
                    setForm(emptyForm);
                    setFormError(null);
                    setFormNotice(null);
                  } else {
                    void openNewDocument();
                  }
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text"
              >
                {isComposerOpen ? "Fechar formulário" : "Novo documento"}
              </button>
            </div>

            {isComposerOpen ? (
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <label className="block text-sm font-medium text-text">
                  Título
                  <input
                    aria-label="Título"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>

                <label className="block text-sm font-medium text-text">
                  Domínio
                  <select
                    aria-label="Domínio"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.domain}
                    onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))}
                  >
                    {DOMAIN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-text">
                  Tipo de fonte
                  <select
                    aria-label="Tipo de fonte"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.source_type}
                    onChange={(event) => setForm((current) => ({ ...current, source_type: event.target.value }))}
                  >
                    {SOURCE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-text">
                  Status
                  <select
                    aria-label="Status"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as KnowledgeDocumentStatus,
                      }))
                    }
                  >
                    {STATUS_OPTIONS.filter((option) => option.value !== "archived").map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-text">
                  Tags
                  <input
                    aria-label="Tags"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Ex.: admissão, checklist, política"
                    value={form.tags.join(", ")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>

                <label className="block text-sm font-medium text-text">
                  Visibilidade
                  <select
                    aria-label="Visibilidade"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.visibility}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        visibility: event.target.value as "internal" | "admin_only",
                      }))
                    }
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-text">
                  Nível de sensibilidade
                  <select
                    aria-label="Nível de sensibilidade"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.sensitivity_level}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sensitivity_level: event.target.value as
                          | "low"
                          | "medium"
                          | "high"
                          | "restricted",
                      }))
                    }
                  >
                    {SENSITIVITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-text">
                  Conteúdo
                  <textarea
                    aria-label="Conteúdo"
                    className="mt-1 min-h-64 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6"
                    value={form.content}
                    onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  />
                </label>

                {formError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {formError}
                  </div>
                ) : null}

                {formNotice ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    {formNotice}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Salvando..." : selectedId ? "Salvar alterações" : "Salvar documento"}
                </button>
              </form>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm text-text-muted">
                O formulário fica fechado por padrão para manter a tela mais limpa.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <FileSearch className="mt-1 h-5 w-5 text-[hsl(var(--primary))]" />
              <div>
                <h2 className="text-base font-semibold text-text">Testar busca nesta base</h2>
                <p className="text-sm text-text-muted">
                  Digite uma pergunta para testar quais fontes seriam encontradas...
                </p>
              </div>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleTestSearch}>
              <label className="block text-sm font-medium text-text">
                Pergunta de teste
                <textarea
                  aria-label="Pergunta de teste"
                  className="mt-1 min-h-28 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Digite uma pergunta para testar quais fontes seriam encontradas..."
                />
              </label>

              <button
                type="submit"
                disabled={searchLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                {searchLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar fontes
              </button>
            </form>

            {searchError ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {searchError}
              </div>
            ) : null}

            {searchView ? (
              <div className="mt-4 space-y-4" data-testid="knowledge-search-results">
                {searchView.summary.length > 0 ? (
                  <div className="rounded-xl bg-surface-muted p-3 text-sm text-text">
                    {searchView.summary.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                ) : null}

                {searchView.evidence.length > 0 ? (
                  <div className="space-y-3">
                    {searchView.evidence.map((item) => (
                      <article key={`${item.title}-${item.description ?? ""}`} className="rounded-xl border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold text-text">{item.title}</p>
                            {item.description ? (
                              <p className="whitespace-pre-wrap text-sm text-text-muted">
                                {item.description}
                              </p>
                            ) : null}
                          </div>
                          {item.emphasis ? (
                            <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
                              {item.emphasis}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-muted">
                    Nenhuma fonte encontrada para essa pergunta.
                  </div>
                )}

                {searchView.warnings.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Limitações e avisos</p>
                    <div className="mt-2 space-y-1">
                      {searchView.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {archiveTarget ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" aria-hidden="true" />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-label="Confirmar arquivamento"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <h2 className="text-lg font-semibold text-text">Arquivar documento?</h2>
              <p className="mt-2 text-sm text-text-muted">
                Este documento deixará de ser usado como fonte pelo Assistente IA. Essa ação não apaga o histórico.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setArchiveTarget(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmArchive()}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Confirmar arquivamento
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
