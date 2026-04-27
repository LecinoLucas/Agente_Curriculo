import type { CSSProperties } from "react";
import type { AIAnalysisStatus, JobCandidate } from "../../types/domain";

const SCORE_CLS = {
  high: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  mid: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  low: "bg-red-50 text-red-700 ring-1 ring-red-200",
} as const;

const AI_STATUS_CLS: Record<AIAnalysisStatus, string> = {
  completed:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  processing: "bg-blue-50   text-blue-700   ring-1 ring-blue-200",
  pending:    "bg-amber-50  text-amber-700  ring-1 ring-amber-200",
  failed:     "bg-red-50    text-red-700    ring-1 ring-red-200",
  cancelled:  "bg-gray-100  text-gray-500   ring-1 ring-gray-200",
};

const AI_STATUS_LABEL: Record<AIAnalysisStatus, string> = {
  completed:  "IA ✓",
  processing: "IA ⟳",
  pending:    "IA ·",
  failed:     "IA ✗",
  cancelled:  "IA —",
};

function scoreVariant(score: number | null | undefined): keyof typeof SCORE_CLS {
  if (score == null) return "low";
  const n = score > 1 ? score / 100 : score;
  return n >= 0.7 ? "high" : n >= 0.4 ? "mid" : "low";
}

function fmt(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score > 1 ? score : score * 100)}%`;
}

interface KanbanCardProps {
  candidate: JobCandidate;
  isSaving: boolean;
  isDragging: boolean;
  enterDelay: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCardClick?: () => void;
}

export function KanbanCard({
  candidate,
  isSaving,
  isDragging,
  enterDelay,
  onDragStart,
  onDragEnd,
  onCardClick,
}: KanbanCardProps) {
  const variant = scoreVariant(candidate.match_score);
  const skills = (candidate.top_skills ?? []).slice(0, 3);
  const aiStatus = candidate.ai_status ?? null;

  return (
    <div
      draggable={!isSaving}
      onClick={onCardClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", candidate.candidate_id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={[
        "select-none rounded-lg border bg-white p-3 shadow-sm",
        "transition-all duration-150 hover:shadow-md hover:border-gray-300",
        isSaving ? "cursor-wait opacity-50" : "cursor-grab active:cursor-grabbing",
        onCardClick ? "hover:ring-2 hover:ring-blue-200" : "",
        isDragging ? "dnd-card-dragging" : "",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
    >
      {/* Name + match score */}
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">
          {candidate.candidate_name}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${SCORE_CLS[variant]}`}
        >
          {fmt(candidate.match_score)}
        </span>
      </div>

      {/* Top skills */}
      {skills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      {/* Footer: saving state OR ai_status badge */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {isSaving ? (
          <span className="text-[10px] text-gray-400">Salvando…</span>
        ) : (
          <>
            <span className="text-[10px] text-gray-400" />
            {aiStatus ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${AI_STATUS_CLS[aiStatus]}`}
                title={`IA: ${aiStatus}`}
              >
                {AI_STATUS_LABEL[aiStatus]}
              </span>
            ) : (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-gray-400 ring-1 ring-gray-200">
                Sem IA
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
