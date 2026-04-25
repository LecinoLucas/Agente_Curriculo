import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../components/common/PageHeader";

type Role = "admin" | "recruiter" | "candidate" | "viewer";

const ROLES: { key: Role; label: string; description: string }[] = [
  { key: "admin", label: "Administrador", description: "Acesso total à plataforma" },
  { key: "recruiter", label: "Recrutador", description: "Operação de recrutamento" },
  { key: "candidate", label: "Candidato", description: "Acesso às próprias informações" },
  { key: "viewer", label: "Visualizador", description: "Somente leitura" },
];

const SCREENS: { label: string; path: string; roles: Role[] }[] = [
  { label: "Visão geral", path: "/dashboard", roles: ["admin", "recruiter", "candidate", "viewer"] },
  { label: "Documentos", path: "/curriculos", roles: ["admin", "recruiter", "candidate"] },
  { label: "Análises", path: "/analises", roles: ["admin", "recruiter", "candidate", "viewer"] },
  { label: "Vagas", path: "/vagas", roles: ["admin", "recruiter", "viewer"] },
  { label: "Cadastros", path: "/cadastros", roles: ["admin", "recruiter"] },
  { label: "Administração", path: "/admin", roles: ["admin"] },
];

export function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Administração"
        subtitle="Gerencie usuários, perfis de acesso e permissões da plataforma"
      />

      {/* Quick actions */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Gerenciar usuários</CardTitle>
            <CardDescription>
              Crie, edite e controle os acessos de cada pessoa na plataforma.
              A tela que um usuário pode ver é definida pelo perfil atribuído a ele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/usuarios")}>
              Acessar usuários
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Como funciona o acesso</CardTitle>
            <CardDescription>
              Cada usuário tem um perfil (role) que define quais telas ele pode acessar.
              Para liberar ou restringir acesso, altere o perfil do usuário.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Consulte a tabela abaixo para ver as permissões de cada perfil.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Permissions matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Matriz de permissões</CardTitle>
          <CardDescription>
            Quais telas cada perfil pode acessar — altere o perfil do usuário para liberar ou restringir
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-40">
                    Tela
                  </th>
                  {ROLES.map((r) => (
                    <th
                      key={r.key}
                      className="h-11 px-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      <div>{r.label}</div>
                      <div className="font-normal normal-case text-muted-foreground/70 mt-0.5">{r.description}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREENS.map((screen) => (
                  <tr key={screen.path} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{screen.label}</p>
                      <p className="text-xs text-muted-foreground">{screen.path}</p>
                    </td>
                    {ROLES.map((role) => (
                      <td key={role.key} className="px-4 py-3 text-center">
                        {screen.roles.includes(role.key) ? (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-100 text-green-700 text-xs font-bold mx-auto">
                            ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted text-muted-foreground text-xs mx-auto">
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

      {/* Role descriptions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => {
          const accessible = SCREENS.filter((s) => s.roles.includes(role.key));
          return (
            <Card key={role.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{role.label}</CardTitle>
                <CardDescription>{role.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1">
                  {accessible.map((s) => (
                    <li key={s.path} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="text-green-600">✓</span>
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
