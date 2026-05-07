import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";

import { CandidateActionPanel } from "../v2/CandidateActionPanel";
import { CandidateDrawerHeader } from "../layout/CandidateDrawerHeader";
import { deriveScoreSemantics } from "../../utils/scoreSemantics";
import { scoreColorClass } from "../hooks/useCandidateDecision";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import type { CandidateOverview, Job, PipelineStage } from "../../../../types/domain";
import type { CandidateState } from "../../../pipeline/candidateState";

export type CandidateDrawerV1TabKey = "overview" | "score" | "documents";

export type CandidateActionFeedback = {
  id: number;
  title: string;
  detail?: string | null;
  tone: "success" | "danger" | "info";
  pending?: boolean;
};

interface CandidateDrawerV1Props {
  candidate: CandidateOverview["candidate"] | null | undefined;
  candidateState: CandidateState | null;
  currentStage: PipelineStage | null;
  activeJobLabel: string;
  activeJobCompatibilityScore: number | null;
  hasActiveJob: boolean;
  aiScore: number | null;
  aiStatus: string | null | undefined;
  scoreExplanation: ScoreExplanationResponse | null;
  linkStatus: string;
  isLoading: boolean;
  activeTab: CandidateDrawerV1TabKey;
  actionFeedback?: CandidateActionFeedback | null;
  interactionLocked?: boolean;
  activeJob?: Job | null;
  activeJobId?: string | null;
  canTransferCurrentJob?: boolean;
  stageSaving?: boolean;
  linkSaving?: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenDocuments: () => void;
  onTabChange: (tab: CandidateDrawerV1TabKey) => void;
  onStageChange?: (stage: PipelineStage) => Promise<void>;
  onLinkToActiveJob?: () => Promise<void>;
  onOpenAddJob?: () => void;
  onOpenTransferJob?: () => void;
  children?: ReactNode;
}

type RecommendationTone = "success" | "warning" | "danger" | "neutral";

const TABS: { key: CandidateDrawerV1TabKey; label: string }[] = [
  { key: "overview", label: "Resumo" },
  { key: "score", label: "Score & Análise" },
  { key: "documents", label: "Documentos" },
];

