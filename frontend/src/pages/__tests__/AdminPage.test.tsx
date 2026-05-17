import { render, screen } from "@testing-library/react";
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

  it("exibe cards admin e o diagnóstico candidato/vaga", async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("Auditoria"))[0]).toBeInTheDocument();
    expect(screen.getByText("Ver auditoria")).toBeInTheDocument();
    expect(screen.getByText("Health do Sistema")).toBeInTheDocument();
    expect(screen.getByText("Ver health")).toBeInTheDocument();
    expect(screen.getByText("BI de Recrutamento")).toBeInTheDocument();
    expect(screen.getByText("Ver BI")).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico Candidato/Vaga")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diagnosticar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reparar" })).toBeInTheDocument();
  });
});
