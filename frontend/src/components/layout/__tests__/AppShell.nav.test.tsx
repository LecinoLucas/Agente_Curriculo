import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

import { AppShell } from "../AppShell";
import { NotificationsProvider } from "../../../features/notifications/NotificationsContext";

function makeUser(role: string) {
  return { id: "u-1", full_name: "Test User", email: "test@test.com", role, avatar_url: null };
}

function renderShell(role: string) {
  mockUseAuth.mockReturnValue({ user: makeUser(role), logout: vi.fn() });
  mockUsePipeline.mockReturnValue({ closeCandidate: vi.fn() });
  mockUseTheme.mockReturnValue({ theme: "light", toggleTheme: vi.fn() });

  return render(
    <MemoryRouter future={routerFuture} initialEntries={["/dashboard"]}>
      <NotificationsProvider>
        <AppShell />
      </NotificationsProvider>
    </MemoryRouter>,
  );
}

describe("AppShell — Reorganização Profissional da Navegação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("Navegação do Admin", () => {
    it("vê Dashboard, Recrutamento, Avaliações, Gestores, IA & Automação e Administração", () => {
      renderShell("admin");
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Recrutamento").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Avaliações").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Gestores").length).toBeGreaterThan(0);
      expect(screen.getAllByText("IA & Automação").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Administração").length).toBeGreaterThan(0);
    });

    it("não renderiza o Portal do Candidato dentro do grupo Administração", () => {
      renderShell("admin");
      
      // Abre o dropdown "Administração" usando o primeiro elemento (desktop)
      const adminGroupBtn = screen.getAllByText("Administração")[0];
      fireEvent.click(adminGroupBtn);

      // O item do Portal do Candidato para o admin deve ser "Preview Portal do Candidato"
      expect(screen.getAllByText("Preview Portal do Candidato").length).toBeGreaterThan(0);
      expect(screen.queryByText("Portal do Candidato")).not.toBeInTheDocument();
    });
  });

  describe("Navegação do Recrutador (recruiter)", () => {
    it("vê Dashboard, Recrutamento, Avaliações e IA & Automação", () => {
      renderShell("recruiter");
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Recrutamento").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Avaliações").length).toBeGreaterThan(0);
      expect(screen.getAllByText("IA & Automação").length).toBeGreaterThan(0);
    });

    it("não vê Gestores nem Administração", () => {
      renderShell("recruiter");
      expect(screen.queryByText("Gestores")).not.toBeInTheDocument();
      expect(screen.queryByText("Administração")).not.toBeInTheDocument();
    });
  });

  describe("Navegação do Gestor (manager)", () => {
    it("vê Dashboard, Recrutamento e Gestores", () => {
      renderShell("manager");
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Recrutamento").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Gestores").length).toBeGreaterThan(0);
    });

    it("não vê Avaliações, IA & Automação nem Administração", () => {
      renderShell("manager");
      expect(screen.queryByText("Avaliações")).not.toBeInTheDocument();
      expect(screen.queryByText("IA & Automação")).not.toBeInTheDocument();
      expect(screen.queryByText("Administração")).not.toBeInTheDocument();
    });
  });

  describe("Navegação do Visualizador (viewer)", () => {
    it("vê Dashboard e Recrutamento", () => {
      renderShell("viewer");
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Recrutamento").length).toBeGreaterThan(0);
    });

    it("não vê Avaliações, Gestores, IA & Automação nem Administração", () => {
      renderShell("viewer");
      expect(screen.queryByText("Avaliações")).not.toBeInTheDocument();
      expect(screen.queryByText("Gestores")).not.toBeInTheDocument();
      expect(screen.queryByText("IA & Automação")).not.toBeInTheDocument();
      expect(screen.queryByText("Administração")).not.toBeInTheDocument();
    });
  });

  describe("Comportamento de Recolher/Expandir da Sidebar", () => {
    it("está expandida por padrão e salva estado no localStorage ao recolher", () => {
      renderShell("admin");
      
      // Encontra e clica no botão "Recolher Menu"
      const toggleBtn = screen.getByText("Recolher Menu");
      expect(toggleBtn).toBeInTheDocument();

      fireEvent.click(toggleBtn);
      expect(localStorage.getItem("ats_sidebar_expanded")).toBe("false");

      // Clicando de novo, deve expandir e salvar "true"
      fireEvent.click(screen.getByTitle("Expandir menu"));
      expect(localStorage.getItem("ats_sidebar_expanded")).toBe("true");
    });
  });
});
