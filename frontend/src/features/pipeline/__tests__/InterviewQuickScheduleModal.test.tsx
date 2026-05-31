import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

import { InterviewQuickScheduleModal } from "../InterviewQuickScheduleModal";

describe("InterviewQuickScheduleModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(onSchedule = vi.fn().mockResolvedValue(undefined)) {
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
    return { onSchedule };
  }

  it("usa label Formato para presencial/remoto/telefone", () => {
    renderModal();

    expect(screen.getByLabelText("Formato")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo")).not.toBeInTheDocument();
  });

  it("não promete Google Calendar ou Google Meet no quick schedule", () => {
    renderModal();

    expect(screen.queryByText("Adicionar ao Google Calendar")).not.toBeInTheDocument();
    expect(screen.queryByText("Criar link do Google Meet")).not.toBeInTheDocument();
  });

  it("envia payload sem campos Google Calendar/Meet", async () => {
    const user = userEvent.setup();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const onSchedule = vi.fn().mockResolvedValue(undefined);
    renderModal(onSchedule);

    await user.clear(screen.getByLabelText("Data"));
    await user.type(screen.getByLabelText("Data"), tomorrow);
    await user.click(screen.getByRole("button", { name: /agendar entrevista/i }));

    await waitFor(() => {
      expect(onSchedule).toHaveBeenCalledWith(
        expect.not.objectContaining({
          create_google_event: expect.anything(),
          create_google_meet: expect.anything(),
        }),
      );
    });
  });
});
