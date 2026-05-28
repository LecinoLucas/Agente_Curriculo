import { useEffect, useState } from "react";
import type { PipelineStage } from "../../../../types/domain";
import { ArrowRight, BarChart3, X } from "lucide-react";

interface CandidateQuickActionsProps {
  onAdvance: () => void;
  onTerminate: () => void;
  onViewAnalysis: () => void;
  currentStage: PipelineStage | null;
  pendingAction?: "advance" | "terminate" | null;
  isLoading?: boolean;
}

const NEXT_STAGE_LABEL: Partial<Record<PipelineStage, string>> = {
  entry: "Avançar para Triagem",
  screening: "Avançar para Entrevista RH",
  hr_interview: "Avançar para Entrevista técnica",
  technical_interview: "Avançar para Decisão",
  final: "Contratar",
  offer: "Contratar",
  hired: "Avançar para Pré-admissão",
  pre_admission: "Avançar para Integração ERP",
  protheus: "Mover para Admitido",
};

export function CandidateQuickActions({
  onAdvance,
  onTerminate,
  onViewAnalysis,
  currentStage,
  pendingAction = null,
  isLoading = false,
}: CandidateQuickActionsProps) {
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const hasProgression = currentStage !== null && Boolean(NEXT_STAGE_LABEL[currentStage]);
  const advanceLabel = currentStage ? NEXT_STAGE_LABEL[currentStage] : null;
  const isHireStage = currentStage === "final" || currentStage === "offer";

  useEffect(() => {
    setShowTerminateConfirm(false);
  }, [currentStage]);

  if (!hasProgression) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-border/30 bg-surface px-5 py-3 space-y-2">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onAdvance}
          disabled={isLoading}
          className={[
            "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50",
            isHireStage
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-blue-600 hover:bg-blue-700",
          ].join(" ")}
        >
          <ArrowRight className="h-4 w-4" />
          {pendingAction === "advance" ? (isHireStage ? "Contratando…" : "Avançando…") : advanceLabel}
        </button>

        <button
          type="button"
          onClick={() => setShowTerminateConfirm(true)}
          disabled={isLoading || showTerminateConfirm}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          {pendingAction === "terminate" ? "Reprovando…" : "Reprovar"}
        </button>

        <button
          type="button"
          onClick={onViewAnalysis}
          disabled={isLoading}
          title="Ver análise"
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-text-muted transition hover:bg-surface-muted/70 disabled:opacity-50"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </button>
      </div>

      {showTerminateConfirm && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-rose-900">Confirmar reprovação?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { setShowTerminateConfirm(false); onTerminate(); }}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setShowTerminateConfirm(false)}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
