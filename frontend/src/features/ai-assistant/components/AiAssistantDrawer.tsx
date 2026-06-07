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
  AiAssistantResponse,
  QuickAction,
} from "../types";
import { AiAssistantResultRenderer } from "./AiAssistantResultRenderer";
import {
  classifyIntent,
  friendlyError,
  friendlyWarning,
  summarizeResponse,
} from "../utils/aiAssistantPresenters";
import {
  normalizeErrorMessage,
  sanitizeResponse,
  sanitizeText,
} from "../utils/aiAssistantSanitizer";

const HISTORY_LIMIT = 5;

type DrawerStatus = "idle" | "loading" | "result" | "error";

type PageContextKind = "job" | "candidate" | "admission" | "generic";

type PageContext = {
  kind: PageContextKind;
  params: Record<string, string>;
  emptyTitle: string;
  emptyDescription: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "job.summary",
    label: "Resumo da vaga",
    description: "Veja status, requisitos e pendências principais.",
    intent: "job.summary",
    buildArgs: (params) => (params.jobId ? { job_id: params.jobId } : null),
  },
  {
    id: "job.requirements",
    label: "Requisitos da vaga",
    description: "Entenda skills, experiência e critérios técnicos já cadastrados.",
    intent: "job.requirements",
    buildArgs: (params) => (params.jobId ? { job_id: params.jobId } : null),
  },
  {
    id: "pipeline.overview",
    label: "Visão da pipeline",
    description: "Veja volumes por etapa e onde a vaga concentra mais candidatos.",
    intent: "pipeline.overview",
    buildArgs: (params) => (params.jobId ? { job_id: params.jobId } : null),
  },
  {
    id: "candidate.summary",
    label: "Resumo do candidato",
    description: "Entenda dados principais, pipeline ativo e próximos passos.",
    intent: "candidate.summary",
    buildArgs: (params) => (params.candidateId ? { candidate_id: params.candidateId } : null),
  },
  {
    id: "candidate.active_pipeline",
    label: "Status do currículo",
    description: "Veja se o currículo está pronto para análise e o que ainda limita a triagem.",
    intent: "candidate.resume_analysis",
    buildArgs: (params) => (params.candidateId ? { candidate_id: params.candidateId } : null),
  },
  {
    id: "admission.case_summary",
    label: "Status admissional",
    description: "Veja pendências, documentos e bloqueios antes do Protheus.",
    intent: "admission.case_summary",
    buildArgs: (params) => (
      params.admissionCaseId ? { admission_case_id: params.admissionCaseId } : null
    ),
  },
  {
    id: "admission.documents_status",
    label: "Status dos documentos",
    description: "Confira documentos pendentes, rejeitados e pontos que travam o caso.",
    intent: "admission.documents_status",
    buildArgs: (params) => (
      params.admissionCaseId ? { admission_case_id: params.admissionCaseId } : null
    ),
  },
];

