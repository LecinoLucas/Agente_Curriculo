import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { ActionMenu } from "../components/common/ActionMenu";
import { CandidateDrawer } from "../features/pipeline/CandidateDrawer";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { useAuth } from "../features/auth/useAuth";
import { ArchiveCandidateModal } from "../features/candidates/components/ArchiveCandidateModal";
import { DeleteCandidateModal } from "../features/candidates/components/DeleteCandidateModal";
import { useCandidatesFilters } from "../features/candidates/hooks/useCandidatesFilters";
import { CandidateAiStatusBadge } from "../features/candidates/components/CandidateAiStatusBadge";
import { CandidateScoreCell } from "../features/candidates/components/CandidateScoreCell";
import { CandidateResumeBadge } from "../features/candidates/components/CandidateResumeBadge";
import { CandidatesFilters } from "../features/candidates/components/CandidatesFilters";
import { LinkCandidateJobModal } from "../features/candidates/components/LinkCandidateJobModal";
import { formatCandidateDate } from "../features/candidates/utils/candidateFormatters";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";
import { toast } from "../shared/utils/toast";
import { CandidateListSummary } from "../types/domain";
import { Paginated } from "../types/api";
import { useAsyncState } from "../hooks/useAsyncState";

const PAGE_SIZE = 20;

// ── Page ───────────────────────────────────────────────────────────────────────

