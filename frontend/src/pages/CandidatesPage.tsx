import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Mail, Phone, RefreshCw, Users } from "lucide-react";

import { ActionMenu } from "../components/common/ActionMenu";
import { NewCandidateModal } from "../features/pipeline/NewCandidateModal";
import { usePipeline } from "../features/pipeline/PipelineContext";
import { useAuth } from "../features/auth/useAuth";
import { ArchiveCandidateModal } from "../features/candidates/components/ArchiveCandidateModal";
import { CandidatePreviewDrawer } from "../features/candidates/components/CandidatePreviewDrawer";
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    notifyCandidatesChanged,
    candidatesSyncTick,
  } = usePipeline();

  const [page, setPage] = useState(1);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CandidateListSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CandidateListSummary | null>(null);
  const [linkTarget, setLinkTarget] = useState<CandidateListSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const {
    activeTab,
    setActiveTab,
    searchInput,
    setSearchInput,
    search,
    city,
    setCity,
    state,
    setState,
    skill,
    setSkill,
    seniority,
    setSeniority,
    salaryMin,
    setSalaryMin,
    salaryMax,
    setSalaryMax,
    resumeFilter,
    setResumeFilter,
    aiFilter,
    setAiFilter,
    applicationSourceFilter,
    setApplicationSourceFilter,
    desiredContractTypeFilter,
    setDesiredContractTypeFilter,
    linkStatusFilter,
    setLinkStatusFilter,
    showAdvanced,
    setShowAdvanced,
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
    const applicationSource = applicationSourceFilter === "all" ? undefined : applicationSourceFilter;
    const desiredContractType =
      desiredContractTypeFilter === "all" ? undefined : desiredContractTypeFilter;

    const computedLinkStatus =
      activeTab === "talent_pool" && linkStatusFilter === "all"
        ? "without_active_job"
        : linkStatusFilter === "all"
          ? undefined
          : linkStatusFilter;

    const normalizedSalaryMin = salaryMin.trim() ? Number(salaryMin) : undefined;
    const normalizedSalaryMax = salaryMax.trim() ? Number(salaryMax) : undefined;

    void run(() =>
      candidatesService
        .listSummaries(page, PAGE_SIZE, {
          search: search || undefined,
          has_resume: hasResume,
          ai_status: aiStatus,
          application_source: applicationSource,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          salary_min: Number.isFinite(normalizedSalaryMin) ? normalizedSalaryMin : undefined,
          salary_max: Number.isFinite(normalizedSalaryMax) ? normalizedSalaryMax : undefined,
          desired_contract_type: desiredContractType,
          link_status_filter: computedLinkStatus,
          skill: skill.trim() || undefined,
          seniority: seniority.trim() || undefined,
        })
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
  }, [
    page,
    search,
    city,
    state,
    skill,
    seniority,
    salaryMin,
    salaryMax,
    resumeFilter,
    aiFilter,
    applicationSourceFilter,
    desiredContractTypeFilter,
    linkStatusFilter,
    activeTab,
    run,
    hasActiveFilters,
  ]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates, candidatesSyncTick]);

  // Open candidate from URL param (sourcing modal context)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const candidateIdFromUrl = searchParams.get("candidateId");
    if (!candidateIdFromUrl) return;
    setPreviewCandidateId(candidateIdFromUrl);
  }, [location.search]);

  const candidates = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const canArchiveCandidates = Boolean(user);
  const canDeleteCandidates = user?.role === "admin";
  const showActionsColumn = canArchiveCandidates || canDeleteCandidates;
  const isRefreshing = loading && candidates.length > 0;
  const showInitialLoading = loading && candidates.length === 0 && !error;

  const handleDeleteCandidate = useCallback(
    async (payload: { reason: string; note?: string; confirmation: string }) => {
      if (!deleteTarget) return;

      setDeleteLoading(true);
      try {
        await candidatesService.delete(deleteTarget.id, payload);
        toast.success("Candidato excluído com sucesso.");
        if (previewCandidateId === deleteTarget.id) {
          setPreviewCandidateId(null);
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
    [deleteTarget, fetchCandidates, notifyCandidatesChanged, previewCandidateId],
  );

  const handleArchiveCandidate = useCallback(
    async (payload: { reason: string; note?: string }) => {
      if (!archiveTarget) return;

      setArchiveLoading(true);
      try {
        await candidatesService.archive(archiveTarget.id, payload);
        toast.success("Candidato arquivado com sucesso.");
        if (previewCandidateId === archiveTarget.id) {
          setPreviewCandidateId(null);
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
    [archiveTarget, fetchCandidates, notifyCandidatesChanged, previewCandidateId],
  );

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--bg))]">
      {/* Premium Header */}
      <div className="relative overflow-hidden border-b border-[hsl(var(--border)/0.6)] bg-gradient-to-br from-[hsl(var(--surface))] to-[hsl(var(--surface-muted)/0.5)] px-6 py-6 lg:px-8">
        {/* Abstract Background Element */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[hsl(var(--primary)/0.03)] blur-3xl" />
        
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Gestão de Candidatos"
            subtitle={
              loading ? "Sincronizando base de dados…" :
              total === 0
                ? hasActiveFilters
                  ? "Nenhum perfil corresponde aos filtros aplicados"
                  : "Sua base de talentos está vazia"
                :
              `${total} perfil${total !== 1 ? "is" : ""} registrado${total !== 1 ? "s" : ""}`
            }
            actions={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={fetchCandidates}
                  disabled={loading}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 text-sm font-semibold text-[hsl(var(--text))] transition-all hover:bg-[hsl(var(--accent-soft))] disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Sincronizando…" : "Atualizar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCandidate(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-6 text-sm font-bold text-white shadow-lg shadow-[hsl(var(--primary)/0.2)] transition-all hover:bg-[hsl(var(--primary)/0.9)] hover:shadow-[hsl(var(--primary)/0.3)] active:scale-95"
                >
                  <span className="text-lg">+</span>
                  Novo candidato
                </button>
              </div>
            }
          />
        </div>

        {/* Quick Insights Row */}
        <div className="mt-6 flex flex-wrap gap-4 border-t border-[hsl(var(--border)/0.4)] pt-6">
          <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--text-muted))]">
            <span className="flex h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
            Aderência à Vaga Ativa
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--text-muted))]">
            <span className="flex h-2 w-2 rounded-full bg-[hsl(var(--border-strong))]" />
            Aguardando Processamento
          </div>
          <div className="ml-auto hidden items-center gap-2 text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted))] sm:flex">
            Regra Marajó: 1 Candidato = 1 Pipeline Ativo
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="bg-[hsl(var(--surface)/0.3)] px-6 py-4 lg:px-8">
            <CandidatesFilters
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              searchInput={searchInput}
              onSearchInputChange={setSearchInput}
              city={city}
              onCityChange={setCity}
              state={state}
              onStateChange={setState}
              skill={skill}
              onSkillChange={setSkill}
              seniority={seniority}
              onSeniorityChange={setSeniority}
              salaryMin={salaryMin}
              onSalaryMinChange={setSalaryMin}
              salaryMax={salaryMax}
              onSalaryMaxChange={setSalaryMax}
              resumeFilter={resumeFilter}
              onResumeFilterChange={setResumeFilter}
              aiFilter={aiFilter}
              onAiFilterChange={setAiFilter}
              applicationSourceFilter={applicationSourceFilter}
              onApplicationSourceFilterChange={setApplicationSourceFilter}
              desiredContractTypeFilter={desiredContractTypeFilter}
              onDesiredContractTypeFilterChange={setDesiredContractTypeFilter}
              linkStatusFilter={linkStatusFilter}
              onLinkStatusFilterChange={setLinkStatusFilter}
              showAdvanced={showAdvanced}
              onToggleAdvanced={() => setShowAdvanced((value) => !value)}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
          </div>

          {/* Content Area with refined scrollbar and spacing */}
          <div className="flex-1 overflow-y-auto px-6 pb-10 lg:px-8">
              <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface))] shadow-sm">
                {showInitialLoading ? (
                  <div className="flex items-center justify-center py-32">
                    <div className="flex flex-col items-center gap-4">
                      <div className="relative flex h-12 w-12 items-center justify-center">
                        <div className="absolute h-full w-full animate-ping rounded-full bg-[hsl(var(--primary)/0.2)]" />
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[hsl(var(--primary))] border-t-transparent shadow-lg" />
                      </div>
                      <p className="text-sm font-semibold text-[hsl(var(--text-muted))]">Preparando lista de candidatos…</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-[hsl(var(--danger-soft))] p-3 text-[hsl(var(--danger))]">
                      <RefreshCw className="h-full w-full" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-[hsl(var(--text))]">Erro na sincronização</p>
                      <p className="text-sm text-[hsl(var(--text-muted))]">{error}</p>
                    </div>
                    <button
                      type="button"
                      onClick={fetchCandidates}
                      className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary)/0.9)]"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
                    <div className="h-20 w-20 rounded-full bg-[hsl(var(--surface-muted))] p-6 text-[hsl(var(--text-muted)/0.4)]">
                      <Users className="h-full w-full" />
                    </div>
                    <div className="max-w-xs space-y-2">
                      <p className="text-xl font-bold text-[hsl(var(--text))]">
                        {hasActiveFilters
                          ? "Nenhum resultado"
                          : "Lista vazia"}
                      </p>
                      <p className="text-sm text-[hsl(var(--text-muted))]">
                        {hasActiveFilters
                          ? "Experimente remover alguns filtros para encontrar o que procura."
                          : "Comece cadastrando novos candidatos para gerenciar suas vagas."}
                      </p>
                    </div>
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="font-bold text-[hsl(var(--primary))] hover:underline"
                      >
                        Limpar todos os filtros
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {activeTab === "saved" ? (
                      <div className="mx-6 mt-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted)/0.25)] px-4 py-3 text-sm text-[hsl(var(--text-muted))]">
                        Buscas salvas entram na próxima fase. Use os filtros da base para montar a consulta agora.
                      </div>
                    ) : null}
                    {isRefreshing ? (
                      <div className="flex items-center justify-center gap-2 border-b border-[hsl(var(--primary)/0.1)] bg-[hsl(var(--accent-soft)/0.5)] py-2 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Atualizando dados em tempo real…
                      </div>
                    ) : null}
                    <div className={`overflow-x-auto ${candidates.length <= 2 ? "pb-32" : ""}`}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[hsl(var(--border)/0.4)] bg-[hsl(var(--surface-muted)/0.3)]">
                            <th className="px-6 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Identificação e Tags
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Contato
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Docs
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Situação Atual
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Vaga Ativa
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Status IA
                            </th>
                            <th className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))]">
                              Ranking & Match
                            </th>
                            {showActionsColumn ? (
                              <th className="sticky right-0 bg-[hsl(var(--surface))] px-6 py-4 text-right text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--text-muted))] shadow-[-12px_0_12px_-4px_rgba(0,0,0,0.02)]">
                                Ações
                              </th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface))]">
                          {candidates.map((c) => (
                            <CandidateRow
                              key={c.id}
                              candidate={c}
                              isActive={previewCandidateId === c.id}
                              onOpen={() => setPreviewCandidateId(c.id)}
                              canArchive={canArchiveCandidates}
                              canDelete={canDeleteCandidates}
                              onArchive={() => setArchiveTarget(c)}
                              onDelete={() => setDeleteTarget(c)}
                              onLinkJob={!c.active_job_id ? () => setLinkTarget(c) : undefined}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 ? (
                      <div className="border-t border-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface-muted)/0.1)] px-6 py-6">
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
          </div>
      </div>

      {showNewCandidate ? (
        <NewCandidateModal
          isOpen={showNewCandidate}
          defaultJobId={null}
          onClose={() => setShowNewCandidate(false)}
          onCreated={async (candidateId) => {
            setShowNewCandidate(false);
            navigate(`/candidatos/${candidateId}`);
          }}
        />
      ) : null}

      <CandidatePreviewDrawer
        candidateId={previewCandidateId}
        onClose={() => setPreviewCandidateId(null)}
      />

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

export function CandidateRow({
  candidate: c,
  isActive = false,
  onOpen,
  canArchive = false,
  canDelete = false,
  onArchive,
  onDelete,
  onLinkJob,
  direction = "down",
}: {
  candidate: CandidateListSummary;
  isActive?: boolean;
  onOpen: () => void;
  canArchive?: boolean;
  canDelete?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
  onLinkJob?: () => void;
  direction?: "up" | "down";
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
          ? "Em processo"
          : "Disponível";
          
  const statusClass =
    c.active_job_stage === "hired"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : c.active_job_stage === "rejected"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : c.latest_relationship_status === "hired"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : c.latest_relationship_status === "rejected"
            ? "border-rose-200 bg-rose-50 text-rose-700"
        : c.active_job_id
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] text-[hsl(var(--text-muted))]";

  const vacancyLabel =
    c.active_job_stage === "hired" || c.active_job_stage === "rejected"
      ? c.active_job_title ?? c.latest_job_title ?? "Vaga encerrada"
      : c.latest_relationship_status === "hired" || c.latest_relationship_status === "rejected"
        ? c.latest_job_title ?? "Vaga encerrada"
      : c.active_job_id
        ? c.active_job_title ?? "Processo ativo"
        : "Nenhuma";

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
        "group cursor-pointer transition-all duration-200",
        isActive ? "bg-[hsl(var(--accent-soft))] ring-1 ring-inset ring-[hsl(var(--primary)/0.2)]" : "hover:bg-[hsl(var(--accent-soft)/0.4)]",
      ].join(" ")}
    >
      <td className="px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <div className="font-bold tracking-tight text-[hsl(var(--text))] transition-colors group-hover:text-[hsl(var(--primary))]">{c.full_name}</div>
          {c.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {c.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-[hsl(var(--surface-muted))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--text-muted))]"
                >
                  {t}
                </span>
              ))}
              {c.tags.length > 2 ? (
                <span className="text-[10px] font-bold text-[hsl(var(--text-muted)/0.5)]">+{c.tags.length - 2}</span>
              ) : null}
            </div>
          ) : (
            <div className="text-[10px] italic text-[hsl(var(--text-muted)/0.5)]">Sem tags</div>
          )}
        </div>
      </td>
      <td className="px-4 py-5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-[hsl(var(--text-muted))]">
            <Mail className="h-3 w-3 opacity-60" />
            <span className="truncate max-w-[140px]">{c.email ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[hsl(var(--text-muted))]">
            <Phone className="h-3 w-3 opacity-60" />
            <span>{c.phone ?? "—"}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-5">
        <CandidateResumeBadge count={c.resume_count} />
      </td>
      <td className="px-4 py-5">
        <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${statusClass}`}>
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-5">
        <div className="flex flex-col gap-1">
          <div className="max-w-[150px] truncate font-medium text-[hsl(var(--text))]">
            {vacancyLabel}
          </div>
          {!c.active_job_id && onLinkJob && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLinkJob();
              }}
              className="w-fit rounded-md bg-[hsl(var(--primary)/0.05)] px-2 py-1 text-[10px] font-bold text-[hsl(var(--primary))] transition-all hover:bg-[hsl(var(--primary)/0.1)] active:scale-95"
            >
              Vincular à vaga
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-5">
        <CandidateAiStatusBadge status={c.ai_status} />
      </td>
      <td className="px-4 py-5">
        <CandidateScoreCell candidate={c} />
      </td>
      {actionItems.length > 0 ? (
        <td 
          className={[
            "px-6 py-5 text-right sticky right-0 transition-colors",
            isActive ? "bg-[hsl(var(--accent-soft))]" : "bg-[hsl(var(--surface))] group-hover:bg-[hsl(var(--accent-soft)/0.4)]",
            "shadow-[-12px_0_12px_-4px_rgba(0,0,0,0.02)]"
          ].join(" ")} 
          onClick={(event) => event.stopPropagation()}
        >
          <ActionMenu
            buttonLabel={`Ações para ${c.full_name}`}
            items={actionItems}
            direction={direction}
          />
        </td>
      ) : null}
    </tr>
  );
}
