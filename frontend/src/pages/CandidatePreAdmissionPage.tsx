import { ArrowLeft, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CandidatePreAdmissionDocumentList } from "../features/candidate-portal/components/CandidatePreAdmissionDocumentList";
import { CandidatePreAdmissionProgressCard } from "../features/candidate-portal/components/CandidatePreAdmissionProgressCard";
import { resolveChecklistDisplayStatus } from "../features/candidate-portal/preAdmissionLabels";
import {
  candidatePortalService,
  type CandidatePortalPreAdmissionChecklistItem,
  type CandidatePortalPreAdmissionEnvelope,
} from "../services/candidatePortalService";
import { HttpError } from "../services/http";
import { toast } from "../shared/utils/toast";

const TITLE = "Minha pré-admissão";

export function CandidatePreAdmissionPage() {
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState<CandidatePortalPreAdmissionEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);

  const loadEnvelope = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const payload = await candidatePortalService.getPreAdmission();
        setEnvelope(payload);
      } catch (requestError) {
        if (requestError instanceof HttpError && requestError.status === 401) {
          navigate("/candidato", { replace: true });
          return;
        }
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível carregar a sua pré-admissão.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    void loadEnvelope();
  }, [loadEnvelope]);

  const handleUpload = useCallback(
    async (item: CandidatePortalPreAdmissionChecklistItem, file: File) => {
      if (!envelope?.case) return;

      const maxBytes = (item.max_file_size_mb || 1) * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error(`Arquivo acima do limite de ${item.max_file_size_mb}MB.`);
        return;
      }
      const allowed = item.allowed_file_types ?? [];
      if (allowed.length > 0 && file.type && !allowed.includes(file.type)) {
        toast.error("Tipo de arquivo não permitido. Envie um PDF, JPG ou PNG.");
        return;
      }

      const formData = new FormData();
      formData.append("document_file", file);
      setUploadingItemId(item.item_id);
      try {
        await candidatePortalService.uploadPreAdmissionDocument(
          envelope.case.id,
          item.item_id,
          formData,
        );
        toast.success("Documento enviado para análise.");
        await loadEnvelope(true);
      } catch (uploadError) {
        const message =
          uploadError instanceof Error
            ? uploadError.message
            : "Não foi possível enviar o documento.";
        toast.error(message);
      } finally {
        setUploadingItemId(null);
      }
    },
    [envelope?.case, loadEnvelope],
  );

  const handleDownload = useCallback(async (documentId: string, filename: string) => {
    setDownloadingDocumentId(documentId);
    try {
      const blob = await candidatePortalService.downloadPreAdmissionDocument(documentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error
          ? downloadError.message
          : "Não foi possível baixar o documento.";
      toast.error(message);
    } finally {
      setDownloadingDocumentId(null);
    }
  }, []);

  const caseData = envelope?.case ?? null;
  const items = caseData?.checklist_items ?? [];
  const uploadsLocked =
    caseData?.status === "admitted" ||
    caseData?.status === "cancelled" ||
    caseData?.status === "offer_declined";

  const groupedItems = useMemo(() => {
    const grouped = {
      pending: [] as CandidatePortalPreAdmissionChecklistItem[],
      in_review: [] as CandidatePortalPreAdmissionChecklistItem[],
      approved: [] as CandidatePortalPreAdmissionChecklistItem[],
      rejected: [] as CandidatePortalPreAdmissionChecklistItem[],
    };
    for (const item of items) {
      const status = resolveChecklistDisplayStatus(item);
      if (status === "approved" || status === "waived") {
        grouped.approved.push(item);
      } else if (status === "rejected") {
        grouped.rejected.push(item);
      } else if (status === "in_review" || status === "submitted") {
        grouped.in_review.push(item);
      } else {
        grouped.pending.push(item);
      }
    }
    return grouped;
  }, [items]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
        <nav aria-label="breadcrumb" className="mb-6">
          <Link
            to="/candidato/portal"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
            data-testid="candidate-pre-admission-back-link"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao portal
          </Link>
        </nav>

        <header className="mb-6">
          <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
            Pré-admissão
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-text">
            {TITLE}
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Aqui você acompanha o status de cada documento e envia o que ainda falta para a sua admissão.
          </p>
        </header>

        {loading ? (
          <div
            data-testid="candidate-pre-admission-loading"
            role="status"
            className="flex items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-12 shadow-sm"
          >
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
            <span className="ml-3 text-sm font-semibold text-text-muted">
              Carregando sua pré-admissão...
            </span>
          </div>
        ) : error ? (
          <div
            data-testid="candidate-pre-admission-error"
            className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm"
          >
            <p className="font-semibold">Não conseguimos carregar sua pré-admissão.</p>
            <p className="mt-1">{error}</p>
            <button
              type="button"
              onClick={() => void loadEnvelope()}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Tentar novamente
            </button>
          </div>
        ) : !caseData ? (
          <div
            data-testid="candidate-pre-admission-empty"
            className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-8 text-center shadow-sm"
          >
            <p className="text-base font-bold text-text">
              Você ainda não tem uma pré-admissão ativa.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Quando o RH iniciar sua pré-admissão, ela aparecerá aqui com os documentos a enviar.
            </p>
            <Link
              to="/candidato/portal"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Voltar ao portal
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <CandidatePreAdmissionProgressCard
              caseData={caseData}
              summary={caseData.summary ?? envelope?.summary ?? null}
              onRefresh={() => void loadEnvelope(true)}
              refreshing={refreshing}
            />

            {groupedItems.rejected.length > 0 ? (
              <CandidatePreAdmissionDocumentList
                title="Correções solicitadas"
                description="Reenvie estes documentos com a versão corrigida."
                emptyMessage="Nenhuma correção pendente."
                items={groupedItems.rejected}
                uploadsLocked={uploadsLocked}
                uploadingItemId={uploadingItemId}
                downloadingDocumentId={downloadingDocumentId}
                onUpload={(item, file) => void handleUpload(item, file)}
                onDownload={(documentId, filename) =>
                  void handleDownload(documentId, filename)
                }
                testId="candidate-pre-admission-rejected-list"
              />
            ) : null}

            <CandidatePreAdmissionDocumentList
              title="Documentos pendentes"
              description="Documentos que ainda precisam ser enviados."
              emptyMessage="Nenhum documento pendente. Bom trabalho!"
              items={groupedItems.pending}
              uploadsLocked={uploadsLocked}
              uploadingItemId={uploadingItemId}
              downloadingDocumentId={downloadingDocumentId}
              onUpload={(item, file) => void handleUpload(item, file)}
              onDownload={(documentId, filename) =>
                void handleDownload(documentId, filename)
              }
              testId="candidate-pre-admission-pending-list"
            />

            <CandidatePreAdmissionDocumentList
              title="Em análise pelo RH"
              description="Já recebemos estes documentos. Aguarde a análise."
              emptyMessage="Nenhum documento em análise no momento."
              items={groupedItems.in_review}
              uploadsLocked={uploadsLocked}
              uploadingItemId={uploadingItemId}
              downloadingDocumentId={downloadingDocumentId}
              onUpload={(item, file) => void handleUpload(item, file)}
              onDownload={(documentId, filename) =>
                void handleDownload(documentId, filename)
              }
              testId="candidate-pre-admission-in-review-list"
            />

            <CandidatePreAdmissionDocumentList
              title="Documentos aprovados"
              description="Estes documentos já foram aprovados pelo RH."
              emptyMessage="Nenhum documento aprovado ainda."
              items={groupedItems.approved}
              uploadsLocked={uploadsLocked}
              uploadingItemId={uploadingItemId}
              downloadingDocumentId={downloadingDocumentId}
              onUpload={(item, file) => void handleUpload(item, file)}
              onDownload={(documentId, filename) =>
                void handleDownload(documentId, filename)
              }
              testId="candidate-pre-admission-approved-list"
            />
          </div>
        )}
      </div>
    </div>
  );
}
