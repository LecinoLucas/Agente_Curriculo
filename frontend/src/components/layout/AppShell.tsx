import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  Moon,
  PanelTop,
  Sun,
  UserRound,
  X,
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "../../features/auth/useAuth";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { useTheme } from "../../hooks/useTheme";
import { UserRole } from "../../types/auth";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";
import { TopNavbar } from "./TopNavbar";

type NavItem = {
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
};

type NavGroup = {
  label: string;
  caption: string;
  roles: UserRole[];
  isDropdown: boolean;
  items: NavItem[];
};

const NAVIGATION_CONFIG: NavGroup[] = [
  {
    label: "Dashboard",
    caption: "Visão geral",
    roles: ["admin", "recruiter", "viewer", "manager", "hr"],
    isDropdown: false,
    items: [
      { to: "/dashboard", label: "Dashboard", caption: "Visão geral", roles: ["admin", "recruiter", "viewer", "manager", "hr"] }
    ],
  },
  {
    label: "Pipeline",
    caption: "Fluxo e etapas",
    roles: ["admin", "recruiter", "viewer", "manager", "hr"],
    isDropdown: false,
    items: [
      { to: "/pipeline", label: "Pipeline", caption: "Fluxo e etapas", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
    ],
  },
  {
    label: "Recrutamento",
    caption: "Processo Seletivo",
    roles: ["admin", "recruiter", "viewer", "manager", "hr"],
    isDropdown: true,
    items: [
      { to: "/vagas", label: "Vagas", caption: "Oportunidades", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
      { to: "/candidatos", label: "Candidatos", caption: "Base de perfis", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
      { to: "/agenda", label: "Agenda de entrevistas", caption: "Calendário", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
    ],
  },
  {
    label: "Avaliações",
    caption: "Gestão Comportamental",
    roles: ["admin", "recruiter"],
    isDropdown: true,
    items: [
      { to: "/admin/behavioral-templates", label: "Templates comportamentais", caption: "Templates de testes", roles: ["admin", "recruiter"] },
    ],
  },
  {
    label: "Admissão",
    caption: "Checklists e casos",
    roles: ["admin", "hr"],
    isDropdown: true,
    items: [
      { to: "/admitidos", label: "Admitidos", caption: "Processos concluídos", roles: ["admin", "hr"] },
      { to: "/admissao/checklists", label: "Checklists admissionais", caption: "Templates de documentos", roles: ["admin", "hr"] },
    ],
  },
  {
    label: "Gestores",
    caption: "Revisão e Decisão",
    roles: ["admin", "manager"],
    isDropdown: true,
    items: [
      { to: "/manager", label: "Revisões pendentes", caption: "Candidatos atribuídos", roles: ["admin", "manager"] },
    ],
  },
  {
    label: "IA & Automação",
    caption: "Carga e Inteligência",
    roles: ["admin", "recruiter"],
    isDropdown: true,
    items: [
      { to: "/analises-ia", label: "Currículos e matching", caption: "Análises IA", roles: ["admin", "recruiter"] },
      { to: "/analises-ia/comportamental", label: "IA Comportamental", caption: "Fila e avaliações", roles: ["admin", "recruiter"] },
      { to: "/importar", label: "Importação de currículos", caption: "Carga de CVs", roles: ["admin", "recruiter"] },
      { to: "/importar-formulario", label: "Importação por formulário", caption: "Google Forms / Drive", roles: ["admin", "recruiter"] },
    ],
  },
  {
    label: "Adm",
    caption: "Configurações Gerais",
    roles: ["admin"],
    isDropdown: true,
    items: [
      { to: "/admin", label: "Admin", caption: "Visão geral", roles: ["admin"] },
      { to: "/admin/usuarios", label: "Usuários", caption: "Equipe e acessos", roles: ["admin"] },
      { to: "/admin/cadastros", label: "Cadastros", caption: "Skills e Áreas", roles: ["admin"] },
      { to: "/admin/auditoria", label: "Auditoria", caption: "Eventos administrativos", roles: ["admin"] },
      { to: "/admin/health", label: "Saúde do sistema", caption: "Diagnósticos e Logs", roles: ["admin"] },
      { to: "/admin/ai-provider-credentials", label: "Credenciais IA", caption: "Chaves Gemini e Claude", roles: ["admin"] },
      { to: "/admin/bi", label: "BI", caption: "Indicadores e gráficos", roles: ["admin"] },
      { to: "/candidato/portal", label: "Preview Portal do Candidato", caption: "Visualização do candidato", roles: ["admin"] },
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
];

const ICON_MAP: Record<string, any> = {
  "/dashboard": LayoutDashboard,
  "/pipeline": Kanban,
  "/vagas": Briefcase,
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
  "Dashboard": LayoutDashboard,
  "Recrutamento": Briefcase,
  "Avaliações": GraduationCap,
  "Gestores": UserRound,
  "Admissão": ShieldCheck,
  "IA & Automação": Sparkles,
  "Adm": Settings,
  "Portal do Candidato": User,
};

function getNavIcon(key: string) {
  const IconComponent = ICON_MAP[key] || PanelTop;
  return <IconComponent className="h-4 w-4 shrink-0 opacity-75 transition-transform duration-200 group-hover:scale-105" />;
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
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user?.role]);

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
        setOpenDropdownLabel(null);
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] text-text flex flex-col">
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar
          groups={visibleGroups}
          openDropdownLabel={openDropdownLabel}
          mobileMenuOpen={mobileMenuOpen}
          theme={theme}
          onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
          onCloseDropdown={() => setOpenDropdownLabel(null)}
          onToggleDropdown={(groupLabel) => {
            setOpenDropdownLabel(openDropdownLabel === groupLabel ? null : groupLabel);
          }}
          onNavigate={(path) => navigate(path)}
          onLogout={() => void logout()}
          onToggleTheme={toggleTheme}
          isItemActive={isItemActive}
          renderIcon={getNavIcon}
          onPipelineClick={closeCandidate}
        />

        {/* ── Mobile Drawer Navigation (Lateral Sliding Panel) ── */}
        <div
          className={cn(
            "fixed inset-0 z-50 xl:hidden transition-all duration-300 ease-in-out",
            mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
        >
          {/* Backdrop Blur Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Lateral Drawer Content */}
          <aside
            className={cn(
              "absolute inset-y-0 left-0 w-72 bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] p-5 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col justify-between",
              mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <div className="flex flex-col gap-4 overflow-y-auto flex-1 pb-4">
              
              {/* Header inside Drawer */}
              <div className="flex items-center justify-between border-b border-[hsl(var(--nav-border))]/90 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[hsl(var(--primary))] text-xs font-extrabold text-white">
                    RA
                  </div>
                  <div>
                    <p className="font-heading text-sm font-extrabold tracking-tight text-[hsl(var(--nav-text))]">
                      Marajo RH
                    </p>
                    <p className="text-[10px] text-[hsl(var(--nav-muted))] leading-tight">
                      ATS & Recrutamento IA
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fechar menu de navegação"
                  className="p-1 rounded-lg hover:bg-white/10 text-[hsl(var(--nav-muted))] hover:text-[hsl(var(--nav-text))] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* Mobile Drawer Menu List */}
              <nav className="space-y-1.5 pt-2">
                {visibleGroups.map((group) => {
                  if (!group.isDropdown) {
                    const item = group.items[0];
                    const active = isItemActive(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          if (item.to === "/pipeline") {
                            closeCandidate();
                          }
                        }}
                        className={
                          cn(
                            "flex items-center rounded-xl p-3 text-sm font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                            active
                              ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))] shadow-sm font-bold"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                          )
                        }
                        aria-current={active ? "page" : undefined}
                      >
                        {getNavIcon(item.to)}
                        <span className="ml-3 truncate">{item.label}</span>
                      </NavLink>
                    );
                  }

                  const isGroupActive = group.items.some((item) => isItemActive(item.to));
                  const isOpen = openDropdownLabel === group.label;

                  return (
                    <div key={group.label} className="flex flex-col gap-1 w-full">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl p-3 text-sm font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                          isGroupActive
                            ? "text-[hsl(var(--nav-text))] font-bold bg-white/5"
                            : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                        )}
                        onClick={() => setOpenDropdownLabel(isOpen ? null : group.label)}
                        aria-expanded={isOpen}
                        aria-haspopup="menu"
                      >
                        <div className="flex items-center min-w-0">
                          {getNavIcon(group.label)}
                          <span className="ml-3 truncate">{group.label}</span>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-300 opacity-60", isOpen && "rotate-180")} />
                      </button>

                      {isOpen && (
                        <div className="flex flex-col gap-1 pl-10 pr-2 py-1 transition-all">
                          {group.items.map((item) => {
                            const active = isItemActive(item.to);
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => {
                                  setMobileMenuOpen(false);
                                  if (item.to === "/pipeline") {
                                    closeCandidate();
                                  }
                                }}
                                className={
                                  cn(
                                    "flex items-center rounded-lg py-2 px-3 text-xs font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                                    active
                                      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))]/30 shadow-sm font-bold"
                                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                                  )
                                }
                                aria-current={active ? "page" : undefined}
                              >
                                <span className="truncate">{item.label}</span>
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>

            {/* Mobile Footer inside Drawer */}
            <div className="border-t border-[hsl(var(--nav-border))]/90 pt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between px-2">
                <VisualThemeSwitcher />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]"
                  >
                    {theme === "light" ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate("/perfil");
                    }}
                    aria-label="Abrir perfil"
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]"
                    title="Perfil"
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    aria-label="Sair"
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--danger))] hover:text-white transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]"
                    title="Sair"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Main Content Wrapper */}
        <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8">
          <div className="w-full max-w-[1600px] mx-auto flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full border-t border-border bg-surface py-4 text-center text-sm text-[hsl(var(--nav-muted))]">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
            @LecinoLucas Developer 2026 Rede Marajo RH IA
          </div>
        </footer>
      </div>
    </div>
  );
}
