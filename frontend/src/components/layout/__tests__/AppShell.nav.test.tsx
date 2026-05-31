import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { UserRole } from "../../../types/auth";
import { AppShell } from "../AppShell";
import { NotificationsProvider } from "../../../features/notifications/NotificationsContext";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const { mockUseAuth, mockUsePipeline, mockUseTheme } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUsePipeline: vi.fn(),
  mockUseTheme: vi.fn(),
}));

vi.mock("../../../features/auth/useAuth", () => ({ useAuth: mockUseAuth }));
vi.mock("../../../features/pipeline/PipelineContext", () => ({
  usePipeline: mockUsePipeline,
}));
vi.mock("../../../hooks/useTheme", () => ({ useTheme: mockUseTheme }));
vi.mock("../VisualThemeSwitcher", () => ({ VisualThemeSwitcher: () => null }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, Outlet: () => null };
});

const closeCandidateMock = vi.fn();

function makeUser(role: UserRole) {
  return {
    id: "u-1",
    full_name: "Test User",
    email: "test@test.com",
    role,
    avatar_url: null,
    real_ai_token_spend_enabled: true,
  };
}

function renderShell(role: UserRole, route = "/rh") {
  mockUseAuth.mockReturnValue({ user: makeUser(role), logout: vi.fn() });
  mockUsePipeline.mockReturnValue({ closeCandidate: closeCandidateMock });
  mockUseTheme.mockReturnValue({ theme: "light", toggleTheme: vi.fn() });

  return render(
    <MemoryRouter future={routerFuture} initialEntries={[route]}>
      <NotificationsProvider>
        <AppShell />
      </NotificationsProvider>
    </MemoryRouter>,
  );
}

function topNav() {
  return screen.getByRole("navigation", { name: "Navegação principal" });
}

function topNavItem(label: string) {
  const nav = topNav();
  const links = within(nav).queryAllByRole("link", { name: label });
  if (links.length > 0) return links[0];
  const buttons = within(nav).queryAllByRole("button", { name: label });
  if (buttons.length > 0) return buttons[0];
  throw new Error(`Element ${label} not found`);
}

function expectTopNavLabels(labels: string[]) {
  for (const label of labels) {
    expect(topNavItem(label)).toBeInTheDocument();
  }
}

function expectTopNavMissing(labels: string[]) {
  const nav = topNav();
  for (const label of labels) {
    expect(within(nav).queryAllByRole("button", { name: label }).length).toBe(0);
    expect(within(nav).queryAllByRole("link", { name: label }).length).toBe(0);
  }
}

