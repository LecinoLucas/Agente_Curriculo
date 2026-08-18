import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { TopNavGroup } from "./TopNavDropdown";
import { SidebarUserMenu } from "./SidebarUserMenu";

type SidebarProps = {
  groups: TopNavGroup[];
  mobileMenuOpen: boolean;
  sidebarExpanded: boolean;
  theme: string;
  userName: string;
  userEmail: string;
  onToggleMobileMenu: () => void;
  onToggleSidebarExpanded: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  isItemActive: (itemTo: string) => boolean;
  renderIcon: (key: string) => ReactNode;
  onPipelineClick: () => void;
};

// Map groups into visual section headers matching ATS Marajó design
function getSectionHeader(groupLabel: string): string | null {
  const label = groupLabel.toLowerCase();
  if (label.includes("recrutamento")) return "RECRUTAMENTO";
  if (label.includes("admissão")) return "ADMISSÃO";
  if (label.includes("avaliações") || label.includes("gestores")) return "GESTÃO";
  if (label.includes("administração") || label.includes("outros")) return "CONFIGURAÇÕES";
  return null;
}

export function Sidebar({
  groups,
  mobileMenuOpen,
  sidebarExpanded,
  theme,
  userName,
  userEmail,
  onToggleMobileMenu,
  onToggleSidebarExpanded,
  onLogout,
  onToggleTheme,
  isItemActive,
  renderIcon,
  onPipelineClick,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Single active open group (accordion) and explicit closed group override
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null);
  const [closedGroupLabel, setClosedGroupLabel] = useState<string | null>(null);
  const [openNestedLabel, setOpenNestedLabel] = useState<string | null>(null);

  // Reset dropdown overrides on navigation
  useEffect(() => {
    setOpenGroupLabel(null);
    setClosedGroupLabel(null);
    setOpenNestedLabel(null);
  }, [location.pathname]);

  const toggleGroup = (groupLabel: string, isCurrentlyOpen: boolean) => {
    if (isCurrentlyOpen) {
      // If currently open, close it!
      setOpenGroupLabel(null);
      setClosedGroupLabel(groupLabel);
    } else {
      // If currently closed, open exclusively (closing all others)
      setOpenGroupLabel(groupLabel);
      setClosedGroupLabel(null);
    }
  };

  const isExpanded = sidebarExpanded || mobileMenuOpen;

  const renderMobileLink = (item: TopNavGroup["items"][number]) => {
    const active = isItemActive(item.to);
    const subClasses = cn(
      "relative flex items-center py-1.5 px-2 text-[11px] font-medium rounded-lg transition-all duration-150 outline-none",
      active
        ? "bg-[hsl(var(--nav-active-bg))]/50 !bg-[hsl(var(--brand-soft))] !text-[hsl(var(--brand-dark))] dark:!bg-[hsl(var(--brand-dark))]/40 dark:!text-[hsl(var(--brand-glow))] font-bold"
        : "text-text-muted hover:bg-surface-muted hover:text-text",
    );
    const handleClick = () => {
      if (mobileMenuOpen) onToggleMobileMenu();
      if (item.to === "/pipeline") onPipelineClick();
      setOpenGroupLabel(null);
      setClosedGroupLabel(null);
      setOpenNestedLabel(null);
    };

    return item.external ? (
      <a key={`${item.label}-${item.to}`} href={item.to} target="_blank" rel="noreferrer" onClick={handleClick} className={subClasses} title={item.label}>
        <span className="truncate">{item.label}</span>
      </a>
    ) : (
      <NavLink key={`${item.label}-${item.to}`} to={item.to} onClick={handleClick} className={subClasses} title={item.label}>
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggleMobileMenu}
      />

      {/* Sidebar Fixed Container - Width strictly matched to w-56 (224px) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[60] flex flex-col bg-surface border-r border-border/80 transition-all duration-300 ease-in-out shadow-xs lg:hidden",
          mobileMenuOpen
            ? "translate-x-0 w-56"
            : "-translate-x-full lg:translate-x-0",
          !mobileMenuOpen && (sidebarExpanded ? "lg:w-56" : "lg:w-16")
        )}
      >
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header / Logo — Clicar em ATS Marajó navega para o Pipeline */}
          <div
            className={cn(
              "flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-3.5",
              !isExpanded && "lg:justify-center lg:px-0"
            )}
          >
            {isExpanded && (
              <button
                type="button"
                onClick={() => {
                  navigate("/pipeline");
                  onPipelineClick();
                  if (mobileMenuOpen) onToggleMobileMenu();
                }}
                className="flex items-center gap-2 overflow-hidden text-left outline-none rounded-lg group"
                title="Ir para o Pipeline"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand))] text-white font-black text-xs shadow-xs group-hover:bg-[hsl(var(--brand-dark))] transition-colors">
                  B
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-xs font-extrabold tracking-tight text-text group-hover:text-[hsl(var(--brand-dark))] transition-colors">
                    ATS Marajó
                  </span>
                </div>
              </button>
            )}

            {/* Desktop Collapse Toggle */}
            <button
              type="button"
              onClick={onToggleSidebarExpanded}
              aria-label={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              className="hidden lg:flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              {sidebarExpanded ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-1 rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav
            aria-label="Navegação móvel"
            className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-0.5"
          >
            {groups.map((group, index) => {
              const sectionHeader = isExpanded ? getSectionHeader(group.label) : null;
              const prevGroupHeader = index > 0 ? getSectionHeader(groups[index - 1].label) : null;
              const showSectionHeader = sectionHeader && sectionHeader !== prevGroupHeader;

              if (!group.isDropdown) {
                const item = group.items[0];
                const active = isItemActive(item.to);
                const content = (
                  <>
                    <div className={cn("flex shrink-0 items-center justify-center w-4 h-4", active ? "text-white" : "text-text-muted group-hover:text-text")}>
                      {renderIcon(item.iconKey ?? item.to)}
                    </div>
                    {isExpanded && (
                      <span className="truncate text-[12px] font-semibold ml-2">
                        {item.label}
                      </span>
                    )}
                  </>
                );

                const navItemClasses = cn(
                  "group relative flex items-center transition-all duration-150 outline-none w-full py-2 rounded-xl text-xs",
                  isExpanded ? "px-2.5" : "justify-center px-0",
                  active
                    ? "bg-[hsl(var(--nav-active-bg))] !bg-[hsl(var(--brand))] !text-white font-semibold shadow-xs shadow-[0_1px_2px_hsl(var(--brand)/0.2)]"
                    : "text-text-muted font-medium hover:bg-surface-muted hover:text-text"
                );

                return (
                  <div key={`${group.label}-${item.to}`}>
                    {showSectionHeader && (
                      <p className="mt-3.5 mb-1 px-2.5 text-[9.5px] font-bold uppercase tracking-wider text-text-muted/70">
                        {sectionHeader}
                      </p>
                    )}
                    {item.external ? (
                      <a
                        href={item.to}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          if (mobileMenuOpen) onToggleMobileMenu();
                        }}
                        className={navItemClasses}
                        title={item.label}
                        style={active ? { backgroundColor: "hsl(var(--brand))", color: "#FFFFFF" } : undefined}
                      >
                        {content}
                      </a>
                    ) : (
                      <NavLink
                        to={item.to}
                        onClick={() => {
                          if (mobileMenuOpen) onToggleMobileMenu();
                          if (item.to === "/pipeline") onPipelineClick();
                        }}
                        className={navItemClasses}
                        title={item.label}
                        style={active ? { backgroundColor: "hsl(var(--brand))", color: "#FFFFFF" } : undefined}
                      >
                        {content}
                      </NavLink>
                    )}
                  </div>
                );
              }

              const isGroupActive = group.items.some((item) => isItemActive(item.to));

              // Precise isOpen calculation
              let isOpen = false;
              if (openGroupLabel === group.label) {
                isOpen = true;
              } else if (closedGroupLabel === group.label) {
                isOpen = false;
              } else if (openGroupLabel === null) {
                isOpen = isGroupActive;
              }

              const activeSubItem = group.items.find((item) => isItemActive(item.to));
              const groupIconKey = activeSubItem ? (activeSubItem.iconKey ?? activeSubItem.to) : group.label;

              const groupButtonClasses = cn(
                "group relative flex items-center transition-all duration-150 outline-none w-full py-2 rounded-xl text-xs",
                isExpanded ? "px-2.5" : "justify-center px-0",
                isGroupActive && !isOpen
                  ? "bg-[hsl(var(--brand-soft))] text-[hsl(var(--brand-dark))] font-semibold"
                  : "text-text-muted font-medium hover:bg-surface-muted hover:text-text"
              );

              return (
                <div key={group.label} className="flex flex-col">
                  {showSectionHeader && (
                    <p className="mt-3.5 mb-1 px-2.5 text-[9.5px] font-bold uppercase tracking-wider text-text-muted/70">
                      {sectionHeader}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label, isOpen)}
                    className={groupButtonClasses}
                    title={group.label}
                  >
                    <div className={cn("flex shrink-0 items-center justify-center w-4 h-4", isGroupActive ? "text-[hsl(var(--brand-dark))]" : "text-text-muted group-hover:text-text")}>
                      {renderIcon(groupIconKey)}
                    </div>
                    {isExpanded && (
                      <>
                        <span className="truncate text-[12px] font-semibold ml-2">
                          {group.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 shrink-0 transition-transform duration-200 opacity-60 ml-auto",
                            isOpen && "rotate-180"
                          )}
                        />
                      </>
                    )}
                  </button>

                  {/* Sub-items list */}
                  {isOpen && (
                    <div className="flex flex-col gap-0.5 mt-0.5 pl-2.5 border-l border-border/60 ml-4 my-0.5">
                      {group.items.map((item) => {
                        if (!item.children?.length) return renderMobileLink(item);

                        const active = item.children.some((child) => isItemActive(child.to));
                        const isNestedOpen = openNestedLabel === item.label;
                        return (
                          <div key={`${item.label}-${item.to}`}>
                            <button
                              type="button"
                              aria-expanded={isNestedOpen}
                              onClick={() => setOpenNestedLabel((current) => current === item.label ? null : item.label)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition-colors",
                                active ? "bg-[hsl(var(--brand-soft))] text-[hsl(var(--brand-dark))] dark:bg-[hsl(var(--brand-dark))]/40 dark:text-[hsl(var(--brand-glow))]" : "text-text-muted hover:bg-surface-muted hover:text-text",
                              )}
                            >
                              <span>{item.label}</span>
                              <ChevronDown className={cn("h-3 w-3 transition-transform", isNestedOpen && "rotate-180")} aria-hidden="true" />
                            </button>
                            {isNestedOpen && (
                              <div className="ml-2 flex flex-col gap-0.5 border-l border-border/60 pl-2" aria-label={`${item.label} subabas`}>
                                {item.children.map(renderMobileLink)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer — User menu */}
          <div className="shrink-0 border-t border-border p-2">
            <SidebarUserMenu
              userName={userName}
              userEmail={userEmail}
              isExpanded={isExpanded}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onLogout={onLogout}
              onNavigateProfile={() => {
                if (mobileMenuOpen) onToggleMobileMenu();
                navigate("/perfil");
              }}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
