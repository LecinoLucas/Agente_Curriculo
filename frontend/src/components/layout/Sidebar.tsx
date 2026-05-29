import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, X, LogOut, Moon, Sun, UserRound } from "lucide-react";
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

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  useEffect(() => {
    const newExpanded: Record<string, boolean> = {};
    groups.forEach((group) => {
      if (group.isDropdown && group.items.some((item) => isItemActive(item.to))) {
        newExpanded[group.label] = true;
      }
    });
    setExpandedGroups((prev) => ({ ...prev, ...newExpanded }));
  }, [groups, isItemActive]);

  return (
    <>
      {/* ── Mobile Drawer Backdrop ── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggleMobileMenu}
      />

      {/* Placeholder space for the fixed sidebar so main content doesn't underlap */}
      <div className="hidden lg:block lg:w-[4.5rem] shrink-0" />

      {/* ── Sidebar Container ── */}
      <aside
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 flex flex-col bg-[hsl(var(--nav-bg))] text-[hsl(var(--nav-text))] shadow-xl transition-all duration-300 ease-in-out border-r border-[hsl(var(--nav-border))]/50",
          mobileMenuOpen ? "translate-x-0 w-56" : "-translate-x-full lg:translate-x-0 lg:w-[4.5rem] hover:lg:w-56"
        )}
      >
        {/* Header / Logo */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--nav-border))]/50 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[hsl(var(--nav-active-bg))] text-[10px] font-extrabold text-white">
              RA
            </div>
            <div className={cn("flex flex-col min-w-0 transition-opacity duration-300", 
              "lg:opacity-0 group-hover/sidebar:lg:opacity-100",
              mobileMenuOpen ? "opacity-100" : ""
            )}>
              <span className="truncate font-heading text-[13px] font-extrabold leading-tight tracking-tight text-[hsl(var(--nav-text))]">
                Marajo RH
              </span>
              <span className="truncate text-[10px] leading-tight text-[hsl(var(--nav-muted))]">
                ATS & Recrutamento IA
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-1 rounded-lg hover:bg-white/10 text-[hsl(var(--nav-muted))] hover:text-[hsl(var(--nav-text))] transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
          {groups.map((group) => {
            if (!group.isDropdown) {
              const item = group.items[0];
              const active = isItemActive(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => {
                    if (mobileMenuOpen) onToggleMobileMenu();
                    if (item.to === "/pipeline") onPipelineClick();
                  }}
                  className={cn(
                    "group flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                    active
                      ? "bg-[hsl(var(--nav-active-bg))] text-[hsl(var(--nav-active-text))] shadow-sm"
                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                  )}
                  title={item.label}
                >
                  <div className="flex shrink-0 items-center justify-center">
                    {renderIcon(item.to)}
                  </div>
                  <span className={cn(
                    "ml-3 truncate transition-opacity duration-300",
                    "lg:opacity-0 group-hover/sidebar:lg:opacity-100",
                    mobileMenuOpen ? "opacity-100" : ""
                  )}>
                    {item.label}
                  </span>
                </NavLink>
              );
            }

            const isGroupActive = group.items.some((item) => isItemActive(item.to));
            const isOpen = expandedGroups[group.label];

            return (
              <div key={group.label} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--nav-bg))]",
                    isGroupActive && !isOpen
                      ? "text-[hsl(var(--nav-active-text))] bg-white/5"
                      : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]"
                  )}
                  title={group.label}
                >
                  <div className="flex items-center min-w-0">
                    <div className="flex shrink-0 items-center justify-center">
                      {renderIcon(group.label)}
                    </div>
                    <span className={cn(
                      "ml-3 truncate transition-opacity duration-300",
                      "lg:opacity-0 group-hover/sidebar:lg:opacity-100",
                      mobileMenuOpen ? "opacity-100" : ""
                    )}>
                      {group.label}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-300 opacity-60",
                      isOpen && "rotate-180",
                      "lg:hidden group-hover/sidebar:lg:block",
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
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => {
                          if (mobileMenuOpen) onToggleMobileMenu();
                          if (item.to === "/pipeline") onPipelineClick();
                        }}
                        className={cn(
                          "flex items-center rounded-lg py-2 pl-10 pr-3 text-[13px] font-medium transition-all duration-150 border border-transparent outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--nav-active-bg))]",
                          active
                            ? "bg-[hsl(var(--nav-active-bg))]/50 text-[hsl(var(--nav-active-text))] font-semibold"
                            : "text-[hsl(var(--nav-muted))] hover:bg-white/5 hover:text-[hsl(var(--nav-text))]",
                          "lg:hidden group-hover/sidebar:lg:flex",
                          mobileMenuOpen ? "flex" : ""
                        )}
                        title={item.label}
                      >
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer actions inside sidebar (for mobile primarily, but can show in expanded desktop) */}
        <div className={cn(
          "shrink-0 border-t border-[hsl(var(--nav-border))]/50 p-3",
          "lg:hidden group-hover/sidebar:lg:block",
          mobileMenuOpen ? "block" : ""
        )}>
           <div className="flex flex-col gap-3">
             <div className="flex items-center justify-between px-1">
               <VisualThemeSwitcher />
             </div>
             <div className="flex items-center gap-2 justify-between px-1">
               <div className="flex gap-2">
                 <button
                   type="button"
                   onClick={onToggleTheme}
                   className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
                 >
                   {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                 </button>
                 <button
                   type="button"
                   onClick={() => {
                     if (mobileMenuOpen) onToggleMobileMenu();
                     navigate("/perfil");
                   }}
                   className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--nav-active-bg))] hover:text-[hsl(var(--nav-text))]"
                 >
                   <UserRound className="h-4 w-4" />
                 </button>
               </div>
               <button
                 type="button"
                 onClick={onLogout}
                 className="flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--danger))] hover:text-white"
               >
                 <LogOut className="h-4 w-4" />
               </button>
             </div>
           </div>
        </div>
      </aside>
    </>
  );
}
