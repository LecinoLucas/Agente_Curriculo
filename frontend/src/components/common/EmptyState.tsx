import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  note?: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
};

export function EmptyState({ icon = "◯", title, description, note, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-2xl">
        {icon}
      </span>
      <strong className="text-base font-semibold text-foreground">{title}</strong>
      {description ? <p className="text-sm text-muted-foreground max-w-sm">{description}</p> : null}
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
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
