import { UserManagementPanel } from "../components/admin/UserManagementPanel";
import { PageHeader } from "../components/common/PageHeader";

export function UsersPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Acessos e usuários" subtitle="Gerencie contas, perfis e permissões" />
      <UserManagementPanel />
    </div>
  );
}
