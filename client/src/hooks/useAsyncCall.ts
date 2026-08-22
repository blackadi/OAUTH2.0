import { useState, useCallback } from 'react';
import { HttpError, NetworkError } from '@/services/transport';

/**
 * Turn a thrown error into the string a section shows.
 *
 * The status is prefixed because it used to be nowhere: every service ended with
 * `throw new Error(await response.text())`, so `400`, `401`, `429` and `500` all arrived as the same
 * red text and a user who had tripped Authlete's ~15-call rate limit saw exactly what a user with a
 * wrong client secret saw. Prefixing here reaches all 16 sections at once, because every one of them
 * renders this string and passes it to `toast.error`.
 *
 * `WWW-Authenticate` is appended when present: at a protected resource that header *is* the error —
 * RFC 6750 §3 puts the code there rather than in the body, and RFC 9470's
 * `insufficient_user_authentication` challenge carries the `acr_values` the client must now request.
 * The full detail lives in the request trace; this is the one-line version.
 */
function describeError(e: unknown): string {
  if (e instanceof HttpError) {
    const challenge = e.headers['www-authenticate'];
    const head = `${e.status}${e.statusText ? ` ${e.statusText}` : ''}`;
    const parts = [head];
    if (challenge) parts.push(challenge);
    if (e.message) parts.push(e.message);
    return parts.join(' · ');
  }
  if (e instanceof NetworkError) return `Network error — no response received: ${e.message}`;
  return e instanceof Error ? e.message : 'Request failed';
}

type CallResult<T> = { data: T; error: null } | { data: null; error: string };

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
      const msg = describeError(e);
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

  const call = useCallback(
    async (label: T, fn: () => Promise<unknown>): Promise<CallResult<unknown>> => {
      setError(null);
      setResult(null);
      setLoading(label);
      try {
        const data = await fn();
        setResult(data);
        return { data, error: null };
      } catch (e: unknown) {
        const msg = describeError(e);
        setError(msg);
        return { data: null, error: msg };
      } finally {
        setLoading(null);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setLoading(null);
    setResult(null);
    setError(null);
  }, []);

  return { loading, result, error, call, reset };
}

export { useAsyncCall, useDiscriminatedAsyncCall };
export type { CallResult };
