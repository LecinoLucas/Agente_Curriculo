import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  FileText,
  Upload,
  Loader2,
  Download,
  MinusCircle,
  RefreshCcw,
} from 'lucide-react';
import { CandidatePortalLayout } from '../components/layout/CandidatePortalLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { candidatePreAdmissionService } from '../services/candidatePreAdmissionService';
import type {
  PreAdmissionCase,
  ChecklistItem,
  ItemStatus,
} from '../services/candidatePreAdmissionService';
import { HttpError } from '../services/publicApiClient';
import { useSessionRestore } from '../hooks/useSessionRestore';

// ── Types ─────────────────────────────────────────────────────────────────────

type PagePhase = 'loading' | 'empty' | 'active' | 'error';

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    label: string;
    canUpload: boolean;
  }
> = {
  pending: {
    icon: AlertCircle,
    badgeClass: 'bg-gray-100 text-gray-600',
    label: 'Pendente de envio',
    canUpload: true,
  },
  received: {
    icon: Clock,
    badgeClass: 'bg-amber-100 text-amber-700',
    label: 'Em análise pelo RH',
    canUpload: false,
  },
  approved: {
    icon: CheckCircle2,
    badgeClass: 'bg-green-100 text-green-700',
    label: 'Aprovado',
    canUpload: false,
  },
  rejected: {
    icon: XCircle,
    badgeClass: 'bg-red-100 text-red-700',
    label: 'Correção solicitada',
    canUpload: true,
  },
  waived: {
    icon: MinusCircle,
    badgeClass: 'bg-blue-100 text-blue-600',
    label: 'Dispensado',
    canUpload: false,
  },
};

