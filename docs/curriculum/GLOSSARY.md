# Glossary

**The short version:** every role, endpoint, parameter, claim, and acronym the curriculum uses — with the
spec that defines it and where it shows up in this repo's code. When a module **bolds a term on first use**,
it is defined here. Modules add their own terms as they go; this file is the union.

> **Verification note:** spec attributions below match [SPEC-INVENTORY.md](SPEC-INVENTORY.md), which was
> verified against primary sources on 2026-07-27. Code paths are relative to the repo root.

---

## Roles (the actors)

| Term | Defining spec | Meaning | In this repo |
|------|---------------|---------|--------------|
| **Resource Owner** | RFC 6749 §1.1 | The user who owns the data and grants access. | The person logging in via `views/login.ejs` |
| **Client** | RFC 6749 §1.1 | The app requesting access on the user's behalf. | The React SPA (`client/`); DCR-registered clients |
| **Authorization Server (AS)** | RFC 6749 §1.1 | Issues tokens after authenticating the user and getting consent. | This server (`server/`), delegating to Authlete |
| **Resource Server (RS)** | RFC 6749 §1.1 | Hosts protected resources; validates access tokens. | UserInfo + Introspection stand in for an RS here |
| **OpenID Provider (OP)** | OIDC Core 1.0 | An AS that also does authentication and issues ID tokens. | This server, with OIDC enabled |
| **Relying Party (RP)** | OIDC Core 1.0 | An OIDC client that consumes ID tokens. | The SPA when requesting `openid` scope |
| **Public client** | RFC 6749 §2.1 | A client that cannot keep a secret (SPA, native app). | SPA / `PUB_CLIENT_ID` in labs |
| **Confidential client** | RFC 6749 §2.1 | A client that can hold a secret. | `CLIENT_ID`/`CLIENT_SECRET` in labs |
| **User agent** | RFC 6749 §1.2 (protocol flow) — *not* one of the four §1.1 roles | The browser that relays front-channel redirects. Untrusted and unavoidable. | your browser; `curl` following redirects |
| **Policy engine** | *No spec role — deployment architecture* | The component the AS delegates every OAuth decision to. | Authlete Cloud; `services/authlete.service.ts` |
| **Assertion Issuer** | RFC 7521 §3 | The entity that creates and signs an assertion. Its key is the trust anchor for every token minted from it. | Module 06 — here, the calling client itself |
| **Relying Party** *(assertion sense)* | RFC 7521 §3 | The party that consumes an assertion and relies on it. *"the authorization server acts as a relying party."* Distinct from the OIDC RP above. | Module 06 |
| **Actor** | RFC 8693 §4.1 | The party doing the acting in a delegation, named in `act`. | Module 06 |
| **Issuer** *(credential sense)* | RFC 9901 §1.2 | *"An entity that creates SD-JWTs."* Signs once, then is **offline** at presentation time. Not the OIDC `iss`. | Module 09b |
| **Holder** | RFC 9901 §1.2 | *"An entity that received SD-JWTs from the Issuer and has control over them."* Fuses OAuth's resource owner and client — and is therefore a plausible attacker. | Module 09b |
| **Verifier** | RFC 9901 §1.2 | *"An entity that requests, checks, and extracts the claims from an SD-JWT with its respective Disclosures."* Nearest to an RS, but cannot introspect. | Module 09b |
| **Wallet** | OID4VCI 1.0 §2 | The holder's software; *"acts as an OAuth 2.0 Client"* toward the credential issuer. | Module 09b |
| **Credential Issuer** | OID4VCI 1.0 §2 | The issuance API; *"acts as an OAuth 2.0 Resource Server."* | Module 09b — `vci.routes.ts` (disabled) |
| **Trust Anchor** | OpenID Federation 1.0 §1.2 | *"An Entity that represents a trusted third party."* One key vouching for a whole ecosystem — pick narrowly. | Module 09b |

## Concepts

