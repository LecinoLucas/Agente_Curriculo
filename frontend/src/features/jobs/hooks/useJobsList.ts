import { useEffect, useMemo, useRef, useState } from "react";
import { formatErrorDetails, handleApiError } from "../../../shared/utils/errorHandler";
import { closeJob, deleteJob, listJobCandidates, listJobs, pauseJob } from "../../../services/jobsService";
import { pipelineService } from "../../../services/pipelineService";
import { toast } from "../../../shared/utils/toast";
import { compareJobsByOperationalPriority } from "../utils/jobsPageHelpers";
import type { Job } from "../../../types/domain";

export type JobStatusFilter = "all" | "draft" | "published" | "paused" | "closed" | "cancelled";

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
  const [statusFilter, setStatusFilter] = useState<JobStatusFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [jobOperationalData, setJobOperationalData] = useState<Record<string, JobOperationalData>>({});
  const operationalRequestRef = useRef(0);

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
  }, [page, pageSize]);

  useEffect(() => {
    if (jobs.length === 0) {
      setJobOperationalData({});
      return;
    }

    const requestId = operationalRequestRef.current + 1;
    operationalRequestRef.current = requestId;

    void (async () => {
      try {
        const [pipelineJobs, candidateResults] = await Promise.all([
          pipelineService.listPipelineJobs(true),
          Promise.allSettled(jobs.map((job) => listJobCandidates(job.id, 1, 25))),
        ]);

        if (operationalRequestRef.current !== requestId) return;

        const pipelineJobsById = Object.fromEntries(pipelineJobs.map((job) => [job.id, job]));
        const nextOperationalData: Record<string, JobOperationalData> = {};

        jobs.forEach((job, index) => {
          const pipelineJob = pipelineJobsById[job.id];
          const candidateResult = candidateResults[index];
          const candidates =
            candidateResult?.status === "fulfilled" ? (candidateResult.value.data ?? []) : [];
          const scoredCandidates = candidates
            .map((candidate) => Number(candidate.match_score ?? candidate.overall_score ?? 0))
            .filter((score) => Number.isFinite(score));

          nextOperationalData[job.id] = {
            totalCandidates: pipelineJob?.total_candidates ?? candidates.length,
            stageCounts: pipelineJob?.stage_counts ?? {},
            latestActivity: pipelineJob?.latest_activity ?? null,
            strongCandidates: candidates.filter((candidate) => {
              const score = Number(candidate.match_score ?? candidate.overall_score ?? 0);
              return candidate.recommendation === "good_match" || score >= 70;
            }).length,
            topScore: scoredCandidates.length > 0 ? Math.max(...scoredCandidates) : null,
          };
        });

        setJobOperationalData(nextOperationalData);
      } catch {
        if (operationalRequestRef.current !== requestId) return;
        setJobOperationalData({});
      }
    })();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const visibleJobs = statusFilter === "all" ? jobs : jobs.filter((job) => job.status === statusFilter);
    return [...visibleJobs].sort((left, right) => compareJobsByOperationalPriority(left, right, jobOperationalData));
  }, [jobs, statusFilter, jobOperationalData]);

  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? null,
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
    jobOperationalData,
    filteredJobs,
    selectedJob,
    summary,
    loadJobs,
    handlePause,
    handleClose,
    handleDelete,
  };
}
