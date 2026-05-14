"use client";

import { useEffect, useMemo, useState } from "react";

import type { AdmissionPackage, ErpIntegrationAttempt } from "../../../../types/domain";
import {
  createProtheusDryRunAttempt,
  createProtheusHomologAttempt,
  listErpAttempts,
  simulateErpAttempt,
} from "../../../../services/admissionPackageService";
import { ErpPayloadPreview } from "./ErpPayloadPreview";
import { ErpIntegrationAttemptList } from "./ErpIntegrationAttemptList";

interface ErpDryRunPanelProps {
  pkg: AdmissionPackage;
}

const ALLOWED_PACKAGE_STATUSES = new Set(["approved_for_export", "exported"]);

export function ErpDryRunPanel({ pkg }: ErpDryRunPanelProps) {
  const [attempts, setAttempts] = useState<ErpIntegrationAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowed = ALLOWED_PACKAGE_STATUSES.has(pkg.status);
  const latestAttempt = useMemo(() => attempts[0] ?? null, [attempts]);
  const canSimulate = latestAttempt?.status === "ready" || latestAttempt?.status === "failed";
  const canSendHomolog = latestAttempt?.status === "simulated" || latestAttempt?.status === "sent";

  useEffect(() => {
    if (!isAllowed) {
      setAttempts([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await listErpAttempts(pkg.id);
        if (!cancelled) {
          setAttempts(data.attempts);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar tentativas ERP");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isAllowed, pkg.id]);

  const handlePrepare = async () => {
    try {
      setSaving(true);
      setError(null);
      const attempt = await createProtheusDryRunAttempt(pkg.id);
      setAttempts((prev) => [attempt, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao preparar simulação");
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async () => {
    if (!latestAttempt) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await simulateErpAttempt(latestAttempt.id);
      setAttempts((prev) => [updated, ...prev.filter((attempt) => attempt.id !== updated.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao simular envio");
    } finally {
      setSaving(false);
    }
  };

  const handleSendHomolog = async () => {
    try {
      setSaving(true);
      setError(null);
      const attempt = await createProtheusHomologAttempt(pkg.id);
      setAttempts((prev) => [attempt, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar para homologação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div>
        <h4 className="text-base font-semibold text-slate-900">Simulação Protheus</h4>
        <p className="text-sm text-slate-600">
          Modo dry-run auditável para validar payload e simular integração ERP.
        </p>
      </div>

      {!isAllowed ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Pacote precisa estar aprovado para exportação antes da simulação Protheus.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrepare}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Preparando..." : "Preparar simulação Protheus"}
            </button>
            <button
              type="button"
              onClick={handleSimulate}
              disabled={!canSimulate || saving}
              className="inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? "Simulando..." : "Simular envio"}
            </button>
            <button
              type="button"
              onClick={handleSendHomolog}
              disabled={!canSendHomolog || saving}
              className="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Enviando..." : "Enviar para homologação"}
            </button>
          </div>

          {loading ? <p className="text-sm text-slate-600">Carregando tentativas...</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          {latestAttempt ? (
            <>
              <ErpPayloadPreview payload={latestAttempt.request_payload_json} />
              {latestAttempt.validation_errors_json?.length ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="mb-2 text-sm font-medium text-red-800">Erros de validação</p>
                  <ul className="space-y-1 text-sm text-red-700">
                    {latestAttempt.validation_errors_json.map((err) => (
                      <li key={`${err.field}-${err.message}`}>
                        {err.field}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {latestAttempt.status === "simulated" ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <div>
                    Simulação concluída ({latestAttempt.response_payload_json?.external_reference || "sem referência"}).
                  </div>
                  <div>Nenhum dado foi enviado ao ERP.</div>
                </div>
              ) : null}
              {latestAttempt.status === "sent" && latestAttempt.mode === "real" ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <div>
                    Enviado para Protheus homologação ({latestAttempt.external_reference || "sem referência"}).
                  </div>
                  <div className="mt-1">Dados foram enviados ao Protheus em modo homologação.</div>
                </div>
              ) : null}
            </>
          ) : null}

          <ErpIntegrationAttemptList attempts={attempts} />
        </>
      )}
    </section>
  );
}
