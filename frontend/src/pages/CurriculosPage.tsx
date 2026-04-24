import { useEffect, useRef, useState } from "react";

import { EmptyState } from "../components/common/EmptyState";
import { useAnalysisPolling } from "../hooks/useAnalysisPolling";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { resumeService } from "../services/resumeService";
import { analysisService, matchToJob } from "../services/analysisService";
import { listJobs } from "../services/jobsService";
import { toast } from "../services/toast";
import { AnalysisMatch, AnalysisStatus, Job, ResumeSummary } from "../types/domain";

type ProcessState = {
  loading: boolean;
  error: string | null;
  match?: AnalysisMatch;
  analysisId?: string;
  pollStatus?: string;
};

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

function formatShortId(value: string | null | undefined) {
  if (!value) return "N/A";
  return `${value.slice(0, 8)}…`;
}

function extractionLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    completed: "Pronto para análise",
    pending: "Extração pendente",
    failed: "Falha na extração",
  };
  return labels[status ?? ""] ?? (status || "Sem status");
}

function extractionTone(status: string | null | undefined): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

function resumeStatusLabel(status: string) {
  return status === "active" ? "Ativo" : status === "archived" ? "Arquivado" : status;
}

function formatProcessingStatus(status: AnalysisStatus) {
  if (status.status === "pending" && status.next_retry_at) {
    return `Aguardando retry (${status.retry_count}) até ${new Date(status.next_retry_at).toLocaleString()}`;
  }
  if (status.status === "processing") {
    return "Processando análise...";
  }
  if (status.status === "completed") {
    return "Análise concluída";
  }
  if (status.status === "failed" || status.status === "cancelled") {
    return `Análise encerrada: ${status.status}`;
  }
  return `Status: ${status.status}`;
}

