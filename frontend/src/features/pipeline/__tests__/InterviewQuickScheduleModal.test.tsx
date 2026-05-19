import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { GOOGLE_CALENDAR_OAUTH_RESULT_EVENT } from "../../agenda/googleCalendarOAuth";
import { InterviewQuickScheduleModal } from "../InterviewQuickScheduleModal";

const getGoogleCalendarStatusMock = vi.fn();

vi.mock("../../../services/agendaService", () => ({
  agendaService: {
    getGoogleCalendarStatus: () => getGoogleCalendarStatusMock(),
  },
}));

describe("InterviewQuickScheduleModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reflete conexão do Google Calendar após o resultado do OAuth", async () => {
    getGoogleCalendarStatusMock
      .mockResolvedValueOnce({ connected: false })
      .mockResolvedValueOnce({
        connected: true,
        google_account_email: "recruiter@test.com",
      });

    render(
      <MemoryRouter future={routerFuture}>
        <InterviewQuickScheduleModal
          candidateName="Pessoa Teste"
          jobTitle="Vaga Teste"
          isSaving={false}
          onClose={vi.fn()}
          onMoveWithoutScheduling={vi.fn().mockResolvedValue(undefined)}
          onSchedule={vi.fn().mockResolvedValue(undefined)}
          onOpenFullAgenda={vi.fn()}
        />
      </MemoryRouter>,
    );

    const syncCheckbox = await screen.findByLabelText("Adicionar ao Google Calendar");
    expect(syncCheckbox).toBeDisabled();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(GOOGLE_CALENDAR_OAUTH_RESULT_EVENT, {
          detail: { success: true, source: "google-calendar" },
        }),
      );
    });

    await waitFor(() => {
      expect(syncCheckbox).not.toBeDisabled();
      expect(
        screen.getByText("Google Calendar conectado: recruiter@test.com")
      ).toBeInTheDocument();
    });
  });

  it("controla Google Calendar e Meet com estados independentes e sincronização clara", async () => {
    const user = userEvent.setup();
    getGoogleCalendarStatusMock.mockResolvedValue({
      connected: true,
      google_account_email: "recruiter@test.com",
    });

    render(
      <MemoryRouter future={routerFuture}>
        <InterviewQuickScheduleModal
          candidateName="Pessoa Teste"
          jobTitle="Vaga Teste"
          isSaving={false}
          onClose={vi.fn()}
          onMoveWithoutScheduling={vi.fn().mockResolvedValue(undefined)}
          onSchedule={vi.fn().mockResolvedValue(undefined)}
          onOpenFullAgenda={vi.fn()}
        />
      </MemoryRouter>,
    );

    const calendarCheckbox = await screen.findByLabelText("Adicionar ao Google Calendar");
    const meetCheckbox = screen.getByLabelText("Criar link do Google Meet");

    await user.click(screen.getByText("Adicionar ao Google Calendar"));
    expect(calendarCheckbox).toBeChecked();
    expect(meetCheckbox).not.toBeChecked();

    await user.click(screen.getByText("Criar link do Google Meet"));
    expect(calendarCheckbox).toBeChecked();
    expect(meetCheckbox).toBeChecked();

    await user.click(screen.getByText("Adicionar ao Google Calendar"));
    expect(calendarCheckbox).not.toBeChecked();
    expect(meetCheckbox).not.toBeChecked();
  });

  it("desabilita os checkboxes quando Google Calendar não está conectado", async () => {
    getGoogleCalendarStatusMock.mockResolvedValue({ connected: false });

    render(
      <MemoryRouter future={routerFuture}>
        <InterviewQuickScheduleModal
          candidateName="Pessoa Teste"
          jobTitle="Vaga Teste"
          isSaving={false}
          onClose={vi.fn()}
          onMoveWithoutScheduling={vi.fn().mockResolvedValue(undefined)}
          onSchedule={vi.fn().mockResolvedValue(undefined)}
          onOpenFullAgenda={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("Adicionar ao Google Calendar")).toBeDisabled();
    expect(screen.getByLabelText("Criar link do Google Meet")).toBeDisabled();
    expect(screen.getByText("Conecte o Google Calendar para criar evento e link do Meet.")).toBeInTheDocument();
  });

  it("envia payload com evento Google e Meet somente quando ambos estão marcados", async () => {
    const user = userEvent.setup();
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    getGoogleCalendarStatusMock.mockResolvedValue({
      connected: true,
      google_account_email: "recruiter@test.com",
    });

    render(
      <MemoryRouter future={routerFuture}>
        <InterviewQuickScheduleModal
          candidateName="Pessoa Teste"
          jobTitle="Vaga Teste"
          isSaving={false}
          onClose={vi.fn()}
          onMoveWithoutScheduling={vi.fn().mockResolvedValue(undefined)}
          onSchedule={onSchedule}
          onOpenFullAgenda={vi.fn()}
        />
      </MemoryRouter>,
    );

    await screen.findByText("Google Calendar conectado: recruiter@test.com");
    await user.clear(screen.getByLabelText("Data"));
    await user.type(screen.getByLabelText("Data"), tomorrow);
    await user.click(screen.getByText("Criar link do Google Meet"));
    await user.click(screen.getByRole("button", { name: /agendar entrevista/i }));

    await waitFor(() => {
      expect(onSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          create_google_event: true,
          create_google_meet: true,
        }),
      );
    });
  });
});
