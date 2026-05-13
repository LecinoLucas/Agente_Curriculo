import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CandidateOverview } from "../../../../types/domain";
import type { PanelTab } from "../../../pipeline/PipelineContext";
import type { CandidateActionFeedback } from "../v2/CandidateProfileView";
import { resumeService } from "../../../../services/resumeService";
import { analysisService } from "../../../../services/analysisService";
import { feedback } from "../../../../services/feedback";
import { useExtractionPolling } from "../../../../shared/hooks/useExtractionPolling";
import {
  formatErrorForToast,
  getHttpStatus,
  handleApiError,
} from "../../../../shared/utils/errorHandler";
import { isExtractionInProgress } from "../../../../shared/utils/extractionStatus";
import { toast } from "../../../../shared/utils/toast";
import { getLatestAnalysisForActiveJob } from "../../utils/analysisStatus";

type AnalysisStatus =
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled"
  | "discarded";

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

function isAnalysisStatus(status: string | null | undefined): status is AnalysisStatus {
  return (
    status === "pending" ||
    status === "processing" ||
    status === "retry_scheduled" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "discarded"
  );
}

function normalizeAnalysisStatus(status: string | null | undefined): AnalysisStatus {
  return isAnalysisStatus(status) ? status : "pending";
}

function isAnalysisInProgress(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

async function recoverInFlightAnalysis({
  candidateId,
  startPolling,
  syncAnalysisStart,
}: {
  candidateId: string;
  startPolling: (
    analysisId: string,
    candidateId?: string | null,
    initialStatus?: AnalysisStatus | null,
    jobId?: string | null,
  ) => void;
  syncAnalysisStart: (payload: {
    candidateId: string;
    analysisId: string;
    status: AnalysisStatus;
    jobId: string | null;
    resumeId: string | null;
    resumeTitle: string | null;
  }) => Promise<void>;
}): Promise<boolean> {
  try {
    const result = await analysisService.getInFlightByCandidate(candidateId);
    if (!result) return false;

    const status = normalizeAnalysisStatus(result.analysis_status);

    await syncAnalysisStart({
      candidateId,
      analysisId: result.analysis_id,
      status,
      jobId: result.job_id ?? null,
      resumeId: result.resume_id ?? null,
      resumeTitle: result.resume_title ?? null,
    });

    startPolling(result.analysis_id, candidateId, status, result.job_id ?? null);

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
  fileInputRef: RefObject<HTMLInputElement | null>;
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
  refreshCandidateOverview: () => Promise<void>;
  startPolling: (
    analysisId: string,
    candidateId?: string | null,
    initialStatus?: AnalysisStatus | null,
    jobId?: string | null,
  ) => void;
  switchPanelTab: (tab: PanelTab) => void;
  syncAnalysisStart: (payload: {
    candidateId: string;
    analysisId: string;
    status: AnalysisStatus;
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
    syncAnalysisStart,
    notifyCandidatesChanged,
    onActionFeedback,
    pollingAnalysisId,
  } = params;

  const { latest_analysis, resumes } = overview;
  const activeControllersRef = useRef<Set<AbortController>>(new Set());
  const pendingManualAnalysisRef = useRef<string | null>(null);
  const [extractionPollingIds, setExtractionPollingIds] = useState<string[]>([]);

  useExtractionPolling({
    items: extractionPollingIds,
    enabled: extractionPollingIds.length > 0,
    intervalMs: 2000,
    onCompleted: async (resumeId) => {
      setExtractionPollingIds((current) => current.filter((item) => item !== resumeId));
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    },
    onFailed: async (resumeId, status) => {
      setExtractionPollingIds((current) => current.filter((item) => item !== resumeId));
      await refreshCandidateOverview();
      notifyCandidatesChanged();
      toast.error(status.extraction_error || "Falha ao extrair o currículo enviado.");
    },
  });

  useEffect(() => {
    return () => {
      activeControllersRef.current.forEach((controller) => controller.abort());
      activeControllersRef.current.clear();
    };
  }, [overview.candidate.id]);

  useEffect(() => {
    setExtractionPollingIds([]);
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
      toast.error(
        "Não foi possível enviar o currículo. Abra o candidato novamente e tente outra vez.",
      );
      return;
    }

    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    setters.setUploadLoading(true);
    feedback.uploadResume.processing();

    try {
      const selectedFileName = state.selectedFile.name;

      const payload = await resumeService.initiateUpload(overview.candidate.id);
      if (controller.signal.aborted) return;

      const uploaded = await resumeService.uploadPdf(payload.resume_id, state.selectedFile);
      if (controller.signal.aborted) return;

      clearFile();

      await refreshCandidateOverview();
      if (controller.signal.aborted) return;

      feedback.uploadResume.success();
      notifyCandidatesChanged();

      if (isExtractionInProgress(uploaded.extraction_status)) {
        setExtractionPollingIds((current) =>
          current.includes(uploaded.resume_id) ? current : [...current, uploaded.resume_id],
        );
      }

      if (uploaded.analysis_auto_requested && uploaded.analysis_id) {
        const status = normalizeAnalysisStatus(uploaded.analysis_status);

        await syncAnalysisStart({
          candidateId: overview.candidate.id,
          analysisId: uploaded.analysis_id,
          status,
          jobId: activeJobId,
          resumeId: uploaded.resume_id,
          resumeTitle: selectedFileName,
        });

        if (!controller.signal.aborted) {
          startPolling(uploaded.analysis_id, overview.candidate.id, status, activeJobId);
        }
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
    overview.candidate.id,
    activeJobId,
    clearFile,
    refreshCandidateOverview,
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
      await resumeService.update(state.editingResumeId, {
        title: state.editTitle.trim(),
      });

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
  }, [
    state.editingResumeId,
    state.editTitle,
    refreshCandidateOverview,
    notifyCandidatesChanged,
    setters,
  ]);

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
  }, [
    state.confirmDeleteId,
    refreshCandidateOverview,
    notifyCandidatesChanged,
    setters,
  ]);

  const handleAnalyze = useCallback(
    async (resumeId: string, versionId: string) => {
      if (pendingManualAnalysisRef.current === resumeId) return;

      const manualJobId = activeJobId;

      if (!canSpendRealTokens) {
        toast.warning(
          "Consumo real bloqueado — ative real_ai_token_spend_enabled para analisar.",
        );
        return;
      }

      if (!manualJobId) {
        toast.info(
          "Candidato sem vaga ativa. Adicione o candidato a uma vaga antes de solicitar análise.",
        );
        return;
      }

      const activeJobAnalysis = getLatestAnalysisForActiveJob(latest_analysis, manualJobId);

      if (isAnalysisInProgress(activeJobAnalysis?.status ?? null)) {
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

      if (controller.signal.aborted) {
        activeControllersRef.current.delete(controller);
        return;
      }

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
        const response = await analysisService.request(versionId, manualJobId, { force: true });
        if (controller.signal.aborted) return;

        const resume = resumes.find((item) => item.resume_id === resumeId);
        const analysisStatus = normalizeAnalysisStatus(response.status);

        await syncAnalysisStart({
          candidateId: overview.candidate.id,
          analysisId: response.analysis_id,
          status: analysisStatus,
          jobId: manualJobId,
          resumeId,
          resumeTitle: resume?.title ?? null,
        });

        if (controller.signal.aborted) return;

        if (
          analysisStatus === "pending" ||
          analysisStatus === "processing" ||
          analysisStatus === "retry_scheduled"
        ) {
          startPolling(response.analysis_id, overview.candidate.id, analysisStatus, manualJobId);
        }

        onActionFeedback?.({
          tone: "info",
          title: response.created ? "Reanálise iniciada" : "Análise sincronizada",
          detail: response.created
            ? "A IA entrou em processamento e o candidato já foi atualizado."
            : "O status real da análise foi sincronizado neste workspace.",
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
      overview.candidate.id,
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
