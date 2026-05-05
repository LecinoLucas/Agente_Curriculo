import { AnalysisGlobalItem } from "../../../types/domain";
import { STATUS_CONFIG, fmtDate, fmtDuration } from "../utils/analysisFormatters";

interface AnalysisRowProps {
  item: AnalysisGlobalItem;
  actionInFlight: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onForceFail: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, cls: "ui-badge-neutral" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="ui-text-muted text-xs">—</span>;
  const r = Math.round(score);
  const cls =
    r >= 80
      ? "font-semibold text-[hsl(var(--success))]"
      : r >= 60
        ? "font-semibold text-[hsl(var(--warning))]"
        : "font-semibold text-[hsl(var(--danger))]";
  return <span className={`text-sm ${cls}`}>{r}</span>;
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
}: AnalysisRowProps) {
  const isFailed = item.status === "failed";
  const isStuck = item.status === "pending" || item.status === "processing";
  const hasCandidate = Boolean(item.candidate_id);

  return (
    <tr className="group transition-colors hover:bg-[hsl(var(--surface-muted))]">
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

      {/* Score */}
      <td className="px-4 py-4">
        <ScoreCell score={item.overall_score} />
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
          {hasCandidate ? (
            <button
              type="button"
              onClick={onOpen}
              className="ui-btn-secondary rounded-lg px-2.5 py-1 text-xs font-medium"
            >
              Abrir
            </button>
          ) : null}
          {isStuck ? (
            <button
              type="button"
              onClick={onForceFail}
              disabled={actionInFlight}
              className="rounded-lg border border-[hsl(var(--danger))]/40 px-2.5 py-1 text-xs font-medium text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10 disabled:opacity-40"
            >
              {actionInFlight ? "Encerrando…" : "Encerrar"}
            </button>
          ) : null}
          {isFailed ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={actionInFlight}
              className="rounded-lg bg-[hsl(var(--primary))] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[hsl(var(--primary))]/90 disabled:opacity-40"
            >
              {actionInFlight ? "Reprocessando…" : "Reprocessar"}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