export function CurriculosPage() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");

  const [editingResume, setEditingResume] = useState<ResumeSummary | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [processingMap, setProcessingMap] = useState<Record<string, ProcessState>>({});

  async function loadResumes() {
    setLoadingResumes(true);
    setLoadError(null);
    try {
      setResumes(await resumeService.list());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Falha ao carregar currículos");
    } finally {
      setLoadingResumes(false);
    }
  }

  async function loadJobs() {
    try {
      const resp = await listJobs(1, 100);
      setJobs(resp.data);
    } catch {
      // jobs dropdown is optional
    }
  }

  useEffect(() => {
    void loadResumes();
    void loadJobs();
  }, []);

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileSelection(file: File | null) {
    if (!file) {
      clearSelectedFile();
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.warning("Selecione um arquivo com extensão .pdf");
      clearSelectedFile();
      return;
    }
    if (file.type && !["application/pdf", "application/octet-stream"].includes(file.type)) {
      toast.warning("Arquivo deve ser enviado como PDF");
      clearSelectedFile();
      return;
    }
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      toast.warning("Arquivo PDF excede o limite de 10MB");
      clearSelectedFile();
      return;
    }
    setSelectedFile(file);
  }

  useAnalysisPolling({
    targets: Object.entries(processingMap)
      .filter(([, state]) => state.loading && state.analysisId)
      .map(([resumeId, state]) => ({ key: resumeId, analysisId: state.analysisId! })),
    onStatus: async (target, statusRes) => {
      setProcessingMap((currentMap) => {
        const currentState = currentMap[target.key];
        if (!currentState) {
          return currentMap;
        }

        return {
          ...currentMap,
          [target.key]: {
            ...currentState,
            pollStatus: formatProcessingStatus(statusRes),
          },
        };
      });

      if (statusRes.status === "completed") {
        setProcessingMap((currentMap) => ({
          ...currentMap,
          [target.key]: {
            ...currentMap[target.key],
            loading: false,
            error: null,
            analysisId: statusRes.analysis_id,
            pollStatus: "Análise concluída",
          },
        }));

        if (selectedJobId) {
          const match = await matchToJob(statusRes.analysis_id, selectedJobId);
          setProcessingMap((currentMap) => ({
            ...currentMap,
            [target.key]: {
              ...currentMap[target.key],
              loading: false,
              error: null,
              match,
              analysisId: statusRes.analysis_id,
              pollStatus: "Análise concluída e match finalizado",
            },
          }));
        }
      }

      if (statusRes.status === "failed" || statusRes.status === "cancelled") {
        setProcessingMap((currentMap) => ({
          ...currentMap,
          [target.key]: {
            ...currentMap[target.key],
            loading: false,
            error: statusRes.failure_reason ?? `Análise encerrada: ${statusRes.status}`,
            analysisId: statusRes.analysis_id,
            pollStatus: formatProcessingStatus(statusRes),
          },
        }));
      }
    },
  });

  async function handleUploadPdf() {
    if (!selectedFile) {
      toast.warning("Selecione um arquivo PDF antes de enviar");
      return;
    }

    setUploadLoading(true);
    try {
      const payload = await resumeService.initiateUpload();
      const uploaded = await resumeService.uploadPdf(payload.resume_id, selectedFile);
      const prefillMessage = uploaded.prefilled_fields.length
        ? ` Pré-cadastro atualizado para ${uploaded.candidate_full_name}: ${uploaded.prefilled_fields.join(", ")}.`
        : ` Candidato associado: ${uploaded.candidate_full_name}.`;
      toast.success(
        `PDF enviado e extraído: ${uploaded.word_count ?? 0} palavras em ${uploaded.page_count ?? 0} página(s).${prefillMessage}`,
      );
      clearSelectedFile();
      await loadResumes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar PDF");
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleEditSave() {
    if (!editingResume || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await resumeService.update(editingResume.id, { title: editTitle.trim() });
      toast.success("Título atualizado");
      setEditingResume(null);
      await loadResumes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar currículo");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleStatus(resume: ResumeSummary) {
    try {
      if (resume.status === "active") {
        await resumeService.archive(resume.id);
        toast.success(`Currículo "${resume.title}" arquivado`);
      } else {
        await resumeService.activate(resume.id);
        toast.success(`Currículo "${resume.title}" reativado`);
      }
      await loadResumes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar status do currículo");
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    const resume = resumes.find((r) => r.id === confirmDeleteId);
    try {
      await resumeService.delete(confirmDeleteId);
      toast.success(`Currículo "${resume?.title ?? ""}" excluído`);
      setConfirmDeleteId(null);
      setProcessingMap((m) => {
        const next = { ...m };
        delete next[confirmDeleteId];
        return next;
      });
      await loadResumes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir currículo");
      setConfirmDeleteId(null);
    }
  }

  async function handleAnalyze(resume: ResumeSummary) {
    if (!resume.current_version_id) {
      toast.warning("Currículo sem versão atual para análise");
      return;
    }
    if (resume.extraction_status !== "completed") {
      toast.warning("Envie um PDF válido e aguarde a extração antes de analisar");
      return;
    }
    setProcessingMap((m) => ({
      ...m,
      [resume.id]: { loading: true, error: null, pollStatus: "Solicitando análise..." },
    }));
    try {
      const req = await analysisService.request(resume.current_version_id);
      setProcessingMap((m) => ({
        ...m,
        [resume.id]: {
          loading: true,
          error: null,
          analysisId: req.analysis_id,
          pollStatus: "Aguardando processamento...",
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao solicitar análise";
      setProcessingMap((m) => ({
        ...m,
        [resume.id]: { loading: false, error: message },
      }));
    }
  }

  const readyResumes = resumes.filter((resume) => resume.extraction_status === "completed").length;
  const activeResumes = resumes.filter((resume) => resume.status === "active").length;
  const processingCount = Object.values(processingMap).filter((state) => state.loading).length;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  return (
    <div className="page-grid">
      <PageHeader title="Currículos" subtitle="Central de documentos dos candidatos e preparo para análise" />

      <div className="stats-mini">
        <div className="stat-mini">
          <div className="stat-mini-label">Total de currículos</div>
          <div className="stat-mini-value">{resumes.length}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">Prontos para análise</div>
          <div className="stat-mini-value">{readyResumes}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">Ativos</div>
          <div className="stat-mini-value">{activeResumes}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-mini-label">Processando agora</div>
          <div className="stat-mini-value">{processingCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ margin: 0 }}>Entrada de documentos</h3>
          <p className="text-muted">
            Envie um PDF para criar o currículo, extrair o texto e iniciar o pré-cadastro do candidato.
          </p>
        </div>

        <div className="info-grid" style={{ marginBottom: 16 }}>
          <div className="info-row">
            <span className="info-label">Formato aceito</span>
            <span className="info-value">PDF até 10 MB</span>
          </div>
          <div className="info-row">
            <span className="info-label">Resultado esperado</span>
            <span className="info-value">Texto extraído, currículo criado e candidato enriquecido automaticamente</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            accept="application/pdf,.pdf"
            disabled={uploadLoading}
            ref={fileInputRef}
            type="file"
            onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
          />
          <button
            className="btn"
            type="button"
            onClick={() => void handleUploadPdf()}
            disabled={uploadLoading || !selectedFile}
          >
            {uploadLoading ? "Enviando e preparando..." : "Enviar documento"}
          </button>
        </div>
        {selectedFile ? (
          <p className="text-muted" style={{ marginTop: 8 }}>
            Selecionado: {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
          </p>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ margin: 0 }}>Documentos disponíveis</h3>
          <p className="text-muted">
            Acompanhe prontidão, status do documento e execução da análise por candidato.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
            Match direto opcional:
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Selecione uma vaga (opcional)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} [{j.status}]
                </option>
              ))}
            </select>
          </label>
          <div className="text-muted" style={{ fontSize: 13 }}>
            {selectedJob
              ? `Ao concluir a análise, o sistema também compara o currículo com a vaga "${selectedJob.title}".`
              : "Você pode selecionar uma vaga para executar um match direcionado ao fim da análise."}
          </div>
        </div>

        {loadingResumes ? <p className="text-muted">Carregando currículos...</p> : null}
        {loadError ? (
          <div className="page-error">
            <span className="page-error-icon">✕</span>
            <span>{loadError}</span>
          </div>
        ) : null}
        {!loadingResumes && !loadError && resumes.length === 0 ? (
          <EmptyState
            icon="📄"
            title="Nenhum documento disponível"
            description="Envie o primeiro currículo para iniciar o pré-cadastro, a extração de texto e a preparação para análise."
            note="Depois do upload, o sistema tenta aproveitar automaticamente os dados do candidato antes da análise."
          />
        ) : null}

        {resumes.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Título</th>
                <th>Documento</th>
                <th>Prontidão</th>
                <th>Última atualização</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => {
                const proc = processingMap[resume.id];
                const canAnalyze = Boolean(
                  resume.current_version_id && resume.extraction_status === "completed",
                );
                return (
                  <tr key={resume.id}>
                    <td>
                      <div>{resume.candidate_name ?? "Candidato não identificado"}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Ref. {formatShortId(resume.candidate_id)}
                      </div>
                    </td>
                    <td>
                      <div>{resume.title}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {resumeStatusLabel(resume.status)} • versão {resume.current_version}
                      </div>
                    </td>
                    <td>
                      <div>{resume.current_file_name ?? "Arquivo não enviado"}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Código {formatShortId(resume.current_version_id)}
                      </div>
                    </td>
                    <td>
                      <StatusPill
                        label={extractionLabel(resume.extraction_status)}
                        tone={extractionTone(resume.extraction_status)}
                      />
                    </td>
                    <td>{new Date(resume.updated_at).toLocaleString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => {
                            setEditingResume(resume);
                            setEditTitle(resume.title);
                          }}
                        >
                          Editar título
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => void handleToggleStatus(resume)}
                        >
                          {resume.status === "active" ? "Arquivar" : "Reativar"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => setConfirmDeleteId(resume.id)}
                        >
                          Excluir
                        </button>
                        <button
                          className="btn"
                          type="button"
                          disabled={!canAnalyze || (proc?.loading ?? false)}
                          onClick={() => void handleAnalyze(resume)}
                        >
                          {proc?.loading ? "Processando..." : "Analisar"}
                        </button>
                      </div>
                      {!canAnalyze ? (
                        <div className="text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                          Disponível para análise somente após extração concluída.
                        </div>
                      ) : null}
                      {proc?.loading && proc.pollStatus ? (
                        <div className="text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                          {proc.pollStatus}
                        </div>
                      ) : null}
                      {proc?.error ? (
                        <div className="error-text" style={{ marginTop: 4, fontSize: 13 }}>{proc.error}</div>
                      ) : null}
                      {proc && !proc.loading && !proc.error && proc.analysisId && !proc.match ? (
                        <div className="success-text" style={{ marginTop: 4, fontSize: 12 }}>
                          Análise concluída {selectedJob ? "(match direto não retornou resultado)" : "(sem vaga direcionada)"}
                        </div>
                      ) : null}
                      {proc?.match ? (
                        <div style={{ marginTop: 6, fontSize: 13 }}>
                          <strong>Score:</strong> {proc.match.match_score} •{" "}
                          <strong>Recomendação:</strong> {proc.match.recommendation}
                          {proc.match.mandatory_skills_matched !== undefined ? (
                            <div className="text-muted">
                              Skills obrigatórias: {proc.match.mandatory_skills_matched}/{proc.match.mandatory_skills_total}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      {editingResume ? (
        <Modal title="Editar currículo" onClose={() => setEditingResume(null)}>
          <label>
            Título
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título do currículo"
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="btn"
              type="button"
              disabled={editSaving || !editTitle.trim()}
              onClick={() => void handleEditSave()}
            >
              {editSaving ? "Salvando..." : "Salvar"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setEditingResume(null)}>
              Cancelar
            </button>
          </div>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p>Tem certeza que deseja excluir este currículo? As versões associadas também serão removidas.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" type="button" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
            <button className="btn" type="button" onClick={() => void handleDelete()}>Excluir</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
