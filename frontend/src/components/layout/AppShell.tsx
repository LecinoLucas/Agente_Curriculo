import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Kanban,
  Briefcase,
  Users,
  Calendar,
  Upload,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
  FolderOpen,
  Settings,
  BarChart3,
  Activity,
  User,
  GraduationCap,
  KeyRound,
  BrainCircuit,
  FlaskConical,
  PanelTop,
  UserRound
} from "lucide-react";

import { useAuth } from "../../features/auth/useAuth";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { useTheme } from "../../hooks/useTheme";
import { UserRole } from "../../types/auth";
import { TopNavbar } from "./TopNavbar";
import { Sidebar } from "./Sidebar";

export type NavItem = {
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
};

export type NavGroup = {
  label: string;
  caption: string;
  roles: UserRole[];
  isDropdown: boolean;
  items: NavItem[];
};

const NAVIGATION_CONFIG: NavGroup[] = [
  {
    label: "Visão geral",
    caption: "Dashboard",
    roles: ["admin", "recruiter", "viewer", "manager", "hr"],
    isDropdown: false,
    items: [
      { to: "/dashboard", label: "Dashboard", caption: "Visão geral", roles: ["admin", "recruiter", "viewer", "manager", "hr"] }
    ],
  },
  {
    label: "Recrutamento",
    caption: "Processo Seletivo",
    roles: ["admin", "recruiter", "viewer", "manager", "hr"],
    isDropdown: true,
    items: [
      { to: "/pipeline", label: "Pipeline", caption: "Fluxo e etapas", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
      { to: "/vagas", label: "Vagas", caption: "Oportunidades", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
      { to: "/candidaturas", label: "Candidaturas", caption: "Triagem rápida", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
      { to: "/candidatos", label: "Candidatos", caption: "Base de perfis", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
      { to: "/agenda", label: "Agenda", caption: "Calendário", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
    ],
  },
  {
    label: "Avaliações",
    caption: "Gestão Comportamental e IA",
    roles: ["admin", "recruiter"],
    isDropdown: true,
    items: [
      { to: "/analises-ia", label: "Análises IA", caption: "Currículos e matching", roles: ["admin", "recruiter"] },
      { to: "/analises-ia/comportamental", label: "Avaliação comportamental", caption: "Fila e avaliações", roles: ["admin", "recruiter"] },
      { to: "/admin/behavioral-templates", label: "Templates comportamentais", caption: "Templates de testes", roles: ["admin", "recruiter"] },
    ],
  },
  {
    label: "Admissão",
    caption: "Checklists e casos",
    roles: ["admin", "hr"],
    isDropdown: true,
    items: [
      { to: "/admitidos", label: "Admitidos", caption: "Casos de pré-admissão", roles: ["admin", "hr"] },
      { to: "/admissao/checklists", label: "Checklists admissionais", caption: "Templates de documentos", roles: ["admin", "hr"] },
    ],
  },
  {
    label: "Gestores",
    caption: "Revisão e Decisão",
    roles: ["admin", "manager"],
    isDropdown: true,
    items: [
      { to: "/manager", label: "Painel do gestor", caption: "Revisões pendentes", roles: ["admin", "manager"] },
    ],
  },
  {
    label: "Administração",
    caption: "Configurações Gerais",
    roles: ["admin", "recruiter"],
    isDropdown: true,
    items: [
      { to: "/admin/usuarios", label: "Usuários", caption: "Equipe e acessos", roles: ["admin"] },
      { to: "/admin/cadastros", label: "Cadastros", caption: "Skills e Áreas", roles: ["admin"] },
      { to: "/admin/ai-provider-credentials", label: "Credenciais IA", caption: "Chaves Gemini e Claude", roles: ["admin"] },
      { to: "/admin/bi", label: "BI", caption: "Indicadores e gráficos", roles: ["admin"] },
      { to: "/admin/auditoria", label: "Auditoria", caption: "Eventos administrativos", roles: ["admin"] },
      { to: "/admin/health", label: "Saúde do sistema", caption: "Diagnósticos e Logs", roles: ["admin"] },
      { to: "/importar", label: "Importação de CVs", caption: "Carga de arquivos", roles: ["admin", "recruiter"] },
      { to: "/importar-formulario", label: "Importação por form", caption: "Google Forms / Drive", roles: ["admin", "recruiter"] },
    ],
  },
  {
    label: "Portal do Candidato",
    caption: "Sua candidatura",
    roles: ["candidate"],
    isDropdown: false,
    items: [
      { to: "/candidato/portal", label: "Portal do Candidato", caption: "Sua candidatura", roles: ["candidate"] }
    ],
  },
  {
    label: "Outros",
    caption: "Ferramentas extras",
    roles: ["admin"],
    isDropdown: true,
    items: [
      { to: "/candidato/portal", label: "Portal do Candidato (Preview)", caption: "Visualização do candidato", roles: ["admin"] },
      { to: "/demo-rh", label: "Demo RH", caption: "Fluxo RH Simples", roles: ["admin"] },
    ],
  },
];

const ICON_MAP: Record<string, any> = {
  "/dashboard": LayoutDashboard,
  "/pipeline": Kanban,
  "/vagas": Briefcase,
  "/candidaturas": FileSpreadsheet,
  "/candidatos": Users,
  "/agenda": Calendar,
  "/importar": Upload,
  "/importar-formulario": FileSpreadsheet,
  "/analises-ia": Sparkles,
  "/analises-ia/comportamental": BrainCircuit,
  "/manager": ShieldCheck,
  "/admitidos": UserRound,
  "/admissao/checklists": ShieldCheck,
  "/admin": Settings,
  "/admin/usuarios": UserRound,
  "/admin/cadastros": FolderOpen,
  "/admin/behavioral-templates": GraduationCap,
  "/admin/auditoria": ShieldCheck,
  "/admin/bi": BarChart3,
  "/admin/health": Activity,
  "/admin/ai-provider-credentials": KeyRound,
  "/candidato/portal": User,
  "/demo-rh": FlaskConical,
  "Visão geral": LayoutDashboard,
  "Recrutamento": Briefcase,
  "Avaliações": GraduationCap,
  "Gestores": UserRound,
  "Admissão": ShieldCheck,
  "IA & Automação": Sparkles,
  "Administração": Settings,
  "Portal do Candidato": User,
  "Outros": FlaskConical,
};

function getNavIcon(key: string) {
  const IconComponent = ICON_MAP[key] || PanelTop;
  return <IconComponent className="h-[1.125rem] w-[1.125rem] shrink-0 transition-transform duration-200 group-hover:scale-105" />;
}

function usePathAllowed() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handleChanged = () => setVersion((v) => v + 1);
    window.addEventListener("screens-config-changed", handleChanged);
    return () => window.removeEventListener("screens-config-changed", handleChanged);
  }, []);

  const isAllowed = (path: string, userRole: string) => {
    if (userRole === "admin") return true;

    let saved = null;
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        saved = window.localStorage.getItem("app_screens_config");
      }
    } catch {}

    if (saved) {
      try {
        const screens = JSON.parse(saved);
        const matched = screens.find((s: any) => {
          if (s.path === "/") return path === "/";
          return path === s.path || path.startsWith(s.path + "/");
        });
        if (matched) {
          return matched.roles.includes(userRole);
        }
      } catch {}
    }
    return true;
  };

  return { isAllowed, version };
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { closeCandidate } = usePipeline();
  const { isAllowed, version } = usePathAllowed();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user?.role, location.pathname]);

  const visibleGroups = useMemo(() => {
    if (!user) return [];

    return NAVIGATION_CONFIG.map((group) => {
      const allowedItems = group.items.filter(
        (item) => item.roles.includes(user.role) && isAllowed(item.to, user.role)
      );
      return { ...group, items: allowedItems };
    }).filter((group) => {
      const hasAccess = group.roles.includes(user.role);
      const hasAllowedItems = group.items.length > 0;
      return hasAccess && hasAllowedItems;
    });
  }, [user, version]);

  const isItemActive = (itemTo: string) => {
    if (itemTo === "/admin") {
      return location.pathname === "/admin";
    }
    if (itemTo === "/candidato/portal") {
      return location.pathname === "/candidato/portal";
    }
    if (itemTo === "/analises-ia") {
      return location.pathname === "/analises-ia";
    }
    return location.pathname.startsWith(itemTo);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(var(--bg))] text-[hsl(var(--text))]">
      {/* ── Sidebar Navigation ── */}
      <Sidebar
        groups={visibleGroups as any}
        mobileMenuOpen={mobileMenuOpen}
        theme={theme}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        onLogout={() => void logout()}
        onToggleTheme={toggleTheme}
        isItemActive={isItemActive}
        renderIcon={getNavIcon}
        onPipelineClick={closeCandidate}
      />

      {/* ── Main Content Area ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-y-auto">
        <TopNavbar
          mobileMenuOpen={mobileMenuOpen}
          theme={theme}
          onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
          onLogout={() => void logout()}
          onToggleTheme={toggleTheme}
          onNavigate={(path) => navigate(path)}
        />

        <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-[1600px] mx-auto flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>

        <footer className="w-full border-t border-border bg-surface py-4 text-center text-sm text-[hsl(var(--nav-muted))]">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
            @LecinoLucas Developer 2026 Rede Marajo RH IA
          </div>
        </footer>
      </div>
    </div>
  );
}
