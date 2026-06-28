# CURL Test Suite — Authlete Node.js Authorization Server

Copy-paste these commands to verify every endpoint. Replace `<BASE>` with your server URL (default `http://localhost:3000`).

> **Important:** The client IDs below are examples from a specific Authlete service. Replace `CID`, `SEC`, and `PUB_CID` with clients registered in **your** Authlete service. The `REDIR` points to the server directly (bypassing the SPA) — for the client app use `http://localhost:3001/callback`.

```bash
BASE="http://localhost:3000"
CID="4288007124"                                    # ← REPLACE with your confidential client ID
SEC="FGpSN50T6SK7shEuzzwUNAaXsbfFXfqRJmI1VsncPPsUBgEnPsQ7UG7hc6o-NNnjeIScun5_MRnPc-24JGVPRA"  # ← REPLACE
PUB_CID="3322138582"                                # ← REPLACE with your public client ID
REDIR="http://localhost:3000"
```

### Client Types — What You Need to Know

This project uses two client types registered in Authlete:

| Variable | Client ID | Type | Auth Method | When to Use |
|----------|-----------|------|-------------|-------------|
| `CID` / `SEC` | `4288007124` | **Confidential** | `client_secret_basic` | Use `-u "${CID}:${SEC}"` to send credentials via HTTP Basic auth |
| `PUB_CID` | `3322138582` | **Public** | `none` | **No auth header** — pass `client_id=${PUB_CID}` in the request body instead |

**Common mistake:** Using Basic auth (`-u`) with a public client causes `{"error":"invalid_client"}` — the Authlete console registers `PUB_CID` as public with no secret. Always match the auth method to the client type.

Each section below shows the correct auth for the client being used.

---

## 1. OpenID Discovery (RFC 8414)

Fetches the server's OIDC metadata — issuer URL, supported scopes, grant types, and all endpoint URLs.

```bash
curl -s "${BASE}/api/.well-known/openid-configuration" | jq
```

Expected: JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `scopes_supported`, etc.

---

## 2. JWKS (RFC 7517)

Returns the server's public keys (JSON Web Key Set) for verifying signed tokens.

```bash
curl -s "${BASE}/api/.well-known/jwks.json" | jq
```

Expected: JSON with `keys` array containing at least one EC P-256 key (`kty: EC`, `crv: P-256`).

---

## 3. Client Credentials Grant (RFC 6749 §4.4)

> **Auth method:** Basic auth (`-u`) — uses the **confidential** client (`CID`/`SEC`).

Requests an access token without a user — the client authenticates as itself.

```bash
CC_RESPONSE=$(curl -s -X POST "${BASE}/api/token" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials")
echo "$CC_RESPONSE" | jq
CC_AT=$(echo "$CC_RESPONSE" | jq -r '.access_token')
```

Expected: `access_token`, `token_type: Bearer`, `expires_in`.

---

## 4. Authorization Code Grant (RFC 6749 §4.1)

> **Auth method:** Basic auth (`-u`) — uses the **confidential** client (`CID`/`SEC`).

The full interactive flow through the browser: authorization, login, consent, code exchange.

### 4a. Get authorization code

```bash
# Step 1 — Authorize (Express redirects to login page)
curl -s -c /tmp/cj.txt -b /tmp/cj.txt \
  "${BASE}/api/authorization?response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=s1"

# Step 2 — Login (submit admin / password)
curl -s -c /tmp/cj.txt -b /tmp/cj.txt \
  -X POST "${BASE}/api/session/login" \
  -d "username=admin&password=password"

# Step 3 — Consent (approve the requested scopes, capture the code from redirect)
curl -s -c /tmp/cj.txt -b /tmp/cj.txt \
  -D /tmp/headers.txt -o /dev/null \
  -X POST "${BASE}/api/session/consent" \
  -d "decision=approve"
CODE=$(grep -oP 'code=\K[^&\s]+' /tmp/headers.txt)
echo "Authorization code: $CODE"
```

### 4b. Exchange code for tokens

```bash
TOK_RESP=$(curl -s -X POST "${BASE}/api/token" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=${CODE}&redirect_uri=${REDIR}")
echo "$TOK_RESP" | jq
AT=$(echo "$TOK_RESP" | jq -r '.access_token')
RT=$(echo "$TOK_RESP" | jq -r '.refresh_token')
IDT=$(echo "$TOK_RESP" | jq -r '.id_token')
```

