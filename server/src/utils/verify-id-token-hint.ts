import jwt from "jsonwebtoken";
import type { Algorithm } from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";

/**
 * Verify an `id_token_hint` supplied to the RP-Initiated Logout endpoint.
 *
 * **OpenID Connect RP-Initiated Logout 1.0 §2** defines `id_token_hint` as an *"ID Token previously issued
 * by the OP"*. An ID Token is a signed assertion, so its value is its signature — which means a hint that is
 * merely *decoded* carries no information about who the End-User is.
 *
 * Before this existed, `logout.service.ts` used `jwt.decode` and took `payload.sub` as the subject. That
 * subject drives back-channel logout delivery, so an unauthenticated caller could hand-craft an unsigned JWT
 * naming any subject and call `GET /api/logout?backchannel=true&id_token_hint=<forged>` to force logout for
 * that user at every RP with a registered `backchannel_logout_uri`. It was inert only because no client had
 * registered one.
 *
 * This function is deliberately **pure** — the caller supplies the key set and the expected issuer — so every
 * branch below is directly testable without network or SDK access.
 *
 * Failure always yields `{ subject: undefined, reason }`. It never throws and never partially succeeds: the
 * caller treats an unverifiable hint as *"no subject"*, never as an attacker-chosen one.
 */

/**
 * The asymmetric algorithms `jsonwebtoken@9` supports (`verify.js:10-18` — `RS*`, `PS*`, `ES*`, `HS*`, and
 * no `EdDSA`). Pinning here rather than trusting the token's header is the defence Module 08 teaches as
 * *"expected `alg` from config, not the token"*.
 *
 * `HS*` is excluded on purpose, and it has a live consequence. `HS256` is symmetric — keyed on the client's
 * own secret — so this server cannot verify it without pulling a client secret into the logout path. Probe 2
 * §7 recorded `idTokenSignAlg` as `ES256` on two clients and **`HS256` on client `1523514379`**; hints from
 * that client are therefore treated as unverifiable. Logout still works for its users via the session
 * cookie; only the hint is ignored. The fix is to move that client to an asymmetric algorithm.
 *
 * `none` is excluded by construction: it appears in no allowlist, so `jwt.verify` rejects it.
 *
 * If the service ever signs with `EdDSA`, verification fails closed here rather than silently accepting —
 * `jsonwebtoken` cannot verify it at all.
 */
export const ID_TOKEN_HINT_ALGS: Algorithm[] = [
  "ES256",
  "ES384",
  "ES512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
];

/** A JWK as served by this service's JWKS. Only `kid` is read here; `jwk-to-pem` reads the rest. */
export interface HintVerificationJwk {
  kid?: string;
  kty?: string;
  [member: string]: unknown;
}

export interface VerifyIdTokenHintOptions {
  /** The OP's own key set. An empty set means nothing can be verified. */
  jwks: HintVerificationJwk[];
  /** Expected `iss`. Required — an empty value fails closed rather than skipping the check. */
  issuer: string;
  /** Expected `aud`, when the caller supplied `client_id`. Omitted leaves `aud` unpinned. */
  audience?: string;
}

export interface VerifyIdTokenHintResult {
  /** The verified `sub`, or `undefined` if the hint could not be verified. */
  subject?: string;
  /** Machine-readable cause, for logging only. Never returned to the caller of the logout endpoint. */
  reason?: string;
  /** True when the hint verified but is past its `exp`. Accepted deliberately — see below. */
  expired?: boolean;
  /**
   * The verified `aud`, when it names exactly one client.
   *
   * RP-Initiated Logout §2 makes `client_id` OPTIONAL, so a conformant request may identify its client only
   * through the hint — and the OP needs that identity to know whose registered `post_logout_redirect_uris`
   * to match against (§3). This is only ever set on a hint whose signature and `iss` verified, so it is an
   * assertion by the OP that the token was issued to this client, not a caller-supplied claim.
   *
   * An `aud` array with more than one entry yields `undefined`: which client is being named is ambiguous,
   * and the redirect decision fails closed rather than picking one.
   */
  audience?: string;
}

