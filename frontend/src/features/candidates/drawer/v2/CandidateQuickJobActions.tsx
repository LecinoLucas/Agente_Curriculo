import { useEffect, useState } from "react";
import type { Job, PipelineStage } from "../../../../types/domain";
import { STAGE_LABEL } from "../../utils/profile";

const STAGE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: "entry", label: "Entrada" },
  { value: "screening", label: "Triagem" },
  { value: "hr_interview", label: "Entrevista RH" },
  { value: "technical_interview", label: "Entrevista técnica" },
  { value: "final", label: "Decisão" },
  { value: "offer", label: "Oferta" },
  { value: "hired", label: "Contratado / iniciar admissão" },
  { value: "pre_admission", label: "Pré-admissão" },
  { value: "protheus", label: "Integração ERP" },
  { value: "admitted", label: "Admitido" },
  { value: "rejected", label: "Encerrado" },
];

const TERMINAL_STAGES: PipelineStage[] = ["admitted", "rejected"];

interface CandidateQuickJobActionsProps {
  currentStage: PipelineStage | null;
  activeJob: Job | null;
  activeJobId: string | null;
  canTransferCurrentJob: boolean;
  stageSaving: boolean;
  linkSaving: boolean;
  interactionLocked?: boolean;
  onStageChange: (stage: PipelineStage) => Promise<void>;
  onLinkToActiveJob: () => Promise<void>;
  onOpenTransferJob: () => void;
}

export function CandidateQuickJobActions({
  currentStage,
  activeJob,
  activeJobId,
  canTransferCurrentJob,
  stageSaving,
  linkSaving,
  interactionLocked = false,
  onStageChange,
  onLinkToActiveJob,
  onOpenTransferJob,
}: CandidateQuickJobActionsProps) {
  const hasActivePipeline = currentStage !== null;
  const terminalStage = currentStage === "admitted" || currentStage === "rejected";
  const [selectedStage, setSelectedStage] = useState<PipelineStage>(currentStage ?? "entry");
  const [confirmTerminal, setConfirmTerminal] = useState<PipelineStage | null>(null);

  useEffect(() => {
    setSelectedStage(currentStage ?? "entry");
    setConfirmTerminal(null);
  }, [currentStage, activeJobId]);

  async function handleMoveStage() {
    if (TERMINAL_STAGES.includes(selectedStage)) {
      setConfirmTerminal(selectedStage);
    } else {
      await onStageChange(selectedStage);
      setSelectedStage(currentStage ?? "entry");
    }
  }

  async function handleConfirmTerminal() {
    if (!confirmTerminal) return;
    await onStageChange(confirmTerminal);
    setConfirmTerminal(null);
  }

  return (
    <div className="shrink-0 space-y-2 border-t border-border/30 px-5 py-3">
      {/* Link to active job: only when candidate is not in the job */}
      {!hasActivePipeline && activeJobId && activeJob && (
        <button
          type="button"
          onClick={() => void onLinkToActiveJob()}
          disabled={linkSaving || interactionLocked}
          className="w-full rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
        >
          {linkSaving ? "Adicionando…" : `Adicionar a "${activeJob.title}"`}
        </button>
      )}

      {/* Stage selector: only when candidate is in pipeline */}
      {hasActivePipeline && !terminalStage && (
        <div className="flex items-center gap-2">
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value as PipelineStage)}
            disabled={stageSaving || interactionLocked || confirmTerminal !== null}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text disabled:opacity-50"
          >
            {STAGE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleMoveStage()}
            disabled={stageSaving || selectedStage === currentStage || interactionLocked || confirmTerminal !== null}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            Mover
          </button>
        </div>
      )}

      {/* Terminal confirm (inline, compact) */}
      {confirmTerminal && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5">
          <p className="text-xs font-semibold text-rose-900">
            Confirmar: {STAGE_LABEL[confirmTerminal]}?
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => void handleConfirmTerminal()}
              disabled={stageSaving || interactionLocked}
              className="flex-1 rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {stageSaving ? "Confirmando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmTerminal(null)}
              disabled={stageSaving || interactionLocked}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Job actions */}
      {canTransferCurrentJob ? (
        <button
          type="button"
          onClick={onOpenTransferJob}
          disabled={interactionLocked}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition hover:bg-surface-muted disabled:opacity-50"
        >
          ↔ Transferir
        </button>
      ) : (
        currentStage !== null && currentStage !== "rejected" && currentStage !== "admitted" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <p className="text-xs font-semibold text-amber-900">Transferência bloqueada</p>
            <p className="mt-1 text-xs text-amber-700">
              Este candidato já avançou no processo. Reprove ou encerre o vínculo atual antes de movê-lo para outra vaga.
            </p>
          </div>
        )
      )}
    </div>
  );
}
