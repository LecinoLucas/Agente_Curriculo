import { useState, useEffect } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { jobAreasService, JobArea } from "../../../services/jobAreasService";

type CreateJobAreaModalProps = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSuccess: (area: JobArea) => void;
};

export function CreateJobAreaModal({ open, initialName = "", onClose, onSuccess }: CreateJobAreaModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription("");
      setError("");
    }
  }, [open, initialName]);

  if (!open) return null;

  async function handleConfirm() {
    if (!name.trim()) return;
    
    setLoading(true);
    setError("");
    
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      
      const area = await jobAreasService.createJobArea(payload);
      onSuccess(area);
      onClose();
    } catch (err: any) {
      if (err.status === 409) {
        setError("Já existe uma área com esse nome.");
      } else {
        setError("Erro ao criar área. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Criar nova área" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Nome da área *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none"
            placeholder="Ex: Tecnologia, Financeiro"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Descrição (opcional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="ui-input min-h-[80px] w-full rounded-xl border-border bg-surface px-3 py-2.5 text-sm shadow-none"
            placeholder="Breve descrição da área"
          />
        </label>

        {error && (
          <div className="rounded-xl border border-[hsl(var(--danger))]/15 bg-danger-soft px-3 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={loading || !name.trim()}
          className="bg-[hsl(var(--primary))] text-[hsl(var(--text-on-primary))] hover:bg-[hsl(var(--primary))]/90"
        >
          {loading ? "Criando..." : "Criar área"}
        </Button>
      </div>
    </Modal>
  );
}
