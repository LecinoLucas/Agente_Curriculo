import type { CSSProperties, DragEvent } from "react";
import type { PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";

const COL_CLS: Partial<Record<PipelineStage, string>> = {
  hired: "border-emerald-200 bg-emerald-50/60",
  rejected: "border-red-200 bg-red-50/60",
};

interface KanbanColumnProps {
  column: PipelineColumn;
  colIndex: number;
  isDragOver: boolean;
  dropPulse: boolean;
  savingCandidateId: string | null;
  draggingCandidateId: string | null;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
  onCardClick?: (candidateId: string) => void;
}

export function KanbanColumn({
  column,
  colIndex,
  isDragOver,
  dropPulse,
  savingCandidateId,
  draggingCandidateId,
  onDragEnter,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardClick,
}: KanbanColumnProps) {
  const baseCls = COL_CLS[column.stage] ?? "border-gray-200 bg-gray-50/60";

  return (
    <div
      className={[
        "flex w-52 shrink-0 flex-col rounded-xl border p-3 transition-colors duration-150",
        "kanban-column-enter",
        baseCls,
        isDragOver ? "ring-2 ring-blue-400 ring-offset-1 border-blue-300" : "",
        dropPulse ? "dnd-drop-pulse" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            isSaving={savingCandidateId === c.candidate_id}
            isDragging={draggingCandidateId === c.candidate_id}
            enterDelay={colIndex * 65 + cardIndex * 30}
            onDragStart={() => onCardDragStart(c.candidate_id)}
            onDragEnd={onCardDragEnd}
            onCardClick={onCardClick ? () => onCardClick(c.candidate_id) : undefined}
          />
        ))}

        {column.candidates.length === 0 ? (
          <div
            className={[
              "flex h-14 items-center justify-center rounded-lg border-2 border-dashed text-xs transition-colors duration-150",
              isDragOver
                ? "border-blue-300 bg-blue-50/60 text-blue-500"
                : "border-gray-200 bg-white/40 text-gray-400",
            ].join(" ")}
          >
            {isDragOver ? "Soltar aqui" : "Vazio"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
