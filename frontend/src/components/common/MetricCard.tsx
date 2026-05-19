import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number | string;
  icon: ElementType;
  iconClassName?: string;
  description?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  description,
  action,
  className,
}: MetricCardProps) {
  return (
    <div className={cn("rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 shadow-xs", className)}>
      <div className="flex items-start gap-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconClassName)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">{label}</span>
          <h3 className="mt-0.5 text-2xl font-bold text-[hsl(var(--text))]">{value}</h3>
          {description ? <div className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--text-muted))]">{description}</div> : null}
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-2 text-xs font-bold text-[hsl(var(--primary))] hover:underline"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
