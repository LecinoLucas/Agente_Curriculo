import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SkeletonRows } from "../../components/common/Skeleton";
import { useAuth } from "../../features/auth/useAuth";
import {
  CandidateProfileView,
  type CandidateActionFeedback,
  type TabKey as ProfileTabKey,
  OverviewTabWithHistory,
  ScoreTabWithAnalysis,
} from "../candidates/drawer/v2";
import { useCandidateDecision } from "../candidates/drawer/hooks/useCandidateDecision";
import { useCandidateDrawerActions } from "../candidates/drawer/hooks/useCandidateDrawerActions";
import { useCandidateData } from "../candidates/drawer/hooks/useCandidateData";
import { formatContextError } from "../../services/errorMessages";
import { feedback } from "../../services/feedback";
import { analysisService } from "../../services/analysisService";
import { pipelineService } from "../../services/pipelineService";
import { toast } from "../../shared/utils/toast";
import {
  scoreExplanationService,
  type ScoreExplanationResponse,
} from "../../services/scoreExplanationService";
import type {
  CandidatePipelineHistory,
  PipelineStage,
  TransferCandidateJobResponse,
} from "../../types/domain";
import { type PanelTab, usePipeline } from "./PipelineContext";
import {
  buildAnalysisDecisionToast,
  shouldTrackAnalysisDecision,
} from "./analysisDispatchFeedback";
import {
  buildCandidateAnalysisSummary,
  getLatestAnalysisForActiveJob,
} from "../candidates/utils/analysisStatus";
import type { ScoreTabFocusRequest } from "../candidates/drawer/tabs/ScoreTab";
import {
  isAnalysisInProgress,
  STAGE_LABEL,
  NEXT_PIPELINE_STAGE,
  buildStageActionFeedback,
} from "./candidate-drawer/candidateDrawerUtils";
import { CandidateDrawerOverlay } from "./candidate-drawer/CandidateDrawerOverlay";

const DocumentsTabComponent = lazy(() =>
  import("../candidates/drawer/tabs/DocumentsTab").then((m) => ({ default: m.DocumentsTab }))
);
const InterviewTab = lazy(() =>
  import("../candidates/drawer/tabs/InterviewTab").then((m) => ({ default: m.InterviewTab }))
);
const CandidateBehavioralAssessmentPanel = lazy(() =>
  import("../candidates/drawer/components/CandidateBehavioralAssessmentPanel").then((m) => ({
    default: m.CandidateBehavioralAssessmentPanel,
  }))
);
const CandidateCommunicationsPanel = lazy(() =>
  import("../candidates/drawer/components/CandidateCommunicationsPanel").then((m) => ({
    default: m.CandidateCommunicationsPanel,
  }))
);
const CollaborationTab = lazy(() =>
  import("../candidates/drawer/components/CollaborationTab").then((m) => ({ default: m.CollaborationTab }))
);
const CandidatePreAdmissionPanel = lazy(() =>
  import("../candidates/drawer/components/CandidatePreAdmissionPanel").then((m) => ({
    default: m.CandidatePreAdmissionPanel,
  }))
);
const AgendaInterviewModal = lazy(() =>
  import("../agenda/AgendaInterviewModal").then((m) => ({ default: m.AgendaInterviewModal }))
);
const EditCandidateModal = lazy(() =>
  import("./EditCandidateModal").then((m) => ({ default: m.EditCandidateModal }))
);
const InterviewQuickScheduleModal = lazy(() =>
  import("./InterviewQuickScheduleModal").then((m) => ({ default: m.InterviewQuickScheduleModal }))
);
const LinkCandidateJobModal = lazy(() =>
  import("../candidates/components/LinkCandidateJobModal").then((m) => ({ default: m.LinkCandidateJobModal }))
);
const TransferJobModal = lazy(() =>
  import("./candidate-drawer/TransferJobModal").then((m) => ({ default: m.TransferJobModal }))
);

function TabFallback() {
  return (
    <div className="flex flex-1 items-center justify-center py-8 text-sm text-[hsl(var(--muted))]">
      Carregando…
    </div>
  );
}

interface CandidateDrawerProps {
  mode?: "overlay" | "workspace";
  onBackToList?: () => void;
  backToListLabel?: string;
}