Expected: `access_token`, `refresh_token`, `id_token` (JWT), `token_type: Bearer`, `scope: openid profile`.

Decode the ID Token to inspect its contents:

```bash
echo "$IDT" | python3 -c "
import sys, base64, json
jwt = sys.stdin.read().strip()
parts = jwt.split('.')
if len(parts) == 3:
    p = parts[1]
    pad = 4 - len(p) % 4
    if pad != 4: p += '=' * pad
    print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))
else:
    print('Not a valid JWT. Raw:', jwt[:200])
"
```

Expected JWT payload: `sub: admin` (or your configured user subject), `iss`, `aud`, `s_hash`, `auth_time`, `exp`, `iat`.

---

## 5. Userinfo (OIDC Core §5.3)

> **Auth method:** Bearer token in header — uses the access token from section 4.

### GET (Bearer token in Authorization header)

```bash
curl -s "${BASE}/api/userinfo" -H "Authorization: Bearer ${AT}" | python3 -c "
import sys, base64, json
data = sys.stdin.buffer.read()
try:
    jwt = data.decode('utf-8').strip()
except UnicodeDecodeError:
    print('Response is not UTF-8. Raw (hex):', data.hex()[:200])
    exit(1)
parts = jwt.split('.')
if len(parts) == 3:
    p = parts[1]
    pad = 4 - len(p) % 4
    if pad != 4: p += '=' * pad
    print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))
else:
    print('Not a valid JWT. Raw:', jwt[:300])
"
```

Expected JWT payload: `sub: admin`, `name: Administrator`, `iss`, `aud`, `exp`, `iat`.

### POST (token in form body)

```bash
curl -s -X POST "${BASE}/api/userinfo" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Bearer ${AT}" \
  -d "access_token=${AT}"
```

---

## 6. Refresh Token (RFC 6749 §6)

> **Auth method:** Basic auth (`-u`) — uses the **confidential** client (`CID`/`SEC`).

Get a fresh token pair using the refresh token from section 4b. Test this **before** section 8 (revocation invalidates the associated refresh token).

```bash
RF_RESP=$(curl -s -X POST "${BASE}/api/token" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=${RT}")
echo "$RF_RESP" | jq
AT2=$(echo "$RF_RESP" | jq -r '.access_token')
RT2=$(echo "$RF_RESP" | jq -r '.refresh_token')
```

Expected: new `access_token` and `refresh_token`.

---

## 7. Token Introspection (RFC 7662)

> **Auth method:** None (the endpoint is unprotected — Authlete validates the token internally).

Check whether a token is still active and inspect its metadata.

### Standard introspection (RFC 7662)

```bash
curl -s -X POST "${BASE}/api/introspection/standard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}" | jq
```

Expected: `active: true`, `scope: openid profile`, `sub: admin`, `client_id`, `token_type: Bearer`.

### Non-standard introspection (Authlete-specific — more detail)

```bash
curl -s -X POST "${BASE}/api/introspection" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}" | jq
```

Expected: `action: OK`, `existent: true`, `usable: true`, `subject: admin`.

---

## 8. Token Revocation (RFC 7009)

Two ways to call this endpoint depending on your client type.

### Option A — Confidential client (has a secret)

> **Auth method:** Basic auth (`-u`) — `CID`/`SEC`.

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST "${BASE}/api/revocation" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}"
```

### Option B — Public client (no secret)

> **Auth method:** Pass `client_id` in the body, **no** `-u` flag. If you send Basic auth with a public client, Authlete rejects it with `invalid_client`.

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST "${BASE}/api/revocation" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}&client_id=${PUB_CID}"
```

Expected: `HTTP 200` (empty body). Per RFC 7009 §2.2, the server always returns 200 even for invalid or already-revoked tokens, to prevent token enumeration.

---

## 9. PKCE Authorization Code Flow (RFC 7636)

> **Auth method:** No auth header — uses the **public** client (`PUB_CID`) with a code verifier.

For mobile apps and SPAs that cannot safely store a client secret.

### Generate code challenge (S256)

```bash
CODE_VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
echo "Challenge: $CODE_CHALLENGE"
```

### Get PKCE authorization code

