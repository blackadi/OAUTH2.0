import { useState, useCallback } from 'react';
import { HttpError, NetworkError } from '@/services/transport';
import { announce } from '@/services/announcer';

/**
 * What a screen reader is told about the outcome, as distinct from what is rendered.
 *
 * The rendered form is a pane of JSON below a form; the announced form has to be a sentence. Both
 * hooks below route through here, so all 20 sections gained announcements from one change — see
 * `services/announcer.ts` for why the store is module-level.
 *
 * The status is spoken first because it is the thing that decides what to do next, and a raw body is
 * truncated: reading 9,000 characters of an HTML error page aloud is worse than saying nothing.
 */
const SPOKEN_BODY_LIMIT = 220;

function announceOutcome(ok: boolean, detail: string): void {
  const trimmed =
    detail.length > SPOKEN_BODY_LIMIT ? `${detail.slice(0, SPOKEN_BODY_LIMIT)}…` : detail;
  if (ok) {
    announce(`Request succeeded. ${trimmed}`, 'polite');
  } else {
    announce(`Request failed. ${trimmed}`, 'assertive');
  }
}

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
    announce('Sending request…', 'polite');
    try {
      const data = await fn();
      setState({ loading: false, result: data, error: null });
      announceOutcome(true, 'The response is in the results panel.');
      return { data, error: null };
    } catch (e: unknown) {
      const msg = describeError(e);
      setState({ loading: false, result: null, error: msg });
      announceOutcome(false, msg);
      return { data: null, error: msg };
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, result: null, error: null });
  }, []);

  return { ...state, call, reset };
}

/**
 * The multi-operation variant: one hook, many named operations, and `loading` says *which*.
 *
 * **Two type parameters, and the second one is the fix.** `Label` discriminates the operation — that was
 * always right, and it is why `loading` is a label rather than a boolean, so two buttons cannot both
 * spin. `Result` was hard-coded to `unknown`, which threw away whatever the caller knew: thirteen
 * sections then either cast it or dumped it into a `JsonBlock`.
 *
 * `unknown` remains the **default**, deliberately. Most responses here genuinely are of unknown shape —
 * an authorization server may return anything alongside the members it must — and a section that renders
 * one as JSON is right to say so. The parameter exists for the sections that *do* know, so they can stop
 * casting.
 */
function useDiscriminatedAsyncCall<Label extends string, Result = unknown>() {
  const [loading, setLoading] = useState<Label | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (label: Label, fn: () => Promise<Result>): Promise<CallResult<Result>> => {
      setError(null);
      setResult(null);
      setLoading(label);
      announce(`Sending ${label} request…`, 'polite');
      try {
        const data = await fn();
        setResult(data);
        announceOutcome(true, `${label} succeeded. The response is in the results panel.`);
        return { data, error: null };
      } catch (e: unknown) {
        const msg = describeError(e);
        setError(msg);
        announceOutcome(false, `${label}: ${msg}`);
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
