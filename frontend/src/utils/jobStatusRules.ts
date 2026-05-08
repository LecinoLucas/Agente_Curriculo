export function isPipelineOperationalJob(status: string | null | undefined): boolean {
  return status === "published" || status === "paused";
}

export function isTransferTargetJob(status: string | null | undefined): boolean {
  return status === "published";
}
