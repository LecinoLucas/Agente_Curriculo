import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";
import { Calendar, Clock3, GripVertical } from "lucide-react";
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
  danger: "border border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/22 dark:text-rose-200",
  warning: "border border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/22 dark:text-amber-200",
  progress: "border border-cyan-200/80 bg-cyan-50 text-cyan-700 dark:border-cyan-900/40 dark:bg-cyan-950/22 dark:text-cyan-200",
  success: "border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/22 dark:text-emerald-200",
  neutral: "border border-slate-200 bg-slate-100/90 text-slate-600 dark:border-border dark:bg-surface-muted dark:text-text-muted",
};

function buildProfessionalContext(candidate: JobCandidate, aiProcessingState: ReturnType<typeof getAiProcessingState>): string | null {
  const { current_title, current_company, total_experience_years, seniority_level } = candidate;
  const rawCandidate = candidate as any;
  const location = rawCandidate.location || rawCandidate.city_state || rawCandidate.city || null;

  let baseContext = "";
  if (current_title && current_company) {
    baseContext = `${current_title} na ${current_company}`;
  } else if (current_title) {
    baseContext = current_title;
  } else if (current_company) {
    baseContext = `Experiência em ${current_company}`;
  } else if (seniority_level || (total_experience_years !== undefined && total_experience_years !== null)) {
    const seniority = seniority_level ? formatSeniority(seniority_level) : null;
    const experience = typeof total_experience_years === "number"
      ? `${total_experience_years} ano${total_experience_years === 1 ? "" : "s"}`
      : null;
    baseContext = [seniority, experience].filter(Boolean).join(" • ");
  }

  if (baseContext) return baseContext;
  return location || null;
}

function buildNextAction(candidate: JobCandidate, rawCandidate: any, stageSummary: string | null, aiStatus: ReturnType<typeof getAiProcessingState>): React.ReactNode | null {
  if (rawCandidate.candidate_status === "blocked" || rawCandidate.candidate_status === "error") {
    return "Resolver pendência";
  }

  if (candidate.interview_scheduled_start) {
    const d = new Date(candidate.interview_scheduled_start);
    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.getDate() === tomorrow.getDate() && d.getMonth() === tomorrow.getMonth() && d.getFullYear() === tomorrow.getFullYear();
    
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let text = "";
    if (isToday) text = `Hoje, ${timeStr}`;
    else if (isTomorrow) text = `Amanhã, ${timeStr}`;
    else text = `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${timeStr}`;

    return (
      <span className="flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        {text}
      </span>
    );
  }

  const reqAction = rawCandidate.required_action;
  if (reqAction === "open_pre_admission") return "Abrir pré-admissão";
  if (reqAction === "register_decision") return "Registrar decisão";
  if (reqAction === "run_analysis") return "Executar avaliação IA";

  // Check if stageSummary is redundant with the column label
  if (stageSummary) {
    const isRedundant = candidate.stage && (
      candidate.stage.includes("interview") || 
      stageSummary.toLowerCase().includes("entrevista") ||
      (candidate.stage === "entry" && stageSummary.toLowerCase().includes("entrada"))
    );
    if (!isRedundant) {
      if (stageSummary.toLowerCase().includes("protheus")) return "Integração ERP";
      return stageSummary;
    }
  }

  if (aiStatus) return aiStatus.label;

  return null;
}

function buildSkillsSummary(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;

  const visible = skills.slice(0, 2).join(" · ");
  const remaining = skills.length - 2;
  return remaining > 0 ? `${visible} +${remaining}` : visible;
}

function daysSince(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;

  const now = new Date();
  const diffMs = now.getTime() - time;
  if (diffMs < 0) return null;

  return Math.floor(diffMs / 86_400_000);
}

