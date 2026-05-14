"use client";

import type { ErpIntegrationAttempt } from "../../../../types/domain";

interface ErpIntegrationAttemptListProps {
  attempts: ErpIntegrationAttempt[];
}

function labelForStatus(status: ErpIntegrationAttempt["status"]): string {
  if (status === "validation_failed") return "Falha de validação";
  if (status === "ready") return "Pronto";
  if (status === "simulated") return "Simulado";
  if (status === "failed") return "Falhou";
  if (status === "sent") return "Enviado";
  return "Rascunho";
}

export function ErpIntegrationAttemptList({ attempts }: ErpIntegrationAttemptListProps) {
  if (attempts.length === 0) {
    return <p className="text-sm text-slate-600">Nenhuma tentativa registrada.</p>;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">Tentativas de Integração</h4>
      <ul className="space-y-2">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
                {labelForStatus(attempt.status)}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(attempt.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            {attempt.response_payload_json?.external_reference ? (
              <p className="mt-1 text-xs text-slate-700">
                Referência: {attempt.response_payload_json.external_reference}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
