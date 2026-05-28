import type { AdmissionWorkspaceRecentEvent } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import { formatDateTime } from "../utils";

type AdmissionRecentEventsCardProps = {
  events: AdmissionWorkspaceRecentEvent[];
};

function eventDotColor(type: string): string {
  if (type.includes("approved") || type.includes("approve") || type.includes("ready")) {
    return "bg-[hsl(var(--success))]";
  }
  if (type.includes("rejected") || type.includes("blocked") || type.includes("cancel")) {
    return "bg-[hsl(var(--danger))]";
  }
  if (type.includes("created") || type.includes("case")) {
    return "bg-[hsl(155_70%_50%)]";
  }
  if (type.includes("updated") || type.includes("checklist")) {
    return "bg-[hsl(var(--warning))]";
  }
  return "bg-[hsl(var(--brand-dark))]";
}

export function AdmissionRecentEventsCard({
  events,
}: AdmissionRecentEventsCardProps) {
  return (
    <AdmissionSectionCard
      title="Histórico recente"
      id="admission-events-section"
    >
      {events.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">
          Nenhum evento recente.
        </p>
      ) : (
        <div className="relative space-y-0">
          {/* Vertical line */}
          <div
            className="absolute left-[7px] top-2 bottom-2 w-px bg-[hsl(var(--border))]/60"
            aria-hidden="true"
          />

          {events.map((event, index) => (
            <div
              key={event.id}
              className={`relative flex gap-4 pb-4 ${index === events.length - 1 ? "pb-0" : ""}`}
            >
              {/* Timeline dot */}
              <div className="relative z-10 mt-1 shrink-0">
                <span
                  className={`block h-3.5 w-3.5 rounded-full ring-2 ring-[hsl(var(--surface))] ${eventDotColor(event.type)}`}
                  aria-hidden="true"
                />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-semibold text-text">
                    {event.title}
                  </p>
                  <time
                    className="shrink-0 text-[10px] text-text-muted"
                    dateTime={event.created_at}
                  >
                    {formatDateTime(event.created_at)}
                  </time>
                </div>
                {event.description ? (
                  <p className="mt-0.5 text-xs text-text-muted leading-relaxed">
                    {event.description}
                  </p>
                ) : null}
                {event.actor_name ? (
                  <p className="mt-1 text-[11px] font-medium text-text-muted">
                    por {event.actor_name}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
