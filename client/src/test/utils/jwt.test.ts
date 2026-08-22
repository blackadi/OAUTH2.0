import { describe, it, expect } from 'vitest';
import { decodeJwt, verifyJwt, readTimeClaim, formatDelta, type Jwk } from '@/utils/jwt';

/**
 * Signing is done with real generated keys rather than fixtures.
 *
 * The repo learned this one on the server side: the old `jwksClient` tests mocked the JWK→PEM converter
 * away and fed it `{ kty: 'EC', x: 'xval', y: 'yval' }` — not a key at all — so they proved nothing
 * about verification. A signature test that never verifies a real signature is worse than no test,
 * because it reads as coverage.
 */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlJson(value: unknown): string {
  return b64url(enc.encode(JSON.stringify(value)));
}

async function signEs256(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<{ token: string; jwk: Jwk }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  publicJwk.kid = 'test-ec';
  const head = b64urlJson({ alg: 'ES256', typ: 'JWT', kid: 'test-ec', ...header });
  const body = b64urlJson(payload);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    enc.encode(`${head}.${body}`),
  );
  return { token: `${head}.${body}.${b64url(signature)}`, jwk: publicJwk };
}

async function signRs256(payload: Record<string, unknown>): Promise<{ token: string; jwk: Jwk }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  publicJwk.kid = 'test-rsa';
  const head = b64urlJson({ alg: 'RS256', typ: 'JWT', kid: 'test-rsa' });
  const body = b64urlJson(payload);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, enc.encode(`${head}.${body}`));
  return { token: `${head}.${body}.${b64url(signature)}`, jwk: publicJwk };
}

describe('decodeJwt', () => {
  it('splits header, payload, signature and the signing input', async () => {
    const { token } = await signEs256({ sub: 'alice', iat: 1_700_000_000 });
    const parts = decodeJwt(token);
    expect(parts.header.alg).toBe('ES256');
    expect(parts.payload.sub).toBe('alice');
    expect(parts.signature).toBeTruthy();
    expect(parts.signingInput).toBe(token.split('.').slice(0, 2).join('.'));
  });

  it('names the JWE case rather than reporting a generic failure', () => {
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/JWE/);
  });

  it('rejects a non-token', () => {
    expect(() => decodeJwt('not-a-token')).toThrow(/expected 3 dot-separated segments/);
  });
});

