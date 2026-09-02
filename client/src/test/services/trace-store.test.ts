import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordTrace,
  getTraces,
  clearTraces,
  recordNavigation,
  importTraces,
  subscribeToTraces,
  redactHeaders,
  redactBody,
  type TraceInput,
} from '@/services/trace-store';

function entry(overrides: Partial<TraceInput> = {}): TraceInput {
  return {
    startedAt: 1_700_000_000_000,
    durationMs: 12,
    method: 'POST',
    url: 'https://as.example/token',
    requestHeaders: {},
    status: 200,
    statusText: 'OK',
    responseHeaders: {},
    responseBody: {},
    ok: true,
    ...overrides,
  };
}

beforeEach(() => clearTraces());

describe('the store', () => {
  it('keeps newest first', () => {
    recordTrace(entry({ url: 'first' }));
    recordTrace(entry({ url: 'second' }));
    expect(getTraces().map((t) => t.url)).toEqual(['second', 'first']);
  });

  it('replaces the array rather than mutating it, which is what useSyncExternalStore requires', () => {
    recordTrace(entry());
    const before = getTraces();
    recordTrace(entry());
    expect(getTraces()).not.toBe(before);
  });

  it('is bounded, so a polling loop cannot grow it without limit', () => {
    for (let i = 0; i < 250; i += 1) recordTrace(entry({ url: `u${i}` }));
    const traces = getTraces();
    expect(traces).toHaveLength(200);
    expect(traces[0].url).toBe('u249');
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribeToTraces(() => {
      calls += 1;
    });
    recordTrace(entry());
    expect(calls).toBe(1);
    clearTraces();
    expect(calls).toBe(2);
    unsubscribe();
    recordTrace(entry());
    expect(calls).toBe(2);
  });
});

