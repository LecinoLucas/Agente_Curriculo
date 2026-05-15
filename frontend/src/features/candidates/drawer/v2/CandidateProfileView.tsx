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
import { getLinkCandidateCtaLabel } from "../../utils/jobLinking";
import { CandidateAnalysisStatusCard } from "../components/CandidateAnalysisStatusCard";
import { MoreActionsMenu } from "../components/MoreActionsMenu";
import type { UserRole } from "../utils/getVisibleCandidateTabs";

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
  hasPersistedCompatibilityScore: boolean;
  hasActiveJob: boolean;
  hasResume: boolean;
  aiScore: number | null;
  aiStatus: string | null | undefined;
  analysisResult: AnalysisResult | null;
  rankingEntry: JobRankingEntry | null;
  scoreExplanation: ScoreExplanationResponse | null;
  analysisHighlights?: string[];
  analysisErrorMessage?: string | null;
  extractionStatus?: string | null | undefined;
  isLoading: boolean;
  isLoadingContent?: boolean;
  activeTab?: TabKey;
  showDetailTabs?: boolean;
  actionFeedback?: CandidateActionFeedback | null;
  interactionLocked?: boolean;
  compact?: boolean;
  hasLinkedJobs?: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onTerminate: () => void;
  onViewAnalysis: () => void;
  onEvaluateBetter?: () => void;
  onTabChange: (tab: TabKey) => void;
  onEditCandidate?: () => void;
  onLinkJob?: () => void;
  onStartAnalysis?: () => void;
  onOpenDocuments?: () => void;
  onNavigateToFull?: () => void;
  onBackToList?: () => void;
  backToListLabel?: string;
  analysisActionLabel?: string;
  analysisActionDisabled?: boolean;
  // Action panel props
  activeJob?: Job | null;
  activeJobId?: string | null;
  canTransferCurrentJob?: boolean;
  stageSaving?: boolean;
  linkSaving?: boolean;
  onStageChange?: (stage: PipelineStage) => Promise<void>;
  onLinkToActiveJob?: () => Promise<void>;
  onOpenTransferJob?: () => void;
  // Context for tab visibility
  pipelineStatus?: string | null;
  activeJobDecision?: string | null;
  hasBehavioralAssessment?: boolean;
  hasInterviews?: boolean;
  hasScorecard?: boolean;
  hasHiringDecision?: boolean;
  hasPreAdmission?: boolean;
  hasAdmissionPackage?: boolean;
  hasCollaboration?: boolean;
  userRole?: UserRole;
  children?: ReactNode;
}