export function CandidatesPage() {
  const location = useLocation();
  const { user } = useAuth();
  const {
    openCandidate,
    closeCandidate,
    notifyCandidatesChanged,
    candidatesSyncTick,
    selectedCandidateId,
  } = usePipeline();

  const [page, setPage] = useState(1);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [workspaceFocused, setWorkspaceFocused] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CandidateListSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CandidateListSummary | null>(null);
  const [linkTarget, setLinkTarget] = useState<CandidateListSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const {
    searchInput,
    setSearchInput,
    search,
    resumeFilter,
    setResumeFilter,
    aiFilter,
    setAiFilter,
    applicationSourceFilter,
    setApplicationSourceFilter,
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
      aiFilter === "processing_or_pending" ? ["processing", "pending", "retry_scheduled"] :
      [aiFilter];
    const applicationSource =
      applicationSourceFilter === "all" ? undefined : applicationSourceFilter;

    void run(() =>
      candidatesService
        .listSummaries(
          page,
          PAGE_SIZE,
          search || undefined,
          hasResume,
          aiStatus,
          undefined,
          applicationSource,
        )
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
  }, [page, search, resumeFilter, aiFilter, applicationSourceFilter, run, hasActiveFilters]);

  const isWorkspaceOpen = selectedCandidateId !== null;

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates, candidatesSyncTick]);

  useEffect(() => {
    if (selectedCandidateId) {
      setWorkspaceFocused(true);
      return;
    }
    setWorkspaceFocused(false);
  }, [selectedCandidateId]);

  // Open candidate from URL param (sourcing modal context)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const candidateIdFromUrl = searchParams.get("candidateId");
    if (!candidateIdFromUrl) return;
    setWorkspaceFocused(true);
    if (selectedCandidateId !== candidateIdFromUrl) {
      openCandidate(candidateIdFromUrl);
    }
  }, [location.search, selectedCandidateId, openCandidate]);

  const candidates = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const canArchiveCandidates = Boolean(user);
  const canDeleteCandidates = user?.role === "admin";
  const showActionsColumn = canArchiveCandidates || canDeleteCandidates;
  const isRefreshing = loading && candidates.length > 0;
  const showInitialLoading = loading && candidates.length === 0 && !error;
  const showCandidatesList = !isWorkspaceOpen || !workspaceFocused;
  const showWorkspace = isWorkspaceOpen && workspaceFocused;

  const handleDeleteCandidate = useCallback(
    async (payload: { reason: string; note?: string; confirmation: string }) => {
      if (!deleteTarget) return;

      setDeleteLoading(true);
      try {
        await candidatesService.delete(deleteTarget.id, payload);
        toast.success("Candidato excluído com sucesso.");
        if (selectedCandidateId === deleteTarget.id) {
          closeCandidate();
          setWorkspaceFocused(false);
        }
        setDeleteTarget(null);
        notifyCandidatesChanged();
        fetchCandidates();
      } catch (err: unknown) {
        toast.error(
          formatErrorDetails(handleApiError(err))[0] ??
            "Não foi possível excluir o candidato.",
        );
      } finally {
        setDeleteLoading(false);
      }
    },
    [closeCandidate, deleteTarget, fetchCandidates, notifyCandidatesChanged, selectedCandidateId],
  );

  const handleArchiveCandidate = useCallback(
    async (payload: { reason: string; note?: string }) => {
      if (!archiveTarget) return;

      setArchiveLoading(true);
      try {
        await candidatesService.archive(archiveTarget.id, payload);
        toast.success("Candidato arquivado com sucesso.");
        if (selectedCandidateId === archiveTarget.id) {
          closeCandidate();
          setWorkspaceFocused(false);
        }
        setArchiveTarget(null);
        notifyCandidatesChanged();
        fetchCandidates();
      } catch (err: unknown) {
        toast.error(
          formatErrorDetails(handleApiError(err))[0] ??
            "Não foi possível arquivar o candidato.",
        );
      } finally {
        setArchiveLoading(false);
      }
    },
    [archiveTarget, closeCandidate, fetchCandidates, notifyCandidatesChanged, selectedCandidateId],
  );

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
          Aguardando vaga = candidato ainda não associado a nenhum processo seletivo.
        </p>
        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
          A lista prioriza o match da vaga ativa. O score geral IA aparece apenas como contexto quando necessário.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showCandidatesList ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <CandidatesFilters
              searchInput={searchInput}
              onSearchInputChange={setSearchInput}
              resumeFilter={resumeFilter}
              onResumeFilterChange={setResumeFilter}
              aiFilter={aiFilter}
              onAiFilterChange={setAiFilter}
              applicationSourceFilter={applicationSourceFilter}
              onApplicationSourceFilterChange={setApplicationSourceFilter}
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
                      Match da vaga ativa
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Criado em
                    </th>
                    {showActionsColumn ? (
                      <th className="sticky right-0 bg-[hsl(var(--surface-muted))] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Ações
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                  {candidates.map((c) => (
                    <CandidateRow
                      key={c.id}
                      candidate={c}
                      isActive={selectedCandidateId === c.id}
                      onOpen={() => {
                        setWorkspaceFocused(true);
                        void openCandidate(c.id);
                      }}
                      canArchive={canArchiveCandidates}
                      canDelete={canDeleteCandidates}
                      onArchive={() => setArchiveTarget(c)}
                      onDelete={() => setDeleteTarget(c)}
                      onLinkJob={c.linked_job_count === 0 ? () => setLinkTarget(c) : undefined}
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
          </div>
        ) : null}

        {showWorkspace ? (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <CandidateDrawer
              mode="workspace"
              onBackToList={() => setWorkspaceFocused(false)}
              backToListLabel="Candidatos"
            />
          </div>
        ) : null}
      </div>

      {showNewCandidate ? (
        <NewCandidateModal
          isOpen={showNewCandidate}
          defaultJobId={null}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (candidateId) => {
            setShowNewCandidate(false);
            setWorkspaceFocused(true);
            await openCandidate(candidateId);
          }}
        />
      ) : null}

      <DeleteCandidateModal
        isOpen={deleteTarget !== null}
        candidateName={deleteTarget?.full_name ?? "este candidato"}
        loading={deleteLoading}
        onClose={() => {
          if (deleteLoading) return;
          setDeleteTarget(null);
        }}
        onConfirm={handleDeleteCandidate}
      />

      <ArchiveCandidateModal
        isOpen={archiveTarget !== null}
        candidateName={archiveTarget?.full_name ?? "este candidato"}
        loading={archiveLoading}
        onClose={() => {
          if (archiveLoading) return;
          setArchiveTarget(null);
        }}
        onConfirm={handleArchiveCandidate}
      />

      <LinkCandidateJobModal
        isOpen={linkTarget !== null}
        candidateId={linkTarget?.id ?? null}
        candidateName={linkTarget?.full_name ?? null}
        onClose={() => setLinkTarget(null)}
        onLinked={async () => {
          notifyCandidatesChanged();
          fetchCandidates();
        }}
      />
    </div>
  );
}

