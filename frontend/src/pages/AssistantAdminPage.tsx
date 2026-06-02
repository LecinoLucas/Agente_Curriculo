import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MessageSquare,
  Eye,
  ChevronLeft,
  ChevronRight,
  User,
  Bot,
  Settings,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Info,
  Save,
  Lock,
  Lightbulb,
  CornerDownRight,
  Pencil,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { SkeletonRows } from "../components/common/Skeleton";
import { useAsyncState } from "../hooks/useAsyncState";
import {
  assistantAdminService,
  type AssistantFailureClassification,
  type AssistantFailureDetail,
  type AssistantFailureListItem,
  type AssistantFailureStatus,
  type AssistantMessageItem,
  type AssistantQuickReply,
  type AssistantSetting,
  type AssistantSettingValue,
  type AssistantState,
  type AssistantStateContent,
  type AssistantSessionDetail,
  type AssistantSessionListItem,
  type ListFailuresParams,
  type ListSessionsParams,
  type UpdateStateContentPayload,
  type UpdateQuickReplyPayload,
} from "../services/assistantAdminService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  IDENTIFY: "Identificação",
  VERIFY_OTP: "Verificação OTP",
  CHOOSE_LOCATION: "Escolhendo cidade",
  CHOOSE_UNIT_OR_ANY: "Escolhendo posto",
  CHOOSE_FUNCTION: "Escolhendo função",
  CHOOSE_SHIFT: "Escolhendo turno",
  SHOW_JOBS: "Mostrando vagas",
  COLLECT_RESUME: "Coletando currículo",
  CONFIRM_APPLICATION: "Confirmando",
  DONE: "Concluído",
};

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "neutral" | "muted"
> = {
  active: "success",
  completed: "neutral",
  abandoned: "warning",
  cancelled: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  completed: "Concluída",
  abandoned: "Abandonada",
  cancelled: "Cancelada",
};

const APP_STATUS_LABEL: Record<string, string> = {
  started: "Iniciada",
  qualified: "Qualificada",
  submitted: "Enviada",
  linked_to_pipeline: "No pipeline",
  abandoned: "Abandonada",
  cancelled: "Cancelada",
};

// ── Failure label maps ──────────────────────────────────────────────────────

const FAILURE_STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  reviewed: "Revisada",
  resolved: "Resolvida",
  ignored: "Ignorada",
};

const FAILURE_STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "neutral" | "muted"
> = {
  open: "warning",
  reviewed: "neutral",
  resolved: "success",
  ignored: "muted",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  location: "Localidade",
  unit: "Posto",
  function: "Função",
  shift: "Turno",
  identity: "Identidade",
  spam: "Spam",
  talk_to_hr: "Falar com RH",
  other: "Outro",
};

const FAILURE_STATUS_OPTIONS = ["open", "reviewed", "resolved", "ignored"] as const;
const CLASSIFICATION_OPTIONS = [
  "location",
  "unit",
  "function",
  "shift",
  "identity",
  "spam",
  "talk_to_hr",
  "other",
] as const;

// Reasons emitted by the conversation engine (base + attempt-limit variants).
const REASON_LABEL: Record<string, string> = {
  invalid_identity_input: "Identificação inválida",
  otp_wrong_code: "Código OTP incorreto",
  otp_attempt_limit: "OTP — limite de tentativas",
  location_not_found: "Cidade não encontrada",
  location_not_found_attempt_limit: "Cidade — limite de tentativas",
  unit_not_found: "Posto não encontrado",
  unit_not_found_attempt_limit: "Posto — limite de tentativas",
  function_not_understood: "Função não compreendida",
  function_not_understood_attempt_limit: "Função — limite de tentativas",
  shift_not_understood: "Turno não compreendido",
  shift_not_understood_attempt_limit: "Turno — limite de tentativas",
};

const REASON_OPTIONS = Object.keys(REASON_LABEL);

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

