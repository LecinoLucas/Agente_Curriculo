import { memo, type CSSProperties } from "react";
import type { JobCandidate } from "../../types/domain";
import { formatSeniority } from "../../utils/jobFormatters";
import { Calendar, Mail, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";

interface KanbanCardProps {
  candidate: JobCandidate;
  isSaving: boolean;
  enterDelay: number;
  onCardClick?: (candidateId: string) => void;
  isTopMatch?: boolean;
  rank?: number;
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

// Generate deterministically consistent HSL colors based on the candidate's name
function getAvatarStyles(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return {
    backgroundColor: `hsl(${h}, 65%, 93%)`,
    color: `hsl(${h}, 75%, 34%)`,
    borderColor: `hsl(${h}, 65%, 85%)`,
  };
}

export const KanbanCard = memo(function KanbanCard({
  candidate,
  isSaving,
  enterDelay,
  onCardClick,
  isTopMatch = false,
  rank,
}: KanbanCardProps) {
  const name = candidate.candidate_name || "Sem Nome";
  const initials = getInitials(name);
  const avatarStyle = getAvatarStyles(name);

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

  return (
    <div
      onClick={onCardClick ? () => onCardClick(candidate.candidate_id) : undefined}
      className={[
        "group relative select-none rounded-xl border bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(0,0,0,0.06)]",
        isTopMatch ? "border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/[0.02]" : "border-slate-100",
        isSaving ? "cursor-wait opacity-50" : "cursor-pointer",
        "kanban-card-enter",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--enter-delay": `${enterDelay}ms` } as CSSProperties}
      data-testid={`kanban-card-${candidate.candidate_id}`}
    >
      {/* Header element: Avatar + Name & Rank */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-transform group-hover:scale-105"
          style={avatarStyle}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {rank && rank <= 3 && (
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-black border ${
                  rank === 1 ? "border-amber-200 bg-amber-50 text-amber-700" :
                  rank === 2 ? "border-slate-200 bg-slate-50 text-slate-600" :
                  "border-amber-300/40 bg-orange-50 text-orange-700"
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
            <span className="truncate text-sm font-bold tracking-tight text-slate-800 transition-colors group-hover:text-[hsl(var(--primary))]">
              {name}
            </span>
          </div>
          
          {meta.length > 0 && (
            <p className="mt-1 text-[10px] font-medium text-slate-400">
              {meta.join(" • ")}
            </p>
          )}
        </div>
      </div>

      {/* Origin and Timing line */}
      {(source || dateLabel) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-50 pt-2 text-[9px] font-semibold text-slate-400">
          {source ? (
            <span className="inline-flex items-center rounded bg-slate-100/70 px-1.5 py-0.5 text-slate-500 font-medium">
              {source === "public_application" ? "Candidatura Pública" : source}
            </span>
          ) : (
            <span />
          )}
          {dateLabel && <span>{dateLabel}</span>}
        </div>
      )}

      {/* Top skills tags */}
      {skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded bg-slate-50 border border-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 truncate max-w-[100px] inline-block"
              title={skill}
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Footer block: Match Score and Indicators */}
      <div className="mt-3.5 flex items-center justify-between gap-2.5 border-t border-slate-50 pt-3 min-w-0">
        {isSaving ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-pulse truncate">
            Sincronizando…
          </span>
        ) : (
          <>
            {jobFitScore !== null && jobFitScore !== undefined ? (
              <div className="flex flex-1 items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                  Match
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 min-w-[24px]">
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
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                  Match
                </span>
                <span className="rounded bg-slate-50 border border-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 shrink-0">
                  Pendente
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
                <Mail className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" title="Comunicação ativa" />
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
