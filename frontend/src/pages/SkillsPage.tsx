import { useEffect, useState } from "react";

import { ActionMenu } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
import { useAuth } from "../features/auth/useAuth";
import { skillsService } from "../services/skillsService";
import { toast } from "../services/toast";
import { Skill } from "../types/domain";
import { Button } from "@/components/ui/button";

export function SkillsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setSkills(await skillsService.list(search || undefined, categoryFilter || undefined));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar skills");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [search, categoryFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function openCreate() {
    setNewName("");
    setNewCategory("");
    setNewAliases("");
    setCreateError(null);
    setShowCreateForm(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      const aliases = newAliases ? newAliases.split(",").map((a) => a.trim()).filter(Boolean) : [];
      const created = await skillsService.create(newName, newCategory || undefined, aliases);
      toast.success(`Skill criada: ${created.name}`);
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Falha ao criar skill");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(skill: Skill) {
    setEditingSkill(skill);
    setEditName(skill.name);
    setEditCategory(skill.category ?? "");
    setEditAliases(skill.aliases.join(", "));
    setEditError(null);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSkill) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const aliases = editAliases ? editAliases.split(",").map((a) => a.trim()).filter(Boolean) : [];
      await skillsService.update(editingSkill.id, {
        name: editName || undefined,
        category: editCategory || undefined,
        aliases,
      });
      toast.success(`Skill "${editName}" atualizada`);
      setEditingSkill(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Falha ao atualizar skill");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleVerify(skill: Skill) {
    try {
      await skillsService.update(skill.id, { is_verified: !skill.is_verified });
      toast.success(skill.is_verified ? `"${skill.name}" desverificada` : `"${skill.name}" verificada`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar verificação");
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    const skill = skills.find((s) => s.id === confirmDeleteId);
    try {
      await skillsService.delete(confirmDeleteId);
      toast.success(`Skill "${skill?.name ?? ""}" excluída`);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir skill");
      setConfirmDeleteId(null);
    }
  }

  const categories = [...new Set(skills.map((s) => s.category).filter(Boolean))] as string[];
  const hasFilters = !!(search || categoryFilter);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Catálogo de skills" subtitle="Vocabulário consistente para análise e matching" />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Skills cadastradas</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{skills.length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Verificadas</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{skills.filter((skill) => skill.is_verified).length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Categorias</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{categories.length}</div>
        </div>
      </div>

      {showCreateForm ? (
        <Modal title="Nova skill" onClose={() => setShowCreateForm(false)}>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Nome *
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Python, React, Liderança"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Categoria
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Ex.: Backend, Frontend, Gestão"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Aliases (separados por vírgula)
              <input
                value={newAliases}
                onChange={(e) => setNewAliases(e.target.value)}
                placeholder="py, python3"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            {createError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-bold">✕</span>
                <span>{createError}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={saving || !newName}>
                {saving ? "Salvando…" : "Salvar skill"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingSkill ? (
        <Modal title={`Editar skill: ${editingSkill.name}`} onClose={() => setEditingSkill(null)}>
          <form onSubmit={(e) => void handleEditSave(e)} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Nome *
              <input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Categoria
              <input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="backend, frontend, soft-skill…"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Aliases (separados por vírgula)
              <input
                value={editAliases}
                onChange={(e) => setEditAliases(e.target.value)}
                placeholder="alias1, alias2"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            {editError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-bold">✕</span>
                <span>{editError}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={editSaving || !editName}>
                {editSaving ? "Salvando…" : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingSkill(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">Tem certeza que deseja excluir esta skill? Os vínculos com vagas serão removidos.</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>Excluir</Button>
          </div>
        </Modal>
      ) : null}

      <CrudPage<Skill>
        onNew={isAdmin ? openCreate : undefined}
        newLabel="Nova skill"
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={hasFilters ? () => { setSearch(""); setSearchInput(""); setCategoryFilter(""); } : undefined}
        searchPlaceholder="Ex.: React, liderança, SQL…"
        filters={
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Todas as categorias</option>
            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        }
        loading={loading}
        error={loadError}
        isEmpty={!loading && !loadError && skills.length === 0}
        emptyIcon="🧩"
        emptyTitle="Nenhuma skill encontrada"
        emptyDescription={
          hasFilters
            ? "Nenhum item corresponde aos filtros aplicados."
            : "Adicione as primeiras skills para estruturar o vocabulário da plataforma."
        }
        emptyAction={
          hasFilters
            ? { label: "Limpar filtros", onClick: () => { setSearch(""); setSearchInput(""); setCategoryFilter(""); } }
            : isAdmin ? { label: "+ Nova skill", onClick: openCreate } : undefined
        }
        columns={[
          "Skill",
          "Categoria",
          "Sinônimos",
          "Curadoria",
          ...(isAdmin ? ["Ações"] : []),
        ]}
        items={skills}
        renderRow={(skill) => (
          <tr key={skill.id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
            <td className="px-4 py-3">
              <div className="space-y-1">
                <div className="font-semibold text-gray-900">{skill.name}</div>
                <div className="text-xs text-gray-500">Ref. {skill.id.slice(0, 8)}</div>
              </div>
            </td>
            <td className="px-4 py-3 text-sm text-gray-700">{skill.category ?? "—"}</td>
            <td className="px-4 py-3 text-sm text-gray-700">{skill.aliases.length ? skill.aliases.join(", ") : "—"}</td>
            <td className="px-4 py-3">
              <StatusPill
                label={skill.is_verified ? "Verificada" : "Pendente"}
                tone={skill.is_verified ? "success" : "neutral"}
              />
            </td>
            {isAdmin ? (
              <td className="px-4 py-3 text-right">
                <ActionMenu
                  buttonLabel={`Ações de ${skill.name}`}
                  items={[
                    { label: "Editar", onClick: () => openEdit(skill) },
                    {
                      label: skill.is_verified ? "Desverificar" : "Verificar",
                      onClick: () => void handleVerify(skill),
                    },
                    { label: "Excluir", tone: "danger", onClick: () => setConfirmDeleteId(skill.id) },
                  ]}
                />
              </td>
            ) : null}
          </tr>
        )}
      />
    </div>
  );
}
