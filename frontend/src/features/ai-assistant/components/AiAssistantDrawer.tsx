import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertCircle,
  BrainCircuit,
  ChevronLeft,
  History,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { aiAssistantService } from "../services/aiAssistantService";
import type {
  AiAssistantHistoryItem,
  AiAssistantHistoryKind,
  AiAssistantResponse,
  QuickAction,
} from "../types";

const SENSITIVE_KEYS = new Set([
  "vector_json",
  "content_hash",
  "embedding",
  "embeddings",
  "payload_json",
  "review_notes",
  "internal_notes",
  "stack",
  "stack_trace",
  "api_key",
]);

const HISTORY_LIMIT = 5;

function sanitizeText(value: string): string {
  if (!value) return value;

  const looksLikeTrace =
    value.includes("Traceback (most recent call last)") ||
    /(?:^|\n)\s*at\s+\S+/m.test(value) ||
    /File ".*", line \d+/m.test(value);
  if (looksLikeTrace) return "Detalhes técnicos internos foram ocultados.";

  return value
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[redacted-api-key]")
    .replace(/\bsk-[0-9A-Za-z]{20,}\b/g, "[redacted-api-key]");
}

function filterSensitive(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(filterSensitive);
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!SENSITIVE_KEYS.has(k)) filtered[k] = filterSensitive(v);
  }
  return filtered;
}

function sanitizeResponse(response: AiAssistantResponse): AiAssistantResponse {
  return {
    ...response,
    data: filterSensitive(response.data),
    message: response.message ? sanitizeText(response.message) : response.message,
    warnings: response.warnings.map(sanitizeText),
  };
}

function isEmptyObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "Você não tem permissão para usar esta consulta.",
  INVALID_INPUT: "Dados inválidos para esta consulta.",
  NOT_FOUND: "Recurso não encontrado.",
  INTERNAL_ERROR: "Erro interno ao processar a consulta. Tente novamente.",
  INTENT_NOT_FOUND: "Tipo de consulta não reconhecido.",
};

const WARNING_MESSAGES: Record<string, string> = {
  rag_synthesis_disabled_by_flag: "Síntese de resposta desabilitada (modo busca simples ativo).",
  low_score: "Resultados com baixa relevância.",
  no_chunks_found: "Nenhum trecho relevante encontrado na base de conhecimento.",
  fallback_mode: "Operando em modo fallback (pgvector indisponível).",
};

function friendlyError(errorCode: string | null, message: string | null): string {
  if (errorCode && errorCode in ERROR_MESSAGES) return ERROR_MESSAGES[errorCode];
  return message ? sanitizeText(message) : errorCode ?? "Erro desconhecido.";
}

function friendlyWarning(code: string): string {
  return WARNING_MESSAGES[code] ?? code;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "job.summary",
    label: "Resumo da vaga",
    description: "Título, área, status e informações principais",
    intent: "job.summary",
    buildArgs: (p) => (p.jobId ? { job_id: p.jobId } : null),
  },
  {
    id: "job.requirements",
    label: "Requisitos da vaga",
    description: "Skills, experiência e requisitos técnicos",
    intent: "job.requirements",
    buildArgs: (p) => (p.jobId ? { job_id: p.jobId } : null),
  },
  {
    id: "pipeline.overview",
    label: "Visão da pipeline",
    description: "Candidatos por etapa nesta vaga",
    intent: "pipeline.overview",
    buildArgs: (p) => (p.jobId ? { job_id: p.jobId } : null),
  },
  {
    id: "candidate.summary",
    label: "Resumo do candidato",
    description: "Perfil, skills e status na pipeline",
    intent: "candidate.summary",
    buildArgs: (p) => (p.candidateId ? { candidate_id: p.candidateId } : null),
  },
  {
    id: "candidate.active_pipeline",
    label: "Pipeline ativa",
    description: "Etapa atual e histórico recente",
    intent: "candidate.active_pipeline",
    buildArgs: (p) => (p.candidateId ? { candidate_id: p.candidateId } : null),
  },
  {
    id: "admission.case_summary",
    label: "Resumo do caso admissional",
    description: "Status, etapa e dados principais",
    intent: "admission.case_summary",
    buildArgs: (p) => (p.admissionId ? { admission_id: p.admissionId } : null),
  },
  {
    id: "admission.documents_status",
    label: "Status dos documentos",
    description: "Documentos pendentes e enviados",
    intent: "admission.documents_status",
    buildArgs: (p) => (p.admissionId ? { admission_id: p.admissionId } : null),
  },
];

