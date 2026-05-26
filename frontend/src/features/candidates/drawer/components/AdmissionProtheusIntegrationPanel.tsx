"use client";

import type { AdmissionPackage, PreAdmissionStatus } from "../../../../types/domain";
import { ErpDryRunPanel } from "./ErpDryRunPanel";

interface AdmissionProtheusIntegrationPanelProps {
  caseStatus: PreAdmissionStatus;
  pkg: AdmissionPackage | null;
  highlight?: boolean;
}

const packageStatusLabels: Record<AdmissionPackage["status"], string> = {
  draft: "Com validações pendentes",
  ready_for_review: "Pronto para revisão",
  approved_for_export: "Aprovado para exportação",
  exported: "Exportado",
  cancelled: "Cancelado",
};

function getSummaryLabel(caseStatus: PreAdmissionStatus, pkg: AdmissionPackage | null): string {
  if (caseStatus !== "ready_for_admission") return "Exportação pendente";
  if (!pkg) return "Pacote não gerado";
  return packageStatusLabels[pkg.status];
}

export function AdmissionProtheusIntegrationPanel({
  caseStatus,
  pkg,
  highlight = false,
}: AdmissionProtheusIntegrationPanelProps) {
  const caseIsReady = caseStatus === "ready_for_admission";
  const summaryLabel = getSummaryLabel(caseStatus, pkg);

  return (
    <section
      id="pre-admission-protheus-section"
      data-testid="pre-admission-protheus-section"
      className={[
        "scroll-mt-24 space-y-4 rounded-xl border bg-white p-4 shadow-sm",
        highlight
          ? "border-[hsl(var(--primary))]/35 ring-2 ring-[hsl(var(--primary))]/10"
          : "border-[hsl(var(--border))]",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
            Integração Protheus
          </p>
          <h3 className="text-base font-semibold text-[hsl(var(--text))]">Painel técnico ERP</h3>
          <p className="mt-1 text-sm text-[hsl(var(--text-muted))]">
            Dry-run, homologação e tentativas ficam isolados nesta área.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--text-muted))]">
          {summaryLabel}
        </span>
      </div>

      {!caseIsReady ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Exportação pendente</p>
          <p className="mt-1">Conclua as etapas admissionais antes de enviar ao Protheus.</p>
        </div>
      ) : null}

      {caseIsReady && !pkg ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Gere o pacote admissional antes de preparar dry-run ou envio para homologação.
        </div>
      ) : null}

      {pkg ? <ErpDryRunPanel pkg={pkg} /> : null}
    </section>
  );
}
