import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateCommunicationsPanel } from "../CandidateCommunicationsPanel";
import { communicationService } from "../../../../../services/communicationService";
import type { CandidateCommunication } from "../../../../../types/domain";

vi.mock("../../../../../services/communicationService", () => ({
  communicationService: {
    getRecruiterCommunications: vi.fn(),
    retryCommunication: vi.fn(),
  },
}));

function communication(overrides: Partial<CandidateCommunication> = {}): CandidateCommunication {
  return {
    id: "comm-1",
    candidate_id: "candidate-1",
    job_id: "job-1",
    related_entity_type: "interview_schedule",
    related_entity_id: "interview-1",
    template_key: "interview_scheduled",
    channel: "internal",
    audience: "candidate",
    subject: "Entrevista agendada",
    body: "Sua entrevista foi agendada.",
    status: "sent",
    created_by: "user-1",
    created_at: "2026-05-14T12:00:00Z",
    queued_at: null,
    sent_at: "2026-05-14T12:00:01Z",
    read_at: null,
    error_message: null,
    ...overrides,
  };
}

describe("CandidateCommunicationsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza lista de comunicações", async () => {
    vi.mocked(communicationService.getRecruiterCommunications).mockResolvedValue({
      communications: [communication()],
    });

    render(<CandidateCommunicationsPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText("Entrevista agendada")).toBeInTheDocument();
    expect(screen.getByText("Sua entrevista foi agendada.")).toBeInTheDocument();
    expect(screen.getByText("Enviada")).toBeInTheDocument();
  });

  it("renderiza empty state", async () => {
    vi.mocked(communicationService.getRecruiterCommunications).mockResolvedValue({
      communications: [],
    });

    render(<CandidateCommunicationsPanel jobId="job-1" candidateId="candidate-1" />);

    expect(await screen.findByText("Nenhuma comunicação registrada.")).toBeInTheDocument();
  });

  it("mostra loading e error state", async () => {
    vi.mocked(communicationService.getRecruiterCommunications).mockRejectedValue(
      new Error("Falha de rede"),
    );

    render(<CandidateCommunicationsPanel jobId="job-1" candidateId="candidate-1" />);

    expect(screen.getByText("Carregando comunicações...")).toBeInTheDocument();
    expect(await screen.findByText("Falha de rede")).toBeInTheDocument();
  });

  it("mostra failed com botão reenviar e chama service", async () => {
    vi.mocked(communicationService.getRecruiterCommunications)
      .mockResolvedValueOnce({
        communications: [
          communication({
            id: "comm-failed",
            status: "failed",
            error_message: "Provider indisponível",
          }),
        ],
      })
      .mockResolvedValueOnce({ communications: [communication({ id: "comm-failed" })] });
    vi.mocked(communicationService.retryCommunication).mockResolvedValue({
      message: "Communication retry initiated",
    });

    render(<CandidateCommunicationsPanel jobId="job-1" candidateId="candidate-1" />);

    const retry = await screen.findByRole("button", { name: /reenviar/i });
    expect(screen.getByText("Falhou")).toBeInTheDocument();
    fireEvent.click(retry);

    await waitFor(() => {
      expect(communicationService.retryCommunication).toHaveBeenCalledWith("comm-failed");
    });
    await waitFor(() => {
      expect(communicationService.getRecruiterCommunications).toHaveBeenCalledTimes(2);
    });
  });
});
