import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AdmitidosPage } from "../AdmitidosPage";
import { admittedCandidatesService } from "../../services/admittedCandidatesService";

vi.mock("../../services/admittedCandidatesService", () => ({
  admittedCandidatesService: {
    list: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const listMock = vi.mocked(admittedCandidatesService.list);
const dismissMock = vi.mocked(admittedCandidatesService.dismiss);

const basePayload = {
  data: [
    {
      candidate_id: "candidate-1",
      candidate_name: "Ana Admitida",
      candidate_email: "ana@example.com",
      job_id: "job-1",
      job_title: "Pessoa Desenvolvedora",
      pipeline_id: "pipeline-1",
      admission_case_id: "case-1",
      admission_status: "admitted",
      admitted_at: "2026-05-27T12:00:00Z",
      dismissed_at: null,
      start_date: "2026-06-15",
      work_model: "hibrido",
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  summary: {
    total_admitted: 1,
    admitted_this_month: 1,
    latest_admitted_at: "2026-05-27T12:00:00Z",
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AdmitidosPage />
    </MemoryRouter>,
  );
}

describe("AdmitidosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue(basePayload);
    dismissMock.mockResolvedValue({
      admission_case_id: "case-1",
      admission_status: "dismissed",
      admitted_at: "2026-05-27T12:00:00Z",
      dismissed_at: "2026-05-29T12:00:00Z",
      dismissal_reason: "Desligamento solicitado pelo RH",
    });
  });

  it("renderiza cards, tabela e ação de desligamento para admitido", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Admitidos" })).toBeInTheDocument();
    expect(screen.getByText("Candidatos que concluíram o processo admissional")).toBeInTheDocument();
    expect(await screen.findByText("Ana Admitida")).toBeInTheDocument();
    expect(screen.getByText("Pessoa Desenvolvedora")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("Admitido")).toBeInTheDocument();
    expect(screen.getByText("Total admitidos")).toBeInTheDocument();
    expect(screen.getByText("Admitidos no mês")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar como desligado/i })).toBeInTheDocument();
  });

  it("renderiza links de ações e não mostra recontratação", async () => {
    renderPage();

    await screen.findByText("Ana Admitida");
    expect(screen.getByRole("link", { name: "Ver candidato" })).toHaveAttribute(
      "href",
      "/candidatos/candidate-1",
    );
    expect(screen.getByRole("link", { name: "Ver admissão" })).toHaveAttribute(
      "href",
      "/admissao/case-1",
    );
    expect(screen.getByRole("link", { name: "Ver histórico" })).toHaveAttribute(
      "href",
      "/candidatos/candidate-1?tab=history",
    );
    expect(screen.queryByRole("button", { name: /recontratar/i })).not.toBeInTheDocument();
  });

  it("renderiza empty state", async () => {
    listMock.mockResolvedValue({
      ...basePayload,
      data: [],
      total: 0,
      summary: {
        total_admitted: 0,
        admitted_this_month: 0,
        latest_admitted_at: null,
      },
    });

    renderPage();

    expect(await screen.findByText("Nenhum admitido cadastrado")).toBeInTheDocument();
    expect(screen.getByText(/Quando uma pré-admissão for finalizada/i)).toBeInTheDocument();
  });

  it("busca por candidato ou vaga", async () => {
    renderPage();

    const input = await screen.findByLabelText("Buscar por candidato ou vaga");
    input.focus();
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    listMock.mockClear();

    await userEvent.type(input, "Ana");

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Ana", page: 1, page_size: 20, status: "all" }),
      );
    });
  });

  it("abre modal de desligamento e exige motivo", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Ana Admitida");
    await user.click(screen.getByRole("button", { name: /marcar como desligado/i }));

    expect(await screen.findByRole("dialog", { name: /marcar como desligado/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmar desligamento/i }));

    expect(await screen.findByText("Informe o motivo do desligamento.")).toBeInTheDocument();
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("confirma desligamento, chama endpoint e atualiza status", async () => {
    const user = userEvent.setup();
    listMock
      .mockResolvedValueOnce(basePayload)
      .mockResolvedValueOnce({
        ...basePayload,
        data: [
          {
            ...basePayload.data[0],
            admission_status: "dismissed",
            dismissed_at: "2026-05-29T12:00:00Z",
          },
        ],
        summary: {
          total_admitted: 0,
          admitted_this_month: 0,
          latest_admitted_at: "2026-05-27T12:00:00Z",
        },
      });

    renderPage();

    await screen.findByText("Ana Admitida");
    await user.click(screen.getByRole("button", { name: /marcar como desligado/i }));
    await user.type(screen.getByLabelText("Motivo do desligamento"), "Desligamento solicitado pelo RH");
    await user.click(screen.getByRole("button", { name: /confirmar desligamento/i }));

    await waitFor(() => {
      expect(dismissMock).toHaveBeenCalledWith("case-1", {
        reason: "Desligamento solicitado pelo RH",
      });
    });
    expect(await screen.findByText("Desligado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /marcar como desligado/i })).not.toBeInTheDocument();
  });

  it("não expõe colunas sensíveis", async () => {
    renderPage();

    await screen.findByText("Ana Admitida");
    const table = screen.getByRole("table");
    expect(within(table).queryByText(/cpf/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/score/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/protheus/i)).not.toBeInTheDocument();
    expect(within(table).queryByText(/dados bancários/i)).not.toBeInTheDocument();
  });
});
