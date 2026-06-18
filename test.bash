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