import { memo, type CSSProperties } from "react";
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
  disabled?: boolean;
  showTopMatchHighlight?: boolean;
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  colIndex,
  onCardClick,
  disabled = false,
  showTopMatchHighlight = false,
}: KanbanColumnProps) {
  const baseCls = COL_CLS[column.stage] ?? "glass border-[hsl(var(--border))]/40 shadow-inner";
  const disabledCls = disabled ? "opacity-60 pointer-events-none" : "";

  return (
    <div
      className={[
        "flex w-[20rem] shrink-0 flex-col rounded-[2.5rem] border p-4 transition-all duration-300",
        "kanban-column-enter shadow-xl",
        baseCls,
        disabledCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
    >
      <div className="mb-4 flex items-center justify-between px-2">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[hsl(var(--text-muted))]">
          {column.label}
        </span>
        <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white/50 px-2 text-[10px] font-black tabular-nums text-[hsl(var(--text-muted))] shadow-sm backdrop-blur-sm border border-[hsl(var(--border))]/30">
          {column.candidates.length}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {column.candidates.map((c, cardIndex) => {
          const isTopMatch =
            showTopMatchHighlight &&
            cardIndex === 0 &&
            c.job_fit_score !== null &&
            c.job_fit_score !== undefined;

          return (
            <KanbanCard
              key={c.candidate_id}
              candidate={c}
              isSaving={false}
              isTopMatch={isTopMatch}
              enterDelay={colIndex * 65 + cardIndex * 30}
              onCardClick={onCardClick}
            />
          );
        })}

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
});
