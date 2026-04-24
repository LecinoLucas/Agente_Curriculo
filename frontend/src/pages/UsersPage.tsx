import { useEffect, useState } from "react";

import { Card } from "../components/common/Card";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
import { usersService, CreateUserPayload, PatchUserPayload } from "../services/usersService";
import { toast } from "../services/toast";
import { UserSummary } from "../types/domain";
import { Paginated } from "../types/api";
import { UserRole, UserStatus } from "../types/auth";

const ROLES: UserRole[] = ["admin", "recruiter", "candidate", "viewer"];
const STATUSES: UserStatus[] = ["pending_verification", "active", "suspended", "inactive"];

const EMPTY_CREATE: CreateUserPayload = { email: "", password: "", full_name: "", role: "candidate" };

function formatRole(role: string) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "recruiter":
      return "Recrutador";
    case "candidate":
      return "Candidato";
    case "viewer":
      return "Leitor";
    default:
      return role;
  }
}

function formatStatus(status: string) {
  switch (status) {
    case "active":
      return "Ativo";
    case "pending_verification":
      return "Aguardando validação";
    case "suspended":
      return "Suspenso";
    case "inactive":
      return "Inativo";
    default:
      return status;
  }
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "pending_verification":
      return "warning";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [data, setData] = useState<Paginated<UserSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserPayload>(EMPTY_CREATE);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [editForm, setEditForm] = useState<PatchUserPayload>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await usersService.list(page, 20, search || undefined, roleFilter || undefined));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, roleFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateSaving(true);
    setCreateError(null);
    try {
      const created = await usersService.create(createForm);
      toast.success(`Usuário criado: ${created.full_name}`);
      setCreateForm(EMPTY_CREATE);
      setShowCreateForm(false);
      setPage(1);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const payload: PatchUserPayload = {};
      if (editForm.full_name) payload.full_name = editForm.full_name;
      if (editForm.role) payload.role = editForm.role;
      if (editForm.status) payload.status = editForm.status;

      if (Object.keys(payload).length === 0) {
        setEditError("Nenhuma alteração informada.");
        return;
      }

      const updated = await usersService.patch(editingUser.id, payload);
      toast.success(`Usuário atualizado: ${updated.full_name}`);
      setEditingUser(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Falha ao atualizar usuário");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleActivate(id: string) {
    try {
      await usersService.activate(id);
      toast.success("Usuário ativado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ativar usuário");
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await usersService.deactivate(id);
      toast.success("Usuário desativado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desativar usuário");
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const user = data?.data.find((u) => u.id === confirmDeleteId);
    try {
      await usersService.delete(confirmDeleteId);
      toast.success(`Usuário "${user?.full_name ?? ""}" excluído`);
      setConfirmDeleteId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir usuário");
      setConfirmDeleteId(null);
    }
  }

  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const items = data?.data ?? [];
  const activeCount = items.filter((user) => user.status === "active").length;
  const pendingCount = items.filter((user) => user.status === "pending_verification").length;
  const restrictedCount = items.filter((user) => user.status === "suspended" || user.status === "inactive").length;

  return (
    <div className="page-grid">
      <PageHeader
        title="Acessos e usuários"
        subtitle="Gerencie quem entra na plataforma, com qual perfil e em que estado de ativação cada conta se encontra."
      />

      <Card
        title="Governança de acesso"
        description="Use esta área para manter o ambiente seguro, distribuir permissões com clareza e acompanhar a saúde da base de contas."
      >
        <div className="stats-mini">
          <div className="stat-mini">
            <div className="stat-mini-label">Usuários na página</div>
            <div className="stat-mini-value">{items.length}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Ativos</div>
            <div className="stat-mini-value">{activeCount}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Aguardando validação</div>
            <div className="stat-mini-value">{pendingCount}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Restritos</div>
            <div className="stat-mini-value">{restrictedCount}</div>
          </div>
        </div>
      </Card>

      <div className="toolbar-row" style={{ alignItems: "center" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            style={{ flex: 1, minWidth: 200 }}
          />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">Todos os perfis</option>
            {ROLES.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
          </select>
          <button className="btn" type="submit">Buscar</button>
          {(search || roleFilter) ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setRoleFilter(""); setPage(1); }}
            >
              Limpar
            </button>
          ) : null}
        </form>
        <button
          className="btn"
          type="button"
          onClick={() => { setShowCreateForm(true); setCreateForm(EMPTY_CREATE); setCreateError(null); }}
        >
          + Novo usuário
        </button>
      </div>

      {loadError ? (
        <div className="page-error">
          <span className="page-error-icon">✕</span>
          <span>{loadError}</span>
        </div>
      ) : null}

      {showCreateForm ? (
        <Modal title="Criar usuário" onClose={() => setShowCreateForm(false)}>
          <form onSubmit={(e) => void handleCreate(e)} style={{ display: "grid", gap: 12 }}>
            <label>
              Nome completo *
              <input
                required
                value={createForm.full_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Nome completo"
              />
            </label>
            <label>
              E-mail *
              <input
                required
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@empresa.com"
              />
            </label>
            <label>
              Senha *
              <input
                required
                type="password"
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
              />
              <span className="field-error" style={{ display: createForm.password && createForm.password.length < 8 ? "block" : "none" }}>
                Senha deve ter pelo menos 8 caracteres
              </span>
            </label>
            <label>
              Perfil
              <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                {ROLES.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
              </select>
            </label>
            {createError ? (
              <div className="alert alert-error">
                <span className="alert-icon">✕</span>
                <span>{createError}</span>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="submit" disabled={createSaving}>
                {createSaving ? "Salvando..." : "Criar usuário"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingUser ? (
        <Modal title={`Editar: ${editingUser.full_name}`} onClose={() => setEditingUser(null)}>
          <form onSubmit={(e) => void handleEdit(e)} style={{ display: "grid", gap: 12 }}>
            <label>
              Nome completo
              <input
                value={editForm.full_name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder={editingUser.full_name}
              />
            </label>
            <label>
              Perfil
              <select
                value={editForm.role ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value || undefined }))}
              >
                <option value="">— sem alteração —</option>
                {ROLES.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
              </select>
            </label>
            <label>
              Status
              <select
                value={editForm.status ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value || undefined }))}
              >
                <option value="">— sem alteração —</option>
                {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
              </select>
            </label>
            {editError ? (
              <div className="alert alert-error">
                <span className="alert-icon">✕</span>
                <span>{editError}</span>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" type="submit" disabled={editSaving}>
                {editSaving ? "Salvando..." : "Salvar alterações"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setEditingUser(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p>Tem certeza que deseja excluir este usuário? Esta ação é irreversível.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" type="button" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
            <button className="btn" type="button" onClick={() => void handleDelete()}>Excluir</button>
          </div>
        </Modal>
      ) : null}

      <Card
        title={`Base de usuários (${total})`}
        description="Acompanhe perfis, status de acesso e ações administrativas disponíveis para cada conta."
      >

        {loading ? <p className="text-muted">Carregando...</p> : null}
        {!loading && items.length === 0 && !loadError ? (
          <EmptyState
            icon="🔐"
            title="Nenhum usuário encontrado"
            description={
              search || roleFilter
                ? "Nenhuma conta corresponde aos filtros aplicados."
                : "Crie os primeiros acessos para distribuir perfis e começar a operação com governança."
            }
            note={
              search || roleFilter
                ? "Você pode limpar os filtros para voltar a visualizar toda a base."
                : "Perfis bem definidos ajudam a manter a plataforma segura e organizada."
            }
          />
        ) : null}

        {items.length > 0 ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{u.full_name}</strong>
                        <span className="text-muted">{u.email}</span>
                      </div>
                    </td>
                    <td><StatusPill label={formatRole(u.role)} tone="neutral" /></td>
                    <td>
                      <StatusPill label={formatStatus(u.status)} tone={statusTone(u.status)} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => {
                            setEditingUser(u);
                            setEditForm({ full_name: u.full_name, role: u.role, status: u.status });
                            setEditError(null);
                          }}
                        >
                          Editar
                        </button>
                        {u.status !== "active" ? (
                          <button className="btn btn-secondary" type="button" onClick={() => void handleActivate(u.id)}>
                            Ativar
                          </button>
                        ) : (
                          <button className="btn btn-secondary" type="button" onClick={() => void handleDeactivate(u.id)}>
                            Desativar
                          </button>
                        )}
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => setConfirmDeleteId(u.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="toolbar-row" style={{ marginTop: 12, alignItems: "center" }}>
              <div className="pagination-summary">
                Página {page} de {totalPages} • {total} total
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </button>
                <button className="btn" type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
