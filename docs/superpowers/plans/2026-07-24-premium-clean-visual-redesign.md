# Premium Clean Visual Redesign — Sidebar, TopNavbar e Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o botão de recolher/expandir sidebar duplicado, unificar o rodapé da sidebar (tema/claro-escuro/perfil/logout) em um único menu de usuário, e neutralizar as cores fortes por coluna do Kanban do Pipeline, sem remover nenhuma funcionalidade existente.

**Architecture:** Mudanças localizadas em componentes React + Tailwind já existentes (`Sidebar`, `TopNavbar`, `KanbanColumn`, `KanbanCard`), mais um componente novo (`SidebarUserMenu`) que absorve `VisualThemeSwitcher` (removido). Sem mudança de rotas, de API, ou dos tokens de cor do Tema 1.

**Tech Stack:** React + TypeScript, Tailwind CSS, Vitest + Testing Library.

## Global Constraints

- Não alterar os valores HSL de `--brand`/`--primary`/`--nav-*` nem os temas 2/3/4 (`docs/superpowers/specs/2026-07-24-premium-clean-visual-redesign-design.md`, seção "Escopo").
- Nenhuma funcionalidade existente pode ser removida: troca de tema visual, toggle claro/escuro, link de perfil, logout continuam todos acessíveis.
- Seguir TDD: escrever o teste, rodar e confirmar falha, implementar, rodar e confirmar sucesso, commitar.
- Baseline de testes antes de começar (confirmado rodando `npx vitest run src/components/kanban/__tests__/KanbanCard.bot.test.tsx src/components/layout/__tests__/AppShell.nav.test.tsx` a partir de `frontend/`): **23 passed / 1 failed**. A falha é em `KanbanCard.bot.test.tsx` (feature de "candidato via bot" ainda não implementada em `KanbanCard.tsx` — trabalho de outra frente, fora deste plano). Nenhuma tarefa deste plano deve aumentar esse número de falhas.
- Todos os comandos de teste abaixo assumem `cwd` = `frontend/`.

---

## Task 1: Remover o botão de recolher/expandir menu duplicado

Hoje existe um botão de toggle do sidebar tanto em `TopNavbar.tsx` (linhas 26-35) quanto em `Sidebar.tsx` (linhas 106-117), ambos chamando `onToggleSidebarExpanded`. Este task remove o da `TopNavbar` e move o da `Sidebar` para fora do header (vira um botão flutuante na borda da sidebar, sempre visível, funcionando tanto expandido quanto recolhido — hoje só aparecia quando expandido).

