import { History } from "lucide-react";

import type { PreAdmissionEvent } from "../../../../types/domain";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(value: string): string {
  const labels: Record<string, string> = {
    case_created: "Caso criado",
    case_updated: "Caso atualizado",
    status_changed: "Status alterado",
    checklist_item_created: "Item criado",
    checklist_item_updated: "Item atualizado",
  };
  return labels[value] ?? value;
}

interface PreAdmissionEventTimelineProps {
  events: PreAdmissionEvent[];
}

export function PreAdmissionEventTimeline({ events }: PreAdmissionEventTimelineProps) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-[hsl(var(--primary))]" />
        <h3 className="text-base font-semibold text-text">Timeline de eventos</h3>
      </div>

      {events.length === 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted/30 p-4 text-sm text-text-muted">
          Nenhum evento registrado.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border border-border bg-surface-muted/20 p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium text-text">{eventLabel(event.event_type)}</div>
                <div className="text-xs text-text-muted">{formatDate(event.created_at)}</div>
              </div>
              {event.payload_json ? (
                <pre className="mt-2 max-h-28 overflow-auto rounded-md bg-white/80 p-2 text-xs text-text-muted">
                  {JSON.stringify(event.payload_json, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