| Term | Defining spec | Meaning | Where it bites |
|------|---------------|---------|----------------|
| **Password anti-pattern** | *(named in practice; the grant is RFC 6749 §4.3)* | Giving a client the resource owner's credential so it can act as them. | Unbounded scope, no revocation, no attribution — Module 01 |
| **Delegation** | RFC 6749 §1 | Granting a client narrow, revocable authority *without* sharing the credential. | The problem OAuth exists to solve |
| **Authorization grant** | RFC 6749 §1.3 | The credential representing the resource owner's authorization, exchanged for a token. | Consent step; `views/consent.ejs` |
| **Access token** | RFC 6749 §1.4, presented per RFC 6750 §2.1 | A scoped, expiring, revocable capability — **not** an identity assertion. | `Authorization: Bearer`; Module 08 for why it ≠ authN |
| **Front channel / back channel** | RFC 6749 §1.2 + §3.1/§3.2 | Via the browser (visible + editable) vs. direct server-to-server. | Module 00; every later threat |
| **Confused deputy** | *(security literature; instances throughout RFC 9700)* | A privileged party tricked into misusing its authority for someone else. | Mix-up, audience confusion — Modules 01, 05 |
| **Credential boundary** | *(design principle; follows from RFC 6749 §1.1)* | The rule that the credential is typed only on the AS's own origin. | `views/login.ejs:18` |
| **Authorization code** | RFC 6749 §4.1.2 | Short-lived, single-use reference returned on the front channel; redeemable only with client authentication. | `/api/authorization` → `/api/token` |
| **Code interception** | RFC 9700 §4.5 (Authorization Code Injection) | Stealing a code from the front channel and redeeming it. Fatal for public clients without PKCE. | Module 03 |
| **Polling** | RFC 8628 §3.5 | Device repeatedly calls the token endpoint until the user finishes; `authorization_pending` / `slow_down`. | `device.routes.ts`; Module 02 |
| **PKCE downgrade** | RFC 9700 §4.8 | Stripping `code_challenge` so the code is issued unprotected. AS must reject in **both** directions. | Module 03 |
| **Refresh token rotation** | RFC 9700 §2.2.2, §4.14 | New refresh token on each use, old one invalidated; reuse ⇒ revoke the grant. One of the two permitted treatments for public clients. | `refreshTokenKept` flag (`AGENTS.md`) |
| **Sender-constrained token** | RFC 9449 / RFC 8705 | Token bound to a key the client must prove possession of. The other permitted treatment. | Module 05 |
| **External user-agent** | RFC 8252 §8.12 | The system browser, not an embedded webview — native apps **MUST NOT** use embedded user-agents. | Module 03 |
| **Opaque / reference token** | RFC 6749 (format unspecified) | A token with no readable structure; the RS must introspect it. | This deployment's access tokens; Module 04 |
| **Self-contained token** | RFC 9068 | A JWT the RS validates locally — fast, but stale until `exp`. | Module 04 |
| **Introspection** | RFC 7662 | RS asks the AS "is this token active, and for what?" | `introspection.routes.ts` |
| **Revocation lag** | *(consequence of RFC 9068 vs RFC 7662)* | The window in which a revoked JWT is still accepted — equal to its remaining lifetime. | Module 04 |
| **Audience restriction** | RFC 8707 §2 → `aud` | Binding a token to the API it was requested for. | Module 04 |
| **Token confusion** | *(mitigated by RFC 9068 §2.1 `typ`)* | An RS accepting an ID token (or other JWT) as an access token. | Modules 04, 08 |
| **Registration access token** | RFC 7592 (**Experimental**) | Credential authorizing read/update/delete of **one** client registration. Note 7592's status: unlike RFC 7591, it is not Standards Track, which is why server support is uneven. | `dcr.routes.ts` |
| **Request object** | RFC 9101 | Authorization parameters inside a signed JWS; the object's parameters win over query parameters (§5). | `jar.routes.ts` |
| **Mix-up attack** | RFC 9700 §4.4 | Client is confused about *which* AS answered, and sends the code to the wrong one. | Defended by `iss` (RFC 9207) |
| **DPoP proof** | RFC 9449 §4.2 | Per-request JWS (`typ: dpop+jwt`) with `jwk` header and `jti`/`htm`/`htu`/`iat` claims. | `client/src/services/dpop.service.ts` |
| **`jkt` / `x5t#S256`** | RFC 9449 §6.1 / RFC 8705 §3 | Confirmation members naming the bound key (JWK thumbprint) or certificate (SHA-256 of the DER). | Module 05 |
| **Proof of possession** | RFC 9449 / RFC 8705 | Requiring the presenter to prove control of a key, so possession of the token alone is insufficient. | Module 05 |
| **Assertion** | RFC 7521 | A signed statement from a trusted issuer, used as an authorization grant (§2.1) or as client authentication (§2.2). | Module 06 |
| **Impersonation** | RFC 8693 §1.1 | A is *"indistinguishable from B"* to the downstream service — delegation with the audit trail deleted. | Module 06 |
| **Delegation** | RFC 8693 §1.1 | A keeps *"its own identity separate from B"*; actions are *"taken by A representing B."* Recorded in `act`. | Module 06 |
| **Identity chaining** | RFC 8693 §4.1 | Nested `act` claims recording every hop of a multi-service call. | Module 06 |
| **Silent downgrade** | *No spec term — failure pattern* | An optional security parameter accepted, discarded, and answered with HTTP 200. Undetectable from the response. | Module 06 — `actor_token`, `resource` |
| **BCP** | IETF process | Best Current Practice. Community consensus, expected to be updated. RFC 9700 is **BCP 240**; RFC 8252 is **BCP 212**. | Cite the BCP number in reviews |
| **Normative strength** | RFC 2119 / RFC 8174 | MUST / SHOULD / RECOMMENDED / MAY. A SHOULD without a written rationale is a finding; with one it is a decision. | Module 07 |
| **Three-source triangulation** | *No spec term — audit method* | Advertised metadata vs stored configuration vs observed behaviour. Observed wins; divergence is itself a finding. | Module 07 |
| **Reachability** | *No spec term — severity axis* | Who can actually drive this, with what access. Severity = normative strength × reachability. | Module 07 |
| **Conformance theatre** | *No spec term — failure pattern* | Passing a checklist while remaining exploitable: supported≠required, one path≠all paths, correct parts≠safe whole. | Module 07 |
| **ID token** | OIDC Core §2 | A signed statement, addressed to **one client**, that this OP authenticated this user, at this time, in this way, for this request. Always a JWT. | Module 08 |
| **Authentication vs. authorization** | OIDC Core / RFC 6749 | *Who is this person?* vs *what may this software do?* An access token answers only the second. | Module 08 |
| **Token substitution** | *No spec term — attack* | Any access token for the victim accepted as proof of login. Closed by the ID token's `aud` check (OIDC Core §3.1.3.7 step 3). | Module 08 |
| **Algorithm confusion** | *(mitigated by OIDC Core §3.1.3.7 step 7)* | Reading `alg` from the token header to select a key — e.g. verifying HS256 with a published RSA public key. Pin `alg` from registration. | Modules 00, 08 |
| **Silent renewal** | OIDC Core §3.1.2.1 (`prompt=none`) | Checking "is the user still signed in?" without a visible redirect. Must return one of four §3.1.2.6 errors on failure. | Module 08 |
| **Logout token** | OIDC Back-Channel Logout 1.0 | A signed JWT POSTed OP→RP carrying the `events` claim; MUST identify the session by `sub`/`sid` and MUST NOT contain `nonce`. | Module 08 |
| **JARM response** | JARM (OpenID Final) | The whole authorization response as one signed JWT in a `response` parameter; MUST carry `iss`, `aud`, `exp`. | Module 09a |
| **Consumption / authentication device** | CIBA Core 1.0 | The device that wants the token vs. the device where the user authenticates. Different machines — nothing is redirected. | Module 09a |
| **Step-up authentication** | RFC 9470 | An RS answering 401 with `insufficient_user_authentication` **plus** `acr_values`/`max_age`, so the client knows what would suffice. | Module 09a |
| **ACR theatre** | *No spec term — failure pattern* | An `acr` claim emitted with no registered definition behind it: reads as a control, behaves as a comment. | Module 09a |
| **Permitted but not configured** | *No spec term — audit state* | A capability the client is allowed to use and cannot, because an enabling field is unset. An **availability** finding, distinct from Module 07's supported-but-not-required. | Module 09a |
| **Selective disclosure** | RFC 9901 | Showing some claims from a signed credential and withholding others **without invalidating the signature** — because the signature covers salted digests, not values. | Module 09b |
| **Disclosure** | RFC 9901 §1.2 | *"A base64url-encoded string of a JSON array that contains a salt, a claim name … and a claim value."* Treat it as an opaque string: hashing a re-serialization gives the wrong digest. | Module 09b |
| **Salt** | RFC 9901 §9.3 | ≥128 bits of fresh randomness per claim. Without it, a verifier brute-forces small claim value spaces from the digest alone. | Module 09b |
| **Decoy digest** | RFC 9901 §4.2.5 | A digest in `_sd` with no Disclosure behind it, so nobody can count how many claims the credential really holds. | Module 09b |
| **Key binding** | RFC 9901 §1.2 | *"Ability of the Holder to prove possession of an SD-JWT by proving control over a private key during the presentation."* Fourth appearance of commit-then-prove. | Module 09b |
| **KB-JWT** | RFC 9901 §4.3 | The holder's proof: `typ: kb+jwt`, with REQUIRED `iat`, `aud`, `nonce`, `sd_hash`. | Module 09b |
| **KB stripping** | RFC 9901 §9.5 | Deleting the KB-JWT so a verifier that infers its policy from the input skips key binding entirely. | Module 09b — Lab 5a |
| **Unlinkability** | RFC 9901 §10.1 | Four distinct properties. Issuer/verifier unlinkability against a coerced verifier *"cannot be achieved"* in SD-JWT; verifier/verifier fails by default because the issuer-signed JWT is byte-identical across presentations. | Module 09b |
| **Identity assurance** | OIDC Identity Assurance 1.0 §5.1 | Provenance metadata about claims — how, when, under which trust framework — **not** stronger cryptography. | Module 09b |
| **Entity statement** | OpenID Federation 1.0 §1.2 | *"A signed JWT that contains the information needed for an Entity to participate in federation(s)."* `typ: entity-statement+jwt`. | Module 09b |
| **Trust chain** | OpenID Federation 1.0 §1.2 | *"A sequence of Entity Statements … ending in a Trust Anchor."* Discovery walks **up** via `authority_hints`; policy flows **down**. | Module 09b |
| **Metadata policy** | OpenID Federation 1.0 §6.1 | Constraints a superior imposes on subordinates' metadata (`value`, `add`, `one_of`, `subset_of`) — a leaf cannot self-declare its way out. | Module 09b |
| **Credential offer** | OID4VCI 1.0 §4.1 | What an issuer hands a wallet to start issuance; names the grants, optionally a pre-authorized code. | Module 09b |
| **Fail-open auth** | *No spec term — failure pattern* | Authentication middleware that allows the request when its configuration is absent. Here: `require-basic-auth.ts` returns *allow* if `MGMT_CLIENT_*` are unset. | Module 09b — Lab 7 |
| **Attacker model** | FAPI 2.0 Attacker Model §6–§7 | An enumerated set of attacker capabilities a profile claims to defend against. Makes a security claim falsifiable instead of aspirational. | Module 10 |
| **Security goal** | FAPI 2.0 Attacker Model §5 | Authorization, authentication, session integrity — stated so they can be proven or disproven. | Module 10 |
| **Session integrity** | FAPI 2.0 Attacker Model §5.4 | *"no attacker is able to force a user to be logged in under the identity of the attacker"* / to use the attacker's resources. The goal people forget. | Module 10 |
| **Supported vs required** | *No spec term — audit distinction* | Every FAPI `shall` is about what the AS **rejects**. Advertising a mechanism defends nothing; an attacker picks the weakest permitted option. | Module 07, Module 10 |
| **NOT EVIDENCED** | *No spec term — audit verdict* | Neither pass nor fail: the configuration cannot answer the question (e.g. a duration of `0` meaning "service default"). A false PASS is worse than a FAIL. | Module 10 — Lab 3 |
| **Formal analysis** | FAPI 2.0 Security Profile / Attacker Model §9 | Machine-checked proof that a **specification** meets its goals under its model. §8.5 excludes implementation errors — it says nothing about your code. | Module 10 |
| **Non-repudiation** | FAPI 2.0 Message Signing | Proving to a *third party* later who sent what. Distinct from authorization/authentication; costs real complexity. | Module 10 |
| **Grant** | Grant Management (Draft) §5.6 | The persistent record of what a user authorized — distinct from the tokens minted against it. Revoking a token does not revoke the grant. | Module 10 |
| **Grant revocation vs token revocation** | Grant Management §6.5 vs RFC 7009 | Grant revocation withdraws authority (MUST kill refresh tokens); RFC 7009 discards one credential and leaves consent standing. | Module 10 — Lab 6 |
| **BOLA** | OWASP API1:2023 | Broken Object Level Authorization — the caller names an object they do not own. **Wrong row.** No token can prevent it. | Module 11 — Lab 2 |
| **BOPLA** | OWASP API3:2023 | Broken Object Property Level Authorization — reading fields that should be hidden, or writing fields that should be read-only (mass assignment). **Wrong column.** | Module 11 |
| **BFLA** | OWASP API5:2023 | Broken Function Level Authorization — reaching an endpoint or method the caller should not. **Wrong verb.** | Module 11 — Lab 1 |
| **Fail-open / fail-closed** | *No spec term — design principle* | Whether a control permits or refuses when its inputs or configuration are missing. `require-basic-auth.ts:8` returns *allow* on absent config. | Module 11 |
| **Enumeration oracle** | *(same reasoning as RFC 7662 §2.2)* | Returning `403` instead of `404` for someone else's object confirms it exists. | Module 11 |
| **Owner-scoped query** | *No spec term — design pattern* | Putting the ownership constraint **into** the query rather than checking after the fetch, so the insecure version cannot be written. | Module 11 |
| **RBAC / ABAC / ReBAC** | *Access-control literature* | Decide on the subject's **role** / on **attributes** of subject-resource-action-environment / on **relationships** in a graph. Pure RBAC cannot express "their own". | Module 11 |
| **Type-level vs instance-level** | *(follows from RFC 6749 §3.3)* | Scopes say "may read accounts"; they cannot say "may read account 91847". The reason BOLA is an application problem. | Module 11 |
| **Break-glass** | *No spec term — operational pattern* | A designed bypass of normal authorization (emergency override), safe only with synchronous fail-closed audit and expiry. | Module 11 — quiz Q17 |

