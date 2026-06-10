import { KanbanSquare, Pencil, Plus, RefreshCcw, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ActionMenu } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { useAuth } from "../features/auth/useAuth";
import { ArchiveJobModal } from "../features/jobs/components/ArchiveJobModal";
import { JobContextPanel } from "../features/jobs/components/JobContextPanel";
import { SmartRefreshModal } from "../features/jobs/components/SmartRefreshModal";
import { canManageJobs } from "../shared/auth/roles";
import {
  useJobsList,
  type JobAreaFilter,
  type JobStatusFilter,
  type JobWorkModelFilter,
} from "../features/jobs/hooks/useJobsList";
import {
  buildJobActionItems,
  getJobOperationalPresentation,
  getJobOperationalPriority,
  getOperationalSurfaceClasses,
  getOperationalToneClasses,
} from "../features/jobs/utils/jobsPageHelpers";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";
import type { Job } from "../types/domain";

function formatJobArea(value: string | null | undefined) {
  return value?.trim() || null;
}

function formatStatusFilterLabel(value: JobStatusFilter) {
  const labels: Record<JobStatusFilter, string> = {
    all: "Todas",
    draft: "Rascunho",
    published: "Publicadas",
    paused: "Pausadas",
    closed: "Encerradas",
    cancelled: "Canceladas",
    archived: "Arquivadas",
  };

  return labels[value];
}

