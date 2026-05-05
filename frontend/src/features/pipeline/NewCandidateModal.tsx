import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Modal } from "../../components/common/Modal";
import { StatusPill } from "../../components/common/StatusPill";
import { Badge } from "../../components/ui/badge";
import { candidatesService } from "../../services/candidatesService";
import { formatErrorDetails, handleApiError } from "../../shared/utils/errorHandler";
import { feedback } from "../../services/feedback";
import { HttpError } from "../../services/http";
import { pipelineService } from "../../services/pipelineService";
import { usePipeline } from "./PipelineContext";
import type { Job } from "../../types/domain";
import { formatJobStatus, formatSeniority, jobStatusTone } from "../../utils/jobFormatters";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NewCandidateFormErrors = {
  fullName?: string;
  email?: string;
  cpf?: string;
  form?: string;
};

type CandidateLinkStatus = "idle" | "created_pending_link" | "linked" | "link_failed";
type DuplicateJobStatus = "idle" | "checking" | "linked" | "unlinked";

function formatCpfInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`;
  return d;
}

function canLinkToJob(job: Job | null): boolean {
  return job?.status === "published" || job?.status === "paused";
}

interface NewCandidateModalProps {
  isOpen: boolean;
  defaultJobId?: string | null;
  onClose: () => void;
  onCreated: (candidateId: string) => Promise<void>;
}

export function NewCandidateModal({
  isOpen,
  defaultJobId = null,
  onClose,
  onCreated,
}: NewCandidateModalProps) {
  const { jobs, notifyCandidatesChanged, invalidateJobState } = usePipeline();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<NewCandidateFormErrors>({});
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);
  const [createdCandidate, setCreatedCandidate] = useState<{ id: string; full_name: string } | null>(null);
  const [linkStatus, setLinkStatus] = useState<CandidateLinkStatus>("idle");
  const [duplicateJobStatus, setDuplicateJobStatus] = useState<DuplicateJobStatus>("idle");

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const selectedJobCanReceiveCandidates = canLinkToJob(selectedJob);

  useEffect(() => {
    if (!isOpen) return;
    setFullName("");
    setEmail("");
    setPhone("");
    setCpf("");
    setSelectedJobId(defaultJobId ?? "");
    setLoading(false);
    setErrors({});
    setDuplicate(null);
    setCreatedCandidate(null);
    setLinkStatus("idle");
    setDuplicateJobStatus("idle");
  }, [defaultJobId, isOpen]);

  useEffect(() => {
    if (!isOpen || !duplicate || !selectedJobId) {
      if (duplicate && !selectedJobId) {
        setDuplicateJobStatus("idle");
      }
      return;
    }

    let cancelled = false;
    setDuplicateJobStatus("checking");

    void (async () => {
      const overview = await candidatesService.getOverview(duplicate.id);
      const linked = overview.pipeline_entries.some((entry) => entry.job_id === selectedJobId);
      if (!cancelled) {
        setDuplicateJobStatus(linked ? "linked" : "unlinked");
      }
    })().catch(() => {
      if (!cancelled) {
        setDuplicateJobStatus("idle");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [duplicate, isOpen, selectedJobId]);

  if (!isOpen) return null;

  function toFriendlyText(error: unknown, fallback: string): string {
    const detail = formatErrorDetails(handleApiError(error)).join(" ");
    return detail || fallback;
  }

  function clearDuplicate(field?: keyof NewCandidateFormErrors) {
    if (duplicate) setDuplicate(null);
    if (createdCandidate) {
      setCreatedCandidate(null);
      setLinkStatus("idle");
    }
    setDuplicateJobStatus("idle");
    setErrors((current) => {
      if (!field && !current.form) return current;
      if (!field) return {};
      return { ...current, [field]: undefined, form: undefined };
    });
  }

  function validateForm(): {
    trimmedName: string;
    trimmedEmail: string;
    trimmedPhone: string;
    cpfDigits: string;
  } | null {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const cpfDigits = cpf.replace(/\D/g, "");
    const nextErrors: NewCandidateFormErrors = {};

    if (!trimmedName) {
      nextErrors.fullName = "Nome é obrigatório";
    }
    if (!trimmedEmail) {
      nextErrors.email = "E-mail é obrigatório";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Informe um e-mail válido";
    }
    if (cpfDigits && cpfDigits.length !== 11) {
      nextErrors.cpf = "CPF deve ter 11 dígitos";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    setErrors({});
    return { trimmedName, trimmedEmail, trimmedPhone, cpfDigits };
  }

  async function ensureSelectedJobCanReceiveCandidates() {
    if (!selectedJobId) return null;
    if (!selectedJob) {
      throw new Error("A vaga selecionada não foi encontrada.");
    }
    if (!selectedJobCanReceiveCandidates) {
      throw new Error("A vaga selecionada precisa estar publicada ou pausada para receber candidatos.");
    }
    return selectedJob;
  }

  async function linkCandidateToSelectedJob(candidateId: string, job: Job) {
    await pipelineService.addCandidateToJob(candidateId, {
      job_id: job.id,
      initial_stage: "entry",
    });
    await invalidateJobState(job.id);
    notifyCandidatesChanged();
    setLinkStatus("linked");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    try {
      await ensureSelectedJobCanReceiveCandidates();
    } catch (err: unknown) {
      setErrors({
        form: toFriendlyText(
          err,
          "A vaga selecionada não pode receber novos candidatos. Escolha uma vaga publicada ou pausada, ou limpe o campo para criar sem vínculo.",
        ),
      });
      return;
    }

    const validated = validateForm();
    if (!validated) return;

    const { trimmedName, trimmedEmail, trimmedPhone, cpfDigits } = validated;

    setLoading(true);
    setErrors({});
    setDuplicate(null);
    setCreatedCandidate(null);
    setLinkStatus("idle");
    setDuplicateJobStatus("idle");
    feedback.createCandidate.processing();

    try {
      const check = await candidatesService.checkDuplicate(
        trimmedEmail,
        cpfDigits || undefined,
      );

      if (check.exists && check.candidate_id) {
        setDuplicate({
          id: check.candidate_id,
          full_name: check.full_name ?? "Candidato existente",
        });
        setErrors({
          form: "Já existe um candidato com este email/CPF",
        });
        return;
      }

      const candidate = await candidatesService.create({
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        cpf: cpfDigits || undefined,
      });

      notifyCandidatesChanged();
      setCreatedCandidate({ id: candidate.id, full_name: candidate.full_name });

      if (selectedJob && selectedJobCanReceiveCandidates) {
        setLinkStatus("created_pending_link");
        try {
          await linkCandidateToSelectedJob(candidate.id, selectedJob);
        } catch (err: unknown) {
          setLinkStatus("link_failed");
          setErrors({
            form: toFriendlyText(
              err,
              "Candidato criado, mas falhou ao vinculá-lo à vaga selecionada. Tente vincular novamente para concluir o pipeline.",
            ),
          });
          return;
        }
      } else {
        setLinkStatus("created_pending_link");
      }

      await onCreated(candidate.id);
      feedback.createCandidate.success(
        selectedJob
          ? selectedJobCanReceiveCandidates
            ? `Candidato adicionado à vaga ${selectedJob.title}`
            : `Candidato criado. A vaga ${selectedJob.title} não permite vínculo.`
          : "Candidato criado (Aguardando vaga)",
      );
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          feedback.createCandidate.error(err);
          setErrors({
            form: "Já existe um candidato com este email/CPF",
          });
          return;
        }
        if (err.status === 422) {
          feedback.createCandidate.error(err);
          setErrors({
            form: "Dados inválidos. Revise nome, e-mail e CPF antes de criar o candidato.",
          });
          return;
        }
      }

      feedback.createCandidate.error(err);
      setErrors({
        form: toFriendlyText(err, "Não foi possível criar o candidato. Revise os dados e tente novamente."),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryLink() {
    if (!createdCandidate) return;

    let job: Job | null;
    try {
      job = await ensureSelectedJobCanReceiveCandidates();
      if (!job) {
        setErrors({
          form: "Selecione uma vaga publicada ou pausada para concluir o vínculo.",
        });
        return;
      }
    } catch (err: unknown) {
      setErrors({
        form: toFriendlyText(
          err,
          "Não foi possível vincular o candidato à vaga selecionada. Escolha uma vaga válida e tente novamente.",
        ),
      });
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      await linkCandidateToSelectedJob(createdCandidate.id, job);
      await onCreated(createdCandidate.id);
      feedback.createCandidate.success(`Candidato adicionado à vaga ${job.title}`);
    } catch (err: unknown) {
      setLinkStatus("link_failed");
      setErrors({
        form: toFriendlyText(
          err,
          "Candidato criado, mas ainda não foi possível vinculá-lo à vaga. Tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenDuplicateCandidate() {
    if (!duplicate) return;

    setLoading(true);
    setErrors({});
    try {
      await onCreated(duplicate.id);
    } catch (err: unknown) {
      setErrors({
        form: toFriendlyText(err, "Não foi possível abrir o candidato existente. Tente novamente."),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkDuplicateCandidate() {
    if (!duplicate || !selectedJob || !selectedJobCanReceiveCandidates) return;

    setLoading(true);
    setErrors({});
    setCreatedCandidate({ id: duplicate.id, full_name: duplicate.full_name });
    try {
      await linkCandidateToSelectedJob(duplicate.id, selectedJob);
      setDuplicateJobStatus("linked");
      await onCreated(duplicate.id);
      feedback.createCandidate.success(`Candidato adicionado à vaga ${selectedJob.title}`);
    } catch (err: unknown) {
      setLinkStatus("link_failed");
      setErrors({
        form: toFriendlyText(
          err,
          "Falha ao vincular o candidato duplicado à vaga selecionada. Tente novamente.",
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  const selectedJobLabel = selectedJob
    ? `${selectedJob.title} · ${formatJobStatus(selectedJob.status)}`
    : selectedJobId
      ? "Vaga ainda não encontrada"
      : "Sem vaga selecionada";

  const primaryButtonLabel = selectedJobId ? "Criar e adicionar à vaga" : "Criar candidato sem vaga";

  return (
    <Modal
      title="Novo candidato"
      onClose={onClose}
      contentClassName="sm:max-w-[720px]"
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5 p-6">
        <div className="space-y-1">
          <p className="text-sm text-[hsl(var(--text-muted))]">
            A vaga é opcional. Você pode vincular depois. Se quiser, já crie o candidato com uma vaga selecionada.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Criar candidato</Badge>
            <Badge variant="outline">Vínculo opcional</Badge>
          </div>
        </div>

        {selectedJobId ? (
          <div
            className={[
              "rounded-xl border px-4 py-3",
              selectedJobCanReceiveCandidates
                ? "border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]"
                : "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))]",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                  Vaga selecionada
                </p>
                <p className="mt-1 text-sm font-semibold text-[hsl(var(--text))]">{selectedJobLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJobId("")}
                disabled={loading}
                className="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface))] disabled:opacity-50"
              >
                Limpar vaga
              </button>
            </div>
            {selectedJob ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusPill label={formatJobStatus(selectedJob.status)} tone={jobStatusTone(selectedJob.status)} />
                {selectedJob.seniority_level ? (
                  <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--text-muted))]">
                    {formatSeniority(selectedJob.seniority_level)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2 text-xs text-[hsl(var(--text-muted))]">
              {selectedJobCanReceiveCandidates
                ? "Este candidato será criado e vinculado automaticamente à vaga selecionada."
                : "Para vincular, a vaga precisa estar publicada ou pausada. Você pode limpar o campo para criar sem vínculo."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
            <p className="text-sm font-medium text-[hsl(var(--text))]">Sem vaga selecionada</p>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              O candidato será cadastrado com status <strong>Aguardando vaga</strong> e poderá ser vinculado depois.
            </p>
          </div>
        )}

        {(createdCandidate || duplicate) && (linkStatus !== "idle" || duplicate) ? (
          <div
            className={[
              "rounded-xl border px-4 py-3",
              linkStatus === "linked"
                ? "border-[hsl(var(--success))]/20 bg-[hsl(var(--success-soft))]"
                : linkStatus === "link_failed"
                  ? "border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger-soft))]"
                  : "border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))]",
            ].join(" ")}
          >
            <p className="text-sm font-semibold text-[hsl(var(--text))]">
              {createdCandidate
                ? linkStatus === "linked"
                  ? selectedJob
                    ? `Candidato adicionado à vaga ${selectedJob.title}`
                    : "Candidato criado"
                  : linkStatus === "link_failed"
                    ? "Falha ao vincular"
                    : "Candidato criado, aguardando vínculo"
                : duplicateJobStatus === "linked"
                  ? "Candidato existente já vinculado"
                  : "Candidato duplicado encontrado"}
            </p>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              {createdCandidate
                ? linkStatus === "linked"
                  ? "O candidato já foi cadastrado e entrou no pipeline, se a vaga foi selecionada."
                  : linkStatus === "link_failed"
                    ? "O cadastro foi salvo, mas o vínculo com a vaga precisa ser concluído manualmente."
                    : selectedJobId
                      ? "Candidato criado. Finalizando vínculo com a vaga."
                      : "Candidato criado com status Aguardando vaga."
                : duplicateJobStatus === "linked"
                  ? "Já existe um candidato com este email/CPF e ele já está vinculado à vaga selecionada."
                  : "Já existe um candidato com este email/CPF."}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Nome completo *</span>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                clearDuplicate("fullName");
              }}
              placeholder="Nome do candidato"
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.fullName
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-[hsl(var(--border))] focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.fullName ? <span className="text-xs text-red-600">{errors.fullName}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">E-mail *</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearDuplicate("email");
              }}
              placeholder="email@exemplo.com"
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.email
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-[hsl(var(--border))] focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.email ? <span className="text-xs text-red-600">{errors.email}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Telefone</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(11) 99999-9999"
              className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[hsl(var(--text))]">CPF</span>
            <input
              type="text"
              value={cpf}
              onChange={(event) => {
                setCpf(formatCpfInput(event.target.value));
                clearDuplicate("cpf");
              }}
              placeholder="000.000.000-00"
              maxLength={14}
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.cpf
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-[hsl(var(--border))] focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.cpf ? <span className="text-xs text-red-600">{errors.cpf}</span> : null}
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Vaga (opcional)</span>
            <select
              value={selectedJobId}
              onChange={(event) => {
                setSelectedJobId(event.target.value);
                setErrors((current) => ({ ...current, form: undefined }));
                setDuplicate(null);
                setDuplicateJobStatus("idle");
              }}
              disabled={loading}
              className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-50"
            >
              <option value="">Sem vaga</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} - {formatJobStatus(job.status)}
                </option>
              ))}
            </select>
          </label>

          {errors.form ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.form}
            </p>
          ) : null}
        </div>

        {duplicate ? (
          <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] p-4">
            <p className="text-sm font-semibold text-[hsl(var(--warning))]">
              Já existe um candidato com este email/CPF: <strong>{duplicate.full_name}</strong>
            </p>
            <p className="mt-1 text-sm text-[hsl(var(--warning))]">
              {selectedJobId
                ? duplicateJobStatus === "checking"
                  ? "Verificando se ele já está vinculado à vaga selecionada..."
                  : duplicateJobStatus === "linked"
                    ? "Este candidato já está vinculado à vaga selecionada."
                    : "Ele ainda não está vinculado à vaga selecionada."
                : "Você pode abrir o candidato existente ou limpar a vaga para seguir sem vínculo."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleOpenDuplicateCandidate()}
                disabled={loading || duplicateJobStatus === "checking"}
                className="rounded-lg bg-[hsl(var(--warning))] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[hsl(var(--warning))]/90 disabled:opacity-50"
              >
                {duplicateJobStatus === "checking" ? "Verificando vínculo…" : "Abrir candidato existente"}
              </button>
              {selectedJobId && duplicateJobStatus === "unlinked" ? (
                <button
                  type="button"
                  onClick={() => void handleLinkDuplicateCandidate()}
                  disabled={loading || !selectedJobCanReceiveCandidates}
                  className="rounded-lg border border-[hsl(var(--warning))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--warning))] transition hover:bg-[hsl(var(--warning-soft))] disabled:opacity-50"
                >
                  Adicionar à vaga
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {createdCandidate && linkStatus === "link_failed" ? (
            <button
              type="button"
              onClick={() => void handleRetryLink()}
              disabled={loading || !selectedJobCanReceiveCandidates}
              className="rounded-lg border border-[hsl(var(--danger))] px-4 py-2 text-sm font-medium text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger-soft))] disabled:opacity-50"
            >
              Tentar vincular novamente
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || Boolean(createdCandidate)}
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
          >
            {loading ? "Verificando…" : primaryButtonLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
