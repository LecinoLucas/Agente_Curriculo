import { useEffect, useState } from "react";

import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
import { useAuth } from "../features/auth/useAuth";
import { skillsService } from "../services/skillsService";
import { toast } from "../services/toast";
import { Skill } from "../types/domain";

function skillVerificationTone(skill: Skill): "success" | "neutral" {
  return skill.is_verified ? "success" : "neutral";
}

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

  useEffect(() => {
    void load();
  }, [search, categoryFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setCreateError(null);
    try {
      const aliases = newAliases ? newAliases.split(",").map((a) => a.trim()).filter(Boolean) : [];
      const created = await skillsService.create(newName, newCategory || undefined, aliases);
      toast.success(`Skill criada: ${created.name}`);
      setNewName("");
      setNewCategory("");
      setNewAliases("");
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
  const verifiedCount = skills.filter((skill) => skill.is_verified).length;
  const uncategorizedCount = skills.filter((skill) => !skill.category).length;

  return (
    <div className="page-grid">
      <PageHeader
        title="Catálogo de skills"
        subtitle="Mantenha um vocabulário consistente para análise de currículos, matching com vagas e curadoria técnica."
      />

      <Card
        title="Panorama do catálogo"
        description="Uma base organizada de skills ajuda o sistema a identificar experiência, agrupar sinônimos e comparar candidatos com mais precisão."
      >
        <div className="stats-mini">
          <div className="stat-mini">
            <div className="stat-mini-label">Skills cadastradas</div>
            <div className="stat-mini-value">{skills.length}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Verificadas</div>
            <div className="stat-mini-value">{verifiedCount}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Categorias ativas</div>
            <div className="stat-mini-value">{categories.length}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Sem categoria</div>
            <div className="stat-mini-value">{uncategorizedCount}</div>
          </div>
        </div>
      </Card>

      <Card title="Encontrar uma skill" description="Busque por nome, sinônimos ou categoria para revisar a base com mais rapidez.">
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Ex.: React, liderança, SQL..."
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button className="btn" type="submit">Buscar</button>
          {(search || categoryFilter) ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setCategoryFilter(""); }}
            >
              Limpar
            </button>
          ) : null}
        </form>
      </Card>

      {isAdmin ? (
        <Card title="Nova skill" description="Adicione novas competências ao catálogo para melhorar análise e matching.">
          <div className="card-actions">
            <button className="btn" type="button" onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); }}>
              {showCreateForm ? "Fechar formulário" : "Adicionar skill"}
            </button>
          </div>

          {showCreateForm ? (
            <form onSubmit={(e) => void handleCreate(e)} style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <label>
                Nome *
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Python, React, Liderança"
                />
              </label>
              <label>
                Categoria
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Ex.: Backend, Frontend, Gestão, Idiomas"
                />
              </label>
              <label>
                Aliases (separados por vírgula)
                <input
                  value={newAliases}
                  onChange={(e) => setNewAliases(e.target.value)}
                  placeholder="py, python3"
                />
              </label>
              {createError ? (
                <div className="alert alert-error">
                  <span className="alert-icon">✕</span>
                  <span>{createError}</span>
                </div>
              ) : null}
              <button className="btn" type="submit" disabled={saving || !newName}>
                {saving ? "Salvando..." : "Salvar skill"}
              </button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {editingSkill ? (
        <Modal title={`Editar skill: ${editingSkill.name}`} onClose={() => setEditingSkill(null)}>
          <form onSubmit={(e) => void handleEditSave(e)} style={{ display: "grid", gap: 12 }}>
            <label>
              Nome *
              <input
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label>
              Categoria
              <input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="backend, frontend, soft-skill..."
              />
            </label>
            <label>
              Aliases (separados por vírgula)
              <input
                value={editAliases}
                onChange={(e) => setEditAliases(e.target.value)}
                placeholder="alias1, alias2"
              />
            </label>
            {editError ? (
              <div className="alert alert-error">
                <span className="alert-icon">✕</span>
                <span>{editError}</span>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="submit" disabled={editSaving || !editName}>
                {editSaving ? "Salvando..." : "Salvar alterações"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setEditingSkill(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p>Tem certeza que deseja excluir esta skill? Os vínculos com vagas serão removidos.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" type="button" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
            <button className="btn" type="button" onClick={() => void confirmDelete()}>Excluir</button>
          </div>
        </Modal>
      ) : null}

      <Card
        title={`Base de skills (${skills.length})`}
        description="Revise nomes, categorias, aliases e status de validação para manter a taxonomia limpa e útil para o time."
      >
        {loading ? <p className="text-muted">Carregando...</p> : null}
        {loadError ? (
          <div className="page-error">
            <span className="page-error-icon">✕</span>
            <span>{loadError}</span>
          </div>
        ) : null}
        {!loading && !loadError && skills.length === 0 ? (
          <EmptyState
            icon="🧩"
            title="Nenhuma skill encontrada"
            description={
              search || categoryFilter
                ? "Nenhum item corresponde aos filtros aplicados no momento."
                : "Adicione as primeiras skills para começar a estruturar o vocabulário da plataforma."
            }
            note={
              search || categoryFilter
                ? "Ajuste a busca ou limpe os filtros para ampliar os resultados."
                : "Uma base bem organizada melhora análise, matching e consistência operacional."
            }
          />
        ) : null}

        {skills.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Categoria</th>
                <th>Sinônimos</th>
                <th>Curadoria</th>
                {isAdmin ? <th>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr key={skill.id}>
                  <td>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong>{skill.name}</strong>
                      <span className="text-muted">Ref. {skill.id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td>{skill.category ?? "Sem categoria"}</td>
                  <td>{skill.aliases.length ? skill.aliases.join(", ") : "Nenhum sinônimo cadastrado"}</td>
                  <td>
                    <StatusPill
                      label={skill.is_verified ? "Verificada" : "Pendente de curadoria"}
                      tone={skillVerificationTone(skill)}
                    />
                  </td>
                  {isAdmin ? (
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button className="btn btn-secondary" type="button" onClick={() => openEdit(skill)}>
                          Editar
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => void handleVerify(skill)}
                        >
                          {skill.is_verified ? "Desverificar" : "Verificar"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => setConfirmDeleteId(skill.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}
