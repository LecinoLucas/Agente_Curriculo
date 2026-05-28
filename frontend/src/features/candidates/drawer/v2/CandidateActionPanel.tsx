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

const DANGEROUS_STAGES: PipelineStage[] = ["admitted", "rejected"];

interface CandidateActionPanelProps {
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
  isOpen: boolean;
  onToggle: () => void;
}

export function CandidateActionPanel({
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
  isOpen,
  onToggle,
}: CandidateActionPanelProps) {
  const [selectedStage, setSelectedStage] = useState<PipelineStage>("entry");
  const [confirmStage, setConfirmStage] = useState<PipelineStage | null>(null);

  useEffect(() => {
    setSelectedStage(currentStage ?? "entry");
    setConfirmStage(null);
  }, [currentStage, activeJobId]);

  async function submitStage(nextStage: PipelineStage) {
    await onStageChange(nextStage);
    setConfirmStage(null);
  }

  const hasActivePipeline = currentStage !== null;
  const terminalStage = currentStage === "admitted" || currentStage === "rejected";

  return (
    <div className="border-t border-border/20">
      <button
        type="button"
        onClick={onToggle}
        disabled={interactionLocked}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-surface-muted/30"
      >
        <h3 className="font-semibold text-text">Ações Adicionais</h3>
        <span className={`text-sm font-semibold text-text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border/20 px-6 py-4 space-y-4">
          {/* Link to active job */}
          {activeJobId && activeJob && !hasActivePipeline ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Fora da vaga ativa</p>
              <p className="mt-1 text-xs text-amber-700">
                Adicione à vaga para criar etapa inicial no kanban.
              </p>
              <button
                type="button"
                onClick={() => void onLinkToActiveJob()}
                disabled={linkSaving}
                className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
              >
                {linkSaving ? "Adicionando…" : "Adicionar à vaga"}
              </button>
            </div>
          ) : null}

          {/* Change stage */}
          {hasActivePipeline && !terminalStage ? (
            <div>
              <label className="block mb-2 text-sm font-semibold text-text">
                Mover para etapa
              </label>
              <div className="space-y-2">
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value as PipelineStage)}
                  disabled={stageSaving || interactionLocked}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text disabled:opacity-50"
                >
                  {STAGE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                {confirmStage && (
                  <div className={
                    DANGEROUS_STAGES.includes(confirmStage)
                      ? "rounded-lg border border-red-200 bg-red-50 p-2.5"
                      : "rounded-lg border border-blue-200 bg-blue-50 p-2.5"
                  }>
                    <p className={`text-xs font-semibold ${
                      DANGEROUS_STAGES.includes(confirmStage)
                        ? "text-red-900"
                        : "text-blue-900"
                    }`}>
                      Confirmar mudança para {STAGE_LABEL[confirmStage]}?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void submitStage(confirmStage)}
                        disabled={stageSaving || interactionLocked}
                        className={[
                          "flex-1 rounded-lg px-2 py-1 text-xs font-medium text-white transition disabled:opacity-50",
                          DANGEROUS_STAGES.includes(confirmStage)
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-blue-600 hover:bg-blue-700",
                        ].join(" ")}
                      >
                        {stageSaving ? "Salvando…" : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmStage(null)}
                        disabled={stageSaving || interactionLocked}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {!confirmStage && selectedStage !== currentStage && (
                  <button
                    type="button"
                    onClick={() => setConfirmStage(selectedStage)}
                    disabled={stageSaving || interactionLocked}
                    className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    Mover para {STAGE_LABEL[selectedStage]}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {terminalStage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">
                {currentStage === "admitted" ? "Admissão concluída" : "Processo encerrado"}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {currentStage === "admitted"
                  ? "A etapa final permanece vinculada à vaga no histórico da pipeline."
                  : "Para alterar a etapa, reconsidere o candidato no pipeline."}
              </p>
            </div>
          ) : null}

          {/* Job actions */}
          {canTransferCurrentJob ? (
            <button
              type="button"
              onClick={onOpenTransferJob}
              disabled={interactionLocked}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:bg-surface-muted disabled:opacity-50"
            >
              ↔️ Transferir para outra vaga
            </button>
          ) : (
            currentStage !== null && currentStage !== "rejected" && currentStage !== "admitted" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Transferência bloqueada</p>
                <p className="mt-1 text-xs text-amber-700">
                  Este candidato já avançou no processo. Reprove ou encerre o vínculo atual antes de movê-lo para outra vaga.
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
