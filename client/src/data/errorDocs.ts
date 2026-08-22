/**
 * Turn an OAuth error code or an Authlete result code into a cause, a fix, and a place to read more.
 *
 * **This is the one thing neither oauthdebugger.com nor oauth.tools can do**, and the reason is
 * structural rather than a gap in their effort: neither knows which authorization server you are
 * talking to, so neither can tell you that `[A157357]` means your credentials went down the wrong
 * channel for *this client's* registered authentication method. This deployment knows exactly which
 * server it is talking to.
 *
 * **Three sources, kept apart on purpose.**
 *
 * 1. `AUTHLETE_CODES` (generated) — the vendor's own `resultMessage`, extracted mechanically from
 *    `docs/openapi-spec.json`. Never paraphrased.
 * 2. `AUTHLETE_NOTES` (below) — guidance for the codes this repo has *reproduced live*, each carrying
 *    the finding it came from. **The two sets are disjoint, and that was measured rather than assumed:**
 *    of the 38 codes the vendor document carries and the 25 established here by probing, the overlap is
 *    **zero**. Authlete's examples are almost all generic or success cases; every code a developer
 *    actually hits on this deployment — `A157357`, `A124301`, `A089311`, `A404301` and the rest — comes
 *    from the second list. A decoder built from the vendor document alone would explain nothing useful.
 *    Asserted in `decode-error.test.ts` so a spec bump that changes it is visible.
 * 3. `OAUTH_ERRORS` (below) — the specification error codes, cited against the primary source.
 *
 * A code in none of the three is reported as unrecognised. An invented explanation in a teaching tool
 * is worse than no explanation, because the reader has no way to tell which they were given.
 */

export interface ErrorDoc {
  /** One line on what the condition actually is. */
  cause: string;
  /** What to do about it. Omitted where there is nothing honest to say. */
  fix?: string;
  /** Where it is defined, or where in this repo it was established. */
  spec: string;
}

// ── specification error codes ────────────────────────────────────────────────────────────────────

/**
 * Verified against the primary sources on 2026-08-21: RFC 6749 §4.1.2.1 and §5.2, RFC 6750 §3.1,
 * RFC 9449 §8, RFC 9470 §3, RFC 8707, RFC 9396.
 *
 * One caveat recorded rather than papered over: RFC 6749 §5.2's verbatim sentence for `invalid_client`
 * could not be retrieved in full, so its entry describes the condition instead of quoting. The 401-vs-400
 * latitude *was* confirmed.
 */