function extractParams(pathname: string, search: string): Record<string, string> {
  const params: Record<string, string> = {};

  const jobMatch = pathname.match(/^\/vagas\/([^/?]+)/);
  if (jobMatch) params.jobId = jobMatch[1];

  const candidateMatch = pathname.match(/^\/candidatos\/([^/?]+)/);
  if (candidateMatch) params.candidateId = candidateMatch[1];

  const admissionMatch = pathname.match(/^\/admitidos\/([^/?]+)/);
  if (admissionMatch) params.admissionId = admissionMatch[1];

  const sp = new URLSearchParams(search);
  const jobFromSearch = sp.get("job") ?? sp.get("job_id");
  if (jobFromSearch && !params.jobId) params.jobId = jobFromSearch;

  return params;
}

const LABEL_MAP: Record<string, string> = {
  title: "Título",
  area: "Área",
  status: "Status",
  location: "Localidade",
  full_name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  stage: "Etapa",
  total: "Total",
  count: "Quantidade",
  skills: "Skills",
  description: "Descrição",
  summary: "Resumo",
  message: "Mensagem",
  answer: "Resposta",
  name: "Nome",
  type: "Tipo",
  created_at: "Criado em",
  updated_at: "Atualizado em",
  source_title: "Fonte",
  excerpt: "Trecho",
  score: "Relevância",
};

const ID_KEYS = new Set(["job_id", "candidate_id", "admission_id", "chunk_id", "document_id", "id"]);

function formatLabel(key: string): string {
  return LABEL_MAP[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value || "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Nenhum";
    if (value.every((v) => typeof v !== "object" || v === null)) return value.join(", ");
  }
  return JSON.stringify(value);
}

function DataNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-sm text-text-muted">Nenhum</span>;
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return (
        <span className="break-words text-sm text-text">
          {(value as unknown[]).map(String).join(", ")}
        </span>
      );
    }
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded border border-border/60 bg-[hsl(var(--bg))]/40 p-2">
            <DataNode value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return null;
    return (
      <dl className={depth > 0 ? "space-y-1" : "space-y-2"}>
        {entries.map(([k, v]) => {
          const isId = ID_KEYS.has(k);
          const isNested = !isId && v !== null && typeof v === "object";
          return (
            <div key={k} className={isNested ? "space-y-0.5" : "flex items-baseline gap-2"}>
              <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {formatLabel(k)}
              </dt>
              {isNested ? (
                <dd className="pl-2">
                  <DataNode value={v} depth={depth + 1} />
                </dd>
              ) : (
                <dd className="min-w-0 break-words text-sm text-text">
                  {isId ? (
                    <span className="font-mono text-xs text-text-muted">
                      {String(v).slice(0, 8)}…
                    </span>
                  ) : (
                    formatValue(v)
                  )}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    );
  }

  return <span className="break-words text-sm text-text">{formatValue(value)}</span>;
}

type DrawerStatus = "idle" | "loading" | "result" | "error";

function normalizeErrorMessage(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : "Não foi possível processar a solicitação.";
  return sanitizeText(msg);
}

function formatShortTime(date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncateText(value: string, maxLength = 80): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function classifyIntent(intent: string): AiAssistantHistoryKind {
  if (intent.startsWith("job.") || intent.startsWith("pipeline.")) return "vaga";
  if (intent.startsWith("candidate.")) return "candidato";
  if (intent.startsWith("admission.")) return "admissao";
  if (intent.startsWith("knowledge.")) return "conhecimento";
  return "geral";
}

function summarizeData(data: unknown): string {
  if (data == null) return "Sem dados para exibir.";
  if (typeof data === "string") return truncateText(data);
  if (typeof data === "number" || typeof data === "boolean") return String(data);
  if (Array.isArray(data)) {
    if (data.length === 0) return "Nenhum resultado.";
    const first = data[0];
    if (first && typeof first === "object") {
      const sourceTitle = (first as Record<string, unknown>).source_title;
      if (typeof sourceTitle === "string" && sourceTitle.trim()) {
        return truncateText(`${data.length} fonte(s). Primeira: ${sourceTitle}`);
      }
    }
    return `${data.length} resultado(s).`;
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    const answer = record.answer;
    if (typeof answer === "string" && answer.trim()) return truncateText(answer);
    const summary = record.summary;
    if (typeof summary === "string" && summary.trim()) return truncateText(summary);
    const message = record.message;
    if (typeof message === "string" && message.trim()) return truncateText(message);
    const title = record.title ?? record.source_title ?? record.name;
    if (typeof title === "string" && title.trim()) return truncateText(title);
    const total = record.total ?? record.count;
    if (typeof total === "number") return `${total} resultado(s).`;
    return "Resultado disponível.";
  }
  return "Resultado disponível.";
}

function buildHistorySummary(
  response: AiAssistantResponse | null,
  errorMessage: string | null,
): { status: "success" | "error"; summary: string } {
  if (errorMessage) return { status: "error", summary: truncateText(errorMessage) };
  if (!response) return { status: "error", summary: "Resultado indisponível." };
  if (!response.ok) {
    return {
      status: "error",
      summary: truncateText(friendlyError(response.error_code, response.message)),
    };
  }
  return { status: "success", summary: summarizeData(response.data) };
}

function buildHistoryItem(params: {
  action: QuickAction;
  query?: string | null;
  response?: AiAssistantResponse | null;
  errorMessage?: string | null;
}): AiAssistantHistoryItem {
  const response = params.response ? sanitizeResponse(params.response) : null;
  const errorMessage = params.errorMessage ? sanitizeText(params.errorMessage) : null;
  const { status, summary } = buildHistorySummary(response, errorMessage);

  return {
    id: crypto.randomUUID(),
    label: params.action.label,
    intent: params.action.intent,
    kind: classifyIntent(params.action.intent),
    status,
    timestamp: formatShortTime(),
    query: params.query?.trim() ? params.query.trim() : null,
    summary,
    result: response,
    errorMessage,
  };
}

export type AiAssistantDrawerProps = {
  onClose: () => void;
  sessionHistory?: AiAssistantHistoryItem[];
  onSessionHistoryChange?: (items: AiAssistantHistoryItem[]) => void;
};

export function AiAssistantDrawer({
  onClose,
  sessionHistory,
  onSessionHistoryChange,
}: AiAssistantDrawerProps) {
  const { pathname, search } = useLocation();
  const sessionId = useRef(crypto.randomUUID()).current;
  const [status, setStatus] = useState<DrawerStatus>("idle");
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [result, setResult] = useState<AiAssistantResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localSessionHistory, setLocalSessionHistory] = useState<AiAssistantHistoryItem[]>([]);

  const pageParams = extractParams(pathname, search);
  const history = sessionHistory ?? localSessionHistory;

  const setHistory = (updater: (current: AiAssistantHistoryItem[]) => AiAssistantHistoryItem[]) => {
    const next = updater(history);
    if (onSessionHistoryChange) onSessionHistoryChange(next);
    else setLocalSessionHistory(next);
  };

  const pushHistory = (item: AiAssistantHistoryItem) => {
    setHistory((current) => [item, ...current].slice(0, HISTORY_LIMIT));
  };

  const availableActions = QUICK_ACTIONS.filter(
    (action) => action.buildArgs(pageParams) !== null,
  );

  const handleAction = async (action: QuickAction) => {
    const args = action.buildArgs(pageParams);
    if (!args) return;

    setActiveAction(action);
    setStatus("loading");
    setResult(null);
    setErrorMessage(null);

    try {
      const response = sanitizeResponse(
        await aiAssistantService.query({
          intent: action.intent,
          arguments: args,
          session_id: sessionId,
        }),
      );
      setResult(response);
      setStatus("result");
      pushHistory(buildHistoryItem({ action, response }));
    } catch (err: unknown) {
      const msg = normalizeErrorMessage(err);
      setErrorMessage(msg);
      setStatus("error");
      pushHistory(buildHistoryItem({ action, errorMessage: msg }));
    }
  };

  const handleKnowledgeAction = async (
    intent: "knowledge.search" | "knowledge.answer",
    query: string,
  ) => {
    const normalizedQuery = query.trim();
    const action = {
      id: intent,
      label: intent === "knowledge.search" ? "Buscar fontes" : "Responder",
      description: normalizedQuery,
      intent,
      buildArgs: () => ({ query: normalizedQuery, limit: 5 }),
    } satisfies QuickAction;

    setActiveAction(action);
    setStatus("loading");
    setResult(null);
    setErrorMessage(null);

    try {
      const response = sanitizeResponse(
        await aiAssistantService.query({
          intent,
          arguments: { query: normalizedQuery, limit: 5 },
          session_id: sessionId,
        }),
      );
      setResult(response);
      setStatus("result");
      pushHistory(buildHistoryItem({ action, query: normalizedQuery, response }));
    } catch (err: unknown) {
      const msg = normalizeErrorMessage(err);
      setErrorMessage(msg);
      setStatus("error");
      pushHistory(buildHistoryItem({ action, query: normalizedQuery, errorMessage: msg }));
    }
  };

  const handleHistoryOpen = (item: AiAssistantHistoryItem) => {
    setActiveAction({
      id: item.id,
      label: item.label,
      description: item.query ?? item.summary,
      intent: item.intent,
      buildArgs: () => null,
    });
    setResult(item.result);
    setErrorMessage(item.errorMessage);
    setStatus(item.status === "error" && !item.result ? "error" : "result");
  };

  const handleClearHistory = () => {
    setHistory(() => []);
  };

  const handleBack = () => {
    setStatus("idle");
    setActiveAction(null);
    setResult(null);
    setErrorMessage(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
        data-testid="ai-assistant-backdrop"
      />

      <div
        role="dialog"
        aria-label="Assistente IA"
        className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[calc(100vw-16px)] flex-col overflow-hidden bg-surface shadow-xl"
        data-testid="ai-assistant-drawer"
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          {status !== "idle" ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Voltar"
              data-testid="ai-assistant-back"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              <BrainCircuit className="h-4 w-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-text">
                {status !== "idle" && activeAction ? activeAction.label : "Assistente IA"}
              </h2>
              <span
                className="shrink-0 rounded-full bg-[hsl(var(--primary))]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]"
                data-testid="ai-assistant-beta-badge"
              >
                Beta
              </span>
            </div>
            {status === "idle" && (
              <p className="text-xs text-text-muted">Somente leitura · Nenhuma ação será executada</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar assistente"
            data-testid="ai-assistant-close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {status === "idle" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-text-muted">
                  Ações contextuais
                </h3>
                <ActionList actions={availableActions} onAction={handleAction} />
              </div>

              <div className="border-t border-border pt-6">
                <KnowledgeSection onAction={handleKnowledgeAction} />
              </div>

              <div className="border-t border-border pt-6">
                <SessionHistorySection
                  history={history}
                  onOpen={handleHistoryOpen}
                  onClear={handleClearHistory}
                />
              </div>
            </div>
          )}

          {status === "loading" && (
            <div
              className="flex flex-col items-center justify-center gap-3 py-16 text-center"
              data-testid="ai-assistant-loading"
            >
              <LoaderCircle className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
              <p className="text-sm text-text-muted">Consultando…</p>
            </div>
          )}

          {status === "error" && (
            <div
              className="flex flex-col items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4 text-center"
              data-testid="ai-assistant-error"
            >
              <AlertCircle className="h-5 w-5 text-danger" />
              <p className="text-sm text-danger">
                {errorMessage ?? "Erro ao processar solicitação."}
              </p>
              <button
                type="button"
                onClick={handleBack}
                className="text-sm font-medium text-[hsl(var(--primary))] hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {status === "result" && result && (
            <ResultView result={result} onNewQuery={handleBack} />
          )}
        </div>
      </div>
    </>
  );
}

function ActionList({
  actions,
  onAction,
}: {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}) {
  if (actions.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 py-8 text-center"
        data-testid="ai-assistant-empty"
      >
        <BrainCircuit className="h-8 w-8 text-text-muted/40" />
        <p className="text-sm font-medium text-text">Nenhuma ação disponível</p>
        <p className="max-w-[260px] text-xs text-text-muted">
          Abra uma vaga, candidato ou caso admissional para usar ações contextuais.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" data-testid="ai-assistant-actions">
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            onClick={() => onAction(action)}
            data-testid={`ai-action-${action.id}`}
            className="w-full rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3 text-left transition-colors hover:border-[hsl(var(--primary))]/30 hover:bg-surface-muted"
          >
            <p className="text-sm font-medium text-text">{action.label}</p>
            <p className="mt-0.5 text-xs text-text-muted">{action.description}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function KnowledgeSection({
  onAction,
}: {
  onAction: (intent: "knowledge.search" | "knowledge.answer", query: string) => void;
}) {
  const [query, setQuery] = useState("");

  const isDisabled = !query.trim();

  return (
    <div className="space-y-3" data-testid="ai-knowledge-section">
      <div className="px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Base de conhecimento
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Consulte regras, políticas e documentação interna. As respostas usam somente fontes
          disponíveis na base.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite uma pergunta sobre regras, processos ou documentação…"
          className="min-h-[80px] w-full resize-none rounded-lg border border-border bg-surface-muted p-3 text-sm placeholder:text-text-muted/60 transition-shadow focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          data-testid="ai-knowledge-input"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onAction("knowledge.search", query)}
            data-testid="ai-knowledge-search"
            className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" />
            Buscar fontes
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onAction("knowledge.answer", query)}
            data-testid="ai-knowledge-answer"
            className="flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Responder
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionHistorySection({
  history,
  onOpen,
  onClear,
}: {
  history: AiAssistantHistoryItem[];
  onOpen: (item: AiAssistantHistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="ai-session-history">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Histórico da sessão
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            Últimas consultas desta sessão. Reabrir não faz nova chamada.
          </p>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            data-testid="ai-session-history-clear"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div
          className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 bg-[hsl(var(--bg))]/40 p-3"
          data-testid="ai-session-history-empty"
        >
          <History className="h-4 w-4 text-text-muted/60" />
          <p className="text-xs text-text-muted">Nenhuma ação nesta sessão.</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="ai-session-history-list">
          {history.map((item) => {
            const tone =
              item.status === "error"
                ? "border-danger/20 bg-danger/5"
                : "border-border/70 bg-[hsl(var(--bg))]/60";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  data-testid={`ai-session-history-item-${item.id}`}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-surface-muted ${tone}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">
                        {item.label} <span className="text-text-muted">— {item.timestamp}</span>
                      </p>
                      <p className="mt-0.5 text-xs uppercase tracking-wide text-text-muted">
                        {item.kind} · {item.status === "error" ? "erro" : "sucesso"}
                      </p>
                    </div>
                  </div>
                  {item.query && (
                    <p className="mt-2 line-clamp-1 text-xs text-text-muted">{item.query}</p>
                  )}
                  <p className="mt-1 line-clamp-2 text-sm text-text">{item.summary}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ResultView({
  result,
  onNewQuery,
}: {
  result: AiAssistantResponse;
  onNewQuery: () => void;
}) {
  const hasData = result.data != null && !isEmptyObject(result.data);

  return (
    <div className="space-y-4" data-testid="ai-assistant-result">
      {!result.ok && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="break-words text-sm text-danger">
            {friendlyError(result.error_code, result.message)}
          </p>
        </div>
      )}

      {result.ok && hasData && (
        <div className="rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
          <DataNode value={result.data} />
        </div>
      )}

      {result.ok && !hasData && (
        <p className="text-sm text-text-muted">{result.message ?? "Sem dados para exibir."}</p>
      )}

      {result.warnings.length > 0 && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30"
          data-testid="ai-assistant-warnings"
        >
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-800 dark:text-amber-300">
              {friendlyWarning(w)}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onNewQuery}
        data-testid="ai-assistant-new-query"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Nova consulta
      </button>
    </div>
  );
}
