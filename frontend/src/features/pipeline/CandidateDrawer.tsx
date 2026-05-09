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
import { useCandidateDecision } from "../candidates/drawer/hooks/useCandidateDecision";
import { useCandidateDrawerActions } from "../candidates/drawer/hooks/useCandidateDrawerActions";
import { useCandidateData } from "../candidates/drawer/hooks/useCandidateData";
import { DocumentsTab as DocumentsTabComponent } from "../candidates/drawer/tabs/DocumentsTab";
import { formatContextError } from "../../services/errorMessages";
import { feedback } from "../../services/feedback";
import { pipelineService } from "../../services/pipelineService";
import { toast } from "../../shared/utils/toast";
import {
  scoreExplanationService,
  type ScoreExplanationResponse,
} from "../../services/scoreExplanationService";
import type {
  CandidatePipelineHistory,
  Job,
  PipelineStage,
} from "../../types/domain";
import { type PanelTab, usePipeline } from "./PipelineContext";
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

const NEXT_PIPELINE_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  entry: "screening",
  screening: "hr_interview",
  hr_interview: "technical_interview",
  technical_interview: "final",
  final: "hired",
  offer: "hired",
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
      title:
        stage === "hired"
          ? "Aplicando aprovação"
          : stage === "rejected"
            ? "Encerrando candidatura"
            : `Movendo para ${label}`,
      detail:
        stage === "hired"
          ? "O candidato está sendo movido para Contratado."
          : stage === "rejected"
            ? "A candidatura está sendo encerrada."
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
          ? "Candidatura encerrada"
          : `Candidato movido para ${label}`,
    detail:
      stage === "hired"
        ? "O estado atual foi atualizado para Contratado."
        : stage === "rejected"
          ? "A candidatura foi encerrada para esta vaga."
          : "A etapa atual já foi sincronizada no workspace.",
  };
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
  const [actionFeedback, setActionFeedback] = useState<CandidateActionFeedback | null>(null);

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

  useEffect(() => {
    if (mode !== "overlay" || !isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, mode]);

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

  const handleStageChange = useCallback(
    async (newStage: PipelineStage) => {
      if (!selectedCandidateId || !currentStage || newStage === currentStage) return;

      const targetCandidateId = selectedCandidateId;

      if (pendingStageCandidateRef.current === targetCandidateId) return;

      pendingStageCandidateRef.current = targetCandidateId;
      setStageSavingCandidateId(targetCandidateId);

      pushActionFeedbackForCandidate(
        targetCandidateId,
        buildStageActionFeedback(newStage, "pending"),
      );

      feedback.moveCandidate.processing();

      try {
        await moveCandidateStage(targetCandidateId, newStage);

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
    ],
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
  }, [
    selectedCandidateId,
    activeBoardJobId,
    invalidateJobState,
    pushActionFeedbackForCandidate,
  ]);

  const handleOpenTransferJob = useCallback(() => {
    setTransferJobModalOpen(true);
  }, [setTransferJobModalOpen]);

  const handleProfileTabChange = useCallback(
    (tabKey: ProfileTabKey) => {
      setProfileTabKey(tabKey);

      const panelTabMap: Record<ProfileTabKey, PanelTab> = {
        overview: "summary",
        score: "score",
        documents: "documents",
      };

      switchPanelTab(panelTabMap[tabKey]);
    },
    [switchPanelTab],
  );

  useEffect(() => {
    if (!selectedCandidateId) return;

    setProfileTabKey("overview");
    setActionFeedback(null);
  }, [selectedCandidateId]);

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
    setProfileTabKey("score");
    switchPanelTab("score");
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
          hasActiveJob={Boolean(candidateActiveJobId)}
          aiScore={null}
          aiStatus={candidateOverview.latest_analysis?.status ?? null}
          analysisResult={analysisResult}
          rankingEntry={rankingEntry}
          scoreExplanation={scoreExplanation}
          isLoading={candidateLoading}
          isLoadingContent={profileTabKey === "score" && rankingEntryLoading}
          activeTab={profileTabKey}
          actionFeedback={actionFeedback}
          interactionLocked={stageSaving || linkSaving}
          compact={mode === "overlay"}
          onClose={closeCandidate}
          onAdvance={handleHeroAdvance}
          onTerminate={handleHeroTerminate}
          onViewAnalysis={handleHeroViewAnalysis}
          onTabChange={handleProfileTabChange}
          onNavigateToFull={mode === "overlay" ? () => navigate("/candidatos") : undefined}
          onBackToList={mode === "workspace" ? onBackToList : undefined}
          backToListLabel={backToListLabel}
          activeJob={activeJob}
          activeJobId={candidateActiveJobId}
          canTransferCurrentJob={canTransferCurrentJob}
          stageSaving={stageSaving}
          linkSaving={linkSaving}
          onStageChange={handleStageChange}
          onLinkToActiveJob={handleLinkToActiveJob}
          onOpenTransferJob={handleOpenTransferJob}
        >
          {profileTabKey === "overview" ? (
            <OverviewTabWithHistory
              overview={candidateOverview}
              activeJobId={candidateActiveJobId}
              activeJob={activeJob}
              activePipelineEntry={primaryPipelineEntry}
              onEdit={() => setEditModalOpen(true)}
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
            />
          ) : null}

          {profileTabKey === "documents" ? (
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
          ) : null}
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

      <TransferJobModal
        isOpen={transferJobModalOpen}
        candidateId={candidate?.id ?? null}
        fromJobId={primaryPipelineEntry?.job_id ?? null}
        availableJobs={transferAvailableJobs}
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

  if (mode === "workspace") {
    if (!isOpen) return null;

    return (
      <>
        <div
          role="complementary"
          aria-label="Painel do candidato"
          className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--surface))]"
        >
          {drawerContent}
        </div>
        {modalsContent}
      </>
    );
  }

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={closeCandidate}
          aria-hidden="true"
        />
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Painel do candidato"
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col bg-[hsl(var(--surface))] shadow-2xl",
          mode === "overlay" ? "overflow-y-auto" : "overflow-hidden",
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
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="ui-card fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">
              Transferir/corrigir vaga
            </h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              O vínculo atual será desativado e o candidato entrará em{" "}
              <code>entry</code> na vaga destino publicada.
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
          <p className="text-sm font-semibold text-[hsl(var(--text))]">
            Aviso de impacto
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
            Esta ação retira o candidato do pipeline atual. Use apenas para corrigir o contexto da vaga.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">
              Vaga destino
            </span>
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

          <p className="text-xs text-[hsl(var(--text-muted))]">
            Apenas vagas publicadas podem receber transferência.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">
              Motivo da transferência
            </span>
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
