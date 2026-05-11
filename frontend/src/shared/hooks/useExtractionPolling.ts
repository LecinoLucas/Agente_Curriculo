import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ResumeExtractionStatusResponse } from "../../types/domain";
import { resumeService } from "../../services/resumeService";
import { isExtractionInProgress } from "../utils/extractionStatus";

type ExtractionPollingCallback = (
  itemId: string,
  status: ResumeExtractionStatusResponse,
) => void | Promise<void>;

interface UseExtractionPollingParams {
  items: string[];
  enabled: boolean;
  intervalMs?: number;
  onItemUpdate?: ExtractionPollingCallback;
  onCompleted?: ExtractionPollingCallback;
  onFailed?: ExtractionPollingCallback;
}

interface UseExtractionPollingResult {
  statuses: Record<string, ResumeExtractionStatusResponse>;
  isPolling: boolean;
  hasPending: boolean;
  refresh: () => void;
  stop: () => void;
}

export function useExtractionPolling({
  items,
  enabled,
  intervalMs = 2500,
  onItemUpdate,
  onCompleted,
  onFailed,
}: UseExtractionPollingParams): UseExtractionPollingResult {
  const [statuses, setStatuses] = useState<Record<string, ResumeExtractionStatusResponse>>({});
  const [isPolling, setIsPolling] = useState(false);

  const timerRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const notifiedTerminalIdsRef = useRef<Set<string>>(new Set());

  const itemsKey = useMemo(
    () => Array.from(new Set(items.filter((item) => item.trim().length > 0))).join("\u0000"),
    [items],
  );

  const normalizedItems = useMemo(
    () => (itemsKey ? itemsKey.split("\u0000") : []),
    [itemsKey],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    runIdRef.current += 1;
    clearTimer();
    setIsPolling(false);
  }, [clearTimer]);

  const executePoll = useCallback(async () => {
    if (!enabled || normalizedItems.length === 0) {
      stop();
      return;
    }

    const currentRunId = ++runIdRef.current;
    setIsPolling(true);

    const responses = await Promise.all(
      normalizedItems.map(async (itemId) => {
        try {
          const status = await resumeService.getExtractionStatus(itemId);
          return [itemId, status] as const;
        } catch {
          return null;
        }
      }),
    );

    if (currentRunId !== runIdRef.current) {
      return;
    }

    const nextStatuses: Record<string, ResumeExtractionStatusResponse> = {};
    const pendingIds = new Set<string>();

    for (const entry of responses) {
      if (entry === null) {
        pendingIds.add("__request_error__");
        continue;
      }

      const [itemId, status] = entry;
      nextStatuses[itemId] = status;
      await onItemUpdate?.(itemId, status);

      if (isExtractionInProgress(status.extraction_status)) {
        pendingIds.add(itemId);
        continue;
      }

      if (!notifiedTerminalIdsRef.current.has(itemId)) {
        notifiedTerminalIdsRef.current.add(itemId);
        if (status.extraction_status === "completed") {
          await onCompleted?.(itemId, status);
        } else if (status.extraction_status === "failed") {
          await onFailed?.(itemId, status);
        }
      }
    }

    setStatuses((current) => ({
      ...current,
      ...nextStatuses,
    }));

    if (pendingIds.size > 0) {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        void executePoll();
      }, intervalMs);
      return;
    }

    clearTimer();
    setIsPolling(false);
  }, [
    clearTimer,
    enabled,
    intervalMs,
    normalizedItems,
    onCompleted,
    onFailed,
    onItemUpdate,
    stop,
  ]);

  const refresh = useCallback(() => {
    clearTimer();
    void executePoll();
  }, [clearTimer, executePoll]);

  const hasPending = enabled && normalizedItems.some((itemId) => {
    const status = statuses[itemId]?.extraction_status;
    return status === undefined || isExtractionInProgress(status);
  });

  useEffect(() => {
    setStatuses((current) => {
      const next: Record<string, ResumeExtractionStatusResponse> = {};
      for (const itemId of normalizedItems) {
        if (current[itemId]) {
          next[itemId] = current[itemId];
        }
      }
      return next;
    });
    notifiedTerminalIdsRef.current = new Set(
      normalizedItems.filter((itemId) => notifiedTerminalIdsRef.current.has(itemId)),
    );
  }, [normalizedItems]);

  useEffect(() => {
    if (!enabled || normalizedItems.length === 0) {
      stop();
      return;
    }

    void executePoll();

    return () => {
      stop();
    };
  }, [enabled, executePoll, normalizedItems, stop]);

  return {
    statuses,
    isPolling,
    hasPending,
    refresh,
    stop,
  };
}
