import { useEffect, useState } from "react";

import { ActionMenu } from "../common/ActionMenu";
import { CrudPage } from "../common/CrudPage";
import { Modal } from "../common/Modal";
import { usersService, CreateUserPayload, PatchUserPayload } from "../../services/usersService";
import { toast } from "../../services/toast";
import { Paginated } from "../../types/api";
import { UserSummary } from "../../types/domain";
import { UserRole, UserStatus } from "../../types/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────
const ROLES: UserRole[] = ["admin", "recruiter", "viewer", "candidate"];
const STATUSES: UserStatus[] = ["active", "pending_verification", "suspended", "inactive"];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer: "Leitor",
};

const ROLE_CLASS: Record<string, string> = {
  admin:     "bg-indigo-50 text-indigo-700 border-indigo-200",
  recruiter: "bg-purple-50 text-purple-700 border-purple-200",
  viewer:    "bg-gray-100 text-gray-600 border-gray-200",
  candidate: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABEL: Record<string, string> = {
  active:               "Ativo",
  pending_verification: "Aguardando validação",
  suspended:            "Suspenso",
  inactive:             "Inativo",
};

const STATUS_CLASS: Record<string, string> = {
  active:               "bg-green-50 text-green-700 border-green-200",
  pending_verification: "bg-amber-50 text-amber-700 border-amber-200",
  suspended:            "bg-red-50 text-red-700 border-red-200",
  inactive:             "bg-gray-100 text-gray-500 border-gray-200",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", ROLE_CLASS[role] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_CLASS[status] ?? "bg-gray-100 text-gray-500 border-gray-200")}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

// ── Field components ───────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
      {label}
      {children}
    </label>
  );
}

const inputCls =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const selectCls =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

const filterSelectCls =
  "h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="font-bold">!</span>
      <span>{message}</span>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────
const EMPTY_CREATE: CreateUserPayload = { email: "", password: "", full_name: "", role: "recruiter" };

type UserManagementPanelProps = {
  showSummaryCards?: boolean;
};

