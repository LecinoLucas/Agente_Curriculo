import { useState, useEffect } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";

import { EmptyState } from "../components/common/EmptyState";
import { PageHeader } from "../components/common/PageHeader";
import { Modal } from "../components/common/Modal";
import { SkeletonRows } from "../components/common/Skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAsyncState } from "../hooks/useAsyncState";
import { formatErrorDetails, formatErrorForToast, handleApiError } from "../services/errorHandler";
import { skillsService } from "../services/skillsService";
import { toast } from "../services/toast";
import { Skill } from "../types/domain";

type SkillFormValues = {
  name: string;
  category?: string;
  aliases: string[];
  newAlias: string;
};

type NewCategoryFormValues = {
  name: string;
};

const EMPTY_FORM: SkillFormValues = {
  name: "",
  category: "",
  aliases: [],
  newAlias: "",
};

const EMPTY_CATEGORY_FORM: NewCategoryFormValues = {
  name: "",
};

const DEFAULT_SKILL_CATEGORIES = [
  "Technology",
  "Language",
  "Framework",
  "Tool",
  "Soft Skill",
  "Domain",
];

export function SkillsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const { data, error, loading, run } = useAsyncState<Skill[]>();

  useEffect(() => {
    void run(() => skillsService.list(searchQuery || undefined));
  }, [run, searchQuery, page, pageSize]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SkillFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Category management
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("skillCategories");
    return saved ? JSON.parse(saved) : [];
  });
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<NewCategoryFormValues>(EMPTY_CATEGORY_FORM);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const allCategories = [...DEFAULT_SKILL_CATEGORIES, ...customCategories].sort();

  function toFriendlyText(error: unknown): string {
    return formatErrorDetails(handleApiError(error)).join(" ");
  }

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
            aliases.findIndex((candidate) => aliasComparisonKey(candidate) === aliasComparisonKey(alias)) === index
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
      void run(() => skillsService.list(searchQuery || undefined));
    } catch (err) {
      setFormError(toFriendlyText(err) || "Falha ao salvar skill");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    try {
      await skillsService.delete(confirmDeleteId);
      toast.success("Skill excluída com sucesso");
      void run(() => skillsService.list(searchQuery || undefined));
    } catch (err) {
      toast.error(formatErrorForToast(handleApiError(err)));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setCategoryError(null);

    if (!categoryForm.name.trim()) {
      setCategoryError("Nome da categoria não pode estar vazio");
      return;
    }

    if (allCategories.includes(categoryForm.name)) {
      setCategoryError("Esta categoria já existe");
      return;
    }

    const updated = [...customCategories, categoryForm.name];
    setCustomCategories(updated);
    localStorage.setItem("skillCategories", JSON.stringify(updated));
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setShowCategoryForm(false);
    toast.success(`Categoria "${categoryForm.name}" adicionada com sucesso`);
  }

  function openCreateForm() {
    setEditingSkill(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function normalizeAliasValue(value: string) {
    return value.trim().replace(/\s+/g, " ");
  }

  function aliasComparisonKey(value: string) {
    return normalizeAliasValue(value).toLocaleLowerCase("pt-BR");
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

  function renderAliasBadges(aliases: string[]) {
    if (!aliases.length) {
      return <span className="text-sm text-[hsl(var(--text-muted))]">—</span>;
    }

    const visible = aliases.slice(0, 3);
    const remaining = aliases.length - visible.length;

    return (
      <div className="flex max-w-full flex-wrap gap-1.5">
        {visible.map((alias) => (
          <span
            key={alias}
            className="inline-flex max-w-full items-center truncate rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-xs text-[hsl(var(--text))]"
            title={alias}
          >
            {alias}
          </span>
        ))}
        {remaining > 0 ? (
          <span
            className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-xs text-[hsl(var(--text-muted))]"
            title={aliases.slice(3).join(", ")}
          >
            +{remaining}
          </span>
        ) : null}
      </div>
    );
  }

  const items = data ?? [];
  const total = items.length;
  const hasActiveSearch = searchQuery.trim().length > 0;
  const isEmptyState = !loading && !error && total === 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Skills"
        subtitle="Gerencie competências e tecnologias do banco de talentos"
      />

      {showForm ? (
        <Modal
          title={editingSkill ? "Editar skill" : "Criar skill"}
          onClose={() => {
            setShowForm(false);
            setEditingSkill(null);
            setForm(EMPTY_FORM);
          }}
          contentClassName="flex w-full flex-col max-h-[90vh] overflow-hidden p-0 max-w-[600px]"
        >
          <form onSubmit={(e) => void handleSave(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                  Nome *
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Python, React, Liderança"
                    className="ui-input h-10 rounded-md px-3 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                  Categoria
                  <div className="flex gap-2">
                    <select
                      value={form.category || ""}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value || "" }))}
                      className="ui-input flex-1 h-10 rounded-md px-3 text-sm"
                    >
                      <option value="">—</option>
                      {allCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCategoryForm(true)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(var(--border))] transition-colors hover:bg-[hsl(var(--surface-muted))]"
                      title="Adicionar nova categoria"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </label>

                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-4">
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-semibold text-[hsl(var(--text))]">
                      Aliases / termos equivalentes
                    </div>
                    <div className="text-xs text-[hsl(var(--text-muted))]">
                      Use aliases para melhorar busca, Kanban e matching sem duplicar skills.
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={form.newAlias}
                      onChange={(e) => setForm((f) => ({ ...f, newAlias: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAlias();
                        }
                      }}
                      placeholder="Ex: JS, Node, PowerBI"
                      className="ui-input h-10 flex-1 rounded-md px-3 text-sm"
                    />
                    <Button type="button" variant="outline" onClick={handleAddAlias}>
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
                            onClick={() => handleRemoveAlias(alias)}
                            className="text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--danger))]"
                            title={`Remover alias ${alias}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[hsl(var(--text-muted))]">
                        Nenhum alias cadastrado.
                      </span>
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingSkill(null);
                      setForm(EMPTY_FORM);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saving || !form.name}>
                    {saving ? "Salvando…" : editingSkill ? "Salvar alterações" : "Criar skill"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}

      {showCategoryForm ? (
        <Modal
          title="Adicionar nova categoria"
          onClose={() => {
            setShowCategoryForm(false);
            setCategoryForm(EMPTY_CATEGORY_FORM);
            setCategoryError(null);
          }}
          contentClassName="flex w-full flex-col max-h-[90vh] overflow-hidden p-0 max-w-[500px]"
        >
          <form onSubmit={(e) => handleAddCategory(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[hsl(var(--text))]">
                  Nome da categoria *
                  <input
                    required
                    autoFocus
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ name: e.target.value })}
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCategoryForm(false);
                      setCategoryForm(EMPTY_CATEGORY_FORM);
                      setCategoryError(null);
                    }}
                  >
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
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-[hsl(var(--text-muted))]">
            Tem certeza que deseja excluir esta skill? Esta ação é irreversível.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Excluir skill
            </Button>
          </div>
        </Modal>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
            <input
              type="text"
              placeholder="Buscar skills..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="ui-input w-full pl-10 text-sm"
            />
          </div>
        </div>
        <Button onClick={openCreateForm} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova skill
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="px-0 py-0">
              <SkeletonRows rows={6} />
            </div>
          ) : null}

          {error ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-[hsl(var(--danger))]">
              <span className="font-semibold">!</span>
              <span>{error}</span>
            </div>
          ) : null}

          {isEmptyState ? (
            <EmptyState
              icon={hasActiveSearch ? "🔎" : "🎯"}
              title={hasActiveSearch ? "Nenhuma skill encontrada" : "Nenhuma skill cadastrada"}
              description={
                hasActiveSearch
                  ? "A busca atual não encontrou skills por nome ou alias."
                  : "Crie a primeira skill para começar a organizar o banco de talentos."
              }
              action={
                hasActiveSearch
                  ? {
                      label: "Limpar busca",
                      onClick: () => setSearchQuery(""),
                    }
                  : {
                      label: "Nova skill",
                      onClick: openCreateForm,
                    }
              }
            />
          ) : null}

          {!loading && !error && total > 0 ? (
            <>
              <div className="border-b border-[hsl(var(--border))] px-4 py-3 sm:px-6">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
                  {total} {total === 1 ? "skill" : "skills"}
                </p>
              </div>

              <div className="ui-scrollbar hidden max-h-[68vh] overflow-y-auto md:block">
                <Table className="w-full table-fixed">
                  <TableHeader className="bg-[hsl(var(--surface-muted))]">
                    <TableRow className="hover:bg-[hsl(var(--surface-muted))]">
                      <TableHead className="w-[24%] min-w-[220px]">Nome</TableHead>
                      <TableHead className="w-[18%]">Categoria</TableHead>
                      <TableHead className="w-[42%]">Aliases</TableHead>
                      <TableHead className="w-[16%] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((skill) => (
                      <TableRow key={skill.id} className="align-top">
                        <TableCell className="min-w-0 py-4">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold text-[hsl(var(--text))]">
                              {skill.name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {skill.category ? (
                            <Badge variant="secondary" className="max-w-full">
                              {skill.category}
                            </Badge>
                          ) : (
                            <span className="text-sm text-[hsl(var(--text-muted))]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-0 py-4">
                          <div className="max-w-full">
                            {renderAliasBadges(skill.aliases ?? [])}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingSkill(skill);
                                setForm({
                                  name: skill.name,
                                  category: skill.category ?? "",
                                  aliases: [...(skill.aliases ?? [])],
                                  newAlias: "",
                                });
                                setFormError(null);
                                setShowForm(true);
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setConfirmDeleteId(skill.id)}
                              aria-label={`Excluir ${skill.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="ui-scrollbar grid max-h-[68vh] gap-3 overflow-y-auto p-4 sm:p-6 md:hidden">
                {items.map((skill) => (
                  <div
                    key={skill.id}
                    className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold text-[hsl(var(--text))]">
                            {skill.name}
                          </p>
                        </div>
                        {skill.category ? <Badge variant="secondary">{skill.category}</Badge> : null}
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
                          Aliases
                        </p>
                        <div className="max-w-full">
                          {renderAliasBadges(skill.aliases ?? [])}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setEditingSkill(skill);
                            setForm({
                              name: skill.name,
                              category: skill.category ?? "",
                              aliases: [...(skill.aliases ?? [])],
                              newAlias: "",
                            });
                            setFormError(null);
                            setShowForm(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="min-w-11"
                          onClick={() => setConfirmDeleteId(skill.id)}
                          aria-label={`Excluir ${skill.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
