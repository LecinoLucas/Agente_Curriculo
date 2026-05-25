import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

export const REJECTION_REASON_MIN_LENGTH = 10;
export const REJECTION_REASON_MAX_LENGTH = 500;

export type PipelineRejectionReasonModalProps = {
  open: boolean;
  candidateName?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  submitting?: boolean;
};

export function PipelineRejectionReasonModal({
  open,
  candidateName,
  onClose,
  onConfirm,
  submitting = false,
}: PipelineRejectionReasonModalProps) {
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= REJECTION_REASON_MIN_LENGTH;

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleConfirm = async () => {
    if (!reasonValid || submitting) return;
    await onConfirm(trimmedReason);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent className="max-w-md" data-testid="rejection-reason-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <DialogTitle>Desclassificar candidato</DialogTitle>
              {candidateName ? (
                <DialogDescription className="mt-0.5">{candidateName}</DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <p
            data-testid="rejection-reason-warning"
            className="rounded-lg border border-amber-200/70 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
          >
            Essa ação move o candidato para Desclassificado, mas mantém o histórico do processo.
          </p>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Motivo da desclassificação (mín. {REJECTION_REASON_MIN_LENGTH} caracteres)
            </span>
            <textarea
              data-testid="rejection-reason-textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REJECTION_REASON_MAX_LENGTH}
              rows={3}
              disabled={submitting}
              placeholder="Ex.: perfil não atende os requisitos mínimos da vaga."
              className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <span
              className={`mt-0.5 block text-right text-[11px] ${reasonValid ? "text-slate-500 dark:text-slate-400" : "text-rose-600 dark:text-rose-400"}`}
            >
              {trimmedReason.length}/{REJECTION_REASON_MAX_LENGTH}
            </span>
          </label>
        </div>

        <DialogFooter>
          <button
            type="button"
            data-testid="rejection-reason-cancel"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="rejection-reason-confirm"
            onClick={() => void handleConfirm()}
            disabled={submitting || !reasonValid}
            className="inline-flex h-9 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Desclassificando…" : "Confirmar desclassificação"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
