import type { InterviewFormat, InterviewSchedule, InterviewStatus, InterviewType } from "../../types/agenda";

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: "Agendada",
  completed: "Concluída",
  awaiting_feedback: "Aguardando feedback",
  cancelled: "Cancelada",
  rescheduled: "Reagendada",
  no_show: "Não compareceu",
};

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  screening: "Triagem",
  technical: "Técnica",
  manager: "Gestor",
  hr: "RH",
  final: "Final",
  other: "Outra",
};

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  online: "Online",
  presencial: "Presencial",
  telefone: "Telefone",
};

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
