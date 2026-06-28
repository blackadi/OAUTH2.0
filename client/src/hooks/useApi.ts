import { useState, useCallback } from 'react';

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: (...args: unknown[]) => Promise<T | undefined>;
  reset: () => void;
}

export function useApi<T>(
  apiFn: (...args: unknown[]) => Promise<T>,
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  const execute = useCallback(
    async (...args: unknown[]) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await apiFn(...args);
        setState({ data: result, error: null, loading: false });
        return result;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Request failed';
        setState((prev) => ({ ...prev, error: message, loading: false }));
        return undefined;
      }
    },
    [apiFn],
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false });
  }, []);

  return { ...state, execute, reset };
}