## Endpoints

| Endpoint | Defining spec | Purpose | In this repo |
|----------|---------------|---------|--------------|
| Authorization endpoint | RFC 6749 §3.1 | Front-channel; user authenticates + consents; returns a code. | via Authlete; `controllers/authorization.*`, `views/consent.ejs` |
| Token endpoint | RFC 6749 §3.2 | Back-channel; exchanges grant for tokens. | `token.controller.ts` |
| Redirection endpoint | RFC 6749 §3.1.2 | Client URI the code/response returns to. | `REDIRECT_URI` (`client/src/pages/CallbackPage.tsx`) |
| UserInfo endpoint | OIDC Core §5.3 | Returns claims for an access token. | `userinfo.routes.ts`, `userinfo.service.ts` |
| Introspection endpoint | RFC 7662 | "Is this token active?" for an RS. | `introspection.routes.ts` |
| Revocation endpoint | RFC 7009 | Revoke an access/refresh token. | `revocation.routes.ts` |
| PAR endpoint | RFC 9126 | Push an auth request; get a `request_uri`. | `par.routes.ts` |
| Device authorization endpoint | RFC 8628 | Issues `device_code`/`user_code`. | `device.routes.ts` |
| Backchannel authentication endpoint | CIBA Core 1.0 | Starts decoupled auth; returns `auth_req_id`. | `ciba.routes.ts` |
| AS metadata | RFC 8414 | `/.well-known/oauth-authorization-server` (root here). | `oauth-as-metadata.routes.ts` |
| OP discovery | OIDC Discovery 1.0 | `/.well-known/openid-configuration` (**under `/api`** here). | `discovery.routes.ts` |
| Protected Resource Metadata | RFC 9728 | `/.well-known/oauth-protected-resource`. | consumed client-side; **not served** (gap, Module 04) |
| Registration endpoint | RFC 7591 (Std Track) / RFC 7592 (**Experimental**) | DCR register/read/update/delete. | `dcr.routes.ts` |
| End-session endpoint | OIDC RP-Initiated Logout 1.0 | RP-triggered logout. | logout routes; `LogoutSection.tsx` |

