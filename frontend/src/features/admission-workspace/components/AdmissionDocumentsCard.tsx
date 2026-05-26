import { FileText } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
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
      eyebrow="Documentos"
      title="Arquivos enviados"
      description="Últimos documentos ativos vinculados ao checklist admissional."
      id="admission-documents-section"
    >
      {documents.length === 0 ? (
        <EmptyState
          icon="📄"
          title="Nenhum documento enviado"
          description="Os arquivos do candidato aparecem aqui assim que forem enviados."
        />
      ) : (
        <div className="space-y-3">
          {documents.map((document) => (
            <article
              key={document.id}
              className="admission-row flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[hsl(var(--brand-dark))]" />
                  <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">
                    {document.filename}
                  </p>
                </div>
                <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                  {documentTypeLabel(document.document_type)}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[hsl(var(--text-muted))]">
                  <span>Enviado em {formatDateTime(document.uploaded_at)}</span>
                  {document.approved_at ? (
                    <span>Aprovado em {formatDateTime(document.approved_at)}</span>
                  ) : null}
                </div>
              </div>
              <Badge variant={statusBadgeVariant(document.status)}>
                {documentStatusLabel(document.status)}
              </Badge>
            </article>
          ))}
        </div>
      )}
    </AdmissionSectionCard>
  );
}
