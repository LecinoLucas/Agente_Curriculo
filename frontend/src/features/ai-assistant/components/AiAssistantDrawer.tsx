import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Compass,
  History,
  LoaderCircle,
  MessageSquare,
  PanelTop,
  Sparkles,
  RotateCcw,
  Search,
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
  compositeResult?: AiCompositeExecutionResult | null;
  errorMessage?: string | null;
}): AiAssistantHistoryItem {
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
    setCompositeResult(null);
    setErrorMessage(null);

    const historyQuery =
      options && "historyQuery" in options
        ? options.historyQuery ?? null
        : action.kind === "knowledge"
          ? action.query
          : null;

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
    await handleAction({
      id: intent,
      kind: "knowledge",
      label: intent === "knowledge.search" ? "Buscar fontes" : "Responder com fontes",
      description: normalizedQuery,
      intent,
      query: normalizedQuery,
      arguments: { query: normalizedQuery, limit: 5 },
    }, {
      historyQuery: shouldStoreHistoryQuery(normalizedQuery) ? normalizedQuery : null,
      historySource: "knowledge_manual",
    });
  };

  const executeCompositeAction = async (plan: AiCompositeAction, rawQuery: string) => {
    setStatus("loading");
    setResult(null);
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
    setErrorMessage(item.errorMessage);
    setStatus(item.status === "error" && !item.result && !item.compositeResult ? "error" : "result");
  };

  const handleClearHistory = () => {
    setHistory(() => []);
  };

  const handleBack = () => {
    setStatus("idle");
    setActiveAction(null);
    setResult(null);
    setCompositeResult(null);
    setErrorMessage(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
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
        className="relative z-10 flex w-full max-w-4xl max-h-[86vh] flex-col overflow-hidden rounded-xl bg-surface shadow-2xl ring-1 ring-border/50"
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
                {pageContext.domain === "job" ? "Insights e recomendações para esta vaga" :
                 pageContext.domain === "candidate" ? "Resumo e orientações sobre este candidato" :
                 pageContext.domain === "admission" ? "Acompanhamento e pendências desta admissão" :
                 "Consulte informações do sistema com segurança"}
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
              <div
                className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-border bg-surface-muted/50 p-4"
                data-testid="ai-assistant-context-panel"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                  <Compass className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-bold uppercase tracking-wide text-text-muted"
                    data-testid="ai-assistant-context-label"
                  >
                    Contexto da tela: {pageContext.title}
                  </p>
                  <p className="truncate text-sm font-semibold text-text">{pageContext.subtitle}</p>
                </div>
                {pageContext.entityLabel && (
                  <div className="shrink-0">
                    <span
                      className="inline-flex rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-bold tracking-wide text-text-muted shadow-sm"
                      data-testid="ai-assistant-context-entity"
                    >
                      {pageContext.entityLabel}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-text-muted">
                  Ações recomendadas para esta tela
                </h3>
                <ActionList
                  actions={pageContext.availableActions}
                  emptyTitle={pageContext.emptyTitle}
                  emptyDescription={pageContext.emptyDescription}
                  onAction={handleAction}
                />
              </div>

              <div className="space-y-3">
                <div className="px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Sugestões para esta tela
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Use perguntas e atalhos seguros baseados no contexto atual.
                  </p>
                </div>
                <SuggestionList
                  actions={pageContext.suggestedActions}
                  emptyTitle={
                    hasContextualActions
                      ? "Nenhuma sugestão adicional disponível."
                      : pageContext.emptyTitle
                  }
                  emptyDescription={
                    hasContextualActions
                      ? "Use as ações recomendadas ou a Base de Conhecimento abaixo."
                      : pageContext.emptyDescription
                  }
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

              <div className="border-t border-border pt-6">
                <TextIntentSection
                  contextDomain={pageContext.domain}
                  feedback={textIntentFeedback}
                  preview={textIntentPreview}
                  onAction={handleTextIntentAction}
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

          {status === "result" && compositeResult && (
            <div className="space-y-4">
              <CompositeResultRenderer result={compositeResult} />
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
    </div>
  );
}

function CompositeResultRenderer({ result }: { result: AiCompositeExecutionResult }) {
  const successfulSteps = result.steps.filter((step) => step.status === "success");
  const failedSteps = result.steps.filter((step) => step.status === "error");

  return (
    <div className="space-y-4" data-testid="ai-assistant-composite-result">
      <section className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Consulta composta
        </h3>
        {result.summary.map((line) => (
          <p key={line} className="text-sm text-text">
            {line}
          </p>
        ))}
      </section>

      <section className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
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

      {successfulSteps.length > 0 && (
        <section className="space-y-3 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
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
      )}

      <section className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Próximo passo sugerido
        </h3>
        <p className="text-sm text-text">{result.nextStep}</p>
      </section>

      {result.domain === "admin" && (
        <section className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
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
      )}

      {failedSteps.length > 0 && (
        <section className="space-y-2 rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3">
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
      )}
    </div>
  );
}

function ActionList({
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
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ai-assistant-actions">
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            onClick={() => onAction(action)}
            data-testid={`ai-action-${action.id}`}
            data-action-kind={action.kind}
            className="group flex h-full w-full flex-col rounded-xl border border-border bg-[hsl(var(--bg))]/60 p-4 text-left transition-all hover:border-[hsl(var(--primary))]/40 hover:bg-surface-muted hover:shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between text-[hsl(var(--primary))]">
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="text-sm font-bold text-text">{action.label}</p>
            <p className="mt-1 flex-1 text-xs text-text-muted">{action.description}</p>
            <div className="mt-3 flex w-full justify-end">
              <ChevronRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        </li>
      ))}
    </ul>
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
        className="flex flex-col items-center gap-3 py-6 text-center"
        data-testid="ai-assistant-suggestions-empty"
      >
        <Compass className="h-8 w-8 text-text-muted/40" />
        <p className="text-sm font-medium text-text">{emptyTitle}</p>
        <p className="max-w-[260px] text-xs text-text-muted">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ai-assistant-suggestions">
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            onClick={() => onAction(action)}
            data-testid={`ai-suggestion-${action.id}`}
            data-action-kind={action.kind}
            className="group flex h-full w-full flex-col rounded-xl border border-border/70 bg-[hsl(var(--bg))]/60 p-4 text-left transition-all hover:border-[hsl(var(--primary))]/30 hover:bg-surface-muted hover:shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <PanelTop className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text">{action.label}</p>
              <p className="mt-1 text-xs text-text-muted">{action.description}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] text-text-muted">
              <SuggestionMetaChip label={`${describeSuggestionDomain(action)}`} />
              <SuggestionMetaChip label={`${getActionIntentLabel(action)}`} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SuggestionMetaChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border/80 bg-surface px-2 py-0.5">
      {label}
    </span>
  );
}