## Grant types

| Grant | Defining spec | When to use | Status note |
|-------|---------------|-------------|-------------|
| `authorization_code` | RFC 6749 §4.1 | Interactive user delegation (with PKCE). | The default; recommended |
| `client_credentials` | RFC 6749 §4.4 | Machine-to-machine, no user. | Module 06 |
| `refresh_token` | RFC 6749 §6 | Renew tokens without re-auth. | Rotation policy: Module 03 |
| `implicit` | RFC 6749 §4.2 | *(historical)* token in the redirect. | **Deprecated** by RFC 9700 / OAuth 2.1 |
| `password` (ROPC) | RFC 6749 §4.3 | *(historical)* user password to client. | **Deprecated** by RFC 9700 / OAuth 2.1 |
| `urn:ietf:params:oauth:grant-type:device_code` | RFC 8628 | Input-constrained devices. | Module 02 |
| `urn:ietf:params:oauth:grant-type:jwt-bearer` | RFC 7523 | JWT assertion → token. | Module 06 |
| `urn:ietf:params:oauth:grant-type:saml2-bearer` | RFC 7522 | SAML assertion → token. | Module 06 (conceptual) |
| `urn:ietf:params:oauth:grant-type:token-exchange` | RFC 8693 | Delegation/impersonation/chaining. | Module 06 |
| `urn:openid:params:grant-type:ciba` | CIBA Core 1.0 | Poll for a decoupled auth result. | Module 09a |

