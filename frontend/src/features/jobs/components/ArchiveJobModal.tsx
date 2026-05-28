import { useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";

const REASONS = [
  "Vaga preenchida",
  "Vaga cancelada",
  "Vaga pausada",
  "Processo encerrado",
  "Criada por engano",
  "Outro",
] as const;

type ArchiveJobModalProps = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; note?: string }) => Promise<void> | void;
};

export function ArchiveJobModal({ open, loading = false, onClose, onConfirm }: ArchiveJobModalProps) {
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState("");

  if (!open) return null;

  return (
    <Modal title="Arquivar vaga?" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <p className="text-sm text-text-muted">
          Esta vaga sairá da lista de vagas ativas, mas todo o histórico de candidatos, análises e movimentações será preservado.
        </p>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Motivo do arquivamento</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none"
          >
            {REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Observação opcional</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            maxLength={1000}
            className="ui-input min-h-[120px] w-full rounded-xl border-border bg-surface px-3 py-2.5 text-sm shadow-none"
            placeholder="Adicione um contexto para auditoria e histórico"
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void onConfirm({ reason, note: note.trim() || undefined })}
          disabled={loading || !reason.trim()}
          className="bg-[hsl(var(--warning))] text-text hover:bg-[hsl(var(--warning))]/90"
        >
          {loading ? "Arquivando..." : "Arquivar vaga"}
        </Button>
      </div>
    </Modal>
  );
}
