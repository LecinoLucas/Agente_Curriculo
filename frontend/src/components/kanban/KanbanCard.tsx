import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";
import { Calendar, Mail, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
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

  const skills = (candidate.top_skills ?? []).slice(0, 2); // Show max 2 top skills for space
  const jobFitScore = candidate.job_fit_score;
  const seniority = candidate.seniority_level ? formatSeniority(candidate.seniority_level) : null;
  const experience =
    typeof candidate.total_experience_years === "number"
      ? `${candidate.total_experience_years} ano${candidate.total_experience_years === 1 ? "" : "s"}`
      : null;
  const meta = [seniority, experience].filter(Boolean);

  // Cast candidate to any to check for optionally populated values (source/origem/updated_at) without breaking types
  const rawCandidate = candidate as any;
  const source = rawCandidate.application_source_label || rawCandidate.application_source || rawCandidate.source || null;
  const dateLabel = rawCandidate.updated_at
    ? new Date(rawCandidate.updated_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    : null;

  // Derive indicators based on actual candidate data
  const hasScheduledInterview = candidate.stage === "hr_interview" || candidate.stage === "technical_interview";
  const assessmentCompleted = candidate.ai_status === "completed";
  const hasWarning = rawCandidate.candidate_status === "blocked" || rawCandidate.candidate_status === "error";
  const operationalBadges = derivePipelineCardBadges(candidate);
  const aiProcessingState = getAiProcessingState(candidate);
  const stageSubstatus = candidate.stage ? PIPELINE_STAGE_SUBSTATUS_LABEL[candidate.stage] : null;
  const stageSummary = candidate.stage ? PIPELINE_STAGE_OPERATIONAL_SUMMARY[candidate.stage] : null;

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
        "group relative w-full select-none rounded-xl bg-white dark:bg-slate-900 p-3.5 pb-4 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md overflow-hidden",
        isTopMatch ? "border border-[#C1121F]/20" : "border border-slate-100 dark:border-slate-800",
        isSaving ? "cursor-wait opacity-50" : "cursor-pointer",
        draggable ? "active:cursor-grabbing" : "",
        isDragging ? "opacity-55 ring-2 ring-[#C1121F]/15" : "",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
      data-testid={`kanban-card-${candidate.candidate_id}`}
      data-dragging={isDragging ? "true" : "false"}
    >
      {/* Top Row: Name and Adesão Badge */}
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[13px] font-bold tracking-tight text-slate-800 dark:text-slate-100 transition-colors group-hover:text-[#C1121F]">
          {name}
        </span>
        
        {jobFitScore !== null && jobFitScore !== undefined ? (
          <span className="shrink-0 rounded-md bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-black tracking-tight text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-sm">
            {Math.round(jobFitScore)}%
          </span>
        ) : aiProcessingState ? (
          <span className="shrink-0 rounded bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200 dark:border-slate-700">
            Pendente
          </span>
        ) : null}
      </div>

      {/* Middle Row: Time and Tag */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-medium">
            {stageSubstatus ? stageSubstatus : (dateLabel ? `Vinculado há ${dateLabel}` : "Recentemente")}
          </span>
        </div>
        
        {source && (
          <span className="shrink-0 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {source === "public_application" ? "Pública" : source}
          </span>
        )}
      </div>

      {/* Operational badges row */}
      {operationalBadges.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {operationalBadges.map((badge) => (
            <span
              key={badge.label}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_TONE_CLASS[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* Bottom Color Bar Indicator */}
      <div
        className="absolute bottom-0 left-0 h-1 w-full"
        style={{
          background: isTopMatch 
            ? "linear-gradient(90deg, #C1121F 0%, #E85D04 100%)" 
            : "linear-gradient(90deg, #10B981 0%, #34D399 100%)"
        }}
      />
    </div>
  );
});
