import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../../../services/http";
import { pipelineService } from "../../../services/pipelineService";
import { usePipelineTransitionBlockedHandler } from "../usePipelineTransitionBlocked";

vi.mock("../../../services/pipelineService", async () => {
  const actual = await vi.importActual<typeof import("../../../services/pipelineService")>(
    "../../../services/pipelineService",
  );
  return {
    ...actual,
    pipelineService: {
      moveCandidateStage: vi.fn(),
    },
  };
});

const BLOCKED_PAYLOAD = {
  code: "pipeline_transition_blocked",
  message: "Bloqueio.",
  current_stage: "final",
  target_stage: "offer",
  missing_gates: [
    {
      code: "behavioral_ai_pending",
      label: "IA pendente",
      description: "Aguarde a IA.",
      action: "open_behavioral_ai",
      action_payload: null,
      severity: "block",
      forceable: false,
    },
  ],
  can_force: false,
  force_requires_reason: true,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("usePipelineTransitionBlockedHandler", () => {
  it("returns false and keeps state null when error is unrelated", () => {
    const { result } = renderHook(() => usePipelineTransitionBlockedHandler(), { wrapper });

    let handled = true;
    act(() => {
      handled = result.current.handleBlockedError(new Error("rede"), {
        candidateId: "c-1",
        candidateName: "Ana",
      });
    });

    expect(handled).toBe(false);
    expect(result.current.blockedTransition).toBeNull();
  });

  it("captures blocked HttpError and stores candidate context", () => {
    const { result } = renderHook(() => usePipelineTransitionBlockedHandler(), { wrapper });

    let handled = false;
    act(() => {
      handled = result.current.handleBlockedError(
        new HttpError(409, "Conflict", undefined, BLOCKED_PAYLOAD),
        { candidateId: "c-1", candidateName: "Ana" },
      );
    });

    expect(handled).toBe(true);
    expect(result.current.blockedTransition).toMatchObject({
      candidateId: "c-1",
      candidateName: "Ana",
      response: { target_stage: "offer", current_stage: "final" },
    });
    expect(result.current.blockedTransition?.response.missing_gates).toHaveLength(1);
  });

  it("closeBlocked clears state", () => {
    const { result } = renderHook(() => usePipelineTransitionBlockedHandler(), { wrapper });

    act(() => {
      result.current.handleBlockedError(
        new HttpError(409, "Conflict", undefined, BLOCKED_PAYLOAD),
        { candidateId: "c-1" },
      );
    });
    expect(result.current.blockedTransition).not.toBeNull();

    act(() => result.current.closeBlocked());
    expect(result.current.blockedTransition).toBeNull();
  });

  describe("submitForce", () => {
    beforeEach(() => {
      vi.mocked(pipelineService.moveCandidateStage).mockReset();
    });

    it("chama pipelineService.moveCandidateStage com force=true e fecha estado bloqueado em sucesso", async () => {
      vi.mocked(pipelineService.moveCandidateStage).mockResolvedValueOnce({
        candidate_id: "c-1",
        job_id: "job-1",
        stage: "offer",
        candidate_status: "Proposta",
        status: "active",
        transition_id: "t-1",
        updated_at: "2026-05-25T00:00:00Z",
        analysis: null,
      });

      const { result } = renderHook(() => usePipelineTransitionBlockedHandler(), { wrapper });
      // Prime blocked state.
      act(() => {
        result.current.handleBlockedError(
          new HttpError(409, "Conflict", undefined, BLOCKED_PAYLOAD),
          { candidateId: "c-1" },
        );
      });

      let returned: unknown = "not-called";
      await act(async () => {
        returned = await result.current.submitForce({
          candidateId: "c-1",
          jobId: "job-1",
          targetStage: "offer",
          forceReason: "Justificativa válida e longa",
        });
      });

      expect(pipelineService.moveCandidateStage).toHaveBeenCalledWith("job-1", "c-1", {
        stage: "offer",
        force: true,
        force_reason: "Justificativa válida e longa",
      });
      expect(returned).not.toBeNull();
      expect(result.current.blockedTransition).toBeNull();
      expect(result.current.forceError).toBeNull();
      expect(result.current.forceSubmitting).toBe(false);
    });

    it("403 do backend popula forceError com mensagem amigável de admin-only", async () => {
      vi.mocked(pipelineService.moveCandidateStage).mockRejectedValueOnce(
        new HttpError(403, "Forbidden", undefined, { detail: "Apenas administradores" }, "Apenas administradores"),
      );

      const { result } = renderHook(() => usePipelineTransitionBlockedHandler(), { wrapper });
      act(() => {
        result.current.handleBlockedError(
          new HttpError(409, "Conflict", undefined, BLOCKED_PAYLOAD),
          { candidateId: "c-1" },
        );
      });

      await act(async () => {
        await result.current.submitForce({
          candidateId: "c-1",
          jobId: "job-1",
          targetStage: "offer",
          forceReason: "Justificativa válida e longa",
        });
      });

      await waitFor(() => {
        expect(result.current.forceError).toMatch(/apenas administradores/i);
      });
      // Modal stays open so the user sees the error inline.
      expect(result.current.blockedTransition).not.toBeNull();
    });

    it("422 do backend popula forceError com texto vindo do detail", async () => {
      vi.mocked(pipelineService.moveCandidateStage).mockRejectedValueOnce(
        new HttpError(
          422,
          "Justificativa do force inválida: mínimo de 10 caracteres.",
          undefined,
          { detail: "Justificativa do force inválida: mínimo de 10 caracteres." },
          "Justificativa do force inválida: mínimo de 10 caracteres.",
        ),
      );

      const { result } = renderHook(() => usePipelineTransitionBlockedHandler(), { wrapper });
      act(() => {
        result.current.handleBlockedError(
          new HttpError(409, "Conflict", undefined, BLOCKED_PAYLOAD),
          { candidateId: "c-1" },
        );
      });

      await act(async () => {
        await result.current.submitForce({
          candidateId: "c-1",
          jobId: "job-1",
          targetStage: "offer",
          forceReason: "curto",
        });
      });

      await waitFor(() => {
        expect(result.current.forceError).toMatch(/mínimo de 10/i);
      });
    });
  });
});
