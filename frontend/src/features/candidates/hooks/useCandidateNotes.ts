import { useCallback, useEffect, useState } from "react";

import { candidatesService } from "../../../services/candidatesService";
import type { CandidateNote } from "../../../types/domain";

export type UseCandidateNotesState = {
  notes: CandidateNote[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useCandidateNotes(candidateId: string | null): UseCandidateNotesState {
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!candidateId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await candidatesService.listNotes(candidateId);
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as observações.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (candidateId) {
      void load();
      return;
    }

    setNotes([]);
    setError(null);
  }, [candidateId, load]);

  return { notes, loading, error, reload: load };
}
