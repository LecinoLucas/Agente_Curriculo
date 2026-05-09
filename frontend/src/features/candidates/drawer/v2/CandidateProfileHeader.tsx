import type { CandidateOverview, PipelineStage } from "../../../../types/domain";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { deriveScoreSemantics } from "../../utils/scoreSemantics";

interface CandidateProfileHeaderProps {
  candidate: CandidateOverview["candidate"] | null | undefined;
  currentStage: PipelineStage | null;
  activeJobLabel: string;
  hasActiveJob: boolean;
  compatibilityScore: number | null;
  aiScore: number | null;
  aiStatus: string | null | undefined;
  isLoading: boolean;
  onClose: () => void;
  onNavigateToFull?: () => void;
  onBackToList?: () => void;
  backToListLabel?: string;
}

export function CandidateProfileHeader({
  candidate,
  currentStage,
  activeJobLabel,
  hasActiveJob,
  compatibilityScore,
  aiScore,
  aiStatus,
  isLoading,
  onClose,
  onNavigateToFull,
  onBackToList,
  backToListLabel = "Candidatos",
}: CandidateProfileHeaderProps) {
  const initials = candidate?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "—";

  const semantics = deriveScoreSemantics({
    finalScore: compatibilityScore,
    aiStatus,
    hasActiveJob,
  });

  const scoreColor =
    semantics.statusTone === "high"
      ? "text-[hsl(var(--success))]"
      : semantics.statusTone === "mid"
        ? "text-[hsl(var(--warning))]"
        : semantics.statusTone === "low"
        ? "text-[hsl(var(--danger))]"
          : "text-[hsl(var(--text-muted))]";

  const stageBadgeClass =
    currentStage === "hired"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : currentStage === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 text-[hsl(var(--text-muted))]";

  return (
    <div className="shrink-0 border-b border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-3.5">
          {/* Avatar */}
          {isLoading ? (
            <div className="h-12 w-12 animate-pulse rounded-2xl bg-[hsl(var(--surface-muted))]" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-sm font-bold text-white shadow-sm">
              {initials}
            </div>
          )}

          {/* Info */}
          <div className="min-w-0 pt-0.5">
            {isLoading ? (
              <>
                <div className="mb-2 h-6 w-40 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
                <div className="h-4 w-32 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
              </>
            ) : (
              <>
                {onBackToList ? (
                  <button
                    type="button"
                    onClick={onBackToList}
                    className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>{backToListLabel}</span>
                  </button>
                ) : null}
                <h1 className="truncate text-lg font-semibold tracking-[-0.01em] text-[hsl(var(--text))]">
                  {candidate?.full_name ?? "—"}
                </h1>
                <p className="mt-0.5 truncate text-sm text-[hsl(var(--text-muted))]">
                  {activeJobLabel || "Sem vaga"}
                </p>
                {!hasActiveJob && activeJobLabel && activeJobLabel !== "Não vinculado" ? (
                  <p className="mt-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                    Última vaga vinculada
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-300 ${stageBadgeClass}`}>
                    {currentStage ? STAGE_LABEL[currentStage] ?? currentStage : "Sem etapa"}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scoreColor} border-current/15 bg-current/5`}>
                    {semantics.primaryLabel} {semantics.primaryDisplay}
                  </span>
                  {semantics.secondaryDisplay ? (
                    <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                      {semantics.secondaryLabel} {semantics.secondaryDisplay}
                    </span>
                  ) : null}
                  {semantics.statusLabel ? (
                    <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                      {semantics.statusLabel}
                    </span>
                  ) : null}
                  <span className="max-w-[260px] truncate text-[11px] text-[hsl(var(--text-muted))]">
                    {candidate?.email ?? "Sem e-mail"}
                  </span>
                </div>
                {onNavigateToFull && (
                  <button
                    type="button"
                    onClick={onNavigateToFull}
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--primary))] transition hover:underline"
                  >
                    Ver perfil completo
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          aria-label="Fechar painel"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "RH",
  technical_interview: "Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};
