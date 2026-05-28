type ReviewItemProps = {
  label: string;
  value: string;
};

export function ReviewItem({ label, value }: ReviewItemProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted/35 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 text-sm text-text">{value}</p>
    </div>
  );
}
