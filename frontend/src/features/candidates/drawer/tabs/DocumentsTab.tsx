import { useRef, useState } from "react";
import type { CandidateOverview } from "../../../../types/domain";
import type { PanelTab } from "../../../pipeline/PipelineContext";
import type { CandidateActionFeedback } from "../v2/CandidateProfileView";
import { getExtractionStatusLabel } from "../../../../shared/utils/extractionStatus";
import { Section, StatusCard, EmptyTab } from "../components/DrawerSectionHelpers";
import { useDocumentHandlers } from "../hooks/useDocumentHandlers";
import { resumeService } from "../../../../services/resumeService";
import { toast } from "../../../../shared/utils/toast";

type AnalysisStatus =
  | "waiting_extraction"
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled";

type DocumentsTabProps = {
  overview: CandidateOverview;
  activeJobId: string | null;
  activePipelineEntry: CandidateOverview["pipeline_entries"][number] | null;
  compatibilityGuidance?: unknown;
  canSpendRealTokens: boolean;
  pollingAnalysisId: string | null;
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
  userRole?: string;
};

const ANALYSIS_STATUS_LABEL: Record<AnalysisStatus, string> = {
  waiting_extraction: "Aguardando extração",
  pending: "Na fila",
  processing: "Processando",
  retry_scheduled: "Nova tentativa agendada",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};