## Parameters (requests)

| Parameter | Defining spec | Meaning | Security note |
|-----------|---------------|---------|---------------|
| `response_type` | RFC 6749 §3.1.1 | `code`, `token`, `id_token`, or hybrid combos. | `token` (implicit) is deprecated |
| `client_id` | RFC 6749 | Identifies the client. | Never trust an unauthenticated `client_id` for confidential clients |
| `redirect_uri` | RFC 6749 §3.1.2 | Where the response goes. | Exact matching is mandatory (RFC 9700) |
| `scope` | RFC 6749 §3.3 | Coarse permissions requested. | `scopeRequired=true` rejects empty scope |
| `state` | RFC 6749 §10.12 | CSRF binding for the redirect. | **Not** for replay of the response |
| `code_challenge` / `code_verifier` | RFC 7636 | PKCE binding of request to token exchange. | Use `S256`, never `plain` |
| `nonce` | OIDC Core §3.1.2.1 | Binds an ID token to the auth request. | Replay defense for the **ID token** |
| `request` / `request_uri` | RFC 9101 / RFC 9126 | Signed request object / PAR reference. | Integrity of the auth request |
| `response_mode=jwt` | JARM | Return the response as a signed/encrypted JWT. | Integrity of the **response** (Module 09a) |
| `resource` | RFC 8707 | Target audience for the token. | Audience restriction |
| `authorization_details` | RFC 9396 | Typed, fine-grained authorization (RAR). | Beyond coarse scopes |
| `acr_values` / `max_age` | OIDC Core / RFC 9470 | Requested/required auth strength + freshness. | Step-up authentication |
| `DPoP` (header) | RFC 9449 | Per-request proof-of-possession JWT. | Sender-constrains the token |
| `prompt` | OIDC Core §3.1.2.1 | `none` / `login` / `consent` / `select_account`. | `none` MUST NOT show UI; drives silent renewal |
| `max_age` | OIDC Core §3.1.2.1 | Maximum age, in seconds, of the authentication event. | Makes `auth_time` REQUIRED |
| `id_token_hint` / `post_logout_redirect_uri` | OIDC RP-Initiated Logout 1.0 | Which session to end, and where to return. | The redirect URI needs **exact** matching |
| `response_mode=jwt` family | JARM | `jwt`, `query.jwt`, `fragment.jwt`, `form_post.jwt`. | Enabled by `authorization_signed_response_alg` |
| `login_hint` / `binding_message` / `user_code` | CIBA Core 1.0 | Who to authenticate; a string the user can match; a secret they must supply. | `binding_message` does not defend an *unsolicited* prompt |
| `auth_req_id` | CIBA Core 1.0 | Handle the client polls the token endpoint with. | Reuses the device grant's polling errors |
| `authorization_details` | RFC 9396 | JSON array of typed authorization objects; `type` is the only REQUIRED field. | `invalid_authorization_details` covers five failure classes |
| `assertion` | RFC 7523 §2.1 | The JWT used **as the authorization grant**. | Whoever holds the signing key can name any `sub` unless the deployment restricts it |
| `client_assertion` / `client_assertion_type` | RFC 7523 §2.2 | The JWT used **as client authentication**; composes with any grant. | `private_key_jwt` — the strongest common client auth |
| `subject_token` / `subject_token_type` | RFC 8693 §2.1 | Who the exchanged token is *for*. Both REQUIRED. | Type is explicit so the AS never sniffs |
| `actor_token` / `actor_token_type` | RFC 8693 §2.1 | Who is *acting*. Its presence is what requests delegation. | Silently ignored here — Module 06 |
| `requested_token_type` | RFC 8693 §2.1 | What kind of token to return. | Meaningless unless the response carries `issued_token_type` |
| `audience` | RFC 8693 §2.1 | Logical name of the target service (cf. `resource`). | Audience restriction |
| `issued_token_type` *(response)* | RFC 8693 §2.2.1 | **REQUIRED** — what the AS actually issued. | Absent here; the client cannot tell what it got |

