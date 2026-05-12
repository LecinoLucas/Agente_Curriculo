import { useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { jobAreasService, JobArea } from "../../../services/jobAreasService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { toast } from "../../../shared/utils/toast";

type ConfirmDeleteJobAreaModalProps = {
  open: boolean;
  area: JobArea | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function ConfirmDeleteJobAreaModal({ open, area, onClose, onSuccess }: ConfirmDeleteJobAreaModalProps) {
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !area) return null;

  async function handleSubmit() {
    if (confirmation !== "EXCLUIR") return;

    setLoading(true);
    setError(null);

    try {
      await jobAreasService.deleteJobArea(area.id);
      toast.success("Área excluída com sucesso.");
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.status === 409) {
        setError("Esta área está sendo usada em uma ou mais vagas. Inative a área em vez de excluí-la.");
      } else {
        const details = formatErrorDetails(handleApiError(err));
        setError(details[0] ?? "Não foi possível excluir a área.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Excluir área?" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <div className="rounded-xl border border-[hsl(var(--danger))]/15 bg-[hsl(var(--danger-soft))] px-4 py-4">
          <p className="text-sm font-semibold text-[hsl(var(--danger))]">{area.name}</p>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Esta ação removerá a área do catálogo. Só é permitida se nenhuma vaga estiver usando esta área.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Digite EXCLUIR para confirmar</span>
          <input
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm shadow-none"
            placeholder="Digite EXCLUIR"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-[hsl(var(--danger))]/15 bg-[hsl(var(--danger-soft))] px-3 py-3 text-sm text-[hsl(var(--danger))]">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || confirmation !== "EXCLUIR"}
          className="bg-[hsl(var(--danger))] text-[hsl(var(--text-on-primary))] hover:bg-[hsl(var(--danger))]/90"
        >
          {loading ? "Excluindo..." : "Excluir área"}
        </Button>
      </div>
    </Modal>
  );
}
