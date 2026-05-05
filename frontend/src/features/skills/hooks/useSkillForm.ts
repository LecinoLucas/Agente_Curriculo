import { useState } from "react";
import { skillsService } from "../../../services/skillsService";
import { toast } from "../../../shared/utils/toast";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import type { Skill } from "../../../types/domain";
import { aliasComparisonKey, normalizeAliasValue } from "../utils/skillHelpers";

type SkillFormValues = {
  name: string;
  category?: string;
  aliases: string[];
  newAlias: string;
};

const EMPTY_FORM: SkillFormValues = {
  name: "",
  category: "",
  aliases: [],
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
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

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
            aliasComparisonKey(alias) !== aliasComparisonKey(form.name) &&
            aliases.findIndex((candidate) => aliasComparisonKey(candidate) === aliasComparisonKey(alias)) === index,
        );

      if (form.aliases.length !== sanitizedAliases.length) {
        throw new Error("Revise os aliases: há duplicidade ou alias igual ao nome da skill.");
      }

      if (editingSkill) {
        await skillsService.update(editingSkill.id, {
          name: form.name,
          category: form.category || undefined,
          aliases: sanitizedAliases,
        });
        toast.success(`Skill atualizada: ${form.name}`);
      } else {
        await skillsService.create(form.name, form.category || undefined, sanitizedAliases);
        toast.success(`Skill criada: ${form.name}`);
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

    if (aliasComparisonKey(normalizedAlias) === aliasComparisonKey(form.name)) {
      setFormError("Alias não pode ser igual ao nome da skill.");
      return;
    }

    if (form.aliases.some((alias) => aliasComparisonKey(alias) === aliasComparisonKey(normalizedAlias))) {
      setFormError("Alias duplicado nesta skill.");
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

  function openEditForm(skill: Skill) {
    setEditingSkill(skill);
    setForm({
      name: skill.name,
      category: skill.category ?? "",
      aliases: [...(skill.aliases ?? [])],
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
