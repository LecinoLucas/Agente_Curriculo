import { useCallback, useEffect, useRef, useState } from "react";
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
import { CandidateDrawerV1 } from "../candidates/drawer/v1/CandidateDrawerV1";
import { useCandidateDecision, scoreColorClass, scoreBgClass, getCompatibilityGuidance } from "../candidates/drawer/hooks/useCandidateDecision";
import { useCandidateDrawerActions } from "../candidates/drawer/hooks/useCandidateDrawerActions";
import { useCandidateData } from "../candidates/drawer/hooks/useCandidateData";
import { OverviewTab } from "../candidates/drawer/tabs/OverviewTab";
import { ScoreTab } from "../candidates/drawer/tabs/ScoreTab";
import { DocumentsTab as DocumentsTabComponent } from "../candidates/drawer/tabs/DocumentsTab";
import { analysisService } from "../../services/analysisService";
import { candidatesService } from "../../services/candidatesService";
import { dataQualityService } from "../../services/dataQualityService";
import { formatErrorForToast, getHttpStatus, handleApiError } from "../../shared/utils/errorHandler";
import { formatContextError } from "../../services/errorMessages";
import { feedback } from "../../services/feedback";
import { pipelineService } from "../../services/pipelineService";
import { toast } from "../../shared/utils/toast";
import {
  scoreExplanationService,
  type ScoreExplanationResponse,
} from "../../services/scoreExplanationService";
import type {
  AnalysisResult,
  CandidateOverview,
  CandidatePipelineHistory,
  Job,
  JobRankingEntry,
  PipelineStage,
} from "../../types/domain";
import { getCandidateState, getNextAction, type CandidateState } from "./candidateState";
import {
  buildDealBreakerViolationDisplay,
  isDealBreakerReasonCode,
} from "./dealBreakerDisplay";
import { type PanelTab, usePipeline } from "./PipelineContext";
import { AddJobModal } from "./AddJobModal";
import { EditCandidateModal } from "./EditCandidateModal";