function buildProgressLabel(candidate: JobCandidate): string | null {
  const enteredDays = daysSince(candidate.entered_at);
  if (enteredDays !== null) {
    if (enteredDays === 0) return "Entrou hoje";
    if (enteredDays === 1) return "Há 1 dia na etapa";
    return `Há ${enteredDays} dias na etapa`;
  }

  const updatedDays = daysSince(candidate.updated_at);
  if (updatedDays !== null) {
    if (updatedDays === 0) return "Atualizado hoje";
    if (updatedDays === 1) return "Atualizado ontem";
    return `Atualizado há ${updatedDays} dias`;
  }

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

  // Derive indicators based on actual candidate data
  const aiProcessingState = getAiProcessingState(candidate);
  const stageSummary = candidate.stage ? PIPELINE_STAGE_OPERATIONAL_SUMMARY[candidate.stage] : null;

  const professionalContext = buildProfessionalContext(candidate, aiProcessingState);
  const skillsSummary = buildSkillsSummary(candidate.top_skills);
  const progressLabel = buildProgressLabel(candidate);
  const nextAction = buildNextAction(candidate, rawCandidate, stageSummary, aiProcessingState);

  const rawBadges = derivePipelineCardBadges(candidate);
  let primaryBadge: { label: string; tone: PipelineCardBadgeTone; reason?: string } | null =
    rawBadges.find((badge) => badge.label !== "Etapa final") ?? null;

  // Fallback to candidate.candidate_status if no operational badge is present and status is not redundant
  if (!primaryBadge && candidate.candidate_status) {
    const statusLower = candidate.candidate_status.toLowerCase();
    const stageLabel = candidate.stage ? PIPELINE_STAGE_SUBSTATUS_LABEL[candidate.stage]?.toLowerCase() : "";
    const isRedundant = statusLower === "em processo" || statusLower === "active" || statusLower === stageLabel;
    if (!isRedundant) {
      primaryBadge = { label: candidate.candidate_status, tone: "neutral" };
    }
  }

  // Determine score color and border accent color dynamically
  let scoreColorClass = "text-text-muted";
  let borderAccentClass = "border-l-border";

  if (jobFitScore !== null && jobFitScore !== undefined) {
    const score = Math.round(jobFitScore);
    if (score >= 80) {
      scoreColorClass = "text-emerald-600 dark:text-emerald-300";
      borderAccentClass = "border-l-emerald-400 dark:border-l-emerald-700";
    } else if (score >= 60) {
      scoreColorClass = "text-cyan-700 dark:text-cyan-300";
      borderAccentClass = "border-l-cyan-400 dark:border-l-cyan-700";
    } else if (score >= 40) {
      scoreColorClass = "text-amber-600 dark:text-amber-300";
      borderAccentClass = "border-l-amber-400 dark:border-l-amber-700";
    } else {
      scoreColorClass = "text-rose-500 dark:text-rose-300";
      borderAccentClass = "border-l-rose-300 dark:border-l-rose-700";
    }
  } else if (isTopMatch) {
    borderAccentClass = "border-l-emerald-400 dark:border-l-emerald-700";
  }

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
        "pipeline-candidate-card shrink-0 group relative w-full select-none overflow-hidden rounded-[18px] bg-white/98 p-3 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)] transition-all duration-200 dark:bg-surface",
        "border border-border/50 hover:border-border/80 dark:border-border/60 dark:hover:border-border hover:shadow-[0_18px_34px_-24px_rgba(15,23,42,0.38)]",
        "border-l-4",
        borderAccentClass,
        isTopMatch ? "ring-1 ring-emerald-200/60 bg-emerald-50/30 dark:ring-emerald-900/35 dark:bg-emerald-950/10" : "",
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
      {draggable && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 flex h-5 w-3 shrink-0 cursor-grab items-center justify-center opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-40">
          <GripVertical className="h-3.5 w-3.5 text-text-muted/50" />
        </div>
      )}

      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className={`pipeline-candidate-card__avatar mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[9px] font-extrabold shadow-sm ${avatarClass}`}>
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold tracking-tight text-text transition-colors group-hover:text-text/80">
              {name}
            </span>
            {professionalContext && (
              <span
                className="mt-0.5 block truncate text-[10.5px] font-medium text-text-muted"
                data-testid="kanban-card-context"
              >
                {professionalContext}
              </span>
            )}
            {skillsSummary && (
              <span
                className="mt-1 block truncate text-[10px] font-medium text-text-muted/80"
                data-testid="kanban-card-skills"
                title={candidate.top_skills?.join(", ")}
              >
                {skillsSummary}
              </span>
            )}
          </div>
        </div>

        {jobFitScore !== null && jobFitScore !== undefined ? (
          <div
            className="flex shrink-0 flex-col items-end leading-none"
            title={`${Math.round(jobFitScore)}% aderência`}
            data-testid="kanban-card-score"
          >
            <span className={`text-[19px] font-black tracking-tight ${scoreColorClass}`}>
              {Math.round(jobFitScore)}%
            </span>
            <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              aderência
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col items-end leading-none" data-testid="kanban-card-score-empty">
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Sem score
            </span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        {progressLabel && (
          <div
            className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted"
            data-testid="kanban-card-progress"
          >
            <Clock3 className="h-3 w-3 shrink-0 text-text-muted/80" />
            <span className="truncate">{progressLabel}</span>
          </div>
        )}

        {nextAction && (
          <div
            className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-surface-muted/50 px-2 py-1 text-[10px] font-semibold text-text-muted"
            data-testid="kanban-card-next-action"
          >
            {typeof nextAction === "string" ? (
              <span className="truncate">{nextAction}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 truncate">{nextAction}</span>
            )}
          </div>
        )}

        {primaryBadge ? (
          <div className="pt-0.5">
            <span
              className={`inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 text-[9px] font-semibold shadow-sm ${BADGE_TONE_CLASS[primaryBadge.tone]}`}
              title={primaryBadge.reason || primaryBadge.label}
              data-testid="kanban-card-primary-badge"
            >
              {primaryBadge.label}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
});
