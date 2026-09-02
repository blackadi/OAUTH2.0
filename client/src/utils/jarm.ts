import { decodeJwt, verifyJwt, type Jwk } from './jwt';

/**
 * Unwrap a JARM authorization response — the single `response` parameter that arrives under
 * `response_mode=jwt`.
 *
 * **Why this is needed at all.** Once a scope carries Authlete's `fapi2: ms-authres` attribute the
 * authorization response is a signed JWT and there is *no* bare `code`, `state` or `iss` on the query
 * string. `CallbackPage` read all three straight off `url.searchParams`, so a correct JARM response
 * would have been reported as `Missing authorization code in callback URL` — the failure mode
 * `scripts/fapi2-conformance.mjs` hit in three separate places before it learned to look for
 * `response` first.
 *
 * **Verified, not merely decoded.** The temptation is to `decodeJwt` and read the claims, because they
 * are legible and the flow then works. That would make the callback trust `code`, `state` and `iss`
 * from an unauthenticated string — and it would do it in the one file a learner opens to see how
 * response-to-request binding is done, which is where this app has already been caught modelling the
 * mistake it teaches (see the fail-closed `state` note in `CallbackPage`). A JARM response whose
 * signature does not verify is treated as no response at all.
 *
 * **Pure on purpose.** The JWK Set is passed in rather than fetched here, so every branch below is
 * testable without a network stub, and a JWKS that cannot be fetched stays a *different* failure from
 * a signature that does not verify — the distinction `JwtInspector` already makes.
 */

/**
 * The algorithms FAPI 2.0 Message Signing §5.4.1 permits — the same set
 * `scripts/fapi2-conformance.mjs` asserts against a live response.
 *
 * `EdDSA` is in the set and is currently unreachable: `verifyJwt` has no browser verifier for it, so
 * such a token is refused one step earlier with `unsupported`. Listed anyway because this set states
 * the profile, not this app's capabilities — and because the *reachable* subset is a property of
 * `utils/jwt.ts` that may widen later. Note also that this deployment advertises
 * `authorization_signing_alg_values_supported` as `HS256, HS512, ES256, HS384`, so ES256 is the only
 * permitted algorithm it can actually sign with; an `HS*` response cannot be verified by a browser at
 * all and `verifyJwt` says so in those words.
 */
const FAPI_MS_ALGS = new Set(['PS256', 'ES256', 'EdDSA']);

/**
 * Clock skew tolerated on `exp`.
 *
 * A browser clock is routinely a few seconds off the server's, and an authorization response is
 * short-lived by design — so a zero-tolerance comparison turns a working flow into an expiry error on
 * a machine nobody has synchronised. Tolerance is one-directional: it accepts a token that has *just*
 * expired, never one that is not yet valid.
 */
const EXP_LEEWAY_SECONDS = 30;

export type JarmOutcome =
  | {
      ok: true;
      /** The response parameters, as the rest of the callback expects to read them. */
      params: URLSearchParams;
      alg: string;
    }
  | { ok: false; error: string };

export interface JarmExpectations {
  /** The authorization server's issuer identifier, compared to `iss` as a whole string. */
  issuer: string;
  /** This client's `client_id`, which JARM §4.1 requires in `aud`. */
  clientId: string;
}

export async function readJarmResponse(
  token: string,
  jwks: Jwk[],
  expected: JarmExpectations,
): Promise<JarmOutcome> {
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwt(token).payload;
  } catch (e) {
    return {
      ok: false,
      error: `The \`response\` parameter is not a decodable JWS: ${
        e instanceof Error ? e.message : 'could not decode'
      }`,
    };
  }

  const outcome = await verifyJwt(token, jwks);
  if (outcome.status !== 'valid') {
    return {
      ok: false,
      error: `The authorization response is a JWT (JARM) whose signature was not verified — ${outcome.status}, alg=${outcome.alg}: ${outcome.reason} Nothing inside it can be trusted, so the flow stops here rather than reading a code out of an unauthenticated string.`,
    };
  }
  if (!FAPI_MS_ALGS.has(outcome.alg)) {
    return {
      ok: false,
      error: `The authorization response is signed with ${outcome.alg}, which FAPI 2.0 Message Signing §5.4.1 does not permit — it allows PS256, ES256 and EdDSA. The signature verifies; the algorithm is the objection.`,
    };
  }

  /**
   * `iss` is compared as a whole string, not by origin.
   *
   * `CallbackPage` compares the *query* `iss` by origin because it has only `API_BASE_URL` to compare
   * against, which need not equal the issuer identifier. Here the caller passes `ISSUER` — the exact
   * value of `issuer` in the discovery document — so the stronger check is available and is the one
   * JARM §4.1 describes. It is also what the conformance probe asserts (`claims.iss === ISSUER`).
   */
  if (typeof claims.iss !== 'string' || claims.iss !== expected.issuer) {
    return {
      ok: false,
      error: `The signed authorization response reports iss=${JSON.stringify(claims.iss)}, but this app is configured for "${expected.issuer}". A validly signed response from the wrong issuer is precisely the mix-up case this check exists for.`,
    };
  }

  const { aud } = claims;
  const audienceMatches =
    typeof aud === 'string'
      ? aud === expected.clientId
      : Array.isArray(aud) && aud.includes(expected.clientId);
  if (!audienceMatches) {
    return {
      ok: false,
      error: `The signed authorization response is addressed to aud=${JSON.stringify(aud)}, not to this client ("${expected.clientId}"). A response minted for another client must not be accepted here.`,
    };
  }

  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
    return {
      ok: false,
      error:
        'The signed authorization response carries no usable `exp`, which JARM §4.1 requires. Without one there is no bound on how long it could be replayed.',
    };
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp + EXP_LEEWAY_SECONDS < now) {
    return {
      ok: false,
      error: `The signed authorization response expired ${now - claims.exp}s ago (exp=${claims.exp}). Start the flow again — a replayed response is what this bound is for.`,
    };
  }

  /**
   * Every string claim becomes a parameter, rather than an allowlist of the ones we expect.
   *
   * JARM puts the *authorization response* inside the JWT, so `code`, `state`, `iss`, `error`,
   * `error_description` and `error_uri` all arrive as claims and every one of them is read downstream
   * by name. An allowlist here would silently drop a parameter a future flow sends — the failure this
   * whole change exists to fix was one missing parameter nobody could see. `aud` and the JWT-mechanics
   * claims come along harmlessly: nothing reads them, and `exp`/`iat` are numbers and so are skipped.
   */
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(claims)) {
    if (typeof value === 'string') params.set(name, value);
  }

  return { ok: true, params, alg: outcome.alg };
}
