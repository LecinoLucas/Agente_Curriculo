import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, RefreshCw, UserPlus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { CandidateSearchModal } from "../features/pipeline/CandidateSearchModal";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { EmptyState } from "../components/common/EmptyState";
import { Badge } from "../components/ui/badge";
import { DataQualityBanner } from "../components/data-quality/DataQualityBanner";
import { formatContextError } from "../services/errorMessages";
import { getJobRanking } from "../services/jobsService";
import { pipelineService, type PipelineJobSummary } from "../services/pipelineService";
import type { JobRanking, JobRankingEntry, PipelineStage } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";
import { isPipelineOperationalJob } from "../utils/jobStatusRules";
import { sortCandidatesByScore } from "../utils/pipelineSort";
import {
  buildDealBreakerViolationDisplay,
  isDealBreakerReasonCode,
} from "../features/pipeline/dealBreakerDisplay";

const MAIN_STAGES: ReadonlyArray<PipelineStage> = [
  "entry",
  "screening",
  "hr_interview",
  "technical_interview",
  "final",
  "offer",
  "hired",
];
const PIPELINE_SHOW_RANKING_STORAGE_KEY = "pipeline:showRanking";
const PIPELINE_LAST_SELECTED_JOB_KEY = "pipeline:lastSelectedJobId";

// ── Helpers ─────────────────────────────────────────────────────────────────
function canUsePipeline(status: string | undefined) {
  return isPipelineOperationalJob(status);
}

function getRankingFreshnessLabel(status: JobRankingEntry["ranking_freshness_status"] | null | undefined) {
  if (status === "fresh") return "Atualizado";
  if (status === "stale") return "Aderência desatualizada";
  return "Aguardando reprocessamento";
}

function resolveInitialShowRanking() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PIPELINE_SHOW_RANKING_STORAGE_KEY) === "true";
}

