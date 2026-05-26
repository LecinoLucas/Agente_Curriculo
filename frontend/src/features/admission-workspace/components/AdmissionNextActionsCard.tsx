import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import type { AdmissionWorkspaceNextAction } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";

type AdmissionNextActionsCardProps = {
  actions: AdmissionWorkspaceNextAction[];
  integrationHref: string;
  onOpenChecklist: () => void;
};

export function AdmissionNextActionsCard({
  actions,
  integrationHref,
  onOpenChecklist,
}: AdmissionNextActionsCardProps) {
  return (
    <AdmissionSectionCard
      eyebrow="Próximas ações"
      title="Sugestões operacionais"
      description="Atalhos do workspace para o próximo passo mais provável."
    >
      <div className="space-y-3">
        {actions.map((action) => {
          if (action.type === "open_protheus_integration") {
            return action.enabled ? (
              <Link
                key={action.type}
                to={integrationHref}
                className="ui-btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
              >
                <ExternalLink className="h-4 w-4" />
                {action.label}
              </Link>
            ) : (
              <button
                key={action.type}
                type="button"
                disabled
                title={action.disabled_reason ?? undefined}
                className="ui-btn-secondary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold opacity-60"
              >
                <ExternalLink className="h-4 w-4" />
                {action.label}
              </button>
            );
          }

          return (
            <button
              key={action.type}
              type="button"
              onClick={onOpenChecklist}
              className="ui-btn-secondary inline-flex min-h-11 w-full items-center justify-between rounded-lg px-4 text-sm font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                {action.label}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </AdmissionSectionCard>
  );
}
