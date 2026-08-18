import { ChevronRight, User } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import type { InterviewSchedule } from "../../../types/agenda";
import { INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS } from "../../../shared/status/statusLabels";
import { cn } from "../../../lib/utils";

type Props = {
  interviews: InterviewSchedule[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export function UpcomingInterviewsCard({ interviews, loading, error, onRetry }: Props) {
  return (
    <section className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface p-5 shadow-xs" data-testid="rh-upcoming-interviews">
      <div>
        <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
          <h2 className="text-base font-bold tracking-tight text-text">Próximas entrevistas</h2>
          <Link
            to="/agenda"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Ver agenda
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-surface-muted" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon="!"
            title="Não foi possível carregar a agenda."
            description="Tente novamente em instantes."
            action={{ label: "Tentar novamente", onClick: onRetry }}
          />
        ) : interviews.length === 0 ? (
          <EmptyState
            icon="0"
            title="Nenhuma entrevista agendada."
            description="Agende uma entrevista na agenda para acompanhá-la aqui."
          />
        ) : (
          <div className="mt-3 divide-y divide-border/60">
            {interviews.map((item) => {
              const initials = getInitials(item.candidate_name) || "C";
              const time = formatTime(item.scheduled_start);
              const statusLabel = INTERVIEW_STATUS_LABELS[item.status] || item.status;
              const typeLabel = INTERVIEW_TYPE_LABELS[item.interview_type] || "Entrevista";

              const statusTone = item.status === "scheduled"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200"
                : item.status === "completed"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200";

              return (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3 first:pt-1 last:pb-1" data-testid={`rh-upcoming-interview-${item.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Time Badge */}
                    <div className="flex flex-col items-center justify-center shrink-0 w-12 text-left">
                      <span className="text-sm font-extrabold text-text">{time}</span>
                    </div>

                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-bold text-text">
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-text truncate">{item.candidate_name}</p>
                      <p className="text-[11px] text-text-muted truncate">{item.job_title ?? "Sem vaga vinculada"}</p>
                      <p className="text-[10px] font-medium text-text-muted/80 truncate">{typeLabel}</p>
                    </div>
                  </div>

                  {/* Right side status and interviewer */}
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold", statusTone)}>
                      {statusLabel}
                    </span>
                    {item.interviewer_name && (
                      <div className="flex items-center gap-1 text-[10px] text-text-muted">
                        <User className="h-3 w-3" />
                        <span>{item.interviewer_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/70">
        <Link
          to="/agenda"
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <span>Ver todas as entrevistas</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
