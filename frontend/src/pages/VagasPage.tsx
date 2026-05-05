import { Pencil, Plus, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ActionMenu } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { JobQualityBadge } from "../components/job/JobQualityBadge";
import { Button } from "@/components/ui/button";
import { buildJobQualitySummary } from "../features/jobs/jobFormConfig";
import { useAuth } from "../features/auth/useAuth";
import { JobDetailPanel } from "../features/jobs/components/JobDetailPanel";
import { JobsSummaryCard } from "../features/jobs/components/JobsSummaryCard";
import { useJobsList, type JobStatusFilter } from "../features/jobs/hooks/useJobsList";
import {
  buildJobActionItems,
  qualityNeedsAttention,
  truncate,
} from "../features/jobs/utils/jobsPageHelpers";
import {
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";
import type { Job } from "../types/domain";

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
    filteredJobs,
    selectedJob,
    summary,
    loadJobs,
    handlePause,
    handleClose,
    handleDelete,
  } = useJobsList();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vagas"
        subtitle="A lista continua centralizada aqui. Criação e edição agora acontecem em páginas dedicadas, sem modal."
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

      <div className="grid gap-4 lg:grid-cols-3">
        <JobsSummaryCard type="published" value={summary.published} />
        <JobsSummaryCard type="drafts" value={summary.drafts} />
        <JobsSummaryCard type="attention" value={summary.attention} />
      </div>

      <CrudPage<Job>
        loading={loading}
        error={error}
        count={filteredJobs.length}
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
          { header: "Status", className: "whitespace-nowrap" },
          { header: "Qualidade", className: "min-w-[180px]" },
          { header: "Estrutura", className: "min-w-[220px]" },
          { header: "Atualização", className: "whitespace-nowrap" },
          { header: "", className: "w-[160px]" },
        ]}
        items={filteredJobs}
        renderRow={(job) => {
          const quality = buildJobQualitySummary(job);
          const isSelected = selectedJob?.id === job.id;
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
              onClick={() => setSelectedJobId(job.id)}
              className={[
                "cursor-pointer border-b border-[hsl(var(--border))] transition-colors",
                isSelected
                  ? "bg-[hsl(var(--accent-soft))]"
                  : "even:bg-[hsl(var(--surface-muted))]/45 hover:bg-[hsl(var(--surface-muted))]",
              ].join(" ")}
            >
              <td className="px-4 py-4 align-top">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[hsl(var(--text))]">{job.title}</p>
                    {job.job_area ? <StatusPill label={job.job_area} tone="neutral" /> : null}
                  </div>
                  <p className="text-sm leading-6 text-[hsl(var(--text-muted))]">{truncate(job.description)}</p>
                </div>
              </td>
              <td className="px-4 py-4 align-top">
                <StatusPill label={formatJobStatus(job.status)} tone={jobStatusTone(job.status)} />
              </td>
              <td className="px-4 py-4 align-top">
                {quality ? (
                  <div className="space-y-2">
                    <JobQualityBadge quality={quality} compact />
                    <p className="text-xs text-[hsl(var(--text-muted))]">
                      {qualityNeedsAttention(job) ? "Precisa revisão" : "Bem estruturada"}
                    </p>
                  </div>
                ) : (
                  <span className="text-xs text-[hsl(var(--text-muted))]">Sem avaliação</span>
                )}
              </td>
              <td className="px-4 py-4 align-top">
                <div className="space-y-1 text-sm text-[hsl(var(--text-muted))]">
                  <p>
                    {formatSeniority(job.seniority_level)} • {formatWorkModel(job.work_model)}
                  </p>
                  <p>
                    Exp. mínima:{" "}
                    {job.minimum_years_experience != null ? `${job.minimum_years_experience} ano(s)` : "—"}
                  </p>
                  <p>{job.location ?? "Localização não definida"}</p>
                </div>
              </td>
              <td className="px-4 py-4 align-top text-sm text-[hsl(var(--text-muted))]">
                {new Date(job.updated_at).toLocaleDateString("pt-BR")}
              </td>
              <td className="px-4 py-4 align-top" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/vagas/${job.id}/editar`)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar
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
      >
        {selectedJob ? (
          <JobDetailPanel
            job={selectedJob}
            canManage={canManage}
            onNavigateEdit={(jobId) => navigate(`/vagas/${jobId}/editar`)}
            onNavigatePipeline={(jobId) => navigate(`/pipeline/${jobId}`)}
          />
        ) : null}
      </CrudPage>
    </div>
  );
}
