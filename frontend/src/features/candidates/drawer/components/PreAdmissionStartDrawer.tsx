import { CheckCircle2, ClipboardList, FileText, History, ShieldAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { HttpError } from "../../../../services/http";
import { formatContextError } from "../../../../services/errorMessages";

export type PreAdmissionStartDrawerResult = {
  caseId: string;
  reusedExistingCase?: boolean;
};

type PreAdmissionStartDrawerProps = {
  open: boolean;
  candidateName?: string | null;
  jobTitle?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<PreAdmissionStartDrawerResult>;
  onSuccess?: (result: PreAdmissionStartDrawerResult) => void | Promise<void>;
};

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[hsl(var(--text))]">{value}</p>
    </div>
  );
}

function CreationItem({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-4 py-3">
      <div className="mt-0.5 text-[hsl(var(--primary))]">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-[hsl(var(--text))]">{title}</p>
        <p className="mt-1 text-xs text-[hsl(var(--text-muted))]">{description}</p>
      </div>
    </div>
  );
}

export function PreAdmissionStartDrawer({
  open,
  candidateName,
  jobTitle,
  onClose,
  onConfirm,
  onSuccess,
}: PreAdmissionStartDrawerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreAdmissionStartDrawerResult | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError(null);
      setResult(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, submitting]);

  if (!open || typeof document === "undefined") return null;

  const handleConfirm = async () => {
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = await onConfirm();
      if (onSuccess) {
        await onSuccess(payload);
      } else {
        setResult(payload);
      }
    } catch (requestError) {
      if (requestError instanceof HttpError && requestError.status === 403) {
        setError("Acesso restrito ao RH.");
      } else {
        setError(
          formatContextError(
            requestError,
            "Não foi possível criar o caso admissional.",
            "Tente novamente em alguns instantes.",
          ),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const successMessage = result?.reusedExistingCase
    ? "Já existia um caso admissional ativo para este candidato. O painel foi recarregado com o caso existente."
    : "O caso admissional foi criado. O painel de pré-admissão já está pronto para continuar o processo.";

  return createPortal(
    <div className="fixed inset-0 z-[1100]">
      <button
        type="button"
        aria-label="Fechar drawer"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-admission-start-drawer-title"
        data-testid="pre-admission-start-drawer"
        className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-2xl shadow-black/30"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-6 py-5">
          <div>
            <h2
              id="pre-admission-start-drawer-title"
              className="text-lg font-semibold text-[hsl(var(--text))]"
            >
              Iniciar pré-admissão
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
              Confirme os dados antes de abrir o caso admissional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-[hsl(var(--text-muted))] transition hover:bg-[hsl(var(--surface-muted))] hover:text-[hsl(var(--text))] disabled:opacity-40"
            aria-label="Fechar drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {result ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {result.reusedExistingCase ? "Caso admissional já disponível" : "Caso admissional criado"}
                  </p>
                  <p className="mt-1 text-sm text-emerald-700">{successMessage}</p>
                </div>
              </div>
            </section>
          ) : (
            <>
              {error ? (
                <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 text-red-600" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Não foi possível concluir a criação</p>
                      <p className="mt-1 text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="grid gap-3">
                <DetailCard label="Candidato" value={candidateName ?? "Candidato selecionado"} />
                <DetailCard label="Vaga" value={jobTitle ?? "Vaga ativa"} />
                <DetailCard label="Decisão final" value="Contratar" />
              </section>

              <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-5 py-4">
                <p className="text-sm font-semibold text-[hsl(var(--text))]">
                  Esta ação criará o caso admissional para iniciar checklist, documentos e integração.
                </p>
                <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">
                  O caso será criado apenas uma vez e passa a centralizar checklist, documentos e histórico operacional.
                </p>
              </section>

              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                  O que será criado
                </p>
                <div className="mt-3 space-y-3">
                  <CreationItem
                    icon={<ClipboardList className="h-4 w-4" />}
                    title="Caso admissional"
                    description="Registro principal para acompanhar a evolução da pré-admissão."
                  />
                  <CreationItem
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    title="Checklist inicial"
                    description="Itens operacionais básicos para validação documental e readiness."
                  />
                  <CreationItem
                    icon={<FileText className="h-4 w-4" />}
                    title="Área de documentos"
                    description="Espaço para upload, aprovação e correção dos documentos admissionais."
                  />
                  <CreationItem
                    icon={<History className="h-4 w-4" />}
                    title="Histórico de eventos"
                    description="Linha do tempo das ações executadas no caso admissional."
                  />
                </div>
              </section>
            </>
          )}
        </div>

        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))] px-6 py-4">
          {result ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[hsl(var(--border))] px-4 text-sm font-semibold text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface))]"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white transition hover:opacity-95"
              >
                Ir para pré-admissão
              </button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[hsl(var(--border))] px-4 text-sm font-semibold text-[hsl(var(--text))] transition hover:bg-[hsl(var(--surface))] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirm();
                }}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Criando caso admissional..." : "Criar caso admissional"}
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
