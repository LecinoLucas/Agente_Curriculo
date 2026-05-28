import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate, PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";
import { Plus, Inbox, Search, ClipboardList, Users, Handshake, CheckCircle, Info } from "lucide-react";
import type { PipelineMacroColumnId } from "../../features/pipeline/utils/pipelineKanbanColumns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

type KanbanColumnData = PipelineColumn & {
  macroId?: PipelineMacroColumnId;
  description?: string;
  dropTargetStage?: PipelineStage | null;
  dropDisabledReason?: string;
};

const DEFAULT_THEME = {
  border: "border-rose-100/60 dark:border-slate-800",
  bg: "bg-[#FFFDFD] dark:bg-slate-900/40",
  accent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  desc: "Etapa do processo",
  icon: Plus,
  iconBg: "bg-rose-50 text-rose-600 dark:bg-slate-800 dark:text-slate-400"
};

const COL_THEMES: Partial<Record<PipelineStage | PipelineMacroColumnId, any>> = {
  entrada: {
    border: "border-rose-100/60 dark:border-slate-800",
    bg: "bg-[#FFFDFD] dark:bg-slate-900/40",
    accent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    desc: "Inscrições e currículos recebidos",
    icon: Inbox,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
  },
  analise: {
    border: "border-rose-100/60 dark:border-slate-800",
    bg: "bg-[#FFFDFD] dark:bg-slate-900/40",
    accent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    desc: "Revisão inicial de perfil",
    icon: Search,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
  },
  avaliacao: {
    border: "border-rose-100/60 dark:border-slate-800",
    bg: "bg-[#FFFDFD] dark:bg-slate-900/40",
    accent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    desc: "Consolidação da decisão",
    icon: ClipboardList,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
  },
  entrevista: {
    border: "border-rose-100/60 dark:border-slate-800",
    bg: "bg-[#FFFDFD] dark:bg-slate-900/40",
    accent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    desc: "Entrevistas RH, técnica e scorecard",
    icon: Users,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
  },
  decisao: {
    border: "border-emerald-100/60 dark:border-emerald-900/30",
    bg: "bg-emerald-50/30 dark:bg-emerald-900/10",
    accent: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
    desc: "Oferta, decisão e negociação",
    icon: Handshake,
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
  },
  finalizado: {
    border: "border-emerald-100/60 dark:border-emerald-900/30",
    bg: "bg-emerald-50/30 dark:bg-emerald-900/10",
    accent: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
    desc: "Admitidos e encerrados",
    icon: CheckCircle,
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
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
        "kanban-column-enter",
        isDropTarget && !dropDisabled ? "rounded-2xl border-red-300 bg-red-50/50 shadow-[0_0_0_2px_rgba(193,18,31,0.1)] dark:border-red-800 dark:bg-red-950/20" : "",
        disabledCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
      data-testid={`kanban-column-${columnTestId}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-drop-target={isDropTarget ? "true" : "false"}
    >
      {/* Column Header */}
      <div className="mb-3 flex flex-col gap-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 shadow-sm min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {theme.icon && (
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${theme.iconBg}`}>
              <theme.icon className="h-3.5 w-3.5" />
            </div>
          )}
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate min-w-0" title={column.label}>
                {column.label}
              </span>
              {dropDisabled && column.dropDisabledReason ? (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-full flex items-center justify-center">
                        <Info className="h-3.5 w-3.5 text-rose-500/70 hover:text-rose-600 transition-colors cursor-pointer shrink-0" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center" className="max-w-[220px] text-center bg-white text-slate-700 border border-slate-200 shadow-md dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 text-xs font-medium z-[100] mt-1 p-2 rounded-lg">
                      <p>{column.dropDisabledReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            <span
              className={[
                "flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-bold tabular-nums",
                isFiltered ? "bg-[#C1121F] text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              ].join(" ")}
            >
              {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
            </span>
          </div>
        </div>
        <p className="text-[10px] font-medium text-slate-400 truncate" title={column.description ?? theme.desc}>
          {column.description ?? theme.desc}
        </p>
      </div>

      {/* Candidate Cards list / Drop Zone */}
      <div className="flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-2 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
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
          <div className="flex flex-1 flex-col items-center justify-center px-2 py-4 text-center animate-in fade-in duration-200">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-400 shadow-sm`}>
              <theme.icon className="h-4 w-4 opacity-70" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Arraste candidatos para esta etapa</span>
          </div>
        )}
      </div>

      {/* Inline "+ Vincular candidato" button at the bottom of the first active column exclusively */}
      {onAddCandidate && colIndex === 0 && column.stage !== "hired" && column.stage !== "rejected" && (
        <button
          type="button"
          onClick={() => onAddCandidate(targetStage)}
          className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-[#C1121F] transition-all hover:opacity-80 dark:text-rose-400"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar candidato
        </button>
      )}
    </div>
  );
});
