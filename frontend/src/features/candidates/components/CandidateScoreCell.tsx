import type { CandidateListSummary } from "../../../types/domain";
import { deriveScoreSemantics } from "../utils/scoreSemantics";

export function CandidateScoreCell({ candidate }: { candidate: CandidateListSummary }) {
  const semantics = deriveScoreSemantics({
    jobFitScore: candidate.active_job_job_fit_score,
    aiStatus: candidate.ai_status,
    hasActiveJob: Boolean(candidate.active_job_id),
  });

  const score = candidate.active_job_job_fit_score ?? 0;
  const showProgress = Boolean(candidate.active_job_id) && candidate.ai_status === "completed";

  const toneClass =
    semantics.statusTone === "high"
      ? "text-[hsl(var(--success))]"
      : semantics.statusTone === "mid"
        ? "text-[hsl(var(--warning))]"
        : semantics.statusTone === "low"
          ? "text-[hsl(var(--danger))]"
          : "text-[hsl(var(--text))]";

  const barColor =
    semantics.statusTone === "high"
      ? "bg-[hsl(var(--success))]"
      : semantics.statusTone === "mid"
        ? "bg-[hsl(var(--warning))]"
        : semantics.statusTone === "low"
          ? "bg-[hsl(var(--danger))]"
          : "bg-[hsl(var(--border-strong))]";

  return (
    <div className="flex min-w-[140px] flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[13px] font-extrabold tabular-nums tracking-tight ${toneClass}`}>
          {semantics.primaryDisplay}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted)/0.7)]">
          {semantics.primaryLabel}
        </span>
      </div>
      
      {showProgress ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--surface-muted))] shadow-inner">
          <div 
            className={`h-full transition-all duration-700 ease-out ${barColor}`} 
            style={{ width: `${score}%` }} 
          />
        </div>
      ) : (
        <div className="h-1.5 w-full rounded-full bg-[hsl(var(--surface-muted))/0.5] border border-dashed border-[hsl(var(--border))]" />
      )}

      {semantics.statusLabel ? (
        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--text-muted)/0.6)]">
          {semantics.statusLabel}
        </div>
      ) : null}
    </div>
  );
}
