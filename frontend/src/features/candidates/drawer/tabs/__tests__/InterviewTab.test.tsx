import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterviewTab } from "../InterviewTab";
import type { InterviewSchedule } from "../../../../../types/agenda";

const listCandidateJobInterviewsMock = vi.fn();
const createCandidateJobInterviewMock = vi.fn();
const rescheduleInterviewMock = vi.fn();
const cancelInterviewOperationalMock = vi.fn();
const completeInterviewMock = vi.fn();
const markNoShowMock = vi.fn();

vi.mock("../../../../../services/agendaService", () => ({
  agendaService: {
    listCandidateJobInterviews: (...args: unknown[]) => listCandidateJobInterviewsMock(...args),
    createCandidateJobInterview: (...args: unknown[]) => createCandidateJobInterviewMock(...args),
    rescheduleInterview: (...args: unknown[]) => rescheduleInterviewMock(...args),
    cancelInterviewOperational: (...args: unknown[]) => cancelInterviewOperationalMock(...args),
    completeInterview: (...args: unknown[]) => completeInterviewMock(...args),
    markNoShow: (...args: unknown[]) => markNoShowMock(...args),
  },
}));

vi.mock("../../components/InterviewScorecardPanel", () => ({
  InterviewScorecardPanel: ({ interviewId }: { interviewId?: string | null }) => (
    <div data-testid="scorecard-panel">scorecard {interviewId}</div>
  ),
}));

const interview: InterviewSchedule = {
  id: "interview-1",
  candidate_id: "candidate-1",
  candidate_name: "Ana Candidata",
  job_id: "job-1",
  job_title: "Pessoa Desenvolvedora",
  title: "Entrevista RH",
  description: null,
  public_notes: null,
  internal_notes: null,
  scheduled_start: "2026-06-01T13:00:00.000Z",
  scheduled_end: "2026-06-01T14:00:00.000Z",
  timezone: "America/Recife",
  interview_type: "hr",
  interview_format: "online",
  status: "scheduled",
  location: null,
  meeting_url: null,
  interviewer_name: "Maria RH",
  interviewer_email: "maria@example.com",
  cancel_reason: null,
  created_at: "2026-05-14T10:00:00.000Z",
  updated_at: "2026-05-14T10:00:00.000Z",
  calendar_provider: "google",
  calendar_sync_status: "synced",
  calendar_sync_error: null,
  calendar_synced_at: "2026-05-14T10:01:00.000Z",
  meeting_provider: "google_meet",
  external_calendar_html_link: "https://calendar.google.com/event",
  external_calendar_event_id: "google-event-1",
};

describe("InterviewTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCandidateJobInterviewsMock.mockResolvedValue({
      data: [interview],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    });
    createCandidateJobInterviewMock.mockResolvedValue(interview);
    rescheduleInterviewMock.mockResolvedValue({ ...interview, status: "rescheduled" });
    cancelInterviewOperationalMock.mockResolvedValue({ ...interview, status: "cancelled" });
    completeInterviewMock.mockResolvedValue({ ...interview, status: "awaiting_feedback" });
    markNoShowMock.mockResolvedValue({ ...interview, status: "no_show" });
  });

  it("renderiza lista com status, entrevistador e sincronização Google", async () => {
    render(<InterviewTab jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText("Entrevista RH")).toBeInTheDocument();
    expect(screen.getByText("Agendada")).toBeInTheDocument();
    expect(screen.getByText("Maria RH")).toBeInTheDocument();
    expect(screen.getByText(/Calendar: synced/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir/i })).toHaveAttribute(
      "href",
      "https://calendar.google.com/event",
    );
  });

  it("cria e remarca entrevista", async () => {
    const user = userEvent.setup();
    render(<InterviewTab jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText("Entrevista RH");
    await user.click(screen.getByRole("button", { name: /Agendar/i }));
    fireEvent.change(screen.getByLabelText(/Início/i), { target: { value: "2026-06-02T09:00" } });
    fireEvent.change(screen.getByLabelText(/Fim/i), { target: { value: "2026-06-02T10:00" } });
    await user.click(screen.getByRole("button", { name: /Salvar/i }));

    await waitFor(() => {
      expect(createCandidateJobInterviewMock).toHaveBeenCalledWith(
        "job-1",
        "candidate-1",
        expect.objectContaining({ status: "scheduled", create_google_event: false }),
      );
    });

    await user.click(screen.getByRole("button", { name: /Remarcar/i }));
    fireEvent.change(screen.getByLabelText(/Início/i), { target: { value: "2026-06-03T09:00" } });
    fireEvent.change(screen.getByLabelText(/Fim/i), { target: { value: "2026-06-03T10:00" } });
    await user.click(screen.getAllByRole("button", { name: /^Remarcar$/i })[0]);

    await waitFor(() => {
      expect(rescheduleInterviewMock).toHaveBeenCalledWith(
        "interview-1",
        expect.objectContaining({ sync_google_event: true }),
      );
    });
  });

  it("executa cancelar, realizada, no-show e abre scorecard vinculado", async () => {
    const user = userEvent.setup();
    render(<InterviewTab jobId="job-1" candidateId="candidate-1" />);

    await screen.findByText("Entrevista RH");
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));
    await user.click(screen.getByRole("button", { name: /Realizada/i }));
    await user.click(screen.getByRole("button", { name: /No-show/i }));
    await user.click(screen.getByRole("button", { name: /Scorecard/i }));

    await waitFor(() => {
      expect(cancelInterviewOperationalMock).toHaveBeenCalledWith(
        "interview-1",
        expect.objectContaining({ cancel_reason: expect.any(String) }),
      );
      expect(completeInterviewMock).toHaveBeenCalledWith("interview-1");
      expect(markNoShowMock).toHaveBeenCalledWith(
        "interview-1",
        expect.objectContaining({ reason: expect.any(String) }),
      );
    });
    expect(screen.getByTestId("scorecard-panel")).toHaveTextContent("interview-1");
  });

  it("renderiza empty, loading e error states", async () => {
    listCandidateJobInterviewsMock.mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      page_size: 50,
      total_pages: 1,
    });
    const { rerender } = render(<InterviewTab jobId="job-1" candidateId="candidate-1" />);
    expect(screen.getByRole("status", { name: /Carregando entrevistas/i })).toBeInTheDocument();
    expect(await screen.findByText(/Nenhuma entrevista registrada/i)).toBeInTheDocument();

    listCandidateJobInterviewsMock.mockRejectedValueOnce(new Error("falha"));
    rerender(<InterviewTab jobId="job-1" candidateId="candidate-2" />);
    expect(await screen.findByText(/Não foi possível carregar entrevistas/i)).toBeInTheDocument();
  });
});
