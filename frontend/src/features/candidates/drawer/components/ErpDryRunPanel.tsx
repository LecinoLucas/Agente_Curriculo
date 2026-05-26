"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  AdmissionPackage,
  ErpIntegrationAttempt,
  ProtheusCapabilities,
} from "../../../../types/domain";
import {
  createProtheusDryRunAttempt,
  createProtheusHomologAttempt,
  createProtheusMockAttempt,
  getProtheusCapabilities,
  listErpAttempts,
  simulateErpAttempt,
} from "../../../../services/admissionPackageService";
import { ErpPayloadPreview } from "./ErpPayloadPreview";
import { ErpIntegrationAttemptList } from "./ErpIntegrationAttemptList";

interface ErpDryRunPanelProps {
  pkg: AdmissionPackage;
  capabilities?: ProtheusCapabilities | null;
}

const ALLOWED_PACKAGE_STATUSES = new Set(["approved_for_export", "exported"]);

function sanitizeErpMessage(value: string): string {
  return value
    .replace(/\{[\s\S]*\}/g, "[detalhes técnicos omitidos]")
    .replace(/\[[\s\S]*\]/g, "[detalhes técnicos omitidos]")
    .slice(0, 240);
}

function labelForAttemptStatus(status: ErpIntegrationAttempt["status"]): string {
  if (status === "validation_failed") return "Falha de validação";
  if (status === "ready") return "Pronto para simulação";
  if (status === "simulated") return "Simulado";
  if (status === "failed") return "Falhou";
  if (status === "sent") return "Enviado";
  return "Rascunho";
}

