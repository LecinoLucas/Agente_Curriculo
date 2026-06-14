import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PipelineTransitionBlockedModal } from "../PipelineTransitionBlockedModal";
import type { PipelineTransitionBlockedResponse } from "../../../services/pipelineService";

function baseBlocked(
  overrides: Partial<PipelineTransitionBlockedResponse> = {},
): PipelineTransitionBlockedResponse {
  return {
    code: "pipeline_transition_blocked",
    message: "Bloqueio.",
    current_stage: "final",
    target_stage: "offer",
    can_force: false,
    force_requires_reason: true,
    missing_gates: [
      {
        code: "behavioral_ai_pending",
        label: "IA pendente",
        description: "Aguarde a IA.",
        action: "open_behavioral_ai",
        action_payload: null,
        severity: "block",
        forceable: true,
      },
    ],
    ...overrides,
  };
}

function buildManyGates(total = 20) {
  return Array.from({ length: total }, (_, index) => ({
    code: `gate_${index + 1}`,
    label: `Pendencia ${index + 1}`,
    description: `Descricao da pendencia ${index + 1}`,
    action: "open_profile" as const,
    action_payload: null,
    severity: "block" as const,
    forceable: true,
  }));
}

describe("PipelineTransitionBlockedModal — Fase 5 force section", () => {
  it("não mostra seção de Forçar quando can_force=false", () => {
    render(
      <PipelineTransitionBlockedModal
        open
        candidateId="c-1"
        candidateName="Ana"
        blocked={baseBlocked({ can_force: false })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("pipeline-blocked-force-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pipeline-blocked-force-submit")).not.toBeInTheDocument();
  });

  it("mostra seção de Forçar com textarea e botão quando can_force=true", () => {
    render(
      <PipelineTransitionBlockedModal
        open
        candidateId="c-1"
        candidateName="Ana"
        blocked={baseBlocked({ can_force: true })}
        onClose={vi.fn()}
        onForceSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId("pipeline-blocked-force-section")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-blocked-force-reason")).toBeInTheDocument();
    const submit = screen.getByTestId("pipeline-blocked-force-submit");
    // Justificativa vazia → botão desabilitado.
    expect(submit).toBeDisabled();
  });

  it("habilita botão somente quando justificativa atinge o mínimo", async () => {
    const user = userEvent.setup();
    render(
      <PipelineTransitionBlockedModal
        open
        candidateId="c-1"
        candidateName="Ana"
        blocked={baseBlocked({ can_force: true })}
        onClose={vi.fn()}
        onForceSubmit={vi.fn()}
      />,
    );

    const textarea = screen.getByTestId("pipeline-blocked-force-reason");
    const submit = screen.getByTestId("pipeline-blocked-force-submit");

    await user.type(textarea, "curto");
    expect(submit).toBeDisabled();

    // Min length = 10 chars (matches backend FORCE_REASON_MIN_LENGTH).
    fireEvent.change(textarea, { target: { value: "Justificativa válida e longa." } });
    expect(submit).not.toBeDisabled();
  });

  it("chama onForceSubmit com candidateId, targetStage e forceReason ao submeter", async () => {
    const user = userEvent.setup();
    const onForceSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <PipelineTransitionBlockedModal
        open
        candidateId="c-9"
        candidateName="Ana"
        blocked={baseBlocked({ can_force: true, target_stage: "offer" })}
        onClose={vi.fn()}
        onForceSubmit={onForceSubmit}
      />,
    );

    const textarea = screen.getByTestId("pipeline-blocked-force-reason");
    fireEvent.change(textarea, {
      target: { value: "Entrevista realizada por telefone — autorização externa" },
    });
    await user.click(screen.getByTestId("pipeline-blocked-force-submit"));

    expect(onForceSubmit).toHaveBeenCalledWith({
      candidateId: "c-9",
      targetStage: "offer",
      forceReason: "Entrevista realizada por telefone — autorização externa",
    });
  });

  it("mostra mensagem de erro de forceError vinda do host (e.g. 403/422)", () => {
    render(
      <PipelineTransitionBlockedModal
        open
        candidateId="c-1"
        candidateName="Ana"
        blocked={baseBlocked({ can_force: true })}
        onClose={vi.fn()}
        onForceSubmit={vi.fn()}
        forceError="Apenas administradores podem forçar avanço de etapa."
      />,
    );

    expect(screen.getByTestId("pipeline-blocked-force-error")).toHaveTextContent(
      /apenas administradores/i,
    );
  });

  it("desabilita botão e textarea quando forceSubmitting=true", () => {
    render(
      <PipelineTransitionBlockedModal
        open
        candidateId="c-1"
        candidateName="Ana"
        blocked={baseBlocked({ can_force: true })}
        onClose={vi.fn()}
        onForceSubmit={vi.fn()}
        forceSubmitting
      />,
    );

    expect(screen.getByTestId("pipeline-blocked-force-reason")).toBeDisabled();
    expect(screen.getByTestId("pipeline-blocked-force-submit")).toBeDisabled();
    expect(screen.getByTestId("pipeline-blocked-force-submit")).toHaveTextContent(/forçando/i);
  });

  describe("UI Scroll Structure", () => {
    it("aplica as classes corretas para scroll interno e layout vertical flex", () => {
      render(
        <PipelineTransitionBlockedModal
          open
          candidateId="c-1"
          candidateName="Ana"
          blocked={baseBlocked()}
          onClose={vi.fn()}
        />,
      );

      const dialog = screen.getByTestId("pipeline-transition-blocked-modal");
      expect(dialog).toHaveClass("max-h-[85vh]", "flex", "flex-col", "overflow-hidden");

      const header = screen.getByTestId("pipeline-blocked-header");
      expect(header).toHaveClass("shrink-0", "border-b");

      const scrollContainer = screen.getByTestId("pipeline-blocked-scroll-container");
      expect(scrollContainer).toHaveClass("flex-1", "overflow-y-auto", "min-h-0");

      const footer = screen.getByTestId("pipeline-blocked-footer");
      expect(footer).toHaveClass("shrink-0", "border-t", "p-6", "pt-4");
    });

    it("mantem as acoes visiveis e renderiza muitas pendencias sem quebrar o modal", () => {
      render(
        <PipelineTransitionBlockedModal
          open
          candidateId="c-1"
          candidateName="Ana"
          blocked={baseBlocked({
            can_force: true,
            missing_gates: buildManyGates(18),
          })}
          onClose={vi.fn()}
          onForceSubmit={vi.fn()}
        />,
      );

      expect(screen.getByText(/Pendências obrigatórias \(18\)/i)).toBeInTheDocument();
      expect(screen.getByTestId("pipeline-blocked-scroll-container")).toHaveClass("overflow-y-auto");
      expect(screen.getByTestId("pipeline-blocked-close")).toBeInTheDocument();
      expect(screen.getByTestId("pipeline-blocked-force-submit")).toBeInTheDocument();
      expect(screen.getByTestId("pipeline-blocked-force-reason")).toBeInTheDocument();
      expect(screen.getByTestId("pipeline-blocked-gate-gate_18")).toBeInTheDocument();
    });
  });
});
