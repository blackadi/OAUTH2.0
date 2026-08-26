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

  /**
   * The public half, built by naming its members — never by copying the private key and deleting.
   *
   * This was `{ ...privateKeyJwk }` with `delete publicJwk.d`, and the spread carried two members the
   * `JWK` type does not model and so could not warn about. Measured on a real key, the header went out
   * as:
   *
   * ```json
   * {"key_ops":["sign"],"ext":true,"kty":"EC","x":"…","y":"…","crv":"P-256","kid":"…","alg":"ES256"}
   * ```
   *
   * `key_ops: ["sign"]` came from the exported **private** key, so the public key in the proof
   * advertised a private-key operation — RFC 7517 §4.3 requires `use` and `key_ops` to convey
   * consistent information. `ext` is a WebCrypto artefact and not a registered JWK member at all.
   * Authlete accepts either form, and RFC 7638 ignores both members when computing an `EC` thumbprint,
   * so **the `cnf.jkt` binding is identical before and after** — this is correctness of the key we
   * publish, not of the binding.
   *
   * The allowlist also makes it structurally impossible for `d` to appear, which the `delete` achieved
   * only by remembering to remove it. `kid` is carried when present: it identifies the key and is
   * excluded from the thumbprint, so it is free.
   */
  const publicJwk: JWK = {
    kty: privateKeyJwk.kty,
    crv: privateKeyJwk.crv,
    x: privateKeyJwk.x,
    y: privateKeyJwk.y,
    alg: 'ES256',
    ...(privateKeyJwk.kid ? { kid: privateKeyJwk.kid } : {}),
  };
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
