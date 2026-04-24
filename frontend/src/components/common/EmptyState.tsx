type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  note?: string;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ icon = "◯", title, description, note, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon-wrap">
        <span className="empty-state-icon">{icon}</span>
      </span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {note ? <span className="empty-state-note">{note}</span> : null}
      {action && (
        <button className="btn" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
