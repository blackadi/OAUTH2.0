# API Reference

> **The short version:** Complete reference for all 40+ endpoints. Routes are defined in `server/src/routes/` and handled by controllers in `server/src/controllers/`.

---

All endpoints are prefixed with `/api` unless noted.

- [OAuth Core](#oauth-core)
- [OIDC & Discovery](#oidc--discovery)
- [Authentication & Consent](#authentication--consent)
- [CIBA](#ciba)
- [Device Flow](#device-flow)
- [Dynamic Client Registration (DCR)](#dynamic-client-registration)
- [Pushed Authorization Requests (PAR)](#pushed-authorization-requests)
- [Grant Management](#grant-management)
- [Verifiable Credential Issuance (VCI / OID4VCI)](#verifiable-credential-issuance-vci--oid4vci)
- [Logout & Backchannel Logout](#logout--backchannel-logout)
- [Token Management (Admin)](#token-management-admin)
- [Client Management (Admin)](#client-management-admin)
- [Health](#health)
- [Monitoring](#monitoring)

---

## OAuth Core

### `GET /api/authorize`
OAuth authorization endpoint. Accepts query params for authorization code flow.

**Query Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `response_type` | ✓ | Must be `code` |
| `client_id` | ✓ | Registered client identifier |
| `redirect_uri` | ✓ | Must match client's registered URI |
| `scope` | — | Space-separated scope values |
| `state` | — | Opaque value for CSRF on redirect |
| `code_challenge` | — | PKCE code challenge (RFC 7636) |
| `code_challenge_method` | — | `S256` or `plain` |
| `claims` | — | JSON claims request (OIDC §5.5) |
| `request` | — | JWT-secured authorization request |
| `request_uri` | — | PAR request URI |
| `resource` | — | Resource indicator (RFC 8707) |
| `prompt` | — | `none`, `login`, or `consent` |

**Response:** 302 redirect to login, consent, or client's `redirect_uri`.

### `POST /api/token`
OAuth token endpoint. Accepts `application/x-www-form-urlencoded` or `application/json`.

**Grant Types:** `authorization_code`, `client_credentials`, `password`, `refresh_token`, `urn:ietf:params:oauth:grant-type:token-exchange`, `urn:ietf:params:oauth:grant-type:jwt-bearer`, `urn:openid:params:grant-type:ciba`, `urn:ietf:params:oauth:grant-type:device_code`

**Response:** 200 `{ access_token, token_type, expires_in, refresh_token?, id_token?, scope? }`

**Client authentication — pick one channel, not both.** Send your secret either in an
`Authorization: Basic` header (`client_secret_basic`) **or** as `client_secret` in the body
(`client_secret_post`). Sending both is refused with 400 `invalid_request`: RFC 6749 §2.3.1 says
*"The client MUST NOT use more than one authentication method in each request."* A bare `client_id` in
the body alongside a Basic header is fine — `client_id` is not a credential. The same rule applies at
`POST /api/par`, which RFC 9126 §2 gives the token endpoint's client authentication.

### `GET /api/userinfo`
UserInfo endpoint. Bearer token required.

### `POST /api/userinfo`
UserInfo via POST. Token in body or Authorization header.

> **This server exposes two introspection endpoints, and only one of them is RFC 7662.** They are not
> alternatives — they answer different questions for different callers.
>
> | | `/api/introspection` | `/api/introspection/standard` |
> |---|---|---|
> | Specification | **Authlete-proprietary** | **RFC 7662** |
> | Built for | a resource server holding an Authlete service token; richer diagnostics | any RFC 7662 client |
> | Response | Authlete's `action`/`existent`/`usable` envelope | the spec's `{"active": …}` body |
> | Extras | RFC 9470 step-up (`acr`, `auth_time`, challenge), DPoP binding checks | — |
> | Unknown token | `401` + `WWW-Authenticate: Bearer error="invalid_token"` | `200 {"active":false}` (§2.2) |
>
> **Both require admin Basic auth** (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`) and carry a 60/min rate limiter.
> RFC 7662 §2.1 requires the endpoint to be protected *"to prevent token scanning attacks"*; until
> 2026-08-12 neither endpoint had any middleware at all. **Authentication fails closed** — with either
> variable unset, every request is rejected — and the check runs **before** any Authlete call, so a rejected
> caller learns nothing about the token.
>
> Note the credential is this deployment's *administrator*, not a client. §2.1 requires "some form of
> authorization" and names client authentication only as an example; a real resource server should not hold
> management credentials, which is recorded as a follow-up in
> `audit/02-findings/RFC7662-token-introspection.md`.

### `POST /api/introspection`
Authlete-specific token introspection (non-standard). **Admin Basic auth required.**

**Body Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `token` | ✓ | The access token to introspect |

**Optional Step-Up Auth Parameters (RFC 9470):**

| Param | Type | Description |
|-------|------|-------------|
| `acrValues` | string | Space-separated required ACR values. Returns 403 if token's ACR doesn't match |
| `maxAge` | number | Maximum authentication age in seconds. Returns 403 if token's `auth_time` + `maxAge` < now |

**Response:** 200 with token info, or 403 with `insufficient_user_authentication` error (RFC 9470) including `acr_values`/`max_age` challenge.

### `POST /api/introspection/standard`
RFC 7662 standard token introspection. **Admin Basic auth required.**

**Body:** `token` (required), plus any other RFC 7662 parameter. Client credentials, if a caller sends any,
belong in the **body** — the `Authorization` header carries the admin credential.

**Response:** 200 with the RFC 7662 body (`{"active":false}` for an unknown or revoked token — §2.2 makes an
inactive token a result, not an error), 400, 401 (missing/invalid admin credentials), 500.

**JWT responses (RFC 9701).** Send `Accept: application/token-introspection+jwt` and the response is a signed
JWT with that same media type, carrying `iss`, `aud`, `iat` and a `token_introspection` claim. The JWT form
**also requires `rsUri` in the body** — it becomes the `aud`, naming the resource server that asked. Without it
Authlete answers `400 [A404301] The URI of the resource server is required when a JWT introspection response is
requested.`, which is passed through unchanged: `aud` identifies the caller, and the server has no honest way
to guess which resource server that is. This returned **500** until 2026-08-13.

### `POST /api/revocation`
RFC 7009 token revocation.

---

## OIDC & Discovery

### `GET /api/.well-known/openid-configuration`
OIDC Discovery document (RFC 8414). Mounted under `/api` prefix.

### `GET /api/.well-known/jwks.json`
JSON Web Key Set (RFC 7517). Mounted under `/api` prefix.

---

## Authentication & Consent

### `GET /api/session/login`
Renders login form (EJS). Generates CSRF token.

### `POST /api/session/login`
Validates credentials, sets session. Rate-limited (5/min/IP). Brute-force: 5 failed → 60s ban.

**Body:** `username`, `password`, `_csrf`

### `GET /api/session/consent`
Renders consent form (EJS) showing scopes and client name. Generates CSRF token.

### `POST /api/session/consent`
Approves or denies authorization request.

**Body:** `decision` (`approve`/`deny`), `_csrf`

---

## CIBA

### `POST /api/ciba/authentication`
Initiate CIBA authentication. No admin auth — client auth via body `clientId`/`clientSecret`.

**Body:** `parameters` (URL-encoded), `clientId`, `clientSecret`

**Response:** 200 `{ ticket, hintType, hint, deliveryMode }`

### `POST /api/ciba/issue`
Issue `auth_req_id` after user authentication.

**Body:** `ticket`

**Response:** 200 `{ authReqId, expiresIn, interval }`

### `POST /api/ciba/fail`
Mark CIBA request as failed.

**Body:** `ticket`, `reason`

**Response:** 403 (FORBIDDEN) or 400 (BAD_REQUEST)

### `POST /api/ciba/complete`
Complete CIBA with end-user result.

**Body:** `ticket`, `result` (`AUTHORIZED`/`ACCESS_DENIED`/`TRANSACTION_FAILED`), `subject`

**Response:** 200 (poll mode) or 200 with notification

---

## Device Flow

### `POST /api/device/authorization`
Initiate device flow.

**Body:** `parameters` (URL-encoded), `clientId`, `clientSecret`

**Response:** 200 `{ deviceCode, userCode, verificationUri, expiresIn, interval }`

### `POST /api/device/verification`
Verify user code.

**Body:** `userCode`

**Response:** 200 (VALID), 404 (NOT_EXIST), 400 (EXPIRED)

### `POST /api/device/complete`
Complete device authentication. **Development-only** — returns a flat `404` unless `NODE_ENV=development`
(`middleware/development-only.ts`), because it approves a pending authorization as any `subject` the caller
names with no authentication of that subject. The production path is `POST /device/consent`, which logs the user
in first. Rate-limited by `deviceCodeLimiter` (5/min).

**Body:** `userCode`, `result` (`AUTHORIZED`/`ACCESS_DENIED`), `subject`

**Response:** 200 (SUCCESS), 403 (ACCESS_DENIED), 404 (USER_CODE_NOT_EXIST — or the environment gate), 400 (EXPIRED)

### `GET /device`
Browser form for user code entry. No `/api` prefix.

### `POST /device/consent`
Browser consent after code verification. No `/api` prefix.

---

## Dynamic Client Registration

All endpoints require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth for `register`. **Authentication fails closed**: if either variable is unset, these endpoints return 401 rather than allowing the request. The `get`, `update`, and `delete` endpoints use the registration access token from the body.

### `POST /api/client/dcr/register`
Register new OAuth client (RFC 7591).

**Response:** 201 (CREATED), 400, 401

> **Admin Basic auth here is a deliberate departure from RFC 7591 §3, not an attempt at it.** §3 says the
> registration endpoint *"SHOULD allow registration requests with no authorization"*, and MAY instead require an
> **initial access token** — which the RFC specifies is *"in the form of an OAuth 2.0 access token"*. This
> deployment does **neither**: it refuses open registration and gates the endpoint on this server's management
> credentials, so a client holding a legitimately obtained initial access token still cannot register.
>
> The reason is what this deployment *is*. An open `register` endpoint on a public teaching server is a free
> client factory for anyone who finds it. **The body is conformant even though the gate is not** — since
> 2026-08-14 the 201 carries RFC 7591 §3.2.1's registration response at the top level rather than nested inside
> Authlete's envelope (T1-11), so `client_id` is where a conforming client looks for it.
>
> `get`/`update`/`delete` are a different case: they present the **registration access token**, which is RFC
> 7592's own mechanism. Their departure is the HTTP surface — four `POST` routes taking the token in a JSON body,
> where §2 wants `GET`/`PUT`/`DELETE` on a per-registration client configuration endpoint, and there is no
> `registration_client_uri` to reach one by. See `SPEC-INVENTORY.md` (7592-W3): **the body is conformant, the
> endpoint is not**, and the pair is easy to misread as done because the RFC 7591 half beside it *was* fixed.

### `POST /api/client/dcr/get`
Get client by registration access token.

**Body:** `token`, `clientId`

**Response:** 200

### `POST /api/client/dcr/update`
Update client registration.

**Response:** 200 (UPDATED), 400, 401

### `POST /api/client/dcr/delete`
Delete client registration.

**Response:** 204 (DELETED), 400, 401

---

## Pushed Authorization Requests

### `POST /api/par`
Push authorization parameters (RFC 9126). No admin auth.

**Body:** `parameters` (URL-encoded), `clientId`, `clientSecret`

**Client authentication** — must match the client's registered method, because Authlete checks
which channel the credentials arrive on and returns 401 on a mismatch:

| Registered method | How to send credentials |
|---|---|
| `client_secret_basic` | `Authorization: Basic <base64(id:secret)>` header; omit them from the body |
| `client_secret_post` | `clientId` + `clientSecret` body fields (merged into `parameters`) |
| `none` | `clientId` only |

**Response:** 201 `{ request_uri, expires_in }`, 400, 401, 403, 413

---

## Grant Management

Both endpoints are **protected resources** and accept either scheme: `Bearer` for an ordinary token, or
`DPoP` plus a `DPoP:` proof header for a key-bound one (RFC 9449 §7.1 permits no alternative for a bound
token). `Bearer` carrying a proof is refused with 400 — that combination is the §7.2 downgrade.

Both endpoints require a token that carries the relevant scope
(`grant_management_query` / `grant_management_revoke`) **and that was itself issued under the grant being
addressed**. A token bound to a different grant — or to none at all, such as a `client_credentials` token —
gets 403. See [GRANT-MANAGEMENT.md](./GRANT-MANAGEMENT.md) and
`server/src/middleware/require-grant-ownership.ts`.

### `GET /api/gm/:grantId`
Query grant status.

**Response:** 200 with the grant's scopes and claims

### `DELETE /api/gm/:grantId`
Revoke grant.

**Response:** 204 No Content

**Errors (both):** 401 with **no error code** and `WWW-Authenticate: Bearer, DPoP` (no token presented —
RFC 6750 §3.1) · 401 `invalid_token` (expired, revoked or unknown token) · 401 `invalid_dpop_proof`
(`DPoP` scheme with no proof, or a proof that does not match the token's key) · 400 `invalid_request`
(`Bearer` scheme carrying a proof) · 403 `access_denied` (insufficient scope, or the token is not
associated with this grant) · 404 `not_found` (no such grant)

---

## Verifiable Credential Issuance (VCI / OID4VCI)

9 endpoints under `/api/vci/*` plus `/.well-known/openid-credential-issuer` implementing [OID4VCI 1.0 Final](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html). The flow has three phases: **Discovery** (public) → **Offers** (admin) → **Credential** (requires access token). Authlete SDK handles all underlying protocol logic.

### Discovery (Public)

#### `GET /api/vci/metadata`
Credential Issuer metadata (OID4VCI §12.2). Returns `credential_issuer`, `credential_endpoint`, `credential_configurations_supported`, etc.

**Response:** 200 (parsed `responseContent` JSON), 404

#### `GET /api/vci/jwtissuer`
JWT VC issuer metadata (`/.well-known/jwt-vc-issuer`). Public endpoint.

**Response:** 200 (parsed `responseContent` JSON), 404

#### `GET /api/vci/jwks`
VCI JWKS endpoint. Public key distribution.

**Response:** 200 (parsed `responseContent` JSON), 404

#### `GET /api/vci/well-known`
Alias for metadata endpoint. Convenience endpoint for the dev UI. Same as `GET /.well-known/openid-credential-issuer`.

**Response:** 200 (parsed `responseContent` JSON), 404

#### `GET /.well-known/openid-credential-issuer`
OID4VCI §12.2 well-known credential issuer metadata. Mounted at root path for spec compliance. Returns identical data to `/api/vci/metadata`.

**Response:** 200 (parsed `responseContent` JSON), 404

### Offer Management (Admin Basic Auth)

Server-side credential offer creation. These are out-of-band admin operations, not part of the OID4VCI wallet-facing protocol.

#### `POST /api/vci/offer/create`
Create a credential offer.

**Body:** `credentialConfigurationIds` (string[], required), `subject`, `duration`, `context`, `acr`, `txCode`, `txCodeInputMode`, `txCodeDescription`, `authorizationCodeGrantIncluded`, `preAuthorizedCodeGrantIncluded`, `issuerStateIncluded`, `properties`, `jwtAtClaims`, `authTime`

**Response:** 201 (CREATED), 400, 403, 500

#### `POST /api/vci/offer/info`
Get offer information by identifier.

**Body:** `identifier` (required)

**Response:** 200 (OK), 403, 404, 400, 500

### Credential Endpoint (OID4VCI §8)

#### `POST /api/vci/credential/issue`
Issue a single verifiable credential. Maps to the OID4VCI Credential Endpoint (§8). Requires an access token obtained via authorization code or pre-authorized code flow. Accepts token via `Authorization: Bearer` header or `accessToken` body field.

**Body:** `accessToken` (required), `order` (optional JSON with `requestIdentifier`, `credentialPayload`, etc.)

**Response:** 200 (OK), 202 (ACCEPTED — deferred, returns `transaction_id`), 400, 401, 403, 500

### Batch Credential Endpoint (OID4VCI §10)

#### `POST /api/vci/credential/batch`
Request multiple verifiable credentials in a single API call. Maps to the OID4VCI Batch Credential Endpoint (§10). Accepts either OID4VCI format (`credential_requests` array) or Authlete internal format (`orders` array).

**Body:** `accessToken` (required), `credential_requests` (OID4VCI format: array of `{format, vct/doctype}`) or `orders` (Authlete format: array of `{requestIdentifier, credentialPayload}`)

**Response:** 200 (OK), 400, 401, 403, 500

### Deferred Credential Endpoint (OID4VCI §9)

#### `POST /api/vci/deferred/issue`
Retrieve a credential after deferred issuance. Maps to the OID4VCI Deferred Credential Endpoint (§9). Called when the Credential Endpoint returned 202 with a `transaction_id`.

**Requires an access token** — `Authorization: Bearer <token>` (or `DPoP`, or an `accessToken` JSON body field), the same token used at the Credential Endpoint.

**Body:** `order.transactionId` (**required** — from the 202 response). Optionally `order.credentialPayload`, `order.credentialDuration`, `order.signingKeyId`.

`order.requestIdentifier` is **ignored if supplied**: the server takes it from Authlete's deferred *parse* response, so issuance is bound to the credential request the validated `transaction_id` resolves to. A body carrying `requestIdentifier` with no `transactionId` is refused with 400 — it is the shape that bypassed validation before 2026-08-13.

**Two Authlete calls.** Unlike the Credential and Batch endpoints, whose Authlete APIs accept the access token alongside the order, `/vci/deferred/issue` takes only an `order` and cannot validate a token. The server therefore calls `/vci/deferred/parse` first — the only API on this path that accepts one — and issues only when it answers `OK`.

**Response:** 200 (OK), 202 (still pending — keep polling), 400, **401 (no token, or Authlete rejected it)**, 403, 500

---

## Native SSO

### `POST /api/nativesso`
Process Native SSO token exchange. No admin auth — client auth via body `clientId`/`clientSecret`.

**Body:** `clientId`, `clientSecret`, `accessToken`, `deviceSecret`, `deviceSecretHash` (optional), `sub` (optional), `claims` (optional), `idtHeaderParams` (optional), `idTokenAudType` (optional)

**Response:** 200 (OK — returns `responseContent` JSON with ID token, device secret), 400 (CALLER_ERROR), 500 (INTERNAL_SERVER_ERROR)

### `POST /api/nativesso/logout`
Revoke all tokens for a session. No admin auth — client auth via body `clientId`/`clientSecret`.

**Body:** `clientId`, `clientSecret`, `sessionId`

**Response:** 200 (OK — returns `responseContent` JSON with revocation confirmation), 500 (INTERNAL_SERVER_ERROR)

---

## Logout & Backchannel Logout

RP-Initiated Logout is **two requests**. OpenID Connect RP-Initiated Logout 1.0 §2 requires the OP to ask the End-User before ending the session, and asking is also what keeps a state-changing operation off a bare `GET`.

### `GET /api/logout`
Renders the logout confirmation page. **Destroys nothing.**

**Query Params:** `client_id`, `post_logout_redirect_uri`, `id_token_hint`, `state`, `backchannel` (all optional)

**Response:** 200 — an HTML form carrying a `_csrf` token plus every supplied parameter as a hidden field. The destination is shown to the user only when it would actually be honoured.

### `POST /api/logout`
Ends the session. Verifies any `id_token_hint` against the OP's JWKS, optionally delivers backchannel logout tokens, destroys the session and clears the cookie, then redirects if `post_logout_redirect_uri` is allowed.

**Body (form-encoded):** `_csrf` (**required** — from the confirmation page), then `client_id`, `post_logout_redirect_uri`, `id_token_hint`, `state`, `backchannel` (set to `true` to trigger deliver-all). Query-string values are read as a fallback; the body wins.

**Response:** 302 (redirect to `post_logout_redirect_uri`), 200 (signed-out page, when no allowed redirect target was supplied — the session is gone either way), 403 (CSRF mismatch — the session is untouched)

**Redirect rule (RP-Initiated Logout 1.0 §3).** The URI must **exactly match** one registered for *that client*. The client is taken from `client_id`, or from the `aud` of a verified `id_token_hint` when `client_id` is absent. **No identified client ⇒ no redirect**, since an unidentified client has an empty registered set. Matching is byte-for-byte: `http://localhost:3000` does not match `http://localhost:3000/`. The registry is the `POST_LOGOUT_REDIRECT_URIS` env var (`{"<clientId>": ["<uri>", …]}`) because Authlete 3.0 has no client field for it. `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` do **not** authorise redirects.

### `POST /api/backchannel_logout`
Receive incoming logout tokens from other OPs. Here this server is the **RP**, not the OP.

**Body:** `logout_token`

**Validation (OIDC Back-Channel Logout §2.6, all eleven steps).** Signature against `JWKS_URI`; `alg` from an
allowlist that excludes `none`; `iss` equal to `BACKCHANNEL_LOGOUT_ISSUER`; `aud` equal to
`BACKCHANNEL_LOGOUT_AUDIENCE`; `exp` unexpired; `iat` within five minutes; the backchannel-logout `events`
claim present; `sub` or `sid` present; and **no** `nonce` claim. On success the **subject's** sessions are
terminated — not the caller's, which is another server and has no browser session.

**Configuration is required, and its absence is a 500.** With any of `JWKS_URI`,
`BACKCHANNEL_LOGOUT_ISSUER` or `BACKCHANNEL_LOGOUT_AUDIENCE` unset the endpoint answers
`500 server_error` without examining the token. Omitting an `iss`/`aud` check rather than refusing would
silently downgrade it to "any issuer, any audience".

**Response:** 200 (processed) · 400 (the token is bad — the sender's fault) · 500 (we are misconfigured, or
the session store failed — our fault). `Cache-Control: no-store` on every response (§2.8).

### `POST /api/backchannel_logout/issue`
Create signed logout token. Admin Basic auth required.

**Body:** `clientIdentifier`, `subject`, `sessionId?`

### `POST /api/backchannel_logout/deliver`
Create and deliver logout token to specific client. Admin Basic auth required.

**Body:** `clientIdentifier`, `subject`, `sessionId?`

### `POST /api/backchannel_logout/deliver-all`
Create and deliver logout tokens to all clients. Admin Basic auth required.

**Body:** `subject`, `sessionId?`

---

## Token Management (Admin)

All require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth. **Authentication fails closed**: if either variable is unset, these endpoints return 401 rather than allowing the request.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token/list` | GET | List all tokens |
| `/api/token/create` | POST | Create token programmatically. **Accepts `grant_type=implicit`** — see the note below |
| `/api/token/delete/:accessTokenIdentifier` | DELETE | Delete token by identifier |
| `/api/token/update` | PATCH | Update token scopes/metadata |
| `/api/token/revoke` | POST | Revoke token via management API |
| `/api/token/reissue` | POST | Reissue ID token |
| `/api/token/createLocalToken` | GET | Create a local **RFC 9068** JWT access token (dev only, returns 404 in production). Requires `sub`, `aud` and `client_id`; `iss` defaults to `JWT_ISSUER`. Optional `scope`, `acr`, `authTime`. The token carries `typ: at+jwt` and all seven claims §2.2 marks REQUIRED — `client_id` is required *because* of that, since this token is the repo's worked example of the section |

> ### `POST /api/token/create` accepts `implicit`, and that is not a client-facing grant
>
> `normalizeGrantType` (`services/token.operations.service.ts`) maps ten values, and `implicit` is one of them.
> A reader who finds it there could reasonably conclude the implicit grant is available to clients at
> `/api/token`. **It is not, and the two surfaces are answering different questions.**
>
> | | `POST /api/token` | `POST /api/token/create` |
> |---|---|---|
> | who calls it | any registered client | **admin only** — `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` |
> | `grant_type` means | *"authorize me by this flow"* | *"record this as what authorized the token"* |
> | `implicit` | never reaches here — the implicit flow returns a token from the **authorization** endpoint, not the token endpoint, by definition | accepted, and stored as the token's provenance |
>
> The admin API mints a token directly and stamps `grantType` on it as a **historical fact**, so its value set is
> Authlete's ten-member `GrantType` enum rather than the grants a client may request. `implicit` is in that enum
> because Authlete must be able to represent tokens that *were* issued that way.
>
> **This is why `normalizeGrantType` refuses rather than defaulting** (B1-W3): a value in this field is an
> assertion about the past, and coercing an unrecognised one to `AUTHORIZATION_CODE` did not fail to answer the
> question — it answered it wrongly, for the life of the token. Whether the implicit *flow* should be enabled at
> all is a separate matter, ruled deliberately: it is on, because Modules 01 and 07 teach why RFC 9700 §2.1.2
> retired it. See the `README.md` departures table.

---

## Client Management (Admin)

All require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth. **Authentication fails closed**: if either variable is unset, these endpoints return 401 rather than allowing the request.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/client/list` | GET | List all OAuth clients |
| `/api/client/create` | POST | Create new client |
| `/api/client/get/:clientId` | GET | Get client details |
| `/api/client/update/:clientId` | PATCH | Update client |
| `/api/client/delete/:clientId` | DELETE | Delete client |
| `/api/client/secret/refresh/:clientId` | POST | Generate new client secret |
| `/api/client/secret/update/:clientId` | PUT | Set specific client secret |

> **`PATCH /api/client/update/:clientId` is read-modify-write, and that is not an optimisation.** Authlete's
> update API **replaces** the client object rather than merging into it, and the request mapper names roughly
> **40** of the `Client` schema's **108** properties. Building the request from scratch therefore sent one
> missing ~68 fields, so changing a client's name could silently clear `tokenAuthMethod`, `pkceRequired` or
> `redirectUris` — **with a 200**. Since 2026-08-14 the current client is fetched first and the named changes
> applied on top. Two accepted costs: two Authlete calls per update, and a missing client now fails on the read.

### The `attributes` field — a vendor namespace, and it is not inert

Both `create` and `update` accept an `attributes` array of key/value pairs. This is **an Authlete feature, not
part of any specification** — no OAuth or OIDC document defines client attributes.

```json
{ "attributes": [ { "key": "tier", "value": "gold" }, { "key": "owner", "value": "payments-team" } ] }
```

**Authlete assigns meaning to some keys, so the namespace is not free-form storage.** The clearest example is on
*scope* attributes rather than client attributes: a scope carrying a **`regex`** attribute becomes a
**parameterized scope**, and a `fapi2` attribute is what makes Authlete enforce FAPI rules per request. A key
you invent today may collide with a key Authlete defines tomorrow — prefix your own.

**Validated, not cast** (since 2026-08-14): the value must be an array of objects with a non-empty string `key`;
`value` is optional. Both a malformed entry and a **non-array** are `400`. The non-array case used to be
*silently dropped*, which answered 200 for a setting that never took effect — the worst of the three outcomes,
because nothing anywhere reported it. This is deliberately **stricter than the SDK**, whose `Pair` type makes
both members optional: an attribute with no key cannot be addressed by anything.

### This repo manages no scopes, and two features depend on that

There is **no scope-management endpoint here** — scopes are created and edited in the Authlete console only.
Two vendor features are therefore documented but not reachable through this API:

| Feature | Needs | Consequence |
|---|---|---|
| **Parameterized scopes** | a `regex` attribute on a *scope* | cannot be created or inspected through this server |
| **FAPI per-request enforcement** | a `fapi2=sp` attribute on a *scope* | same — which is why `FAPI-TUTORIAL.md` Part 3 sends you to the console |

---

## Hardware Security Keys (HSK)

> **A vendor feature, not a specification.** No OAuth or OIDC document defines an HSK API. These four endpoints
> wrap `authleteApi.hardwareSecurityKeys.*`, and the concept — a key handle held in an HSM, referenced rather
> than exported — is the same one Modules 00 and 05 teach about signing keys and `kid`. Nothing else in this
> repo consumes them; they exist so the surface is reachable and inspectable.

All four require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth, and **fail closed** if either is unset.

| Endpoint | Method | Description | Success |
|----------|--------|-------------|:---:|
| `/api/hsk/create` | POST | Register a key handle on the service | **201** |
| `/api/hsk/list` | GET | All key handles | 200 |
| `/api/hsk/get/:handle` | GET | One key handle | 200 |
| `/api/hsk/delete/:handle` | DELETE | **Destroys** the handle on the service | **204** |

**`create`** takes `kty`, `use`, `kid`, `hsmName`, `alg` in a JSON body. **`kty` and `hsmName` are required**;
the rest are optional.

```json
{ "kty": "EC", "use": "sig", "kid": "hsm-signer-1", "hsmName": "my-hsm", "alg": "ES256" }
```

Action → status for all four: `SUCCESS` → 201 / 200 / 204 as above, `INVALID_REQUEST` → 400, `NOT_FOUND` → 404,
`SERVER_ERROR` → 500.

> ### ⚠️ `DELETE` is destructive and there is no undo
>
> It removes the key handle **from the Authlete service**, not from this server. If anything on that service
> was configured to sign with the handle, it stops being able to. Deleting a handle is not the same as
> deleting a *key* — the key material lives in the HSM and this API never sees it, which is the whole point of
> the indirection. Treat `:handle` as a live production identifier even in a lab.

---

## Health

### `GET /api/health`
Server liveness probe. No auth required.

**Response:** `{ status: "ok", uptime: 123.45, timestamp: "2024-01-01T00:00:00.000Z" }`

### `GET /api/health/authlete`
Authlete connectivity check. Add `?extended=true` for detailed DB check.

### `GET /api/health/all`
Aggregate health (server + Redis + Authlete).

**Response:** `{ status: "ok"|"degraded", uptime, timestamp, checks: { redis, authlete } }`

---

## Monitoring

### `GET /api/metrics`
Prometheus metrics in text format. Histograms for HTTP duration, counters for total requests. Labels: `method`, `route`, `status`.

### `GET /metrics` (also at `/api/metrics`)
Same metrics endpoint, registered at both paths.

---

## Response Status Code Summary

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created (DCR register, PAR, VCI offer) |
| 202 | Accepted (VCI deferred credential issuance) |
| 204 | Deleted / No Content |
| 302 | Redirect (authorization, logout) |
| 400 | Bad request / Invalid params |
| 401 | Unauthorized (missing/invalid auth) |
| 403 | Forbidden / CSRF mismatch |
| 404 | Not found |
| 413 | Payload too large (PAR) |
| 429 | Rate limited |
| 500 | Internal server error |
| 502 | Bad gateway (Authlete unreachable) |
| 503 | Service degraded (health checks) |
