import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
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
  UserRound,
  ClipboardList
} from "lucide-react";

import { useAuth } from "../../features/auth/useAuth";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { useTheme } from "../../hooks/useTheme";
import {
  ADMIN_ONLY_ROLES,
  AGENDA_ACCESS_ROLES,
  ANALYSIS_ROLES,
  CANDIDATE_PORTAL_ROLES,
  CANDIDATES_ACCESS_ROLES,
  JOB_MANAGEMENT_ROLES,
  MANAGER_AREA_ROLES,
  PRE_ADMISSION_AREA_ROLES,
  RH_DASHBOARD_ROLES,
  STAFF_ROLES,
  isAdmin,
} from "../../shared/auth/roles";
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
    label: "Central RH",
    caption: "Pendências do dia",
    roles: RH_DASHBOARD_ROLES,
    isDropdown: false,
    items: [
      { to: "/rh", label: "Central RH", caption: "Pendências do dia", roles: RH_DASHBOARD_ROLES }
    ],
  },

  {
    label: "Recrutamento",
    caption: "Processo Seletivo",
    roles: STAFF_ROLES,
    isDropdown: true,
    items: [
      { to: "/pipeline", label: "Pipeline", caption: "Fluxo e etapas", roles: STAFF_ROLES },
      { to: "/vagas", label: "Vagas", caption: "Oportunidades", roles: STAFF_ROLES },
      { to: "/candidaturas", label: "Candidaturas", caption: "Triagem rápida", roles: STAFF_ROLES },
      { to: "/candidatos", label: "Candidatos", caption: "Base de perfis", roles: CANDIDATES_ACCESS_ROLES },
      { to: "/agenda", label: "Agenda", caption: "Calendário", roles: AGENDA_ACCESS_ROLES },
    ],
  },
  {
    label: "Avaliações",
    caption: "Gestão Comportamental e IA",
    roles: ANALYSIS_ROLES,
    isDropdown: true,
    items: [
      { to: "/analises-ia", label: "Análises IA", caption: "Currículos e matching", roles: ANALYSIS_ROLES },
      { to: "/analises-ia/comportamental", label: "Avaliação comportamental", caption: "Fila e avaliações", roles: ANALYSIS_ROLES },
      { to: "/admin/behavioral-templates", label: "Templates comportamentais", caption: "Templates de testes", roles: ANALYSIS_ROLES },
    ],
  },
  {
    label: "Admissão",
    caption: "Checklists e casos",
    roles: PRE_ADMISSION_AREA_ROLES,
    isDropdown: true,
    items: [
      { to: "/admitidos", label: "Admitidos", caption: "Casos de pré-admissão", roles: PRE_ADMISSION_AREA_ROLES },
      { to: "/admissao/checklists", label: "Checklists admissionais", caption: "Templates de documentos", roles: PRE_ADMISSION_AREA_ROLES },
    ],
  },
  {
    label: "Gestores",
    caption: "Revisão e Decisão",
    roles: MANAGER_AREA_ROLES,
    isDropdown: true,
    items: [
      { to: "/manager", label: "Painel do gestor", caption: "Revisões pendentes", roles: MANAGER_AREA_ROLES },
    ],
  },
  {
    label: "Administração",
    caption: "Configurações Gerais",
    roles: JOB_MANAGEMENT_ROLES,
    isDropdown: true,
    items: [
      { to: "/admin/usuarios", label: "Usuários", caption: "Equipe e acessos", roles: ADMIN_ONLY_ROLES },
      { to: "/admin/cadastros", label: "Cadastros", caption: "Skills e Áreas", roles: ADMIN_ONLY_ROLES },
      { to: "/admin/ai-provider-credentials", label: "Credenciais IA", caption: "Chaves Gemini e Claude", roles: ADMIN_ONLY_ROLES },
      { to: "/admin/bi", label: "BI", caption: "Indicadores e gráficos", roles: ADMIN_ONLY_ROLES },
      { to: "/admin/auditoria", label: "Auditoria", caption: "Eventos administrativos", roles: ADMIN_ONLY_ROLES },
      { to: "/admin/health", label: "Saúde do sistema", caption: "Diagnósticos e Logs", roles: ADMIN_ONLY_ROLES },
      { to: "/importar", label: "Importação de CVs", caption: "Carga de arquivos", roles: JOB_MANAGEMENT_ROLES },
      { to: "/importar-formulario", label: "Importação por form", caption: "Google Forms / Drive", roles: JOB_MANAGEMENT_ROLES },
    ],
  },
  {
    label: "Portal do Candidato",
    caption: "Sua candidatura",
    roles: CANDIDATE_PORTAL_ROLES,
    isDropdown: false,
    items: [
      { to: "/candidato/portal", label: "Portal do Candidato", caption: "Sua candidatura", roles: CANDIDATE_PORTAL_ROLES }
    ],
  },
  {
    label: "Outros",
    caption: "Ferramentas extras",
    roles: JOB_MANAGEMENT_ROLES,
    isDropdown: true,
    items: [
      { to: "/candidato/portal", label: "Portal do Candidato (Preview)", caption: "Visualização do candidato", roles: ADMIN_ONLY_ROLES },
      { to: "/demo-rh", label: "Demo RH", caption: "Fluxo RH Simples", roles: JOB_MANAGEMENT_ROLES },
    ],
  },
];

const ICON_MAP: Record<string, any> = {
  "/rh": ClipboardList,
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
  "Central RH": ClipboardList,
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
    if (isAdmin(userRole as UserRole)) return true;

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

        <main className="flex-1 flex flex-col p-4 sm:p-6">
          <div className="w-full flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>

        <footer className="w-full border-t border-border bg-surface py-4 text-center text-sm text-[hsl(var(--nav-muted))]">
          <div className="w-full px-4 sm:px-6">
            @LecinoLucas Developer 2026 Rede Marajo RH IA
          </div>
        </footer>
      </div>
    </div>
  );
}
