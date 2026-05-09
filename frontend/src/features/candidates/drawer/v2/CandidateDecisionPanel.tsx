import type { AnalysisResult, JobRankingEntry, PipelineStage } from "../../../../types/domain";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ScanSearch, XCircle } from "lucide-react";
import { getScoreTone, normalizeScorePercent } from "../../utils/scoreFormatting";
import { deriveScoreSemantics, type ScoreSemanticState } from "../../utils/scoreSemantics";
import {
  getExplainabilityDeltaLine,
  getExplainabilityFreshnessLine,
  getExplainabilityQuickLine,
} from "../../utils/explainabilityUi";

interface CandidateDecisionPanelProps {
  currentStage: PipelineStage | null;
  analysisResult: AnalysisResult | null;
  rankingEntry: JobRankingEntry | null;
  compatibilityScore: number | null;
  hasActiveJob: boolean;
  aiScore: number | null;
  aiStatus: string | null | undefined;
  scoreExplanation: ScoreExplanationResponse | null;
  onViewAnalysis: () => void;
  compact?: boolean;
}

type Recommendation = "advance" | "evaluate" | "reject" | "pending";

function getRecommendation(
  currentStage: PipelineStage | null,
  score: number | null,
  semanticsState: ScoreSemanticState,
): {
  type: Recommendation;
  label: string;
  color: string;
  bgColor: string;
  icon: typeof CheckCircle2;
} {
  const normalizedScore = normalizeScorePercent(score);

  if (currentStage === "hired") {
    return {
      type: "advance",
      label: "Aprovado",
      color: "text-emerald-950",
      bgColor: "border-emerald-200 bg-emerald-50/85",
      icon: CheckCircle2,
    };
  }

  if (currentStage === "rejected") {
    return {
      type: "reject",
      label: "Rejeitado",
      color: "text-rose-950",
      bgColor: "border-rose-200 bg-rose-50/85",
      icon: XCircle,
    };
  }

  if (semanticsState === "inconclusive") {
    return {
      type: "pending",
      label: "Análise inconclusiva",
      color: "text-amber-900",
      bgColor: "border-amber-200 bg-amber-50/80",
      icon: AlertTriangle,
    };
  }

  if (semanticsState === "review") {
    return {
      type: "evaluate",
      label: "Revisão recomendada",
      color: "text-amber-900",
      bgColor: "border-amber-200 bg-amber-50/80",
      icon: ScanSearch,
    };
  }

  if (semanticsState === "no_active_job" || semanticsState === "awaiting_match") {
    return {
      type: "pending",
      label: "Match indisponível",
      color: "text-slate-700",
      bgColor: "border-slate-200 bg-slate-50/80",
      icon: Clock3,
    };
  }

  if (normalizedScore === null) {
    return {
      type: "pending",
      label: "Aguardando análise",
      color: "text-slate-700",
      bgColor: "border-slate-200 bg-slate-50/80",
      icon: Clock3,
    };
  }

  if (normalizedScore >= 75) {
    return {
      type: "advance",
      label: "Recomendado avançar",
      color: "text-emerald-900",
      bgColor: "border-emerald-200 bg-emerald-50/80",
      icon: CheckCircle2,
    };
  }

  if (normalizedScore < 40) {
    return {
      type: "reject",
      label: "Recomendar rejeição",
      color: "text-rose-900",
      bgColor: "border-rose-200 bg-rose-50/75",
      icon: XCircle,
    };
  }

  return {
    type: "evaluate",
    label: "Avaliar melhor",
    color: "text-amber-900",
    bgColor: "border-amber-200 bg-amber-50/80",
    icon: ScanSearch,
  };
}

function getTopStrengths(
  scoreExplanation: ScoreExplanationResponse | null,
  analysisResult: AnalysisResult | null,
): string[] {
  if (scoreExplanation?.highlights && scoreExplanation.highlights.length > 0) {
    return scoreExplanation.highlights.slice(0, 2);
  }

  if (analysisResult?.strengths && analysisResult.strengths.length > 0) {
    return analysisResult.strengths.slice(0, 2);
  }

  return [];
}

function getTopRisks(
  scoreExplanation: ScoreExplanationResponse | null,
  rankingEntry: JobRankingEntry | null,
  analysisResult: AnalysisResult | null,
): string[] {
  if (scoreExplanation?.risks && scoreExplanation.risks.length > 0) {
    return scoreExplanation.risks.slice(0, 2);
  }

  const risks: string[] = [];

  if (rankingEntry?.reason_codes) {
    const dealBreakerCodes = rankingEntry.reason_codes
      .filter((code) => code.type === "deal_breaker")
      .slice(0, 1);
    risks.push(...dealBreakerCodes.map((code) => code.description));
  }

  if (analysisResult?.weaknesses && analysisResult.weaknesses.length > 0) {
    const remainingSlots = 2 - risks.length;
    if (remainingSlots > 0) {
      risks.push(...analysisResult.weaknesses.slice(0, remainingSlots));
    }
  }

  return risks.slice(0, 2);
}

