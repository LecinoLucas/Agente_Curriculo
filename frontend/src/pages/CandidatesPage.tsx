import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { useCandidatesFilters } from "../features/candidates/hooks/useCandidatesFilters";
import { CandidateScoreCell } from "../features/candidates/components/CandidateScoreCell";
import { CandidateAiStatusBadge } from "../features/candidates/components/CandidateAiStatusBadge";
import { CandidateResumeBadge } from "../features/candidates/components/CandidateResumeBadge";
import { CandidatesFilters } from "../features/candidates/components/CandidatesFilters";
import { formatCandidateDate } from "../features/candidates/utils/candidateFormatters";
import { getScoreTone } from "../features/candidates/utils/scoreFormatting";
import { deriveScoreSemantics } from "../features/candidates/utils/scoreSemantics";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { CandidateListSummary } from "../types/domain";
import { Paginated } from "../types/api";
import { useAsyncState } from "../hooks/useAsyncState";

const PAGE_SIZE = 20;

// ── Page ───────────────────────────────────────────────────────────────────────

export function CandidatesPage() {
  const { openCandidate, candidatesSyncTick, selectedCandidateId, candidateOverview } = usePipeline();

  const [page, setPage] = useState(1);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    searchInput,
    setSearchInput,
    search,
    resumeFilter,
    setResumeFilter,
    aiFilter,
    setAiFilter,
    hasActiveFilters,
    clearFilters,
  } = useCandidatesFilters({ setPage });

  const { data, loading, error, run } = useAsyncState<Paginated<CandidateListSummary>>();

  const fetchCandidates = useCallback(() => {
    const hasResume =
      resumeFilter === "with" ? true :
      resumeFilter === "without" ? false :
      undefined;

    const aiStatus =
      aiFilter === "all" ? undefined :
      aiFilter === "processing_or_pending" ? ["processing", "pending"] :
      [aiFilter];

    void run(() =>
      candidatesService
        .listSummaries(page, PAGE_SIZE, search || undefined, hasResume, aiStatus)
        .catch((err: unknown) => {
          throw new Error(
            formatContextError(
              err,
              "Não foi possível carregar os candidatos.",
              hasActiveFilters ? "Revise os filtros ou tente novamente." : "Tente novamente.",
            ),
          );
        }),
    );
  }, [page, search, resumeFilter, aiFilter, run, hasActiveFilters]);

  const isWorkspaceOpen = selectedCandidateId !== null;

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates, candidatesSyncTick]);

  // Auto-collapse sidebar when workspace opens
  useEffect(() => {
    if (isWorkspaceOpen) setSidebarOpen(false);
  }, [isWorkspaceOpen]);

  const candidates = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const isRefreshing = loading && candidates.length > 0;
  const showInitialLoading = loading && candidates.length === 0 && !error;
  const activeWorkspaceStage =
    selectedCandidateId && candidateOverview && candidateOverview.active_job_id
      ? candidateOverview.pipeline_entries.find((entry) => entry.job_id === candidateOverview.active_job_id)?.stage ?? null
      : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-6 py-5">
        <PageHeader
          title="Candidatos"
          subtitle={
            loading ? "Carregando…" :
            total === 0
              ? hasActiveFilters
                ? "Nenhum candidato corresponde aos filtros atuais"
                : "Ainda não há candidatos cadastrados"
              :
            `${total} candidato${total !== 1 ? "s" : ""} no total`
          }
          actions={
            <>
              <button
                type="button"
                onClick={fetchCandidates}
                disabled={loading}
                className="ui-btn-secondary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Atualizando…" : "Atualizar"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewCandidate(true)}
                className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
              >
                + Novo candidato
              </button>
            </>
          }
        />
        <p className="mt-3 text-xs text-[hsl(var(--text-muted))]">
          Candidatos são perfis externos gerenciados pelo sistema. Eles não possuem acesso ao sistema interno.
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
          Sem vínculo = candidato ainda não associado a nenhuma vaga.
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
          A lista prioriza o match da vaga ativa. O score geral IA aparece apenas como contexto quando necessário.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: candidate list — only show when workspace closed OR sidebar open */}
        {(!isWorkspaceOpen || sidebarOpen) && (
          <div
            className={[
              "flex flex-col overflow-hidden",
              !isWorkspaceOpen
                ? "flex-1"
                : "hidden lg:flex lg:w-[400px] lg:shrink-0 lg:border-r lg:border-[hsl(var(--border))]",
            ].join(" ")}
          >
            <CandidatesFilters
              searchInput={searchInput}
              onSearchInputChange={setSearchInput}
              resumeFilter={resumeFilter}
              onResumeFilterChange={setResumeFilter}
              aiFilter={aiFilter}
              onAiFilterChange={setAiFilter}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
        {showInitialLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent" />
              <p className="ui-text-muted text-sm">Carregando candidatos…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-sm text-[hsl(var(--danger))]">{error}</p>
            <button
              type="button"
              onClick={fetchCandidates}
              className="text-sm text-[hsl(var(--primary))] hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <p className="text-lg font-medium text-[hsl(var(--text-muted))]">
              {hasActiveFilters
                ? "Nenhum candidato corresponde aos filtros atuais"
                : "Ainda não há candidatos cadastrados"}
            </p>
            <p className="ui-text-muted text-sm">
              {hasActiveFilters
                ? "Ajuste ou limpe os filtros para ver outros perfis."
                : "Crie um candidato para começar a montar sua base."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 text-sm text-[hsl(var(--primary))] hover:underline"
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {isRefreshing ? (
              <div className="border-b border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-6 py-2 text-xs text-[hsl(var(--primary))]">
                Atualizando a lista de candidatos…
              </div>
            ) : null}
            {isWorkspaceOpen ? (
              <div className="divide-y divide-[hsl(var(--border))]/70 bg-[hsl(var(--surface))]">
                {candidates.map((c) => (
                  <CompactCandidateRow
                    key={c.id}
                    candidate={c}
                    isActive={selectedCandidateId === c.id}
                    activeStage={selectedCandidateId === c.id ? activeWorkspaceStage : null}
                    onOpen={() => void openCandidate(c.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]">
                      <th className="ui-text-muted w-[280px] px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        Nome
                      </th>
                      <th className="ui-text-muted px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                        E-mail
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Telefone
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Currículo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Vínculo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Vagas
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Status da IA
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Match da vaga ativa
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Criado em
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                    {candidates.map((c) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        onOpen={() => void openCandidate(c.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 ? (
              <div className="border-t border-[hsl(var(--border))] px-6 py-4">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  total={total}
                  pageSize={PAGE_SIZE}
                />
              </div>
            ) : null}
          </>
        )}
            </div>
          </div>
        )}

        {/* Right panel: workspace */}
        {isWorkspaceOpen && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* "← Candidatos" bar — only when sidebar collapsed */}
            {!sidebarOpen && (
              <div className="flex h-9 shrink-0 items-center border-b border-l border-[hsl(var(--border))] bg-[hsl(var(--bg))] px-4">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--text-muted))] transition hover:text-[hsl(var(--text))]"
                >
                  ← Candidatos
                </button>
              </div>
            )}
            <CandidateDrawer mode="workspace" />
          </div>
        )}
      </div>

      {showNewCandidate ? (
        <NewCandidateModal
          isOpen={showNewCandidate}
          defaultJobId={null}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (candidateId) => {
            setShowNewCandidate(false);
            await openCandidate(candidateId);
          }}
        />
      ) : null}
    </div>
  );
}

function CompactCandidateRow({
  candidate: c,
  isActive,
  activeStage,
  onOpen,
}: {
  candidate: CandidateListSummary;
  isActive: boolean;
  activeStage: string | null;
  onOpen: () => void;
}) {
  const semantics = deriveScoreSemantics({
    activeJobMatchScore: c.active_job_match_score,
    aiScore: c.ai_score,
    aiStatus: c.ai_status,
    hasActiveJob: c.linked_job_count > 0,
  });
  const tone = getScoreTone(semantics.primaryScore);
  const scoreClass =
    tone === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "mid"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "low"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]";
  const summaryStage = c.active_job_stage;
  const compactStatusLabel =
    summaryStage === "hired"
      ? "Contratado"
      : summaryStage === "rejected"
        ? "Reprovado"
        : c.linked_job_count > 0
          ? `${c.linked_job_count} vaga${c.linked_job_count !== 1 ? "s" : ""}`
          : null;
  const compactStatusClass =
    summaryStage === "hired"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : summaryStage === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full px-4 py-3 text-left transition",
        isActive
          ? "bg-[hsl(var(--accent-soft))]/70"
          : "hover:bg-[hsl(var(--surface-muted))]/45",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[hsl(var(--text))]">{c.full_name}</p>
            {compactStatusLabel ? (
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${compactStatusClass}`}>
                {compactStatusLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-[hsl(var(--text-muted))]">
            {c.email ?? "Sem e-mail"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <CandidateAiStatusBadge status={c.ai_status} />
            <CandidateResumeBadge count={c.resume_count} />
            {c.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--text-muted))]"
              >
                {tag}
              </span>
            ))}
            {c.tags.length > 2 ? (
              <span className="text-[10px] font-medium text-[hsl(var(--text-muted))]">+{c.tags.length - 2}</span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${scoreClass}`}>
            {semantics.primaryDisplay}
          </span>
          <p className="mt-1 max-w-[140px] truncate text-[10px] text-[hsl(var(--text-muted))]">
            {semantics.primaryLabel}
          </p>
          {semantics.secondaryDisplay ? (
            <p className="mt-1 max-w-[140px] truncate text-[10px] text-[hsl(var(--text-muted))]">
              {semantics.secondaryLabel} {semantics.secondaryDisplay}
            </p>
          ) : null}
          {semantics.statusLabel ? (
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--text-muted))]">
              {semantics.statusLabel}
            </p>
          ) : null}
          {isActive && activeStage ? (
            <p
              className={[
                "mt-1 text-[10px] font-semibold uppercase tracking-wide",
                activeStage === "hired"
                  ? "text-emerald-700"
                  : activeStage === "rejected"
                    ? "text-rose-700"
                    : "text-[hsl(var(--text-muted))]",
              ].join(" ")}
            >
              {COMPACT_STAGE_LABEL[activeStage] ?? activeStage}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] uppercase tracking-wide text-[hsl(var(--text-muted))]">
            {formatCandidateDate(c.created_at)}
          </p>
        </div>
      </div>
    </button>
  );
}

