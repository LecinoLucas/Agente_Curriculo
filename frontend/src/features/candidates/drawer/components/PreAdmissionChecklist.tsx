import { Plus } from "lucide-react";
import { useState } from "react";

import type {
  PreAdmissionChecklistItem,
  PreAdmissionChecklistItemStatus,
  PreAdmissionChecklistItemType,
  PreAdmissionDocument,
} from "../../../../types/domain";

const itemTypeLabels: Record<string, string> = {
  cpf: "CPF",
  rg: "RG",
  comprovante_endereco: "Comprovante de endereço",
  carteira_trabalho: "Carteira de trabalho",
  pis: "PIS",
  titulo_eleitor: "Título de eleitor",
  certificado_reservista: "Certificado de reservista",
  exame_admissional: "Exame admissional",
  dados_bancarios: "Dados bancários",
  other: "Outro",
};

function itemTypeLabel(itemType: PreAdmissionChecklistItemType, title: string) {
  return itemTypeLabels[itemType] ?? title;
}

const itemStatusLabels: Record<PreAdmissionChecklistItemStatus, string> = {
  pending: "Pendente",
  received: "Recebido",
  approved: "Aprovado",
  rejected: "Correção solicitada",
  waived: "Dispensado",
};

const documentStatusLabels: Record<string, string> = {
  uploaded: "Enviado para análise",
  approved: "Aprovado",
  rejected: "Correção solicitada",
  replaced: "Substituído",
};

interface PreAdmissionChecklistProps {
  items: PreAdmissionChecklistItem[];
  documents?: PreAdmissionDocument[];
  updating: boolean;
  onCreateItem: (payload: {
    item_type: PreAdmissionChecklistItemType;
    title: string;
    required: boolean;
  }) => Promise<void>;
  onUpdateItem: (itemId: string, status: PreAdmissionChecklistItemStatus) => Promise<void>;
  onApproveDocument?: (documentId: string) => Promise<void>;
  onRejectDocument?: (documentId: string, reviewNotes: string) => Promise<void>;
  onDownloadDocument?: (documentId: string, filename: string) => Promise<void>;
}

export function PreAdmissionChecklist({
  items,
  documents = [],
  updating,
  onCreateItem,
  onUpdateItem,
  onApproveDocument,
  onRejectDocument,
  onDownloadDocument,
}: PreAdmissionChecklistProps) {
  const [itemType, setItemType] = useState<PreAdmissionChecklistItemType>("cpf");
  const [title, setTitle] = useState("CPF");
  const [required, setRequired] = useState(true);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [rejectingDocumentId, setRejectingDocumentId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const handleTypeChange = (value: PreAdmissionChecklistItemType) => {
    setItemType(value);
    if (!title.trim() || title === itemTypeLabel(itemType, title)) {
      setTitle(itemTypeLabel(value, title));
    }
  };

  const handleCreate = async () => {
    setValidationMessage(null);
    if (!title.trim()) {
      setValidationMessage("Informe o título do item.");
      return;
    }
    await onCreateItem({ item_type: itemType, title: title.trim(), required });
  };

  const handleReject = async (documentId: string) => {
    if (!reviewNotes.trim()) {
      setValidationMessage("Informe o motivo da rejeição.");
      return;
    }
    await onRejectDocument?.(documentId, reviewNotes.trim());
    setRejectingDocumentId(null);
    setReviewNotes("");
  };

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Checklist manual
        </p>
        <h3 className="text-base font-semibold text-text">Documentos e pendências</h3>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-surface-muted/30 p-4 text-sm text-text-muted">
          Nenhum item de checklist registrado.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const itemDocuments = documents.filter(
              (document) => document.checklist_item_id === item.id && document.status !== "replaced",
            );
            return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-lg border border-border bg-surface-muted/20 p-3 sm:grid-cols-[1fr_170px]"
                >
                  <div>
                    <div className="text-sm font-semibold text-text">{item.title}</div>
                    <div className="mt-1 text-xs text-text-muted">
                      {itemTypeLabel(item.item_type, item.title)} · {item.required ? "Obrigatório" : "Opcional"}
                    </div>
                    {item.notes ? (
                      <p className="mt-2 text-sm text-text-muted">{item.notes}</p>
                    ) : null}

                    {itemDocuments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {itemDocuments.map((document) => (
                          <div key={document.id} className="rounded-lg border border-border bg-white p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="break-all text-sm font-medium text-text">
                                  {document.original_filename}
                                </p>
                                <p className="text-xs text-text-muted">
                                  {documentStatusLabels[document.status] ?? document.status}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {onDownloadDocument ? (
                                  <button
                                    type="button"
                                    onClick={() => void onDownloadDocument(document.id, document.original_filename)}
                                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-text"
                                  >
                                    Baixar
                                  </button>
                                ) : null}
                                {document.status === "uploaded" && onApproveDocument ? (
                                  <button
                                    type="button"
                                    disabled={updating}
                                    onClick={() => void onApproveDocument(document.id)}
                                    className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    Aprovar
                                  </button>
                                ) : null}
                                {document.status === "uploaded" && onRejectDocument ? (
                                  <button
                                    type="button"
                                    disabled={updating}
                                    onClick={() => setRejectingDocumentId(document.id)}
                                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    Solicitar correção
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {document.review_notes ? (
                              <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-900">
                                <span className="font-semibold">Observação:</span> {document.review_notes}
                              </p>
                            ) : null}
                            {rejectingDocumentId === document.id ? (
                              <div className="mt-3 space-y-2">
                                <textarea
                                  value={reviewNotes}
                                  onChange={(event) => setReviewNotes(event.target.value)}
                                  rows={2}
                                  placeholder="Motivo da rejeição"
                                  className="w-full resize-none rounded-md border border-border px-2 py-1 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleReject(document.id)}
                                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    Confirmar correção
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingDocumentId(null);
                                      setReviewNotes("");
                                    }}
                                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Status
                    </span>
                    <select
                      value={item.status}
                      onChange={(event) =>
                        void onUpdateItem(item.id, event.target.value as PreAdmissionChecklistItemStatus)
                      }
                      disabled={updating}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {Object.entries(itemStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-lg border border-border bg-surface-muted/30 p-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Tipo
          </span>
          <select
            value={itemType}
            onChange={(event) => handleTypeChange(event.target.value as PreAdmissionChecklistItemType)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {Object.entries(itemTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Título
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Obrigatório
          </label>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={updating}
            className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      </div>

      {validationMessage ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {validationMessage}
        </div>
      ) : null}
    </div>
  );
}
