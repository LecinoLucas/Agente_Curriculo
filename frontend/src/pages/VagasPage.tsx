import { KanbanSquare, Pencil, Plus, RefreshCcw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActionMenu } from "../components/common/ActionMenu";
import type { ActionMenuItem } from "../components/common/ActionMenu";
import { CrudPage } from "../components/common/CrudPage";
import { PageHeader } from "../components/common/PageHeader";
import Pagination from "../components/common/Pagination";
import { StatusPill } from "../components/common/StatusPill";
import { JobQualityBadge } from "../components/job/JobQualityBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildJobQualitySummary, formatSalary } from "../features/jobs/jobFormConfig";
import { useAuth } from "../features/auth/useAuth";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";
import { closeJob, deleteJob, listJobs, pauseJob } from "../services/jobsService";
import { toast } from "../shared/utils/toast";
import type { Job } from "../types/domain";
import {
  formatEducationLevel,
  formatJobStatus,
  formatSeniority,
  formatWorkModel,
  jobStatusTone,
} from "../utils/jobFormatters";

type JobStatusFilter = "all" | "draft" | "published" | "paused" | "closed" | "cancelled";

function truncate(value: string, max = 140): string {
  return value.length <= max ? value : `${value.slice(0, max).trim()}…`;
}

function qualityNeedsAttention(job: Job) {
  return job.quality_status === "weak" || job.quality_status === "acceptable";
}

