"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { formatContextError } from "../../services/errorMessages";
import { admissionWorkspaceService } from "../../services/admissionWorkspaceService";
import type { ProtheusExportQueueItem, ProtheusExportQueuePreflight } from "../../types/domain";
import {
  canShowExportButton,
  getErrorCodeLabel,
  getPayloadStatusLabel,
  getQueueStatusDescription,
  getQueueStatusLabel,
  getQueueStatusTone,
} from "./protheusExportStatus";
import { AdmissionSectionCard } from "./components/AdmissionSectionCard";

type PendingErrorPayload = {
  pending_requirements?: string[];
};

type Props = {
  caseId: string;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function AdmissionProtheusExportQueuePanel({ caseId }: Props) {
  const [item, setItem] = useState<ProtheusExportQueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingRequirements, setPendingRequirements] = useState<string[]>([]);
  const [preflight, setPreflight] = useState<ProtheusExportQueuePreflight | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await admissionWorkspaceService.getLatestProtheusExportRequest(caseId);
      setItem(result);
      setPreflight(null);
      setPendingRequirements(result.pending_requirements ?? []);
    } catch (err: unknown) {
      const isNotFound =
        err != null &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 404;
      if (isNotFound) {
        try {
          setItem(null);
          const preflightResult = await admissionWorkspaceService.preflightProtheusExportRequest(caseId);
          setPreflight(preflightResult);
          setPendingRequirements(preflightResult.pending_requirements ?? []);
        } catch (preflightErr) {
          setError(
            formatContextError(
              preflightErr,
              "Não foi possível carregar o preflight da exportação.",
              "Recarregue o workspace ou contate o suporte.",
            ),
          );
        }
      } else {
        setError(
          formatContextError(
            err,
            "Não foi possível carregar o status da fila de exportação.",
            "Recarregue o workspace ou contate o suporte.",
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setActing(true);
    setActionError(null);
    try {
      const result = await admissionWorkspaceService.createProtheusExportRequest(caseId);
      setItem(result.export_request);
      setPreflight(null);
      setPendingRequirements(result.export_request.pending_requirements ?? []);
    } catch (err) {
      const typed = err as { status?: number; data?: PendingErrorPayload };
      const pending = Array.isArray(typed?.data?.pending_requirements)
        ? typed.data.pending_requirements.filter((item) => typeof item === "string")
        : [];
      if (typed?.status === 422 && pending.length > 0) {
        setPendingRequirements(pending);
        setPreflight((current) => ({
          payload_status: "incomplete",
          payload_status_label: current?.payload_status_label ?? "Payload incompleto",
          pending_requirements: pending,
          shape_debug: current?.shape_debug ?? null,
          safe_error_code: current?.safe_error_code ?? null,
          safe_error_message: current?.safe_error_message ?? null,
          can_enqueue: false,
          is_stub_mode: current?.is_stub_mode ?? true,
          disclaimer: current?.disclaimer ?? null,
        }));
      }
      setActionError(
        formatContextError(
          err,
          "Não foi possível solicitar exportação.",
          "Verifique se a bridge está disponível.",
        ),
      );
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    if (!item) return;
    setActing(true);
    setActionError(null);
    try {
      const result = await admissionWorkspaceService.cancelProtheusExportRequest(caseId, item.id);
      setItem(result);
    } catch (err) {
      setActionError(
        formatContextError(
          err,
          "Não foi possível cancelar a solicitação.",
          "Verifique se a solicitação ainda pode ser cancelada.",
        ),
      );
    } finally {
      setActing(false);
    }
  }

  async function handleRequestNew() {
    setActing(true);
    setActionError(null);
    try {
      const result = await admissionWorkspaceService.requestNewProtheusExportRequest(caseId);
      setItem(result.export_request);
      setPreflight(null);
      setPendingRequirements(result.export_request.pending_requirements ?? []);
    } catch (err) {
      setActionError(
        formatContextError(
          err,
          "Não foi possível solicitar uma nova exportação segura.",
          "Verifique se o caso ainda permite nova solicitação.",
        ),
      );
    } finally {
      setActing(false);
    }
  }

  if (loading && !item) {
    return (
      <AdmissionSectionCard
        eyebrow="Exportação ERP"
        title="Fila de Exportação Protheus"
        description="Carregando status da fila de exportação."
      >
        <div className="space-y-3">
          <div className="h-5 w-36 animate-pulse rounded bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
        </div>
      </AdmissionSectionCard>
    );
  }

  if (error) {
    return (
      <AdmissionSectionCard
        eyebrow="Exportação ERP"
        title="Fila de Exportação Protheus"
        description="Status da fila de exportação para o ERP Protheus."
      >
        <EmptyState
          icon="⚠️"
          title="Indisponível"
          description={error}
          action={{ label: "Tentar novamente", onClick: () => void load() }}
        />
      </AdmissionSectionCard>
    );
  }

  return (
    <AdmissionSectionCard
      eyebrow="Exportação ERP"
      title="Fila de Exportação Protheus"
      description="Gerencie a solicitação de exportação do candidato para o ERP Protheus via bridge STUB."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || acting}
          className="border border-border bg-surface text-text hover:bg-surface-muted transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
          Atualizar status
        </button>
      }
    >
      <div className="space-y-4" data-testid="admission-protheus-export-queue-panel">
        {(item?.is_stub_mode || preflight?.is_stub_mode) ? (
          <div
            className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
            data-testid="stub-mode-banner"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Envio real ao Protheus está bloqueado neste ambiente
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">
                Todas as operações são realizadas em modo seguro (STUB). Nenhum cadastro real foi executado.
              </p>
            </div>
          </div>
        ) : null}

        {item == null ? (
          <>
            <EmptyState
              icon="📤"
              title="Nenhuma solicitação de exportação"
              description={
                pendingRequirements.length > 0
                  ? "Existem pendências antes de enfileirar a exportação Protheus."
                  : "Solicite a exportação para enfileirar este candidato na bridge Protheus."
              }
            />
            {preflight ? (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                    Status do payload
                  </p>
                  <p className="text-sm font-medium text-text">
                    {getPayloadStatusLabel(preflight.payload_status, preflight.payload_status_label)}
                  </p>
                </div>
                {preflight.disclaimer ? (
                  <p className="mt-2 text-xs text-text-muted">{preflight.disclaimer}</p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div
              className={[
                "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
                getQueueStatusTone(item.status),
              ].join(" ")}
            >
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em]">Status</p>
                <p className="mt-1 text-sm font-semibold">
                  {getQueueStatusLabel(item.status, item.status_label)}
                </p>
                {item.unit_name ? (
                  <p className="text-xs text-current/80">Unidade: {item.unit_name}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-current/20 bg-white/40 px-2.5 py-1 text-[11px] font-semibold">
                    {item.is_stub_mode ? "STUB / dry-run seguro" : "Somente leitura"}
                  </span>
                  {item.payload_status ? (
                    <span className="inline-flex rounded-full border border-current/20 bg-white/40 px-2.5 py-1 text-[11px] font-semibold">
                      {getPayloadStatusLabel(item.payload_status, item.payload_status_label)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="text-right text-xs">
                <p>
                  Tentativas: {item.attempt_count} / {item.max_attempts}
                </p>
                <p className="mt-1">Ultima tentativa: {formatDateTime(item.finished_at ?? item.updated_at)}</p>
                {item.next_attempt_at != null ? (
                  <p className="mt-1">Próximo retry: {formatDateTime(item.next_attempt_at)}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                Detalhes
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">ID solicitação</dt>
                  <dd className="font-mono text-xs font-medium text-text">{item.id}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Criado em</dt>
                  <dd className="font-medium text-text">{formatDateTime(item.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Atualizado em</dt>
                  <dd className="font-medium text-text">{formatDateTime(item.updated_at)}</dd>
                </div>
                {item.finished_at != null ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Finalizado em</dt>
                    <dd className="font-medium text-text">{formatDateTime(item.finished_at)}</dd>
                  </div>
                ) : null}
                {item.last_trace_id != null ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Último trace ID</dt>
                    <dd className="font-mono text-xs font-medium text-text">{item.last_trace_id}</dd>
                  </div>
                ) : null}
                {item.last_error_code != null ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-text-muted">Código de erro</dt>
                    <dd className="font-medium text-red-600">{getErrorCodeLabel(item.last_error_code)}</dd>
                    <dd className="font-mono text-[11px] text-red-400 opacity-70">{item.last_error_code}</dd>
                  </div>
                ) : null}
                {item.last_error_message_redacted != null ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-text-muted">Mensagem de erro (redacted)</dt>
                    <dd className="rounded bg-surface-muted/50 p-2 font-mono text-xs text-text">
                      {item.last_error_message_redacted}
                    </dd>
                  </div>
                ) : null}
                {item.payload_status ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Status do payload</dt>
                    <dd className="font-medium text-text">
                      {getPayloadStatusLabel(item.payload_status, item.payload_status_label)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {getQueueStatusDescription(item.status, item.recommended_action) ? (
              <div className="rounded-xl border border-border bg-surface-muted/35 p-4 text-sm text-text">
                <p className="font-semibold">Ação recomendada</p>
                <p className="mt-1 text-text-muted">
                  {getQueueStatusDescription(item.status, item.recommended_action)}
                </p>
              </div>
            ) : null}
          </>
        )}

        {pendingRequirements.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Pendências antes da exportação</p>
            <ul className="mt-2 list-disc pl-5" data-testid="protheus-pending-requirements">
              {pendingRequirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {actionError != null ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {actionError}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {item == null ? (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={
                acting ||
                !canShowExportButton({
                  payloadStatus: preflight?.payload_status,
                  canEnqueue: preflight?.can_enqueue,
                })
              }
              className="bg-[hsl(var(--primary))] text-white hover:opacity-90 transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            >
              {acting ? "Solicitando..." : "Solicitar exportação Protheus"}
            </button>
          ) : null}

          {item?.can_request_new ? (
            <button
              type="button"
              onClick={() => void handleRequestNew()}
              disabled={acting}
              className="border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/15 transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            >
              {acting ? "Solicitando..." : "Solicitar nova exportação segura"}
            </button>
          ) : null}

          {item?.can_cancel ? (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={acting}
              className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            >
              {acting ? "Cancelando..." : "Cancelar solicitação"}
            </button>
          ) : null}
        </div>

        {item?.is_stub_mode && item.disclaimer != null ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-muted/25 p-4">
            <p className="text-xs text-text-muted">{item.disclaimer}</p>
          </div>
        ) : null}
      </div>
    </AdmissionSectionCard>
  );
}
