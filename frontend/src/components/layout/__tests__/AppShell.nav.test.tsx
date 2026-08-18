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
vi.mock("../SidebarUserMenu", () => ({ SidebarUserMenu: () => null }));
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

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
}

describe("AppShell — Sidebar Nav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    closeCandidateMock.mockClear();
    window.localStorage.clear();
  });

  describe("renderização por role", () => {
    it("renderiza a navegação completa para admin", () => {
      renderShell("admin");

      expectTopNavLabels([
        "Dashboard",
        "Pipeline",
        "Recrutamento",
        "Admissão",
        "Gestores",
        "Administração",
      ]);

      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));
      fireEvent.click(screen.getByRole("button", { name: "Avaliações" }));
      expect(screen.getByRole("link", { name: /Análises IA/ })).toBeInTheDocument();

      fireEvent.click(within(topNav()).getByRole("button", { name: "Administração" }));
      expect(screen.getByRole("link", { name: /Painel Admin/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Outros" }));
      expect(screen.getByRole("link", { name: /Demo RH/ })).toBeInTheDocument();

      fireEvent.click(within(topNav()).getByRole("button", { name: "Admissão" }));
      expect(screen.getByRole("link", { name: /Admitidos/ })).toBeInTheDocument();
    });

    it("renderiza a navegação para recruiter sem áreas de gestor/admin totais", () => {
      renderShell("recruiter");

      expectTopNavLabels(["Dashboard", "Pipeline", "Recrutamento", "Administração"]);
      expectTopNavMissing(["Admissão", "Gestores"]);
      fireEvent.click(within(topNav()).getByRole("button", { name: "Administração" }));
      fireEvent.click(screen.getByRole("button", { name: "Outros" }));
      expect(screen.getByRole("link", { name: /Demo RH/ })).toBeInTheDocument();
    });

    it("renderiza menu Admitidos para RH", () => {
      renderShell("hr");

      expectTopNavLabels(["Dashboard", "Pipeline", "Recrutamento", "Admissão", "Administração"]);
      expectTopNavMissing(["Avaliações"]);
      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));
      expect(screen.queryByRole("link", { name: /Candidatos/ })).not.toBeInTheDocument();
      fireEvent.click(within(topNav()).getByRole("button", { name: "Admissão" }));
      expect(screen.getByRole("link", { name: /Admitidos/ })).toBeInTheDocument();
    });

    it("renderiza a navegação para manager com apenas grupos permitidos", () => {
      renderShell("manager");

      expectTopNavLabels(["Pipeline", "Recrutamento", "Gestores"]);
      expectTopNavMissing(["Dashboard", "Avaliações", "Administração", "Outros"]);
      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));
      expect(screen.queryByRole("link", { name: /Candidatos/ })).not.toBeInTheDocument();
    });

    it("não exibe Avaliações para viewer", () => {
      renderShell("viewer");

      expectTopNavLabels(["Dashboard", "Pipeline", "Recrutamento"]);
      expectTopNavMissing(["Avaliações", "Gestores", "Administração", "Outros"]);
      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));
      expect(screen.queryByRole("link", { name: /Candidatos/ })).not.toBeInTheDocument();
    });

    it("exibe ferramentas extras dentro de Administração para admin", () => {
      renderShell("admin");
      fireEvent.click(within(topNav()).getByRole("button", { name: "Administração" }));
      fireEvent.click(screen.getByRole("button", { name: "Outros" }));
      expect(screen.getByRole("link", { name: /Demo RH/ })).toBeInTheDocument();
    });

    it("renderiza rota antiga e novo portal do candidato em Administração", () => {
      vi.stubEnv("VITE_CANDIDATE_PORTAL_URL", "https://candidatos.example.test");
      vi.stubEnv("VITE_CANDIDATE_PORTAL_PROTOTYPE_URL", "https://prototype.example.test");
      renderShell("admin");

      fireEvent.click(within(topNav()).getByRole("button", { name: "Administração" }));
      fireEvent.click(screen.getByRole("button", { name: "Outros" }));

      const legacyPortal = screen.getByRole("link", { name: /Rota antiga do candidato/ });
      const newPortal = screen.getByRole("link", { name: /Novo portal do candidato/ });
      const prototypePortal = screen.getByRole("link", { name: /Protótipo do portal/ });

      expect(legacyPortal).toHaveAttribute("href", "/candidato/portal");
      expect(newPortal).toHaveAttribute("href", "https://candidatos.example.test");
      expect(newPortal).toHaveAttribute("target", "_blank");
      expect(newPortal).toHaveAttribute("rel", "noreferrer");
      expect(prototypePortal).toHaveAttribute("href", "https://prototype.example.test");
      expect(prototypePortal).toHaveAttribute("target", "_blank");
      expect(screen.getByRole("link", { name: /Demo RH/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Demo 2/ })).toBeInTheDocument();
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
      window.localStorage.setItem(
        "app_screens_config",
        JSON.stringify([
          { path: "/dashboard", roles: ["recruiter"] },
          { path: "/pipeline", roles: ["recruiter"] },
          { path: "/vagas", roles: ["admin"] },
          { path: "/candidatos", roles: ["admin"] },
          { path: "/agenda", roles: ["admin"] },
          { path: "/admin/estrutura-operacional", roles: ["admin"] },
          { path: "/admin/behavioral-templates", roles: ["admin"] },
          { path: "/analises-ia", roles: ["admin"] },
          { path: "/importar", roles: ["admin"] },
          { path: "/importar-formulario", roles: ["admin"] },
        ]),
      );

      renderShell("recruiter");

      expectTopNavLabels(["Dashboard", "Pipeline"]);
      expectTopNavMissing(["Avaliações", "Gestores", "Administração"]);
      // Pipeline is a direct entry; the filtered configuration leaves no other
      // Recrutamento item visible.
      expect(screen.queryByRole("link", { name: /Vagas/ })).not.toBeInTheDocument();
    });

    it("consegue ocultar Pipeline via app_screens_config sem esconder Dashboard permitido", () => {
      window.localStorage.setItem(
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

      expect(within(topNav()).queryByRole("link", { name: /Pipeline/ })).not.toBeInTheDocument();
      fireEvent.click(within(topNav()).getByRole("button", { name: "Recrutamento" }));
      expect(screen.getByRole("link", { name: /Vagas/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Candidatos/ })).toBeInTheDocument();
    });
  });

  describe("estado ativo", () => {
    it.each([
      ["/candidatos/candidate-1", "Recrutamento", "Candidatos"],
      ["/vagas/nova", "Recrutamento", "Vagas"],
      ["/vagas/job-1/editar", "Recrutamento", "Vagas"],
    ])("abre grupo automaticamente se tem item ativo em %s", (route, groupLabel, itemLabel) => {
      renderShell("admin", route);

      const item = screen.getByRole("link", { name: new RegExp(itemLabel) });
      expect(item).toHaveClass("bg-[hsl(var(--nav-active-bg))]/50");
    });

    it("destaca Dashboard como link ativo em /dashboard", () => {
      renderShell("admin", "/dashboard");

      const link = within(topNav()).getByRole("link", { name: "Dashboard" });
      expect(link).toHaveClass("after:opacity-100");
    });
  });

  describe("interação", () => {
    it("chama closeCandidate ao navegar para Pipeline pela navegação", () => {
      renderShell("admin");

      fireEvent.click(within(topNav()).getByRole("link", { name: "Pipeline" }));

      expect(closeCandidateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("controle de recolher sidebar", () => {
    it("existe apenas um botão de recolher/expandir menu (sem duplicidade)", () => {
      renderShell("admin");

      const toggles = screen.getAllByRole("button", { name: /recolher menu/i });
      expect(toggles).toHaveLength(1);
    });
  });
});
