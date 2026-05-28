import { useEffect, useMemo, useState } from "react";

import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DeleteCandidateModalProps = {
  candidateName: string;
  isOpen: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; note?: string; confirmation: string }) => Promise<void>;
};

const CONFIRMATION_TEXT = "EXCLUIR";

export function DeleteCandidateModal({
  candidateName,
  isOpen,
  loading = false,
  onClose,
  onConfirm,
}: DeleteCandidateModalProps) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setReason("");
      setNote("");
      setConfirmation("");
    }
  }, [isOpen]);

  const canSubmit = useMemo(
    () => reason.trim().length > 0 && confirmation === CONFIRMATION_TEXT && !loading,
    [confirmation, loading, reason],
  );

  if (!isOpen) return null;

  return (
    <Modal title="Excluir candidato definitivamente?" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <div className="space-y-2">
          <p className="text-sm text-text">
            Esta ação removerá <strong>{candidateName}</strong> do banco de dados. Análises, vínculos e
            informações associadas poderão ser removidos. Esta ação não pode ser desfeita.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="candidate-delete-reason">Motivo da exclusão</Label>
          <Input
            id="candidate-delete-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Informe o motivo da exclusão"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="candidate-delete-note">Observação</Label>
          <textarea
            id="candidate-delete-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Detalhes adicionais, se necessário"
            disabled={loading}
            rows={4}
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-text ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="candidate-delete-confirmation">Digite EXCLUIR para confirmar</Label>
          <Input
            id="candidate-delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="EXCLUIR"
            autoComplete="off"
            disabled={loading}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!canSubmit}
          onClick={() =>
            void onConfirm({
              reason: reason.trim(),
              note: note.trim() || undefined,
              confirmation,
            })
          }
        >
          {loading ? "Excluindo..." : "Excluir candidato"}
        </Button>
      </div>
    </Modal>
  );
}
