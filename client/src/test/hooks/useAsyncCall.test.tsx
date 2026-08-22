import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useAsyncCall, useDiscriminatedAsyncCall } from '@/hooks/useAsyncCall';
import { HttpError, NetworkError } from '@/services/transport';
import { resetAnnouncements } from '@/services/announcer';

/**
 * The hook every section routes through, and the one whose error path was at **0% branch coverage**
 * while producing the sentence all 22 sections display.
 */

afterEach(() => {
  cleanup();
  resetAnnouncements();
  vi.restoreAllMocks();
});

function httpError(status: number, statusText: string, body: string, headers = {}) {
  return new HttpError({
    ok: false,
    status,
    statusText,
    headers,
    body,
    raw: body,
    durationMs: 3,
  });
}

describe('useAsyncCall', () => {
  it('reports loading, then the result', async () => {
    const { result } = renderHook(() => useAsyncCall<string>());
    expect(result.current.loading).toBe(false);

    await act(async () => {
      const r = await result.current.call(async () => 'done');
      expect(r).toEqual({ data: 'done', error: null });
    });
    expect(result.current).toMatchObject({ loading: false, result: 'done', error: null });
  });

  /**
   * The status is prefixed because it used to be nowhere: every service ended with
   * `throw new Error(await response.text())`, so 400, 401, 429 and 500 all arrived as the same red text
   * — and a user who had tripped Authlete's ~15-call rate limit saw exactly what a user with a wrong
   * client secret saw.
   */
  it('prefixes the status, so a rate limit is distinguishable from a bad secret', async () => {
    const { result } = renderHook(() => useAsyncCall());
    await act(async () => {
      await result.current.call(() => Promise.reject(httpError(429, 'Too Many Requests', 'slow')));
    });
    expect(result.current.error).toContain('429 Too Many Requests');
    expect(result.current.error).toContain('slow');
  });

  /**
   * At a protected resource, `WWW-Authenticate` **is** the error: RFC 6750 §3 puts the code there rather
   * than in the body, and RFC 9470's `insufficient_user_authentication` challenge carries the
   * `acr_values` the client must now request.
   */
  it('appends the WWW-Authenticate challenge when there is one', async () => {
    const { result } = renderHook(() => useAsyncCall());
    await act(async () => {
      await result.current.call(() =>
        Promise.reject(
          httpError(401, 'Unauthorized', '', {
            'www-authenticate': 'DPoP error="use_dpop_nonce", algs="ES256"',
          }),
        ),
      );
    });
    expect(result.current.error).toContain('use_dpop_nonce');
    expect(result.current.error).toContain('401 Unauthorized');
  });

  it('names a network failure as one, since it has no status to report', async () => {
    const { result } = renderHook(() => useAsyncCall());
    await act(async () => {
      await result.current.call(() => Promise.reject(new NetworkError('DNS failed', 12)));
    });
    expect(result.current.error).toMatch(/Network error — no response received: DNS failed/);
  });

  it('falls back for a plain throw and for a non-Error', async () => {
    const { result } = renderHook(() => useAsyncCall());
    await act(async () => {
      await result.current.call(() => Promise.reject(new Error('plain')));
    });
    expect(result.current.error).toBe('plain');

    await act(async () => {
      await result.current.call(() => Promise.reject('a string'));
    });
    expect(result.current.error).toBe('Request failed');
  });

  it('clears the previous result when a new call starts', async () => {
    const { result } = renderHook(() => useAsyncCall<string>());
    await act(async () => {
      await result.current.call(async () => 'first');
    });
    await act(async () => {
      await result.current.call(() => Promise.reject(new Error('second failed')));
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('second failed');
  });

  it('resets to the initial state', async () => {
    const { result } = renderHook(() => useAsyncCall<string>());
    await act(async () => {
      await result.current.call(async () => 'x');
    });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ loading: false, result: null, error: null });
  });
});

describe('useDiscriminatedAsyncCall', () => {
  it('reports which operation is loading, so two buttons cannot both spin', async () => {
    const { result } = renderHook(() => useDiscriminatedAsyncCall<'read' | 'write', number>());

    // Held open deliberately: the label is only observable *while* the call is in flight, and reading
    // `result.current` from inside the callback would read the snapshot from before the re-render.
    let release: (value: number) => void = () => {};
    const inFlight = new Promise<number>((resolve) => {
      release = resolve;
    });

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.call('write', () => inFlight);
    });

    expect(result.current.loading).toBe('write');

    await act(async () => {
      release(1);
      await pending;
    });

    // Cleared in a `finally`, so a failure does not leave a button spinning for ever.
    expect(result.current.loading).toBeNull();
    expect(result.current.result).toBe(1);
  });

  it('clears the loading label even when the call throws', async () => {
    const { result } = renderHook(() => useDiscriminatedAsyncCall<'go'>());
    await act(async () => {
      await result.current.call('go', () => Promise.reject(new Error('nope')));
    });
    expect(result.current.loading).toBeNull();
    expect(result.current.error).toBe('nope');
  });

  it('labels the error with the operation that produced it', async () => {
    const { result } = renderHook(() => useDiscriminatedAsyncCall<'introspect'>());
    await act(async () => {
      await result.current.call('introspect', () =>
        Promise.reject(httpError(401, 'Unauthorized', 'no')),
      );
    });
    expect(result.current.error).toContain('401 Unauthorized');
  });

  /**
   * The second type parameter is the ENG-08 fix. `Result` was hard-coded to `unknown`, so thirteen
   * sections either cast it or dumped it into a `JsonBlock`. `unknown` stays the *default* — most
   * responses here genuinely are of unknown shape — but a caller that knows can now say so, and this
   * test is the thing that would fail if the parameter were removed again.
   */
  it('carries a declared result type through to the caller, with no cast', async () => {
    const { result } = renderHook(() =>
      useDiscriminatedAsyncCall<'fetch', { scope: string; expires_in: number }>(),
    );

    await act(async () => {
      const r = await result.current.call('fetch', async () => ({
        scope: 'openid profile',
        expires_in: 300,
      }));
      // `r.data` is `{ scope: string; expires_in: number } | null` — reading `.scope` compiles.
      expect(r.data?.scope).toBe('openid profile');
    });

    expect(result.current.result?.expires_in).toBe(300);
  });

  it('still defaults to unknown, which is right for a protocol response', async () => {
    const { result } = renderHook(() => useDiscriminatedAsyncCall<'anything'>());
    await act(async () => {
      await result.current.call('anything', async () => ({ whatever: true }));
    });
    // No shape is asserted, because none was declared — the value is `unknown` and stays that way.
    expect(result.current.result).toEqual({ whatever: true });
  });

  it('resets every field', async () => {
    const { result } = renderHook(() => useDiscriminatedAsyncCall<'go', string>());
    await act(async () => {
      await result.current.call('go', async () => 'x');
    });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ loading: null, result: null, error: null });
  });
});
