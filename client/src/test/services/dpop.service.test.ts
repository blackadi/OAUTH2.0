import { describe, it, expect } from 'vitest';
import { generateKeyPair, createProof, computeAth } from '@/services/dpop.service';
import { createClientAssertion, generateSigningKeyPair } from '@/services/client-assertion.service';

/**
 * The cryptographic core had no tests at all, and it has broken before: DPoP proofs were once signed
 * with DER-encoded ECDSA signatures where JWS requires raw R‖S, producing
 * `invalid_dpop_proof: Signed JWT rejected: Invalid signature`. That class of bug is invisible to
 * typecheck, lint and every existing test, and expensive to diagnose from the outside.
 *
 * These tests verify the real signatures with WebCrypto rather than asserting on shapes.
 */

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return JSON.parse(json);
}

/** `Uint8Array<ArrayBuffer>` so it satisfies `BufferSource`, which excludes `SharedArrayBuffer`. */
function segmentBytes(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('generateKeyPair', () => {
  it('produces a P-256 pair with a thumbprint-style kid on both halves', async () => {
    const pair = await generateKeyPair();
    expect(pair.publicKey.kty).toBe('EC');
    expect(pair.publicKey.crv).toBe('P-256');
    expect(pair.kid).toBeTruthy();
    expect(pair.publicKey.kid).toBe(pair.kid);
    expect(pair.privateKey.kid).toBe(pair.kid);
  });

  it('keeps the private scalar out of the public half', async () => {
    const pair = await generateKeyPair();
    expect(pair.publicKey.d).toBeUndefined();
    expect(pair.privateKey.d).toBeTruthy();
  });

  it('generates a distinct key each time', async () => {
    const [a, b] = await Promise.all([generateKeyPair(), generateKeyPair()]);
    expect(a.kid).not.toBe(b.kid);
  });
});

describe('createProof', () => {
  it('carries RFC 9449 §4.2\'s header: typ dpop+jwt, alg ES256, and the public jwk', async () => {
    const pair = await generateKeyPair();
    const proof = await createProof(pair.privateKey, 'POST', 'https://as.example/token');
    const header = decodeSegment(proof.split('.')[0]);

    expect(header.typ).toBe('dpop+jwt');
    expect(header.alg).toBe('ES256');
    // Without `jwk` Authlete answers "The DPoP header did not include a public key in JWK format."
    // A `kid` alone is not sufficient.
    expect(header.jwk).toBeTruthy();
  });

  it('NEVER puts the private scalar in the header — the proof is public by design', async () => {
    const pair = await generateKeyPair();
    const proof = await createProof(pair.privateKey, 'POST', 'https://as.example/token');
    const header = decodeSegment(proof.split('.')[0]) as { jwk: Record<string, unknown> };

    // The proof travels in a request header. A `d` here would publish the signing key to every hop.
    expect(header.jwk.d).toBeUndefined();
    expect(proof).not.toContain(String(pair.privateKey.d));
  });

  it('carries htm, htu, iat and a fresh jti', async () => {
    const pair = await generateKeyPair();
    const a = await createProof(pair.privateKey, 'GET', 'https://rs.example/userinfo');
    const b = await createProof(pair.privateKey, 'GET', 'https://rs.example/userinfo');
    const pa = decodeSegment(a.split('.')[1]);
    const pb = decodeSegment(b.split('.')[1]);

    expect(pa.htm).toBe('GET');
    expect(pa.htu).toBe('https://rs.example/userinfo');
    expect(typeof pa.iat).toBe('number');
    // Replay detection only works if two proofs are distinguishable.
    expect(pa.jti).not.toBe(pb.jti);
  });

  it('includes ath and nonce only when supplied', async () => {
    const pair = await generateKeyPair();
    const bare = decodeSegment(
      (await createProof(pair.privateKey, 'GET', 'https://rs.example/x')).split('.')[1],
    );
    expect(bare.ath).toBeUndefined();
    expect(bare.nonce).toBeUndefined();

    const full = decodeSegment(
      (await createProof(pair.privateKey, 'GET', 'https://rs.example/x', 'ath-value', 'nonce-value'))
        .split('.')[1],
    );
    // RFC 9449 §7.1 requires `ath` when a proof accompanies an access token — and it is `ath`, not `sub`.
    expect(full.ath).toBe('ath-value');
    expect(full.nonce).toBe('nonce-value');
    expect(full.sub).toBeUndefined();
  });

  it('signs with raw R‖S, not DER — the exact bug that broke this once', async () => {
    const pair = await generateKeyPair();
    const proof = await createProof(pair.privateKey, 'POST', 'https://as.example/token');
    const signature = segmentBytes(proof.split('.')[2]);

    // JWS ES256 is a fixed 64 bytes (IEEE P1363); a DER encoding is variable-length — 70–72 for P-256 —
    // and is a SEQUENCE, `0x30 <len> …`, where `<len>` is the remaining byte count.
    expect(signature.byteLength).toBe(64);

    // Structural, not "the first byte isn't 0x30". That earlier form was flaky: R's leading byte is
    // uniformly random, so it is 0x30 about 1 run in 200 — measured at 15 of 3,000 signatures, against
    // 3,000 of 3,000 being exactly 64 bytes. A test that fails 0.5% of the time teaches people to
    // re-run it, which is worse than not having it.
    const looksLikeDer = signature[0] === 0x30 && signature[1] === signature.byteLength - 2;
    expect(looksLikeDer).toBe(false);
  });

  it('produces a signature that actually verifies against the public key', async () => {
    const pair = await generateKeyPair();
    const proof = await createProof(pair.privateKey, 'POST', 'https://as.example/token');
    const [header, payload, signature] = proof.split('.');

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

  it('a proof signed by one key does not verify under another', async () => {
    const [mine, theirs] = await Promise.all([generateKeyPair(), generateKeyPair()]);
    const proof = await createProof(mine.privateKey, 'POST', 'https://as.example/token');
    const [header, payload, signature] = proof.split('.');

    const key = await crypto.subtle.importKey(
      'jwk',
      theirs.publicKey as JsonWebKey,
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
    expect(ok).toBe(false);
  });
});

describe('computeAth', () => {
  it('is the base64url SHA-256 of the token, unpadded', async () => {
    const ath = await computeAth('an-access-token');
    const expected = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode('an-access-token')),
    );
    let binary = '';
    for (const byte of expected) binary += String.fromCharCode(byte);
    const b64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    expect(ath).toBe(b64url);
    expect(ath).not.toContain('=');
    expect(ath).not.toMatch(/[+/]/);
  });

  it('differs for different tokens', async () => {
    expect(await computeAth('a')).not.toBe(await computeAth('b'));
  });
});

describe('createClientAssertion (RFC 7523)', () => {
  it('addresses the assertion to the authorization server, not to an API', async () => {
    const pair = await generateSigningKeyPair();
    const assertion = await createClientAssertion(
      pair.privateKey,
      'client-1',
      'https://as.example/token',
    );
    const payload = decodeSegment(assertion.split('.')[1]);

    // RFC 7523 §3(3): `aud` identifies the AS. Naming the target API instead earns [A314314].
    expect(payload.aud).toBe('https://as.example/token');
    expect(payload.iss).toBe('client-1');
    expect(payload.sub).toBe('client-1');
  });

  it('carries exp and iat, since a missing exp is refused with [A314305]', async () => {
    const pair = await generateSigningKeyPair();
    const payload = decodeSegment(
      (await createClientAssertion(pair.privateKey, 'c', 'https://as.example/token')).split('.')[1],
    );
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.iat).toBe('number');
    expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
  });

  it('has a unique jti per assertion', async () => {
    const pair = await generateSigningKeyPair();
    const one = decodeSegment(
      (await createClientAssertion(pair.privateKey, 'c', 'https://as.example/t')).split('.')[1],
    );
    const two = decodeSegment(
      (await createClientAssertion(pair.privateKey, 'c', 'https://as.example/t')).split('.')[1],
    );
    expect(one.jti).not.toBe(two.jti);
  });

  it('verifies against its public key, and does not leak the private one', async () => {
    const pair = await generateSigningKeyPair();
    const assertion = await createClientAssertion(pair.privateKey, 'c', 'https://as.example/t');
    const [header, payload, signature] = assertion.split('.');

    expect(assertion).not.toContain(String(pair.privateKey.d));

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