```bash
# Step 1 — Authorize (pass code_challenge in query string)
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt \
  "${BASE}/api/authorization?response_type=code&client_id=${PUB_CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=s2&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256"

# Step 2 — Login
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt \
  -X POST "${BASE}/api/session/login" \
  -d "username=admin&password=password"

# Step 3 — Consent (capture code from Location header)
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt \
  -D /tmp/pkce_headers.txt -o /dev/null \
  -X POST "${BASE}/api/session/consent" \
  -d "decision=approve"
PKCE_CODE=$(grep -oP 'code=\K[^&\s]+' /tmp/pkce_headers.txt)
echo "PKCE code: $PKCE_CODE"
```

### Exchange with code_verifier

```bash
curl -s -X POST "${BASE}/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=${PKCE_CODE}&redirect_uri=${REDIR}&client_id=${PUB_CID}&code_verifier=${CODE_VERIFIER}" | jq
```

Expected: `access_token`, `id_token`, `token_type: Bearer`.

---

## 10. Token Management

Create, update, list, revoke, and reissue tokens via Authlete's management API.

> **Auth requirement:** If `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are set in your `.env`, all management endpoints require Basic auth with those credentials (separate from OAuth client credentials). If unset, the endpoints are unprotected. The examples below assume mgmt auth is **unset** — add `-u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}"` if needed.

### List tokens

```bash
curl -s "${BASE}/api/token/list" | jq
```

### Create token

> **Auth method:** Basic auth (`-u`) — uses the **confidential** client (`CID`/`SEC`). If `MGMT_CLIENT_ID` is set, replace with mgmt credentials instead.

```bash
CREATE_RESP=$(curl -s -X POST "${BASE}/api/token/create" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grantType=CLIENT_CREDENTIALS&subject=test_user&scopes=openid")
echo "$CREATE_RESP" | jq
AT_CREATED=$(echo "$CREATE_RESP" | jq -r '.accessToken')
```

### Update token

```bash
curl -s -X PATCH "${BASE}/api/token/update" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "accessToken=${AT_CREATED}&scopes=openid" | jq
```

### Revoke token (management API — different from section 8)

This uses the Authlete management API (not RFC 7009). It requires the `accessTokenIdentifier` (not the token value itself).

```bash
curl -s -X POST "${BASE}/api/token/revoke" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "accessTokenIdentifier=${AT_CREATED}" | jq
```

Expected: `resultCode: A312001` ("Revoked N access token(s)"). May return `A313301` (token not found) for management-created tokens — a known Authlete API limitation.

### Reissue ID Token

Requires `AT2` and `RT2` from the [Refresh Token](#6-refresh-token-rfc-6749-6) step above.

```bash
curl -s -X POST "${BASE}/api/token/reissue" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "accessToken=${AT2}&refreshToken=${RT2}" | jq
```

---

## 11. RP-Initiated Logout (OIDC)

> **Auth method:** None (browser redirect).

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "${BASE}/api/logout?client_id=${CID}&post_logout_redirect_uri=${REDIR}"
```

Expected: `200` (renders logout confirmation page) or `302` (redirect immediately).

---

## 12. Grant Management for OAuth 2.0 (Draft)

> **Auth method:** Bearer token — uses the access token from section 4 (or any token with `grant_management_query` / `grant_management_revoke` scope).

The Grant Management API lets clients manage their grants (authorizations). You need a `grant_id` which is returned in the token response when the authorization request includes `grant_management_action=create`.

### 12a. Query grant status

```bash
curl -s "${BASE}/api/gm/${GRANT_ID}" \
  -H "Authorization: Bearer ${AT}" | jq
```

Expected (if the grant exists): JSON with `scopes`, `claims`, `authorization_details`, `created_at`, etc.
Expected (if not found): HTTP 404.

### 12b. Revoke a grant

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" -X DELETE \
  "${BASE}/api/gm/${GRANT_ID}" \
  -H "Authorization: Bearer ${AT}"
```

Expected: `HTTP 204` (No Content).

---

## 13. Backchannel Logout (OIDC Back-Channel Logout 1.0)

> **Auth method:** Basic auth with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` (if configured). The same admin credentials used for client management. If unset, the endpoint is unprotected.
>
> Substitute `${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}` with your admin credentials, or omit `-u` if mgmt auth is not configured.

### 13a. Issue a backchannel logout token

Generates a logout token JWT for the specified client without delivering it.

```bash
curl -s -X POST "${BASE}/api/backchannel_logout/issue" \
  -u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"clientIdentifier": "'"${CID}"'", "subject": "admin"}' | jq
