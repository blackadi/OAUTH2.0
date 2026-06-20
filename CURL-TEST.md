# CURL Test Suite — Authlete Node.js Authorization Server

Copy-paste these commands to verify every endpoint. Replace `<BASE>` with your server URL (default `http://localhost:3000`).

```bash
BASE="http://localhost:3000"
CID="4288007124"                                    # confidential client (has secret)
SEC="FGpSN50T6SK7shEuzzwUNAaXsbfFXfqRJmI1VsncPPsUBgEnPsQ7UG7hc6o-NNnjeIScun5_MRnPc-24JGVPRA"
PUB_CID="3322138582"                                # public client (no secret, PKCE)
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

# Step 2 — Login (submit alice / password123)
curl -s -c /tmp/cj.txt -b /tmp/cj.txt \
  -X POST "${BASE}/api/session/login" \
  -d "username=alice&password=password123"

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

Expected JWT payload: `sub: alice`, `iss`, `aud`, `s_hash`, `auth_time`, `exp`, `iat`.

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

Expected JWT payload: `sub: alice`, `name: Alice Smith`, `iss`, `aud`, `exp`, `iat`.

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

Expected: `active: true`, `scope: openid profile`, `sub: alice`, `client_id`, `token_type: Bearer`.

### Non-standard introspection (Authlete-specific — more detail)

```bash
curl -s -X POST "${BASE}/api/introspection" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}" | jq
```

Expected: `action: OK`, `existent: true`, `usable: true`, `subject: alice`.

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
  -d "username=alice&password=password123"

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

### List tokens

```bash
curl -s "${BASE}/api/token/list" | jq
```

### Create token

> **Auth method:** Basic auth (`-u`) — uses the **confidential** client (`CID`/`SEC`).

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

## Quick smoke test (single script)

Run all flows in sequence with a single command:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3000"
CID="4288007124"
SEC="FGpSN50T6SK7shEuzzwUNAaXsbfFXfqRJmI1VsncPPsUBgEnPsQ7UG7hc6o-NNnjeIScun5_MRnPc-24JGVPRA"
PUB_CID="3322138582"
REDIR="http://localhost:3000"

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
curl -s -c /tmp/cj.txt -b /tmp/cj.txt -X POST "${BASE}/api/session/login" -d "username=alice&password=password123" > /dev/null
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
curl -s -c /tmp/pkce_cj.txt -b /tmp/pkce_cj.txt -X POST "${BASE}/api/session/login" -d "username=alice&password=password123" > /dev/null
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
echo "=== ALL DONE ==="
```
