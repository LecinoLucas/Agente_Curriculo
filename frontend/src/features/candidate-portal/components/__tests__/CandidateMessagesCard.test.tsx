import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CandidateMessagesCard } from "../CandidateMessagesCard";
import { communicationService } from "../../../../services/communicationService";
import type { CandidateCommunication } from "../../../../types/domain";

vi.mock("../../../../services/communicationService", () => ({
  communicationService: {
    getCandidateCommunications: vi.fn(),
    markCommunicationRead: vi.fn(),
  },
}));

function message(overrides: Partial<CandidateCommunication> = {}): CandidateCommunication {
  return {
    id: "message-1",
    candidate_id: "candidate-1",
    job_id: "job-1",
    related_entity_type: "pre_admission_case",
    related_entity_id: "case-1",
    template_key: "pre_admission_created",
    channel: "internal",
    audience: "candidate",
    subject: "Processo iniciado",
    body: "Seu processo de pré-admissão foi iniciado.",
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

describe("CandidateMessagesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza mensagens do candidato", async () => {
    vi.mocked(communicationService.getCandidateCommunications).mockResolvedValue({
      communications: [message()],
    });

    render(<CandidateMessagesCard />);

    expect(await screen.findByText("Processo iniciado")).toBeInTheDocument();
    expect(screen.getByText("Seu processo de pré-admissão foi iniciado.")).toBeInTheDocument();
  });

  it("renderiza empty state", async () => {
    vi.mocked(communicationService.getCandidateCommunications).mockResolvedValue({
      communications: [],
    });

    render(<CandidateMessagesCard />);

    expect(await screen.findByText("Nenhuma mensagem no momento.")).toBeInTheDocument();
  });

  it("mostra loading e error state", async () => {
    vi.mocked(communicationService.getCandidateCommunications).mockRejectedValue(
      new Error("Sessão expirada"),
    );

    render(<CandidateMessagesCard />);

    expect(screen.getByText("Carregando mensagens...")).toBeInTheDocument();
    expect(await screen.findByText("Sessão expirada")).toBeInTheDocument();
  });

  it("mark-read chama service e atualiza status", async () => {
    vi.mocked(communicationService.getCandidateCommunications).mockResolvedValue({
      communications: [message({ id: "message-unread" })],
    });
    vi.mocked(communicationService.markCommunicationRead).mockResolvedValue({
      message: "Communication marked as read",
    });

    render(<CandidateMessagesCard />);

    const button = await screen.findByRole("button", { name: /marcar como lida/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(communicationService.markCommunicationRead).toHaveBeenCalledWith("message-unread");
    });
    expect(await screen.findByText("Lida")).toBeInTheDocument();
  });
});