export function DocumentsTab(props: DocumentsTabProps) {
  const {
    overview,
    activeJobId,
    canSpendRealTokens,
    userRole,
    pollingAnalysisId,
    refreshCandidateOverview,
    startPolling,
    switchPanelTab,
    syncAnalysisStart,
    notifyCandidatesChanged,
    onActionFeedback,
  } = props;

  const { resumes, latest_analysis } = overview;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);
  const [downloadingResume, setDownloadingResume] = useState(false);

  const canDownloadResume = userRole === "admin" || userRole === "recruiter";

  const handleDownloadResume = async () => {
    if (!overview.candidate?.id || downloadingResume) return;
    setDownloadingResume(true);
    try {
      await resumeService.downloadByCandidateId(overview.candidate.id);
    } catch {
      toast.error("Não foi possível baixar o currículo. Tente novamente.");
    } finally {
      setDownloadingResume(false);
    }
  };

  const handlers = useDocumentHandlers(
    {
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
    },
    {
      selectedFile,
      uploadLoading,
      isDragActive,
      editingResumeId,
      editTitle,
      editSaving,
      confirmDeleteId,
      deletingId,
      analyzingResumeId,
      fileInputRef,
    },
    {
      setSelectedFile,
      setUploadLoading,
      setIsDragActive,
      setEditingResumeId,
      setEditTitle,
      setEditSaving,
      setConfirmDeleteId,
      setDeletingId,
      setAnalyzingResumeId,
    },
  );

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section title="Fluxo currículo → análise IA">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusCard
            label="Última análise"
            title={
              latest_analysis
                ? ANALYSIS_STATUS_LABEL[latest_analysis.status as AnalysisStatus] ??
                  latest_analysis.status
                : "Ainda não solicitada"
            }
            description={
              latest_analysis
                ? `Currículo: ${latest_analysis.resume_title}`
                : "Envie um currículo para iniciar o fluxo de análise."
            }
          />
          <StatusCard
            label="Processamento do currículo"
            title={
              resumes[0]?.extraction_status
                ? getExtractionStatusLabel(resumes[0].extraction_status)
                : "Sem currículo"
            }
            description="Upload, extração do PDF e disponibilidade para análise."
          />
        </div>
      </Section>

      {!canSpendRealTokens ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Consumo real bloqueado — ative{" "}
          <code>real_ai_token_spend_enabled</code> para analisar currículos.
        </div>
      ) : null}

      <Section title="Enviar currículo">
        <input
          type="file"
          accept="application/pdf,.pdf"
          ref={fileInputRef}
          disabled={uploadLoading}
          onChange={(event) => handlers.handleFileSelect(event.target.files?.[0] ?? null)}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!uploadLoading) setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploadLoading) setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            if (uploadLoading) return;
            handlers.handleFileSelect(event.dataTransfer.files?.[0] ?? null);
          }}
          disabled={uploadLoading}
          className={[
            "flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition",
            isDragActive
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))]"
              : "border-border bg-surface-muted hover:border-[hsl(var(--primary))]/45 hover:bg-[hsl(var(--accent-soft))]/60",
            uploadLoading ? "cursor-wait opacity-70" : "cursor-pointer",
          ].join(" ")}
        >
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-[hsl(var(--primary))] shadow-sm">
            PDF do currículo
          </span>
          <span className="mt-3 text-sm font-semibold text-text">
            Envie o currículo para iniciar a análise da IA
          </span>
          <span className="mt-1 text-xs text-text-muted">
            Clique para selecionar ou arraste o PDF para esta área
          </span>
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handlers.handleUpload()}
            disabled={uploadLoading || !selectedFile}
            className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
          >
            {uploadLoading ? "Enviando currículo…" : "Enviar currículo"}
          </button>

          {selectedFile ? (
            <button
              type="button"
              onClick={handlers.clearFile}
              disabled={uploadLoading}
              className="ui-btn-secondary rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-40"
            >
              Remover arquivo
            </button>
          ) : null}
        </div>

        {selectedFile ? (
          <p className="mt-2 text-[11px] text-text-muted">
            {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
          </p>
        ) : null}
      </Section>

      <Section title="Documentos de admissão">
        <EmptyTab
          title="Documentos de admissão ainda não disponíveis"
          description="Este espaço será preenchido quando houver documentos de admissão no payload atual."
          compact
        />
      </Section>

      {resumes.length === 0 ? (
        <EmptyTab
          title="Ainda não há currículos enviados"
          description="Envie o currículo para iniciar a análise da IA."
        />
      ) : (
        <Section title="Currículos">
          <div className="flex flex-col gap-3">
            {resumes.map((resume) => {
              const isEditing = editingResumeId === resume.resume_id;
              const isDeleting = deletingId === resume.resume_id;
              const isAnalyzing = analyzingResumeId === resume.resume_id;
              const canAnalyze =
                Boolean(resume.current_version_id) &&
                resume.extraction_status === "completed";

              return (
                <div
                  key={resume.resume_id}
                  className={[
                    "rounded-xl border border-border bg-surface-muted px-4 py-3 transition-opacity",
                    isDeleting ? "opacity-40" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            className="ui-input h-8 flex-1 rounded-lg px-3 text-sm"
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void handlers.handleEditSave();
                              if (event.key === "Escape") setEditingResumeId(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void handlers.handleEditSave()}
                            disabled={editSaving || !editTitle.trim()}
                            className="rounded-lg bg-[hsl(var(--primary))] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                          >
                            {editSaving ? "…" : "OK"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingResumeId(null)}
                            className="text-[11px] text-text-muted"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <p className="truncate text-sm font-semibold text-text">
                          {resume.title}
                        </p>
                      )}

                      {resume.current_file_name ? (
                        <p className="mt-0.5 truncate text-[11px] text-text-muted">
                          {resume.current_file_name}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                          resume.status === "active"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-gray-100 text-gray-500 ring-gray-200",
                        ].join(" ")}
                      >
                        {resume.status === "active" ? "Ativo" : "Arquivado"}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                          resume.extraction_status === "completed"
                            ? "bg-blue-50 text-blue-700 ring-blue-200"
                            : resume.extraction_status === "failed"
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : "bg-gray-50 text-gray-500 ring-gray-200",
                        ].join(" ")}
                      >
                        {resume.extraction_status
                          ? getExtractionStatusLabel(resume.extraction_status)
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-text-muted">
                    <span>v{resume.current_version}</span>
                    <span>{new Date(resume.updated_at).toLocaleDateString("pt-BR")}</span>
                  </div>

                  {!isEditing ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {canDownloadResume && resume.current_version_id ? (
                        <button
                          type="button"
                          onClick={() => void handleDownloadResume()}
                          disabled={downloadingResume}
                          className="rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--accent-soft))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))]/10 disabled:opacity-40"
                        >
                          {downloadingResume ? "Baixando…" : "Abrir currículo"}
                        </button>
                      ) : canDownloadResume && !resume.current_version_id ? (
                        <span className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-text-muted">
                          Currículo não enviado
                        </span>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingResumeId(resume.resume_id);
                          setEditTitle(resume.title);
                        }}
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted transition hover:bg-surface"
                      >
                        Editar título
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handlers.handleToggleStatus(resume.resume_id, resume.status)
                        }
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted transition hover:bg-surface"
                      >
                        {resume.status === "active" ? "Arquivar" : "Reativar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(resume.resume_id)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
                      >
                        Excluir
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!resume.current_version_id) return;
                          void handlers.handleAnalyze(
                            resume.resume_id,
                            resume.current_version_id,
                          );
                        }}
                        disabled={
                          !canAnalyze ||
                          isAnalyzing ||
                          pollingAnalysisId !== null ||
                          !canSpendRealTokens
                        }
                        className="rounded-lg bg-[hsl(var(--primary))] px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
                      >
                        {isAnalyzing ? "Solicitando…" : "Análise manual"}
                      </button>
                    </div>
                  ) : null}

                  {!isEditing && canAnalyze ? (
                    <p className="mt-2 text-[11px] text-text-muted">
                      Atalho manual. O acompanhamento da execução fica na aba Análise IA.
                    </p>
                  ) : null}

                  {confirmDeleteId === resume.resume_id ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-xs text-red-700">
                        Confirmar exclusão deste currículo?
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handlers.handleDelete()}
                          className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-red-700"
                        >
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted transition hover:bg-surface"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
