import { CheckCircle2, ClipboardList, FileText, History, ShieldAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { HttpError } from "../../../../services/http";
import { formatContextError } from "../../../../services/errorMessages";
import { preAdmissionChecklistTemplatesService } from "../../../../services/preAdmissionChecklistTemplatesService";
import type { PreAdmissionChecklistTemplate } from "../../../../types/domain";

export type PreAdmissionStartDrawerResult = {
  caseId: string;
  reusedExistingCase?: boolean;
};

type PreAdmissionStartDrawerProps = {
  open: boolean;
  candidateName?: string | null;
  jobTitle?: string | null;
  onClose: () => void;
  onConfirm: (templateId: string | null) => Promise<PreAdmissionStartDrawerResult>;
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
    <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-text">{value}</p>
    </div>
  );
}

function TemplateSelector({
  loading,
  templates,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  templates: PreAdmissionChecklistTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <section className="space-y-2">
        <div className="h-3 w-36 animate-pulse rounded bg-surface-muted" />
        <div className="h-[68px] animate-pulse rounded-2xl bg-surface-muted" />
      </section>
    );
  }

  if (templates.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Checklist de documentos
        </p>
        <p className="mt-2 text-sm font-semibold text-text">
          Nenhum template ativo encontrado.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          O caso será criado sem template específico. O backend poderá aplicar o checklist padrão, se configurado.
        </p>
      </section>
    );
  }

  if (templates.length === 1) {
    const tpl = templates[0];
    return (
      <section className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Checklist de documentos
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-text">{tpl.name}</p>
          {tpl.is_default && (
            <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
              Padrão
            </span>
          )}
          <span className="text-xs text-text-muted">
            · {tpl.item_count} {tpl.item_count === 1 ? "documento" : "documentos"}
          </span>
        </div>
        {tpl.description ? (
          <p className="mt-1 text-xs text-text-muted">{tpl.description}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Checklist de documentos
      </p>
      <div className="mt-3 space-y-2">
        {templates.map((tpl) => (
          <label
            key={tpl.id}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition",
              selectedId === tpl.id
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5"
                : "border-border bg-surface-muted hover:border-[hsl(var(--primary))]/40",
            ].join(" ")}
          >
            <input
              type="radio"
              name="checklist_template"
              value={tpl.id}
              checked={selectedId === tpl.id}
              onChange={() => onSelect(tpl.id)}
              className="mt-0.5 accent-[hsl(var(--primary))]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-text">{tpl.name}</p>
                {tpl.is_default && (
                  <span className="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]">
                    Padrão
                  </span>
                )}
              </div>
              {tpl.description ? (
                <p className="mt-0.5 text-xs text-text-muted">{tpl.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-text-muted">
                {tpl.item_count} {tpl.item_count === 1 ? "documento" : "documentos"}
              </p>
            </div>
          </label>
        ))}
      </div>
    </section>
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
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3">
      <div className="mt-0.5 text-[hsl(var(--primary))]">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
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
  const [templates, setTemplates] = useState<PreAdmissionChecklistTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError(null);
      setResult(null);
      setTemplates([]);
      setSelectedTemplateId(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);

    setLoadingTemplates(true);
    preAdmissionChecklistTemplatesService
      .listTemplates()
      .then((list) => {
        const active = list.filter((t) => t.is_active);
        setTemplates(active);
        const def = active.find((t) => t.is_default) ?? active[0] ?? null;
        setSelectedTemplateId(def?.id ?? null);
      })
      .catch(() => {
        // silently fall back to backend default
      })
      .finally(() => {
        setLoadingTemplates(false);
      });

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
      const payload = await onConfirm(selectedTemplateId);
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
        className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-border bg-surface shadow-2xl shadow-black/30"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2
              id="pre-admission-start-drawer-title"
              className="text-lg font-semibold text-text"
            >
              Iniciar pré-admissão
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Confirme os dados antes de abrir o caso admissional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-40"
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

              <TemplateSelector
                loading={loadingTemplates}
                templates={templates}
                selectedId={selectedTemplateId}
                onSelect={setSelectedTemplateId}
              />

              <section className="rounded-2xl border border-border bg-surface-muted px-5 py-4">
                <p className="text-sm font-semibold text-text">
                  Esta ação criará o caso admissional para iniciar checklist, documentos e integração.
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  O caso será criado apenas uma vez e passa a centralizar checklist, documentos e histórico operacional.
                </p>
              </section>

              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
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

        <div className="border-t border-border bg-surface-muted px-6 py-4">
          {result ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text transition hover:bg-surface"
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
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
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
