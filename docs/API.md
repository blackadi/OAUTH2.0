# API Reference

All endpoints are prefixed with `/api` unless noted. Routes are defined in `server/src/routes/` and handled by controllers in `server/src/controllers/`.

- [OAuth Core](#oauth-core)
- [OIDC & Discovery](#oidc--discovery)
- [Authentication & Consent](#authentication--consent)
- [CIBA](#ciba)
- [Device Flow](#device-flow)
- [Dynamic Client Registration (DCR)](#dynamic-client-registration)
- [Pushed Authorization Requests (PAR)](#pushed-authorization-requests)
- [Grant Management](#grant-management)
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

### `POST /api/introspection`
Authlete-specific token introspection (non-standard).

### `POST /api/introspection/standard`
RFC 7662 standard token introspection.

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
Complete device authentication.

**Body:** `userCode`, `result` (`AUTHORIZED`/`ACCESS_DENIED`), `subject`

**Response:** 200 (SUCCESS), 403 (ACCESS_DENIED), 404 (USER_CODE_NOT_EXIST), 400 (EXPIRED)

### `GET /device`
Browser form for user code entry. No `/api` prefix.

### `POST /device/consent`
Browser consent after code verification. No `/api` prefix.

---

## Dynamic Client Registration

All endpoints require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth for `register`. The `get`, `update`, and `delete` endpoints use the registration access token from the body.

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

**Response:** 201 `{ request_uri, expires_in }`, 400, 401, 403, 413

---

## Grant Management

### `GET /api/gm/:grantId`
Query grant status. Bearer token required.

### `DELETE /api/gm/:grantId`
Revoke grant. Bearer token required.

**Response:** 204 No Content

---

## Logout & Backchannel Logout

### `GET /api/logout`
RP-Initiated Logout (OIDC Session Management).

**Query Params:** `client_id`, `post_logout_redirect_uri`, `id_token_hint`, `state`, `backchannel` (set to `true` to trigger deliver-all)

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

All require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth.

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

All require `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth.

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
| 201 | Created (DCR register, PAR) |
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
