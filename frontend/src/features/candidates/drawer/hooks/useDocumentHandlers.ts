import { useState, useCallback, useRef, useEffect } from "react";
import type { CandidateOverview } from "../../../../types/domain";
import type { CandidateActionFeedback } from "../v2/CandidateProfileView";
import { resumeService } from "../../../../services/resumeService";
import { analysisService } from "../../../../services/analysisService";
import { feedback } from "../../../../services/feedback";
import { formatErrorForToast, getHttpStatus, handleApiError } from "../../../../shared/utils/errorHandler";
import { toast } from "../../../../shared/utils/toast";

// Track active async operations for cleanup on unmount/candidate change
type AbortTrackerRef = React.MutableRefObject<Set<AbortController>>;

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

function isAnalysisInProgress(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === "pending" || status === "processing";
}

async function recoverInFlightAnalysis({
  candidateId,
  startPolling,
  syncAnalysisStart,
}: {
  candidateId: string;
  startPolling: (analysisId: string, cId: string, status: string, jobId: string | null) => void;
  syncAnalysisStart: (payload: {
    candidateId: string;
    analysisId: string;
    status: string;
    jobId: string | null;
    resumeId: string | null;
    resumeTitle: string | null;
  }) => Promise<void>;
}): Promise<boolean> {
  try {
    const result = await analysisService.getInFlightByCandidate(candidateId);
    if (!result) return false;
    await syncAnalysisStart({
      candidateId,
      analysisId: result.analysis_id,
      status: result.analysis_status,
      jobId: result.job_id ?? null,
      resumeId: result.resume_id ?? null,
      resumeTitle: result.resume_title ?? null,
    });
    startPolling(result.analysis_id, candidateId, result.analysis_status, result.job_id ?? null);
    return true;
  } catch {
    return false;
  }
}

function showManualAnalysisConflictToast() {
  toast.error(
    "Uma análise foi solicitada simultaneamente em outra aba. Reabra o candidato para sincronizar.",
  );
}

export interface DocumentHandlers {
  handleFileSelect: (file: File | null) => void;
  handleUpload: () => Promise<void>;
  handleEditSave: () => Promise<void>;
  handleToggleStatus: (resumeId: string, currentStatus: string) => Promise<void>;
  handleDelete: () => Promise<void>;
  handleAnalyze: (resumeId: string, versionId: string) => Promise<void>;
  clearFile: () => void;
}

export interface DocumentState {
  selectedFile: File | null;
  uploadLoading: boolean;
  isDragActive: boolean;
  editingResumeId: string | null;
  editTitle: string;
  editSaving: boolean;
  confirmDeleteId: string | null;
  deletingId: string | null;
  analyzingResumeId: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export interface DocumentStateSetters {
  setSelectedFile: (file: File | null) => void;
  setUploadLoading: (loading: boolean) => void;
  setIsDragActive: (active: boolean) => void;
  setEditingResumeId: (id: string | null) => void;
  setEditTitle: (title: string) => void;
  setEditSaving: (saving: boolean) => void;
  setConfirmDeleteId: (id: string | null) => void;
  setDeletingId: (id: string | null) => void;
  setAnalyzingResumeId: (id: string | null) => void;
}

interface UseDocumentHandlersParams {
  overview: CandidateOverview;
  activeJobId: string | null;
  canSpendRealTokens: boolean;
  // PipelineContext callbacks (passed as props now)
  refreshCandidateOverview: () => Promise<void>;
  startPolling: (analysisId: string, cId: string, status: string, jobId: string | null) => void;
  switchPanelTab: (tab: string) => void;
  syncAnalysisStart: (payload: {
    candidateId: string;
    analysisId: string;
    status: string;
    jobId: string | null;
    resumeId: string | null;
    resumeTitle: string | null;
  }) => Promise<void>;
  notifyCandidatesChanged: () => void;
  onActionFeedback?: (feedback: Omit<CandidateActionFeedback, "id">) => void;
  pollingAnalysisId: string | null;
}

export function useDocumentHandlers(
  params: UseDocumentHandlersParams,
  state: DocumentState,
  setters: DocumentStateSetters,
): DocumentHandlers {
  const {
    overview,
    activeJobId,
    canSpendRealTokens,
    refreshCandidateOverview,
    startPolling,
    switchPanelTab,
    syncAnalysisStart,
    notifyCandidatesChanged,
    onActionFeedback,
    pollingAnalysisId,
  } = params;

  const { resumes, latest_analysis } = overview;
  const activeControllersRef = useRef<Set<AbortController>>(new Set());
  const pendingManualAnalysisRef = useRef<string | null>(null);

  // Cleanup: abort all pending async operations on unmount or candidate change
  useEffect(() => {
    return () => {
      activeControllersRef.current.forEach((controller) => controller.abort());
      activeControllersRef.current.clear();
    };
  }, [overview.candidate.id]);

  useEffect(() => {
    if (pollingAnalysisId === null) {
      setters.setAnalyzingResumeId(null);
      pendingManualAnalysisRef.current = null;
    }
  }, [pollingAnalysisId, setters]);

  const clearFile = useCallback(() => {
    setters.setSelectedFile(null);
    if (state.fileInputRef.current) {
      state.fileInputRef.current.value = "";
    }
  }, [state.fileInputRef, setters]);

  const handleFileSelect = useCallback(
    (file: File | null) => {
      if (!file) {
        clearFile();
        return;
      }
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.warning("Selecione um arquivo com extensão .pdf");
        clearFile();
        return;
      }
      if (file.size > MAX_PDF_UPLOAD_BYTES) {
        toast.warning("Arquivo PDF excede o limite de 10 MB");
        clearFile();
        return;
      }
      setters.setSelectedFile(file);
    },
    [clearFile, setters],
  );

