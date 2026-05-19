import { FileText } from "lucide-react";

export function CandidateResumeBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
      <FileText className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
      {count} currículo{count !== 1 ? "s" : ""}
    </span>
  );
}
