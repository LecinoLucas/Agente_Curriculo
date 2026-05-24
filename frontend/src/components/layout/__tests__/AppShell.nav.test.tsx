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

function renderShell(role: UserRole, route = "/dashboard") {
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
  return within(nav).queryByRole("link", { name: label }) ?? within(nav).getByRole("button", { name: label });
}

function expectTopNavLabels(labels: string[]) {
  for (const label of labels) {
    expect(topNavItem(label)).toBeInTheDocument();
  }
}

function expectTopNavMissing(labels: string[]) {
  const nav = topNav();
  for (const label of labels) {
    expect(within(nav).queryByRole("button", { name: label })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: label })).not.toBeInTheDocument();
  }
}

describe("AppShell — TopNavbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeCandidateMock.mockClear();
    localStorage.clear();
  });

  describe("renderização por role", () => {
    it("renderiza a TopNavbar completa para admin", () => {
      renderShell("admin");

      expectTopNavLabels([
        "Dashboard",
        "Pipeline",
        "Recrutamento",
        "Avaliações",
        "Gestores",
        "IA & Automação",
        "Adm",
      ]);
    });

    it("renderiza a TopNavbar para recruiter sem áreas de gestor/admin", () => {
      renderShell("recruiter");

      expectTopNavLabels(["Dashboard", "Pipeline", "Recrutamento", "Avaliações", "IA & Automação"]);
      expectTopNavMissing(["Gestores", "Adm"]);
    });

    it("renderiza a TopNavbar para manager com apenas grupos permitidos", () => {
      renderShell("manager");

      expectTopNavLabels(["Dashboard", "Pipeline", "Recrutamento", "Gestores"]);
      expectTopNavMissing(["Avaliações", "IA & Automação", "Adm"]);
    });

    it("renderiza somente Portal do Candidato para candidate quando AppShell é usado nesse fluxo", () => {
      renderShell("candidate", "/candidato/portal");

      expectTopNavLabels(["Portal do Candidato"]);
      expectTopNavMissing([
        "Dashboard",
        "Pipeline",
        "Recrutamento",
        "Avaliações",
        "Gestores",
        "IA & Automação",
        "Adm",
      ]);
    });
  });

  describe("permissões dinâmicas", () => {
    it("preserva filtro por app_screens_config para roles não-admin", () => {
      localStorage.setItem(
        "app_screens_config",
        JSON.stringify([
          { path: "/dashboard", roles: ["recruiter"] },
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

      expectTopNavLabels(["Dashboard", "Pipeline"]);
      expectTopNavMissing(["Avaliações", "IA & Automação", "Gestores", "Adm"]);
      expect(within(topNav()).queryByRole("button", { name: "Recrutamento" })).not.toBeInTheDocument();
    });

    it("consegue ocultar Pipeline via app_screens_config sem esconder Dashboard permitido", () => {
      localStorage.setItem(
        "app_screens_config",
        JSON.stringify([
          { path: "/dashboard", roles: ["recruiter"] },
          { path: "/pipeline", roles: ["admin"] },
          { path: "/vagas", roles: ["recruiter"] },
          { path: "/candidatos", roles: ["recruiter"] },
          { path: "/agenda", roles: ["recruiter"] },
        ]),
      );

      renderShell("recruiter");

      expectTopNavLabels(["Dashboard", "Recrutamento"]);
      expect(within(topNav()).queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();

      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));
      expect(screen.queryByRole("menuitem", { name: /Pipeline/ })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /Vagas/ })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /Candidatos/ })).toBeInTheDocument();
    });
  });

  describe("estado ativo", () => {
    it.each([
      ["/candidatos/candidate-1", "Recrutamento", "Candidatos"],
      ["/vagas/nova", "Recrutamento", "Vagas"],
      ["/vagas/job-1/editar", "Recrutamento", "Vagas"],
    ])("destaca grupo e item ativo em %s", (route, groupLabel, itemLabel) => {
      renderShell("admin", route);

      const groupTrigger = within(topNav()).getByRole("button", { name: groupLabel });
      expect(groupTrigger).toHaveAttribute("aria-current", "page");

      fireEvent.click(groupTrigger);
      expect(screen.getByRole("menuitem", { name: new RegExp(itemLabel) })).toHaveAttribute("aria-current", "page");
    });

    it("destaca Pipeline direto em /pipeline/:jobId", () => {
      renderShell("admin", "/pipeline/job-1");

      expect(within(topNav()).getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
      expect(within(topNav()).getByRole("button", { name: "Recrutamento" })).not.toHaveAttribute("aria-current");
    });

    it("destaca Dashboard compacto como link ativo em /dashboard", () => {
      renderShell("admin", "/dashboard");

      expect(within(topNav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      expect(within(topNav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("title", "Dashboard");
    });

    it("mantém Pipeline fora do dropdown Recrutamento", () => {
      renderShell("admin");

      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));

      expect(screen.queryByRole("menuitem", { name: /Pipeline/ })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /Vagas/ })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /Candidatos/ })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /Agenda/ })).toBeInTheDocument();
    });
  });

  describe("interação", () => {
    it("abre e fecha o drawer mobile pelo botão hamburger", () => {
      renderShell("admin");

      const hamburger = screen.getByRole("button", { name: "Abrir menu de navegação" });
      expect(hamburger).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(hamburger);
      const headerHamburger = within(screen.getByRole("banner")).getByRole("button", {
        name: "Fechar menu de navegação",
      });
      expect(headerHamburger).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(headerHamburger);
      expect(screen.getByRole("button", { name: "Abrir menu de navegação" })).toHaveAttribute("aria-expanded", "false");
    });

    it("fecha dropdown e drawer com Escape", () => {
      renderShell("admin");

      fireEvent.click(within(topNav()).getByRole("button", { name: "Adm" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegação" }));
      expect(
        within(screen.getByRole("banner")).getByRole("button", { name: "Fechar menu de navegação" }),
      ).toHaveAttribute("aria-expanded", "true");

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("button", { name: "Abrir menu de navegação" })).toHaveAttribute("aria-expanded", "false");
    });

    it("chama closeCandidate ao navegar para Pipeline pela TopNavbar", () => {
      renderShell("admin");

      fireEvent.click(within(topNav()).getByRole("link", { name: "Pipeline" }));

      expect(closeCandidateMock).toHaveBeenCalledTimes(1);
    });

    it("mantém Dashboard e Pipeline acessíveis no drawer mobile", () => {
      renderShell("admin");

      fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegação" }));

      const drawer = screen.getByRole("complementary");
      expect(within(drawer).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
      expect(within(drawer).getByRole("link", { name: "Pipeline" })).toBeInTheDocument();
      expect(within(drawer).getByRole("button", { name: "Recrutamento" })).toBeInTheDocument();

      fireEvent.click(within(drawer).getByRole("button", { name: "Recrutamento" }));
      expect(within(drawer).queryByRole("link", { name: "Pipeline" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /Pipeline/ })).not.toBeInTheDocument();
    });
  });
});
