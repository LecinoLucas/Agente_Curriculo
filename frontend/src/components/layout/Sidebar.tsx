import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, X, LogOut, Moon, Sun, UserRound, HelpCircle } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { TopNavGroup } from "./TopNavDropdown";
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";
import { NotificationsBell } from "../../features/notifications/components/NotificationsBell";

type SidebarProps = {
  groups: TopNavGroup[];
  mobileMenuOpen: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

export function Sidebar({
  groups,
  mobileMenuOpen,
  theme,
  onToggleMobileMenu,
  onLogout,
  onToggleTheme,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: SidebarProps) {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isHovered, setIsHovered] = useState(false);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  // Fechar todos os grupos quando sair do menu
  useEffect(() => {
    if (!isHovered && !mobileMenuOpen) {
      setExpandedGroups({});
    }
  }, [isHovered, mobileMenuOpen]);

  return (
    <>
      {/* ── Mobile Drawer Backdrop ── */}
      <div
        className={cn(
          "fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggleMobileMenu}
      />

      {/* Placeholder space for the fixed sidebar so main content doesn't underlap */}
      <div className="hidden lg:block lg:w-16 shrink-0" />

      {/* ── Sidebar Container ── */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-[60] flex flex-col bg-[#0f131a] text-[hsl(var(--nav-text))] shadow-xl transition-all duration-300 ease-in-out border-r border-slate-800/80",
          mobileMenuOpen ? "translate-x-0 w-56" : "-translate-x-full lg:translate-x-0 lg:w-16",
          isHovered && "lg:w-56"
        )}
        style={{
          "--nav-bg": "210 26% 8%",
          "--nav-text": "0 0% 100%",
          "--nav-border": "215 15% 20%",
          "--nav-active-bg": "215 15% 22%",
          "--nav-active-text": "0 0% 100%",
          "--nav-muted": "215 15% 65%",
        } as any}
      >
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header / Logo */}
          <div className={cn("flex h-14 shrink-0 items-center justify-between border-b border-slate-800/60 px-4",
            "lg:px-0 lg:justify-center",
            (isHovered || mobileMenuOpen) && "lg:px-4 lg:justify-between"
          )}>
            <button
              type="button"
              onClick={() => {
                navigate("/pipeline");
                onPipelineClick();
                if (mobileMenuOpen) onToggleMobileMenu();
              }}
              className={cn(
                "flex items-center overflow-hidden text-left outline-none rounded-lg transition-transform hover:scale-[1.02] w-full",
                "justify-center",
                (isHovered || mobileMenuOpen) && "lg:justify-start"
              )}
              title="Ir para Pipeline"
            >
              <div className="flex h-9 min-w-[36px] w-auto px-1.5 shrink-0 items-center justify-center rounded-lg bg-[#b91c1c] text-[10px] font-bold text-white shadow-md shadow-red-950/20 whitespace-nowrap">
                RH Ia
              </div>
              <div className={cn("flex flex-col min-w-0 transition-all duration-300 ease-in-out", 
                "lg:max-w-0 lg:opacity-0 lg:overflow-hidden lg:ml-0",
                (isHovered || mobileMenuOpen) && "lg:max-w-[150px] lg:opacity-100 lg:ml-3",
                mobileMenuOpen ? "max-w-[150px] opacity-100 ml-3" : ""
              )}>
                <span className="truncate font-heading text-[13px] font-extrabold leading-tight tracking-tight text-white">
                  ATS Marajó
                </span>
                <span className="truncate text-[10px] leading-tight text-slate-400">
                  ATS & Recrutamento IA
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-1 rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-0 space-y-1 scrollbar-thin scrollbar-slate-800 hover:scrollbar-thumb-slate-700">
            {groups.map((group) => {
              if (!group.isDropdown) {
                const item = group.items[0];
                const active = isItemActive(item.to);
                const content = (
                  <>
                    {/* Active left indicator */}
                    {active && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#b91c1c] rounded-r-sm" />
                    )}
                    <div className={cn(
                      "flex shrink-0 items-center justify-center w-9 h-9 transition-transform duration-300", 
                      active && "scale-105"
                    )}>
                      {renderIcon(item.iconKey ?? item.to)}
                    </div>
                    <span className={cn(
                      "truncate transition-all duration-300 ease-in-out whitespace-nowrap text-[13px] font-semibold inline-block",
                      "lg:max-w-0 lg:opacity-0 lg:overflow-hidden lg:ml-0",
                      (isHovered || mobileMenuOpen) && "lg:max-w-[150px] lg:opacity-100 lg:ml-3",
                      mobileMenuOpen ? "max-w-[150px] opacity-100 ml-3" : ""
                    )}>
                      {item.label}
                    </span>
                  </>
                );
                const className = cn(
                  "group relative flex items-center transition-all duration-150 outline-none w-full py-1",
                  "justify-start px-4 lg:px-0",
                  (isHovered || mobileMenuOpen) ? "lg:justify-start lg:px-3.5" : "lg:justify-center",
                  active
                    ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
                    : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]"
                );

                return item.external ? (
                  <a
                    key={`${item.label}-${item.to}`}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (mobileMenuOpen) onToggleMobileMenu();
                    }}
                    className={className}
                    title={item.label}
                  >
                    {content}
                  </a>
                ) : (
                  <NavLink
                    key={`${item.label}-${item.to}`}
                    to={item.to}
                    onClick={() => {
                      if (mobileMenuOpen) onToggleMobileMenu();
                      if (item.to === "/pipeline") onPipelineClick();
                    }}
                    className={className}
                    title={item.label}
                  >
                    {content}
                  </NavLink>
                );
              }

              const isGroupActive = group.items.some((item) => isItemActive(item.to));
              const isOpen = expandedGroups[group.label];
              
              const activeSubItem = group.items.find((item) => isItemActive(item.to));
              const groupIconKey = activeSubItem ? (activeSubItem.iconKey ?? activeSubItem.to) : group.label;
              const className = cn(
                "group relative flex items-center transition-all duration-150 outline-none w-full py-1",
                "justify-start px-4 lg:px-0",
                (isHovered || mobileMenuOpen) ? "lg:justify-start lg:px-3.5" : "lg:justify-center",
                isGroupActive && !isOpen
                  ? "bg-[hsl(var(--nav-active-bg))]/35 text-[hsl(var(--nav-active-text))]"
                  : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]"
              );

              return (
                <div key={group.label} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className={className}
                    title={group.label}
                  >
                    {isGroupActive && !isOpen && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#b91c1c] rounded-r-sm" />
                    )}
                    <div className={cn(
                      "flex shrink-0 items-center justify-center w-9 h-9 transition-transform duration-300", 
                      isGroupActive && "scale-105"
                    )}>
                      {renderIcon(groupIconKey)}
                    </div>
                    <span className={cn(
                      "truncate transition-all duration-300 ease-in-out whitespace-nowrap text-[13px] font-semibold inline-block",
                      "lg:max-w-0 lg:opacity-0 lg:overflow-hidden lg:ml-0",
                      (isHovered || mobileMenuOpen) && "lg:max-w-[150px] lg:opacity-100 lg:ml-3",
                      mobileMenuOpen ? "max-w-[150px] opacity-100 ml-3" : ""
                    )}>
                      {group.label}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-all duration-300 opacity-60 ml-auto mr-1",
                        isOpen && "rotate-180",
                        "hidden lg:hidden",
                        (isHovered || mobileMenuOpen) && "lg:block lg:opacity-60",
                        mobileMenuOpen ? "block" : ""
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "flex flex-col gap-1 overflow-hidden transition-all duration-300",
                      isOpen ? "max-h-[400px] mt-1" : "max-h-0"
                    )}
                  >
                    {group.items.map((item) => {
                      const active = isItemActive(item.to);
                      const content = (
                        <>
                          {active && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#b91c1c] rounded-r-sm" />
                          )}
                          <span className="truncate">{item.label}</span>
                        </>
                      );
                      const subClassName = cn(
                        "relative flex items-center py-2 pl-12 pr-4 text-[13px] font-semibold transition-all duration-150 border border-transparent outline-none",
                        active
                          ? "bg-[hsl(var(--nav-active-bg))]/50 text-[hsl(var(--nav-active-text))]"
                          : "text-[hsl(var(--nav-muted))] hover:bg-[hsl(var(--nav-active-bg))]/35 hover:text-[hsl(var(--nav-text))]",
                        "lg:hidden",
                        (isHovered || mobileMenuOpen) && "lg:flex",
                        mobileMenuOpen ? "flex" : ""
                      );

                      return item.external ? (
                        <a
                          key={`${item.label}-${item.to}`}
                          href={item.to}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            if (mobileMenuOpen) onToggleMobileMenu();
                          }}
                          className={subClassName}
                          title={item.label}
                        >
                          {content}
                        </a>
                      ) : (
                        <NavLink
                          key={`${item.label}-${item.to}`}
                          to={item.to}
                          onClick={() => {
                            if (mobileMenuOpen) onToggleMobileMenu();
                            if (item.to === "/pipeline") onPipelineClick();
                          }}
                          className={subClassName}
                          title={item.label}
                        >
                          {content}
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Footer — logout always visible; utilities shown when expanded */}
          <div className="shrink-0 border-t border-slate-800/60 p-2 flex flex-col gap-1">
            {/* Expanded-only: theme switcher + profile */}
            <div className={cn(
              "flex items-center justify-between px-1 pb-1",
              "lg:hidden",
              (isHovered || mobileMenuOpen) && "lg:flex",
              mobileMenuOpen ? "flex" : ""
            )}>
              <VisualThemeSwitcher />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/40 hover:text-white"
                  title={theme === "light" ? "Modo escuro" : "Modo claro"}
                >
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (mobileMenuOpen) onToggleMobileMenu();
                    navigate("/perfil");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/40 hover:text-white"
                  title="Meu perfil"
                >
                  <UserRound className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Help Button */}
            <button
              type="button"
              className={cn(
                "group/help relative flex items-center transition-all duration-150 outline-none w-full py-1",
                "justify-start px-4 lg:px-0",
                (isHovered || mobileMenuOpen) ? "lg:justify-start lg:px-3.5" : "lg:justify-center",
                "text-slate-400 hover:bg-slate-800/30 hover:text-white"
              )}
              title="Ajuda"
            >
              <div className="flex shrink-0 items-center justify-center w-9 h-9">
                <HelpCircle className="h-[1.125rem] w-[1.125rem]" />
              </div>
              <span className={cn(
                "truncate text-[13px] font-semibold transition-all duration-300 ease-in-out whitespace-nowrap inline-block",
                "lg:max-w-0 lg:opacity-0 lg:overflow-hidden lg:ml-0",
                (isHovered || mobileMenuOpen) && "lg:max-w-[150px] lg:opacity-100 lg:ml-3",
                mobileMenuOpen ? "max-w-[150px] opacity-100 ml-3" : ""
              )}>
                Ajuda
              </span>
            </button>

            {/* Always visible: logout */}
            <button
              type="button"
              onClick={onLogout}
              className={cn(
                "group/logout relative flex items-center transition-all duration-150 outline-none w-full py-1",
                "justify-start px-4 lg:px-0",
                (isHovered || mobileMenuOpen) ? "lg:justify-start lg:px-3.5" : "lg:justify-center",
                "text-slate-400 hover:bg-red-950/20 hover:text-red-400"
              )}
              title="Sair"
            >
              <div className="flex shrink-0 items-center justify-center w-9 h-9">
                <LogOut className="h-[1.125rem] w-[1.125rem]" />
              </div>
              <span className={cn(
                "truncate text-[13px] font-semibold transition-all duration-300 ease-in-out whitespace-nowrap inline-block",
                "lg:max-w-0 lg:opacity-0 lg:overflow-hidden lg:ml-0",
                (isHovered || mobileMenuOpen) && "lg:max-w-[150px] lg:opacity-100 lg:ml-3",
                mobileMenuOpen ? "max-w-[150px] opacity-100 ml-3" : ""
              )}>
                Sair
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
