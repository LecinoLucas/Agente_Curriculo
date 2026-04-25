import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "../components/common/EmptyState";
import { useAnalysisPolling } from "../hooks/useAnalysisPolling";
import { Modal } from "../components/common/Modal";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
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
  if (status.status === "processing") return "Processando análise…";
  if (status.status === "completed") return "Análise concluída";
  if (status.status === "failed" || status.status === "cancelled") return `Análise encerrada: ${status.status}`;
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

  useEffect(() => {
    setProcessingMap((current) => {
      const validResumeIds = new Set(resumes.map((resume) => resume.id));
      let changed = false;
      const nextEntries = Object.entries(current).filter(([resumeId]) => {
        const keep = validResumeIds.has(resumeId);
        if (!keep) changed = true;
        return keep;
      });
      return changed ? Object.fromEntries(nextEntries) : current;
    });
  }, [resumes]);

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelection(file: File | null) {
    if (!file) { clearSelectedFile(); return; }
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
      if (!resumes.some((resume) => resume.id === target.key)) {
        return;
      }

      setProcessingMap((m) => {
        const current = m[target.key];
        if (!current) return m;
        return { ...m, [target.key]: { ...current, pollStatus: formatProcessingStatus(statusRes) } };
      });

      if (statusRes.status === "completed") {
        setProcessingMap((m) => ({
          ...m,
          [target.key]: { ...m[target.key], loading: false, error: null, analysisId: statusRes.analysis_id, pollStatus: "Análise concluída" },
        }));
        if (selectedJobId) {
          const match = await matchToJob(statusRes.analysis_id, selectedJobId);
          setProcessingMap((m) => ({
            ...m,
            [target.key]: { ...m[target.key], loading: false, error: null, match, analysisId: statusRes.analysis_id, pollStatus: "Análise concluída e match finalizado" },
          }));
        }
      }

      if (statusRes.status === "failed" || statusRes.status === "cancelled") {
        setProcessingMap((m) => ({
          ...m,
          [target.key]: { ...m[target.key], loading: false, error: statusRes.failure_reason ?? `Análise encerrada: ${statusRes.status}`, analysisId: statusRes.analysis_id, pollStatus: formatProcessingStatus(statusRes) },
        }));
      }
    },
  });

  async function handleUploadPdf() {
    if (!selectedFile) { toast.warning("Selecione um arquivo PDF antes de enviar"); return; }
    setUploadLoading(true);
    try {
      const payload = await resumeService.initiateUpload();
      const uploaded = await resumeService.uploadPdf(payload.resume_id, selectedFile);
      const prefillMessage = uploaded.prefilled_fields.length
        ? ` Pré-cadastro atualizado para ${uploaded.candidate_full_name}: ${uploaded.prefilled_fields.join(", ")}.`
        : ` Candidato associado: ${uploaded.candidate_full_name}.`;
      toast.success(`PDF enviado e extraído: ${uploaded.word_count ?? 0} palavras em ${uploaded.page_count ?? 0} página(s).${prefillMessage}`);
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
      setProcessingMap((m) => { const next = { ...m }; delete next[confirmDeleteId]; return next; });
      await loadResumes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir currículo");
      setConfirmDeleteId(null);
    }
  }

  async function handleAnalyze(resume: ResumeSummary) {
    if (!resume.current_version_id) { toast.warning("Currículo sem versão atual para análise"); return; }
    if (resume.extraction_status !== "completed") { toast.warning("Envie um PDF válido e aguarde a extração antes de analisar"); return; }
    setProcessingMap((m) => ({ ...m, [resume.id]: { loading: true, error: null, pollStatus: "Solicitando análise…" } }));
    try {
      const req = await analysisService.request(resume.current_version_id);
      setProcessingMap((m) => ({ ...m, [resume.id]: { loading: true, error: null, analysisId: req.analysis_id, pollStatus: "Aguardando processamento…" } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao solicitar análise";
      setProcessingMap((m) => ({ ...m, [resume.id]: { loading: false, error: message } }));
    }
  }

  const readyResumes = resumes.filter((r) => r.extraction_status === "completed").length;
  const activeResumes = resumes.filter((r) => r.status === "active").length;
  const processingCount = Object.values(processingMap).filter((s) => s.loading).length;
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Currículos" subtitle="Central de documentos dos candidatos e preparo para análise" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total recebidos", value: resumes.length },
          { label: "Prontos para análise", value: readyResumes },
          { label: "Ativos na base", value: activeResumes },
          { label: "Em processamento", value: processingCount },
        ].map((s) => (
          <Card key={s.label} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs">{s.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <strong className="text-2xl font-bold text-foreground">{s.value}</strong>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload */}
      <Card className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Entrada de documentos
          </CardTitle>
          <CardDescription>
            Envie um PDF para criar o currículo, extrair o texto e iniciar o pré-cadastro do candidato.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-4 text-sm">
            <span className="font-medium text-muted-foreground">Formato aceito</span>
            <span>PDF até 10 MB</span>
            <span className="font-medium text-muted-foreground">Resultado esperado</span>
            <span>Texto extraído, currículo criado e candidato enriquecido automaticamente</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={uploadLoading}
              ref={fileInputRef}
              onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
            />
            <Button
              type="button"
              onClick={() => void handleUploadPdf()}
              disabled={uploadLoading || !selectedFile}
            >
              {uploadLoading ? "Enviando…" : "Enviar documento"}
            </Button>
          </div>
          {selectedFile ? (
            <p className="text-xs text-muted-foreground">
              Selecionado: {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Documents list */}
      <Card className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documentos disponíveis
          </CardTitle>
          <CardDescription>
            Acompanhe prontidão, status do documento e execução da análise por candidato.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
              <span className="text-xs font-medium text-muted-foreground">Comparar com vaga (opcional)</span>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
              >
                <option value="">Selecione uma vaga (opcional)</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} [{j.status}]</option>
                ))}
              </select>
            </label>
            {selectedJob ? (
              <p className="flex-1 text-xs text-muted-foreground">
                Ao concluir a análise, o sistema compara o currículo com a vaga &ldquo;{selectedJob.title}&rdquo;.
              </p>
            ) : null}
          </div>

          {loadingResumes ? (
            <p className="text-sm text-muted-foreground px-1">Carregando currículos…</p>
          ) : null}

          {loadError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          {!loadingResumes && !loadError && resumes.length === 0 ? (
            <EmptyState
              icon="📄"
              title="Nenhum documento disponível"
              description="Envie o primeiro currículo para iniciar o pré-cadastro, a extração de texto e a preparação para análise."
              note="Depois do upload, o sistema aproveita automaticamente os dados do candidato antes da análise."
            />
          ) : null}
        </CardContent>

        {resumes.length > 0 ? (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  {["Candidato", "Título", "Documento", "Prontidão", "Atualizado em", "Ações"].map((col) => (
                    <th key={col} className="h-11 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {resumes.map((resume) => {
                  const proc = processingMap[resume.id];
                  const canAnalyze = Boolean(resume.current_version_id && resume.extraction_status === "completed");
                  return (
                    <tr key={resume.id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium">{resume.candidate_name ?? "Candidato não identificado"}</p>
                        <p className="text-xs text-muted-foreground">Ref. {formatShortId(resume.candidate_id)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{resume.title}</p>
                        <p className="text-xs text-muted-foreground">{resumeStatusLabel(resume.status)} · v{resume.current_version}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{resume.current_file_name ?? "Arquivo não enviado"}</p>
                        <p className="text-xs text-muted-foreground">Código {formatShortId(resume.current_version_id)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill label={extractionLabel(resume.extraction_status)} tone={extractionTone(resume.extraction_status)} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(resume.updated_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setEditingResume(resume); setEditTitle(resume.title); }}>
                            Editar título
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void handleToggleStatus(resume)}>
                            {resume.status === "active" ? "Arquivar" : "Reativar"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(resume.id)}>
                            Excluir
                          </Button>
                          <Button size="sm" disabled={!canAnalyze || (proc?.loading ?? false)} onClick={() => void handleAnalyze(resume)}>
                            {proc?.loading ? "Processando…" : "Analisar"}
                          </Button>
                        </div>
                        {!canAnalyze ? (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Disponível somente após extração concluída.
                          </p>
                        ) : null}
                        {proc?.loading && proc.pollStatus ? (
                          <p className="text-xs text-muted-foreground mt-1.5">{proc.pollStatus}</p>
                        ) : null}
                        {proc?.error ? (
                          <p className="text-xs text-destructive mt-1.5">{proc.error}</p>
                        ) : null}
                        {proc && !proc.loading && !proc.error && proc.analysisId && !proc.match ? (
                          <p className="text-xs text-green-700 mt-1.5 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {selectedJob ? "Análise concluída (match direto não retornou resultado)" : "Análise concluída"}
                          </p>
                        ) : null}
                        {proc?.match ? (
                          <div className="text-xs mt-2 text-foreground">
                            <strong>Score:</strong> {proc.match.match_score} ·{" "}
                            <strong>Recomendação:</strong> {proc.match.recommendation}
                            {proc.match.mandatory_skills_matched !== undefined ? (
                              <p className="text-muted-foreground">
                                Skills obrigatórias: {proc.match.mandatory_skills_matched}/{proc.match.mandatory_skills_total}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {editingResume ? (
        <Modal title="Editar currículo" onClose={() => setEditingResume(null)}>
          <label>
            Título
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Título do currículo" />
          </label>
          <div className="flex gap-3">
            <Button disabled={editSaving || !editTitle.trim()} onClick={() => void handleEditSave()}>
              {editSaving ? "Salvando…" : "Salvar"}
            </Button>
            <Button variant="outline" onClick={() => setEditingResume(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <Modal title="Confirmar exclusão" onClose={() => setConfirmDeleteId(null)}>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este currículo? As versões associadas também serão removidas.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => void handleDelete()}>Excluir</Button>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
