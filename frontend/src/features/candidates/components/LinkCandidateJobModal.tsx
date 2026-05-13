import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BriefcaseBusiness, LoaderCircle, Search } from "lucide-react";

import { Modal } from "../../../components/common/Modal";
import { formatContextError } from "../../../services/errorMessages";
import { listJobs } from "../../../services/jobsService";
import { pipelineService } from "../../../services/pipelineService";
import { toast } from "../../../shared/utils/toast";
import type { Job } from "../../../types/domain";
import { formatJobArea } from "../../jobs/jobFormConfig";
import { buildAnalysisDecisionToast } from "../../pipeline/analysisDispatchFeedback";
import {
  getJobStatusLabel,
  getLinkableJobs,
  isLinkableJobStatus,
} from "../utils/jobLinking";

interface LinkCandidateJobModalProps {
  isOpen: boolean;
  candidateId: string | null;
  candidateName?: string | null;
  linkedJobIds?: string[];
  onClose: () => void;
  onLinked?: (jobId: string) => Promise<void> | void;
}

export function LinkCandidateJobModal({
  isOpen,
  candidateId,
  candidateName,
  linkedJobIds = [],
  onClose,
  onLinked,
}: LinkCandidateJobModalProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingJobId, setLinkingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    setLoading(true);
    setError(null);
    setSearch("");

    void listJobs(1, 100, { statusFilter: "all" })
      .then((response) => {
        if (cancelled) return;
        setJobs(response.data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          formatContextError(
            err,
            "Não foi possível carregar as vagas disponíveis.",
            "Tente novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const linkableJobs = useMemo(
    () => getLinkableJobs(jobs, linkedJobIds),
    [jobs, linkedJobIds],
  );

  const availableJobs = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return linkableJobs.filter((job) => {
      if (!normalizedSearch) return true;

      const haystack = [
        job.title,
        job.job_area,
        job.seniority_level,
        job.location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return haystack.includes(normalizedSearch);
    });
  }, [linkableJobs, search]);

  const hasAnyActiveJobs = useMemo(
    () => jobs.some((job) => isLinkableJobStatus(job.status)),
    [jobs],
  );
  const hasAnyLinkableJobs = linkableJobs.length > 0;
  const hasSearch = search.trim().length > 0;

  if (!isOpen) return null;

  async function handleLink(jobId: string) {
    if (!candidateId) return;

    setLinkingJobId(jobId);
    setError(null);

    try {
      const linkResult = await pipelineService.addCandidateToJob(candidateId, {
        job_id: jobId,
        initial_stage: "entry",
      });

      toast.success("Candidato vinculado à vaga com sucesso");
      const analysisToast = buildAnalysisDecisionToast(linkResult.analysis);
      if (analysisToast) {
        if (analysisToast.tone === "success") toast.success(analysisToast.message);
        if (analysisToast.tone === "info") toast.info(analysisToast.message);
        if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
        if (analysisToast.tone === "error") toast.error(analysisToast.message);
      }
      await onLinked?.(jobId);
      onClose();
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível vincular o candidato à vaga",
          "Tente novamente.",
        ),
      );
      toast.error("Não foi possível vincular o candidato à vaga");
    } finally {
      setLinkingJobId(null);
    }
  }

  function handleCreateJob() {
    onClose();
    navigate("/vagas/nova");
  }

  return (
    <Modal
      title="Vincular candidato a uma vaga"
      onClose={() => {
        if (linkingJobId) return;
        onClose();
      }}
      contentClassName="sm:max-w-[720px]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-[hsl(var(--border))] px-6 py-4">
          <p className="text-sm font-medium text-[hsl(var(--text))]">
            {candidateName ? candidateName : "Selecione a vaga"}
          </p>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Escolha uma vaga ativa para iniciar análise, score e acompanhamento no funil.
          </p>
        </div>

        <div className="border-b border-[hsl(var(--border))] px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--text-muted))]" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar vaga por título, área ou senioridade"
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] py-2.5 pl-10 pr-4 text-sm text-[hsl(var(--text))] outline-none transition focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/15"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-[hsl(var(--text-muted))]">
              <LoaderCircle className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
              Carregando vagas ativas…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {error}
            </div>
          ) : availableJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-6 py-12 text-center">
              <BriefcaseBusiness className="h-8 w-8 text-[hsl(var(--text-muted))]" />
              <p className="mt-4 text-base font-semibold text-[hsl(var(--text))]">
                {hasSearch && hasAnyLinkableJobs
                  ? "Nenhuma vaga encontrada"
                  : hasAnyActiveJobs
                  ? "Todas as vagas ativas já estão vinculadas"
                  : "Nenhuma vaga ativa encontrada"}
              </p>
              <p className="mt-2 max-w-md text-sm text-[hsl(var(--text-muted))]">
                {hasSearch && hasAnyLinkableJobs
                  ? "Tente outro termo de busca para encontrar uma vaga ativa."
                  : hasAnyActiveJobs
                  ? "Crie uma nova vaga ou remova filtros para vincular este candidato a outro processo."
                  : "Crie uma vaga publicada ou pausada para iniciar o fluxo deste candidato."}
              </p>
              <button
                type="button"
                onClick={handleCreateJob}
                className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
              >
                Criar nova vaga
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {availableJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[hsl(var(--text))]">{job.title}</p>
                        <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                          {getJobStatusLabel(job.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[hsl(var(--text-muted))]">
                        <span>Área: {formatJobArea(job.job_area)}</span>
                        <span>Senioridade: {job.seniority_level ?? "—"}</span>
                        <span>Modelo: {job.work_model ?? "—"}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleLink(job.id)}
                      disabled={linkingJobId !== null}
                      className="shrink-0 rounded-xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
                    >
                      {linkingJobId === job.id ? "Vinculando…" : "Vincular"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[hsl(var(--border))] px-6 py-4">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={linkingJobId !== null}
              className="rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
