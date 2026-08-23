import { describe, it, expect } from 'vitest';
import { jwkThumbprint, generateP256KeyPair, type JWK } from '@/services/crypto-utils';
import { generateKeyPair } from '@/services/dpop.service';

/**
 * RFC 7638 JWK Thumbprints, checked against the RFC's own published example.
 *
 * **Why this file exists.** `AuthFlowsSection` passed the key generator's `kid` as `dpop_jkt`. RFC 9449
 * §10 requires the RFC 7638 thumbprint, and the two are different values — `kid` is the digest of
 * `JSON.stringify(exportedPublicJwk)`, an object WebCrypto exports carrying `key_ops` and `ext` in
 * insertion order. Nothing caught it, because the parameter was never sent.
 *
 * So the assertions below are chosen to fail on exactly the mistakes that produce a *plausible* digest:
 * extra members included, member order taken from the input, a required member quietly absent.
 */

/**
 * **RFC 7638 §3.1's worked example, reproduced exactly**, including the `alg` and `kid` members that
 * §3.2 excludes from the canonical form. That exclusion is the whole point: an implementation that
 * hashes the JWK as given gets a different answer, which is the bug this file guards.
 */
const RFC7638_EXAMPLE: JWK = {
  kty: 'RSA',
  n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
  e: 'AQAB',
  alg: 'RS256',
  kid: '2011-04-29',
};

/** The value §3.1 states for that key. */
const RFC7638_EXPECTED = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs';

describe('jwkThumbprint — against RFC 7638 §3.1', () => {
  it("reproduces the RFC's published thumbprint for its own example key", async () => {
    expect(await jwkThumbprint(RFC7638_EXAMPLE)).toBe(RFC7638_EXPECTED);
  });

  it('ignores every member outside the required set, which is the defect in one assertion', async () => {
    const noisy: JWK = {
      ...RFC7638_EXAMPLE,
      use: 'sig',
      // WebCrypto's two additions — the exact pair that made `kid` differ from the thumbprint.
      ...({ key_ops: ['verify'], ext: true } as Partial<JWK>),
    };
    expect(await jwkThumbprint(noisy)).toBe(RFC7638_EXPECTED);
  });

  it('ignores the order the members arrive in, because §3.2 fixes the order of the output', async () => {
    // Same key, members supplied back to front. Insertion order must not reach the digest.
    const reversed: JWK = {
      kid: RFC7638_EXAMPLE.kid,
      alg: RFC7638_EXAMPLE.alg,
      e: RFC7638_EXAMPLE.e,
      n: RFC7638_EXAMPLE.n,
      kty: RFC7638_EXAMPLE.kty,
    };
    expect(await jwkThumbprint(reversed)).toBe(RFC7638_EXPECTED);
  });
});

describe('jwkThumbprint — EC keys, which is what this repo actually generates', () => {
  it('is stable across the tags and export artefacts a key picks up', async () => {
    const pair = await generateP256KeyPair();
    const bare: JWK = {
      kty: pair.publicKey.kty,
      crv: pair.publicKey.crv,
      x: pair.publicKey.x,
      y: pair.publicKey.y,
    };
    // The generated key carries `kid`, plus `key_ops` and `ext` from the WebCrypto export. None of them
    // may move the digest — otherwise a key is bound to one representation of itself.
    expect(await jwkThumbprint(pair.publicKey)).toBe(await jwkThumbprint(bare));
  });

  it('gives the public and private halves the same thumbprint, since `d` is not a required member', async () => {
    const pair = await generateP256KeyPair();
    expect(await jwkThumbprint(pair.privateKey)).toBe(await jwkThumbprint(pair.publicKey));
  });

  it('distinguishes two different keys', async () => {
    const [a, b] = await Promise.all([generateP256KeyPair(), generateP256KeyPair()]);
    expect(await jwkThumbprint(a.publicKey)).not.toBe(await jwkThumbprint(b.publicKey));
  });

  /**
   * **The assertion this file was written for.**
   *
   * `kid` and `jkt` are different values computed over different inputs. `kid` identifies a key; `jkt`
   * binds a token to one. Sending `kid` where RFC 9449 §10 wants `jkt` is a MUST reject at the token
   * endpoint, and it looks entirely correct in a code review — both are base64url SHA-256 digests of
   * "the key".
   */
  it('is NOT the `kid` the generator derives — the confusion that caused all of this', async () => {
    const pair = await generateKeyPair();
    expect(pair.kid, 'a kid is still expected, just not as a thumbprint').toBeTruthy();
    expect(
      await jwkThumbprint(pair.publicKey),
      'if these are ever equal, `kid` has silently become a thumbprint and change 1 can be deleted',
    ).not.toBe(pair.kid);
  });
});

describe('jwkThumbprint — refusing rather than guessing', () => {
  it('throws on an EC key with no `y`, instead of hashing a partial object', async () => {
    // `JSON.stringify` drops an undefined member without complaint, so the naive implementation returns
    // a perfectly well-formed digest that matches nothing and explains nothing.
    await expect(jwkThumbprint({ kty: 'EC', crv: 'P-256', x: 'xxx' })).rejects.toThrow(
      /missing "y"/,
    );
  });

  it('throws on an RSA key with no `n`', async () => {
    await expect(jwkThumbprint({ kty: 'RSA', e: 'AQAB' })).rejects.toThrow(/missing "n"/);
  });

  it('throws on an empty-string member, which is absence wearing a disguise', async () => {
    await expect(jwkThumbprint({ kty: 'oct', k: '' })).rejects.toThrow(/missing "k"/);
  });

  it('throws on a key type RFC 7638 §3.2 does not define', async () => {
    await expect(jwkThumbprint({ kty: 'OKP', crv: 'Ed25519', x: 'abc' })).rejects.toThrow(
      /kty "OKP"/,
    );
  });

  it('throws when `kty` is absent altogether', async () => {
    await expect(jwkThumbprint({ x: 'abc', y: 'def' })).rejects.toThrow(/\(absent\)/);
  });
});
