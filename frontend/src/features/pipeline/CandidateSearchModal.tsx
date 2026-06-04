import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Zap, ExternalLink } from "lucide-react";
import type { CandidateListSummary, JobRanking, JobRankingEntry } from "../../types/domain";
import { candidatesService } from "../../services/candidatesService";
import { formatContextError } from "../../services/errorMessages";
import { HttpError } from "../../services/http";
import { pipelineService } from "../../services/pipelineService";
import { toast } from "../../shared/utils/toast";
import { scoreColorClass } from "../candidates/drawer/hooks/useCandidateDecision";
import { normalizeScorePercent } from "../candidates/utils/scoreFormatting";
import { buildAnalysisDecisionToast } from "./analysisDispatchFeedback";
import { PIPELINE_STAGE_LABELS } from "../../shared/status/statusLabels";

interface CandidateSearchModalProps {
  isOpen: boolean;
  activeJobId: string;
  activeJobTitle: string;
  ranking: JobRanking | null;
  rankingLoading: boolean;
  onClose: () => void;
  onAdded: () => Promise<void>;
  onCreateNew: () => void;
  onOpenCandidate?: (candidateId: string, targetUrl?: string) => void;
}

export function CandidateSearchModal({
  isOpen,
  activeJobId,
  activeJobTitle,
  ranking,
  rankingLoading,
  onClose,
  onAdded,
  onCreateNew,
  onOpenCandidate,
}: CandidateSearchModalProps) {
  function isReactivationConflict(error: unknown): error is HttpError {
    return (
      error instanceof HttpError &&
      error.status === 409 &&
      /v[ií]nculo já existe ou foi alterado/i.test(error.message)
    );
  }

  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<CandidateListSummary[]>([]);
  // Start as `true` whenever the modal opens so the very first render shows the
  // loading state (skeletons) instead of flashing "Nenhum candidato disponível"
  // before the initial fetch effect runs.
  const [summariesLoading, setSummariesLoading] = useState(isOpen);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previousProcessPrompt, setPreviousProcessPrompt] = useState<{
    candidateId: string;
    candidateName: string;
    lastStage: string;
    result: string;
    closedAt: string | null;
  } | null>(null);
  const [previousProcessError, setPreviousProcessError] = useState<string | null>(null);

  // FIX #3: Use a ref to track the latest request version and avoid race conditions
  const fetchVersionRef = useRef(0);
  const pendingAddIdsRef = useRef<Set<string>>(new Set());

  // Initial list size. Backend supports paging/search; we keep the first page
  // intentionally short so the modal opens fast. The search input queries the
  // service with the term, not just the loaded slice — see effect below.
  const INITIAL_PAGE_SIZE = 10;
  const SEARCH_PAGE_SIZE = 40;

  // FIX #2 + #3: Wrap fetchSummaries in useCallback and handle race conditions with AbortController
  const fetchSummaries = useCallback(async (q: string) => {
    const version = ++fetchVersionRef.current;
    setSummariesLoading(true);
    const pageSize = q ? SEARCH_PAGE_SIZE : INITIAL_PAGE_SIZE;
    try {
      const { data } = await candidatesService.listSummaries(1, pageSize, {
        search: q || undefined,
        // When a search term is present, omit the filter so the query is global
        // (finds any candidate, including those already in other jobs/pipelines).
        // Without a term the initial list only shows candidates without active jobs.
        link_status_filter: q ? undefined : "without_active_job",
      });
      // Ignore stale responses from previous requests
      if (version !== fetchVersionRef.current) return;
      setSummaries(data);
    } catch (err) {
      if (version !== fetchVersionRef.current) return;
      toast.error("Erro ao buscar candidatos");
    } finally {
      if (version === fetchVersionRef.current) {
        setSummariesLoading(false);
      }
    }
  }, []);

  // FIX #1: Single unified effect with debounce — no double fetch on open
  useEffect(() => {
    if (!isOpen) return;

    // Fetch immediately when modal opens (search is "" at this point)
    // and debounce subsequent search changes
    const isInitialOpen = search === "";
    if (isInitialOpen) {
      void fetchSummaries("");
      return;
    }

    const timer = setTimeout(() => void fetchSummaries(search), 350);
    return () => clearTimeout(timer);
  }, [isOpen, search, fetchSummaries]);

  // Reset state on close / re-prime loading on open
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setSummaries([]);
      setAddedIds(new Set());
      setErrors({});
      setPreviousProcessPrompt(null);
      setPreviousProcessError(null);
      pendingAddIdsRef.current.clear();
      // Reset fetch version so stale requests from previous session are ignored
      fetchVersionRef.current = 0;
      setSummariesLoading(false);
    } else {
      // Re-opening: prime loading state synchronously so the first paint
      // shows skeletons, never an empty state, while the fetch effect runs.
      setSummariesLoading(true);
    }
  }, [isOpen]);

  // FIX #4: Also filter rankedAvailable by addedIds so added candidates disappear immediately
  const rankedAvailable = useMemo(() => {
    if (!ranking) return [];
    return ranking.candidates
      .filter((e) => !e.stage)
      .filter((e) => !addedIds.has(e.candidate_id))
      .filter((e) =>
        e.candidate_name.toLowerCase().includes(search.toLowerCase()),
      )
      .slice(0, 8);
  }, [ranking, search, addedIds]);

  const rankedIds = useMemo(
    () => new Set(ranking?.candidates.map((e) => e.candidate_id) ?? []),
    [ranking],
  );

  const otherCandidates = useMemo(
    () =>
      summaries.filter(
        (s) => !rankedIds.has(s.id) && !addedIds.has(s.id) && !addingIds.has(s.id),
      ),
    [summaries, rankedIds, addedIds, addingIds],
  );

  async function hasPreviousClosedProcess(candidateId: string, candidateName: string) {
    try {
      const history = await pipelineService.getCandidateHistory(activeJobId, candidateId);
      if (history.status === "active") return false;
      setPreviousProcessPrompt({
        candidateId,
        candidateName,
        lastStage: history.current_stage,
        result: history.status === "rejected" ? "Não selecionado" : history.status,
        closedAt: history.updated_at,
      });
      return true;
    } catch {
      return false;
    }
  }

  function getClosedProcessFromCandidate(candidate: CandidateListSummary) {
    const status = candidate.latest_relationship_status?.toLowerCase() ?? null;
    const isSameJob = candidate.latest_job_id === activeJobId;
    const isClosed = status
      ? ["rejected", "hired", "withdrawn", "archived", "removed", "transferred"].includes(status)
      : false;

    if (!isSameJob || !isClosed) return null;

    return {
      candidateId: candidate.id,
      candidateName: candidate.full_name,
      lastStage: candidate.latest_job_stage ?? "entry",
      result: status === "rejected" ? "Não selecionado" : status,
      closedAt: null,
    };
  }

  const summaryByCandidateId = useMemo(() => {
    const map = new Map<string, CandidateListSummary>();
    for (const summary of summaries) {
      map.set(summary.id, summary);
    }
    return map;
  }, [summaries]);

  async function handleAdd(
    candidateId: string,
    candidateName: string,
    options: { skipPreviousCheck?: boolean } = {},
  ) {
    if (pendingAddIdsRef.current.has(candidateId) || addedIds.has(candidateId)) {
      return;
    }

    pendingAddIdsRef.current.add(candidateId);
    setAddingIds((prev) => new Set(prev).add(candidateId));
    setErrors((prev) => ({ ...prev, [candidateId]: "" }));
    try {
      if (!options.skipPreviousCheck && await hasPreviousClosedProcess(candidateId, candidateName)) {
        return;
      }
      const linkResult = options.skipPreviousCheck
        ? await pipelineService.reconsiderCandidateJob(candidateId, {
          job_id: activeJobId,
          initial_stage: "entry",
          reason: "Reabertura manual do processo pela pipeline.",
        })
        : await pipelineService.addCandidateToJob(candidateId, {
          job_id: activeJobId,
          initial_stage: "entry",
        });
      const analysisToast = buildAnalysisDecisionToast(linkResult.analysis);
      if (analysisToast) {
        if (analysisToast.tone === "success") toast.success(analysisToast.message);
        if (analysisToast.tone === "info") toast.info(analysisToast.message);
        if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
        if (analysisToast.tone === "error") toast.error(analysisToast.message);
      }
      setPreviousProcessPrompt(null);
      setPreviousProcessError(null);
      setAddedIds((prev) => new Set(prev).add(candidateId));
      await onAdded();
    } catch (err: unknown) {
      if (!options.skipPreviousCheck && isReactivationConflict(err)) {
        try {
          const reconsidered = await pipelineService.reconsiderCandidateJob(candidateId, {
            job_id: activeJobId,
            initial_stage: "entry",
            reason: "Reabertura automática após conflito de vínculo histórico.",
          });
          const analysisToast = buildAnalysisDecisionToast(reconsidered.analysis);
          if (analysisToast) {
            if (analysisToast.tone === "success") toast.success(analysisToast.message);
            if (analysisToast.tone === "info") toast.info(analysisToast.message);
            if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
            if (analysisToast.tone === "error") toast.error(analysisToast.message);
          }
          setPreviousProcessPrompt(null);
          setPreviousProcessError(null);
          setAddedIds((prev) => new Set(prev).add(candidateId));
          await onAdded();
          return;
        } catch {
          // keep original message path below when reconsideration also fails
        }
      }

      if (
        err instanceof HttpError &&
        err.status === 409 &&
        err.message.includes("já está ativo nesta vaga")
      ) {
        setPreviousProcessPrompt(null);
        setAddedIds((prev) => new Set(prev).add(candidateId));
        toast.info("Candidato já está vinculado a esta vaga.");
        await onAdded();
        return;
      }

      const message = formatContextError(
        err,
        "Não foi possível vincular o candidato à vaga.",
        "Recarregue a lista e tente novamente.",
      );
      if (options.skipPreviousCheck) {
        setPreviousProcessError(message);
        return;
      }
      setErrors((prev) => ({ ...prev, [candidateId]: message }));
    } finally {
      pendingAddIdsRef.current.delete(candidateId);
      setAddingIds((prev) => {
        const s = new Set(prev);
        s.delete(candidateId);
        return s;
      });
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {previousProcessPrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-text">
              Este candidato já participou desta vaga anteriormente.
            </h3>
            <div className="mt-4 space-y-2 text-sm text-text-muted">
              <p>Última etapa: {previousProcessPrompt.lastStage}</p>
              <p>Último resultado: {previousProcessPrompt.result}</p>
              {previousProcessPrompt.closedAt ? (
                <p>Encerrado em: {new Date(previousProcessPrompt.closedAt).toLocaleDateString("pt-BR")}</p>
              ) : (
                <p>Processo anterior encerrado nesta vaga.</p>
              )}
              <p>
                Ao iniciar novo processo, entrevistas, scorecards e decisões anteriores
                permanecem no histórico, mas não liberam etapas do novo processo.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm text-text transition hover:bg-surface-muted"
                onClick={() => {
                  setPreviousProcessPrompt(null);
                  setPreviousProcessError(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-2 text-sm text-text transition hover:bg-surface-muted"
                onClick={() => {
                  onOpenCandidate?.(
                    previousProcessPrompt.candidateId,
                    `/candidatos/${previousProcessPrompt.candidateId}?tab=history&job_id=${activeJobId}`,
                  );
                  setPreviousProcessPrompt(null);
                  setPreviousProcessError(null);
                }}
              >
                Ver histórico anterior
              </button>
              <button
                type="button"
                disabled={addingIds.has(previousProcessPrompt.candidateId)}
                className="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void handleAdd(
                  previousProcessPrompt.candidateId,
                  previousProcessPrompt.candidateName,
                  { skipPreviousCheck: true },
                )}
              >
                {addingIds.has(previousProcessPrompt.candidateId) ? "Iniciando…" : "Iniciar novo processo"}
              </button>
            </div>
            {previousProcessError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {previousProcessError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-border/40 bg-surface shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-border/30 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-muted">
                Vincular candidatos
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-text">
                {activeJobTitle}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Search input */}
          <div className="sticky top-0 bg-surface px-6 py-4 border-b border-border/20">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar candidato por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/50"
              />
            </div>
            {!search && !summariesLoading && otherCandidates.length > 0 && (
              <p
                className="mt-2 text-[11px] text-text-muted"
                data-testid="initial-list-hint"
              >
                Mostrando {otherCandidates.length} candidato{otherCandidates.length === 1 ? "" : "s"} disponíve{otherCandidates.length === 1 ? "l" : "is"}. Use a busca para encontrar candidatos fora desta lista inicial.
              </p>
            )}
          </div>

          {/* Content sections */}
          <div className="px-6 py-4 space-y-6">
            {/* IA Recomenda */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-text">
                  IA Recomenda
                </h3>
                {rankedAvailable.length > 0 && (
                  <span className="text-xs font-medium text-text-muted">
                    {rankedAvailable.length}
                  </span>
                )}
              </div>

              {rankingLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-surface-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : rankedAvailable.length > 0 ? (
                <div className="space-y-2">
                  {rankedAvailable.map((entry) => {
                    const summary = summaryByCandidateId.get(entry.candidate_id);
                    return (
                      <RankedCandidateRow
                        key={entry.candidate_id}
                        entry={entry}
                        activeJobId={activeJobId}
                        summary={summary}
                        isAdding={addingIds.has(entry.candidate_id)}
                        isAdded={addedIds.has(entry.candidate_id)}
                        error={errors[entry.candidate_id]}
                        onAdd={() => {
                          if (summary) {
                            const previousProcess = getClosedProcessFromCandidate(summary);
                            if (previousProcess) {
                              setPreviousProcessError(null);
                              setPreviousProcessPrompt(previousProcess);
                              return;
                            }
                          }
                          void handleAdd(entry.candidate_id, entry.candidate_name);
                        }}
                        onOpen={() =>
                          onOpenCandidate?.(
                            entry.candidate_id,
                            summary?.active_job_id
                              ? `/pipeline/${summary.active_job_id}?candidateId=${entry.candidate_id}`
                              : undefined,
                          )
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  {ranking === null
                    ? "Ranking não disponível ainda. Abra o painel de ranking para carregar recomendações."
                    : "Nenhum candidato recomendado"}
                </p>
              )}
            </section>

            {/* Outros candidatos */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-text">
                  Outros candidatos
                </h3>
                {otherCandidates.length > 0 && (
                  <span className="text-xs font-medium text-text-muted">
                    {otherCandidates.length}
                  </span>
                )}
              </div>

              {summariesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-surface-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : otherCandidates.length > 0 ? (
                <div className="space-y-2">
                  {otherCandidates.map((candidate) => (
                    <OtherCandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      activeJobId={activeJobId}
                      isAdding={addingIds.has(candidate.id)}
                      isAdded={addedIds.has(candidate.id)}
                      error={errors[candidate.id]}
                      onAdd={() => {
                        const previousProcess = getClosedProcessFromCandidate(candidate);
                        if (previousProcess) {
                          setPreviousProcessError(null);
                          setPreviousProcessPrompt(previousProcess);
                          return;
                        }
                        void handleAdd(candidate.id, candidate.full_name);
                      }}
                      onOpen={() =>
                        onOpenCandidate?.(
                          candidate.id,
                          candidate.active_job_id
                            ? `/pipeline/${candidate.active_job_id}?candidateId=${candidate.id}`
                            : undefined,
                        )
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted" data-testid="other-candidates-empty">
                  {search
                    ? "Nenhum candidato encontrado para esta busca."
                    : "Nenhum candidato disponível."}
                </p>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border/30 px-6 py-4 bg-surface-muted/30">
          <button
            onClick={() => {
              onClose();
              onCreateNew();
            }}
            className="text-xs font-medium text-[hsl(var(--primary))] transition hover:underline"
          >
            + Criar candidato manualmente
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared helper: derives link-status flags from a CandidateListSummary cross-reference.
// Returns the empty/false state when summary is not available (no data to show).
function deriveLinkStatus(
  activeJobId: string,
  summary: CandidateListSummary | undefined,
) {
  const linkedJobId = summary?.active_job_id ?? null;
  const isInThisJob = linkedJobId !== null && linkedJobId === activeJobId;
  const isInAnotherJob = linkedJobId !== null && linkedJobId !== activeJobId;
  const stageLabel = summary?.active_job_stage
    ? (PIPELINE_STAGE_LABELS[summary.active_job_stage as keyof typeof PIPELINE_STAGE_LABELS]
        ?? summary.active_job_stage)
    : null;
  return { isInThisJob, isInAnotherJob, stageLabel, linkedJobId };
}

function RankedCandidateRow({
  entry,
  activeJobId,
  summary,
  isAdding,
  isAdded,
  error,
  onAdd,
  onOpen,
}: {
  entry: JobRankingEntry;
  activeJobId: string;
  summary: CandidateListSummary | undefined;
  isAdding: boolean;
  isAdded: boolean;
  error?: string;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const scorePercent = normalizeScorePercent(entry.job_fit_score);
  const scoreClass = scoreColorClass(entry.job_fit_score);
  const { isInThisJob, isInAnotherJob, stageLabel } = deriveLinkStatus(activeJobId, summary);
  const canOpenInPipeline = (isInThisJob || isInAnotherJob) && !isAdded;

  return (
    <div
      data-testid={`ranked-row-${entry.candidate_id}`}
      className={`rounded-lg border p-3 transition ${
        isInThisJob
          ? "border-emerald-200/60 bg-emerald-50/20 hover:border-emerald-200/80"
          : isInAnotherJob
            ? "border-blue-200/60 bg-blue-50/20 hover:border-blue-200/80"
            : "border-border/40 bg-surface-muted/20 hover:border-border/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-text leading-snug">
            {entry.candidate_name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center rounded-full border border-current/15 bg-current/5 px-2 py-0.5 text-xs font-semibold ${scoreClass}`}>
              {scorePercent}%
            </span>
            {isAdded ? (
              <span
                data-testid={`ranked-badge-linked-now-${entry.candidate_id}`}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
              >
                ✓ Vinculado agora
              </span>
            ) : isInThisJob ? (
              <span
                data-testid={`ranked-badge-in-job-${entry.candidate_id}`}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
              >
                Já vinculado nesta vaga
              </span>
            ) : isInAnotherJob ? (
              <span
                data-testid={`ranked-badge-in-another-${entry.candidate_id}`}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200"
              >
                Em pipeline
                {summary?.active_job_title && (
                  <span className="opacity-80">· {summary.active_job_title}</span>
                )}
                {stageLabel && (
                  <span className="opacity-60">· {stageLabel}</span>
                )}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {canOpenInPipeline && (
            <button
              data-testid={`ranked-btn-open-${entry.candidate_id}`}
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-medium text-text-muted transition hover:border-border hover:text-text"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Abrir no pipeline
            </button>
          )}
          {!isInThisJob && !isAdded && (
            <button
              data-testid={`ranked-btn-link-${entry.candidate_id}`}
              type="button"
              onClick={onAdd}
              disabled={isAdding}
              className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAdding ? "Vinculando…" : "Vincular"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}

function OtherCandidateRow({
  candidate,
  activeJobId,
  isAdding,
  isAdded,
  error,
  onAdd,
  onOpen,
}: {
  candidate: CandidateListSummary;
  activeJobId: string;
  isAdding: boolean;
  isAdded: boolean;
  error?: string;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const { isInThisJob, isInAnotherJob, stageLabel } = deriveLinkStatus(activeJobId, candidate);
  const canOpenInPipeline = (isInThisJob || isInAnotherJob) && !isAdded;

  return (
    <div
      data-testid={`candidate-row-${candidate.id}`}
      className={`rounded-lg border p-3 transition ${
        isInThisJob
          ? "border-emerald-200/60 bg-emerald-50/20 hover:border-emerald-200/80"
          : isInAnotherJob
            ? "border-blue-200/60 bg-blue-50/20 hover:border-blue-200/80"
            : "border-border/40 bg-surface-muted/20 hover:border-border/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: name, email, status */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-text leading-snug">
            {candidate.full_name}
          </p>
          {candidate.email && (
            <p className="text-xs text-text-muted mt-0.5">{candidate.email}</p>
          )}

          {/* Status badge */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {isAdded ? (
              <span
                data-testid="badge-linked-now"
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
              >
                ✓ Vinculado agora
              </span>
            ) : isInThisJob ? (
              <span
                data-testid="badge-already-in-job"
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
              >
                Já vinculado nesta vaga
              </span>
            ) : isInAnotherJob ? (
              <span
                data-testid="badge-in-another-job"
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200"
              >
                Em pipeline
                {candidate.active_job_title && (
                  <span className="opacity-80">· {candidate.active_job_title}</span>
                )}
                {stageLabel && (
                  <span className="opacity-60">· {stageLabel}</span>
                )}
              </span>
            ) : null}
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {canOpenInPipeline && (
            <button
              data-testid={`btn-open-pipeline-${candidate.id}`}
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-xs font-medium text-text-muted transition hover:border-border hover:text-text"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Abrir no pipeline
            </button>
          )}
          {!isInThisJob && !isAdded && (
            <button
              data-testid={`btn-link-${candidate.id}`}
              type="button"
              onClick={onAdd}
              disabled={isAdding}
              className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAdding ? "Vinculando…" : "Vincular"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}
