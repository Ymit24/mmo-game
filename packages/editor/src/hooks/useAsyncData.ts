import { useCallback, useEffect, useReducer, useRef, useState } from "react";

interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Use a reducer as a stable signal to re-trigger the effect.
  const [trigger, bump] = useReducer((n: number) => n + 1, 0);
  const refetch = useCallback(() => bump(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger drives refetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trigger]);

  return { data, loading, error, refetch };
}
