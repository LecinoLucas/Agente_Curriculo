import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../services/http";
import {
  pipelineService,
  readPipelineTransitionBlockedResponse,
  type PipelineTransitionBlockedResponse,
} from "../../services/pipelineService";
import type { MovePipelineCandidateResponse } from "../../types/domain";
import type { GateAction, PipelineForceSubmit } from "./PipelineTransitionBlockedModal";

export type BlockedTransitionState = {
  candidateId: string;
  candidateName: string | null;
  response: PipelineTransitionBlockedResponse;
};

export type HandleBlockedContext = {
  candidateId: string;
  candidateName?: string | null;
};

export type UsePipelineTransitionBlockedHandler = {
  /** Current blocked state, or null when no block is active. */
  blockedTransition: BlockedTransitionState | null;
  /**
   * Inspect an unknown error. If it matches the structured 409 contract, store
   * the parsed response (so the modal opens) and return true. Otherwise return
   * false — the caller is expected to fall back to its previous error handling
   * (typically a toast).
   *
   * Callers MUST treat a `true` return as "I handled the error" and skip any
   * generic toast.
   */
  handleBlockedError: (error: unknown, ctx: HandleBlockedContext) => boolean;
  closeBlocked: () => void;
  /**
   * Submit a force-bypass for the current blocked transition. Calls the
   * pipeline service with `force=true`, returns the new stage on success and
   * clears the blocked state. On failure, parses 403/422 into a friendly
   * message stored in `forceError`. Rethrows non-handled errors so the caller
   * can still log them.
   */
  submitForce: (
    payload: PipelineForceSubmit & { jobId: string },
  ) => Promise<MovePipelineCandidateResponse | null>;
  forceSubmitting: boolean;
  forceError: string | null;
  clearForceError: () => void;
};

/**
 * Centralizes detection + storage of pipeline_transition_blocked responses so
 * every surface that triggers a stage move (Kanban drag, drawer advance,
 * profile workflow tab) can reuse the same modal flow without duplicating
 * error parsing logic.
 */
function formatForceError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 403) {
      return "Apenas administradores podem forçar avanço de etapa.";
    }
    if (err.status === 422) {
      // The message comes from the backend exception text (Pydantic 422 from
      // schema validation also lands here). Prefer it when present.
      if (typeof err.detail === "string" && err.detail.trim()) return err.detail;
      if (err.message) return err.message;
      return "Justificativa inválida ou ação de forçar não se aplica.";
    }
    return err.message || "Não foi possível forçar o avanço.";
  }
  return "Não foi possível forçar o avanço.";
}

export function usePipelineTransitionBlockedHandler(): UsePipelineTransitionBlockedHandler {
  const [blockedTransition, setBlockedTransition] = useState<BlockedTransitionState | null>(null);
  const [forceSubmitting, setForceSubmitting] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);

  const handleBlockedError = useCallback(
    (error: unknown, ctx: HandleBlockedContext): boolean => {
      const blocked = readPipelineTransitionBlockedResponse(error);
      if (!blocked) return false;
      setBlockedTransition({
        candidateId: ctx.candidateId,
        candidateName: ctx.candidateName ?? null,
        response: blocked,
      });
      setForceError(null);
      return true;
    },
    [],
  );

  const closeBlocked = useCallback(() => {
    setBlockedTransition(null);
    setForceError(null);
    setForceSubmitting(false);
  }, []);

  const clearForceError = useCallback(() => setForceError(null), []);

  const submitForce = useCallback<UsePipelineTransitionBlockedHandler["submitForce"]>(
    async ({ candidateId, jobId, targetStage, forceReason }) => {
      if (forceSubmitting) return null;
      setForceSubmitting(true);
      setForceError(null);
      try {
        const result = await pipelineService.moveCandidateStage(jobId, candidateId, {
          stage: targetStage,
          force: true,
          force_reason: forceReason,
        });
        // Success: dismiss the blocked modal so the host UI can refetch.
        setBlockedTransition(null);
        return result;
      } catch (err) {
        setForceError(formatForceError(err));
        return null;
      } finally {
        setForceSubmitting(false);
      }
    },
    [forceSubmitting],
  );

  return {
    blockedTransition,
    handleBlockedError,
    closeBlocked,
    submitForce,
    forceSubmitting,
    forceError,
    clearForceError,
  };
}

/**
 * Returns a resolver to pass to the PipelineTransitionBlockedModal that knows
 * how to navigate to the relevant tab/focus on the candidate profile.
 *
 * - open_interview / open_scorecard       → /candidatos/:id?tab=interviews
 * - open_behavioral_assessment            → /candidatos/:id?tab=assessments
 * - open_behavioral_ai                    → /candidatos/:id?tab=assessments&focus=behavioral_ai
 * - open_decision                         → /candidatos/:id?tab=workflow
 * - add_reason (when onAddReason given)   → calls onAddReason(candidateId) instead of navigating
 * - add_reason (no onAddReason)           → /candidatos/:id?tab=workflow
 * - open_profile or any unknown action    → handled by the modal's fallback
 *
 * `onAfterNavigate` runs only when the resolver fires (i.e. the action is
 * mapped). Hosts typically use it to close their local modal state.
 *
 * `onAddReason` lets surfaces intercept the `add_reason` gate action locally
 * (e.g., open a PipelineRejectionReasonModal) instead of navigating to the
 * workflow tab. When provided, it receives the candidateId and the resolver
 * returns true without navigating.
 */
export function usePipelineGateActionResolver(
  onAfterNavigate?: () => void,
  onAddReason?: (candidateId: string) => void,
) {
  const navigate = useNavigate();

  return useCallback(
    (action: GateAction): boolean => {
      if (action.action === "add_reason" && onAddReason) {
        onAddReason(action.candidateId);
        onAfterNavigate?.();
        return true;
      }

      const tabByAction: Record<string, string> = {
        open_interview: "interviews",
        open_scorecard: "interviews",
        open_behavioral_assessment: "assessments",
        open_behavioral_ai: "assessments",
        open_decision: "workflow",
        add_reason: "workflow",
      };

      const tab = tabByAction[action.action];
      if (!tab) {
        // Unknown action or "open_profile" sentinel — let the modal fall back
        // to onOpenProfile (which also navigates, but to the default route).
        return false;
      }

      const params = new URLSearchParams({ tab });
      if (action.action === "open_behavioral_ai") {
        params.set("focus", "behavioral_ai");
      }
      navigate(`/candidatos/${action.candidateId}?${params.toString()}`);
      onAfterNavigate?.();
      return true;
    },
    [navigate, onAfterNavigate, onAddReason],
  );
}
