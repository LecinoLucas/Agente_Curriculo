import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { KanbanColumn } from "../components/kanban/KanbanColumn";
import { SkeletonRows } from "../components/common/Skeleton";
import { StatusPill } from "../components/common/StatusPill";
import { EmptyState } from "../components/common/EmptyState";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { feedback } from "../services/feedback";
import { HttpError } from "../services/http";
import { getJobRanking } from "../services/jobsService";
import { pipelineService } from "../services/pipelineService";
import type { JobRanking, JobRankingEntry, PipelineStage } from "../types/domain";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";

const MAIN_STAGES: ReadonlyArray<PipelineStage> = [
  "entry",
  "screening",
  "hr_interview",
  "technical_interview",
  "final",
  "offer",
  "hired",
];

// ── PipelinePage ───────────────────────────────────────────────────────────────

export function PipelinePage() {
  const { jobId: jobIdParam } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [rankingCollapsed, setRankingCollapsed] = useState(false);
  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const rankingCacheRef = useRef<Map<string, JobRanking>>(new Map());
  const rankingFetchInFlightRef = useRef<Map<string, Promise<JobRanking>>>(new Map());

  const {
    jobs,
    jobsLoading,
    jobsError,
    activeJobId,
    board,
    boardLoading,
    boardError,
    setActiveJob,
    refreshBoard,
    openCandidate,
  } = usePipeline();

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
  }, [activeJobId]);

  // ── Effect 2: auto-redirect when no jobId in URL ──────────────────────────
  // /pipeline (no :jobId) is a valid entry point. Once jobs are ready,
  // redirect to /pipeline/:firstJobId so the URL always reflects what's shown.
  // replace: true prevents the bare /pipeline from polluting browser history.
  useEffect(() => {
    if (jobIdParam) return;
    if (jobsLoading || jobs.length === 0) return;
    navigate(`/pipeline/${jobs[0].id}`, { replace: true });
  }, [jobIdParam, jobsLoading, jobs, navigate]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId) ?? null,
    [jobs, activeJobId],
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
  const rankingPreview = ranking?.candidates.slice(0, 3) ?? [];
  const isBoardRefreshing = boardLoading && board !== null;
  const showInitialBoardLoading = boardLoading && board === null;
  const isRankingRefreshing = rankingLoading && ranking !== null;
  const boardLayoutClass = rankingCollapsed
    ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_88px]"
    : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_clamp(18rem,24vw,21rem)]";

  // ── Handler ───────────────────────────────────────────────────────────────
  // Navigate only. The URL change triggers Effect 1 which calls setActiveJob.
  // This avoids double-calling setActiveJob (once here, once in the effect).
  function handleSelectJob(nextJobId: string) {
    navigate(`/pipeline/${nextJobId}`, { replace: true });
  }

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
            onClick={() => setShowNewCandidate(true)}
            disabled={!activeJobId}
            className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[hsl(var(--primary))]/90"
          >
            Novo candidato
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
              {jobsError ? (
                <p className="ui-badge-danger rounded-xl border border-[hsl(var(--danger))]/20 px-3 py-2 text-sm">
                  {jobsError}
                </p>
              ) : (
                <select
                  id="pipeline-job-select"
                  value={activeJobId ?? ""}
                  onChange={(e) => handleSelectJob(e.target.value)}
                  disabled={jobsLoading || jobs.length === 0}
                  className="ui-input h-11 w-full rounded-xl px-3 text-sm disabled:opacity-50"
                >
                  {jobsLoading ? (
                    <option value="">Carregando vagas…</option>
                  ) : (
                    jobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {jobsLoading ? (
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

          {activeJobId ? (
            <button
              type="button"
              onClick={() => setRankingCollapsed((current) => !current)}
              className="ui-btn-secondary inline-flex items-center justify-center gap-2 self-start rounded-xl border px-3 py-2 text-sm font-medium shadow-sm xl:self-center"
              aria-expanded={!rankingCollapsed}
              aria-controls="pipeline-ranking-panel"
            >
              {rankingCollapsed ? (
                <>
                  <PanelRightOpen className="h-4 w-4" />
                  <span>Mostrar ranking</span>
                  <ChevronDown className="h-4 w-4 xl:hidden" />
                </>
              ) : (
                <>
                  <PanelRightClose className="h-4 w-4" />
                  <span>Ocultar ranking</span>
                  <ChevronUp className="h-4 w-4 xl:hidden" />
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Empty: no jobs at all ── */}
      {!jobsLoading && jobs.length === 0 && !jobsError ? (
        <EmptyState
          icon="🧭"
          title="Nenhuma vaga publicada ainda"
          description="Crie ou publique uma vaga para começar a acompanhar candidatos no pipeline."
        />
      ) : null}

      {/* ── Board section ── */}
      {activeJobId ? (
        <div className={boardLayoutClass}>
          <div className="ui-card overflow-hidden rounded-3xl p-4 sm:p-5">
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
                    />
                  ))}

                  {rejectedCol ? (
                    <>
                      <div className="mx-0.5 w-px self-stretch bg-[hsl(var(--border))]" />
                      <KanbanColumn
                        column={rejectedCol}
                        colIndex={mainCols.length}
                        onCardClick={openCandidate}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

          {/* Empty board */}
            {!showInitialBoardLoading && board && !boardError && totalActive === 0 && totalRejected === 0 ? (
              <EmptyState
                icon="📋"
                title="Ainda não há candidatos nesta vaga"
                description="Adicione um candidato ou envie um currículo para iniciar o acompanhamento neste pipeline."
              />
            ) : null}
          </div>

          <RankingPanel
            collapsed={rankingCollapsed}
            jobTitle={selectedJob?.title ?? "vaga selecionada"}
            preview={rankingPreview}
            totalActive={totalActive}
            ranking={ranking}
            loading={rankingLoading}
            isRefreshing={isRankingRefreshing}
            error={rankingError}
            onToggle={() => setRankingCollapsed((current) => !current)}
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
        </div>
      ) : null}

      {/* ── New candidate modal ── */}
      {showNewCandidate && (
        <NewCandidateModal
          activeJobId={activeJobId}
          job={selectedJob}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (id) => {
            setShowNewCandidate(false);
            await openCandidate(id, "documents");
          }}
        />
      )}

      {/* ── Candidate drawer — position: fixed, always rendered, open via context ── */}
      <CandidateDrawer />
    </div>
  );
}

function RankingPanel({
  collapsed,
  jobTitle,
  preview,
  totalActive,
  ranking,
  loading,
  isRefreshing,
  error,
  onToggle,
  onOpenCandidate,
  onRefresh,
}: {
  collapsed: boolean;
  jobTitle: string;
  preview: JobRankingEntry[];
  totalActive: number;
  ranking: JobRanking | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onToggle: () => void;
  onOpenCandidate: (candidateId: string) => Promise<void>;
  onRefresh?: () => void;
}) {
  const showInitialLoading = loading && ranking === null;
  const candidateCount = ranking?.total_candidates ?? totalActive;

  return (
    <aside
      id="pipeline-ranking-panel"
      className={[
        "ui-card rounded-3xl transition-all duration-200",
        collapsed ? "p-3 sm:p-4" : "p-4 sm:p-5",
      ].join(" ")}
    >
      <div
        className={[
          "flex gap-3 border-b border-[hsl(var(--border))] pb-4",
          collapsed ? "flex-col items-center text-center" : "items-start justify-between",
        ].join(" ")}
      >
        <div className={collapsed ? "w-full" : "min-w-0"}>
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">
            Ranking da vaga
          </p>
          <h3
            className={[
              "mt-1 font-semibold text-[hsl(var(--text))]",
              collapsed ? "line-clamp-3 text-sm" : "text-sm",
            ].join(" ")}
          >
            {jobTitle}
          </h3>
          <p className="ui-text-muted mt-1 text-xs">
            Apoio a decisao. O ranking nao altera a etapa do pipeline.
          </p>
        </div>
        <div
          className={[
            "flex gap-2",
            collapsed ? "w-full flex-col items-stretch" : "shrink-0 items-center",
          ].join(" ")}
        >
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
            aria-expanded={!collapsed}
            aria-controls="pipeline-ranking-content"
          >
            {collapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
            <span>{collapsed ? "Expandir" : "Recolher"}</span>
          </button>
        </div>
      </div>

      <div id="pipeline-ranking-content" className="mt-4">
        {collapsed ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Candidatos ranqueados
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[hsl(var(--text))]">
                {candidateCount}
              </p>
            </div>

            {preview.length > 0 ? (
              <div className="space-y-2">
                {preview.map((entry) => (
                  <button
                    key={`${entry.rank}-${entry.candidate_id}`}
                    type="button"
                    onClick={() => void onOpenCandidate(entry.candidate_id)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2 text-left transition hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--accent-soft))]"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                        #{entry.rank}
                      </p>
                      <p className="truncate text-xs font-medium text-[hsl(var(--text))]">
                        {entry.candidate_name}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-[hsl(var(--text))]">
                      {Math.round(entry.final_score)}%
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!collapsed ? (
          <>
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

                {ranking.candidates.map((entry) => (
                  <RankingCard
                    key={`${entry.rank}-${entry.candidate_id}`}
                    entry={entry}
                    onOpenCandidate={onOpenCandidate}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function RankingCard({
  entry,
  onOpenCandidate,
}: {
  entry: JobRankingEntry;
  onOpenCandidate: (candidateId: string) => Promise<void>;
}) {
  const reasonPreview = entry.reason_codes
    .slice(0, 2)
    .map((reason) => reason.description)
    .filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => void onOpenCandidate(entry.candidate_id)}
      className="w-full rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3 text-left transition hover:border-[hsl(var(--primary))]/35 hover:bg-[hsl(var(--accent-soft))]"
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
        </div>
      </div>

      {reasonPreview.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reasonPreview.map((reason) => (
            <span
              key={reason}
              className="inline-flex items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))]"
            >
              {reason}
            </span>
          ))}
        </div>
      ) : null}

      {entry.explanation_text ? (
        <p className="ui-text-muted mt-3 line-clamp-3 text-xs leading-relaxed">
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

// ── NewCandidateModal ──────────────────────────────────────────────────────────
// Creates a candidate and opens the drawer so the user can upload resume + request analysis.
// Validates fields and checks for email/CPF duplicates before submitting.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NewCandidateFormErrors = {
  fullName?: string;
  email?: string;
  cpf?: string;
  form?: string;
};

type CandidateLinkStatus = "idle" | "created_pending_link" | "linked" | "link_failed";
type DuplicateJobStatus = "idle" | "checking" | "linked" | "unlinked";

function formatCpfInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

function NewCandidateModal({
  activeJobId,
  job,
  onClose,
  onCreated,
}: {
  activeJobId: string | null;
  job: { title: string; status: string; seniority_level: string | null } | null;
  onClose: () => void;
  onCreated: (candidateId: string) => Promise<void>;
}) {
  const { notifyCandidatesChanged, refreshBoard } = usePipeline();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<NewCandidateFormErrors>({});
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);
  const [createdCandidate, setCreatedCandidate] = useState<{ id: string; full_name: string } | null>(null);
  const [linkStatus, setLinkStatus] = useState<CandidateLinkStatus>("idle");
  const [duplicateJobStatus, setDuplicateJobStatus] = useState<DuplicateJobStatus>("idle");

  function clearDuplicate(field?: keyof NewCandidateFormErrors) {
    if (duplicate) setDuplicate(null);
    if (createdCandidate) {
      setCreatedCandidate(null);
      setLinkStatus("idle");
    }
    setDuplicateJobStatus("idle");
    setErrors((current) => {
      if (!field && !current.form) return current;
      if (!field) return {};
      return { ...current, [field]: undefined, form: undefined };
    });
  }

  async function checkCandidateLinkedToActiveJob(candidateId: string): Promise<boolean> {
    if (!activeJobId) return false;
    const overview = await candidatesService.getOverview(candidateId);
    return overview.pipeline_entries.some((entry) => entry.job_id === activeJobId);
  }

  async function linkCandidateToActiveJob(candidateId: string) {
    if (!activeJobId) {
      throw new Error("Selecione uma vaga antes de vincular o candidato.");
    }
    setLinkStatus("created_pending_link");
    await pipelineService.addCandidateToJob(candidateId, { job_id: activeJobId, initial_stage: "entry" });
    await refreshBoard();
    setLinkStatus("linked");
  }

  function validateForm(): {
    trimmedName: string;
    trimmedEmail: string;
    trimmedPhone: string;
    cpfDigits: string;
  } | null {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const cpfDigits = cpf.replace(/\D/g, "");
    const nextErrors: NewCandidateFormErrors = {};

    if (!trimmedName) {
      nextErrors.fullName = "Nome é obrigatório";
    }
    if (!trimmedEmail) {
      nextErrors.email = "E-mail é obrigatório";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Informe um e-mail válido";
    }
    if (cpfDigits && cpfDigits.length !== 11) {
      nextErrors.cpf = "CPF deve ter 11 dígitos";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    setErrors({});
    return { trimmedName, trimmedEmail, trimmedPhone, cpfDigits };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeJobId || !job) {
      setErrors({ form: "Selecione uma vaga antes de cadastrar um candidato." });
      return;
    }
    const validated = validateForm();
    if (!validated) {
      return;
    }
    const { trimmedName, trimmedEmail, trimmedPhone, cpfDigits } = validated;

    setLoading(true);
    setErrors({});
    setDuplicate(null);
    setCreatedCandidate(null);
    setLinkStatus("idle");
    setDuplicateJobStatus("idle");
    feedback.createCandidate.processing();

    try {
      const check = await candidatesService.checkDuplicate(
        trimmedEmail,
        cpfDigits || undefined,
      );
      if (check.exists && check.candidate_id) {
        setDuplicate({
          id: check.candidate_id,
          full_name: check.full_name ?? "Candidato existente",
        });
        setDuplicateJobStatus("checking");
        const isLinked = await checkCandidateLinkedToActiveJob(check.candidate_id);
        setDuplicateJobStatus(isLinked ? "linked" : "unlinked");
        setErrors({
          form: "Já existe um candidato com este email/CPF",
        });
        return;
      }

      const candidate = await candidatesService.create({
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        cpf: cpfDigits || undefined,
      });
      notifyCandidatesChanged();
      setCreatedCandidate({ id: candidate.id, full_name: candidate.full_name });
      try {
        await linkCandidateToActiveJob(candidate.id);
        await onCreated(candidate.id);
      } catch (err: unknown) {
        setLinkStatus("link_failed");
        setErrors({
          form: formatContextError(
            err,
            "Candidato criado, mas falhou ao vincular à vaga atual.",
            "Tente vincular novamente para que ele apareça neste pipeline.",
          ),
        });
        return;
      }
      feedback.createCandidate.success();
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          feedback.createCandidate.error(err);
          setErrors({
            form: "Já existe um candidato com este email/CPF",
          });
          return;
        }
        if (err.status === 422) {
          feedback.createCandidate.error(err);
          setErrors({
            form: "Dados inválidos. Revise nome, e-mail e CPF antes de criar o candidato.",
          });
          return;
        }
      }
      feedback.createCandidate.error(err);
      setErrors({
        form: formatContextError(
          err,
          "Não foi possível criar o candidato.",
          "Revise os dados e tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryLink() {
    if (!createdCandidate) return;
    setLoading(true);
    setErrors({});
    try {
      await linkCandidateToActiveJob(createdCandidate.id);
      await onCreated(createdCandidate.id);
      feedback.createCandidate.success();
    } catch (err: unknown) {
      setLinkStatus("link_failed");
      setErrors({
        form: formatContextError(
          err,
          "Candidato criado, mas ainda não foi possível vincular à vaga.",
          "Tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenDuplicateCandidate() {
    if (!duplicate) return;
    setLoading(true);
    setErrors({});
    try {
      const isLinked =
        duplicateJobStatus === "linked"
          ? true
          : await checkCandidateLinkedToActiveJob(duplicate.id);
      setDuplicateJobStatus(isLinked ? "linked" : "unlinked");
      if (!isLinked) {
        setErrors({
          form: "Este candidato já existe, mas ainda não está vinculado à vaga ativa.",
        });
        return;
      }
      await onCreated(duplicate.id);
    } catch (err: unknown) {
      setErrors({
        form: formatContextError(
          err,
          "Não foi possível abrir o candidato existente nesta vaga.",
          "Tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkDuplicateCandidate() {
    if (!duplicate) return;
    setLoading(true);
    setErrors({});
    setCreatedCandidate({ id: duplicate.id, full_name: duplicate.full_name });
    try {
      await linkCandidateToActiveJob(duplicate.id);
      setDuplicateJobStatus("linked");
      await onCreated(duplicate.id);
    } catch (err: unknown) {
      setLinkStatus("link_failed");
      setErrors({
        form: formatContextError(
          err,
          "Falha ao vincular o candidato duplicado à vaga ativa.",
          "Tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  const workflowStatus = duplicate
    ? duplicateJobStatus === "linked"
      ? "linked"
      : duplicateJobStatus === "unlinked"
        ? "link_failed"
        : "created_pending_link"
    : linkStatus;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novo candidato"
        className="ui-card fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Novo candidato</h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              Após criar, envie o currículo PDF. A interface vai informar se a análise começou automaticamente ou se ainda precisa de ação manual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-[hsl(var(--text-muted))] hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Cadastrando para a vaga: {job?.title ?? "Nenhuma vaga selecionada"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill
              label={formatJobStatus(job?.status)}
              tone={jobStatusTone(job?.status)}
            />
            {job?.seniority_level ? (
              <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                {formatSeniority(job.seniority_level)}
              </span>
            ) : null}
          </div>
        </div>

        {(createdCandidate || duplicate) && workflowStatus !== "idle" ? (
          <div
            className={[
              "mb-4 rounded-xl border px-4 py-3",
              workflowStatus === "linked"
                ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))]"
                : workflowStatus === "link_failed"
                  ? "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))]"
                  : "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))]",
            ].join(" ")}
          >
            <p className="text-sm font-semibold text-[hsl(var(--text))]">
              {workflowStatus === "linked"
                ? "Vinculado à vaga"
                : workflowStatus === "link_failed"
                  ? "Falha ao vincular"
                  : "Candidato criado, aguardando vínculo com a vaga"}
            </p>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              {workflowStatus === "linked"
                ? "Este candidato já está contextualizado na vaga ativa."
                : workflowStatus === "link_failed"
                  ? "O cadastro existe, mas ele ainda não entrou no pipeline desta vaga."
                  : "Finalizando a entrada do candidato no pipeline da vaga atual."}
            </p>
          </div>
        ) : null}

        {!activeJobId || !job ? (
          <div className="mb-4 rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] p-4">
            <p className="text-sm font-semibold text-[hsl(var(--warning))]">Cadastro bloqueado</p>
            <p className="mt-0.5 text-sm text-[hsl(var(--warning))]">
              Selecione uma vaga no pipeline para criar e contextualizar este candidato.
            </p>
          </div>
        ) : null}

        {duplicate ? (
          <div className="mb-4 rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] p-4">
            <p className="text-sm font-semibold text-[hsl(var(--warning))]">
              Candidato duplicado encontrado
            </p>
            <p className="mt-0.5 text-sm text-[hsl(var(--warning))]">
              Já existe um candidato com este email/CPF: <strong>{duplicate.full_name}</strong>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleOpenDuplicateCandidate()}
                disabled={!activeJobId || loading || duplicateJobStatus === "checking" || duplicateJobStatus === "unlinked"}
                className="rounded-lg bg-[hsl(var(--warning))] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[hsl(var(--warning))]/90 disabled:opacity-50"
              >
                {duplicateJobStatus === "checking" ? "Verificando vínculo…" : "Abrir candidato existente"}
              </button>
              {duplicateJobStatus === "unlinked" ? (
                <button
                  type="button"
                  onClick={() => void handleLinkDuplicateCandidate()}
                  disabled={!activeJobId || loading}
                  className="rounded-lg border border-[hsl(var(--warning))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--warning))] transition hover:bg-[hsl(var(--warning-soft))] disabled:opacity-50"
                >
                  Adicionar a esta vaga
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Nome completo *</span>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearDuplicate("fullName");
              }}
              placeholder="Nome do candidato"
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.fullName
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.fullName ? <span className="text-xs text-red-600">{errors.fullName}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-900">E-mail *</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearDuplicate("email");
              }}
              placeholder="email@exemplo.com"
              className={[
                "h-10 w-full rounded-lg bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2",
                errors.email
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.email ? <span className="text-xs text-red-600">{errors.email}</span> : null}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-900">Telefone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  clearDuplicate();
                }}
                placeholder="(11) 99999-9999"
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-900">CPF</span>
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => {
                  setCpf(formatCpfInput(e.target.value));
                  clearDuplicate("cpf");
                }}
                placeholder="000.000.000-00"
                maxLength={14}
                className={[
                  "h-10 w-full rounded-lg bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2",
                  errors.cpf
                    ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                    : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
                ].join(" ")}
              />
              {errors.cpf ? <span className="text-xs text-red-600">{errors.cpf}</span> : null}
            </label>
          </div>

          {errors.form ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            {createdCandidate && linkStatus === "link_failed" ? (
              <button
                type="button"
                onClick={() => void handleRetryLink()}
                disabled={loading}
                className="rounded-lg border border-[hsl(var(--danger))] px-4 py-2 text-sm font-medium text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger-soft))] disabled:opacity-50"
              >
                Tentar vincular novamente
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !activeJobId || !job || Boolean(createdCandidate)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {loading ? "Verificando…" : createdCandidate ? "Candidato criado" : "Criar e abrir perfil"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
