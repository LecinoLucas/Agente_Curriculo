import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate, PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";
import { Plus } from "lucide-react";

const COL_THEMES: Record<PipelineStage, { border: string; bg: string; accent: string; desc: string }> = {
  entry: {
    border: "border-[hsl(var(--border))]/55",
    bg: "bg-[hsl(var(--surface-muted))]/45",
    accent: "border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]",
    desc: "Triagem inicial de perfil",
  },
  screening: {
    border: "border-[hsl(var(--border))]/55",
    bg: "bg-[hsl(var(--surface-muted))]/45",
    accent: "border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]",
    desc: "Triagem por telefone",
  },
  hr_interview: {
    border: "border-[hsl(var(--border))]/55",
    bg: "bg-[hsl(var(--surface-muted))]/45",
    accent: "border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]",
    desc: "Entrevista comportamental",
  },
  technical_interview: {
    border: "border-[hsl(var(--border))]/55",
    bg: "bg-[hsl(var(--surface-muted))]/45",
    accent: "border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]",
    desc: "Entrevista com Gestor",
  },
  final: {
    border: "border-[hsl(var(--border))]/55",
    bg: "bg-[hsl(var(--surface-muted))]/45",
    accent: "border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]",
    desc: "Avaliação final",
  },
  offer: {
    border: "border-[hsl(var(--border))]/55",
    bg: "bg-[hsl(var(--surface-muted))]/45",
    accent: "border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]",
    desc: "Proposta e negociação",
  },
  hired: {
    border: "border-[hsl(var(--success))]/35",
    bg: "bg-[hsl(var(--success-soft))]/45",
    accent: "bg-[hsl(var(--success))] text-white",
    desc: "Contratado",
  },
  rejected: {
    border: "border-[hsl(var(--danger))]/35",
    bg: "bg-[hsl(var(--danger-soft))]/45",
    accent: "bg-[hsl(var(--danger))] text-white",
    desc: "Desclassificado",
  },
};

interface KanbanColumnProps {
  column: PipelineColumn;
  colIndex: number;
  onCardClick?: (candidateId: string) => void;
  disabled?: boolean;
  showTopMatchHighlight?: boolean;
  onAddCandidate?: (stage: PipelineStage) => void;
  totalCount?: number;
  draggableCards?: boolean;
  draggingCandidateId?: string | null;
  isDropTarget?: boolean;
  onCardDragStart?: (candidate: JobCandidate) => void;
  onCardDragEnd?: () => void;
  onColumnDragOver?: (stage: PipelineStage) => void;
  onColumnDragLeave?: (stage: PipelineStage) => void;
  onColumnDrop?: (stage: PipelineStage) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  colIndex,
  onCardClick,
  disabled = false,
  showTopMatchHighlight = false,
  onAddCandidate,
  totalCount,
  draggableCards = false,
  draggingCandidateId = null,
  isDropTarget = false,
  onCardDragStart,
  onCardDragEnd,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
}: KanbanColumnProps) {
  const theme = COL_THEMES[column.stage] || COL_THEMES.entry;
  const disabledCls = disabled ? "opacity-60 pointer-events-none" : "";
  const isFiltered = totalCount !== undefined && totalCount !== column.candidates.length;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !draggingCandidateId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onColumnDragOver?.(column.stage);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onColumnDragLeave?.(column.stage);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !draggingCandidateId) return;
    event.preventDefault();
    onColumnDrop?.(column.stage);
  };

  return (
    <div
      className={[
        "flex w-full min-w-[19rem] basis-[clamp(19rem,21vw,24rem)] grow flex-col rounded-2xl border p-4 transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.03)] xl:min-w-[20rem] 2xl:min-w-[21rem]",
        "kanban-column-enter",
        theme.border,
        theme.bg,
        isDropTarget ? "border-[hsl(var(--primary))]/45 bg-[hsl(var(--primary))]/[0.04] shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]" : "",
        disabledCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
      data-testid={`kanban-column-${column.stage}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-drop-target={isDropTarget ? "true" : "false"}
    >
      {/* Column Header */}
      <div className="mb-4 flex flex-col gap-1 border-b border-dashed border-[hsl(var(--border))]/55 pb-3 px-1 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs font-black uppercase tracking-wider text-[hsl(var(--text))] truncate min-w-0" title={column.label}>
            {column.label}
          </span>
          <span
            className={[
              "flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-black tabular-nums shadow-sm",
              isFiltered ? "min-w-[2.5rem] bg-[hsl(var(--primary))] text-white" : `min-w-[1.25rem] ${theme.accent}`,
            ].join(" ")}
          >
            {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
          </span>
        </div>
        <p className="text-[10px] font-medium text-[hsl(var(--text-muted))] truncate" title={theme.desc}>
          {theme.desc}
        </p>
      </div>

      {/* Candidate Cards list */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1 ui-scrollbar">
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
              draggable={draggableCards && !disabled}
              isDragging={draggingCandidateId === c.candidate_id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          );
        })}

        {column.candidates.length === 0 ? (
          <div
            className="flex flex-1 min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))]/60 bg-[hsl(var(--surface))]/55 text-xs font-semibold text-[hsl(var(--text-muted))] shadow-sm px-4 py-6 text-center animate-in fade-in duration-200"
          >
            <span className="text-2xl mb-1.5 opacity-55">📭</span>
            <span className="font-extrabold tracking-tight text-[hsl(var(--text-muted))]">Vazio</span>
            <span className="text-[10px] text-[hsl(var(--text-muted))]/75 mt-1 leading-tight max-w-[150px]">Nenhum candidato nesta fase</span>
          </div>
        ) : null}
      </div>

      {/* Inline "+ Vincular candidato" button at the bottom of the first active column exclusively */}
      {onAddCandidate && colIndex === 0 && column.stage !== "hired" && column.stage !== "rejected" && (
        <button
          type="button"
          onClick={() => onAddCandidate(column.stage)}
          className="mt-3 flex items-center justify-center gap-1.5 w-full rounded-xl border border-dashed border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]/60 py-2.5 text-xs font-bold text-[hsl(var(--text-muted))] transition-all hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--surface-muted))]/80 hover:text-[hsl(var(--primary))] hover:shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Vincular candidato
        </button>
      )}
    </div>
  );
});
