import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";
import { Calendar, Mail, AlertTriangle, CheckCircle2, Clock, GripVertical } from "lucide-react";
import {
  derivePipelineCardBadges,
  type PipelineCardBadgeTone,
} from "../../features/pipeline/utils/pipelineCardBadges";
import {
  PIPELINE_STAGE_OPERATIONAL_SUMMARY,
  PIPELINE_STAGE_SUBSTATUS_LABEL,
} from "../../features/pipeline/utils/pipelineKanbanColumns";

interface KanbanCardProps {
  candidate: JobCandidate;
  isSaving: boolean;
  enterDelay: number;
  onCardClick?: (candidateId: string) => void;
  isTopMatch?: boolean;
  rank?: number;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (candidate: JobCandidate) => void;
  onDragEnd?: () => void;
}

// Helper to get initials from a name
function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0][0].toUpperCase();
}

// Generate deterministically consistent warm/brand colors based on the candidate's name
function getAvatarStyles(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % 4;
  const classes = [
    "bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.15)]",
    "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent-foreground))] border-[hsl(var(--accent-soft))/80]",
    "bg-warning-soft text-warning border-[hsl(var(--warning-soft))/80]",
    "bg-surface-muted text-text-muted border-[hsl(var(--border))/20]"
  ];
  return classes[index];
}

function getAiProcessingState(candidate: JobCandidate): { label: string; tone: "pending" | "processing" } | null {
  const rawCandidate = candidate as Record<string, unknown>;
  const status = String(
    candidate.ai_status ??
      rawCandidate.analysis_status ??
      rawCandidate.latest_analysis_status ??
      rawCandidate.extraction_status ??
      "",
  ).toLowerCase();

  if (status === "waiting_extraction") {
    return { label: "Aguardando extração", tone: "pending" };
  }

  if (status === "pending" || status === "queued" || status === "retry_scheduled") {
    return { label: "IA na fila", tone: "pending" };
  }

  if (status === "processing") {
    return { label: "IA analisando", tone: "processing" };
  }

  return null;
}

const BADGE_TONE_CLASS: Record<PipelineCardBadgeTone, string> = {
  danger: "bg-danger-soft text-danger border border-[hsl(var(--danger-soft))/80]",
  warning: "bg-warning-soft text-warning border border-[hsl(var(--warning-soft))/80]",
  progress: "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent-foreground))] border border-[hsl(var(--accent-soft))/80]",
  success: "bg-success-soft text-success border border-[hsl(var(--success-soft))/80]",
  neutral: "bg-surface-muted text-text-muted border border-[hsl(var(--border))/20]",
};

function buildProfessionalContext(candidate: JobCandidate, aiProcessingState: ReturnType<typeof getAiProcessingState>): string | null {
  const { current_title, current_company, total_experience_years, seniority_level } = candidate;

  if (current_title && current_company) return `${current_title} na ${current_company}`;
  if (current_title) return current_title;
  if (current_company) return `Experiência em ${current_company}`;

  if (seniority_level || (total_experience_years !== undefined && total_experience_years !== null)) {
    const seniority = seniority_level ? formatSeniority(seniority_level) : null;
    const experience = typeof total_experience_years === "number"
      ? `${total_experience_years} ano${total_experience_years === 1 ? "" : "s"}`
      : null;
    return [seniority, experience].filter(Boolean).join(" • ");
  }

  return null;
}

function buildNextAction(candidate: JobCandidate, rawCandidate: any, stageSummary: string | null, aiStatus: ReturnType<typeof getAiProcessingState>): string | null {
  if (rawCandidate.candidate_status === "blocked" || rawCandidate.candidate_status === "error") {
    return "Resolver pendência";
  }

  const reqAction = rawCandidate.required_action;
  if (reqAction === "open_pre_admission") return "Abrir pré-admissão";
  if (reqAction === "register_decision") return "Registrar decisão";
  if (reqAction === "run_analysis") return "Executar avaliação IA";

  if (stageSummary) {
    if (stageSummary.toLowerCase().includes("protheus")) return "Integração ERP";
    return stageSummary;
  }

  if (aiStatus) return aiStatus.label;

  return null;
}

