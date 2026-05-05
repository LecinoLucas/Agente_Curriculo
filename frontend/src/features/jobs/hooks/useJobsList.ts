import { useEffect, useMemo, useState } from "react";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { closeJob, deleteJob, listJobs, pauseJob } from "../../../services/jobsService";
import { toast } from "../../../shared/utils/toast";
import type { Job } from "../../../types/domain";

export type JobStatusFilter = "all" | "draft" | "published" | "paused" | "closed" | "cancelled";

export function useJobsList() {
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
    const attention = jobs.filter((job) => {
      return job.quality_status === "weak" || job.quality_status === "acceptable";
    }).length;
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

  return {
    jobs,
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
  };
}