describe('verifyJwt', () => {
  it('accepts a genuine ES256 signature', async () => {
    const { token, jwk } = await signEs256({ sub: 'alice' });
    await expect(verifyJwt(token, [jwk])).resolves.toMatchObject({
      status: 'valid',
      alg: 'ES256',
      kid: 'test-ec',
    });
  });

  it('accepts a genuine RS256 signature', async () => {
    const { token, jwk } = await signRs256({ sub: 'bob' });
    await expect(verifyJwt(token, [jwk])).resolves.toMatchObject({ status: 'valid', alg: 'RS256' });
  });

  it('rejects a tampered payload — the case a decode-only view cannot see', async () => {
    const { token, jwk } = await signEs256({ sub: 'alice' });
    const [head, , signature] = token.split('.');
    const forged = `${head}.${b64urlJson({ sub: 'attacker' })}.${signature}`;

    // The forgery decodes perfectly and reads as authoritative...
    expect(decodeJwt(forged).payload.sub).toBe('attacker');
    // ...and that is exactly what verification is for.
    const outcome = await verifyJwt(forged, [jwk]);
    expect(outcome.status).toBe('invalid');
  });

  it('reports a missing key by kid instead of calling the token invalid', async () => {
    const { token } = await signEs256({ sub: 'alice' });
    const otherKey: Jwk = { kty: 'EC', kid: 'someone-else', crv: 'P-256', x: 'x', y: 'y' };
    await expect(verifyJwt(token, [otherKey])).resolves.toMatchObject({
      status: 'no-key',
      kid: 'test-ec',
    });
  });

  it('picks the right key out of a set by kid', async () => {
    const { token, jwk } = await signEs256({ sub: 'alice' });
    const decoy: Jwk = { kty: 'EC', kid: 'decoy', crv: 'P-256', x: 'x', y: 'y' };
    await expect(verifyJwt(token, [decoy, jwk])).resolves.toMatchObject({ status: 'valid' });
  });

  it('tries a key with no kid on the token, since a single-key JWKS is common', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
    const head = b64urlJson({ alg: 'ES256' }); // no kid
    const body = b64urlJson({ sub: 'alice' });
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      enc.encode(`${head}.${body}`),
    );
    await expect(verifyJwt(`${head}.${body}.${b64url(sig)}`, [jwk])).resolves.toMatchObject({
      status: 'valid',
    });
  });

  it('refuses alg: none and says why', async () => {
    const token = `${b64urlJson({ alg: 'none' })}.${b64urlJson({ sub: 'x' })}.`;
    // `toMatchObject` rather than two assertions: a discriminated union does not narrow through
    // `expect(...).toBe(...)`, so reading `.reason` afterwards is a type error even when it passes.
    await expect(verifyJwt(token, [])).resolves.toMatchObject({
      status: 'unsupported',
      reason: expect.stringMatching(/RFC 9068 §4/),
    });
  });

  it('explains that HS256 cannot be checked in a browser rather than failing it', async () => {
    const token = `${b64urlJson({ alg: 'HS256' })}.${b64urlJson({ sub: 'x' })}.c2ln`;
    await expect(verifyJwt(token, [])).resolves.toMatchObject({
      status: 'unsupported',
      reason: expect.stringMatching(/shared client secret/),
    });
  });
});

describe('time claims', () => {
  it('reads a NumericDate into an ISO instant and a delta', () => {
    const future = Math.floor(Date.now() / 1000) + 600;
    const claim = readTimeClaim(future);
    expect(claim?.delta).toBeGreaterThan(590);
    expect(claim?.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('ignores a non-numeric value rather than rendering the Unix epoch', () => {
    // A fabricated authentication time is what a resource server enforces `max_age` against, so a
    // bad value must yield nothing at all — not 1970.
    expect(readTimeClaim('not-a-number')).toBeNull();
    expect(readTimeClaim(undefined)).toBeNull();
    expect(readTimeClaim(Number.NaN)).toBeNull();
  });

  it('formats in both directions, dropping precision as the span grows', () => {
    expect(formatDelta(-45)).toBe('45s ago');
    expect(formatDelta(600)).toBe('in 10m');
    expect(formatDelta(605)).toBe('in 10m 5s');
    expect(formatDelta(3700)).toBe('in 1h 1m');
    expect(formatDelta(7200)).toBe('in 2h');
  });
});

describe('time claims that cannot be times (regression)', () => {
  /**
   * `new Date(99999999999999 * 1000)` is an Invalid Date and `toISOString()` throws a RangeError on
   * one. `JwtInspector` reads `exp` at render outside any try, so a token carrying an absurd epoch —
   * malformed or hostile — replaced the whole panel with the error boundary.
   */
  it('returns null for an epoch outside the representable range instead of throwing', () => {
    expect(() => readTimeClaim(99_999_999_999_999)).not.toThrow();
    expect(readTimeClaim(99_999_999_999_999)).toBeNull();
    expect(readTimeClaim(-99_999_999_999_999)).toBeNull();
  });

  it('still accepts the extremes that are representable', () => {
    expect(readTimeClaim(0)?.iso).toBe('1970-01-01T00:00:00.000Z');
    expect(readTimeClaim(-1)?.iso).toBe('1969-12-31T23:59:59.000Z');
    expect(readTimeClaim(4_102_444_800)?.iso).toBe('2100-01-01T00:00:00.000Z');
  });
});
