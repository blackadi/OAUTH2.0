<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# DPoP and client authentication

> **Read this when** you are touching a DPoP proof, a client credential, or the presentation of an
> access token at a protected resource. Most of it was established by live probe rather than from
> the specifications alone, and the dates say which.

## DPoP & Client Auth

- **DPoP proof signature format**: For ES256, the JWS signature must be raw IEEE P1363 R||S concatenation (64 bytes for P-256), **not** DER-encoded. The `crypto.subtle.sign()` returns raw R||S natively. Using DER encoding causes `"invalid_dpop_proof: Signed JWT rejected: Invalid signature"`. See `client/src/services/dpop.service.ts:96-104` — the `crypto.subtle.sign()` call and the `rawSignature` conversion that follows it.
- **DPoP proof `ath` claim (not `sub`)**: Per RFC 9449 §7.1 — *"The DPoP proof MUST include the `ath` claim with a valid hash of the associated access token"* — when a DPoP proof is used with an access token (resource access), the payload MUST contain `ath` (base64url-encoded SHA-256 hash of the access token), **not** `sub`. Using `sub` causes the server to reject the proof or ignore the binding. The `computeAth()` function computes the hash correctly; the proof body sets it at `client/src/services/dpop.service.ts:52-53` (`if (ath) payload.ath = ath`).
- **DPoP proof JWT header**: Per RFC 9449 §4.2 (*"DPoP Proof JWT Syntax"*), the JOSE header MUST include the `jwk` member with the public key. **RFC 9449 has no §2.1** — §2 is *"Objectives"* and has no subsections; this entry cited it until 2026-08-20 and propagated the error into Module 00's quiz (audit `A-004`). The `kid` parameter alone is insufficient. Without `jwk`, Authlete returns `"The DPoP header did not include a public key in JWK format."`. See `client/src/services/dpop.service.ts:90` — the `const header = { typ, alg, jwk }` literal.
- **`dpop_jkt` is the RFC 7638 thumbprint, and a key `kid` is not one** (2026-08-23, probed both directions). RFC 9449 §10 *"Authorization Code Binding to a DPoP Key"*: *"The value of the `dpop_jkt` authorization request parameter is the JWK Thumbprint [RFC7638] of the proof-of-possession public key using the SHA-256 hash function, which is the same value as used for the `jkt` confirmation method defined in Section 6.1."* And *"the authorization server computes the JWK Thumbprint of the proof-of-possession public key in the DPoP proof and verifies that it matches the `dpop_jkt` parameter value in the authorization request. **If they do not match, it MUST reject the request.**"* Use of the parameter is OPTIONAL; **enforcement of it, once sent, is not.**

  **Authlete enforces it — verified live at the token endpoint, both directions:**

  | `dpop_jkt` declared on the authorization request | Proof at the token endpoint | Answer |
  |---|---|---|
  | thumbprint of **K1** | signed by **K1** | `200`, `token_type: DPoP`; introspection returns `cnf.jkt` **equal to the thumbprint we computed** |
  | thumbprint of **K2** | signed by **K1** | `400 invalid_request` **`[A050318]`** *"The DPoP key thumbprint did not match the expected value."* |

  **The trap is not a wrong key, it is a wrong digest.** RFC 7638 §3.2 hashes **`crv`, `kty`, `x`, `y` only**, *"ordered lexicographically by the Unicode code points of the member names"*, and §3.1 requires the JSON carry *"no whitespace or line breaks before or after any syntactic elements"*. `generateP256KeyPair` (`client/src/services/crypto-utils.ts`) derives `kid` as the digest of `JSON.stringify(exportedPublicJwk)` — and WebCrypto exports a JWK carrying **`key_ops` and `ext`**, in insertion order. So `kid` and `jkt` are different values over different inputs, and both are base64url SHA-256 digests of "the key", which is why substituting one for the other survives a code review. Measured on one P-256 key: `kid` `7dFqQh4RTWRaZ-…` against `jkt` `R05VIe6r11s2N4…`.

  `AuthFlowsSection` passed `pair.kid` as `dpop_jkt` and it never broke anything, because of a **second** defect that hid the first: `dpop_jkt` is `defaultOn: false` in `data/authParams.ts` and lives in the `extensions` group, which renders **collapsed** — so the checkbox that says it *"sends its thumbprint as `dpop_jkt`"* sent nothing at all. Both are closed: **`jwkThumbprint()` in `crypto-utils.ts` is the one implementation** (EC, RSA and `oct`, pinned against RFC 7638 §3.1's own published vector `NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs`), and `AuthorizeRequestBuilder` **derives** the row's enabled state from the presence of a thumbprint rather than storing it. Do not re-derive a thumbprint inline, and do not reach for `kid` when a `jkt` is wanted.

  **`kid` itself is deliberately unchanged** and must stay so: §4.2 requires the full `jwk` in the proof header, so `kid` is only an identifier, and re-deriving it would alter every `private_key_jwt` signing key's `kid` — which users register by hand in the Authlete Console. `keygen-characterization.test.ts` pins the current derivation on purpose.
- **The proof header's `jwk` is an allowlist, not a pruned copy** (2026-08-23). `createProof` built it as `{ ...privateKeyJwk }` with `delete publicJwk.d`, and a spread carries members the `JWK` type does not model — so every proof went out with **`key_ops: ["sign"]`**, inherited from the exported *private* key, alongside **`ext: true`**, which is not a registered JWK member at all. RFC 7517 §4.3 requires `use` and `key_ops` to convey consistent information, and a public verification key advertising `sign` does not. It is now built by naming `kty`, `crv`, `x`, `y`, `alg` and `kid`, which also makes `d` unreachable by construction rather than by remembering to delete it. **The binding is provably unaffected** — RFC 7638 ignores both members for `EC`, asserted by a test comparing `jwkThumbprint(header.jwk)` against `jwkThumbprint(publicKey)` — and the new header was accepted live in the probe above. `getJwkSetDisplay` (`client-assertion.service.ts`) got the same treatment, since it renders a key set a human is told to paste into the Authlete Console.
- **A public client authenticates with nothing, and "nothing" means the parameter is absent** (2026-08-22). The SPA's own client `4277838306` is public with `tokenAuthMethod: NONE`, and Authlete refuses **any** client-authentication data for such a client: `[A157303] The request contains data for client authentication although the client type is 'public' and the client authentication method is 'none'.` Observed live, breaking the headline authorization-code + PKCE flow on the deployment — the token request carried `client_secret=your_client_secret`, the **placeholder**, because `config.ts` used that literal as its default *and* `.env.example` shipped it as a value, `AuthFlowsSection` pre-filled the field with it, and `CallbackPage` added `client_secret` to the body unconditionally. Three rules came out of it:
  - **A placeholder is not a credential.** `secretOrEmpty` (`client/src/config.ts`) maps the literal `your_client_secret` to `""`, so an unset variable and a template copied verbatim converge on *no secret*. `CLIENT_ID`'s placeholder is deliberately left alone: a wrong client id fails loudly and says what is wrong, while a wrong *secret* silently changes which authentication method the request uses.
  - **Omit the key.** `new URLSearchParams({...})` stringifies its values, so `client_secret: undefined` puts the literal `"undefined"` on the wire — refused. `CallbackPage.tsx` spreads a `clientAuth` fragment that is `{}` when there is no secret. **The boundary is not where it looks, and it was measured rather than reasoned** (live probe at the token endpoint, 2026-08-22):

    | Sent for `4277838306` | Answer |
    |---|---|
    | `client_secret=your_client_secret` | `invalid_client` **`[A157303]`** |
    | `client_secret=undefined` | `invalid_client` **`[A157303]`** |
    | `client_secret=` (**empty**) | `invalid_grant` `[A050305]` — client auth **passed** |
    | parameter absent | `invalid_grant` `[A050305]` — client auth **passed** |

    So an empty value would have worked, and the first version of this bullet said the opposite. Omission is still what the code sends: RFC 6749 §2.3.1 describes a public client as presenting no credentials, and *"the vendor tolerates an empty parameter"* is undocumented behaviour to depend on. **Do not "simplify" this to `client_secret: ''`.**
  - **The trace panel is what found this.** The request body was visible in it; the error message was not enough on its own, since it names the credential rather than its presence. `A157303` is now in `AUTHLETE_NOTES` (`client/src/data/errorDocs.ts`) — reported as unknown before, which was correct behaviour and a useless answer.

  Note the contrast with the bullet below: that one is a confidential client whose credentials must travel in the *body* rather than the header, this one is a public client whose credentials must not travel at all. Both are "check the client's registered method first".
- **Client auth for DCR confidential clients**: Authlete defaults DCR-created confidential clients to `CLIENT_SECRET_POST` even when the service's `supportedTokenAuthMethods` lists only `CLIENT_SECRET_BASIC`. Token exchange requests must send `client_id` and `client_secret` in the URL-encoded body, not as `Authorization: Basic`. Using Basic auth produces `"The client authentication method is 'client_secret_post' but the request does not include a client secret."`. The SPA callback must persist `client_secret` to `sessionStorage` before the auth redirect. See `client/src/pages/CallbackPage.tsx:72-90`, `client/src/components/auth/AuthFlowsSection.tsx:112`.
- **PAR client authentication has two channels, and Authlete checks which one you used** (verified 2026-08-05 against a `CLIENT_SECRET_BASIC` client). `par.service.ts` picks the channel from how the caller presented the credentials and must never guess:

  | Caller sends | → Authlete request | Serves |
  |---|---|---|
  | `Authorization: Basic` | top-level `clientId`/`clientSecret`; `parameters` untouched | `CLIENT_SECRET_BASIC` |
  | body `clientId`+`clientSecret` | merged into `parameters` via `appendToParams` | `CLIENT_SECRET_POST` |
  | body `clientId` only | `client_id` in `parameters` | `none` (public) |

  **Presenting both channels at once is refused with `400 invalid_request`** (2026-08-13, 6749-W1) — see the
  dual-channel bullet below; the table's rows are therefore mutually exclusive by enforcement, not merely by
  convention. Getting the *channel* wrong is a 401 in both directions: creds-in-`parameters` for a Basic client gives `[A157357] The client identifier is not found at the expected location`, and Basic for a POST client gives `The client authentication method is 'client_secret_post' but the request does not include a client secret`. Header decoding uses `parseBasicAuth` (`src/utils/basic-auth.ts`), which splits on the **first** colon only so a secret may contain colons. **Known gap:** `clientCertificate`, `oauthClientAttestation` and `oauthClientAttestationPop` are accepted by Authlete's `/pushed_auth_req` but not forwarded — no client here uses them, so they are unverifiable end-to-end, and **since 2026-08-12 attestation is not advertised either** (see the next bullet).
- **The service advertises five client-authentication methods, and the four it dropped were dropped on purpose** (2026-08-12, T1-5). `supportedTokenAuthMethods` is `NONE`, `CLIENT_SECRET_BASIC`, `CLIENT_SECRET_POST`, `CLIENT_SECRET_JWT`, `PRIVATE_KEY_JWT`. Withdrawn: `TLS_CLIENT_AUTH` and `SELF_SIGNED_TLS_CLIENT_AUTH` (mTLS is not implemented and `tlsClientCertificateBoundAccessTokens` is `false`, so both were unhonourable), `ATTEST_JWT_CLIENT_AUTH` (no Client Attester is configured and the discovery document has no `challenge_endpoint`), and `SPIFFE_JWT` (nothing here uses SPIFFE, and it broke `service.get()` — see the SDK note below). **Two side effects worth knowing.** Withdrawing attestation also removed `client_attestation_signing_alg_values_supported` and `client_attestation_pop_signing_alg_values_supported` from the discovery document — those two members exist only to describe that method, so one withdrawal removed three advertisements and took the document from 64 members to 62. **That 62 is a reading from 2026-08-12, not the current count** — DR-03, DR-05 and BCL-W5 have each added members since; the document was recorded at **65** on 2026-08-15 and measures **66** on 2026-08-17, in all three places that serve it. The extra member could not be attributed, because no member *list* was kept to diff against — only a count. **Count it, do not quote it, and if the number matters, keep the list.** And `par.service.ts`'s un-forwarded attestation headers are now unreachable by construction rather than merely unused. Re-adding any of the four means re-checking the SDK enum first: a member `ClientAuthMethod` does not know takes `service.get()` down for every caller.
- **Client credentials on both channels are refused, and the reason this is ours to enforce is worth keeping** (2026-08-13, 6749-W1). RFC 6749 §2.3.1: *"The client MUST NOT use more than one authentication method in each request."* **Authlete does not enforce it** — verified live 2026-08-12: a request carrying correct top-level credentials plus a **wrong** `client_secret` in the body is accepted and a token issued, because the top-level channel wins. Authlete's [strict-checking page](https://developers.authlete.com/configuration-reference/endpoints/strict-checking-on-client-authentication-parameters) governs only *method matching* (*"Authlete version 2.0 and later strictly check client type and client authentication method settings"*) and says nothing about presenting both, or about precedence. **Nor did this server resolve the conflict, despite appearing to**: the `clientId`/`clientSecret` assignment in `token.service.ts` sets only the *top-level* fields, while `parameters` is preferentially `req.rawBody`, so body credentials reached Authlete untouched and both channels genuinely crossed the boundary. So `hasDualChannelClientAuth()` (`src/utils/basic-auth.ts`) now refuses the shape at `token.controller.ts` and `par.controller.ts`, **before any Authlete call** — the same gate-before-call arrangement the introspection endpoints use, and the client-authentication counterpart of `extractAccessToken()`'s enforcement of RFC 6750 §2's identical rule for token *presentation*. Two things not to undo: **only a second *credential* counts** — a bare `client_id` beside a Basic header is not a second method, since §2.3.1's methods differ in where the *secret* travels and a public client legitimately sends `client_id` alone; and **both endpoints are covered**, because RFC 9126 §2 gives PAR the token endpoint's client authentication, so exempting one would rebuild the inconsistency this removed. **This is the third consequence of the raw-body design choice**, after signature fidelity and the RFC 9700 §4.2.4 credential leak — when a finding quotes a variable assignment in `token.service.ts` or `revocation.service.ts`, check what actually goes on the wire.
- **`parseBasicAuth` (`src/utils/basic-auth.ts`) is the only Basic-auth decoder for OAuth client credentials** — used by both `token.service.ts` and `par.service.ts`. It splits on the first colon (a secret may contain colons), treats the scheme case-insensitively per RFC 9110 §11.1, and returns `undefined` rather than partial credentials when the payload has no colon, so a malformed header cannot clobber body-supplied `clientId`/`clientSecret`. Do not hand-roll `authorization.split(":")` again. `require-basic-auth.ts` stays separate on purpose: it validates *this deployment's* management credentials with `timingSafeEqual`, which is a different job from decoding a client's.
- **DPoP nonce flow — and the status code differs by *which* server answers** (corrected 2026-08-14, 9449-W5).
  Nonces are OPTIONAL, controlled by `dpopNonceRequired`, which is **`false`** on this service — **and since
  2026-08-17 that is a ruling, not an omission: DR-20 declines it.** The reason is ours, not the
  specification's: **this repo's SPA discards the nonce it is sent.** `client/src/services/token.service.ts`
  had `if (!response.ok) throw` on the line *before* it read `DPoP-Nonce`, so a `400 use_dpop_nonce` threw away
  the value that would have fixed it and `sessionStorage.dpop_nonce` — written only from a *success* — never
  filled. Enabling the flag broke every DPoP path in the SPA **permanently, not on the first request only**.
  **Fixed the same day: `client/src/services/dpop-fetch.ts`** is now the single place a DPoP request is sent.
  It caches `DPoP-Nonce` from success *and* failure and retries once with a **re-signed** proof — re-signed
  because the nonce is inside the signature, which is why it takes a proof **factory** rather than a proof
  string. All four DPoP service functions (`token.service.ts` ×2, `par.service.ts`, `rar.service.ts`) route
  through it; do not add a fifth that does its own `fetch`. Live-verified with the flag temporarily on: the
  old path 400s and loses the nonce, the new one succeeds on attempt 2, and a warm cache needs one attempt.
  **The flag stays off on preference now, not on breakage** — see DR-20. **The table below was written from the specification and has since
  been confirmed live** — at the token endpoint (2026-08-15, 9449-W6) and at **PAR** (2026-08-17, DR-20), both
  by set → probe → revert with 0 unexpected field changes.

  | Who answers | Missing nonce | Spec |
  |---|---|---|
  | **Authorization server** (token, PAR) | **400** `use_dpop_nonce` + `DPoP-Nonce` header | RFC 9449 §8 — *"the authorization server responds to requests that do not include a nonce with an HTTP 400 (Bad Request) error response … using `use_dpop_nonce` as the error code value"* |
  | **Resource server** (UserInfo, `/api/gm`) | **401** + `WWW-Authenticate: DPoP` + `DPoP-Nonce` | §9 |

  **This entry said 401 for both until 2026-08-14, and §8's 400 is not a detail**: a client that only retries on
  a 401 never retries at the token endpoint. **A stale or mismatched nonce is refused with `use_dpop_nonce`, not
  `invalid_dpop_proof`** — §8 makes rejection a MUST and lets the rejection carry a fresh nonce, and
  `use_dpop_nonce` is the code that means *"retry with this one"*. Reserve `invalid_dpop_proof` for a proof that
  is genuinely malformed. Token/PAR endpoints may return a nonce on success; protected resources return one only
  on error. See `docs/PAR-TUTORIAL.md` → *DPoP Nonce Handling* for the full transcript, labelled **captured under a
  temporary configuration** — a different claim from *"reproducible here"* and from `UNVERIFIED`.
  `docs/FAPI-TUTORIAL.md` Step 3 summarises the same behaviour, stated conditionally ("if nonces are
  on") because the flag is off here by decision.

  **Observed with the flag temporarily on — six things RFC 9449 does not say:**

  - **The nonce is time-based, not one-time.** Every probe call returned the *same* `DPoP-Nonce`,
    including the successful ones; it is valid for `dpopNonceDuration`. A client should **cache and reuse** it.
    One written to treat a repeated nonce as a replay would be wrong.
  - **A nonce comes back on success at both AS endpoints** — the token endpoint (2026-08-15) *and* PAR's
    `201 Created` (2026-08-17). That confirms the "may return a nonce on success" sentence above for both, and
    it also settled an earlier deletion: a tutorial block showing `201 + DPoP-Nonce` had been removed as
    `UNVERIFIED`, and the probe showed it was **unreachable rather than wrong** — the distinction to make
    before deleting a transcript you cannot currently reproduce.
  - **PAR and the token endpoint use different vendor codes for one condition** — **`[A350308]`** at
    `/pushed_auth_req`, **`[A254307]`** at `/auth/token`. Match on `error: use_dpop_nonce`, never on the code.
  - **An authorization code SURVIVES a `use_dpop_nonce` refusal.** The refusal precedes redemption, so the same
    code replayed with the nonce yields `OK` (verified 2026-08-17). The dance costs a round trip, not a
    re-authorization — so a *retrying* client loses nothing, which is exactly why DR-20's objection is about
    our client and not about the mechanism.
  - **Authlete's message misdirects on first contact.** A request with **no** `nonce` claim and one
    with a **wrong** `nonce` produce the *same* code and the same text — *"The value of the 'nonce' claim in the
    DPoP proof JWT is different from the expected one."* There is nothing *different from expected* about a
    claim that was never sent, so somebody debugging a first request goes looking for a value they never
    supplied. The `error` code is `use_dpop_nonce` in both cases, which is the part a client acts on.
  - **The flag gates *proofs*, not requests.** A token call carrying no DPoP header at all is unaffected.

  **The relay is already correct and the placement is why.** `token.controller.ts:69` calls
  `setDpopNonce(res, result.dpopNonce)` **before** the `switch`, so `OK`, `BAD_REQUEST` and every other branch
  emit the header; a per-branch call would have had to be repeated in ten places and would have been missed in
  one. `par.controller.ts`, `userinfo.controller.ts`, `introspection.controller.ts` and
  `require-grant-ownership.ts` use the same helper. Do not move it inside the switch.
- **Presenting an access token at a protected resource (RFC 6750 §2, RFC 9449 §7)**: this repo has **two**
  protected resources — `UserInfo` and the **Grant Management API** (`/api/gm/:grantId`, since 2026-08-13,
  T1-10) — and they answer identically, because both route every presentation through
  `server/src/utils/dpop.ts`: `extractAccessToken()`, `dpopHttpTarget()`, `authChallenge()`,
  `isTokenPresentationError()`. Use these rather than re-deriving a token from the `Authorization` header.
  Grant management used to accept `Bearer` **only**, case-sensitively, while still forwarding any `DPoP`
  proof it found — so a bound token could not be presented conformantly at all, and `Bearer` + a proof was a
  working §7.2 downgrade. The two resources now agree case by case; if you add a third, reuse these helpers
  rather than re-deriving the rules.
  - **Both schemes, case-insensitively.** `Bearer` (RFC 6750 §2.1) and `DPoP` (RFC 9449 §7.1); RFC 9110 §11.1
    makes auth-scheme case-insensitive. An unrecognised scheme yields "no token presented", never a token.
  - **`DPoP` is mandatory for a bound token.** RFC 9449 §7.1 — a DPoP-bound token *"is sent using the
    `Authorization` request header field… with an authentication scheme of `DPoP`"*. There is no alternative.
  - **§7.2 downgrade is enforced by Authlete at every protected-resource API, and all three fail closed.**
    `Bearer <dpop-bound-token>` with no proof is refused by whichever API the request reaches, each with its
    own code — **`[A089311]`** at `/auth/userinfo` (verified 2026-08-04), **`[A065308]`** at
    `/auth/introspection` and **`[A281305]`** at `/gm` (both verified 2026-08-12). Every one of them carries
    the `DPoP` scheme plus an accurate `algs` list already, so do **not** hand-write a DPoP challenge on paths
    where Authlete answers; forward `responseContent` verbatim. Neither `UserinfoResponse` nor
    `IntrospectionResponse` exposes `cnf`, so the server cannot detect the downgrade locally — this
    compliance is delegated by design, and the delegation was **tested rather than assumed** before
    `/api/gm` was allowed to rely on it.
  - **A protected-resource call must forward the proof to *every* Authlete API it makes.** `/api/gm` makes
    two — `/auth/introspection` for the ownership gate, then `/gm` — and **both** check the binding
    independently. Passing the first and omitting the proof on the second just moves the 401 one call later
    (`[A281305]`). The **same** proof serves both: it describes one client→RS request, and Authlete does not
    treat the second use as a replay (verified 2026-08-12).
  - **`Bearer` + a `DPoP` header → 400 `invalid_request`, rejected locally.** Honouring the proof would make
    `Bearer` a working route for bound tokens (the §7.2 downgrade); silently dropping it would report "no DPoP
    header provided" to a client that plainly sent one.
  - **`DPoP` scheme + no proof header → 401 `invalid_dpop_proof`, rejected locally**, before any Authlete call.
  - **Server-determined fields never come from the body.** `token`, `dpop`, `htm`, `htu`, `targetUri` and
    `clientCertificate` are set from HTTP context only — the same rule `introspection.service.ts` follows.
    Spreading `req.body` into the Authlete request let a client choose the `htu` its own proof was validated
    against, making a proof captured at another endpoint replayable (verified: a proof minted for `/api/par`
    returned `200` at `/api/userinfo`). Only `access_token` is read from a form body, per RFC 6750 §2.2.
  - **`htu` excludes the query and fragment** (RFC 9449 §4.2); the full request URI goes in `targetUri`. The
    Authlete SDK documents exactly this split. Sending the query string as `htu` broke any request with one.
    **Every `htu` in the server now comes from `dpopHttpTarget()`** (2026-08-13, T1-9) — `token.service.ts`,
    `par.service.ts`, `introspection.service.ts`, `require-grant-ownership.ts` and
    `grant-management.service.ts` each built it by hand from `req.originalUrl` before, so a DPoP proof failed
    on any request carrying a query string even though the client was entirely correct. Do not rebuild it
    inline. **Send `targetUri` only where the request model has it** — `IntrospectionRequest` and
    `UserinfoRequest` do; `TokenRequest`, `PushedAuthorizationRequest` and `GMRequest` do not.
  - **No query-parameter tokens.** RFC 6750 §2.3 is not implemented: RFC 9700 §4.3.2 (BCP 240) says *"Clients
    MUST NOT pass access tokens in a URI query parameter"*.
  - **A `DPoP` scheme on an *unbound* token succeeds** (verified) — the token has no `cnf`, so there is no
    binding to check and the proof is decorative. Proof-of-possession comes from `cnf.jkt` on the token, not
    from the scheme the caller chose. Never treat "the request used DPoP" as evidence of sender-constraint.
- **RFC 9470 Step-Up Authentication**: The server binds `acr` and `auth_time` to JWT access tokens during authorization. On login, `session.controller.ts` records the satisfied ACR ("pwd" for password) and `authTime` (epoch seconds), then checks Authlete's `acrs`/`acrEssential`/`maxAge` requirements. If ACR doesn't match and `acrEssential` is true, the authorization fails with `ACR_NOT_SATISFIED`. If `maxAge` is exceeded, fails with `EXCEEDS_MAX_AGE`. The `stepUp` object in session (`{ acr, authTime }`) is passed to Authlete's `/auth/authorization/issue` API via `authorization.service.ts`. **Since 2026-08-12 both the login path and the non-interactive `prompt=none` path share one check — `checkStepUpRequirements` in `utils/step-up.ts`** — and its rule is that absence is answered as *no*: an unknown `acr` does not satisfy an essential `acr` request, and an unknown `auth_time` does not satisfy a `max_age`. That matters because `prompt=none` previously **invented** an authentication event (`acr: "pwd"`, `auth_time: now`) when the session had recorded none, which would have let a resource server accept fabricated freshness; see the `prompt=none` note under **Quirks & gotchas**. **`max_age` can only genuinely fail on the `prompt=none` path** — on the login POST the End-User has just actively authenticated, so any maximum age is satisfied by construction. The introspection controller parses Authlete's `WWW-Authenticate` header for `insufficient_user_authentication` in its **`case "FORBIDDEN"`** branch (`introspection.controller.ts:142-167`, using `parseBearerError` defined at `:45`) and returns structured JSON with `acr_values`/`max_age` for the client to re-authorize. The client UI includes a **Step-Up Auth** section (`StepUpSection.tsx`) that tests the full flow. See `docs/STEP-UP-AUTH-TUTORIAL.md`.
