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
  initialAliases?: string;
  initialCategory?: string;
  onClose: () => void;
  onSuccess: (skill: SkillCatalog) => void;
};

export function CreateSkillModal({ open, initialName = "", initialAliases = "", initialCategory = "", onClose, onSuccess }: CreateSkillModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [aliases, setAliases] = useState(initialAliases);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(initialName);
      setCategory(initialCategory);
      setAliases(initialAliases);
      setDescription("");
      setError("");
    }
  }, [open, initialName, initialAliases, initialCategory]);

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
          <span className="text-sm font-medium text-text">Nome da skill *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none"
            placeholder="Ex: React, Python, Scrum"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Categoria</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none"
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
          <span className="text-sm font-medium text-text">Aliases (opcional)</span>
          <input
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-11 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none"
            placeholder="Ex: JS, JavaScript, EcmaScript (separados por vírgula)"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-text">Descrição (opcional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px] w-full rounded-xl border-border bg-surface px-3 py-2.5 text-sm shadow-none"
            placeholder="Breve descrição da skill"
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
          {loading ? "Criando..." : "Criar skill"}
        </Button>
      </div>
    </Modal>
  );
}
