import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Zap, ArrowRight } from "lucide-react";
import type { CandidateListSummary, JobRanking, JobRankingEntry } from "../../types/domain";
import { candidatesService } from "../../services/candidatesService";
import { pipelineService } from "../../services/pipelineService";
import { toast } from "../../shared/utils/toast";
import { scoreColorClass } from "../candidates/drawer/hooks/useCandidateDecision";
import { normalizeScorePercent } from "../candidates/utils/scoreFormatting";
import { buildAnalysisDecisionToast } from "./analysisDispatchFeedback";

interface CandidateSearchModalProps {
  isOpen: boolean;
  activeJobId: string;
  activeJobTitle: string;
  ranking: JobRanking | null;
  rankingLoading: boolean;
  onClose: () => void;
  onAdded: () => Promise<void>;
  onCreateNew: () => void;
  onOpenCandidate?: (candidateId: string) => void;
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
  const [search, setSearch] = useState("");
  const [summaries, setSummaries] = useState<CandidateListSummary[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previousProcessPrompt, setPreviousProcessPrompt] = useState<{
    candidateId: string;
    candidateName: string;
    lastStage: string;
    result: string;
    closedAt: string;
  } | null>(null);

  // FIX #3: Use a ref to track the latest request version and avoid race conditions
  const fetchVersionRef = useRef(0);

