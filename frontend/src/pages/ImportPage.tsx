import { FormEvent, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  FileText,
  Loader2,
  RotateCcw,
  UserCheck,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/common/PageHeader";
import { LinkCandidateJobModal } from "../features/candidates/components/LinkCandidateJobModal";
import { candidatesService } from "../services/candidatesService";
import { formatContextError } from "../services/errorMessages";
import { HttpError } from "../services/http";
import { resumeService } from "../services/resumeService";
import { useExtractionPolling } from "../shared/hooks/useExtractionPolling";
import {
  type ExtractionStatus,
  getExtractionStatusLabel,
} from "../shared/utils/extractionStatus";

type ImportItem = {
  id: string;
  resumeId?: string;
  candidateId?: string;
  candidateName: string;
  fileName: string;
  extractionStatus: ExtractionStatus;
  errorMessage?: string;
};

type LinkTarget = {
  candidateId: string;
  candidateName: string;
};

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB — keeps client-side hint in sync with backend cap

function getStatusAccent(status: ExtractionStatus): string {
  if (status === "completed") return "border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/20";
  if (status === "failed") return "border-rose-100 bg-rose-50/50 dark:border-rose-900/20";
  return "border-amber-100 bg-amber-50/50 dark:border-amber-900/20";
}

function getStatusBadge(status: ExtractionStatus): string {
  if (status === "completed") return "bg-emerald-500 text-white";
  if (status === "failed") return "bg-rose-500 text-white";
  return "bg-amber-500 text-white";
}

function getStatusIcon(status: ExtractionStatus) {
  if (status === "completed") return <UserCheck className="h-4 w-4" />;
  if (status === "failed") return <X className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

// Map backend error responses to a short, user-facing string. The backend
// returns ``detail: "..."`` (string) for candidate/resume errors; we match by
// status + keyword instead of a structured ``code``.
function describeBackendError(err: unknown, fallback: string): string {
  if (err instanceof HttpError) {
    const detail = typeof err.detail === "string" ? err.detail : "";
    if (err.status === 409) {
      if (detail.toLowerCase().includes("e-mail")) {
        return "Já existe um candidato com este e-mail.";
      }
      if (detail.toLowerCase().includes("cpf")) {
        return "Já existe um candidato com este CPF.";
      }
    }
    if (err.status === 413) {
      return "Arquivo muito grande. Limite: 10 MB.";
    }
    if (err.status === 422) {
      if (detail.toLowerCase().includes("candidate_id")) {
        return "Selecione ou cadastre um candidato antes de enviar o currículo.";
      }
      if (detail) return detail;
    }
    if (detail) return detail;
  }
  return formatContextError(err, fallback);
}

export function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // When the backend rejects creation with 409 (duplicate email/CPF) we look
  // up the existing candidate so the user can open it without leaving the page.
  const [existingCandidateId, setExistingCandidateId] = useState<string | null>(null);

  const pendingResumeIds = items
    .filter(
      (item) =>
        (item.extractionStatus === "pending" || item.extractionStatus === "processing") &&
        typeof item.resumeId === "string",
    )
    .map((item) => item.resumeId!);

  useExtractionPolling({
    items: pendingResumeIds,
    enabled: pendingResumeIds.length > 0,
    intervalMs: 2500,
    onItemUpdate: (resumeId, status) => {
      setItems((current) =>
        current.map((item) =>
          item.resumeId === resumeId
            ? {
                ...item,
                extractionStatus: status.extraction_status,
                errorMessage:
                  status.extraction_status === "failed"
                    ? status.extraction_error || getExtractionStatusLabel("failed")
                    : undefined,
              }
            : item,
        ),
      );
    },
  });

  function resetForm() {
    setFullName("");
    setEmail("");
    setPhone("");
    setCpf("");
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function validateForm(): string | null {
    if (!fullName.trim()) return "Informe o nome completo.";
    if (!email.trim()) return "Informe o e-mail.";
    if (!file) return "Selecione ou cadastre um candidato antes de enviar o currículo. Anexe um PDF.";
    if (file.type !== "application/pdf") return "Apenas arquivos PDF são permitidos.";
    if (file.size > MAX_PDF_BYTES) return "Arquivo muito grande. Limite: 10 MB.";
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }
    setFormError(null);
    setExistingCandidateId(null);
    setSubmitting(true);

    let createdCandidateId: string | null = null;
    let createdCandidateName = fullName.trim();

    try {
      // Step 1 — create candidate. If this fails (e.g. duplicate), DO NOT call
      // /resumes so we never create an orphan upload.
      const candidate = await candidatesService.create({
        full_name: fullName.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(cpf.trim() ? { cpf: cpf.trim() } : {}),
      });
      createdCandidateId = candidate.id;
      createdCandidateName = candidate.full_name || createdCandidateName;
    } catch (err) {
      setFormError(describeBackendError(err, "Não foi possível criar o candidato."));
      // On 409 duplicate, ask the search endpoint for the existing candidate
      // so the user can open it directly. Best-effort; failure is ignored.
      if (err instanceof HttpError && err.status === 409) {
        try {
          const found = await candidatesService.checkDuplicate(
            email.trim() || undefined,
            cpf.trim() || undefined,
          );
          if (found.exists && found.candidate_id) {
            setExistingCandidateId(found.candidate_id);
          }
        } catch {
          // ignore — keep the inline message but no "abrir existente" CTA.
        }
      }
      setSubmitting(false);
      return;
    }

    try {
      // Step 2 — initiate resume upload bound to the candidate we just created.
      const init = await resumeService.initiateUpload(createdCandidateId);
      // Step 3 — send the actual PDF.
      const uploaded = await resumeService.uploadPdf(init.resume_id, file!);

      const fileName = file!.name;
      setItems((current) => [
        {
          id: uploaded.resume_id,
          resumeId: uploaded.resume_id,
          candidateId: uploaded.candidate_id ?? createdCandidateId ?? undefined,
          candidateName: uploaded.candidate_full_name || createdCandidateName,
          fileName,
          extractionStatus:
            uploaded.extraction_status === "completed" ||
            uploaded.extraction_status === "failed" ||
            uploaded.extraction_status === "processing"
              ? uploaded.extraction_status
              : "pending",
        },
        ...current,
      ]);
      resetForm();
    } catch (err) {
      // Candidate exists in DB but resume upload failed. Surface a clear
      // recoverable state — user can retry the upload from candidate details.
      const message = describeBackendError(err, "Falha ao enviar o currículo.");
      setItems((current) => [
        {
          id: `${createdCandidateId}-${Date.now()}`,
          candidateId: createdCandidateId ?? undefined,
          candidateName: createdCandidateName,
          fileName: file!.name,
          extractionStatus: "failed",
          errorMessage: `${message} (Candidato já foi criado; tente reenviar o currículo a partir do perfil.)`,
        },
        ...current,
      ]);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 px-6 py-6 pb-12">
      <PageHeader
        title="Cadastrar Candidato"
        subtitle="Cadastre o candidato com dados mínimos e anexe o currículo em PDF. Cada envio cria primeiro o candidato e depois o currículo vinculado."
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,620px)]">
        <div className="space-y-6">
          <form
            onSubmit={handleSubmit}
            className="ui-card flex flex-col gap-4 rounded-[32px] p-6"
            aria-label="Cadastrar candidato"
          >
            <h3 className="text-lg font-bold">Dados do candidato</h3>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[hsl(var(--text))]">Nome completo *</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: Ana Souza"
                className="ui-input h-11 rounded-xl px-3 text-sm"
                disabled={submitting}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[hsl(var(--text))]">E-mail *</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@empresa.com"
                className="ui-input h-11 rounded-xl px-3 text-sm"
                disabled={submitting}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[hsl(var(--text))]">Telefone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                  disabled={submitting}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[hsl(var(--text))]">CPF</span>
                <input
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                  disabled={submitting}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[hsl(var(--text))]">Currículo (PDF) *</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2 text-sm text-[hsl(var(--text))] file:mr-3 file:rounded-lg file:border-0 file:bg-[hsl(var(--primary))] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                disabled={submitting}
              />
              <span className="text-[11px] text-[hsl(var(--text-muted))]">
                Apenas PDF, até 10 MB.
              </span>
            </label>

            {formError ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-900/10 dark:text-rose-200"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
                {existingCandidateId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/candidatos?candidateId=${existingCandidateId}`)}
                    className="self-start rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 transition hover:bg-rose-100"
                  >
                    Abrir candidato existente
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[hsl(var(--primary))]/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cadastrando…
                </>
              ) : (
                "Cadastrar candidato e enviar currículo"
              )}
            </button>
          </form>

          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-900 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200">
            <div className="flex gap-4">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <div>
                <h4 className="font-bold">Regras de Cadastro</h4>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm opacity-90">
                  <li>O candidato é criado primeiro; o currículo só é enviado depois.</li>
                  <li className="font-semibold text-blue-700 dark:text-blue-300">
                    Não cria pipeline automaticamente: o candidato ficará em "Aguardando Vaga".
                  </li>
                  <li>Não cria score nem análise IA durante o cadastro.</li>
                  <li>Vincular a uma vaga é uma ação manual, disponível após extração concluída.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="ui-card flex min-h-[420px] flex-col rounded-[32px] p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Cadastros recentes</h3>
              <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
                Cada arquivo mantém seu próprio status de extração.
              </p>
            </div>
            {items.length > 0 ? (
              <button
                onClick={() => setItems([])}
                className="text-xs font-semibold text-[hsl(var(--text-muted))] hover:text-[hsl(var(--text))]"
              >
                Limpar
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center opacity-40">
              <FileText className="mb-3 h-12 w-12" />
              <p className="text-sm">Nenhum cadastro nesta sessão.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Arquivo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Candidato
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Status da extração
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface))]">
                  {items.map((item) => {
                    const canViewCandidate = Boolean(item.candidateId);
                    const canLinkToJob =
                      item.extractionStatus === "completed" && Boolean(item.candidateId);

                    return (
                      <tr key={item.id} className={getStatusAccent(item.extractionStatus)}>
                        <td className="px-4 py-4 align-top">
                          <p className="font-semibold text-[hsl(var(--text))]">{item.fileName}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-[hsl(var(--text))]">{item.candidateName}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-3">
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getStatusBadge(item.extractionStatus)}`}
                            >
                              {getStatusIcon(item.extractionStatus)}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-[hsl(var(--text))]">
                                {getExtractionStatusLabel(item.extractionStatus)}
                              </p>
                              {item.errorMessage ? (
                                <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">
                                  {item.errorMessage}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            {canViewCandidate ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/candidatos?candidateId=${item.candidateId}`)}
                                className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface-muted))]"
                              >
                                Ver candidato
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : null}

                            {canLinkToJob ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setLinkTarget({
                                    candidateId: item.candidateId!,
                                    candidateName: item.candidateName,
                                  })
                                }
                                className="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-medium text-white transition hover:bg-[hsl(var(--primary))]/90"
                              >
                                Adicionar a uma vaga
                              </button>
                            ) : null}

                            {item.extractionStatus === "failed" ? (
                              <button
                                type="button"
                                disabled
                                title="Reprocessamento indisponível até a API expor um endpoint dedicado."
                                className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-medium text-[hsl(var(--text-muted))] opacity-60"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reprocessar extração
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <LinkCandidateJobModal
        isOpen={linkTarget !== null}
        candidateId={linkTarget?.candidateId ?? null}
        candidateName={linkTarget?.candidateName ?? null}
        onClose={() => setLinkTarget(null)}
      />
    </div>
  );
}
