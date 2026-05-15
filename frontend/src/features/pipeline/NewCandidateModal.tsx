import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Modal } from "../../components/common/Modal";
import { candidatesService } from "../../services/candidatesService";
import { resumeService } from "../../services/resumeService";
import { formatErrorDetails, handleApiError } from "../../shared/utils/errorHandler";
import { feedback } from "../../services/feedback";
import { HttpError } from "../../services/http";
import { pipelineService } from "../../services/pipelineService";
import { usePipeline } from "./PipelineContext";
import type { Job } from "../../types/domain";
import { formatJobStatus, formatSeniority, jobStatusTone } from "../../utils/jobFormatters";
import { isPipelineOperationalJob } from "../../utils/jobStatusRules";
import { toast } from "../../shared/utils/toast";
import { buildAnalysisDecisionToast } from "./analysisDispatchFeedback";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NewCandidateFormErrors = {
  fullName?: string;
  email?: string;
  cpf?: string;
  form?: string;
};

function canLinkToJob(job: Job | null): boolean {
  return isPipelineOperationalJob(job?.status);
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
  const {
    jobs,
    jobsError,
    jobsLoading,
    loadJobs,
    notifyCandidatesChanged,
    invalidateBoard,
  } = usePipeline();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<NewCandidateFormErrors>({});
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );
  const selectableJobs = useMemo(
    () => jobs.filter((job) => isPipelineOperationalJob(job.status)),
    [jobs],
  );

  const selectedJobCanReceiveCandidates = canLinkToJob(selectedJob);
  const uploadStatusText = resumeFile
    ? `Currículo selecionado: ${resumeFile.name}`
    : "Você pode anexar o currículo agora ou depois no drawer do candidato.";

  function resetForm() {
    setFullName("");
    setEmail("");
    setPhone("");
    setCpf("");
    setCity("");
    setSource("");
    setInternalNotes("");
    setResumeFile(null);
    setSelectedJobId(defaultJobId ?? "");
    setLoading(false);
    setErrors({});
    setDuplicate(null);
  }

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
  }, [defaultJobId, isOpen]);

  useEffect(() => {
    if (!isOpen || jobsLoading || jobsError || jobs.length > 0) return;
    void loadJobs();
  }, [isOpen, jobs.length, jobsError, jobsLoading, loadJobs]);

  if (!isOpen) return null;

  function toFriendlyText(error: unknown, defaultMessage: string): string {
    const detail = formatErrorDetails(handleApiError(error)).join(" ");
    return detail || defaultMessage;
  }

  function clearDuplicate(field?: keyof NewCandidateFormErrors) {
    if (duplicate) setDuplicate(null);
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
    cpfValue: string | undefined;
  } | null {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const cpfValue = cpf.trim();
    const nextErrors: NewCandidateFormErrors = {};

    if (!trimmedName) {
      nextErrors.fullName = "Nome é obrigatório";
    }
    if (!trimmedEmail) {
      nextErrors.email = "E-mail é obrigatório";
    } else if (!EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Informe um e-mail válido";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }

    setErrors({});
    return { trimmedName, trimmedEmail, trimmedPhone, cpfValue: cpfValue || undefined };
  }

  async function handleSave(addToJob: boolean) {
    const validated = validateForm();
    if (!validated) return;

    const { trimmedName, trimmedEmail, trimmedPhone, cpfValue } = validated;

    setLoading(true);
    setErrors({});
    setDuplicate(null);
    feedback.createCandidate.processing();

    try {
      const check = await candidatesService.checkDuplicate(
        trimmedEmail,
        cpfValue,
      );

      if (check.exists && check.candidate_id) {
        setDuplicate({
          id: check.candidate_id,
          full_name: check.full_name ?? "Candidato existente",
        });
        setErrors({
          form: "Já existe um candidato com este email/CPF",
        });
        setLoading(false);
        return;
      }

      // Concatenar fonte e observações
      const notes = [
        source ? `Fonte: ${source}` : "",
        internalNotes ? `Observações:\n${internalNotes}` : ""
      ].filter(Boolean).join("\n\n");

      const candidate = await candidatesService.create({
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        cpf: cpfValue,
        location_city: city || undefined,
        internal_notes: notes || undefined,
      });

      // Upload de currículo se houver
      if (resumeFile) {
        try {
          const uploadInit = await resumeService.initiateUpload(candidate.id);
          await resumeService.uploadPdf(uploadInit.resume_id, resumeFile);
          toast.success("Currículo enviado, extração em andamento.");
        } catch (err: unknown) {
          toast.error("Candidato criado, mas falhou ao enviar o currículo.");
        }
      }

      notifyCandidatesChanged();

      let linkedToJob = false;
      // Vínculo com vaga (apenas se solicitado explicitamente)
      if (addToJob && selectedJob && selectedJobCanReceiveCandidates) {
        try {
          const linkResult = await pipelineService.addCandidateToJob(candidate.id, {
            job_id: selectedJob.id,
            initial_stage: "entry",
          });
          const analysisToast = buildAnalysisDecisionToast(linkResult.analysis);
          if (analysisToast) {
            if (analysisToast.tone === "success") toast.success(analysisToast.message);
            if (analysisToast.tone === "info") toast.info(analysisToast.message);
            if (analysisToast.tone === "warning") toast.warning(analysisToast.message);
            if (analysisToast.tone === "error") toast.error(analysisToast.message);
          }
          await invalidateBoard(selectedJob.id, true);
          linkedToJob = true;
        } catch (err: unknown) {
          toast.error("Candidato criado, mas falhou ao vinculá-lo à vaga selecionada.");
        }
      }

      feedback.createCandidate.success(
        linkedToJob && selectedJob
          ? `Candidato adicionado à vaga ${selectedJob.title}`
          : "Candidato cadastrado com sucesso (Aguardando vaga)",
      );

      try {
        await onCreated(candidate.id);
      } catch (err: unknown) {
        console.error("Failed in onCreated", err);
      }

      if (keepOpen) {
        resetForm();
      } else {
        onClose();
      }
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          setErrors({ form: "Já existe um candidato com este email/CPF" });
          return;
        }
        if (err.status === 422) {
          setErrors({ form: "Dados inválidos. Revise os campos." });
          return;
        }
      }
      setErrors({
        form: toFriendlyText(err, "Não foi possível criar o candidato."),
      });
    } finally {
      setLoading(false);
    }
  }

  const selectedJobLabel = selectedJob
    ? `${selectedJob.title} · ${formatJobStatus(selectedJob.status)}`
    : "Sem vaga selecionada";

  return (
    <Modal
      title="Cadastrar Candidato"
      onClose={onClose}
      contentClassName="sm:max-w-[720px]"
    >
      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-5 p-6 max-h-[70vh] overflow-y-auto">
        <div className="space-y-1">
          <p className="text-sm text-[hsl(var(--text-muted))]">
            Foque no cadastro inicial. O vínculo com vaga e a análise IA podem continuar depois, no drawer do candidato.
          </p>
        </div>

        {!selectedJobId && (
          <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] px-4 py-3">
            <p className="text-sm font-medium text-[hsl(var(--warning))]">Aviso</p>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Este candidato será criado sem vaga ativa e ficará com status <strong>Aguardando vaga</strong>.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Nome */}
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Nome completo *</span>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
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

          {/* E-mail */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">E-mail *</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
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

          {/* Telefone */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Telefone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* CPF */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">CPF (opcional)</span>
            <input
              type="text"
              value={cpf}
              onChange={(e) => {
                setCpf(e.target.value);
                clearDuplicate("cpf");
              }}
              placeholder="Digite qualquer valor"
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.cpf
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-[hsl(var(--border))] focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.cpf ? <span className="text-xs text-red-600">{errors.cpf}</span> : null}
          </label>

          {/* Cidade */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Cidade</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: São Paulo"
              className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* Fonte do Candidato */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Fonte do candidato</span>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Ex: LinkedIn, Indicação..."
              className="h-10 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* Currículo */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Currículo / Anexo</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-[hsl(var(--text))] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[hsl(var(--primary))] file:text-white hover:file:bg-[hsl(var(--primary))]/90"
            />
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Status do currículo
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--text))]">
                {resumeFile ? "Currículo pronto para envio" : "Currículo opcional neste momento"}
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                {uploadStatusText}
              </p>
            </div>
          </div>

          {/* Observações Internas */}
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Observações internas</span>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Anotações sobre o candidato..."
              className="h-24 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {/* Vaga (Opcional) */}
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Vaga (opcional para vínculo)</span>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={loading}
              className="ui-input h-10 rounded-lg px-3 text-sm disabled:opacity-50"
            >
              <option value="">Sem vaga</option>
              {selectableJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} - {formatJobStatus(job.status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {errors.form ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.form}
          </p>
        ) : null}

        {duplicate ? (
          <div className="rounded-xl border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning-soft))] p-4">
            <p className="text-sm font-semibold text-[hsl(var(--warning))]">
              Já existe um candidato com este email/CPF: <strong>{duplicate.full_name}</strong>
            </p>
            <p className="mt-1 text-sm text-[hsl(var(--warning))]">
              Deseja abrir o perfil do candidato existente?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onCreated(duplicate.id);
                  onClose();
                }}
                className="rounded-lg bg-[hsl(var(--warning))] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[hsl(var(--warning))]/90"
              >
                Abrir candidato existente
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <div className="flex items-center gap-2 mr-auto">
            <input
              type="checkbox"
              id="keepOpen"
              checked={keepOpen}
              onChange={(e) => setKeepOpen(e.target.checked)}
              className="h-4 w-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]"
            />
            <label htmlFor="keepOpen" className="text-sm font-medium text-[hsl(var(--text-muted))]">
              Cadastrar outro
            </label>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))]"
          >
            Cancelar
          </button>
          
          {/* Botão Principal: Salvar candidato (sem vaga) */}
          <button
            type="button"
            onClick={() => void handleSave(false)}
            disabled={loading || Boolean(duplicate)}
            className="rounded-lg border border-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))]/5 disabled:opacity-40"
          >
            {loading ? "Processando…" : "Salvar candidato"}
          </button>

          {/* Botão Secundário: Salvar e adicionar à vaga */}
          <button
            type="button"
            onClick={() => void handleSave(true)}
            disabled={loading || !selectedJobId || !selectedJobCanReceiveCandidates || Boolean(duplicate)}
            className="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
            title={!selectedJobId ? "Selecione uma vaga para habilitar" : ""}
          >
            {loading ? "Processando…" : "Salvar e adicionar à vaga"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
