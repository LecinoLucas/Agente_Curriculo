import { UserRound } from "lucide-react";

export function EmptyBlock({
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
      <UserRound className="mx-auto h-8 w-8 text-text-muted" />
      <p className="mt-3 font-bold text-text">{title}</p>
      <p className="mt-1 text-sm text-text-muted">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className="mt-4 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border)/0.7)] bg-surface p-5 shadow-sm">
      <h2 className="mb-4 text-base font-bold text-text">{title}</h2>
      {children}
    </section>
  );
}

export function DefinitionList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="space-y-3 text-sm">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-[hsl(var(--border)/0.45)] pb-3 last:border-0 last:pb-0"
        >
          <dt className="text-text-muted">{label}</dt>
          <dd className="text-right font-semibold text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActionButton({
  children,
  onClick,
  disabled = false,
  primary = false,
  dataTestId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  dataTestId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary)/0.9)]"
          : "border border-border bg-surface text-text hover:bg-surface-muted",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "success" | "neutral" | "info" | "primary" | "danger";
  children: React.ReactNode;
}) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    neutral: "border-border bg-surface-muted text-text-muted",
    info: "border-blue-200 bg-blue-50 text-blue-700",
    primary: "border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${classes[tone]}`}>
      {children}
    </span>
  );
}

export function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[hsl(var(--border)/0.7)] bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-muted">{title}</h2>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </article>
  );
}
