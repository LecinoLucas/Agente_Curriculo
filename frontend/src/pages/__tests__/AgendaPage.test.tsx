import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { GoogleCalendarOAuthBridge } from "../../app/GoogleCalendarOAuthBridge";
import { AuthContext } from "../../features/auth/AuthContext";
import { GOOGLE_CALENDAR_OAUTH_RESULT_MESSAGE_TYPE } from "../../features/agenda/googleCalendarOAuth";
import type { InterviewSchedule } from "../../types/agenda";
import { AgendaPage } from "../AgendaPage";

const listInterviewsMock = vi.fn();
const getAgendaKpisMock = vi.fn();
const getGoogleCalendarAuthUrlMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const getGoogleCalendarStatusMock = vi.fn();
const completeInterviewMock = vi.fn();
const markNoShowMock = vi.fn();

vi.mock("../../services/agendaService", () => ({
  agendaService: {
    listInterviews: (params: unknown) => listInterviewsMock(params),
    getAgendaKpis: (params: unknown) => getAgendaKpisMock(params),
    getGoogleCalendarAuthUrl: () => getGoogleCalendarAuthUrlMock(),
    getGoogleCalendarStatus: () => getGoogleCalendarStatusMock(),
    completeInterview: (id: string) => completeInterviewMock(id),
    markNoShow: (id: string, payload: unknown) => markNoShowMock(id, payload),
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

type TestRole = "admin" | "hr" | "recruiter" | "viewer";

const baseUser = {
  id: "user-1",
  email: "user@test.com",
  full_name: "User",
  role: "admin" as TestRole,
  status: "active",
  real_ai_token_spend_enabled: false,
  preferred_theme: null,
  must_change_password: false,
  last_login_at: null,
  created_at: null,
};

function renderAgenda(role: TestRole = "admin") {
  return render(
    <AuthContext.Provider
      value={{
        user: { ...baseUser, role },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn().mockResolvedValue(undefined),
        loginWithGoogle: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue(undefined),
        refreshUser: vi.fn().mockResolvedValue(undefined),
        updateUser: vi.fn(),
      }}
    >
      <MemoryRouter future={routerFuture}>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function buildInterview(overrides: Partial<InterviewSchedule> = {}): InterviewSchedule {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    id: "interview-1",
    candidate_id: "candidate-1",
    candidate_name: "Marina Souza",
    job_id: "job-1",
    job_title: "Analista de RH",
    pipeline_id: "pipeline-1",
    title: "Entrevista",
    description: null,
    public_notes: "Levar documento com foto.",
    internal_notes: null,
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    timezone: "America/Recife",
    interview_type: "hr",
    interview_format: "online",
    status: "scheduled",
    location: null,
    meeting_url: null,
    interviewer_name: "Rafaela Lima",
    interviewer_email: "rafaela@test.com",
    cancel_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    counts_for_current_gate: false,
    ...overrides,
  };
}

function mockInterviews(data: InterviewSchedule[]) {
  listInterviewsMock.mockResolvedValue({
    data,
    total: data.length,
    page: 1,
    page_size: 100,
    total_pages: data.length ? 1 : 0,
  });
}

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
    completeInterviewMock.mockResolvedValue(buildInterview({ status: "completed" }));
    markNoShowMock.mockResolvedValue(buildInterview({ status: "no_show" }));
  });

  it("redireciona ao clicar em Conectar Google Agenda", async () => {
    const user = userEvent.setup();
    const popup = { location: { href: "" }, close: vi.fn() };

    getGoogleCalendarAuthUrlMock.mockResolvedValue({
      auth_url: "https://accounts.google.com/o/oauth2/auth",
    });

    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

    render(
      <MemoryRouter future={routerFuture}>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Conectar Google Agenda" }));

    await waitFor(() => {
      expect(getGoogleCalendarAuthUrlMock).toHaveBeenCalledOnce();
      expect(popup.location.href).toBe("https://accounts.google.com/o/oauth2/auth");
    });
  });

  it("mostra erro quando não consegue obter a URL do Google", async () => {
    const user = userEvent.setup();
    const popup = { location: { href: "" }, close: vi.fn() };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    getGoogleCalendarAuthUrlMock.mockRejectedValue(new Error("Falha"));

    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);

    render(
      <MemoryRouter future={routerFuture}>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Conectar Google Agenda" }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Não foi possível iniciar a conexão com o Google Calendar."
      );
      expect(popup.close).toHaveBeenCalledOnce();
    });
    errorSpy.mockRestore();
  });

  it("atualiza a UI após callback OAuth via postMessage", async () => {
    getGoogleCalendarStatusMock
      .mockResolvedValueOnce({ connected: false })
      .mockResolvedValueOnce({
        connected: true,
        google_account_email: "recruiter@test.com",
      });

    render(
      <MemoryRouter future={routerFuture}>
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

  it("mantém o campo de busca montado e atualiza query com debounce", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <GoogleCalendarOAuthBridge />
        <AgendaPage />
      </MemoryRouter>
    );

    const searchInput = await screen.findByPlaceholderText(
      "Buscar candidato, vaga, avaliador..."
    ) as HTMLInputElement;
    expect(searchInput).toBeInTheDocument();
    expect(listInterviewsMock).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();

    try {
      fireEvent.change(searchInput, { target: { value: "a" } });
      expect(listInterviewsMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(listInterviewsMock).toHaveBeenCalledTimes(2);
      expect(listInterviewsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "a" })
      );
      expect(
        screen.getByPlaceholderText("Buscar candidato, vaga, avaliador...")
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["admin", "hr", "recruiter"] as const)(
    "%s vê ação de nova entrevista",
    async (role) => {
      renderAgenda(role);

      expect(await screen.findByRole("button", { name: /nova entrevista/i })).toBeInTheDocument();
    }
  );

  it("não mostra ações mutáveis para viewer", async () => {
    mockInterviews([buildInterview({ candidate_name: "Candidato Viewer", job_title: "Vaga Viewer" })]);

    renderAgenda("viewer");

    expect((await screen.findAllByText("Candidato Viewer")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /nova entrevista/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("agenda-actions-button")).not.toBeInTheDocument();
    expect(screen.getAllByText("Somente leitura").length).toBeGreaterThan(0);
  });

  it("renderiza labels corretos para Hoje/Semana/Mês/Todas", async () => {
    const user = userEvent.setup();

    renderAgenda("admin");

    await screen.findByPlaceholderText("Buscar candidato, vaga, avaliador...");
    expect(screen.getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todas" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Todas" }));
    expect(await screen.findByText("Todas as entrevistas")).toBeInTheDocument();
    expect(screen.queryByText("Blocos operacionais")).not.toBeInTheDocument();
  });

  it("mostra candidato, vaga, status, formato e CTAs contextuais", async () => {
    mockInterviews([buildInterview()]);

    renderAgenda("admin");

    expect(await screen.findByText("Marina Souza")).toBeInTheDocument();
    expect(screen.getByText("Analista de RH")).toBeInTheDocument();
    expect(screen.getAllByText("Agendada").length).toBeGreaterThan(0);
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Levar documento com foto.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abrir candidato/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abrir pipeline/i })).toBeInTheDocument();
  });

  it("ações de editar/cancelar/concluir/no-show respeitam role mutável", async () => {
    const user = userEvent.setup();
    mockInterviews([buildInterview()]);

    renderAgenda("recruiter");

    await user.click(await screen.findByTestId("agenda-actions-button"));

    expect(screen.getByTestId("agenda-edit-action")).toHaveTextContent("Editar/remarcar");
    expect(screen.getByTestId("agenda-cancel-action")).toHaveTextContent("Cancelar");
    expect(screen.getByText("Marcar como concluída")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Não compareceu" })).toBeInTheDocument();
  });
});