**Files:**
- Modify: `frontend/src/components/layout/TopNavbar.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx:376-386` (chamada de `<TopNavbar>`)
- Test: `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: nenhuma interface nova é consumida por outras tasks deste plano (Task 2 mexe em outra parte do `Sidebar.tsx`, sem depender do resultado desta).

- [ ] **Step 1: Escrever o teste que falha (garante 1 único controle de toggle)**

Adicionar ao final do arquivo `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx`, dentro do `describe("AppShell — Sidebar Nav", ...)`, um novo `describe` (logo após o `describe("interação", ...)` existente, antes do `});` final do arquivo):

```tsx
  describe("controle de recolher sidebar", () => {
    it("existe apenas um botão de recolher/expandir menu (sem duplicidade)", () => {
      renderShell("admin");

      const toggles = screen.getAllByRole("button", { name: /recolher menu/i });
      expect(toggles).toHaveLength(1);
    });
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/AppShell.nav.test.tsx -t "existe apenas um botão"`
Expected: FAIL — encontra 2 botões (`"Recolher menu"` na Sidebar e `"Recolher menu lateral"` na TopNavbar), `toHaveLength(1)` falha porque recebe 2.

- [ ] **Step 3: Remover o toggle da TopNavbar**

Em `frontend/src/components/layout/TopNavbar.tsx`, trocar o import (linha 1):

```tsx
import { Menu, BrainCircuit, Sparkles, PanelLeftOpen, PanelLeftClose } from "lucide-react";
```

por:

```tsx
import { Menu, BrainCircuit, Sparkles } from "lucide-react";
```

Remover `onToggleSidebarExpanded` do tipo `TopNavbarProps` (linha 9) e da assinatura da função (linha 20):

```tsx
type TopNavbarProps = {
  mobileMenuOpen: boolean;
  sidebarExpanded: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onToggleSidebarExpanded: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onOpenAssistant: () => void;
};

export function TopNavbar({
  mobileMenuOpen,
  sidebarExpanded,
  onToggleMobileMenu,
  onToggleSidebarExpanded,
  onOpenAssistant,
}: TopNavbarProps) {
```

vira:

```tsx
type TopNavbarProps = {
  mobileMenuOpen: boolean;
  sidebarExpanded: boolean;
  theme: string;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onOpenAssistant: () => void;
};

export function TopNavbar({
  mobileMenuOpen,
  sidebarExpanded,
  onToggleMobileMenu,
  onOpenAssistant,
}: TopNavbarProps) {
```

Remover o bloco do botão (dentro de `<div className="flex items-center gap-3">`, logo antes do comentário `{/* Mobile Hamburger Button */}`):

```tsx
        {/* Desktop Sidebar Toggle Button */}
        <button
          type="button"
          aria-label={sidebarExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
          title={sidebarExpanded ? "Recolher menu lateral" : "Expandir menu lateral"}
          onClick={onToggleSidebarExpanded}
          className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text))] outline-none transition-colors hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--primary))]"
        >
          {sidebarExpanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

```

`sidebarExpanded` continua no componente porque ainda controla a visibilidade do mini-logo mais abaixo no mesmo arquivo (`className={sidebarExpanded ? "flex lg:hidden items-center gap-1.5" : "flex items-center gap-1.5"}`) — não remover essa parte.

- [ ] **Step 4: Atualizar `AppShell.tsx` para não passar mais `onToggleSidebarExpanded` à TopNavbar**

Em `frontend/src/components/layout/AppShell.tsx`, na chamada `<TopNavbar ... />` (por volta da linha 376), remover a linha:

```tsx
          onToggleSidebarExpanded={toggleSidebarExpanded}
```

Manter essa mesma prop na chamada `<Sidebar ... />` logo acima — ali ela continua sendo usada.

- [ ] **Step 5: Mover o toggle da Sidebar para fora do header, sempre visível**

Em `frontend/src/components/layout/Sidebar.tsx`, remover do header (dentro do primeiro `<div className="flex h-13 ...">`, entre o botão de logo e o "Mobile Close Button") o bloco:

```tsx
            {/* Desktop Toggle Button (Only 1 explicit button to Open/Close) */}
            <button
              type="button"
              onClick={onToggleSidebarExpanded}
              aria-label={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
              className={cn(
                "hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-surface-muted",
                !sidebarExpanded && "hidden"
              )}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>

```

Logo depois da tag de abertura `<aside ...>` e antes de `<div className="flex flex-col flex-1 min-w-0">`, adicionar o botão flutuante:

```tsx
        {/* Toggle flutuante — único controle de recolher/expandir, sempre visível no desktop */}
        <button
          type="button"
          onClick={onToggleSidebarExpanded}
          aria-label={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
          title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
          className="hidden lg:flex absolute top-14 -right-3 z-10 h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--nav-border))] bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))] shadow-sm transition-all hover:scale-110 hover:border-[hsl(var(--primary)/0.4)] hover:text-[hsl(var(--primary))]"
        >
          {sidebarExpanded ? <PanelLeftClose className="h-3 w-3" /> : <PanelLeftOpen className="h-3 w-3" />}
        </button>

```

(`<aside>` já é `position: fixed`, então serve como containing block para o `absolute` do botão — não precisa adicionar `relative`.)

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/AppShell.nav.test.tsx`
Expected: PASS em todos os testes do arquivo (o baseline de 23 passed do restante do arquivo é preservado, mais o novo teste).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/layout/TopNavbar.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/__tests__/AppShell.nav.test.tsx
git commit -m "fix(layout): remove duplicate sidebar collapse toggle"
```

---

## Task 2: Unificar rodapé da Sidebar em um único `SidebarUserMenu`

Substitui os 4 controles soltos do rodapé (paleta de tema, claro/escuro, perfil, sair) por um único menu de usuário (avatar + nome, com popover). Absorve `VisualThemeSwitcher.tsx`, que é removido.

**Files:**
- Create: `frontend/src/components/layout/SidebarUserMenu.tsx`
- Create: `frontend/src/components/layout/__tests__/SidebarUserMenu.test.tsx`
- Modify: `frontend/src/styles/index.css` (novas classes `.sidebar-user-menu*`)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (rodapé + imports + props)
- Modify: `frontend/src/components/layout/AppShell.tsx` (passa `userName`/`userEmail` para `<Sidebar>`)
- Modify: `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx` (mock de `VisualThemeSwitcher` → `SidebarUserMenu`)
- Delete: `frontend/src/components/layout/VisualThemeSwitcher.tsx`

**Interfaces:**
- Consumes: `useVisualTheme()` de `frontend/src/hooks/useVisualTheme.tsx` (já existe, retorna `{ visualTheme, setVisualTheme }`); `VisualTheme` type de `frontend/src/hooks/visualThemeStorage.ts`.
- Produces: `SidebarUserMenu` component com props `{ userName: string; userEmail: string; isExpanded: boolean; theme: string; onToggleTheme: () => void; onLogout: () => void; onNavigateProfile: () => void }`, exportado de `frontend/src/components/layout/SidebarUserMenu.tsx`. `Sidebar` ganha as props `userName: string` e `userEmail: string` em `SidebarProps`.

- [ ] **Step 1: Escrever o teste que falha para `SidebarUserMenu`**

Criar `frontend/src/components/layout/__tests__/SidebarUserMenu.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VisualThemeProvider } from "../../../hooks/useVisualTheme";
import { SidebarUserMenu } from "../SidebarUserMenu";

function renderMenu(theme: "light" | "dark" = "light") {
  const onToggleTheme = vi.fn();
  const onLogout = vi.fn();
  const onNavigateProfile = vi.fn();

  render(
    <VisualThemeProvider>
      <SidebarUserMenu
        userName="Ana Souza"
        userEmail="ana@marajo.com"
        isExpanded
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        onNavigateProfile={onNavigateProfile}
      />
    </VisualThemeProvider>,
  );

  return { onToggleTheme, onLogout, onNavigateProfile };
}

describe("SidebarUserMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("mostra nome e e-mail do usuário no gatilho", () => {
    renderMenu();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("ana@marajo.com")).toBeInTheDocument();
  });

  it("concentra perfil, tema claro/escuro e logout em um único controle", () => {
    const { onNavigateProfile, onToggleTheme, onLogout } = renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /meu perfil/i }));
    expect(onNavigateProfile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /modo escuro/i }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /^sair$/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("permite trocar a paleta de tema visual pelo mesmo menu", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /cobre executivo/i }));

    expect(document.documentElement).toHaveAttribute("data-visual-theme", "theme-2");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/SidebarUserMenu.test.tsx`
Expected: FAIL com "Failed to resolve import" / "Cannot find module '../SidebarUserMenu'" — o componente ainda não existe.

- [ ] **Step 3: Adicionar as classes CSS do menu**

Em `frontend/src/styles/index.css`, logo depois do bloco `.visual-theme-option-indicator { ... }` (por volta da linha 1797) e antes de `@keyframes visual-theme-playground-spin`, adicionar:

```css
  /* --------------------------------------------------------------------------
     Sidebar user menu (perfil, tema, logout unificados)
     -------------------------------------------------------------------------- */

  .sidebar-user-menu {
    position: relative;
  }

  .sidebar-user-menu-trigger {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.75rem;
    border: 1px solid transparent;
    background: transparent;
    padding: 0.375rem 0.5rem;
    text-align: left;
    transition: background-color 150ms ease, border-color 150ms ease;
  }

  .sidebar-user-menu-trigger:hover,
  .sidebar-user-menu-trigger[aria-expanded="true"] {
    background: hsl(var(--surface-muted));
    border-color: hsl(var(--nav-border) / 0.7);
  }

  .sidebar-user-menu-avatar {
    display: flex;
    height: 2rem;
    width: 2rem;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    font-size: 0.7rem;
    font-weight: 800;
  }

  .sidebar-user-menu-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    line-height: 1.15;
  }

  .sidebar-user-menu-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 700;
    color: hsl(var(--nav-text));
  }

  .sidebar-user-menu-email {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.65rem;
    font-weight: 500;
    color: hsl(var(--nav-muted));
  }

  .sidebar-user-menu-popover {
    position: absolute;
    left: 0;
    bottom: calc(100% + 0.5rem);
    z-index: 50;
    width: 15rem;
    border-radius: 0.9rem;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--surface));
    padding: 0.4rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  }

  .sidebar-user-menu-section-title {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.45rem 0.2rem;
    color: hsl(var(--text-muted));
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sidebar-user-menu-row {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.6rem;
    border: 1px solid transparent;
    background: transparent;
    padding: 0.4rem 0.5rem;
    color: hsl(var(--text));
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    transition: background-color 120ms ease;
  }

  .sidebar-user-menu-row:hover {
    background: hsl(var(--accent-soft));
  }

  .sidebar-user-menu-row.is-danger {
    color: hsl(var(--danger));
  }

  .sidebar-user-menu-divider {
    margin: 0.35rem 0.2rem;
    height: 1px;
    background: hsl(var(--border));
  }

```

- [ ] **Step 4: Criar `SidebarUserMenu.tsx`**

Criar `frontend/src/components/layout/SidebarUserMenu.tsx`:

```tsx
import { useState } from "react";
import { Check, ChevronsUpDown, LogOut, Moon, Palette, Sun, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVisualTheme } from "../../hooks/useVisualTheme";
import { type VisualTheme } from "../../hooks/visualThemeStorage";

const THEMES: Array<{ value: VisualTheme; label: string; description: string }> = [
  { value: "theme-1", label: "Tema 1", description: "Vermelho com Cinza Escuro" },
  { value: "theme-2", label: "Cobre Executivo", description: "Premium, quente e corporativo" },
  { value: "theme-3", label: "Aurora Corporativa", description: "Moderno e Tecnológico" },
  { value: "theme-4", label: "Tema 4", description: "Creme Vibrante" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type SidebarUserMenuProps = {
  userName: string;
  userEmail: string;
  isExpanded: boolean;
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigateProfile: () => void;
};

export function SidebarUserMenu({
  userName,
  userEmail,
  isExpanded,
  theme,
  onToggleTheme,
  onLogout,
  onNavigateProfile,
}: SidebarUserMenuProps) {
  const { visualTheme, setVisualTheme } = useVisualTheme();
  const [open, setOpen] = useState(false);
  const initials = getInitials(userName || "?");

  return (
    <div className="sidebar-user-menu">
      <button
        type="button"
        className={cn("sidebar-user-menu-trigger", !isExpanded && "justify-center")}
        aria-label="Menu do usuário"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="sidebar-user-menu-avatar">{initials}</span>
        {isExpanded && (
          <>
            <span className="sidebar-user-menu-copy">
              <span className="sidebar-user-menu-name">{userName}</span>
              <span className="sidebar-user-menu-email">{userEmail}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--nav-muted))]" />
          </>
        )}
      </button>

      {open ? (
        <>
          <div className="visual-theme-backdrop" onClick={() => setOpen(false)} />
          <div
            className="sidebar-user-menu-popover"
            role="dialog"
            aria-modal="false"
            aria-label="Menu do usuário"
          >
            <button
              type="button"
              className="sidebar-user-menu-row"
              onClick={() => {
                setOpen(false);
                onNavigateProfile();
              }}
            >
              <UserRound className="h-4 w-4 shrink-0" />
              Meu perfil
            </button>

            <button
              type="button"
              className="sidebar-user-menu-row"
              onClick={() => {
                setOpen(false);
                onToggleTheme();
              }}
            >
              {theme === "light" ? <Moon className="h-4 w-4 shrink-0" /> : <Sun className="h-4 w-4 shrink-0" />}
              {theme === "light" ? "Modo escuro" : "Modo claro"}
            </button>

            <div className="sidebar-user-menu-divider" />

            <p className="sidebar-user-menu-section-title">
              <Palette className="h-3 w-3" />
              Tema visual
            </p>
            <div className="visual-theme-options">
              {THEMES.map((themeOption) => {
                const isActive = visualTheme === themeOption.value;
                return (
                  <button
                    key={themeOption.value}
                    type="button"
                    className={cn("visual-theme-option", isActive && "is-active")}
                    onClick={() => {
                      setOpen(false);
                      setVisualTheme(themeOption.value);
                    }}
                  >
                    <span
                      className={cn("visual-theme-preview", `visual-theme-preview-${themeOption.value}`)}
                      aria-hidden="true"
                    />
                    <span className="visual-theme-option-copy">
                      <span className="visual-theme-option-label">{themeOption.label}</span>
                      <span className="visual-theme-option-description">{themeOption.description}</span>
                    </span>
                    <span className="visual-theme-option-indicator" aria-hidden="true">
                      {isActive ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="sidebar-user-menu-divider" />

            <button
              type="button"
              className="sidebar-user-menu-row is-danger"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sair
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/SidebarUserMenu.test.tsx`
Expected: PASS nos 3 testes.

- [ ] **Step 6: Ligar `SidebarUserMenu` no rodapé da Sidebar**

Em `frontend/src/components/layout/Sidebar.tsx`, trocar o import (linha 2 e 7):

```tsx
import { ChevronDown, X, LogOut, Moon, Sun, UserRound, PanelLeftClose, PanelLeftOpen } from "lucide-react";
```
e
```tsx
import { VisualThemeSwitcher } from "./VisualThemeSwitcher";
```

por:

```tsx
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
```
e
```tsx
import { SidebarUserMenu } from "./SidebarUserMenu";
```

Adicionar `userName` e `userEmail` ao tipo `SidebarProps` e à assinatura da função:

```tsx
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
```

Substituir todo o bloco do rodapé (comentário `{/* Footer — Controls & Logout */}` até o fechamento do `<button onClick={onLogout}>`):

```tsx
          {/* Footer — Controls & Logout */}
          <div className="shrink-0 border-t border-[hsl(var(--nav-border))] p-2 flex flex-col gap-1">
            {isExpanded && (
              <div className="flex items-center justify-between px-2 py-1">
                <VisualThemeSwitcher />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--nav-text))]"
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
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[hsl(var(--nav-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--nav-text))]"
                    title="Meu perfil"
                  >
                    <UserRound className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              type="button"
              onClick={onLogout}
              className={cn(
                "group/logout relative flex items-center transition-all duration-150 outline-none w-full py-1.5 rounded-lg text-[hsl(var(--nav-muted))] hover:bg-rose-500/10 hover:text-rose-600",
                isExpanded ? "justify-start px-2.5" : "justify-center px-0"
              )}
              title="Sair"
            >
              <div className="flex shrink-0 items-center justify-center w-9 h-9">
                <LogOut className="h-4 w-4" />
              </div>
              {isExpanded && <span className="truncate text-[13px] font-semibold ml-2.5">Sair</span>}
            </button>
          </div>
```

por:

```tsx
          {/* Footer — Menu de usuário (perfil, tema, logout) */}
          <div className="shrink-0 border-t border-[hsl(var(--nav-border))] p-2">
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
```

- [ ] **Step 7: Remover `VisualThemeSwitcher.tsx` e atualizar `AppShell.tsx`**

Deletar o arquivo `frontend/src/components/layout/VisualThemeSwitcher.tsx`.

Em `frontend/src/components/layout/AppShell.tsx`, na chamada `<Sidebar ... />`, adicionar as duas novas props (usando o `user` que o componente já obtém de `useAuth()`):

```tsx
      <Sidebar
        groups={visibleGroups as any}
        mobileMenuOpen={mobileMenuOpen}
        sidebarExpanded={sidebarExpanded}
        theme={theme}
        userName={user?.full_name ?? ""}
        userEmail={user?.email ?? ""}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        onToggleSidebarExpanded={toggleSidebarExpanded}
        onLogout={() => void logout()}
        onToggleTheme={toggleTheme}
        isItemActive={isItemActive}
        renderIcon={getNavIcon}
        onPipelineClick={closeCandidate}
      />
```

- [ ] **Step 8: Atualizar o mock de `AppShell.nav.test.tsx`**

Em `frontend/src/components/layout/__tests__/AppShell.nav.test.tsx`, trocar:

```tsx
vi.mock("../VisualThemeSwitcher", () => ({ VisualThemeSwitcher: () => null }));
```

por:

```tsx
vi.mock("../SidebarUserMenu", () => ({ SidebarUserMenu: () => null }));
```

- [ ] **Step 9: Rodar toda a suíte de layout e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/layout/__tests__/AppShell.nav.test.tsx src/components/layout/__tests__/SidebarUserMenu.test.tsx`
Expected: PASS em todos os testes (nenhuma referência a `VisualThemeSwitcher` deve restar no código-fonte — confirmar com `grep -rn "VisualThemeSwitcher" frontend/src` retornando vazio).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/layout/SidebarUserMenu.tsx frontend/src/components/layout/__tests__/SidebarUserMenu.test.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/AppShell.tsx frontend/src/components/layout/__tests__/AppShell.nav.test.tsx frontend/src/styles/index.css
git rm frontend/src/components/layout/VisualThemeSwitcher.tsx
git commit -m "refactor(layout): unify sidebar footer into a single SidebarUserMenu"
```

---

## Task 3: Neutralizar cores das colunas do Kanban

Remove o fundo/gradiente/badge coloridos por etapa em `KanbanColumn.tsx`, mantendo a cor da etapa só como uma barra fina de 3px no topo (paleta harmonizada, fora da faixa do vermelho da marca).

**Files:**
- Modify: `frontend/src/components/kanban/KanbanColumn.tsx`
- Test: `frontend/src/components/kanban/__tests__/KanbanColumn.test.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: nada consumido por outras tasks (Task 4 mexe em `KanbanCard.tsx`, arquivo separado).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `frontend/src/components/kanban/__tests__/KanbanColumn.test.tsx`, dentro do `describe("KanbanColumn", ...)`, antes do `});` final:

```tsx
  it("não usa mais cor de fundo por etapa no header da coluna (fica neutro)", () => {
    const column = { stage: "offer", macroId: "decisao", label: "Decisão", candidates: [] } as unknown as PipelineColumn;
    render(<KanbanColumn column={column} colIndex={0} />);

    const header = screen.getByText("Decisão").closest("div.pipeline-kanban-column__header");
    expect(header).not.toBeNull();
    expect(header!.className).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it("contador de candidatos usa o mesmo estilo neutro em qualquer etapa", () => {
    const stages = [
      { stage: "entry", macroId: "entrada", label: "Entrada" },
      { stage: "offer", macroId: "decisao", label: "Decisão" },
    ] as const;

    const classNames = stages.map((s) => {
      const column = { ...s, candidates: [] } as unknown as PipelineColumn;
      const { getByTestId, unmount } = render(<KanbanColumn column={column} colIndex={0} />);
      const className = getByTestId("kanban-column-count").className;
      unmount();
      return className;
    });

    expect(classNames[0]).toBe(classNames[1]);
  });

  it("estado vazio usa círculo de ícone neutro em qualquer etapa", () => {
    const macroIds = ["entrada", "decisao"] as const;

    const classNames = macroIds.map((macroId) => {
      const column = { stage: macroId, macroId, label: macroId, candidates: [] } as unknown as PipelineColumn;
      const { container, unmount } = render(<KanbanColumn column={column} colIndex={0} />);
      const circle = container.querySelector("div[class*='rounded-full']");
      const className = circle?.className;
      unmount();
      return className;
    });

    expect(classNames[0]).toBe(classNames[1]);
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd frontend && npx vitest run src/components/kanban/__tests__/KanbanColumn.test.tsx`
Expected: FAIL nos 3 novos testes — o header hoje contém hex por etapa (ex: `#E9D5FF`), o contador (`badge`) e o círculo de ícone do estado vazio também variam por etapa (e ainda não existe `data-testid="kanban-column-count"`).

- [ ] **Step 3: Simplificar `COL_THEMES` e `DEFAULT_THEME` para só ter `accentBar`**

Em `frontend/src/components/kanban/KanbanColumn.tsx`, substituir o bloco de `DEFAULT_THEME` e `COL_THEMES` (linhas 15-96) por:

```ts
const DEFAULT_THEME = {
  accentBar: "bg-slate-300/90 dark:bg-slate-500/55",
};

// Paleta harmonizada (mesma saturação/luminosidade entre etapas), fora da
// faixa do vermelho da marca — a cor vira só a "assinatura" da etapa,
// concentrada na barra de 3px do topo da coluna.
const COL_THEMES: Partial<Record<PipelineStage | PipelineMacroColumnId, { accentBar: string }>> = {
  entrada: { accentBar: "bg-[#3B7DDB]" },
  analise: { accentBar: "bg-[#C98A2E]" },
  entrevista: { accentBar: "bg-[#1F9E8F]" },
  avaliacao: { accentBar: "bg-[#7C5CD4]" },
  decisao: { accentBar: "bg-[#B44FA6]" },
  admissao: { accentBar: "bg-[#2E9E63]" },
  finalizado: { accentBar: "bg-[#6B7280]" },
};
```

- [ ] **Step 4: Neutralizar `getEmptyStateConfig`**

Substituir a função `getEmptyStateConfig` (linhas 98-137) por:

```ts
const EMPTY_STATE_ICON_BG = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300";

const getEmptyStateConfig = (visualKey: string) => {
  const configs: Record<string, { icon: any; subtitle: string }> = {
    entrada: { icon: Plus, subtitle: "Aguardando novos perfis." },
    analise: { icon: Search, subtitle: "Os candidatos avançam após a triagem inicial." },
    entrevista: { icon: CalendarDays, subtitle: "Agende entrevistas para avançar no processo." },
    avaliacao: { icon: ClipboardList, subtitle: "Consolidação das evidências e decisão final." },
    decisao: { icon: Handshake, subtitle: "Oferta e negociação." },
    admissao: { icon: UserPlus, subtitle: "Processo aprovado! Contratação realizada." },
    finalizado: { icon: CheckCircle, subtitle: "Processos concluídos." },
  };
  const config = configs[visualKey] || { icon: ClipboardList, subtitle: "Aguardando candidatos." };
  return { ...config, bg: EMPTY_STATE_ICON_BG };
};
```

- [ ] **Step 5: Neutralizar o header e o contador da coluna**

Substituir:

```tsx
      <div className={`pipeline-kanban-column__header relative flex items-center justify-between border-b border-slate-100/90 bg-gradient-to-r px-3.5 pb-2.5 pt-3 dark:border-border/70 ${theme.headerGlow}`}>
```

por:

```tsx
      <div className="pipeline-kanban-column__header relative flex items-center justify-between border-b border-slate-100/90 bg-white px-3.5 pb-2.5 pt-3 dark:border-border/70 dark:bg-surface">
```

Substituir:

```tsx
          <span
            className={`flex h-6 min-w-[30px] items-center justify-center rounded-full px-2 text-[10px] font-extrabold shadow-sm ${theme.badge}`}
          >
            {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
          </span>
```

por:

```tsx
          <span
            data-testid="kanban-column-count"
            className="flex h-6 min-w-[30px] items-center justify-center rounded-full border border-slate-200 bg-slate-100/90 px-2 text-[10px] font-extrabold text-slate-700 shadow-sm dark:border-border dark:bg-surface dark:text-text-muted"
          >
            {isFiltered ? `${column.candidates.length}/${totalCount}` : column.candidates.length}
          </span>
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd frontend && npx vitest run src/components/kanban/__tests__/KanbanColumn.test.tsx`
Expected: PASS em todos os testes (os 4 originais + os 3 novos).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/kanban/KanbanColumn.tsx frontend/src/components/kanban/__tests__/KanbanColumn.test.tsx
git commit -m "style(pipeline): neutralize kanban column backgrounds, keep color as a top accent bar"
```

---

## Task 4: Consistência visual do card do Kanban (avatar e bordas de score)

Remove a variação pseudo-aleatória de cor do avatar (hash do nome) e suaviza os tons da borda esquerda de score no modo claro.

**Files:**
- Modify: `frontend/src/components/kanban/KanbanCard.tsx`
- Test: `frontend/src/components/kanban/__tests__/KanbanCard.test.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `frontend/src/components/kanban/__tests__/KanbanCard.test.tsx`, dentro do `describe("KanbanCard", ...)`, antes do `});` final:

```tsx
  describe("identidade visual do avatar", () => {
    it("usa o mesmo estilo de avatar independente do nome do candidato", () => {
      const names = ["Ana Beatriz", "Zeca Roberto", "Maria Clara", "João Pedro", "Carlos Eduardo"];

      const classNames = names.map((name) => {
        const { container, unmount } = render(
          <KanbanCard candidate={candidate({ candidate_name: name })} isSaving={false} enterDelay={0} />,
        );
        const className = container.querySelector(".pipeline-candidate-card__avatar")?.className;
        unmount();
        return className;
      });

      expect(new Set(classNames).size).toBe(1);
      expect(classNames[0]).toContain("hsl(var(--primary)");
    });
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/kanban/__tests__/KanbanCard.test.tsx -t "usa o mesmo estilo de avatar"`
Expected: FAIL — `getAvatarStyles` hoje sorteia 1 de 4 classes por hash do nome, então `new Set(classNames).size` deve ser maior que 1 para esses 5 nomes.

- [ ] **Step 3: Simplificar `getAvatarStyles` e suavizar as bordas de score**

Em `frontend/src/components/kanban/KanbanCard.tsx`, substituir:

```ts
// Generate deterministically consistent warm/brand colors based on the candidate's name
function getAvatarStyles(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % 4;
  const classes = [
    "bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.15)]",
    "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent-foreground))] border-[hsl(var(--accent-soft))/80]",
    "bg-warning-soft text-warning border-[hsl(var(--warning-soft))/80]",
    "bg-surface-muted text-text-muted border-[hsl(var(--border))/20]"
  ];
  return classes[index];
}
```

por:

```ts
// Estilo único de avatar, alinhado ao tom de marca (sem variação por nome).
function getAvatarStyles(): string {
  return "bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.20)]";
}
```

Atualizar a chamada dentro de `KanbanCard`:

```ts
  const avatarClass = getAvatarStyles(name);
```

por:

```ts
  const avatarClass = getAvatarStyles();
```

Suavizar as bordas de score (mantém a lógica e os textos, só troca os tons de `border-l-*` no modo claro):

```ts
  if (jobFitScore !== null && jobFitScore !== undefined) {
    const score = Math.round(jobFitScore);
    if (score >= 80) {
      scoreColorClass = "text-emerald-600 dark:text-emerald-300";
      borderAccentClass = "border-l-emerald-400 dark:border-l-emerald-700";
    } else if (score >= 60) {
      scoreColorClass = "text-cyan-700 dark:text-cyan-300";
      borderAccentClass = "border-l-cyan-400 dark:border-l-cyan-700";
    } else if (score >= 40) {
      scoreColorClass = "text-amber-600 dark:text-amber-300";
      borderAccentClass = "border-l-amber-400 dark:border-l-amber-700";
    } else {
      scoreColorClass = "text-rose-500 dark:text-rose-300";
      borderAccentClass = "border-l-rose-300 dark:border-l-rose-700";
    }
  } else if (isTopMatch) {
```

por:

```ts
  if (jobFitScore !== null && jobFitScore !== undefined) {
    const score = Math.round(jobFitScore);
    if (score >= 80) {
      scoreColorClass = "text-emerald-600 dark:text-emerald-300";
      borderAccentClass = "border-l-emerald-300 dark:border-l-emerald-700";
    } else if (score >= 60) {
      scoreColorClass = "text-cyan-700 dark:text-cyan-300";
      borderAccentClass = "border-l-cyan-200 dark:border-l-cyan-700";
    } else if (score >= 40) {
      scoreColorClass = "text-amber-600 dark:text-amber-300";
      borderAccentClass = "border-l-amber-200 dark:border-l-amber-700";
    } else {
      scoreColorClass = "text-rose-500 dark:text-rose-300";
      borderAccentClass = "border-l-rose-200 dark:border-l-rose-700";
    }
  } else if (isTopMatch) {
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/kanban/__tests__/KanbanCard.test.tsx`
Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/kanban/KanbanCard.tsx frontend/src/components/kanban/__tests__/KanbanCard.test.tsx
git commit -m "style(pipeline): consistent brand-toned avatar, softer score border accents"
```

---

## Task 5: Verificação final (suíte completa + QA manual)

- [ ] **Step 1: Rodar a suíte completa dos arquivos tocados**

Run:
```bash
cd frontend && npx vitest run \
  src/components/layout/__tests__/AppShell.nav.test.tsx \
  src/components/layout/__tests__/SidebarUserMenu.test.tsx \
  src/components/kanban/__tests__/KanbanCard.test.tsx \
  src/components/kanban/__tests__/KanbanCard.bot.test.tsx \
  src/components/kanban/__tests__/KanbanColumn.test.tsx
```
Expected: mesma contagem de falhas do baseline (1, em `KanbanCard.bot.test.tsx`, pré-existente e não relacionada a este plano) — nenhuma falha nova.

- [ ] **Step 2: QA manual no navegador**

Rodar o dev server do frontend (`npm run dev` a partir de `frontend/`, ou o script já usado no projeto) e verificar manualmente:
- Sidebar expandida e recolhida (desktop): só existe **um** botão de recolher/expandir, na borda da sidebar, funcionando nos dois sentidos.
- Rodapé da sidebar: um único cartão de usuário (avatar + nome); ao clicar, abre o menu com "Meu perfil", claro/escuro, as 4 opções de tema visual, e "Sair" — testar cada ação.
- Drawer mobile: hamburger na TopNavbar abre/fecha normalmente (não foi alterado).
- Pipeline: colunas com fundo/contador neutros, cor da etapa só na barra de 3px do topo; cards com avatar de tom único (carmim) e borda de score mais suave, mantendo a leitura por cor de aderência.
- Repetir os pontos acima no modo escuro.

- [ ] **Step 3: Commit final (se ajustes manuais forem necessários) ou encerrar**

Se o QA manual não exigir ajustes, esta task não gera commit — o trabalho já foi commitado tarefa a tarefa.
