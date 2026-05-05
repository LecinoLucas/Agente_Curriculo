import { formatErrorDetails, getBackendDetail, handleApiError } from "../../../shared/utils/errorHandler";
import { formatFieldLabel } from "./jobFormHelpers";

export function extractPublication422Details(error: unknown): string[] {
  const friendly = handleApiError(error);
  const fallback = formatErrorDetails(friendly);
  const detail = getBackendDetail(error);
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return fallback;
  }

  const detailRecord = detail as Record<string, unknown>;
  if (Array.isArray(detailRecord.missing_fields)) {
    return detailRecord.missing_fields.map((field) => formatFieldLabel(String(field)));
  }

  return fallback;
}