const COMPACT_STAGE_LABEL: Record<string, string> = {
  entry: "Recebido",
  screening: "Triagem",
  hr_interview: "Entrevista RH",
  technical_interview: "Entrevista Técnica",
  final: "Final",
  offer: "Proposta",
  hired: "Contratado",
  rejected: "Reprovado",
};

// ── CandidateRow ───────────────────────────────────────────────────────────────
// Extracted to prevent inline arrow functions from causing full-list re-renders.

function CandidateRow({
  candidate: c,
  onOpen,
}: {
  candidate: CandidateListSummary;
  onOpen: () => void;
}) {
  const statusLabel =
    c.active_job_stage === "hired"
      ? "Contratado"
      : c.active_job_stage === "rejected"
        ? "Reprovado"
        : c.linked_job_count > 0
          ? "Vinculado"
          : "Sem vínculo";
  const statusClass =
    c.active_job_stage === "hired"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : c.active_job_stage === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : c.linked_job_count > 0
          ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]"
          : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]";
  const vacancyLabel =
    c.active_job_stage === "hired" || c.active_job_stage === "rejected"
      ? c.active_job_title ?? "1 vaga"
      : c.linked_job_count > 0
        ? `${c.linked_job_count} vaga${c.linked_job_count !== 1 ? "s" : ""}`
        : "—";

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer transition-colors hover:bg-[hsl(var(--accent-soft))]"
    >
      <td className="px-6 py-4">
        <div className="font-medium leading-tight text-[hsl(var(--text))]">{c.full_name}</div>
        {c.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded bg-[hsl(var(--surface-muted))] px-1.5 py-0.5 text-xs text-[hsl(var(--text-muted))]"
              >
                {t}
              </span>
            ))}
            {c.tags.length > 3 ? (
              <span className="ui-text-muted text-xs">+{c.tags.length - 3}</span>
            ) : null}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {c.email ?? <span className="ui-text-muted">—</span>}
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {c.phone ?? <span className="ui-text-muted">—</span>}
      </td>
      <td className="px-4 py-4">
        <CandidateResumeBadge count={c.resume_count} />
      </td>
      <td className="px-4 py-4">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {vacancyLabel}
      </td>
      <td className="px-4 py-4">
        <CandidateAiStatusBadge status={c.ai_status} />
      </td>
      <td className="px-4 py-4">
        <CandidateScoreCell candidate={c} />
      </td>
      <td className="ui-text-muted px-4 py-4 text-xs">
        {formatCandidateDate(c.created_at)}
      </td>
    </tr>
  );
}
