import { CheckCircle2, FileUp, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useId, type ChangeEvent } from "react";

import type {
  CandidatePortalPreAdmissionChecklistItem,
} from "../../../services/candidatePortalService";
import {
  REJECTION_FALLBACK_MESSAGE,
  checklistStatusLabel,
  resolveChecklistDisplayStatus,
} from "../preAdmissionLabels";

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

function formatAllowedTypes(mimeTypes: string[] | null | undefined): string {
  const extensions = (mimeTypes ?? [])
    .map((mime) => EXTENSION_BY_MIME[mime])
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(extensions)).join(", ") || "PDF, JPG, PNG";
}

function buildAccept(mimeTypes: string[]): string {
  const collected = new Set<string>();
  mimeTypes.forEach((mime) => {
    collected.add(mime);
    const ext = EXTENSION_BY_MIME[mime];
    if (ext) collected.add(ext);
  });
  return Array.from(collected).join(",") ||
    ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
}

interface CandidatePreAdmissionDocumentItemProps {
  item: CandidatePortalPreAdmissionChecklistItem;
  uploadsLocked: boolean;
  uploading: boolean;
  downloading: boolean;
  onUpload: (item: CandidatePortalPreAdmissionChecklistItem, file: File) => void;
  onDownload: (documentId: string, filename: string) => void;
}

export function CandidatePreAdmissionDocumentItem({
  item,
  uploadsLocked,
  uploading,
  downloading,
  onUpload,
  onDownload,
}: CandidatePreAdmissionDocumentItemProps) {
  const inputId = useId();
  const displayStatus = resolveChecklistDisplayStatus(item);
  const statusLabel = checklistStatusLabel(item);
  const document = item.uploaded_document;
  const canUpload =
    !uploadsLocked && (displayStatus === "pending" || displayStatus === "rejected");
  const ctaLabel = displayStatus === "rejected" ? "Substituir arquivo" : "Enviar documento";

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(item, file);
  };

  const statusIcon =
    displayStatus === "approved" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : displayStatus === "rejected" ? (
      <XCircle className="h-4 w-4 text-red-600" />
    ) : (
      <FileUp className="h-4 w-4 text-[hsl(var(--primary))]" />
    );

  return (
    <li
      data-testid="candidate-pre-admission-document-item"
      data-display-status={displayStatus}
      className="rounded-xl border border-[hsl(var(--border)/0.6)] bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{item.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {item.required ? "Obrigatório" : "Opcional"} ·{" "}
            {formatAllowedTypes(item.allowed_file_types)} até {item.max_file_size_mb}MB
          </p>
          {item.description ? (
            <p className="mt-2 text-sm text-text-muted">{item.description}</p>
          ) : null}

          <div
            className="mt-3 flex items-center gap-2 text-sm"
            data-testid="candidate-pre-admission-document-status"
          >
            {statusIcon}
            <span className="font-medium text-text">{statusLabel}</span>
            {document ? (
              <span className="break-all text-text-muted">
                {document.original_filename}
              </span>
            ) : null}
          </div>

          {displayStatus === "approved" ? (
            <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Documento aprovado pelo RH. Nenhuma ação necessária.
            </p>
          ) : null}

          {displayStatus === "rejected" ? (
            <p
              data-testid="candidate-pre-admission-rejection-reason"
              className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              <span className="font-semibold">Correção solicitada:</span>{" "}
              {item.rejection_reason_public ?? REJECTION_FALLBACK_MESSAGE}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {document ? (
            <button
              type="button"
              onClick={() => onDownload(document.id, document.original_filename)}
              disabled={downloading}
              data-testid="candidate-pre-admission-download"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text hover:bg-surface-muted/50 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Baixar
            </button>
          ) : null}
          {canUpload ? (
            <label
              htmlFor={inputId}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : displayStatus === "rejected" ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {ctaLabel}
              <input
                id={inputId}
                type="file"
                accept={buildAccept(item.allowed_file_types ?? [])}
                className="hidden"
                aria-label={`Enviar documento para ${item.title}`}
                disabled={uploading}
                onChange={handleChange}
              />
            </label>
          ) : null}
        </div>
      </div>
    </li>
  );
}
