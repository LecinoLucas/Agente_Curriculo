import type { CSSProperties } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";

interface KanbanCardProps {
  candidate: JobCandidate;
  isSaving: boolean;
  enterDelay: number;
  onCardClick?: () => void;
}

export function KanbanCard({
  candidate,
  isSaving,
  enterDelay,
  onCardClick,
}: KanbanCardProps) {
  const skills = (candidate.top_skills ?? []).slice(0, 3);
  const finalScore = candidate.final_score;
  const seniority = candidate.seniority_level ? formatSeniority(candidate.seniority_level) : null;
  const experience =
    typeof candidate.total_experience_years === "number"
      ? `${candidate.total_experience_years} ano${candidate.total_experience_years === 1 ? "" : "s"}`
      : null;
  const meta = [seniority, experience].filter(Boolean);

  return (
    <div
      onClick={onCardClick}
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
        <div className="min-w-0">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-[hsl(var(--text))]">
            {candidate.candidate_name}
          </span>
          {meta.length > 0 ? (
            <p className="mt-1 text-[11px] text-[hsl(var(--text-muted))]">{meta.join(" · ")}</p>
          ) : null}
        </div>
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

      {/* Footer: saving state OR final score */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[hsl(var(--border))]/80 pt-2.5">
        {isSaving ? (
          <span className="text-[10px] text-[hsl(var(--text-muted))]">Salvando…</span>
        ) : (
          <>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Score final
            </span>
            {finalScore !== null && finalScore !== undefined ? (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums text-[hsl(var(--text))]">
                {Math.round(finalScore)}%
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
}
