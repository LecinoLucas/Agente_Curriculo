import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "../../features/auth/useAuth";
import { UserRole } from "../../types/auth";

type NavItem = {
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { to: "/pipeline", label: "Pipeline", caption: "Candidatos e fluxo de admissão", roles: ["admin", "recruiter", "viewer"] },
  { to: "/candidatos", label: "Candidatos", caption: "Listagem e gestão de candidatos", roles: ["admin", "recruiter", "viewer"] },
  { to: "/vagas", label: "Vagas", caption: "Oportunidades abertas", roles: ["admin", "recruiter", "viewer"] },
  { to: "/analises-ia", label: "Análises IA", caption: "Execuções e status da IA", roles: ["admin", "recruiter"] },
  { to: "/perfil", label: "Meu perfil", caption: "Dados da conta", roles: ["admin", "recruiter", "candidate", "viewer"] },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/admin", label: "Painel admin", caption: "Visão geral e permissões", roles: ["admin"] },
  { to: "/admin/usuarios", label: "Usuários", caption: "Contas e acessos", roles: ["admin"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer: "Visualizador",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );
  const visibleAdminItems = ADMIN_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );

  function navLink(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/admin"}
        className={({ isActive }) =>
          cn(
            "flex flex-col rounded-xl px-3 py-3 text-sm transition-colors",
            isActive
              ? "bg-white/10 text-white font-medium ring-1 ring-inset ring-white/10"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          )
        }
      >
        <span className="font-semibold leading-tight tracking-tight">{item.label}</span>
        <span className="mt-0.5 text-xs leading-tight text-slate-400">{item.caption}</span>
      </NavLink>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-blue-950/10 bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 text-white">
        <div className="flex flex-col flex-1 gap-6 overflow-y-auto px-4 py-6">
          {/* Brand */}
          <div className="px-2">
            <h1 className="text-lg font-extrabold font-display tracking-tight text-white">
              Resume AI
            </h1>
            <p className="mt-0.5 text-xs leading-snug text-slate-300">
              Plataforma de recrutamento
            </p>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {visibleItems.map(navLink)}
          </nav>

          {/* Admin section */}
          {visibleAdminItems.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">
                Administração
              </p>
              {visibleAdminItems.map(navLink)}
            </div>
          ) : null}
        </div>

        {/* Logout */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex shrink-0 items-center justify-end gap-3 border-b border-slate-700 bg-slate-900 px-6 py-4">
          <button
            type="button"
            onClick={() => navigate("/perfil")}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
          >
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Meu perfil</p>
              <p className="text-sm font-semibold leading-tight tracking-tight text-white">
                {user?.full_name}
              </p>
              <p className="text-xs leading-tight text-slate-300">
                {user?.role ? ROLE_LABELS[user.role] : ""}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-sm">
              {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
