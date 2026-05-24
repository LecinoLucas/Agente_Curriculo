import { memo, type CSSProperties, type DragEvent } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";
import { Calendar, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  derivePipelineCardBadges,
  type PipelineCardBadgeTone,
} from "../../features/pipeline/utils/pipelineCardBadges";

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
    "bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))] border-[hsl(var(--warning-soft))/80]",
    "bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))] border-[hsl(var(--border))/20]"
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

  if (status === "pending" || status === "queued" || status === "retry_scheduled") {
    return { label: "IA na fila", tone: "pending" };
  }

  if (status === "processing") {
    return { label: "IA analisando", tone: "processing" };
  }

  return null;
}

const BADGE_TONE_CLASS: Record<PipelineCardBadgeTone, string> = {
  danger: "bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))] border border-[hsl(var(--danger-soft))/80]",
  warning: "bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))] border border-[hsl(var(--warning-soft))/80]",
  progress: "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent-foreground))] border border-[hsl(var(--accent-soft))/80]",
  success: "bg-[hsl(var(--success-soft))] text-[hsl(var(--success))] border border-[hsl(var(--success-soft))/80]",
  neutral: "bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))] border border-[hsl(var(--border))/20]",
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
        "group relative w-full select-none rounded-xl border bg-white dark:bg-[hsl(var(--card))] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(0,0,0,0.06)]",
        isTopMatch ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/[0.02]" : "border-[hsl(var(--border))]/40 dark:border-slate-800/80",
        isSaving ? "cursor-wait opacity-50" : "cursor-pointer",
        draggable ? "active:cursor-grabbing" : "",
        isDragging ? "opacity-55 ring-2 ring-[hsl(var(--primary))]/15" : "",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
      data-testid={`kanban-card-${candidate.candidate_id}`}
      data-dragging={isDragging ? "true" : "false"}
    >
      {/* Header element: Avatar + Name & Rank */}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-transform group-hover:scale-105 ${avatarClass}`}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {rank && rank <= 3 && (
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-black border ${
                  rank === 1 ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400" :
                  rank === 2 ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400" :
                  "border-amber-300/40 bg-orange-50 text-orange-700 dark:border-amber-900/40 dark:bg-orange-950/40 dark:text-orange-400"
                }`}
              >
                {rank}
              </span>
            )}
            {isTopMatch && !rank && (
              <span className="rounded bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                Mais aderente
              </span>
            )}
            <span className="truncate text-sm font-bold tracking-tight text-[hsl(var(--text))] transition-colors group-hover:text-[hsl(var(--primary))]">
              {name}
            </span>
          </div>
          
          {meta.length > 0 && (
            <p className="mt-1 text-[10px] font-medium text-[hsl(var(--text-muted))]">
              {meta.join(" • ")}
            </p>
          )}
        </div>
      </div>

      {/* Origin and Timing line */}
      {(source || dateLabel) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[hsl(var(--border))]/40 dark:border-slate-800/80 pt-2 text-[9px] font-semibold text-[hsl(var(--text-muted))]">
          {source ? (
            <span className="inline-flex items-center rounded bg-[hsl(var(--surface-muted))] px-1.5 py-0.5 text-[hsl(var(--text-muted))] font-medium">
              {source === "public_application" ? "Candidatura Pública" : source}
            </span>
          ) : (
            <span />
          )}
          {dateLabel && <span>{dateLabel}</span>}
        </div>
      )}

      {/* Top skills tags */}
      {operationalBadges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {operationalBadges.map((badge) => (
            <span
              key={badge.label}
              className={[
                "inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[9px] font-black uppercase",
                BADGE_TONE_CLASS[badge.tone],
              ].join(" ")}
              title={badge.reason ?? badge.label}
              data-testid={`pipeline-card-badge-${badge.label}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {aiProcessingState ? (
        <div className="mt-3">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase",
              aiProcessingState.tone === "processing"
                ? "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
            ].join(" ")}
            data-testid="kanban-ai-status-badge"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            {aiProcessingState.label}
          </span>
        </div>
      ) : null}

      {skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded bg-[hsl(var(--surface-muted))] border border-[hsl(var(--border))]/40 dark:border-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))] truncate max-w-[100px] inline-block"
              title={skill}
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Footer block: Match Score and Indicators */}
      <div className="mt-3.5 flex items-center justify-between gap-2.5 border-t border-[hsl(var(--border))]/40 dark:border-slate-800/80 pt-3 min-w-0">
        {isSaving ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))] animate-pulse truncate">
            Sincronizando…
          </span>
        ) : (
          <>
            {jobFitScore !== null && jobFitScore !== undefined ? (
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] shrink-0">
                  Match
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--surface-muted))] min-w-[24px]">
                  <div
                    className="h-full bg-[hsl(var(--primary))] transition-all duration-500"
                    style={{ width: `${Math.round(jobFitScore)}%` }}
                  />
                </div>
                <span className="text-xs font-black tabular-nums text-[hsl(var(--primary))] shrink-0">
                  {Math.round(jobFitScore)}%
                </span>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))] shrink-0">
                  Match
                </span>
                <span className="rounded bg-[hsl(var(--surface-muted))] border border-[hsl(var(--border))]/40 px-1.5 py-0.5 text-[9px] font-bold text-[hsl(var(--text-muted))] shrink-0">
                  {aiProcessingState ? "Aguardando IA" : "Pendente"}
                </span>
              </div>
            )}

            {/* Micro indicators icons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {hasScheduledInterview && (
                <Calendar className="h-3.5 w-3.5 text-indigo-500" title="Entrevista agendada" />
              )}
              {assessmentCompleted && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" title="Avaliação concluída" />
              )}
              {candidate.email && (
                <Mail className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400" title="Comunicação active" />
              )}
              {hasWarning && (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 animate-pulse" title="Alerta do sistema" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
