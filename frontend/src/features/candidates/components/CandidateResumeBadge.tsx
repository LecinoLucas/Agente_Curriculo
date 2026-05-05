export function CandidateResumeBadge({ count }: { count: number }) {
  if (count === 0) return <span className="ui-text-muted text-xs">—</span>;
  return (
    <span className="ui-badge-info inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      {count} currículo{count !== 1 ? "s" : ""}
    </span>
  );
}
