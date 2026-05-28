import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate, PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";
import { Plus, Inbox, Search, ClipboardList, Users, Handshake, CheckCircle } from "lucide-react";
import type { PipelineMacroColumnId } from "../../features/pipeline/utils/pipelineKanbanColumns";

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
    desc: "Triagem e análise inicial",
    icon: Search,
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
  },
  avaliacao: {
    border: "border-rose-100/60 dark:border-slate-800",
    bg: "bg-[#FFFDFD] dark:bg-slate-900/40",
    accent: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    desc: "Avaliações e etapa final",
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
        "flex w-full min-w-[15rem] basis-[clamp(15rem,14vw,18rem)] grow flex-col rounded-2xl border p-3 transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.03)] xl:min-w-[15.5rem] 2xl:min-w-[16.5rem]",
        "kanban-column-enter",
        theme.border,
        theme.bg,
        isDropTarget && !dropDisabled ? "border-red-300 bg-red-50/50 shadow-[0_0_0_2px_rgba(193,18,31,0.1)] dark:border-red-800 dark:bg-red-950/20" : "",
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
      <div className="mb-4 flex flex-col gap-2 border-b border-rose-100/60 dark:border-slate-800/60 pb-3 px-1 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          {theme.icon && (
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${theme.iconBg}`}>
              <theme.icon className="h-4 w-4" />
            </div>
          )}
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <span className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100 truncate min-w-0" title={column.label}>
              {column.label}
            </span>
            <span
              className={[
                "flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-black tabular-nums shadow-sm border",
                isFiltered ? "min-w-[2.5rem] bg-[#C1121F] text-white border-[#C1121F]" : `min-w-[1.5rem] ${theme.accent}`,
              ].join(" ")}
            >
              {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
            </span>
          </div>
        </div>
        <p className="text-[11px] font-medium text-slate-500 truncate mt-1" title={column.description ?? theme.desc}>
          {column.description ?? theme.desc}
        </p>
        {dropDisabled && column.dropDisabledReason ? (
          <p className="text-[9px] font-semibold text-slate-400 mt-0.5" title={column.dropDisabledReason}>
            Movimento pelo perfil
          </p>
        ) : null}
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
            className="flex flex-1 min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-rose-200/60 bg-white/50 dark:border-slate-800 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 shadow-sm px-4 py-6 text-center animate-in fade-in duration-200"
          >
            <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-[#C1121F] dark:bg-rose-950/30 dark:text-rose-400`}>
              <theme.icon className="h-5 w-5 opacity-80" />
            </div>
            <span className="text-sm font-extrabold tracking-tight text-slate-700 dark:text-slate-300">Vazio</span>
            <span className="text-[11px] text-slate-500 mt-1.5 leading-tight max-w-[150px]">Nenhum candidato nesta fase</span>
          </div>
        ) : null}
      </div>

      {/* Inline "+ Vincular candidato" button at the bottom of the first active column exclusively */}
      {onAddCandidate && colIndex === 0 && column.stage !== "hired" && column.stage !== "rejected" && (
        <button
          type="button"
          onClick={() => onAddCandidate(targetStage)}
          className="mt-3 flex items-center justify-center gap-1.5 w-full rounded-xl border border-dashed border-red-200 bg-red-50/30 py-3 text-xs font-bold text-[#C1121F] transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 hover:shadow-sm dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-900/40"
        >
          <Plus className="h-4 w-4" />
          Vincular candidato
        </button>
      )}
    </div>
  );
});
