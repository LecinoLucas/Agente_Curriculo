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
    return <p className="text-sm text-text-muted">Nenhuma tentativa registrada.</p>;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-text">Tentativas de Integração</h4>
      <ul className="space-y-2">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="admission-row p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-text">
                {labelForStatus(attempt.status)}
              </span>
              <span className="text-xs text-text-muted">
                {new Date(attempt.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            {attempt.response_payload_json?.external_reference ? (
              <p className="mt-1 text-xs text-text-muted">
                Referência: {attempt.response_payload_json.external_reference}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