```

Expected: JSON with `action: "OK"`, `logoutToken` (JWT string with `typ: "logout+jwt"`), and `backchannelLogoutUri`.

Decode the logout token payload:

```bash
curl -s -X POST "${BASE}/api/backchannel_logout/issue" \
  -u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"clientIdentifier": "'"${CID}"'", "subject": "admin"}' | jq -r '.logoutToken' | python3 -c "
import sys, base64, json
jwt = sys.stdin.read().strip()
parts = jwt.split('.')
if len(parts) == 3:
    p = parts[1]
    pad = 4 - len(p) % 4
    if pad != 4: p += '=' * pad
    print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))
"
```

Expected JWT payload: `typ: "logout+jwt"`, `sub: "admin"`, `aud: [CID]`, `iss`, `iat`, `jti`, `events: { "http://schemas.openid.net/event/backchannel-logout": {} }`.

### 13b. Issue and deliver to one client

Issues a logout token and POSTs it to the client's `backchannelLogoutUri` (the client must have `backchannelLogoutUri` configured in Authlete).

```bash
curl -s -X POST "${BASE}/api/backchannel_logout/deliver" \
  -u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"clientIdentifier": "'"${CID}"'", "subject": "admin"}' | jq
```

Expected: JSON with `clientId`, `success: true` (or `false` if delivery failed), `statusCode` (from the RP's response), and `backchannelLogoutUri`.

### 13c. Issue and deliver to all clients

Iterates all clients in the Authlete service and delivers logout tokens to every client with a `backchannelLogoutUri`.

```bash
curl -s -X POST "${BASE}/api/backchannel_logout/deliver-all" \
  -u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"subject": "admin"}' | jq
```

Expected: JSON array of delivery results, one per client with `backchannelLogoutUri`. Each result has `clientId`, `clientName`, `success`, and either `statusCode` or `error`.

### 13d. Automatic deliver-all via RP-Initiated Logout

Add `&backchannel=true` to the normal RP-Initiated Logout URL to automatically issue and deliver backchannel logout tokens to all clients after the session is destroyed.

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" \
  "${BASE}/api/logout?client_id=${CID}&post_logout_redirect_uri=${REDIR}&backchannel=true"
```

Expected: `200` or `302` (same as normal logout — delivery happens server-side before the redirect).

---

## 14. Health Check

Two health check endpoints: one for the server itself, one that proxies to Authlete's `/api/lifecycle/healthcheck`.

### 14a. Server health (liveness probe)

Returns basic server status without any external dependencies.

```bash
curl -s "${BASE}/api/health" | jq
```

Expected: `{ "status": "ok", "uptime": <seconds>, "timestamp": "..." }`.

### 14b. Authlete connectivity

Proxies to Authlete's health check endpoint to verify the Authlete API is reachable.

```bash
curl -s "${BASE}/api/health/authlete" | jq
```

Expected: `{ "healthy": true, "statusCode": 200, "body": "OK", "extended": false }`.

### 14c. Extended check (includes database)

Adds `?extended=true` to test database connectivity on the Authlete side.

```bash
curl -s "${BASE}/api/health/authlete?extended=true" | jq
```

Expected: `{ "healthy": true, "statusCode": 200, "body": "...", "extended": true }`.

---

## 15. Dynamic Client Registration (RFC 7591 / RFC 7592)

> **Auth method for register:** Basic auth with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` (if configured). Same admin credentials used for backchannel logout. If unset, the endpoint is unprotected.
>
> **Auth method for get/update/delete:** No admin auth — these endpoints identify the client via `registration_access_token` + `clientId` in the request body.

### 15a. Register a new client

```bash
DCR_REG=$(curl -s -X POST "${BASE}/api/client/dcr/register" \
  -u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"json": "{\"client_name\": \"My DCR App\", \"redirect_uris\": [\"http://localhost:3001/callback\"], \"grant_types\": [\"AUTHORIZATION_CODE\"]}"}')