export function VagasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManage = user?.role === "admin" || user?.role === "recruiter";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const response = await listJobs(page, pageSize);
      setJobs(response.data);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setSelectedJobId((current) =>
        current && response.data.some((job) => job.id === current)
          ? current
          : response.data[0]?.id ?? null,
      );
    } catch (loadError: unknown) {
      setError(formatErrorDetails(handleApiError(loadError))[0] ?? "Falha ao carregar vagas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [page, pageSize]);

  const filteredJobs = useMemo(() => {
    if (statusFilter === "all") return jobs;
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? filteredJobs[0] ?? null,
    [filteredJobs, selectedJobId],
  );

  const summary = useMemo(() => {
    const published = jobs.filter((job) => job.status === "published").length;
    const drafts = jobs.filter((job) => job.status === "draft").length;
    const attention = jobs.filter((job) => qualityNeedsAttention(job)).length;
    return { published, drafts, attention };
  }, [jobs]);

  async function handlePause(jobId: string) {
    setRunningAction(`pause:${jobId}`);
    try {
      await pauseJob(jobId);
      toast.success("Vaga pausada com sucesso");
      await loadJobs();
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível pausar a vaga.");
    } finally {
      setRunningAction(null);
    }
  }

  async function handleClose(jobId: string) {
    setRunningAction(`close:${jobId}`);
    try {
      await closeJob(jobId);
      toast.success("Vaga encerrada com sucesso");
      await loadJobs();
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível encerrar a vaga.");
    } finally {
      setRunningAction(null);
    }
  }

  async function handleDelete(job: Job) {
    const confirmed = window.confirm(`Excluir a vaga "${job.title}"? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    setRunningAction(`delete:${job.id}`);
    try {
      await deleteJob(job.id);
      toast.success("Vaga excluída com sucesso");
      await loadJobs();
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível excluir a vaga.");
    } finally {
      setRunningAction(null);
    }
  }

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
        <Card className="border-[hsl(var(--success))]/15 bg-[hsl(var(--success-soft))]/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--success))]">
              Publicadas nesta página
            </p>
            <p className="mt-3 text-3xl font-semibold text-[hsl(var(--text))]">{summary.published}</p>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              Pipeline disponível imediatamente para estas vagas.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
              Rascunhos nesta página
            </p>
            <p className="mt-3 text-3xl font-semibold text-[hsl(var(--text))]">{summary.drafts}</p>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              Use a nova página guiada para completar a estrutura e publicar.
            </p>
          </CardContent>
        </Card>

        <Card className="border-[hsl(var(--warning))]/15 bg-[hsl(var(--warning-soft))]/35">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--warning))]">
              Precisam de atenção
            </p>
            <p className="mt-3 text-3xl font-semibold text-[hsl(var(--text))]">{summary.attention}</p>
            <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
              Vagas com qualidade fraca ou aceitável entre os resultados carregados.
            </p>
          </CardContent>
        </Card>
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
          const actionItems: ActionMenuItem[] = [
            {
              label: "Editar",
              onClick: () => navigate(`/vagas/${job.id}/editar`),
            },
            {
              label: "Abrir pipeline",
              onClick: () => navigate(`/pipeline/${job.id}`),
            },
            ...(job.status === "published"
              ? [
                  {
                    label: "Pausar",
                    onClick: () => void handlePause(job.id),
                    disabled: runningAction === `pause:${job.id}`,
                  },
                  {
                    label: "Encerrar",
                    onClick: () => void handleClose(job.id),
                    disabled: runningAction === `close:${job.id}`,
                  },
                ]
              : []),
            ...(job.status === "paused"
              ? [
                  {
                    label: "Encerrar",
                    onClick: () => void handleClose(job.id),
                    disabled: runningAction === `close:${job.id}`,
                  },
                ]
              : []),
            ...(job.status === "draft" || job.status === "cancelled"
              ? [
                  {
                    label: "Excluir",
                    tone: "danger" as const,
                    onClick: () => void handleDelete(job),
                    disabled: runningAction === `delete:${job.id}`,
                  },
                ]
              : []),
          ];

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
          <Card className="overflow-hidden rounded-3xl">
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 border-b border-[hsl(var(--border))] px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-[hsl(var(--text))]">{selectedJob.title}</h3>
                    <StatusPill
                      label={formatJobStatus(selectedJob.status)}
                      tone={jobStatusTone(selectedJob.status)}
                    />
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-[hsl(var(--text-muted))]">
                    {selectedJob.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => navigate(`/pipeline/${selectedJob.id}`)}>
                    <KanbanSquare className="mr-2 h-4 w-4" />
                    Abrir pipeline
                  </Button>
                  {canManage ? (
                    <Button type="button" onClick={() => navigate(`/vagas/${selectedJob.id}/editar`)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar vaga
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4">
                <DetailCard label="Qualidade">
                  {buildJobQualitySummary(selectedJob) ? (
                    <JobQualityBadge quality={buildJobQualitySummary(selectedJob)} />
                  ) : (
                    <span className="text-sm text-[hsl(var(--text-muted))]">Sem avaliação</span>
                  )}
                </DetailCard>

                <DetailCard label="Perfil">
                  <p>{formatSeniority(selectedJob.seniority_level)}</p>
                  <p className="text-[hsl(var(--text-muted))]">{formatWorkModel(selectedJob.work_model)}</p>
                </DetailCard>

                <DetailCard label="Base mínima">
                  <p>{formatEducationLevel(selectedJob.minimum_education_level)}</p>
                  <p className="text-[hsl(var(--text-muted))]">
                    {selectedJob.minimum_years_experience != null
                      ? `${selectedJob.minimum_years_experience} ano(s) de experiência`
                      : "Experiência não definida"}
                  </p>
                </DetailCard>

                <DetailCard label="Local e faixa">
                  <p>{selectedJob.location ?? "Localização não definida"}</p>
                  <p className="text-[hsl(var(--text-muted))]">{formatSalary(selectedJob)}</p>
                </DetailCard>
              </div>

              {selectedJob.requirements || selectedJob.responsibilities || selectedJob.experience_context ? (
                <div className="grid gap-4 border-t border-[hsl(var(--border))] px-6 py-6 lg:grid-cols-3">
                  {selectedJob.requirements ? (
                    <NarrativeCard title="Requisitos" text={selectedJob.requirements} />
                  ) : null}
                  {selectedJob.responsibilities ? (
                    <NarrativeCard title="Responsabilidades" text={selectedJob.responsibilities} />
                  ) : null}
                  {selectedJob.experience_context ? (
                    <NarrativeCard title="Contexto de experiência" text={selectedJob.experience_context} />
                  ) : null}
                </div>
              ) : null}

              {selectedJob.behavioral_requirements?.length ? (
                <div className="border-t border-[hsl(var(--border))] px-6 py-6">
                  <p className="text-sm font-semibold text-[hsl(var(--text))]">Requisitos comportamentais</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedJob.behavioral_requirements.map((item) => (
                      <StatusPill key={item} label={item} tone="neutral" />
                    ))}
                  </div>
                </div>
              ) : null}

              {qualityNeedsAttention(selectedJob) ? (
                <div className="border-t border-[hsl(var(--border))] px-6 py-6">
                  <div className="rounded-2xl border border-[hsl(var(--warning))]/15 bg-[hsl(var(--warning-soft))]/35 px-4 py-4 text-sm text-[hsl(var(--warning))]">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Vale revisar a estrutura desta vaga</p>
                        <p className="mt-1 opacity-90">
                          Use a página de edição para completar requisitos mínimos, skills obrigatórias e checklist de publicação.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </CrudPage>
    </div>
  );
}

function DetailCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/45 px-4 py-4 text-sm text-[hsl(var(--text))]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">{label}</p>
      <div className="mt-3 space-y-1">{children}</div>
    </div>
  );
}

function NarrativeCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 px-4 py-4">
      <p className="text-sm font-semibold text-[hsl(var(--text))]">{title}</p>
      <p className="mt-3 text-sm leading-6 text-[hsl(var(--text-muted))]">{text}</p>
    </div>
  );
}
