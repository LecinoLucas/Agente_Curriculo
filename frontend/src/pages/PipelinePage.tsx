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

// ── Helpers ─────────────────────────────────────────────────────────────────
function canUsePipeline(status: string | undefined) {
  return isPipelineOperationalJob(status);
}

function getRankingFreshnessLabel(status: JobRankingEntry["freshness_status"] | null | undefined) {
  if (status === "fresh") return "Atualizado";
  if (status === "stale") return "Score desatualizado";
  return "Aguardando reprocessamento";
}

function resolveInitialShowRanking() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PIPELINE_SHOW_RANKING_STORAGE_KEY) === "true";
}

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [showSourceCandidates, setShowSourceCandidates] = useState(false);
  const [showRanking, setShowRanking] = useState(resolveInitialShowRanking);
  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
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
  }, [activeJobId, rankingSyncTick]);

  // ── Effect 2: auto-redirect when no jobId in URL ──────────────────────────
  // /pipeline (no :jobId) is a valid entry point. Once jobs are ready,
  // redirect to /pipeline/:firstJobId so the URL always reflects what's shown.
  // replace: true prevents the bare /pipeline from polluting browser history.
  useEffect(() => {
    if (jobIdParam) return;
    if (pipelineJobsLoading || pipelineJobs.length === 0) return;
    navigate(`/pipeline/${pipelineJobs[0].id}`, { replace: true });
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
      (board?.columns ?? []).filter((c) =>
        (MAIN_STAGES as ReadonlyArray<string>).includes(c.stage),
      ),
    [board],
  );

  const rejectedCol = useMemo(
    () => board?.columns.find((c) => c.stage === "rejected") ?? null,
    [board],
  );

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
  // Navigate only. The URL change triggers Effect 1 which calls setActiveJob.
  // This avoids double-calling setActiveJob (once here, once in the effect).
  function handleSelectJob(nextJobId: string) {
    navigate(`/pipeline/${nextJobId}`, { replace: true });
  }

  const handleOpenSourceCandidates = () => {
    if (!canUse || !activeJobId) return;
    void loadRanking(activeJobId);
    setShowSourceCandidates(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-6 pb-12">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-heading text-2xl font-extrabold tracking-tight">Pipeline</h1>
          <p className="ui-text-muted mt-1 text-sm">
            Acompanhe e mova candidatos entre etapas do processo de admissão.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleOpenSourceCandidates}
            disabled={!canUse}
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm transition inline-flex items-center gap-2 ${
              canUse
                ? "bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 cursor-pointer"
                : "bg-[hsl(var(--primary))]/50 cursor-not-allowed"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Adicionar candidatos
          </button>
          <button
            type="button"
            onClick={() => void refreshBoard()}
            disabled={boardLoading || !activeJobId}
            className="ui-btn-secondary rounded-xl px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-40"
          >
            {boardLoading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* ── Job selector ── */}
      <div className="ui-card rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr] xl:min-w-0 xl:flex-1">
            <div className="space-y-2">
              <label
                htmlFor="pipeline-job-select"
                className="ui-text-muted text-xs font-semibold uppercase tracking-wide"
              >
                Vaga
              </label>
              {pipelineJobsError ? (
                <p className="ui-badge-danger rounded-xl border border-[hsl(var(--danger))]/20 px-3 py-2 text-sm">
                  {pipelineJobsError}
                </p>
              ) : (
                <select
                  id="pipeline-job-select"
                  value={activeJobId ?? ""}
                  onChange={(e) => handleSelectJob(e.target.value)}
                  disabled={pipelineJobsLoading || pipelineJobs.length === 0}
                  className="ui-input h-11 w-full rounded-xl px-3 text-sm disabled:opacity-50"
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
              )}
            </div>

            {pipelineJobsLoading ? (
              <SkeletonRows rows={2} />
            ) : selectedJob ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <MetaCell label="Status">
                  <StatusPill
                    label={formatJobStatus(selectedJob.status)}
                    tone={jobStatusTone(selectedJob.status)}
                  />
                </MetaCell>
                <MetaCell label="Senioridade">
                  {formatSeniority(selectedJob.seniority_level)}
                </MetaCell>
                <MetaCell label="Modelo">
                  {formatWorkModel(selectedJob.work_model)}
                </MetaCell>
                <MetaCell label="Local">{selectedJob.location ?? "—"}</MetaCell>
              </div>
            ) : null}
          </div>

          {selectedJob && !activeJobAcceptsCandidates && !isDraft ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Esta vaga está em status <strong>{formatJobStatus(selectedJob.status)}</strong>. Novos candidatos e vínculos de pipeline só são permitidos para vagas publicadas ou pausadas.
            </div>
          ) : null}

          {activeJobId ? (
            <button
              type="button"
              onClick={() => setShowRanking((current) => !current)}
              className="ui-btn-secondary inline-flex items-center justify-center gap-2 self-start rounded-xl border px-3 py-2 text-sm font-medium shadow-sm xl:self-center"
              aria-expanded={showRanking}
              aria-controls="pipeline-ranking-panel"
            >
              {showRanking ? (
                <>
                  <PanelRightClose className="h-4 w-4" />
                  <span>Ocultar ranking</span>
                  <ChevronUp className="h-4 w-4 xl:hidden" />
                </>
              ) : (
                <>
                  <PanelRightOpen className="h-4 w-4" />
                  <span>Mostrar ranking</span>
                  <ChevronDown className="h-4 w-4 xl:hidden" />
                </>
              )}
            </button>
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
            <div className="ui-card min-w-0 overflow-hidden rounded-3xl p-4 sm:p-5">
          {/* Board header */}
            <div className="mb-4 flex flex-col gap-3 border-b border-[hsl(var(--border))] pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="ui-text-muted text-[11px] font-semibold uppercase tracking-[0.18em]">
                    Pipeline da vaga
                  </p>
                  {board ? (
                    <span className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                      {totalActive} em processo
                    </span>
                  ) : null}
                  {totalRejected > 0 ? (
                    <span className="inline-flex items-center rounded-full border border-[hsl(var(--danger))]/18 bg-[hsl(var(--danger-soft))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--danger))]">
                      {totalRejected} reprovado{totalRejected !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 truncate text-base font-semibold text-[hsl(var(--text))] sm:text-lg">
                  {selectedJob ? selectedJob.title : "Candidatos"}
                </h2>
                <p className="ui-text-muted mt-1 text-xs sm:text-sm">
                  Abra um card para consultar detalhes do candidato e mover a etapa pelo drawer.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start lg:self-end">
                {isBoardRefreshing ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--primary))]/18 bg-[hsl(var(--accent-soft))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--primary))]">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Atualizando pipeline
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
              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-max items-stretch gap-4">
                  {mainCols.map((col, idx) => (
                    <KanbanColumn
                      key={col.stage}
                      column={col}
                      colIndex={idx}
                      onCardClick={openCandidate}
                      disabled={!canUse}
                    />
                  ))}

                  {rejectedCol ? (
                    <>
                      <div className="mx-0.5 w-px self-stretch bg-[hsl(var(--border))]" />
                      <KanbanColumn
                        column={rejectedCol}
                        colIndex={mainCols.length}
                        onCardClick={openCandidate}
                        disabled={!canUse}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

          {/* Empty board */}
            {!showInitialBoardLoading && board && !boardError && totalActive === 0 && totalRejected === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="rounded-2xl border border-[hsl(var(--border))]/30 bg-[hsl(var(--surface-muted))]/30 p-8 max-w-sm text-center">
                  <p className="text-base font-semibold text-[hsl(var(--text))]">
                    Pipeline sem candidatos
                  </p>
                  <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                    Adicione talentos existentes ou deixe a IA sugerir matches compatíveis.
                  </p>
                  <div className="mt-5 flex flex-col gap-2.5">
                    <button
                      onClick={handleOpenSourceCandidates}
                      disabled={!canUse}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                        canUse
                          ? "bg-[hsl(var(--primary))] text-white hover:bg-[hsl(var(--primary))]/90"
                          : "bg-[hsl(var(--primary))]/50 text-white cursor-not-allowed"
                      }`}
                    >
                      <UserPlus className="h-4 w-4" />
                      Adicionar candidatos
                    </button>
                    <button
                      onClick={() => canUse && setShowNewCandidate(true)}
                      disabled={!canUse}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] disabled:opacity-50"
                    >
                      Criar manualmente
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

      {/* ── Candidate drawer — position: fixed, always rendered, open via context ── */}
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
      className="ui-card min-w-0 rounded-3xl p-4 transition-all duration-200 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] pb-4">
        <div className="min-w-0">
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">
            Ranking da vaga
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[hsl(var(--text))]">{jobTitle}</h3>
          <p className="ui-text-muted mt-1 text-xs">
            Apoio a decisao. O ranking nao altera a etapa do pipeline.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="ui-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-medium disabled:opacity-40"
            >
              <RefreshCw className={["h-3.5 w-3.5", loading ? "animate-spin" : ""].join(" ")} />
              <span>{loading ? "Atualizando…" : "Atualizar"}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="ui-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-[11px] font-medium"
            aria-expanded={true}
            aria-controls="pipeline-ranking-content"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
            <span>Ocultar ranking</span>
          </button>
        </div>
      </div>

      <div id="pipeline-ranking-content" className="mt-4">
        {showInitialLoading ? <SkeletonRows rows={4} /> : null}
        {isRefreshing ? (
          <div className="mb-3 rounded-lg border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-3 py-2 text-[11px] text-[hsl(var(--primary))]">
            Atualizando o ranking da vaga…
          </div>
        ) : null}

        {!showInitialLoading && error ? (
          <div className="rounded-xl border border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))] px-4 py-3 text-sm text-[hsl(var(--danger))]">
            {error}
          </div>
        ) : null}

        {!showInitialLoading && !error && ranking && ranking.candidates.length === 0 ? (
          <EmptyState
            icon="🏁"
            title="Ainda não há ranking para esta vaga"
            description="Assim que houver candidatos com análise concluída, o ranking aparecerá aqui."
          />
        ) : null}

        {!showInitialLoading && !error && ranking && ranking.candidates.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-3 py-2 text-[11px] text-[hsl(var(--text))]">
              {ranking.total_candidates} candidato{ranking.total_candidates !== 1 ? "s" : ""} no ranking
              {ranking.score_version ? ` · versao ${ranking.score_version}` : ""}
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
  const dealBreakerReason = entry.reason_codes.find((reason) => isDealBreakerReasonCode(reason)) ?? null;
  const dealBreakerDisplay = dealBreakerReason
    ? buildDealBreakerViolationDisplay({
        reasonCode: dealBreakerReason,
        jobDealBreakers: job?.deal_breakers ?? [],
      })
    : null;
  const hasDealBreakerRejection =
    Boolean(dealBreakerReason) &&
    entry.decision_suggestion === "rejected_suggested" &&
    Math.round(entry.final_score) === 0;
  const reasonPreview = entry.reason_codes
    .filter((reason) => !isDealBreakerReasonCode(reason))
    .slice(0, 3)
    .map((reason) => reason.description)
    .filter(Boolean);
  const freshnessLabel = getRankingFreshnessLabel(entry.freshness_status);

  return (
    <button
      type="button"
      onClick={() => void onOpenCandidate(entry.candidate_id)}
      className={[
        "w-full rounded-2xl border px-4 py-3 text-left transition hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--accent-soft))]",
        hasDealBreakerRejection
          ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger-soft))]"
          : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Posicao #{entry.rank}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-[hsl(var(--text))]">{entry.candidate_name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Ranking da vaga
          </p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-[hsl(var(--text))]">
            {Math.round(entry.final_score)}%
          </p>
          {hasDealBreakerRejection ? (
            <div className="mt-2 flex justify-end">
              <Badge variant="danger">Critério eliminatório</Badge>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))]">
          {freshnessLabel}
        </span>
      </div>

      {hasDealBreakerRejection && dealBreakerDisplay ? (
        <div className="mt-3 rounded-xl border border-[hsl(var(--danger))]/20 bg-white/75 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--danger))]">
            Rejeitado por regra da vaga
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text))]">
            {dealBreakerDisplay.fieldLabel}: esperado {dealBreakerDisplay.expected}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text-muted))]">
            Motivo configurado na vaga: {dealBreakerDisplay.reason}.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text-muted))]">
            O score foi zerado porque este critério é eliminatório.
          </p>
        </div>
      ) : null}

      {reasonPreview.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Por que este score?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasonPreview.map((reason) => (
              <span
                key={reason}
                className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))]"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {entry.explanation_text ? (
        <p className="ui-text-muted mt-3 line-clamp-2 text-xs leading-relaxed">
          {entry.explanation_text}
        </p>
      ) : (
        <p className="ui-text-muted mt-3 text-xs">
          A análise ainda não gerou um resumo para este candidato.
        </p>
      )}
    </button>
  );
}

// ── MetaCell ───────────────────────────────────────────────────────────────────
// Labeled metadata box inside the job info grid.

function MetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
      <div className="ui-text-muted text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-1.5 text-sm font-medium text-[hsl(var(--text))]">{children}</div>
    </div>
  );
}
