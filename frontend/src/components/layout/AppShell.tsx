import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../../features/auth/useAuth";
import { UserRole } from "../../types/auth";

type NavItem = {
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Visão geral", caption: "Resumo operacional", roles: ["admin", "recruiter", "candidate", "viewer"] },
  { to: "/curriculos", label: "Documentos", caption: "Currículos e uploads", roles: ["admin", "recruiter", "candidate"] },
  { to: "/analises", label: "Análises", caption: "Pipeline e resultados", roles: ["admin", "recruiter", "candidate", "viewer"] },
  { to: "/vagas", label: "Vagas", caption: "Oportunidades abertas", roles: ["admin", "recruiter", "viewer"] },
  { to: "/cadastros", label: "Cadastros", caption: "Pessoas, skills e gestão", roles: ["admin", "recruiter"] },
];

function roleLabel(role: UserRole | undefined) {
  const labels: Record<UserRole, string> = {
    admin: "Administrador",
    recruiter: "Recrutador",
    candidate: "Candidato",
    viewer: "Visualizador",
  };
  return role ? labels[role] : "Sem perfil";
}

export function AppShell() {
  const { user, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => (user ? item.roles.includes(user.role) : false));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1 className="brand-title">Resume AI</h1>
          <p className="brand-subtitle">Plataforma de recrutamento e análise de currículos</p>

          <nav className="nav-list">
            {visibleItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                <div style={{ fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{item.caption}</div>
              </NavLink>
            ))}
          </nav>
        </div>

        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Sair
        </button>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div>
            <strong>{user?.full_name}</strong>
            <p className="text-muted">Perfil: {roleLabel(user?.role)}</p>
          </div>
        </header>

        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