function getResponseText(attempt: ErpIntegrationAttempt | null, key: string): string | null {
  const value = attempt?.response_payload_json?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function labelForAttemptMode(mode: ErpIntegrationAttempt["mode"]): string {
  if (mode === "real") return "Homologação";
  if (mode === "mock") return "Mock";
  return "Dry-run";
}

export function ErpDryRunPanel({ pkg, capabilities: providedCapabilities }: ErpDryRunPanelProps) {
  const [attempts, setAttempts] = useState<ErpIntegrationAttempt[]>([]);
  const [loadedCapabilities, setLoadedCapabilities] = useState<ProtheusCapabilities | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCapabilities, setLoadingCapabilities] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);

  const isAllowed = ALLOWED_PACKAGE_STATUSES.has(pkg.status);
  const capabilities =
    providedCapabilities !== undefined ? providedCapabilities : loadedCapabilities;
  const latestAttempt = useMemo(() => attempts[0] ?? null, [attempts]);
  const dryRunAvailable = Boolean(capabilities?.dry_run.available);
  const simulationAvailable = Boolean(capabilities?.simulation.available);
  const mockAvailable = Boolean(capabilities?.mock.available);
  const realSendAvailable = Boolean(capabilities?.real_send.available);
  const canSimulate =
    simulationAvailable && (latestAttempt?.status === "ready" || latestAttempt?.status === "failed");
  const canSendHomolog =
    realSendAvailable && (latestAttempt?.status === "simulated" || latestAttempt?.status === "sent");
  const latestExternalReference = getResponseText(latestAttempt, "external_reference");
  const latestCorrelationId = getResponseText(latestAttempt, "correlation_id");

  useEffect(() => {
    if (!isAllowed) {
      setLoadedCapabilities(null);
      return;
    }
    if (providedCapabilities !== undefined) {
      setLoadedCapabilities(null);
      setCapabilityError(null);
      return;
    }

    let cancelled = false;
    const loadCapabilities = async () => {
      try {
        setLoadingCapabilities(true);
        setCapabilityError(null);
        const data = await getProtheusCapabilities();
        if (!cancelled) {
          setLoadedCapabilities(data);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadedCapabilities(null);
          setCapabilityError(
            err instanceof Error
              ? sanitizeErpMessage(err.message)
              : "Não foi possível carregar capacidades Protheus",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCapabilities(false);
        }
      }
    };

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [isAllowed, providedCapabilities]);

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
          setError(err instanceof Error ? sanitizeErpMessage(err.message) : "Erro ao carregar tentativas ERP");
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
    if (!dryRunAvailable) {
      setError(capabilities?.dry_run.disabled_reason ?? "Dry-run Protheus indisponível.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const attempt = await createProtheusDryRunAttempt(pkg.id);
      setAttempts((prev) => [attempt, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? sanitizeErpMessage(err.message) : "Erro ao preparar simulação");
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = async () => {
    if (!latestAttempt) return;
    if (!simulationAvailable) {
      setError(capabilities?.simulation.disabled_reason ?? "Simulação Protheus indisponível.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const updated = await simulateErpAttempt(latestAttempt.id);
      setAttempts((prev) => [updated, ...prev.filter((attempt) => attempt.id !== updated.id)]);
    } catch (err) {
      setError(err instanceof Error ? sanitizeErpMessage(err.message) : "Erro ao simular envio");
    } finally {
      setSaving(false);
    }
  };

  const handleMockSend = async () => {
    if (!mockAvailable) {
      setError(capabilities?.mock.disabled_reason ?? "Mock Protheus indisponível.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const attempt = await createProtheusMockAttempt(pkg.id);
      setAttempts((prev) => [attempt, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? sanitizeErpMessage(err.message) : "Erro ao executar mock Protheus");
    } finally {
      setSaving(false);
    }
  };

  const handleSendHomolog = async () => {
    if (!realSendAvailable) {
      setError(
        capabilities?.real_send.disabled_reason ??
          "Envio real/homologação bloqueado até validação explícita do provider.",
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const attempt = await createProtheusHomologAttempt(pkg.id);
      setAttempts((prev) => [attempt, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? sanitizeErpMessage(err.message) : "Erro ao enviar para homologação");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admission-embedded-card space-y-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-muted))]">
          Protheus
        </p>
        <h4 className="mt-1 text-base font-semibold text-[hsl(var(--text))]">Simulação Protheus</h4>
        <p className="text-sm text-[hsl(var(--text-muted))]">
          Modo dry-run auditável para validar payload e simular integração ERP.
        </p>
      </div>

      {!isAllowed ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Pacote precisa estar aprovado para exportação antes da simulação Protheus.
        </div>
      ) : (
        <>
          <div className="admission-row grid gap-3 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Ambiente
              </p>
              <p className="mt-1 font-semibold text-[hsl(var(--text))]">
                {capabilities?.environment ?? (loadingCapabilities ? "Carregando..." : "Indisponível")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Dry-run
              </p>
              <p className={dryRunAvailable ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-amber-800"}>
                {dryRunAvailable ? "Disponível" : "Bloqueado"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Mock
              </p>
              <p className={mockAvailable ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-amber-800"}>
                {mockAvailable ? "Disponível" : "Bloqueado"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                Envio real
              </p>
              <p className={realSendAvailable ? "mt-1 font-semibold text-emerald-700" : "mt-1 font-semibold text-amber-800"}>
                {realSendAvailable ? "Disponível" : "Bloqueado"}
              </p>
            </div>
          </div>

          {capabilityError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Capabilities Protheus indisponíveis. Envio real permanecerá bloqueado. {capabilityError}
            </div>
          ) : null}

          {!realSendAvailable && capabilities?.real_send.disabled_reason ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {capabilities.real_send.disabled_reason}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrepare}
              disabled={!dryRunAvailable || loadingCapabilities || saving}
              className="ui-btn-primary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Preparando..." : "Preparar simulação Protheus"}
            </button>
            <button
              type="button"
              onClick={handleSimulate}
              disabled={!canSimulate || saving}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Simulando..." : "Simular envio"}
            </button>
            <button
              type="button"
              onClick={handleMockSend}
              disabled={!mockAvailable || saving}
              title={capabilities?.mock.disabled_reason ?? undefined}
              className="ui-btn-secondary inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Executando..." : "Executar mock"}
            </button>
            <button
              type="button"
              onClick={handleSendHomolog}
              disabled={!canSendHomolog || saving}
              title={
                realSendAvailable
                  ? undefined
                  : capabilities?.real_send.disabled_reason ??
                    "Envio real/homologação bloqueado até validação explícita do provider."
              }
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-300 bg-amber-100 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-50"
            >
              {saving ? "Enviando..." : "Enviar para homologação"}
            </button>
          </div>

          {!realSendAvailable ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Envio real/homologação está bloqueado por capability backend. Use dry-run e simulação para validar payload e histórico.
            </div>
          ) : null}

          {loading ? <p className="text-sm text-[hsl(var(--text-muted))]">Carregando tentativas...</p> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          {latestAttempt ? (
            <>
              <div className="admission-row p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--text-muted))]">
                      Última tentativa
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[hsl(var(--text))]">
                      {labelForAttemptStatus(latestAttempt.status)}
                    </p>
                  </div>
                  <span className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/50 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--text-muted))]">
                    {labelForAttemptMode(latestAttempt.mode)}
                  </span>
                </div>
                {latestExternalReference || latestCorrelationId ? (
                  <div className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-muted))]/35 px-3 py-2 text-xs text-[hsl(var(--text-muted))]">
                    <p className="font-semibold text-[hsl(var(--text))]">Dados técnicos da tentativa</p>
                    {latestExternalReference ? (
                      <p className="mt-1">Referência externa: {latestExternalReference}</p>
                    ) : null}
                    {latestCorrelationId ? (
                      <p className="mt-1">Correlation ID: {latestCorrelationId}</p>
                    ) : null}
                  </div>
                ) : null}
                {latestAttempt.error_message ? (
                  <p className="mt-2 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-700">
                    {sanitizeErpMessage(latestAttempt.error_message)}
                  </p>
                ) : null}
              </div>
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
                    Simulação concluída ({latestExternalReference || "sem referência"}).
                  </div>
                  <div>Nenhum dado foi enviado ao ERP.</div>
                </div>
              ) : null}
              {latestAttempt.status === "sent" && latestAttempt.mode === "real" ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <div>
                    Enviado para Protheus homologação ({latestExternalReference || "sem referência"}).
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