function getActionIntentLabel(action: AiAssistantContextAction): string {
  if (action.kind === "navigation") return "navigation";
  return action.intent;
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

function describeSuggestionPayload(action: AiAssistantContextAction): string {
  if (action.kind === "navigation") return "navegação segura";

  const entries = Object.entries(action.arguments ?? {});
  if (entries.length === 0) return "sem payload";

  return entries
    .filter(([, value]) => value !== null && value !== undefined && `${value}`.trim() !== "")
    .map(([key]) => key)
    .join(", ");
}

function shouldStoreHistoryQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return !containsSensitiveAssistantText(trimmed) && sanitizeText(trimmed) === trimmed;
}

function getTextIntentPlaceholder(contextDomain: string): string {
  switch (contextDomain) {
    case "job":
      return "Ex.: Essa vaga está bem estruturada?";
    case "candidate":
      return "Ex.: Onde esse candidato está no processo?";
    case "admission":
      return "Ex.: O que falta para exportar essa admissão?";
    case "admin":
      return "Ex.: O Gemini está configurado?";
    default:
      return "Ex.: Quais critérios não podem ser usados em uma vaga?";
  }
}

function TextIntentSection({
  contextDomain,
  feedback,
  preview,
  onAction,
}: {
  contextDomain: string;
  feedback: string | null;
  preview: { label: string; intent: string; reason: string } | null;
  onAction: (query: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDisabled = !query.trim() || isSubmitting;

  const handleSubmit = async () => {
    if (isDisabled) return;
    setIsSubmitting(true);
    try {
      await onAction(query);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="ai-text-intent-section">
      <div className="px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Pergunte ao assistente
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Faça perguntas sobre esta tela ou sobre a base de conhecimento. O assistente só
          executa consultas read-only.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={getTextIntentPlaceholder(contextDomain)}
          className="min-h-[76px] w-full resize-none rounded-lg border border-border bg-surface-muted p-3 text-sm placeholder:text-text-muted/60 transition-shadow focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30"
          data-testid="ai-text-intent-input"
        />
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => void handleSubmit()}
          data-testid="ai-text-intent-submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Consultar
        </button>
        <p className="text-center text-[10px] text-text-muted/80">
          O assistente pode cometer erros. Confirme informações importantes.
        </p>
      </div>

      {preview && (
        <div
          className="rounded-lg border border-border/70 bg-[hsl(var(--bg))]/60 p-3"
          data-testid="ai-text-intent-preview"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Intent classificada
          </p>
          <p className="mt-1 text-sm font-medium text-text">{preview.label}</p>
          <p className="mt-1 text-xs text-text-muted">Intent: {preview.intent}</p>
          <p className="mt-2 text-xs text-text-muted">{preview.reason}</p>
        </div>
      )}

      {feedback && (
        <div
          className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-text"
          data-testid="ai-text-intent-feedback"
        >
          {feedback}
        </div>
      )}
    </div>
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
                      {(item.domain || item.entityId) && (
                        <p className="mt-1 text-xs text-text-muted">
                          {[item.domain, item.entityId].filter(Boolean).join(" · ")}
                        </p>
                      )}
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
