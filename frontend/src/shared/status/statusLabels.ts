import type {
  HiringDecisionOutcome,
  PipelineStage,
  PreAdmissionStatus,
  ResumeAnalysisStatus,
} from "../../types/domain";
import type { InterviewFormat, InterviewStatus, InterviewType } from "../../types/agenda";

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  entry: "Entrada",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista técnica",
  final: "Decisão",
  offer: "Oferta",
  hired: "Contratado / iniciar admissão",
  pre_admission: "Pré-admissão",
  protheus: "Integração ERP",
  admitted: "Admitido",
  rejected: "Encerrado",
};

export const PUBLIC_PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  entry: "Entrada",
  screening: "Triagem",
  hr_interview: "Entrevista",
  technical_interview: "Entrevista",
  final: "Decisão",
  offer: "Oferta",
  hired: "Contratado",
  pre_admission: "Pré-admissão",
  protheus: "Integração admissional",
  admitted: "Admitido",
  rejected: "Processo encerrado",
};

export const ANALYSIS_STATUS_LABELS: Record<ResumeAnalysisStatus, string> = {
  waiting_extraction: "Aguardando extração",
  pending: "Análise na fila",
  processing: "Análise em processamento",
  retry_scheduled: "Reprocessamento agendado",
  completed: "Análise pronta",
  failed: "Análise falhou",
  cancelled: "Análise cancelada",
  discarded: "Análise descartada",
};

export const ANALYSIS_STATUS_COMPACT_LABELS: Record<ResumeAnalysisStatus, string> = {
  waiting_extraction: "Aguardando extração",
  pending: "Na fila",
  processing: "Processando",
  retry_scheduled: "Nova tentativa agendada",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
  discarded: "Descartada",
};

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

export const INTERVIEW_TYPE_FULL_LABELS: Record<InterviewType, string> = {
  screening: "Triagem",
  technical: "Entrevista técnica",
  manager: "Entrevista gestor",
  hr: "Entrevista RH",
  final: "Entrevista final",
  other: "Entrevista",
};

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  online: "Online",
  presencial: "Presencial",
  telefone: "Telefone",
};

export const INTERVIEW_STATUS_BADGE_VARIANTS: Record<
  InterviewStatus,
  "neutral" | "success" | "warning" | "danger" | "outline"
> = {
  scheduled: "neutral",
  completed: "success",
  awaiting_feedback: "warning",
  cancelled: "danger",
  rescheduled: "warning",
  no_show: "warning",
};

export const INTERVIEW_FORMAT_BADGE_VARIANTS: Record<
  InterviewFormat,
  "neutral" | "success" | "warning" | "outline"
> = {
  online: "success",
  presencial: "outline",
  telefone: "warning",
};

export const HISTORY_STATUS_LABELS: Record<string, string> = {
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

export const DECISION_OUTCOME_LABELS: Record<HiringDecisionOutcome, string> = {
  advance: "avançar",
  hold: "manter em análise",
  reject: "rejeitar",
  hire: "contratar",
  request_another_interview: "solicitar nova entrevista",
  keep_under_review: "manter em observação",
};

export const PRE_ADMISSION_STATUS_LABELS: Partial<Record<PreAdmissionStatus, string>> = {
  draft: "Em preparação",
  offer_preparing: "Oferta em preparação",
  offer_sent: "Oferta enviada",
  offer_accepted: "Oferta aceita",
  offer_declined: "Oferta recusada",
  documents_pending: "Documentos pendentes",
  documents_received: "Documentos recebidos",
  ready_for_admission: "Pronto para admissão",
  admitted: "Admitido",
  cancelled: "Cancelado",
};

export const PRE_ADMISSION_WORKSPACE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  offer_preparing: "Oferta em preparação",
  offer_sent: "Oferta enviada",
  offer_accepted: "Oferta aceita",
  offer_declined: "Oferta recusada",
  documents_pending: "Documentos pendentes",
  documents_received: "Documentos recebidos",
  ready_for_admission: "Pronto para exportação",
  admitted: "Admitido",
  cancelled: "Cancelado",
  in_progress: "Em andamento",
};

export const PRE_ADMISSION_SUMMARY_TITLE_LABELS: Record<string, string> = {
  draft: "Pré-admissão pendente",
  offer_preparing: "Pré-admissão em andamento",
  offer_sent: "Pré-admissão em andamento",
  offer_accepted: "Pré-admissão em andamento",
  offer_declined: "Pré-admissão pendente",
  documents_pending: "Pré-admissão em andamento",
  documents_received: "Pré-admissão em andamento",
  ready_for_admission: "Pré-admissão pronta para exportação",
  admitted: "Pré-admissão concluída",
  cancelled: "Pré-admissão cancelada",
  in_progress: "Pré-admissão em andamento",
};

export const DASHBOARD_PENDING_ACTION_LABELS: Record<string, string> = {
  awaiting_ai: "Aguardando análise IA",
  schedule_interview: "Marcar entrevista",
  interview_today: "Entrevista hoje",
  register_decision: "Registrar decisão",
  start_pre_admission: "Iniciar pré-admissão",
  document_pending: "Documento pendente",
};

export const DASHBOARD_PENDING_ACTION_TONE_CLASSES: Record<string, string> = {
  interview_today: "border-violet-200 bg-violet-50 text-violet-700",
  register_decision: "border-amber-200 bg-amber-50 text-amber-800",
  document_pending: "border-emerald-200 bg-emerald-50 text-emerald-700",
  start_pre_admission: "border-emerald-200 bg-emerald-50 text-emerald-700",
  awaiting_ai: "border-sky-200 bg-sky-50 text-sky-700",
  schedule_interview: "border-sky-200 bg-sky-50 text-sky-700",
};
