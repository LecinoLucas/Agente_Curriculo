import { CheckCircle2, Download, FileText, Loader2, MessageSquareWarning, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdmissionWorkspaceDocument } from "../../../types/domain";
import { AdmissionSectionCard } from "./AdmissionSectionCard";
import {
  documentStatusLabel,
  documentTypeLabel,
  formatDateTime,
  statusBadgeVariant,
} from "../utils";

type DocumentReviewMode = "reject" | "request-correction";

type RejectDocumentPayload = {
  rejection_reason_public: string;
  review_notes?: string | null;
};

type AdmissionDocumentsCardProps = {
  documents: AdmissionWorkspaceDocument[];
  highlightedDocumentId?: string | null;
  loadingActionKey: string | null;
  onApprove: (document: AdmissionWorkspaceDocument) => void | Promise<void>;
  onReject: (
    document: AdmissionWorkspaceDocument,
    payload: RejectDocumentPayload,
    mode: DocumentReviewMode,
  ) => void | Promise<void>;
  onDownload: (document: AdmissionWorkspaceDocument) => void | Promise<void>;
};

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function currentActionKey(documentId: string, action: string): string {
  return `document:${documentId}:${action}`;
}

export function AdmissionDocumentsCard({
  documents,
  highlightedDocumentId = null,
  loadingActionKey,
  onApprove,
  onReject,
  onDownload,
}: AdmissionDocumentsCardProps) {
  const [modalDocument, setModalDocument] = useState<AdmissionWorkspaceDocument | null>(null);
  const [modalMode, setModalMode] = useState<DocumentReviewMode>("request-correction");
  const [publicReason, setPublicReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!modalDocument) {
      setPublicReason("");
      setInternalNotes("");
      setValidationError(null);
      return;
    }
    setPublicReason(modalDocument.rejection_reason_public ?? "");
    setInternalNotes(modalDocument.review_notes ?? "");
    setValidationError(null);
  }, [modalDocument]);

  const countLabel = useMemo(
    () => `${documents.length} ${documents.length === 1 ? "documento" : "documentos"}`,
    [documents.length],
  );

  const submittingModal =
    modalDocument !== null &&
    (loadingActionKey === currentActionKey(modalDocument.id, "reject") ||
      loadingActionKey === currentActionKey(modalDocument.id, "request-correction"));

  const handleOpenRejectModal = (
    document: AdmissionWorkspaceDocument,
    mode: DocumentReviewMode,
  ) => {
    setModalMode(mode);
    setModalDocument(document);
  };

  const handleCloseModal = () => {
    if (submittingModal) return;
    setModalDocument(null);
    setValidationError(null);
  };

  const handleSubmitReject = async () => {
    if (!modalDocument) return;

    const rejectionReason = publicReason.trim();
    const notes = internalNotes.trim();

    if (!rejectionReason) {
      setValidationError("Informe a mensagem para o candidato.");
      return;
    }

    setValidationError(null);
    await onReject(
      modalDocument,
      {
        rejection_reason_public: rejectionReason,
        review_notes: notes || null,
      },
      modalMode,
    );
    setModalDocument(null);
  };

  return (
    <>
      <AdmissionSectionCard
        title="Documentos enviados"
        id="admission-documents-section"
        headerRight={
          <span className="text-xs font-medium text-text-muted">{countLabel}</span>
        }
      >
        {documents.length === 0 ? (
          <p className="py-2 text-sm text-text-muted">
            Nenhum documento enviado ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => {
              const highlighted = highlightedDocumentId === document.id;
              const approveLoading = loadingActionKey === currentActionKey(document.id, "approve");
              const downloadLoading = loadingActionKey === currentActionKey(document.id, "download");
              const rejectLoading = loadingActionKey === currentActionKey(document.id, "reject");
              const correctionLoading =
                loadingActionKey === currentActionKey(document.id, "request-correction");
              const actionDisabled = !document.is_current_for_item;
              const canApprove = document.is_current_for_item && document.status !== "approved";
              const candidateMessage =
                document.rejection_reason_public?.trim() ||
                "Nenhuma mensagem pública salva. O portal deve exibir o fallback genérico.";

              return (
                <article
                  key={document.id}
                  data-testid="admission-document-card"
                  className={[
                    "rounded-2xl border bg-surface p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.45)] transition-colors",
                    highlighted
                      ? "border-[hsl(var(--brand-dark))] ring-2 ring-[hsl(var(--brand-dark))/0.14]"
                      : "border-border/70",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft"
                          aria-hidden="true"
                        >
                          <FileText className="h-5 w-5 text-danger" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-text">
                              {document.filename}
                            </p>
                            <Badge variant={statusBadgeVariant(document.status)} className="shrink-0">
                              {documentStatusLabel(document.status)}
                            </Badge>
                            <span
                              className={[
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                document.is_current_for_item
                                  ? "bg-[hsl(var(--brand-dark))/0.08] text-[hsl(var(--brand-dark))]"
                                  : "bg-surface-muted text-text-muted",
                              ].join(" ")}
                            >
                              {document.is_current_for_item ? "Versão atual" : "Versão anterior"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-text-muted">
                            {document.checklist_title} · {documentTypeLabel(document.document_type)} ·{" "}
                            {formatFileSize(document.size_bytes)} · {document.mime_type}
                          </p>
                          <div className="mt-3 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
                            <p>
                              <span className="font-semibold text-text">Enviado em:</span>{" "}
                              {formatDateTime(document.uploaded_at)}
                            </p>
                            <p>
                              <span className="font-semibold text-text">Obrigatoriedade:</span>{" "}
                              {document.required ? "Obrigatório" : "Opcional"}
                            </p>
                            <p>
                              <span className="font-semibold text-text">Revisado em:</span>{" "}
                              {formatDateTime(document.reviewed_at)}
                            </p>
                            <p>
                              <span className="font-semibold text-text">Revisado por:</span>{" "}
                              {document.reviewed_by_name ?? "—"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {document.status === "rejected" ? (
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                          <div
                            data-testid="admission-document-public-reason"
                            className="rounded-xl border border-amber-200 bg-amber-50 p-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
                              Mensagem para o candidato
                            </p>
                            <p className="mt-2 text-sm text-amber-950">{candidateMessage}</p>
                          </div>
                          <div
                            data-testid="admission-document-internal-notes"
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                              Nota interna do RH
                            </p>
                            <p className="mt-2 text-sm text-slate-900">
                              {document.review_notes?.trim() || "Nenhuma nota interna registrada."}
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {!document.is_current_for_item ? (
                        <div className="mt-4 rounded-xl border border-border bg-surface-muted/40 p-3 text-sm text-text-muted">
                          Esta não é a versão mais recente do item. Use apenas a versão atual para aprovar ou solicitar correção.
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:w-[230px] lg:justify-end">
                      <button
                        type="button"
                        onClick={() => void onDownload(document)}
                        disabled={downloadLoading}
                        data-testid={`admission-document-download-${document.id}`}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-text hover:bg-surface-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Baixar
                      </button>
                      <button
                        type="button"
                        disabled={!canApprove || approveLoading}
                        data-testid={`admission-document-approve-${document.id}`}
                        onClick={() => {
                          if (!window.confirm("Confirmar aprovação deste documento?")) return;
                          void onApprove(document);
                        }}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={actionDisabled || rejectLoading}
                        data-testid={`admission-document-reject-${document.id}`}
                        onClick={() => handleOpenRejectModal(document, "reject")}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {rejectLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        disabled={actionDisabled || correctionLoading}
                        data-testid={`admission-document-request-correction-${document.id}`}
                        onClick={() => handleOpenRejectModal(document, "request-correction")}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {correctionLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MessageSquareWarning className="h-4 w-4" />
                        )}
                        Solicitar correção
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdmissionSectionCard>

      <Dialog open={modalDocument !== null} onOpenChange={(open) => (!open ? handleCloseModal() : undefined)}>
        <DialogContent className="max-w-2xl" data-testid="admission-document-rejection-modal">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "request-correction" ? "Solicitar correção do documento" : "Rejeitar documento"}
            </DialogTitle>
            <DialogDescription>
              {modalDocument
                ? `${modalDocument.checklist_title} · ${modalDocument.filename}`
                : "Revise o documento antes de concluir a ação."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admission-public-reason"
                className="text-sm font-semibold text-text"
              >
                Mensagem para o candidato
              </label>
              <p className="text-xs text-text-muted">
                Explique de forma simples o que precisa ser corrigido.
              </p>
              <Textarea
                id="admission-public-reason"
                data-testid="admission-public-reason"
                value={publicReason}
                maxLength={1000}
                disabled={submittingModal}
                onChange={(event) => setPublicReason(event.target.value)}
                className="min-h-28 w-full rounded-xl px-3 py-2"
              />
              <p className="text-right text-[11px] text-text-muted">
                {publicReason.length}/1000
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="admission-review-notes"
                className="text-sm font-semibold text-text"
              >
                Nota interna do RH
              </label>
              <p className="text-xs text-text-muted">
                Observação visível apenas para equipe interna.
              </p>
              <Textarea
                id="admission-review-notes"
                data-testid="admission-review-notes"
                value={internalNotes}
                maxLength={2000}
                disabled={submittingModal}
                onChange={(event) => setInternalNotes(event.target.value)}
                className="min-h-24 w-full rounded-xl px-3 py-2"
              />
              <p className="text-right text-[11px] text-text-muted">
                {internalNotes.length}/2000
              </p>
            </div>

            {validationError ? (
              <div
                data-testid="admission-document-rejection-error"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {validationError}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  A mensagem pública é obrigatória neste fluxo. A nota interna é opcional e não deve substituir a comunicação para o candidato.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={submittingModal}
              className="border border-border bg-surface text-text hover:bg-surface-muted transition min-h-10 rounded-xl px-4 text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmitReject()}
              disabled={submittingModal}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--brand-dark))] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingModal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {modalMode === "request-correction" ? "Solicitar correção" : "Rejeitar documento"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
