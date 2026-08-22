import { describe, it, expect, beforeEach } from 'vitest';
import { canDiagnose, diagnoseCodeExchange } from '@/utils/diagnose';
import { clearTraces, getTraces, recordNavigation, recordTrace } from '@/services/trace-store';
import { createPkcePair } from '@/pkce';

/**
 * The diagnosis the app could always have computed and never did.
 *
 * `ErrorExplainer` took a string, and `decode-error.ts` never read the trace store — so on
 * `invalid_grant` the fix text asked the reader to *"check that the PKCE verifier matches the challenge
 * that was sent"*, while the application held both values. RFC 6749 §5.2 gives `invalid_grant` six
 * distinct causes and the response never says which; two of the six are exactly diffable.
 */

beforeEach(() => clearTraces());

function authorizeHop(params: Record<string, string>) {
  recordNavigation({
    url: `http://localhost:3000/api/authorization?${new URLSearchParams(params).toString()}`,
    direction: 'outbound',
    label: 'authorize',
  });
}

function tokenCall(body: Record<string, string>, ok = false) {
  recordTrace({
    startedAt: 0,
    durationMs: 5,
    method: 'POST',
    url: 'http://localhost:3000/api/token',
    requestHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
    requestBody: new URLSearchParams(body).toString(),
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    responseHeaders: {},
    responseBody: ok ? {} : { error: 'invalid_grant' },
    ok,
  });
}

function find(checks: Awaited<ReturnType<typeof diagnoseCodeExchange>>, title: string) {
  const check = checks.find((c) => c.title === title);
  if (!check) throw new Error(`no check titled ${title}`);
  return check;
}

describe('canDiagnose', () => {
  it('offers itself only for errors it can say something useful about', () => {
    expect(canDiagnose('invalid_grant')).toBe(true);
    expect(canDiagnose('invalid_request')).toBe(true);
    // Offering to diagnose these would produce three inconclusive rows and teach the reader that the
    // feature is noise.
    expect(canDiagnose('server_error')).toBe(false);
    expect(canDiagnose('invalid_client')).toBe(false);
    expect(canDiagnose(undefined)).toBe(false);
  });
});

