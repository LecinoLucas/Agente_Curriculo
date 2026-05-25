import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  PipelineRejectionReasonModal,
  REJECTION_REASON_MIN_LENGTH,
} from "../PipelineRejectionReasonModal";

describe("PipelineRejectionReasonModal", () => {
  it("renders warning and form when open", () => {
    render(
      <PipelineRejectionReasonModal
        open
        candidateName="Ana Silva"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("rejection-reason-modal")).toBeInTheDocument();
    expect(screen.getByTestId("rejection-reason-warning")).toHaveTextContent(
      /mantém o histórico/i,
    );
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <PipelineRejectionReasonModal
        open={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("rejection-reason-modal")).not.toBeInTheDocument();
  });

  it("confirm button is disabled when reason is shorter than minimum", async () => {
    const user = userEvent.setup();
    render(
      <PipelineRejectionReasonModal
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const confirm = screen.getByTestId("rejection-reason-confirm");
    expect(confirm).toBeDisabled();

    const textarea = screen.getByTestId("rejection-reason-textarea");
    await user.type(textarea, "curto");
    expect(confirm).toBeDisabled();
  });

  it(`enables confirm button when reason meets ${REJECTION_REASON_MIN_LENGTH}-char minimum`, async () => {
    const user = userEvent.setup();
    render(
      <PipelineRejectionReasonModal
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const textarea = screen.getByTestId("rejection-reason-textarea");
    const confirm = screen.getByTestId("rejection-reason-confirm");

    await user.type(textarea, "curto");
    expect(confirm).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Motivo válido e suficientemente longo." } });
    expect(confirm).not.toBeDisabled();
  });

  it("calls onConfirm with trimmed reason when submitted", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <PipelineRejectionReasonModal
        open
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const textarea = screen.getByTestId("rejection-reason-textarea");
    fireEvent.change(textarea, {
      target: { value: "  Perfil não atende os requisitos mínimos da vaga.  " },
    });
    await user.click(screen.getByTestId("rejection-reason-confirm"));

    expect(onConfirm).toHaveBeenCalledWith(
      "Perfil não atende os requisitos mínimos da vaga.",
    );
  });

  it("calls onClose when Cancelar is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PipelineRejectionReasonModal
        open
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("rejection-reason-cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables textarea and both buttons when submitting=true", () => {
    render(
      <PipelineRejectionReasonModal
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        submitting
      />,
    );

    expect(screen.getByTestId("rejection-reason-textarea")).toBeDisabled();
    expect(screen.getByTestId("rejection-reason-cancel")).toBeDisabled();
    expect(screen.getByTestId("rejection-reason-confirm")).toBeDisabled();
    expect(screen.getByTestId("rejection-reason-confirm")).toHaveTextContent(/desclassificando/i);
  });
});
