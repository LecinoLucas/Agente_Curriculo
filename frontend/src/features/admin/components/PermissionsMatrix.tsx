import { useState, useEffect } from "react";
import { Plus, Trash2, RotateCcw, Search, Check, X, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLES, SCREENS, type Role } from "../config/adminConfig";

export function PermissionsMatrix() {
  const [screens, setScreens] = useState<{ label: string; path: string; roles: Role[] }[]>(() => {
    try {
      const saved = localStorage.getItem("app_screens_config");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    // Fallback padrão se não houver dados no localStorage
    try {
      localStorage.setItem("app_screens_config", JSON.stringify(SCREENS));
    } catch {}
    return SCREENS;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPath, setNewPath] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const saveConfig = (newConfig: typeof screens) => {
    setScreens(newConfig);
    localStorage.setItem("app_screens_config", JSON.stringify(newConfig));
    // Dispatch custom event to notify AppRouter and AppShell in real-time
    window.dispatchEvent(new Event("screens-config-changed"));
  };

  const handleToggleRole = (screenPath: string, role: Role) => {
    // Admin cannot block their own access to /admin to prevent permanent lockout
    if (role === "admin" && screenPath.startsWith("/admin")) {
      return;
    }

    const updated = screens.map((s) => {
      if (s.path === screenPath) {
        const hasRole = s.roles.includes(role);
        const newRoles = hasRole
          ? s.roles.filter((r) => r !== role)
          : [...s.roles, role];
        return { ...s, roles: newRoles };
      }
      return s;
    });
    saveConfig(updated);
  };

  const handleAddScreen = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!newLabel.trim() || !newPath.trim()) {
      setErrorMsg("Preencha todos os campos.");
      return;
    }

    // Standardize path to start with /
    let formattedPath = newPath.trim();
    if (!formattedPath.startsWith("/")) {
      formattedPath = "/" + formattedPath;
    }

    // Check if path already exists
    if (screens.some((s) => s.path === formattedPath)) {
      setErrorMsg("Esta rota/caminho já está cadastrada.");
      return;
    }

    const newScreen = {
      label: newLabel.trim(),
      path: formattedPath,
      roles: ["admin" as Role], // Admin defaults to have access
    };

    const updated = [...screens, newScreen];
    saveConfig(updated);
    
    // Clear form
    setNewLabel("");
    setNewPath("");
    setIsAdding(false);
  };

  const handleDeleteScreen = (screenPath: string) => {
    // Prevent deleting essential pages
    const essentialPaths = ["/admin", "/perfil", "/rh"];
    if (essentialPaths.includes(screenPath)) {
      alert("Esta é uma tela essencial do sistema e não pode ser excluída.");
      return;
    }

    if (window.confirm("Deseja realmente remover esta tela e revogar todas as permissões dela?")) {
      const updated = screens.filter((s) => s.path !== screenPath);
      saveConfig(updated);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm("Deseja restaurar as telas e permissões padrão do sistema? Todas as telas customizadas serão removidas.")) {
      saveConfig(SCREENS);
      setSearchQuery("");
      setIsAdding(false);
    }
  };

  // Filtered screens
  const filteredScreens = screens.filter(
    (s) =>
      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="shadow-sm border border-border bg-surface">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-6">
        <div>
          <CardTitle className="text-lg font-bold text-text">
            Controle Dinâmico de Telas e Acessos
          </CardTitle>
          <CardDescription className="text-sm text-text-muted">
            Adicione novas rotas, exclua telas customizadas e bloqueie ou libere acessos para cada tipo de perfil.
          </CardDescription>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Tela
          </button>
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition hover:bg-surface-muted"
          >
            <RotateCcw className="h-3.5 w-3.5 text-text-muted" />
            Restaurar Padrões
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6 pt-0">
        {/* Form para adicionar nova tela */}
        {isAdding && (
          <form
            onSubmit={handleAddScreen}
            className="rounded-xl border border-border bg-[hsl(var(--surface-muted))/0.5] p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text">
                Cadastrar Nova Tela Customizada
              </h3>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-xs text-text-muted hover:text-text"
              >
                Cancelar
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Nome Amigável da Tela (Label)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Treinamento Interno"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Caminho da Rota (URL Path)
                </label>
                <input
                  type="text"
                  placeholder="Ex: /admin/treinamentos"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs font-medium text-rose-600 flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90"
              >
                Confirmar Cadastro
              </button>
            </div>
          </form>
        )}

        {/* Barra de pesquisa */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Pesquisar por tela ou rota..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-4 text-sm text-text placeholder-[hsl(var(--text-muted))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
          />
        </div>

        {/* Tabela de Matriz */}
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[hsl(var(--surface-muted))/0.5]">
                <th className="h-12 px-4 text-left text-xs font-bold uppercase tracking-wider text-text-muted w-52">
                  Tela / Rota
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r.key}
                    className="h-12 px-2 text-center text-xs font-bold uppercase tracking-wider text-text-muted"
                  >
                    <div>{r.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredScreens.length === 0 ? (
                <tr>
                  <td colSpan={ROLES.length + 1} className="py-8 text-center text-sm text-text-muted">
                    Nenhuma tela encontrada para a pesquisa.
                  </td>
                </tr>
              ) : (
                filteredScreens.map((screen) => (
                  <tr
                    key={screen.path}
                    className="border-b border-border last:border-0 hover:bg-[hsl(var(--surface-muted))/0.3] transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-text">{screen.label}</p>
                      <p className="text-xs font-mono text-text-muted mt-0.5">{screen.path}</p>
                    </td>

                    {ROLES.map((role) => {
                      const isAllowed = screen.roles.includes(role.key);
                      const isEssentialAdminRoute = role.key === "admin" && screen.path.startsWith("/admin");
                      
                      return (
                        <td key={role.key} className="px-2 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleRole(screen.path, role.key)}
                            disabled={isEssentialAdminRoute}
                            title={isEssentialAdminRoute ? "Acesso administrative obrigatório para esta rota" : `Clique para ${isAllowed ? "remover" : "liberar"} acesso`}
                            className={[
                              "inline-flex h-7 w-7 items-center justify-center rounded-full transition-all",
                              isAllowed
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-surface-muted text-text-muted hover:bg-rose-100 hover:text-rose-700",
                              isEssentialAdminRoute ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                            ].join(" ")}
                          >
                            {isAllowed ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