export function CandidateDrawer({
  mode = "overlay",
  onBackToList,
  backToListLabel,
}: CandidateDrawerProps = {}) {
  const navigate = useNavigate();

  const {
    selectedCandidateId,
    candidateOverview,
    candidateLoading,
    candidateError,
    activePanelTab,
    activeJobId: activeBoardJobId,
    jobs,
    rankingSyncTick,
    pollingAnalysisId,
    closeCandidate,
    openCandidate,
    switchPanelTab,
    refreshBoard,
    refreshCandidateOverview,
    syncCandidateOverview,
    syncAnalysisStart,
    ensureAnalysisMatch,
    startPolling,
    notifyCandidatesChanged,
    moveCandidateStage,
    invalidateBoard,
    invalidateRanking,
    patchCandidate,
  } = usePipeline();

  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);

  const isOpen = selectedCandidateId !== null;
  const candidate = candidateOverview?.candidate;
  const candidateActiveJobId = candidateOverview?.active_job_id ?? null;

  const historyCacheRef = useRef<Map<string, CandidatePipelineHistory>>(new Map());
  const scoreExplanationCacheRef = useRef<Map<string, ScoreExplanationResponse>>(new Map());
  const visibleCandidateIdRef = useRef<string | null>(selectedCandidateId);
  const pendingStageCandidateRef = useRef<string | null>(null);
  const pendingLinkCandidateRef = useRef<string | null>(null);
  const editModalMountedRef = useRef(false);
  const transferJobModalMountedRef = useRef(false);
  const linkJobModalMountedRef = useRef(false);
  const agendaModalMountedRef = useRef(false);

  const {
    analysisResult,
    rankingEntry,
    rankingEntryLoading,
    rankingEntryError,
  } = useCandidateData({
    candidateOverview,
    candidateActiveJobId,
    activePanelTab,
    rankingSyncTick,
  });

  const [stageSavingCandidateId, setStageSavingCandidateId] = useState<string | null>(null);
  const [linkSavingCandidateId, setLinkSavingCandidateId] = useState<string | null>(null);
  const [scoreExplanation, setScoreExplanation] = useState<ScoreExplanationResponse | null>(null);
  const [profileTabKey, setProfileTabKey] = useState<ProfileTabKey>("overview");
  const [detailTabsVisible, setDetailTabsVisible] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<CandidateActionFeedback | null>(null);
  const [linkJobModalOpen, setLinkJobModalOpen] = useState(false);
  const [quickInterviewOpen, setQuickInterviewOpen] = useState(false);
  const [fullAgendaOpen, setFullAgendaOpen] = useState(false);
  const [analysisStarting, setAnalysisStarting] = useState(false);
  const [scoreTabFocusRequest, setScoreTabFocusRequest] = useState<ScoreTabFocusRequest | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<ProfileTabKey>>(new Set(["overview", "score"]));
  const shouldLoadScoreExplanation = activePanelTab === "score" || activePanelTab === "analysis";

  const stageSaving =
    stageSavingCandidateId !== null && stageSavingCandidateId === selectedCandidateId;

  const linkSaving =
    linkSavingCandidateId !== null && linkSavingCandidateId === selectedCandidateId;

  const {
    editModalOpen,
    setEditModalOpen,
    transferJobModalOpen,
    setTransferJobModalOpen,
  } = useCandidateDrawerActions({
    isDrawerOpen: isOpen,
    selectedCandidateId,
  });

  const {
    primaryPipelineEntry,
    currentStage,
    activeJob,
    activeJobCompatibilityScore,
    hasPersistedCompatibilityScore,
    transferAvailableJobs,
    canTransferCurrentJob,
    compatibilityGuidance,
    activeJobLabel,
  } = useCandidateDecision({
    candidateOverview,
    candidateActiveJobId,
    jobs,
    rankingEntry,
  });

  const latestResume = candidateOverview?.resumes.find((resume) => resume.current_version_id) ?? candidateOverview?.resumes[0] ?? null;
  const analysisSummary = buildCandidateAnalysisSummary({
    activeJobId: candidateActiveJobId,
    hasResume: Boolean(latestResume?.current_version_id),
    latestAnalysis: candidateOverview?.latest_analysis,
    analysisResult,
    jobFitScore: rankingEntry?.job_fit_score ?? null,
    pollingAnalysisId,
  });
  const activeJobAnalysis = getLatestAnalysisForActiveJob(
    candidateOverview?.latest_analysis,
    candidateActiveJobId,
  );
  const analysisHighlights =
    scoreExplanation?.highlights?.slice(0, 3) ??
    analysisResult?.strengths?.slice(0, 3) ??
    [];

  useEffect(() => {
    if (mode !== "overlay" || !isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, mode]);

  // Reset visited tabs when candidate changes
  useEffect(() => {
    setVisitedTabs(new Set(["overview", "score"]));
  }, [selectedCandidateId]);

  // Dev-mode timing: track when drawer is open
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !isOpen) return;
    const start = performance.now();
    if (selectedCandidateId) {
      console.debug(`[CandidateDrawer] candidate ${selectedCandidateId} opened`);
    }
    return () => {
      const elapsed = performance.now() - start;
      if (selectedCandidateId) {
        console.debug(`[CandidateDrawer] candidate ${selectedCandidateId} closed after ${elapsed.toFixed(0)}ms`);
      }
    };
  }, [selectedCandidateId, isOpen]);

  // Dev-mode timing: track tab switches
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const start = performance.now();
    console.debug(`[CandidateDrawer] tab switched to "${profileTabKey}"`);
    return () => {
      const elapsed = performance.now() - start;
      console.debug(`[CandidateDrawer] tab "${profileTabKey}" active for ${elapsed.toFixed(0)}ms`);
    };
  }, [profileTabKey]);

  const pushActionFeedback = useCallback((feedbackPayload: Omit<CandidateActionFeedback, "id">) => {
    setActionFeedback({
      ...feedbackPayload,
      id: Date.now(),
    });
  }, []);

  const pushActionFeedbackForCandidate = useCallback(
    (candidateId: string, feedbackPayload: Omit<CandidateActionFeedback, "id">) => {
      if (visibleCandidateIdRef.current !== candidateId) return;
      pushActionFeedback(feedbackPayload);
    },
    [pushActionFeedback],
  );

  useEffect(() => {
    visibleCandidateIdRef.current = selectedCandidateId;
  }, [selectedCandidateId]);

  useEffect(() => {
    const latestAnalysis = candidateOverview?.latest_analysis;

    if (!candidateOverview || !latestAnalysis?.analysis_id) return;
    if (!isAnalysisInProgress(latestAnalysis.status)) return;

    startPolling(
      latestAnalysis.analysis_id,
      candidateOverview.candidate.id,
      latestAnalysis.status,
      latestAnalysis.job_id ?? null,
    );
  }, [candidateOverview, startPolling]);

  useEffect(() => {
    const latestAnalysis = candidateOverview?.latest_analysis;
    const pipelineStatus = candidateOverview?.latest_analysis_pipeline;

    if (!candidateOverview || !latestAnalysis?.analysis_id || !latestAnalysis.job_id) return;
    if (latestAnalysis.status !== "completed") return;

    if (
      pipelineStatus?.matching_status === "completed" ||
      pipelineStatus?.matching_status === "processing"
    ) {
      return;
    }

    void ensureAnalysisMatch({
      analysisId: latestAnalysis.analysis_id,
      candidateId: candidateOverview.candidate.id,
      jobId: latestAnalysis.job_id,
    });
  }, [candidateOverview, ensureAnalysisMatch]);

  useEffect(() => {
    setScoreExplanation(null);
  }, [selectedCandidateId, candidateActiveJobId]);

  useEffect(() => {
    const hasActiveContext =
      Boolean(candidateActiveJobId) &&
      Boolean(selectedCandidateId) &&
      rankingEntry?.job_fit_score != null;

    if (!shouldLoadScoreExplanation || !hasActiveContext || !candidateActiveJobId || !selectedCandidateId) {
      return;
    }

    const cacheKey = `${candidateActiveJobId}:${selectedCandidateId}`;
    const cached = scoreExplanationCacheRef.current.get(cacheKey);
    if (cached) {
      setScoreExplanation(cached);
      return;
    }

    let cancelled = false;

    void scoreExplanationService
      .get(candidateActiveJobId, selectedCandidateId)
      .then((payload) => {
        if (cancelled) return;
        scoreExplanationCacheRef.current.set(cacheKey, payload);
        setScoreExplanation(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setScoreExplanation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    candidateActiveJobId,
    selectedCandidateId,
    rankingEntry?.job_fit_score,
    shouldLoadScoreExplanation,
  ]);

  const handleStageChange = useCallback(
    async (newStage: PipelineStage, options?: { bypassInterviewModal?: boolean }) => {
      if (!selectedCandidateId || !currentStage || newStage === currentStage) return;

      const targetCandidateId = selectedCandidateId;

      if (newStage === "hr_interview" && !options?.bypassInterviewModal) {
        setQuickInterviewOpen(true);
        return;
      }

      if (pendingStageCandidateRef.current === targetCandidateId) return;

      pendingStageCandidateRef.current = targetCandidateId;
      setStageSavingCandidateId(targetCandidateId);

      pushActionFeedbackForCandidate(
        targetCandidateId,
        buildStageActionFeedback(newStage, "pending"),
      );

      feedback.moveCandidate.processing();

      try {
        const moveResult = await moveCandidateStage(targetCandidateId, newStage);

        if (shouldTrackAnalysisDecision(moveResult.analysis)) {
          await syncAnalysisStart({
            candidateId: targetCandidateId,
            analysisId: moveResult.analysis!.analysis_id!,
            status: moveResult.analysis!.status ?? "pending",
            jobId: moveResult.job_id,
          });
          startPolling(
            moveResult.analysis!.analysis_id!,
            targetCandidateId,
            moveResult.analysis!.status ?? "pending",
            moveResult.job_id,
          );
        }

        const analysisToast = buildAnalysisDecisionToast(moveResult.analysis);
        if (analysisToast) {
          if (analysisToast.tone === "success") toast.success(analysisToast.message);
          if (analysisToast.tone === "info") toast.info(analysisToast.message);
          if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
          if (analysisToast.tone === "error") toast.error(analysisToast.message);
        }

        pushActionFeedbackForCandidate(
          targetCandidateId,
          buildStageActionFeedback(newStage, "success"),
        );

        feedback.moveCandidate.success();
      } catch (err: unknown) {
        pushActionFeedbackForCandidate(
          targetCandidateId,
          buildStageActionFeedback(newStage, "error"),
        );

        feedback.moveCandidate.error(err);
      } finally {
        if (pendingStageCandidateRef.current === targetCandidateId) {
          pendingStageCandidateRef.current = null;
        }

        setStageSavingCandidateId((current) =>
          current === targetCandidateId ? null : current,
        );
      }
    },
    [
      selectedCandidateId,
      currentStage,
      moveCandidateStage,
      pushActionFeedbackForCandidate,
      startPolling,
      syncAnalysisStart,
    ],
  );

  const handleMoveToInterviewWithoutScheduling = useCallback(async () => {
    await handleStageChange("hr_interview", { bypassInterviewModal: true });
    setQuickInterviewOpen(false);
  }, [handleStageChange]);

  const handleScheduleInterview = useCallback(
    async (payload: {
      scheduled_start: string;
      scheduled_end: string;
      interview_format: "online" | "presencial" | "telefone";
      location: string | null;
      meeting_url: string | null;
      public_notes: string | null;
      create_google_event?: boolean;
      create_google_meet?: boolean;
    }) => {
      if (!selectedCandidateId || !candidateActiveJobId) return;
      const targetCandidateId = selectedCandidateId;
      setStageSavingCandidateId(targetCandidateId);
      try {
        await pipelineService.schedulePipelineInterview(candidateActiveJobId, targetCandidateId, {
          ...payload,
          timezone: "America/Recife",
          title: "Entrevista com candidato",
          interview_type: "hr",
        });
        await Promise.all([
          syncCandidateOverview(targetCandidateId),
          refreshBoard(),
        ]);
        feedback.moveCandidate.success();
        setQuickInterviewOpen(false);
      } catch (err) {
        feedback.moveCandidate.error(err);
      } finally {
        setStageSavingCandidateId((current) =>
          current === targetCandidateId ? null : current,
        );
      }
    },
    [candidateActiveJobId, refreshBoard, selectedCandidateId, syncCandidateOverview],
  );

  const handleLinkToActiveJob = useCallback(async () => {
    if (!selectedCandidateId || !activeBoardJobId) return;

    const targetCandidateId = selectedCandidateId;

    if (pendingLinkCandidateRef.current === targetCandidateId) return;

    pendingLinkCandidateRef.current = targetCandidateId;
    setLinkSavingCandidateId(targetCandidateId);

    pushActionFeedbackForCandidate(targetCandidateId, {
      tone: "info",
      pending: true,
      title: "Adicionando à vaga ativa",
      detail: "O vínculo e a etapa inicial estão sendo aplicados.",
    });

    try {
      const linkResult = await pipelineService.addCandidateToJob(targetCandidateId, {
        job_id: activeBoardJobId,
        initial_stage: "entry",
      });

      if (shouldTrackAnalysisDecision(linkResult.analysis)) {
        await syncAnalysisStart({
          candidateId: targetCandidateId,
          analysisId: linkResult.analysis!.analysis_id!,
          status: linkResult.analysis!.status ?? "pending",
          jobId: linkResult.job_id,
        });
        startPolling(
          linkResult.analysis!.analysis_id!,
          targetCandidateId,
          linkResult.analysis!.status ?? "pending",
          linkResult.job_id,
        );
      }

      const analysisToast = buildAnalysisDecisionToast(linkResult.analysis);
      if (analysisToast) {
        if (analysisToast.tone === "success") toast.success(analysisToast.message);
        if (analysisToast.tone === "info") toast.info(analysisToast.message);
        if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
        if (analysisToast.tone === "error") toast.error(analysisToast.message);
      }

      await Promise.all([
        syncCandidateOverview(targetCandidateId),
        refreshBoard(),
      ]);
      invalidateRanking();

      pushActionFeedbackForCandidate(targetCandidateId, {
        tone: linkResult.analysis?.blocked ? "warning" : "success",
        title: "Candidato adicionado à vaga ativa",
        detail: analysisToast?.message ?? "O pipeline e os badges já foram sincronizados.",
      });

      feedback.moveCandidate.success();
    } catch (err: unknown) {
      pushActionFeedbackForCandidate(targetCandidateId, {
        tone: "danger",
        title: "Falha ao adicionar à vaga ativa",
        detail: "O vínculo não foi aplicado. Tente novamente.",
      });

      feedback.moveCandidate.error(err);
    } finally {
      if (pendingLinkCandidateRef.current === targetCandidateId) {
        pendingLinkCandidateRef.current = null;
      }

      setLinkSavingCandidateId((current) =>
        current === targetCandidateId ? null : current,
      );
    }
  }, [
    selectedCandidateId,
    activeBoardJobId,
    invalidateRanking,
    pushActionFeedbackForCandidate,
    refreshBoard,
    startPolling,
    syncAnalysisStart,
    syncCandidateOverview,
  ]);

  const handleOpenTransferJob = useCallback(() => {
    setTransferJobModalOpen(true);
  }, [setTransferJobModalOpen]);

  const handleOpenLinkJob = useCallback(() => {
    setLinkJobModalOpen(true);
  }, []);

  const handleProfileTabChange = useCallback(
    (tabKey: ProfileTabKey) => {
      setDetailTabsVisible(true);
      setProfileTabKey(tabKey);
      // Track tab visit for keep-alive pattern
      setVisitedTabs((prev) => new Set([...prev, tabKey]));

      const panelTabMap: Record<ProfileTabKey, PanelTab> = {
        overview: "summary",
        score: "score",
        documents: "documents",
        interview: "actions",
        assessment: "actions",
        communications: "actions",
        collaboration: "actions",
        pre_admission: "actions",
      };

      switchPanelTab(panelTabMap[tabKey]);
    },
    [switchPanelTab],
  );

  const handleStartAnalysis = useCallback(async () => {
    if (!candidateOverview) return;

    if (!candidateActiveJobId) {
      toast.info("Vincule o candidato a uma vaga antes de iniciar a análise.");
      handleOpenLinkJob();
      return;
    }

    const resume = candidateOverview.resumes.find((item) => item.current_version_id) ?? candidateOverview.resumes[0] ?? null;

    if (!resume?.current_version_id) {
      toast.info("Envie ou atualize o currículo antes de iniciar a análise.");
      handleProfileTabChange("documents");
      return;
    }

    if (analysisSummary.inProgress || analysisStarting) {
      toast.info("Já existe uma análise em andamento para este candidato.");
      return;
    }

    setAnalysisStarting(true);
    pushActionFeedback({
      tone: "info",
      pending: true,
      title: "Iniciando análise",
      detail: "O status será atualizado automaticamente neste workspace.",
    });
    feedback.requestAnalysis.processing();

    try {
      const response = await analysisService.request(resume.current_version_id, candidateActiveJobId, { force: true });
      const analysisStatus = response.status ?? "pending";

      await syncAnalysisStart({
        candidateId: candidateOverview.candidate.id,
        analysisId: response.analysis_id,
        status: analysisStatus,
        jobId: candidateActiveJobId,
        resumeId: resume.resume_id,
        resumeTitle: resume.title,
      });

      if (analysisStatus === "pending" || analysisStatus === "processing" || analysisStatus === "retry_scheduled") {
        startPolling(response.analysis_id, candidateOverview.candidate.id, analysisStatus, candidateActiveJobId);
      }
      handleProfileTabChange("documents");

      pushActionFeedback({
        tone: "info",
        title: response.created ? "Análise iniciada" : "Análise sincronizada",
        detail: response.created
          ? "A execução foi iniciada e já está sendo acompanhada nesta tela."
          : "O status real da análise foi sincronizado nesta tela.",
      });
      feedback.requestAnalysis.success();
    } catch (err: unknown) {
      pushActionFeedback({
        tone: "danger",
        title: "Falha ao iniciar a análise",
        detail: formatContextError(
          err,
          "Não foi possível iniciar a análise agora.",
          "Revise o currículo e tente novamente.",
        ),
      });
      feedback.requestAnalysis.error(err);
    } finally {
      setAnalysisStarting(false);
    }
  }, [
    analysisStarting,
    analysisSummary.inProgress,
    candidateActiveJobId,
    candidateOverview,
    handleOpenLinkJob,
    handleProfileTabChange,
    pushActionFeedback,
    startPolling,
    syncAnalysisStart,
  ]);

  useEffect(() => {
    if (!selectedCandidateId) return;

    const panelToProfileTab: Record<PanelTab, ProfileTabKey> = {
      summary: "overview",
      score: "score",
      analysis: "score",
      documents: "documents",
      history: "overview",
      actions: "interview",
    };

    const nextTab =
      activePanelTab === "actions" &&
      (
        profileTabKey === "interview" ||
        profileTabKey === "assessment" ||
        profileTabKey === "communications" ||
        profileTabKey === "collaboration" ||
        profileTabKey === "pre_admission"
      )
        ? profileTabKey
        : panelToProfileTab[activePanelTab];
    setProfileTabKey(nextTab);
    setDetailTabsVisible(true);
    setActionFeedback(null);
  }, [selectedCandidateId, activePanelTab, profileTabKey]);

  const handleHeroAdvance = useCallback(async () => {
    if (!selectedCandidateId || !currentStage) return;

    const nextStage = NEXT_PIPELINE_STAGE[currentStage];
    if (!nextStage) return;

    await handleStageChange(nextStage);
  }, [selectedCandidateId, currentStage, handleStageChange]);

  const handleHeroTerminate = useCallback(async () => {
    if (!selectedCandidateId || !currentStage || currentStage === "rejected") return;

    await handleStageChange("rejected");
  }, [selectedCandidateId, currentStage, handleStageChange]);

  const handleHeroViewAnalysis = useCallback(() => {
    setDetailTabsVisible(true);
    setProfileTabKey("score");
    switchPanelTab("analysis");
    setScoreTabFocusRequest({ intent: "analysis", token: Date.now() });
  }, [switchPanelTab]);

  const handleHeroEvaluateBetter = useCallback(() => {
    setDetailTabsVisible(true);
    setProfileTabKey("score");
    switchPanelTab("analysis");
    setScoreTabFocusRequest({ intent: "review", token: Date.now() });
  }, [switchPanelTab]);

  const drawerContent = (
    <>
      {!candidateLoading && !candidateError && candidateOverview ? (
        <CandidateProfileView
          key={selectedCandidateId ?? "none"}
          candidate={candidateOverview.candidate}
          currentStage={currentStage}
          activeJobLabel={activeJobLabel}
          activeJobCompatibilityScore={activeJobCompatibilityScore}
          hasPersistedCompatibilityScore={hasPersistedCompatibilityScore}
          hasActiveJob={Boolean(candidateActiveJobId)}
          hasResume={Boolean(latestResume?.current_version_id)}
          aiScore={null}
          aiStatus={activeJobAnalysis?.status ?? null}
          analysisResult={analysisResult}
          rankingEntry={rankingEntry}
          scoreExplanation={scoreExplanation}
          analysisHighlights={analysisHighlights}
          analysisErrorMessage={activeJobAnalysis?.failure_reason ?? null}
          extractionStatus={latestResume?.extraction_status}
          isLoading={candidateLoading}
          isLoadingContent={profileTabKey === "score" && rankingEntryLoading}
          activeTab={profileTabKey}
          showDetailTabs={detailTabsVisible}
          actionFeedback={actionFeedback}
          interactionLocked={stageSaving || linkSaving}
          compact={mode === "overlay"}
          hasLinkedJobs={candidateOverview.pipeline_entries.length > 0}
          onClose={closeCandidate}
          onAdvance={handleHeroAdvance}
          onTerminate={handleHeroTerminate}
          onViewAnalysis={handleHeroViewAnalysis}
          onEvaluateBetter={handleHeroEvaluateBetter}
          onTabChange={handleProfileTabChange}
          onEditCandidate={() => setEditModalOpen(true)}
          onLinkJob={handleOpenLinkJob}
          onStartAnalysis={handleStartAnalysis}
          onOpenDocuments={() => handleProfileTabChange("documents")}
          onNavigateToFull={mode === "overlay" ? () => navigate("/candidatos") : undefined}
          onBackToList={mode === "workspace" ? onBackToList : undefined}
          backToListLabel={backToListLabel}
          analysisActionLabel={analysisStarting ? "Iniciando análise…" : analysisSummary.actionLabel}
          analysisActionDisabled={analysisStarting || analysisSummary.inProgress}
          activeJob={activeJob}
          activeJobId={candidateActiveJobId}
          canTransferCurrentJob={canTransferCurrentJob}
          stageSaving={stageSaving}
          linkSaving={linkSaving}
          onStageChange={handleStageChange}
          onLinkToActiveJob={handleLinkToActiveJob}
          onOpenTransferJob={handleOpenTransferJob}
          pipelineStatus={primaryPipelineEntry?.relationship_status ?? null}
          activeJobDecision={candidateOverview.active_job_decision?.decision ?? null}
          userRole={user?.role ?? "candidate"}
        >
          {profileTabKey === "overview" ? (
            <OverviewTabWithHistory
              overview={candidateOverview}
              activeJobId={candidateActiveJobId}
              activeJob={activeJob}
              activePipelineEntry={primaryPipelineEntry}
              onEdit={() => setEditModalOpen(true)}
              onLinkJob={handleOpenLinkJob}
              historyCacheRef={historyCacheRef}
            />
          ) : null}

          {profileTabKey === "score" ? (
            <ScoreTabWithAnalysis
              overview={candidateOverview}
              activeJobId={candidateActiveJobId}
              activeJob={activeJob}
              activePipelineEntry={primaryPipelineEntry}
              rankingEntry={rankingEntry}
              analysisResult={analysisResult}
              loading={rankingEntryLoading}
              error={rankingEntryError}
              compatibilityGuidance={compatibilityGuidance}
              scoreExplanation={scoreExplanation}
              focusRequest={scoreTabFocusRequest}
            />
          ) : null}

          {profileTabKey === "documents" ? (
            <Suspense fallback={<TabFallback />}>
              <DocumentsTabComponent
                overview={candidateOverview}
                activeJobId={candidateActiveJobId}
                activePipelineEntry={primaryPipelineEntry}
                canSpendRealTokens={canSpendRealTokens}
                pollingAnalysisId={pollingAnalysisId}
                refreshCandidateOverview={refreshCandidateOverview}
                startPolling={startPolling}
                switchPanelTab={switchPanelTab}
                syncAnalysisStart={syncAnalysisStart}
                notifyCandidatesChanged={notifyCandidatesChanged}
                onActionFeedback={pushActionFeedback}
              />
            </Suspense>
          ) : null}

          {/* Keep-alive: interview tab stays mounted after first visit */}
          <div className={profileTabKey !== "interview" ? "hidden" : undefined}>
            {visitedTabs.has("interview") ? (
              <Suspense fallback={<TabFallback />}>
                <InterviewTab
                  jobId={candidateActiveJobId}
                  candidateId={candidate?.id ?? null}
                />
              </Suspense>
            ) : null}
          </div>

          {/* Keep-alive: assessment tab stays mounted after first visit */}
          <div className={profileTabKey !== "assessment" ? "hidden" : undefined}>
            {visitedTabs.has("assessment") ? (
              <Suspense fallback={<TabFallback />}>
                <CandidateBehavioralAssessmentPanel
                  jobId={candidateActiveJobId}
                  candidateId={candidate?.id ?? null}
                />
              </Suspense>
            ) : null}
          </div>

          {/* Keep-alive: communications tab stays mounted after first visit */}
          <div className={profileTabKey !== "communications" ? "hidden" : undefined}>
            {visitedTabs.has("communications") ? (
              <Suspense fallback={<TabFallback />}>
                <CandidateCommunicationsPanel
                  jobId={candidateActiveJobId}
                  candidateId={candidate?.id ?? null}
                />
              </Suspense>
            ) : null}
          </div>

          {/* Keep-alive: collaboration tab stays mounted after first visit */}
          <div className={profileTabKey !== "collaboration" ? "hidden" : undefined}>
            {visitedTabs.has("collaboration") && candidateActiveJobId && candidate?.id ? (
              <Suspense fallback={<TabFallback />}>
                <CollaborationTab
                  jobId={candidateActiveJobId}
                  candidateId={candidate.id}
                />
              </Suspense>
            ) : null}
          </div>

          {/* Keep-alive: pre_admission tab stays mounted after first visit */}
          <div className={profileTabKey !== "pre_admission" ? "hidden" : undefined}>
            {visitedTabs.has("pre_admission") ? (
              <Suspense fallback={<TabFallback />}>
                <CandidatePreAdmissionPanel
                  jobId={candidateActiveJobId}
                  candidateId={candidate?.id ?? null}
                />
              </Suspense>
            ) : null}
          </div>
        </CandidateProfileView>
      ) : null}

      {candidateLoading ? (
        <div className="flex flex-1 flex-col">
          <div className="p-5">
            <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-4 py-3">
              <p className="text-sm font-semibold text-[hsl(var(--text))]">
                Carregando candidato…
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--primary))]">
                Buscando dados, análise, documentos e histórico.
              </p>
            </div>
            <SkeletonRows />
          </div>
        </div>
      ) : null}

      {!candidateLoading && candidateError ? (
        <div className="flex flex-1 flex-col p-5">
          <div className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-4 text-sm text-[hsl(var(--danger))]">
            <p className="font-semibold">Não foi possível abrir este candidato.</p>
            <p className="mt-1">{candidateError}</p>
            {selectedCandidateId ? (
              <button
                type="button"
                onClick={() => void openCandidate(selectedCandidateId)}
                className="mt-3 rounded-lg border border-[hsl(var(--danger))]/20 bg-[hsl(var(--surface))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger-soft))]"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );

  if (editModalOpen) editModalMountedRef.current = true;
  if (transferJobModalOpen) transferJobModalMountedRef.current = true;
  if (linkJobModalOpen) linkJobModalMountedRef.current = true;
  if (fullAgendaOpen) agendaModalMountedRef.current = true;

  const modalsContent = (
    <>
      {editModalMountedRef.current && (
        <Suspense fallback={null}>
          <EditCandidateModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            candidate={candidate}
            onSuccess={async (updatedCandidate) => {
              patchCandidate(updatedCandidate.id, updatedCandidate);
              notifyCandidatesChanged();
              void syncCandidateOverview(updatedCandidate.id);
            }}
          />
        </Suspense>
      )}

      {transferJobModalMountedRef.current && (
        <Suspense fallback={null}>
          <TransferJobModal
            isOpen={transferJobModalOpen}
            candidateId={candidate?.id ?? null}
            fromJobId={primaryPipelineEntry?.job_id ?? null}
            availableJobs={transferAvailableJobs}
            canTransfer={canTransferCurrentJob}
            onClose={() => setTransferJobModalOpen(false)}
            onSuccess={async (transferResult: TransferCandidateJobResponse) => {
              if (!candidate?.id) return;

              if (shouldTrackAnalysisDecision(transferResult.analysis)) {
                await syncAnalysisStart({
                  candidateId: candidate.id,
                  analysisId: transferResult.analysis!.analysis_id!,
                  status: transferResult.analysis!.status ?? "pending",
                  jobId: transferResult.to_job_id,
                });
                startPolling(
                  transferResult.analysis!.analysis_id!,
                  candidate.id,
                  transferResult.analysis!.status ?? "pending",
                  transferResult.to_job_id,
                );
              }

              const analysisToast = buildAnalysisDecisionToast(transferResult.analysis);
              if (analysisToast) {
                if (analysisToast.tone === "success") toast.success(analysisToast.message);
                if (analysisToast.tone === "info") toast.info(analysisToast.message);
                if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
                if (analysisToast.tone === "error") toast.error(analysisToast.message);
              }

              await Promise.all([
                syncCandidateOverview(candidate.id),
                refreshBoard(),
              ]);
              setTransferJobModalOpen(false);
            }}
          />
        </Suspense>
      )}

      {linkJobModalMountedRef.current && (
        <Suspense fallback={null}>
          <LinkCandidateJobModal
            isOpen={linkJobModalOpen}
            candidateId={candidate?.id ?? null}
            candidateName={candidate?.full_name ?? null}
            linkedJobIds={candidateOverview?.pipeline_entries.map((entry) => entry.job_id) ?? []}
            onClose={() => setLinkJobModalOpen(false)}
            onLinked={async (jobId) => {
              if (candidate?.id) {
                await syncCandidateOverview(candidate.id);
              }
              if (jobId === activeBoardJobId) {
                await invalidateBoard(jobId, true);
              }
              pushActionFeedback({
                tone: "success",
                title: "Vaga vinculada com sucesso",
                detail: "O candidato já pode seguir para análise, score e acompanhamento no funil.",
              });
            }}
          />
        </Suspense>
      )}

      {quickInterviewOpen && candidate && candidateActiveJobId ? (
        <Suspense fallback={null}>
          <InterviewQuickScheduleModal
            candidateName={candidate.full_name}
            jobTitle={activeJobLabel ?? "vaga ativa"}
            isSaving={stageSaving}
            onClose={() => setQuickInterviewOpen(false)}
            onMoveWithoutScheduling={handleMoveToInterviewWithoutScheduling}
            onSchedule={handleScheduleInterview}
            onOpenFullAgenda={() => {
              setQuickInterviewOpen(false);
              setFullAgendaOpen(true);
            }}
          />
        </Suspense>
      ) : null}

      {agendaModalMountedRef.current && (
        <Suspense fallback={null}>
          <AgendaInterviewModal
            isOpen={fullAgendaOpen}
            isEdit={false}
            initialCandidateId={candidate?.id ?? null}
            initialJobId={candidateActiveJobId}
            initialPipelineId={null}
            onClose={() => setFullAgendaOpen(false)}
            onSuccess={async () => {
              if (!candidate?.id) return;
              await handleStageChange("hr_interview", { bypassInterviewModal: true });
              await syncCandidateOverview(candidate.id);
              setFullAgendaOpen(false);
            }}
          />
        </Suspense>
      )}
    </>
  );

  return (
    <>
      <CandidateDrawerOverlay
        isOpen={isOpen}
        mode={mode}
        onBackdropClick={closeCandidate}
      >
        {drawerContent}
      </CandidateDrawerOverlay>
      {modalsContent}
    </>
  );
}