function statusConfig(status: ItemStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function friendlyFileTypes(types: string[]): string {
  if (types.length === 0) return 'PDF, JPG, PNG';
  return types.map((t) => t.replace(/^\./, '').toUpperCase()).join(', ');
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <CandidatePortalLayout maxWidth="page">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-44 rounded-lg bg-gray-200 animate-pulse" />
        <div className="h-4 w-64 rounded bg-gray-100 animate-pulse" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 h-20 animate-pulse" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
              <div className="h-4 w-40 rounded bg-gray-200 mb-2" />
              <div className="h-3 w-56 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 h-32 animate-pulse" />
          <div className="rounded-xl border border-gray-200 bg-white p-4 h-28 animate-pulse" />
        </div>
      </div>
    </CandidatePortalLayout>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CandidatePreAdmissionPage() {
  useSessionRestore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<PagePhase>('loading');
  const [caseData, setCaseData] = useState<PreAdmissionCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});

  const setItemUpload = useCallback((itemId: string, state: UploadState) => {
    setUploadStates((prev) => ({ ...prev, [itemId]: state }));
  }, []);

  const load = useCallback(async () => {
    try {
      const envelope = await candidatePreAdmissionService.getPreAdmission();
      if (!envelope.case) {
        setPhase('empty');
      } else {
        setCaseData(envelope.case);
        setPhase('active');
      }
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        navigate('/login');
        return;
      }
      if (err instanceof HttpError && err.status === 403) {
        setError(
          'Seu perfil está incompleto. Entre em contato com o RH para mais informações.',
        );
        setPhase('error');
        return;
      }
      setError(err instanceof Error ? err.message : 'Erro ao carregar pré-admissão.');
      setPhase('error');
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(item: ChecklistItem, file: File) {
    if (!caseData) return;

    const maxBytes = item.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setItemUpload(item.id, {
        status: 'error',
        message: `Arquivo muito grande. Tamanho máximo: ${item.maxFileSizeMb} MB.`,
      });
      return;
    }

    setItemUpload(item.id, { status: 'uploading', message: null });
    try {
      await candidatePreAdmissionService.uploadDocument(caseData.id, item.id, file);
      setItemUpload(item.id, { status: 'success', message: file.name });
      await load();
    } catch (err) {
      const msg =
        err instanceof HttpError && err.status === 413
          ? `Arquivo muito grande para o servidor. Use um arquivo menor que ${item.maxFileSizeMb} MB.`
          : err instanceof HttpError && err.status === 415
            ? `Formato não aceito. Use: ${friendlyFileTypes(item.allowedFileTypes)}.`
            : err instanceof Error
              ? err.message
              : 'Falha no envio. Tente novamente.';
      setItemUpload(item.id, { status: 'error', message: msg });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <LoadingSkeleton />;
  }

  if (phase === 'error') {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="flex flex-col items-center py-20 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <p className="text-base font-semibold text-gray-700">
            {error ?? 'Erro ao carregar pré-admissão.'}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={() => { setPhase('loading'); void load(); }}
              className="flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Tentar novamente
            </button>
            <Link to="/minha-area" className="text-sm text-gray-500 hover:underline">
              Voltar à minha área
            </Link>
          </div>
        </div>
      </CandidatePortalLayout>
    );
  }

  if (phase === 'empty' || !caseData) {
    return (
      <CandidatePortalLayout maxWidth="content">
        <div className="flex flex-col items-center py-20 text-center">
          <FileText className="mb-3 h-10 w-10 text-gray-300" />
          <h1 className="text-xl font-extrabold text-gray-700">Nenhuma pré-admissão ativa</h1>
          <p className="mt-2 text-sm text-gray-500">
            Você não possui um processo de pré-admissão em andamento no momento.
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Se acredita que isso é um engano, entre em contato com o RH.
          </p>
          <Link to="/minha-area" className="mt-6 text-sm text-primary-700 hover:underline">
            Voltar à minha área
          </Link>
        </div>
      </CandidatePortalLayout>
    );
  }

  const { summary } = caseData;
  const rejected = caseData.checklistItems.filter((i) => i.status === 'rejected').length;
  const approved = summary.documentsApproved;
  const total = summary.documentsTotal;
  const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
  const allRequiredSent = caseData.checklistItems
    .filter((i) => i.required)
    .every((i) => i.status !== 'pending' && i.status !== 'rejected');

  return (
    <CandidatePortalLayout maxWidth="page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">Pré-admissão</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-primary-50 px-3 py-0.5 text-xs font-semibold text-primary-700">
            {caseData.statusLabel}
          </span>
          {caseData.startDate && (
            <span className="text-sm text-gray-500">
              Início previsto: <strong>{formatDate(caseData.startDate)}</strong>
            </span>
          )}
          {caseData.workModel && (
            <span className="text-sm text-gray-500">
              Modelo: <strong>{caseData.workModel}</strong>
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-500">
          Envie os documentos abaixo para avançar no processo de admissão.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main */}
        <div className="space-y-6">
          {/* Progress card */}
          <Card padding="md">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-gray-700">
                {approved} de {total} documento{total !== 1 ? 's' : ''} aprovado{total !== 1 ? 's' : ''}
              </span>
              <span className="font-bold text-primary-700">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full rounded-full bg-primary-700 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Inline stats — visible on all sizes */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {summary.documentsPending > 0 && (
                <span className="flex items-center gap-1 text-gray-500">
                  <AlertCircle className="h-3 w-3" />
                  {summary.documentsPending} pendente{summary.documentsPending !== 1 ? 's' : ''}
                </span>
              )}
              {summary.documentsSubmitted > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Clock className="h-3 w-3" />
                  {summary.documentsSubmitted} em análise
                </span>
              )}
              {rejected > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-3 w-3" />
                  {rejected} correção solicitada
                </span>
              )}
              {approved > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {approved} aprovado{approved !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Next action hint */}
            {summary.nextPendingDocument && summary.documentsPending > 0 && (
              <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700">
                  <strong>Próxima ação:</strong> envie &ldquo;{summary.nextPendingDocument}&rdquo;
                </p>
              </div>
            )}
          </Card>

          {/* Checklist */}
          <div className="space-y-3">
            {caseData.checklistItems.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                uploadState={uploadStates[item.id] ?? { status: 'idle', message: null }}
                onUpload={(file) => void handleUpload(item, file)}
                onDownload={() =>
                  window.open(
                    candidatePreAdmissionService.downloadUrl(item.uploadedDocument!.id),
                    '_blank',
                  )
                }
              />
            ))}
          </div>

          {/* All required sent banner */}
          {allRequiredSent && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
                <p className="text-sm font-semibold text-green-800">
                  Todos os documentos obrigatórios foram enviados!
                </p>
              </div>
              <p className="mt-1 pl-7 text-xs text-green-700">
                Aguarde a análise do RH. Você será notificado caso alguma correção seja necessária.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={() => navigate('/minha-area')}>
              Voltar à minha área
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Progress ring */}
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Seu progresso
            </p>
            <div className="flex flex-col items-center py-2">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary-700">
                <div className="text-center">
                  <span className="block text-2xl font-extrabold text-primary-700 leading-none">
                    {approved}
                  </span>
                  <span className="block text-[10px] text-gray-400 leading-tight">de {total}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">documentos aprovados</p>
            </div>
          </Card>

          {/* Stats */}
          <Card padding="md">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Resumo
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Pendentes</span>
                <span className="font-semibold text-gray-700">{summary.documentsPending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Em análise</span>
                <span className="font-semibold text-amber-600">{summary.documentsSubmitted}</span>
              </div>
              {rejected > 0 && (
                <div className="flex justify-between">
                  <span className="text-red-600">Correção solicitada</span>
                  <span className="font-semibold text-red-600">{rejected}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Aprovados</span>
                <span className="font-semibold text-green-600">{summary.documentsApproved}</span>
              </div>
            </div>
          </Card>

          {/* Salary offer if available */}
          {caseData.salaryOffer && (
            <Card padding="md">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Salário ofertado
              </p>
              <p className="text-base font-bold text-gray-900">
                {new Intl.NumberFormat('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                }).format(Number(caseData.salaryOffer))}
              </p>
            </Card>
          )}
        </aside>
      </div>
    </CandidatePortalLayout>
  );
}

// ── ChecklistItemCard ─────────────────────────────────────────────────────────

interface ChecklistItemCardProps {
  item: ChecklistItem;
  uploadState: UploadState;
  onUpload: (file: File) => void;
  onDownload: () => void;
}

function ChecklistItemCard({
  item,
  uploadState,
  onUpload,
  onDownload,
}: ChecklistItemCardProps) {
  const cfg = statusConfig(item.status);
  const StatusIcon = cfg.icon;
  const inputRef = useRef<HTMLInputElement>(null);

  const accept =
    item.allowedFileTypes.length > 0 ? item.allowedFileTypes.join(',') : '.pdf,.jpg,.jpeg,.png';
  const uploadHint = `Formatos: ${friendlyFileTypes(item.allowedFileTypes)} · Máx. ${item.maxFileSizeMb} MB`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  const isRejected = item.status === 'rejected';

  return (
    <div
      className={[
        'rounded-xl border bg-white p-4',
        isRejected ? 'border-red-200' : 'border-gray-200',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <span className="text-sm font-semibold text-gray-900">{item.title}</span>
              {item.required && (
                <span className="ml-1.5 text-xs font-medium text-primary-700">Obrigatório</span>
              )}
            </div>
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                cfg.badgeClass,
              ].join(' ')}
            >
              <StatusIcon className="h-3 w-3" />
              {cfg.label}
            </span>
          </div>

          {/* Description */}
          {item.description && (
            <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
          )}

          {/* Uploaded document info */}
          {item.uploadedDocument && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{item.uploadedDocument.filename}</span>
                <span className="text-gray-400">
                  ({formatBytes(item.uploadedDocument.sizeBytes)})
                </span>
              </div>
              <button
                onClick={onDownload}
                className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800 hover:underline"
              >
                <Download className="h-3 w-3" />
                Baixar
              </button>
            </div>
          )}

          {/* Rejection reason */}
          {isRejected && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <div className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-0.5">Correção solicitada</p>
                  <p className="text-xs text-red-600">
                    {item.rejectionReasonPublic ??
                      'O RH solicitou correção deste documento. Envie uma nova versão ou entre em contato com o RH para mais detalhes.'}
                  </p>
                </div>
              </div>
              <p className="mt-2 pl-5 text-xs font-medium text-red-700">
                Envie uma nova versão abaixo ↓
              </p>
            </div>
          )}

          {/* Upload zone */}
          {cfg.canUpload && (
            <div className="mt-2.5">
              {uploadState.status === 'uploading' ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-primary-700" />
                  <span className="text-sm text-gray-600">Enviando…</span>
                </div>
              ) : uploadState.status === 'error' ? (
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                    <p className="text-sm text-red-700">{uploadState.message}</p>
                  </div>
                  <UploadZone
                    accept={accept}
                    hint={uploadHint}
                    inputRef={inputRef}
                    onChange={handleChange}
                  />
                </div>
              ) : (
                <UploadZone
                  accept={accept}
                  hint={uploadHint}
                  inputRef={inputRef}
                  onChange={handleChange}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── UploadZone ────────────────────────────────────────────────────────────────

interface UploadZoneProps {
  accept: string;
  hint?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function UploadZone({ accept, hint, inputRef, onChange }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    if (inputRef.current) {
      inputRef.current.files = dt.files;
      inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      onChange({ target: { files: dt.files } } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  }

  return (
    <div>
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
        <Upload className="h-4 w-4 flex-shrink-0 text-primary-700" />
        <span className="text-sm text-gray-600">
          Clique para enviar ou arraste o arquivo
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={onChange}
        />
      </label>
      {hint && (
        <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
      )}
    </div>
  );
}