export function verifyIdTokenHint(
  hint: string,
  options: VerifyIdTokenHintOptions
): VerifyIdTokenHintResult {
  const { jwks, issuer, audience } = options;

  if (!hint) return { reason: "no_hint" };

  // Fail closed when we do not know what `iss` to expect. Accepting a hint with the issuer check disabled
  // would defeat the point: any OP's token — or a self-signed one — would then identify a subject here.
  if (!issuer) return { reason: "no_expected_issuer" };

  if (!jwks || jwks.length === 0) return { reason: "no_keys" };

  // Read the header only to choose a key. Nothing from this decode is trusted.
  let header: jwt.JwtHeader;
  try {
    const decoded = jwt.decode(hint, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.header) {
      return { reason: "malformed" };
    }
    header = decoded.header;
  } catch {
    return { reason: "malformed" };
  }

  // Reject the algorithm before touching a key, so `alg: none` and the `HS*` family produce a precise
  // reason rather than a generic verification failure.
  if (!header.alg || !ID_TOKEN_HINT_ALGS.includes(header.alg as Algorithm)) {
    return { reason: `unsupported_alg:${header.alg ?? "absent"}` };
  }

  // `kid` narrows to one key when present. Without it, every key is a candidate — the same fallback
  // `logout.controller.ts` uses for back-channel logout tokens.
  const candidates = header.kid ? jwks.filter((k) => k.kid === header.kid) : jwks;
  if (candidates.length === 0) return { reason: `unknown_kid:${header.kid}` };

  let lastError = "no_candidate_key";

  for (const jwk of candidates) {
    let pem: string;
    try {
      pem = jwkToPem(jwk as unknown as Parameters<typeof jwkToPem>[0]);
    } catch {
      // A key this library cannot convert (an unexpected `kty`, a malformed member) is skipped rather
      // than aborting the loop — another key in the set may still verify the hint.
      lastError = "jwk_conversion_failed";
      continue;
    }

    try {
      const payload = jwt.verify(hint, pem, {
        algorithms: ID_TOKEN_HINT_ALGS,
        issuer,
        ...(audience ? { audience } : {}),
        // A hint is by definition an *old* token: sessions here last 30 minutes and the ID token the RP
        // holds may be days older. Rejecting an expired hint would break the ordinary logout case, and the
        // signature still proves this OP issued it for this subject. Reported via `expired` so the caller
        // can log it.
        //
        // UNVERIFIED: whether RP-Initiated Logout §2 says anything explicit about expired hints has not
        // been checked against the primary source. This is stated as this deployment's decision, not as a
        // specification requirement.
        ignoreExpiration: true,
      });

      if (typeof payload === "string" || !payload) {
        lastError = "payload_not_an_object";
        continue;
      }

      const sub = payload.sub;
      if (typeof sub !== "string" || sub.length === 0) {
        return { reason: "no_sub" };
      }

      const exp = typeof payload.exp === "number" ? payload.exp : undefined;
      const expired = exp !== undefined && exp * 1000 < Date.now();

      // `aud` is a string or an array of them (RFC 7519 §4.1.3). A single-entry array is unambiguous and is
      // treated as the string form; anything longer names several clients and is left undefined.
      // Named `verifiedAudience`, not `audience`: the latter is the *expected* value destructured from
      // `options` above and used by `jwt.verify`, and shadowing it here is a temporal-dead-zone error.
      const rawAud = payload.aud;
      const verifiedAudience =
        typeof rawAud === "string"
          ? rawAud
          : Array.isArray(rawAud) && rawAud.length === 1 && typeof rawAud[0] === "string"
            ? rawAud[0]
            : undefined;

      return { subject: sub, expired, audience: verifiedAudience };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { reason: lastError };
}
