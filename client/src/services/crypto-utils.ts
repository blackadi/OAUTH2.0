export interface JWK {
  kty?: string;
  kid?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  alg?: string;
  use?: string;
}

export interface CryptoKeyPair {
  publicKey: JWK;
  privateKey: JWK;
  kid: string;
}

export function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Generate a P-256 key pair and export both halves as JWKs, with a thumbprint-style `kid`.
 *
 * Both callers needed exactly this and each had its own copy — twenty identical lines in
 * `dpop.service.ts` and `client-assertion.service.ts`, differing only in whether the result is tagged
 * `alg: ES256, use: sig`.
 *
 * **`kid` is derived before `extras` are attached, and that ordering is load-bearing.** The signing
 * variant tags its JWKs after the digest is taken, so its `kid` is the hash of the *bare* exported key.
 * Folding the tags in first would change every signing key's `kid` — silently, since nothing about the
 * key would look wrong — and a `kid` is what a server uses to find the key that verifies a signature.
 * Pinned in `keygen-characterization.test.ts`, which was written against the duplicated version first
 * so this refactor had to prove it changed nothing.
 *
 * P-256 / ES256 throughout: it is what RFC 9449 §4.2 proofs use here, what the DPoP proof builder
 * signs with, and what `client_secret_jwt`'s asymmetric sibling is configured for on this service.
 */
export async function generateP256KeyPair(extras: Partial<JWK> = {}): Promise<CryptoKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  const publicJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JWK;
  const privateJwk = (await crypto.subtle.exportKey('jwk', keyPair.privateKey)) as JWK;

  const kid = base64UrlEncode(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(publicJwk))),
  );

  return {
    publicKey: { ...publicJwk, kid, ...extras },
    privateKey: { ...privateJwk, kid, ...extras },
    kid,
  };
}