echo "$DCR_REG" | jq
DCR_CID=$(echo "$DCR_REG" | jq -r '.responseContent' | python3 -c "import sys,json; print(json.load(sys.stdin).get('client_id',''))" 2>/dev/null || echo "")
DCR_TOKEN=$(echo "$DCR_REG" | jq -r '.responseContent' | python3 -c "import sys,json; print(json.load(sys.stdin).get('registration_access_token',''))" 2>/dev/null || echo "")
echo "Client ID: $DCR_CID"
echo "Reg Access Token: $DCR_TOKEN"
```

Expected: `action: "CREATED"` with client metadata in `responseContent`.

### 15b. Get client

```bash
curl -s -X POST "${BASE}/api/client/dcr/get" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"${DCR_TOKEN}\", \"clientId\": \"${DCR_CID}\"}" | jq
```

Expected: `action: "OK"` with client metadata in `responseContent`.

### 15c. Update client

```bash
curl -s -X POST "${BASE}/api/client/dcr/update" \
  -H "Content-Type: application/json" \
  -d "{\"json\": \"{\\\"client_name\\\": \\\"Updated DCR App\\\"}\", \"token\": \"${DCR_TOKEN}\", \"clientId\": \"${DCR_CID}\"}" | jq
```

Expected: `action: "UPDATED"`.

### 15d. Delete client

```bash
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST "${BASE}/api/client/dcr/delete" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"${DCR_TOKEN}\", \"clientId\": \"${DCR_CID}\"}"
```

Expected: `HTTP 204` (No Content).

---

## 16. CIBA — Client-Initiated Backchannel Authentication

> **Auth method:** No admin or Basic auth. The client authenticates by passing `clientId`/`clientSecret` in the JSON body (not via HTTP header).

### 16a. Backchannel authentication

```bash
CIBA_RESP=$(curl -s -X POST "${BASE}/api/ciba/authentication" \
  -H "Content-Type: application/json" \
  -d "{\"parameters\": \"login_hint=admin&scope=openid\", \"clientId\": \"${CID}\", \"clientSecret\": \"${SEC}\"}")
echo "$CIBA_RESP" | jq
CIBA_TICKET=$(echo "$CIBA_RESP" | jq -r '.ticket // empty')
echo "Ticket: ${CIBA_TICKET:-(no ticket)}"
```

Expected: `action: "USER_IDENTIFICATION"` with `ticket`, `hintType`, `deliveryMode` (if CIBA enabled on the Authlete service).

### 16b. Issue auth_req_id

```bash
curl -s -X POST "${BASE}/api/ciba/issue" \
  -H "Content-Type: application/json" \
  -d "{\"ticket\": \"${CIBA_TICKET}\"}" | jq
```

Expected: `action: "OK"`, `authReqId`, `expiresIn`, `interval`.

### 16c. Fail authentication

```bash
curl -s -X POST "${BASE}/api/ciba/fail" \
  -H "Content-Type: application/json" \
  -d "{\"ticket\": \"${CIBA_TICKET}\", \"reason\": \"ACCESS_DENIED\"}" | jq
```

Expected: `action: "FORBIDDEN"`.

### 16d. Complete authentication

```bash
curl -s -X POST "${BASE}/api/ciba/complete" \
  -H "Content-Type: application/json" \
  -d "{\"ticket\": \"${CIBA_TICKET}\", \"result\": \"AUTHORIZED\", \"subject\": \"admin\"}" | jq
