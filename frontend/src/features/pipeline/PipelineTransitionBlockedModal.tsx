import { AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";

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
};

export type GateAction = {
  candidateId: string;
  action: PipelineGateActionCode;
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
  const actionLabel = GATE_ACTION_LABEL[gate.action] ?? "Abrir perfil";
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
      // has a way forward, even when the action mapping isn't wired.
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
}: PipelineTransitionBlockedModalProps) {
  const isOpen = open && blocked !== null;

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
          </div>
        ) : null}

        <DialogFooter>
          {/* can_force is intentionally not surfaced in this phase: the
              backend returns can_force=false and the spec defers admin
              force-advance to a later phase. */}
          <button
            type="button"
            onClick={onClose}
            data-testid="pipeline-blocked-close"
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Entendi
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
