import { useEffect, useRef } from "react";

import { analysisService } from "../services/analysisService";
import { AnalysisStatus } from "../types/domain";

type AnalysisPollingTarget = {
  key: string;
  analysisId: string;
};

type UseAnalysisPollingOptions = {
  targets: AnalysisPollingTarget[];
  enabled?: boolean;
  intervalMs?: number;
  onStatus: (target: AnalysisPollingTarget, status: AnalysisStatus) => void | Promise<void>;
  onError?: (target: AnalysisPollingTarget, error: Error) => void | Promise<void>;
};

export function useAnalysisPolling({
  targets,
  enabled = true,
  intervalMs = 1500,
  onStatus,
  onError,
}: UseAnalysisPollingOptions) {
  const onStatusRef = useRef(onStatus);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStatusRef.current = onStatus;
    onErrorRef.current = onError;
  }, [onError, onStatus]);

  useEffect(() => {
    if (!enabled || targets.length === 0) {
      return;
    }

    let cancelled = false;
    let running = false;

    const pollStatuses = async () => {
      if (running) {
        return;
      }
      running = true;

      try {
        for (const target of targets) {
          if (cancelled) {
            return;
          }

          try {
            const status = await analysisService.status(target.analysisId);
            await onStatusRef.current(target, status);
          } catch (err) {
            if (onErrorRef.current) {
              const error =
                err instanceof Error ? err : new Error("Falha ao consultar status da análise");
              await onErrorRef.current(target, error);
            }
          }
        }
      } finally {
        running = false;
      }
    };

    void pollStatuses();
    const timer = window.setInterval(() => {
      void pollStatuses();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, targets]);
}
