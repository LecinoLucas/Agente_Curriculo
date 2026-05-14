import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Moon, PanelTop, Sun, UserRound, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ActionMenu } from "../common/ActionMenu";
import { useAuth } from "../../features/auth/useAuth";
import { usePipeline } from "../../features/pipeline/PipelineContext";
import { useTheme } from "../../hooks/useTheme";
import { UserRole } from "../../types/auth";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";

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
    roles: ["admin", "recruiter", "viewer"],
    isDropdown: false,
    items: [{ to: "/dashboard", label: "Dashboard", caption: "Visão geral", roles: ["admin", "recruiter", "viewer"] }],
  },
  {
    label: "Processo Seletivo",
    caption: "Gestão e Pipeline",
    roles: ["admin", "recruiter", "viewer"],
    isDropdown: true,
    items: [
      { to: "/pipeline", label: "Pipeline", caption: "Fluxo e etapas", roles: ["admin", "recruiter", "viewer"] },
      { to: "/vagas", label: "Vagas", caption: "Oportunidades", roles: ["admin", "recruiter", "viewer"] },
      { to: "/candidatos", label: "Candidatos", caption: "Base de perfis", roles: ["admin", "recruiter", "viewer"] },
      { to: "/agenda", label: "Agenda", caption: "Calendário", roles: ["admin", "recruiter", "viewer"] },
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
      { to: "/admin/auditoria", label: "Auditoria", caption: "Eventos administrativos", roles: ["admin"] },
      { to: "/admin/bi", label: "BI / Métricas", caption: "Indicadores e gráficos", roles: ["admin"] },
      { to: "/admin/health", label: "Health", caption: "Status e consumo", roles: ["admin"] },
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
];

function RecruiterNavigation() {
  const { user } = useAuth();
  const { closeCandidate } = usePipeline();
  const visibleItems = RECRUITER_NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));
  return (
    <nav className="ml-2 hidden flex-1 items-center gap-1.5 lg:flex">
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
              "group relative flex flex-col items-center justify-center rounded-xl px-4 py-2 transition-all duration-150",
              isActive
                ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] shadow-sm"
                : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/50 hover:text-[hsl(var(--nav-text))]",
            )
          }
        >
          <span className="text-sm font-semibold tracking-tight">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function AdminNavigation() {
  const { user } = useAuth();
  const location = useLocation();
  const { closeCandidate } = usePipeline();
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);

  const visibleGroups = useMemo(
    () => NAVIGATION_CONFIG.filter((group) => user && group.roles.includes(user.role)),
    [user],
  );

  useEffect(() => {
    setOpenDropdownLabel(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openDropdownLabel) return;

    const handlePointerDown = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if ((target as HTMLElement).closest('[data-dropdown]')) return;
      setOpenDropdownLabel(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openDropdownLabel]);

  return (
    <nav className="ml-2 hidden flex-1 items-center gap-1.5 lg:flex">
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
                  "group relative flex min-w-[118px] flex-col rounded-2xl px-3.5 py-2.5 transition-all duration-150",
                  isActive
                    ? "border border-[hsl(var(--nav-border))] bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] shadow-[0_14px_30px_-24px_hsl(var(--text)/0.35)]"
                    : "border border-transparent text-[hsl(var(--nav-muted))] hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))]/70 hover:text-[hsl(var(--nav-text))]",
                )
              }
            >
              <span className="text-sm font-semibold tracking-tight">{item.label}</span>
              <span className="mt-0.5 text-[11px] leading-tight opacity-70">
                {item.caption}
              </span>
            </NavLink>
          );
        }

        const isGroupActive = group.items.some((item) => location.pathname.startsWith(item.to));
        const isOpen = openDropdownLabel === group.label;

        return (
          <div key={group.label} className="relative" data-dropdown="true">
            <button
              type="button"
              className={cn(
                "group relative flex min-w-[118px] flex-col rounded-2xl px-3.5 py-2.5 transition-all duration-150",
                isGroupActive
                  ? "border border-[hsl(var(--nav-border))] bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] shadow-[0_14px_30px_-24px_hsl(var(--text)/0.35)]"
                  : "border border-transparent text-[hsl(var(--nav-muted))] hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))]/70 hover:text-[hsl(var(--nav-text))]",
              )}
              onClick={() => setOpenDropdownLabel(isOpen ? null : group.label)}
              aria-expanded={isOpen}
              aria-haspopup="menu"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight">{group.label}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
              </div>
              <span className="mt-0.5 text-[11px] leading-tight opacity-70">
                {group.caption}
              </span>
            </button>

            <div
              className={cn(
                "absolute left-0 top-full mt-2 w-max rounded-2xl border border-[hsl(var(--border))]/90 bg-[hsl(var(--surface))] shadow-[0_22px_44px_-28px_hsl(var(--text)/0.28)] transition-all duration-150 z-50",
                isOpen ? "block" : "hidden",
              )}
              role="menu"
            >
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/admin"}
                  onClick={() => {
                    setOpenDropdownLabel(null);
                    if (item.to === "/pipeline") {
                      closeCandidate();
                    }
                  }}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl min-w-[160px]",
                      isActive
                        ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))]"
                        : "text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--nav-active-bg))]/50 hover:text-[hsl(var(--text))]",
                    )
                  }
                >
                  <span className="text-sm font-semibold tracking-tight">{item.label}</span>
                  <span className="mt-0.5 text-[11px] leading-tight opacity-70">
                    {item.caption}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);

  const visibleGroups = useMemo(
    () => NAVIGATION_CONFIG.filter((group) => user && group.roles.includes(user.role)),
    [user],
  );

  const activeGroupLabel = useMemo(() => {
    const activeGroup = visibleGroups.find((group) =>
      group.items.some((item) => location.pathname.startsWith(item.to))
    );
    return activeGroup?.label || null;
  }, [location.pathname, visibleGroups]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user?.role]);

  useEffect(() => {
    setOpenDropdownLabel(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openDropdownLabel) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if ((target as HTMLElement).closest('[data-dropdown]')) {
        return;
      }
      setOpenDropdownLabel(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openDropdownLabel]);



  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))]">

      {/* ── Top navigation bar (dark in light mode, darker-dark in dark mode) ── */}
      <header className="sticky top-0 z-40 border-b border-[hsl(var(--nav-border))]/90 bg-[hsl(var(--nav-bg))] shadow-[0_18px_40px_-34px_hsl(var(--text)/0.18)]">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3.5 sm:px-6">

          {/* Brand */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/pipeline")}
              className="flex items-center gap-3 rounded-2xl border border-transparent px-2 py-1.5 text-left transition hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))]/68"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] via-[hsl(var(--primary))] to-[hsl(214_44%_34%)] text-xs font-extrabold text-white shadow-[0_16px_30px_-20px_hsl(var(--primary)/0.65)]">
                RA
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-extrabold tracking-tight text-[hsl(var(--nav-text))]">
                  Marajo RH AI System
                </p>
                <p className="text-[11px] text-[hsl(var(--nav-muted))]">
                  Recrutamento com IA e pipeline operacional
                </p>
              </div>
            </button>
          </div>

          {/* Desktop nav */}
          {user?.role === "admin" ? <AdminNavigation /> : <RecruiterNavigation />}

          {/* Right-side controls */}
          <div className="ml-auto flex items-center gap-2">
            <VisualThemeSwitcher />

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-[hsl(var(--nav-muted))] transition-colors hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
              aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
              title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Profile card */}
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="hidden items-center gap-3 rounded-2xl border border-transparent px-3.5 py-2.5 text-left transition hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))] lg:flex"
            >
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--nav-muted))]">
                  Meu perfil
                </p>
                <p className="text-sm font-semibold tracking-tight text-[hsl(var(--nav-text))]">
                  {user?.full_name}
                </p>
                <p className="text-xs text-[hsl(var(--nav-muted))]">
                  {user?.role ? ROLE_LABELS[user.role] : ""}
                </p>
              </div>
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="h-10 w-10 shrink-0 rounded-2xl object-cover shadow-[0_16px_30px_-22px_hsl(var(--primary)/0.68)]"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(214_44%_34%)] text-sm font-semibold text-white shadow-[0_16px_30px_-22px_hsl(var(--primary)/0.68)]">
                  {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
                </div>
              )}
            </button>

            {/* Action menu (logout) */}
            <div className="hidden lg:block">
              <ActionMenu
                buttonLabel="Abrir ações de perfil"
                buttonClassName="!h-10 !w-10 !rounded-2xl !border !border-transparent !bg-transparent !text-[hsl(var(--nav-muted))] hover:!border-[hsl(var(--nav-border))]/70 hover:!bg-[hsl(var(--nav-active-bg))] hover:!text-[hsl(var(--nav-text))]"
                items={[
                  { label: "Meu perfil", onClick: () => navigate("/perfil") },
                  { label: "Sair", onClick: () => void logout(), tone: "danger" },
                ]}
              />
            </div>

            {/* Hamburger (mobile) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-[hsl(var(--nav-muted))] transition-colors hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))] lg:hidden"
              aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Mobile drawer ──────────────────────────────────────────────── */}
        {mobileMenuOpen ? (
          <div className="border-t border-[hsl(var(--nav-border))] bg-[hsl(var(--nav-bg))]/98 px-4 py-4 shadow-[0_24px_46px_-30px_hsl(var(--text)/0.26)] lg:hidden">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">

              {/* Profile summary */}
              <div className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--nav-border))]/70 bg-[hsl(var(--nav-active-bg))] px-4 py-3">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.full_name}
                    className="h-10 w-10 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(214_44%_34%)] text-sm font-semibold text-white">
                    {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[hsl(var(--nav-text))]">
                    {user?.full_name}
                  </p>
                  <p className="text-xs text-[hsl(var(--nav-muted))]">
                    {user?.role ? ROLE_LABELS[user.role] : ""}
                  </p>
                </div>
              </div>

              <nav className="flex flex-col gap-3">
                {user?.role === "admin" ? (
                  visibleGroups.map((group) => {
                    if (!group.isDropdown) {
                      const item = group.items[0];
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === "/admin"}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center justify-between rounded-2xl px-4 py-3 transition-colors",
                              isActive
                                ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))]"
                                : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/60 hover:text-[hsl(var(--nav-text))]",
                            )
                          }
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold tracking-tight">{item.label}</p>
                            <p className="mt-0.5 text-xs opacity-70">{item.caption}</p>
                          </div>
                          <PanelTop className="h-4 w-4 shrink-0 opacity-50" />
                        </NavLink>
                      );
                    }

                    const isOpen = openDropdownLabel === group.label;

                    return (
                      <div key={group.label} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setOpenDropdownLabel(isOpen ? null : group.label)}
                          className="flex items-center justify-between rounded-2xl px-4 py-3 transition-colors hover:bg-[hsl(var(--nav-active-bg))]/60 hover:text-[hsl(var(--nav-text))]"
                        >
                          <div className="min-w-0 text-left">
                            <p className="text-sm font-semibold tracking-tight text-[hsl(var(--nav-text))]">{group.label}</p>
                            <p className="mt-0.5 text-xs opacity-70">{group.caption}</p>
                          </div>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", isOpen && "rotate-180")} />
                        </button>
                        {isOpen ? (
                          <div className="flex flex-col gap-1 rounded-2xl bg-[hsl(var(--nav-active-bg))]/40 p-2">
                            {group.items.map((item) => (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === "/admin"}
                                onClick={() => setMobileMenuOpen(false)}
                                className={({ isActive }) =>
                                  cn(
                                    "flex items-center justify-between rounded-2xl px-4 py-3 transition-colors",
                                    isActive
                                      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))]"
                                      : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/60 hover:text-[hsl(var(--nav-text))]",
                                  )
                                }
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold tracking-tight">{item.label}</p>
                                  <p className="mt-0.5 text-xs opacity-70">{item.caption}</p>
                                </div>
                                <PanelTop className="h-4 w-4 shrink-0 opacity-50" />
                              </NavLink>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  RECRUITER_NAV_ITEMS.filter((item) => user && item.roles.includes(user.role)).map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (item.to === "/pipeline") {
                          closeCandidate();
                        }
                      }}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center justify-between rounded-2xl px-4 py-3 transition-colors",
                          isActive
                            ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))]"
                            : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/60 hover:text-[hsl(var(--nav-text))]",
                        )
                      }
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-tight">{item.label}</p>
                      </div>
                      <PanelTop className="h-4 w-4 shrink-0 opacity-50" />
                    </NavLink>
                  ))
                )}
              </nav>

              <div className="flex flex-col gap-2 border-t border-[hsl(var(--nav-border))] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate("/perfil");
                  }}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-[hsl(var(--nav-muted))] transition-colors hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
                >
                  <UserRound className="h-4 w-4" />
                  Meu perfil
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-[hsl(var(--danger))] transition-colors hover:bg-[hsl(var(--danger))]/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-3.75rem)] w-full max-w-[1600px] flex-1 px-0 pb-8">
        <div className="w-full overflow-y-auto">
          <Outlet />
        </div>
      </main>

      <footer className="w-full border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] py-4 text-center text-sm text-[hsl(var(--nav-muted))]">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
          @LecinoLucas Developer 2026 Rede Marajo RH IA
        </div>
      </footer>
    </div>
  );
}
