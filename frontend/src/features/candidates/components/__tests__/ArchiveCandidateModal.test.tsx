import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ArchiveCandidateModal } from "../ArchiveCandidateModal";

describe("ArchiveCandidateModal", () => {
  it("envia motivo e observação ao confirmar arquivamento", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ArchiveCandidateModal
        candidateName="Pessoa Teste"
        isOpen
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Motivo *"), "data_cleanup");
    await user.type(screen.getByLabelText("Observação"), "Mover para histórico.");
    await user.click(screen.getByRole("button", { name: "Arquivar candidato" }));

    expect(onConfirm).toHaveBeenCalledWith({
      reason: "data_cleanup",
      note: "Mover para histórico.",
    });
  });
});
