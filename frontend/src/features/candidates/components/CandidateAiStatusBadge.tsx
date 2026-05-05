import { AI_STATUS_CONFIG } from "../utils/candidateFormatters";

export function CandidateAiStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="ui-text-muted text-xs">—</span>;
  const c = AI_STATUS_CONFIG[status] ?? { label: status, cls: "ui-badge-neutral" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}
