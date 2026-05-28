import type {
  CandidatePortalPreAdmissionChecklistItem,
} from "../../../services/candidatePortalService";
import { CandidatePreAdmissionDocumentItem } from "./CandidatePreAdmissionDocumentItem";

interface CandidatePreAdmissionDocumentListProps {
  title: string;
  description?: string;
  emptyMessage: string;
  items: CandidatePortalPreAdmissionChecklistItem[];
  uploadsLocked: boolean;
  uploadingItemId: string | null;
  downloadingDocumentId: string | null;
  testId?: string;
  onUpload: (item: CandidatePortalPreAdmissionChecklistItem, file: File) => void;
  onDownload: (documentId: string, filename: string) => void;
}

export function CandidatePreAdmissionDocumentList({
  title,
  description,
  emptyMessage,
  items,
  uploadsLocked,
  uploadingItemId,
  downloadingDocumentId,
  testId,
  onUpload,
  onDownload,
}: CandidatePreAdmissionDocumentListProps) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-[hsl(var(--border)/0.6)] bg-white p-6 shadow-sm"
    >
      <header>
        <h3 className="text-lg font-bold text-text">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-text-muted">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <CandidatePreAdmissionDocumentItem
              key={item.item_id}
              item={item}
              uploadsLocked={uploadsLocked}
              uploading={uploadingItemId === item.item_id}
              downloading={
                downloadingDocumentId !== null &&
                downloadingDocumentId === item.uploaded_document?.id
              }
              onUpload={onUpload}
              onDownload={onDownload}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