describe("AppShell — Sidebar Nav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeCandidateMock.mockClear();
    localStorage.clear();
  });

  describe("renderização por role", () => {
    it("renderiza a navegação completa para admin", () => {
      renderShell("admin");

      expectTopNavLabels([
        "Central RH",
        "Recrutamento",
        "Avaliações",
        "Admissão",
        "Gestores",
        "Administração",
        "Outros",
      ]);

      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Administração" })[0]);
      expect(screen.getByRole("link", { name: /Credenciais IA/ })).toBeInTheDocument();

      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Admissão" })[0]);
      expect(screen.getByRole("link", { name: /Admitidos/ })).toBeInTheDocument();
    });

    it("renderiza a navegação para recruiter sem áreas de gestor/admin totais", () => {
      renderShell("recruiter");

      expectTopNavLabels(["Central RH", "Recrutamento", "Avaliações", "Administração", "Outros"]);
      expectTopNavMissing(["Admissão", "Gestores"]);
      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Outros" })[0]);
      expect(screen.getByRole("link", { name: /Demo RH/ })).toBeInTheDocument();
    });

    it("renderiza menu Admitidos para RH", () => {
      renderShell("hr");

      expectTopNavLabels(["Central RH", "Recrutamento", "Admissão"]);
      expectTopNavMissing(["Outros", "Administração", "Avaliações"]);
      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Recrutamento" })[0]);
      expect(screen.queryAllByRole("link", { name: /Candidatos/ }).length).toBe(0);
      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Admissão" })[0]);
      expect(screen.getAllByRole("link", { name: /Admitidos/ })[0]).toBeInTheDocument();
    });

    it("renderiza a navegação para manager com apenas grupos permitidos", () => {
      renderShell("manager");

      expectTopNavLabels(["Recrutamento", "Gestores"]);
      expectTopNavMissing(["Central RH", "Avaliações", "Administração", "Outros"]);
      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Recrutamento" })[0]);
      expect(screen.queryAllByRole("link", { name: /Candidatos/ }).length).toBe(0);
    });

    it("não exibe Avaliações para viewer", () => {
      renderShell("viewer");

      expectTopNavLabels(["Central RH", "Recrutamento"]);
      expectTopNavMissing(["Avaliações", "Gestores", "Administração", "Outros"]);
      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Recrutamento" })[0]);
      expect(screen.queryAllByRole("link", { name: /Candidatos/ }).length).toBe(0);
    });

    it("exibe Outros (Demo RH) para admin", () => {
      renderShell("admin");
      expect(topNavItem("Outros")).toBeInTheDocument();
    });

    it.each(["hr", "manager", "viewer"] as const)(
      "não exibe Outros para %s",
      (role) => {
        renderShell(role);
        expectTopNavMissing(["Outros"]);
      },
    );

    it("renderiza somente Portal do Candidato para candidate quando AppShell é usado nesse fluxo", () => {
      renderShell("candidate", "/candidato/portal");

      expectTopNavLabels(["Portal do Candidato"]);
      expectTopNavMissing([
        "Dashboard",
        "Recrutamento",
        "Avaliações",
        "Gestores",
        "Administração",
      ]);
    });
  });

  describe("permissões dinâmicas", () => {
    it("preserva filtro por app_screens_config para roles não-admin", () => {
      localStorage.setItem(
        "app_screens_config",
        JSON.stringify([
          { path: "/rh", roles: ["recruiter"] },
          { path: "/pipeline", roles: ["recruiter"] },
          { path: "/vagas", roles: ["admin"] },
          { path: "/candidatos", roles: ["admin"] },
          { path: "/agenda", roles: ["admin"] },
          { path: "/admin/behavioral-templates", roles: ["admin"] },
          { path: "/analises-ia", roles: ["admin"] },
          { path: "/importar", roles: ["admin"] },
          { path: "/importar-formulario", roles: ["admin"] },
        ]),
      );

      renderShell("recruiter");

      expectTopNavLabels(["Central RH", "Recrutamento"]);
      expectTopNavMissing(["Avaliações", "Gestores", "Administração"]);
      // Pipeline is allowed, so Recrutamento is visible, but Vagas/Candidatos/Agenda are hidden.
      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Recrutamento" })[0]);
      expect(screen.getAllByRole("link", { name: /Pipeline/ })[0]).toBeInTheDocument();
      expect(screen.queryAllByRole("link", { name: /Vagas/ }).length).toBe(0);
    });

    it("consegue ocultar Pipeline via app_screens_config sem esconder Dashboard permitido", () => {
      localStorage.setItem(
        "app_screens_config",
        JSON.stringify([
          { path: "/rh", roles: ["recruiter"] },
          { path: "/pipeline", roles: ["admin"] },
          { path: "/vagas", roles: ["recruiter"] },
          { path: "/candidatos", roles: ["recruiter"] },
          { path: "/agenda", roles: ["recruiter"] },
        ]),
      );

      renderShell("recruiter");

      expectTopNavLabels(["Central RH", "Recrutamento"]);

      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Recrutamento" })[0]);
      expect(screen.queryAllByRole("link", { name: /Pipeline/ }).length).toBe(0);
      expect(screen.getAllByRole("link", { name: /Vagas/ })[0]).toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: /Candidatos/ })[0]).toBeInTheDocument();
    });
  });

  describe("estado ativo", () => {
    it.each([
      ["/candidatos/candidate-1", "Recrutamento", "Candidatos"],
      ["/vagas/nova", "Recrutamento", "Vagas"],
      ["/vagas/job-1/editar", "Recrutamento", "Vagas"],
    ])("abre grupo automaticamente se tem item ativo em %s", (route, groupLabel, itemLabel) => {
      renderShell("admin", route);

      const item = screen.getAllByRole("link", { name: new RegExp(itemLabel) })[0];
      expect(item).toHaveClass("bg-[hsl(var(--nav-active-bg))]/50");
    });

    it("destaca Central RH como link ativo em /rh", () => {
      renderShell("admin", "/rh");

      const link = within(topNav()).getAllByRole("link", { name: "Central RH" })[0];
      expect(link).toHaveClass("bg-[hsl(var(--nav-active-bg))]");
    });
  });

  describe("interação", () => {
    it("chama closeCandidate ao navegar para Pipeline pela navegação", () => {
      renderShell("admin");

      fireEvent.click(within(topNav()).getAllByRole("button", { name: "Recrutamento" })[0]);
      fireEvent.click(within(topNav()).getAllByRole("link", { name: "Pipeline" })[0]);

      expect(closeCandidateMock).toHaveBeenCalledTimes(1);
    });
  });
});