export const KanbanCard = memo(function KanbanCard({
  candidate,
  isSaving,
  enterDelay,
  onCardClick,
  isTopMatch = false,
  rank,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const name = candidate.candidate_name || "Sem Nome";
  const initials = getInitials(name);
  const avatarClass = getAvatarStyles(name);

  const jobFitScore = candidate.job_fit_score;

  // Cast candidate to any to check for optionally populated values (source/origem/updated_at) without breaking types
  const rawCandidate = candidate as any;
  const source = rawCandidate.application_source_label || rawCandidate.application_source || rawCandidate.source || null;

  let timeInStageLabel = "";
  if (rawCandidate.updated_at) {
    const updatedAt = new Date(rawCandidate.updated_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - updatedAt.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      timeInStageLabel = "hoje";
    } else if (diffDays === 1) {
      timeInStageLabel = "há 1 dia";
    } else {
      timeInStageLabel = `há ${diffDays} dias`;
    }
  }

  // Derive indicators based on actual candidate data
  const aiProcessingState = getAiProcessingState(candidate);
  const stageSubstatus = candidate.stage ? PIPELINE_STAGE_SUBSTATUS_LABEL[candidate.stage] : null;
  const currentStageText = stageSubstatus || "Entrada";
  const timeLabel = timeInStageLabel ? `· parado ${timeInStageLabel}` : "";
  const stageSummary = candidate.stage ? PIPELINE_STAGE_OPERATIONAL_SUMMARY[candidate.stage] : null;

  const professionalContext = buildProfessionalContext(candidate, aiProcessingState);
  const nextAction = buildNextAction(candidate, rawCandidate, stageSummary, aiProcessingState);

  const rawBadges = derivePipelineCardBadges(candidate);
  // Limit badges: 1 main badge (e.g. Danger/Warning) and maybe 1 other, or just 1 action-based
  const operationalBadges = rawBadges
    .sort((a, b) => {
      const toneWeight = { danger: 0, warning: 1, progress: 2, success: 3, neutral: 4 };
      return toneWeight[a.tone] - toneWeight[b.tone];
    })
    .slice(0, 1); // just show the most critical one to reduce noise

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!draggable) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", candidate.candidate_id);
    onDragStart?.(candidate);
  };

  return (
    <div
      onClick={onCardClick ? () => onCardClick(candidate.candidate_id) : undefined}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={[
        "pipeline-candidate-card group relative w-full select-none rounded-xl bg-white dark:bg-slate-900 p-2.5 shadow-sm transition-all duration-200 overflow-hidden",
        "border hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md",
        isTopMatch ? "border-slate-200 border-l-4 border-l-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/10 dark:border-slate-800 dark:border-l-emerald-500 dark:ring-emerald-500/20" : "border-slate-200 dark:border-slate-800",
        isSaving ? "cursor-wait opacity-50" : draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging ? "opacity-40 ring-2 ring-slate-400 dark:ring-slate-500 scale-95 rotate-1" : "opacity-100",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
      data-testid={`kanban-card-${candidate.candidate_id}`}
      data-dragging={isDragging ? "true" : "false"}
    >
      {/* Top Row: Score and Time */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        {jobFitScore !== null && jobFitScore !== undefined ? (
          <span className="pipeline-candidate-card__score shrink-0 rounded bg-emerald-50 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/60 flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" />
            {Math.round(jobFitScore)}% aderência
          </span>
        ) : aiProcessingState ? (
          <span className="shrink-0 rounded bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200 dark:border-slate-700">
            IA {aiProcessingState.tone === "pending" ? "na fila" : "analisando"}
          </span>
        ) : <div />}

        {timeInStageLabel && (
          <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3 shrink-0" />
            <span className="text-[10px] font-medium capitalize">{timeInStageLabel}</span>
          </div>
        )}
      </div>

      {/* Middle Row: Avatar, Name & Professional Context */}
      <div className="flex items-start gap-2.5">
        {draggable && (
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 flex h-5 w-3 shrink-0 cursor-grab items-center justify-center opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-40">
            <GripVertical className="h-3.5 w-3.5 text-slate-400" />
          </div>
        )}
        <span className={`pipeline-candidate-card__avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold ${avatarClass}`}>
          {initials}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="truncate text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-200">
            {name}
          </span>
          {professionalContext && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block font-medium mt-0.5">
              {professionalContext}
            </span>
          )}
        </div>
      </div>

      {/* Next Action / Status */}
      {nextAction && (
        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/60 pt-2">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate block bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
            {nextAction}
          </span>
          {source && (
            <span className="shrink-0 text-[9px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
              {source === "public_application" ? "Pública" : source}
            </span>
          )}
        </div>
      )}

      {/* Operational badges row */}
      {operationalBadges.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {operationalBadges.map((badge) => (
            <span
              key={badge.label}
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${BADGE_TONE_CLASS[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
});