// ── Main component ─────────────────────────────────────────────────────
export function UserManagementPanel({ showSummaryCards = true }: UserManagementPanelProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
      setData(
        await usersService.list(
          page,
          20,
          search || undefined,
          roleFilter || undefined,
          statusFilter || undefined,
        ),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, search, roleFilter, statusFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function clearFilters() {
    setSearch("");
    setSearchInput("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
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
      if (editForm.full_name && editForm.full_name !== editingUser.full_name) {
        payload.full_name = editForm.full_name;
      }
      if (editForm.role && editForm.role !== editingUser.role) {
        payload.role = editForm.role;
      }
      if (Object.keys(payload).length === 0) {
        setEditError("Nenhuma alteração detectada.");
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
    const user = data?.data.find((item) => item.id === confirmDeleteId);
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
  const hasFilters = !!(search || roleFilter || statusFilter);

  const activeCount = items.filter((u) => u.status === "active").length;
  const adminCount  = items.filter((u) => u.role === "admin").length;

  return (
    <div className="space-y-6">
      {/* ── Summary cards ──────────────────────────────────────── */}
      {showSummaryCards ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Total de usuários" value={total} />
          <SummaryCard label="Ativos nesta página" value={activeCount} />
          <SummaryCard label="Admins nesta página" value={adminCount} />
        </div>
      ) : null}

      {/* ── Create modal ───────────────────────────────────────── */}
      {showCreateForm ? (
        <Modal title="Novo usuário" onClose={() => setShowCreateForm(false)}>
          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
            <FormField label="Nome completo *">
              <input
                required
                value={createForm.full_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Nome completo"
                className={inputCls}
              />
            </FormField>
            <FormField label="E-mail *">
              <input
                required
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@empresa.com"
                className={inputCls}
              />
            </FormField>
            <FormField label="Senha *">
              <input
                required
                type="password"
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                className={inputCls}
              />
              {createForm.password && createForm.password.length < 8 ? (
                <span className="text-xs text-red-600">Mínimo 8 caracteres</span>
              ) : null}
            </FormField>
            <FormField label="Perfil">
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className={selectCls}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </FormField>
            {createError ? <InlineError message={createError} /> : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={createSaving}>
                {createSaving ? "Criando..." : "Criar usuário"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ── Edit modal ─────────────────────────────────────────── */}
      {editingUser ? (
        <Modal title={`Editar: ${editingUser.full_name}`} onClose={() => setEditingUser(null)}>
          <form onSubmit={(e) => void handleEdit(e)} className="flex flex-col gap-4">
            <FormField label="Nome completo">
              <input
                value={editForm.full_name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder={editingUser.full_name}
                className={inputCls}
              />
            </FormField>
            <FormField label="Perfil de acesso">
              <select
                value={editForm.role ?? editingUser.role}
                onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                className={selectCls}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </FormField>
            <p className="text-xs text-gray-400">
              Para ativar ou desativar o usuário, use a opção correspondente no menu de ações da tabela.
            </p>
            {editError ? <InlineError message={editError} /> : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="submit" disabled={editSaving}>
                {editSaving ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ── Delete confirm ─────────────────────────────────────── */}
      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja excluir este usuário? Esta ação é irreversível.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()}>
              Excluir permanentemente
            </Button>
          </div>
        </Modal>
      ) : null}

      {/* ── Table ──────────────────────────────────────────────── */}
      <CrudPage<UserSummary>
        onNew={() => {
          setShowCreateForm(true);
          setCreateForm(EMPTY_CREATE);
          setCreateError(null);
        }}
        newLabel="Novo usuário"
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={hasFilters ? clearFilters : undefined}
        searchPlaceholder="Buscar por nome ou e-mail..."
        filters={
          <>
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className={filterSelectCls}
            >
              <option value="">Todos os perfis</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className={filterSelectCls}
            >
              <option value="">Todos os status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </>
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
            ? { label: "Limpar filtros", onClick: clearFilters }
            : {
                label: "+ Novo usuário",
                onClick: () => {
                  setShowCreateForm(true);
                  setCreateForm(EMPTY_CREATE);
                  setCreateError(null);
                },
              }
        }
        columns={[
          "Usuário",
          { header: "Perfil",       className: "w-36" },
          { header: "Status",       className: "w-40" },
          { header: "Criado em",    className: "w-32 hidden lg:table-cell" },
          { header: "Último acesso", className: "w-32 hidden xl:table-cell" },
          { header: "Ações",         className: "w-20 text-right" },
        ]}
        items={items}
        renderRow={(user) => (
          <tr
            key={user.id}
            className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
          >
            {/* Usuário */}
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Initials name={user.full_name} />
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {user.full_name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                </div>
              </div>
            </td>

            {/* Perfil */}
            <td className="px-4 py-3">
              <RoleBadge role={user.role} />
            </td>

            {/* Status */}
            <td className="px-4 py-3">
              <StatusBadge status={user.status} />
            </td>

            {/* Criado em */}
            <td className="hidden px-4 py-3 text-sm text-gray-500 lg:table-cell">
              {formatDate(user.created_at)}
            </td>

            {/* Último acesso */}
            <td className="hidden px-4 py-3 text-sm text-gray-500 xl:table-cell">
              {formatDate(user.last_login_at)}
            </td>

            {/* Ações */}
            <td className="px-4 py-3 text-right">
              <ActionMenu
                buttonLabel={`Ações de ${user.full_name}`}
                items={[
                  {
                    label: "Editar nome / perfil",
                    onClick: () => {
                      setEditingUser(user);
                      setEditForm({ full_name: user.full_name, role: user.role });
                      setEditError(null);
                    },
                  },
                  user.status !== "active"
                    ? { label: "Ativar conta", onClick: () => void handleActivate(user.id) }
                    : { label: "Desativar conta", onClick: () => void handleDeactivate(user.id) },
                  { label: "Excluir", tone: "danger", onClick: () => setConfirmDeleteId(user.id) },
                ]}
              />
            </td>
          </tr>
        )}
        footer={
          total > 0 ? (
            <div className="flex w-full items-center justify-between">
              <span className="text-sm text-gray-500">
                Página {page} de {totalPages} · {total} {total === 1 ? "usuário" : "usuários"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
