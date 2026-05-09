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
  finalScore,
  aiStatus,
  hasActiveJob,
  confidenceScore,
}: {
  finalScore: number | null | undefined;
  aiStatus?: AnalysisStatus;
  hasActiveJob: boolean;
  confidenceScore?: number | null | undefined;
}): ScoreSemantics {
  const primaryScore = normalizeScorePercent(finalScore);
  const secondaryScore = null;
  const confidence = normalizeConfidenceScore(confidenceScore);
  const hasConflict = false;
  const aiFailed = aiStatus === "failed" || aiStatus === "cancelled";
  const aiPending = aiStatus === "pending" || aiStatus === "processing";
  const lowConfidence = confidence != null && confidence < 50;

  if (!hasActiveJob) {
    return {
      primaryLabel: "Score final",
      primaryScore: null,
      primaryDisplay: "—",
      secondaryLabel: secondaryScore != null ? "Perfil Geral IA" : null,
      secondaryScore,
      secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
      statusLabel: "Sem vaga ativa",
      statusTone: "neutral",
      contextLine: "Associe o candidato a uma vaga para calcular o score final.",
      detailLine: secondaryScore != null ? "Perfil Geral IA resume o perfil, mas não decide a vaga ativa." : null,
      state: "no_active_job",
      hasConflict: false,
    };
  }

  if (primaryScore == null) {
    return {
      primaryLabel: "Score final",
      primaryScore: null,
      primaryDisplay: "—",
      secondaryLabel: secondaryScore != null ? "Perfil Geral IA" : null,
      secondaryScore,
      secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
      statusLabel: aiFailed ? "Análise inconclusiva" : aiPending ? "Aguardando match" : "Revisão recomendada",
      statusTone: aiFailed ? "low" : "mid",
      contextLine: aiFailed
        ? "A última análise da IA falhou. Valide manualmente antes de decidir."
        : "O score final ainda não está disponível para esta decisão.",
      detailLine: secondaryScore != null ? "Perfil Geral IA é apenas contexto enquanto a compatibilidade não chega." : null,
      state: "awaiting_match",
      hasConflict: false,
    };
  }

  if (aiFailed || hasConflict || lowConfidence) {
    return {
      primaryLabel: "Score final",
      primaryScore,
      primaryDisplay: formatScorePercent(primaryScore),
      secondaryLabel: secondaryScore != null ? "Perfil Geral IA" : null,
      secondaryScore,
      secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
      statusLabel: aiFailed ? "Análise inconclusiva" : "Revisão recomendada",
      statusTone: aiFailed ? "low" : "mid",
      contextLine: aiFailed
        ? "A última análise da IA falhou. O score final exibido pode depender de contexto anterior."
        : hasConflict
          ? "Compatibilidade Contextual e Perfil Geral IA contam histórias diferentes."
          : "A compatibilidade existe, mas a confiança da IA está baixa para decisão automática.",
      detailLine: hasConflict
        ? "Use Compatibilidade Contextual e Aderência à Vaga para decidir esta vaga. Perfil Geral IA é contexto do perfil."
        : secondaryScore != null
          ? "Perfil Geral IA continua disponível como contexto secundário."
          : null,
      state: aiFailed ? "inconclusive" : "review",
      hasConflict,
    };
  }

  return {
      primaryLabel: "Score final",
    primaryScore,
    primaryDisplay: formatScorePercent(primaryScore),
    secondaryLabel: secondaryScore != null ? "Perfil Geral IA" : null,
    secondaryScore,
    secondaryDisplay: secondaryScore != null ? formatScorePercent(secondaryScore) : null,
    statusLabel: null,
    statusTone: getScoreTone(primaryScore),
    contextLine: "Score final é o primeiro sinal para decidir a vaga ativa.",
    detailLine: secondaryScore != null ? "Perfil Geral IA resume o perfil e não substitui a aderência desta vaga." : null,
    state: "ready",
    hasConflict: false,
  };
}