export function CandidateDrawerV1({
  candidate,
  candidateState,
  currentStage,
  activeJobLabel,
  activeJobCompatibilityScore,
  hasActiveJob,
  aiScore,
  aiStatus,
  scoreExplanation,
  linkStatus,
  isLoading,
  activeTab,
  actionFeedback = null,
  interactionLocked = false,
  activeJob = null,
  activeJobId = null,
  canTransferCurrentJob = false,
  stageSaving = false,
  linkSaving = false,
  onClose,
  onApprove,
  onReject,
  onOpenDocuments,
  onTabChange,
  onStageChange,
  onLinkToActiveJob,
  onOpenAddJob,
  onOpenTransferJob,
  children,
}: CandidateDrawerV1Props) {
  const [pendingQuickAction, setPendingQuickAction] = useState<"approve" | "reject" | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);
  const [isFeedbackFresh, setIsFeedbackFresh] = useState(false);

  useEffect(() => {
    if (!actionFeedback) return;
    setIsFeedbackFresh(true);
    const timeoutId = window.setTimeout(() => setIsFeedbackFresh(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [actionFeedback?.id]);

  const semantics = deriveScoreSemantics({
    activeJobMatchScore: activeJobCompatibilityScore,
    aiScore,
    aiStatus,
    hasActiveJob,
    confidenceScore:
      scoreExplanation?.confidence_score ??
      scoreExplanation?.breakdown?.ai_adjustment?.score ??
      null,
  });

  const recommendation = getRecommendation(currentStage, candidateState, semantics);
  const approveDisabled = interactionLocked || currentStage === "hired" || currentStage === null;
  const rejectDisabled = interactionLocked || currentStage === "rejected" || currentStage === null;

  const handleApprove = async () => {
    if (approveDisabled) return;
    setPendingQuickAction("approve");
    setIsActionLoading(true);
    try {
      await Promise.resolve(onApprove());
    } finally {
      setPendingQuickAction(null);
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (rejectDisabled) return;
    setPendingQuickAction("reject");
    setIsActionLoading(true);
    try {
      await Promise.resolve(onReject());
    } finally {
      setPendingQuickAction(null);
      setIsActionLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--surface))]">
      <CandidateDrawerHeader
        candidate={candidate}
        candidateState={candidateState}
        candidateSuggestion={null}
        primaryActionLabel={null}
        primaryActionLoading={false}
        onPrimaryAction={null}
        activeJobLabel={activeJobLabel}
        currentStage={currentStage}
        isOfficiallyLinked={hasActiveJob}
        activeJobCompatibilityScore={activeJobCompatibilityScore}
        linkStatus={linkStatus}
        candidateLoading={isLoading}
        closeCandidate={onClose}
      />

      {!isLoading && actionFeedback ? (
        <div className="px-5 pt-4">
          <ActionFeedbackBanner feedback={actionFeedback} isFresh={isFeedbackFresh} />
        </div>
      ) : null}

      {!isLoading ? (
        <section className="shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--text-muted))]">
                Estado atual
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={["rounded-full px-2.5 py-1 text-xs font-semibold", recommendation.badgeClass].join(" ")}>
                  {recommendation.label}
                </span>
                {semantics.statusLabel && semantics.statusLabel !== recommendation.label ? (
                  <span className={["rounded-full px-2.5 py-1 text-xs font-medium", getSecondaryBadgeClass(semantics.statusTone)].join(" ")}>
                    {semantics.statusLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[hsl(var(--text-muted))]">
                {recommendation.detail}
              </p>
            </div>

            <div className="grid min-w-[220px] gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] p-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                  {semantics.primaryLabel}
                </p>
                <p className={["mt-1 text-2xl font-semibold tabular-nums", scoreColorClass(semantics.primaryScore)].join(" ")}>
                  {semantics.primaryDisplay}
                </p>
              </div>
              {semantics.secondaryLabel && semantics.secondaryDisplay ? (
                <div className="border-t border-[hsl(var(--border))] pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                    {semantics.secondaryLabel}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[hsl(var(--text))]">
                    {semantics.secondaryDisplay}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={approveDisabled}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pendingQuickAction === "approve" || (isActionLoading && currentStage !== "hired")
                ? "Aprovando…"
                : currentStage === "hired"
                  ? "Aprovado"
                  : "Aprovar"}
            </button>
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={rejectDisabled}
              className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pendingQuickAction === "reject" || (isActionLoading && currentStage !== "rejected")
                ? "Rejeitando…"
                : currentStage === "rejected"
                  ? "Rejeitado"
                  : "Reprovar"}
            </button>
            <button
              type="button"
              onClick={onOpenDocuments}
              disabled={interactionLocked}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Documentos e reanálise
            </button>
          </div>
        </section>
      ) : null}

      {!isLoading && onStageChange && onLinkToActiveJob && onOpenAddJob && onOpenTransferJob ? (
        <CandidateActionPanel
          currentStage={currentStage}
          activeJob={activeJob}
          activeJobId={activeJobId}
          canTransferCurrentJob={canTransferCurrentJob}
          stageSaving={stageSaving}
          linkSaving={linkSaving}
          interactionLocked={interactionLocked}
          onStageChange={onStageChange}
          onLinkToActiveJob={onLinkToActiveJob}
          onOpenAddJob={onOpenAddJob}
          onOpenTransferJob={onOpenTransferJob}
          isOpen={isActionPanelOpen}
          onToggle={() => setIsActionPanelOpen((current) => !current)}
        />
      ) : null}

      {!isLoading ? (
        <div className="shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-5">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={[
                  "border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                    : "border-transparent text-[hsl(var(--text-muted))] hover:border-[hsl(var(--border))] hover:text-[hsl(var(--text))]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--surface-muted))]/35">{children}</div>
    </div>
  );
}

function getRecommendation(
  currentStage: PipelineStage | null,
  candidateState: CandidateState | null,
  semantics: ReturnType<typeof deriveScoreSemantics>,
): { label: string; detail: string; tone: RecommendationTone; badgeClass: string } {
  if (currentStage === "hired") {
    return {
      label: "Aprovado",
      detail: "O candidato está em estado terminal de contratação para a vaga ativa.",
      tone: "success",
      badgeClass: getBadgeClass("success"),
    };
  }

  if (currentStage === "rejected") {
    return {
      label: "Reprovado",
      detail: "O candidato está em estado terminal de reprovação para a vaga ativa.",
      tone: "danger",
      badgeClass: getBadgeClass("danger"),
    };
  }

  if (semantics.state === "inconclusive") {
    return {
      label: "Análise inconclusiva",
      detail: semantics.contextLine,
      tone: "danger",
      badgeClass: getBadgeClass("danger"),
    };
  }

  if (semantics.state === "review") {
    return {
      label: "Revisão recomendada",
      detail: semantics.contextLine,
      tone: "warning",
      badgeClass: getBadgeClass("warning"),
    };
  }

  if (semantics.state === "awaiting_match") {
    return {
      label: semantics.statusLabel ?? "Aguardando match",
      detail: semantics.contextLine,
      tone: "neutral",
      badgeClass: getBadgeClass("neutral"),
    };
  }

  if (semantics.state === "no_active_job") {
    return {
      label: "Aguardando vaga",
      detail: semantics.contextLine,
      tone: "neutral",
      badgeClass: getBadgeClass("neutral"),
    };
  }

  if (semantics.primaryScore != null && semantics.primaryScore >= 75) {
    return {
      label: "Recomendado avançar",
      detail: semantics.contextLine,
      tone: "success",
      badgeClass: getBadgeClass("success"),
    };
  }

  if (semantics.primaryScore != null && semantics.primaryScore >= 40) {
    return {
      label: "Avaliar com atenção",
      detail: semantics.detailLine ?? semantics.contextLine,
      tone: "warning",
      badgeClass: getBadgeClass("warning"),
    };
  }

  if (semantics.primaryScore != null) {
    return {
      label: "Baixo match para a vaga",
      detail: semantics.detailLine ?? semantics.contextLine,
      tone: "danger",
      badgeClass: getBadgeClass("danger"),
    };
  }

  return {
    label: candidateState?.label ?? "Aguardando análise",
    detail: semantics.detailLine ?? semantics.contextLine,
    tone: "neutral",
    badgeClass: getBadgeClass("neutral"),
  };
}

function getBadgeClass(tone: RecommendationTone): string {
  if (tone === "success") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  if (tone === "warning") return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  if (tone === "danger") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function getSecondaryBadgeClass(tone: ReturnType<typeof deriveScoreSemantics>["statusTone"]): string {
  if (tone === "high") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (tone === "mid") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (tone === "low") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function ActionFeedbackBanner({
  feedback,
  isFresh,
}: {
  feedback: CandidateActionFeedback;
  isFresh: boolean;
}) {
  const colorClass =
    feedback.tone === "success"
      ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
      : feedback.tone === "danger"
        ? "border-rose-200 bg-rose-50/90 text-rose-950"
        : "border-sky-200 bg-sky-50/90 text-sky-950";

  const Icon =
    feedback.pending
      ? LoaderCircle
      : feedback.tone === "success"
        ? CheckCircle2
        : feedback.tone === "danger"
          ? AlertTriangle
          : Sparkles;

  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 transition-all duration-300",
        colorClass,
        isFresh ? "shadow-sm ring-1 ring-current/10" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          <Icon className={["h-4 w-4", feedback.pending ? "animate-spin" : ""].join(" ")} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{feedback.title}</p>
          {feedback.detail ? <p className="mt-1 text-xs opacity-80">{feedback.detail}</p> : null}
        </div>
      </div>
    </div>
  );
}
