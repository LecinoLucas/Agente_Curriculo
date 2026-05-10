import type { JobRankingEntry } from "../../../../types/domain";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import { formatScorePercent, getScoreTone, normalizeScorePercent } from "../../utils/scoreFormatting";
import {
  getExplainabilityDeltaLine,
  getExplainabilityFreshnessLine,
  getTopExplainabilityInsights,
} from "../../utils/explainabilityUi";

interface ScoreSummaryProps {
  compatibilityScore: number | null;
  scoreBreakdown: JobRankingEntry["score_breakdown"] | null;
  scoreExplanation: ScoreExplanationResponse | null;
  rankingSummaryText?: string | null;
}

function getQualitativeLabel(score: number | null): { label: string; color: string } {
  const normalized = normalizeScorePercent(score);
  if (normalized === null) return { label: "—", color: "text-[hsl(var(--text-muted))]" };
  if (normalized >= 75) return { label: "Forte", color: "text-[hsl(var(--success))]" };
  if (normalized >= 40) return { label: "Moderado", color: "text-[hsl(var(--warning))]" };
  return { label: "Fraco", color: "text-[hsl(var(--danger))]" };
}

function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[hsl(var(--text-muted))]">{label}</span>
        <span className="text-xs text-[hsl(var(--text-muted))]">—</span>
      </div>
    );
  }

  const percentage = normalizeScorePercent(value);
  if (percentage === null) return null;
  let barColor = "bg-[hsl(var(--danger))]";
  if (percentage >= 75) barColor = "bg-[hsl(var(--success))]";
  else if (percentage >= 40) barColor = "bg-[hsl(var(--warning))]";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[hsl(var(--text))]">{label}</span>
        <span className="text-xs font-semibold text-[hsl(var(--text))]">{Math.round(percentage)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[hsl(var(--surface-muted))]">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.round(percentage)}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreSummary({
  compatibilityScore,
  scoreBreakdown,
  scoreExplanation,
  rankingSummaryText,
}: ScoreSummaryProps) {
  const qualitativeLabel = getQualitativeLabel(compatibilityScore);
  const scorePercentage = normalizeScorePercent(compatibilityScore);
  const summaryText = rankingSummaryText || scoreExplanation?.ranking_summary_text || null;
  const insights = getTopExplainabilityInsights(scoreExplanation, 3);
  const deltaLine = getExplainabilityDeltaLine(scoreExplanation);
  const freshnessLine = getExplainabilityFreshnessLine(
    scoreExplanation?.ranking_freshness_status,
    scoreExplanation?.computed_at,
  );

  const showBreakdown =
    scoreBreakdown &&
    (scoreBreakdown.skill_match_score !== null ||
      scoreBreakdown.experience_match_score !== null ||
      scoreBreakdown.seniority_match_score !== null ||
      scoreBreakdown.education_score !== null ||
      scoreBreakdown.confidence_score !== null);

  if (compatibilityScore == null && !scoreBreakdown && !scoreExplanation) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 shadow-sm">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
            Aderência à Vaga
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span
              className={[
                "text-3xl font-semibold tracking-[-0.03em] tabular-nums text-[hsl(var(--text))]",
                getScoreTone(compatibilityScore) === "high"
                  ? "text-[hsl(var(--success))]"
                  : getScoreTone(compatibilityScore) === "mid"
                    ? "text-[hsl(var(--warning))]"
                    : getScoreTone(compatibilityScore) === "low"
                      ? "text-[hsl(var(--danger))]"
                      : "",
              ].join(" ")}
            >
              {formatScorePercent(scorePercentage)}
            </span>
            <span className={`pb-1 text-sm font-semibold ${qualitativeLabel.color}`}>
              {qualitativeLabel.label}
            </span>
          </div>
          {summaryText ? (
            <p className="mt-3 rounded-xl bg-[hsl(var(--surface-muted))]/55 px-3 py-2.5 text-sm leading-6 text-[hsl(var(--text-muted))]">
              {summaryText}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/45 px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]">
              {freshnessLine}
            </span>
            {deltaLine ? (
              <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/45 px-2.5 py-1 text-[11px] text-[hsl(var(--text-muted))]">
                {deltaLine}
              </span>
            ) : null}
          </div>
        </div>

        {showBreakdown ? (
          <div className="space-y-3 rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--surface-muted))]/30 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
              Dimensões
            </p>
            <ScoreBar label="Skills" value={scoreBreakdown?.skill_match_score} />
            <ScoreBar label="Experiência" value={scoreBreakdown?.experience_match_score} />
            <ScoreBar label="Senioridade" value={scoreBreakdown?.seniority_match_score} />
            <ScoreBar label="Educação" value={scoreBreakdown?.education_score} />
            {scoreBreakdown?.confidence_score !== null && (
              <ScoreBar label="Confiança" value={scoreBreakdown.confidence_score} />
            )}
          </div>
        ) : null}
      </div>

      {insights.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
            Por que esta aderencia?
          </p>
          <div className="grid gap-2 xl:grid-cols-3">
            {insights.map((insight) => (
              <div
                key={`${insight.factorType}-${insight.label}`}
                className={[
                  "rounded-xl border px-3 py-2.5 text-sm",
                  insight.tone === "positive"
                    ? "border-emerald-200 bg-emerald-50/65 text-emerald-950"
                    : insight.tone === "negative"
                      ? "border-amber-200 bg-amber-50/75 text-amber-950"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 text-[hsl(var(--text))]",
                ].join(" ")}
              >
                {insight.label}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
