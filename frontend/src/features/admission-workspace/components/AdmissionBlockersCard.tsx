import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AdmissionWorkspaceBlocker } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import { blockerBadgeVariant } from "../utils";

type AdmissionBlockersCardProps = {
  blockers: AdmissionWorkspaceBlocker[];
};

export function AdmissionBlockersCard({
  blockers,
}: AdmissionBlockersCardProps) {
  return (
    <AdmissionSectionCard
      eyebrow="Pendências"
      title="Bloqueios principais"
      description="Itens que impedem a liberação operacional do caso."
    >
      {blockers.length === 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-[hsl(var(--success))]" />
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--text))]">
              Sem pendências críticas
            </p>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              O checklist obrigatório está consistente para a próxima etapa.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {blockers.map((blocker) => (
            <article
              key={`${blocker.type}-${blocker.title}`}
              className="admission-row p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-[hsl(var(--danger))]" />
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">
                      {blocker.title}
                    </p>
                    <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                      {blocker.description}
                    </p>
                  </div>
                </div>
                <Badge variant={blockerBadgeVariant(blocker.severity)}>
                  {blocker.severity}
                </Badge>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
