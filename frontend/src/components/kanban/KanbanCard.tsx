import { memo, type CSSProperties } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";

interface KanbanCardProps {
  candidate: JobCandidate;
  isSaving: boolean;
  enterDelay: number;
  onCardClick?: (candidateId: string) => void;
  isTopMatch?: boolean;
  rank?: number;
}

export const KanbanCard = memo(function KanbanCard({
  candidate,
  isSaving,
  enterDelay,
  onCardClick,
  isTopMatch = false,
  rank,
}: KanbanCardProps) {
  const skills = (candidate.top_skills ?? []).slice(0, 3);
  const jobFitScore = candidate.job_fit_score;
  const seniority = candidate.seniority_level ? formatSeniority(candidate.seniority_level) : null;
  const experience =
    typeof candidate.total_experience_years === "number"
      ? `${candidate.total_experience_years} ano${candidate.total_experience_years === 1 ? "" : "s"}`
      : null;
  const meta = [seniority, experience].filter(Boolean);

  return (
    <div
      onClick={onCardClick ? () => onCardClick(candidate.candidate_id) : undefined}
      className={[
        "hover-lift relative overflow-hidden select-none rounded-[1.75rem] border-2 bg-white p-4 shadow-sm transition-all duration-300",
        isTopMatch ? "border-[hsl(var(--primary))]/30 shadow-[hsl(var(--primary))/0.08_0px_10px_30px_-5px]" : "border-[hsl(var(--border))]/40",
        isSaving ? "cursor-wait opacity-50" : "cursor-pointer",
        onCardClick ? "hover:border-[hsl(var(--primary))]/50" : "",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            {rank && rank <= 3 && (
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold shadow-sm ${
                rank === 1 ? "bg-yellow-400 text-white" :
                rank === 2 ? "bg-slate-300 text-slate-700" :
                rank === 3 ? "bg-amber-500 text-white" : ""
              }`}>
                {rank}
              </span>
            )}
            <span className="truncate text-sm font-bold tracking-tight text-[hsl(var(--text))]">
              {candidate.candidate_name}
            </span>
          </div>
          {meta.length > 0 ? (
            <p className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
              {meta.join(" • ")}
            </p>
          ) : null}
        </div>
        {isTopMatch && (
          <div className="absolute -right-12 -top-12 flex h-24 w-24 items-end justify-center bg-[hsl(var(--primary))]/5 blur-2xl" />
        )}
      </div>

      {/* Top skills */}
      {skills.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface-muted))]/30 px-2.5 py-1 text-[10px] font-bold text-[hsl(var(--text-muted))]"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      {/* Footer: official job fit score */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[hsl(var(--border))]/40 pt-4">
        {isSaving ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))] animate-pulse">
            Sincronizando…
          </span>
        ) : (
          <>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--text-muted))]">
              Match IA
            </span>
            {jobFitScore !== null && jobFitScore !== undefined ? (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[hsl(var(--surface-muted))]">
                   <div 
                     className="h-full bg-[hsl(var(--primary))] transition-all duration-500" 
                     style={{ width: `${Math.round(jobFitScore)}%` }}
                   />
                </div>
                <span className="text-xs font-bold tabular-nums text-[hsl(var(--primary))]">
                  {Math.round(jobFitScore)}%
                </span>
              </div>
            ) : (
              <span className="rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[9px] font-bold text-[hsl(var(--text-muted))]">
                Pendente
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
});
