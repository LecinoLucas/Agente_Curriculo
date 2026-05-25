import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import {
  candidatePortalService,
  type CandidatePortalPreAdmissionEnvelope,
} from "../../../services/candidatePortalService";
import { toast } from "../../../shared/utils/toast";
import type { PreAdmissionDocument } from "../../../types/domain";

const statusLabels: Record<string, string> = {
  draft: "Em preparação",
  offer_preparing: "Oferta em preparação",
  offer_sent: "Oferta enviada",
  offer_accepted: "Oferta aceita",
  offer_declined: "Oferta recusada",
  documents_pending: "Documentos pendentes",
  documents_received: "Documentos recebidos",
  ready_for_admission: "Pronto para admissão",
  admitted: "Admitido",
  cancelled: "Cancelado",
};

const documentStatusLabels: Record<string, string> = {
  uploaded: "Enviado para análise",
  approved: "Aprovado",
  rejected: "Correção solicitada",
  replaced: "Substituído",
};

function latestDocument(documents: PreAdmissionDocument[]): PreAdmissionDocument | null {
  return documents.find((document) => document.status !== "replaced") ?? null;
}

interface CandidatePortalPreAdmissionCardProps {
  preAdmission: CandidatePortalPreAdmissionEnvelope | null;
  loading?: boolean;
  onUploaded: () => Promise<void>;
}

export function CandidatePortalPreAdmissionCard({
  preAdmission,
  loading = false,
  onUploaded,
}: CandidatePortalPreAdmissionCardProps) {
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);

  const handleUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    caseId: string,
    itemId: string,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const formData = new FormData();
    formData.append("document_file", file);
    setUploadingItemId(itemId);
    try {
      await candidatePortalService.uploadPreAdmissionDocument(caseId, itemId, formData);
      await onUploaded();
      toast.success("Documento enviado para análise.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível enviar o documento.";
      toast.error(message);
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleDownload = async (documentId: string, filename: string) => {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível baixar o documento.";
      toast.error(message);
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  if (loading) {
    return (
      <div role="status" className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-6 shadow-xl">
        <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  if (!preAdmission?.case) {
    return (
      <div className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-6 shadow-xl">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[hsl(var(--text-muted))]">
          Pré-admissão
        </p>
        <h2 className="mt-1 text-xl font-bold text-[hsl(var(--text))]">Documentos</h2>
        <p className="mt-4 rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhuma pré-admissão disponível no momento.
        </p>
      </div>
    );
  }

  const process = preAdmission.case;
  const requiredItems = process.checklist_items.filter((item) => item.required);
  const pendingRequiredCount = requiredItems.filter((item) => {
    const document = latestDocument(item.documents ?? []);
    return !document || !["approved"].includes(document.status);
  }).length;
  const uploadsLocked =
    process.status === "admitted" ||
    process.status === "cancelled" ||
    process.status === "offer_declined";

  return (
    <div className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-6 shadow-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-[hsl(var(--text-muted))]">
            Pré-admissão
          </p>
          <h2 className="mt-1 text-xl font-bold text-[hsl(var(--text))]">Documentos</h2>
        </div>
        <span className="w-fit rounded-full bg-[hsl(var(--primary)/0.08)] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
          {statusLabels[process.status] ?? process.status}
        </span>
      </div>

      {process.checklist_items.length > 0 ? (
        <div
          className={[
            "mt-5 rounded-xl border px-4 py-3 text-sm",
            pendingRequiredCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900",
          ].join(" ")}
        >
          {pendingRequiredCount > 0
            ? `${pendingRequiredCount} documento(s) obrigatório(s) ainda precisam de ação antes da conclusão da pré-admissão.`
            : "Todos os documentos obrigatórios atuais já foram resolvidos."}
        </div>
      ) : null}

      {process.checklist_items.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhuma pendência documental registrada.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {process.checklist_items.map((item) => {
            const document = latestDocument(item.documents ?? []);
            const canUpload = !uploadsLocked && (!document || document.status === "rejected");
            return (
              <div
                key={item.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/20 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{item.title}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                      {item.required ? "Obrigatório" : "Opcional"}
                    </p>
                    {document ? (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        {document.status === "approved" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : document.status === "rejected" ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : (
                          <FileUp className="h-4 w-4 text-[hsl(var(--primary))]" />
                        )}
                        <span className="font-medium text-[hsl(var(--text))]">
                          {documentStatusLabels[document.status] ?? document.status}
                        </span>
                        <span className="break-all text-[hsl(var(--text-muted))]">{document.original_filename}</span>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-[hsl(var(--text-muted))]">Pendente</p>
                    )}
                    {document?.status === "rejected" && document.review_notes ? (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                        <span className="font-semibold">Observação do RH:</span> {document.review_notes}
                      </p>
                    ) : null}
                    {uploadsLocked && process.status === "admitted" ? (
                      <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        Admissão concluída. Novos uploads estão bloqueados, mas os documentos já enviados continuam disponíveis para download.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {document ? (
                      <button
                        type="button"
                        onClick={() => void handleDownload(document.id, document.original_filename)}
                        disabled={downloadingDocumentId !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-white px-3 py-2 text-sm font-semibold text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/50 disabled:opacity-60"
                      >
                        {downloadingDocumentId === document.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Baixar
                      </button>
                    ) : null}
                    {canUpload ? (
                      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
                        {uploadingItemId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        {document?.status === "rejected" ? "Reenviar" : "Enviar documento"}
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="hidden"
                          aria-label={`Enviar documento para ${item.title}`}
                          disabled={uploadingItemId !== null}
                          onChange={(event) => void handleUpload(event, process.id, item.id)}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
