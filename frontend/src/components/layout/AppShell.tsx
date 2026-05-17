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
import { ActionMenu } from "../common/ActionMenu";
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
    roles: ["admin", "recruiter", "viewer", "manager"],
    isDropdown: false,
    items: [{ to: "/dashboard", label: "Dashboard", caption: "Visão geral", roles: ["admin", "recruiter", "viewer", "manager"] }],
  },
  {
    label: "Processo Seletivo",
    caption: "Gestão e Pipeline",
    roles: ["admin", "recruiter", "viewer", "manager"],
    isDropdown: true,
    items: [
      { to: "/pipeline", label: "Pipeline", caption: "Fluxo e etapas", roles: ["admin", "recruiter", "viewer", "manager"] },
      { to: "/vagas", label: "Vagas", caption: "Oportunidades", roles: ["admin", "recruiter", "viewer", "manager"] },
      { to: "/candidatos", label: "Candidatos", caption: "Base de perfis", roles: ["admin", "recruiter", "viewer", "manager"] },
      { to: "/agenda", label: "Agenda", caption: "Calendário", roles: ["admin", "recruiter", "viewer", "manager"] },
    ],
  },
  {
    label: "Ferramentas",
    caption: "Importação e IA",
    roles: ["admin", "recruiter"],
    isDropdown: true,
    items: [
      { to: "/importar", label: "Importação Manual", caption: "Carga de CVs", roles: ["admin", "recruiter"] },
      { to: "/importar-formulario", label: "Formulários", caption: "Google Forms / Drive", roles: ["admin", "recruiter"] },
      { to: "/analises-ia", label: "Análises IA", caption: "Status e execuções", roles: ["admin", "recruiter"] },
    ],
  },
  {
    label: "Revisão",
    caption: "Candidatos atribuídos",
    roles: ["admin", "manager"],
    isDropdown: false,
    items: [{ to: "/manager", label: "Revisão", caption: "Candidatos atribuídos", roles: ["admin", "manager"] }],
  },
  {
    label: "Admin",
    caption: "Gerenciamento",
    roles: ["admin"],
    isDropdown: true,
    items: [
      { to: "/admin", label: "Painel admin", caption: "Visão geral", roles: ["admin"] },
      { to: "/admin/usuarios", label: "Usuários", caption: "Equipe e acessos", roles: ["admin"] },
      { to: "/admin/cadastros", label: "Cadastros", caption: "Skills e Áreas", roles: ["admin"] },
      { to: "/admin/behavioral-templates", label: "Avaliações", caption: "Templates comportamentais", roles: ["admin"] },
      { to: "/admin/auditoria", label: "Auditoria", caption: "Eventos administrativos", roles: ["admin"] },
      { to: "/admin/bi", label: "BI / Métricas", caption: "Indicadores e gráficos", roles: ["admin"] },
      { to: "/candidato/portal", label: "Portal do Candidato", caption: "Preview", roles: ["admin"] },
    ],
  },
  {
    label: "Portal do Candidato",
    caption: "Sua candidatura",
    roles: ["candidate"],
    isDropdown: false,
    items: [{ to: "/candidato/portal", label: "Portal do Candidato", caption: "Sua candidatura", roles: ["candidate"] }],
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

const RECRUITER_NAV_ITEMS: Array<{ to: string; label: string; roles: UserRole[] }> = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "recruiter", "viewer"] },
  { to: "/pipeline", label: "Pipeline", roles: ["admin", "recruiter", "viewer"] },
  { to: "/vagas", label: "Vagas", roles: ["admin", "recruiter", "viewer"] },
  { to: "/candidatos", label: "Candidatos", roles: ["admin", "recruiter", "viewer"] },
  { to: "/agenda", label: "Agenda", roles: ["admin", "recruiter", "viewer"] },
  { to: "/importar", label: "Importação", roles: ["admin", "recruiter"] },
  { to: "/importar-formulario", label: "Formulários", roles: ["admin", "recruiter"] },
  { to: "/analises-ia", label: "Análises IA", roles: ["admin", "recruiter"] },
  { to: "/admin/behavioral-templates", label: "Avaliações", roles: ["admin", "recruiter"] },
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
  "Processo Seletivo": Briefcase,
  "Ferramentas": Sparkles,
  "Revisão": ShieldCheck,
  "Admin": Settings,
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
    if (userRole === "admin") return true; // Bypass administrador para proteção contra auto-bloqueio

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
    return true; // default fallback
  };

  return { isAllowed, version };
}