export const OAUTH_ERRORS: Record<string, ErrorDoc> = {
  invalid_request: {
    cause:
      'Missing a required parameter, an invalid parameter value, a parameter sent more than once, or otherwise malformed.',
    fix: 'Compare the request against the parameter list for the endpoint you are calling. At a protected resource this also covers presenting the token by more than one method at once.',
    spec: 'RFC 6749 §4.1.2.1, §5.2 · RFC 6750 §3.1',
  },
  invalid_client: {
    cause:
      'Client authentication failed — an unknown client, no client authentication at all, or an authentication method the server does not accept for this client.',
    fix: 'Check *where* the credentials travelled, not just whether they are correct: this server matches the channel against the client\'s registered method. See A157357 below — the correct secret in the wrong channel is a 401.',
    spec: 'RFC 6749 §5.2 (401 permitted, 400 otherwise)',
  },
  invalid_grant: {
    cause:
      'The grant is invalid, expired, revoked, does not match the redirection URI from the original request, or was issued to another client.',
    fix: 'Authorization codes are single-use and short-lived. Check that `redirect_uri` is byte-identical to the one in the authorization request, and that the PKCE verifier matches the challenge that was sent.',
    spec: 'RFC 6749 §5.2',
  },
  unauthorized_client: {
    cause: 'The authenticated client is not authorized to use this grant type or this method.',
    fix: 'The grant type has to be enabled for the client *and* supported by the service. Check both.',
    spec: 'RFC 6749 §4.1.2.1, §5.2',
  },
  unsupported_grant_type: {
    cause: 'The authorization server does not support this grant type.',
    spec: 'RFC 6749 §5.2',
  },
  unsupported_response_type: {
    cause: 'The authorization server will not issue a code or token by this method.',
    spec: 'RFC 6749 §4.1.2.1',
  },
  invalid_scope: {
    cause:
      'The requested scope is invalid, unknown, malformed, or exceeds what the resource owner granted.',
    fix: 'A scope must be registered on the service and requestable by the client. This service also sets `scopeRequired`, so an empty scope is refused rather than defaulted.',
    spec: 'RFC 6749 §4.1.2.1, §5.2',
  },
  access_denied: {
    cause: 'The resource owner or the authorization server refused the request.',
    fix: 'In the device flow this is what a denial looks like on the next poll — the approval itself returns success and the refusal surfaces here.',
    spec: 'RFC 6749 §4.1.2.1',
  },
  server_error: {
    cause: 'The authorization server hit an unexpected condition.',
    spec: 'RFC 6749 §4.1.2.1',
  },
  temporarily_unavailable: {
    cause: 'The authorization server is overloaded or under maintenance.',
    spec: 'RFC 6749 §4.1.2.1',
  },
  invalid_token: {
    cause: 'The access token is expired, revoked, malformed, or invalid for some other reason.',
    fix: 'Introspect it. A DPoP-bound token presented as `Bearer` also lands here — the binding is checked before the token is accepted.',
    spec: 'RFC 6750 §3.1 (401 recommended)',
  },
  insufficient_scope: {
    cause: 'The request needs more privilege than the token carries.',
    spec: 'RFC 6750 §3.1 (403 recommended)',
  },
  use_dpop_nonce: {
    cause:
      'The server requires a nonce in the DPoP proof, and either none was sent or the one sent is stale. A fresh nonce is in the `DPoP-Nonce` response header.',
    fix: 'Re-sign the proof with that nonce and retry — the nonce is inside the signature, so it cannot be patched in. It is time-based, not one-time, so cache and reuse it. Note the status differs by who answered: 400 at the token endpoint or PAR, 401 at a protected resource.',
    spec: 'RFC 9449 §8 (AS) · §9 (resource server)',
  },
  invalid_dpop_proof: {
    cause: 'The DPoP proof itself is malformed, unverifiable, or does not match the request.',
    fix: 'Check `htu` excludes the query string, `htm` matches the method, and `ath` (not `sub`) carries the access-token hash. A *stale nonce* is `use_dpop_nonce`, not this.',
    spec: 'RFC 9449',
  },
  insufficient_user_authentication: {
    cause:
      'The token is valid but the authentication behind it is not strong or recent enough for what was asked.',
    fix: 'The challenge names `acr_values` or `max_age`. Re-authorize asking for those — as an *essential* claim via the `claims` parameter if it must be enforced rather than merely preferred.',
    spec: 'RFC 9470 §3',
  },
  invalid_target: {
    cause: 'The `resource` value is not acceptable.',
    fix: 'It MUST be an absolute URI and MUST NOT carry a fragment. Verified live on this server: a relative value gives `[A251307]`, a fragment gives `[A251308]`.',
    spec: 'RFC 8707 §2 (Resource Indicators for OAuth 2.0)',
  },
  invalid_authorization_details: {
    cause: 'The `authorization_details` document was refused.',
    fix: 'Each object requires a `type`, and the type must be one the service knows. On this service every other type is refused with `[A249302]`.',
    spec: 'RFC 9396 (OAuth 2.0 Rich Authorization Requests)',
  },
  authorization_pending: {
    cause: 'Not an error: the user has not finished approving yet.',
    fix: 'Keep polling at the interval the server gave you. This is the normal state of a device-flow or CIBA poll loop.',
    spec: 'RFC 8628 §3.5 · CIBA Core',
  },
  slow_down: {
    cause: 'You are polling too fast.',
    fix: 'Add 5 seconds to your interval and carry on — the poll is still live.',
    spec: 'RFC 8628 §3.5',
  },
  expired_token: {
    cause: 'The device code or authorization request expired before it was approved.',
    fix: 'Start again. Stop polling — this one is terminal.',
    spec: 'RFC 8628 §3.5',
  },
};

// ── Authlete result codes established live in this repo ──────────────────────────────────────────

export interface AuthleteNote extends ErrorDoc {
  /**
   * True where this repo reproduced the behaviour against the live service rather than reading it out
   * of a document. Most of these codes are **not** in the vendored OpenAPI document at all.
   */
  verifiedHere: boolean;
}

