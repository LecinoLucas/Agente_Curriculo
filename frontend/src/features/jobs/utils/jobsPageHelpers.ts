import type { ActionMenuItem } from "../../../components/common/ActionMenu";
import type { Job } from "../../../types/domain";

export function truncate(value: string, max = 140): string {
  return value.length <= max ? value : `${value.slice(0, max).trim()}…`;
}

export function qualityNeedsAttention(job: Job): boolean {
  return job.quality_status === "weak" || job.quality_status === "acceptable";
}

export function buildJobActionItems(
  job: Job,
  runningAction: string | null,
  onEdit: (jobId: string) => void,
  onPipeline: (jobId: string) => void,
  onPause: (jobId: string) => void,
  onClose: (jobId: string) => void,
  onDelete: (job: Job) => void,
): ActionMenuItem[] {
  const items: ActionMenuItem[] = [
    {
      label: "Editar",
      onClick: () => onEdit(job.id),
    },
    {
      label: "Abrir pipeline",
      onClick: () => onPipeline(job.id),
    },
  ];

  if (job.status === "published") {
    items.push(
      {
        label: "Pausar",
        onClick: () => onPause(job.id),
        disabled: runningAction === `pause:${job.id}`,
      },
      {
        label: "Encerrar",
        onClick: () => onClose(job.id),
        disabled: runningAction === `close:${job.id}`,
      },
    );
  }

  if (job.status === "paused") {
    items.push({
      label: "Encerrar",
      onClick: () => onClose(job.id),
      disabled: runningAction === `close:${job.id}`,
    });
  }

  if (job.status === "draft" || job.status === "cancelled") {
    items.push({
      label: "Excluir",
      tone: "danger" as const,
      onClick: () => onDelete(job),
      disabled: runningAction === `delete:${job.id}`,
    });
  }

  return items;
}
