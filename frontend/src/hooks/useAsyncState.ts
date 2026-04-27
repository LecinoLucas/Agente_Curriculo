import { useCallback, useRef, useState } from "react";

export function useAsyncState<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestSeqRef = useRef(0);

  const run = useCallback(async (task: () => Promise<T>) => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await task();
      if (requestSeqRef.current === requestId) {
        setData(result);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível concluir a solicitação.";
      if (requestSeqRef.current === requestId) {
        setError(message);
      }
      throw err;
    } finally {
      if (requestSeqRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  return { data, error, loading, setData, run };
}