## Claims (tokens)

| Claim | Defining spec | Meaning | Validation rule |
|-------|---------------|---------|-----------------|
| `iss` | RFC 7519 / OIDC | Issuer. | Must equal the expected AS |
| `sub` | RFC 7519 / OIDC | Subject (the user). | Stable per-user identifier |
| `aud` | RFC 7519 / OIDC | Audience. | RS must check itself is in `aud` |
| `exp` / `iat` / `nbf` | RFC 7519 | Expiry / issued-at / not-before. | Reject expired/not-yet-valid |
| `nonce` | OIDC Core | Echo of request `nonce`. | RP must match to its stored value |
| `acr` / `amr` | OIDC Core | Auth context class / methods. | Step-up decisions (RFC 9470) |
| `auth_time` | OIDC Core | When the user authenticated. | `max_age` enforcement |
| `azp` | OIDC Core | Authorized party. | For multi-audience ID tokens |
| `cnf` (`jkt`, `x5t#S256`) | RFC 9449 / RFC 8705 | Confirmation — bound key/cert. | Sender-constrained token check |
| `ath` | RFC 9449 §4.3 | Hash of the access token, in a DPoP proof. | **`ath`, not `sub`** — common mistake |
| `scope` | RFC 9068 | Granted scopes in a JWT AT. | RS authorization input |
| `act` | RFC 8693 §4.1 | The acting party in a delegation; nests to record a chain. | Absence on a service-issued token should fail closed |
| `may_act` | RFC 8693 §4.4 | Placed in the *subject's* token: who may become the actor for them. | Pre-authorizes delegation without a bespoke policy table |
| `at_hash` | OIDC Core §3.1.3.6 | Left-most half of the hash of the access token. | Required when `response_type` includes `token` |
| `c_hash` | OIDC Core §3.3.2.11 | Left-most half of the hash of the authorization code. | What makes the hybrid flow safe |
| `s_hash` | FAPI | Left-most half of the hash of `state`. | Integrity for `state`, which is otherwise unprotected |
| `_sd` | RFC 9901 §4.2.4.1 | Array of digests of Disclosures (and decoys) for object properties. Order MUST be shuffled. | The signature covers these, **not** the claim values |
| `_sd_alg` | RFC 9901 §4.1.1 | Hash algorithm for the digests; top level only. | Absent ⇒ `sha-256` MUST be assumed |
| `...` | RFC 9901 §4.2.4.2 | `{"...": "<digest>"}` marks a hidden **array element**, positionally. | The key MUST be exactly three dots |
| `sd_hash` | RFC 9901 §4.3 | Digest over the issuer-signed JWT plus the Disclosures *selected for presentation*. | Pins the proof to this exact subset |
| `vct` | SD-JWT VC (**draft**) §2.2.2.1 | Credential type identifier; a Collision-Resistant Name. | Lets a verifier accept only the right *kind* of credential |
| `verified_claims` | OIDC Identity Assurance §5.1 | Container with two sub-elements: `verification` (provenance) and `claims` (the verified values). | Accountability, not stronger crypto |
| `authority_hints` | OpenID Federation §3.1.2 | Entity Identifiers of an entity's Immediate Superiors. | The upward pointer trust-chain resolution follows |
| `grant_id` | Grant Management (Draft) §5.2 | Identifies one grant for a given AS, client and resource owner. Returned in the token response. | Module 10 |
| `grant_management_action` | Grant Management (Draft) §5.2 | `create` / `merge` / `replace`. `merge` and `replace` both invalidate existing refresh tokens. | Module 10 |

