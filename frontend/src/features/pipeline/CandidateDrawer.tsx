import { type MutableRefObject, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Tabs } from "../../components/common/Tabs";
import { useAuth } from "../../features/auth/useAuth";
import { analysisService } from "../../services/analysisService";
import { formatContextError } from "../../services/errorMessages";
import { feedback } from "../../services/feedback";
import { pipelineService } from "../../services/pipelineService";
import { resumeService } from "../../services/resumeService";
import { toast } from "../../services/toast";
import type {
  AnalysisPipelineStatus,
  AnalysisResult,
  CandidatePipelineHistory,
  CandidateOverview,
  PipelineStage,
  PipelineStageTransition,
  PipelineTrigger,
} from "../../types/domain";
import { type PanelTab, usePipeline } from "./PipelineContext";

// ── Constants ──────────────────────────────────────────────────────────────────

const DRAWER_TABS = [
  { key: "ranking" satisfies PanelTab, label: "Compatibilidade" },
  { key: "analysis" satisfies PanelTab, label: "Análise IA" },
  { key: "history" satisfies PanelTab, label: "Histórico" },
  { key: "documents" satisfies PanelTab, label: "Documentos" },
];

const STAGE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: "entry", label: "Recebido" },
  { value: "screening", label: "Triagem" },
  { value: "hr_interview", label: "Entrevista RH" },
  { value: "technical_interview", label: "Entrevista Técnica" },
  { value: "final", label: "Final" },
  { value: "offer", label: "Proposta" },
  { value: "hired", label: "Contratado" },
  { value: "rejected", label: "Reprovado" },
];

const ANALYSIS_STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  processing: "Processando",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

// ── Score helpers ──────────────────────────────────────────────────────────────

function fmtScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score > 1 ? score : score * 100)}%`;
}

function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return "text-gray-400";
  const n = score > 1 ? score / 100 : score;
  if (n >= 0.7) return "text-emerald-600";
  if (n >= 0.4) return "text-amber-600";
  return "text-red-500";
}

function scoreBgClass(score: number | null | undefined): string {
  if (score == null) return "bg-gray-50 ring-gray-200";
  const n = score > 1 ? score / 100 : score;
  if (n >= 0.7) return "bg-emerald-50 ring-emerald-200";
  if (n >= 0.4) return "bg-amber-50 ring-amber-200";
  return "bg-red-50 ring-red-200";
}

// ── CandidateDrawer ────────────────────────────────────────────────────────────

export function CandidateDrawer() {
  const {
    selectedCandidateId,
    candidateOverview,
    candidateLoading,
    candidateError,
    activePanelTab,
    activeJobId,
    closeCandidate,
    switchPanelTab,
    moveCandidateStage,
  } = usePipeline();

  const isOpen = selectedCandidateId !== null;

  // ── Local: full AnalysisResult (fetched lazily, cached across tab switches) ──
  //
  // CandidateOverview.latest_analysis holds a summary (id + scores + status).
  // The full result with text fields lives at GET /analyses/:id/result and is
  // only needed when the Analysis tab is open. We cache per analysisId in a ref
  // so switching tabs or re-opening the same candidate avoids a repeat fetch.
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisResultLoading, setAnalysisResultLoading] = useState(false);
  const [analysisResultError, setAnalysisResultError] = useState<string | null>(null);
  const analysisResultCacheRef = useRef<Map<string, AnalysisResult>>(new Map());
  const historyCacheRef = useRef<Map<string, CandidatePipelineHistory>>(new Map());

  const [stageSaving, setStageSaving] = useState(false);

  // Clear local analysis result when the selected candidate changes
  useEffect(() => {
    setAnalysisResult(null);
    setAnalysisResultError(null);
  }, [selectedCandidateId]);

  // Fetch full AnalysisResult when Analysis tab is active and analysis is done
  useEffect(() => {
    if (activePanelTab !== "analysis") return;

    const analysisId = candidateOverview?.latest_analysis?.analysis_id;
    const status = candidateOverview?.latest_analysis?.status;

    if (!analysisId || status !== "completed") return;

    const cached = analysisResultCacheRef.current.get(analysisId);
    if (cached) {
      setAnalysisResult(cached);
      return;
    }

    setAnalysisResultLoading(true);
    setAnalysisResultError(null);

    analysisService
      .result(analysisId)
      .then((result) => {
        analysisResultCacheRef.current.set(analysisId, result);
        setAnalysisResult(result);
      })
      .catch((err: unknown) => {
        setAnalysisResultError(
          formatContextError(
            err,
            "Não foi possível carregar o resultado completo da análise.",
            "Tente novamente em alguns instantes.",
          ),
        );
      })
      .finally(() => setAnalysisResultLoading(false));
  }, [
    activePanelTab,
    candidateOverview?.latest_analysis?.analysis_id,
    candidateOverview?.latest_analysis?.status,
  ]);

  // Stage of this candidate inside the currently active job
  const currentStage = useMemo<PipelineStage | null>(() => {
    if (!activeJobId || !candidateOverview) return null;
    return (
      candidateOverview.pipeline_entries.find((e) => e.job_id === activeJobId)?.stage ?? null
    );
  }, [activeJobId, candidateOverview]);

  async function handleStageChange(newStage: PipelineStage) {
    if (!selectedCandidateId || newStage === currentStage) return;
    setStageSaving(true);
    feedback.moveCandidate.processing();
    try {
      await moveCandidateStage(selectedCandidateId, newStage);
      feedback.moveCandidate.success();
    } catch (err: unknown) {
      feedback.moveCandidate.error(err);
    } finally {
      setStageSaving(false);
    }
  }

  const candidate = candidateOverview?.candidate;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={closeCandidate}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Painel do candidato"
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col bg-white shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex shrink-0 flex-col gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-sm">
                {candidate?.full_name?.charAt(0).toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0">
                {candidateLoading ? (
                  <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
                ) : (
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {candidate?.full_name ?? "—"}
                  </p>
                )}
                {candidateLoading ? (
                  <div className="mt-1.5 h-3 w-32 animate-pulse rounded bg-gray-100" />
                ) : (
                  <p className="truncate text-xs text-gray-500">
                    {[candidate?.email, candidate?.location_city, candidate?.location_state]
                      .filter(Boolean)
                      .join(" · ") || "Sem contato"}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={closeCandidate}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              aria-label="Fechar painel"
            >
              ✕
            </button>
          </div>

          {!candidateLoading && candidate?.tags && candidate.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {candidate.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {activeJobId && !candidateLoading ? (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-gray-500">Etapa:</span>
              {currentStage ? (
                <select
                  value={currentStage}
                  onChange={(e) => void handleStageChange(e.target.value as PipelineStage)}
                  disabled={stageSaving}
                  className="h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
                >
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {stageSaving && currentStage === opt.value ? "Salvando…" : opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gray-400">Não vinculado a esta vaga</span>
              )}
            </div>
          ) : null}
        </div>

        {/* Tab bar */}
        <div className="shrink-0">
          <Tabs
            tabs={DRAWER_TABS}
            active={activePanelTab}
            onChange={(key) => switchPanelTab(key as PanelTab)}
          />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {candidateLoading ? <LoadingSkeleton /> : null}

          {!candidateLoading && candidateError ? (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {candidateError}
            </div>
          ) : null}

          {!candidateLoading && !candidateError && candidateOverview ? (
            <>
              {activePanelTab === "ranking" && <ScoreTab overview={candidateOverview} />}
              {activePanelTab === "analysis" && (
                <AnalysisTab
                  overview={candidateOverview}
                  result={analysisResult}
                  loading={analysisResultLoading}
                  error={analysisResultError}
                />
              )}
              {activePanelTab === "history" && (
                <HistoryTab
                  overview={candidateOverview}
                  activeJobId={activeJobId}
                  cacheRef={historyCacheRef}
                />
              )}
              {activePanelTab === "documents" && <DocumentsTab overview={candidateOverview} />}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ── Tab: Compatibilidade ───────────────────────────────────────────────────────
// Shows the latest AI score separately from candidate-job compatibility signals.
// All data comes from CandidateOverview — zero extra fetch.

function ScoreTab({ overview }: { overview: CandidateOverview }) {
  const { latest_analysis, latest_analysis_pipeline, top_matches } = overview;

  if (!latest_analysis) {
    return (
      <EmptyTab
        title="Ainda não há análise para este candidato"
        description='Envie um currículo e solicite uma análise na aba "Análise IA" para liberar a compatibilidade.'
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-5">
      {/* AI score */}
      <div className="flex items-center gap-4">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl ring-2 ${scoreBgClass(latest_analysis.overall_score)}`}
        >
          <span
            className={`text-3xl font-extrabold tabular-nums ${scoreColorClass(latest_analysis.overall_score)}`}
          >
            {fmtScore(latest_analysis.overall_score)}
          </span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Score da IA</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {latest_analysis.seniority_level ?? "Senioridade não identificada"}
          </p>
          {latest_analysis.total_experience_years != null ? (
            <p className="mt-0.5 text-xs text-gray-500">
              {latest_analysis.total_experience_years}{" "}
              {latest_analysis.total_experience_years === 1 ? "ano" : "anos"} de experiência
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Ranking da vaga
        </p>
        <p className="mt-1 text-xs text-blue-900">
          Ainda nao exibido nesta tela. Nesta aba voce ve compatibilidade; o ranking persistido da
          vaga sera mostrado separadamente.
        </p>
      </div>

      {latest_analysis_pipeline ? (
        <Section title="Compatibilidade com vagas publicadas">
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Publicadas" value={latest_analysis_pipeline.published_jobs_total} />
            <StatBox
              label="Compatíveis"
              value={latest_analysis_pipeline.matched_jobs_count}
              tone="success"
            />
            <StatBox
              label="Pendentes"
              value={latest_analysis_pipeline.pending_jobs_count}
              tone="neutral"
            />
          </div>
        </Section>
      ) : null}

      {top_matches.length > 0 ? (
        <Section title="Compatibilidade por vaga">
          <div className="flex flex-col gap-2">
            {top_matches.map((match) => (
              <div
                key={`${match.analysis_id}-${match.job_id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-gray-900">{match.job_title}</p>
                  {match.recommendation ? (
                    <p className="truncate text-[11px] text-gray-500">{match.recommendation}</p>
                  ) : null}
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                    Compatibilidade
                  </div>
                  <span
                    className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ${scoreBgClass(match.match_score)} ${scoreColorClass(match.match_score)}`}
                  >
                    {fmtScore(match.match_score)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <EmptyTab
          title="Ainda não há vagas compatíveis"
          description="Conclua uma análise com vagas publicadas para preencher esta comparação."
          compact
        />
      )}
    </div>
  );
}

// ── Tab: Análise IA ────────────────────────────────────────────────────────────
// Shows request form, progress bar, pipeline matching, and full analysis result.
// AnalysisResult is fetched lazily by CandidateDrawer and passed as props (cached
// across tab switches via a ref that lives in the parent).

function AnalysisTab({
  overview,
  result,
  loading,
  error,
}: {
  overview: CandidateOverview;
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}) {
  const { startPolling, pollingStatus, pollingAnalysisId, syncAnalysisStart } = usePipeline();
  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);

  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<AnalysisPipelineStatus | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  const { latest_analysis } = overview;
  const analysisId = latest_analysis?.analysis_id ?? null;

  // Fetch pipeline status when analysisId is available
  useEffect(() => {
    if (!analysisId) {
      setPipelineStatus(null);
      return;
    }
    setPipelineLoading(true);
    void analysisService
      .pipeline(analysisId)
      .then((ps) => setPipelineStatus(ps))
      .catch(() => setPipelineStatus(null))
      .finally(() => setPipelineLoading(false));
  }, [analysisId]);

  // Refresh pipeline status after polling reaches a terminal state
  useEffect(() => {
    if (!pollingStatus || pollingAnalysisId !== analysisId || !analysisId) return;
    const isTerminal =
      pollingStatus.status === "completed" ||
      pollingStatus.status === "failed" ||
      pollingStatus.status === "cancelled";
    if (!isTerminal) return;
    void analysisService
      .pipeline(analysisId)
      .then((ps) => setPipelineStatus(ps))
      .catch(() => {});
  }, [pollingStatus, pollingAnalysisId, analysisId]);

  async function handleRequestAnalysis() {
    if (!selectedVersionId || !canSpendRealTokens || isRequesting) return;
    setIsRequesting(true);
    feedback.requestAnalysis.processing();
    try {
      const response = await analysisService.request(selectedVersionId);
      const selectedResume = readyResumes.find((resume) => resume.current_version_id === selectedVersionId);
      await syncAnalysisStart({
        candidateId: overview.candidate.id,
        analysisId: response.analysis_id,
        status: "pending",
        resumeId: selectedResume?.resume_id ?? null,
        resumeTitle: selectedResume?.title ?? null,
      });
      startPolling(response.analysis_id, overview.candidate.id, "pending");
      feedback.requestAnalysis.success();
    } catch (err) {
      feedback.requestAnalysis.error(err);
    } finally {
      setIsRequesting(false);
    }
  }

  const isCurrentlyPolling = pollingAnalysisId === analysisId;
  const effectiveStatus =
    isCurrentlyPolling && pollingStatus ? pollingStatus.status : latest_analysis?.status;
  const effectiveStartedAt =
    isCurrentlyPolling && pollingStatus ? pollingStatus.started_at : latest_analysis?.started_at;
  const effectiveCompletedAt =
    isCurrentlyPolling && pollingStatus
      ? pollingStatus.completed_at
      : latest_analysis?.completed_at;
  const effectiveFailedAt =
    isCurrentlyPolling && pollingStatus ? pollingStatus.failed_at : latest_analysis?.failed_at;
  const effectiveFailureReason =
    isCurrentlyPolling && pollingStatus?.failure_reason
      ? pollingStatus.failure_reason
      : latest_analysis?.failure_reason;
  const progressValue =
    effectiveStatus === "completed" ||
    effectiveStatus === "failed" ||
    effectiveStatus === "cancelled"
      ? 100
      : effectiveStatus === "processing"
        ? 68
        : effectiveStatus === "pending"
          ? 22
          : 0;

  const readyResumes = overview.resumes.filter(
    (r) => r.status === "active" && r.extraction_status === "completed" && r.current_version_id,
  );

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Request form */}
      <Section title="Solicitar análise">
        {!canSpendRealTokens ? (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Consumo real bloqueado — ative <code>real_ai_token_spend_enabled</code> para analisar.
          </div>
        ) : null}
        {readyResumes.length > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              disabled={isRequesting}
              className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
            >
              <option value="">Selecione um currículo</option>
              {readyResumes.map((r) => (
                <option key={r.current_version_id} value={r.current_version_id!}>
                  {r.title} · v{r.current_version}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleRequestAnalysis()}
              disabled={!selectedVersionId || !canSpendRealTokens || isRequesting}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {isRequesting ? "Solicitando…" : "Analisar"}
            </button>
          </div>
        ) : (
          <EmptyTab
            title="Nenhum currículo pronto para análise"
            description='Envie um PDF na aba "Documentos" para liberar uma nova análise.'
            compact
          />
        )}
      </Section>

      <Section title="Rastreabilidade da execução">
        {!latest_analysis ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Análise ainda não solicitada</p>
            <p className="mt-1 text-xs text-gray-500">
              Selecione um currículo e clique em Analisar para gerar a primeira execução.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {effectiveStatus === "processing"
                    ? "Análise em processamento"
                    : effectiveStatus === "completed"
                      ? "Análise concluída"
                      : effectiveStatus === "failed"
                        ? "Análise falhou"
                        : effectiveStatus === "cancelled"
                          ? "Análise cancelada"
                          : "Análise na fila"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Última execução vinculada ao currículo {latest_analysis.resume_title}.
                </p>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                  effectiveStatus === "completed"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : effectiveStatus === "failed" || effectiveStatus === "cancelled"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200",
                ].join(" ")}
              >
                {ANALYSIS_STATUS_LABEL[effectiveStatus ?? ""] ?? effectiveStatus}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <MetaItem label="Solicitada em" value={formatOptionalDateTime(latest_analysis.created_at)} />
              <MetaItem label="Iniciada em" value={formatOptionalDateTime(effectiveStartedAt)} />
              <MetaItem label="Concluída em" value={formatOptionalDateTime(effectiveCompletedAt)} />
              <MetaItem label="Falhou em" value={formatOptionalDateTime(effectiveFailedAt)} />
              <MetaItem
                label="Usou IA real"
                value={
                  latest_analysis.used_real_ai == null
                    ? "Ainda não disponível"
                    : latest_analysis.used_real_ai
                      ? "Sim"
                      : "Fallback / sem tokens reais"
                }
              />
              <MetaItem label="Worker" value={latest_analysis.worker_id ?? "Não informado"} />
              <MetaItem label="Task" value={latest_analysis.task_id ?? "Não informada"} />
              <MetaItem label="Atualizada em" value={formatOptionalDateTime(latest_analysis.updated_at)} />
            </div>

            {effectiveFailureReason ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                  Motivo da falha
                </p>
                <p className="mt-1 text-xs text-red-800">{effectiveFailureReason}</p>
              </div>
            ) : null}

            {latest_analysis.status === "completed" ? (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  Resultado principal
                </p>
                <p className="mt-1 text-xs text-blue-900">
                  Score da IA {fmtScore(latest_analysis.overall_score)} ·{" "}
                  {latest_analysis.seniority_level ?? "Senioridade não identificada"}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      {/* Progress bar */}
      {latest_analysis ? (
        <Section title="Progresso">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs text-gray-600">{latest_analysis.resume_title}</span>
              <span
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                  effectiveStatus === "completed"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : effectiveStatus === "failed" || effectiveStatus === "cancelled"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : "bg-amber-50 text-amber-700 ring-amber-200",
                ].join(" ")}
              >
                {ANALYSIS_STATUS_LABEL[effectiveStatus ?? ""] ?? effectiveStatus}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className={[
                  "h-full rounded-full transition-all duration-500",
                  effectiveStatus === "failed" || effectiveStatus === "cancelled"
                    ? "bg-red-500"
                    : "bg-blue-600",
                ].join(" ")}
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
              <span className={progressValue >= 22 ? "font-medium text-gray-700" : ""}>
                Solicitada
              </span>
              <span className={progressValue >= 68 ? "font-medium text-gray-700" : ""}>
                Processando
              </span>
              <span className={progressValue >= 100 ? "font-medium text-gray-700" : ""}>
                {effectiveStatus === "failed" || effectiveStatus === "cancelled"
                  ? "Encerrada"
                  : "Concluída"}
              </span>
            </div>
            {effectiveFailureReason ? (
              <p className="mt-2 text-[11px] text-red-600">{effectiveFailureReason}</p>
            ) : null}
            {isCurrentlyPolling && (pollingStatus?.retry_count ?? 0) > 0 ? (
              <p className="mt-1 text-[11px] text-gray-500">
                Tentativas: {pollingStatus!.retry_count}
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* Pipeline matching */}
      {!pipelineLoading && pipelineStatus ? (
        <Section title="Compatibilidade com vagas">
          <div className="grid grid-cols-3 gap-2">
            <StatBox label="Publicadas" value={pipelineStatus.published_jobs_total} />
            <StatBox label="Compatíveis" value={pipelineStatus.matched_jobs_count} tone="success" />
            <StatBox label="Pendentes" value={pipelineStatus.pending_jobs_count} />
          </div>
          {pipelineStatus.recent_matches.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {pipelineStatus.recent_matches.map((match) => (
                <div
                  key={match.job_id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-900">{match.job_title}</p>
                    <p className="text-[10px] text-gray-400">{match.job_status}</p>
                  </div>
                  {match.match_score != null ? (
                    <div className="ml-2 shrink-0 text-right">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                        Compatibilidade
                      </div>
                      <span
                        className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${scoreBgClass(match.match_score)} ${scoreColorClass(match.match_score)}`}
                      >
                        {fmtScore(match.match_score)}
                      </span>
                    </div>
                  ) : (
                    <span className="ml-2 text-[11px] text-gray-400">—</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyTab
              title="Ainda não há matches com vagas"
              description="Quando a análise terminar, esta seção mostrará os vínculos encontrados."
              compact
            />
          )}
        </Section>
      ) : null}

      {/* Full analysis result (only when completed and fetched) */}
      {latest_analysis?.status === "completed" ? (
        <>
          {loading ? <LoadingSkeleton /> : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {result ? (
            <>
              {result.candidate_summary ? (
                <Section title="Resumo do candidato">
                  <p className="text-sm leading-relaxed text-gray-700">{result.candidate_summary}</p>
                </Section>
              ) : null}

              <Section title="Detalhamento do Score da IA">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { label: "Técnico", value: result.technical_score },
                      { label: "Experiência", value: result.experience_score },
                      { label: "Educação", value: result.education_score },
                      { label: "Comunicação", value: result.communication_score },
                      { label: "Liderança", value: result.leadership_score },
                    ] as { label: string; value: number | null }[]
                  ).map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <span className="text-xs text-gray-600">{label}</span>
                      <span className={`text-xs font-bold tabular-nums ${scoreColorClass(value)}`}>
                        {fmtScore(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

              {result.strengths.length > 0 ? (
                <Section title="Pontos fortes">
                  <ul className="flex flex-col gap-1.5">
                    {result.strengths.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-px shrink-0 text-emerald-500">✓</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {result.weaknesses.length > 0 ? (
                <Section title="Pontos de atenção">
                  <ul className="flex flex-col gap-1.5">
                    {result.weaknesses.map((w) => (
                      <li key={w} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-px shrink-0 text-amber-500">⚠</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {result.recommendations.length > 0 ? (
                <Section title="Recomendações">
                  <ul className="flex flex-col gap-1.5">
                    {result.recommendations.map((r) => (
                      <li key={r} className="text-sm text-gray-700">
                        · {r}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {result.keywords.length > 0 ? (
                <Section title="Palavras-chave identificadas">
                  <div className="flex flex-wrap gap-1">
                    {result.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </Section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ── Tab: Histórico ─────────────────────────────────────────────────────────────
// Shows real stage transitions from GET /pipeline/{job_id}/{candidate_id}/history.

const STAGE_LABEL: Record<string, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

const TRIGGER_LABEL: Record<PipelineTrigger, string> = {
  manual: "Movido manualmente",
  auto_match: "Entrada por auto-match",
  system: "Movido pelo sistema",
};

function HistoryTab({
  overview,
  activeJobId,
  cacheRef,
}: {
  overview: CandidateOverview;
  activeJobId: string | null;
  cacheRef: MutableRefObject<Map<string, CandidatePipelineHistory>>;
}) {
  const [history, setHistory] = useState<CandidatePipelineHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const currentEntry = useMemo(
    () =>
      activeJobId
        ? overview.pipeline_entries.find((entry) => entry.job_id === activeJobId) ?? null
        : null,
    [activeJobId, overview.pipeline_entries],
  );

  useEffect(() => {
    if (!activeJobId) {
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `${overview.candidate.id}:${activeJobId}:${currentEntry?.updated_at ?? "none"}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setHistory(cached);
      setHistoryError(null);
      setHistoryLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setHistoryLoading(true);
    setHistoryError(null);

    void pipelineService
      .getCandidateHistory(activeJobId, overview.candidate.id)
      .then((result) => {
        if (cancelled) return;
        cacheRef.current.set(cacheKey, result);
        setHistory(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistory(null);
        setHistoryError(
          formatContextError(
            err,
            "Não foi possível carregar o histórico deste candidato.",
            "Tente novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, overview.candidate.id, currentEntry?.updated_at]);

  if (!activeJobId) {
    return (
      <EmptyTab
        title="Selecione uma vaga para ver o histórico"
        description="Abra este candidato a partir do pipeline para acompanhar as movimentações reais."
      />
    );
  }

  if (historyLoading) {
    return (
      <div className="p-5">
        <LoadingSkeleton />
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {historyError}
        </div>
        {currentEntry ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Estado atual nesta vaga
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {STAGE_LABEL[currentEntry.stage] ?? currentEntry.stage} · {currentEntry.candidate_status}
            </p>
            <p className="mt-1 text-[11px] text-amber-800">
              Este bloco e apenas um fallback de estado atual. O histórico real não pôde ser carregado.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            O candidato não possui estado atual visível nesta vaga.
          </p>
        )}
      </div>
    );
  }

  if (!history) {
    return (
      <EmptyTab
        title="Ainda não há histórico para esta vaga"
        description="Movimente o candidato no pipeline para gerar as primeiras entradas."
      />
    );
  }

  if (history.transitions.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <EmptyTab
          title="Ainda não há movimentações registradas"
          description="Movimente o candidato no pipeline para gerar o histórico desta vaga."
        />
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Estado atual
          </p>
          <p className="mt-1 text-sm text-gray-900">
            {STAGE_LABEL[history.current_stage] ?? history.current_stage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Histórico real do pipeline
        </p>
        <p className="mt-1 text-[11px] text-blue-900">
          Eventos registrados de movimentação para {history.job_title}.
        </p>
      </div>

      {history.transitions.map((transition) => (
        <div
          key={transition.id}
          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900">
                {transition.from_stage
                  ? `${STAGE_LABEL[transition.from_stage] ?? transition.from_stage} → ${STAGE_LABEL[transition.to_stage] ?? transition.to_stage}`
                  : `Entrada em ${STAGE_LABEL[transition.to_stage] ?? transition.to_stage}`}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">{TRIGGER_LABEL[transition.trigger]}</p>
              {transition.moved_by_name ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  Por {transition.moved_by_name}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-[11px] text-gray-400">
              {formatDateTime(transition.moved_at)}
            </p>
          </div>

          {transition.reason ? (
            <p className="mt-3 text-xs text-gray-700">
              <span className="font-semibold text-gray-900">Motivo:</span> {transition.reason}
            </p>
          ) : null}

          {transition.notes ? (
            <p className="mt-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-900">Notas:</span> {transition.notes}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatOptionalDateTime(value: string | null | undefined): string {
  return value ? formatDateTime(value) : "—";
}

// ── Tab: Documentos ────────────────────────────────────────────────────────────
// Shows upload form and resume list with per-resume CRUD and analyze actions.
// Mutations call refreshCandidateOverview() so the list stays in sync.

const EXTRACTION_STATUS_LABEL: Record<string, string> = {
  completed: "Pronto",
  pending: "Pendente",
  processing: "Extraindo…",
  failed: "Falha",
};

function DocumentsTab({ overview }: { overview: CandidateOverview }) {
  const {
    refreshCandidateOverview,
    startPolling,
    pollingAnalysisId,
    switchPanelTab,
    syncAnalysisStart,
    notifyCandidatesChanged,
  } = usePipeline();
  const { user } = useAuth();
  const canSpendRealTokens = Boolean(user?.real_ai_token_spend_enabled);
  const { resumes } = overview;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tracks which resume_id triggered the currently-in-flight analysis request
  const [analyzingResumeId, setAnalyzingResumeId] = useState<string | null>(null);

  // When context polling stops (terminal or cancelled), clear per-resume tracking
  useEffect(() => {
    if (pollingAnalysisId === null) setAnalyzingResumeId(null);
  }, [pollingAnalysisId]);

  function clearFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelect(file: File | null) {
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
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (!overview.candidate.id) {
      toast.error("Não foi possível enviar o currículo. Abra o candidato novamente e tente outra vez.");
      return;
    }
    setUploadLoading(true);
    feedback.uploadResume.processing();
    try {
      const payload = await resumeService.initiateUpload(overview.candidate.id);
      const uploaded = await resumeService.uploadPdf(payload.resume_id, selectedFile);
      clearFile();
      await refreshCandidateOverview();
      switchPanelTab("analysis");
      feedback.uploadResume.success();
      if (uploaded.analysis_auto_requested && uploaded.analysis_id) {
        await syncAnalysisStart({
          candidateId: overview.candidate.id,
          analysisId: uploaded.analysis_id,
          status: uploaded.analysis_status ?? "pending",
          resumeId: uploaded.resume_id,
          resumeTitle: selectedFile.name,
        });
        startPolling(uploaded.analysis_id, overview.candidate.id, uploaded.analysis_status ?? "pending");
      } else {
        notifyCandidatesChanged();
      }
    } catch (err) {
      feedback.uploadResume.error(err);
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleEditSave() {
    if (!editingResumeId || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await resumeService.update(editingResumeId, { title: editTitle.trim() });
      toast.success("Título atualizado");
      setEditingResumeId(null);
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível atualizar o título do currículo.",
          "Tente novamente.",
        ),
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggleStatus(resumeId: string, currentStatus: string) {
    try {
      if (currentStatus === "active") {
        await resumeService.archive(resumeId);
        toast.success("Currículo arquivado");
      } else {
        await resumeService.activate(resumeId);
        toast.success("Currículo reativado");
      }
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível alterar o status do currículo.",
          "Tente novamente.",
        ),
      );
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    setConfirmDeleteId(null);
    try {
      await resumeService.delete(confirmDeleteId);
      toast.success("Currículo excluído");
      await refreshCandidateOverview();
      notifyCandidatesChanged();
    } catch (err) {
      toast.error(
        formatContextError(
          err,
          "Não foi possível excluir o currículo.",
          "Tente novamente.",
        ),
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAnalyze(resumeId: string, versionId: string) {
    if (!canSpendRealTokens) {
      toast.warning("Consumo real bloqueado — ative real_ai_token_spend_enabled para analisar.");
      return;
    }
    setAnalyzingResumeId(resumeId);
    feedback.requestAnalysis.processing();
    try {
      const response = await analysisService.request(versionId);
      const resume = resumes.find((item) => item.resume_id === resumeId);
      await syncAnalysisStart({
        candidateId: overview.candidate.id,
        analysisId: response.analysis_id,
        status: "pending",
        resumeId,
        resumeTitle: resume?.title ?? null,
      });
      startPolling(response.analysis_id, overview.candidate.id, "pending");
      feedback.requestAnalysis.success();
    } catch (err) {
      feedback.requestAnalysis.error(err);
      setAnalyzingResumeId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {!canSpendRealTokens ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Consumo real bloqueado — ative <code>real_ai_token_spend_enabled</code> para analisar currículos.
        </div>
      ) : null}

      {/* Upload form */}
      <Section title="Enviar currículo">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="application/pdf,.pdf"
            ref={fileInputRef}
            disabled={uploadLoading}
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            className="text-xs file:mr-2 file:rounded-lg file:border file:border-gray-200 file:bg-gray-50 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-100"
          />
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploadLoading || !selectedFile}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            {uploadLoading ? "Enviando…" : "Enviar"}
          </button>
        </div>
        {selectedFile ? (
          <p className="mt-1 text-[11px] text-gray-400">
            {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
          </p>
        ) : null}
      </Section>

      {/* Resume list */}
      {resumes.length === 0 ? (
        <EmptyTab
          title="Ainda não há currículos enviados"
          description="Envie um PDF para começar a análise deste candidato."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {resumes.map((resume) => {
            const isEditing = editingResumeId === resume.resume_id;
            const isDeleting = deletingId === resume.resume_id;
            const isAnalyzing = analyzingResumeId === resume.resume_id;
            const canAnalyze =
              Boolean(resume.current_version_id) && resume.extraction_status === "completed";

            return (
              <div
                key={resume.resume_id}
                className={[
                  "rounded-xl border border-gray-200 bg-white px-4 py-3 transition-opacity",
                  isDeleting ? "opacity-40" : "",
                ].join(" ")}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-7 flex-1 rounded-lg border border-blue-300 px-2 text-xs text-gray-900 outline-none focus:ring-1 focus:ring-blue-200"
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleEditSave();
                            if (e.key === "Escape") setEditingResumeId(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleEditSave()}
                          disabled={editSaving || !editTitle.trim()}
                          className="rounded-lg bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-40"
                        >
                          {editSaving ? "…" : "OK"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingResumeId(null)}
                          className="text-[11px] text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p className="truncate text-xs font-semibold text-gray-900">{resume.title}</p>
                    )}
                    {resume.current_file_name ? (
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">
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
                      {EXTRACTION_STATUS_LABEL[resume.extraction_status ?? ""] ??
                        (resume.extraction_status ?? "—")}
                    </span>
                  </div>
                </div>

                {/* Meta */}
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-400">
                  <span>v{resume.current_version}</span>
                  <span>{new Date(resume.updated_at).toLocaleDateString("pt-BR")}</span>
                </div>

                {/* Actions */}
                {!isEditing ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingResumeId(resume.resume_id);
                        setEditTitle(resume.title);
                      }}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
                    >
                      Editar título
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleStatus(resume.resume_id, resume.status)}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
                    >
                      {resume.status === "active" ? "Arquivar" : "Reativar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(resume.resume_id)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleAnalyze(resume.resume_id, resume.current_version_id!)
                      }
                      disabled={!canAnalyze || isAnalyzing || pollingAnalysisId !== null || !canSpendRealTokens}
                      title={
                        !canSpendRealTokens
                          ? "Consumo real bloqueado"
                          : !canAnalyze
                            ? "Disponível após extração concluída"
                            : pollingAnalysisId !== null && !isAnalyzing
                              ? "Outra análise em andamento"
                              : undefined
                      }
                      className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
                    >
                      {isAnalyzing ? "Solicitando…" : "Análise manual"}
                    </button>
                  </div>
                ) : null}

                {!isEditing && canAnalyze ? (
                  <p className="mt-2 text-[11px] text-gray-400">
                    Atalho manual. O acompanhamento da execução fica na aba Análise IA.
                  </p>
                ) : null}

                {/* Delete confirmation */}
                {confirmDeleteId === resume.resume_id ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-700">Confirmar exclusão deste currículo?</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-red-700"
                      >
                        Excluir
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50"
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
      )}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {children}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "success" | "neutral";
}) {
  return (
    <div
      className={[
        "rounded-xl border p-3 text-center",
        tone === "success" ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50",
      ].join(" ")}
    >
      <p
        className={[
          "text-xl font-bold tabular-nums",
          tone === "success" ? "text-emerald-700" : "text-gray-900",
        ].join(" ")}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-xs text-gray-800">{value}</p>
    </div>
  );
}

function EmptyTab({
  title,
  description,
  compact = false,
}: {
  title: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-center",
        compact ? "gap-1.5 px-4 py-5" : "gap-2 p-10",
      ].join(" ")}
    >
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description ? <p className="max-w-sm text-xs text-gray-500">{description}</p> : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-5">
      {[75, 55, 85, 45, 65].map((w, i) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          className="animate-pulse rounded bg-gray-100"
          style={{ height: 13, width: `${w}%` }}
        />
      ))}
    </div>
  );
}
