import { memo, type CSSProperties } from "react";
import type { PipelineColumn, PipelineStage } from "../../types/domain";
import { KanbanCard } from "./KanbanCard";
import { Plus } from "lucide-react";

const COL_THEMES: Record<PipelineStage, { border: string; bg: string; accent: string; desc: string }> = {
  entry: {
    border: "border-slate-200 dark:border-slate-800/80",
    bg: "bg-slate-50/50 dark:bg-slate-900/40",
    accent: "bg-slate-500 text-white",
    desc: "Triagem inicial de perfil",
  },
  screening: {
    border: "border-purple-200 dark:border-purple-900/30",
    bg: "bg-purple-50/45 dark:bg-purple-950/20",
    accent: "bg-purple-500 text-white",
    desc: "Triagem por telefone",
  },
  hr_interview: {
    border: "border-indigo-200 dark:border-indigo-900/30",
    bg: "bg-indigo-50/45 dark:bg-indigo-950/20",
    accent: "bg-indigo-500 text-white",
    desc: "Entrevista comportamental",
  },
  technical_interview: {
    border: "border-amber-200 dark:border-amber-900/30",
    bg: "bg-amber-50/45 dark:bg-amber-950/15",
    accent: "bg-amber-500 text-white",
    desc: "Entrevista com Gestor",
  },
  final: {
    border: "border-pink-200 dark:border-pink-900/30",
    bg: "bg-pink-50/45 dark:bg-pink-950/20",
    accent: "bg-pink-500 text-white",
    desc: "Avaliação final",
  },
  offer: {
    border: "border-teal-200 dark:border-teal-900/30",
    bg: "bg-teal-50/45 dark:bg-teal-950/20",
    accent: "bg-teal-500 text-white",
    desc: "Proposta e negociação",
  },
  hired: {
    border: "border-emerald-200 dark:border-emerald-900/30",
    bg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    accent: "bg-emerald-600 text-white",
    desc: "Contratado",
  },
  rejected: {
    border: "border-rose-200 dark:border-rose-900/30",
    bg: "bg-rose-50/30 dark:bg-rose-950/20",
    accent: "bg-rose-500 text-white",
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
}

export const KanbanColumn = memo(function KanbanColumn({
  column,
  colIndex,
  onCardClick,
  disabled = false,
  showTopMatchHighlight = false,
  onAddCandidate,
  totalCount,
}: KanbanColumnProps) {
  const theme = COL_THEMES[column.stage] || COL_THEMES.entry;
  const disabledCls = disabled ? "opacity-60 pointer-events-none" : "";
  const isFiltered = totalCount !== undefined && totalCount !== column.candidates.length;

  return (
    <div
      className={[
        "flex w-[21rem] min-w-[320px] shrink-0 flex-col rounded-2xl border p-4 transition-all duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.03)]",
        "kanban-column-enter",
        theme.border,
        theme.bg,
        disabledCls,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${colIndex * 55}ms` } as CSSProperties}
      data-testid={`kanban-column-${column.stage}`}
    >
      {/* Column Header */}
      <div className="mb-4 flex flex-col gap-1 border-b border-dashed border-slate-200/60 dark:border-slate-800/80 pb-3 px-1 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate min-w-0" title={column.label}>
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
        <p className="text-[10px] font-medium text-slate-400 truncate" title={theme.desc}>
          {theme.desc}
        </p>
      </div>

      {/* Candidate Cards list */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5 ui-scrollbar min-h-0">
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
            className="flex flex-1 min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/20 text-xs font-semibold text-slate-400 dark:text-slate-500 shadow-sm px-4 py-6 text-center animate-in fade-in duration-200"
          >
            <span className="text-2xl mb-1.5 opacity-55">📭</span>
            <span className="font-extrabold tracking-tight text-slate-400 dark:text-slate-400/85">Vazio</span>
            <span className="text-[10px] text-slate-400/70 dark:text-slate-500 mt-1 leading-tight max-w-[150px]">Nenhum candidato nesta fase</span>
          </div>
        ) : null}
      </div>

      {/* Inline "+ Adicionar candidato" button at the bottom of the first active column exclusively */}
      {onAddCandidate && colIndex === 0 && column.stage !== "hired" && column.stage !== "rejected" && (
        <button
          type="button"
          onClick={() => onAddCandidate(column.stage)}
          className="mt-3 flex items-center justify-center gap-1.5 w-full rounded-xl border border-dashed border-slate-200 dark:border-slate-800/85 bg-white/60 dark:bg-slate-900/20 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 transition-all hover:border-[hsl(var(--primary))]/30 hover:bg-white dark:hover:bg-slate-850 hover:text-[hsl(var(--primary))] dark:hover:text-[hsl(var(--primary))] hover:shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar candidato
        </button>
      )}
    </div>
  );
});
