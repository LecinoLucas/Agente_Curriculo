export function NarrativeCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 px-4 py-4">
      <p className="text-sm font-semibold text-[hsl(var(--text))]">{title}</p>
      <p className="mt-3 text-sm leading-6 text-[hsl(var(--text-muted))]">{text}</p>
    </div>
  );
}
