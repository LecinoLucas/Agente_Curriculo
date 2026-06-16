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
    description: "Aguarde o processamento automático.",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
    active: true,
    terminal: false,
  },
  processing: {
    label: "Aguardando processamento",
    description: "Worker em execução. Aguarde a atualização da fila.",
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
    label: "Falha permanente",
    description: "Falha permanente. Revise o caso antes de solicitar uma nova exportação.",
    tone: "border-red-200 bg-red-50 text-red-700",
    active: false,
    terminal: true,
  },
  blocked: {
    label: "Bloqueado por guardrail",
    description: "Bloqueio técnico ativo. Revisão técnica obrigatória antes de nova tentativa.",
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
