"use client";

import { useEffect, useState } from "react";
import {
  createPackage,
  getPackageByCaseId,
  approvePackage,
  cancelPackage,
  downloadJson,
  downloadCsv,
} from "../../../../services/admissionPackageService";
import type { PreAdmissionStatus, AdmissionPackage } from "../../../../types/domain";
import { AdmissionPackagePreview } from "./AdmissionPackagePreview";
import { AdmissionPackageValidationList } from "./AdmissionPackageValidationList";
import { ErpDryRunPanel } from "./ErpDryRunPanel";

interface Props {
  caseId: string;
  caseStatus: PreAdmissionStatus;
}

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

export function AdmissionPackagePanel({ caseId, caseStatus }: Props) {
  const [pkg, setPkg] = useState<AdmissionPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load package on mount (only if case is ready)
  useEffect(() => {
    if (caseStatus !== "ready_for_admission") {
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getPackageByCaseId(caseId);
        setPkg(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar pacote");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, caseStatus]);

  const handleCreate = async () => {
    try {
      setSaving(true);
      setError(null);
      const data = await createPackage(caseId);
      setPkg(data);
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
      setPkg(data);
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
      setPkg(data);
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
      // Refresh to get updated status (exported)
      const updated = await getPackageByCaseId(caseId);
      setPkg(updated);
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
      // Refresh to get updated status (exported)
      const updated = await getPackageByCaseId(caseId);
      setPkg(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar CSV");
    } finally {
      setSaving(false);
    }
  };

  // If case is not ready, don't show anything
  if (caseStatus !== "ready_for_admission") {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-center">
          <div className="text-sm text-gray-600">Carregando...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Pacote de Admissão</h3>
        <p className="text-sm text-gray-600">
          Gere e exporte o pacote de dados para ERP manual
        </p>
      </div>

      {!pkg ? (
        // No package yet
        <button
          onClick={handleCreate}
          disabled={saving}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Gerando..." : "Gerar Pacote de Admissão"}
        </button>
      ) : pkg.status === "draft" ? (
        // Draft with errors
        <>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              Pacote com erros de validação. Corrija as pendências antes de prosseguir.
            </p>
          </div>
          {pkg.validation_errors && (
            <AdmissionPackageValidationList errors={pkg.validation_errors} />
          )}
        </>
      ) : pkg.status === "ready_for_review" ? (
        // Ready for review
        <>
          <AdmissionPackagePreview payload={pkg.payload} />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Aprovando..." : "Aprovar Pacote"}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Cancelando..." : "Cancelar"}
            </button>
          </div>
        </>
      ) : pkg.status === "approved_for_export" ? (
        // Approved, ready to export
        <>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">Pacote aprovado. Você pode exportar agora.</p>
          </div>
          <AdmissionPackagePreview payload={pkg.payload} readOnly />
          <div className="flex gap-2">
            <button
              onClick={handleDownloadJson}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Exportar JSON"}
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Exportar CSV"}
            </button>
          </div>
        </>
      ) : pkg.status === "exported" ? (
        // Exported
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-800">
              Pacote exportado em {formatDateTime(pkg.exported_at)}
            </p>
          </div>
          <AdmissionPackagePreview payload={pkg.payload} readOnly />
          <div className="flex gap-2">
            <button
              onClick={handleDownloadJson}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Baixar JSON"}
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? "Exportando..." : "Baixar CSV"}
            </button>
          </div>
        </>
      ) : pkg.status === "cancelled" ? (
        // Cancelled
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            Pacote cancelado em {formatDateTime(pkg.cancelled_at)}
          </p>
        </div>
      ) : null}

      {pkg ? <ErpDryRunPanel pkg={pkg} /> : null}
    </section>
  );
}
