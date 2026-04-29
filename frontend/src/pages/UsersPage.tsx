import { UserManagementPanel } from "../components/admin/UserManagementPanel";
import { PageHeader } from "../components/common/PageHeader";

export function UsersPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Usuários internos" subtitle="Gerencie contas de acesso interno — recrutadores, administradores e leitores" />
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
        Usuários internos são contas que acessam o sistema (recrutadores, administradores, etc).
        Candidatos são gerenciados separadamente em{" "}
        <span className="font-medium">/candidatos</span> e não possuem acesso ao sistema.
      </div>
      <UserManagementPanel />
    </div>
  );
}