  const handleUpload = useCallback(async () => {
    if (!state.selectedFile) return;
    if (!overview.candidate.id) {
      toast.error("Não foi possível enviar o currículo. Abra o candidato novamente e tente outra vez.");
      return;
    }

    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    setters.setUploadLoading(true);
    feedback.uploadResume.processing();
    try {
      const payload = await resumeService.initiateUpload(overview.candidate.id);
      if (controller.signal.aborted) return;

      const uploaded = await resumeService.uploadPdf(payload.resume_id, state.selectedFile);
      if (controller.signal.aborted) return;

      clearFile();
      await refreshCandidateOverview();
      if (controller.signal.aborted) return;

      switchPanelTab("analysis");
      feedback.uploadResume.success();

      if (uploaded.analysis_auto_requested && uploaded.analysis_id) {
        await syncAnalysisStart({
          candidateId: overview.candidate.id,
          analysisId: uploaded.analysis_id,
          status: uploaded.analysis_status ?? "pending",
          jobId: activeJobId,
          resumeId: uploaded.resume_id,
          resumeTitle: state.selectedFile.name,
        });
        if (!controller.signal.aborted) {
          startPolling(
            uploaded.analysis_id,
            overview.candidate.id,
            uploaded.analysis_status ?? "pending",
            activeJobId,
          );
        }
      } else {
        notifyCandidatesChanged();
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        feedback.uploadResume.error(err);
      }
    } finally {
      if (!controller.signal.aborted) {
        setters.setUploadLoading(false);
      }
      activeControllersRef.current.delete(controller);
    }
  }, [
    state.selectedFile,
    overview,
    activeJobId,
    clearFile,
    refreshCandidateOverview,
    switchPanelTab,
    syncAnalysisStart,
    notifyCandidatesChanged,
    startPolling,
    setters,
  ]);

