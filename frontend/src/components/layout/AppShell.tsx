import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  Menu,
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
  GraduationCap
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "../../features/auth/useAuth";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { useTheme } from "../../hooks/useTheme";
import { UserRole } from "../../types/auth";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";

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
    label: "Recrutamento",
    caption: "Processo Seletivo",
    roles: ["admin", "recruiter", "viewer", "manager", "hr"],
    isDropdown: true,
    items: [
      { to: "/pipeline", label: "Pipeline", caption: "Fluxo e etapas", roles: ["admin", "recruiter", "viewer", "manager", "hr"] },
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
      { to: "/analises-ia", label: "Análises IA", caption: "Status e execuções", roles: ["admin", "recruiter"] },
      { to: "/importar", label: "Importação de currículos", caption: "Carga de CVs", roles: ["admin", "recruiter"] },
      { to: "/importar-formulario", label: "Importação por formulário", caption: "Google Forms / Drive", roles: ["admin", "recruiter"] },
    ],
  },
  {
    label: "Administração",
    caption: "Configurações Gerais",
    roles: ["admin"],
    isDropdown: true,
    items: [
      { to: "/admin", label: "Admin", caption: "Visão geral", roles: ["admin"] },
      { to: "/admin/usuarios", label: "Usuários", caption: "Equipe e acessos", roles: ["admin"] },
      { to: "/admin/cadastros", label: "Cadastros", caption: "Skills e Áreas", roles: ["admin"] },
      { to: "/admin/auditoria", label: "Auditoria", caption: "Eventos administrativos", roles: ["admin"] },
      { to: "/admin/health", label: "Saúde do sistema", caption: "Diagnósticos e Logs", roles: ["admin"] },
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

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer:    "Visualizador",
  manager:   "Gestor",
  hr:        "RH",
};

const ICON_MAP: Record<string, any> = {
  "/dashboard": LayoutDashboard,
  "/pipeline": Kanban,
  "/vagas": Briefcase,
  "/candidatos": Users,
  "/agenda": Calendar,
  "/importar": Upload,
  "/importar-formulario": FileSpreadsheet,
  "/analises-ia": Sparkles,
  "/manager": ShieldCheck,
  "/admin": Settings,
  "/admin/usuarios": UserRound,
  "/admin/cadastros": FolderOpen,
  "/admin/behavioral-templates": GraduationCap,
  "/admin/auditoria": ShieldCheck,
  "/admin/bi": BarChart3,
  "/admin/health": Activity,
  "/candidato/portal": User,
  "Dashboard": LayoutDashboard,
  "Recrutamento": Briefcase,
  "Avaliações": GraduationCap,
  "Gestores": UserRound,
  "IA & Automação": Sparkles,
  "Administração": Settings,
  "Portal do Candidato": User,
};

function getNavIcon(key: string) {
  const IconComponent = ICON_MAP[key] || PanelTop;
  return <IconComponent className="h-5 w-5 shrink-0 opacity-70 transition-transform group-hover:scale-105 duration-200" />;
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

  // Hover-based sidebar: expands on mouse-enter, collapses on mouse-leave
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSidebarMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setSidebarExpanded(true);
  };

  const handleSidebarMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      setSidebarExpanded(false);
      setOpenDropdownLabel(null);
    }, 200);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user?.role]);

  // Unified dynamic visible navigation list filter
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
    return location.pathname.startsWith(itemTo);
  };

  const handleGroupClick = (groupLabel: string) => {
    if (!sidebarExpanded) {
      setSidebarExpanded(true);
      setOpenDropdownLabel(groupLabel);
    } else {
      setOpenDropdownLabel(openDropdownLabel === groupLabel ? null : groupLabel);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))] flex flex-col lg:flex-row">
      
      {/* ── Left Vertical Sidebar (Desktop Only) ── */}
      <aside
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={cn(
          "hidden lg:flex fixed inset-y-0 left-0 z-50 flex-col border-r border-[hsl(var(--nav-border))]/90 bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] transition-all duration-300 ease-in-out shadow-[4px_0_24px_-10px_rgba(0,0,0,0.3)]",
          sidebarExpanded ? "w-64" : "w-16"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[hsl(var(--nav-border))]/90 px-3.5 transition-all duration-300">
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              type="button"
              onClick={() => navigate("/pipeline")}
              className="flex items-center gap-3 rounded-xl border border-transparent text-left transition hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))] px-1 py-1"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[hsl(var(--primary))] text-xs font-extrabold text-white shadow-sm">
                RA
              </div>
              {sidebarExpanded && (
                <div className="min-w-0 transition-opacity duration-300 ml-1">
                  <p className="font-heading text-sm font-extrabold tracking-tight text-[hsl(var(--nav-text))] truncate">
                    Marajo RH
                  </p>
                  <p className="text-[10px] text-[hsl(var(--nav-muted))] leading-tight truncate">
                    ATS & Recrutamento IA
                  </p>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Nav Links */}
        <nav className="flex-1 overflow-y-auto px-2 py-6 space-y-1.5 transition-all duration-300">
          <div className="flex flex-col gap-1.5 w-full">
            {visibleGroups.map((group) => {
              if (!group.isDropdown) {
                const item = group.items[0];
                const active = isItemActive(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      if (item.to === "/pipeline") {
                        closeCandidate();
                      }
                    }}
                    className={cn(
                      "flex items-center transition-all duration-300 border border-transparent",
                      sidebarExpanded
                        ? cn(
                            "rounded-xl py-2 text-sm font-semibold",
                            active
                              ? "bg-gradient-to-r from-[hsl(var(--primary)/0.12)] to-[hsl(var(--primary)/0.01)] text-[hsl(var(--primary))] dark:text-white border-l-4 border-l-[hsl(var(--primary))] pl-2.5 font-bold shadow-sm"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))] hover:translate-x-1 pl-3.5"
                          )
                        : cn(
                            "justify-center rounded-xl w-10 h-10 mx-auto",
                            active
                              ? "bg-[hsl(var(--primary))] text-white shadow-md shadow-[hsl(var(--primary)/0.3)] font-bold scale-105"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))] hover:scale-105"
                          )
                    )}
                    title={!sidebarExpanded ? item.label : undefined}
                  >
                    {getNavIcon(item.to)}
                    {sidebarExpanded && (
                      <span className="ml-3 truncate text-sm font-semibold tracking-tight">
                        {item.label}
                      </span>
                    )}
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
                      "flex w-full items-center transition-all duration-300 border border-transparent",
                      sidebarExpanded
                        ? cn(
                            "justify-between rounded-xl py-2 text-sm font-semibold",
                            isGroupActive
                              ? "text-[hsl(var(--nav-text))] font-bold bg-white/5 pl-3.5"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))] hover:translate-x-1 pl-3.5"
                          )
                        : cn(
                            "justify-center rounded-xl w-10 h-10 mx-auto",
                            isGroupActive
                              ? "bg-white/5 text-[hsl(var(--nav-text))] font-bold"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))] hover:scale-105"
                          )
                    )}
                    onClick={() => handleGroupClick(group.label)}
                    aria-expanded={isOpen}
                    title={!sidebarExpanded ? group.label : undefined}
                  >
                    <div className="flex items-center min-w-0">
                      {getNavIcon(group.label)}
                      {sidebarExpanded && (
                        <span className="ml-3 truncate text-sm font-semibold tracking-tight">
                          {group.label}
                        </span>
                      )}
                    </div>
                    {sidebarExpanded && (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-300 opacity-60",
                          isOpen && "rotate-180 opacity-100"
                        )}
                      />
                    )}
                  </button>

                  {isOpen && sidebarExpanded && (
                    <div className="flex flex-col gap-1 pl-9 pr-1 py-1 transition-all duration-300 animate-in slide-in-from-top-1">
                      {group.items.map((item) => {
                        const active = isItemActive(item.to);
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={() => {
                              if (item.to === "/pipeline") {
                                closeCandidate();
                              }
                            }}
                            className={cn(
                              "flex items-center rounded-lg py-1.5 px-3 text-xs font-semibold transition-all duration-300 border border-transparent",
                              active
                                ? "bg-gradient-to-r from-[hsl(var(--primary)/0.08)] to-transparent text-[hsl(var(--primary))] dark:text-white border-l-2 border-l-[hsl(var(--primary))] pl-2.5 font-bold shadow-sm"
                                : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))] hover:translate-x-1"
                            )}
                            title={item.label}
                          >
                            <span className="truncate">
                              {item.label}
                            </span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer Controls & Profile */}
        <div className="mt-auto border-t border-[hsl(var(--nav-border))]/90 p-2.5 space-y-4 bg-black/10 transition-all duration-300">
          <div className="flex flex-col gap-2">

            <div className="flex items-center justify-between">
              {sidebarExpanded && (
                <div className="w-auto overflow-visible opacity-100 transition-all duration-300">
                  <VisualThemeSwitcher />
                </div>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
                title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--nav-border))]/60 bg-white/5 p-1.5 backdrop-blur-sm transition-all duration-300">
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="min-w-0 flex flex-1 items-center text-left hover:opacity-80 transition-opacity"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="h-7 w-7 shrink-0 rounded-lg object-cover transition-all duration-300"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-xs font-semibold text-white transition-all duration-300">
                  {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
              {sidebarExpanded && (
                <div className="min-w-0 opacity-100 transition-opacity duration-300 ml-2">
                  <p className="text-xs font-bold text-[hsl(var(--nav-text))] truncate">
                    {user?.full_name.split(' ')[0]}
                  </p>
                  <p className="text-[10px] text-[hsl(var(--nav-muted))] truncate">
                    {user?.role ? ROLE_LABELS[user.role] : ""}
                  </p>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--danger))] hover:text-white transition-colors duration-300"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area and Header ── */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out",
          sidebarExpanded ? "lg:pl-64" : "lg:pl-16"
        )}
      >
        {/* Global Sticky Top Header */}
        <header className="flex h-16 w-full items-center justify-between border-b border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))]/90 backdrop-blur-md px-6 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger menu */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/80 transition-all"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop Page Breadcrumbs */}
            <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-[hsl(var(--text-muted))]">
              <span className="text-[hsl(var(--primary))] font-extrabold tracking-tight">ATS Marajo</span>
              <span className="opacity-40">/</span>
              <span className="capitalize font-bold text-[hsl(var(--text))]">
                {location.pathname === "/"
                  ? "Dashboard"
                  : location.pathname.substring(1).replace(/-/g, " ").replace(/\//g, " / ")}
              </span>
            </div>

            {/* Mobile Brand */}
            <div className="lg:hidden flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[hsl(var(--primary))] text-[10px] font-extrabold text-white">
                RA
              </div>
              <p className="font-heading text-xs font-extrabold tracking-tight text-[hsl(var(--text))]">
                Marajo RH
              </p>
            </div>
          </div>

          {/* Right controls: Notifications bell */}
          <div className="flex items-center gap-3">
            <NotificationsBell />
          </div>
        </header>

        {/* ── Mobile Drawer Navigation (Lateral Sliding Panel) ── */}
        <div
          className={cn(
            "fixed inset-0 z-50 lg:hidden transition-all duration-300 ease-in-out",
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
                  className="p-1 rounded-lg hover:bg-white/10 text-[hsl(var(--nav-muted))] hover:text-[hsl(var(--nav-text))] transition-colors"
                >
                  <X className="h-5 w-5" />
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
                            "flex items-center rounded-xl p-3 text-sm font-semibold transition-all duration-150 border border-transparent",
                            active
                              ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))] shadow-sm font-bold"
                              : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                          )
                        }
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
                          "flex w-full items-center justify-between rounded-xl p-3 text-sm font-semibold transition-all duration-150 border border-transparent",
                          isGroupActive
                            ? "text-[hsl(var(--nav-text))] font-bold bg-white/5"
                            : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                        )}
                        onClick={() => setOpenDropdownLabel(isOpen ? null : group.label)}
                        aria-expanded={isOpen}
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
                                    "flex items-center rounded-lg py-2 px-3 text-xs font-semibold transition-all duration-150 border border-transparent",
                                    active
                                      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))]/30 shadow-sm font-bold"
                                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                                  )
                                }
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
                  >
                    {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate("/perfil");
                    }}
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
                    title="Perfil"
                  >
                    <UserRound className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--danger))] hover:text-white transition-colors duration-300"
                    title="Sair"
                  >
                    <LogOut className="h-4 w-4" />
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
        <footer className="w-full border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] py-4 text-center text-sm text-[hsl(var(--nav-muted))]">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
            @LecinoLucas Developer 2026 Rede Marajo RH IA
          </div>
        </footer>
      </div>
    </div>
  );
}