export function VagasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManage = canManageJobs(user?.role);
  const {
    loading,
    error,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    searchInput,
    setSearchInput,
    statusFilter,
    setStatusFilter,
    areaFilter,
    setAreaFilter,
    workModelFilter,
    setWorkModelFilter,
    selectedJobId,
    setSelectedJobId,
    runningAction,
    archiveTarget,
    setArchiveTarget,
    jobOperationalData,
    filteredJobs,
    selectedJob,
    loadJobs,
    summary,
    areaOptions,
    workModelOptions,
    statusCounts,
    hasActiveFilters,
    clearFilters,
    handlePause,
    handleClose,
    handleDelete,
    handleArchive,
    handleRestore,
    handleRecalculateRanking,
    handleSmartRefreshOpen,
    handleSmartRefreshClose,
    handleSmartRefreshConfirm,
    smartRefreshJobId,
    smartRefreshPreviewData,
    smartRefreshPreviewLoading,
    smartRefreshExecuting,
  } = useJobsList();

  const statusQuickFilters: Array<{ value: JobStatusFilter; label: string; count: number }> = [
    { value: "all", label: "Todas", count: statusCounts.all },
    { value: "published", label: "Publicadas", count: statusCounts.published },
    { value: "draft", label: "Rascunhos", count: statusCounts.draft },
    { value: "paused", label: "Pausadas", count: statusCounts.paused },
    { value: "closed", label: "Encerradas", count: statusCounts.closed },
    { value: "archived", label: "Arquivadas", count: statusCounts.archived },
  ];

  const activeFilterChips = [
    statusFilter !== "all"
      ? { key: "status", label: `Status: ${formatStatusFilterLabel(statusFilter)}`, onClear: () => setStatusFilter("all") }
      : null,
    areaFilter !== "all"
      ? { key: "area", label: `Área: ${formatJobArea(areaFilter) ?? areaFilter}`, onClear: () => setAreaFilter("all") }
      : null,
    workModelFilter !== "all"
      ? { key: "workModel", label: `Modelo: ${formatWorkModel(workModelFilter)}`, onClear: () => setWorkModelFilter("all") }
      : null,
    searchInput.trim()
      ? { key: "search", label: `Busca: ${searchInput.trim()}`, onClear: () => setSearchInput("") }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onClear: () => void }>;
  return (
    <div className="space-y-4 px-4 pt-4 sm:px-6 sm:pt-5">
      <PageHeader
        title="Vagas"
        subtitle={`${statusCounts.all} vagas • ${summary.published} publicadas • ${summary.attention} precisam atenção`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-border-strong/55 bg-surface px-4 text-sm shadow-[0_10px_24px_-22px_hsl(var(--text)/0.35)]"
              onClick={() => void loadJobs()}
              disabled={loading}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            {canManage ? (
              <Button
                type="button"
                className="h-11 rounded-xl px-4 text-sm shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.75)]"
                onClick={() => navigate("/vagas/nova")}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova vaga
              </Button>
            ) : null}
          </>
        }
      />

      <CrudPage<Job>
        loading={loading}
        error={error}
        count={total}
        isEmpty={total === 0}
        emptyIcon="📄"
        emptyTitle="Nenhuma vaga encontrada"
        emptyDescription="Crie uma nova vaga para começar o fluxo estruturado de publicação."
        emptyAction={
          canManage
            ? {
                label: "Nova vaga",
                onClick: () => navigate("/vagas/nova"),
              }
            : undefined
        }
        layoutClassName="grid gap-5 lg:grid-cols-[minmax(0,1.72fr)_380px] lg:items-start lg:transition-[grid-template-columns] lg:duration-200"
        listCardClassName="overflow-hidden rounded-[28px] border-border-strong/55 bg-surface shadow-[0_24px_60px_-34px_hsl(var(--text)/0.22)]"
        dataTableClassName="overflow-hidden rounded-none border-0 bg-transparent shadow-none"
        dataTableHeaderClassName="bg-surface-muted/80 backdrop-blur supports-[backdrop-filter]:bg-surface-muted/72"
        dataTableFooterClassName="border-border bg-surface-muted/55"
        sidePanelClassName="min-w-0"
        filters={
          <div className="w-full rounded-[22px] border border-border-strong/40 bg-surface/96 px-3 py-2.5 shadow-[0_18px_42px_-34px_hsl(var(--text)/0.26)]">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <label className="block min-w-0 flex-1">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input
                      value={searchInput}
                      onChange={(event) => {
                        setPage(1);
                        setSearchInput(event.target.value);
                      }}
                      placeholder="Buscar por título, área, senioridade ou local"
                      className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 w-full rounded-xl border-border-strong/45 bg-surface pl-10 pr-3 text-sm shadow-none"
                    />
                  </div>
                </label>

                <div className="grid gap-2 sm:grid-cols-3 lg:w-auto lg:flex-none">
                  <select
                    value={areaFilter}
                    onChange={(event) => {
                      setPage(1);
                      setAreaFilter(event.target.value as JobAreaFilter);
                    }}
                    className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none lg:w-[168px] xl:w-[184px]"
                  >
                    <option value="all">Todas as áreas</option>
                    {areaOptions.map((area) => (
                      <option key={area} value={area}>
                        {formatJobArea(area) ?? area}
                      </option>
                    ))}
                  </select>

                  <select
                    value={workModelFilter}
                    onChange={(event) => {
                      setPage(1);
                      setWorkModelFilter(event.target.value as JobWorkModelFilter);
                    }}
                    className="bg-surface border border-border text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-ring h-10 w-full rounded-xl border-border bg-surface px-3 text-sm shadow-none lg:w-[168px] xl:w-[184px]"
                  >
                    <option value="all">Todos os modelos</option>
                    {workModelOptions.map((workModel) => (
                      <option key={workModel} value={workModel}>
                        {formatWorkModel(workModel)}
                      </option>
                    ))}
                  </select>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-border px-3 text-sm lg:w-[116px]"
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Limpar
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-border/70 pt-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs text-text-muted">
                  <span className="font-medium text-text">{total} visíveis</span>
                  <span className="mx-2 text-[hsl(var(--border-strong))]">•</span>
                  <span>{summary.published} publicadas</span>
                  <span className="mx-2 text-[hsl(var(--border-strong))]">•</span>
                  <span>{summary.draft} rascunhos</span>
                  <span className="mx-2 text-[hsl(var(--border-strong))]">•</span>
                  <span>{summary.archived} arquivadas</span>
                  <span className="mx-2 text-[hsl(var(--border-strong))]">•</span>
                  <span className={summary.attention > 0 ? "text-warning" : undefined}>
                    {summary.attention} atenção
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {statusQuickFilters.map((item) => {
                    const isActive = statusFilter === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          setPage(1);
                          setStatusFilter(item.value);
                        }}
                        className={[
                          "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition",
                          isActive
                            ? "border-[hsl(var(--primary))]/40 bg-[hsl(var(--accent-soft))] text-[hsl(var(--primary))]"
                            : "border-border bg-surface text-text-muted hover:border-[hsl(var(--primary))]/28 hover:text-text",
                        ].join(" ")}
                      >
                        <span>{item.label}</span>
                        <span className="rounded-full bg-black/6 px-1.5 py-0.5 text-[10px] tabular-nums">
                          {item.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeFilterChips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => {
                        setPage(1);
                        chip.onClear();
                      }}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-muted/78 px-2.5 text-[11px] font-medium text-text transition hover:border-[hsl(var(--primary))]/28"
                    >
                      <span>{chip.label}</span>
                      <X className="h-3 w-3 text-text-muted" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        }
        columns={[
          { header: "Vaga", className: "min-w-[320px]" },
          { header: "Saúde", className: "min-w-[250px]" },
          { header: "Pipeline / risco", className: "min-w-[280px]" },
          { header: "", className: "w-[220px]" },
        ]}
        items={filteredJobs}
        renderRow={(job) => {
          const isSelected = selectedJob?.id === job.id;
          const summaryParts = [
            formatJobArea(job.job_area),
            formatSeniority(job.seniority_level),
            formatWorkModel(job.work_model),
            job.location ?? null,
          ].filter((value) => value && value !== "—");
          const operational = getJobOperationalPresentation(job, jobOperationalData[job.id]);
          const priority = getJobOperationalPriority(job, jobOperationalData[job.id]);
          const toneClasses = getOperationalToneClasses(operational.tone);
          const surfaceClasses = getOperationalSurfaceClasses(operational.tone);
          const rowEmphasis =
            priority.level === "critical"
              ? "hover:bg-danger-soft/22"
              : priority.level === "focus"
                ? "hover:bg-warning-soft/22"
                : priority.level === "active"
                  ? "hover:bg-[hsl(var(--accent-soft))]/18"
                  : "hover:bg-surface-muted/28";
          const primaryAction =
            operational.actionTarget === "edit"
              ? {
                  label: operational.actionLabel,
                  onClick: () => navigate(`/vagas/${job.id}/editar`),
                }
              : {
                  label: operational.actionLabel,
                  onClick: () => navigate(`/pipeline/${job.id}`),
                };
          const actionItems = buildJobActionItems(
            job,
            runningAction,
            (jobId) => navigate(`/vagas/${jobId}/editar`),
            (jobId) => navigate(`/pipeline/${jobId}`),
            handlePause,
            handleClose,
            setArchiveTarget,
            handleRestore,
            handleDelete,
            handleRecalculateRanking,
            (jobOperationalData[job.id]?.totalCandidates ?? 0) > 0,
            handleSmartRefreshOpen,
          );
          const isLast = filteredJobs.indexOf(job) === filteredJobs.length - 1;

          return (
            <tr
              key={job.id}
              onClick={() => setSelectedJobId((current) => (current === job.id ? null : job.id))}
              className={[
                "group cursor-pointer border-b border-border bg-surface transition-all duration-200",
                isSelected
                  ? "bg-surface shadow-[inset_0_0_0_1px_hsl(var(--border-strong)/0.28)]"
                  : rowEmphasis,
              ].join(" ")}
            >
              <td
                className={`px-4 py-3 align-top ${
                  isSelected ? "border-l-4 border-[hsl(var(--primary))]" : "border-l-4 border-transparent"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text">{job.title}</p>
                    <span
                      className={[
                        "inline-flex items-center px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                        isSelected ? `rounded-full ${surfaceClasses.accent}` : "rounded-none bg-transparent",
                        toneClasses.label,
                      ].join(" ")}
                    >
                      {isSelected ? operational.healthLabel : priority.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
                    {summaryParts.length > 0 ? <span>{summaryParts.join(" • ")}</span> : null}
                    <span>Atualizada em {new Date(job.updated_at).toLocaleDateString("pt-BR")}</span>
                    {priority.compact ? null : <span>{priority.momentumLabel}</span>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <div
                  className={[
                    "transition-colors",
                    isSelected
                      ? `rounded-lg border px-3 py-2 ${surfaceClasses.emphasis.replace("/90", "/45").replace("/80", "/42").replace("/75", "/42")}`
                      : "space-y-1.5",
                  ].join(" ")}
                >
                  <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
                  <div className={isSelected ? "mt-1.5 space-y-1" : "space-y-1"}>
                    <div className={`flex items-center gap-2 text-sm font-medium ${toneClasses.label}`}>
                      <span className={`h-2 w-2 rounded-full ${toneClasses.marker}`} />
                      <span>{operational.healthLabel}</span>
                    </div>
                    <p className={`text-xs leading-5 ${toneClasses.note}`}>
                      {priority.level === "stable" ? operational.healthNote : priority.note}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                <div
                  className={[
                    "transition-colors",
                    isSelected
                      ? "rounded-lg border border-border-strong/35 bg-surface-muted/48 px-3 py-2"
                      : "space-y-1",
                  ].join(" ")}
                >
                  <p className="text-sm font-medium text-text">{operational.pipelineLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{operational.pipelineNote}</p>
                </div>
              </td>
              <td className="px-4 py-3 align-top" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isSelected || priority.level === "critical" ? "default" : "outline"}
                    className={
                      isSelected || priority.level === "critical"
                        ? undefined
                        : priority.compact
                          ? "border-border bg-surface text-text-muted"
                          : "border-border-strong/45 bg-surface"
                    }
                    onClick={primaryAction.onClick}
                  >
                    {operational.actionTarget === "pipeline" ? (
                      <KanbanSquare className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {primaryAction.label}
                  </Button>
                  <ActionMenu 
                    buttonLabel={`Ações da vaga ${job.title}`} 
                    items={actionItems} 
                    direction={isLast ? "up" : "down"}
                  />
                </div>
              </td>
            </tr>
          );
        }}
        footer={
          total > 0 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(value) => {
                setPage(1);
                setPageSize(value);
              }}
              total={total}
            />
          ) : undefined
        }
        sidePanel={
          selectedJob ? (
            <JobContextPanel
              job={selectedJob}
              operational={jobOperationalData[selectedJob.id] ?? null}
              canManage={canManage}
              runningAction={runningAction}
              onNavigateEdit={(jobId) => navigate(`/vagas/${jobId}/editar`)}
              onNavigatePipeline={(jobId) => navigate(`/pipeline/${jobId}`)}
              onPause={handlePause}
              onClose={handleClose}
              onClearSelection={() => setSelectedJobId(null)}
            />
          ) : null
        }
      />
      <ArchiveJobModal
        open={archiveTarget != null}
        loading={archiveTarget != null && runningAction === `archive:${archiveTarget.id}`}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
      />
      <SmartRefreshModal
        open={smartRefreshJobId != null}
        preview={smartRefreshPreviewData}
        previewLoading={smartRefreshPreviewLoading}
        executing={smartRefreshExecuting}
        onClose={handleSmartRefreshClose}
        onConfirm={handleSmartRefreshConfirm}
      />
    </div>
  );
}
