"use client";

import type { ErpDryRunPayloadPreview } from "../../../../types/domain";

interface ErpPayloadPreviewProps {
  payload: ErpDryRunPayloadPreview;
}

export function ErpPayloadPreview({ payload }: ErpPayloadPreviewProps) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">Preview do Payload Protheus (dry-run)</div>
      <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div><span className="font-medium">Nome:</span> {payload.candidate.name || "-"}</div>
        <div><span className="font-medium">Email:</span> {payload.candidate.email || "-"}</div>
        <div><span className="font-medium">CPF:</span> {payload.candidate.cpf || "-"}</div>
        <div><span className="font-medium">Vaga:</span> {payload.job.title || "-"}</div>
        <div><span className="font-medium">Início:</span> {payload.admission.start_date || "-"}</div>
        <div><span className="font-medium">Salário:</span> {payload.admission.salary_offer ?? "-"}</div>
      </div>
      <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs text-slate-800">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}
