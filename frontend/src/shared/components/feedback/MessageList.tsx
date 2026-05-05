type MessageListProps = {
  tone: "danger" | "warning";
  title: string;
  items: string[];
};

export function MessageList({ tone, title, items }: MessageListProps) {
  const toneClass =
    tone === "danger"
      ? "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]"
      : "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]";

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
