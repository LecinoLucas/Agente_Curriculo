import { useState } from "react";
import { ChevronRight, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import { DASHBOARD_PENDING_ACTION_LABELS, DASHBOARD_PENDING_ACTION_TONE_CLASSES } from "../../../shared/status/statusLabels";
import type { RhDashboardPendingAction } from "../../../services/rhDashboardService";
import { cn } from "../../../lib/utils";

type Props = {
  actions: RhDashboardPendingAction[];
};

type FilterType = "all" | "interview" | "decision" | "preadmission";

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export function PendingApprovalsCard({ actions }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filteredActions = actions.filter((act) => {
    if (filter === "interview") return act.type.includes("interview");
    if (filter === "decision") return act.type.includes("decision") || act.type.includes("ai");
    if (filter === "preadmission") return act.type.includes("pre_admission") || act.type.includes("document");
    return true;
  });

  return (
    <section className="flex flex-col justify-between rounded-xl border border-border/80 bg-surface p-5 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-text">Pendências do dia</h2>
            {actions.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-extrabold text-white">
                {actions.length}
              </span>
            )}
          </div>
          <Link
            to="/pipeline"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Ver todas
          </Link>
        </div>

        {/* Filter Pills */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
              filter === "all" ? "bg-indigo-600 text-white" : "bg-surface-muted text-text-muted hover:text-text"
            )}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFilter("interview")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
              filter === "interview" ? "bg-indigo-600 text-white" : "bg-surface-muted text-text-muted hover:text-text"
            )}
          >
            Entrevistas
          </button>
          <button
            type="button"
            onClick={() => setFilter("decision")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
              filter === "decision" ? "bg-indigo-600 text-white" : "bg-surface-muted text-text-muted hover:text-text"
            )}
          >
            Decisões
          </button>
          <button
            type="button"
            onClick={() => setFilter("preadmission")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
              filter === "preadmission" ? "bg-indigo-600 text-white" : "bg-surface-muted text-text-muted hover:text-text"
            )}
          >
            Pré-admissão
          </button>
        </div>

        {filteredActions.length === 0 ? (
          <EmptyState
            icon="0"
            title="Nenhuma pendência para hoje."
            description="Tudo certo por enquanto."
          />
        ) : (
          <div className="mt-2 overflow-x-auto" data-testid="rh-pending-list">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-text-muted/70">
                  <th className="py-2.5 px-2">Candidato</th>
                  <th className="py-2.5 px-2">Vaga</th>
                  <th className="py-2.5 px-2">Pendência</th>
                  <th className="py-2.5 px-1 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-xs">
                {filteredActions.slice(0, 5).map((act) => {
                  const initials = getInitials(act.candidate_name) || "C";
                  const pendingLabel = DASHBOARD_PENDING_ACTION_LABELS[act.type] || act.label;
                  const toneClass = DASHBOARD_PENDING_ACTION_TONE_CLASSES[act.type] || "border-border bg-surface-muted text-text-muted";

                  return (
                    <tr key={`${act.type}-${act.candidate_id}-${act.href}`} className="hover:bg-surface-muted/40 transition-colors" data-testid={`rh-pending-${act.type}`}>
                      <td className="py-3 px-2 min-w-[9rem]">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold text-text">
                            {initials}
                          </div>
                          <span className="font-bold text-text truncate">{act.candidate_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-text-muted font-medium min-w-[7rem] truncate">
                        {act.job_title ?? "Sem vaga vinculada"}
                      </td>
                      <td className="py-3 px-2">
                        <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold", toneClass)}>
                          {pendingLabel}
                        </span>
                        {act.label && act.label !== pendingLabel && (
                          <span className="sr-only">{act.label}</span>
                        )}
                      </td>
                      <td className="py-3 px-1 text-right">
                        <Link
                          to={act.href}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          <span>{act.action_label}</span>
                          <ArrowRight className="h-3 w-3 inline" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/70">
        <Link
          to="/pipeline"
          className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <span>Ver todas as pendências</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