function getLastSelectedJobId() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PIPELINE_LAST_SELECTED_JOB_KEY);
}

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [showSourceCandidates, setShowSourceCandidates] = useState(false);
  const [showRanking, setShowRanking] = useState(resolveInitialShowRanking);
  const [sortOrder, setSortOrder] = useState<"score_desc" | "score_asc" | "name_az">("score_desc");
  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  // Canonical source for PipelinePage job selection/meta.
  // Candidate-centric flows load the broader jobs catalog lazily from PipelineContext.
  const [pipelineJobs, setPipelineJobs] = useState<PipelineJobSummary[]>([]);
  const [pipelineJobsLoading, setPipelineJobsLoading] = useState(true);
  const [pipelineJobsError, setPipelineJobsError] = useState<string | null>(null);
  const rankingCacheRef = useRef<Map<string, JobRanking>>(new Map());
  const rankingFetchInFlightRef = useRef<Map<string, Promise<JobRanking>>>(new Map());

  const {
    activeJobId,
    board,
    boardLoading,
    boardError,
    rankingSyncTick,
    selectedCandidateId,
    setActiveJob,
    refreshBoard,
    openCandidate,
  } = usePipeline();

  useEffect(() => {
    let cancelled = false;
    setPipelineJobsLoading(true);
    setPipelineJobsError(null);

    void pipelineService
      .listPipelineJobs()
      .then((items) => {
        if (cancelled) return;
        setPipelineJobs(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPipelineJobs([]);
        setPipelineJobsError(
          formatContextError(
            err,
            "Não foi possível carregar as vagas publicadas da pipeline.",
            "Tente atualizar a página.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setPipelineJobsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Effect 1: URL → context sync ──────────────────────────────────────────
  // URL is the source of truth for which job is active.
  // When the user navigates directly (/pipeline/abc) or uses back/forward,
  // the URL param changes and this effect tells the context to load that job.
  useEffect(() => {
    if (!jobIdParam) return;
    if (jobIdParam !== activeJobId) {
      setActiveJob(jobIdParam);
    }
  }, [jobIdParam, activeJobId, setActiveJob]);

  async function loadRanking(jobId: string, force = false): Promise<JobRanking> {
    if (!force) {
      const cached = rankingCacheRef.current.get(jobId);
      if (cached) {
        return cached;
      }
    }

    let request = rankingFetchInFlightRef.current.get(jobId);
    if (!request || force) {
      request = getJobRanking(jobId)
        .then((result) => {
          rankingCacheRef.current.set(jobId, result);
          return result;
        })
        .finally(() => {
          rankingFetchInFlightRef.current.delete(jobId);
        });
      rankingFetchInFlightRef.current.set(jobId, request);
    }

    return await request;
  }

  useEffect(() => {
    rankingCacheRef.current.clear();
    rankingFetchInFlightRef.current.clear();
  }, [rankingSyncTick]);

  useEffect(() => {
    window.localStorage.setItem(
      PIPELINE_SHOW_RANKING_STORAGE_KEY,
      showRanking ? "true" : "false",
    );
  }, [showRanking]);

  useEffect(() => {
    if (!activeJobId) {
      setRanking(null);
      setRankingError(null);
      setRankingLoading(false);
      return;
    }

    if (!showRanking) {
      setRankingLoading(false);
      setRankingError(null);
      return;
    }

    let cancelled = false;
    setRankingLoading(true);
    setRankingError(null);

    void loadRanking(activeJobId)
      .then((result) => {
        if (cancelled) return;
        setRanking(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRanking(null);
        setRankingError(
          formatContextError(
            err,
            "Não foi possível carregar o ranking desta vaga.",
            "Tente atualizar novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, rankingSyncTick, showRanking]);

  // ── Effect 2: auto-redirect when no jobId in URL ──────────────────────────
  // /pipeline (no :jobId) is a valid entry point. Once jobs are ready,
  // redirect to the last selected job if it still exists, otherwise to the first job.
  // replace: true prevents the bare /pipeline from polluting browser history.
  useEffect(() => {
    if (jobIdParam) return;
    if (pipelineJobsLoading || pipelineJobs.length === 0) return;

    const lastJobId = getLastSelectedJobId();
    const jobToSelect = lastJobId && pipelineJobs.some((job) => job.id === lastJobId)
      ? lastJobId
      : pipelineJobs[0].id;

    navigate(`/pipeline/${jobToSelect}`, { replace: true });
  }, [jobIdParam, pipelineJobsLoading, pipelineJobs, navigate]);

  useEffect(() => {
    if (!jobIdParam || pipelineJobsLoading) return;
    const exists = pipelineJobs.some((job) => job.id === jobIdParam);
    if (exists) return;

    if (pipelineJobs.length > 0) {
      navigate(`/pipeline/${pipelineJobs[0].id}`, { replace: true });
      return;
    }

    navigate("/pipeline", { replace: true });
  }, [jobIdParam, pipelineJobsLoading, pipelineJobs, navigate]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedJob = useMemo(
    () => pipelineJobs.find((job) => job.id === activeJobId) ?? null,
    [pipelineJobs, activeJobId],
  );

  const mainCols = useMemo(
    () =>
      (board?.columns ?? [])
        .filter((c) => (MAIN_STAGES as ReadonlyArray<string>).includes(c.stage))
        .map((col) => ({
          ...col,
          candidates: sortCandidatesByScore(col.candidates, sortOrder),
        })),
    [board, sortOrder],
  );

  const rejectedCol = useMemo(() => {
    const col = board?.columns.find((c) => c.stage === "rejected") ?? null;
    if (!col) return null;
    
    return {
      ...col,
      candidates: sortCandidatesByScore(col.candidates, sortOrder),
    };
  }, [board, sortOrder]);

  const totalActive = mainCols.reduce((n, c) => n + c.candidates.length, 0);
  const totalRejected = rejectedCol?.candidates.length ?? 0;
  const isBoardRefreshing = boardLoading && board !== null;
  const showInitialBoardLoading = boardLoading && board === null;
  const isRankingRefreshing = rankingLoading && ranking !== null;

  // Status flags
  const isDraft = selectedJob?.status === "draft";
  const canUse = canUsePipeline(selectedJob?.status);

  const activeJobAcceptsCandidates =
    selectedJob?.status === "published" || selectedJob?.status === "paused";
  const boardLayoutClass = showRanking
    ? "grid grid-cols-1 gap-6 xl:items-start xl:grid-cols-[minmax(0,1fr)_360px] xl:transition-[grid-template-columns] xl:duration-200"
    : "grid grid-cols-1 gap-6 xl:items-start xl:grid-cols-[minmax(0,1fr)] xl:transition-[grid-template-columns] xl:duration-200";

  // ── Handler ───────────────────────────────────────────────────────────────
  function handleSelectJob(nextJobId: string) {
    window.sessionStorage.setItem(PIPELINE_LAST_SELECTED_JOB_KEY, nextJobId);
    navigate(`/pipeline/${nextJobId}`, { replace: true });
  }

  const handleOpenSourceCandidates = () => {
    if (!canUse || !activeJobId) return;
    void loadRanking(activeJobId);
    setShowSourceCandidates(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-6 py-8 pb-12">
      {/* ── Page header ── */}
      <div className="relative overflow-hidden rounded-[2rem] bg-[hsl(var(--nav-bg))] p-4 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pipeline do Recrutador</h1>
            <p className="mt-2 text-lg font-medium text-white/80">
              Gerencie o fluxo de talentos com inteligência e agilidade.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenSourceCandidates}
              disabled={!canUse}
              className={`hover-lift rounded-2xl px-6 py-3 text-sm font-bold shadow-xl transition inline-flex items-center gap-2 ${
                canUse
                  ? "bg-white text-[hsl(var(--brand))] hover:bg-white/95"
                  : "bg-white/50 text-white/70 cursor-not-allowed"
              }`}
            >
              <UserPlus className="h-5 w-5" />
              Adicionar Candidatos
            </button>
            <button
              type="button"
              onClick={() => void refreshBoard()}
              disabled={boardLoading || !activeJobId}
              className="hover-lift inline-flex items-center gap-2 rounded-2xl bg-black/20 px-6 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-black/30 disabled:opacity-40"
            >
              <RefreshCw className={["h-5 w-5", boardLoading ? "animate-spin" : ""].join(" ")} />
              {boardLoading ? "Sincronizando…" : "Atualizar"}
            </button>
          </div>
        </div>
        {/* Subtle glow effect background */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-black/10 blur-3xl" />
      </div>

      {/* ── Job selector surface ── */}
      <div className="glass rounded-[2.5rem] border-[hsl(var(--border))/40 shadow-xl overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end">
            <div className="flex flex-col gap-6 xl:min-w-0 xl:flex-1">
              <div className="max-w-md space-y-3">
                <label
                  htmlFor="pipeline-job-select"
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--text-muted))]"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
                  Vaga Selecionada
                </label>
                {pipelineJobsError ? (
                  <div className="rounded-2xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm font-medium text-[hsl(var(--danger))]">
                    {pipelineJobsError}
                  </div>
                ) : (
                  <div className="relative group">
                    <select
                      id="pipeline-job-select"
                      value={activeJobId ?? ""}
                      onChange={(e) => handleSelectJob(e.target.value)}
                      disabled={pipelineJobsLoading || pipelineJobs.length === 0}
                      className="ui-input h-14 w-full appearance-none rounded-2xl border-2 px-4 pr-12 text-base font-bold shadow-sm transition-all focus:ring-4 focus:ring-[hsl(var(--primary))]/10 disabled:opacity-50"
                    >
                      {pipelineJobsLoading ? (
                        <option value="">Carregando vagas…</option>
                      ) : (
                        pipelineJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[hsl(var(--text-muted))]">
                      <ChevronDown className="h-5 w-5" />
                    </div>
                  </div>
                )}
              </div>

              {pipelineJobsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-2xl bg-[hsl(var(--surface-muted))]" />
                  ))}
                </div>
              ) : selectedJob ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetaCell label="Status da Vaga">
                    <StatusPill
                      label={formatJobStatus(selectedJob.status)}
                      tone={jobStatusTone(selectedJob.status)}
                    />
                  </MetaCell>
                  <MetaCell label="Senioridade">
                    {formatSeniority(selectedJob.seniority_level)}
                  </MetaCell>
                  <MetaCell label="Modelo de Trabalho">
                    {formatWorkModel(selectedJob.work_model)}
                  </MetaCell>
                  <MetaCell label="Localização">{selectedJob.location ?? "Remoto"}</MetaCell>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-4">
              {activeJobId ? (
                <button
                  type="button"
                  onClick={() => setShowRanking((current) => !current)}
                  className={`hover-lift inline-flex h-14 items-center justify-center gap-3 rounded-2xl border-2 px-6 text-sm font-bold transition-all shadow-sm ${
                    showRanking 
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--accent-soft))] text-[hsl(var(--primary))]" 
                      : "border-[hsl(var(--border))] bg-white text-[hsl(var(--text-muted))] hover:border-[hsl(var(--primary))]/50 hover:text-[hsl(var(--text))]"
                  }`}
                  aria-expanded={showRanking}
                >
                  {showRanking ? (
                    <>
                      <PanelRightClose className="h-5 w-5" />
                      <span>Ocultar Ranking</span>
                    </>
                  ) : (
                    <>
                      <PanelRightOpen className="h-5 w-5" />
                      <span>Ver Ranking IA</span>
                    </>
                  )}
                </button>
              ) : null}
            </div>
          </div>
          
          {selectedJob && !activeJobAcceptsCandidates && !isDraft ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-900 backdrop-blur-sm">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200/50 text-amber-600">
                ⚠️
              </div>
              <p>
                Esta vaga está em status <span className="font-bold">{formatJobStatus(selectedJob.status)}</span>. 
                Novos candidatos só são permitidos para vagas <span className="underline">publicadas</span> ou <span className="underline">pausadas</span>.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Empty: no jobs at all ── */}
      {!pipelineJobsLoading && pipelineJobs.length === 0 && !pipelineJobsError ? (
        <EmptyState
          icon="🧭"
          title="Nenhuma vaga publicada ainda"
          description="Crie ou publique uma vaga para começar a acompanhar candidatos no pipeline."
        />
      ) : null}

      {/* ── Board section ── */}
      {activeJobId ? (
        isDraft ? (
          <EmptyState
            icon="📝"
            title="Publique a vaga para iniciar o pipeline"
            description="Você precisa publicar esta vaga para adicionar candidatos e acompanhá-los no pipeline."
          />
        ) : (
          <div className={boardLayoutClass}>
            <div className="ui-card min-w-0 overflow-hidden rounded-[2.5rem] p-6 shadow-xl border-[hsl(var(--border))]/30">
          {/* Board header */}
            <div className="mb-6 flex flex-col gap-4 border-b border-[hsl(var(--border))]/50 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="ui-text-muted text-[10px] font-bold uppercase tracking-[0.2em]">
                    Controle de Fluxo
                  </p>
                  {board ? (
                    <span className="inline-flex items-center rounded-full bg-[hsl(var(--primary))]/10 px-3 py-1 text-[11px] font-bold text-[hsl(var(--primary))]">
                      {totalActive} Candidatos em Processo
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 truncate text-2xl font-bold text-[hsl(var(--text))]">
                  {selectedJob ? selectedJob.title : "Candidatos"}
                </h2>
              </div>
              <div className="flex items-center gap-3 self-start lg:self-end">
                <div className="flex items-center gap-2 rounded-xl bg-[hsl(var(--surface-muted))]/50 p-1">
                  <button
                    onClick={() => setSortOrder("score_desc")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${sortOrder === "score_desc" ? "bg-white text-[hsl(var(--primary))] shadow-sm" : "text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"}`}
                  >
                    Top Scores
                  </button>
                  <button
                    onClick={() => setSortOrder("name_az")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${sortOrder === "name_az" ? "bg-white text-[hsl(var(--primary))] shadow-sm" : "text-[hsl(var(--text-muted))] hover:text(--text)]"}`}
                  >
                    A-Z
                  </button>
                </div>
                {isBoardRefreshing ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--accent-soft))] px-3 py-1.5 text-xs font-bold text-[hsl(var(--primary))] animate-pulse">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Sincronizando
                  </span>
                ) : null}
              </div>
            </div>

          {/* Board error */}
            {boardError ? (
              <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
                <span>{boardError}</span>
                <button
                  type="button"
                  onClick={() => void refreshBoard()}
                  className="ml-4 text-xs underline hover:no-underline"
                >
                  Tentar novamente
                </button>
              </div>
            ) : null}

          {/* Loading skeleton */}
            {showInitialBoardLoading ? <SkeletonRows rows={6} /> : null}

          {/* Kanban columns — data from PipelineContext.board */}
            {board && !boardError ? (
              <div className="overflow-x-auto pb-4">
                <div className="flex min-w-max items-stretch gap-6">
                  {mainCols.map((col, idx) => (
                    <KanbanColumn
                      key={col.stage}
                      column={col}
                      colIndex={idx}
                      onCardClick={openCandidate}
                      disabled={!canUse}
                      showTopMatchHighlight={sortOrder === "score_desc"}
                    />
                  ))}

                  {rejectedCol ? (
                    <>
                      <div className="mx-1 w-px self-stretch bg-[hsl(var(--border))]/30" />
                      <KanbanColumn
                        column={rejectedCol}
                        colIndex={mainCols.length}
                        onCardClick={openCandidate}
                        disabled={!canUse}
                        showTopMatchHighlight={sortOrder === "score_desc"}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

          {/* Empty board */}
            {!showInitialBoardLoading && board && !boardError && totalActive === 0 && totalRejected === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="rounded-[2.5rem] border border-[hsl(var(--border))]/30 bg-[hsl(var(--surface-muted))]/30 p-12 max-w-lg text-center backdrop-blur-sm">
                  <div className="mb-6 flex justify-center text-6xl">🧭</div>
                  <h3 className="text-xl font-bold text-[hsl(var(--text))]">
                    Nenhum Candidato no Fluxo
                  </h3>
                  <p className="mt-3 text-base text-[hsl(var(--text-muted))] leading-relaxed">
                    Comece a construir seu time adicionando talentos ou usando a IA para buscar na sua base.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                      onClick={handleOpenSourceCandidates}
                      disabled={!canUse}
                      className={`hover-lift inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-sm font-bold transition shadow-xl ${
                        canUse
                          ? "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90"
                          : "bg-[hsl(var(--primary))]/50 text-white cursor-not-allowed"
                      }`}
                    >
                      <UserPlus className="h-5 w-5" />
                      Adicionar Candidatos
                    </button>
                    <button
                      onClick={() => canUse && setShowNewCandidate(true)}
                      disabled={!canUse}
                      className="hover-lift inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[hsl(var(--border))] bg-white px-8 py-4 text-sm font-bold text-[hsl(var(--text-muted))] transition hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--text))] disabled:opacity-50"
                    >
                      Criar Manualmente
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {showRanking ? (
            <RankingPanel
              jobTitle={selectedJob?.title ?? "vaga selecionada"}
              job={selectedJob}
              ranking={ranking}
              loading={rankingLoading}
              isRefreshing={isRankingRefreshing}
              error={rankingError}
              onToggle={() => setShowRanking(false)}
              onOpenCandidate={openCandidate}
              onRefresh={
                activeJobId
                  ? () => {
                      setRankingLoading(true);
                      setRankingError(null);
                      void loadRanking(activeJobId, true)
                        .then((result) => setRanking(result))
                        .catch((err: unknown) => {
                          setRanking(null);
                          setRankingError(
                            formatContextError(
                              err,
                              "Não foi possível carregar o ranking desta vaga.",
                              "Tente atualizar novamente.",
                            ),
                          );
                        })
                        .finally(() => setRankingLoading(false));
                    }
                  : undefined
              }
            />
          ) : null}
          </div>
        )
      ) : null}

      {/* ── Candidate search (sourcing) modal ── */}
      <CandidateSearchModal
        isOpen={showSourceCandidates}
        activeJobId={activeJobId ?? ""}
        activeJobTitle={selectedJob?.title ?? ""}
        ranking={ranking}
        rankingLoading={rankingLoading}
        onClose={() => setShowSourceCandidates(false)}
        onAdded={async () => {
          await refreshBoard();
        }}
        onCreateNew={() => {
          setShowSourceCandidates(false);
          setShowNewCandidate(true);
        }}
        onOpenCandidate={(candidateId) => {
          setShowSourceCandidates(false);
          navigate(`/candidatos?candidateId=${candidateId}`);
        }}
      />

      {/* ── New candidate modal ── */}
      {showNewCandidate && (
        <NewCandidateModal
          isOpen={showNewCandidate}
          defaultJobId={activeJobId}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (id) => {
            setShowNewCandidate(false);
            await openCandidate(id, "documents");
          }}
        />
      )}

      {/* ── Candidate drawer ── */}
      <CandidateDrawer key={selectedCandidateId ?? "none"} />
    </div>
  );
}

function RankingPanel({
  jobTitle,
  job,
  ranking,
  loading,
  isRefreshing,
  error,
  onToggle,
  onOpenCandidate,
  onRefresh,
}: {
  jobTitle: string;
  job: PipelineJobSummary | null;
  ranking: JobRanking | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onToggle: () => void;
  onOpenCandidate: (candidateId: string) => Promise<void>;
  onRefresh?: () => void;
}) {
  const showInitialLoading = loading && ranking === null;

  return (
    <aside
      id="pipeline-ranking-panel"
      className="glass rounded-[2.5rem] p-6 shadow-2xl border-[hsl(var(--border))]/30 flex flex-col h-full sticky top-8"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))]/50 pb-6">
        <div className="min-w-0">
          <p className="ui-text-muted text-[10px] font-bold uppercase tracking-[0.2em]">
            Ranking IA Marajó
          </p>
          <h3 className="mt-2 text-lg font-bold text-[hsl(var(--text))] truncate">{jobTitle}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="ui-btn-secondary h-10 w-10 flex items-center justify-center rounded-xl border border-[hsl(var(--border))] transition hover:border-[hsl(var(--primary))]/30 disabled:opacity-40"
              title="Atualizar ranking"
            >
              <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="ui-btn-secondary h-10 w-10 flex items-center justify-center rounded-xl border border-[hsl(var(--border))] transition hover:border-[hsl(var(--primary))]/30"
            title="Fechar"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div id="pipeline-ranking-content" className="mt-6 flex-1 overflow-y-auto ui-scrollbar pr-1">
        {showInitialLoading ? <SkeletonRows rows={4} /> : null}
        {isRefreshing ? (
          <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary))] animate-pulse">
            Recalculando aderência dos candidatos…
          </div>
        ) : null}

        {!showInitialLoading && error ? (
          <div className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-4 text-sm font-medium text-[hsl(var(--danger))]">
            {error}
          </div>
        ) : null}

        {!showInitialLoading && !error && ranking && ranking.candidates.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl mb-4">🏁</div>
            <p className="text-sm font-bold text-[hsl(var(--text))]">Nenhum ranking disponível</p>
            <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">Conclua a análise dos candidatos para gerar o ranking.</p>
          </div>
        ) : null}

        {!showInitialLoading && !error && ranking && ranking.candidates.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-xl bg-[hsl(var(--surface-muted))]/50 px-4 py-2.5 text-[11px] font-bold text-[hsl(var(--text-muted))]">
              <span>{ranking.total_candidates} Talentos</span>
              {ranking.score_version && <span>V{ranking.score_version}</span>}
            </div>

            {ranking.data_quality_stats && (
              <DataQualityBanner
                filteredCount={ranking.data_quality_stats.filtered_candidates}
                validCount={ranking.data_quality_stats.valid_candidates}
                unknownCount={ranking.data_quality_stats.unknown_candidates}
                totalCount={ranking.data_quality_stats.total_candidates}
              />
            )}

            {ranking.candidates.map((entry) => (
              <RankingCard
                key={`${entry.rank}-${entry.candidate_id}`}
                entry={entry}
                job={job}
                onOpenCandidate={onOpenCandidate}
              />
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function RankingCard({
  entry,
  job,
  onOpenCandidate,
}: {
  entry: JobRankingEntry;
  job: PipelineJobSummary | null;
  onOpenCandidate: (candidateId: string) => Promise<void>;
}) {
  const dealBreakerReason = entry.reason_tags.find((reason) => isDealBreakerReasonCode(reason)) ?? null;
  const dealBreakerDisplay = dealBreakerReason
    ? buildDealBreakerViolationDisplay({
        reasonCode: dealBreakerReason,
        jobDealBreakers: job?.deal_breakers ?? [],
      })
    : null;
  const hasDealBreakerRejection =
    Boolean(dealBreakerReason) &&
    entry.decision_suggestion === "rejected_suggested" &&
    Math.round(entry.job_fit_score) === 0;
  const reasonPreview = entry.reason_tags
    .filter((reason) => !isDealBreakerReasonCode(reason))
    .slice(0, 3)
    .map((reason) => reason.description)
    .filter(Boolean);
  const freshnessLabel = getRankingFreshnessLabel(entry.ranking_freshness_status);

  return (
    <button
      type="button"
      onClick={() => void onOpenCandidate(entry.candidate_id)}
      className={[
        "hover-lift w-full rounded-2xl border-2 px-4 py-4 text-left transition-all",
        hasDealBreakerRejection
          ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger-soft))] hover:border-[hsl(var(--danger))]/50"
          : "border-[hsl(var(--border))]/50 bg-white hover:border-[hsl(var(--primary))]/40 shadow-sm hover:shadow-md",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/10 text-[11px] font-bold text-[hsl(var(--primary))]">
              {entry.rank}
            </span>
            <p className="truncate text-sm font-bold text-[hsl(var(--text))]">{entry.candidate_name}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--text-muted))]">
              {freshnessLabel}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]">
            Match
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[hsl(var(--primary))]">
            {Math.round(entry.job_fit_score)}%
          </p>
        </div>
      </div>

      {hasDealBreakerRejection && dealBreakerDisplay ? (
        <div className="mt-4 rounded-xl border-2 border-[hsl(var(--danger))]/20 bg-white/80 p-3 shadow-inner">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--danger))]">
            Critério Eliminatório
          </p>
          <p className="mt-2 text-xs font-bold text-[hsl(var(--text))]">
            {dealBreakerDisplay.fieldLabel}: esperado {dealBreakerDisplay.expected}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text-muted))]">
             {dealBreakerDisplay.reason}.
          </p>
        </div>
      ) : null}

      {reasonPreview.length > 0 ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {reasonPreview.map((reason) => (
              <span
                key={reason}
                className="inline-flex items-center rounded-full border border-[hsl(var(--border))]/50 bg-[hsl(var(--surface-muted))]/30 px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--text-muted))]"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      
      {entry.ranking_summary_text && (
        <p className="mt-4 line-clamp-2 text-[11px] font-medium leading-relaxed text-[hsl(var(--text-muted))]">
          {entry.ranking_summary_text}
        </p>
      )}
    </button>
  );
}

// ── MetaCell ───────────────────────────────────────────────────────────────────

function MetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--border))]/30 bg-white/50 px-4 py-3 shadow-sm transition-colors hover:border-[hsl(var(--border))]/60">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--text-muted))]">
        <div className="h-1 w-1 rounded-full bg-[hsl(var(--border-strong))]" />
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-[hsl(var(--text))]">{children}</div>
    </div>
  );
}
