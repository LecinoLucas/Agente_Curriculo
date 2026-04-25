import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "../components/common/Card";
import { PageHeader } from "../components/common/PageHeader";
import { StatusPill } from "../components/common/StatusPill";
import { useAuth } from "../features/auth/useAuth";
import { useAnalysisPolling } from "../hooks/useAnalysisPolling";
import { analysisService, PaginatedResponse } from "../services/analysisService";
import { resumeService } from "../services/resumeService";
import { toast } from "../services/toast";
import { Button } from "@/components/ui/button";
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isResultLoading, setIsResultLoading] = useState(false);
  const resultSectionRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!selectedResumeId) {
      return;
    }

    const selected = resumeOptions.find((resume) => resume.id === selectedResumeId);
    if (!selected) {
      setSelectedResumeId("");
      setResumeVersionId("");
      setStatusMessage("O currículo selecionado não está mais disponível.");
      setAutoPolling(false);
      return;
    }

    const nextVersionId = selected.current_version_id ?? "";
    if (nextVersionId !== resumeVersionId) {
      setResumeVersionId(nextVersionId);
    }
  }, [resumeOptions, resumeVersionId, selectedResumeId]);

  const pollingTargets = useMemo(
    () => (analysisId ? [{ key: analysisId, analysisId }] : []),
    [analysisId],
  );

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
    targets: pollingTargets,
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
      setAnalysisStatus(null);
      setPipelineStatus(null);
      setResult(null);
      setStatusMessage("A análise não está mais disponível ou houve falha na consulta.");
    },
  });

  async function handleRequestAnalysis() {
    setStatusMessage(null);
    setResult(null);

    const selected = resumeOptions.find((resume) => resume.id === selectedResumeId);
    if (!selected || selected.current_version_id !== resumeVersionId) {
      setSelectedResumeId("");
      setResumeVersionId("");
      setAnalysisId("");
      setAnalysisStatus(null);
      setPipelineStatus(null);
      setAutoPolling(false);
      toast.warning("O currículo selecionado não está mais disponível. Selecione outro para continuar.");
      return;
    }

    setIsAnalyzing(true);
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
    } finally {
      setIsAnalyzing(false);
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
    setIsResultLoading(true);
    try {
      const analysisResult = await analysisService.result(analysisId);
      setResult(analysisResult);
      setStatusMessage("Resultado carregado com sucesso.");
      window.requestAnimationFrame(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao buscar resultado");
      setResult(null);
    } finally {
      setIsResultLoading(false);
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader title="Análises" subtitle="Orquestração e acompanhamento das análises de currículos" />

      <Card title="Painel operacional" description="Visão do usuário atual e da política de consumo">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sessão</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{isAuthenticated ? "Autenticada" : "Desconectada"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Usuário</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{user?.full_name ?? "N/A"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Consumo real</div>
            <div className="mt-2">
              <StatusPill label={canSpendRealTokens ? "Liberado" : "Bloqueado"} tone={canSpendRealTokens ? "success" : "warning"} />
            </div>
          </div>
        </div>
        {!canSpendRealTokens ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-bold">!</span>
            <span>
              O backend está configurado para não consumir tokens reais agora. Você ainda pode navegar, mas novas análises ficam bloqueadas.
            </span>
          </div>
        ) : null}
      </Card>

      <Card title="Nova análise" description="Selecione um currículo pronto e envie para processamento">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
          Currículo disponível
          <select
            value={selectedResumeId}
            onChange={(event) => handleResumeSelection(event.target.value)}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">{loadingResumes ? "Carregando currículos..." : "Selecione um currículo"}</option>
            {resumeOptions.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.title} • v{resume.current_version}
              </option>
            ))}
          </select>
        </label>

        {selectedResume ? (
          <div className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Currículo</div>
              <div className="text-sm font-medium text-gray-900">{selectedResume.title}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Arquivo atual</div>
              <div className="text-sm text-gray-700">{selectedResume.current_file_name ?? `v${selectedResume.current_version}`}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status da extração</div>
              <div className="text-sm text-gray-700">{selectedResume.extraction_status ?? "N/A"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Código técnico</div>
              <div className="text-sm text-gray-700">{formatShortId(resumeVersionId)}</div>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          onClick={() => void handleRequestAnalysis()}
          disabled={requestAnalysisDisabled}
        >
          Solicitar análise
        </Button>
        {!isAuthenticated ? (
          <p className="text-sm text-gray-500">Faça login para solicitar uma análise.</p>
        ) : null}
        {isAuthenticated && !canSpendRealTokens ? (
          <p className="text-sm text-gray-500">
            O backend está com consumo real bloqueado. Ative `ALLOW_AI_TOKEN_SPEND=true` quando quiser gastar tokens.
          </p>
        ) : null}
      </Card>

      <Card title="Acompanhamento" description="Status detalhado da análise selecionada">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-900">
          Referência técnica da análise
          <input
            value={analysisId}
            onChange={(event) => setAnalysisId(event.target.value)}
            placeholder="Cole aqui o ID apenas se precisar buscar manualmente"
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void handleCheckStatus()} disabled={!analysisId}>
            Ver status
          </Button>
          <Button type="button" variant="outline" onClick={() => setAutoPolling((prev) => !prev)} disabled={!analysisId}>
            {autoPolling ? "Parar auto-polling" : "Iniciar auto-polling"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleGetResult()} disabled={!analysisId || isResultLoading}>
            {isResultLoading ? "Carregando resultado..." : "Ver resultado"}
          </Button>
        </div>

        {currentAnalysis ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <strong className="text-gray-900">{currentAnalysis.candidate_name ?? "Candidato sem identificação"}</strong>
                <p className="text-sm text-gray-500">
                  {currentAnalysis.resume_title ?? "Currículo sem título"} • {currentAnalysis.resume_file_name ?? formatShortId(currentAnalysis.resume_version_id)}
                </p>
              </div>
              <StatusPill
                label={formatStatusLabel(currentStatus?.status ?? currentAnalysis.status)}
                tone={statusTone(currentStatus?.status ?? currentAnalysis.status)}
              />
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progressValue}%` }} />
            </div>

            <div className="mt-3 flex justify-between gap-3 text-xs text-gray-500">
              <span className={progressValue >= 22 ? "font-semibold text-gray-900" : ""}>Solicitada</span>
              <span className={progressValue >= 68 ? "font-semibold text-gray-900" : ""}>Processando</span>
              <span className={progressValue >= 100 ? "font-semibold text-gray-900" : ""}>
                {(currentStatus?.status ?? currentAnalysis.status) === "failed" ||
                (currentStatus?.status ?? currentAnalysis.status) === "cancelled"
                  ? "Encerrada"
                  : "Concluída"}
              </span>
            </div>

            {currentStatus ? (
              <div className="mt-4 space-y-1 text-sm text-gray-600">
                <div>
                  Referência: {formatShortId(currentAnalysis.id)} • solicitado por {currentAnalysis.requested_by_name ?? formatShortId(currentAnalysis.requested_by)}
                </div>
                <div>
                  Atualizado em: {new Date(currentStatus.updated_at).toLocaleString()}
                </div>
                {currentStatus.retry_count > 0 ? (
                  <div>Tentativas registradas: {currentStatus.retry_count}</div>
                ) : null}
                {currentStatus.next_retry_at ? (
                  <div>
                    Próxima tentativa: {new Date(currentStatus.next_retry_at).toLocaleString()}
                  </div>
                ) : null}
                {currentStatus.failure_reason ? (
                  <div className="mt-2 text-sm text-red-600">
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
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status do ranking</div>
                  <div className="mt-2">
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
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vagas publicadas</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{pipelineStatus.published_jobs_total}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Matches prontos</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{pipelineStatus.matched_jobs_count}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pendentes</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{pipelineStatus.pending_jobs_count}</div>
                </div>
              </div>

              {pipelineStatus.recent_matches.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vaga</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Score</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recomendação</th>
                      </tr>
                    </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                    {pipelineStatus.recent_matches.map((match) => (
                        <tr key={match.job_id} className="border-b border-gray-200 transition-colors even:bg-gray-50/50 hover:bg-gray-100">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{match.job_title}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{match.job_status}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{match.match_score ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{match.recommendation ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhum match persistido para esta análise ainda.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Selecione uma análise para acompanhar o fan-out do ranking.</p>
          )}
        </Card>
      ) : null}

      <Card title="Fila de análises" description="Selecione uma análise para ver detalhes e andamento">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="flex min-w-[220px] flex-col gap-1.5 text-sm font-medium text-gray-900">
            Status
            <select
              value={statusFilter}
              onChange={(event) => handleFilterChange(event.target.value as AnalysisSummary["status"] | "all")}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">Todos</option>
              <option value="pending">Na fila</option>
              <option value="processing">Processando</option>
              <option value="completed">Concluída</option>
              <option value="failed">Falhou</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>

          <div className="text-sm text-gray-500">
            {pagination ? `Página ${pagination.page} de ${pagination.total_pages} • ${pagination.total} análises` : "Sem paginação"}
          </div>
        </div>

        {loadingAnalyses ? <p className="text-sm text-gray-500">Carregando análises...</p> : null}
        {!loadingAnalyses && analyses.length === 0 ? <p className="text-sm text-gray-500">Nenhuma análise encontrada.</p> : null}
        {analyses.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Candidato</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Currículo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Solicitada por</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Atualizada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {analyses.map((analysis) => (
                <tr
                  key={analysis.id}
                  onClick={() => handleSelectAnalysis(analysis.id)}
                  className={[
                    "border-b border-gray-200 transition-colors",
                    analysis.id === analysisId ? "bg-blue-50/70" : "cursor-pointer even:bg-gray-50/50 hover:bg-gray-100",
                  ].join(" ")}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{analysis.candidate_name ?? "Candidato não identificado"}</div>
                    <div className="text-xs text-gray-500">
                      Ref. {formatShortId(analysis.id)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{analysis.resume_title ?? "Currículo sem título"}</div>
                    <div className="text-xs text-gray-500">
                      {analysis.resume_file_name ?? formatShortId(analysis.resume_version_id)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill label={formatStatusLabel(analysis.status)} tone={statusTone(analysis.status)} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{analysis.requested_by_name ?? analysis.requested_by}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{new Date(analysis.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            disabled={loadingAnalyses || page <= 1}
          >
            Página anterior
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() =>
              setPage((currentPage) =>
                pagination ? Math.min(pagination.total_pages, currentPage + 1) : currentPage + 1,
              )
            }
            disabled={loadingAnalyses || !pagination || page >= pagination.total_pages}
          >
            Próxima página
          </Button>
        </div>
      </Card>

      {result ? (
        <div ref={resultSectionRef}>
          <Card
            title={result.candidate_name ? `Resultado de ${result.candidate_name}` : "Resultado da análise"}
            description={result.resume_title ?? "Dados consolidados da análise selecionada"}
          >
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Score geral</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{result.overall_score ?? "N/A"}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Senioridade</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{result.seniority_level ?? "N/A"}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Token real</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{result.used_real_ai ? "Sim" : "Não"}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tempo</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900">{result.processing_time_ms ?? "N/A"} ms</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Currículo</div>
                  <div className="text-sm text-gray-900">{result.resume_title ?? "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Arquivo</div>
                  <div className="text-sm text-gray-700">{result.resume_file_name ?? "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Solicitada por</div>
                  <div className="text-sm text-gray-700">{result.requested_by_name ?? result.requested_by}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Referência técnica</div>
                  <div className="text-sm text-gray-700">{formatShortId(result.analysis_id)}</div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Score geral:</strong> {result.overall_score ?? "N/A"}</p>
                <p><strong>Experiência total:</strong> {result.total_experience_years ?? "N/A"} anos</p>
                <p><strong>Resumo:</strong> {result.candidate_summary ?? "N/A"}</p>
                <p><strong>Keywords:</strong> {result.keywords.length ? result.keywords.join(", ") : "N/A"}</p>
                <p><strong>Pontos fortes:</strong> {result.strengths.length ? result.strengths.join(" | ") : "N/A"}</p>
                <p><strong>Pontos de atenção:</strong> {result.weaknesses.length ? result.weaknesses.join(" | ") : "N/A"}</p>
                <p><strong>Recomendações:</strong> {result.recommendations.length ? result.recommendations.join(" | ") : "N/A"}</p>
              </div>

              <details className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-900">Detalhes técnicos</summary>
                <div className="mt-4 space-y-1 text-sm text-gray-700">
                  <p><strong>Worker:</strong> {result.worker_id ?? "N/A"}</p>
                  <p><strong>Task ID:</strong> {result.task_id ?? "N/A"}</p>
                  <p><strong>Input tokens:</strong> {result.input_tokens ?? 0}</p>
                  <p><strong>Output tokens:</strong> {result.output_tokens ?? 0}</p>
                  <p><strong>Cache read tokens:</strong> {result.cache_read_tokens ?? 0}</p>
                  <p><strong>Cache write tokens:</strong> {result.cache_write_tokens ?? 0}</p>
                </div>
              </details>
            </div>
          </Card>
        </div>
      ) : null}

      {statusMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <span className="font-bold">✓</span>
          <span>{statusMessage}</span>
        </div>
      ) : null}

      {isAnalyzing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-8 py-8 text-center shadow-xl">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" aria-hidden="true" />
            <strong className="text-base font-semibold text-gray-900">Analisando currículo...</strong>
            <p className="text-sm text-gray-500">Processando com IA...</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