function RecruiterNavigation() {
  const { user } = useAuth();
  const { closeCandidate } = usePipeline();
  const { isAllowed } = usePathAllowed();

  const visibleItems = RECRUITER_NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role) && isAllowed(item.to, user.role)
  );

  return (
    <div className="flex flex-col gap-1 w-full">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => {
            if (item.to === "/pipeline") {
              closeCandidate();
            }
          }}
          className={({ isActive }) =>
            cn(
              "flex items-center rounded-xl py-2 pl-3.5 group-hover:px-4 group-hover:py-2.5 text-sm font-semibold transition-all duration-300 border border-transparent",
              isActive
                ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))] shadow-sm"
                : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
            )
          }
          title={item.label}
        >
          {getNavIcon(item.to)}
          <span className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 truncate text-sm font-semibold tracking-tight">
            {item.label}
          </span>
        </NavLink>
      ))}
    </div>
  );
}

function AdminNavigation() {
  const { user } = useAuth();
  const location = useLocation();
  const { closeCandidate } = usePipeline();
  const { isAllowed, version } = usePathAllowed();
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);

  const visibleGroups = useMemo(() => {
    if (!user) return [];

    return NAVIGATION_CONFIG.map((group) => {
      if (group.isDropdown) {
        const allowedItems = group.items.filter((item) => isAllowed(item.to, user.role));
        return { ...group, items: allowedItems };
      }
      return group;
    }).filter((group) => {
      const hasAccess = group.roles.includes(user.role);
      const hasAllowedItems = group.items.length > 0;
      return hasAccess && hasAllowedItems;
    });
  }, [user, version]);

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) =>
      group.isDropdown && group.items.some((item) => location.pathname.startsWith(item.to))
    );
    if (activeGroup) {
      setOpenDropdownLabel(activeGroup.label);
    }
  }, [location.pathname, visibleGroups]);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {visibleGroups.map((group) => {
        if (!group.isDropdown) {
          const item = group.items[0];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              onClick={() => {
                if (item.to === "/pipeline") {
                  closeCandidate();
                }
              }}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-xl py-2 pl-3.5 group-hover:px-4 group-hover:py-2.5 text-sm font-semibold transition-all duration-300 border border-transparent",
                  isActive
                    ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))] shadow-sm"
                    : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                )
              }
              title={item.label}
            >
              {getNavIcon(item.to)}
              <span className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 truncate text-sm font-semibold tracking-tight">
                {item.label}
              </span>
            </NavLink>
          );
        }

        const isGroupActive = group.items.some((item) => location.pathname.startsWith(item.to));
        const isOpen = openDropdownLabel === group.label;

        return (
          <div key={group.label} className="flex flex-col gap-1 w-full">
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-xl py-2 pl-3.5 group-hover:px-4 group-hover:py-2.5 text-sm font-semibold transition-all duration-300 border border-transparent",
                isGroupActive
                  ? "text-[hsl(var(--nav-text))] font-bold bg-white/5"
                  : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
              )}
              onClick={() => setOpenDropdownLabel(isOpen ? null : group.label)}
              aria-expanded={isOpen}
              title={group.label}
            >
              <div className="flex items-center min-w-0">
                {getNavIcon(group.label)}
                <span className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 truncate text-sm font-semibold tracking-tight">
                  {group.label}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-all duration-300 opacity-0 group-hover:opacity-60",
                  isOpen && "rotate-180 opacity-100"
                )}
              />
            </button>

            {isOpen && (
              <div className="hidden group-hover:flex flex-col gap-1 pl-9 pr-1 py-1 transition-all duration-300">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/admin"}
                    onClick={() => {
                      if (item.to === "/pipeline") {
                        closeCandidate();
                      }
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center rounded-lg py-2 px-3 text-xs font-semibold transition-all duration-300 border border-transparent",
                        isActive
                          ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))]/30 shadow-sm"
                          : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                      )
                    }
                    title={item.label}
                  >
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {item.label}
                    </span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecruiterMobileNavigation({ setMobileMenuOpen }: { setMobileMenuOpen: (o: boolean) => void }) {
  const { user } = useAuth();
  const { closeCandidate } = usePipeline();
  const { isAllowed } = usePathAllowed();
  const onClose = () => setMobileMenuOpen(false);

  const visibleItems = RECRUITER_NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role) && isAllowed(item.to, user.role)
  );

  return (
    <div className="flex flex-col gap-1 w-full">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => {
            onClose();
            if (item.to === "/pipeline") {
              closeCandidate();
            }
          }}
          className={({ isActive }) =>
            cn(
              "flex items-center rounded-xl p-3 text-base font-semibold transition-all duration-150 border border-transparent",
              isActive
                ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))] shadow-sm"
                : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
            )
          }
        >
          {getNavIcon(item.to)}
          <span className="ml-3 text-base font-semibold tracking-tight">{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

function AdminMobileNavigation({ setMobileMenuOpen }: { setMobileMenuOpen: (o: boolean) => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const { closeCandidate } = usePipeline();
  const { isAllowed, version } = usePathAllowed();
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);
  const onClose = () => setMobileMenuOpen(false);

  const visibleGroups = useMemo(() => {
    if (!user) return [];

    return NAVIGATION_CONFIG.map((group) => {
      if (group.isDropdown) {
        const allowedItems = group.items.filter((item) => isAllowed(item.to, user.role));
        return { ...group, items: allowedItems };
      }
      return group;
    }).filter((group) => {
      const hasAccess = group.roles.includes(user.role);
      const hasAllowedItems = group.items.length > 0;
      return hasAccess && hasAllowedItems;
    });
  }, [user, version]);

  return (
    <div className="flex flex-col gap-2 w-full">
      {visibleGroups.map((group) => {
        if (!group.isDropdown) {
          const item = group.items[0];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              onClick={() => {
                onClose();
                if (item.to === "/pipeline") {
                  closeCandidate();
                }
              }}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-xl p-3 text-base font-semibold transition-all duration-150 border border-transparent",
                  isActive
                    ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))] shadow-sm"
                    : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                )
              }
            >
              {getNavIcon(item.to)}
              <span className="ml-3 text-base font-semibold tracking-tight">{item.label}</span>
            </NavLink>
          );
        }

        const isGroupActive = group.items.some((item) => location.pathname.startsWith(item.to));
        const isOpen = openDropdownLabel === group.label;

        return (
          <div key={group.label} className="flex flex-col gap-1 w-full">
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-xl p-3 text-base font-semibold transition-all duration-150 border border-transparent",
                isGroupActive
                  ? "text-[hsl(var(--nav-text))] font-bold bg-white/5"
                  : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
              )}
              onClick={() => setOpenDropdownLabel(isOpen ? null : group.label)}
              aria-expanded={isOpen}
            >
              <div className="flex items-center min-w-0">
                {getNavIcon(group.label)}
                <span className="ml-3 text-base font-semibold tracking-tight">{group.label}</span>
              </div>
              <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform opacity-60", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
              <div className="flex flex-col gap-1 pl-10 pr-2 py-1 transition-all">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/admin"}
                    onClick={() => {
                      onClose();
                      if (item.to === "/pipeline") {
                        closeCandidate();
                      }
                    }}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center rounded-lg py-2.5 px-3 text-sm font-semibold transition-all duration-150 border border-transparent",
                        isActive
                          ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] border-[hsl(var(--nav-border))]/30 shadow-sm"
                          : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                      )
                    }
                  >
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user?.role]);

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))] flex flex-col lg:flex-row">
      {/* ── Left Vertical Sidebar (Desktop Only) ── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-16 hover:w-64 flex-col border-r border-[hsl(var(--nav-border))]/90 bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] transition-all duration-300 ease-in-out group shadow-[4px_0_24px_-10px_rgba(0,0,0,0.3)] hover:shadow-[8px_0_36px_-6px_rgba(0,0,0,0.5)]">
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center border-b border-[hsl(var(--nav-border))]/90 px-3.5 group-hover:px-6 transition-all duration-300">
          <button
            type="button"
            onClick={() => navigate("/pipeline")}
            className="flex items-center gap-3 rounded-xl border border-transparent text-left transition hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))] px-1 py-1"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[hsl(var(--primary))] text-xs font-extrabold text-white shadow-sm">
              RA
            </div>
            <div className="min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ml-3">
              <p className="font-heading text-sm font-extrabold tracking-tight text-[hsl(var(--nav-text))] truncate">
                Marajo RH
              </p>
              <p className="text-[10px] text-[hsl(var(--nav-muted))] leading-tight truncate">
                ATS & Recrutamento IA
              </p>
            </div>
          </button>
        </div>

        {/* Desktop Vertical Nav Links */}
        <nav className="flex-1 overflow-y-auto px-2 group-hover:px-4 py-6 space-y-1.5 transition-all duration-300">
          {user?.role === "admin" || user?.role === "manager" ? <AdminNavigation /> : <RecruiterNavigation />}
        </nav>

        {/* Sidebar Footer Controls & Profile */}
        <div className="mt-auto border-t border-[hsl(var(--nav-border))]/90 p-2.5 group-hover:p-4 space-y-4 bg-black/10 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="w-0 group-hover:w-auto overflow-hidden group-hover:overflow-visible opacity-0 group-hover:opacity-100 transition-all duration-300">
              <VisualThemeSwitcher />
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
              title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--nav-border))]/60 bg-white/5 p-1.5 group-hover:p-3 backdrop-blur-sm transition-all duration-300">
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="min-w-0 flex flex-1 items-center text-left hover:opacity-80 transition-opacity"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="h-7 w-7 group-hover:h-8 group-hover:w-8 shrink-0 rounded-lg object-cover transition-all duration-300"
                />
              ) : (
                <div className="flex h-7 w-7 group-hover:h-8 group-hover:w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-xs font-semibold text-white transition-all duration-300">
                  {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
              <div className="min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ml-2">
                <p className="text-xs font-bold text-[hsl(var(--nav-text))] truncate">
                  {user?.full_name.split(' ')[0]}
                </p>
                <p className="text-[10px] text-[hsl(var(--nav-muted))] truncate">
                  {user?.role ? ROLE_LABELS[user.role] : ""}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="h-7 w-7 group-hover:h-8 group-hover:w-8 shrink-0 flex items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--danger))] hover:text-white transition-colors duration-300"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area and Header ── */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-16">
        {/* Global Sticky Top Header */}
        <header className="flex h-16 w-full items-center justify-between border-b border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))]/90 backdrop-blur-md px-6 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger menu */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text))] hover:bg-[hsl(var(--surface-muted))]/80 transition-all"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[hsl(var(--primary))] text-[10px] font-extrabold text-white animate-pulse">
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

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-x-0 top-16 z-40 border-b border-[hsl(var(--nav-border))] bg-[hsl(var(--nav-bg))] px-4 py-5 shadow-2xl animate-in slide-in-from-top duration-300 flex flex-col gap-4">
            <nav className="flex flex-col gap-2">
              {user?.role === "admin" || user?.role === "manager" ? (
                <AdminMobileNavigation setMobileMenuOpen={setMobileMenuOpen} />
              ) : (
                <RecruiterMobileNavigation setMobileMenuOpen={setMobileMenuOpen} />
              )}
            </nav>

            <div className="border-t border-[hsl(var(--nav-border))] pt-4 flex flex-col gap-3">
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
                    className="h-9 px-4 rounded-xl border border-white/20 bg-white/5 font-semibold text-xs text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    <UserRound className="h-4 w-4" />
                    Perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="h-9 px-4 rounded-xl border border-transparent bg-[hsl(var(--danger))]/15 font-semibold text-xs text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))] hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    Sair
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
