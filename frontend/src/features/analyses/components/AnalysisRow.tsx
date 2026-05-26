import { ActionMenu } from "../../../components/common/ActionMenu";
import { AnalysisGlobalItem } from "../../../types/domain";
import { STATUS_CONFIG, fmtDate, fmtDuration, formatSafeFailureReason } from "../utils/analysisFormatters";

interface AnalysisRowProps {
  item: AnalysisGlobalItem;
  actionInFlight: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onForceFail: () => void;
  onDiscard: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, cls: "ui-badge-neutral" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}

function AiBadge({ used }: { used: boolean | null }) {
  if (used === null) return <span className="ui-text-muted text-xs">—</span>;
  return used ? (
    <span className="ui-badge-info inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      IA Real
    </span>
  ) : (
    <span className="ui-badge-neutral inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      Mock
    </span>
  );
}

function TypeBadge({ type }: { type?: AnalysisGlobalItem["type"] }) {
  return (
    <span className="ui-badge-neutral inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
      {type === "behavioral_ai" ? "Comportamental" : "Currículo"}
    </span>
  );
}

export function AnalysisRow({
  item,
  actionInFlight,
  onOpen,
  onRetry,
  onForceFail,
  onDiscard,
}: AnalysisRowProps) {
  const isFailed = item.status === "failed";
  const isBehavioral = item.type === "behavioral_ai";
  const isRetryScheduled = item.status === "retry_scheduled";
  const nextRetryLabel = item.next_retry_at ? fmtDate(item.next_retry_at) : null;
  const retryDue = item.next_retry_at ? new Date(item.next_retry_at).getTime() <= Date.now() : false;
  const isStuck =
    item.status === "pending" || item.status === "processing" || isRetryScheduled;
  const isDiscarded = item.status === "discarded";
  const now = Date.now();
  const pendingForMs = now - new Date(item.created_at).getTime();
  const processingBase = item.started_at ?? item.created_at;
  const processingForMs = now - new Date(processingBase).getTime();
  const pendingStuck = item.status === "pending" && pendingForMs > 2 * 60 * 60 * 1000;
  const processingStuck = item.status === "processing" && processingForMs > 30 * 60 * 1000;
  const likelyStuck = item.stuck || pendingStuck || processingStuck;
  const safeFailureReason = formatSafeFailureReason(item.provider_error_type, item.failure_reason);
  const hasCandidate = Boolean(item.candidate_id);
  const canRetryBehavioral = isBehavioral && (isFailed || likelyStuck || (isRetryScheduled && retryDue));
  const actionItems = [
    hasCandidate
      ? {
          label: "Abrir",
          onClick: onOpen,
        }
      : null,
    isStuck && !isBehavioral
      ? {
          label: actionInFlight ? "Encerrando..." : "Encerrar",
          onClick: onForceFail,
          tone: "danger" as const,
          disabled: actionInFlight,
        }
      : null,
    (isFailed || canRetryBehavioral)
      ? {
          label: actionInFlight ? "Reprocessando..." : isBehavioral ? "Tentar novamente" : "Reprocessar",
          onClick: onRetry,
          disabled: actionInFlight,
        }
      : null,
    !isDiscarded && !isBehavioral
      ? {
          label: actionInFlight ? "Descartando..." : "Descartar análise",
          onClick: onDiscard,
          disabled: actionInFlight,
        }
      : null,
  ].filter(Boolean);

  return (
    <tr
      className={`group transition-colors hover:bg-[hsl(var(--surface-muted))] ${
        isDiscarded ? "bg-[hsl(var(--surface-muted))]/45 text-[hsl(var(--text-muted))]" : ""
      }`}
    >
      {/* Candidato */}
      <td className="px-6 py-4">
        <button
          type="button"
          disabled={!hasCandidate}
          onClick={onOpen}
          className="text-left disabled:cursor-default"
        >
          <div
            className={`font-medium leading-tight ${
              hasCandidate ? "cursor-pointer text-[hsl(var(--primary))] hover:underline" : "text-[hsl(var(--text))]"
            }`}
          >
            {item.candidate_name ?? <span className="ui-text-muted italic">Sem nome</span>}
          </div>
          {item.candidate_email ? (
            <div className="ui-text-muted mt-0.5 text-xs">{item.candidate_email}</div>
          ) : null}
        </button>
      </td>

      {/* Arquivo */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <TypeBadge type={item.type} />
          {item.type === "behavioral_ai" ? (
            <span className="block max-w-[180px] truncate text-xs text-[hsl(var(--text-muted))]" title={item.job_title ?? undefined}>
              {item.job_title ?? "Avaliação comportamental"}
            </span>
          ) : item.resume_file_name ? (
            <span
              className="block max-w-[180px] truncate text-xs text-[hsl(var(--text-muted))]"
              title={item.resume_file_name}
            >
              {item.resume_file_name}
            </span>
          ) : (
            <span className="ui-text-muted text-xs">—</span>
          )}
        </div>
      </td>

      {/* Status + erro */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <StatusBadge status={item.status} />
          {isRetryScheduled ? (
            <span className="max-w-[240px] text-xs text-[hsl(var(--text-muted))]">
              Limite temporário da IA. Nova tentativa automática
              {nextRetryLabel ? ` em ${nextRetryLabel}` : " agendada"}.
            </span>
          ) : null}
          {item.status === "waiting_extraction" ? (
            <span className="max-w-[240px] text-xs text-[hsl(var(--text-muted))]">
              A análise já foi criada e aguarda a extração do currículo.
            </span>
          ) : null}
          {likelyStuck ? (
            <span className="max-w-[260px] text-xs text-[hsl(var(--warning))]">
              A análise está demorando mais que o esperado. Verifique o worker ou tente reprocessar.
            </span>
          ) : null}
          {safeFailureReason && (isFailed || isRetryScheduled) ? (
            <span className="max-w-[240px] truncate text-xs text-[hsl(var(--danger))]" title={safeFailureReason}>
              {safeFailureReason}
            </span>
          ) : null}
          {item.retry_count > 0 ? (
            <span className="ui-text-muted text-xs">
              {item.retry_count} tentativa{item.retry_count !== 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </td>

      {/* IA real */}
      <td className="px-4 py-4">
        {item.type === "behavioral_ai" ? (
          <div className="flex flex-col gap-1">
            <span className="ui-badge-info inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium">
              {item.provider ?? "IA"}
            </span>
            <span className="max-w-[160px] truncate text-xs text-[hsl(var(--text-muted))]" title={item.model ?? undefined}>
              {item.model ?? "Modelo não informado"}
            </span>
            {item.provider_error_type ? (
              <span className="max-w-[160px] truncate text-xs text-[hsl(var(--text-muted))]">
                {item.provider_error_type}
                {item.provider_status_code ? ` · HTTP ${item.provider_status_code}` : ""}
              </span>
            ) : null}
          </div>
        ) : (
          <AiBadge used={item.used_real_ai} />
        )}
      </td>

      {/* Criado em */}
      <td className="ui-text-muted px-4 py-4 text-xs">
        <div className="flex flex-col gap-1">
          <span>{fmtDate(item.created_at)}</span>
          {item.updated_at ? <span>Atualizada: {fmtDate(item.updated_at)}</span> : null}
        </div>
      </td>

      {/* Duração */}
      <td className="ui-text-muted px-4 py-4 text-xs">
        {fmtDuration(item.started_at, item.completed_at ?? item.failed_at)}
      </td>

      {/* Ações */}
      <td className="px-4 py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <ActionMenu buttonLabel={`Ações da análise ${item.id}`} items={actionItems} />
        </div>
      </td>
    </tr>
  );
}
