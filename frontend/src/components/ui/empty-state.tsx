import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  note?: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  className?: string;
}

export function EmptyState({ icon = "◯", title, description, note, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16 px-6 text-center", className)}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted text-2xl text-text-muted">
        {icon}
      </span>
      <strong className="text-base font-semibold text-text">{title}</strong>
      {description ? <p className="text-sm text-text-muted max-w-sm">{description}</p> : null}
      {note ? <span className="text-xs text-text-muted">{note}</span> : null}
      {action ? (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          className="mt-1"
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