describe('diagnoseCodeExchange', () => {
  it('says so plainly when the trace holds neither request', async () => {
    const checks = await diagnoseCodeExchange(getTraces());
    expect(checks).toHaveLength(1);
    expect(checks[0].verdict).toBe('inconclusive');
    expect(checks[0].detail).toMatch(/nothing to compare/i);
  });

  it('confirms a matching PKCE pair rather than implying it is the problem', async () => {
    const pair = await createPkcePair();
    authorizeHop({
      client_id: 'c1',
      redirect_uri: 'http://localhost:3001/callback',
      code_challenge: pair.codeChallenge,
      code_challenge_method: 'S256',
    });
    tokenCall({
      grant_type: 'authorization_code',
      code: 'abc',
      client_id: 'c1',
      redirect_uri: 'http://localhost:3001/callback',
      code_verifier: pair.codeVerifier,
    });

    const checks = await diagnoseCodeExchange(getTraces());
    expect(find(checks, 'PKCE').verdict).toBe('match');
    expect(find(checks, 'PKCE').detail).toMatch(/not what this refusal is about/i);
    expect(find(checks, 'redirect_uri').verdict).toBe('match');
    expect(find(checks, 'client_id').verdict).toBe('match');
  });

  /**
   * The headline case. A hand-edited `code_challenge` is exactly what `AuthorizeRequestBuilder`'s raw
   * mode lets a learner do, and `invalid_grant` alone gives them nothing to work with.
   */
  it('recomputes the transform and names both values when the verifier does not match', async () => {
    const pair = await createPkcePair();
    authorizeHop({
      client_id: 'c1',
      redirect_uri: 'http://localhost:3001/callback',
      code_challenge: 'a-challenge-somebody-typed-by-hand',
      code_challenge_method: 'S256',
    });
    tokenCall({
      grant_type: 'authorization_code',
      code: 'abc',
      client_id: 'c1',
      redirect_uri: 'http://localhost:3001/callback',
      code_verifier: pair.codeVerifier,
    });

    const pkce = find(await diagnoseCodeExchange(getTraces()), 'PKCE');
    expect(pkce.verdict).toBe('mismatch');
    // Both halves are quoted, which is the point: the server says neither.
    expect(pkce.detail).toContain(pair.codeChallenge);
    expect(pkce.detail).toContain('a-challenge-somebody-typed-by-hand');
    expect(pkce.spec).toBe('RFC 7636 §4.6');
  });

  it('handles the plain method, where the challenge is the verifier', async () => {
    authorizeHop({ code_challenge: 'verifier-as-is', code_challenge_method: 'plain' });
    tokenCall({ code_verifier: 'verifier-as-is' });
    expect(find(await diagnoseCodeExchange(getTraces()), 'PKCE').verdict).toBe('match');

    clearTraces();
    authorizeHop({ code_challenge: 'verifier-as-is', code_challenge_method: 'plain' });
    tokenCall({ code_verifier: 'something-else' });
    expect(find(await diagnoseCodeExchange(getTraces()), 'PKCE').verdict).toBe('mismatch');
  });

  it('catches a verifier sent against no challenge, and a challenge with no verifier', async () => {
    authorizeHop({ client_id: 'c1' });
    tokenCall({ code_verifier: 'v'.repeat(43) });
    expect(find(await diagnoseCodeExchange(getTraces()), 'PKCE').detail).toMatch(
      /no `code_challenge`/i,
    );

    clearTraces();
    authorizeHop({ code_challenge: 'ch', code_challenge_method: 'S256' });
    tokenCall({ grant_type: 'authorization_code' });
    expect(find(await diagnoseCodeExchange(getTraces()), 'PKCE').detail).toMatch(
      /no `code_verifier`/i,
    );
  });

  /**
   * A trailing slash is the whole failure, and the server's message mentions no URI at all.
   */
  it('finds a redirect_uri that differs by a single character', async () => {
    authorizeHop({ redirect_uri: 'http://localhost:3001/callback' });
    tokenCall({ redirect_uri: 'http://localhost:3001/callback/' });

    const check = find(await diagnoseCodeExchange(getTraces()), 'redirect_uri');
    expect(check.verdict).toBe('mismatch');
    expect(check.detail).toContain('http://localhost:3001/callback/');
    expect(check.detail).toMatch(/MUST be identical/);
  });

  it('finds a client_id that changed between the two requests', async () => {
    authorizeHop({ client_id: '1523514379' });
    tokenCall({ client_id: '4277838306' });

    const check = find(await diagnoseCodeExchange(getTraces()), 'client_id');
    expect(check.verdict).toBe('mismatch');
    expect(check.detail).toMatch(/cannot be redeemed by another/i);
  });

  it('reports inconclusive rather than guessing when only one request is present', async () => {
    authorizeHop({ redirect_uri: 'http://localhost:3001/callback', client_id: 'c1' });
    const checks = await diagnoseCodeExchange(getTraces());
    expect(find(checks, 'redirect_uri').verdict).toBe('inconclusive');
    expect(find(checks, 'client_id').verdict).toBe('inconclusive');
  });

  /**
   * The diagnosis must read the *authorization* hop, not any other request that happens to mention the
   * endpoint. Before front-channel hops were recorded there was nothing to read at all.
   */
  it('reads the front-channel hop rather than an unrelated call', async () => {
    recordTrace({
      startedAt: 0,
      durationMs: 1,
      method: 'GET',
      url: 'http://localhost:3000/api/health',
      requestHeaders: {},
      status: 200,
      statusText: 'OK',
      responseHeaders: {},
      responseBody: {},
      ok: true,
    });
    authorizeHop({ redirect_uri: 'http://localhost:3001/callback' });
    tokenCall({ redirect_uri: 'http://localhost:3001/callback' });

    expect(find(await diagnoseCodeExchange(getTraces()), 'redirect_uri').verdict).toBe('match');
  });
});
