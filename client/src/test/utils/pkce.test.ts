import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, createPkcePair } from '@/pkce';

/**
 * PKCE is the one client-side mechanism standing between an intercepted authorization code and a
 * usable token, and it had no tests. Two of this deployment's four clients enforce it; two deliberately
 * do not, so Modules 02 and 03 can show the difference.
 *
 * The pair is checked by *recomputing* the transformation rather than by asserting on a fixture, so the
 * test states the property RFC 7636 §4.2 defines rather than a value someone once observed.
 */

describe('generateCodeVerifier', () => {
  it('defaults to 64 characters, inside RFC 7636 §4.1\'s 43–128 range', async () => {
    const verifier = await generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('uses only the unreserved characters §4.1 permits', async () => {
    // ALPHA / DIGIT / "-" / "." / "_" / "~" — anything else would need percent-encoding on the wire.
    const verifier = await generateCodeVerifier(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('honours an explicit length', async () => {
    expect(await generateCodeVerifier(43)).toHaveLength(43);
    expect(await generateCodeVerifier(128)).toHaveLength(128);
  });

  it('is different every time', async () => {
    const verifiers = await Promise.all(Array.from({ length: 20 }, () => generateCodeVerifier()));
    expect(new Set(verifiers).size).toBe(20);
  });
});

describe('generateCodeChallenge', () => {
  it('is the base64url SHA-256 of the verifier, unpadded (§4.2)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await generateCodeChallenge(verifier);

    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    );
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    const expected = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    expect(challenge).toBe(expected);
  });

  it('matches RFC 7636 Appendix B\'s worked example', async () => {
    // The one fixture worth having: the value the specification itself publishes.
    expect(await generateCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('is base64url — no padding, no + or /', async () => {
    const challenge = await generateCodeChallenge(await generateCodeVerifier());
    expect(challenge).not.toContain('=');
    expect(challenge).not.toMatch(/[+/]/);
    expect(challenge).toHaveLength(43); // 32 bytes of SHA-256 in unpadded base64url
  });

  it('is deterministic for a given verifier, which is what makes the exchange checkable', async () => {
    const verifier = await generateCodeVerifier();
    expect(await generateCodeChallenge(verifier)).toBe(await generateCodeChallenge(verifier));
  });

  it('changes completely for a one-character change', async () => {
    const a = await generateCodeChallenge('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const b = await generateCodeChallenge('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab');
    expect(a).not.toBe(b);
  });
});

describe('createPkcePair', () => {
  it('returns a verifier and the challenge derived from it', async () => {
    const { codeVerifier, codeChallenge } = await createPkcePair();
    expect(codeChallenge).toBe(await generateCodeChallenge(codeVerifier));
  });

  it('never returns the same pair twice', async () => {
    const pairs = await Promise.all(Array.from({ length: 10 }, () => createPkcePair()));
    expect(new Set(pairs.map((p) => p.codeVerifier)).size).toBe(10);
    expect(new Set(pairs.map((p) => p.codeChallenge)).size).toBe(10);
  });
});
