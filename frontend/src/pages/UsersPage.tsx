import { useEffect, useState } from "react";

import { ActionMenu } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
import { usersService, CreateUserPayload, PatchUserPayload } from "../services/usersService";
import { toast } from "../services/toast";
import { UserSummary } from "../types/domain";
import { Paginated } from "../types/api";
import { UserRole, UserStatus } from "../types/auth";
import { Button } from "@/components/ui/button";

const ROLES: UserRole[] = ["admin", "recruiter", "candidate", "viewer"];
const STATUSES: UserStatus[] = ["pending_verification", "active", "suspended", "inactive"];

const EMPTY_CREATE: CreateUserPayload = { email: "", password: "", full_name: "", role: "candidate" };

function formatRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrador",
    recruiter: "Recrutador",
    candidate: "Candidato",
    viewer: "Leitor",
  };
  return labels[role] ?? role;
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    active: "Ativo",
    pending_verification: "Aguardando validação",
    suspended: "Suspenso",
    inactive: "Inativo",
  };
  return labels[status] ?? status;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "pending_verification") return "warning";
  if (status === "suspended") return "danger";
  return "neutral";
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

  useEffect(() => { void load(); }, [page, search, roleFilter]);

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
  const hasFilters = !!(search || roleFilter);

  const activeCount = items.filter((u) => u.status === "active").length;
  const adminCount = items.filter((u) => u.role === "admin").length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Acessos e usuários" subtitle="Gerencie contas, perfis e permissões" />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Usuários</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{total}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ativos na página</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{activeCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Admins na página</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{adminCount}</div>
        </div>
      </div>

      {showCreateForm ? (
        <Modal title="Criar usuário" onClose={() => setShowCreateForm(false)}>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Nome completo *
              <input
                required
                value={createForm.full_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Nome completo"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              E-mail *
              <input
                required
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@empresa.com"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Senha *
              <input
                required
                type="password"
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {createForm.password && createForm.password.length < 8 ? (
                <span className="text-xs text-red-600">Senha deve ter pelo menos 8 caracteres</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Perfil
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {ROLES.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
              </select>
            </label>
            {createError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-bold">✕</span>
                <span>{createError}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={createSaving}>
                {createSaving ? "Salvando…" : "Criar usuário"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingUser ? (
        <Modal title={`Editar: ${editingUser.full_name}`} onClose={() => setEditingUser(null)}>
          <form onSubmit={(e) => void handleEdit(e)} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Nome completo
              <input
                value={editForm.full_name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder={editingUser.full_name}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Perfil
              <select
                value={editForm.role ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value || undefined }))}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">— sem alteração —</option>
                {ROLES.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
              Status
              <select
                value={editForm.status ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value || undefined }))}
                className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">— sem alteração —</option>
                {STATUSES.map((s) => <option key={s} value={s}>{formatStatus(s)}</option>)}
              </select>
            </label>
            {editError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="font-bold">✕</span>
                <span>{editError}</span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={editSaving}>
                {editSaving ? "Salvando…" : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">Tem certeza que deseja excluir este usuário? Esta ação é irreversível.</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>Excluir</Button>
          </div>
        </Modal>
      ) : null}

      <CrudPage<UserSummary>
        onNew={() => { setShowCreateForm(true); setCreateForm(EMPTY_CREATE); setCreateError(null); }}
        newLabel="Novo usuário"
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={hasFilters ? () => { setSearch(""); setSearchInput(""); setRoleFilter(""); setPage(1); } : undefined}
        searchPlaceholder="Buscar por nome ou e-mail…"
        filters={
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">Todos os perfis</option>
            {ROLES.map((r) => <option key={r} value={r}>{formatRole(r)}</option>)}
          </select>
        }
        loading={loading}
        error={loadError}
        count={total}
        isEmpty={!loading && !loadError && items.length === 0}
        emptyIcon="🔐"
        emptyTitle="Nenhum usuário encontrado"
        emptyDescription={
          hasFilters
            ? "Nenhuma conta corresponde aos filtros aplicados."
            : "Crie os primeiros acessos para distribuir perfis e começar a operação."
        }
        emptyAction={
          hasFilters
            ? { label: "Limpar filtros", onClick: () => { setSearch(""); setSearchInput(""); setRoleFilter(""); setPage(1); } }
            : { label: "+ Novo usuário", onClick: () => { setShowCreateForm(true); setCreateForm(EMPTY_CREATE); setCreateError(null); } }
        }
        columns={["Pessoa", "Perfil", "Status", "Ações"]}
        items={items}
        renderRow={(u) => (
          <tr key={u.id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
            <td className="px-4 py-3">
              <div className="space-y-1">
                <div className="font-semibold text-gray-900">{u.full_name}</div>
                <div className="text-xs text-gray-500">{u.email}</div>
              </div>
            </td>
            <td className="px-4 py-3">
              <StatusPill label={formatRole(u.role)} tone="neutral" />
            </td>
            <td className="px-4 py-3">
              <StatusPill label={formatStatus(u.status)} tone={statusTone(u.status)} />
            </td>
            <td className="px-4 py-3 text-right">
              <ActionMenu
                buttonLabel={`Ações de ${u.full_name}`}
                items={[
                  {
                    label: "Editar",
                    onClick: () => {
                      setEditingUser(u);
                      setEditForm({ full_name: u.full_name, role: u.role, status: u.status });
                      setEditError(null);
                    },
                  },
                  u.status !== "active"
                    ? { label: "Ativar", onClick: () => void handleActivate(u.id) }
                    : { label: "Desativar", onClick: () => void handleDeactivate(u.id) },
                  { label: "Excluir", tone: "danger", onClick: () => setConfirmDeleteId(u.id) },
                ]}
              />
            </td>
          </tr>
        )}
        footer={
          total > 0 ? (
            <>
              <span className="text-sm text-gray-500">
                Página {page} de {totalPages} · {total} total
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button type="button" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Próxima
                </Button>
              </div>
            </>
          ) : undefined
        }
      />
    </div>
  );
}
