import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate, PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";
import { Plus, Search, CalendarDays, ClipboardList, CheckCircle, Info, Handshake, UserPlus } from "lucide-react";
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
};

// Paleta harmonizada (mesma saturação/luminosidade entre etapas), fora da
// faixa do vermelho da marca — a cor vira só a "assinatura" da etapa,
// concentrada na barra de 3px do topo da coluna.
export const PIPELINE_STAGE_ACCENT_COLORS: Partial<Record<PipelineStage | PipelineMacroColumnId, { accentBar: string }>> = {
  entrada: { accentBar: "bg-[#3B7DDB]" },
  analise: { accentBar: "bg-[#C98A2E]" },
  entrevista: { accentBar: "bg-[#1F9E8F]" },
  avaliacao: { accentBar: "bg-[#7C5CD4]" },
  decisao: { accentBar: "bg-[#B44FA6]" },
  admissao: { accentBar: "bg-[#2E9E63]" },
  finalizado: { accentBar: "bg-[#6B7280]" },
};

const EMPTY_STATE_ICON_BG = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300";

const getEmptyStateConfig = (visualKey: string) => {
  const configs: Record<string, { icon: any; subtitle: string }> = {
    entrada: { icon: Plus, subtitle: "Aguardando novos perfis." },
    analise: { icon: Search, subtitle: "Os candidatos avançam após a triagem inicial." },
    entrevista: { icon: CalendarDays, subtitle: "Agende entrevistas para avançar no processo." },
    avaliacao: { icon: ClipboardList, subtitle: "Consolidação das evidências e decisão final." },
    decisao: { icon: Handshake, subtitle: "Oferta e negociação." },
    admissao: { icon: UserPlus, subtitle: "Processo aprovado! Contratação realizada." },
    finalizado: { icon: CheckCircle, subtitle: "Processos concluídos." },
  };
  const config = configs[visualKey] || { icon: ClipboardList, subtitle: "Aguardando candidatos." };
  return { ...config, bg: EMPTY_STATE_ICON_BG };
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
  const theme =
    PIPELINE_STAGE_ACCENT_COLORS[column.macroId ?? column.stage] ||
    PIPELINE_STAGE_ACCENT_COLORS[column.stage] ||
    DEFAULT_THEME;
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
        "relative border border-slate-200/80 bg-white dark:bg-slate-900 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.3)] dark:border-border dark:shadow-none",
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
      <div className={`h-1.5 w-full shrink-0 ${theme.accentBar}`} />

      {/* Column Header */}
      <div className="pipeline-kanban-column__header relative flex items-center justify-between border-b border-slate-100/90 bg-white px-3.5 pb-2.5 pt-3 dark:border-border/70 dark:bg-surface">
        <div className="min-w-0">
          <span className="block truncate text-[13px] font-black tracking-tight text-slate-800 dark:text-text" title={column.label}>
            {column.label}
          </span>
          {column.description ? (
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400 dark:text-text-muted">
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
            data-testid="kanban-column-count"
            className="flex h-6 min-w-[30px] items-center justify-center rounded-full border border-slate-200 bg-slate-100/90 px-2 text-[10px] font-extrabold text-slate-700 shadow-sm dark:border-border dark:bg-surface dark:text-text-muted"
          >
            {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
          </span>
        </div>
      </div>

      {/* Candidate Cards list / Drop Zone */}
      <div className={`pipeline-kanban-column__body flex min-h-[40px] flex-1 flex-col gap-2.5 bg-slate-50/40 px-2.5 pb-2.5 pt-2.5 overflow-y-auto transition-all duration-200 border border-transparent dark:bg-background/20 ${
        isDropTarget && !dropDisabled
          ? 'mx-2 rounded-xl border-dashed border-emerald-300 bg-emerald-50/70 dark:border-emerald-900/55 dark:bg-emerald-950/24'
          : ''
      } [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-250 dark:[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full`}>
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

        {column.candidates.length === 0 && (() => {
          const emptyConfig = getEmptyStateConfig(columnVisualKey);
          const EmptyIcon = emptyConfig.icon;
          return (
            <div className="pipeline-kanban-column__empty my-auto mx-auto flex flex-col items-center justify-center w-full px-2.5">
              <div className="flex flex-col items-center justify-center bg-white dark:bg-surface border border-slate-200/50 dark:border-border/50 rounded-[20px] p-5 shadow-[0_8px_20px_rgba(15,23,42,0.02)] w-full transition-all duration-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.04)] animate-in fade-in zoom-in-95 duration-300">
                <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${emptyConfig.bg}`}>
                  <EmptyIcon className="h-5 w-5" />
                </div>
                <h3 className="text-[12px] font-black text-slate-800 dark:text-text">
                  Nenhum candidato
                </h3>
                <p className="mt-1 max-w-[155px] text-[10px] font-bold leading-normal text-slate-400 dark:text-text-muted text-center">
                  {emptyConfig.subtitle}
                </p>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
});
