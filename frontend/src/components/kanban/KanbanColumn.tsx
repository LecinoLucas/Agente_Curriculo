import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate, PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";
import { Plus, Search, CalendarDays, ClipboardList, CheckCircle, Info, Handshake } from "lucide-react";
import type { PipelineMacroColumnId } from "../../features/pipeline/utils/pipelineKanbanColumns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type KanbanColumnData = PipelineColumn & {
  macroId?: PipelineMacroColumnId;
  description?: string;
  dropTargetStage?: PipelineStage | null;
  dropDisabledReason?: string;
};

const DEFAULT_THEME = {
  borderTop: "border-t-[3px] border-t-slate-300",
  badge: "bg-slate-100 text-slate-700",
  textEmpty: "text-slate-500",
  bgEmpty: "bg-slate-50 border-slate-200 text-slate-400",
  addButton: "text-slate-500 hover:text-slate-600 hover:bg-slate-50",
  emptyIcon: ClipboardList,
  emptySub: "Aguardando candidatos.",
};

const COL_THEMES: Partial<Record<PipelineStage | PipelineMacroColumnId, any>> = {
  entrada: {
    borderTop: "border-t-[3px] border-t-teal-500",
    badge: "bg-teal-50 text-teal-700",
    textEmpty: "text-teal-600",
    bgEmpty: "bg-teal-50 border-teal-100 text-teal-500",
    addButton: "text-teal-600 hover:text-teal-700 hover:bg-teal-50",
    emptyIcon: Plus,
    emptySub: "Aguardando novos perfis.",
  },
  analise: {
    borderTop: "border-t-[3px] border-t-orange-400",
    badge: "bg-orange-50 text-orange-700",
    textEmpty: "text-orange-500",
    bgEmpty: "bg-orange-50 border-orange-100 text-orange-400",
    addButton: "text-orange-500 hover:text-orange-600 hover:bg-orange-50",
    emptyIcon: Search,
    emptySub: "Os candidatos avançam após a triagem inicial.",
  },
  avaliacao: {
    borderTop: "border-t-[3px] border-t-blue-500",
    badge: "bg-blue-50 text-blue-700",
    textEmpty: "text-blue-600",
    bgEmpty: "bg-blue-50 border-blue-100 text-blue-500",
    addButton: "text-blue-600 hover:text-blue-700 hover:bg-blue-50",
    emptyIcon: ClipboardList,
    emptySub: "Avaliações em andamento.",
  },
  entrevista: {
    borderTop: "border-t-[3px] border-t-cyan-500",
    badge: "bg-cyan-50 text-cyan-700",
    textEmpty: "text-cyan-600",
    bgEmpty: "bg-cyan-50 border-cyan-100 text-cyan-500",
    addButton: "text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50",
    emptyIcon: CalendarDays,
    emptySub: "Agende entrevistas para avançar no processo.",
  },
  decisao: {
    borderTop: "border-t-[3px] border-t-rose-400",
    badge: "bg-rose-50 text-rose-700",
    textEmpty: "text-rose-500",
    bgEmpty: "bg-rose-50 border-rose-100 text-rose-400",
    addButton: "text-rose-500 hover:text-rose-600 hover:bg-rose-50",
    emptyIcon: Handshake,
    emptySub: "Avaliação final.",
  },
  finalizado: {
    borderTop: "border-t-[3px] border-t-purple-500",
    badge: "bg-purple-50 text-purple-700",
    textEmpty: "text-purple-600",
    bgEmpty: "bg-purple-50 border-purple-100 text-purple-500",
    addButton: "text-purple-600 hover:text-purple-700 hover:bg-purple-50",
    emptyIcon: CheckCircle,
    emptySub: "Parabéns! Em breve alguém chegará até aqui.",
  },
  admissao: {
    borderTop: "border-t-[3px] border-t-indigo-500",
    badge: "bg-indigo-50 text-indigo-700",
    textEmpty: "text-indigo-600",
    bgEmpty: "bg-indigo-50 border-indigo-100 text-indigo-500",
    addButton: "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50",
    emptyIcon: CheckCircle,
    emptySub: "Aguardando documentação.",
  },
};

