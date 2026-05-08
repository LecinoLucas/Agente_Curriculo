import { type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { StatusPill } from "../../../../components/common/StatusPill";
import type { CandidateOverview, PipelineStage } from "../../../../types/domain";
import type { CandidateState } from "../../pipeline/candidateState";
import { getScoreTone } from "../../utils/scoreFormatting";

const STAGE_LABEL: Record<string, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

function fmtScore(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Math.round(value)}%`;
}

function scoreColorClass(score: number | null | undefined): string {
  const tone = getScoreTone(score);
  if (tone === "high") return "text-[hsl(var(--success))]";
  if (tone === "mid") return "text-[hsl(var(--warning))]";
  if (tone === "low") return "text-[hsl(var(--danger))]";
  return "text-[hsl(var(--text-muted))]";
}

interface CandidateDrawerHeaderProps {
  candidate: CandidateOverview["candidate"] | null | undefined;
  candidateState: CandidateState | null;
  candidateSuggestion: string | null;
  primaryActionLabel: string | null;
  primaryActionLoading: boolean;
  onPrimaryAction: (() => void) | null;
  activeJobLabel: string;
  currentStage: PipelineStage | null;
  isOfficiallyLinked: boolean;
  activeJobCompatibilityScore: number | null;
  linkStatus: string;
  candidateLoading: boolean;
  closeCandidate: () => void;
  onBackToList?: () => void;
  backToListLabel?: string;
}

export function CandidateDrawerHeader({
  candidate,
  candidateState,
  candidateSuggestion,
  primaryActionLabel,
  primaryActionLoading,
  onPrimaryAction,
  activeJobLabel,
  currentStage,
  isOfficiallyLinked,
  activeJobCompatibilityScore,
  linkStatus,
  candidateLoading,
  closeCandidate,
  onBackToList,
  backToListLabel = "Candidatos",
}: CandidateDrawerHeaderProps) {
  return (
    <div className="shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {!candidateLoading && onBackToList ? (
            <button
              type="button"
              onClick={onBackToList}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{backToListLabel}</span>
            </button>
          ) : null}
          {candidateLoading ? (
            <div className="h-5 w-40 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-[hsl(var(--text))]">
                {candidate?.full_name ?? "—"}
              </p>
              {candidateState ? <StatusPill label={candidateState.label} tone={candidateState.tone} /> : null}
            </div>
          )}
          {candidateLoading ? (
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-[hsl(var(--surface-muted))]" />
          ) : (
            <div className="mt-1">
              <p className="truncate text-sm text-[hsl(var(--text-muted))]">
                {[candidate?.email, candidate?.phone].filter(Boolean).join(" · ") || "Sem contato informado"}
              </p>
              {candidateSuggestion ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-[hsl(var(--text-muted))]">{candidateSuggestion}</p>
                  {primaryActionLabel && onPrimaryAction ? (
                    <button
                      type="button"
                      onClick={onPrimaryAction}
                      disabled={primaryActionLoading}
                      className="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
                    >
                      {primaryActionLoading ? "Processando…" : primaryActionLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={closeCandidate}
          className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          aria-label="Fechar painel"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <HeaderFact label="Vaga atual" value={activeJobLabel} />
        <HeaderFact
          label="Etapa atual"
          value={
            currentStage
              ? STAGE_LABEL[currentStage] ?? currentStage
              : isOfficiallyLinked
                ? "Sem etapa no pipeline"
                : "Não vinculado"
          }
        />
        <HeaderFact
          label="Compatibilidade Contextual"
          value={fmtScore(activeJobCompatibilityScore)}
          valueClassName={scoreColorClass(activeJobCompatibilityScore)}
        />
        <HeaderFact label="Status do vínculo" value={linkStatus} />
      </div>
    </div>
  );
}

function HeaderFact({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </p>
      <div className={["mt-1 text-sm font-medium text-[hsl(var(--text))]", valueClassName ?? ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}
