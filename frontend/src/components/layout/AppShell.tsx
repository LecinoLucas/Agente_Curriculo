import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Moon, PanelTop, Sun, UserRound, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ActionMenu } from "../common/ActionMenu";
import { useAuth } from "../../features/auth/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { UserRole } from "../../types/auth";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";

type NavItem = {
  to: string;
  label: string;
  caption: string;
  roles: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { to: "/pipeline",    label: "Pipeline",     caption: "Fluxo e etapas",       roles: ["admin", "recruiter", "viewer"] },
  { to: "/candidatos",  label: "Candidatos",   caption: "Base de perfis",        roles: ["admin", "recruiter", "viewer"] },
  { to: "/vagas",       label: "Vagas",        caption: "Oportunidades abertas", roles: ["admin", "recruiter", "viewer"] },
  { to: "/analises-ia", label: "Análises IA",  caption: "Execuções e status",    roles: ["admin", "recruiter"] },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/admin",                label: "Painel admin",      caption: "Visão geral",                roles: ["admin"] },
  { to: "/admin/usuarios",       label: "Usuários internos", caption: "Equipe e acessos",           roles: ["admin"] },
  { to: "/admin/skills",         label: "Skills",            caption: "Competências e tecnologias", roles: ["admin"] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin:     "Administrador",
  recruiter: "Recrutador",
  candidate: "Candidato",
  viewer:    "Visualizador",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => user && item.roles.includes(user.role)),
    [user],
  );
  const visibleAdminItems = useMemo(
    () => ADMIN_ITEMS.filter((item) => user && item.roles.includes(user.role)),
    [user],
  );

  const isAdminActive = useMemo(
    () => visibleAdminItems.some((item) => location.pathname.startsWith(item.to)),
    [location.pathname, visibleAdminItems],
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user?.role]);

  // ── Desktop nav link — rendered on the dark navbar ────────────────
  function renderDesktopLink(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/admin"}
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

  // ── Mobile nav link ───────────────────────────────────────────────
  function renderMobileLink(item: NavItem) {
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

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))]">

      {/* ── Top navigation bar (dark in light mode, darker-dark in dark mode) ── */}
      <header className="sticky top-0 z-40 border-b border-[hsl(var(--nav-border))]/90 bg-[hsl(var(--nav-bg))]/95 shadow-[0_18px_40px_-34px_hsl(var(--text)/0.18)] backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--nav-bg))]/88">
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
          <nav className="ml-2 hidden flex-1 items-center gap-1.5 lg:flex">
            {visibleItems.map(renderDesktopLink)}
            {visibleAdminItems.length > 0 ? (
              <div className="relative group">
                <button
                  type="button"
                  className={cn(
                    "group relative flex min-w-[118px] flex-col rounded-2xl px-3.5 py-2.5 transition-all duration-150",
                    isAdminActive
                      ? "border border-[hsl(var(--nav-border))] bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-text))] shadow-[0_14px_30px_-24px_hsl(var(--text)/0.35)]"
                      : "border border-transparent text-[hsl(var(--nav-muted))] hover:border-[hsl(var(--nav-border))]/70 hover:bg-[hsl(var(--nav-active-bg))]/70 hover:text-[hsl(var(--nav-text))]",
                  )}
                  onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">Admin</span>
                    <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180" />
                  </div>
                  <span className="mt-0.5 text-[11px] leading-tight opacity-70">
                    Gerenciamento
                  </span>
                </button>

                {/* Dropdown menu */}
                <div
                  className={cn(
                    "absolute left-0 top-full mt-2 hidden w-max rounded-2xl border border-[hsl(var(--border))]/90 bg-[hsl(var(--surface))]/98 shadow-[0_22px_44px_-28px_hsl(var(--text)/0.28)] backdrop-blur transition-all duration-150 group-hover:block",
                    adminDropdownOpen && "block",
                  )}
                >
                  {visibleAdminItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/admin"}
                      onClick={() => setAdminDropdownOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex flex-col px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl",
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
            ) : null}
          </nav>

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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(214_44%_34%)] text-sm font-semibold text-white shadow-[0_16px_30px_-22px_hsl(var(--primary)/0.68)]">
                {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
              </div>
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(214_44%_34%)] text-sm font-semibold text-white">
                  {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[hsl(var(--nav-text))]">
                    {user?.full_name}
                  </p>
                  <p className="text-xs text-[hsl(var(--nav-muted))]">
                    {user?.role ? ROLE_LABELS[user.role] : ""}
                  </p>
                </div>
              </div>

              <nav className="flex flex-col gap-1">
                {visibleItems.map(renderMobileLink)}
              </nav>

              {visibleAdminItems.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setAdminDropdownOpen(!adminDropdownOpen)}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 transition-colors hover:bg-[hsl(var(--nav-active-bg))]/60 hover:text-[hsl(var(--nav-text))]"
                  >
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold tracking-tight text-[hsl(var(--nav-text))]">Admin</p>
                      <p className="mt-0.5 text-xs opacity-70">Gerenciamento</p>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", adminDropdownOpen && "rotate-180")} />
                  </button>
                  {adminDropdownOpen ? (
                    <div className="flex flex-col gap-1 rounded-2xl bg-[hsl(var(--nav-active-bg))]/40 p-2">
                      {visibleAdminItems.map(renderMobileLink)}
                    </div>
                  ) : null}
                </div>
              ) : null}

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
    </div>
  );
}
