export function DetailCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/45 px-4 py-4 text-sm text-[hsl(var(--text))]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">{label}</p>
      <div className="mt-3 space-y-1">{children}</div>
    </div>
  );
}
