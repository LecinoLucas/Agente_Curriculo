import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { pipelineService } from "../../services/pipelineService";
import { toast } from "../../shared/utils/toast";
import { handleApiError } from "../../shared/utils/errorHandler";
import type { Job } from "../../types/domain";
import { formatJobStatus, jobStatusTone } from "../../utils/jobFormatters";
import { StatusPill } from "../../components/common/StatusPill";

interface AddJobModalProps {
  isOpen: boolean;
  candidateId: string | null;
  jobs: Job[];
  linkedJobIds?: Set<string>;
  excludedJobId?: string | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function AddJobModal({
  isOpen,
  candidateId,
  jobs,
  linkedJobIds = new Set<string>(),
  excludedJobId = null,
  onClose,
  onSuccess,
}: AddJobModalProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectableJobs = useMemo(
    () =>
      jobs
        .map((job) => {
          const normalizedId =
            job.id ?? (job as Job & { job_id?: string; jobId?: string }).job_id ?? (job as Job & { jobId?: string }).jobId;
          if (!normalizedId) return null;
          return { ...job, id: normalizedId };
        })
        .filter(
          (job): job is Job =>
            job !== null &&
            job.id !== excludedJobId &&
            !linkedJobIds.has(job.id) &&
            (job.status === "published" || job.status === "paused"),
        ),
    [excludedJobId, jobs, linkedJobIds],
  );

  function resetLocalState() {
    setSelectedJobId(null);
    setIsSubmitting(false);
  }

  function handleClose() {
    resetLocalState();
    onClose();
  }

  useEffect(() => {
    if (!isOpen) {
      resetLocalState();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleAddJob() {
    if (!candidateId) {
      toast.error("Candidato não encontrado");
      return;
    }
    if (!selectedJobId) {
      toast.error("Selecione uma vaga");
      return;
    }

    setIsSubmitting(true);
    try {
      await pipelineService.addCandidateToJob(candidateId, {
        job_id: selectedJobId,
        initial_stage: "entry",
      });

      toast.success("Candidato adicionado à vaga");
      await onSuccess();
      handleClose();
    } catch (error) {
      handleApiError(error, "Não foi possível adicionar o candidato à vaga.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal onClose={handleClose} title="Adicionar candidato a uma vaga">
      <div className="space-y-4">
        {selectableJobs.length === 0 ? (
          <p className="text-center text-sm text-[hsl(var(--text-muted))]">
            Nenhuma vaga disponível para vincular.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[hsl(var(--text))]">
                Selecionar vaga
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectableJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    aria-pressed={selectedJobId === job.id}
                    className={`w-full text-left rounded-lg border-2 p-3 transition ${
                      selectedJobId === job.id
                        ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-[hsl(var(--text))]">{job.title}</p>
                        <p className="text-sm text-[hsl(var(--text-muted))]">{job.location || "Local não informado"}</p>
                      </div>
                      <StatusPill
                        label={formatJobStatus(job.status)}
                        tone={jobStatusTone(job.status)}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium transition hover:bg-[hsl(var(--surface-muted))] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddJob}
                disabled={!selectedJobId || isSubmitting || !candidateId}
                className="flex-1 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50"
              >
                {isSubmitting ? "Adicionando..." : "Adicionar"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
