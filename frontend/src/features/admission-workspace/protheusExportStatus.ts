import type {
  KnownProtheusExportQueueStatus,
  KnownProtheusPayloadStatus,
  ProtheusExportQueueStatus,
  ProtheusPayloadStatus,
} from "../../types/domain";

export const PROTHEUS_QUEUE_STATUS_OPTIONS: readonly KnownProtheusExportQueueStatus[] = [
  "queued",
  "processing",
  "success",
  "retry_scheduled",
  "failed_permanent",
  "blocked",
  "cancelled",
];

export const PROTHEUS_PAYLOAD_STATUS_OPTIONS: readonly KnownProtheusPayloadStatus[] = [
  "ready",
  "incomplete",
];

type QueueTone =
  | "border-blue-200 bg-blue-50 text-blue-700"
  | "border-amber-200 bg-amber-50 text-amber-800"
  | "border-emerald-200 bg-emerald-50 text-emerald-700"
  | "border-red-200 bg-red-50 text-red-700"
  | "border-slate-200 bg-slate-100 text-slate-500";

type QueueStatusMeta = {
  label: string;
  description: string;
  tone: QueueTone;
  active: boolean;
  terminal: boolean;
};

export const QUEUE_STATUS_META: Record<KnownProtheusExportQueueStatus, QueueStatusMeta> = {
  queued: {
    label: "Solicitação enfileirada",
    description: "Aguarde o processamento automático pela fila de exportação.",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
    active: true,
    terminal: false,
  },
  processing: {
    label: "Em processamento",
    description: "Worker em execução. Aguarde a atualização do status.",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    active: true,
    terminal: false,
  },
  retry_scheduled: {
    label: "Retry agendado",
    description: "Retry automático agendado. Aguarde a próxima tentativa.",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    active: true,
    terminal: false,
  },
  success: {
    label: "Exportação concluída",
    description: "Concluído em modo seguro/STUB. Nenhum cadastro real foi executado.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    active: false,
    terminal: true,
  },
  failed_permanent: {
    label: "Exportação falhou",
    description: "Falha permanente. Revise o caso e solicite uma nova exportação após corrigir as pendências.",
    tone: "border-red-200 bg-red-50 text-red-700",
    active: false,
    terminal: true,
  },
  blocked: {
    label: "Bloqueado por segurança",
    description: "Envio real bloqueado por guardrail de segurança. Revisão técnica obrigatória antes de nova tentativa.",
    tone: "border-red-200 bg-red-50 text-red-700",
    active: false,
    terminal: true,
  },
  cancelled: {
    label: "Cancelado",
    description: "Solicitação cancelada. Nenhum envio ao Protheus real foi executado.",
    tone: "border-slate-200 bg-slate-100 text-slate-500",
    active: false,
    terminal: true,
  },
};

export const PAYLOAD_STATUS_LABELS: Record<KnownProtheusPayloadStatus, string> = {
  ready: "Payload pronto",
  incomplete: "Payload incompleto",
};

function getKnownQueueStatusMeta(status: ProtheusExportQueueStatus | null | undefined): QueueStatusMeta | null {
  if (!status || !(status in QUEUE_STATUS_META)) {
    return null;
  }
  return QUEUE_STATUS_META[status as KnownProtheusExportQueueStatus];
}

export function getQueueStatusLabel(
  status: ProtheusExportQueueStatus | null | undefined,
  fallback?: string | null,
): string {
  const known = getKnownQueueStatusMeta(status)?.label;
  if (known) return known;
  if (fallback && fallback.trim()) return fallback;
  return "Status desconhecido";
}

export function getQueueStatusDescription(
  status: ProtheusExportQueueStatus | null | undefined,
  fallback?: string | null,
): string {
  const known = getKnownQueueStatusMeta(status)?.description;
  if (known) return known;
  if (fallback && fallback.trim()) return fallback;
  return "Revise o status da bridge antes de prosseguir.";
}

export function getQueueStatusTone(status: ProtheusExportQueueStatus | null | undefined): QueueTone {
  return getKnownQueueStatusMeta(status)?.tone ?? "border-slate-200 bg-slate-100 text-slate-500";
}

export function isActiveQueueStatus(status: ProtheusExportQueueStatus | null | undefined): boolean {
  return getKnownQueueStatusMeta(status)?.active ?? false;
}

export function isTerminalQueueStatus(status: ProtheusExportQueueStatus | null | undefined): boolean {
  return getKnownQueueStatusMeta(status)?.terminal ?? false;
}

export function getPayloadStatusLabel(
  status: ProtheusPayloadStatus | null | undefined,
  fallback?: string | null,
): string {
  if (status && status in PAYLOAD_STATUS_LABELS) {
    return PAYLOAD_STATUS_LABELS[status as KnownProtheusPayloadStatus];
  }
  if (fallback && fallback.trim()) return fallback;
  return "Status do payload desconhecido";
}

export function canShowExportButton(options: {
  payloadStatus: ProtheusPayloadStatus | null | undefined;
  queueStatus?: ProtheusExportQueueStatus | null;
  canEnqueue?: boolean | null;
}): boolean {
  if (typeof options.canEnqueue === "boolean") {
    return options.canEnqueue;
  }
  return options.payloadStatus === "ready" && !options.queueStatus;
}

// ── Readiness labels ──────────────────────────────────────────────────────────

export const READINESS_LABELS: Record<string, string> = {
  not_ready: "Ainda não está pronto para exportação",
  ready_for_dry_run: "Pronto para validação",
  dry_run_failed: "Validação encontrou pendências",
  dry_run_passed: "Validação aprovada",
  export_blocked_by_flag: "Envio real bloqueado por segurança",
  export_pending: "Exportação pendente",
  export_failed: "Exportação falhou",
  export_success: "Exportado com sucesso",
  ready: "Pronto para operação",
};

export function getReadinessLabel(readiness: string | null | undefined): string {
  if (!readiness) return "—";
  return READINESS_LABELS[readiness] ?? readiness;
}

// ── Error code / blocked reason translations ──────────────────────────────────

export const ERROR_CODE_LABELS: Record<string, string> = {
  BRIDGE_TIMEOUT: "Timeout da conexão com a bridge",
  BRIDGE_FATAL: "Erro fatal na bridge — verifique os logs técnicos",
  BRIDGE_VALIDATION_ERROR: "Erro de validação na bridge",
  PROTHEUS_BLOCKED: "Bloqueio de segurança Protheus",
  PAYLOAD_INVALID: "Payload da exportação inválido",
  FIELD_MISSING: "Campo obrigatório ausente no payload",
  BRANCH_NOT_FOUND: "Filial não mapeada no Protheus",
  FUNCTION_NOT_FOUND: "Função ou cargo não encontrado no Protheus",
  COST_CENTER_NOT_FOUND: "Centro de custo não encontrado no Protheus",
};

export const BLOCKED_REASON_LABELS: Record<string, string> = {
  malicious_would_execute: "Guardrail bloqueou execução real (would_execute ativo)",
  real_send_not_enabled: "Envio real não habilitado neste ambiente",
  guardrail_active: "Guardrail de segurança ativo",
  erp_send_blocked: "Envio ao ERP bloqueado por configuração",
};

export function getErrorCodeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return ERROR_CODE_LABELS[code] ?? code;
}

export function getBlockedReasonLabel(reason: string | null | undefined): string {
  if (!reason) return "—";
  return BLOCKED_REASON_LABELS[reason] ?? reason;
}
