import { type ReactNode } from "react";
import { formatScorePercent, getScoreTone } from "../../utils/scoreFormatting";

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function StatusCard({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-text">{title}</p>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </div>
  );
}

export function DecisionCard({
  label,
  value,
  description,
  valueClassName,
}: {
  label: string;
  value: string;
  description: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className={["mt-1 text-lg font-extrabold tabular-nums text-text", valueClassName ?? ""].join(" ")}>
        {value}
      </p>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
    </div>
  );
}

function scoreColorClass(value: number | null | undefined): string {
  const tone = getScoreTone(value);
  if (tone === "high") return "text-green-600";
  if (tone === "mid") return "text-amber-600";
  if (tone === "low") return "text-red-600";
  return "text-gray-500";
}

export function BreakdownItem({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface-muted px-3 py-2">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={["text-xs font-semibold tabular-nums", scoreColorClass(value)].join(" ")}>
        {formatScorePercent(value)}
      </span>
    </div>
  );
}

export function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-sm text-text">{value}</div>
    </div>
  );
}

export function DangerZone({
  title,
  description,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-semibold text-red-700">{title}</p>
      <p className="mt-1 text-xs text-red-700">{description}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
        >
          {loading ? "Salvando…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function EmptyTab({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-border bg-surface-muted text-center",
        compact ? "px-4 py-4" : "mx-5 my-5 px-5 py-8",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-2 text-sm text-text-muted">{description}</p>
    </div>
  );
}
