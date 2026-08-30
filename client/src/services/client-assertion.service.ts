import { JWK, CryptoKeyPair, generateP256KeyPair, signEs256Jws } from './crypto-utils';

export type { JWK };

export type SigningKeyPair = CryptoKeyPair;

/**
 * A `private_key_jwt` signing key: P-256, tagged `alg: ES256, use: sig`.
 *
 * The tags matter here and not for DPoP, because this key is *published* — `getJwkSetDisplay` renders
 * it as a JWK Set for registration against the client, and a consumer of that set reads `use` to know
 * it is a signature key and `alg` to know how to verify. They are attached after the `kid` is derived,
 * which the shared generator preserves and `keygen-characterization.test.ts` asserts explicitly.
 */
export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  return generateP256KeyPair({ alg: 'ES256', use: 'sig' });
}

/**
 * A `private_key_jwt` client assertion (OpenID Connect Core §9).
 *
 * **`audience` is the authorization server's ISSUER IDENTIFIER, not the token endpoint URL**, and
 * this parameter used to be named `tokenEndpoint` and be given exactly that. Two independent reasons
 * it has to be the issuer here:
 *
 *   * FAPI 2.0 Security Profile §5.3.2.1 — the server *"shall only accept its issuer identifier
 *     value … as a string in the aud claim"*.
 *   * this deployment's Authlete service sets `clientAssertionAudRestrictedToIssuer: true`, so a
 *     token-endpoint `aud` is refused outright with
 *     `401 [A157356] The 'aud' claim value in the client assertion does not match the issuer identifier.`
 *
 * That was not a FAPI-only problem: `CallbackPage`'s `private_key_jwt` token exchange calls this too,
 * so every assertion this SPA has ever produced was rejected by this service. Measured, not inferred.
 *
 * **`nbf` is present because the service requires it** (`nbfOptional: false`). RFC 7523 §3 lists it as
 * optional, so its absence is legal in general and fatal here — the kind of gap that reads as a
 * signature problem when it is a claims problem.
 */
export async function createClientAssertion(
  privateKeyJwk: JWK,
  clientId: string,
  audience: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return signEs256Jws(
    { alg: 'ES256', kid: privateKeyJwk.kid, typ: 'JWT' },
    {
      iss: clientId,
      sub: clientId,
      aud: audience,
      exp: now + 300,
      iat: now,
      nbf: now,
      jti: crypto.randomUUID(),
    },
    privateKeyJwk,
  );
}

/**
 * A signed request object — JAR, RFC 9101 — for the FAPI 2.0 Message Signing Profile.
 *
 * The Message Signing Profile requires the authorization request parameters to travel as a JWS rather
 * than as bare query parameters, and Authlete enforces it per client (`requestObjectRequired`) and per
 * scope (the `fapi2: ms-authreq` scope attribute). Without one, PAR answers
 * `400 invalid_request`.
 *
 * Three details that are easy to get wrong and each produce a different unhelpful error:
 *
 *   * **`typ: 'oauth-authz-req+jwt'`** — RFC 9101 §4 names this media type for a request object, and
 *     it is how a server tells one apart from any other JWT the client might send.
 *   * **`client_id` must ALSO travel outside the JWT.** RFC 9126 §3 needs it to find the client and
 *     its keys *before* it can verify the object, so a PAR body carrying only `request` cannot be
 *     authenticated. `use-fapi-flow.ts` sends both; this function only builds the JWT.
 *   * **`alg` must be PS256, ES256 or EdDSA, never `none`** (FAPI 2.0 §5.4.1). ES256 here, matching
 *     the client's registered `requestSignAlg` — verified live: RS256 and HS256 are both refused with
 *     *"Another algorithm expected"*, which is a different error from a bad signature.
 *
 * `aud` is the issuer for the same reason the assertion's is.
 */
export async function createRequestObject(
  privateKeyJwk: JWK,
  clientId: string,
  audience: string,
  params: Record<string, string>,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return signEs256Jws(
    { alg: 'ES256', kid: privateKeyJwk.kid, typ: 'oauth-authz-req+jwt' },
    {
      ...params,
      iss: clientId,
      aud: audience,
      exp: now + 300,
      iat: now,
      nbf: now,
      jti: crypto.randomUUID(),
    },
    privateKeyJwk,
  );
}

/**
 * The public key as a JWK Set, for pasting into Authlete Console → Client → JWK Set.
 *
 * Members are named rather than the key being rendered as exported, for the same reason `createProof`
 * builds its header key that way: `crypto.subtle.exportKey('jwk', …)` adds `key_ops` and `ext`, and
 * `ext` is not a registered JWK member at all. They were being published to the authorization server as
 * part of a key set a human is told to register by hand.
 *
 * **Nothing about an already-registered key changes**: `kid` and the key material are byte-identical
 * and only those two extra members go, so a key registered from the old output still matches a
 * signature made with it.
 */
export function getJwkSetDisplay(publicKey: JWK): string {
  const published: JWK = {
    kty: publicKey.kty,
    crv: publicKey.crv,
    x: publicKey.x,
    y: publicKey.y,
    ...(publicKey.use ? { use: publicKey.use } : {}),
    ...(publicKey.alg ? { alg: publicKey.alg } : {}),
    ...(publicKey.kid ? { kid: publicKey.kid } : {}),
  };
  return JSON.stringify({ keys: [published] }, null, 2);
}
