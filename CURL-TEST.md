# CURL Test Suite — Authlete Node.js Authorization Server

Copy-paste these commands to verify every endpoint. Replace `<BASE>` with your server URL (default `http://localhost:3000`).

```bash
BASE="http://localhost:3000"
CID="4288007124"                                    # confidential client
SEC="FGpSN50T6SK7shEuzzwUNAaXsbfFXfqRJmI1VsncPPsUBgEnPsQ7UG7hc6o-NNnjeIScun5_MRnPc-24JGVPRA"
PUB_CID="3322138582"                                # public PKCE client
REDIR="http://localhost:3000"
```

---

## 1. OpenID Discovery (RFC 8414)

```bash
curl -s "${BASE}/api/.well-known/openid-configuration" | jq
```

Verifies issuer, endpoints, supported scopes, response types, grant types, subject types, signing algorithms, and claims.

---

## 2. JWKS (RFC 7517)

```bash
curl -s "${BASE}/api/.well-known/jwks.json" | jq
```

Returns EC P-256 public key with `kty`, `kid`, `use`, `alg`, `crv`, `x`, `y`.

---

## 3. Client Credentials Grant (RFC 6749 §4.4)

```bash
CC_RESPONSE=$(curl -s -X POST "${BASE}/api/token" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials")
echo "$CC_RESPONSE" | jq
CC_AT=$(echo "$CC_RESPONSE" | jq -r '.access_token')
```

Returns `access_token`, `token_type: Bearer`, `expires_in`.

---

## 4. Authorization Code Grant (RFC 6749 §4.1)

### 4a. Get authorization code

```bash
# Step 1 — Authorize (follow redirect to login page)
curl -s -c /tmp/cj.txt -b /tmp/cj.txt \
  "${BASE}/api/authorization?response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=s1"

# Step 2 — Login
curl -s -c /tmp/cj.txt -b /tmp/cj.txt \
  -X POST "${BASE}/api/session/login" \
  -d "username=alice&password=password123"

# Step 3 — Consent (capture code from Location header)
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

Verifies `access_token`, `refresh_token`, `id_token` (JWT with `sub=alice`, `iss`, `aud`, `s_hash`), `token_type: Bearer`, `scope: openid profile`.

Decode the ID Token:

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
    print('Not a valid JWT. Raw response:', jwt[:200])
"
```

---

## 5. Userinfo (OIDC Core §5.3)

### GET (Bearer token in header)

```bash
curl -s "${BASE}/api/userinfo" -H "Authorization: Bearer ${AT}" | python3 -c "
import sys, base64, json
data = sys.stdin.buffer.read()
try:
    jwt = data.decode('utf-8').strip()
except UnicodeDecodeError:
    print('Response is not UTF-8 text. Raw (hex):', data.hex()[:200])
    exit(1)
parts = jwt.split('.')
if len(parts) == 3:
    p = parts[1]
    pad = 4 - len(p) % 4
    if pad != 4: p += '=' * pad
    print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))
else:
    print('Not a valid JWT. Raw response:', jwt[:300])
"
```

### POST (token in form body)

```bash
curl -s -X POST "${BASE}/api/userinfo" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Bearer ${AT}" \
  -d "access_token=${AT}"
```

Returns signed JWT with `sub=alice`, `name`, `iss`, `aud`, `exp`, `iat`.

---

## 6. Refresh Token (RFC 6749 §6)

```bash
RF_RESP=$(curl -s -X POST "${BASE}/api/token" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=${RT}")
echo "$RF_RESP" | jq
AT2=$(echo "$RF_RESP" | jq -r '.access_token')
RT2=$(echo "$RF_RESP" | jq -r '.refresh_token')
```

Issues new `access_token` and `refresh_token`. Test this **before** revocation, since revoking the access token also invalidates the associated refresh token.

---

## 7. Token Introspection (RFC 7662)

### Standard introspection

```bash
curl -s -X POST "${BASE}/api/introspection/standard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}" | jq
```

Expected: `active: true`, `scope: openid profile`, `sub: alice`, `client_id`, `token_type: Bearer`.

### Non-standard introspection (Authlete-specific)

```bash
curl -s -X POST "${BASE}/api/introspection" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}" | jq
```

Expected: `action: OK`, `existent: true`, `usable: true`, `subject: alice`.

---

## 8. Token Revocation (RFC 7009)

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/revocation" \
  -u "${CID}:${SEC}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=${AT2}"
```

Returns `200` on success. Also invalidates the associated refresh token.

---

## 9. PKCE Authorization Code Flow (RFC 7636)

### Generate code challenge (S256)

```bash
CODE_VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
echo "Challenge: $CODE_CHALLENGE"
```

### Get PKCE authorization code

```bash
# Step 1 — Authorize
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

Returns `access_token`, `id_token`, `token_type: Bearer`.

---

## 10. Token Management

### List tokens

```bash
curl -s "${BASE}/api/token/list" | jq
```

### Create token

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

### Revoke token (management)

```bash
curl -s -X POST "${BASE}/api/token/revoke" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "accessTokenIdentifier=${AT_CREATED}" | jq
```

May return `A312001` (success: "Revoked N access token(s)") or `A313301` (token not found — known Authlete API limitation with management-created tokens). Both are valid JSON.

### Reissue ID Token

Requires `AT2` and `RT2` from the [Refresh Token](#6-refresh-token-rfc-6749-6) step above.

```bash
curl -s -X POST "${BASE}/api/token/reissue" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "accessToken=${AT2}&refreshToken=${RT2}" | jq
```

---

## 11. RP-Initiated Logout (OIDC)

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "${BASE}/api/logout?client_id=${CID}&post_logout_redirect_uri=${REDIR}"
```

Returns `200` (renders logout page) or `302` (redirect).

---

## Quick smoke test (single script)

Run all flows in sequence:

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
echo "=== 8. Revocation ==="
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