// ── CandidateRow ───────────────────────────────────────────────────────────────
// Extracted to prevent inline arrow functions from causing full-list re-renders.

export function CandidateRow({
  candidate: c,
  isActive = false,
  onOpen,
  canArchive = false,
  canDelete = false,
  onArchive,
  onDelete,
  onLinkJob,
}: {
  candidate: CandidateListSummary;
  isActive?: boolean;
  onOpen: () => void;
  canArchive?: boolean;
  canDelete?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
  onLinkJob?: () => void;
}) {
  const statusLabel =
    c.active_job_stage === "hired"
      ? "Contratado"
      : c.active_job_stage === "rejected"
        ? "Reprovado"
        : c.latest_relationship_status === "hired"
          ? "Contratado"
          : c.latest_relationship_status === "rejected"
            ? "Reprovado"
        : c.active_job_id
          ? "Vinculado"
          : "Aguardando vaga";
  const statusClass =
    c.active_job_stage === "hired"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : c.active_job_stage === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : c.latest_relationship_status === "hired"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : c.latest_relationship_status === "rejected"
            ? "border-rose-200 bg-rose-50 text-rose-900"
        : c.active_job_id
          ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]"
          : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]";
  const vacancyLabel =
    c.active_job_stage === "hired" || c.active_job_stage === "rejected"
      ? c.active_job_title ?? c.latest_job_title ?? "1 vaga"
      : c.latest_relationship_status === "hired" || c.latest_relationship_status === "rejected"
        ? c.latest_job_title ?? "1 vaga"
      : c.active_job_id
        ? `${c.linked_job_count} vaga${c.linked_job_count !== 1 ? "s" : ""}`
        : "—";
  const actionItems = [];
  if (canArchive) {
    actionItems.push({
      label: "Arquivar candidato",
      onClick: () => onArchive?.(),
    });
  }
  if (canDelete) {
    actionItems.push({
      label: "Excluir candidato",
      tone: "danger" as const,
      onClick: () => onDelete?.(),
    });
  }

  return (
    <tr
      onClick={onOpen}
      className={[
        "group cursor-pointer transition-colors hover:bg-[hsl(var(--accent-soft))]",
        isActive ? "bg-[hsl(var(--accent-soft))]/70" : "",
      ].join(" ")}
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
        {c.linked_job_count > 0 ? (
          vacancyLabel
        ) : (
          <div className="flex flex-col items-start gap-2">
            <span className="inline-flex items-center rounded-full border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--warning))]">
              Aguardando vaga
            </span>
            {onLinkJob ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onLinkJob();
                }}
                className="rounded-lg border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5 px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))]/10"
              >
                Vincular vaga
              </button>
            ) : null}
          </div>
        )}
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
      {actionItems.length > 0 ? (
        <td 
          className={[
            "px-4 py-4 text-right sticky right-0",
            isActive ? "bg-[hsl(var(--accent-soft))]/70" : "bg-[hsl(var(--surface))]",
            "group-hover:bg-[hsl(var(--accent-soft))]"
          ].join(" ")} 
          onClick={(event) => event.stopPropagation()}
        >
          <ActionMenu
            buttonLabel={`Ações do candidato ${c.full_name}`}
            items={actionItems}
          />
        </td>
      ) : null}
    </tr>
  );
}
