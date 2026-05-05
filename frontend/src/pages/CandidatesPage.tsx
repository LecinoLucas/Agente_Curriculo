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
  const { openCandidate, candidatesSyncTick, selectedCandidateId } = usePipeline();

  const [page, setPage] = useState(1);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
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

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates, candidatesSyncTick]);

  const candidates = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const isRefreshing = loading && candidates.length > 0;
  const showInitialLoading = loading && candidates.length === 0 && !error;

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
      </div>

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
                      Score da IA
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

      <CandidateDrawer key={selectedCandidateId ?? "none"} />
    </div>
  );
}

// ── CandidateRow ───────────────────────────────────────────────────────────────
// Extracted to prevent inline arrow functions from causing full-list re-renders.

function CandidateRow({
  candidate: c,
  onOpen,
}: {
  candidate: CandidateListSummary;
  onOpen: () => void;
}) {
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
        <span
          className={[
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            c.linked_job_count > 0
              ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]",
          ].join(" ")}
        >
          {c.linked_job_count > 0 ? "Vinculado" : "Sem vínculo"}
        </span>
      </td>
      <td className="px-4 py-4 text-[hsl(var(--text-muted))]">
        {c.linked_job_count > 0 ? `${c.linked_job_count} vaga${c.linked_job_count !== 1 ? "s" : ""}` : "—"}
      </td>
      <td className="px-4 py-4">
        <CandidateAiStatusBadge status={c.ai_status} />
      </td>
      <td className="px-4 py-4">
        <CandidateScoreCell score={c.ai_score} />
      </td>
      <td className="ui-text-muted px-4 py-4 text-xs">
        {formatCandidateDate(c.created_at)}
      </td>
    </tr>
  );
}
