import type {
  CandidateOverview,
  CandidatePipelineEntryOverview,
  CandidateResumeOverview,
  PipelineStage,
} from "../../../types/domain";
import { POST_HIRING_ACTIVE_STAGES as POST_HIRING_ACTIVE_STAGE_SET } from "../../../types/domain";
import { SUCCESS_TERMINAL_STAGES as SUCCESS_TERMINAL_STAGE_SET } from "../../../types/domain";

export const STAGE_LABEL: Record<PipelineStage, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  pre_admission: "Pré-admissão",
  protheus: "Protheus",
  admitted: "Admitido",
  rejected: "Reprovado",
};

export const ANALYSIS_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando análise",
  processing: "Em análise",
  retry_scheduled: "Reprocessamento agendado",
  completed: "Análise pronta",
  failed: "Análise falhou",
  cancelled: "Análise cancelada",
  discarded: "Análise descartada",
};

export function isPostHiringActiveStage(stage: string | null | undefined): stage is PipelineStage {
  return typeof stage === "string" && POST_HIRING_ACTIVE_STAGE_SET.has(stage as PipelineStage);
}

export function isSuccessTerminalStage(stage: string | null | undefined): stage is PipelineStage {
  return typeof stage === "string" && SUCCESS_TERMINAL_STAGE_SET.has(stage as PipelineStage);
}

