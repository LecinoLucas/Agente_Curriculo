type MessageListProps = {
  tone: "danger" | "warning";
  title: string;
  items: string[];
};

export function MessageList({ tone, title, items }: MessageListProps) {
  const toneClass =
    tone === "danger"
      ? "border-[hsl(var(--danger))]/20 bg-danger-soft text-danger"
      : "border-[hsl(var(--warning))]/20 bg-warning-soft text-warning";

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
