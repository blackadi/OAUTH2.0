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

Both endpoints require a Bearer token that carries the relevant scope
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

**Errors (both):** 401 `invalid_token` (missing/invalid token) · 403 `access_denied` (insufficient scope, or
the token is not associated with this grant) · 404 `not_found` (no such grant)

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

**Body:** `order` (optional JSON with `requestIdentifier`, `transactionId`, etc.)

**Response:** 200 (OK), 202 (still pending — keep polling), 400, 403, 500

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
Receive incoming logout tokens from other OPs.

**Body:** `logout_token`

**Response:** 200 (processed), 400 (invalid token)

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
| `/api/token/create` | POST | Create token programmatically |
| `/api/token/delete/:accessTokenIdentifier` | DELETE | Delete token by identifier |
| `/api/token/update` | PATCH | Update token scopes/metadata |
| `/api/token/revoke` | POST | Revoke token via management API |
| `/api/token/reissue` | POST | Reissue ID token |
| `/api/token/createLocalToken` | GET | Create local JWT (dev only, returns 404 in production) |

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