  // FIX #2 + #3: Wrap fetchSummaries in useCallback and handle race conditions with AbortController
  const fetchSummaries = useCallback(async (q: string) => {
    const version = ++fetchVersionRef.current;
    setSummariesLoading(true);
    try {
      const { data } = await candidatesService.listSummaries(1, 40, q || undefined);
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

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setSummaries([]);
      setAddedIds(new Set());
      setErrors({});
      setPreviousProcessPrompt(null);
      // Reset fetch version so stale requests from previous session are ignored
      fetchVersionRef.current = 0;
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

  async function handleAdd(
    candidateId: string,
    candidateName: string,
    options: { skipPreviousCheck?: boolean } = {},
  ) {
    setAddingIds((prev) => new Set(prev).add(candidateId));
    setErrors((prev) => ({ ...prev, [candidateId]: "" }));
    try {
      if (!options.skipPreviousCheck && await hasPreviousClosedProcess(candidateId, candidateName)) {
        return;
      }
      const linkResult = await pipelineService.addCandidateToJob(candidateId, {
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
      setAddedIds((prev) => new Set(prev).add(candidateId));
      await onAdded();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao adicionar";
      setErrors((prev) => ({ ...prev, [candidateId]: message }));
    } finally {
      setAddingIds((prev) => {
        const s = new Set(prev);
        s.delete(candidateId);
        return s;
      });
    }
  }

  if (!isOpen) return null;

  const hasContent = rankedAvailable.length > 0 || otherCandidates.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {previousProcessPrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-[hsl(var(--text))]">
              Este candidato já participou desta vaga anteriormente.
            </h3>
            <div className="mt-4 space-y-2 text-sm text-[hsl(var(--text-muted))]">
              <p>Última etapa: {previousProcessPrompt.lastStage}</p>
              <p>Último resultado: {previousProcessPrompt.result}</p>
              <p>Encerrado em: {new Date(previousProcessPrompt.closedAt).toLocaleDateString("pt-BR")}</p>
              <p>
                Ao iniciar novo processo, entrevistas, scorecards e decisões anteriores
                permanecem no histórico, mas não liberam etapas do novo processo.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))]"
                onClick={() => setPreviousProcessPrompt(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))]"
                onClick={() => {
                  onOpenCandidate?.(previousProcessPrompt.candidateId);
                  setPreviousProcessPrompt(null);
                }}
              >
                Ver histórico anterior
              </button>
              <button
                type="button"
                className="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
                onClick={() => void handleAdd(
                  previousProcessPrompt.candidateId,
                  previousProcessPrompt.candidateName,
                  { skipPreviousCheck: true },
                )}
              >
                Iniciar novo processo
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface))] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-[hsl(var(--border))]/30 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[hsl(var(--text-muted))]">
                Vincular candidatos
              </p>
              <h2 className="mt-1 truncate text-lg font-semibold text-[hsl(var(--text))]">
                {activeJobTitle}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Search input */}
          <div className="sticky top-0 bg-[hsl(var(--surface))] px-6 py-4 border-b border-[hsl(var(--border))]/20">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
              <input
                type="text"
                placeholder="Buscar candidato por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/50"
              />
            </div>
          </div>

          {/* Content sections */}
          <div className="px-6 py-4 space-y-6">
            {/* IA Recomenda */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-[hsl(var(--text))]">
                  IA Recomenda
                </h3>
                {rankedAvailable.length > 0 && (
                  <span className="text-xs font-medium text-[hsl(var(--text-muted))]">
                    {rankedAvailable.length}
                  </span>
                )}
              </div>

              {rankingLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-[hsl(var(--surface-muted))]/50 animate-pulse" />
                  ))}
                </div>
              ) : rankedAvailable.length > 0 ? (
                <div className="space-y-2">
                  {rankedAvailable.map((entry) => (
                    <RankedCandidateRow
                      key={entry.candidate_id}
                      entry={entry}
                      isAdding={addingIds.has(entry.candidate_id)}
                      isAdded={addedIds.has(entry.candidate_id)}
                      error={errors[entry.candidate_id]}
                      onAdd={() => void handleAdd(entry.candidate_id, entry.candidate_name)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  {ranking === null
                    ? "Ranking não disponível ainda. Abra o painel de ranking para carregar recomendações."
                    : "Nenhum candidato recomendado"}
                </p>
              )}
            </section>

            {/* Outros candidatos */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-[hsl(var(--text))]">
                  Outros candidatos
                </h3>
                {otherCandidates.length > 0 && (
                  <span className="text-xs font-medium text-[hsl(var(--text-muted))]">
                    {otherCandidates.length}
                  </span>
                )}
              </div>

              {summariesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-lg bg-[hsl(var(--surface-muted))]/50 animate-pulse" />
                  ))}
                </div>
              ) : otherCandidates.length > 0 ? (
                <div className="space-y-2">
                  {otherCandidates.map((candidate) => (
                    <OtherCandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      isAdding={addingIds.has(candidate.id)}
                      isAdded={addedIds.has(candidate.id)}
                      error={errors[candidate.id]}
                      onAdd={() => void handleAdd(candidate.id, candidate.full_name)}
                      onOpen={() => onOpenCandidate?.(candidate.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[hsl(var(--text-muted))]">
                  {search ? "Nenhum candidato encontrado" : "Carregando..."}
                </p>
              )}
            </section>

            {!hasContent && !rankingLoading && !summariesLoading && (
              <div className="text-center py-6">
                <p className="text-sm text-[hsl(var(--text-muted))]">
                  Nenhum candidato disponível
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[hsl(var(--border))]/30 px-6 py-4 bg-[hsl(var(--surface-muted))]/30">
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

// FIX #5: error tipado como string | undefined em ambos os componentes
function RankedCandidateRow({
  entry,
  isAdding,
  isAdded,
  error,
  onAdd,
}: {
  entry: JobRankingEntry;
  isAdding: boolean;
  isAdded: boolean;
  error?: string; // era: string
  onAdd: () => void;
}) {
  const scorePercent = normalizeScorePercent(entry.job_fit_score);
  const scoreClass = scoreColorClass(entry.job_fit_score);

  return (
    <div className="rounded-lg border border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))]/20 p-3 hover:border-[hsl(var(--border))]/60 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-[hsl(var(--text))]">
            {entry.candidate_name}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full border border-current/15 bg-current/5 px-2 py-1 text-xs font-semibold ${scoreClass}`}>
              {scorePercent}%
            </span>
          </div>
        </div>

        <button
          onClick={onAdd}
          disabled={isAdding || isAdded}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${
            isAdded
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          {isAdding ? "Vinculando…" : isAdded ? "✓ Vinculado" : "Vincular"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}

function OtherCandidateRow({
  candidate,
  isAdding,
  isAdded,
  error,
  onAdd,
  onOpen,
}: {
  candidate: CandidateListSummary;
  isAdding: boolean;
  isAdded: boolean;
  error?: string;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const isLinked = Boolean(candidate.active_job_id);
  const showOpenAction = isLinked;

  return (
    <div className={`rounded-lg border p-3 transition ${
      isLinked
        ? "border-blue-200/60 bg-blue-50/30 hover:border-blue-200"
        : "border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))]/20 hover:border-[hsl(var(--border))]/60"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-[hsl(var(--text))]">
            {candidate.full_name}
          </p>
          <div className="mt-1 space-y-0.5">
            {candidate.email && (
              <p className="text-xs text-[hsl(var(--text-muted))]">{candidate.email}</p>
            )}
            {candidate.active_job_title && (
              <p className={`text-xs font-medium ${
                isLinked
                  ? "text-blue-700"
                  : "text-[hsl(var(--text-muted))]"
              }`}>
                {isLinked ? "✓ " : ""}Vaga: {candidate.active_job_title}
              </p>
            )}
            {!candidate.active_job_title && (
              <p className="text-xs text-amber-600 font-medium">Aguardando vaga</p>
            )}
          </div>
        </div>

        <button
          onClick={onAdd}
          disabled={isAdding || isAdded || isLinked}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${
            isAdded
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : isLinked
                ? "border-[hsl(var(--border))]/40 bg-[hsl(var(--surface-muted))]/10 text-[hsl(var(--text-muted))]"
                : "border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          {isAdding ? "Vinculando…" : isAdded ? "✓ Vinculado" : "Vincular"}
        </button>
      </div>

      {showOpenAction && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-blue-700">
            Gerencie o vínculo atual no workspace.
          </p>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-200"
            title="Abrir candidato no workspace"
          >
            <ArrowRight className="h-3 w-3" />
            Ver candidato
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}
