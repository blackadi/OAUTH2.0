import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTrace,
  getTraces,
  clearTraces,
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
    expect(out).toContain('code=xyz'); // an authorization code is single-use and already spent
    expect(out).not.toContain('s3cr3t');
    expect(out).not.toContain('v3rif13r');
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
