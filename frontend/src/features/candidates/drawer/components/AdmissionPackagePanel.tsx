"use client";

import { useEffect, useState } from "react";
import {
  approvePackage,
  cancelPackage,
  createPackage,
  downloadCsv,
  downloadJson,
  getPackageByCaseId,
} from "../../../../services/admissionPackageService";
import type { AdmissionPackage, PreAdmissionStatus } from "../../../../types/domain";
import { AdmissionPackagePreview } from "./AdmissionPackagePreview";
import { AdmissionPackageValidationList } from "./AdmissionPackageValidationList";

interface Props {
  caseId: string;
  caseStatus: PreAdmissionStatus;
  onPackageChange?: (pkg: AdmissionPackage | null) => void;
}

const packageStatusLabels: Record<AdmissionPackage["status"], string> = {
  draft: "Com validações pendentes",
  ready_for_review: "Pronto para revisão",
  approved_for_export: "Aprovado para exportação",
  exported: "Exportado",
  cancelled: "Cancelado",
};

function formatDateTime(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdmissionPackagePanel({ caseId, caseStatus, onPackageChange }: Props) {
  const [pkg, setPkg] = useState<AdmissionPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caseIsReady = caseStatus === "ready_for_admission";
  const summaryLabel = !caseIsReady
    ? "Pacote pendente"
    : pkg
      ? packageStatusLabels[pkg.status]
      : "Pacote não gerado";

  const publishPackage = (nextPackage: AdmissionPackage | null) => {
    setPkg(nextPackage);
    onPackageChange?.(nextPackage);
  };

  useEffect(() => {
    if (!caseIsReady) {
      publishPackage(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getPackageByCaseId(caseId);
        if (!cancelled) {
          publishPackage(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar pacote");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId, caseIsReady]);

  const handleCreate = async () => {
    try {
      setSaving(true);
      setError(null);
      const data = await createPackage(caseId);
      publishPackage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar pacote");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!pkg) return;
    try {
      setSaving(true);
      setError(null);
      const data = await approvePackage(pkg.id);
      publishPackage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar pacote");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!pkg) return;
    try {
      setSaving(true);
      setError(null);
      const data = await cancelPackage(pkg.id, "Cancelado pelo usuário");
      publishPackage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cancelar pacote");
    } finally {
      setSaving(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = async () => {
    if (!pkg) return;
    try {
      setSaving(true);
      setError(null);
      const blob = await downloadJson(pkg.id);
      triggerDownload(blob, `admission-package-${pkg.id}.json`);
      const updated = await getPackageByCaseId(caseId);
      publishPackage(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar JSON");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!pkg) return;
    try {
      setSaving(true);
      setError(null);
      const blob = await downloadCsv(pkg.id);
      triggerDownload(blob, `admission-package-${pkg.id}.csv`);
      const updated = await getPackageByCaseId(caseId);
      publishPackage(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar CSV");
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
          Pacote admissional
        </p>
        <h3 className="text-base font-semibold text-[hsl(var(--text))]">Pacote de Admissão</h3>
        <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
          Gere, revise e exporte os dados admissionais antes da integração Protheus.
        </p>
      </div>
      <span className="inline-flex w-fit rounded-lg border border-[hsl(var(--primary))]/15 bg-[hsl(var(--accent-soft))] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--brand-dark))]">
        {summaryLabel}
      </span>
    </div>
  );

  if (!caseIsReady) {
    return (
      <section
        data-testid="admission-package-panel"
        className="admission-embedded-card space-y-4 p-4"
      >
        {header}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Pacote pendente: conclua a liberação operacional antes de gerar o pacote admissional.
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section
        data-testid="admission-package-panel"
        className="admission-embedded-card space-y-4 p-4"
      >
        {header}
        <div className="flex items-center justify-center">
          <div className="text-sm text-[hsl(var(--text-muted))]">Carregando...</div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        data-testid="admission-package-panel"
        className="admission-embedded-card space-y-4 p-4"
      >
        {header}
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="admission-package-panel"
      className="admission-embedded-card space-y-4 p-4"
    >
      {header}

      {!pkg ? (
        <button
          onClick={handleCreate}
          disabled={saving}
          className="ui-btn-primary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Gerando..." : "Gerar Pacote de Admissão"}
        </button>
      ) : pkg.status === "draft" ? (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Pacote com erros de validação. Corrija as pendências antes de prosseguir.
            </p>
          </div>
          {pkg.validation_errors ? (
            <AdmissionPackageValidationList errors={pkg.validation_errors} />
          ) : null}
        </>
      ) : pkg.status === "ready_for_review" ? (
        <>
          <AdmissionPackagePreview payload={pkg.payload} />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleApprove}
              disabled={saving}
              className="ui-btn-primary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Aprovando..." : "Aprovar Pacote"}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Cancelando..." : "Cancelar"}
            </button>
          </div>
        </>
      ) : pkg.status === "approved_for_export" ? (
        <>
          <div className="rounded-lg border border-[hsl(var(--success))]/25 bg-[hsl(var(--success-soft))] p-4">
            <p className="text-sm text-[hsl(var(--success))]">Pacote aprovado. Você pode exportar agora.</p>
          </div>
          <AdmissionPackagePreview payload={pkg.payload} readOnly />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadJson}
              disabled={saving}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Exportar JSON"}
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={saving}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
        </>
      ) : pkg.status === "exported" ? (
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">
              Pacote exportado em {formatDateTime(pkg.exported_at)}
            </p>
          </div>
          <AdmissionPackagePreview payload={pkg.payload} readOnly />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadJson}
              disabled={saving}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Baixar JSON"}
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={saving}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Baixar CSV"}
            </button>
          </div>
        </>
      ) : pkg.status === "cancelled" ? (
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/45 p-4">
          <p className="text-sm text-[hsl(var(--text-muted))]">
            Pacote cancelado em {formatDateTime(pkg.cancelled_at)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
