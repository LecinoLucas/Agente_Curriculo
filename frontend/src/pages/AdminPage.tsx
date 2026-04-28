import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ShieldCheck, Users } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../components/common/PageHeader";
import { usersService, UserStats } from "../services/usersService";

// ── Static data ──────────────────────────────────────────────────────
type Role = "admin" | "recruiter" | "candidate" | "viewer";

const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "admin",     label: "Administrador", description: "Acesso total à plataforma" },
  { key: "recruiter", label: "Recrutador",    description: "Operação de recrutamento" },
  { key: "candidate", label: "Candidato",     description: "Acesso às próprias informações" },
  { key: "viewer",    label: "Leitor",         description: "Somente leitura" },
];

const SCREENS: { label: string; path: string; roles: Role[] }[] = [
  { label: "Pipeline",      path: "/pipeline",    roles: ["admin", "recruiter", "viewer"] },
  { label: "Candidatos",    path: "/candidatos",  roles: ["admin", "recruiter", "viewer"] },
  { label: "Vagas",         path: "/vagas",       roles: ["admin", "recruiter", "viewer"] },
  { label: "Análises IA",   path: "/analises-ia", roles: ["admin", "recruiter"] },
  { label: "Meu perfil",    path: "/perfil",      roles: ["admin", "recruiter", "candidate", "viewer"] },
  { label: "Administração", path: "/admin",       roles: ["admin"] },
];

// ── AdminPage ────────────────────────────────────────────────────────
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

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total de usuários"  value={stats?.total_users   ?? "—"} icon={<Users       className="h-4 w-4 text-blue-600" />} />
        <KpiCard label="Ativos"             value={stats?.active_users  ?? "—"} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} />
        <KpiCard label="Admins"             value={stats?.admins        ?? "—"} icon={<ShieldCheck  className="h-4 w-4 text-indigo-600" />} />
        <KpiCard label="Recrutadores"       value={stats?.recruiters    ?? "—"} icon={<Users        className="h-4 w-4 text-purple-600" />} />
        <KpiCard label="Leitores"           value={stats?.viewers       ?? "—"} icon={<Users        className="h-4 w-4 text-gray-400" />} />
      </div>

      {/* ── Quick actions ───────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm dark:border-indigo-900/30 dark:from-indigo-950/30 dark:to-blue-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-blue-600" />
              Gerenciar usuários
            </CardTitle>
            <CardDescription>
              Crie contas, ajuste perfis de acesso e ative ou desative usuários diretamente na tabela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/usuarios")}>
              Abrir gestão de usuários
            </Button>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Como funciona o acesso
            </CardTitle>
            <CardDescription>
              Cada usuário tem um perfil que define quais telas ele pode acessar.
              Para liberar ou restringir, altere o perfil na tabela de usuários.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Consulte a matriz de permissões abaixo para ver as regras por perfil.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Permissions matrix ──────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Matriz de permissões</CardTitle>
          <CardDescription>
            Quais telas cada perfil pode acessar — altere o perfil do usuário para liberar ou restringir.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-44">
                    Tela
                  </th>
                  {ROLES.map((r) => (
                    <th
                      key={r.key}
                      className="h-11 px-4 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      <div>{r.label}</div>
                      <div className="font-normal normal-case text-gray-400 mt-0.5">{r.description}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREENS.map((screen) => (
                  <tr
                    key={screen.path}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{screen.label}</p>
                      <p className="text-xs text-gray-400">{screen.path}</p>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role.key} className="px-4 py-3 text-center">
                        {screen.roles.includes(role.key) ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold mx-auto dark:bg-green-900/30 dark:text-green-400">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-400 text-xs mx-auto dark:bg-gray-800">
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Role cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => {
          const accessible = SCREENS.filter((s) => s.roles.includes(role.key));
          return (
            <Card key={role.key} className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{role.label}</CardTitle>
                <CardDescription className="text-xs">{role.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1">
                  {accessible.map((s) => (
                    <li key={s.path} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="text-green-500">✓</span>
                      {s.label}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
