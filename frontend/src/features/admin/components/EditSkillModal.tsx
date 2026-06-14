import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  skillsService,
  type SkillCatalog,
  type UpdateSkillPayload,
} from "../../../services/skillsService";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { aliasComparisonKey, dedupeAliases, parseAliasInput } from "../../skills/utils/skillHelpers";

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

    const aliasList = parseAliasInput(aliases);
    const dedupedAliases = dedupeAliases(aliasList);
    if (aliasList.length !== dedupedAliases.length) {
      setError("Revise os aliases: há duplicidade.");
      return;
    }

    if (dedupedAliases.some((alias) => aliasComparisonKey(alias) === aliasComparisonKey(normalizedName))) {
      setError("Os aliases não podem repetir o nome principal da skill.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload: UpdateSkillPayload = {
      name: trimmedName,
      category: category || null,
      aliases: dedupedAliases,
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
          <span className="text-sm font-medium text-text">Nome da skill *</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 shadow-none"
            placeholder="Ex: React, Python, Scrum"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Categoria</span>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 shadow-none"
          >
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Aliases</span>
          <Input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            className="h-11 shadow-none"
            placeholder="Ex: JS, JavaScript, EcmaScript"
          />
          <p className="text-xs text-text-muted">
            Separe múltiplos aliases por vírgula.
          </p>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Descrição</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="shadow-none"
            placeholder="Contexto de uso, observações ou exemplos."
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
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading || !name.trim()}>
          {loading ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </Modal>
  );
}
