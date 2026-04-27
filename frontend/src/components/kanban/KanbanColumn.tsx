import type { CSSProperties } from "react";
import type { PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";

const COL_CLS: Partial<Record<PipelineStage, string>> = {
  hired: "border-emerald-200 bg-emerald-50/60",
  rejected: "border-red-200 bg-red-50/60",
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
  const baseCls = COL_CLS[column.stage] ?? "border-gray-200 bg-gray-50/60";

  return (
    <div
      className={[
        "flex w-52 shrink-0 flex-col rounded-xl border p-3 transition-colors duration-150",
        "kanban-column-enter",
        baseCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{column.label}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-inset ring-gray-200">
          {column.candidates.length}
        </span>
      </div>

      <div className="flex flex-col gap-2">
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
              "flex h-14 items-center justify-center rounded-lg border-2 border-dashed text-xs transition-colors duration-150",
              "border-gray-200 bg-white/40 text-gray-400",
            ].join(" ")}
          >
            Vazio
          </div>
        ) : null}
      </div>
    </div>
  );
}