describe('redaction — what may leave the panel', () => {
  it('masks the credential but keeps the scheme, because the scheme is often the diagnosis', () => {
    expect(redactHeaders({ Authorization: 'Basic dXNlcjpwYXNz' })).toEqual({
      Authorization: 'Basic ●●●●●●',
    });
    expect(redactHeaders({ authorization: 'DPoP eyJhbGciOi' })).toEqual({
      authorization: 'DPoP ●●●●●●',
    });
  });

  it('masks a DPoP proof header', () => {
    const out = redactHeaders({ DPoP: 'eyJ0eXAiOiJkcG9wK2p3dCJ9.e30.sig' });
    expect(out.DPoP).not.toContain('eyJ0eXAi');
  });

  it('leaves ordinary headers alone', () => {
    expect(redactHeaders({ 'Content-Type': 'application/json' })).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('masks a value with no scheme entirely', () => {
    expect(redactHeaders({ Cookie: 'sid=abc123' })).toEqual({ Cookie: '●●●●●●' });
  });

  it('masks credentials in a form-encoded body but keeps its shape readable', () => {
    const out = redactBody(
      'grant_type=authorization_code&code=xyz&client_secret=s3cr3t&code_verifier=v3rif13r',
    );
    expect(out).toContain('grant_type=authorization_code');
    expect(out).not.toContain('s3cr3t');
    expect(out).not.toContain('v3rif13r');
  });

  /**
   * This case used to assert the opposite — `expect(out).toContain('code=xyz')`, commented *"an
   * authorization code is single-use and already spent"*.
   *
   * That rationale holds for a *successful* exchange and fails for a failed one, and this repo proved
   * it: an authorization code **survives** a `use_dpop_nonce` refusal, so the same code replayed with
   * the nonce still yields `OK` (verified live 2026-08-17, recorded in `AGENTS.md`). A failed exchange
   * is precisely the request somebody exports and pastes into an issue asking what went wrong, so the
   * one case the rationale did not cover is the one case that matters.
   */
  it('masks the authorization code, which a failed exchange leaves live', () => {
    const out = redactBody('grant_type=authorization_code&code=xyz&redirect_uri=http://x/cb');
    expect(out).not.toContain('code=xyz');
    expect(out).toContain('code=●●●●●●');
    // The shape stays readable: only the value goes.
    expect(out).toContain('grant_type=authorization_code');
    expect(out).toContain('redirect_uri=http://x/cb');
  });

  /**
   * `token` is the parameter RFC 7662 §2.1 and RFC 7009 §2.1 both define, so it is what the
   * introspection and revocation sections send — a live access or refresh token, with nothing spent
   * about it. It was absent from the list while `refresh_token` was present.
   */
  it('masks the `token` parameter that introspection and revocation send', () => {
    const out = redactBody('token=at_live_abc&token_type_hint=access_token');
    expect(out).not.toContain('at_live_abc');
    expect(out).toContain('token=●●●●●●');
    // `token_type_hint` is a hint, not a credential, and its *name* merely starts the same way.
    expect(out).toContain('token_type_hint=access_token');
  });

  /**
   * The boundary in the form-encoded pattern is load-bearing now that short names are on the list.
   * Without one, `token=` matches inside `refresh_token=` and masking becomes unpredictable; with a
   * boundary that only admitted `^`, `?` and `&`, the form-encoded string that `par.service.ts` and
   * `ciba.service.ts` nest inside a JSON field would silently stop being masked.
   */
  it('respects parameter-name boundaries, including inside a nested form-encoded string', () => {
    // `_` counts as an identifier character, so the `token` rule cannot match inside `refresh_token`.
    const refresh = redactBody('grant_type=refresh_token&refresh_token=rt_live_9');
    expect(refresh).toContain('grant_type=refresh_token');
    expect(refresh).toContain('refresh_token=●●●●●●');
    expect(refresh).not.toContain('rt_live_9');

    // A name that merely ends with a sensitive one is left alone.
    const hint = redactBody('id_token_hint=eyJhbGciOi&prompt=none');
    expect(hint).toContain('id_token_hint=eyJhbGciOi');

    // PAR and CIBA pack form-encoded parameters into a JSON string field.
    const nested = redactBody(
      '{"parameters":"code_verifier=v3rif13r&scope=openid","clientId":"c1"}',
    );
    expect(nested).not.toContain('v3rif13r');
    expect(nested).toContain('code_verifier=●●●●●●');
    // The closing quote of the JSON string must survive, or the export is unparseable.
    expect(nested).toContain('&scope=openid"');
    expect(nested).toContain('"clientId":"c1"');
  });

  it('masks credentials in a JSON body, in either spelling', () => {
    const out = redactBody('{"clientId":"c1","clientSecret":"s3cr3t","parameters":"scope=openid"}');
    expect(out).toContain('"clientId":"c1"');
    expect(out).not.toContain('s3cr3t');
  });

  it('masks the credential-bearing grant parameters the server learned to keep out of logs', () => {
    const out = redactBody('password=hunter2&assertion=jwt.body.sig&refresh_token=rt1');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('jwt.body.sig');
    expect(out).not.toContain('rt1');
  });

  it('passes an absent body through', () => {
    expect(redactBody(undefined)).toBeUndefined();
  });
});

/**
 * **Surviving the front-channel redirect, which is the whole reason the store is persisted.**
 *
 * The authorization request is `window.location.href = url` — a full-document navigation. `navigateTo`
 * records the outbound hop and then unloads the page, so while the store lived only in a module-level
 * array that entry existed for microseconds and no human ever saw it: the callback page always started
 * from an empty history, and `utils/diagnose.ts` printed "no evidence in this trace" on a run that had
 * gone perfectly. The only way to test the fix is to discard the module the way the browser discards
 * the document, so every case here re-imports it.
 */
describe('surviving a full-page navigation', () => {
  /** What the browser does to this module on `window.location.href = …`. */
  async function reload() {
    vi.resetModules();
    return import('@/services/trace-store');
  }

  beforeEach(() => {
    clearTraces();
    vi.resetModules();
  });

  it('reads the history back after the document is discarded', async () => {
    recordTrace(entry({ url: 'https://as.example/api/authorization?client_id=c1' }));
    recordTrace(entry({ url: 'https://as.example/api/par' }));

    const fresh = await reload();
    expect(fresh.getTraces().map((t) => t.url)).toEqual([
      'https://as.example/api/par',
      'https://as.example/api/authorization?client_id=c1',
    ]);
  });

  /**
   * **The bug a naive `entries`-only save would have shipped.** Ids are minted from a counter; restoring
   * two entries and leaving the counter at zero makes the next live request `t1` again — a duplicate
   * React key in the panel and a duplicate id in an exported run. The counter is persisted *with* the
   * entries because the two are one fact.
   */
  it('does not re-mint ids that the restored entries already hold', async () => {
    recordTrace(entry({ url: 'one' }));
    recordTrace(entry({ url: 'two' }));

    const fresh = await reload();
    fresh.recordTrace(entry({ url: 'three' }));

    const ids = fresh.getTraces().map((t) => t.id);
    expect(new Set(ids).size, `duplicate ids: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('carries the front-channel hop and its direction across, not just the URL', async () => {
    recordNavigation({
      url: 'https://as.example/api/authorization',
      direction: 'outbound',
      label: 'authorize',
    });

    const fresh = await reload();
    const [hop] = fresh.getTraces();
    expect(hop.navigation).toBe(true);
    expect(hop.direction).toBe('outbound');
  });

  /** An imported run must not lose its badge on reload — the flag is the safety property. */
  it('keeps the imported flag, so restored foreign traffic still reads as foreign', async () => {
    importTraces([entry({ url: 'https://someone-else/api/par' })]);

    const fresh = await reload();
    expect(fresh.getTraces()[0].imported).toBe(true);
  });

  it('clearing is durable rather than only local to the page', async () => {
    recordTrace(entry({ url: 'one' }));
    clearTraces();

    const fresh = await reload();
    expect(fresh.getTraces()).toEqual([]);
  });

  /**
   * Storage written by an older build, or edited by hand, is treated as absent rather than repaired.
   * Half-reviving an unknown shape is worse than starting clean, and this store is the one thing a
   * reader trusts to say what happened.
   */
  it('starts clean on malformed storage instead of throwing at import time', async () => {
    sessionStorage.setItem('trace_history', '{"entries":"not-an-array"}');
    const fresh = await reload();
    expect(fresh.getTraces()).toEqual([]);

    sessionStorage.setItem('trace_history', 'not json at all');
    const again = await reload();
    expect(again.getTraces()).toEqual([]);
  });

  /**
   * A write that cannot happen costs the *history*, never the panel. `writeKey` swallows the error, so
   * the in-memory array is already assigned and the listeners have already fired.
   */
  it('still records in memory when the session store refuses the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => recordTrace(entry({ url: 'https://as.example/api/token' }))).not.toThrow();
    expect(getTraces()).toHaveLength(1);
    setItem.mockRestore();
  });
});
