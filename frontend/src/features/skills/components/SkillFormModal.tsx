import { X } from "lucide-react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";

type SkillFormValues = {
  canonical: string;
  aliases: string[];
  domainsInput: string;
  type: string;
  strength: "exact" | "strong" | "partial" | "weak";
  newAlias: string;
};

interface SkillFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  form: SkillFormValues;
  onFormChange: (updates: Partial<SkillFormValues>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  formError: string | null;
  onAddAlias: () => void;
  onRemoveAlias: (alias: string) => void;
}

export function SkillFormModal({
  isOpen,
  isEditing,
  form,
  onFormChange,
  onSubmit,
  onClose,
  saving,
  formError,
  onAddAlias,
  onRemoveAlias,
}: SkillFormModalProps) {
  if (!isOpen) return null;

  return (
    <Modal
      title={isEditing ? "Editar equivalência" : "Criar equivalência"}
      onClose={onClose}
      contentClassName="flex w-full flex-col max-h-[90vh] overflow-hidden p-0 max-w-[600px]"
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
              Nome canônico *
              <input
                required
                value={form.canonical}
                onChange={(e) => onFormChange({ canonical: e.target.value })}
                placeholder="Ex: JavaScript, SQL, BI"
                className="ui-input h-10 rounded-md px-3 text-sm"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                Domínios
                <input
                  value={form.domainsInput}
                  onChange={(e) => onFormChange({ domainsInput: e.target.value })}
                  placeholder="Ex: technology, frontend"
                  className="ui-input h-10 rounded-md px-3 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                Força
                <select
                  value={form.strength}
                  onChange={(e) => onFormChange({ strength: e.target.value as typeof form.strength })}
                  className="ui-input h-10 rounded-md px-3 text-sm"
                >
                  <option value="exact">Exact</option>
                  <option value="strong">Strong</option>
                  <option value="partial">Partial</option>
                  <option value="weak">Weak</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
              Tipo
              <input
                value={form.type}
                onChange={(e) => onFormChange({ type: e.target.value })}
                placeholder="Ex: skill, tool, platform"
                className="ui-input h-10 rounded-md px-3 text-sm"
              />
            </label>

            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-4">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold text-[hsl(var(--text))]">Aliases / termos equivalentes</div>
                <div className="text-xs text-[hsl(var(--text-muted))]">
                  Estes aliases são gravados no JSON canônico usado pelo matching.
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={form.newAlias}
                  onChange={(e) => onFormChange({ newAlias: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddAlias();
                    }
                  }}
                  placeholder="Ex: JS, TS, React"
                  className="ui-input h-10 flex-1 rounded-md px-3 text-sm"
                />
                <Button type="button" variant="outline" onClick={onAddAlias}>
                  Adicionar
                </Button>
              </div>

              <div className="mt-3 flex min-h-10 flex-wrap gap-2">
                {form.aliases.length ? (
                  form.aliases.map((alias) => (
                    <span
                      key={alias}
                      className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-1 text-xs font-medium text-[hsl(var(--text))]"
                    >
                      {alias}
                      <button
                        type="button"
                        onClick={() => onRemoveAlias(alias)}
                        className="text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--danger))]"
                        title={`Remover alias ${alias}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[hsl(var(--text-muted))]">Nenhum alias cadastrado.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3">
            {formError ? (
              <div className="flex items-start gap-2 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                <span className="font-bold">✕</span>
                <span>{formError}</span>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !form.canonical}>
                {saving ? "Salvando…" : isEditing ? "Salvar alterações" : "Criar equivalência"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
