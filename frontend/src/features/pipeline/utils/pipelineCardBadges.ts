import type { AIAnalysisStatus, JobCandidate, PipelineStage } from "../../../types/domain";

export type PipelineCardBadgeTone = "danger" | "warning" | "progress" | "success" | "neutral";

export type PipelineCardBadge = {
  label: string;
  tone: PipelineCardBadgeTone;
  priority: number;
  reason?: string;
  icon?: "ai" | "score" | "assessment" | "interview" | "scorecard" | "decision" | "aging";
};

type BehavioralAssessmentStatus =
  | "not_started"
  | "pending"
  | "sent"
  | "assigned"
  | "invited"
  | "submitted"
  | "answered"
  | "completed"
  | string;

type InterviewStatus =
  | "pending"
  | "requested"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | string;

type PipelineCardBadgeCandidate = JobCandidate & {
  requires_behavioral_assessment?: boolean | null;
  requires_behavioral_ai_evaluation?: boolean | null;
  behavioral_template_required?: boolean | null;
  behavioral_assessment_status?: BehavioralAssessmentStatus | null;
  behavioral_assignment_status?: BehavioralAssessmentStatus | null;
  behavioral_ai_evaluation_status?: string | null;
  behavioral_submitted_at?: string | null;
  behavioral_assessment?: {
    template_required?: boolean | null;
    assignment_status?: BehavioralAssessmentStatus | null;
    submitted_at?: string | null;
    answered_count?: number | null;
    question_count?: number | null;
  } | null;
  requires_interview?: boolean | null;
  requires_scorecard?: boolean | null;
  interview_status?: InterviewStatus | null;
  interview_scheduled_start?: string | null;
  scheduled_interview_start?: string | null;
  interview_scorecard_status?: string | null;
  interview?: {
    status?: InterviewStatus | null;
    scheduled_start?: string | null;
  } | null;
};

type DerivePipelineCardBadgesOptions = {
  now?: Date;
  maxBadges?: number;
};

const INTERVIEW_STAGES = new Set<PipelineStage>(["hr_interview", "technical_interview"]);
const DECISION_STAGES = new Set<PipelineStage>(["final", "offer"]);
const DEFAULT_MAX_BADGES = 3;
const AGING_THRESHOLD_DAYS = 3;

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function isAnalysisInProgress(status: AIAnalysisStatus | null | undefined) {
  return status === "processing" || status === "retry_scheduled";
}

function isAnalysisPending(status: AIAnalysisStatus | null | undefined) {
  return status === null || status === undefined || status === "pending";
}

function getBehavioralStatus(candidate: PipelineCardBadgeCandidate) {
  return normalizeStatus(
    candidate.behavioral_assessment?.assignment_status ??
      candidate.behavioral_assessment_status ??
      candidate.behavioral_assignment_status,
  );
}

function getBehavioralSubmittedAt(candidate: PipelineCardBadgeCandidate) {
  return candidate.behavioral_assessment?.submitted_at ?? candidate.behavioral_submitted_at ?? null;
}

function isBehavioralRequired(candidate: PipelineCardBadgeCandidate) {
  return Boolean(
    candidate.behavioral_assessment?.template_required ??
      candidate.behavioral_template_required ??
      candidate.requires_behavioral_assessment,
  );
}

function getBehavioralAiStatus(candidate: PipelineCardBadgeCandidate) {
  return normalizeStatus(candidate.behavioral_ai_evaluation_status);
}

function getInterviewStatus(candidate: PipelineCardBadgeCandidate) {
  return normalizeStatus(candidate.interview?.status ?? candidate.interview_status);
}

function getInterviewScheduledStart(candidate: PipelineCardBadgeCandidate) {
  return (
    candidate.interview?.scheduled_start ??
    candidate.interview_scheduled_start ??
    candidate.scheduled_interview_start ??
    null
  );
}

function getInterviewScorecardStatus(candidate: PipelineCardBadgeCandidate) {
  return normalizeStatus(candidate.interview_scorecard_status);
}

function daysSince(isoDate: string | null | undefined, now: Date) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  const diffMs = now.getTime() - time;
  if (diffMs < 0) return null;
  return Math.floor(diffMs / 86_400_000);
}

function sortAndLimitBadges(badges: PipelineCardBadge[], maxBadges: number) {
  return badges
    .sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label))
    .slice(0, maxBadges);
}

