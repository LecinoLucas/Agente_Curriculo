import type { PipelineStage } from "../../../../types/domain";
import { BarChart3, Check, X } from "lucide-react";

interface CandidateQuickActionsProps {
  onApprove: () => void;
  onReject: () => void;
  onViewAnalysis: () => void;
  currentStage: PipelineStage | null;
  pendingAction?: "approve" | "reject" | null;
  isLoading?: boolean;
}

export function CandidateQuickActions({
  onApprove,
  onReject,
  onViewAnalysis,
  currentStage,
  pendingAction = null,
  isLoading = false,
}: CandidateQuickActionsProps) {
  const isApproved = currentStage === "hired";
  const isRejected = currentStage === "rejected";

  return (
    <div className="shrink-0 border-t border-[hsl(var(--border))]/30 bg-[hsl(var(--surface))] px-5 py-3">
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={onApprove}
          disabled={isLoading || isApproved}
          className={[
            "flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold transition disabled:opacity-50",
            isApproved
              ? "border-emerald-300 bg-emerald-100 text-emerald-950 shadow-sm"
              : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
          ].join(" ")}
        >
          <Check className="h-4 w-4" />
          {pendingAction === "approve" ? "Aprovando…" : isApproved ? "Aprovado" : "Aprovar"}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={isLoading || isRejected}
          className={[
            "flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold transition disabled:opacity-50",
            isRejected
              ? "border-rose-300 bg-rose-100 text-rose-950 shadow-sm"
              : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100",
          ].join(" ")}
        >
          <X className="h-4 w-4" />
          {pendingAction === "reject" ? "Rejeitando…" : isRejected ? "Rejeitado" : "Rejeitar"}
        </button>
        <button
          type="button"
          onClick={onViewAnalysis}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/40 px-3.5 py-2.5 text-sm font-semibold text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))]/70 disabled:opacity-50"
        >
          <BarChart3 className="h-4 w-4" />
          Análise
        </button>
      </div>
    </div>
  );
}
