import { useEffect, useState } from "react";
import { formatContextError } from "../../services/errorMessages";
import { toast } from "../../shared/utils/toast";
import { pipelineService } from "../../services/pipelineService";
import { listJobs } from "../../services/jobsService";
import { isTransferTargetJob } from "../../utils/jobStatusRules";
import type { Job, TransferCandidateJobResponse } from "../../types/domain";

interface TransferJobModalProps {
  isOpen: boolean;
  candidateId: string | null;
  fromJobId: string | null;
  availableJobs: Job[];
  canTransfer: boolean;
  onClose: () => void;
  onSuccess: (result: TransferCandidateJobResponse) => Promise<void>;
}

export function TransferJobModal({
  isOpen,
  candidateId,
  fromJobId,
  availableJobs: preloadedJobs,
  canTransfer,
  onClose,
  onSuccess,
}: TransferJobModalProps) {
  const [availableJobs, setAvailableJobs] = useState<Job[]>(preloadedJobs);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobId, setJobId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setAvailableJobs(preloadedJobs);
    setReason("");
    setSaving(false);
    setError(null);
    setJobsError(null);
  }, [isOpen, preloadedJobs]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    if (preloadedJobs.length > 0) {
      setJobsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setJobsLoading(true);
    setJobsError(null);

    void listJobs(1, 100, { statusFilter: "all" })
      .then((response) => {
        if (cancelled) return;
        setAvailableJobs(
          response.data.filter(
            (job) => job.id !== fromJobId && isTransferTargetJob(job.status),
          ),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setJobsError(
          formatContextError(
            err,
            "Não foi possível carregar as vagas disponíveis para transferência.",
            "Tente novamente.",
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setJobsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fromJobId, isOpen, preloadedJobs]);

  useEffect(() => {
    if (!isOpen) return;

    setJobId((current) => {
      if (current && availableJobs.some((job) => job.id === current)) {
        return current;
      }
      return availableJobs[0]?.id ?? "";
    });
  }, [isOpen, availableJobs]);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!candidateId || !fromJobId || !jobId) return;

    if (!reason.trim()) {
      setError("Informe o motivo da transferência.");
      return;
    }

    if (!canTransfer) {
      setError("Candidato não possui vaga ativa. Use adicionar a uma vaga.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const transferResult = await pipelineService.transferCandidateJob(candidateId, {
        from_job_id: fromJobId,
        to_job_id: jobId,
        reason: reason.trim(),
      });

      toast.success("Candidato transferido para outra vaga");
      await onSuccess(transferResult);
    } catch (err: unknown) {
      setError(
        formatContextError(
          err,
          "Não foi possível transferir o candidato para a vaga selecionada.",
          "Tente novamente.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="ui-card fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">
              Transferir/corrigir vaga
            </h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              O vínculo atual será desativado e o candidato entrará em{" "}
              <code>entry</code> na vaga destino publicada.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-[hsl(var(--warning))]/30 bg-warning-soft px-4 py-3">
          <p className="text-sm font-semibold text-text">
            Aviso de impacto
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Esta ação retira o candidato do pipeline atual. Use apenas para corrigir o contexto da vaga.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">
              Vaga destino
            </span>
            <select
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              disabled={saving || jobsLoading || availableJobs.length === 0}
              className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-50"
            >
              {jobsLoading ? (
                <option value="">Carregando vagas…</option>
              ) : availableJobs.length === 0 ? (
                <option value="">Nenhuma vaga disponível</option>
              ) : (
                availableJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))
              )}
            </select>
          </label>

          <p className="text-xs text-text-muted">
            Apenas vagas publicadas podem receber transferência.
          </p>

          {jobsError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {jobsError}
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">
              Motivo da transferência
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              disabled={saving}
              placeholder="Explique o impacto desta correção de vaga."
              className="ui-input rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !jobId || !reason.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? "Transferindo…" : "Confirmar"}
          </button>
        </div>
      </div>
    </>
  );
}
