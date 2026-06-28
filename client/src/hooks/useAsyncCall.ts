import { useState, useCallback } from 'react';

type CallResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

interface AsyncCallState<T> {
  loading: boolean;
  result: T | null;
  error: string | null;
}

function useAsyncCall<T = unknown>() {
  const [state, setState] = useState<AsyncCallState<T>>({
    loading: false,
    result: null,
    error: null,
  });

  const call = useCallback(async (fn: () => Promise<T>): Promise<CallResult<T>> => {
    setState({ loading: true, result: null, error: null });
    try {
      const data = await fn();
      setState({ loading: false, result: data, error: null });
      return { data, error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setState({ loading: false, result: null, error: msg });
      return { data: null, error: msg };
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, result: null, error: null });
  }, []);

  return { ...state, call, reset };
}

function useDiscriminatedAsyncCall<T extends string>() {
  const [loading, setLoading] = useState<T | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (label: T, fn: () => Promise<unknown>): Promise<CallResult<unknown>> => {
    setError(null);
    setResult(null);
    setLoading(label);
    try {
      const data = await fn();
      setResult(data);
      return { data, error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setLoading(null);
    }
  }, []);

  const reset = useCallback(() => {
    setLoading(null);
    setResult(null);
    setError(null);
  }, []);

  return { loading, result, error, call, reset };
}

export { useAsyncCall, useDiscriminatedAsyncCall };
export type { CallResult };
