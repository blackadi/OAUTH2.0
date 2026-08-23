import { JWK, CryptoKeyPair, base64UrlEncode, generateP256KeyPair } from './crypto-utils';

export type DPoPKeyPair = CryptoKeyPair;

/**
 * A DPoP key: P-256, untagged.
 *
 * No `alg` or `use` on the JWK, deliberately — RFC 9449 §4.2 puts `alg` in the proof's JOSE header,
 * which `createProof` sets, and the `jwk` member carries the key itself. Tagging it here would be
 * harmless but redundant, and the difference from the signing key is the whole reason the shared
 * generator takes an `extras` argument rather than assuming one shape.
 *
 * Kept as a named wrapper rather than re-exporting `generateP256KeyPair`, so every existing importer
 * and every test keeps working unchanged.
 */
export async function generateKeyPair(): Promise<DPoPKeyPair> {
  return generateP256KeyPair();
}

export async function computeAth(accessToken: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  return base64UrlEncode(hash);
}

export async function createProof(
  privateKeyJwk: JWK,
  htm: string,
  htu: string,
  ath?: string,
  nonce?: string,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    // No cast: `JWK`'s members are all optional strings and structurally assignable to `JsonWebKey`.
    // This was `privateKeyJwk as any` with an eslint-disable, which turned a value the compiler could
    // check into one it could not — on the argument to a signing key import, of all places.
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );

  const now = Math.floor(Date.now() / 1000);

  const payload: Record<string, unknown> = {
    iat: now,
    jti: crypto.randomUUID(),
    htm,
    htu,
  };

  if (ath) {
    payload.ath = ath;
  }

  if (nonce) {
    payload.nonce = nonce;
  }

  const publicJwk = { ...privateKeyJwk };
  delete publicJwk.d;
  publicJwk.alg = 'ES256';
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: publicJwk };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const message = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    message,
  );

  // JWS/DPoP requires raw R||S (IEEE P1363) format, not DER
  const rawSignature = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(rawSignature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}
