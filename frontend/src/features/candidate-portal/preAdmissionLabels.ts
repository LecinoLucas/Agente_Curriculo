import type {
  CandidatePortalPreAdmissionCase,
  CandidatePortalPreAdmissionChecklistItem,
  CandidatePortalPreAdmissionSummary,
} from "../../services/candidatePortalService";

export type PortalChecklistDisplayStatus =
  | "pending"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "waived";

export const CHECKLIST_STATUS_LABELS: Record<PortalChecklistDisplayStatus, string> = {
  pending: "Pendente",
  submitted: "Enviado",
  in_review: "Em análise",
  approved: "Aprovado",
  rejected: "Correção solicitada",
  waived: "Dispensado",
};

export type PortalProcessDisplayStatus =
  | "waiting_documents"
  | "in_review"
  | "corrections_requested"
  | "documents_approved"
  | "completed";

export const PROCESS_STATUS_LABELS: Record<PortalProcessDisplayStatus, string> = {
  waiting_documents: "Aguardando documentos",
  in_review: "Documentos em análise",
  corrections_requested: "Correções solicitadas",
  documents_approved: "Documentos aprovados",
  completed: "Pré-admissão concluída",
};

export const REJECTION_FALLBACK_MESSAGE =
  "Documento rejeitado. Envie uma nova versão para análise.";

export function resolveChecklistDisplayStatus(
  item: CandidatePortalPreAdmissionChecklistItem,
): PortalChecklistDisplayStatus {
  if (item.status === "approved") return "approved";
  if (item.status === "rejected") return "rejected";
  if (item.status === "waived") return "waived";
  if (item.uploaded_document?.status === "approved") return "approved";
  if (item.uploaded_document?.status === "rejected") return "rejected";
  if (item.uploaded_document?.status === "uploaded") return "in_review";
  if (item.status === "received") return "submitted";
  return "pending";
}

export function checklistStatusLabel(
  item: CandidatePortalPreAdmissionChecklistItem,
): string {
  return CHECKLIST_STATUS_LABELS[resolveChecklistDisplayStatus(item)];
}

export function resolveProcessDisplayStatus(
  caseData: CandidatePortalPreAdmissionCase | null,
  summary: CandidatePortalPreAdmissionSummary | null,
): PortalProcessDisplayStatus {
  if (caseData?.status === "admitted") return "completed";
  const items = caseData?.checklist_items ?? [];
  if (items.length === 0) return "waiting_documents";

  const buckets = items.map(resolveChecklistDisplayStatus);
  const hasRejected = buckets.includes("rejected");
  if (hasRejected) return "corrections_requested";

  const total = summary?.documents_total ?? items.length;
  const approved = summary?.documents_approved ?? buckets.filter((b) => b === "approved" || b === "waived").length;
  if (total > 0 && approved >= total) return "documents_approved";

  const hasInReview = buckets.includes("in_review") || buckets.includes("submitted");
  if (hasInReview) return "in_review";

  return "waiting_documents";
}

export function processStatusLabel(
  caseData: CandidatePortalPreAdmissionCase | null,
  summary: CandidatePortalPreAdmissionSummary | null,
): string {
  return PROCESS_STATUS_LABELS[resolveProcessDisplayStatus(caseData, summary)];
}

export function processNextStepHint(
  caseData: CandidatePortalPreAdmissionCase | null,
  summary: CandidatePortalPreAdmissionSummary | null,
): string {
  const status = resolveProcessDisplayStatus(caseData, summary);
  if (status === "completed") {
    return "Sua pré-admissão foi concluída. Aguarde os próximos contatos do RH.";
  }
  if (status === "corrections_requested") {
    return "Há documentos que precisam ser reenviados. Confira o motivo e suba uma nova versão.";
  }
  if (status === "documents_approved") {
    return "Tudo certo por aqui. Estamos finalizando sua admissão.";
  }
  if (status === "in_review") {
    return "Recebemos seus documentos. O RH vai analisar e te avisar caso precise de algo.";
  }
  if (summary?.next_pending_document) {
    return `Próximo documento: ${summary.next_pending_document}.`;
  }
  return "Envie os documentos solicitados pelo RH para avançar com a sua admissão.";
}
