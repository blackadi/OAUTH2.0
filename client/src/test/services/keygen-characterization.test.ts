import { describe, it, expect } from 'vitest';
import { generateKeyPair } from '@/services/dpop.service';
import { generateSigningKeyPair } from '@/services/client-assertion.service';
import { base64UrlEncode, type JWK } from '@/services/crypto-utils';

/**
 * What the two P-256 generators produce, pinned exactly.
 *
 * Written **before** de-duplicating them, so the refactor has to prove it changed nothing rather than
 * being taken on trust. `dpop.service.ts` is on AGENTS.md's security-critical list and its last defect —
 * DER-encoded signatures where JWS wants raw R‖S — cost real debugging time, so "it looks equivalent"
 * is not the standard.
 *
 * The subtle property, and the one a careless de-duplication would break: **`kid` is derived from the
 * exported public JWK *before* `alg` and `use` are attached.** Attaching them first would change every
 * signing key's `kid`, silently, and a `kid` is what a server uses to find the key.
 */

async function kidOver(jwk: JWK): Promise<string> {
  return base64UrlEncode(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(jwk))),
  );
}

describe('generateKeyPair (DPoP)', () => {
  it('produces a P-256 pair with matching kids and no private scalar in the public half', async () => {
    const pair = await generateKeyPair();
    expect(pair.publicKey.kty).toBe('EC');
    expect(pair.publicKey.crv).toBe('P-256');
    expect(pair.publicKey.x).toBeTruthy();
    expect(pair.publicKey.y).toBeTruthy();
    expect(pair.publicKey.d).toBeUndefined();
    expect(pair.privateKey.d).toBeTruthy();
    expect(pair.publicKey.kid).toBe(pair.kid);
    expect(pair.privateKey.kid).toBe(pair.kid);
  });

  it('carries no alg or use — the DPoP proof header supplies alg itself', async () => {
    const pair = await generateKeyPair();
    expect(pair.publicKey.alg).toBeUndefined();
    expect(pair.publicKey.use).toBeUndefined();
  });

  it('derives kid over the exported public JWK, kid excluded', async () => {
    const pair = await generateKeyPair();
    const withoutKid = { ...pair.publicKey };
    delete withoutKid.kid;
    expect(pair.kid).toBe(await kidOver(withoutKid));
  });
});

describe('generateSigningKeyPair (private_key_jwt)', () => {
  it('produces the same P-256 shape', async () => {
    const pair = await generateSigningKeyPair();
    expect(pair.publicKey.kty).toBe('EC');
    expect(pair.publicKey.crv).toBe('P-256');
    expect(pair.publicKey.d).toBeUndefined();
    expect(pair.privateKey.d).toBeTruthy();
    expect(pair.publicKey.kid).toBe(pair.kid);
    expect(pair.privateKey.kid).toBe(pair.kid);
  });

  it('tags both halves with alg ES256 and use sig', async () => {
    const pair = await generateSigningKeyPair();
    expect(pair.publicKey.alg).toBe('ES256');
    expect(pair.publicKey.use).toBe('sig');
    expect(pair.privateKey.alg).toBe('ES256');
    expect(pair.privateKey.use).toBe('sig');
  });

  it('derives kid BEFORE alg and use are attached — the ordering a refactor could silently break', async () => {
    const pair = await generateSigningKeyPair();

    const bare = { ...pair.publicKey };
    delete bare.kid;
    delete bare.alg;
    delete bare.use;
    expect(pair.kid).toBe(await kidOver(bare));

    // And explicitly not the other way round: attaching the tags first yields a different kid, so this
    // assertion fails loudly if the order is ever reversed.
    const tagged = { ...pair.publicKey };
    delete tagged.kid;
    expect(pair.kid).not.toBe(await kidOver(tagged));
  });
});

describe('both generators', () => {
  it('produce independent keys — one does not verify the other', async () => {
    const [dpop, signing] = await Promise.all([generateKeyPair(), generateSigningKeyPair()]);
    expect(dpop.kid).not.toBe(signing.kid);

    const message = new TextEncoder().encode('payload');
    const priv = await crypto.subtle.importKey(
      'jwk',
      dpop.privateKey as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, message);

    const own = await crypto.subtle.importKey(
      'jwk',
      dpop.publicKey as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const other = await crypto.subtle.importKey(
      'jwk',
      { ...signing.publicKey, alg: undefined, use: undefined } as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    expect(
      await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, own, signature, message),
    ).toBe(true);
    expect(
      await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, other, signature, message),
    ).toBe(false);
  });

  it('never repeat a key', async () => {
    const pairs = await Promise.all([
      generateKeyPair(),
      generateKeyPair(),
      generateSigningKeyPair(),
      generateSigningKeyPair(),
    ]);
    expect(new Set(pairs.map((p) => p.kid)).size).toBe(4);
  });
});
