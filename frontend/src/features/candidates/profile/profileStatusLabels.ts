import type { PipelineStage } from "../../../types/domain";
import type {
  BehavioralAssignmentDetailResponse,
} from "../../../types/domain";

export const STAGE_OPTIONS: Array<{ value: PipelineStage; label: string }> = [
  { value: "entry", label: "Entrada" },
  { value: "screening", label: "Triagem" },
  { value: "hr_interview", label: "Entrevista RH" },
  { value: "technical_interview", label: "Entrevista técnica" },
  { value: "final", label: "Decisão" },
  { value: "offer", label: "Oferta" },
  { value: "hired", label: "Contratado / iniciar admissão" },
  { value: "pre_admission", label: "Pré-admissão" },
  { value: "protheus", label: "Integração ERP" },
  { value: "admitted", label: "Admitido" },
  { value: "rejected", label: "Encerrado" },
];

export const BEHAVIORAL_STATUS_LABEL: Record<
  BehavioralAssignmentDetailResponse["status"],
  string
> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  submitted: "Concluído",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  hr: "Entrevista RH",
  technical: "Entrevista técnica",
  manager: "Entrevista gestor",
  final: "Entrevista final",
  other: "Entrevista",
};

export const SIMPLE_STATUS_LABEL: Record<string, string> = {
  scheduled: "agendada",
  rescheduled: "reagendada",
  awaiting_feedback: "aguardando feedback",
  completed: "concluída",
  cancelled: "cancelada",
  no_show: "não compareceu",
  draft: "rascunho",
  submitted: "enviado",
  pending: "pendente",
  in_progress: "em andamento",
  expired: "expirado",
  failed: "falhou",
  processing: "processando",
};

export const DECISION_OUTCOME_LABEL: Record<string, string> = {
  advance: "avançar",
  hold: "manter em análise",
  reject: "rejeitar",
  hire: "contratar",
  request_another_interview: "solicitar nova entrevista",
  keep_under_review: "manter em observação",
};

export function behavioralStatusTone(
  status: BehavioralAssignmentDetailResponse["status"],
): "success" | "neutral" | "info" | "danger" {
  if (status === "submitted") return "success";
  if (status === "expired" || status === "cancelled") return "danger";
  if (status === "in_progress") return "info";
  return "neutral";
}

export function behavioralKindLabel(
  assessment: BehavioralAssignmentDetailResponse,
  required: boolean,
): string {
  const templateName = assessment.template_name.toLowerCase();
  if (templateName.includes("pesquisa")) return "Pesquisa comportamental";
  if (templateName.includes("teste")) return "Teste comportamental";
  return required ? "Teste comportamental" : "Pesquisa comportamental";
}
