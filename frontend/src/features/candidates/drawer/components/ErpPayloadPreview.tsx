"use client";

import type { ErpDryRunPayloadPreview } from "../../../../types/domain";

interface ErpPayloadPreviewProps {
  payload: ErpDryRunPayloadPreview;
}

function maskEmail(value?: string | null): string {
  if (!value) return "-";
  const [localPart, domain] = value.split("@");
  if (!domain) return "Informado";
  const visible = localPart.slice(0, 1) || "*";
  return `${visible}***@${domain}`;
}

function maskCpf(value?: string | null): string {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  const suffix = digits.slice(-2);
  return suffix ? `***.***.***-${suffix.padStart(2, "*")}` : "Informado";
}

function summarizeSensitiveValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return "Informado";
}

export function ErpPayloadPreview({ payload }: ErpPayloadPreviewProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted/35 p-4">
      <div className="text-sm font-semibold text-text">Preview do Payload Protheus (dry-run)</div>
      <div className="grid gap-2 text-sm text-text-muted sm:grid-cols-2">
        <div><span className="font-medium">Nome:</span> {payload.candidate.name || "-"}</div>
        <div><span className="font-medium">Email:</span> {maskEmail(payload.candidate.email)}</div>
        <div><span className="font-medium">CPF:</span> {maskCpf(payload.candidate.cpf)}</div>
        <div><span className="font-medium">Vaga:</span> {payload.job.title || "-"}</div>
        <div><span className="font-medium">Início:</span> {payload.admission.start_date || "-"}</div>
        <div><span className="font-medium">Salário:</span> {summarizeSensitiveValue(payload.admission.salary_offer)}</div>
      </div>
      <details
        data-testid="erp-payload-advanced"
        className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900"
      >
        <summary className="cursor-pointer font-semibold text-amber-950">
          Ver payload técnico
        </summary>
        <p className="mt-2 text-xs font-medium">
          Informação técnica. Não compartilhe externamente.
        </p>
        <pre
          data-testid="erp-payload-raw-json"
          className="mt-3 max-h-64 overflow-auto rounded border border-amber-100 bg-white p-3 text-xs text-slate-800"
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
