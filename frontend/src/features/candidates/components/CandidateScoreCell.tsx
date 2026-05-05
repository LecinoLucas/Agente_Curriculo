export function CandidateScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="ui-text-muted text-xs">—</span>;
  const rounded = Math.round(score);
  const cls =
    rounded >= 80
      ? "text-[hsl(var(--success))] font-semibold"
      : rounded >= 60
        ? "text-[hsl(var(--warning))] font-semibold"
        : "text-[hsl(var(--danger))] font-semibold";
  return <span className={`text-sm ${cls}`}>{rounded}</span>;
}
