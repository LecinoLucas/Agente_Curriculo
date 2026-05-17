import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AdminPage } from "../AdminPage";

const statsMock = vi.fn();

vi.mock("../../services/usersService", () => ({
  usersService: {
    stats: () => statsMock(),
  },
}));

describe("AdminPage", () => {
  beforeEach(() => {
    statsMock.mockReset();
    statsMock.mockResolvedValue({
      total_users: 12,
      active_users: 10,
      inactive_users: 1,
      suspended_users: 1,
      pending_users: 0,
      admins: 2,
      recruiters: 5,
      viewers: 3,
      candidates: 2,
    });
  });

  it("exibe cards admin e o diagnóstico candidato/vaga ao alternar as abas", async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );

    // Aba Geral (inicialmente ativa)
    expect((await screen.findAllByText("Auditoria"))[0]).toBeInTheDocument();
    expect(screen.getByText("Ver auditoria")).toBeInTheDocument();
    expect(screen.getAllByText("Health do Sistema")[0]).toBeInTheDocument();
    expect(screen.getByText("Ver health")).toBeInTheDocument();
    expect(screen.getByText("BI de Recrutamento")).toBeInTheDocument();
    expect(screen.getByText("Ver BI")).toBeInTheDocument();

    // Diagnóstico não deve estar no DOM ainda
    expect(screen.queryByText("Diagnóstico Candidato/Vaga")).not.toBeInTheDocument();

    // Clicar na aba de Diagnóstico Operacional
    const diagTabButton = screen.getByRole("button", { name: "Diagnóstico Operacional" });
    fireEvent.click(diagTabButton);

    // Diagnóstico agora deve estar visível
    expect(screen.getByText("Diagnóstico Candidato/Vaga")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagnosticar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reparar" })).toBeInTheDocument();
  });

  it("alterna para a aba Health do Sistema de forma lazy", async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );

    // Inicialmente, as informações internas de status detalhado de Health (como chaves Gemini em cooldown, latência etc.) não devem estar no DOM
    expect(screen.queryByText("Status geral")).not.toBeInTheDocument();

    // Clicar na aba de Health do Sistema
    const healthTabButton = screen.getByRole("button", { name: "Health do Sistema" });
    fireEvent.click(healthTabButton);

    // Agora que foi montado, o indicador de status deve começar a carregar
    expect(screen.getByText("Carregando status do sistema...")).toBeInTheDocument();
  });
});
