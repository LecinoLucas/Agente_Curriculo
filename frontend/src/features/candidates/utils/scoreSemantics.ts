import { formatScorePercent, getScoreTone, normalizeScorePercent } from "./scoreFormatting";

type AnalysisStatus = "pending" | "processing" | "completed" | "failed" | "cancelled" | string | null | undefined;

export type ScoreSemanticState =
  | "ready"
  | "review"
  | "inconclusive"
  | "awaiting_match"
  | "no_active_job";

export type ScoreSemantics = {
  primaryLabel: string;
  primaryScore: number | null;
  primaryDisplay: string;
  secondaryLabel: string | null;
  secondaryScore: number | null;
  secondaryDisplay: string | null;
  statusLabel: string | null;
  statusTone: "high" | "mid" | "low" | "neutral";
  contextLine: string;
  detailLine: string | null;
  state: ScoreSemanticState;
  hasConflict: boolean;
};

function normalizeConfidenceScore(value: number | null | undefined): number | null {
  const percent = normalizeScorePercent(value);
  return percent == null ? null : Math.round(percent);
}

export function deriveScoreSemantics({
  activeJobMatchScore,
  aiScore,
  aiStatus,
  hasActiveJob,
  confidenceScore,
}: {
  activeJobMatchScore: number | null | undefined;
  aiScore: number | null | undefined;
  aiStatus?: AnalysisStatus;
  hasActiveJob: boolean;
  confidenceScore?: number | null | undefined;
}): ScoreSemantics {
  const primaryScore = normalizeScorePercent(activeJobMatchScore);
  const secondaryScore = normalizeScorePercent(aiScore);
  const confidence = normalizeConfidenceScore(confidenceScore);
  const hasConflict =
    primaryScore != null &&
    secondaryScore != null &&
    Math.abs(primaryScore - secondaryScore) >= 15;
  const aiFailed = aiStatus === "failed" || aiStatus === "cancelled";
  const aiPending = aiStatus === "pending" || aiStatus === "processing";
  const lowConfidence = confidence != null && confidence < 50;

  if (!hasActiveJob) {
    return {
      primaryLabel: "Match da vaga ativa",
      primaryScore: null,
      primaryDisplay: "—",
      secondaryLabel: secondaryScore != null ? "Score geral IA" : null,
      secondaryScore,
      secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
      statusLabel: "Sem vaga ativa",
      statusTone: "neutral",
      contextLine: "Associe o candidato a uma vaga para calcular o match que guia a decisão.",
      detailLine: secondaryScore != null ? "O score geral IA resume o perfil, mas não decide a vaga ativa." : null,
      state: "no_active_job",
      hasConflict: false,
    };
  }

  if (primaryScore == null) {
    return {
      primaryLabel: "Match da vaga ativa",
      primaryScore: null,
      primaryDisplay: "—",
      secondaryLabel: secondaryScore != null ? "Score geral IA" : null,
      secondaryScore,
      secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
      statusLabel: aiFailed ? "Análise inconclusiva" : aiPending ? "Aguardando match" : "Revisão recomendada",
      statusTone: aiFailed ? "low" : "mid",
      contextLine: aiFailed
        ? "A última análise da IA falhou. Valide manualmente antes de decidir."
        : "O match da vaga ativa ainda não está disponível para esta decisão.",
      detailLine: secondaryScore != null ? "O score geral IA é apenas contexto enquanto o match não chega." : null,
      state: "awaiting_match",
      hasConflict: false,
    };
  }

  if (aiFailed || hasConflict || lowConfidence) {
    return {
      primaryLabel: "Match da vaga ativa",
      primaryScore,
      primaryDisplay: formatScorePercent(primaryScore),
      secondaryLabel: secondaryScore != null ? "Score geral IA" : null,
      secondaryScore,
      secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
      statusLabel: aiFailed ? "Análise inconclusiva" : "Revisão recomendada",
      statusTone: aiFailed ? "low" : "mid",
      contextLine: aiFailed
        ? "A última análise da IA falhou. O match exibido pode depender de contexto anterior."
        : hasConflict
          ? "O match da vaga ativa e o score geral IA contam histórias diferentes."
          : "O match existe, mas a confiança da IA está baixa para decisão automática.",
      detailLine: hasConflict
        ? "Use o match da vaga ativa para decidir esta vaga. O score geral IA é só contexto do perfil."
        : secondaryScore != null
          ? "O score geral IA continua disponível como contexto secundário."
          : null,
      state: aiFailed ? "inconclusive" : "review",
      hasConflict,
    };
  }

  return {
    primaryLabel: "Match da vaga ativa",
    primaryScore,
    primaryDisplay: formatScorePercent(primaryScore),
    secondaryLabel: secondaryScore != null ? "Score geral IA" : null,
    secondaryScore,
    secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
    statusLabel: null,
    statusTone: getScoreTone(primaryScore),
    contextLine: "Este é o score principal para decidir a vaga ativa.",
    detailLine: secondaryScore != null ? "O score geral IA resume o perfil e não substitui o match desta vaga." : null,
    state: "ready",
    hasConflict: false,
  };
}
