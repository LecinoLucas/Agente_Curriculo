export type ExtractionStatus = "pending" | "processing" | "completed" | "failed";

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  pending: "Aguardando extração",
  processing: "Extraindo",
  completed: "Extraído",
  failed: "Falha na extração",
};

export function isExtractionInProgress(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

export function isExtractionTerminal(status: string | null | undefined): boolean {
  return status === "completed" || status === "failed";
}

export function getExtractionStatusLabel(status: string | null | undefined): string {
  if (status === "pending" || status === "processing" || status === "completed" || status === "failed") {
    return EXTRACTION_STATUS_LABELS[status];
  }

  return EXTRACTION_STATUS_LABELS.pending;
}
