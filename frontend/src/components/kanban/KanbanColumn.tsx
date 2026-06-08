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
  accentBar: "bg-slate-300/90 dark:bg-slate-500/55",
  headerGlow: "from-slate-100/90 via-transparent to-transparent dark:from-slate-900/30 dark:via-transparent dark:to-transparent",
  badge: "border border-slate-200 bg-slate-100/90 text-slate-700 dark:border-border dark:bg-surface dark:text-text-muted",
  textEmpty: "text-slate-500 dark:text-text-muted",
  bgEmpty: "bg-slate-50 border-slate-200 text-slate-400 dark:bg-surface dark:border-border dark:text-text-muted",
  emptyIcon: ClipboardList,
  emptySub: "Aguardando candidatos.",
};

const COL_THEMES: Partial<Record<PipelineStage | PipelineMacroColumnId, any>> = {
  entrada: {
    accentBar: "bg-emerald-400/80 dark:bg-emerald-500/55",
    headerGlow: "from-emerald-100/80 via-emerald-50/20 to-transparent dark:from-emerald-950/22 dark:via-transparent dark:to-transparent",
    badge: "border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/24 dark:text-emerald-200",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-emerald-50/80 border-emerald-100 text-emerald-500 dark:bg-emerald-950/18 dark:border-emerald-900/35 dark:text-emerald-200",
    emptyIcon: Plus,
    emptySub: "Aguardando novos perfis.",
  },
  analise: {
    accentBar: "bg-amber-400/85 dark:bg-amber-500/55",
    headerGlow: "from-amber-100/90 via-amber-50/20 to-transparent dark:from-amber-950/20 dark:via-transparent dark:to-transparent",
    badge: "border border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/22 dark:text-amber-200",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-amber-50/80 border-amber-100 text-amber-500 dark:bg-amber-950/16 dark:border-amber-900/35 dark:text-amber-200",
    emptyIcon: Search,
    emptySub: "Os candidatos avançam após a triagem inicial.",
  },
  avaliacao: {
    accentBar: "bg-rose-400/75 dark:bg-rose-500/50",
    headerGlow: "from-rose-100/80 via-rose-50/20 to-transparent dark:from-rose-950/20 dark:via-transparent dark:to-transparent",
    badge: "border border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/22 dark:text-rose-200",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-rose-50/80 border-rose-100 text-rose-500 dark:bg-rose-950/16 dark:border-rose-900/35 dark:text-rose-200",
    emptyIcon: ClipboardList,
    emptySub: "Avaliações em andamento.",
  },
  entrevista: {
    accentBar: "bg-cyan-400/80 dark:bg-cyan-500/52",
    headerGlow: "from-cyan-100/90 via-cyan-50/20 to-transparent dark:from-cyan-950/20 dark:via-transparent dark:to-transparent",
    badge: "border border-cyan-200/80 bg-cyan-50 text-cyan-700 dark:border-cyan-900/40 dark:bg-cyan-950/22 dark:text-cyan-200",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-cyan-50/80 border-cyan-100 text-cyan-500 dark:bg-cyan-950/16 dark:border-cyan-900/35 dark:text-cyan-200",
    emptyIcon: CalendarDays,
    emptySub: "Agende entrevistas para avançar no processo.",
  },
  decisao: {
    accentBar: "bg-violet-400/80 dark:bg-violet-500/50",
    headerGlow: "from-violet-100/90 via-violet-50/20 to-transparent dark:from-violet-950/18 dark:via-transparent dark:to-transparent",
    badge: "border border-violet-200/80 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/22 dark:text-violet-200",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-violet-50/80 border-violet-100 text-violet-500 dark:bg-violet-950/16 dark:border-violet-900/35 dark:text-violet-200",
    emptyIcon: Handshake,
    emptySub: "Avaliação final.",
  },
  finalizado: {
    accentBar: "bg-slate-400/80 dark:bg-slate-500/55",
    headerGlow: "from-slate-100/90 via-slate-50/20 to-transparent dark:from-slate-900/28 dark:via-transparent dark:to-transparent",
    badge: "border border-slate-200/80 bg-slate-100 text-slate-700 dark:border-border dark:bg-surface dark:text-text-muted",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-slate-100 border-slate-200 text-slate-400 dark:bg-surface dark:border-border dark:text-text-muted",
    emptyIcon: CheckCircle,
    emptySub: "Processos concluídos.",
  },
  admissao: {
    accentBar: "bg-teal-400/75 dark:bg-teal-500/50",
    headerGlow: "from-teal-100/90 via-teal-50/20 to-transparent dark:from-teal-950/20 dark:via-transparent dark:to-transparent",
    badge: "border border-teal-200/80 bg-teal-50 text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/22 dark:text-teal-200",
    textEmpty: "text-slate-500 dark:text-text-muted",
    bgEmpty: "bg-teal-50/80 border-teal-100 text-teal-500 dark:bg-teal-950/16 dark:border-teal-900/35 dark:text-teal-200",
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
        "flex w-full min-w-[13.5rem] basis-[clamp(13.5rem,18vw,16rem)] grow flex-col overflow-hidden rounded-[20px] transition-all duration-300",
        "pipeline-kanban-column",
        `pipeline-kanban-column--${columnVisualKey}`,
        "kanban-column-enter",
        "relative border border-slate-200/80 bg-white/95 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.45)] dark:border-border dark:bg-surface-muted dark:shadow-none",
        isDropTarget && !dropDisabled ? "ring-2 ring-emerald-400/50 dark:ring-emerald-900/55 scale-[1.01]" : "",
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
      <div className={`h-1 w-full ${theme.accentBar}`} />

      {/* Column Header */}
      <div className={`pipeline-kanban-column__header relative flex items-center justify-between border-b border-slate-100/90 bg-gradient-to-r px-3.5 pb-2.5 pt-3 dark:border-border/70 ${theme.headerGlow}`}>
        <div className="min-w-0">
          <span className="block truncate text-[13px] font-black tracking-tight text-slate-800 dark:text-text" title={column.label}>
            {column.label}
          </span>
          {column.description ? (
            <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400 dark:text-text-muted">
              {column.description}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {dropDisabled && column.dropDisabledReason ? (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-full flex items-center justify-center">
                    <Info className="h-3.5 w-3.5 cursor-pointer shrink-0 text-slate-400 transition-colors hover:text-slate-600 dark:text-text-muted dark:hover:text-text/80" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="max-w-[220px] text-center bg-white text-slate-700 border border-slate-200 shadow-md dark:bg-popover dark:border-border dark:text-popover-foreground text-xs font-medium z-[100] mt-1 p-2 rounded-lg">
                  <p>{column.dropDisabledReason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <span
            className={`flex h-6 min-w-[30px] items-center justify-center rounded-full px-2 text-[10px] font-extrabold shadow-sm ${theme.badge}`}
          >
            {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
          </span>
        </div>
      </div>

      {/* Candidate Cards list / Drop Zone */}
      <div className={`pipeline-kanban-column__body flex min-h-[40px] flex-1 flex-col gap-2.5 bg-slate-50/65 px-2.5 pb-2.5 pt-2.5 overflow-y-auto transition-all duration-200 border dark:bg-background/35 ${
        isDropTarget && !dropDisabled
          ? 'mx-2 rounded-xl border-dashed border-emerald-300 bg-emerald-50/70 dark:border-emerald-900/55 dark:bg-emerald-950/24'
          : 'border-transparent'
      } [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full`}>
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
          <div className="pipeline-kanban-column__empty my-auto mx-auto flex flex-col items-center justify-center w-full px-2.5">
            <div className="flex flex-col items-center justify-center bg-white dark:bg-surface border border-slate-200/50 dark:border-border/50 rounded-[20px] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.02)] w-full transition-all duration-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.04)] animate-in fade-in zoom-in-95 duration-300">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${
                columnVisualKey === "entrevista"
                  ? "bg-cyan-50 text-cyan-500 dark:bg-cyan-950/30 dark:text-cyan-400"
                  : columnVisualKey === "avaliacao"
                  ? "bg-rose-50 text-rose-500 dark:bg-rose-950/30 dark:text-rose-400"
                  : columnVisualKey === "decisao"
                  ? "bg-violet-50 text-violet-500 dark:bg-violet-950/30 dark:text-violet-400"
                  : theme.bgEmpty
              }`}>
                {theme.emptyIcon && <theme.emptyIcon className="h-4.5 w-4.5" />}
              </div>
              <h3 className="text-[12px] font-black text-slate-800 dark:text-text">
                Nenhum candidato
              </h3>
              <p className="mt-1 max-w-[155px] text-[10px] font-bold leading-normal text-slate-400 dark:text-text-muted">
                {theme.emptySub}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
});
