import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleCalendarOAuthBridge } from "../../app/GoogleCalendarOAuthBridge";
import { GOOGLE_CALENDAR_OAUTH_RESULT_MESSAGE_TYPE } from "../../features/agenda/googleCalendarOAuth";
import { AgendaPage } from "../AgendaPage";

const listInterviewsMock = vi.fn();
const getAgendaKpisMock = vi.fn();
const getGoogleCalendarAuthUrlMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const getGoogleCalendarStatusMock = vi.fn();

vi.mock("../../services/agendaService", () => ({
  agendaService: {
    listInterviews: (params: unknown) => listInterviewsMock(params),
    getAgendaKpis: (params: unknown) => getAgendaKpisMock(params),
    getGoogleCalendarAuthUrl: () => getGoogleCalendarAuthUrlMock(),
    getGoogleCalendarStatus: () => getGoogleCalendarStatusMock(),
  },
}));

vi.mock("../../shared/utils/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("../../features/agenda/AgendaInterviewModal", () => ({
  AgendaInterviewModal: () => null,
}));

vi.mock("../../features/agenda/CancelInterviewModal", () => ({
  CancelInterviewModal: () => null,
}));

describe("AgendaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listInterviewsMock.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      page_size: 100,
      total_pages: 0,
    });

    getAgendaKpisMock.mockResolvedValue({
      total_scheduled: 0,
      today_count: 0,
      upcoming_count: 0,
      completed_count: 0,
      cancelled_count: 0,
      unique_interviewers_count: 0,
    });
    getGoogleCalendarStatusMock.mockResolvedValue({ connected: false });
  });

  it("redireciona ao clicar em Conectar Google Agenda", async () => {
    const user = userEvent.setup();
    const popup = { location: { href: "" }, close: vi.fn() };

    getGoogleCalendarAuthUrlMock.mockResolvedValue({
      auth_url: "https://accounts.google.com/o/oauth2/auth",
    });

    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

    render(
      <MemoryRouter>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>,
    );

    await screen.findByText("Agenda de Entrevistas");
    await user.click(screen.getByRole("button", { name: "Conectar Google Agenda" }));

    await waitFor(() => {
      expect(getGoogleCalendarAuthUrlMock).toHaveBeenCalledOnce();
      expect(popup.location.href).toBe("https://accounts.google.com/o/oauth2/auth");
    });
  });

  it("mostra erro quando não consegue obter a URL do Google", async () => {
    const user = userEvent.setup();
    const popup = { location: { href: "" }, close: vi.fn() };

    getGoogleCalendarAuthUrlMock.mockRejectedValue(new Error("Falha"));

    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

    render(
      <MemoryRouter>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>,
    );

    await screen.findByText("Agenda de Entrevistas");
    await user.click(screen.getByRole("button", { name: "Conectar Google Agenda" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Não foi possível iniciar a conexão com o Google Calendar."
      );
      expect(popup.close).toHaveBeenCalledOnce();
    });
  });

  it("atualiza a UI após callback OAuth via postMessage", async () => {
    getGoogleCalendarStatusMock
      .mockResolvedValueOnce({ connected: false })
      .mockResolvedValueOnce({
        connected: true,
        google_account_email: "recruiter@test.com",
      });

    render(
      <MemoryRouter>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "Conectar Google Agenda" });

    const messageEvent = new MessageEvent("message", {
      data: {
        type: GOOGLE_CALENDAR_OAUTH_RESULT_MESSAGE_TYPE,
        success: true,
        source: "google-calendar",
      },
    });

    Object.defineProperty(messageEvent, "origin", {
      value: "http://localhost:8000",
    });

    await act(async () => {
      window.dispatchEvent(messageEvent);
    });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Google Calendar conectado com sucesso."
      );
      expect(
        screen.getByText("Conta conectada: recruiter@test.com.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reconectar Google Agenda" })
      ).toBeInTheDocument();
    });
  });
});
