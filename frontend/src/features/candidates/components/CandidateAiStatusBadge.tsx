import { AI_STATUS_CONFIG } from "../utils/candidateFormatters";

export function CandidateAiStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  const c = AI_STATUS_CONFIG[status] ?? { label: status, cls: "bg-surface-muted text-text-muted border border-border px-2 py-0.5 rounded-full text-xs font-medium" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}
