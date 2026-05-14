import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, BarChart3, CheckCircle2, FileSearch, ShieldCheck, Tags, Users } from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { usersService, UserStats } from "../services/usersService";
import { KpiCard } from "../features/admin/components/KpiCard";
import { AdminQuickAction } from "../features/admin/components/AdminQuickAction";
import { PermissionsMatrix } from "../features/admin/components/PermissionsMatrix";
import { RoleCard } from "../features/admin/components/RoleCard";
import { CandidateJobFlowDiagnosticsCard } from "../features/admin/components/CandidateJobFlowDiagnosticsCard";
import { ROLES } from "../features/admin/config/adminConfig";

export function AdminPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    void usersService.stats().then(setStats);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Painel de administração"
        subtitle="Visão geral da plataforma e controle de acessos"
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total de usuários"  value={stats?.total_users   ?? "—"} icon={<Users       className="h-4 w-4 text-blue-600" />} />
        <KpiCard label="Ativos"             value={stats?.active_users  ?? "—"} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} />
        <KpiCard label="Admins"             value={stats?.admins        ?? "—"} icon={<ShieldCheck  className="h-4 w-4 text-indigo-600" />} />
        <KpiCard label="Recrutadores"       value={stats?.recruiters    ?? "—"} icon={<Users        className="h-4 w-4 text-purple-600" />} />
        <KpiCard label="Leitores"           value={stats?.viewers       ?? "—"} icon={<Users        className="h-4 w-4 text-gray-400" />} />
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AdminQuickAction
          icon={<Users className="h-4 w-4 text-blue-600" />}
          title="Gerenciar usuários internos"
          description="Crie contas internas (admin, recrutador, leitor) e gerencie perfis de acesso da equipe."
          buttonLabel="Abrir gestão de usuários internos"
          onButtonClick={() => navigate("/admin/usuarios")}
          variant="blue"
        />

        <AdminQuickAction
          icon={<Tags className="h-4 w-4 text-purple-600" />}
          title="Cadastros"
          description="Skills, áreas e outros catálogos do sistema."
          buttonLabel="Acessar cadastros"
          onButtonClick={() => navigate("/admin/cadastros")}
          variant="default"
        />

        <AdminQuickAction
          icon={<FileSearch className="h-4 w-4 text-amber-600" />}
          title="Auditoria"
          description="Acompanhe ações realizadas no sistema, alterações de cadastros e eventos administrativos."
          buttonLabel="Ver auditoria"
          onButtonClick={() => navigate("/admin/auditoria")}
          variant="default"
        />

        <AdminQuickAction
          icon={<Activity className="h-4 w-4 text-rose-600" />}
          title="Health do Sistema"
          description="Monitore backend, filas, banco e uso de IA."
          buttonLabel="Ver health"
          onButtonClick={() => navigate("/admin/health")}
          variant="default"
        />

        <AdminQuickAction
          icon={<BarChart3 className="h-4 w-4 text-blue-600" />}
          title="BI de Recrutamento"
          description="Indicadores de vagas, candidatos, análises e uso de IA."
          buttonLabel="Ver BI"
          onButtonClick={() => navigate("/admin/bi")}
          variant="default"
        />

        <AdminQuickAction
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
          title="Como funciona o acesso"
          description="Cada usuário tem um perfil que define quais telas ele pode acessar. Para liberar ou restringir, altere o perfil na tabela de usuários."
          buttonLabel="Matriz de permissões"
          onButtonClick={() => {}}
          variant="default"
        />
      </div>

      {/* Permissions matrix */}
      <PermissionsMatrix />

      {/* Candidate+job diagnostics */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[hsl(var(--text))]">Diagnóstico operacional</h2>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Use este painel para investigar inconsistências de análise e aderência por candidata(o) e vaga.
        </p>
        <CandidateJobFlowDiagnosticsCard />
      </section>

      {/* Role cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => (
          <RoleCard key={role.key} label={role.label} description={role.description} roleKey={role.key} />
        ))}
      </div>
    </div>
  );
}