export function getInitials(fullName: string): string {
  const parts = fullName
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function getActivePipelineEntry(
  overview: CandidateOverview | null,
): CandidatePipelineEntryOverview | null {
  if (!overview) return null;

  const entries = overview.pipeline_entries ?? [];
  const activeJobId = overview.active_job_id;

  if (activeJobId) {
    const activeByJob = entries.find((entry) => entry.job_id === activeJobId && !entry.is_terminal);
    if (activeByJob) return activeByJob;

    const postHiringByJob = entries.find(
      (entry) =>
        entry.job_id === activeJobId &&
        (isPostHiringActiveStage(entry.stage) ||
          isSuccessTerminalStage(entry.stage) ||
          entry.relationship_status === "hired"),
    );
    if (postHiringByJob) return postHiringByJob;
  }

  const activeEntry = entries.find((entry) => entry.relationship_status === "active" && !entry.is_terminal);
  if (activeEntry) return activeEntry;

  return (
    entries.find(
      (entry) =>
        isSuccessTerminalStage(entry.stage) ||
        isPostHiringActiveStage(entry.stage) ||
        entry.relationship_status === "hired",
    ) ?? null
  );
}

export function getActiveJobScore(
  overview: CandidateOverview | null,
  activeEntry: CandidatePipelineEntryOverview | null,
): number | null {
  if (!overview || !activeEntry) return null;

  if (overview.active_job_decision?.match_score != null) {
    return overview.active_job_decision.match_score;
  }

  const activeMatch = overview.top_matches.find((match) => match.job_id === activeEntry.job_id);
  return activeMatch?.job_fit_score ?? null;
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return status === "rejected";
}

export function formatScorePercent(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "-";
  const normalized = score > 1 ? score : score * 100;
  return `${Math.round(normalized)}%`;
}

export type CandidatePendency = {
  id: string;
  label: string;
  tone: "warning" | "info" | "block";
  action?: string | null;
  description?: string | null;
};

export function derivePendencies(overview: CandidateOverview | null): CandidatePendency[] {
  if (!overview) return [];

  const activeEntry = getActivePipelineEntry(overview);
  if (activeEntry && isSuccessTerminalStage(activeEntry.stage)) {
    return [];
  }

  // Gate-based pendencies (tone === "block") come from PipelineGateEvaluator on
  // the backend and are authoritative — they are the same gates that block stage
  // advancement. Show them exclusively when present.
  const gatePendencies = (overview.preview_pendencies ?? []).filter(
    (p) => p.tone === "block",
  );
  if (gatePendencies.length > 0) {
    return gatePendencies
      .map((p) => ({
        id: p.id,
        label: p.label,
        tone: "block" as const,
        action: p.action ?? null,
        description: p.description ?? null,
      }))
      .slice(0, 5);
  }

  // Non-gate pendencies from the backend (resume/analysis/document flags)
  const flagPendencies = (overview.preview_pendencies ?? []).filter(
    (p) => p.tone !== "block",
  );
  if (flagPendencies.length > 0) {
    return flagPendencies
      .map((p) => ({
        id: p.id,
        label: p.label,
        tone: (p.tone === "warning" ? "warning" : "info") as "warning" | "info",
        action: p.action ?? null,
        description: p.description ?? null,
      }))
      .slice(0, 3);
  }

  // Local fallback: no server-side pendencies, derive from raw overview fields
  const pendencies: CandidatePendency[] = [];
  const hasResume = (overview.resumes ?? []).length > 0;

  if (!hasResume) {
    pendencies.push({ id: "resume", label: "Currículo não enviado", tone: "warning" });
  } else if (overview.resumes.some((resume) => resume.extraction_status === "failed")) {
    pendencies.push({
      id: "resume_extraction",
      label: "Falha na extração do currículo",
      tone: "warning",
    });
  }

  const analysis = overview.latest_analysis;
  if (!analysis) {
    if (hasResume) {
      pendencies.push({ id: "analysis", label: "Análise pendente", tone: "info" });
    }
  } else if (
    analysis.status === "pending" ||
    analysis.status === "processing" ||
    analysis.status === "retry_scheduled"
  ) {
    pendencies.push({ id: "analysis_processing", label: "Análise em andamento", tone: "info" });
  } else if (analysis.status === "failed") {
    pendencies.push({ id: "analysis_failed", label: "Análise falhou", tone: "warning" });
  }

  return pendencies.slice(0, 3);
}

export function getPrimaryResume(overview: CandidateOverview | null): CandidateResumeOverview | null {
  if (!overview?.resumes?.length) return null;
  return (
    overview.resumes.find((resume) => Boolean(resume.current_version_id)) ??
    overview.resumes[0] ??
    null
  );
}

export function getResumeUrl(resume: CandidateResumeOverview | null): string | null {
  return resume?.resume_url ?? resume?.document_url ?? null;
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  for (const [unit, unitMs] of units) {
    const amount = Math.round(diffMs / unitMs);
    if (Math.abs(amount) >= 1) {
      return formatter.format(amount, unit);
    }
  }

  return "agora";
}

export function formatLatestMovement(overview: CandidateOverview | null): string | null {
  const movement = overview?.latest_movement;
  if (!movement) return null;

  const stageLabel = movement.to_stage
    ? STAGE_LABEL[movement.to_stage as PipelineStage] ?? movement.to_stage
    : "nova etapa";
  const when = formatRelativeTime(movement.moved_at);
  const by = movement.actor_name ? ` por ${movement.actor_name}` : "";
  const suffix = when ? ` ${when}` : "";

  return `Movido para ${stageLabel}${by}${suffix}.`;
}

export type NextActionSuggestion = {
  label: string;
  hint: string;
  targetTab?: string;
};

const _ACTION_CODE_LABEL: Record<string, string> = {
  open_pre_admission: "Abrir pré-admissão",
  open_decision: "Registrar decisão de contratação",
  open_behavioral_ai: "Avaliação IA comportamental",
  open_behavioral_assessment: "Avaliação comportamental",
  open_scorecard: "Registrar scorecard",
  open_interview: "Agendar / registrar entrevista",
  add_reason: "Informar motivo",
};

const _ACTION_CODE_TAB: Record<string, string> = {
  open_pre_admission: "pre_admission",
  open_decision: "workflow:hiring_decision",
  open_behavioral_ai: "assessments:behavioral_ai",
  open_behavioral_assessment: "assessments",
  open_scorecard: "interviews",
  open_interview: "interviews",
};

export function deriveNextAction(
  overview: CandidateOverview | null,
  activeEntry: CandidatePipelineEntryOverview | null,
): NextActionSuggestion {
  if (!activeEntry) {
    return { label: "Adicionar a uma vaga", hint: "Candidato sem vaga ativa" };
  }

  if (isSuccessTerminalStage(activeEntry.stage)) {
    return { label: "Sem ação pendente", hint: "Candidato admitido" };
  }

  if (
    isTerminalStatus(activeEntry.relationship_status) ||
    isTerminalStatus(activeEntry.candidate_status)
  ) {
    if (activeEntry.stage === "admitted") {
      return { label: "Sem ação pendente", hint: "Candidato admitido" };
    }
    if (isPostHiringActiveStage(activeEntry.stage) || activeEntry.relationship_status === "hired") {
      return { label: "Sem ação pendente", hint: "Contratado nesta vaga" };
    }
    return { label: "Sem ação pendente", hint: "Processo encerrado" };
  }

  const hasResume = (overview?.resumes ?? []).length > 0;
  if (!hasResume) {
    return { label: "Aguardar currículo", hint: "Candidato ainda não enviou currículo" };
  }

  // Gate-based pendencies are authoritative: the first gate's action code
  // becomes the primary next action, ensuring consistency with the blocked modal.
  const firstGatePendency = (overview?.preview_pendencies ?? []).find(
    (p) => p.tone === "block" && p.action,
  );
  if (firstGatePendency?.action) {
    const code = firstGatePendency.action;
    let targetTab = _ACTION_CODE_TAB[code];
    let label = _ACTION_CODE_LABEL[code] ?? firstGatePendency.label;
    let hint = firstGatePendency.description ?? firstGatePendency.label;

    if (
      firstGatePendency.id === "technical_interview_not_completed" ||
      (code === "open_interview" && firstGatePendency.action_payload?.interview_type === "technical")
    ) {
      targetTab = "interviews:schedule_technical";
      label = "Agendar entrevista técnica";
      hint = "Agende e conclua a entrevista técnica antes de avançar.";
    }

    return {
      label,
      hint,
      targetTab,
    };
  }

  const analysis = overview?.latest_analysis;
  if (
    !analysis ||
    analysis.status === "pending" ||
    analysis.status === "processing" ||
    analysis.status === "retry_scheduled"
  ) {
    return { label: "Aguardar análise da IA", hint: "Aderência será atualizada quando a análise terminar" };
  }

  switch (activeEntry.stage) {
    case "entry":
      return { label: "Mover para triagem", hint: "Sugestão com base no estágio atual" };
    case "screening":
      return { label: "Agendar entrevista", hint: "Candidato em triagem" };
    case "hr_interview":
    case "technical_interview":
      return { label: "Registrar feedback da entrevista", hint: "Entrevista em andamento", targetTab: "interviews" };
    case "final":
      return { label: "Avançar para proposta", hint: "Etapa final" };
    case "offer":
      return { label: "Mover para Contratado", hint: "Finalize a etapa na pipeline", targetTab: "workflow" };
    case "hired":
      return { label: "Mover para Pré-admissão", hint: "Inicie a preparação admissional", targetTab: "workflow" };
    case "pre_admission":
      return { label: "Mover para Protheus", hint: "Avance após concluir a pré-admissão", targetTab: "workflow" };
    case "protheus":
      return { label: "Mover para Admitido", hint: "Finalize a integração no ERP", targetTab: "workflow" };
    case "admitted":
      return { label: "Sem ação pendente", hint: "Candidato admitido" };
    default:
      return { label: "Revisar próximas etapas", hint: "Acompanhar pipeline" };
  }
}
