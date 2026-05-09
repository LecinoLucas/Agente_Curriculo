import type { CandidateListSummary } from "../../../types/domain";
import { deriveScoreSemantics } from "../utils/scoreSemantics";

export function CandidateScoreCell({ candidate }: { candidate: CandidateListSummary }) {
  const semantics = deriveScoreSemantics({
    finalScore: candidate.active_job_final_score,
    aiStatus: candidate.ai_status,
    hasActiveJob: Boolean(candidate.active_job_id),
  });

  const toneClass =
    semantics.statusTone === "high"
      ? "text-[hsl(var(--success))]"
      : semantics.statusTone === "mid"
        ? "text-[hsl(var(--warning))]"
        : semantics.statusTone === "low"
          ? "text-[hsl(var(--danger))]"
          : "text-[hsl(var(--text))]";

  return (
    <div className="min-w-[120px]">
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{semantics.primaryDisplay}</div>
      <div className="mt-0.5 text-[11px] text-[hsl(var(--text-muted))]">{semantics.primaryLabel}</div>
      {semantics.statusLabel ? (
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
          {semantics.statusLabel}
        </div>
      ) : null}
    </div>
  );
}
