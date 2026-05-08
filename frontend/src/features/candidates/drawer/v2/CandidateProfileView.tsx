import { useEffect, useState } from "react";
import type { CandidateOverview, AnalysisResult, JobRankingEntry, PipelineStage, Job } from "../../../../types/domain";
import type { ScoreExplanationResponse } from "../../../../services/scoreExplanationService";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { CandidateProfileHeader } from "./CandidateProfileHeader";
import { CandidateDecisionPanel } from "./CandidateDecisionPanel";
import { CandidateQuickActions } from "./CandidateQuickActions";
import { CandidateActionPanel } from "./CandidateActionPanel";
import { CandidateQuickJobActions } from "./CandidateQuickJobActions";
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
  onAdvance: () => void;
  onTerminate: () => void;
  onViewAnalysis: () => void;
  onTabChange: (tab: TabKey) => void;
  onNavigateToFull?: () => void;
  onBackToList?: () => void;
  backToListLabel?: string;
  // Action panel props
  activeJob?: Job | null;
  activeJobId?: string | null;
  canTransferCurrentJob?: boolean;
  stageSaving?: boolean;
  linkSaving?: boolean;
  onStageChange?: (stage: PipelineStage) => Promise<void>;
  onLinkToActiveJob?: () => Promise<void>;
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
  onAdvance,
  onTerminate,
  onViewAnalysis,
  onTabChange,
  onNavigateToFull,
  onBackToList,
  backToListLabel,
  activeJob = null,
  activeJobId = null,
  canTransferCurrentJob = false,
  stageSaving = false,
  linkSaving = false,
  onStageChange,
  onLinkToActiveJob,
  onOpenTransferJob,
  children,
}: CandidateProfileViewProps) {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [pendingQuickAction, setPendingQuickAction] = useState<"advance" | "terminate" | null>(null);
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);
  const [isFeedbackFresh, setIsFeedbackFresh] = useState(false);

  useEffect(() => {
    if (!actionFeedback) return;
    setIsFeedbackFresh(true);
    const timeoutId = window.setTimeout(() => setIsFeedbackFresh(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [actionFeedback?.id]);

  const handleAdvance = async () => {
    if (interactionLocked) return;
    setPendingQuickAction("advance");
    setIsActionLoading(true);
    try {
      await Promise.resolve(onAdvance());
    } finally {
      setPendingQuickAction(null);
      setIsActionLoading(false);
    }
  };

  const handleTerminate = async () => {
    if (interactionLocked) return;
    setPendingQuickAction("terminate");
    setIsActionLoading(true);
    try {
      await Promise.resolve(onTerminate());
    } finally {
      setPendingQuickAction(null);
      setIsActionLoading(false);
    }
  };

  return (
    <div
      className={[
        "flex flex-col bg-[hsl(var(--surface))]",
        compact ? "h-auto overflow-visible" : "h-full min-h-0 overflow-hidden",
      ].join(" ")}
    >
      {/* Header with candidate identity */}
      <CandidateProfileHeader
        candidate={candidate}
        currentStage={currentStage}
        activeJobLabel={activeJobLabel}
        hasActiveJob={hasActiveJob}
        compatibilityScore={activeJobCompatibilityScore}
        aiScore={aiScore}
        aiStatus={aiStatus}
        isLoading={isLoading}
        onClose={onClose}
        onNavigateToFull={onNavigateToFull}
        onBackToList={onBackToList}
        backToListLabel={backToListLabel}
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
          compact={compact}
        />
      )}

      {/* Quick actions */}
      {!isLoading && (
        <CandidateQuickActions
          onAdvance={handleAdvance}
          onTerminate={handleTerminate}
          onViewAnalysis={compact && onNavigateToFull ? onNavigateToFull : onViewAnalysis}
          currentStage={currentStage}
          pendingAction={pendingQuickAction}
          isLoading={isActionLoading || interactionLocked}
        />
      )}

      {/* Job actions — Quick View compact layout */}
      {!isLoading && compact && onStageChange && onLinkToActiveJob && onOpenTransferJob && (
        <CandidateQuickJobActions
          currentStage={currentStage}
          activeJob={activeJob}
          activeJobId={activeJobId}
          canTransferCurrentJob={canTransferCurrentJob}
          stageSaving={stageSaving}
          linkSaving={linkSaving}
          interactionLocked={interactionLocked}
          onStageChange={onStageChange}
          onLinkToActiveJob={onLinkToActiveJob}
          onOpenTransferJob={onOpenTransferJob}
        />
      )}

      {/* Additional actions panel — only in Full Workspace mode */}
      {!isLoading && !compact && onStageChange && onLinkToActiveJob && onOpenTransferJob && (
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
          onOpenTransferJob={onOpenTransferJob}
          isOpen={isActionPanelOpen}
          onToggle={() => setIsActionPanelOpen(!isActionPanelOpen)}
        />
      )}

      {/* Navigation tabs and content — only in Full Workspace mode */}
      {!isLoading && !compact && (
        <>
          <CandidateProfileNavigation
            activeTab={activeTab}
            onChange={onTabChange}
          />
          <CandidateProfileContent isLoading={isLoadingContent}>
            {children}
          </CandidateProfileContent>
        </>
      )}
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