interface KanbanColumnProps {
  column: KanbanColumnData;
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
  const theme = COL_THEMES[column.macroId ?? column.stage] || COL_THEMES[column.stage] || DEFAULT_THEME;
  const columnTestId = column.macroId ?? column.stage;
  const columnVisualKey = column.macroId ?? column.stage;
  const targetStage = column.dropTargetStage ?? column.stage;
  const dropDisabled = column.dropTargetStage === null;
  const disabledCls = disabled ? "opacity-60 pointer-events-none" : "";
  const isFiltered = totalCount !== undefined && totalCount !== column.candidates.length;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || dropDisabled || !draggingCandidateId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onColumnDragOver?.(targetStage);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onColumnDragLeave?.(targetStage);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || dropDisabled || !draggingCandidateId) return;
    event.preventDefault();
    onColumnDrop?.(targetStage);
  };

  return (
    <div
      className={[
        "flex w-full min-w-[15rem] basis-[clamp(15rem,14vw,18rem)] grow flex-col transition-all duration-300 xl:min-w-[15.5rem] 2xl:min-w-[16.5rem]",
        "pipeline-kanban-column",
        `pipeline-kanban-column--${columnVisualKey}`,
        "kanban-column-enter",
        "bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-800 rounded-2xl relative",
        isDropTarget && !dropDisabled ? "ring-2 ring-emerald-400/50 scale-[1.01]" : "",
        disabledCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
      data-testid={`kanban-column-${columnTestId}`}
      data-pipeline-column={columnVisualKey}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-drop-target={isDropTarget ? "true" : "false"}
    >
      {/* Column Header */}
      <div className="pipeline-kanban-column__header flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={column.label}>
          {column.label}
        </span>
        <div className="flex items-center gap-1.5">
          {dropDisabled && column.dropDisabledReason ? (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-full flex items-center justify-center">
                    <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0 dark:text-slate-500 dark:hover:text-slate-300" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="max-w-[220px] text-center bg-white text-slate-700 border border-slate-200 shadow-md dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 text-xs font-medium z-[100] mt-1 p-2 rounded-lg">
                  <p>{column.dropDisabledReason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <span
            className={`flex h-5 items-center justify-center rounded px-2 text-[11px] font-extrabold ${theme.badge}`}
          >
            {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
          </span>
        </div>
      </div>

      {/* Candidate Cards list / Drop Zone */}
      <div className={`pipeline-kanban-column__body flex min-h-[80px] flex-1 flex-col gap-2 px-2 pb-2 overflow-y-auto transition-all duration-200 border ${
        isDropTarget && !dropDisabled
          ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-600 dark:bg-emerald-900/30 border-dashed rounded-xl mx-2'
          : 'border-transparent'
      } [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full`}>
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

        {column.candidates.length === 0 && (
          <div className="pipeline-kanban-column__empty mt-4 mb-auto flex flex-col items-center justify-center px-2 text-center animate-in fade-in duration-200">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${theme.bgEmpty} mb-2`}>
              {theme.emptyIcon && <theme.emptyIcon className="h-5 w-5" />}
            </div>
            <h3 className={`text-[13px] font-bold ${theme.textEmpty}`}>
              Nenhum candidato
            </h3>
            <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 max-w-[180px] leading-snug">
              {theme.emptySub}
            </p>
          </div>
        )}

        {/* Inline "+ Adicionar candidato" button at the bottom for appropriate columns */}
        {onAddCandidate && column.stage !== "hired" && column.stage !== "rejected" && (
          <button
            type="button"
            onClick={() => onAddCandidate(targetStage)}
            className={`mt-1 flex items-center justify-center gap-1.5 w-full py-2.5 text-xs font-bold rounded-lg transition-all ${theme.addButton}`}
          >
            <Plus className="h-4 w-4" />
            Adicionar candidato
          </button>
        )}
      </div>
    </div>
  );
});
