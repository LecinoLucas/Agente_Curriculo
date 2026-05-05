export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: "Aguardando", cls: "ui-badge-neutral" },
  processing: { label: "Processando", cls: "ui-badge-info" },
  completed: { label: "Concluída", cls: "ui-badge-success" },
  failed: { label: "Falhou", cls: "ui-badge-danger" },
  cancelled: { label: "Cancelado", cls: "ui-badge-warning" },
};

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}
