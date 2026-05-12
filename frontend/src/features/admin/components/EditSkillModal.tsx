import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import {
  skillsService,
  type SkillCatalog,
  type UpdateSkillPayload,
} from "../../../services/skillsService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";

const CATEGORIES = [
  { value: "", label: "Sem categoria" },
  { value: "technical", label: "Técnica" },
  { value: "tool", label: "Ferramenta" },
  { value: "behavioral", label: "Comportamental" },
  { value: "business_process", label: "Processo" },
  { value: "domain", label: "Domínio" },
  { value: "certification", label: "Certificação" },
  { value: "other", label: "Outro" },
] as const;

type EditSkillModalProps = {
  open: boolean;
  skill: SkillCatalog | null;
  onClose: () => void;
  onSuccess: (skill: SkillCatalog) => void;
};

function parseAliases(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function EditSkillModal({ open, skill, onClose, onSuccess }: EditSkillModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [aliases, setAliases] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !skill) return;
    setName(skill.name);
    setCategory(skill.category ?? "");
    setAliases(skill.aliases.map((alias) => alias.alias).join(", "));
    setDescription(skill.description ?? "");
    setError(null);
  }, [open, skill]);

  const normalizedName = useMemo(() => name.trim().toLowerCase(), [name]);

  if (!open || !skill) return null;

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("O nome da skill é obrigatório.");
      return;
    }

    const aliasList = parseAliases(aliases);
    if (aliasList.some((alias) => alias.trim().toLowerCase() === normalizedName)) {
      setError("Os aliases não podem repetir o nome principal da skill.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload: UpdateSkillPayload = {
      name: trimmedName,
      category: category || null,
      aliases: aliasList,
      description: description.trim() || null,
    };

    try {
      const saved = await skillsService.updateSkill(skill.id, payload);
      onSuccess(saved);
      onClose();
    } catch (err) {
      const details = formatErrorDetails(handleApiError(err));
      setError(details[0] ?? "Não foi possível salvar a skill.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Editar skill" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Nome da skill *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm shadow-none"
            placeholder="Ex: React, Python, Scrum"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Categoria</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm shadow-none"
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Aliases</span>
          <input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm shadow-none"
            placeholder="Ex: JS, JavaScript, EcmaScript"
          />
          <p className="text-xs text-[hsl(var(--text-muted))]">
            Separe múltiplos aliases por vírgula.
          </p>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Descrição</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="ui-input min-h-[90px] w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2.5 text-sm shadow-none"
            placeholder="Contexto de uso, observações ou exemplos."
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
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading || !name.trim()}>
          {loading ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </Modal>
  );
}
