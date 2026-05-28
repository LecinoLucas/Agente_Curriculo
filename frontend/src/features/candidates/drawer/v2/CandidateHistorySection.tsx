import { type MutableRefObject, useEffect, useMemo, useState } from "react";
import type { CandidateOverview, CandidatePipelineHistory } from "../../../../types/domain";
import { pipelineService } from "../../../../services/pipelineService";
import { STAGE_LABEL } from "../../utils/profile";

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Movido manualmente",
  auto_match: "Entrada automática",
  system: "Movido pelo sistema",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

interface CandidateHistorySectionProps {
  overview: CandidateOverview;
  activeJobId: string | null;
  cacheRef: MutableRefObject<Map<string, CandidatePipelineHistory>>;
  isOpen: boolean;
  onToggle: () => void;
}

export function CandidateHistorySection({
  overview,
  activeJobId,
  cacheRef,
  isOpen,
  onToggle,
}: CandidateHistorySectionProps) {
  const [history, setHistory] = useState<CandidatePipelineHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const currentEntry = useMemo(
    () =>
      activeJobId
        ? overview.pipeline_entries.find((entry) => entry.job_id === activeJobId) ?? null
        : null,
    [activeJobId, overview.pipeline_entries],
  );

  useEffect(() => {
    if (!activeJobId || !isOpen) {
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `${overview.candidate.id}:${activeJobId}:${currentEntry?.updated_at ?? "none"}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setHistory(cached);
      return () => {
        cancelled = true;
      };
    }

    setHistoryLoading(true);

    void pipelineService
      .getCandidateHistory(activeJobId, overview.candidate.id)
      .then((result) => {
        if (cancelled) return;
        cacheRef.current.set(cacheKey, result);
        setHistory(result);
      })
      .catch(() => {
        if (cancelled) return;
        setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJobId, isOpen, overview.candidate.id, currentEntry?.updated_at, cacheRef]);

  if (!activeJobId) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted px-4 py-3">
        <p className="text-sm text-text-muted">Sem histórico — candidato não vinculado a vaga</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-surface-muted/30"
      >
        <h3 className="font-semibold text-text">Histórico do Pipeline</h3>
        <span className={`text-sm font-semibold text-text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border/20 px-6 py-4">
          {historyLoading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-surface-muted/40" />
              ))}
            </div>
          ) : history && history.transitions && history.transitions.length > 0 ? (
            <div className="space-y-2">
              {history.transitions.map((event, idx) => (
                <div key={idx} className="rounded-lg bg-surface-muted/30 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-text">
                        {STAGE_LABEL[event.to_stage] ?? event.to_stage}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {TRIGGER_LABEL[event.trigger] ?? event.trigger}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs font-medium text-text-muted">
                      {formatDateTime(event.moved_at)}
                    </time>
                  </div>
                  {event.reason && (
                    <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
                      {event.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Sem eventos no histórico</p>
          )}
        </div>
      )}
    </div>
  );
}
