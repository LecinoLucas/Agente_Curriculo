import {
  CheckCircle2,
  Database,
  ExternalLink,
  ListChecks,
  MessageSquare,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { AdmissionWorkspaceNextAction } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";

type AdmissionNextActionsCardProps = {
  actions: AdmissionWorkspaceNextAction[];
  integrationHref: string;
  onOpenChecklist: () => void;
};

function actionIcon(type: string) {
  if (type === "open_protheus_integration") {
    return <Database className="h-5 w-5" aria-hidden="true" />;
  }
  if (type === "approve_document") {
    return <CheckCircle2 className="h-5 w-5" aria-hidden="true" />;
  }
  if (type === "request_correction") {
    return <MessageSquare className="h-5 w-5" aria-hidden="true" />;
  }
  return <ListChecks className="h-5 w-5" aria-hidden="true" />;
}

function actionSubtitle(type: string, label: string, disabledReason?: string | null): string {
  if (disabledReason) return disabledReason;
  const subtitles: Record<string, string> = {
    open_protheus_integration: "Preparar exportação",
    approve_document: "Revisar e aprovar",
    request_correction: "Enviar para o candidato",
  };
  return subtitles[type] ?? label;
}

export function AdmissionNextActionsCard({
  actions,
  integrationHref,
  onOpenChecklist,
}: AdmissionNextActionsCardProps) {
  return (
    <AdmissionSectionCard title="Próximas ações">
      {actions.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">
          Nenhuma ação disponível no momento.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {actions.map((action) => {
            const subtitle = actionSubtitle(action.type, action.label, action.disabled_reason);
            const icon = actionIcon(action.type);

            if (action.type === "open_protheus_integration") {
              if (!action.enabled) {
                return (
                  <div
                    key={action.type}
                    title={action.disabled_reason ?? undefined}
                    className="flex cursor-not-allowed items-center gap-3 rounded-xl border border-border/70 bg-surface-muted/40 p-3.5 opacity-60"
                    aria-disabled="true"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-text-muted">
                      {icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">
                        {action.label}
                      </p>
                      <p className="text-xs text-text-muted">{subtitle}</p>
                    </div>
                    <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  </div>
                );
              }

              return (
                <Link
                  key={action.type}
                  to={integrationHref}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface p-3.5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.6)] transition-colors hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--accent-soft))]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent-soft))] text-[hsl(var(--brand-dark))]">
                    {icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">
                      {action.label}
                    </p>
                    <p className="text-xs text-text-muted">{subtitle}</p>
                  </div>
                  <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                </Link>
              );
            }

            // All other actions scroll to checklist
            return (
              <button
                key={action.type}
                type="button"
                onClick={onOpenChecklist}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface p-3.5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.6)] text-left transition-colors hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--accent-soft))]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent-soft))] text-[hsl(var(--brand-dark))]">
                  {icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">
                    {action.label}
                  </p>
                  <p className="text-xs text-text-muted">{subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
