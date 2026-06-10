import { useEffect, useMemo, useRef, useState } from "react";
import type { JobStatusSummary } from "../../../types/api";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import {
  archiveJob,
  closeJob,
  deleteJob,
  listJobs,
  pauseJob,
  recalculateJobRanking,
  restoreJob,
  smartRefreshExecute,
  smartRefreshPreview,
  type SmartRefreshPreview,
} from "../../../services/jobsService";
import { pipelineService } from "../../../services/pipelineService";
import { toast } from "../../../shared/utils/toast";
import { compareJobsByOperationalPriority } from "../utils/jobsPageHelpers";
import type { Job } from "../../../types/domain";

export type JobStatusFilter = "all" | "draft" | "published" | "paused" | "closed" | "cancelled" | "archived";
export type JobAreaFilter = "all" | string;
export type JobWorkModelFilter = "all" | string;

export type JobOperationalData = {
  totalCandidates: number;
  stageCounts: Record<string, number>;
  latestActivity: string | null;
  strongCandidates: number;
  topScore: number | null;
};

export function useJobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>("all");
  const [areaFilter, setAreaFilter] = useState<JobAreaFilter>("all");
  const [workModelFilter, setWorkModelFilter] = useState<JobWorkModelFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Job | null>(null);
  const [jobOperationalData, setJobOperationalData] = useState<Record<string, JobOperationalData>>({});
  const [smartRefreshJobId, setSmartRefreshJobId] = useState<string | null>(null);
  const [smartRefreshPreviewData, setSmartRefreshPreviewData] = useState<SmartRefreshPreview | null>(null);
  const [smartRefreshPreviewLoading, setSmartRefreshPreviewLoading] = useState(false);
  const [smartRefreshExecuting, setSmartRefreshExecuting] = useState(false);
  const [summary, setSummary] = useState<JobStatusSummary>({
    all: 0,
    published: 0,
    draft: 0,
    paused: 0,
    closed: 0,
    cancelled: 0,
    archived: 0,
    attention: 0,
  });
  const operationalRequestRef = useRef(0);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const response = await listJobs(page, pageSize, {
        search: searchInput,
        statusFilter,
        jobArea: areaFilter,
        workModel: workModelFilter,
      });
      setJobs(response.data);
      setTotal(response.total);
      setTotalPages(response.total_pages);
      setSummary(response.summary);
      setSelectedJobId((current) =>
        current && response.data.some((job) => job.id === current)
          ? current
          : null,
      );
    } catch (loadError: unknown) {
      setError(formatErrorDetails(handleApiError(loadError))[0] ?? "Falha ao carregar vagas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [page, pageSize, searchInput, statusFilter, areaFilter, workModelFilter]);

  useEffect(() => {
    if (jobs.length === 0) {
      setJobOperationalData({});
      return;
    }

    const requestId = operationalRequestRef.current + 1;
    operationalRequestRef.current = requestId;

    void (async () => {
      try {
        const pipelineJobs = await pipelineService.listPipelineJobs(true);

        if (operationalRequestRef.current !== requestId) return;

        const pipelineJobsById = Object.fromEntries(pipelineJobs.map((job) => [job.id, job]));
        const nextOperationalData: Record<string, JobOperationalData> = {};

        jobs.forEach((job) => {
          const pipelineJob = pipelineJobsById[job.id];

          nextOperationalData[job.id] = {
            totalCandidates: pipelineJob?.total_candidates ?? 0,
            stageCounts: pipelineJob?.stage_counts ?? {},
            latestActivity: pipelineJob?.latest_activity ?? null,
            strongCandidates: 0,
            topScore: null,
          };
        });

        setJobOperationalData(nextOperationalData);
      } catch {
        if (operationalRequestRef.current !== requestId) return;
        setJobOperationalData({});
      }
    })();
  }, [jobs]);

  const filteredJobs = useMemo(
    () => [...jobs].sort((left, right) => compareJobsByOperationalPriority(left, right, jobOperationalData)),
    [jobs, jobOperationalData],
  );

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId],
  );

  const areaOptions = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.job_area).filter(Boolean) as string[])).sort((left, right) =>
        left.localeCompare(right, "pt-BR"),
      ),
    [jobs],
  );

  const workModelOptions = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.work_model).filter(Boolean) as string[])).sort((left, right) =>
        left.localeCompare(right, "pt-BR"),
      ),
    [jobs],
  );

  const statusCounts = useMemo(
    () => ({
      all: summary.all,
      published: summary.published,
      draft: summary.draft,
      paused: summary.paused,
      closed: summary.closed,
      cancelled: summary.cancelled,
      archived: summary.archived,
    }),
    [summary],
  );

  const hasActiveFilters =
    searchInput.trim().length > 0 ||
    statusFilter !== "all" ||
    areaFilter !== "all" ||
    workModelFilter !== "all";

  function clearFilters() {
    setSearchInput("");
    setStatusFilter("all");
    setAreaFilter("all");
    setWorkModelFilter("all");
    setPage(1);
  }

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

  async function handleArchive(payload: { reason: string; note?: string }) {
    if (!archiveTarget) return;

    setRunningAction(`archive:${archiveTarget.id}`);
    try {
      await archiveJob(archiveTarget.id, payload);
      toast.success("Vaga arquivada com sucesso.");
      setArchiveTarget(null);
      await loadJobs();
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível arquivar a vaga.");
    } finally {
      setRunningAction(null);
    }
  }

  async function handleRestore(jobId: string) {
    setRunningAction(`restore:${jobId}`);
    try {
      await restoreJob(jobId);
      toast.success("Vaga reativada com sucesso.");
      await loadJobs();
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível reativar a vaga.");
    } finally {
      setRunningAction(null);
    }
  }

  async function handleRecalculateRanking(jobId: string) {
    setRunningAction(`recalculate:${jobId}`);
    try {
      await recalculateJobRanking(jobId);
      toast.success("Recálculo de ranking enfileirado. Nenhum token de IA foi usado.");
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível enfileirar o recálculo do ranking.");
    } finally {
      setRunningAction(null);
    }
  }

  async function handleSmartRefreshOpen(jobId: string) {
    setSmartRefreshJobId(jobId);
    setSmartRefreshPreviewData(null);
    setSmartRefreshPreviewLoading(true);
    try {
      const preview = await smartRefreshPreview(jobId);
      setSmartRefreshPreviewData(preview);
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível carregar o preview.");
      setSmartRefreshJobId(null);
    } finally {
      setSmartRefreshPreviewLoading(false);
    }
  }

  function handleSmartRefreshClose() {
    setSmartRefreshJobId(null);
    setSmartRefreshPreviewData(null);
  }

  async function handleSmartRefreshConfirm() {
    if (!smartRefreshJobId) return;
    setSmartRefreshExecuting(true);
    setRunningAction(`smart-refresh:${smartRefreshJobId}`);
    try {
      const result = await smartRefreshExecute(smartRefreshJobId);
      toast.success(result.message || "Atualização de candidatos iniciada.");
      setSmartRefreshJobId(null);
      setSmartRefreshPreviewData(null);
    } catch (actionError: unknown) {
      toast.error(formatErrorDetails(handleApiError(actionError))[0] ?? "Não foi possível iniciar a atualização.");
    } finally {
      setSmartRefreshExecuting(false);
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
    summary,
    areaOptions,
    workModelOptions,
    statusCounts,
    hasActiveFilters,
    clearFilters,
    loadJobs,
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
  };
}
