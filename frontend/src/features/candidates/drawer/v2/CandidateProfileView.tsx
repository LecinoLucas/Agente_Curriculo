import { useEffect, useState } from "react";
import type { CandidateOverview, AnalysisResult, JobRankingEntry, PipelineStage, Job } from "../../../../types/domain";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { CandidateProfileHeader } from "./CandidateProfileHeader";
import { CandidateDecisionPanel } from "./CandidateDecisionPanel";
import { CandidateQuickActions } from "./CandidateQuickActions";
import { CandidateActionPanel } from "./CandidateActionPanel";
import { CandidateProfileNavigation, type TabKey } from "./CandidateProfileNavigation";
import { CandidateProfileContent } from "./CandidateProfileContent";

export type CandidateActionFeedback = {
  id: number;
  title: string;
  detail?: string | null;
  tone: "success" | "danger" | "info";
  pending?: boolean;
};

interface CandidateProfileViewProps {
  candidate: CandidateOverview["candidate"] | null | undefined;
  currentStage: PipelineStage | null;
  activeJobLabel: string;
  activeJobCompatibilityScore: number | null;
  hasActiveJob: boolean;
  aiScore: number | null;
  aiStatus: string | null | undefined;
  analysisResult: AnalysisResult | null;
  rankingEntry: JobRankingEntry | null;
  scoreExplanation: ScoreExplanationResponse | null;
  isLoading: boolean;
  isLoadingContent?: boolean;
  activeTab?: TabKey;
  actionFeedback?: CandidateActionFeedback | null;
  interactionLocked?: boolean;
  compact?: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onViewAnalysis: () => void;
  onTabChange: (tab: TabKey) => void;
  onNavigateToFull?: () => void;
  // Action panel props
  activeJob?: Job | null;
  activeJobId?: string | null;
  canTransferCurrentJob?: boolean;
  stageSaving?: boolean;
  linkSaving?: boolean;
  onStageChange?: (stage: PipelineStage) => Promise<void>;
  onLinkToActiveJob?: () => Promise<void>;
  onOpenAddJob?: () => void;
  onOpenTransferJob?: () => void;
  children?: ReactNode;
}

export function CandidateProfileView({
  candidate,
  currentStage,
  activeJobLabel,
  activeJobCompatibilityScore,
  hasActiveJob,
  aiScore,
  aiStatus,
  analysisResult,
  rankingEntry,
  scoreExplanation,
  isLoading,
  isLoadingContent = false,
  activeTab = "overview",
  actionFeedback = null,
  interactionLocked = false,
  compact = false,
  onClose,
  onApprove,
  onReject,
  onViewAnalysis,
  onTabChange,
  onNavigateToFull,
  activeJob = null,
  activeJobId = null,
  canTransferCurrentJob = false,
  stageSaving = false,
  linkSaving = false,
  onStageChange,
  onLinkToActiveJob,
  onOpenAddJob,
  onOpenTransferJob,
  children,
}: CandidateProfileViewProps) {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [pendingQuickAction, setPendingQuickAction] = useState<"approve" | "reject" | null>(null);
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);
  const [isFeedbackFresh, setIsFeedbackFresh] = useState(false);

  useEffect(() => {
    if (!actionFeedback) return;
    setIsFeedbackFresh(true);
    const timeoutId = window.setTimeout(() => setIsFeedbackFresh(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [actionFeedback?.id]);

  const handleApprove = async () => {
    if (interactionLocked) return;
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
    if (interactionLocked) return;
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
      {/* Header with candidate identity */}
      <CandidateProfileHeader
        candidate={candidate}
        currentStage={currentStage}
        activeJobLabel={activeJobLabel}
        compatibilityScore={activeJobCompatibilityScore}
        aiScore={aiScore}
        aiStatus={aiStatus}
        isLoading={isLoading}
        onClose={onClose}
        onNavigateToFull={onNavigateToFull}
      />

      {!isLoading && actionFeedback ? (
        <div className="px-5 pt-4">
          <ActionFeedbackBanner feedback={actionFeedback} isFresh={isFeedbackFresh} />
        </div>
      ) : null}

      {/* Decision panel - AI first */}
      {!isLoading && (
        <CandidateDecisionPanel
          currentStage={currentStage}
          analysisResult={analysisResult}
          rankingEntry={rankingEntry}
          compatibilityScore={activeJobCompatibilityScore}
          hasActiveJob={hasActiveJob}
          aiScore={aiScore}
          aiStatus={aiStatus}
          scoreExplanation={scoreExplanation}
          onViewAnalysis={onViewAnalysis}
          onOpenAddJob={onOpenAddJob}
        />
      )}

      {/* Quick actions */}
      {!isLoading && (
        <CandidateQuickActions
          onApprove={handleApprove}
          onReject={handleReject}
          onViewAnalysis={onViewAnalysis}
          currentStage={currentStage}
          pendingAction={pendingQuickAction}
          isLoading={isActionLoading || interactionLocked}
        />
      )}

      {/* Additional actions panel — hidden in compact/Quick View mode */}
      {!isLoading && !compact && onStageChange && onLinkToActiveJob && onOpenAddJob && onOpenTransferJob && (
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
          onToggle={() => setIsActionPanelOpen(!isActionPanelOpen)}
        />
      )}

      {/* Navigation tabs */}
      {!isLoading && (
        <CandidateProfileNavigation
          activeTab={activeTab}
          onChange={onTabChange}
        />
      )}

      {/* Content area - temporary for current tabs */}
      <CandidateProfileContent isLoading={isLoadingContent}>
        {children}
      </CandidateProfileContent>
    </div>
  );
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
