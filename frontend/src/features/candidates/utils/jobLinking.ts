import type { Job } from "../../../types/domain";

const LINKABLE_JOB_STATUSES = new Set(["published", "paused"]);

export function isLinkableJobStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return LINKABLE_JOB_STATUSES.has(status);
}

export function getJobStatusLabel(status: string | null | undefined): string {
  if (status === "published") return "Publicada";
  if (status === "paused") return "Pausada";
  if (status === "draft") return "Rascunho";
  if (status === "closed") return "Encerrada";
  if (status === "cancelled") return "Cancelada";
  if (status === "archived") return "Arquivada";
  return status?.trim() ? status : "Indefinido";
}

export function getLinkCandidateCtaLabel(linkedJobsCount: number): string {
  return linkedJobsCount > 0 ? "Vincular nova vaga" : "Vincular vaga";
}

export function getLinkableJobs(jobs: Job[], linkedJobIds: string[] = []): Job[] {
  const linkedIds = new Set(linkedJobIds);

  return jobs
    .filter((job) => isLinkableJobStatus(job.status))
    .filter((job) => !linkedIds.has(job.id))
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.title.localeCompare(right.title, "pt-BR", { sensitivity: "base" });
      }

      if (left.status === "published") return -1;
      if (right.status === "published") return 1;
      return left.status.localeCompare(right.status);
    });
}
