import type { CandidateState, AnalysisResult, JobRankingEntry } from "../../../../types/domain";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";

interface DecisionHeroProps {
  candidateState: CandidateState | null;
  analysisResult: AnalysisResult | null;
  rankingEntry: JobRankingEntry | null;
  compatibilityScore: number | null;
  nextAction: { action: string; suggestion: string; tone: string } | null;
  scoreExplanation: ScoreExplanationResponse | null;
  onApprove: () => void;
  onReject: () => void;
  onViewAnalysis: () => void;
  isLoading?: boolean;
}

type Recommendation = "advance" | "evaluate" | "reject" | "pending";

function getRecommendation(
  candidateState: CandidateState | null,
  score: number | null,
): { type: Recommendation; label: string; color: string; icon: string } {
  if (!candidateState) {
    return { type: "pending", label: "Aguardando análise", color: "bg-gray-50", icon: "⏳" };
  }

  if (score !== null && score >= 0.75) {
    return { type: "advance", label: "Recomendado avançar", color: "bg-green-50", icon: "🟢" };
  }

  if (score !== null && score < 0.4) {
    return { type: "reject", label: "Recomendar rejeição", color: "bg-red-50", icon: "🔴" };
  }

  return { type: "evaluate", label: "Avaliar melhor", color: "bg-amber-50", icon: "🟡" };
}

function getTopStrengths(
  scoreExplanation: ScoreExplanationResponse | null,
  analysisResult: AnalysisResult | null,
): string[] {
  // Primary source: scoreExplanation.highlights (unified narrative)
  if (scoreExplanation?.highlights && scoreExplanation.highlights.length > 0) {
    return scoreExplanation.highlights.slice(0, 3);
  }

  // Fallback: analysisResult.strengths (local analysis)
  if (analysisResult?.strengths && analysisResult.strengths.length > 0) {
    return analysisResult.strengths.slice(0, 3);
  }

  return [];
}

function getTopRisks(
  scoreExplanation: ScoreExplanationResponse | null,
  rankingEntry: JobRankingEntry | null,
  analysisResult: AnalysisResult | null,
): string[] {
  // Primary source: scoreExplanation.risks (unified narrative)
  if (scoreExplanation?.risks && scoreExplanation.risks.length > 0) {
    return scoreExplanation.risks.slice(0, 3);
  }

  // Fallback: local analysis (reason codes + weaknesses)
  const risks: string[] = [];

  // Deal-breaker reason codes
  if (rankingEntry?.reason_codes) {
    const dealBreakerCodes = rankingEntry.reason_codes
      .filter((code) => code.startsWith("deal_breaker_"))
      .slice(0, 2);
    risks.push(...dealBreakerCodes.map((code) => code.replace("deal_breaker_", "").replace(/_/g, " ")));
  }

  // Top weaknesses from analysis
  if (analysisResult?.weaknesses && analysisResult.weaknesses.length > 0) {
    const remainingSlots = 3 - risks.length;
    if (remainingSlots > 0) {
      risks.push(...analysisResult.weaknesses.slice(0, remainingSlots));
    }
  }

  return risks.slice(0, 3);
}

export function DecisionHero({
  candidateState,
  analysisResult,
  rankingEntry,
  compatibilityScore,
  nextAction,
  scoreExplanation,
  onApprove,
  onReject,
  onViewAnalysis,
  isLoading = false,
}: DecisionHeroProps) {
  const recommendation = getRecommendation(candidateState, compatibilityScore);
  const strengths = getTopStrengths(scoreExplanation, analysisResult);
  const risks = getTopRisks(scoreExplanation, rankingEntry, analysisResult);

  return (
    <div
      className={[
        "rounded-xl border border-[hsl(var(--border))] p-5",
        recommendation.color,
      ].join(" ")}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xl">{recommendation.icon}</span>
        <h2 className="text-base font-semibold text-[hsl(var(--text))]">
          {recommendation.label.toUpperCase()}
        </h2>
        {compatibilityScore !== null && (
          <span className="ml-auto text-sm font-medium text-[hsl(var(--text-muted))]">
            {Math.round(compatibilityScore * 100)}% match
          </span>
        )}
      </div>

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Forças
          </p>
          <ul className="space-y-1">
            {strengths.map((strength) => (
              <li key={strength} className="text-sm text-[hsl(var(--text))]">
                <span className="mr-2">✓</span>
                {strength}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {risks.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Atenção
          </p>
          <ul className="space-y-1">
            {risks.map((risk) => (
              <li key={risk} className="text-sm text-[hsl(var(--text))]">
                <span className="mr-2">⚠️</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next Action */}
      {nextAction && (
        <div className="mb-4 rounded-lg border border-[hsl(var(--primary))]/20 bg-[hsl(var(--accent-soft))] px-3 py-2">
          <p className="text-xs font-medium text-[hsl(var(--primary))]">
            🎯 Próxima ação sugerida:
          </p>
          <p className="mt-0.5 text-sm text-[hsl(var(--text))]">{nextAction.suggestion}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-[hsl(var(--success))] px-3 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--success))]/90 disabled:opacity-50"
        >
          ✓ Aprovar
        </button>
        <button
          onClick={onReject}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-[hsl(var(--danger))] px-3 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--danger))]/90 disabled:opacity-50"
        >
          ✕ Rejeitar
        </button>
        <button
          onClick={onViewAnalysis}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm font-medium text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))] disabled:opacity-50"
        >
          Ver análise
        </button>
      </div>
    </div>
  );
}