  const handleEditSave = useCallback(async () => {
    if (!state.editingResumeId || !state.editTitle.trim()) return;

    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    setters.setEditSaving(true);
    try {
      await resumeService.update(state.editingResumeId, { title: state.editTitle.trim() });
      if (controller.signal.aborted) return;

      toast.success("Título atualizado");
      setters.setEditingResumeId(null);
      await refreshCandidateOverview();
      if (controller.signal.aborted) return;

      notifyCandidatesChanged();
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error(formatErrorForToast(handleApiError(err)));
      }
    } finally {
      if (!controller.signal.aborted) {
        setters.setEditSaving(false);
      }
      activeControllersRef.current.delete(controller);
    }
  }, [state.editingResumeId, state.editTitle, refreshCandidateOverview, notifyCandidatesChanged, setters]);

  const handleToggleStatus = useCallback(
    async (resumeId: string, currentStatus: string) => {
      const controller = new AbortController();
      activeControllersRef.current.add(controller);

      try {
        if (currentStatus === "active") {
          await resumeService.archive(resumeId);
          if (controller.signal.aborted) return;
          toast.success("Currículo arquivado");
        } else {
          await resumeService.activate(resumeId);
          if (controller.signal.aborted) return;
          toast.success("Currículo reativado");
        }
        await refreshCandidateOverview();
        if (controller.signal.aborted) return;

        notifyCandidatesChanged();
      } catch (err) {
        if (!controller.signal.aborted) {
          toast.error(formatErrorForToast(handleApiError(err)));
        }
      } finally {
        activeControllersRef.current.delete(controller);
      }
    },
    [refreshCandidateOverview, notifyCandidatesChanged],
  );

  const handleDelete = useCallback(async () => {
    if (!state.confirmDeleteId) return;

    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    setters.setDeletingId(state.confirmDeleteId);
    setters.setConfirmDeleteId(null);
    try {
      await resumeService.delete(state.confirmDeleteId);
      if (controller.signal.aborted) return;

      toast.success("Currículo excluído");
      await refreshCandidateOverview();
      if (controller.signal.aborted) return;

      notifyCandidatesChanged();
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error(formatErrorForToast(handleApiError(err)));
      }
    } finally {
      if (!controller.signal.aborted) {
        setters.setDeletingId(null);
      }
      activeControllersRef.current.delete(controller);
    }
  }, [state.confirmDeleteId, refreshCandidateOverview, notifyCandidatesChanged, setters]);

  const handleAnalyze = useCallback(
    async (resumeId: string, versionId: string) => {
      if (pendingManualAnalysisRef.current === resumeId) return;
      const manualJobId = activeJobId;
      if (!canSpendRealTokens) {
        toast.warning("Consumo real bloqueado — ative real_ai_token_spend_enabled para analisar.");
        return;
      }
      if (!manualJobId) {
        toast.info("Candidato sem vaga ativa. Adicione o candidato a uma vaga antes de solicitar análise.");
        return;
      }
      if (isAnalysisInProgress(latest_analysis?.status ?? null)) {
        toast.info("Já existe uma análise em andamento para este candidato.");
        return;
      }
      if (pollingAnalysisId !== null) {
        toast.info("Já existe uma análise em andamento para este candidato.");
        return;
      }

      const controller = new AbortController();
      activeControllersRef.current.add(controller);

      const reusedInFlightAnalysis = await recoverInFlightAnalysis({
        candidateId: overview.candidate.id,
        startPolling,
        syncAnalysisStart,
      });
      if (reusedInFlightAnalysis) {
        toast.info("Já existe uma análise em andamento para este candidato.");
        activeControllersRef.current.delete(controller);
        return;
      }

      pendingManualAnalysisRef.current = resumeId;
      setters.setAnalyzingResumeId(resumeId);
      onActionFeedback?.({
        tone: "info",
        pending: true,
        title: "Solicitando reanálise",
        detail: "O status será atualizado automaticamente neste workspace.",
      });
      feedback.requestAnalysis.processing();
      try {
        const response = await analysisService.request(versionId, manualJobId);
        if (controller.signal.aborted) return;

        const resume = resumes.find((item) => item.resume_id === resumeId);
        await syncAnalysisStart({
          candidateId: overview.candidate.id,
          analysisId: response.analysis_id,
          status: "pending",
          jobId: manualJobId,
          resumeId,
          resumeTitle: resume?.title ?? null,
        });
        if (controller.signal.aborted) return;

        startPolling(response.analysis_id, overview.candidate.id, "pending", manualJobId);
        onActionFeedback?.({
          tone: "info",
          title: "Reanálise iniciada",
          detail: "A IA entrou em processamento e o candidato já foi atualizado.",
        });
        feedback.requestAnalysis.success();
      } catch (err) {
        if (controller.signal.aborted) {
          activeControllersRef.current.delete(controller);
          return;
        }

        if (getHttpStatus(err) === 409) {
          const recovered = await recoverInFlightAnalysis({
            candidateId: overview.candidate.id,
            startPolling,
            syncAnalysisStart,
          });
          if (recovered) {
            onActionFeedback?.({
              tone: "info",
              title: "Análise retomada",
              detail: "Já existia uma execução em andamento para este candidato.",
            });
            toast.info("Uma análise já estava em andamento e foi retomada.");
            activeControllersRef.current.delete(controller);
            pendingManualAnalysisRef.current = null;
            return;
          }
          showManualAnalysisConflictToast();
          activeControllersRef.current.delete(controller);
          pendingManualAnalysisRef.current = null;
          return;
        }
        feedback.requestAnalysis.error(err);
        onActionFeedback?.({
          tone: "danger",
          title: "Falha ao iniciar a reanálise",
          detail: "A solicitação não foi aplicada. Revise o estado atual e tente novamente.",
        });
        setters.setAnalyzingResumeId(null);
        pendingManualAnalysisRef.current = null;
      } finally {
        activeControllersRef.current.delete(controller);
        if (controller.signal.aborted) {
          pendingManualAnalysisRef.current = null;
        }
      }
    },
    [
      activeJobId,
      canSpendRealTokens,
      latest_analysis,
      overview,
      pollingAnalysisId,
      startPolling,
      syncAnalysisStart,
      resumes,
      setters,
      onActionFeedback,
    ],
  );

  return {
    handleFileSelect,
    handleUpload,
    handleEditSave,
    handleToggleStatus,
    handleDelete,
    handleAnalyze,
    clearFile,
  };
}