function isAnalysisInProgress(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

const STAGE_LABEL: Record<PipelineStage, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

function buildStageActionFeedback(
  stage: PipelineStage,
  phase: "pending" | "success" | "error",
): Omit<CandidateActionFeedback, "id"> {
  const label = STAGE_LABEL[stage] ?? stage;

  if (phase === "pending") {
    return {
      tone: "info",
      pending: true,
      title: stage === "hired" ? "Aplicando aprovação" : stage === "rejected" ? "Aplicando rejeição" : `Movendo para ${label}`,
      detail:
        stage === "hired"
          ? "O candidato está sendo movido para Contratado."
          : stage === "rejected"
            ? "O candidato está sendo movido para Reprovado."
            : "O novo estado está sendo aplicado no workspace.",
    };
  }

  if (phase === "error") {
    return {
      tone: "danger",
      title: "Ação não aplicada",
      detail: `Não foi possível mover o candidato para ${label}.`,
    };
  }

  return {
    tone: stage === "rejected" ? "danger" : "success",
    title:
      stage === "hired"
        ? "Candidato aprovado"
        : stage === "rejected"
          ? "Candidato rejeitado"
          : `Candidato movido para ${label}`,
    detail:
      stage === "hired"
        ? "O estado atual foi atualizado para Contratado."
        : stage === "rejected"
          ? "O estado atual foi atualizado para Reprovado."
          : "A etapa atual já foi sincronizada no workspace.",
  };
}

function showManualAnalysisConflictToast() {
  toast.info("Já existe uma análise em andamento ou recente para esta vaga.");
}

async function recoverInFlightAnalysis(params: {
  candidateId: string;
  startPolling: (analysisId: string, candidateId?: string | null, initialStatus?: string | null) => void;
  syncAnalysisStart: (input: {
    candidateId: string;
    analysisId: string;
    status?: string | null;
    jobId?: string | null;
    resumeId?: string | null;
    resumeTitle?: string | null;
  }) => Promise<void>;
}): Promise<boolean> {
  try {
    const freshOverview = await candidatesService.getOverview(params.candidateId);
    const latest = freshOverview.latest_analysis;
    if (!latest?.analysis_id || !isAnalysisInProgress(latest.status)) return false;

    await params.syncAnalysisStart({
      candidateId: params.candidateId,
      analysisId: latest.analysis_id,
      status: latest.status,
      jobId: latest.job_id,
      resumeId: latest.resume_id,
      resumeTitle: latest.resume_title,
    });
    params.startPolling(latest.analysis_id, params.candidateId, latest.status, latest.job_id);
    return true;
  } catch {
    return false;
  }
}

interface CandidateDrawerProps {
  mode?: "overlay" | "workspace";
}

export function CandidateDrawer({ mode = "overlay" }: CandidateDrawerProps = {}) {
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
    invalidateJobState,
  } = usePipeline();
  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);

  const isOpen = selectedCandidateId !== null;
  const candidate = candidateOverview?.candidate;
  const candidateActiveJobId = candidateOverview?.active_job_id ?? null;
  const historyCacheRef = useRef<Map<string, CandidatePipelineHistory>>(new Map());
  const visibleCandidateIdRef = useRef<string | null>(selectedCandidateId);
  const pendingStageCandidateRef = useRef<string | null>(null);
  const pendingLinkCandidateRef = useRef<string | null>(null);
  const pendingHeaderAnalysisCandidateRef = useRef<string | null>(null);

  const {
    analysisResult,
    analysisResultLoading,
    analysisResultError,
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
  const [headerActionCandidateId, setHeaderActionCandidateId] = useState<string | null>(null);
  const [scoreExplanation, setScoreExplanation] = useState<ScoreExplanationResponse | null>(null);
  const [profileTabKey, setProfileTabKey] = useState<ProfileTabKey>("overview");
  const [actionFeedback, setActionFeedback] = useState<CandidateActionFeedback | null>(null);

  const stageSaving = stageSavingCandidateId !== null && stageSavingCandidateId === selectedCandidateId;
  const linkSaving = linkSavingCandidateId !== null && linkSavingCandidateId === selectedCandidateId;
  const headerActionLoading =
    headerActionCandidateId !== null && headerActionCandidateId === selectedCandidateId;

  const {
    editModalOpen,
    setEditModalOpen,
    addJobModalOpen,
    setAddJobModalOpen,
    transferJobModalOpen,
    setTransferJobModalOpen,
    dataQualityActionLoading,
    setDataQualityActionLoading,
  } = useCandidateDrawerActions({
    isDrawerOpen: isOpen,
    selectedCandidateId,
  });

  const {
    primaryPipelineEntry,
    currentStage,
    activeJob,
    activeJobCompatibilityScore,
    candidateState,
    linkedJobIds,
    availableJobs,
    canTransferCurrentJob,
    compatibilityGuidance,
    activeJobLabel,
    linkStatus,
  } = useCandidateDecision({
    candidateOverview,
    candidateActiveJobId,
    jobs,
    rankingEntry,
    linkSaving,
  });

  const pushActionFeedback = useCallback((feedback: Omit<CandidateActionFeedback, "id">) => {
    setActionFeedback({
      ...feedback,
      id: Date.now(),
    });
  }, []);

  const pushActionFeedbackForCandidate = useCallback(
    (candidateId: string, feedback: Omit<CandidateActionFeedback, "id">) => {
      if (visibleCandidateIdRef.current !== candidateId) return;
      pushActionFeedback(feedback);
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
      latestAnalysis.job_id,
    );
  }, [candidateOverview, startPolling]);

  useEffect(() => {
    const latestAnalysis = candidateOverview?.latest_analysis;
    const pipelineStatus = candidateOverview?.latest_analysis_pipeline;
    if (!candidateOverview || !latestAnalysis?.analysis_id || !latestAnalysis.job_id) return;
    if (latestAnalysis.status !== "completed") return;
    if (pipelineStatus?.matching_status === "completed" || pipelineStatus?.matching_status === "processing") {
      return;
    }

    void ensureAnalysisMatch({
      analysisId: latestAnalysis.analysis_id,
      candidateId: candidateOverview.candidate.id,
      jobId: latestAnalysis.job_id,
    });
  }, [candidateOverview, ensureAnalysisMatch]);

  // Load score explanation for unifying DecisionHero and ScoreSummary narratives
  useEffect(() => {
    const hasActiveContext =
      Boolean(candidateActiveJobId) &&
      Boolean(selectedCandidateId) &&
      rankingEntry?.final_score != null;

    if (!hasActiveContext || !candidateActiveJobId || !selectedCandidateId) {
      setScoreExplanation(null);
      return;
    }

    let cancelled = false;

    void scoreExplanationService
      .get(candidateActiveJobId, selectedCandidateId)
      .then((payload) => {
        if (cancelled) return;
        setScoreExplanation(payload);
      })
      .catch(() => {
        if (cancelled) return;
        setScoreExplanation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [candidateActiveJobId, selectedCandidateId, rankingEntry?.final_score]);




  const handleHeaderRequestAnalysis = useCallback(async () => {
    if (!candidateOverview) return;
    const targetCandidateId = candidateOverview.candidate.id;
    if (pendingHeaderAnalysisCandidateRef.current === targetCandidateId) return;
    const manualJobId = candidateActiveJobId;

    const readyResume = candidateOverview.resumes.find(
      (resume) =>
        resume.status === "active" &&
        resume.extraction_status === "completed" &&
        resume.current_version_id,
    );

    switchPanelTab("analysis");

    if (!canSpendRealTokens) {
      toast.warning("Consumo real bloqueado — ative real_ai_token_spend_enabled para analisar.");
      return;
    }

    if (!readyResume?.current_version_id) {
      toast.warning("Nenhum currículo pronto para análise.");
      return;
    }
    if (!manualJobId) {
      toast.info("Candidato sem vaga ativa. Adicione o candidato a uma vaga antes de solicitar análise.");
      return;
    }
    if (isAnalysisInProgress(candidateOverview.latest_analysis?.status ?? null)) {
      toast.info("Já existe uma análise em andamento para este candidato.");
      return;
    }

    const reusedInFlightAnalysis = await recoverInFlightAnalysis({
      candidateId: candidateOverview.candidate.id,
      startPolling,
      syncAnalysisStart,
    });
    if (reusedInFlightAnalysis) {
      toast.info("Já existe uma análise em andamento para este candidato.");
      return;
    }

    pendingHeaderAnalysisCandidateRef.current = targetCandidateId;
    setHeaderActionCandidateId(targetCandidateId);
    pushActionFeedbackForCandidate(targetCandidateId, {
      tone: "info",
      pending: true,
      title: "Solicitando análise",
      detail: "A execução será refletida automaticamente neste workspace.",
    });
    feedback.requestAnalysis.processing();
    try {
      const response = await analysisService.request(readyResume.current_version_id, manualJobId);
      await syncAnalysisStart({
        candidateId: targetCandidateId,
        analysisId: response.analysis_id,
        status: "pending",
        jobId: manualJobId,
        resumeId: readyResume.resume_id,
        resumeTitle: readyResume.title,
      });
      startPolling(response.analysis_id, targetCandidateId, "pending", manualJobId);
      pushActionFeedbackForCandidate(targetCandidateId, {
        tone: "info",
        title: "Reanálise iniciada",
        detail: "O candidato entrou novamente em processamento pela IA.",
      });
      feedback.requestAnalysis.success();
    } catch (err) {
      if (getHttpStatus(err) === 409) {
        const recovered = await recoverInFlightAnalysis({
          candidateId: targetCandidateId,
          startPolling,
          syncAnalysisStart,
        });
        if (recovered) {
          pushActionFeedbackForCandidate(targetCandidateId, {
            tone: "info",
            title: "Análise retomada",
            detail: "Já existia uma execução em andamento para este candidato.",
          });
          toast.info("Uma análise já estava em andamento e foi retomada.");
          return;
        }
        showManualAnalysisConflictToast();
        pushActionFeedbackForCandidate(targetCandidateId, {
          tone: "danger",
          title: "Falha ao solicitar análise",
          detail: "Não foi possível aplicar a reanálise agora.",
        });
        return;
      }
      pushActionFeedbackForCandidate(targetCandidateId, {
        tone: "danger",
        title: "Falha ao solicitar análise",
        detail: "A ação não foi aplicada. Revise o status atual e tente novamente.",
      });
      feedback.requestAnalysis.error(err);
    } finally {
      if (pendingHeaderAnalysisCandidateRef.current === targetCandidateId) {
        pendingHeaderAnalysisCandidateRef.current = null;
      }
      setHeaderActionCandidateId((current) =>
        current === targetCandidateId ? null : current,
      );
    }
  }, [
    candidateOverview,
    candidateActiveJobId,
    canSpendRealTokens,
    pushActionFeedbackForCandidate,
    startPolling,
    switchPanelTab,
    syncAnalysisStart,
  ]);

  const handleStageChange = useCallback(async (newStage: PipelineStage) => {
    if (!selectedCandidateId || !currentStage || newStage === currentStage) return;
    const targetCandidateId = selectedCandidateId;
    if (pendingStageCandidateRef.current === targetCandidateId) return;
    pendingStageCandidateRef.current = targetCandidateId;
    setStageSavingCandidateId(targetCandidateId);
    pushActionFeedbackForCandidate(targetCandidateId, buildStageActionFeedback(newStage, "pending"));
    feedback.moveCandidate.processing();
    try {
      await moveCandidateStage(targetCandidateId, newStage);
      pushActionFeedbackForCandidate(targetCandidateId, buildStageActionFeedback(newStage, "success"));
      feedback.moveCandidate.success();
    } catch (err: unknown) {
      pushActionFeedbackForCandidate(targetCandidateId, buildStageActionFeedback(newStage, "error"));
      feedback.moveCandidate.error(err);
    } finally {
      if (pendingStageCandidateRef.current === targetCandidateId) {
        pendingStageCandidateRef.current = null;
      }
      setStageSavingCandidateId((current) =>
        current === targetCandidateId ? null : current,
      );
    }
  }, [selectedCandidateId, currentStage, moveCandidateStage, pushActionFeedbackForCandidate]);

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
      await pipelineService.addCandidateToJob(targetCandidateId, {
        job_id: activeBoardJobId,
        initial_stage: "entry",
      });
      await invalidateJobState();
      pushActionFeedbackForCandidate(targetCandidateId, {
        tone: "success",
        title: "Candidato adicionado à vaga ativa",
        detail: "O pipeline e os badges já foram sincronizados.",
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
  }, [selectedCandidateId, activeBoardJobId, invalidateJobState, pushActionFeedbackForCandidate]);

  const handleOpenAddJob = useCallback(() => {
    setAddJobModalOpen(true);
  }, [setAddJobModalOpen]);

  const handleOpenTransferJob = useCallback(() => {
    setTransferJobModalOpen(true);
  }, [setTransferJobModalOpen]);

  const handleProfileTabChange = useCallback((tabKey: ProfileTabKey) => {
    setProfileTabKey(tabKey);
    const panelTabMap: Record<ProfileTabKey, PanelTab> = {
      overview: "summary",
      score: "score",
      documents: "documents",
    };
    switchPanelTab(panelTabMap[tabKey]);
  }, [switchPanelTab]);

  // Reset profile tab to overview when candidate changes
  useEffect(() => {
    if (selectedCandidateId) {
      setProfileTabKey("overview");
      setActionFeedback(null);
    }
  }, [selectedCandidateId]);

  const handleHeroApprove = useCallback(async () => {
    if (!selectedCandidateId || !currentStage || currentStage === "hired") return;
    await handleStageChange("hired");
  }, [selectedCandidateId, currentStage, handleStageChange]);

  const handleHeroReject = useCallback(async () => {
    if (!selectedCandidateId || !currentStage || currentStage === "rejected") return;
    await handleStageChange("rejected");
  }, [selectedCandidateId, currentStage, handleStageChange]);

  const handleHeroViewAnalysis = useCallback(() => {
    setProfileTabKey("score");
    switchPanelTab("score");
  }, [switchPanelTab]);

  const handleOpenDocuments = useCallback(() => {
    setProfileTabKey("documents");
    switchPanelTab("documents");
  }, [switchPanelTab]);

  const drawerVariant =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("candidateDrawer") === "v2"
      ? "v2"
      : "v1";

  // Content body — shared between overlay and workspace modes
  const drawerContent = (
    <>
      {!candidateLoading && !candidateError && candidateOverview ? (
        drawerVariant === "v2" ? (
          <CandidateProfileView
            key={selectedCandidateId ?? "none"}
            candidate={candidate}
            currentStage={currentStage}
            activeJobLabel={activeJobLabel}
            activeJobCompatibilityScore={activeJobCompatibilityScore}
            hasActiveJob={Boolean(candidateActiveJobId)}
            aiScore={candidateOverview.latest_analysis?.overall_score ?? null}
            aiStatus={candidateOverview.latest_analysis?.status ?? null}
            analysisResult={analysisResult}
            rankingEntry={rankingEntry}
            scoreExplanation={scoreExplanation}
            isLoading={candidateLoading}
            isLoadingContent={profileTabKey === "score" && rankingEntryLoading}
            activeTab={profileTabKey}
            actionFeedback={actionFeedback}
            interactionLocked={stageSaving || linkSaving || headerActionLoading}
            compact={mode === "overlay"}
            onClose={closeCandidate}
            onApprove={handleHeroApprove}
            onReject={handleHeroReject}
            onViewAnalysis={handleHeroViewAnalysis}
            onTabChange={handleProfileTabChange}
            onNavigateToFull={mode === "overlay" ? () => navigate("/candidatos") : undefined}
            activeJob={activeJob}
            activeJobId={candidateActiveJobId}
            canTransferCurrentJob={canTransferCurrentJob}
            stageSaving={stageSaving}
            linkSaving={linkSaving}
            onStageChange={handleStageChange}
            onLinkToActiveJob={handleLinkToActiveJob}
            onOpenAddJob={handleOpenAddJob}
            onOpenTransferJob={handleOpenTransferJob}
          >
            {profileTabKey === "overview" && (
              <OverviewTabWithHistory
                overview={candidateOverview}
                activeJobId={candidateActiveJobId}
                activeJob={activeJob}
                activePipelineEntry={primaryPipelineEntry}
                onEdit={() => setEditModalOpen(true)}
                historyCacheRef={historyCacheRef}
              />
            )}

            {profileTabKey === "score" && (
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
              />
            )}

            {profileTabKey === "documents" && (
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
            )}
          </CandidateProfileView>
        ) : (
          <CandidateDrawerV1
            key={selectedCandidateId ?? "none"}
            candidate={candidate}
            candidateState={candidateState}
            currentStage={currentStage}
            activeJobLabel={activeJobLabel}
            activeJobCompatibilityScore={activeJobCompatibilityScore}
            hasActiveJob={Boolean(candidateActiveJobId)}
            aiScore={candidateOverview.latest_analysis?.overall_score ?? null}
            aiStatus={candidateOverview.latest_analysis?.status ?? null}
            scoreExplanation={scoreExplanation}
            linkStatus={linkStatus}
            isLoading={candidateLoading}
            activeTab={profileTabKey}
            actionFeedback={actionFeedback}
            interactionLocked={stageSaving || linkSaving || headerActionLoading}
            activeJob={activeJob}
            activeJobId={candidateActiveJobId}
            canTransferCurrentJob={canTransferCurrentJob}
            stageSaving={stageSaving}
            linkSaving={linkSaving}
            onClose={closeCandidate}
            onApprove={handleHeroApprove}
            onReject={handleHeroReject}
            onOpenDocuments={handleOpenDocuments}
            onTabChange={handleProfileTabChange}
            onStageChange={handleStageChange}
            onLinkToActiveJob={handleLinkToActiveJob}
            onOpenAddJob={handleOpenAddJob}
            onOpenTransferJob={handleOpenTransferJob}
          >
            {profileTabKey === "overview" && (
              <OverviewTab
                overview={candidateOverview}
                activeJobId={candidateActiveJobId}
                activeJob={activeJob}
                activePipelineEntry={primaryPipelineEntry}
                onEdit={() => setEditModalOpen(true)}
              />
            )}

            {profileTabKey === "score" && (
              <ScoreTab
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
              />
            )}

            {profileTabKey === "documents" && (
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
            )}
          </CandidateDrawerV1>
        )
        ) : null}

        {/* Error and loading states */}
        {candidateLoading ? (
          <div className="flex flex-1 flex-col">
            <div className="p-5">
              <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-4 py-3">
                <p className="text-sm font-semibold text-[hsl(var(--text))]">Carregando candidato…</p>
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

  // Modals content — shared between both modes
  const modalsContent = (
    <>
      <EditCandidateModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        candidate={candidate}
        onSuccess={async (candidateId) => {
          await Promise.all([syncCandidateOverview(candidateId), refreshBoard()]);
          notifyCandidatesChanged();
        }}
      />

      <AddJobModal
        isOpen={addJobModalOpen}
        candidateId={candidate?.id ?? null}
        jobs={jobs}
        linkedJobIds={linkedJobIds}
        excludedJobId={candidateActiveJobId}
        onClose={() => setAddJobModalOpen(false)}
        onSuccess={async () => {
          if (!candidate?.id) return;
          await invalidateJobState(candidateActiveJobId);
          setAddJobModalOpen(false);
        }}
      />

      <TransferJobModal
        isOpen={transferJobModalOpen}
        candidateId={candidate?.id ?? null}
        fromJobId={primaryPipelineEntry?.job_id ?? null}
        availableJobs={availableJobs}
        canTransfer={canTransferCurrentJob}
        onClose={() => setTransferJobModalOpen(false)}
        onSuccess={async () => {
          if (!candidate?.id) return;
          await invalidateJobState(primaryPipelineEntry?.job_id ?? null);
          setTransferJobModalOpen(false);
        }}
      />
    </>
  );

  // Mode: workspace — inline flex container
  if (mode === "workspace") {
    if (!isOpen) return null;

    return (
      <>
        <div
          role="complementary"
          aria-label="Painel do candidato"
          className="flex flex-1 flex-col overflow-hidden border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
        >
          {drawerContent}
        </div>
        {modalsContent}
      </>
    );
  }

  // Mode: overlay (default) — fixed positioned panel with dark overlay
  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={closeCandidate} aria-hidden="true" />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Painel do candidato"
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-full flex-col bg-[hsl(var(--surface))] shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {drawerContent}
      </div>

      {modalsContent}
    </>
  );
}


function TransferJobModal({
  isOpen,
  candidateId,
  fromJobId,
  availableJobs,
  canTransfer,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  candidateId: string | null;
  fromJobId: string | null;
  availableJobs: Job[];
  canTransfer: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [jobId, setJobId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setJobId(availableJobs[0]?.id ?? "");
    setReason("");
    setSaving(false);
    setError(null);
  }, [isOpen, availableJobs]);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!candidateId || !fromJobId || !jobId) return;
    if (!reason.trim()) {
      setError("Informe o motivo da transferência.");
      return;
    }
    if (!canTransfer) {
      setError("Candidato não possui vaga ativa. Use adicionar a uma vaga.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await pipelineService.transferCandidateJob(candidateId, {
        from_job_id: fromJobId,
        to_job_id: jobId,
        reason: reason.trim(),
      });
      toast.success("Candidato transferido para outra vaga");
      await onSuccess();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível transferir o candidato para a vaga selecionada.",
          "Tente novamente.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="ui-card fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Transferir/corrigir vaga</h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              O vínculo atual será desativado e o candidato entrará em <code>entry</code> na vaga destino.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))] disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning-soft))] px-4 py-3">
          <p className="text-sm font-semibold text-[hsl(var(--text))]">Aviso de impacto</p>
          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
            Esta ação retira o candidato do pipeline atual. Use apenas para corrigir o contexto da vaga.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Vaga destino</span>
            <select
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              disabled={saving || availableJobs.length === 0}
              className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-50"
            >
              {availableJobs.length === 0 ? (
                <option value="">Nenhuma vaga disponível</option>
              ) : (
                availableJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Motivo da transferência</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              disabled={saving}
              placeholder="Explique o impacto desta correção de vaga."
              className="ui-input rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !jobId || !reason.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Transferindo…" : "Confirmar"}
          </button>
        </div>
      </div>
    </>
  );
}
