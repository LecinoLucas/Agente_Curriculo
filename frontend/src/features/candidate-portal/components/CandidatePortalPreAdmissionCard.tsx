import { CheckCircle2, FileUp, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";

import {
  candidatePortalService,
  type CandidatePortalPreAdmissionChecklistItem,
  type CandidatePortalPreAdmissionEnvelope,
} from "../../../services/candidatePortalService";
import { toast } from "../../../shared/utils/toast";

const STATUS_LABELS: Record<string, string> = {
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

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  received: "Enviado para análise",
  approved: "Aprovado",
  rejected: "Correção solicitada",
  waived: "Dispensado pelo RH",
};

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

  const process = preAdmission?.case ?? null;
  const summary = process?.summary ?? preAdmission?.summary ?? null;

  const acceptString = useMemo(() => {
    const fallback = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
    if (!process?.checklist_items?.length) {
      return fallback;
    }
    const collected = new Set<string>();
    process.checklist_items.forEach((item) => {
      (item.allowed_file_types ?? []).forEach((mime) => {
        collected.add(mime);
        const ext = EXTENSION_BY_MIME[mime];
        if (ext) collected.add(ext);
      });
    });
    return Array.from(collected).join(",") || fallback;
  }, [process?.checklist_items]);

  const handleUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    caseId: string,
    item: CandidatePortalPreAdmissionChecklistItem,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

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
      await candidatePortalService.uploadPreAdmissionDocument(caseId, item.item_id, formData);
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
      <div
        role="status"
        data-testid="candidate-portal-pre-admission-card"
        className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-6 shadow-xl"
      >
        <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  if (!process) {
    return null;
  }

  const uploadsLocked =
    process.status === "admitted" ||
    process.status === "cancelled" ||
    process.status === "offer_declined";

  const documentsTotal = summary?.documents_total ?? process.checklist_items.length;
  const documentsApproved = summary?.documents_approved ?? 0;

  return (
    <div
      data-testid="candidate-portal-pre-admission-card"
      className="rounded-2xl border border-[hsl(var(--border)/0.5)] bg-white p-6 shadow-xl"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-[hsl(var(--text-muted))]">
            Pré-admissão
          </p>
          <h2 className="mt-1 text-xl font-bold text-[hsl(var(--text))]">Documentos da admissão</h2>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Envie os documentos solicitados pelo RH. Aceitamos {formatAllowedTypes(
              process.checklist_items[0]?.allowed_file_types ?? [],
            )}.
          </p>
        </div>
        <span
          data-testid="candidate-portal-pre-admission-status"
          className="w-fit rounded-full bg-[hsl(var(--primary)/0.08)] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]"
        >
          {STATUS_LABELS[process.status] ?? process.status}
        </span>
      </div>

      {documentsTotal > 0 ? (
        <div
          data-testid="candidate-portal-pre-admission-progress"
          className="mt-5 flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 px-4 py-3"
        >
          <span className="text-sm font-semibold text-[hsl(var(--text))]">
            {documentsApproved} de {documentsTotal} documentos aprovados
          </span>
          {summary?.next_pending_document ? (
            <span className="text-xs font-medium text-[hsl(var(--text-muted))]">
              Próximo: {summary.next_pending_document}
            </span>
          ) : null}
        </div>
      ) : null}

      {process.checklist_items.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--text-muted))]">
          Nenhuma pendência documental registrada.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {process.checklist_items.map((item) => {
            const document = item.uploaded_document;
            const canUpload =
              !uploadsLocked &&
              (!document || document.status === "rejected" || item.status === "rejected");
            const statusKey = document?.status === "approved" ? "approved" : item.status;
            const statusLabel = ITEM_STATUS_LABELS[statusKey] ?? statusKey;

            return (
              <li
                key={item.item_id}
                data-testid="candidate-portal-pre-admission-item"
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/20 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[hsl(var(--text-muted))]">
                      {item.required ? "Obrigatório" : "Opcional"} ·{" "}
                      {formatAllowedTypes(item.allowed_file_types)} até {item.max_file_size_mb}MB
                    </p>
                    {item.description ? (
                      <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">{item.description}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {statusKey === "approved" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : statusKey === "rejected" ? (
                        <XCircle className="h-4 w-4 text-red-600" />
                      ) : (
                        <FileUp className="h-4 w-4 text-[hsl(var(--primary))]" />
                      )}
                      <span className="font-medium text-[hsl(var(--text))]">{statusLabel}</span>
                      {document ? (
                        <span className="break-all text-[hsl(var(--text-muted))]">
                          {document.original_filename}
                        </span>
                      ) : null}
                    </div>
                    {statusKey === "approved" ? (
                      <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        Documento aprovado pelo RH. Nenhuma ação necessária.
                      </p>
                    ) : null}
                    {statusKey === "rejected" ? (
                      <p
                        data-testid="candidate-portal-pre-admission-rejection-reason"
                        className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
                      >
                        <span className="font-semibold">Correção solicitada:</span>{" "}
                        {item.rejection_reason_public ??
                          "Documento rejeitado. Envie uma nova versão para análise."}
                      </p>
                    ) : null}
                    {uploadsLocked && process.status === "admitted" ? (
                      <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        Admissão concluída. Novos uploads estão bloqueados, mas os documentos enviados continuam disponíveis para download.
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
                        {uploadingItemId === item.item_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : document?.status === "rejected" || item.status === "rejected" ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : (
                          <FileUp className="h-4 w-4" />
                        )}
                        {document?.status === "rejected" || item.status === "rejected"
                          ? "Substituir arquivo"
                          : "Enviar documento"}
                        <input
                          type="file"
                          accept={acceptString}
                          className="hidden"
                          aria-label={`Enviar documento para ${item.title}`}
                          disabled={uploadingItemId !== null}
                          onChange={(event) => void handleUpload(event, process.id, item)}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
