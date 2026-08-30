export interface JWK {
  kty?: string;
  kid?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  alg?: string;
  use?: string;
  /** RSA modulus and exponent, and the `oct` symmetric key — needed by `jwkThumbprint`. */
  n?: string;
  e?: string;
  k?: string;
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
 * The RFC 7638 JWK Thumbprint, SHA-256, base64url — the value `dpop_jkt` and `cnf.jkt` both carry.
 *
 * **This is not `kid`, and the difference is why this function exists.** `generateP256KeyPair` below
 * derives `kid` as the digest of `JSON.stringify(exportedPublicJwk)` — an object WebCrypto exports
 * carrying `key_ops` and `ext`, in insertion order. That is a perfectly good *identifier* and a wrong
 * *thumbprint*: measured on one real P-256 key, `kid` was `7dFqQh4RTWRaZ-Lokajf7cBLhpsadZS8Rw_yQ8UCYEs`
 * and the thumbprint `R05VIe6r11s2N4MDumjT4cNecENRuYc8JMc4kXuefbE`.
 *
 * `AuthFlowsSection` passed `kid` as `dpop_jkt`, which RFC 9449 §10 makes a **MUST reject** at the token
 * endpoint: *"the authorization server computes the JWK Thumbprint of the proof-of-possession public key
 * in the DPoP proof and verifies that it matches the `dpop_jkt` parameter value in the authorization
 * request. If they do not match, it MUST reject the request."* It was harmless only because the
 * parameter was never actually sent.
 *
 * **RFC 7638** (*"JSON Web Key (JWK) Thumbprint"*, Standards Track, September 2015) §3.2 fixes the
 * required members per key type, *"ordered lexicographically by the Unicode code points of the member
 * names"*, and §3.1 requires the JSON be built *"with no whitespace or line breaks before or after any
 * syntactic elements"* before hashing *"the octets of the UTF-8 representation"*.
 *
 * | `kty` | Required members, in the order they must appear |
 * |---|---|
 * | `EC`  | `crv`, `kty`, `x`, `y` |
 * | `RSA` | `e`, `kty`, `n` |
 * | `oct` | `k`, `kty` |
 *
 * Two rules not to undo:
 *
 * - **The members are named, never copied-and-pruned.** A `{ ...jwk }` with deletions is a denylist, and
 *   the next member WebCrypto adds to its export would silently join the digest — which is precisely the
 *   bug this replaces. Same reasoning as the allowlist on `/api/jar/process`.
 * - **A missing required member throws.** Hashing a partial object yields a well-formed, confidently
 *   wrong digest that matches nothing and explains nothing — this bug's failure mode, one layer down.
 *   `JSON.stringify` would simply omit an `undefined` and hand back a plausible string.
 */
export async function jwkThumbprint(jwk: JWK): Promise<string> {
  const required = requiredMembers(jwk);
  const canonical = `{${required.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',')}}`;
  return base64UrlEncode(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)),
  );
}

/** The §3.2 members for this key type, in lexicographic order, with every one present. */
function requiredMembers(jwk: JWK): [string, string][] {
  const names = MEMBERS_BY_KTY[jwk.kty ?? ''];
  if (!names) {
    throw new Error(
      `Cannot compute a JWK thumbprint for kty "${jwk.kty ?? '(absent)'}" — RFC 7638 §3.2 defines the required members for EC, RSA and oct only.`,
    );
  }
  return names.map((name) => {
    const value = jwk[name];
    if (typeof value !== 'string' || value === '') {
      throw new Error(
        `JWK is missing "${name}", which RFC 7638 §3.2 requires for a ${jwk.kty} thumbprint. Hashing without it would produce a valid-looking digest that matches nothing.`,
      );
    }
    return [name, value];
  });
}

/** Lexicographic by Unicode code point, per §3.2 — the order is the specification, not a convention. */
const MEMBERS_BY_KTY: Record<string, (keyof JWK)[]> = {
  EC: ['crv', 'kty', 'x', 'y'],
  RSA: ['e', 'kty', 'n'],
  oct: ['k', 'kty'],
};

/**
 * Generate a P-256 key pair and export both halves as JWKs, with a thumbprint-style `kid`.
 *
 * **"Thumbprint-style" is doing real work in that sentence — this `kid` is not an RFC 7638 thumbprint.**
 * When you need one, call `jwkThumbprint` above; the two values differ and confusing them is a
 * MUST-reject at the token endpoint.
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

/**
 * Sign a compact JWS with an ES256 (P-256) private JWK.
 *
 * Extracted because this file's consumers were about to hold a **third** copy of the same eight
 * lines: `dpop.service.ts` signs a proof, `client-assertion.service.ts` signs a `private_key_jwt`,
 * and `createRequestObject` signs a JAR request object. All three build `b64(header).b64(payload)`,
 * sign it with ECDSA/SHA-256 and append the raw signature — the only thing that differs is what goes
 * in the header and payload.
 *
 * **The raw signature is the part worth naming.** `crypto.subtle.sign` with ECDSA returns the r‖s
 * concatenation that JWS requires (RFC 7515 Appendix A.3), *not* the DER-wrapped form
 * `openssl`/Node's `createSign` produce by default. A verifier handed DER rejects the signature as
 * malformed, and the error says nothing about encoding — so this is a difference worth having in one
 * place rather than three.
 *
 * `dpop.service.ts` is deliberately left alone: its proof builder carries nonce and `ath` handling
 * around the signature, and rewriting a working DPoP path was not worth the blast radius here.
 */
export async function signEs256Jws(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyJwk: JWK,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const message = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    message,
  );

  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}
