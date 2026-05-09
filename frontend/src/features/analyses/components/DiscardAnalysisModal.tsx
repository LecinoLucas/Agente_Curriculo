import { useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";

const REASONS = [
  "Análise duplicada",
  "Currículo incorreto",
  "Vaga incorreta",
  "Resultado inconsistente",
  "Dados incompletos",
  "Candidato removido do processo",
  "Outro",
] as const;

type DiscardAnalysisModalProps = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; note?: string }) => Promise<void> | void;
};

export function DiscardAnalysisModal({ open, loading = false, onClose, onConfirm }: DiscardAnalysisModalProps) {
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState("");

  if (!open) return null;

  return (
    <Modal title="Descartar análise?" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Esta análise deixará de aparecer como ativa, mas continuará registrada no histórico do processo para auditoria.
        </p>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Motivo do descarte</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm shadow-none"
          >
            {REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Observação opcional</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            maxLength={1000}
            className="ui-input min-h-[120px] w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2.5 text-sm shadow-none"
            placeholder="Informe o contexto do descarte"
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void onConfirm({ reason, note: note.trim() || undefined })}
          disabled={loading || !reason.trim()}
          className="bg-[hsl(var(--warning))] text-[hsl(var(--text))] hover:bg-[hsl(var(--warning))]/90"
        >
          {loading ? "Descartando..." : "Descartar análise"}
        </Button>
      </div>
    </Modal>
  );
}
