import { useEffect, useState } from "react";

import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
import { useAuth } from "../features/auth/useAuth";
import { useAnalysisPolling } from "../hooks/useAnalysisPolling";
import { analysisService, PaginatedResponse } from "../services/analysisService";
import { resumeService } from "../services/resumeService";
import { toast } from "../services/toast";
import {
  AnalysisPipelineStatus,
  AnalysisResult,
  AnalysisStatus,
  AnalysisSummary,
  ResumeSummary,
} from "../types/domain";

function formatShortId(value: string | null | undefined) {
  if (!value) return "N/A";
  return `${value.slice(0, 8)}…`;
}

function formatStatusLabel(status: AnalysisSummary["status"] | AnalysisStatus["status"]) {
  const labels: Record<string, string> = {
    pending: "Na fila",
    processing: "Processando",
    completed: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function statusTone(status: AnalysisSummary["status"] | AnalysisStatus["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "danger" as const;
  return "warning" as const;
}

function formatStatusMessage(status: AnalysisStatus) {
  const parts = [`Status atual: ${formatStatusLabel(status.status)}`];

  if (status.retry_count > 0) {
    parts.push(`tentativas: ${status.retry_count}`);
  }
  if (status.next_retry_at) {
    parts.push(`próxima tentativa: ${new Date(status.next_retry_at).toLocaleString()}`);
  }
  if (status.failure_reason) {
    parts.push(`motivo: ${status.failure_reason}`);
  }

  return parts.join(" • ");
}

export function AnalisesPage() {
  const { user, isAuthenticated } = useAuth();
  const pageSize = 10;
  const [resumeVersionId, setResumeVersionId] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [resumeOptions, setResumeOptions] = useState<ResumeSummary[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [analysisId, setAnalysisId] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<AnalysisPipelineStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<AnalysisSummary> | null>(null);
  const [statusFilter, setStatusFilter] = useState<AnalysisSummary["status"] | "all">("all");
  const [page, setPage] = useState(1);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);
  const [autoPolling, setAutoPolling] = useState(false);

  async function loadAnalyses() {
    setLoadingAnalyses(true);
    try {
      const response = await analysisService.list(page, pageSize, statusFilter);
      setAnalyses(response.data);
      setPagination(response);
    } catch {
      // Mantém UX limpa; erro global já tratado em ações manuais.
    } finally {
      setLoadingAnalyses(false);
    }
  }

  async function loadResumeOptions() {
    setLoadingResumes(true);
    try {
      const response = await resumeService.list();
      setResumeOptions(response);
    } finally {
      setLoadingResumes(false);
    }
  }

  useEffect(() => {
    void loadAnalyses();
  }, [page, statusFilter]);

  useEffect(() => {
    void loadResumeOptions();
  }, []);

  async function loadPipelineStatus(targetAnalysisId: string) {
    try {
      const pipeline = await analysisService.pipeline(targetAnalysisId);
      setPipelineStatus(pipeline);
      return pipeline;
    } catch {
      setPipelineStatus(null);
      return null;
    }
  }

  useAnalysisPolling({
    enabled: Boolean(analysisId) && (autoPolling || pipelineStatus?.matching_status === "processing"),
    targets: analysisId ? [{ key: analysisId, analysisId }] : [],
    onStatus: async (_target, status) => {
      setAnalysisStatus(status);
      setStatusMessage(formatStatusMessage(status));
      await loadPipelineStatus(status.analysis_id);

      if (status.status === "completed") {
        const analysisResult = await analysisService.result(status.analysis_id);
        setResult(analysisResult);
        setAutoPolling(false);
        await loadAnalyses();
      }

      if (status.status === "failed" || status.status === "cancelled") {
        setAutoPolling(false);
        await loadAnalyses();
      }
    },
    onError: async () => {
      setAutoPolling(false);
    },
  });

  async function handleRequestAnalysis() {
    setStatusMessage(null);
    setResult(null);
    try {
      const response = await analysisService.request(resumeVersionId);
      setAnalysisId(response.analysis_id);
      setAnalysisStatus(null);
      setPipelineStatus(null);
      setStatusMessage(`Análise solicitada: ${response.analysis_id}`);
      toast.success("Análise solicitada com sucesso — acompanhe o status abaixo");
      setAutoPolling(true);
      setPage(1);
      await loadAnalyses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao solicitar análise");
    }
  }

  async function handleCheckStatus() {
    setStatusMessage(null);
    try {
      const status = await analysisService.status(analysisId);
      setAnalysisStatus(status);
      setStatusMessage(formatStatusMessage(status));
      await loadPipelineStatus(analysisId);
      if (status.status === "completed") {
        const analysisResult = await analysisService.result(analysisId);
        setResult(analysisResult);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao consultar status");
    }
  }

  async function handleGetResult() {
    setStatusMessage(null);
    try {
      const analysisResult = await analysisService.result(analysisId);
      setResult(analysisResult);
      setStatusMessage("Resultado carregado com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar resultado");
      setResult(null);
    }
  }

  function handleSelectAnalysis(selectedAnalysisId: string) {
    setAnalysisId(selectedAnalysisId);
    setStatusMessage(`Análise selecionada: ${formatShortId(selectedAnalysisId)}`);
    setAnalysisStatus(null);
    setPipelineStatus(null);
    setResult(null);
    void loadPipelineStatus(selectedAnalysisId);
  }

  function handleFilterChange(nextFilter: AnalysisSummary["status"] | "all") {
    setStatusFilter(nextFilter);
    setPage(1);
  }

  function handleResumeSelection(nextResumeId: string) {
    setSelectedResumeId(nextResumeId);
    const selectedResume = resumeOptions.find((resume) => resume.id === nextResumeId);
    setResumeVersionId(selectedResume?.current_version_id ?? "");
  }

  const currentAnalysis = analyses.find((analysis) => analysis.id === analysisId) ?? null;
  const currentStatus = analysisStatus?.analysis_id === analysisId ? analysisStatus : null;
  const selectedResume = resumeOptions.find((resume) => resume.id === selectedResumeId) ?? null;
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);
  const requestAnalysisDisabled =
    !resumeVersionId || !isAuthenticated || !canSpendRealTokens;
  const progressValue =
    (currentStatus?.status ?? currentAnalysis?.status) === "completed"
      ? 100
      : (currentStatus?.status ?? currentAnalysis?.status) === "processing"
        ? 68
        : (currentStatus?.status ?? currentAnalysis?.status) === "failed" ||
            (currentStatus?.status ?? currentAnalysis?.status) === "cancelled"
          ? 100
          : (currentStatus?.status ?? currentAnalysis?.status) === "pending"
            ? 22
            : 0;

  return (
    <div className="page-grid">
      <PageHeader title="Análises" subtitle="Orquestração e acompanhamento das análises de currículos" />

      <Card title="Painel operacional" description="Visão do usuário atual e da política de consumo">
        <div className="stats-mini">
          <div className="stat-mini">
            <div className="stat-mini-label">Sessão</div>
            <div className="stat-mini-value">{isAuthenticated ? "Autenticada" : "Desconectada"}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Usuário</div>
            <div className="stat-mini-value" style={{ fontSize: 15 }}>{user?.full_name ?? "N/A"}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">Consumo real</div>
            <div className="stat-mini-value" style={{ fontSize: 15 }}>
              <StatusPill label={canSpendRealTokens ? "Liberado" : "Bloqueado"} tone={canSpendRealTokens ? "success" : "warning"} />
            </div>
          </div>
        </div>
        {!canSpendRealTokens ? (
          <div className="alert alert-warning">
            <span className="alert-icon">!</span>
            <span>
              O backend está configurado para não consumir tokens reais agora. Você ainda pode navegar, mas novas análises ficam bloqueadas.
            </span>
          </div>
        ) : null}
      </Card>

      <Card title="Nova análise" description="Selecione um currículo pronto e envie para processamento">
        <label>
          Currículo disponível
          <select value={selectedResumeId} onChange={(event) => handleResumeSelection(event.target.value)}>
            <option value="">{loadingResumes ? "Carregando currículos..." : "Selecione um currículo"}</option>
            {resumeOptions.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.title} • v{resume.current_version}
              </option>
            ))}
          </select>
        </label>

        {selectedResume ? (
          <div className="info-grid" style={{ marginTop: 12 }}>
            <div className="info-row">
              <span className="info-label">Currículo</span>
              <span className="info-value">{selectedResume.title}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Arquivo atual</span>
              <span className="info-value">{selectedResume.current_file_name ?? `v${selectedResume.current_version}`}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Status da extração</span>
              <span className="info-value">{selectedResume.extraction_status ?? "N/A"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Código técnico</span>
              <span className="info-value">{formatShortId(resumeVersionId)}</span>
            </div>
          </div>
        ) : null}

        <button
          className="btn"
          type="button"
          onClick={() => void handleRequestAnalysis()}
          disabled={requestAnalysisDisabled}
        >
          Solicitar análise
        </button>
        {!isAuthenticated ? (
          <p className="text-muted">Faça login para solicitar uma análise.</p>
        ) : null}
        {isAuthenticated && !canSpendRealTokens ? (
          <p className="text-muted">
            O backend está com consumo real bloqueado. Ative `ALLOW_AI_TOKEN_SPEND=true` quando quiser gastar tokens.
          </p>
        ) : null}
      </Card>

      <Card title="Acompanhamento" description="Status detalhado da análise selecionada">
        <label>
          Referência técnica da análise
          <input value={analysisId} onChange={(event) => setAnalysisId(event.target.value)} placeholder="Cole aqui o ID apenas se precisar buscar manualmente" />
        </label>

        <div className="actions-row">
          <button className="btn" type="button" onClick={() => void handleCheckStatus()} disabled={!analysisId}>
            Ver status
          </button>
          <button className="btn" type="button" onClick={() => setAutoPolling((prev) => !prev)} disabled={!analysisId}>
            {autoPolling ? "Parar auto-polling" : "Iniciar auto-polling"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => void handleGetResult()} disabled={!analysisId}>
            Ver resultado
          </button>
        </div>

        {currentAnalysis ? (
          <div className="analysis-progress-card">
            <div className="analysis-progress-top">
              <div>
                <strong>{currentAnalysis.candidate_name ?? "Candidato sem identificação"}</strong>
                <p className="text-muted">
                  {currentAnalysis.resume_title ?? "Currículo sem título"} • {currentAnalysis.resume_file_name ?? formatShortId(currentAnalysis.resume_version_id)}
                </p>
              </div>
              <StatusPill
                label={formatStatusLabel(currentStatus?.status ?? currentAnalysis.status)}
                tone={statusTone(currentStatus?.status ?? currentAnalysis.status)}
              />
            </div>

            <div className="analysis-progress-bar">
              <div className="analysis-progress-fill" style={{ width: `${progressValue}%` }} />
            </div>

            <div className="analysis-progress-steps">
              <span className={progressValue >= 22 ? "active" : ""}>Solicitada</span>
              <span className={progressValue >= 68 ? "active" : ""}>Processando</span>
              <span className={progressValue >= 100 ? "active" : ""}>
                {(currentStatus?.status ?? currentAnalysis.status) === "failed" ||
                (currentStatus?.status ?? currentAnalysis.status) === "cancelled"
                  ? "Encerrada"
                  : "Concluída"}
              </span>
            </div>

            {currentStatus ? (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <div className="text-muted">
                  Referência: {formatShortId(currentAnalysis.id)} • solicitado por {currentAnalysis.requested_by_name ?? formatShortId(currentAnalysis.requested_by)}
                </div>
                <div className="text-muted">
                  Atualizado em: {new Date(currentStatus.updated_at).toLocaleString()}
                </div>
                {currentStatus.retry_count > 0 ? (
                  <div className="text-muted">Tentativas registradas: {currentStatus.retry_count}</div>
                ) : null}
                {currentStatus.next_retry_at ? (
                  <div className="text-muted">
                    Próxima tentativa: {new Date(currentStatus.next_retry_at).toLocaleString()}
                  </div>
                ) : null}
                {currentStatus.failure_reason ? (
                  <div className="error-text" style={{ marginTop: 4 }}>
                    {currentStatus.failure_reason}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {analysisId ? (
        <Card title="Pipeline de ranking" description="Fan-out do matching automático por vagas publicadas">
          {pipelineStatus ? (
            <>
              <div className="stats-mini">
                <div className="stat-mini">
                  <div className="stat-mini-label">Status do ranking</div>
                  <div className="stat-mini-value" style={{ fontSize: 15 }}>
                    <StatusPill
                      label={pipelineStatus.matching_status}
                      tone={
                        pipelineStatus.matching_status === "completed" || pipelineStatus.matching_status === "idle"
                          ? "success"
                          : pipelineStatus.matching_status === "blocked"
                            ? "danger"
                            : "warning"
                      }
                    />
                  </div>
                </div>
                <div className="stat-mini">
                  <div className="stat-mini-label">Vagas publicadas</div>
                  <div className="stat-mini-value">{pipelineStatus.published_jobs_total}</div>
                </div>
                <div className="stat-mini">
                  <div className="stat-mini-label">Matches prontos</div>
                  <div className="stat-mini-value">{pipelineStatus.matched_jobs_count}</div>
                </div>
                <div className="stat-mini">
                  <div className="stat-mini-label">Pendentes</div>
                  <div className="stat-mini-value">{pipelineStatus.pending_jobs_count}</div>
                </div>
              </div>

              {pipelineStatus.recent_matches.length > 0 ? (
                <table className="table" style={{ marginTop: 16 }}>
                  <thead>
                    <tr>
                      <th>Vaga</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Recomendação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelineStatus.recent_matches.map((match) => (
                      <tr key={match.job_id}>
                        <td>{match.job_title}</td>
                        <td>{match.job_status}</td>
                        <td>{match.match_score ?? "—"}</td>
                        <td>{match.recommendation ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted" style={{ marginTop: 16 }}>
                  Nenhum match persistido para esta análise ainda.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">Selecione uma análise para acompanhar o fan-out do ranking.</p>
          )}
        </Card>
      ) : null}

      <Card title="Fila de análises" description="Selecione uma análise para ver detalhes e andamento">
        <div className="toolbar-row">
          <label className="filter-field">
            Status
            <select value={statusFilter} onChange={(event) => handleFilterChange(event.target.value as AnalysisSummary["status"] | "all")}>
              <option value="all">Todos</option>
              <option value="pending">Na fila</option>
              <option value="processing">Processando</option>
              <option value="completed">Concluída</option>
              <option value="failed">Falhou</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>

          <div className="pagination-summary">
            {pagination ? `Página ${pagination.page} de ${pagination.total_pages} • ${pagination.total} análises` : "Sem paginação"}
          </div>
        </div>

        {loadingAnalyses ? <p className="text-muted">Carregando análises...</p> : null}
        {!loadingAnalyses && analyses.length === 0 ? <p className="text-muted">Nenhuma análise encontrada.</p> : null}
        {analyses.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Candidato</th>
                <th>Currículo</th>
                <th>Status</th>
                <th>Solicitada por</th>
                <th>Atualizada em</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((analysis) => (
                <tr
                  key={analysis.id}
                  onClick={() => handleSelectAnalysis(analysis.id)}
                  className={analysis.id === analysisId ? "table-row-selected" : "table-row-clickable"}
                >
                  <td>
                    <div>{analysis.candidate_name ?? "Candidato não identificado"}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Ref. {formatShortId(analysis.id)}
                    </div>
                  </td>
                  <td>
                    <div>{analysis.resume_title ?? "Currículo sem título"}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {analysis.resume_file_name ?? formatShortId(analysis.resume_version_id)}
                    </div>
                  </td>
                  <td>
                    <StatusPill label={formatStatusLabel(analysis.status)} tone={statusTone(analysis.status)} />
                  </td>
                  <td>{analysis.requested_by_name ?? analysis.requested_by}</td>
                  <td>{new Date(analysis.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className="pagination-row">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={loadingAnalyses || page <= 1}
          >
            Página anterior
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              setPage((currentPage) =>
                pagination ? Math.min(pagination.total_pages, currentPage + 1) : currentPage + 1,
              )
            }
            disabled={loadingAnalyses || !pagination || page >= pagination.total_pages}
          >
            Próxima página
          </button>
        </div>
      </Card>

      {result ? (
        <Card
          title={result.candidate_name ? `Resultado de ${result.candidate_name}` : "Resultado da análise"}
          description={result.resume_title ?? "Dados consolidados da análise selecionada"}
        >
          <div className="stats-mini" style={{ marginBottom: 16 }}>
            <div className="stat-mini">
              <div className="stat-mini-label">Score geral</div>
              <div className="stat-mini-value">{result.overall_score ?? "N/A"}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">Senioridade</div>
              <div className="stat-mini-value" style={{ fontSize: 15 }}>{result.seniority_level ?? "N/A"}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">Token real</div>
              <div className="stat-mini-value" style={{ fontSize: 15 }}>{result.used_real_ai ? "Sim" : "Não"}</div>
            </div>
            <div className="stat-mini">
              <div className="stat-mini-label">Tempo</div>
              <div className="stat-mini-value">{result.processing_time_ms ?? "N/A"} ms</div>
            </div>
          </div>

          <div className="info-grid" style={{ marginBottom: 16 }}>
            <div className="info-row">
              <span className="info-label">Currículo</span>
              <span className="info-value">{result.resume_title ?? "N/A"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Arquivo</span>
              <span className="info-value">{result.resume_file_name ?? "N/A"}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Solicitada por</span>
              <span className="info-value">{result.requested_by_name ?? result.requested_by}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Referência técnica</span>
              <span className="info-value">{formatShortId(result.analysis_id)}</span>
            </div>
          </div>

          <p><strong>Score geral:</strong> {result.overall_score ?? "N/A"}</p>
          <p><strong>Experiência total:</strong> {result.total_experience_years ?? "N/A"} anos</p>
          <p><strong>Resumo:</strong> {result.candidate_summary ?? "N/A"}</p>
          <p><strong>Keywords:</strong> {result.keywords.length ? result.keywords.join(", ") : "N/A"}</p>
          <p><strong>Pontos fortes:</strong> {result.strengths.length ? result.strengths.join(" | ") : "N/A"}</p>
          <p><strong>Pontos de atenção:</strong> {result.weaknesses.length ? result.weaknesses.join(" | ") : "N/A"}</p>
          <p><strong>Recomendações:</strong> {result.recommendations.length ? result.recommendations.join(" | ") : "N/A"}</p>

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Detalhes técnicos</summary>
            <div style={{ marginTop: 12 }}>
              <p><strong>Worker:</strong> {result.worker_id ?? "N/A"}</p>
              <p><strong>Task ID:</strong> {result.task_id ?? "N/A"}</p>
              <p><strong>Input tokens:</strong> {result.input_tokens ?? 0}</p>
              <p><strong>Output tokens:</strong> {result.output_tokens ?? 0}</p>
              <p><strong>Cache read tokens:</strong> {result.cache_read_tokens ?? 0}</p>
              <p><strong>Cache write tokens:</strong> {result.cache_write_tokens ?? 0}</p>
            </div>
          </details>
        </Card>
      ) : null}

      {statusMessage ? (
        <div className="alert alert-success">
          <span className="alert-icon">✓</span>
          <span>{statusMessage}</span>
        </div>
      ) : null}
    </div>
  );
}
