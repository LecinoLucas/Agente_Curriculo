import { KanbanSquare, Pencil, Plus, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ActionMenu } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { useAuth } from "../features/auth/useAuth";
import { JobContextPanel } from "../features/jobs/components/JobContextPanel";
import { useJobsList, type JobStatusFilter } from "../features/jobs/hooks/useJobsList";
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
  if (!value) return null;

  const labels: Record<string, string> = {
    technology: "Tecnologia",
    data: "Dados",
    administrative: "Administrativo",
    finance: "Financeiro",
    fiscal: "Fiscal",
    accounting: "Contábil",
    commercial: "Comercial",
    operations: "Operacional",
    hr: "RH",
    leadership: "Liderança",
  };

  return labels[value] ?? value;
}

export function VagasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManage = user?.role === "admin" || user?.role === "recruiter";
  const {
    loading,
    error,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    statusFilter,
    setStatusFilter,
    selectedJobId,
    setSelectedJobId,
    runningAction,
    jobOperationalData,
    filteredJobs,
    selectedJob,
    loadJobs,
    handlePause,
    handleClose,
    handleDelete,
  } = useJobsList();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vagas"
        subtitle="Priorize rapidamente o que precisa de atenção e mantenha a leitura da operação mais limpa."
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void loadJobs()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            {canManage ? (
              <Button type="button" onClick={() => navigate("/vagas/nova")}>
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
        isEmpty={filteredJobs.length === 0}
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
        listCardClassName="overflow-hidden rounded-[28px] border-[hsl(var(--border-strong))]/55 bg-[hsl(var(--surface))] shadow-[0_24px_60px_-34px_hsl(var(--text)/0.22)]"
        dataTableClassName="overflow-hidden rounded-none border-0 bg-transparent shadow-none"
        dataTableHeaderClassName="bg-[hsl(var(--surface-muted))]/80 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--surface-muted))]/72"
        dataTableFooterClassName="border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/55"
        sidePanelClassName="min-w-0"
        filters={
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--text-muted))]">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as JobStatusFilter)}
              className="ui-input h-10 min-w-[180px] rounded-xl px-3 text-sm"
            >
              <option value="all">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="published">Publicada</option>
              <option value="paused">Pausada</option>
              <option value="closed">Encerrada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </label>
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
              ? "hover:bg-[hsl(var(--danger-soft))]/22"
              : priority.level === "focus"
                ? "hover:bg-[hsl(var(--warning-soft))]/22"
                : priority.level === "active"
                  ? "hover:bg-[hsl(var(--accent-soft))]/18"
                  : "hover:bg-[hsl(var(--surface-muted))]/28";
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
            handleDelete,
          );

          return (
            <tr
              key={job.id}
              onClick={() => setSelectedJobId((current) => (current === job.id ? null : job.id))}
              className={[
                "group cursor-pointer border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] transition-all duration-200",
                isSelected
                  ? "bg-[hsl(var(--surface))] shadow-[inset_0_0_0_1px_hsl(var(--border-strong)/0.28)]"
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
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{job.title}</p>
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[hsl(var(--text-muted))]">
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
                      ? "rounded-lg border border-[hsl(var(--border-strong))]/35 bg-[hsl(var(--surface-muted))]/48 px-3 py-2"
                      : "space-y-1",
                  ].join(" ")}
                >
                  <p className="text-sm font-medium text-[hsl(var(--text))]">{operational.pipelineLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-[hsl(var(--text-muted))]">{operational.pipelineNote}</p>
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
                          ? "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--text-muted))]"
                          : "border-[hsl(var(--border-strong))]/45 bg-[hsl(var(--surface))]"
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
                  <ActionMenu buttonLabel={`Ações da vaga ${job.title}`} items={actionItems} />
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
    </div>
  );
}
