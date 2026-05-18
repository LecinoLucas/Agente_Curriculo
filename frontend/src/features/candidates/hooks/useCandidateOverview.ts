import { useCallback, useEffect, useState } from "react";

import { candidatesService } from "../../../services/candidatesService";
import { HttpError } from "../../../services/http";
import type { CandidateOverview } from "../../../types/domain";

export type UseCandidateOverviewState = {
  overview: CandidateOverview | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  reload: () => Promise<void>;
};

export function useCandidateOverview(candidateId: string | null): UseCandidateOverviewState {
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!candidateId) return;

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const data = await candidatesService.getOverview(candidateId);
      setOverview(data);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        setNotFound(true);
        setOverview(null);
      } else {
        setError(err instanceof Error ? err.message : "Falha ao carregar candidato.");
      }
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (candidateId) {
      void load();
      return;
    }

    setOverview(null);
    setError(null);
    setNotFound(false);
  }, [candidateId, load]);

  return { overview, loading, error, notFound, reload: load };
}
