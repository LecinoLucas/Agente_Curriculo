import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Eye,
  FileSearch,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  X,
  Pencil,
  FileText,
} from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function SummaryStat({ label, value, isDanger, isSuccess }: { label: string; value: string | number; isDanger?: boolean; isSuccess?: boolean }) {
  const valueColor = isDanger ? "text-red-600" : isSuccess ? "text-emerald-600" : "text-text";
  return (
    <div className="flex flex-col bg-white border border-border rounded-xl p-3 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <span className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</span>
    </div>
  );
}

export function KnowledgeAdminPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeDocumentPayload>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  
  // Modals & Drawers state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"create" | "edit">("create");
  const [viewerDoc, setViewerDoc] = useState<KnowledgeDocument | null>(null);
  
  // Search state
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
    setComposerMode("create");
    setIsComposerOpen(true);
  }

  async function openEditDocument(id: string) {
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
      setComposerMode("edit");
      setIsComposerOpen(true);
    } catch (error) {
      setPageError(normalizeErrorMessage(error));
    }
  }

  async function openViewDocument(document: KnowledgeDocument) {
    setPageError(null);
    try {
      const fullDocument = await knowledgeAdminService.get(document.id);
      setViewerDoc(fullDocument);
    } catch (error) {
      setPageError(normalizeErrorMessage(error));
    }
  }

  function closeComposer() {
    setIsComposerOpen(false);
    setSelectedId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormNotice(null);
  }

  function closeViewer() {
    setViewerDoc(null);
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
        "Este conteúdo parece conter dados sensíveis. Remova essas informações antes de salvar na Base de Conhecimento."
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

      if (composerMode === "edit" && selectedId) {
        await knowledgeAdminService.update(selectedId, payload);
      } else {
        await knowledgeAdminService.create(payload);
      }

      closeComposer();
      await loadDocuments();
    } catch (error) {
      setFormError(normalizeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmArchive(id: string) {
    setPageError(null);
    try {
      await knowledgeAdminService.archive(id);
      await loadDocuments();
    } catch (error) {
      setPageError(normalizeErrorMessage(error));
    }
  }

  function handleTriggerArchive(document: KnowledgeDocument) {
    if (window.confirm("Arquivar documento? Este documento deixará de ser usado como fonte pelo Assistente IA. Essa ação não apaga o histórico.")) {
      void confirmArchive(document.id);
    }
  }

  async function handleReindex(id: string) {
    setReindexingId(id);
    setPageError(null);
    try {
      await knowledgeAdminService.reindex(id);
      await loadDocuments();
    } catch (error) {
      setPageError(normalizeReindexError(error));
    } finally {
      setReindexingId(null);
    }
  }

  async function handleTestSearch(event: FormEvent) {
    event.preventDefault();
    setSearchError(null);
    setSearchResult(null);

    if (!searchQuery.trim()) {
      setSearchError("Digite uma pergunta para pesquisar nesta base.");
      return;
    }

    setSearchLoading(true);
    try {
      const response = sanitizeResponse(
        await aiAssistantService.query({
          intent: "knowledge.search",
          arguments: { query: searchQuery.trim(), limit: 3 },
        })
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
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl border border-border bg-[linear-gradient(135deg,rgba(4,120,87,0.08),rgba(15,23,42,0.02))] p-5 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Admin / IA</p>
          <h1 className="mt-1 text-xl font-semibold text-text">Base de Conhecimento</h1>
          <p className="mt-1 text-sm text-text-muted">
            Gerencie documentos, indexação e testes de recuperação usados pelo Assistente IA.
          </p>
        </div>
        <Button onClick={() => void openNewDocument()} data-testid="new-document-btn">
          <Plus className="mr-2 h-4 w-4" />
          Novo documento
        </Button>
      </header>

      {/* Estatísticas / Diagnóstico em linha */}
      <section className="flex flex-wrap gap-4">
        <SummaryStat label="Publicados" value={summary.published} isSuccess />
        <SummaryStat label="Pendentes" value={summary.drafts} />
        <SummaryStat label="Indexados (Chunks)" value={summary.chunkCount} />
        <SummaryStat label="Erros de indexação" value={summary.errors} isDanger={summary.errors > 0} />
        <SummaryStat label="Última indexação" value={summary.lastIndexed} />
        <div className="flex-1 min-w-[200px] flex items-center justify-between border border-border bg-white rounded-xl p-3 shadow-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Status do Provider</p>
            <p className="mt-1 text-sm font-medium text-text">{providerStatus ? sanitizeAssistantText(providerStatus) : "Operacional"}</p>
          </div>
          {providerMessage ? (
            <div className="flex items-center text-amber-600 gap-1" title={providerMessage}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          ) : (
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" title="Online" />
          )}
        </div>
      </section>

      {pageError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {pageError}
        </div>
      )}

      <div className="flex flex-col">
        {/* Tabela de Documentos (Main Area) */}
        <section className="rounded-2xl border border-border bg-white shadow-sm flex flex-col">
          <div className="border-b border-border/60 bg-surface-muted/20 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text">Lista de documentos</h2>
              <p className="text-[13px] text-text-muted">Gerencie a governança do conhecimento do agente.</p>
            </div>
            
            <form className="flex items-center gap-2 w-full md:max-w-md" onSubmit={handleTestSearch}>
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  className="w-full rounded-full border border-border bg-white pl-9 pr-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm"
                  placeholder="Pesquisar recuperação de fontes reais..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" className="rounded-full shrink-0 h-9 px-4" disabled={searchLoading}>
                {searchLoading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : "Pesquisar"}
              </Button>
            </form>
          </div>

          {/* Search Results Area */}
          {searchError ? (
            <div className="border-b border-border/60 bg-red-50 p-3 px-5 text-sm text-red-700 flex items-center justify-between">
              <span>{searchError}</span>
              <button type="button" onClick={() => setSearchError(null)} className="text-red-500 hover:text-red-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {searchView ? (
            <div className="border-b border-border/60 bg-surface/30 p-5 animate-in fade-in slide-in-from-top-2" data-testid="knowledge-search-results">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-emerald-600" />
                  Resultados do teste de busca
                </h3>
                <button type="button" onClick={() => setSearchResult(null)} className="rounded-full p-1.5 text-text-muted hover:bg-surface-muted hover:text-text transition-colors" title="Fechar resultados">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {searchView.evidence.length > 0 ? (
                  searchView.evidence.map((item, idx) => (
                    <article key={idx} className="rounded-xl border border-border p-3 bg-white shadow-sm flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-text line-clamp-2" title={item.title}>{item.title}</p>
                        {item.emphasis ? (
                          <Badge variant="outline" className="text-[9px] py-0 shrink-0 bg-surface-muted/50">{item.emphasis}</Badge>
                        ) : null}
                      </div>
                      {item.description ? (
                        <p className="text-[11px] text-text-muted line-clamp-4 leading-relaxed">
                          {item.description}
                        </p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-text-muted col-span-full">Nenhuma evidência encontrada para esta pergunta.</p>
                )}
              </div>
              {searchView.warnings.length > 0 ? (
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
                  {searchView.warnings.map((warn, i) => (
                    <p key={i} className="text-xs text-amber-800 flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3" />
                      {warn}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center p-12 text-sm text-text-muted">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Carregando documentos...
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="h-12 w-12 rounded-full bg-surface-muted flex items-center justify-center mb-3">
                <FileText className="h-6 w-6 text-text-muted/60" />
              </div>
              <p className="text-sm font-medium text-text">Nenhum documento encontrado.</p>
              <p className="mt-1 text-sm text-text-muted">Adicione documentos à base para o Assistente ter contexto.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="documents-table">
                <thead className="bg-surface/50 text-[11px] font-semibold uppercase tracking-wider text-text-muted border-b border-border/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Status / Indexação</th>
                    <th className="px-4 py-3 font-medium">Metadados</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="transition-colors hover:bg-surface/30">
                      <td className="px-4 py-3 min-w-[200px]">
                        <p className="font-semibold text-text max-w-xs truncate" title={sanitizeAssistantText(doc.title)}>
                          {sanitizeAssistantText(doc.title)}
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {labelFromOptions(DOMAIN_OPTIONS, doc.domain)} • {labelFromOptions(SOURCE_TYPE_OPTIONS, doc.source_type)}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5">
                          <Badge variant="outline" className={`w-fit text-[10px] uppercase font-bold py-0.5 h-auto ${
                            doc.status === "published" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            doc.status === "archived" ? "bg-slate-50 text-slate-600 border-slate-200" :
                            "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {labelFromOptions(STATUS_OPTIONS, doc.status)}
                          </Badge>
                          <span className="text-[11px] text-text-muted">
                            {formatIndexingStatus(doc.indexing_status)} ({doc.chunk_count} chunks)
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-text-muted">
                            Modificado: {formatDateTime(doc.last_indexed_at)}
                          </span>
                          <span className="text-[11px] text-text-muted truncate max-w-[120px]">
                            {doc.tags.length > 0 ? doc.tags.join(", ") : "Sem tags"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void openViewDocument(doc)}
                            className="p-1.5 text-text-muted hover:text-emerald-600 transition-colors rounded-md hover:bg-surface-muted"
                            title="Ver detalhes"
                            data-testid={`view-details-${doc.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEditDocument(doc.id)}
                            className="p-1.5 text-text-muted hover:text-emerald-600 transition-colors rounded-md hover:bg-surface-muted"
                            title="Editar"
                            data-testid={`edit-doc-${doc.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <div className="w-px h-4 bg-border/80 mx-1" />
                          <button
                            type="button"
                            disabled={reindexingId === doc.id}
                            onClick={() => void handleReindex(doc.id)}
                            className="p-1.5 text-text-muted hover:text-emerald-600 transition-colors rounded-md hover:bg-surface-muted disabled:opacity-30"
                            title="Reindexar"
                            data-testid={`reindex-doc-${doc.id}`}
                          >
                            {reindexingId === doc.id ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCcw className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerArchive(doc)}
                            className="p-1.5 text-text-muted hover:text-red-600 transition-colors rounded-md hover:bg-red-50"
                            title="Arquivar"
                            data-testid={`archive-doc-${doc.id}`}
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Drawer: Composer (Create / Edit Form) */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] transition-opacity" onClick={closeComposer} aria-hidden="true" />
          <div 
            className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300"
            role="dialog"
            aria-label={composerMode === "create" ? "Novo documento" : "Editar documento"}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/20">
              <div>
                <h3 className="text-base font-semibold text-text">
                  {composerMode === "create" ? "Novo documento" : "Editar documento"}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">Defina as fontes institucionais.</p>
              </div>
              <button onClick={closeComposer} className="rounded-full p-2 text-text-muted hover:bg-surface-muted hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Título</span>
                <input
                  className="w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={form.title}
                  onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                  placeholder="Ex: Política de Férias 2026"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Domínio</span>
                  <select
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={form.domain}
                    onChange={(e) => setForm((c) => ({ ...c, domain: e.target.value }))}
                  >
                    {DOMAIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tipo de Fonte</span>
                  <select
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={form.source_type}
                    onChange={(e) => setForm((c) => ({ ...c, source_type: e.target.value }))}
                  >
                    {SOURCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Status</span>
                  <select
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={form.status}
                    onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as KnowledgeDocumentStatus }))}
                  >
                    {STATUS_OPTIONS.filter((o) => o.value !== "archived").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sensibilidade</span>
                  <select
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={form.sensitivity_level}
                    onChange={(e) => setForm((c) => ({ ...c, sensitivity_level: e.target.value as any }))}
                  >
                    {SENSITIVITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Conteúdo</span>
                <textarea
                  className="w-full min-h-[250px] rounded-xl border border-border px-3 py-3 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y leading-relaxed font-mono text-[13px]"
                  value={form.content}
                  onChange={(e) => setForm((c) => ({ ...c, content: e.target.value }))}
                  placeholder="Insira o conteúdo completo do documento aqui..."
                />
              </label>

              {formError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border p-5 flex justify-end gap-3 bg-white">
              <Button type="button" variant="outline" onClick={closeComposer} disabled={saving}>Cancelar</Button>
              <Button type="button" onClick={(e) => void handleSubmit(e as unknown as FormEvent)} disabled={saving} data-testid="save-document-btn">
                {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                {composerMode === "create" ? "Criar documento" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Viewer (Details & Sanitized Chunks) */}
      {viewerDoc && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] transition-opacity" onClick={closeViewer} aria-hidden="true" />
          <div 
            className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300"
            role="dialog"
            aria-label="Ver detalhes do documento"
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-muted/20">
              <div>
                <h3 className="text-base font-semibold text-text max-w-[320px] truncate" title={sanitizeAssistantText(viewerDoc.title)}>
                  {sanitizeAssistantText(viewerDoc.title)}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">Detalhes e Chunks Sanitizados</p>
              </div>
              <button onClick={closeViewer} className="rounded-full p-2 text-text-muted hover:bg-surface-muted hover:text-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Metadados</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-xl border border-border bg-surface-muted/30">
                    <p className="text-[10px] text-text-muted uppercase">Status</p>
                    <p className="font-medium text-text">{formatIndexingStatus(viewerDoc.indexing_status)}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border bg-surface-muted/30">
                    <p className="text-[10px] text-text-muted uppercase">Última Indexação</p>
                    <p className="font-medium text-text">{formatDateTime(viewerDoc.last_indexed_at)}</p>
                  </div>
                </div>
                {viewerDoc.last_index_error && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <p className="font-bold">Erro (Sanitizado):</p>
                    <p className="mt-1">{sanitizeAssistantText(viewerDoc.last_index_error)}</p>
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Chunks Gerados ({viewerDoc.chunks.length})</h4>
                </div>
                {viewerDoc.chunks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-muted">
                    Nenhum chunk foi gerado ou indexado ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {viewerDoc.chunks.map((chunk) => (
                      <article key={chunk.id} className="rounded-xl border border-border p-3 bg-surface">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-text">Chunk #{chunk.chunk_index + 1}</span>
                          <span className="text-[10px] bg-surface-muted px-2 py-0.5 rounded-full text-text-muted border border-border/50">
                            {chunk.token_count ?? "?"} tokens
                          </span>
                        </div>
                        <p className="text-[12px] leading-relaxed text-text whitespace-pre-wrap">
                          {sanitizeAssistantText(chunk.content_preview)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
