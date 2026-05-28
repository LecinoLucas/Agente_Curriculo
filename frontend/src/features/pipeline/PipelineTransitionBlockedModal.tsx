import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, ExternalLink, ShieldAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import type {
  PipelineGateActionCode,
  PipelineMissingGate,
  PipelineTransitionBlockedResponse,
} from "../../services/pipelineService";
import type { PipelineStage } from "../../types/domain";

// Matches backend FORCE_REASON_MIN_LENGTH. Kept in sync manually — if the
// server bumps the minimum, this becomes a soft-pre-check; the server is
// always the source of truth and will still 422 on short reasons.
export const FORCE_REASON_MIN_LENGTH = 10;
export const FORCE_REASON_MAX_LENGTH = 500;

const STAGE_LABEL: Record<PipelineStage, string> = {
  entry: "Entrada",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

const GATE_ACTION_LABEL: Record<PipelineGateActionCode, string> = {
  open_interview: "Abrir entrevista",
  open_scorecard: "Abrir scorecard",
  open_behavioral_assessment: "Abrir avaliação comportamental",
  open_behavioral_ai: "Ver IA comportamental",
  open_decision: "Abrir decisão final",
  add_reason: "Informar motivo",
  open_pre_admission: "Abrir admissão",
  open_profile: "Abrir perfil",
};

const FALLBACK_GATE_ACTION_LABEL = "Abrir perfil";

export type PipelineForceSubmit = {
  candidateId: string;
  targetStage: PipelineStage;
  forceReason: string;
};

export type PipelineTransitionBlockedModalProps = {
  open: boolean;
  candidateId: string | null;
  candidateName?: string | null;
  blocked: PipelineTransitionBlockedResponse | null;
  onClose: () => void;
  /**
   * Resolve the action triggered for a missing gate. The host page wires this
   * to navigation / drawer-open behavior. Returning false (or omitting) means
   * the action is not supported in this surface — the button falls back to
   * "Abrir perfil".
   */
  onResolveAction?: (action: GateAction) => boolean | void;
  /**
   * Safe fallback when no specific action mapping is available. Typically
   * navigates to the candidate profile.
   */
  onOpenProfile?: (candidateId: string) => void;
  /**
   * Called when the admin confirms a force-bypass with a justification.
   * Implementations must call `pipelineService.moveCandidateStage` again with
   * `force=true` and the same target stage, then close the modal on success.
   * Should resolve when the request finishes (success or failure) so the
   * modal can clear its local loading state.
   */
  onForceSubmit?: (payload: PipelineForceSubmit) => Promise<void> | void;
  /**
   * Reflects an in-flight force request so the modal can disable the form
   * even across remounts.
   */
  forceSubmitting?: boolean;
  /**
   * Last force-attempt error message to display below the form (e.g. mapped
   * from a 403 or 422 response). Cleared when the user edits the reason.
   */
  forceError?: string | null;
};

export type GateAction = {
  candidateId: string;
  // Known action code OR an unknown string the backend introduced. The host
  // should treat unknown values as "fall back to profile".
  action: PipelineGateActionCode | (string & {});
  payload: Record<string, unknown> | null;
  gateCode: string;
};

function stageLabel(stage: PipelineStage | null | undefined): string {
  if (!stage) return "—";
  return STAGE_LABEL[stage] ?? stage;
}

function GateRow({
  gate,
  candidateId,
  onResolveAction,
  onOpenProfile,
}: {
  gate: PipelineMissingGate;
  candidateId: string | null;
  onResolveAction?: (action: GateAction) => boolean | void;
  onOpenProfile?: (candidateId: string) => void;
}) {
  const knownAction = GATE_ACTION_LABEL[gate.action as PipelineGateActionCode];
  const actionLabel = knownAction ?? FALLBACK_GATE_ACTION_LABEL;
  const canResolve = Boolean(candidateId);

  const handleClick = () => {
    if (!candidateId) return;
    const handled = onResolveAction?.({
      candidateId,
      action: gate.action,
      payload: gate.action_payload ?? null,
      gateCode: gate.code,
    });
    if (handled === false || handled === undefined) {
      // Safe fallback: route to the candidate profile so the user always
      // has a way forward, even when the action mapping isn't wired or the
      // backend introduced an action this UI doesn't recognize yet.
      onOpenProfile?.(candidateId);
    }
  };

  return (
    <li
      data-testid={`pipeline-blocked-gate-${gate.code}`}
      className="rounded-lg border border-amber-200/70 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {gate.label}
          </p>
          {gate.description ? (
            <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
              {gate.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!canResolve}
          onClick={handleClick}
          data-testid={`pipeline-blocked-gate-${gate.code}-action`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          {actionLabel}
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

export function PipelineTransitionBlockedModal({
  open,
  candidateId,
  candidateName,
  blocked,
  onClose,
  onResolveAction,
  onOpenProfile,
  onForceSubmit,
  forceSubmitting = false,
  forceError = null,
}: PipelineTransitionBlockedModalProps) {
  const isOpen = open && blocked !== null;
  const [forceReason, setForceReason] = useState("");
  const [showForceError, setShowForceError] = useState<string | null>(null);

  // Reset the form whenever a new blocked transition arrives (or modal closes).
  useEffect(() => {
    if (!isOpen) {
      setForceReason("");
      setShowForceError(null);
    }
  }, [isOpen, blocked]);

  // Keep the inline error in sync with the host-supplied one until the user
  // edits the reason.
  useEffect(() => {
    setShowForceError(forceError ?? null);
  }, [forceError]);

  const trimmedReason = forceReason.trim();
  const reasonValid = trimmedReason.length >= FORCE_REASON_MIN_LENGTH;
  const canForce = Boolean(blocked?.can_force);

  const handleForceClick = async () => {
    if (!blocked || !candidateId) return;
    if (!reasonValid) {
      setShowForceError(`Justificativa precisa ter no mínimo ${FORCE_REASON_MIN_LENGTH} caracteres.`);
      return;
    }
    setShowForceError(null);
    await onForceSubmit?.({
      candidateId,
      targetStage: blocked.target_stage,
      forceReason: trimmedReason,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        className="max-w-xl"
        data-testid="pipeline-transition-blocked-modal"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <DialogTitle>Avanço bloqueado</DialogTitle>
              {candidateName ? (
                <DialogDescription className="mt-0.5">
                  {candidateName}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        {blocked ? (
          <div className="flex flex-col gap-4 text-sm">
            <p
              className="text-slate-700 dark:text-slate-200"
              data-testid="pipeline-blocked-message"
            >
              {blocked.message}
            </p>

            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
              data-testid="pipeline-blocked-stage-summary"
            >
              <span className="uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">
                Etapa atual
              </span>
              <span>{stageLabel(blocked.current_stage)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <span className="uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">
                Tentativa
              </span>
              <span>{stageLabel(blocked.target_stage)}</span>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pendências obrigatórias ({blocked.missing_gates.length})
              </p>
              <ul className="flex flex-col gap-2">
                {blocked.missing_gates.map((gate) => (
                  <GateRow
                    key={gate.code}
                    gate={gate}
                    candidateId={candidateId}
                    onResolveAction={onResolveAction}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </ul>
            </div>

            {canForce ? (
              <section
                data-testid="pipeline-blocked-force-section"
                className="rounded-lg border border-rose-200/70 bg-rose-50/60 p-3 dark:border-rose-900/40 dark:bg-rose-950/30"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-300" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                      Forçar avanço (admin)
                    </p>
                    <p className="mt-0.5 text-xs text-rose-900/80 dark:text-rose-200/80">
                      Use apenas quando a etapa foi concluída fora do sistema ou há
                      autorização excepcional. A ação fica registrada na auditoria com
                      a sua justificativa e as pendências ignoradas.
                    </p>
                  </div>
                </div>

                <label className="mt-3 block text-xs font-semibold text-rose-900 dark:text-rose-200" htmlFor="pipeline-blocked-force-reason">
                  Justificativa (mín. {FORCE_REASON_MIN_LENGTH} caracteres)
                </label>
                <textarea
                  id="pipeline-blocked-force-reason"
                  data-testid="pipeline-blocked-force-reason"
                  value={forceReason}
                  onChange={(event) => {
                    setForceReason(event.target.value);
                    if (showForceError) setShowForceError(null);
                  }}
                  maxLength={FORCE_REASON_MAX_LENGTH}
                  rows={3}
                  disabled={forceSubmitting}
                  placeholder="Ex.: entrevista técnica realizada por telefone — autorização do gestor #1234."
                  className="mt-1 w-full rounded-md border border-rose-300 bg-white p-2 text-sm text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-50"
                />
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className={reasonValid ? "text-slate-500 dark:text-slate-400" : "text-rose-700 dark:text-rose-300"}>
                    {trimmedReason.length}/{FORCE_REASON_MAX_LENGTH}
                  </span>
                  {showForceError ? (
                    <span data-testid="pipeline-blocked-force-error" className="text-rose-700 dark:text-rose-300">
                      {showForceError}
                    </span>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            data-testid="pipeline-blocked-close"
            disabled={forceSubmitting}
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Entendi
          </button>
          {canForce ? (
            <button
              type="button"
              data-testid="pipeline-blocked-force-submit"
              onClick={handleForceClick}
              disabled={forceSubmitting || !reasonValid || !candidateId}
              className="inline-flex h-9 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {forceSubmitting ? "Forçando…" : "Forçar com justificativa"}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
