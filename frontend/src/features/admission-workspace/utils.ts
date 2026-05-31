import type {
  AdmissionWorkspaceBlockerSeverity,
  AdmissionWorkspaceChecklistItemStatus,
  AdmissionWorkspaceDocumentStatus,
} from "../../types/domain";
import { PRE_ADMISSION_WORKSPACE_STATUS_LABELS } from "../../shared/status/statusLabels";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(parsed);
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    hired: "Contratado",
    pre_admission: "Pré-admissão",
    protheus: "Protheus",
    admitted: "Admitido",
    rejected: "Encerrado",
    admission: "Admissão",
  };
  return labels[stage] ?? stage.replace(/_/g, " ");
}

export function caseStatusLabel(status: string): string {
  return PRE_ADMISSION_WORKSPACE_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function checklistItemStatusLabel(status: AdmissionWorkspaceChecklistItemStatus): string {
  const labels: Record<AdmissionWorkspaceChecklistItemStatus, string> = {
    pending: "Pendente",
    received: "Recebido",
    approved: "Aprovado",
    rejected: "Correção solicitada",
    not_required: "Dispensado",
  };
  return labels[status] ?? status;
}

export function documentStatusLabel(status: AdmissionWorkspaceDocumentStatus): string {
  const labels: Record<string, string> = {
    uploaded: "Em análise",
    approved: "Aprovado",
    rejected: "Correção solicitada",
    replaced: "Substituído",
    pending: "Pendente",
  };
  return labels[status] ?? status;
}

export function documentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cpf: "CPF",
    rg: "Documento de identidade",
    comprovante_endereco: "Comprovante de endereço",
    carteira_trabalho: "Carteira de trabalho",
    pis: "PIS",
    titulo_eleitor: "Título de eleitor",
    certificado_reservista: "Reservista",
    exame_admissional: "Exame admissional",
    dados_bancarios: "Dados bancários",
    other: "Outro",
    identity: "Documento de identidade",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

export function statusBadgeVariant(
  status: AdmissionWorkspaceChecklistItemStatus | AdmissionWorkspaceDocumentStatus | string,
): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "not_required") return "neutral";
  return "warning";
}

export function blockerBadgeVariant(
  severity: AdmissionWorkspaceBlockerSeverity,
): "danger" | "warning" | "neutral" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "neutral";
}

export function formatProgressLabel(approved: number, total: number): string {
  return `${approved}/${total}`;
}

export function progressPercent(approved: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((approved / total) * 100)));
}
