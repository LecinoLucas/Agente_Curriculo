export const AI_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluída", cls: "ui-badge-success" },
  processing: { label: "Processando", cls: "ui-badge-info" },
  retry_scheduled: { label: "Nova tentativa agendada", cls: "ui-badge-info" },
  pending: { label: "Aguardando", cls: "ui-badge-warning" },
  failed: { label: "Falhou", cls: "ui-badge-danger" },
  cancelled: { label: "Cancelado", cls: "ui-badge-neutral" },
};

export function formatCandidateDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
