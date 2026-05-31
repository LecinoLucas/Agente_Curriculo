import { CheckCircle2, Clock, XCircle, AlertCircle, FileText } from 'lucide-react';
import type { DocumentItem, DocumentStatus } from '../../types/candidatePortal';
import { Badge } from '../ui/Badge';
import { UploadMockCard } from './UploadMockCard';

interface DocumentChecklistProps {
  documents: DocumentItem[];
  onDocumentUploaded: (docId: string, fileName: string) => void;
}

const statusConfig: Record<
  DocumentStatus,
  { icon: React.ComponentType<{ className?: string }>; label: string; badgeVariant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  aprovado: { icon: CheckCircle2, label: 'Aprovado', badgeVariant: 'success' },
  enviado: { icon: Clock, label: 'Em análise', badgeVariant: 'warning' },
  rejeitado: { icon: XCircle, label: 'Rejeitado', badgeVariant: 'danger' },
  pendente: { icon: AlertCircle, label: 'Pendente', badgeVariant: 'neutral' },
};

export function DocumentChecklist({ documents, onDocumentUploaded }: DocumentChecklistProps) {
  return (
    <div className="space-y-3">
      {documents.map((doc) => {
        const config = statusConfig[doc.status];
        const StatusIcon = config.icon;
        const showUpload = doc.status === 'pendente' || doc.status === 'rejeitado';

        return (
          <div
            key={doc.id}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <FileText className="h-5 w-5 text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{doc.name}</span>
                    {doc.required && (
                      <span className="ml-1.5 text-xs text-primary-700 font-medium">Obrigatório</span>
                    )}
                  </div>
                  <Badge variant={config.badgeVariant}>
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{doc.description}</p>

                {doc.file_name && doc.status !== 'rejeitado' && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="truncate">{doc.file_name}</span>
                    {doc.file_size && <span className="text-gray-400">• {doc.file_size}</span>}
                  </div>
                )}

                {doc.status === 'rejeitado' && doc.rejection_reason && (
                  <div className="mt-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                    <p className="text-xs text-red-700">{doc.rejection_reason}</p>
                  </div>
                )}

                {showUpload && (
                  <div className="mt-2.5">
                    <UploadMockCard
                      documentId={doc.id}
                      onSuccess={onDocumentUploaded}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
