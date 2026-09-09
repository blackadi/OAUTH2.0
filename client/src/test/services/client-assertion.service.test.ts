import { describe, it, expect } from 'vitest';
import {
  generateSigningKeyPair,
  createRequestObject,
  getJwkSetDisplay,
} from '@/services/client-assertion.service';
import type { JWK } from '@/services/crypto-utils';

/**
 * `createClientAssertion` and `generateSigningKeyPair`'s key-generation path already have real,
 * signature-verifying tests in `dpop.service.test.ts` (grouped there because that file established the
 * "verify the real signature with WebCrypto" pattern for this repo's crypto-adjacent code). This file
 * covers what that one does not: `createRequestObject` (the FAPI 2.0 / JAR signed request object) and
 * `getJwkSetDisplay` (the published JWK Set), which had no dedicated test anywhere — `createRequestObject`
 * got only incidental exercise through `JarSection.driven.test.tsx`, and `getJwkSetDisplay` had none, so
 * its three independently-optional members (`use`, `alg`, `kid`) were at 0% branch coverage.
 */

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return JSON.parse(json);
}

function segmentBytes(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('createRequestObject (RFC 9101 / FAPI 2.0 Message Signing Profile)', () => {
  it("carries typ 'oauth-authz-req+jwt' — RFC 9101 §4's media type for a request object", async () => {
    const pair = await generateSigningKeyPair();
    const jwt = await createRequestObject(pair.privateKey, 'client-1', 'https://as.example', {
      response_type: 'code',
    });
    const header = decodeSegment(jwt.split('.')[0]);

    expect(header.typ).toBe('oauth-authz-req+jwt');
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(pair.privateKey.kid);
  });

  it('spreads the caller-supplied authorization params into the payload alongside the required claims', async () => {
    const pair = await generateSigningKeyPair();
    const jwt = await createRequestObject(pair.privateKey, 'client-1', 'https://as.example', {
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: 'https://rp.example/callback',
    });
    const payload = decodeSegment(jwt.split('.')[1]);

    expect(payload.response_type).toBe('code');
    expect(payload.scope).toBe('openid profile');
    expect(payload.redirect_uri).toBe('https://rp.example/callback');
    // `aud` is the issuer identifier for the same reason the client assertion's is (FAPI 2.0 §5.3.2.1).
    expect(payload.iss).toBe('client-1');
    expect(payload.aud).toBe('https://as.example');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.nbf).toBe('number');
  });

  it('has a unique jti per request object', async () => {
    const pair = await generateSigningKeyPair();
    const one = decodeSegment(
      (await createRequestObject(pair.privateKey, 'c', 'https://as.example', {})).split('.')[1],
    );
    const two = decodeSegment(
      (await createRequestObject(pair.privateKey, 'c', 'https://as.example', {})).split('.')[1],
    );
    expect(one.jti).not.toBe(two.jti);
  });

  it('produces a signature that verifies against the public key, and never leaks the private one', async () => {
    const pair = await generateSigningKeyPair();
    const jwt = await createRequestObject(pair.privateKey, 'c', 'https://as.example', {
      scope: 'openid',
    });
    const [header, payload, signature] = jwt.split('.');

    expect(jwt).not.toContain(String(pair.privateKey.d));

    const key = await crypto.subtle.importKey(
      'jwk',
      pair.publicKey as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      segmentBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(ok).toBe(true);
  });
});

interface JwkSet {
  // A broader shape than `JWK` on purpose: several tests below assert that `key_ops`/`ext` are
  // ABSENT, which `getJwkSetDisplay` never types in the first place — `JWK` would refuse the access.
  keys: Record<string, unknown>[];
}

function parseJwkSet(raw: string): JwkSet {
  return JSON.parse(raw) as JwkSet;
}

describe('getJwkSetDisplay', () => {
  const BASE: JWK = { kty: 'EC', crv: 'P-256', x: 'x-coord', y: 'y-coord' };

  it('publishes only the registered JWK members — no key_ops, no ext, no private d', async () => {
    const pair = await generateSigningKeyPair();
    const displayed = parseJwkSet(getJwkSetDisplay(pair.publicKey));

    expect(displayed.keys).toHaveLength(1);
    const key = displayed.keys[0];
    expect(key.d).toBeUndefined();
    expect(key.key_ops).toBeUndefined();
    expect(key.ext).toBeUndefined();
    expect(key.kty).toBe('EC');
    expect(key.crv).toBe('P-256');
  });

  it('includes use, alg and kid when all three are present', () => {
    const displayed = parseJwkSet(
      getJwkSetDisplay({ ...BASE, use: 'sig', alg: 'ES256', kid: 'key-1' }),
    );
    expect(displayed.keys[0]).toMatchObject({ use: 'sig', alg: 'ES256', kid: 'key-1' });
  });

  it('omits use, alg and kid when all three are absent, rather than publishing them as undefined', () => {
    const displayed = parseJwkSet(getJwkSetDisplay(BASE));
    const key = displayed.keys[0];
    expect('use' in key).toBe(false);
    expect('alg' in key).toBe(false);
    expect('kid' in key).toBe(false);
  });

  it('includes each of use/alg/kid independently of the other two', () => {
    expect(parseJwkSet(getJwkSetDisplay({ ...BASE, use: 'sig' })).keys[0]).toMatchObject({
      use: 'sig',
    });
    expect(parseJwkSet(getJwkSetDisplay({ ...BASE, alg: 'ES256' })).keys[0]).toMatchObject({
      alg: 'ES256',
    });
    expect(parseJwkSet(getJwkSetDisplay({ ...BASE, kid: 'k' })).keys[0]).toMatchObject({
      kid: 'k',
    });
  });

  it('is valid, re-parseable JSON shaped as a JWK Set', () => {
    const raw = getJwkSetDisplay({ ...BASE, kid: 'k1' });
    const parsed = parseJwkSet(raw);
    expect(Array.isArray(parsed.keys)).toBe(true);
  });
});
