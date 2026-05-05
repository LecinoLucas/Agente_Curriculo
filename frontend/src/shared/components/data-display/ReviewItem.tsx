type ReviewItemProps = {
  label: string;
  value: string;
};

export function ReviewItem({ label, value }: ReviewItemProps) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">{label}</p>
      <p className="mt-2 text-sm text-[hsl(var(--text))]">{value}</p>
    </div>
  );
}
