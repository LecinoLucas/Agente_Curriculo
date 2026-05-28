import { useEffect, useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { skillsService, type SkillCatalog } from "../../../services/skillsService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";

const ARCHIVE_REASONS = [
  { value: "duplicate", label: "Duplicada" },
  { value: "obsolete", label: "Obsoleta" },
  { value: "merged", label: "Unificada em outra skill" },
  { value: "cleanup", label: "Higienização do catálogo" },
] as const;

type ArchiveSkillModalProps = {
  open: boolean;
  skill: SkillCatalog | null;
  onClose: () => void;
  onSuccess: (skill: SkillCatalog) => void;
};

export function ArchiveSkillModal({ open, skill, onClose, onSuccess }: ArchiveSkillModalProps) {
  const [reason, setReason] = useState(ARCHIVE_REASONS[0].value);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason(ARCHIVE_REASONS[0].value);
    setNote("");
    setError(null);
  }, [open]);

  if (!open || !skill) return null;

  async function handleSubmit() {
    if (!reason.trim()) {
      setError("Selecione um motivo para arquivar a skill.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const saved = await skillsService.archiveSkill(skill.id, {
        reason,
        note: note.trim() || undefined,
      });
      onSuccess(saved);
      onClose();
    } catch (err) {
      const details = formatErrorDetails(handleApiError(err));
      setError(details[0] ?? "Não foi possível arquivar a skill.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Arquivar skill" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <div className="rounded-xl border border-border bg-surface-muted px-4 py-4">
          <p className="text-sm font-semibold text-text">{skill.name}</p>
          <p className="mt-1 text-sm text-text-muted">
            Esta skill sairá da listagem principal e não poderá ser usada em novas vagas.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Motivo *</span>
          <Select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
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
            className="shadow-none"
            placeholder="Detalhe opcional para histórico e auditoria."
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-[hsl(var(--danger))]/15 bg-danger-soft px-3 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? "Arquivando..." : "Arquivar skill"}
        </Button>
      </div>
    </Modal>
  );
}
