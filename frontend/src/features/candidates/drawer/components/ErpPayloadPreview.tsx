"use client";

import type { ErpDryRunPayloadPreview } from "../../../../types/domain";
import {
  maskCpf,
  maskEmail,
  redactSensitivePayload,
  summarizeSensitiveValue,
} from "../../../../shared/utils/sensitiveDataMasking";

interface ErpPayloadPreviewProps {
  payload: ErpDryRunPayloadPreview;
}

export function ErpPayloadPreview({ payload }: ErpPayloadPreviewProps) {
  const technicalPayload = redactSensitivePayload(payload);
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
          {JSON.stringify(technicalPayload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
