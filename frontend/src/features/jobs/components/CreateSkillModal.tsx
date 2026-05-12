import { useState, useEffect } from "react";
import { Modal } from "../../../components/common/Modal";
import { Button } from "@/components/ui/button";
import { skillsService, SkillCatalog } from "../../../services/skillsService";
import { toast } from "../../../shared/utils/toast";

const CATEGORIES = [
  { value: "technical", label: "Técnica" },
  { value: "tool", label: "Ferramenta" },
  { value: "behavioral", label: "Comportamental" },
  { value: "business_process", label: "Processo" },
  { value: "domain", label: "Domínio" },
  { value: "certification", label: "Certificação" },
  { value: "other", label: "Outro" },
] as const;

type CreateSkillModalProps = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSuccess: (skill: SkillCatalog) => void;
};

export function CreateSkillModal({ open, initialName = "", onClose, onSuccess }: CreateSkillModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState("");
  const [aliases, setAliases] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(initialName);
      setCategory("");
      setAliases("");
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
      const normalizedName = name.trim().toLowerCase().replace(/\s+/g, " ");
      
      const aliasList = aliases
        .split(",")
        .map((a) => a.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((a) => a.length > 0);
        
      // Remove duplicates
      const uniqueAliases = Array.from(new Set(aliasList));
      
      // Check if any alias is equal to name
      const hasDuplicateWithName = uniqueAliases.some((a) => a === normalizedName);
      
      if (hasDuplicateWithName) {
        setError("Alias não pode ser igual ao nome da skill.");
        setLoading(false);
        return;
      }
        
      const payload = {
        name: normalizedName,
        category: category || undefined,
        aliases: uniqueAliases,
        description: description.trim() || undefined,
      };
      
      const skill = await skillsService.createSkill(payload);
      onSuccess(skill);
      onClose();
    } catch (err: any) {
      if (err.status === 409) {
        setError("Já existe uma skill ou alias com esse nome.");
      } else {
        setError("Erro ao criar skill. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Criar nova skill" onClose={onClose}>
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
            <option value="">Selecione uma categoria...</option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Aliases (opcional)</span>
          <input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            className="ui-input h-11 w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm shadow-none"
            placeholder="Ex: JS, JavaScript, EcmaScript (separados por vírgula)"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[hsl(var(--text))]">Descrição (opcional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="ui-input min-h-[80px] w-full rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2.5 text-sm shadow-none"
            placeholder="Breve descrição da skill"
          />
        </label>

        {error && (
          <div className="rounded-xl border border-[hsl(var(--danger))]/15 bg-[hsl(var(--danger-soft))] px-3 py-3 text-sm text-[hsl(var(--danger))]">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={loading || !name.trim()}
          className="bg-[hsl(var(--primary))] text-[hsl(var(--text-on-primary))] hover:bg-[hsl(var(--primary))]/90"
        >
          {loading ? "Criando..." : "Criar skill"}
        </Button>
      </div>
    </Modal>
  );
}
