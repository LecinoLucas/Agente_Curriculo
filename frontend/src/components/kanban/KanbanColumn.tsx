import type { CSSProperties } from "react";
import type { PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";

const COL_CLS: Partial<Record<PipelineStage, string>> = {
  hired: "border-[hsl(var(--success))]/18 bg-[hsl(var(--success-soft))]/70",
  rejected: "border-[hsl(var(--danger))]/18 bg-[hsl(var(--danger-soft))]/80",
};

interface KanbanColumnProps {
  column: PipelineColumn;
  colIndex: number;
  onCardClick?: (candidateId: string) => void;
}

export function KanbanColumn({
  column,
  colIndex,
  onCardClick,
}: KanbanColumnProps) {
  const baseCls = COL_CLS[column.stage] ?? "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/72";

  return (
    <div
      className={[
        "flex w-[18rem] shrink-0 flex-col rounded-[1.25rem] border p-3.5 transition-colors duration-150",
        "kanban-column-enter",
        baseCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--text-muted))]">
          {column.label}
        </span>
        <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[hsl(var(--text-muted))] shadow-sm">
          {column.candidates.length}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {column.candidates.map((c, cardIndex) => (
          <KanbanCard
            key={c.candidate_id}
            candidate={c}
            isSaving={false}
            enterDelay={colIndex * 65 + cardIndex * 30}
            onCardClick={onCardClick ? () => onCardClick(c.candidate_id) : undefined}
          />
        ))}

        {column.candidates.length === 0 ? (
          <div
            className={[
              "flex h-16 items-center justify-center rounded-2xl border border-dashed text-xs transition-colors duration-150",
              "border-[hsl(var(--border))] bg-[hsl(var(--surface))]/55 text-[hsl(var(--text-muted))]",
            ].join(" ")}
          >
            Vazio
          </div>
        ) : null}
      </div>
    </div>
  );
}
