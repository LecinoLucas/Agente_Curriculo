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
        "ui-card select-none rounded-2xl p-3.5 transition-all duration-150",
        "hover:border-[hsl(var(--border-strong))] hover:shadow-md",
        isSaving ? "cursor-wait opacity-50" : "cursor-pointer",
        onCardClick ? "hover:ring-2 hover:ring-[hsl(var(--primary))]/20" : "",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {rank && rank <= 3 && (
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              rank === 1 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" :
              rank === 2 ? "bg-slate-400/20 text-slate-600 dark:text-slate-300" :
              rank === 3 ? "bg-amber-600/20 text-amber-700 dark:text-amber-400" : ""
            }`}>
              {rank}
            </span>
          )}
          <div className="min-w-0">
            <span className="line-clamp-2 text-sm font-semibold leading-snug text-[hsl(var(--text))]">
              {candidate.candidate_name}
            </span>
            {meta.length > 0 ? (
              <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]">{meta.join(" · ")}</p>
            ) : null}
          </div>
        </div>
        {isTopMatch && (
          <span className="shrink-0 rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
            Mais aderente
          </span>
        )}
      </div>

      {/* Top skills */}
      {skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))]"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      {/* Footer: saving state OR official job fit score */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[hsl(var(--border))]/80 pt-2.5">
        {isSaving ? (
          <span className="text-[10px] text-[hsl(var(--text-muted))]">Salvando…</span>
        ) : (
          <>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Aderência à Vaga
            </span>
            {jobFitScore !== null && jobFitScore !== undefined ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums text-[hsl(var(--text))]">
                {Math.round(jobFitScore)}%
              </span>
            ) : (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))] ring-1 ring-[hsl(var(--border))]">
                Aguardando
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
});
