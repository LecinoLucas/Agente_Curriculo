import type { InterviewFormat, InterviewSchedule, InterviewStatus, InterviewType } from "../../types/agenda";
import {
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_TYPE_LABELS,
} from "../../shared/status/statusLabels";

export { INTERVIEW_FORMAT_LABELS, INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS };

export function interviewStatusLabel(status: InterviewStatus | string): string {
  return INTERVIEW_STATUS_LABELS[status as InterviewStatus] ?? status;
}

export function interviewTypeLabel(type: InterviewType | string): string {
  return INTERVIEW_TYPE_LABELS[type as InterviewType] ?? type;
}

export function interviewFormatLabel(format: InterviewFormat | string): string {
  return INTERVIEW_FORMAT_LABELS[format as InterviewFormat] ?? format;
}

export function scorecardStatusLabel(interview: Pick<InterviewSchedule, "scorecard_status">): string {
  if (interview.scorecard_status === "submitted") return "Enviado";
  if (interview.scorecard_status === "draft") return "Rascunho";
  return "Não iniciado";
}

export function scorecardActionLabel(interview: Pick<InterviewSchedule, "scorecard_status">): string {
  if (interview.scorecard_status === "submitted") return "Ver scorecard";
  if (interview.scorecard_status === "draft") return "Continuar scorecard";
  return "Preencher scorecard";
}

export function formatInterviewDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