function classificationLabel(value: string | null): string {
  if (!value) return "—";
  return CLASSIFICATION_LABEL[value] ?? value;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type FiltersState = {
  status: string;
  current_state: string;
  channel: string;
  has_application: string;
  has_pipeline: string;
};

const EMPTY_FILTERS: FiltersState = {
  status: "",
  current_state: "",
  channel: "",
  has_application: "",
  has_pipeline: "",
};

const filterSelectCls =
  "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring";

function SessionFilters({
  filters,
  onChange,
  onReset,
}: {
  filters: FiltersState;
  onChange: (key: keyof FiltersState, value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Status"
        value={filters.status}
        onChange={(e) => onChange("status", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todos os status</option>
        <option value="active">Ativa</option>
        <option value="completed">Concluída</option>
        <option value="abandoned">Abandonada</option>
        <option value="cancelled">Cancelada</option>
      </select>

      <select
        aria-label="Estado atual"
        value={filters.current_state}
        onChange={(e) => onChange("current_state", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todos os estados</option>
        {Object.entries(STATE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <select
        aria-label="Canal"
        value={filters.channel}
        onChange={(e) => onChange("channel", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todos os canais</option>
        <option value="web">Web</option>
        <option value="whatsapp">WhatsApp</option>
      </select>

      <select
        aria-label="Com candidatura"
        value={filters.has_application}
        onChange={(e) => onChange("has_application", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Com ou sem candidatura</option>
        <option value="true">Com candidatura</option>
        <option value="false">Sem candidatura</option>
      </select>

      <select
        aria-label="Com pipeline"
        value={filters.has_pipeline}
        onChange={(e) => onChange("has_pipeline", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Com ou sem pipeline</option>
        <option value="true">No pipeline</option>
        <option value="false">Fora do pipeline</option>
      </select>

      <Button variant="ghost" size="sm" onClick={onReset} type="button" className="min-h-11">
        <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Limpar
      </Button>
    </div>
  );
}

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onView,
}: {
  session: AssistantSessionListItem;
  onView: (id: string) => void;
}) {
  const statusVariant =
    STATUS_VARIANT[session.status] ?? "neutral";

  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-muted/40 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-text">
        <div className="flex flex-col gap-0.5">
          <span>{session.candidate.display_name}</span>
          {session.candidate.cpf_last4 && (
            <span className="text-xs text-text-muted">
              CPF: •••{session.candidate.cpf_last4}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-text-muted capitalize">
        {session.channel}
      </td>
      <td className="px-4 py-3 text-sm text-text-muted">
        {STATE_LABELS[session.current_state] ?? session.current_state}
      </td>
      <td className="px-4 py-3">
        <Badge variant={statusVariant}>
          {STATUS_LABEL[session.status] ?? session.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-text-muted">
        {session.application
          ? (APP_STATUS_LABEL[session.application.status] ?? session.application.status)
          : "—"}
      </td>
      <td className="px-4 py-3 text-sm text-text-muted">
        {session.pipeline ? (
          <span className="font-medium text-text">
            {session.pipeline.stage}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {formatDateTime(session.last_message_at)}
      </td>
      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(session.session_id)}
          aria-label="Ver conversa"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Ver conversa</span>
        </Button>
      </td>
    </tr>
  );
}

function SessionCompactItem({
  session,
  onView,
}: {
  session: AssistantSessionListItem;
  onView: (id: string) => void;
}) {
  const statusVariant = STATUS_VARIANT[session.status] ?? "neutral";

  return (
    <div className="border-b border-border px-4 py-4 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold text-text">
            {session.candidate.display_name}
          </p>
          {session.candidate.cpf_last4 && (
            <p className="text-xs text-text-muted">
              CPF: •••{session.candidate.cpf_last4}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={statusVariant}>
              {STATUS_LABEL[session.status] ?? session.status}
            </Badge>
            <span className="text-xs capitalize text-text-muted">
              {session.channel}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(session.session_id)}
          aria-label="Ver conversa"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Ver conversa</span>
        </Button>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Estado</dt>
          <dd className="text-text">
            {STATE_LABELS[session.current_state] ?? session.current_state}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Última interação</dt>
          <dd className="text-text">{formatDateTime(session.last_message_at)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Candidatura</dt>
          <dd className="text-text">
            {session.application
              ? (APP_STATUS_LABEL[session.application.status] ?? session.application.status)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Pipeline</dt>
          <dd className="text-text">{session.pipeline?.stage ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AssistantMessageItem }) {
  const isCandidate = msg.role === "candidate";
  const isSystem = msg.role === "system";

  return (
    <div
      className={
        isCandidate
          ? "flex justify-end"
          : isSystem
          ? "flex justify-center"
          : "flex justify-start"
      }
    >
      {!isCandidate && !isSystem && (
        <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <div
        className={[
          "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[75%]",
          isCandidate
            ? "bg-primary text-primary-foreground"
            : isSystem
            ? "bg-surface-muted text-text-muted text-xs italic px-3 py-1 rounded-full"
            : "bg-surface border border-border text-text",
        ].join(" ")}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {msg.quick_replies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.quick_replies.map((qr) => (
              <span
                key={qr.value}
                className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs text-text-muted"
              >
                {qr.label}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-right text-[10px] opacity-60">
          {formatDateTime(msg.created_at)}
        </p>
      </div>
      {isCandidate && (
        <div className="ml-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-muted">
          <User className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

// ── Session detail drawer ─────────────────────────────────────────────────────

function SessionDetailDrawer({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const detailState = useAsyncState<AssistantSessionDetail>();
  const messagesState = useAsyncState<AssistantMessageItem[]>();

  useEffect(() => {
    if (!sessionId) return;
    void detailState.run(() => assistantAdminService.getSession(sessionId));
    void messagesState.run(() =>
      assistantAdminService.listMessages(sessionId)
    );
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const session = detailState.data;
  const messages = messagesState.data ?? [];

  return (
    <Dialog open={!!sessionId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="mr-1"
              aria-label="Voltar para a lista de conversas"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <DialogTitle>Detalhe da conversa</DialogTitle>
          </div>
          <DialogDescription>
            Histórico somente leitura da conversa. Dados pessoais são exibidos de forma mascarada.
          </DialogDescription>
        </DialogHeader>

        {detailState.loading && (
          <div className="px-4">
            <SkeletonRows count={4} />
          </div>
        )}
        {detailState.error && (
          <div className="flex items-center gap-2 px-4 text-sm text-danger">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Não foi possível carregar a conversa.
          </div>
        )}

        {session && (
          <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-2 sm:px-4">
            {/* Session summary */}
            <Card className="max-w-full overflow-hidden">
              <CardContent className="pt-4 pb-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <User className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <span className="font-medium">{session.candidate.display_name}</span>
                  {session.candidate.cpf_last4 && (
                    <span className="text-xs text-text-muted">
                      CPF •••{session.candidate.cpf_last4}
                    </span>
                  )}
                  {session.candidate.identity_verified && (
                    <Badge variant="success" className="text-[10px]">
                      Verificado
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-text-muted sm:grid-cols-2">
                  <span>Estado: <span className="text-text">{STATE_LABELS[session.current_state] ?? session.current_state}</span></span>
                  <span>Status: <Badge variant={STATUS_VARIANT[session.status] ?? "neutral"} className="text-[10px]">{STATUS_LABEL[session.status] ?? session.status}</Badge></span>
                  <span>Canal: <span className="text-text capitalize">{session.channel}</span></span>
                  <span>Criado: <span className="text-text">{formatDateTime(session.created_at)}</span></span>
                  {session.application && (
                    <span>Candidatura: <span className="text-text">{APP_STATUS_LABEL[session.application.status] ?? session.application.status}</span></span>
                  )}
                  {session.pipeline && (
                    <span>Pipeline: <span className="text-text">{session.pipeline.stage}</span></span>
                  )}
                </div>
                {/* Context summary */}
                {(session.context_summary.location_hint ||
                  session.context_summary.desired_function ||
                  session.context_summary.desired_shift) && (
                  <div className="mt-2 rounded-lg bg-surface-muted p-2 text-xs text-text-muted space-y-0.5">
                    {session.context_summary.location_hint && (
                      <p>Localidade: <span className="text-text">{session.context_summary.location_hint}</span></p>
                    )}
                    {session.context_summary.desired_function && (
                      <p>Função: <span className="text-text">{session.context_summary.desired_function}</span></p>
                    )}
                    {session.context_summary.desired_shift && (
                      <p>Turno: <span className="text-text">{session.context_summary.desired_shift}</span></p>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-text-muted italic mt-1">
                  Dados mascarados pelo sistema. Histórico somente leitura.
                </p>
              </CardContent>
            </Card>

            {/* Messages thread */}
            <div className="space-y-3">
              {messagesState.loading && <SkeletonRows count={5} />}
              {messagesState.error && (
                <p className="text-sm text-danger">
                  Não foi possível carregar as mensagens.
                </p>
              )}
              {!messagesState.loading && messages.length === 0 && (
                <p className="text-center text-sm text-text-muted py-4">
                  Nenhuma mensagem nesta conversa.
                </p>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Failure filters ─────────────────────────────────────────────────────────

type FailureFiltersState = {
  status: string;
  reason: string;
  classification: string;
  state: string;
  has_candidate: string;
  has_application: string;
  session_id: string;
  from_date: string;
  to_date: string;
};

const EMPTY_FAILURE_FILTERS: FailureFiltersState = {
  status: "",
  reason: "",
  classification: "",
  state: "",
  has_candidate: "",
  has_application: "",
  session_id: "",
  from_date: "",
  to_date: "",
};

function FailureFilters({
  filters,
  onChange,
  onReset,
}: {
  filters: FailureFiltersState;
  onChange: (key: keyof FailureFiltersState, value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Status da falha"
        value={filters.status}
        onChange={(e) => onChange("status", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todos os status</option>
        {FAILURE_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {FAILURE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        aria-label="Motivo"
        value={filters.reason}
        onChange={(e) => onChange("reason", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todos os motivos</option>
        {REASON_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {REASON_LABEL[r]}
          </option>
        ))}
      </select>

      <select
        aria-label="Classificação"
        value={filters.classification}
        onChange={(e) => onChange("classification", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todas as classificações</option>
        {CLASSIFICATION_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {CLASSIFICATION_LABEL[c]}
          </option>
        ))}
      </select>

      <select
        aria-label="Estado"
        value={filters.state}
        onChange={(e) => onChange("state", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Todos os estados</option>
        {Object.entries(STATE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <select
        aria-label="Com candidato"
        value={filters.has_candidate}
        onChange={(e) => onChange("has_candidate", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Com ou sem candidato</option>
        <option value="true">Com candidato</option>
        <option value="false">Sem candidato</option>
      </select>

      <select
        aria-label="Com candidatura"
        value={filters.has_application}
        onChange={(e) => onChange("has_application", e.target.value)}
        className={filterSelectCls}
      >
        <option value="">Com ou sem candidatura</option>
        <option value="true">Com candidatura</option>
        <option value="false">Sem candidatura</option>
      </select>

      <input
        type="text"
        aria-label="ID da sessão"
        placeholder="ID da sessão"
        value={filters.session_id}
        onChange={(e) => onChange("session_id", e.target.value)}
        className={filterSelectCls + " w-44"}
      />

      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        De
        <input
          type="date"
          aria-label="Data inicial"
          value={filters.from_date}
          onChange={(e) => onChange("from_date", e.target.value)}
          className={filterSelectCls}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        Até
        <input
          type="date"
          aria-label="Data final"
          value={filters.to_date}
          onChange={(e) => onChange("to_date", e.target.value)}
          className={filterSelectCls}
        />
      </label>

      <Button variant="ghost" size="sm" onClick={onReset} type="button" className="min-h-11">
        <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Limpar
      </Button>
    </div>
  );
}

// ── Failure rows ────────────────────────────────────────────────────────────

function FailureRow({
  failure,
  onView,
}: {
  failure: AssistantFailureListItem;
  onView: (id: string) => void;
}) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-muted/40 transition-colors">
      <td className="px-3 py-3 text-sm text-text">
        <span className="line-clamp-2 break-words">{failure.sanitized_message}</span>
      </td>
      <td className="px-3 py-3 text-sm text-text-muted">
        {STATE_LABELS[failure.state] ?? failure.state}
      </td>
      <td className="px-3 py-3 text-sm text-text-muted">
        {reasonLabel(failure.reason)}
      </td>
      <td className="px-3 py-3">
        <Badge variant={FAILURE_STATUS_VARIANT[failure.status] ?? "neutral"}>
          {FAILURE_STATUS_LABEL[failure.status] ?? failure.status}
        </Badge>
      </td>
      <td className="px-3 py-3 text-sm text-text-muted">
        {classificationLabel(failure.classification)}
      </td>
      <td className="px-3 py-3 text-center text-sm text-text-muted">
        {failure.attempts_count ?? "—"}
      </td>
      <td className="px-3 py-3 text-sm text-text-muted">
        {failure.candidate_label}
      </td>
      <td className="px-3 py-3 text-sm text-text-muted">
        {failure.application
          ? (APP_STATUS_LABEL[failure.application.status] ?? failure.application.status)
          : "—"}
      </td>
      <td className="px-3 py-3 text-xs text-text-muted">
        {formatDateTime(failure.created_at)}
      </td>
      <td className="px-3 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(failure.id)}
          aria-label="Ver detalhe da falha"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Ver detalhe</span>
        </Button>
      </td>
    </tr>
  );
}

function FailureCompactItem({
  failure,
  onView,
}: {
  failure: AssistantFailureListItem;
  onView: (id: string) => void;
}) {
  return (
    <div className="border-b border-border px-4 py-4 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-2 break-words text-sm font-medium text-text">
            {failure.sanitized_message}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant={FAILURE_STATUS_VARIANT[failure.status] ?? "neutral"}>
              {FAILURE_STATUS_LABEL[failure.status] ?? failure.status}
            </Badge>
            <span className="text-xs text-text-muted">
              {reasonLabel(failure.reason)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onView(failure.id)}
          aria-label="Ver detalhe da falha"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Ver detalhe</span>
        </Button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-text-muted">Estado</dt>
          <dd className="text-text">{STATE_LABELS[failure.state] ?? failure.state}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Classificação</dt>
          <dd className="text-text">{classificationLabel(failure.classification)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Tentativas</dt>
          <dd className="text-text">{failure.attempts_count ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Candidato</dt>
          <dd className="text-text">{failure.candidate_label}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Candidatura</dt>
          <dd className="text-text">
            {failure.application
              ? (APP_STATUS_LABEL[failure.application.status] ?? failure.application.status)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Registrada</dt>
          <dd className="text-text">{formatDateTime(failure.created_at)}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── Failure detail drawer ───────────────────────────────────────────────────

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text">{children}</dd>
    </div>
  );
}

function FailureDetailDrawer({
  failureId,
  onClose,
  onUpdated,
}: {
  failureId: string | null;
  onClose: () => void;
  onUpdated: (failure: AssistantFailureDetail) => void;
}) {
  const detailState = useAsyncState<AssistantFailureDetail>();
  const [status, setStatus] = useState<AssistantFailureStatus | "">("");
  const [classification, setClassification] = useState<
    AssistantFailureClassification | ""
  >("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!failureId) return;
    setSaveError(null);
    setSavedAt(null);
    void detailState.run(() => assistantAdminService.getFailure(failureId)).then(
      (data) => {
        setStatus(data.status);
        setClassification(data.classification ?? "");
      },
      () => undefined
    );
  }, [failureId]); // eslint-disable-line react-hooks/exhaustive-deps

  const failure = detailState.data;
  const dirty =
    !!failure &&
    (status !== failure.status ||
      (classification || null) !== (failure.classification ?? null));

  async function handleSave() {
    if (!failureId || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await assistantAdminService.updateFailure(failureId, {
        status: status || undefined,
        classification: classification || undefined,
      });
      detailState.setData(updated);
      setStatus(updated.status);
      setClassification(updated.classification ?? "");
      setSavedAt(Date.now());
      onUpdated(updated);
    } catch {
      setSaveError("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!failureId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="mr-1"
              aria-label="Voltar para a lista de falhas"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <DialogTitle>Detalhe da falha</DialogTitle>
          </div>
          <DialogDescription>
            Mensagem já sanitizada pelo sistema. Dados pessoais não são exibidos.
          </DialogDescription>
        </DialogHeader>

        {detailState.loading && (
          <div className="px-4">
            <SkeletonRows count={4} />
          </div>
        )}
        {detailState.error && !detailState.loading && (
          <div className="flex items-center gap-2 px-4 text-sm text-danger">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Não foi possível carregar a falha.
          </div>
        )}

        {failure && (
          <div className="flex-1 space-y-4 overflow-y-auto px-1 pb-2 sm:px-4">
            {/* Sanitized message */}
            <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-text-muted">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Mensagem sanitizada
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-text">
                {failure.sanitized_message}
              </p>
            </div>

            {/* Attributes */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailField label="Estado">
                {STATE_LABELS[failure.state] ?? failure.state}
              </DetailField>
              <DetailField label="Motivo">{reasonLabel(failure.reason)}</DetailField>
              <DetailField label="Status">
                <Badge
                  variant={FAILURE_STATUS_VARIANT[failure.status] ?? "neutral"}
                  className="text-[10px]"
                >
                  {FAILURE_STATUS_LABEL[failure.status] ?? failure.status}
                </Badge>
              </DetailField>
              <DetailField label="Classificação">
                {classificationLabel(failure.classification)}
              </DetailField>
              <DetailField label="Tentativas">
                {failure.attempts_count ?? "—"}
              </DetailField>
              <DetailField label="Registrada">
                {formatDateTime(failure.created_at)}
              </DetailField>
              <DetailField label="Candidato">{failure.candidate_label}</DetailField>
              <DetailField label="Candidatura">
                {failure.application
                  ? (APP_STATUS_LABEL[failure.application.status] ??
                    failure.application.status)
                  : "—"}
              </DetailField>
              <DetailField label="Revisada por">
                {failure.reviewed_at ? formatDateTime(failure.reviewed_at) : "—"}
              </DetailField>
            </dl>

            {/* Linked session */}
            <div className="rounded-lg bg-surface-muted p-3 text-xs text-text-muted">
              <p className="mb-1 font-medium text-text">Sessão vinculada</p>
              <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                <span>
                  Canal: <span className="capitalize text-text">{failure.session.channel}</span>
                </span>
                <span>
                  Estado:{" "}
                  <span className="text-text">
                    {STATE_LABELS[failure.session.current_state] ??
                      failure.session.current_state}
                  </span>
                </span>
                <span>
                  Status:{" "}
                  <span className="text-text">
                    {STATUS_LABEL[failure.session.status] ?? failure.session.status}
                  </span>
                </span>
              </div>
            </div>

            {/* Classification / status form */}
            <form
              className="space-y-3 rounded-lg border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              <p className="text-sm font-medium text-text">Classificar falha</p>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Status
                  <select
                    aria-label="Novo status"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as AssistantFailureStatus)
                    }
                    className={filterSelectCls}
                  >
                    {FAILURE_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {FAILURE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Classificação
                  <select
                    aria-label="Nova classificação"
                    value={classification}
                    onChange={(e) =>
                      setClassification(
                        e.target.value as AssistantFailureClassification
                      )
                    }
                    className={filterSelectCls}
                  >
                    <option value="">Sem classificação</option>
                    {CLASSIFICATION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {CLASSIFICATION_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {saveError && (
                <p className="flex items-center gap-1.5 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {saveError}
                </p>
              )}
              {savedAt && !dirty && !saveError && (
                <p className="text-sm text-success">Alterações salvas.</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button type="submit" size="sm" disabled={!dirty || saving}>
                  <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </form>

            <p className="flex items-center gap-1.5 text-[11px] italic text-text-muted">
              <Info className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              Somente status e classificação podem ser alterados. A mensagem é somente
              leitura e já sanitizada.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Failures panel ──────────────────────────────────────────────────────────

const FAILURES_PAGE_SIZE = 20;

function FailuresPanel() {
  const [filters, setFilters] = useState<FailureFiltersState>(EMPTY_FAILURE_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedFailureId, setSelectedFailureId] = useState<string | null>(null);

  const failuresState =
    useAsyncState<Awaited<ReturnType<typeof assistantAdminService.listFailures>>>();

  const loadFailures = useCallback(() => {
    const params: ListFailuresParams = {
      page,
      page_size: FAILURES_PAGE_SIZE,
    };
    if (filters.status) params.status = filters.status;
    if (filters.reason) params.reason = filters.reason;
    if (filters.classification) params.classification = filters.classification;
    if (filters.state) params.state = filters.state;
    if (filters.session_id.trim()) params.session_id = filters.session_id.trim();
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    if (filters.has_candidate !== "")
      params.has_candidate = filters.has_candidate === "true";
    if (filters.has_application !== "")
      params.has_application = filters.has_application === "true";
    void failuresState.run(() => assistantAdminService.listFailures(params));
  }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFailures();
  }, [loadFailures]);

  function handleFilterChange(key: keyof FailureFiltersState, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleReset() {
    setFilters(EMPTY_FAILURE_FILTERS);
    setPage(1);
  }

  function handleUpdated(updated: AssistantFailureDetail) {
    failuresState.setData((prev) =>
      prev
        ? {
            ...prev,
            data: prev.data.map((f) =>
              f.id === updated.id
                ? { ...f, status: updated.status, classification: updated.classification }
                : f
            ),
          }
        : prev
    );
  }

  const failures = failuresState.data?.data ?? [];
  const totalPages = failuresState.data?.total_pages ?? 1;
  const total = failuresState.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <FailureFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
      />

      <Card className="max-w-full overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Falhas
            {!failuresState.loading && (
              <span className="ml-2 text-sm font-normal text-text-muted">
                ({total})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Mensagens já sanitizadas. Nenhum dado pessoal é exibido.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {failuresState.loading && (
            <div className="px-6 py-4">
              <SkeletonRows count={6} />
            </div>
          )}

          {failuresState.error && !failuresState.loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-text">
                Não foi possível carregar as falhas.
              </p>
              <Button variant="ghost" size="sm" onClick={loadFailures}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Tentar novamente
              </Button>
            </div>
          )}

          {!failuresState.loading && !failuresState.error && failures.length === 0 && (
            <EmptyState
              icon={<AlertTriangle className="h-8 w-8 text-text-muted" aria-hidden="true" />}
              title="Nenhuma falha encontrada"
              description="Tente ajustar os filtros. Falhas aparecem quando o assistente não consegue avançar a conversa."
            />
          )}

          {!failuresState.loading && failures.length > 0 && (
            <>
              <div className="lg:hidden">
                {failures.map((failure) => (
                  <FailureCompactItem
                    key={failure.id}
                    failure={failure}
                    onView={setSelectedFailureId}
                  />
                ))}
              </div>

              <div className="hidden max-w-full overflow-x-auto lg:block">
                <table className="w-full table-fixed text-left" aria-label="Lista de falhas">
                  <colgroup>
                    <col className="w-[20%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                    <col className="w-[7%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[8%]" />
                    <col className="w-[4%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/50 text-xs uppercase text-text-muted">
                      <th className="px-3 py-2.5 font-medium">Mensagem</th>
                      <th className="px-3 py-2.5 font-medium">Estado</th>
                      <th className="px-3 py-2.5 font-medium">Motivo</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Class.</th>
                      <th className="px-3 py-2.5 font-medium">Tent.</th>
                      <th className="px-3 py-2.5 font-medium">Candidato</th>
                      <th className="px-3 py-2.5 font-medium">Candid.</th>
                      <th className="px-3 py-2.5 font-medium">Data</th>
                      <th className="px-3 py-2.5 font-medium">
                        <span className="sr-only">Ação</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((failure) => (
                      <FailureRow
                        key={failure.id}
                        failure={failure}
                        onView={setSelectedFailureId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-sm text-text-muted">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FailureDetailDrawer
        failureId={selectedFailureId}
        onClose={() => setSelectedFailureId(null)}
        onUpdated={handleUpdated}
      />
    </div>
  );
}

// ── Flow (Fluxo de perguntas) ────────────────────────────────────────────────

const PII_ERROR_MESSAGE =
  "Esse texto parece conter dado pessoal. Remova CPF, telefone ou e-mail.";
const PLACEHOLDER_ERROR_MESSAGE =
  "Texto contém um placeholder não permitido para este estado.";

function friendlyPatchError(error: string | null): string {
  if (!error) return "";
  const lower = error.toLowerCase();
  if (lower.includes("pii") || lower.includes("pessoal") || lower.includes("cpf") || lower.includes("telefone") || lower.includes("e-mail"))
    return PII_ERROR_MESSAGE;
  if (lower.includes("placeholder") || lower.includes("não permitido") || lower.includes("not permitted"))
    return PLACEHOLDER_ERROR_MESSAGE;
  return error;
}

function formatSettingValue(
  value: AssistantSettingValue,
  isSensitive: boolean
): string {
  if (isSensitive && value == null) return "Protegido";
  if (value == null) return "—";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function FlowContentBlock({
  title,
  icon,
  text,
  emptyHint,
}: {
  title: string;
  icon: ReactNode;
  text: string | null;
  emptyHint: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
        {icon}
        {title}
      </div>
      {text ? (
        <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-muted/40 p-3 text-sm text-text">
          {text}
        </p>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm italic text-text-muted">
          {emptyHint}
        </p>
      )}
    </div>
  );
}

function StateBadges({ state }: { state: AssistantState }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state.is_editable ? (
        <Badge variant="success" className="text-[10px]">
          Editável
        </Badge>
      ) : (
        <Badge variant="muted" className="text-[10px]">
          Não editável
        </Badge>
      )}
      {state.is_sensitive && (
        <Badge variant="warning" className="text-[10px]">
          <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
          Sensível
        </Badge>
      )}
    </div>
  );
}

// ── State content edit form ───────────────────────────────────────────────────

function StateContentEditForm({
  content,
  stateKey,
  allowedPlaceholders,
  onSaved,
  onCancel,
}: {
  content: AssistantStateContent;
  stateKey: string;
  allowedPlaceholders: string[];
  onSaved: (updated: AssistantStateContent) => void;
  onCancel: () => void;
}) {
  const [promptText, setPromptText] = useState(content.prompt_text);
  const [helperText, setHelperText] = useState(content.helper_text ?? "");
  const [fallbackText, setFallbackText] = useState(content.fallback_text ?? "");
  const [inputPlaceholder, setInputPlaceholder] = useState(content.input_placeholder ?? "");
  const [isActive, setIsActive] = useState(content.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    promptText !== content.prompt_text ||
    helperText !== (content.helper_text ?? "") ||
    fallbackText !== (content.fallback_text ?? "") ||
    inputPlaceholder !== (content.input_placeholder ?? "") ||
    isActive !== content.is_active;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promptText.trim()) { setError("O texto da pergunta é obrigatório."); return; }
    setSaving(true); setError(null); setSaved(false);
    const payload: UpdateStateContentPayload = {
      prompt_text: promptText.trim(),
      helper_text: helperText.trim() || null,
      fallback_text: fallbackText.trim() || null,
      input_placeholder: inputPlaceholder.trim() || null,
      is_active: isActive,
    };
    try {
      const updated = await assistantAdminService.updateStateContent(stateKey, payload);
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setError(friendlyPatchError(err instanceof Error ? err.message : "Erro ao salvar."));
    } finally {
      setSaving(false);
    }
  }

  const textareaClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 resize-y min-h-[72px]";
  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {allowedPlaceholders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-muted/40 px-3 py-2 text-xs text-text-muted">
          <Info className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>Placeholders permitidos:</span>
          {allowedPlaceholders.map((p) => (
            <code key={p} className="rounded bg-surface px-1">{`{${p}}`}</code>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-muted" htmlFor="sc-prompt">
          Texto da pergunta <span className="text-danger">*</span>
        </label>
        <textarea
          id="sc-prompt"
          aria-label="Texto da pergunta"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          className={textareaClass}
          disabled={saving}
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-muted" htmlFor="sc-helper">
          Texto auxiliar
        </label>
        <textarea
          id="sc-helper"
          aria-label="Texto auxiliar"
          value={helperText}
          onChange={(e) => setHelperText(e.target.value)}
          className={textareaClass}
          disabled={saving}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-muted" htmlFor="sc-fallback">
          Fallback (quando não entendido)
        </label>
        <textarea
          id="sc-fallback"
          aria-label="Fallback"
          value={fallbackText}
          onChange={(e) => setFallbackText(e.target.value)}
          className={textareaClass}
          disabled={saving}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-muted" htmlFor="sc-placeholder">
          Placeholder do campo de entrada
        </label>
        <input
          id="sc-placeholder"
          type="text"
          aria-label="Placeholder do campo de entrada"
          value={inputPlaceholder}
          onChange={(e) => setInputPlaceholder(e.target.value)}
          className={inputClass}
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="sc-active"
          type="checkbox"
          aria-label="Conteúdo ativo"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={saving}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <label htmlFor="sc-active" className="text-sm text-text">
          Conteúdo ativo
        </label>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/5 p-2.5 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm text-success">Conteúdo salvo com sucesso.</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={!dirty || saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ── Quick reply edit form ─────────────────────────────────────────────────────

function QuickReplyEditForm({
  qr,
  stateIsEditable,
  onSaved,
  onCancel,
}: {
  qr: AssistantQuickReply;
  stateIsEditable: boolean;
  onSaved: (updated: AssistantQuickReply) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(qr.label);
  const [sortOrder, setSortOrder] = useState(String(qr.sort_order));
  const [isActive, setIsActive] = useState(qr.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    label !== qr.label ||
    sortOrder !== String(qr.sort_order) ||
    isActive !== qr.is_active;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setError("O texto apresentado ao candidato é obrigatório."); return; }
    const orderNum = parseInt(sortOrder, 10);
    if (isNaN(orderNum) || orderNum < 0) { setError("Ordem deve ser um número maior ou igual a zero."); return; }
    setSaving(true); setError(null); setSaved(false);
    const payload: UpdateQuickReplyPayload = {
      label: label.trim(),
      sort_order: orderNum,
      is_active: isActive,
    };
    try {
      const updated = await assistantAdminService.updateQuickReply(qr.id, payload);
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setError(friendlyPatchError(err instanceof Error ? err.message : "Erro ao salvar."));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-lg bg-surface-muted/40 p-2.5 text-xs text-text-muted">
        Valor técnico (engine, somente leitura):{" "}
        <code className="font-semibold text-text">{qr.value}</code>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-muted" htmlFor={`qr-label-${qr.id}`}>
          Texto apresentado ao candidato <span className="text-danger">*</span>
        </label>
        <input
          id={`qr-label-${qr.id}`}
          type="text"
          aria-label="Texto apresentado ao candidato"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
          disabled={saving || !stateIsEditable}
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-muted" htmlFor={`qr-order-${qr.id}`}>
          Ordem de exibição
        </label>
        <input
          id={`qr-order-${qr.id}`}
          type="number"
          aria-label="Ordem de exibição"
          min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className={inputClass + " w-24"}
          disabled={saving || !stateIsEditable}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`qr-active-${qr.id}`}
          type="checkbox"
          aria-label="Ativo"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={saving || !stateIsEditable}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <label htmlFor={`qr-active-${qr.id}`} className="text-sm text-text">Ativo</label>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger/5 p-2.5 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm text-success">Resposta rápida salva.</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={!dirty || saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ── FlowStateDetail (with editing) ───────────────────────────────────────────

function FlowStateDetail({
  state,
  content,
  quickReplies,
  onContentUpdated,
  onQuickReplyUpdated,
}: {
  state: AssistantState;
  content: AssistantStateContent | undefined;
  quickReplies: AssistantQuickReply[];
  onContentUpdated: (updated: AssistantStateContent) => void;
  onQuickReplyUpdated: (updated: AssistantQuickReply) => void;
}) {
  const [editingContent, setEditingContent] = useState(false);
  const [editingQrId, setEditingQrId] = useState<string | null>(null);

  // Close editor when the selected state changes.
  useEffect(() => {
    setEditingContent(false);
    setEditingQrId(null);
  }, [state.state]);

  const canEdit = state.is_editable && !state.is_sensitive;

  return (
    <div className="space-y-4">
      {/* State header */}
      <Card className="max-w-full overflow-hidden">
        <CardContent className="space-y-2 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-text">{state.label}</h3>
              <code className="text-xs text-text-muted">{state.state}</code>
            </div>
            <StateBadges state={state} />
          </div>
          {state.description && (
            <p className="text-sm text-text-muted">{state.description}</p>
          )}
          {state.is_sensitive && (
            <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-xs text-text">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" aria-hidden="true" />
              Este estado é sensível e não pode ser editado nesta fase.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Assistant texts */}
      <Card className="max-w-full overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Texto do assistente</CardTitle>
              <CardDescription>O que o candidato lê neste passo.</CardDescription>
            </div>
            {canEdit && content && !editingContent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingContent(true)}
                aria-label="Editar conteúdo do estado"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Editar conteúdo
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editingContent && content ? (
            <StateContentEditForm
              content={content}
              stateKey={state.state}
              allowedPlaceholders={state.allowed_placeholders}
              onSaved={(updated) => {
                onContentUpdated(updated);
                setEditingContent(false);
              }}
              onCancel={() => setEditingContent(false)}
            />
          ) : content ? (
            <>
              <FlowContentBlock
                title="Texto da pergunta"
                icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
                text={content.prompt_text}
                emptyHint="Sem texto de pergunta configurado."
              />
              <FlowContentBlock
                title="Texto auxiliar"
                icon={<Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />}
                text={content.helper_text}
                emptyHint="Sem texto auxiliar."
              />
              <FlowContentBlock
                title="Fallback"
                icon={<CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                text={content.fallback_text}
                emptyHint="Sem mensagem de fallback."
              />
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 pt-1 text-xs text-text-muted sm:grid-cols-3">
                <span>
                  Placeholder do campo:{" "}
                  <span className="text-text">{content.input_placeholder ?? "—"}</span>
                </span>
                <span>
                  Conteúdo ativo:{" "}
                  <span className="text-text">{content.is_active ? "Sim" : "Não"}</span>
                </span>
                <span>
                  Versão: <span className="text-text">{content.version}</span>
                </span>
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm italic text-text-muted">
              Conteúdo não configurado para este estado.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick replies */}
      <Card className="max-w-full overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Respostas rápidas</CardTitle>
          <CardDescription>
            <span className="font-medium text-text">Texto</span> é o que o candidato vê;{" "}
            <span className="font-medium text-text">valor</span> é o dado técnico da engine (imutável).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {quickReplies.length === 0 ? (
            <p className="px-4 py-4 text-sm italic text-text-muted">
              Nenhuma resposta rápida neste estado.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {quickReplies.map((qr) => (
                <div key={qr.id} className="px-4 py-3">
                  {editingQrId === qr.id ? (
                    <QuickReplyEditForm
                      qr={qr}
                      stateIsEditable={canEdit}
                      onSaved={(updated) => {
                        onQuickReplyUpdated(updated);
                        setEditingQrId(null);
                      }}
                      onCancel={() => setEditingQrId(null)}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div>
                          <p className="text-sm text-text">{qr.label}</p>
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <code>{qr.value}</code>
                            <span>·</span>
                            <span>Ordem: {qr.sort_order}</span>
                            <span>·</span>
                            <Badge variant={qr.is_active ? "success" : "muted"} className="text-[10px]">
                              {qr.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingQrId(qr.id)}
                          aria-label={`Editar resposta rápida ${qr.label}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="ml-1 hidden sm:inline">Editar resposta</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FlowPanel() {
  const statesState = useAsyncState<AssistantState[]>();
  const [contents, setContents] = useState<AssistantStateContent[]>([]);
  const [quickReplies, setQuickReplies] = useState<AssistantQuickReply[]>([]);
  const contentsState = useAsyncState<AssistantStateContent[]>();
  const quickRepliesState = useAsyncState<AssistantQuickReply[]>();
  const settingsState = useAsyncState<AssistantSetting[]>();
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const loadFlow = useCallback(() => {
    void statesState.run(() => assistantAdminService.listAssistantStates());
    void contentsState.run(() => assistantAdminService.listStateContents()).then(
      (data) => { if (data) setContents(data); },
      () => undefined
    );
    void quickRepliesState.run(() => assistantAdminService.listQuickReplies()).then(
      (data) => { if (data) setQuickReplies(data); },
      () => undefined
    );
    void settingsState.run(() => assistantAdminService.listAssistantSettings());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  const states = statesState.data ?? [];
  const sortedStates = [...states].sort((a, b) => a.order - b.order);

  // Default-select the first state once the list is available.
  useEffect(() => {
    if (sortedStates.length === 0) return;
    if (selectedState && sortedStates.some((s) => s.state === selectedState)) return;
    setSelectedState(sortedStates[0].state);
  }, [sortedStates, selectedState]);

  const selected = sortedStates.find((s) => s.state === selectedState);
  const selectedContent = contents.find((c) => c.state === selectedState);
  const selectedQuickReplies = quickReplies
    .filter((q) => q.state === selectedState)
    .sort((a, b) => a.sort_order - b.sort_order);

  const settings = settingsState.data ?? [];

  function handleContentUpdated(updated: AssistantStateContent) {
    setContents((prev) => prev.map((c) => (c.state === updated.state ? updated : c)));
  }

  function handleQuickReplyUpdated(updated: AssistantQuickReply) {
    setQuickReplies((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  }

  return (
    <div className="space-y-4">
      {/* Editorial notice */}
      <div
        role="note"
        className="flex flex-wrap items-start gap-2 rounded-xl border border-border bg-surface-muted/40 p-3 text-sm"
      >
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-muted" aria-hidden="true" />
        <div>
          <p className="font-medium text-text">
            A edição altera apenas o conteúdo salvo.
          </p>
          <p className="text-text-muted">
            A engine ainda não usa estes textos em produção. A topologia do fluxo
            (estados e transições) não pode ser alterada.
          </p>
        </div>
      </div>

      {statesState.loading && (
        <Card>
          <CardContent className="py-6">
            <SkeletonRows count={6} />
          </CardContent>
        </Card>
      )}

      {statesState.error && !statesState.loading && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
            <p className="text-sm font-medium text-text">
              Não foi possível carregar o fluxo de perguntas.
            </p>
            <Button variant="ghost" size="sm" onClick={loadFlow}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {!statesState.loading && !statesState.error && sortedStates.length === 0 && (
        <EmptyState
          icon={<Settings className="h-8 w-8 text-text-muted" aria-hidden="true" />}
          title="Nenhum estado configurado"
          description="O fluxo do assistente ainda não retornou estados para exibir."
        />
      )}

      {!statesState.loading && !statesState.error && sortedStates.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* States list */}
          <Card className="max-w-full overflow-hidden lg:self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Estados</CardTitle>
              <CardDescription>Ordem fixa do fluxo.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul>
                {sortedStates.map((s, idx) => {
                  const isSelected = s.state === selectedState;
                  return (
                    <li key={s.state}>
                      <button
                        type="button"
                        onClick={() => setSelectedState(s.state)}
                        aria-current={isSelected ? "true" : undefined}
                        className={[
                          "w-full border-b border-border px-4 py-3 text-left transition-colors last:border-0",
                          isSelected
                            ? "bg-primary/10"
                            : "hover:bg-surface-muted/40",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-text-muted">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text">
                                {s.label}
                              </p>
                              <code className="text-[10px] text-text-muted">
                                {s.state}
                              </code>
                            </div>
                          </div>
                          <ChevronRight
                            className="h-4 w-4 flex-shrink-0 text-text-muted"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="mt-1.5 pl-7">
                          <StateBadges state={s} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Selected state detail */}
          <div>
            {selected ? (
              <FlowStateDetail
                state={selected}
                content={selectedContent}
                quickReplies={selectedQuickReplies}
                onContentUpdated={handleContentUpdated}
                onQuickReplyUpdated={handleQuickReplyUpdated}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-text-muted">
                  Selecione um estado para ver os detalhes.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Related settings */}
      {!statesState.loading && !statesState.error && (
        <Card className="max-w-full overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configurações relacionadas</CardTitle>
            <CardDescription>
              Parâmetros gerais do assistente. Somente leitura nesta fase.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {settingsState.loading && (
              <div className="px-4 py-4">
                <SkeletonRows count={3} />
              </div>
            )}
            {settingsState.error && !settingsState.loading && (
              <p className="px-4 py-4 text-sm text-text-muted">
                Não foi possível carregar as configurações.
              </p>
            )}
            {!settingsState.loading && !settingsState.error && settings.length === 0 && (
              <p className="px-4 py-4 text-sm italic text-text-muted">
                Nenhuma configuração disponível.
              </p>
            )}
            {!settingsState.loading && settings.length > 0 && (
              <ul className="divide-y divide-border">
                {settings.map((setting) => (
                  <li
                    key={setting.key}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">
                        {setting.description ?? setting.key}
                      </p>
                      <code className="text-[10px] text-text-muted">{setting.key}</code>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {setting.is_sensitive && (
                        <Lock
                          className="h-3.5 w-3.5 text-text-muted"
                          aria-label="Valor protegido"
                        />
                      )}
                      <span className="text-sm text-text">
                        {formatSettingValue(setting.value_json, setting.is_sensitive)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function AssistantAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "conversas";

  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const sessionsState = useAsyncState<Awaited<ReturnType<typeof assistantAdminService.listSessions>>>();

  const loadSessions = useCallback(() => {
    const params: ListSessionsParams = {
      page,
      page_size: PAGE_SIZE,
    };
    if (filters.status) params.status = filters.status;
    if (filters.current_state) params.current_state = filters.current_state;
    if (filters.channel) params.channel = filters.channel;
    if (filters.has_application !== "")
      params.has_application = filters.has_application === "true";
    if (filters.has_pipeline !== "")
      params.has_pipeline = filters.has_pipeline === "true";
    void sessionsState.run(() => assistantAdminService.listSessions(params));
  }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  function handleFilterChange(key: keyof FiltersState, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const sessions = sessionsState.data?.data ?? [];
  const totalPages = sessionsState.data?.total_pages ?? 1;
  const total = sessionsState.data?.total ?? 0;

  return (
    <div className="space-y-6 px-4 py-6">
      <PageHeader
        title="Assistente do Candidato"
        subtitle="Acompanhe conversas do Portal 2 sem expor dados sensíveis."
      />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", v);
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="conversas">
            <MessageSquare className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Conversas
          </TabsTrigger>
          <TabsTrigger value="falhas">
            <AlertTriangle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Falhas
          </TabsTrigger>
          <TabsTrigger value="fluxo">
            <Settings className="mr-1.5 h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">Fluxo</span>
            <span className="hidden sm:inline">Fluxo de perguntas</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="mt-4 space-y-4">
          {/* Filters */}
          <SessionFilters
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleReset}
          />

          {/* Table card */}
          <Card className="max-w-full overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Conversas
                {!sessionsState.loading && (
                  <span className="ml-2 text-sm font-normal text-text-muted">
                    ({total})
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Somente leitura. Dados pessoais mascarados.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {sessionsState.loading && (
                <div className="px-6 py-4">
                  <SkeletonRows count={6} />
                </div>
              )}

              {sessionsState.error && !sessionsState.loading && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <AlertCircle className="h-8 w-8 text-danger" aria-hidden="true" />
                  <p className="text-sm font-medium text-text">
                    Não foi possível carregar as conversas.
                  </p>
                  <Button variant="ghost" size="sm" onClick={loadSessions}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Tentar novamente
                  </Button>
                </div>
              )}

              {!sessionsState.loading && !sessionsState.error && sessions.length === 0 && (
                <EmptyState
                  icon={<MessageSquare className="h-8 w-8 text-text-muted" aria-hidden="true" />}
                  title="Nenhuma conversa encontrada"
                  description="Tente ajustar os filtros ou aguardar novas interações no Portal 2."
                />
              )}

              {!sessionsState.loading && sessions.length > 0 && (
                <>
                  <div className="lg:hidden">
                    {sessions.map((session) => (
                      <SessionCompactItem
                        key={session.session_id}
                        session={session}
                        onView={setSelectedSessionId}
                      />
                    ))}
                  </div>

                  <div className="hidden max-w-full overflow-x-auto lg:block">
                    <table className="min-w-[760px] text-left" aria-label="Lista de conversas">
                      <thead>
                        <tr className="border-b border-border bg-surface-muted/50 text-xs uppercase text-text-muted">
                          <th className="px-4 py-2.5 font-medium">Candidato</th>
                          <th className="px-4 py-2.5 font-medium">Canal</th>
                          <th className="px-4 py-2.5 font-medium">Estado</th>
                          <th className="px-4 py-2.5 font-medium">Status</th>
                          <th className="px-4 py-2.5 font-medium">Candidatura</th>
                          <th className="px-4 py-2.5 font-medium">Pipeline</th>
                          <th className="px-4 py-2.5 font-medium">Última interação</th>
                          <th className="px-4 py-2.5 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => (
                          <SessionRow
                            key={session.session_id}
                            session={session}
                            onView={setSelectedSessionId}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-sm text-text-muted">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="falhas" className="mt-4">
          <FailuresPanel />
        </TabsContent>

        <TabsContent value="fluxo" className="mt-4">
          <FlowPanel />
        </TabsContent>
      </Tabs>

      {/* Session detail modal */}
      <SessionDetailDrawer
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </div>
  );
}