export function CandidateProfileView({
  candidate,
  currentStage,
  activeJobLabel,
  activeJobCompatibilityScore,
  hasPersistedCompatibilityScore,
  hasActiveJob,
  hasResume,
  aiScore,
  aiStatus,
  analysisResult,
  rankingEntry,
  scoreExplanation,
  analysisHighlights = [],
  analysisErrorMessage = null,
  extractionStatus = null,
  isLoading,
  isLoadingContent = false,
  activeTab = "overview",
  showDetailTabs = false,
  actionFeedback = null,
  interactionLocked = false,
  compact = false,
  hasLinkedJobs = false,
  onClose,
  onAdvance,
  onTerminate,
  onViewAnalysis,
  onEvaluateBetter,
  onTabChange,
  onEditCandidate,
  onLinkJob,
  onStartAnalysis,
  onOpenDocuments,
  onNavigateToFull,
  onBackToList,
  backToListLabel,
  analysisActionLabel = "Iniciar análise",
  analysisActionDisabled = false,
  activeJob = null,
  activeJobId = null,
  canTransferCurrentJob = false,
  stageSaving = false,
  linkSaving = false,
  onStageChange,
  onLinkToActiveJob,
  onOpenTransferJob,
  pipelineStatus = null,
  activeJobDecision = null,
  hasBehavioralAssessment = false,
  hasInterviews = false,
  hasScorecard = false,
  hasHiringDecision = false,
  hasPreAdmission = false,
  hasAdmissionPackage = false,
  hasCollaboration = false,
  userRole = "user",
  children,
}: CandidateProfileViewProps) {
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [pendingQuickAction, setPendingQuickAction] = useState<"advance" | "terminate" | null>(null);
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(false);
  const [isFeedbackFresh, setIsFeedbackFresh] = useState(false);
  const shouldRenderTabContent = !compact || showDetailTabs;
  const linkJobLabel = getLinkCandidateCtaLabel(hasLinkedJobs ? 1 : 0);

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
        actions={
          <div className="flex items-center gap-2">
            {hasActiveJob && onStartAnalysis ? (
              <button
                type="button"
                onClick={onStartAnalysis}
                disabled={analysisActionDisabled}
                className="rounded-xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 px-3 py-2 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {analysisActionLabel}
              </button>
            ) : onLinkJob && !hasActiveJob ? (
              <button
                type="button"
                onClick={onLinkJob}
                className="rounded-xl bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[hsl(var(--primary))]/90"
              >
                {linkJobLabel}
              </button>
            ) : null}
            <MoreActionsMenu
              currentStage={currentStage}
              hasActiveJob={hasActiveJob}
              canTransferCurrentJob={canTransferCurrentJob}
              onEditCandidate={onEditCandidate}
              onOpenDocuments={onOpenDocuments}
              onLinkJob={onLinkJob}
              onStartAnalysis={onStartAnalysis}
              onOpenTransferJob={onOpenTransferJob}
              onNavigateToFull={onNavigateToFull}
            />
          </div>
        }
      />

      <div className="space-y-4 px-5 py-4">
        {!isLoading && actionFeedback ? (
          <ActionFeedbackBanner feedback={actionFeedback} isFresh={isFeedbackFresh} />
        ) : null}

        {!isLoading ? (
          <CandidateAnalysisStatusCard
            hasResume={hasResume}
            activeJobId={activeJobId}
            analysisStatus={aiStatus}
            jobFitScore={activeJobCompatibilityScore}
            scoreLabel={
              hasPersistedCompatibilityScore
                ? "Aderência à vaga"
                : "Última aderência calculada"
            }
            aiStatus={aiStatus}
            errorMessage={analysisErrorMessage}
            extractionStatus={extractionStatus}
            highlights={analysisHighlights}
            compact={compact}
            onPrimaryAction={
              hasResume && hasActiveJob && activeJobCompatibilityScore !== null
                ? onViewAnalysis
                : !hasResume
                  ? onOpenDocuments
                  : !hasActiveJob
                    ? onLinkJob
                    : onStartAnalysis
            }
          />
        ) : null}

        {!isLoading && (activeJobCompatibilityScore !== null || currentStage === "hired" || currentStage === "rejected") ? (
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
            onEvaluateBetter={onEvaluateBetter}
            compact={true}
          />
        ) : null}
      </div>

      {/* Sticky footer for compact mode */}
      <div className={compact ? "sticky bottom-0 bg-[hsl(var(--surface))] z-10 border-t border-[hsl(var(--border))]/10" : ""}>
        {/* Quick actions */}
        {!isLoading && (
          <CandidateQuickActions
            onAdvance={handleAdvance}
            onTerminate={handleTerminate}
            onViewAnalysis={onViewAnalysis}
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
      </div>

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
      {!isLoading && shouldRenderTabContent && (
        <>
          <CandidateProfileNavigation
            activeTab={activeTab}
            onChange={onTabChange}
            pipelineStage={currentStage}
            pipelineStatus={pipelineStatus}
            activeJobDecision={activeJobDecision}
            hasActiveJob={hasActiveJob}
            hasBehavioralAssessment={hasBehavioralAssessment}
            hasInterviews={hasInterviews}
            hasScorecard={hasScorecard}
            hasHiringDecision={hasHiringDecision}
            hasPreAdmission={hasPreAdmission}
            hasAdmissionPackage={hasAdmissionPackage}
            hasCollaboration={hasCollaboration}
            userRole={userRole}
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
