import type {
  ScoreExplanationDelta,
  ScoreExplanationFactorSummaryItem,
  ScoreExplanationResponse,
} from "../../../services/scoreExplanationService";

export type ExplainabilityInsightTone = "positive" | "negative" | "contextual";

export type ExplainabilityInsight = {
  label: string;
  tone: ExplainabilityInsightTone;
  factorType: string;
  impactScore: number;
};

const SIGNIFICANT_DELTA_THRESHOLD = 5;

function formatRelativeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function toInsight(
  item: ScoreExplanationFactorSummaryItem,
  tone: ExplainabilityInsightTone,
): ExplainabilityInsight {
  return {
    label: item.factor_label,
    tone,
    factorType: item.factor_type,
    impactScore: item.impact_score,
  };
}

function getAllInsights(scoreExplanation: ScoreExplanationResponse | null): ExplainabilityInsight[] {
  if (!scoreExplanation?.factor_summary) return [];

  return [
    ...(scoreExplanation.factor_summary.positive ?? []).map((item) => toInsight(item, "positive")),
    ...(scoreExplanation.factor_summary.negative ?? []).map((item) => toInsight(item, "negative")),
    ...(scoreExplanation.factor_summary.contextual ?? []).map((item) => toInsight(item, "contextual")),
  ].sort((left, right) => Math.abs(right.impactScore) - Math.abs(left.impactScore));
}

export function getTopExplainabilityInsights(
  scoreExplanation: ScoreExplanationResponse | null,
  limit = 3,
): ExplainabilityInsight[] {
  return getAllInsights(scoreExplanation).slice(0, limit);
}

export function getExplainabilityQuickLine(
  scoreExplanation: ScoreExplanationResponse | null,
): string | null {
  const negative = scoreExplanation?.factor_summary?.negative?.[0];
  if (negative?.factor_label) {
    return `Compatibilidade reduzida por ${negative.factor_label.toLowerCase()}.`;
  }

  const positive = scoreExplanation?.factor_summary?.positive?.[0];
  if (positive?.factor_label) {
    return `Compatibilidade sustentada por ${positive.factor_label.toLowerCase()}.`;
  }

  const contextual = scoreExplanation?.factor_summary?.contextual?.[0];
  if (contextual?.factor_label) {
    return contextual.factor_label;
  }

  return scoreExplanation?.explanation ?? null;
}

function isSignificantDelta(delta: ScoreExplanationDelta | null | undefined): boolean {
  if (!delta) return false;
  if (typeof delta.score_change === "number" && Math.abs(delta.score_change) >= SIGNIFICANT_DELTA_THRESHOLD) {
    return true;
  }
  return (delta.top_changes?.length ?? 0) > 0;
}

export function getExplainabilityDeltaLine(
  scoreExplanation: ScoreExplanationResponse | null,
): string | null {
  const delta = scoreExplanation?.delta;
  if (!isSignificantDelta(delta)) return null;

  const topChange = delta?.top_changes?.[0]?.factor_label;
  const direction = (delta?.score_change ?? 0) >= 0 ? "subiu" : "caiu";

  switch (delta?.change_reason) {
    case "job_requirements_changed":
      return topChange
        ? `Compatibilidade ${direction} após atualização da vaga: ${topChange}.`
        : `Compatibilidade ${direction} após atualização da vaga.`;
    case "score_model_changed":
      return `Score ${direction} após atualização do modelo de ranking.`;
    case "manual_recompute_same_inputs":
      return "Score reprocessado sem mudança estrutural do contexto.";
    case "candidate_analysis_changed":
    default:
      return topChange
        ? `Score ${direction} após reanálise do candidato: ${topChange}.`
        : `Score ${direction} após reanálise do candidato.`;
  }
}

export function getExplainabilityFreshnessLine(
  status: ScoreExplanationResponse["freshness_status"] | "recomputing" | null | undefined,
  computedAt: string | null | undefined,
): string {
  if (status === "recomputing") return "Atualizando ranking...";
  if (status === "stale") return "Score desatualizado";
  if (!status) return "Aguardando reprocessamento";

  const relative = formatRelativeTimestamp(computedAt);
  return relative ? `Atualizado ${relative}` : "Reanalisado recentemente";
}
