import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "../../shared/components/forms/Field";
import { agendaService } from "../../services/agendaService";
import { toast } from "../../shared/utils/toast";
import { formatContextError } from "../../services/errorMessages";
import { InterviewSchedule } from "../../types/agenda";

interface CancelInterviewModalProps {
  isOpen: boolean;
  scheduleId?: string;
  candidateName?: string;
  onClose: () => void;
  onSuccess?: (schedule: InterviewSchedule) => Promise<void> | void;
}

export function CancelInterviewModal({
  isOpen,
  scheduleId,
  candidateName,
  onClose,
  onSuccess,
}: CancelInterviewModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.error("Motivo do cancelamento é obrigatório");
      return;
    }

    if (!scheduleId) {
      toast.error("ID da entrevista não encontrado");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await agendaService.cancelInterview(scheduleId, {
        cancel_reason: reason.trim(),
      });

      toast.success("Entrevista cancelada com sucesso!");
      setReason("");
      await onSuccess?.(result);
      onClose();
    } catch (err) {
      const message = formatContextError(
        err,
        "Não foi possível cancelar a entrevista.",
        "Tente novamente."
      );
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="Cancelar entrevista"
      onClose={onClose}
      contentClassName="sm:max-w-[420px]"
    >
      <form
        data-testid="agenda-cancel-modal"
        onSubmit={handleSubmit}
        className="flex flex-col overflow-hidden"
      >
        {/* Error banner */}
        {error && (
          <div className="border-b border-border bg-rose-50 px-6 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-900">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 px-6 py-4">
          {candidateName && (
            <p className="mb-4 text-sm text-text-muted">
              Entrevista de <strong>{candidateName}</strong>
            </p>
          )}

          <Field label="Motivo do cancelamento *">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Candidato desistiu da entrevista"
              className="rounded-xl px-3 py-2 text-sm resize-none"
              rows={4}
              autoFocus
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface-muted px-6 py-3 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-xl border border-border bg-surface text-sm font-medium text-text hover:bg-surface-muted transition disabled:opacity-50"
            disabled={loading}
          >
            Fechar
          </button>

          <button
            type="submit"
            className="h-10 px-5 rounded-xl bg-rose-600 text-sm font-medium text-white hover:bg-rose-700 transition disabled:opacity-50 flex items-center gap-2"
            disabled={loading || !reason.trim()}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
