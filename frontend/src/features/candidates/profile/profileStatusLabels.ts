import type { PipelineStage } from "../../../types/domain";
import type {
  BehavioralAssignmentDetailResponse,
} from "../../../types/domain";
import {
  DECISION_OUTCOME_LABELS,
  HISTORY_STATUS_LABELS,
  INTERVIEW_TYPE_FULL_LABELS,
  PIPELINE_STAGE_LABELS,
} from "../../../shared/status/statusLabels";

export const STAGE_OPTIONS: Array<{ value: PipelineStage; label: string }> = [
  { value: "entry", label: PIPELINE_STAGE_LABELS.entry },
  { value: "screening", label: PIPELINE_STAGE_LABELS.screening },
  { value: "hr_interview", label: PIPELINE_STAGE_LABELS.hr_interview },
  { value: "technical_interview", label: PIPELINE_STAGE_LABELS.technical_interview },
  { value: "final", label: PIPELINE_STAGE_LABELS.final },
  { value: "offer", label: PIPELINE_STAGE_LABELS.offer },
  { value: "hired", label: PIPELINE_STAGE_LABELS.hired },
  { value: "pre_admission", label: PIPELINE_STAGE_LABELS.pre_admission },
  { value: "protheus", label: PIPELINE_STAGE_LABELS.protheus },
  { value: "admitted", label: PIPELINE_STAGE_LABELS.admitted },
  { value: "rejected", label: PIPELINE_STAGE_LABELS.rejected },
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

export const INTERVIEW_TYPE_LABEL: Record<string, string> = INTERVIEW_TYPE_FULL_LABELS;

export const SIMPLE_STATUS_LABEL: Record<string, string> = HISTORY_STATUS_LABELS;

export const DECISION_OUTCOME_LABEL: Record<string, string> = DECISION_OUTCOME_LABELS;

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
