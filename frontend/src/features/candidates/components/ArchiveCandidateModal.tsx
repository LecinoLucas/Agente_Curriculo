import { useEffect, useState } from "react";

import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ARCHIVE_REASONS = [
  { value: "duplicate", label: "Cadastro duplicado" },
  { value: "inactive_profile", label: "Perfil fora do fluxo ativo" },
  { value: "requested_removal", label: "Solicitação interna" },
  { value: "data_cleanup", label: "Higienização de base" },
] as const;

type ArchiveCandidateModalProps = {
  candidateName: string;
  isOpen: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; note?: string }) => Promise<void>;
};

export function ArchiveCandidateModal({
  candidateName,
  isOpen,
  loading = false,
  onClose,
  onConfirm,
}: ArchiveCandidateModalProps) {
  const [reason, setReason] = useState(ARCHIVE_REASONS[0].value);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setReason(ARCHIVE_REASONS[0].value);
      setNote("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal title="Arquivar candidato" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
          <p className="text-sm font-semibold text-text">{candidateName}</p>
          <p className="mt-1 text-sm text-text-muted">
            O candidato sairá da listagem ativa, mas manterá histórico, análises e vínculos para auditoria.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Motivo *</span>
          <Select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={loading}
            className="h-11 shadow-none"
          >
            {ARCHIVE_REASONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Observação</span>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            disabled={loading}
            className="shadow-none"
            placeholder="Contexto opcional para histórico e auditoria."
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() =>
            void onConfirm({
              reason,
              note: note.trim() || undefined,
            })
          }
          disabled={loading}
        >
          {loading ? "Arquivando..." : "Arquivar candidato"}
        </Button>
      </div>
    </Modal>
  );
}
