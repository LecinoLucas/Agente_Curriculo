import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLES, SCREENS } from "../config/adminConfig";

export function PermissionsMatrix() {
  return (
    <Card className="shadow-sm bg-[hsl(var(--surface-muted))]">
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
              <tr className="border-b border-border">
                <th className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-44">
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
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{screen.label}</p>
                    <p className="text-xs text-muted-foreground">{screen.path}</p>
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
  );
}
