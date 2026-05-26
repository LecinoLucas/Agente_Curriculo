import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AdmissionWorkspaceDocument } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import {
  documentStatusLabel,
  documentTypeLabel,
  formatDateTime,
  statusBadgeVariant,
} from "../utils";

type AdmissionDocumentsCardProps = {
  documents: AdmissionWorkspaceDocument[];
};

export function AdmissionDocumentsCard({
  documents,
}: AdmissionDocumentsCardProps) {
  return (
    <AdmissionSectionCard
      title="Documentos enviados"
      id="admission-documents-section"
    >
      {documents.length === 0 ? (
        <p className="py-2 text-sm text-[hsl(var(--text-muted))]">
          Nenhum documento enviado ainda.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex flex-col gap-1.5 rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--surface))] p-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.5)]"
            >
              <div className="flex items-start gap-2">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--danger-soft))]"
                  aria-hidden="true"
                >
                  <FileText className="h-4 w-4 text-[hsl(var(--danger))]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[hsl(var(--text))]">
                    {document.filename}
                  </p>
                  <p className="truncate text-[10px] text-[hsl(var(--text-muted))]">
                    {documentTypeLabel(document.document_type)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[hsl(var(--text-muted))]">
                  {formatDateTime(document.uploaded_at)}
                </span>
                <Badge variant={statusBadgeVariant(document.status)} className="text-[10px]">
                  {documentStatusLabel(document.status)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