```

Expected: `action: "NO_ACTION"` (poll/ping mode) or `"NOTIFICATION"` (push mode).

---

## Automated E2E Testing

This project includes a **Vitest-based E2E test suite** at `server/tests/e2e/e2e.test.ts` that covers all 17 sections above programmatically with proper assertions. It automatically skips tests where required credentials are missing.

```bash
# Requires real Authlete credentials in server/.env
npm --prefix server run test:e2e
```

See [`server/tests/e2e/e2e.test.ts`](server/tests/e2e/e2e.test.ts) for the full test source.

---

## 17. PAR — Pushed Authorization Requests (RFC 9126)

> **Auth method for client at PAR endpoint:** Pass `clientId`/`clientSecret` in the JSON body (matching CIBA pattern). Per RFC 9126 §3, client authentication is REQUIRED at the PAR endpoint. Confidential clients MUST provide a `clientSecret` (or omit for public clients that don't use a secret). No admin Basic auth is required.
>
> **Auth method for the subsequent /authorize call:** Follows the same rules as a normal authorization request. The `client_id` in /authorize MUST match the one used in the PAR request.

Instead of sending the full authorization request via the browser redirect, the client POSTs it to the PAR endpoint and gets back a `request_uri` (a short-lived, opaque reference). The client then redirects the browser to `/authorize?request_uri=<uri>`. The server resolves the PAR request server-side via Authlete, not by re-fetching the URI. This is defined in [RFC 9126 — OAuth 2.0 Pushed Authorization Requests](https://www.rfc-editor.org/rfc/rfc9126).

### 17a. Push authorization request (confidential client)

Pushes the OAuth parameters to the PAR endpoint. The `parameters` field is URL-encoded and contains the same set of parameters normally sent to `/authorize`. Client authentication is REQUIRED per RFC 9126.

```bash
PAR_RESP=$(curl -s -X POST "${BASE}/api/par"   -H "Content-Type: application/json"   -d "{\"parameters\": \"response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=par_state\", \"clientId\": \"${CID}\", \"clientSecret\": \"${SEC}\"}")
echo "$PAR_RESP" | jq
PAR_URI=$(echo "$PAR_RESP" | jq -r '.requestUri // empty')
echo "Request URI: ${PAR_URI:-(no request_uri)}"
```

Expected: `action: "CREATED"` (HTTP 201), `requestUri` (e.g. `urn:ietf:params:oauth:request_uri:CAK9YEtNorwXE3U...`), `responseContent` (JSON string with `expires_in` and `request_uri`).

### 17b. Push authorization request (public client with PKCE)

For public clients (SPAs, mobile apps), use PKCE (S256) with the PAR request. Client authentication is done by passing `clientId` in the body without a secret (or using the `client_id` parameter itself).

```bash
PAR_CODE_VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
PAR_CODE_CHALLENGE=$(echo -n "$PAR_CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')

PAR_RESP_PKCE=$(curl -s -X POST "${BASE}/api/par"   -H "Content-Type: application/json"   -d "{\"parameters\": \"response_type=code&client_id=${PUB_CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=par_pkce_state&code_challenge_method=S256&code_challenge=${PAR_CODE_CHALLENGE}\", \"clientId\": \"${PUB_CID}\"}")
echo "$PAR_RESP_PKCE" | jq
PAR_URI_PKCE=$(echo "$PAR_RESP_PKCE" | jq -r '.requestUri // empty')
echo "Request URI: ${PAR_URI_PKCE:-(no request_uri)}"
```

Expected: Same as 17a, but using a public client with PKCE.

### 17c. Use request_uri in authorization

Once you have a `request_uri`, use it instead of the full parameter set in the authorization URL. The /authorize endpoint sends the `request_uri` to Authlete, which looks up the stored PAR request and processes it as if all parameters were sent directly.

**For the confidential client (no PKCE):**
```bash
curl -s -c /tmp/par_cj.txt -b /tmp/par_cj.txt   "${BASE}/api/authorization?client_id=${CID}&request_uri=${PAR_URI}"
```

**For the public client (with PKCE — use the code_verifier to exchange):**
```bash
curl -s -c /tmp/par_pkce_cj.txt -b /tmp/par_pkce_cj.txt   "${BASE}/api/authorization?client_id=${PUB_CID}&request_uri=${PAR_URI_PKCE}"

# Then login + consent + exchange with code_verifier (same as PKCE flow in section 9)
```

Expected: Redirects to login/consent page (or directly to callback if interaction is not needed). The authorization code flow proceeds as normal from there.

### 17d. Error case — missing parameters

```bash
curl -s -X POST "${BASE}/api/par"   -H "Content-Type: application/json"   -d '{}' | jq
```

Expected: HTTP 400 with error about missing `parameters` field.

---

## 18. Device Authorization Grant (RFC 8628)

> **Auth method:** No admin or Basic auth. The client authenticates by passing `clientId`/`clientSecret` in the JSON body (matching CIBA/PAR pattern). Public clients omit `clientSecret`.

### 18a. Device authorization

Requests a device code and user code. The device displays the user code to the user, who then visits the verification URI on a separate device.

```bash
DEVICE_RESP=$(curl -s -X POST "${BASE}/api/device/authorization" \
  -H "Content-Type: application/json" \
  -d "{\"parameters\": \"client_id=${CID}&scope=openid%20profile\", \"clientId\": \"${CID}\", \"clientSecret\": \"${SEC}\"}")
echo "$DEVICE_RESP" | jq
DEVICE_CODE=$(echo "$DEVICE_RESP" | jq -r '.deviceCode')
USER_CODE=$(echo "$DEVICE_RESP" | jq -r '.userCode')
echo "Device code: $DEVICE_CODE"
echo "User code:   $USER_CODE"
echo "Verification URI: $(echo "$DEVICE_RESP" | jq -r '.verificationUri')"
```

Expected: `action: "OK"` with `deviceCode`, `userCode`, `verificationUri`, `expiresIn`, `interval`.

### 18b. Verify user code (server-side check)

```bash
curl -s -X POST "${BASE}/api/device/verification" \
  -H "Content-Type: application/json" \
  -d "{\"userCode\": \"${USER_CODE}\"}" | jq
```

Expected: `action: "VALID"` with client info and scopes (if the code is still valid and unused).

### 18c. Complete authorization

This simulates what the browser flow at `/device` does — authenticates the user and completes the device flow.

```bash
curl -s -X POST "${BASE}/api/device/complete" \
  -H "Content-Type: application/json" \
  -d "{\"userCode\": \"${USER_CODE}\", \"result\": \"AUTHORIZED\", \"subject\": \"admin\"}" | jq
```

Expected: `action: "SUCCESS"`.

### 18d. Poll for token (client-side — mimics device polling)

The client polls the token endpoint with `grant_type=urn:ietf:params:oauth:grant-type:device_code` and the `device_code` from step 18a. This should be called **after** the user completes authorization (step 18c).

```bash
curl -s -X POST "${BASE}/api/token" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${DEVICE_CODE}" | jq
```

Expected: `access_token`, `refresh_token`, `token_type: Bearer` (after user completes authorization) or `error: "authorization_pending"` (if user hasn't acted yet).

### 18e. Browser-based flow (manual)

The device verification flow also works through the browser:

1. Open `http://localhost:3000/device` in your browser
2. Enter the user code from step 18a
3. Click **Verify**
4. Log in with `admin` / `password`
5. Click **Authorize**

After authorization, the token polling in step 18d returns the token.

---

Save this section as `smoke-test.sh`, make it executable (`chmod +x smoke-test.sh`), then run it. If your server has `MGMT_CLIENT_ID` set, add `-u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}"` to the management API calls in step 10.

```bash
#!/usr/bin/env bash
# =============================================================================
# Quick smoke test — run with: bash CURL-TEST.md (source this file)
# Prerequisites: CID, SEC, PUB_CID env vars set to real Authlete clients
# =============================================================================
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
CID="${CID:?CID required}"
SEC="${SEC:?SEC required}"
PUB_CID="${PUB_CID}"
REDIR="${REDIR:-http://localhost:3000}"

echo "=== 1. OpenID Discovery ==="
curl -s "${BASE}/api/.well-known/openid-configuration" | jq '.issuer'
echo "=== 2. JWKS ==="
curl -s "${BASE}/api/.well-known/jwks.json" | jq '.keys[0].kid'
echo "=== 3. Client Credentials ==="
CC_RESP=$(curl -s -X POST "${BASE}/api/token" -u "${CID}:${SEC}" -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=client_credentials")
echo "$CC_RESP" | jq -r '.token_type'
CC_AT=$(echo "$CC_RESP" | jq -r '.access_token')
echo "=== 4. Auth Code ==="
rm -f /tmp/cj.txt
curl -s -c /tmp/cj.txt -b /tmp/cj.txt "${BASE}/api/authorization?response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=s3" > /dev/null
curl -s -c /tmp/cj.txt -b /tmp/cj.txt -X POST "${BASE}/api/session/login" -d "username=admin&password=password" > /dev/null
curl -s -c /tmp/cj.txt -b /tmp/cj.txt -D /tmp/headers.txt -o /dev/null -X POST "${BASE}/api/session/consent" -d "decision=approve"
CODE=$(grep -oP 'code=\K[^&\s]+' /tmp/headers.txt)
TOK_RESP=$(curl -s -X POST "${BASE}/api/token" -u "${CID}:${SEC}" -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=authorization_code&code=${CODE}&redirect_uri=${REDIR}")
echo "$TOK_RESP" | jq -r '.token_type'
AT=$(echo "$TOK_RESP" | jq -r '.access_token')
RT=$(echo "$TOK_RESP" | jq -r '.refresh_token')
echo "=== 5. Userinfo ==="
UIRESP=$(curl -s "${BASE}/api/userinfo" -H "Authorization: Bearer ${AT}")
echo "$UIRESP" | cut -d. -f2 | python3 -c "import sys,base64,json; p=sys.stdin.read().strip()+'=='; print(json.loads(base64.urlsafe_b64decode(p)).get('sub'))" 2>/dev/null
echo "=== 6. Refresh ==="
RF_RESP=$(curl -s -X POST "${BASE}/api/token" -u "${CID}:${SEC}" -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=refresh_token&refresh_token=${RT}")
AT2=$(echo "$RF_RESP" | jq -r '.access_token')
echo "$RF_RESP" | jq -r '.token_type'
echo "=== 7. Introspection ==="
curl -s -X POST "${BASE}/api/introspection/standard" -H "Content-Type: application/x-www-form-urlencoded" -d "token=${AT2}" | jq -r '.active'
curl -s -X POST "${BASE}/api/introspection" -H "Content-Type: application/x-www-form-urlencoded" -d "token=${AT2}" | jq -r '.action'
echo "=== 8. Revocation (confidential client) ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "${BASE}/api/revocation" -u "${CID}:${SEC}" -H "Content-Type: application/x-www-form-urlencoded" -d "token=${AT2}"
echo "=== 9. PKCE ==="
CV="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CC=$(echo -n "$CV" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
rm -f /tmp/pkce_cj.txt
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt "${BASE}/api/authorization?response_type=code&client_id=${PUB_CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=s4&code_challenge=${CC}&code_challenge_method=S256" > /dev/null
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt -X POST "${BASE}/api/session/login" -d "username=admin&password=password" > /dev/null
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt -D /tmp/pkce_headers.txt -o /dev/null -X POST "${BASE}/api/session/consent" -d "decision=approve"
PKCE_CODE=$(grep -oP 'code=\K[^&\s]+' /tmp/pkce_headers.txt)
curl -s -X POST "${BASE}/api/token" -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=authorization_code&code=${PKCE_CODE}&redirect_uri=${REDIR}&client_id=${PUB_CID}&code_verifier=${CV}" | jq -r '.token_type'
echo "=== 10. Management ==="
curl -s "${BASE}/api/token/list" | jq '.resultCode'
CREATE_RESP=$(curl -s -X POST "${BASE}/api/token/create" -u "${CID}:${SEC}" -H "Content-Type: application/x-www-form-urlencoded" -d "grantType=CLIENT_CREDENTIALS&subject=test_user&scopes=openid")
AT_CREATED=$(echo "$CREATE_RESP" | jq -r '.accessToken')
curl -s -X PATCH "${BASE}/api/token/update" -H "Content-Type: application/x-www-form-urlencoded" -d "accessToken=${AT_CREATED}&scopes=openid" | jq -r '.resultCode'
curl -s -X POST "${BASE}/api/token/revoke" -H "Content-Type: application/x-www-form-urlencoded" -d "accessTokenIdentifier=${AT_CREATED}" | jq '.resultCode'
echo "=== 11. Logout ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "${BASE}/api/logout?client_id=${CID}&post_logout_redirect_uri=${REDIR}"
echo "=== 15. DCR Register ==="
# Add -u "${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}" if MGMT_CLIENT_ID/MGMT_CLIENT_SECRET are set in your .env
curl -s -X POST "${BASE}/api/client/dcr/register" -H "Content-Type: application/json" -d '{"json": "{\"client_name\":\"Smoke Test\",\"redirect_uris\":[\"http://localhost:3001/callback\"],\"grant_types\":[\"AUTHORIZATION_CODE\"]}"}' | jq -r '.action'
echo "=== 16. CIBA Authentication ==="
curl -s -X POST "${BASE}/api/ciba/authentication" -H "Content-Type: application/json" -d "{\"parameters\":\"login_hint=admin&scope=openid\",\"clientId\":\"${CID}\",\"clientSecret\":\"${SEC}\"}" | jq -r '.action // .error'
echo "=== 17. PAR ==="
curl -s -X POST "${BASE}/api/par" -H "Content-Type: application/json" -d "{\"parameters\":\"response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=smoke\",\"clientId\":\"${CID}\",\"clientSecret\":\"${SEC}\"}" | jq -r '.action // .error'
echo "=== ALL DONE ==="
```
