import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BrainCircuit,
  ChevronLeft,
  Compass,
  Info,
  LoaderCircle,
  MessageSquare,
  PanelTop,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { aiAssistantService } from "../services/aiAssistantService";
import type {
  AiAssistantContextAction,
  AiCompositeAction,
  AiCompositeExecutionResult,
  AiCompositeStepResult,
  AiAssistantHistoryItem,
  AiAssistantHistorySource,
  AiAssistantLocalAnswer,
  AiAssistantResponse,
} from "../types";
import { AiAssistantResultRenderer } from "./AiAssistantResultRenderer";
import {
  classifyIntent,
  friendlyError,
  friendlyWarning,
  summarizeResponse,
} from "../utils/aiAssistantPresenters";
import {
  containsSensitiveAssistantText,
  normalizeErrorMessage,
  sanitizeAssistantText,
  sanitizeResponse,
  sanitizeText,
} from "../utils/aiAssistantSanitizer";
import { deriveAiAssistantPageContext } from "../utils/aiAssistantContext";
import { classifyAssistantTextInput } from "../utils/aiAssistantIntentClassifier";
import { detectCompositeAction } from "../utils/aiAssistantCompositeActions";

const HISTORY_LIMIT = 5;

type DrawerStatus = "idle" | "loading" | "result" | "error";

function formatShortTime(date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildHistoryItem(params: {
  action: Extract<AiAssistantContextAction, { kind: "assistant" | "knowledge" }>;
  domain: AiAssistantHistoryItem["domain"];
  source?: AiAssistantHistorySource;
  entityId?: string;
  query?: string | null;
  response?: AiAssistantResponse | null;
  localAnswer?: AiAssistantLocalAnswer | null;
  compositeResult?: AiCompositeExecutionResult | null;
  errorMessage?: string | null;
}): AiAssistantHistoryItem {
  if (params.localAnswer) {
    return {
      id: crypto.randomUUID(),
      label: sanitizeAssistantText(params.localAnswer.label),
      intent: "local_answer",
      source: params.source,
      kind: "geral",
      domain: params.domain,
      entityId: params.entityId ?? null,
      status: "success",
      timestamp: formatShortTime(),
      query: params.query?.trim() ? sanitizeAssistantText(params.query.trim()) : null,
      summary: sanitizeAssistantText(params.localAnswer.answer),
      result: null,
      localAnswer: {
        ...params.localAnswer,
        label: sanitizeAssistantText(params.localAnswer.label),
        answer: sanitizeAssistantText(params.localAnswer.answer),
        nextActions: params.localAnswer.nextActions?.map((action) => ({
          label: sanitizeAssistantText(action.label),
          href: action.href,
        })),
      },
      compositeResult: null,
      errorMessage: null,
    };
  }

  if (params.compositeResult) {
    const successfulSteps = params.compositeResult.steps.filter((step) => step.status === "success");
    return {
      id: crypto.randomUUID(),
      label: sanitizeAssistantText(params.action.label),
      intent: params.action.intent,
      source: params.source,
      kind: classifyIntent(params.action.intent),
      domain: params.domain,
      entityId: params.entityId ?? null,
      status: successfulSteps.length > 0 ? "success" : "error",
      timestamp: formatShortTime(),
      query: params.query?.trim() ? sanitizeAssistantText(params.query.trim()) : null,
      summary:
        successfulSteps.length > 0
          ? `Consulta composta com ${successfulSteps.length} etapa(s) concluída(s).`
          : "Consulta composta sem resultados disponíveis.",
      result: null,
      localAnswer: null,
      compositeResult: params.compositeResult,
      errorMessage: params.errorMessage ? sanitizeAssistantText(params.errorMessage) : null,
    };
  }

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
    label: sanitizeAssistantText(params.action.label),
    intent: params.action.intent,
    source: params.source,
    kind: classifyIntent(params.action.intent),
    domain: params.domain,
    entityId: params.entityId ?? null,
    status,
    timestamp: formatShortTime(),
    query: params.query?.trim() ? sanitizeAssistantText(params.query.trim()) : null,
    summary: sanitizeAssistantText(summary),
    result: storedResponse,
    localAnswer: null,
    compositeResult: null,
    errorMessage,
  };
}

