import { act, render, screen, waitFor } from "@testing-library/react";
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
        screen.getByText("Google Calendar conectado: recruiter@test.com.")
      ).toBeInTheDocument();
    });
  });
});
