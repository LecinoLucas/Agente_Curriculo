import { History } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import type { AdmissionWorkspaceRecentEvent } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import { formatDateTime } from "../utils";

type AdmissionRecentEventsCardProps = {
  events: AdmissionWorkspaceRecentEvent[];
};

export function AdmissionRecentEventsCard({
  events,
}: AdmissionRecentEventsCardProps) {
  return (
    <AdmissionSectionCard
      eyebrow="Histórico"
      title="Eventos recentes"
      description="Auditoria operacional do caso, sem misturar tentativas do ERP."
    >
      {events.length === 0 ? (
        <EmptyState
          icon="🕘"
          title="Sem eventos recentes"
          description="As mudanças mais importantes do caso serão registradas aqui."
        />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <article
              key={event.id}
              className="admission-row flex gap-3 p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent-soft))] text-[hsl(var(--brand-dark))]">
                <History className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">
                    {event.title}
                  </p>
                  <span className="text-xs text-[hsl(var(--text-muted))]">
                    {formatDateTime(event.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                  {event.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