export function derivePipelineCardBadges(
  candidate: PipelineCardBadgeCandidate,
  options: DerivePipelineCardBadgesOptions = {},
): PipelineCardBadge[] {
  const maxBadges = options.maxBadges ?? DEFAULT_MAX_BADGES;
  const now = options.now ?? new Date();
  const stage = candidate.stage;
  const badges: PipelineCardBadge[] = [];
  const aiStatus = candidate.ai_status ?? null;
  const hasScore = typeof candidate.job_fit_score === "number" && Number.isFinite(candidate.job_fit_score);

  if (isAnalysisInProgress(aiStatus)) {
    badges.push({
      label: "Análise em andamento",
      tone: "progress",
      priority: 92,
      reason: "A análise de IA ainda está processando.",
      icon: "ai",
    });
  } else if (isAnalysisPending(aiStatus)) {
    badges.push({
      label: "IA pendente",
      tone: "warning",
      priority: 90,
      reason: "Nenhuma análise de IA concluída para este candidato.",
      icon: "ai",
    });
  }

  if (aiStatus === "completed" && !hasScore) {
    badges.push({
      label: "Aguardando score",
      tone: "warning",
      priority: 88,
      reason: "A análise existe, mas o score da vaga ainda não está disponível.",
      icon: "score",
    });
  }

  const behavioralStatus = getBehavioralStatus(candidate);
  const behavioralSubmittedAt = getBehavioralSubmittedAt(candidate);
  const behavioralRequired = isBehavioralRequired(candidate);
  const behavioralAiStatus = getBehavioralAiStatus(candidate);

  if (
    behavioralSubmittedAt ||
    behavioralStatus === "submitted" ||
    behavioralStatus === "answered" ||
    behavioralStatus === "completed"
  ) {
    badges.push({
      label: "Avaliação respondida",
      tone: "success",
      priority: 58,
      reason: "Avaliação comportamental respondida pelo candidato.",
      icon: "assessment",
    });
  } else if (
    behavioralStatus === "sent" ||
    behavioralStatus === "assigned" ||
    behavioralStatus === "invited" ||
    behavioralStatus === "in_progress" ||
    behavioralStatus === "pending"
  ) {
    badges.push({
      label: "Avaliação enviada",
      tone: "progress",
      priority: 70,
      reason: "Avaliação comportamental enviada e aguardando resposta.",
      icon: "assessment",
    });
  } else if (behavioralRequired && (behavioralStatus === "not_started" || behavioralStatus === null)) {
    badges.push({
      label: "Sem avaliação",
      tone: "warning",
      priority: 82,
      reason: "A vaga exige avaliação comportamental, mas ela ainda não foi enviada.",
      icon: "assessment",
    });
  }

  const behavioralAnswered = Boolean(
    behavioralSubmittedAt ||
      behavioralStatus === "submitted" ||
      behavioralStatus === "answered" ||
      behavioralStatus === "completed",
  );

  if (behavioralAnswered && candidate.requires_behavioral_ai_evaluation) {
    if (behavioralAiStatus === "processing") {
      badges.push({
        label: "IA comportamental em andamento",
        tone: "progress",
        priority: 84,
        reason: "A análise assistida da avaliação comportamental ainda está processando.",
        icon: "ai",
      });
    } else if (behavioralAiStatus !== "completed") {
      badges.push({
        label: "IA comportamental pendente",
        tone: "warning",
        priority: 86,
        reason: "A vaga exige análise assistida da avaliação comportamental.",
        icon: "ai",
      });
    }
  }

  const interviewStatus = getInterviewStatus(candidate);
  const interviewScheduledStart = getInterviewScheduledStart(candidate);
  const isInterviewStage = stage ? INTERVIEW_STAGES.has(stage) : false;

  if (
    interviewScheduledStart ||
    interviewStatus === "scheduled" ||
    interviewStatus === "rescheduled" ||
    interviewStatus === "confirmed"
  ) {
    badges.push({
      label: "Entrevista marcada",
      tone: "success",
      priority: 56,
      reason: "Há entrevista agendada para este candidato.",
      icon: "interview",
    });
  } else if (
    interviewStatus === "pending" ||
    interviewStatus === "requested" ||
    (Boolean(candidate.requires_interview) && isInterviewStage)
  ) {
    badges.push({
      label: "Entrevista pendente",
      tone: "warning",
      priority: 76,
      reason: "Candidato está aguardando agendamento ou conclusão de entrevista.",
      icon: "interview",
    });
  }

  const scorecardStatus = getInterviewScorecardStatus(candidate);
  if (candidate.requires_scorecard && scorecardStatus !== "submitted" && (stage === "final" || stage === "offer")) {
    badges.push({
      label: "Scorecard pendente",
      tone: "warning",
      priority: 74,
      reason: "A vaga exige scorecard antes da decisão final.",
      icon: "scorecard",
    });
  }

  const blockingBadges = badges.some((badge) => badge.priority >= 70 && badge.tone !== "success");
  if (stage && DECISION_STAGES.has(stage) && hasScore && aiStatus === "completed" && !blockingBadges) {
    badges.push({
      label: "Pronto para decisão",
      tone: "success",
      priority: 52,
      reason: "Candidato tem score e não possui pendência operacional visível no card.",
      icon: "decision",
    });
  }

  const agingDays = daysSince(candidate.updated_at ?? candidate.entered_at, now);
  if (typeof agingDays === "number" && agingDays >= AGING_THRESHOLD_DAYS && stage !== "hired" && stage !== "rejected") {
    badges.push({
      label: `Parado há ${agingDays} dias`,
      tone: "neutral",
      priority: 40,
      reason: "Tempo desde a última atualização registrada na etapa.",
      icon: "aging",
    });
  }

  return sortAndLimitBadges(badges, maxBadges);
}