function extractPageContext(pathname: string, search: string): PageContext {
  const params: Record<string, string> = {};

  const jobMatch = pathname.match(/^\/vagas\/([^/?]+)/);
  if (jobMatch && jobMatch[1] !== "nova") {
    params.jobId = jobMatch[1];
  }

  const pipelineMatch = pathname.match(/^\/pipeline\/([^/?]+)/);
  if (pipelineMatch) {
    params.jobId = pipelineMatch[1];
  }

  const candidateMatch = pathname.match(/^\/candidatos\/([^/?]+)/);
  if (candidateMatch) {
    params.candidateId = candidateMatch[1];
  }

  const admissionMatch =
    pathname.match(/^\/admissao\/([^/?]+)/) ??
    pathname.match(/^\/admission\/cases\/([^/?]+)/) ??
    pathname.match(/^\/admitidos\/([^/?]+)/);
  if (admissionMatch) {
    params.admissionCaseId = admissionMatch[1];
  }

  const searchParams = new URLSearchParams(search);
  const jobFromSearch = searchParams.get("job") ?? searchParams.get("job_id");
  if (jobFromSearch && !params.jobId) params.jobId = jobFromSearch;

  if (/^\/vagas(?:\/|$)/.test(pathname) && !params.jobId) {
    return {
      kind: "job",
      params,
      emptyTitle: "Não identifiquei a vaga atual",
      emptyDescription: "Abra uma vaga específica para usar ações contextuais.",
    };
  }

  if (/^\/candidatos(?:\/|$)/.test(pathname) && !params.candidateId) {
    return {
      kind: "candidate",
      params,
      emptyTitle: "Não identifiquei o candidato atual",
      emptyDescription: "Abra um perfil de candidato para usar ações contextuais.",
    };
  }

  if (
    (/^\/admissao(?:\/|$)/.test(pathname) ||
      /^\/admission\/cases(?:\/|$)/.test(pathname) ||
      /^\/admitidos(?:\/|$)/.test(pathname)) &&
    !params.admissionCaseId
  ) {
    return {
      kind: "admission",
      params,
      emptyTitle: "Não identifiquei o caso admissional atual",
      emptyDescription: "Abra um caso admissional específico para usar ações contextuais.",
    };
  }

  if (params.jobId) {
    return {
      kind: "job",
      params,
      emptyTitle: "",
      emptyDescription: "",
    };
  }

  if (params.candidateId) {
    return {
      kind: "candidate",
      params,
      emptyTitle: "",
      emptyDescription: "",
    };
  }

  if (params.admissionCaseId) {
    return {
      kind: "admission",
      params,
      emptyTitle: "",
      emptyDescription: "",
    };
  }

  return {
    kind: "generic",
    params,
    emptyTitle: "Nenhuma ação disponível",
    emptyDescription:
      "Abra uma vaga, candidato ou caso admissional para ver ações contextuais. Você também pode consultar a Base de Conhecimento.",
  };
}

function formatShortTime(date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildHistoryItem(params: {
  action: QuickAction;
  query?: string | null;
  response?: AiAssistantResponse | null;
  errorMessage?: string | null;
}): AiAssistantHistoryItem {
  const response = params.response ? sanitizeResponse(params.response) : null;
  const errorMessage = params.errorMessage ? sanitizeText(params.errorMessage) : null;
  const storedResponse = response
    ? {
        ...response,
        message: response.ok ? response.message : friendlyError(response.error_code, response.message),
        warnings: response.warnings.map(friendlyWarning),
      }
    : null;
  const { status, summary } = summarizeResponse(storedResponse, errorMessage);

  return {
    id: crypto.randomUUID(),
    label: params.action.label,
    intent: params.action.intent,
    kind: classifyIntent(params.action.intent),
    status,
    timestamp: formatShortTime(),
    query: params.query?.trim() ? params.query.trim() : null,
    summary,
    result: storedResponse,
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

  const pageContext = extractPageContext(pathname, search);
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
    (action) => action.buildArgs(pageContext.params) !== null,
  );

  const handleAction = async (action: QuickAction) => {
    const args = action.buildArgs(pageContext.params);
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
      label: intent === "knowledge.search" ? "Buscar fontes" : "Responder com fontes",
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
              <p className="text-xs text-text-muted">
                Somente leitura · Nenhuma ação será executada
              </p>
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
                <ActionList
                  actions={availableActions}
                  emptyTitle={pageContext.emptyTitle}
                  emptyDescription={pageContext.emptyDescription}
                  onAction={handleAction}
                />
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
              <p className="text-sm text-text-muted">Consultando informações com segurança…</p>
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
            <div className="space-y-4">
              <AiAssistantResultRenderer result={result} />
              <button
                type="button"
                onClick={handleBack}
                data-testid="ai-assistant-new-query"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Nova consulta
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ActionList({
  actions,
  emptyTitle,
  emptyDescription,
  onAction,
}: {
  actions: QuickAction[];
  emptyTitle: string;
  emptyDescription: string;
  onAction: (action: QuickAction) => void;
}) {
  if (actions.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 py-8 text-center"
        data-testid="ai-assistant-empty"
      >
        <BrainCircuit className="h-8 w-8 text-text-muted/40" />
        <p className="text-sm font-medium text-text">{emptyTitle}</p>
        <p className="max-w-[260px] text-xs text-text-muted">{emptyDescription}</p>
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
          onChange={(event) => setQuery(event.target.value)}
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
