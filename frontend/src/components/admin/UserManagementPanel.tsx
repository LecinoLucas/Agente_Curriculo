import { RefreshCw } from "lucide-react";
import { CrudPage } from "../common/CrudPage";
import { ActionMenu } from "../common/ActionMenu";
import { useUsersPage } from "../../features/users/hooks/useUsersPage";
import { useUserForm } from "../../features/users/hooks/useUserForm";
import { useUserPasswordForm } from "../../features/users/hooks/useUserPasswordForm";
import { CreateUserModal } from "../../features/users/components/CreateUserModal";
import { EditUserModal } from "../../features/users/components/EditUserModal";
import { ConfirmDeleteModal } from "../../features/users/components/ConfirmDeleteModal";
import { SummaryCard } from "../../features/users/components/SummaryCard";
import { RoleBadge } from "../../features/users/components/RoleBadge";
import { StatusBadge } from "../../features/users/components/StatusBadge";
import { Initials } from "../../features/users/components/Initials";
import { ROLES, ROLE_LABEL, STATUS_LABEL, filterSelectCls, formatDate } from "../../features/users/utils/userFormatters";
import { UserSummary } from "../../types/domain";

type UserManagementPanelProps = {
  showSummaryCards?: boolean;
};

export function UserManagementPanel({ showSummaryCards = true }: UserManagementPanelProps) {
  const usersPage = useUsersPage();
  const userForm = useUserForm(usersPage.load);
  const passwordForm = useUserPasswordForm(usersPage.load);

  const renderSecurityBadge = (user: UserSummary) => {
    if (user.must_change_password) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          <RefreshCw className="h-3.5 w-3.5" />
          Troca obrigatória
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        Acesso regular
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {showSummaryCards ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Total de usuários" value={usersPage.total} />
          <SummaryCard label="Ativos nesta página" value={usersPage.activeCount} />
          <SummaryCard label="Troca obrigatória pendente" value={usersPage.pendingPasswordCount} />
        </div>
      ) : null}

      <CreateUserModal
        isOpen={userForm.showCreateForm}
        onClose={userForm.closeCreateModal}
        form={userForm.createForm}
        onFormChange={userForm.setCreateForm}
        saving={userForm.createSaving}
        error={userForm.createError}
        passwordVisible={userForm.createPasswordVisible}
        onTogglePasswordVisibility={() => userForm.setCreatePasswordVisible(!userForm.createPasswordVisible)}
        strength={userForm.createStrength}
        onSubmit={userForm.handleCreate}
      />

      <EditUserModal
        user={userForm.editingUser}
        onClose={userForm.closeEditModal}
        editForm={userForm.editForm}
        onEditFormChange={userForm.setEditForm}
        editSaving={userForm.editSaving}
        editError={userForm.editError}
        onEditSubmit={userForm.handleEdit}
        resetPasswordForm={passwordForm.resetPasswordForm}
        onResetPasswordFormChange={passwordForm.setResetPasswordForm}
        resetPasswordVisible={passwordForm.resetPasswordVisible}
        onToggleResetPasswordVisibility={() => passwordForm.setResetPasswordVisible(!passwordForm.resetPasswordVisible)}
        resetSaving={passwordForm.resetSaving}
        resetError={passwordForm.resetError}
        resetStrength={passwordForm.resetStrength}
        onResetPasswordSubmit={() =>
          userForm.editingUser
            ? passwordForm.handleResetPassword(userForm.editingUser.id, userForm.editingUser.full_name)
            : Promise.resolve()
        }
      />

      <ConfirmDeleteModal
        isOpen={!!usersPage.confirmDeleteId}
        onClose={() => usersPage.setDeleteId(null)}
        onConfirm={usersPage.handleDelete}
      />

      <CrudPage<UserSummary>
        onNew={userForm.openCreateModal}
        newLabel="Novo usuário"
        searchInput={usersPage.searchInput}
        onSearchInputChange={usersPage.setSearchInput}
        onSearchSubmit={usersPage.handleSearchSubmit}
        onSearchClear={usersPage.hasFilters ? usersPage.clearFilters : undefined}
        searchPlaceholder="Buscar por nome ou e-mail..."
        filters={
          <>
            <select
              value={usersPage.roleFilter}
              onChange={(event) => {
                usersPage.setRoleFilter(event.target.value);
                usersPage.setPage(1);
              }}
              className={filterSelectCls}
            >
              <option value="">Todos os perfis</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
            <select
              value={usersPage.statusFilter}
              onChange={(event) => {
                usersPage.setStatusFilter(event.target.value);
                usersPage.setPage(1);
              }}
              className={filterSelectCls}
            >
              <option value="">Todos os status</option>
              {["active", "pending_verification", "suspended", "inactive"].map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </>
        }
        loading={usersPage.loading}
        error={usersPage.loadError}
        count={usersPage.total}
        isEmpty={!usersPage.loading && !usersPage.loadError && usersPage.items.length === 0}
        emptyIcon="🔐"
        emptyTitle="Nenhum usuário encontrado"
        emptyDescription={
          usersPage.hasFilters
            ? "Nenhuma conta corresponde aos filtros aplicados."
            : "Crie os primeiros acessos para distribuir perfis e começar a operação."
        }
        emptyAction={
          usersPage.hasFilters
            ? { label: "Limpar filtros", onClick: usersPage.clearFilters }
            : { label: "+ Novo usuário", onClick: userForm.openCreateModal }
        }
        columns={[
          "Usuário",
          { header: "Perfil", className: "w-36" },
          { header: "Status", className: "w-40" },
          { header: "Segurança", className: "w-44 hidden lg:table-cell" },
          { header: "Último acesso", className: "w-32 hidden xl:table-cell" },
          { header: "Ações", className: "w-20 text-right" },
        ]}
        items={usersPage.items}
        renderRow={(user) => (
          <tr key={user.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Initials name={user.full_name} />
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.full_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <RoleBadge role={user.role} />
            </td>
            <td className="px-4 py-3">
              <StatusBadge status={user.status} />
            </td>
            <td className="hidden px-4 py-3 lg:table-cell">{renderSecurityBadge(user)}</td>
            <td className="hidden px-4 py-3 text-sm text-gray-500 xl:table-cell">{formatDate(user.last_login_at)}</td>
            <td className="px-4 py-3 text-right">
              <ActionMenu
                buttonLabel={`Ações de ${user.full_name}`}
                items={[
                  { label: "Editar usuário", onClick: () => userForm.openEditModal(user) },
                  user.status !== "active"
                    ? { label: "Ativar conta", onClick: () => void usersPage.handleActivate(user.id) }
                    : { label: "Desativar conta", onClick: () => void usersPage.handleDeactivate(user.id) },
                  { label: "Excluir", tone: "danger", onClick: () => usersPage.setDeleteId(user.id) },
                ]}
              />
            </td>
          </tr>
        )}
        footer={
          usersPage.total > 0 ? (
            <div className="flex w-full items-center justify-between">
              <span className="text-sm text-gray-500">
                Página {usersPage.page} de {usersPage.totalPages} · {usersPage.total}{" "}
                {usersPage.total === 1 ? "usuário" : "usuários"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => usersPage.setPage(Math.max(1, usersPage.page - 1))}
                  disabled={usersPage.page <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => usersPage.setPage(Math.min(usersPage.totalPages, usersPage.page + 1))}
                  disabled={usersPage.page >= usersPage.totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