function sanitizeCompositeSnapshot(snapshot: AiCompositeExecutionResult): AiCompositeExecutionResult {
  return {
    ...snapshot,
    label: sanitizeAssistantText(snapshot.label),
    description: sanitizeAssistantText(snapshot.description),
    summary: snapshot.summary.map((item) => sanitizeAssistantText(item)),
    nextStep: sanitizeAssistantText(snapshot.nextStep),
    limitations: snapshot.limitations.map((item) => sanitizeAssistantText(item)),
    steps: snapshot.steps.map((step) => ({
      ...step,
      label: sanitizeAssistantText(step.label),
      result: step.result ? sanitizeResponse(step.result) : null,
      errorMessage: step.errorMessage ? sanitizeAssistantText(step.errorMessage) : null,
    })),
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
  const navigate = useNavigate();
  const sessionId = useRef(crypto.randomUUID()).current;
  const [status, setStatus] = useState<DrawerStatus>("idle");
  const [activeAction, setActiveAction] = useState<AiAssistantContextAction | null>(null);
  const [result, setResult] = useState<AiAssistantResponse | null>(null);
  const [localAnswer, setLocalAnswer] = useState<AiAssistantLocalAnswer | null>(null);
  const [compositeResult, setCompositeResult] = useState<AiCompositeExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localSessionHistory, setLocalSessionHistory] = useState<AiAssistantHistoryItem[]>([]);
  const [textIntentFeedback, setTextIntentFeedback] = useState<string | null>(null);
  const [textIntentPreview, setTextIntentPreview] = useState<{
    label: string;
    intent: string;
    reason: string;
  } | null>(null);

  const pageContext = deriveAiAssistantPageContext(pathname, search);
  const history = sessionHistory ?? localSessionHistory;
  const hasContextualActions = pageContext.availableActions.length > 0;
  const mergedSuggestions = [...pageContext.availableActions, ...pageContext.suggestedActions];
  const showResult = status === "result" && Boolean(result || localAnswer || compositeResult);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const setHistory = (updater: (current: AiAssistantHistoryItem[]) => AiAssistantHistoryItem[]) => {
    const next = updater(history);
    if (onSessionHistoryChange) onSessionHistoryChange(next);
    else setLocalSessionHistory(next);
  };

  const pushHistory = (item: AiAssistantHistoryItem) => {
    setHistory((current) => [item, ...current].slice(0, HISTORY_LIMIT));
  };

  const handleAction = async (
    action: AiAssistantContextAction,
    options?: {
      historyQuery?: string | null;
      historySource?: AiAssistantHistorySource;
    },
  ) => {
    if (action.kind === "navigation") {
      navigate(action.href);
      return;
    }

    setActiveAction(action);
    setStatus("loading");
    setResult(null);
    setLocalAnswer(null);
    setCompositeResult(null);
    setErrorMessage(null);

    let historyQuery: string | null = null;
    if (options && "historyQuery" in options) {
      historyQuery = options.historyQuery ?? null;
    } else if (action.kind === "knowledge") {
      historyQuery = action.query ?? null;
    }

    if (historyQuery && !shouldStoreHistoryQuery(historyQuery)) {
      historyQuery = null;
    }

    try {
      const response = sanitizeResponse(
        await aiAssistantService.query({
          intent: action.intent,
          arguments: action.arguments,
          session_id: sessionId,
        }),
      );
      setResult(response);
      setStatus("result");
      pushHistory(
        buildHistoryItem({
          action,
          domain: pageContext.domain,
          source:
            options?.historySource ??
            (action.section === "suggestions" ? "suggestion" : "context_action"),
          entityId: pageContext.entityId,
          query: historyQuery,
          response,
        }),
      );
    } catch (err: unknown) {
      const msg = normalizeErrorMessage(err);
      setErrorMessage(msg);
      setStatus("error");
      pushHistory(
        buildHistoryItem({
          action,
          domain: pageContext.domain,
          source:
            options?.historySource ??
            (action.section === "suggestions" ? "suggestion" : "context_action"),
          entityId: pageContext.entityId,
          query: historyQuery,
          errorMessage: msg,
        }),
      );
    }
  };

  const handleKnowledgeAction = async (
    intent: "knowledge.search" | "knowledge.answer",
    query: string,
  ) => {
    const normalizedQuery = query.trim();
    await handleAction(
      {
        id: intent,
        kind: "knowledge",
        label: intent === "knowledge.search" ? "Buscar fontes" : "Responder com fontes",
        description: normalizedQuery,
        intent,
        query: normalizedQuery,
        arguments: { query: normalizedQuery, limit: 5 },
      },
      {
        historyQuery: shouldStoreHistoryQuery(normalizedQuery) ? normalizedQuery : null,
        historySource: "knowledge_manual",
      },
    );
  };

  const executeCompositeAction = async (plan: AiCompositeAction, rawQuery: string) => {
    setStatus("loading");
    setResult(null);
    setLocalAnswer(null);
    setCompositeResult(null);
    setErrorMessage(null);
    setActiveAction({
      id: plan.id,
      kind: "assistant",
      label: plan.label,
      description: plan.description,
      intent: plan.steps[0]?.intent ?? "knowledge.search",
      arguments: {},
    });

    const stepResults: AiCompositeStepResult[] = [];
    for (const step of plan.steps) {
      try {
        const response = sanitizeResponse(
          await aiAssistantService.query({
            intent: step.intent,
            arguments: step.payload,
            session_id: sessionId,
          }),
        );
        stepResults.push({
          id: step.id,
          label: step.label,
          intent: step.intent,
          status: response.ok ? "success" : "error",
          result: response,
          errorMessage: response.ok ? null : friendlyError(response.error_code, response.message),
        });
      } catch (err: unknown) {
        stepResults.push({
          id: step.id,
          label: step.label,
          intent: step.intent,
          status: "error",
          result: null,
          errorMessage: normalizeErrorMessage(err),
        });
      }
    }

    const successfulSteps = stepResults.filter((step) => step.status === "success");
    const failedSteps = stepResults.filter((step) => step.status === "error");
    const snapshot = sanitizeCompositeSnapshot({
      id: plan.id,
      label: plan.label,
      description: plan.description,
      domain: plan.domain,
      steps: stepResults,
      summary: [
        `Executei ${plan.steps.length} consulta(s) read-only para montar esta resposta.`,
        successfulSteps.length > 0
          ? `${successfulSteps.length} consulta(s) retornaram dados utilizáveis.`
          : "Nenhuma consulta retornou dados utilizáveis.",
      ],
      nextStep:
        plan.safeNextStep ??
        "Revise as evidências disponíveis antes de qualquer decisão operacional.",
      limitations: failedSteps.map(
        (step) => `Não consegui consultar ${step.label.toLowerCase()} agora.`,
      ),
    });

    setCompositeResult(snapshot);
    setStatus("result");
    pushHistory(
      buildHistoryItem({
        action: {
          id: plan.id,
          kind: "assistant",
          label: plan.label,
          description: plan.description,
          intent: plan.steps[0]?.intent ?? "knowledge.search",
          arguments: {},
        },
        domain: pageContext.domain,
        source: "composite_intent",
        entityId: pageContext.entityId,
        query: shouldStoreHistoryQuery(rawQuery) ? rawQuery : null,
        compositeResult: snapshot,
        errorMessage:
          successfulSteps.length === 0
            ? "Não foi possível concluir nenhuma das consultas compostas agora."
            : null,
      }),
    );
  };

  const handleTextIntentAction = async (query: string) => {
    const rawQuery = query.trim();
    const normalizedQuery = rawQuery
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const compositePlan = detectCompositeAction(normalizedQuery, pageContext);

    if (compositePlan) {
      setTextIntentFeedback(null);
      setTextIntentPreview({
        label: compositePlan.label,
        intent: "composite",
        reason: `Plano composto com ${compositePlan.steps.length} consulta(s) read-only.`,
      });
      await executeCompositeAction(compositePlan, rawQuery);
      return;
    }

    const classification = classifyAssistantTextInput(rawQuery, pageContext);

    if (classification.status === "local_answer") {
      setTextIntentFeedback(null);
      setTextIntentPreview({
        label: classification.label,
        intent: "local_answer",
        reason: classification.reason,
      });
      setActiveAction(null);
      setResult(null);
      setCompositeResult(null);
      setErrorMessage(null);
      setLocalAnswer(classification);
      setStatus("result");
      pushHistory(
        buildHistoryItem({
          action: {
            id: "local-answer",
            kind: "assistant",
            label: classification.label,
            description: classification.answer,
            intent: "local_answer",
            arguments: {},
          },
          domain: pageContext.domain,
          source: "local_answer",
          entityId: pageContext.entityId,
          query: shouldStoreHistoryQuery(rawQuery) ? rawQuery : null,
          localAnswer: classification,
        }),
      );
      return;
    }

    if (classification.status !== "classified") {
      setTextIntentPreview(null);
      setTextIntentFeedback(classification.message);
      return;
    }

    setTextIntentFeedback(null);
    setTextIntentPreview({
      label: classification.label,
      intent: classification.intent,
      reason: classification.reason,
    });

    await handleAction(classification.action, {
      historyQuery: shouldStoreHistoryQuery(rawQuery) ? rawQuery : null,
      historySource: "text_intent",
    });
  };

  const handleHistoryOpen = (item: AiAssistantHistoryItem) => {
    setActiveAction({
      id: item.id,
      label: item.label,
      kind: "assistant",
      description: item.query ?? item.summary,
      intent: item.intent,
      arguments: {},
    });
    setCompositeResult(item.compositeResult ?? null);
    setResult(item.result);
    setLocalAnswer(item.localAnswer ?? null);
    setErrorMessage(item.errorMessage);
    setStatus(
      item.status === "error" && !item.result && !item.compositeResult && !item.localAnswer
        ? "error"
        : "result",
    );
  };

  const handleClearHistory = () => {
    setHistory(() => []);
  };

  const handleBack = () => {
    setStatus("idle");
    setActiveAction(null);
    setResult(null);
    setLocalAnswer(null);
    setCompositeResult(null);
    setErrorMessage(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Assistente IA"
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
        data-testid="ai-assistant-backdrop"
      />

      <div
        className="relative z-10 flex max-h-[84vh] w-full max-w-[760px] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-surface shadow-2xl dark:border-border/80"
        data-testid="ai-assistant-drawer"
      >
        <div className="border-b border-border/60 bg-surface px-5 py-4">
          <div className="flex items-start gap-3">
            {status !== "idle" ? (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Voltar"
                data-testid="ai-assistant-back"
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] via-rose-700 to-rose-900 text-white shadow-sm">
                <BrainCircuit className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[16px] font-bold text-text">Assistente IA</h2>
                <span
                  className="shrink-0 rounded-md bg-[hsl(var(--primary))]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]"
                  data-testid="ai-assistant-beta-badge"
                >
                  BETA
                </span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-text-muted">
                Copiloto read-only para esta{" "}
                {pageContext.domain === "job"
                  ? "vaga"
                  : pageContext.domain === "candidate"
                    ? "candidatura"
                    : pageContext.domain === "admission"
                      ? "admissão"
                      : "tela"}
              </p>
            </div>

            <div className="hidden shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Leitura segura · Sem ações automáticas
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar assistente"
              data-testid="ai-assistant-close"
              className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-surface-muted/35 px-3 py-2.5"
            data-testid="ai-assistant-context-panel"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/60 dark:bg-surface dark:ring-border">
              <Compass className="h-4 w-4 text-text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-text">{pageContext.title}</p>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {getDomainLabel(pageContext.domain)}
                </span>
                {hasContextualActions ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                    {pageContext.availableActions.length} sugest{pageContext.availableActions.length === 1 ? "ão" : "ões"} contextuais
                  </span>
                ) : null}
              </div>
              <p
                className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted"
                data-testid="ai-assistant-context-label"
              >
                <span>Contexto:</span>
                <span className="font-medium text-text">{pageContext.subtitle}</span>
              </p>
            </div>
            {pageContext.entityLabel ? (
              <span
                className="shrink-0 rounded-lg border border-border/60 bg-surface px-2 py-1 text-[10px] font-mono font-medium text-text-muted"
                data-testid="ai-assistant-context-entity"
              >
                {pageContext.entityLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {status === "idle" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/35 px-4 py-3">
                <p className="text-sm text-text">
                  {pageContext.guidance}
                </p>
              </div>

              <div className="space-y-3" data-testid="ai-assistant-suggestions-section">
                <div className="flex items-center justify-between gap-3 px-1">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Sugestões rápidas
                  </h3>
                  <span className="text-[10px] text-text-muted">
                    {mergedSuggestions.length} disponíveis
                  </span>
                </div>
                <SuggestionList
                  actions={mergedSuggestions}
                  emptyTitle={pageContext.emptyTitle}
                  emptyDescription={pageContext.emptyDescription}
                  onAction={handleAction}
                />
              </div>

              {history.length > 0 ? (
                <SessionHistorySection
                  history={history}
                  onOpen={handleHistoryOpen}
                  onClear={handleClearHistory}
                />
              ) : null}
            </div>
          ) : null}

          {status === "loading" ? (
            <div
              className="flex flex-col items-center justify-center gap-3 py-16 text-center"
              data-testid="ai-assistant-loading"
            >
              <LoaderCircle className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
              <p className="text-sm text-text-muted">Consultando informações com segurança…</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div
              className="flex flex-col items-center gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-5 text-center"
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
          ) : null}

          {showResult ? (
            <div className="space-y-4">
              <AssistantResponseShell
                title={activeAction?.label ?? "Resposta do assistente"}
                intent={activeAction?.intent ?? null}
                timestamp={formatShortTime()}
              >
                {result ? <AiAssistantResultRenderer result={result} /> : null}
                {localAnswer ? (
                  <LocalAnswerRenderer answer={localAnswer} onNavigate={(href) => navigate(href)} />
                ) : null}
                {compositeResult ? <CompositeResultRenderer result={compositeResult} /> : null}
              </AssistantResponseShell>

              <button
                type="button"
                onClick={handleBack}
                data-testid="ai-assistant-new-query"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Nova consulta
              </button>
            </div>
          ) : null}
        </div>

        {status === "idle" ? (
          <div className="border-t border-border/60 bg-surface p-4" data-testid="ai-text-intent-section">
            <UnifiedInputSection
              contextDomain={pageContext.domain}
              feedback={textIntentFeedback}
              preview={textIntentPreview}
              onAction={async (type, query) => {
                if (type === "knowledge") {
                  await handleKnowledgeAction("knowledge.answer", query);
                } else if (type === "sources") {
                  await handleKnowledgeAction("knowledge.search", query);
                } else {
                  await handleTextIntentAction(query);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getDomainLabel(domain: string): string {
  switch (domain) {
    case "job":
      return "Vaga";
    case "candidate":
      return "Candidato";
    case "admission":
      return "Admissão";
    case "admin":
      return "Admin";
    case "knowledge":
      return "Conhecimento";
    default:
      return "Geral";
  }
}

function AssistantResponseShell({
  title,
  intent,
  timestamp,
  children,
}: {
  title: string;
  intent: string | null;
  timestamp: string;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-sm"
      data-testid="ai-assistant-response-shell"
    >
      <div className="border-b border-border/60 bg-surface-muted/35 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] via-rose-700 to-rose-900 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">{title}</p>
              <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                IA
              </span>
              <span className="text-[10px] text-text-muted">{timestamp}</span>
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              {intent ? `Intent: ${intent}` : "Resposta pronta para revisão humana."}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

function LocalAnswerRenderer({
  answer,
  onNavigate,
}: {
  answer: AiAssistantLocalAnswer;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="space-y-4" data-testid="ai-assistant-local-answer">
      <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Resposta local
        </h3>
        <p className="text-sm font-medium text-text">{answer.label}</p>
        <p className="text-sm text-text">{answer.answer}</p>
      </section>

      {answer.nextActions && answer.nextActions.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Próximo passo
          </h3>
          <div className="flex flex-wrap gap-2">
            {answer.nextActions.map((action) => (
              <button
                key={`${action.href}:${action.label}`}
                type="button"
                onClick={() => onNavigate(action.href)}
                data-testid={`ai-local-next-action-${action.href}`}
                className="flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3 py-1.5 text-[11px] font-medium text-text transition-all hover:border-[hsl(var(--primary))]/40 hover:bg-surface-muted hover:shadow-sm"
              >
                <PanelTop className="h-3 w-3 text-[hsl(var(--primary))]/70" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CompositeResultRenderer({ result }: { result: AiCompositeExecutionResult }) {
  const successfulSteps = result.steps.filter((step) => step.status === "success");
  const failedSteps = result.steps.filter((step) => step.status === "error");

  return (
    <div className="space-y-4" data-testid="ai-assistant-composite-result">
      <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Consulta composta
        </h3>
        {result.summary.map((line) => (
          <p key={line} className="text-sm text-text">
            {line}
          </p>
        ))}
      </section>

      <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Consultas realizadas
        </h3>
        <ul className="space-y-2" data-testid="ai-assistant-composite-steps">
          {result.steps.map((step) => (
            <li key={step.id} className="text-sm text-text">
              {step.status === "success" ? "✓" : "⚠"} {step.label}
              {step.status === "error" && step.errorMessage ? ` — ${step.errorMessage}` : ""}
            </li>
          ))}
        </ul>
      </section>

      {successfulSteps.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Evidências</h3>
          <div className="space-y-4">
            {successfulSteps.map((step) =>
              step.result ? (
                <div key={step.id}>
                  <p className="mb-2 text-sm font-medium text-text">{step.label}</p>
                  <AiAssistantResultRenderer result={step.result} />
                </div>
              ) : null,
            )}
          </div>
        </section>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Próximo passo sugerido
        </h3>
        <div className="flex items-start gap-2 rounded-xl bg-[hsl(var(--primary))]/8 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
          <p className="text-sm text-text">{result.nextStep}</p>
        </div>
      </section>

      {result.domain === "admin" ? (
        <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Atalhos úteis
          </h3>
          <ul className="space-y-2 text-sm text-text">
            <li>Laboratório IA</li>
            <li>Credenciais IA</li>
            <li>Health do Sistema</li>
            <li>Aba IA em Administração</li>
          </ul>
        </section>
      ) : null}

      {failedSteps.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Limitações
          </h3>
          <ul className="space-y-2">
            {result.limitations.map((item) => (
              <li key={item} className="text-sm text-text-muted">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SuggestionList({
  actions,
  emptyTitle,
  emptyDescription,
  onAction,
}: {
  actions: AiAssistantContextAction[];
  emptyTitle: string;
  emptyDescription: string;
  onAction: (action: AiAssistantContextAction) => void;
}) {
  if (actions.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-dashed border-border/80 bg-surface-muted/30 p-4"
        data-testid="ai-assistant-empty"
      >
        <Compass className="h-5 w-5 text-text-muted/60" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-text">{emptyTitle}</p>
          <p className="text-[11px] text-text-muted">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="ai-assistant-suggestions">
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            onClick={() => onAction(action)}
            data-testid={`ai-suggestion-${action.id}`}
            data-action-kind={action.kind}
            className="group flex h-full w-full items-start gap-3 rounded-2xl border border-border/70 bg-surface px-3 py-3 text-left transition-all hover:border-[hsl(var(--primary))]/40 hover:bg-surface-muted hover:shadow-sm"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              {getSuggestionIcon(action)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="line-clamp-1 text-[12px] font-semibold text-text transition-colors group-hover:text-[hsl(var(--primary))]">
                  {action.label}
                </span>
                <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
                  {describeSuggestionDomain(action)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-muted">
                {action.description}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function getSuggestionIcon(action: AiAssistantContextAction) {
  if (action.kind === "knowledge") return <Search className="h-3.5 w-3.5" />;
  if (action.kind === "navigation") return <PanelTop className="h-3.5 w-3.5" />;
  return <Sparkles className="h-3.5 w-3.5" />;
}

function describeSuggestionDomain(action: AiAssistantContextAction): string {
  if (action.kind === "navigation") return "admin";
  const intent = action.intent;
  if (intent.startsWith("job.")) return "job";
  if (intent.startsWith("candidate.")) return "candidate";
  if (intent.startsWith("admission.")) return "admission";
  if (intent.startsWith("pipeline.")) return "pipeline";
  if (intent.startsWith("protheus.")) return "protheus";
  if (intent.startsWith("knowledge.")) return "knowledge";
  return "generic";
}

function shouldStoreHistoryQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return !containsSensitiveAssistantText(trimmed) && sanitizeText(trimmed) === trimmed;
}

function getTextIntentPlaceholder(contextDomain: string): string {
  switch (contextDomain) {
    case "job":
      return "Pergunte sobre a vaga, pipeline, requisitos ou regras internas...";
    case "candidate":
      return "Pergunte sobre o candidato, pipeline ou critérios de avaliação...";
    case "admission":
      return "Pergunte sobre o caso, documentos ou regras de pré-admissão...";
    case "admin":
      return "Pergunte sobre governança, base de conhecimento ou saúde do sistema...";
    default:
      return "Pergunte sobre a vaga, pipeline, requisitos ou regras internas...";
  }
}

function UnifiedInputSection({
  contextDomain,
  feedback,
  preview,
  onAction,
}: {
  contextDomain: string;
  feedback: string | null;
  preview: { label: string; intent: string; reason: string } | null;
  onAction: (type: "knowledge" | "sources" | "intent", query: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDisabled = !query.trim() || isSubmitting;

  const submit = async (type: "knowledge" | "sources" | "intent") => {
    if (isDisabled) return;
    setIsSubmitting(true);
    try {
      await onAction(type, query);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full" data-testid="ai-unified-input-section">
      {preview ? (
        <div
          className="mb-3 rounded-xl border border-border/70 bg-surface-muted/40 p-2.5"
          data-testid="ai-text-intent-preview"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Intent classificada
            </p>
            <span className="rounded-full border border-border/50 bg-surface px-2 py-0.5 text-[10px] font-mono text-text-muted">
              {preview.intent}
            </span>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-text">{preview.label}</p>
          <p className="mt-1 text-[11px] text-text-muted">{preview.reason}</p>
        </div>
      ) : null}

      {feedback ? (
        <div
          className="mb-3 rounded-xl border border-warning/20 bg-warning/5 p-2.5 text-xs text-text"
          data-testid="ai-text-intent-feedback"
        >
          {feedback}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border/80 bg-surface-muted/30 p-2 shadow-sm transition-all focus-within:border-[hsl(var(--primary))]/40 focus-within:bg-surface focus-within:ring-2 focus-within:ring-[hsl(var(--primary))]/10">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={getTextIntentPlaceholder(contextDomain)}
          className="min-h-[58px] w-full resize-none bg-transparent px-2 py-2 text-[13px] text-text placeholder:text-text-muted/60 focus:outline-none"
          data-testid="ai-text-intent-input"
          aria-label="Pergunta para o assistente"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit("intent");
            }
          }}
        />

        <div className="flex items-center justify-between gap-3 px-1 pb-1">
          <p className="hidden text-[11px] text-text-muted sm:block">
            Uma pergunta por vez. O assistente continua em modo leitura.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => void submit("sources")}
              data-testid="ai-knowledge-search"
              className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-3 py-2 text-[11px] font-semibold text-text-muted transition-colors hover:bg-surface-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="h-3 w-3" />
              Buscar fontes
            </button>

            <button
              type="button"
              disabled={isDisabled}
              onClick={() => void submit("intent")}
              data-testid="ai-text-intent-submit"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-rose-700 to-rose-900 px-4 py-2 text-[12px] font-bold text-white shadow-sm transition-all hover:from-rose-800 hover:to-rose-950 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
            >
              <MessageSquare className="h-3 w-3 text-rose-200" />
              Perguntar
            </button>
          </div>
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
        <button
          type="button"
          onClick={onClear}
          data-testid="ai-session-history-clear"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar
        </button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2" data-testid="ai-session-history-list">
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
                className={`w-full rounded-2xl border px-3 py-2 text-left transition-colors hover:bg-surface-muted ${tone}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[12px] font-semibold text-text">{item.label}</p>
                  <span className="shrink-0 text-[10px] text-text-muted">{item.timestamp}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-text-muted">
                  {item.query ?? item.summary}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