export const AUTHLETE_NOTES: Record<string, AuthleteNote> = {
  A157357: {
    cause:
      'The client identifier was not where Authlete expected it. The credentials may be entirely correct — this is about the *channel* they arrived on, not their value.',
    fix: 'Match the channel to the client\'s registered `tokenAuthMethod`: a `client_secret_basic` client must use the `Authorization: Basic` header, a `client_secret_post` client must put `clientId`/`clientSecret` in the body. Getting it backwards is a 401 in both directions.',
    spec: 'Verified live 2026-08-05 (PAR) and 2026-08-13 (CIBA) — see the two-channel table in AGENTS.md',
    verifiedHere: true,
  },
  A124301: {
    cause: 'PKCE is required for this client and the authorization request carried no `code_challenge`.',
    fix: 'Send `code_challenge` with `code_challenge_method=S256`. Two clients here enforce PKCE and two deliberately do not, so the same request succeeds or fails depending on which client you use — that difference is what Modules 02 and 03 teach.',
    spec: 'Verified live 2026-08-13 · RFC 9700 §2.1.1 (BCP 240) requires PKCE',
    verifiedHere: true,
  },
  A124308: {
    cause: '`code_challenge_method=plain` was sent to a client that requires `S256`.',
    fix: 'Use `S256`. `plain` sends the verifier itself, which defeats the point — and RFC 7636 makes `plain` the *default* when the parameter is absent, which is why omitting it is not a safe shortcut.',
    spec: 'Verified live 2026-08-13 · RFC 7636 §4.2',
    verifiedHere: true,
  },
  A089311: {
    cause: 'A DPoP-bound access token was presented at UserInfo without a DPoP proof.',
    fix: 'Send `Authorization: DPoP <token>` plus a `DPoP:` proof header. RFC 9449 §7.1 gives no alternative for a bound token, and §7.2 requires the refusal you just got. This is enforced by Authlete, not by this server.',
    spec: 'Verified live 2026-08-04 at /auth/userinfo · RFC 9449 §7.2',
    verifiedHere: true,
  },
  A065308: {
    cause: 'The same DPoP downgrade, refused at the introspection API.',
    fix: 'As A089311 — the `DPoP` scheme plus a proof. Note the code differs per API for one condition.',
    spec: 'Verified live 2026-08-12 at /auth/introspection',
    verifiedHere: true,
  },
  A281305: {
    cause: 'The same DPoP downgrade again, at the Grant Management API.',
    fix: 'A protected-resource call must forward the proof to *every* Authlete API it makes. `/api/gm` makes two — the ownership introspection and `/gm` — and both check the binding independently, so passing the first and omitting the second just moves the 401 one call later. The same proof serves both.',
    spec: 'Verified live 2026-08-12 at /gm',
    verifiedHere: true,
  },
  A254307: {
    cause: 'DPoP nonce mismatch at the **token endpoint**.',
    fix: 'Match on `error: use_dpop_nonce`, never on this code — PAR answers the identical condition with `[A350308]`. Also: the message says the nonce "is different from the expected one" even when none was sent at all, so do not go looking for a value you never supplied.',
    spec: 'Verified live 2026-08-15 · RFC 9449 §8',
    verifiedHere: true,
  },
  A350308: {
    cause: 'DPoP nonce mismatch at **PAR** — the same condition as A254307, different code.',
    fix: 'One condition, two vendor codes. Switch on the `error` value.',
    spec: 'Verified live 2026-08-17 at /pushed_auth_req',
    verifiedHere: true,
  },
  A404301: {
    cause:
      'A JWT introspection response was requested and `rsUri` was missing. The `rsUri` becomes the `aud` of the signed response, naming the resource server that asked.',
    fix: 'Send `rsUri`. This server passes the 400 through deliberately rather than defaulting it — it has no honest way to guess which resource server you are. And do *not* send it on the non-JWT path: when it is present and the token carries audiences that do not match, Authlete reports the token as inactive.',
    spec: 'Verified live 2026-08-13 · RFC 9701',
    verifiedHere: true,
  },
  A009301: {
    cause: 'The authorization request had no `response_type`, so Authlete cannot determine a response mode.',
    fix: 'This is why the error arrives as a **400 body** rather than an error redirect: without `response_type` there is nowhere to redirect to. Add it and the same class of error becomes a 302 carrying `error`, `state` and `iss`.',
    spec: 'Verified live 2026-08-04',
    verifiedHere: true,
  },
  A005328: {
    cause: 'A matching key was found for the request object and the signature did not verify.',
    fix: 'The key is right and the bytes are wrong — re-sign, and check nothing re-encoded the JWT in transit.',
    spec: 'Verified live · JAR (RFC 9101)',
    verifiedHere: true,
  },
  A005336: {
    cause: 'The request object\'s algorithm does not match what the client is pinned to.',
    fix: 'If the client has a *Request Object Signature Algorithm* set, `alg: none` and every other algorithm are refused. Unset it to accept any, or sign with the pinned one.',
    spec: 'Verified live · JAR',
    verifiedHere: true,
  },
  A008311: {
    cause: 'The service requires signed request objects and this one was not signed.',
    fix: 'The service conforms to JAR, so `request` must always be a signed JWT.',
    spec: "Authlete's own message, recorded in this repo",
    verifiedHere: true,
  },
  A050317: {
    cause:
      'The token request carried a `code_verifier` but the authorization request that produced the code carried no `code_challenge`.',
    fix: 'PKCE is a pair. Send the challenge on the authorization request or drop the verifier from the token request — a verifier alone proves nothing.',
    spec: 'Verified live · RFC 7636',
    verifiedHere: true,
  },
  A214301: {
    cause: 'An RFC 7592 client-configuration update was refused.',
    fix: 'The metadata document must contain `client_id`. Sending only the changed field earns this code — a conformant update is the *whole* document, not a patch.',
    spec: 'Verified live 2026-08-20 · RFC 7592 §2.2',
    verifiedHere: true,
  },
  A314305: {
    cause: 'A JWT-bearer assertion had no `exp` claim.',
    fix: 'Add `exp`. Authlete refuses this at `/auth/token` before the assertion is ever handed to a verification step.',
    spec: 'Verified live · RFC 7523',
    verifiedHere: true,
  },
  A314314: {
    cause:
      'A JWT-bearer assertion\'s `aud` names neither this service\'s issuer identifier nor its token endpoint URL.',
    fix: 'RFC 7523 §3(3) requires the assertion\'s `aud` to identify the **authorization server** — not the API the resulting token is for. The audience you want for the token comes from the `resource` parameter instead.',
    spec: 'Verified live 2026-08-14 · RFC 7523 §3',
    verifiedHere: true,
  },
  A249302: {
    cause: 'The `authorization_details` `type` is not one this service recognises.',
    fix: 'Only the registered types are accepted; every other type is refused. Check the service\'s supported authorization details types.',
    spec: 'Verified live · RFC 9396',
    verifiedHere: true,
  },
  A251307: {
    cause: 'A `resource` value is not an absolute URI.',
    fix: 'RFC 8707 requires an absolute URI. Note this arrives as an error *redirect* carrying `invalid_target`, not as a body.',
    spec: 'Verified live · RFC 8707 §2',
    verifiedHere: true,
  },
  A251308: {
    cause: 'A `resource` value includes a fragment component.',
    fix: 'Strip the fragment — RFC 8707 forbids it explicitly.',
    spec: 'Verified live · RFC 8707 §2',
    verifiedHere: true,
  },
  A375304: {
    cause: 'The access token does not exist, reported by the VCI deferred-parse step.',
    fix: 'Seeing this code is itself informative: it proves the deferred credential path really does validate the token, which it did not always do.',
    spec: 'Verified live 2026-08-14 at /vci/deferred/parse',
    verifiedHere: true,
  },
  A088302: {
    cause: 'The access token does not exist, reported at a protected resource.',
    fix: 'Arrives inside a `WWW-Authenticate: Bearer error="invalid_token"` challenge rather than in the body — RFC 6750 §3 puts it in the header.',
    spec: 'Verified live',
    verifiedHere: true,
  },
  A406301: {
    cause: 'The ID token signing algorithm is symmetric where an asymmetric one is required.',
    fix: 'HS256 signs the ID token with the client secret. Set the client\'s ID token signature algorithm to RS256 or ES256.',
    spec: 'Verified live',
    verifiedHere: true,
  },
  A169301: {
    cause: 'A required service-level configuration field is unset.',
    fix: 'No request, however correct, will succeed until the service field is set — check the service configuration before debugging the request.',
    spec: 'Verified live',
    verifiedHere: true,
  },
  A225301: {
    cause: 'The user code does not exist — including because it was sent in the wrong case.',
    fix: 'User codes are case-sensitive here: a lowercased code that looks right yields `NOT_EXIST`.',
    spec: 'Verified live · RFC 8628',
    verifiedHere: true,
  },
};
