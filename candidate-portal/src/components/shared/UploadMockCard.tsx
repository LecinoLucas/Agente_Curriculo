import { useState } from 'react';
import { Upload, Loader2, CheckCircle2, X } from 'lucide-react';
import { uploadMockDocument } from '../../services/mockCandidatePortalService';

interface UploadMockCardProps {
  documentId: string;
  onSuccess: (documentId: string, fileName: string) => void;
}

export function UploadMockCard({ documentId, onSuccess }: UploadMockCardProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState('');

  async function handleFile(file: File) {
    setFileName(file.name);
    setUploading(true);
    await uploadMockDocument(documentId, file.name);
    setUploading(false);
    setDone(true);
    onSuccess(documentId, file.name);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        <span className="text-sm text-green-700 flex-1 truncate">{fileName}</span>
        <button
          onClick={() => { setDone(false); setFileName(''); }}
          className="text-green-500 hover:text-green-700 transition-colors"
          aria-label="Remover arquivo"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Loader2 className="h-4 w-4 animate-spin text-primary-700 flex-shrink-0" />
        <span className="text-sm text-gray-600 truncate">Enviando {fileName}…</span>
      </div>
    );
  }

  return (
    <label
      className={[
        'flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2.5 transition-colors',
        dragging
          ? 'border-primary-700 bg-primary-50'
          : 'border-gray-200 bg-gray-50 hover:border-primary-700/50 hover:bg-primary-50/50',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <Upload className="h-4 w-4 text-primary-700 flex-shrink-0" />
      <span className="text-sm text-gray-600">
        Clique para enviar ou arraste o arquivo
      </span>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="sr-only"
        onChange={handleInputChange}
      />
    </label>
  );
}
