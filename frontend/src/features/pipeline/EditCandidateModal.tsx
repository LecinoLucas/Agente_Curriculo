import { type FormEvent, useEffect, useMemo, useState } from "react";

import { candidatesService } from "../../services/candidatesService";
import { formatErrorDetails, handleApiError } from "../../services/errorHandler";
import { HttpError } from "../../services/http";
import { toast } from "../../services/toast";
import type { CandidateOverview } from "../../types/domain";

interface EditCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: CandidateOverview["candidate"] | undefined;
  onSuccess: (candidateId: string) => Promise<void> | void;
}

type EditCandidateErrors = {
  fullName?: string;
  email?: string;
  cpf?: string;
  form?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length > 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  return digits;
}

export function EditCandidateModal({
  isOpen,
  onClose,
  candidate,
  onSuccess,
}: EditCandidateModalProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<EditCandidateErrors>({});

  useEffect(() => {
    if (!isOpen || !candidate) return;
    setFullName(candidate.full_name ?? "");
    setEmail(candidate.email ?? "");
    setPhone(candidate.phone ?? "");
    setCpf(formatCpfInput(candidate.cpf ?? ""));
    setErrors({});
    setSaving(false);
  }, [candidate, isOpen]);

  const originalValues = useMemo(
    () => ({
      fullName: candidate?.full_name.trim() ?? "",
      email: candidate?.email?.trim().toLowerCase() ?? "",
      cpfDigits: (candidate?.cpf ?? "").replace(/\D/g, ""),
    }),
    [candidate],
  );

  if (!isOpen || !candidate) return null;

  function toFriendlyText(error: unknown, fallback: string): string {
    const detail = formatErrorDetails(handleApiError(error)).join(" ");
    return detail || fallback;
  }

  function validateForm() {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const cpfDigits = cpf.replace(/\D/g, "");
    const nextErrors: EditCandidateErrors = {};

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

  async function validateDuplicate(trimmedEmail: string, cpfDigits: string): Promise<boolean> {
    const emailChanged = trimmedEmail !== originalValues.email;
    const cpfChanged = cpfDigits !== originalValues.cpfDigits;
    if (!emailChanged && !cpfChanged) return true;

    const check = await candidatesService.checkDuplicate(
      emailChanged ? trimmedEmail : undefined,
      cpfChanged && cpfDigits ? cpfDigits : undefined,
    );

    if (check.exists && check.candidate_id && check.candidate_id !== candidate.id) {
      setErrors({ form: "Já existe outro candidato com este email ou CPF" });
      return false;
    }

    return true;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validated = validateForm();
    if (!validated) return;

    const { trimmedName, trimmedEmail, trimmedPhone, cpfDigits } = validated;
    setSaving(true);
    setErrors({});

    try {
      const isValidDuplicateState = await validateDuplicate(trimmedEmail, cpfDigits);
      if (!isValidDuplicateState) return;

      await candidatesService.update(candidate.id, {
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        cpf: cpfDigits || undefined,
      });

      await onSuccess(candidate.id);
      toast.success("Dados do candidato atualizados");
      onClose();
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        if (err.status === 409) {
          setErrors({ form: "Já existe outro candidato com este email ou CPF" });
          return;
        }
        if (err.status === 422) {
          setErrors({
            form: "Dados inválidos. Revise nome, e-mail e CPF antes de salvar as alterações.",
          });
          return;
        }
      }

      setErrors({
        form: toFriendlyText(err, "Não foi possível atualizar os dados do candidato. Tente novamente."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar candidato"
        className="ui-card fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--text))]">Editar candidato</h2>
            <p className="ui-text-muted mt-0.5 text-sm">
              Atualize apenas os dados cadastrais
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 rounded-lg p-1.5 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))] disabled:opacity-50"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Candidate ID
          </p>
          <p className="mt-1 break-all text-sm text-[hsl(var(--text))]">{candidate.id}</p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">Nome completo *</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setErrors((current) => ({ ...current, fullName: undefined, form: undefined }));
              }}
              placeholder="Nome do candidato"
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.fullName
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.fullName ? <span className="text-xs text-red-600">{errors.fullName}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[hsl(var(--text))]">E-mail *</span>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined, form: undefined }));
              }}
              placeholder="email@exemplo.com"
              className={[
                "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                errors.email
                  ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                  : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
              ].join(" ")}
            />
            {errors.email ? <span className="text-xs text-red-600">{errors.email}</span> : null}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[hsl(var(--text))]">Telefone</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setErrors((current) => ({ ...current, form: undefined }));
                }}
                placeholder="(11) 99999-9999"
                className="h-10 w-full rounded-lg border border-gray-200 bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[hsl(var(--text))]">CPF</span>
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(event) => {
                  setCpf(formatCpfInput(event.target.value));
                  setErrors((current) => ({ ...current, cpf: undefined, form: undefined }));
                }}
                placeholder="000.000.000-00"
                maxLength={14}
                className={[
                  "h-10 w-full rounded-lg bg-[hsl(var(--surface))] px-3 text-sm text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-muted))] outline-none focus:ring-2",
                  errors.cpf
                    ? "border border-red-300 focus:border-red-500 focus:ring-red-100"
                    : "border border-gray-200 focus:border-blue-500 focus:ring-blue-100",
                ].join(" ")}
              />
              {errors.cpf ? <span className="text-xs text-red-600">{errors.cpf}</span> : null}
            </label>
          </div>

          {errors.form ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errors.form}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
