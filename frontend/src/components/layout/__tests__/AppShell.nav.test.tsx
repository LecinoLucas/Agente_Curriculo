import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

function makeUser(role: string) {
  return { id: "u-1", full_name: "Test User", email: "test@test.com", role, avatar_url: null };
}

function renderShell(role: string) {
  mockUseAuth.mockReturnValue({ user: makeUser(role), logout: vi.fn() });
  mockUsePipeline.mockReturnValue({ closeCandidate: vi.fn() });
  mockUseTheme.mockReturnValue({ theme: "light", toggleTheme: vi.fn() });

  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AppShell />
    </MemoryRouter>,
  );
}

describe("AppShell — navegação por role", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("admin", () => {
    it("vê Dashboard, Processo Seletivo, Ferramentas, Revisão, Admin", () => {
      renderShell("admin");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Processo Seletivo")).toBeInTheDocument();
      expect(screen.getByText("Ferramentas")).toBeInTheDocument();
      expect(screen.getByText("Revisão")).toBeInTheDocument();
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });
  });

  describe("manager", () => {
    it("vê Dashboard, Processo Seletivo e Revisão", () => {
      renderShell("manager");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Processo Seletivo")).toBeInTheDocument();
      expect(screen.getByText("Revisão")).toBeInTheDocument();
    });

    it("não vê Ferramentas nem Admin", () => {
      renderShell("manager");
      expect(screen.queryByText("Ferramentas")).not.toBeInTheDocument();
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });
  });

  describe("recruiter", () => {
    it("vê Dashboard, Pipeline, Vagas, Candidatos, Agenda, Importação, Análises IA, Avaliações", () => {
      renderShell("recruiter");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Pipeline")).toBeInTheDocument();
      expect(screen.getByText("Vagas")).toBeInTheDocument();
      expect(screen.getByText("Candidatos")).toBeInTheDocument();
      expect(screen.getByText("Agenda")).toBeInTheDocument();
      expect(screen.getByText("Importação")).toBeInTheDocument();
      expect(screen.getByText("Análises IA")).toBeInTheDocument();
      expect(screen.getByText("Avaliações")).toBeInTheDocument();
    });

    it("não vê Admin nem Revisão", () => {
      renderShell("recruiter");
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
      expect(screen.queryByText("Revisão")).not.toBeInTheDocument();
    });
  });

  describe("viewer", () => {
    it("vê Dashboard, Pipeline, Vagas, Candidatos, Agenda", () => {
      renderShell("viewer");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Pipeline")).toBeInTheDocument();
      expect(screen.getByText("Vagas")).toBeInTheDocument();
      expect(screen.getByText("Candidatos")).toBeInTheDocument();
      expect(screen.getByText("Agenda")).toBeInTheDocument();
    });

    it("não vê Importação, Análises IA, Avaliações, Admin, Revisão", () => {
      renderShell("viewer");
      expect(screen.queryByText("Importação")).not.toBeInTheDocument();
      expect(screen.queryByText("Análises IA")).not.toBeInTheDocument();
      expect(screen.queryByText("Avaliações")).not.toBeInTheDocument();
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
      expect(screen.queryByText("Revisão")).not.toBeInTheDocument();
    });
  });
});