export function CandidateDecisionPanel({
  currentStage,
  analysisResult,
  rankingEntry,
  compatibilityScore,
  hasActiveJob,
  aiScore,
  aiStatus,
  scoreExplanation,
  onViewAnalysis,
  compact = false,
}: CandidateDecisionPanelProps) {
  const confidenceScore =
    scoreExplanation?.confidence_score ??
    rankingEntry?.score_breakdown?.confidence_score ??
    rankingEntry?.score_breakdown?.ai_confidence_score ??
    null;
  const semantics = deriveScoreSemantics({
    finalScore: compatibilityScore,
    aiStatus,
    hasActiveJob,
    confidenceScore,
  });
  const recommendation = getRecommendation(currentStage, compatibilityScore, semantics.state);
  const strengths = getTopStrengths(scoreExplanation, analysisResult);
  const risks = getTopRisks(scoreExplanation, rankingEntry, analysisResult);
  const scoreLabel = semantics.primaryDisplay;
  const RecommendationIcon = recommendation.icon;
  const hasInsights = strengths.length > 0 || risks.length > 0;
  const explainabilityLine = getExplainabilityQuickLine(scoreExplanation);
  const deltaLine = getExplainabilityDeltaLine(scoreExplanation);
  const freshnessLine = getExplainabilityFreshnessLine(
    scoreExplanation?.freshness_status ?? rankingEntry?.freshness_status,
    scoreExplanation?.computed_at ?? rankingEntry?.ranking_updated_at ?? rankingEntry?.computed_at,
  );
  const contextText =
    currentStage === "hired"
      ? "Ação aplicada. O candidato foi aprovado para a vaga ativa."
      : currentStage === "rejected"
        ? "Ação aplicada. O candidato foi marcado como reprovado para esta vaga."
        : semantics.contextLine;
  const detailText =
    currentStage === "hired" || currentStage === "rejected"
      ? semantics.secondaryDisplay
        ? "O score geral IA continua disponível apenas como contexto desta decisão."
        : null
      : semantics.detailLine;

  if (compatibilityScore === null && !analysisResult && !scoreExplanation) {
    return (
      <div className="px-5 py-4">
        <div className="rounded-2xl border border-[hsl(var(--border))]/30 bg-[hsl(var(--surface-muted))]/30 p-4">
          <p className="text-sm font-semibold text-[hsl(var(--text))]">
            {hasActiveJob ? "Análise não disponível" : "Candidato sem vaga ativa"}
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
            {hasActiveJob
              ? "Solicite análise para ver a recomendação."
              : "Associe o candidato por um fluxo de vaga para liberar compatibilidade e recomendação."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-4">
      <div className={`rounded-2xl border p-4 shadow-sm ${recommendation.bgColor}`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--text-muted))]">
              Decisão sugerida
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border border-current/10 bg-white/65 px-3 py-1.5 text-sm font-semibold ${recommendation.color}`}>
                <RecommendationIcon className="h-4 w-4" />
                {recommendation.label}
              </span>
              {rankingEntry?.rank ? (
                <span className="text-xs font-medium text-[hsl(var(--text-muted))]">
                  Ranking atual: #{rankingEntry.rank}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-[hsl(var(--text-muted))]">
              {contextText}
            </p>
            {detailText ? (
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--text-muted))]">
                {detailText}
              </p>
            ) : null}
            {explainabilityLine ? (
              <p className="mt-3 rounded-xl border border-[hsl(var(--border))]/50 bg-white/55 px-3 py-2 text-sm leading-6 text-[hsl(var(--text))]">
                {explainabilityLine}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-[hsl(var(--border))]/60 bg-white/55 px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]">
                {freshnessLine}
              </span>
              {deltaLine ? (
                <span className="rounded-full border border-[hsl(var(--border))]/60 bg-white/55 px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]">
                  {deltaLine}
                </span>
              ) : null}
            </div>
            {semantics.secondaryDisplay ? (
              <div className="mt-3 inline-flex items-center rounded-full border border-[hsl(var(--border))]/60 bg-white/60 px-3 py-1 text-xs font-medium text-[hsl(var(--text-muted))]">
                {semantics.secondaryLabel}: {semantics.secondaryDisplay}
              </div>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-3 xl:block xl:min-w-[140px]">
            <div className="rounded-xl border border-[hsl(var(--border))]/50 bg-white/70 px-3 py-2.5 text-right shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--text-muted))]">
                {semantics.primaryLabel}
              </p>
              <p
                className={[
                  "mt-1 text-2xl font-semibold tracking-[-0.02em] tabular-nums text-[hsl(var(--text))]",
                  getScoreTone(compatibilityScore) === "high"
                    ? "text-emerald-900"
                    : getScoreTone(compatibilityScore) === "mid"
                      ? "text-amber-900"
                      : getScoreTone(compatibilityScore) === "low"
                        ? "text-rose-900"
                        : "",
                ].join(" ")}
              >
                {scoreLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={onViewAnalysis}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-white/70 px-3 text-sm font-medium text-[hsl(var(--text))] transition hover:bg-white"
            >
              Ver análise
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!compact && hasInsights ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {strengths.length > 0 && (
            <div className="rounded-xl border border-[hsl(var(--border))]/40 bg-white/55 px-3.5 py-3">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                Forças
              </p>
              <div className="space-y-1.5">
                {strengths.map((strength) => (
                  <div key={strength} className="flex gap-2 text-sm text-[hsl(var(--text))]">
                    <span className="mt-0.5 shrink-0 rounded-full bg-emerald-100 p-1 text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                    </span>
                    <span className="leading-5">{strength}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {risks.length > 0 && (
            <div className="rounded-xl border border-[hsl(var(--border))]/40 bg-white/55 px-3.5 py-3">
              <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                Pontos de Atenção
              </p>
              <div className="space-y-1.5">
                {risks.map((risk) => (
                  <div key={risk} className="flex gap-2 text-sm text-[hsl(var(--text))]">
                    <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-1 text-amber-800">
                      <AlertTriangle className="h-3 w-3" />
                    </span>
                    <span className="leading-5">{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