## Acronyms

| Acronym | Expansion | Spec |
|---------|-----------|------|
| AS / RS / OP / RP | Authorization Server / Resource Server / OpenID Provider / Relying Party | RFC 6749, OIDC |
| JOSE | Javascript Object Signing and Encryption | RFC 7515–7519 |
| JWS / JWE / JWK / JWA / JWT | Web Signature / Encryption / Key / Algorithms / Token | RFC 7515–7519 |
| PKCE | Proof Key for Code Exchange | RFC 7636 |
| PAR | Pushed Authorization Requests | RFC 9126 |
| JAR | JWT-Secured Authorization Request | RFC 9101 |
| JARM | JWT Secured Authorization Response Mode | JARM (OpenID Final) |
| DPoP | Demonstrating Proof of Possession | RFC 9449 |
| mTLS | Mutual TLS (client auth + cert-bound tokens) | RFC 8705 |
| DCR | Dynamic Client Registration | RFC 7591/7592 |
| RAR | Rich Authorization Requests | RFC 9396 |
| CIBA | Client-Initiated Backchannel Authentication | CIBA Core 1.0 |
| FAPI | Financial-grade API | FAPI 1.0/2.0 |
| A1 / A1a / A2 / A3a / A4 / A5 | The six FAPI 2.0 attackers (web / web-as-AS / network / read-auth-request / token-endpoint / read-resource-request) | FAPI 2.0 Attacker Model §7 |
| BCP | Best Current Practice | RFC 9700 (BCP 240) |
| SD-JWT | Selective Disclosure for JWTs | RFC 9901 |
| SD-JWT+KB | An SD-JWT with a Key Binding JWT appended | RFC 9901 §4 |
| KB-JWT | Key Binding JWT (`typ: kb+jwt`) | RFC 9901 §4.3 |
| SD-JWT VC | SD-JWT-based Verifiable Digital Credentials | **active Internet-Draft** (‑17) |
| IDA | (OpenID Connect for) Identity Assurance | OIDC Identity Assurance 1.0 |
| VC / VP | Verifiable Credential / Verifiable Presentation | OID4VCI / OID4VP |
| DCQL | Digital Credentials Query Language (`dcql_query`) | OID4VP 1.0 §6 |
| OID4VCI / OID4VP | OpenID for VC Issuance / Verifiable Presentations | OpenID Final |
| BOLA / BFLA / BOPLA | Broken Object / Function / Object-Property Level Authorization | OWASP API Top 10 (2023) |
| RBAC / ABAC / ReBAC | Role- / Attribute- / Relationship-Based Access Control | Module 11 |
| CIMD | Client ID Metadata Document | active Internet-Draft (`AGENTS.md`) |

---

_Terms are added per module as they first appear. If a bolded term in a module is missing here, that's a bug —
report it (Stage 4 consistency pass checks exactly this)._
