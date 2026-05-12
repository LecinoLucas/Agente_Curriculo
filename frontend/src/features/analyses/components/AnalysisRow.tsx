import { ActionMenu } from "../../../components/common/ActionMenu";
import { AnalysisGlobalItem } from "../../../types/domain";
import { STATUS_CONFIG, fmtDate, fmtDuration } from "../utils/analysisFormatters";

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

export function AnalysisRow({
  item,
  actionInFlight,
  onOpen,
  onRetry,
  onForceFail,
  onDiscard,
}: AnalysisRowProps) {
  const isFailed = item.status === "failed";
  const isRetryScheduled = item.status === "retry_scheduled";
  const isStuck =
    item.status === "pending" || item.status === "processing" || isRetryScheduled;
  const isDiscarded = item.status === "discarded";
  const hasCandidate = Boolean(item.candidate_id);
  const actionItems = [
    hasCandidate
      ? {
          label: "Abrir",
          onClick: onOpen,
        }
      : null,
    isStuck
      ? {
          label: actionInFlight ? "Encerrando..." : "Encerrar",
          onClick: onForceFail,
          tone: "danger" as const,
          disabled: actionInFlight,
        }
      : null,
    isFailed
      ? {
          label: actionInFlight ? "Reprocessando..." : "Reprocessar",
          onClick: onRetry,
          disabled: actionInFlight,
        }
      : null,
    !isDiscarded
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
        {item.resume_file_name ? (
          <span
            className="block max-w-[180px] truncate text-xs text-[hsl(var(--text-muted))]"
            title={item.resume_file_name}
          >
            {item.resume_file_name}
          </span>
        ) : (
          <span className="ui-text-muted text-xs">—</span>
        )}
      </td>

      {/* Status + erro */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <StatusBadge status={item.status} />
          {isRetryScheduled ? (
            <span className="max-w-[240px] text-xs text-[hsl(var(--text-muted))]">
              Alta demanda no provedor IA. Tentando novamente automaticamente.
            </span>
          ) : null}
          {isFailed && item.failure_reason ? (
            <span className="max-w-[200px] truncate text-xs text-[hsl(var(--danger))]" title={item.failure_reason}>
              {item.failure_reason}
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
        <AiBadge used={item.used_real_ai} />
      </td>

      {/* Criado em */}
      <td className="ui-text-muted px-4 py-4 text-xs">{fmtDate(item.created_at)}</td>

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
