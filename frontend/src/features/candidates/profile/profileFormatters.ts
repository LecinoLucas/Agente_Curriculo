import type { ScoreExplanationResponse } from "../../../services/scoreExplanationService";
import type {
  BehavioralAIEvaluationResponse,
  BehavioralAssignmentDetailResponse,
} from "../../../types/domain";

export function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getScoreStrengths(scoreExplanation: ScoreExplanationResponse | null): string[] {
  if (!scoreExplanation) return [];
  const direct = [
    ...(scoreExplanation.highlights ?? []),
    ...(scoreExplanation.strengths ?? []),
    ...(scoreExplanation.high_score_reasons ?? []),
  ];
  const factors =
    scoreExplanation.score_factors?.positive?.map((item) => item.factor_label) ?? [];
  return Array.from(new Set([...direct, ...factors].filter(Boolean))).slice(0, 4);
}

export function getScoreAttentionPoints(
  scoreExplanation: ScoreExplanationResponse | null,
): string[] {
  if (!scoreExplanation) return [];
  const direct = [
    ...(scoreExplanation.risks ?? []),
    ...(scoreExplanation.low_score_reasons ?? []),
    ...(scoreExplanation.overestimation_risks ?? []),
    ...(scoreExplanation.gaps ?? []),
  ];
  const factors =
    scoreExplanation.score_factors?.negative?.map((item) => item.factor_label) ?? [];
  return Array.from(new Set([...direct, ...factors].filter(Boolean))).slice(0, 4);
}

export function getBehavioralAIStatusLabel(
  assignmentStatus: BehavioralAssignmentDetailResponse["status"],
  evaluation: BehavioralAIEvaluationResponse | null,
): string {
  if (assignmentStatus !== "submitted") return "Aguardando teste";
  if (!evaluation) return "Pendente";
  if (evaluation.status === "pending") return "Na fila";
  if (evaluation.status === "processing") return "Processando";
  if (evaluation.status === "retry_scheduled") return "Retry agendado";
  if (evaluation.status === "completed") return "Concluída";
  if (evaluation.status === "failed") return "Falhou";
  return evaluation.status;
}

export function getBehavioralAIStatusTone(
  assignmentStatus: BehavioralAssignmentDetailResponse["status"],
  evaluation: BehavioralAIEvaluationResponse | null,
): "success" | "neutral" | "info" | "primary" | "danger" {
  if (assignmentStatus !== "submitted") return "neutral";
  if (!evaluation) return "info";
  if (evaluation.status === "completed") return "success";
  if (evaluation.status === "failed") return "danger";
  if (
    evaluation.status === "pending" ||
    evaluation.status === "processing" ||
    evaluation.status === "retry_scheduled"
  )
    return "info";
  return "neutral";
}
