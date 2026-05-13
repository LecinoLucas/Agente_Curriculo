import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgendaInterviewModal } from "../AgendaInterviewModal";
import { candidatesService } from "../../../services/candidatesService";
import { agendaService } from "../../../services/agendaService";
import { HttpError } from "../../../services/http";
import { listJobs } from "../../../services/jobsService";

vi.mock("../../../services/candidatesService", () => ({
  candidatesService: {
    listSummaries: vi.fn(),
  },
}));

vi.mock("../../../services/agendaService", () => ({
  agendaService: {
    createInterview: vi.fn(),
    updateInterview: vi.fn(),
    getInterview: vi.fn(),
    getGoogleCalendarStatus: vi.fn().mockResolvedValue({ connected: false }),
    getGoogleCalendarAuthUrl: vi.fn(),
  },
}));

vi.mock("../../../services/jobsService", () => ({
  listJobs: vi.fn(),
}));

vi.mock("../../../shared/utils/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AgendaInterviewModal", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  beforeEach(() => {
    vi.clearAllMocks();
    (candidatesService.listSummaries as any).mockResolvedValue({
      data: [{ id: "candidate-1", full_name: "Candidato Teste" }],
    });
    (listJobs as any).mockResolvedValue({
      data: [{ id: "job-1", title: "Vaga Teste" }],
    });
  });

  it("mantém modal e formulário quando a API retorna conflito", async () => {
    (agendaService.createInterview as any).mockRejectedValue(
      new HttpError(
        409,
        "Conflito de horário: este avaliador já possui uma entrevista agendada neste período."
      )
    );

    render(
      <MemoryRouter>
        <AgendaInterviewModal
          isOpen={true}
          isEdit={false}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </MemoryRouter>
    );

    await screen.findByLabelText("Candidato *");

    fireEvent.change(screen.getByLabelText("Candidato *"), {
      target: { value: "candidate-1" },
    });
    fireEvent.change(screen.getByLabelText("Título *"), {
      target: { value: "Entrevista de conflito" },
    });
    fireEvent.change(screen.getByLabelText("Data *"), {
      target: { value: tomorrow },
    });
    fireEvent.change(screen.getByLabelText("Início *"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("Fim *"), {
      target: { value: "11:00" },
    });
    fireEvent.change(screen.getByLabelText("Avaliador (e-mail)"), {
      target: { value: "avaliador@empresa.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => {
      expect(agendaService.createInterview).toHaveBeenCalledOnce();
      expect(
        screen.getByText(
          "Conflito de horário: este avaliador já possui uma entrevista agendada neste período."
        )
      ).toBeInTheDocument();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Nova entrevista" })).toBeInTheDocument();
    expect(screen.getByLabelText("Título *")).toHaveValue("Entrevista de conflito");
    expect(screen.getByLabelText("Avaliador (e-mail)")).toHaveValue("avaliador@empresa.com");
  });

  it("desabilita checkboxes de sincronização quando Google não está conectado", async () => {
    (agendaService.getGoogleCalendarStatus as any).mockResolvedValue({ connected: false });

    render(
      <MemoryRouter>
        <AgendaInterviewModal
          isOpen={true}
          isEdit={false}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </MemoryRouter>
    );

    await screen.findByLabelText("Candidato *");

    const syncCheckbox = screen.getByLabelText("Adicionar ao Google Calendar");
    const meetCheckbox = screen.getByLabelText("Criar link do Google Meet");

    expect(syncCheckbox).toBeDisabled();
    expect(meetCheckbox).toBeDisabled();
    expect(screen.getByText("Conectar Google Calendar")).toBeInTheDocument();
  });
});
