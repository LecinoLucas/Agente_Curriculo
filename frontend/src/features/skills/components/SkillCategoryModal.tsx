import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";

interface SkillCategoryModalProps {
  isOpen: boolean;
  categoryForm: { name: string };
  onCategoryFormChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  categoryError: string | null;
}

export function SkillCategoryModal({
  isOpen,
  categoryForm,
  onCategoryFormChange,
  onSubmit,
  onClose,
  categoryError,
}: SkillCategoryModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      title="Adicionar nova categoria"
      onClose={onClose}
      contentClassName="flex w-full flex-col max-h-[90vh] overflow-hidden p-0 max-w-[500px]"
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
              Nome da categoria *
              <input
                required
                autoFocus
                value={categoryForm.name}
                onChange={(e) => onCategoryFormChange(e.target.value)}
                placeholder="Ex: DevOps, Análise, Mobilidade"
                className="ui-input h-10 rounded-md px-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3">
            {categoryError ? (
              <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                <span className="font-bold">✕</span>
                <span>{categoryError}</span>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!categoryForm.name.trim()}>
                Adicionar categoria
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
