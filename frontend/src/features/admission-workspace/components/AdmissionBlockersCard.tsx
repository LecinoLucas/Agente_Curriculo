import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import type { AdmissionWorkspaceBlocker } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";

type AdmissionBlockersCardProps = {
  blockers: AdmissionWorkspaceBlocker[];
  onOpenChecklist?: () => void;
};

function blockerActionLabel(action: string): string {
  const labels: Record<string, string> = {
    request_document: "Solicitar agora",
    request_bank_data: "Enviar solicitação",
    open_checklist: "Ver checklist",
    review_checklist: "Ver checklist",
    complete_checklist: "Ver checklist",
  };
  return labels[action] ?? "Ver checklist";
}

function blockerSeverityColor(severity: string): {
  bg: string;
  border: string;
  icon: string;
  btn: string;
} {
  if (severity === "high") {
    return {
      bg: "bg-[hsl(var(--danger-soft))]",
      border: "border-[hsl(var(--danger))]/20",
      icon: "text-[hsl(var(--danger))]",
      btn: "border-[hsl(var(--danger))]/30 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger-soft))]",
    };
  }
  return {
    bg: "bg-[hsl(var(--warning-soft))]",
    border: "border-[hsl(var(--warning))]/20",
    icon: "text-[hsl(var(--warning))]",
    btn: "border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning-soft))]",
  };
}

export function AdmissionBlockersCard({
  blockers,
  onOpenChecklist,
}: AdmissionBlockersCardProps) {
  return (
    <AdmissionSectionCard title="Pendências principais">
      {blockers.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] p-4">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--text))]">
              Sem pendências críticas
            </p>
            <p className="mt-0.5 text-sm text-[hsl(var(--text-muted))]">
              O checklist obrigatório está consistente para a próxima etapa.
            </p>
          </div>
          <CheckCircle2
            className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--success))]"
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {blockers.map((blocker) => {
            const colors = blockerSeverityColor(blocker.severity);
            const actionLabel = blockerActionLabel(blocker.action);

            return (
              <div
                key={`${blocker.type}-${blocker.title}`}
                className={`flex items-center gap-3 rounded-xl border p-3.5 ${colors.bg} ${colors.border}`}
              >
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${colors.icon}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">
                    {blocker.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">
                    {blocker.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenChecklist}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${colors.btn}`}
                >
                  {actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
