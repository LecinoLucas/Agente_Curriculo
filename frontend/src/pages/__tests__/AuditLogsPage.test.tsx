import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditLogsPage } from "../AuditLogsPage";

const listAuditLogsMock = vi.fn();
const listUsersMock = vi.fn();

vi.mock("../../services/auditLogsService", () => ({
  auditLogsService: {
    listAuditLogs: (params: unknown) => listAuditLogsMock(params),
  },
}));

vi.mock("../../services/usersService", () => ({
  usersService: {
    list: (...args: unknown[]) => listUsersMock(...args),
  },
}));

describe("AuditLogsPage", () => {
  beforeEach(() => {
    listAuditLogsMock.mockReset();
    listUsersMock.mockReset();
    listUsersMock.mockResolvedValue({
      data: [
        { id: "user-1", full_name: "Admin User", email: "admin@test.com" },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    });
  });

  it("renderiza a página, filtros e tabela com logs", async () => {
    listAuditLogsMock.mockResolvedValue({
      data: [
        {
          id: "log-1",
          action: "archive_job",
          entity_type: "job",
          entity_id: "job-1",
          user_id: "user-1",
          user_name: "Admin User",
          user_email: "admin@test.com",
          metadata: { title: "Vaga Comercial" },
          before_state: null,
          after_state: null,
          created_at: "2026-05-12T14:00:00Z",
          request_id: "req-1",
          correlation_id: "corr-1",
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <AuditLogsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Auditoria")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar por ação, entidade, ID, usuário ou metadata...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tipo de entidade")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ação")).toBeInTheDocument();
    expect(await screen.findByText("Vaga arquivada")).toBeInTheDocument();
    expect(screen.getByText("Vaga Comercial")).toBeInTheDocument();
    expect(screen.getByText("Ver detalhes")).toBeInTheDocument();
  });

  it("exibe empty state quando não há resultado", async () => {
    listAuditLogsMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <AuditLogsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Nenhum evento de auditoria encontrado.")).toBeInTheDocument();
  });

  it("abre o modal de detalhes do evento", async () => {
    const user = userEvent.setup();
    listAuditLogsMock.mockResolvedValue({
      data: [
        {
          id: "log-1",
          action: "delete_job_area",
          entity_type: "job_area",
          entity_id: "area-1",
          user_id: "user-1",
          user_name: "Admin User",
          user_email: "admin@test.com",
          metadata: { area_name: "Operações", reason: "Higienização" },
          before_state: { name: "Operações", is_active: true },
          after_state: null,
          created_at: "2026-05-12T14:00:00Z",
          request_id: "req-1",
          correlation_id: "corr-1",
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <AuditLogsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Área excluída");
    await user.click(screen.getByRole("button", { name: "Ver detalhes" }));

    expect(await screen.findByRole("dialog", { name: "Detalhes do evento" })).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("Destaques")).toBeInTheDocument();
    expect(screen.getAllByText("Higienização").length).toBeGreaterThan(0);
  });

  it("dispara nova busca ao filtrar por ação", async () => {
    const user = userEvent.setup();
    listAuditLogsMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <AuditLogsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Nenhum evento de auditoria encontrado.");
    await user.type(screen.getByPlaceholderText("Ação"), "archive_skill");

    await waitFor(() => {
      expect(listAuditLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "archive_skill" }),
      );
    });
  });
});
