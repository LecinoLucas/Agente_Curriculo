import { useState } from "react";
import { skillEquivalencesService } from "../../../services/skillEquivalencesService";
import { toast } from "../../../shared/utils/toast";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import type { SkillEquivalenceGroup } from "../../../types/domain";
import { aliasComparisonKey, normalizeAliasValue } from "../utils/skillHelpers";

type SkillFormValues = {
  canonical: string;
  aliases: string[];
  domainsInput: string;
  type: string;
  strength: SkillEquivalenceGroup["strength"];
  newAlias: string;
};

const EMPTY_FORM: SkillFormValues = {
  canonical: "",
  aliases: [],
  domainsInput: "",
  type: "skill",
  strength: "strong",
  newAlias: "",
};

function toFriendlyText(error: unknown): string {
  return formatErrorDetails(handleApiError(error)).join(" ");
}

export function useSkillForm(onSaveSuccess: () => void) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SkillFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillEquivalenceGroup | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      const sanitizedAliases = form.aliases
        .map(normalizeAliasValue)
        .filter(Boolean)
        .filter(
          (alias, index, aliases) =>
            aliases.findIndex((candidate) => aliasComparisonKey(candidate) === aliasComparisonKey(alias)) === index,
        );

      if (form.aliases.length !== sanitizedAliases.length) {
        throw new Error("Revise os aliases: há duplicidade.");
      }

      const domains = form.domainsInput
        .split(",")
        .map((domain) => domain.trim())
        .filter(Boolean);
      const payload = {
        canonical: form.canonical,
        aliases: sanitizedAliases,
        domains,
        type: form.type || "skill",
        strength: form.strength,
      };

      if (editingSkill) {
        await skillEquivalencesService.update(editingSkill.id, payload);
        toast.success(`Equivalência atualizada: ${form.canonical}`);
      } else {
        await skillEquivalencesService.create(payload);
        toast.success(`Equivalência criada: ${form.canonical}`);
      }

      setForm(EMPTY_FORM);
      setEditingSkill(null);
      setShowForm(false);
      onSaveSuccess();
    } catch (err) {
      setFormError(toFriendlyText(err) || "Falha ao salvar skill");
    } finally {
      setSaving(false);
    }
  }

  function handleAddAlias() {
    const normalizedAlias = normalizeAliasValue(form.newAlias);
    if (!normalizedAlias) {
      setFormError("Alias não pode estar vazio.");
      return;
    }

    if (form.aliases.some((alias) => aliasComparisonKey(alias) === aliasComparisonKey(normalizedAlias))) {
      setFormError("Alias duplicado nesta equivalência.");
      return;
    }

    setForm((current) => ({
      ...current,
      aliases: [...current.aliases, normalizedAlias],
      newAlias: "",
    }));
    setFormError(null);
  }

  function handleRemoveAlias(aliasToRemove: string) {
    setForm((current) => ({
      ...current,
      aliases: current.aliases.filter((alias) => alias !== aliasToRemove),
    }));
  }

  function openCreateForm() {
    setEditingSkill(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(skill: SkillEquivalenceGroup) {
    setEditingSkill(skill);
    setForm({
      canonical: skill.canonical,
      aliases: [...(skill.aliases ?? [])],
      domainsInput: (skill.domains ?? []).join(", "),
      type: skill.type ?? "skill",
      strength: skill.strength,
      newAlias: "",
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingSkill(null);
    setForm(EMPTY_FORM);
  }

  return {
    showForm,
    setShowForm,
    form,
    setForm,
    saving,
    formError,
    editingSkill,
    handleSave,
    handleAddAlias,
    handleRemoveAlias,
    openCreateForm,
    openEditForm,
    closeForm,
  };
}
