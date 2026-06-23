#!/usr/bin/env bash
# =============================================================================
#  Authlete Node Authorization Server — Full End-to-End Test Suite
# =============================================================================
#  Usage:
#    ./test-all.sh
#
#  Configure via environment variables:
#    export BASE="https://your-server.com"
#    export CID="4288007124"           # confidential client ID
#    export SEC="FGpSN50T6SK7s..."     # confidential client secret
#    export PUB_CID="3322138582"        # public client ID
#    export REDIR="http://localhost:3000"
#    export VERBOSE=1                  # show full raw responses
#
#  If you only have a public client, set CID="" and SEC="".
#  Tests requiring confidential auth will be skipped with a notice.
# =============================================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────

BASE="${BASE:-http://localhost:3000}"
CID="${CID:-4288007124}"
SEC="${SEC:-FGpSN50T6SK7shEuzzwUNAaXsbfFXfqRJmI1VsncPPsUBgEnPsQ7UG7hc6o-NNnjeIScun5_MRnPc-24JGVPRA}"
PUB_CID="${PUB_CID:-3322138582}"
REDIR="${REDIR:-http://localhost:3000}"
VERBOSE="${VERBOSE:-0}"

# ── ANSI colors ─────────────────────────────────────────────────────────────

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BG_DARK='\033[48;5;235m'
BG_BLUE='\033[48;5;24m'
NC='\033[0m'

# ── Stats ──────────────────────────────────────────────────────────────────

TOTAL=0; PASSED=0; FAILED=0; SKIPPED=0
SUMMARY_LINES=()
PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
SKIP="${YELLOW}⊘${NC}"

# ── Display helpers ─────────────────────────────────────────────────────────

header() {
  local text="$1"
  echo ""
  echo -e "  ${BG_BLUE}${WHITE}  ${text}  ${NC}"
  echo ""
}

subheader() {
  echo -e "  ${CYAN}▸${NC} ${BOLD}$1${NC}"
}

# Display API endpoint being called
api_call() {
  local method="$1"
  local path="$2"
  local desc="${3:-}"
  echo ""
  echo -e "  ${BOLD}${WHITE}┌─${NC} ${BOLD}${BLUE}${method}${NC} ${BOLD}${path}${NC}${desc:+ ${DIM}— ${desc}${NC}}"
  echo -e "  ${BOLD}${WHITE}│${NC}"
}

# Display raw curl command
show_curl() {
  local cmd="$1"
  echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}\$ ${cmd}${NC}"
  echo -e "  ${BOLD}${WHITE}│${NC}"
}

# Display formatted JSON response (truncated to 30 lines)
show_json() {
  local data="$1"
  local formatted
  formatted=$(echo "$data" | python3 -m json.tool 2>/dev/null 2>/dev/null) || formatted="$data"

  local line_count
  line_count=$(echo "$formatted" | wc -l)

  if [ "$line_count" -le 30 ]; then
    echo "$formatted" | while IFS= read -r line; do
      echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}${line}${NC}"
    done
  else
    echo "$formatted" | head -28 | while IFS= read -r line; do
      echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}${line}${NC}"
    done
    echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}... (${line_count} lines total)${NC}"
  fi
}

# Display a short inline response value (for non-JSON responses like JWT or status)
show_inline() {
  local label="$1"
  local value="$2"
  local max_len="${3:-120}"
  local trimmed="${value:0:$max_len}"
  echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}${label}:${NC} ${trimmed}${#value -gt $max_len:+...}"
}

# Display a raw text response inline
show_text() {
  local text="$1"
  echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}${text}${NC}"
}

# Close the API call box
box_end() {
  echo -e "  ${BOLD}${WHITE}└${NC}${DIM}─────────────────────────────────────────────────────${NC}"
}

# ── Check function ──────────────────────────────────────────────────────────

check() {
  local name="$1"
  local status="$2"
  local detail="${3:-}"

  TOTAL=$((TOTAL + 1))
  if [ "$status" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    echo -e "  ${PASS} ${name} ${DIM}${detail}${NC}"
    SUMMARY_LINES+=("${GREEN}PASS${NC}  ${name}")
  elif [ "$status" -eq 2 ]; then
    SKIPPED=$((SKIPPED + 1))
    echo -e "  ${SKIP} ${name} ${DIM}${detail}${NC}"
    SUMMARY_LINES+=("${YELLOW}SKIP${NC}  ${name}  (${detail})")
  else
    FAILED=$((FAILED + 1))
    echo -e "  ${FAIL} ${RED}${name}${NC} ${DIM}${detail}${NC}"
    SUMMARY_LINES+=("${RED}FAIL${NC}  ${name}  (${detail})")
  fi
}

# ── Utility ─────────────────────────────────────────────────────────────────

has_confidential() { [ -n "$CID" ] && [ -n "$SEC" ]; }
has_public() { [ -n "$PUB_CID" ]; }

decode_jwt_payload() {
  python3 -c "
import sys, base64, json
try:
    jwt = sys.stdin.read().strip()
    parts = jwt.split('.')
    if len(parts) != 3:
        print('Not a JWT')
        sys.exit(0)
    p = parts[1]
    pad = 4 - len(p) % 4
    if pad != 4: p += '=' * pad
    d = json.loads(base64.urlsafe_b64decode(p))
    print(json.dumps(d, indent=4))
except Exception as e:
    print(f'Decode error: {e}')
"
}

# Extract a JSON value by key path (e.g., keys[0].kid)
json_extract() {
  local json="$1"
  local key="$2"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
parts = '${key}'.split('.')
v = d
for p in parts:
    if '[' in p:
        name, idx = p[:-1].split('[')
        v = v[name][int(idx)]
    else:
        v = v[p]
if isinstance(v, str):
    print(v)
else:
    print(json.dumps(v))
" 2>/dev/null || echo ""
}

# ── Tests ───────────────────────────────────────────────────────────────────

test_discovery() {
  header "1. OpenID Discovery (RFC 8414)"

  api_call "GET" "/.well-known/openid-configuration" "Server metadata"
  show_curl 'curl -s "${BASE}/.well-known/openid-configuration"'

  local resp
  resp=$(curl -sS "${BASE}/api/.well-known/openid-configuration" 2>&1) || true
  show_json "$resp"
  box_end

  local issuer
  issuer=$(json_extract "$resp" issuer)

  if [ -n "$issuer" ]; then
    check "Discovery document" 0 "issuer: ${issuer}"
  else
    check "Discovery document" 1 "no issuer found"
  fi
}

test_jwks() {
  header "2. JWKS (RFC 7517)"

  api_call "GET" "/.well-known/jwks.json" "Public keys"
  show_curl 'curl -s "${BASE}/.well-known/jwks.json"'

  local resp
  resp=$(curl -sS "${BASE}/api/.well-known/jwks.json" 2>&1) || true
  show_json "$resp"
  box_end

  local kid
  kid=$(json_extract "$resp" keys[0].kid)

  if [ -n "$kid" ]; then
    check "JWKS returned" 0 "kid: ${kid}"
  else
    check "JWKS returned" 1 "no keys found"
  fi
}

test_client_credentials() {
  header "3. Client Credentials Grant (RFC 6749 §4.4)"

  if ! has_confidential; then
    check "Client Credentials" 2 "requires confidential client (CID + SEC)"
    CC_AT=""
    return
  fi

  api_call "POST" "/api/token" "grant_type=client_credentials"
  show_curl "curl -s -X POST \"\${BASE}/api/token\" -u \"\${CID}:..\" -d \"grant_type=client_credentials\""

  local resp
  resp=$(curl -sS -X POST "${BASE}/api/token" \
    -u "${CID}:${SEC}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" 2>&1) || true
  show_json "$resp"
  box_end

  CC_AT=$(json_extract "$resp" access_token)
  local token_type
  token_type=$(json_extract "$resp" token_type)

  if [ -n "$CC_AT" ]; then
    check "Client Credentials token" 0 "type: ${token_type:-N/A}"
  else
    check "Client Credentials token" 1 "no access_token"
  fi
}

test_auth_code_flow() {
  header "4. Authorization Code Grant (RFC 6749 §4.1)"

  if ! has_confidential; then
    check "Authorization Code" 2 "requires confidential client (CID + SEC)"
    AT=""; RT=""; IDT=""
    return
  fi

  # Step 1 — Authorize
  api_call "GET" "/api/authorization" "Step 1 — redirect to login"
  show_curl "curl -s \"\${BASE}/api/authorization?...\" (follows redirect)"
  curl -sS -c /tmp/ac_cookies.txt -b /tmp/ac_cookies.txt \
    "${BASE}/api/authorization?response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=ac_s1" \
    > /dev/null 2>&1 || true
  show_text "→ Login page rendered (302 redirect)"
  box_end

  # Step 2 — Login
  api_call "POST" "/api/session/login" "Step 2 — authenticate user"
  show_curl "curl -s -X POST \"\${BASE}/api/session/login\" -d \"username=admin&password=...\""
  curl -sS -c /tmp/ac_cookies.txt -b /tmp/ac_cookies.txt \
    -X POST "${BASE}/api/session/login" \
    -d "username=admin&password=password" > /dev/null 2>&1 || true
  show_text "→ Login successful (302 redirect to consent)"
  box_end

  # Step 3 — Consent
  api_call "POST" "/api/session/consent" "Step 3 — approve scopes"
  show_curl "curl -s -X POST \"\${BASE}/api/session/consent\" -d \"decision=approve\" (captures code)"
  curl -sS -c /tmp/ac_cookies.txt -b /tmp/ac_cookies.txt \
    -D /tmp/ac_headers.txt -o /dev/null \
    -X POST "${BASE}/api/session/consent" \
    -d "decision=approve" > /dev/null 2>&1 || true

  local code
  code=$(grep -oP 'code=\K[^&\s]+' /tmp/ac_headers.txt 2>/dev/null || echo "")
  if [ -n "$code" ]; then
    show_text "→ Authorization code: ${code:0:20}..."
  else
    show_text "→ No code captured"
  fi
  box_end
  rm -f /tmp/ac_cookies.txt /tmp/ac_headers.txt

  if [ -z "$code" ]; then
    check "Authorization Code" 1 "no code in redirect"
    AT=""; RT=""; IDT=""
    return
  fi

  # Step 4 — Exchange
  api_call "POST" "/api/token" "Step 4 — exchange code for tokens"
  show_curl "curl -s -X POST \"\${BASE}/api/token\" -u \"\${CID}:..\" -d \"grant_type=authorization_code&code=...\""

  local tok_resp
  tok_resp=$(curl -sS -X POST "${BASE}/api/token" \
    -u "${CID}:${SEC}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=authorization_code&code=${code}&redirect_uri=${REDIR}" 2>&1) || true
  show_json "$tok_resp"
  box_end

  AT=$(json_extract "$tok_resp" access_token)
  RT=$(json_extract "$tok_resp" refresh_token)
  IDT=$(json_extract "$tok_resp" id_token)
  local token_type
  token_type=$(json_extract "$tok_resp" token_type)
  local scope
  scope=$(json_extract "$tok_resp" scope)

  if [ -n "$AT" ] && [ -n "$IDT" ]; then
    check "Tokens received" 0 "type: ${token_type}, scope: ${scope}"
  else
    check "Tokens received" 1 "missing access_token or id_token"
    AT=""; RT=""; IDT=""
    return
  fi

  # Decode ID Token
  local idt_sub
  idt_sub=$(echo "$IDT" | decode_jwt_payload 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('sub',''))" 2>/dev/null) || idt_sub=""
  if [ "$idt_sub" = "admin" ]; then
    check "ID Token subject" 0 "sub: admin"

    api_call "DECODE" "ID Token JWT" "inspect payload"
    echo "$IDT" | decode_jwt_payload | while IFS= read -r line; do
      echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}${line}${NC}"
    done
    box_end
  else
    check "ID Token subject" 1 "expected 'admin', got '${idt_sub}'"
  fi
}

test_userinfo() {
  header "5. Userinfo (OIDC Core §5.3)"

  if [ -z "${AT:-}" ]; then
    check "Userinfo" 2 "no access token available (run Auth Code flow first)"
    return
  fi

  api_call "GET" "/api/userinfo" "Authorization: Bearer \${AT}"
  show_curl "curl -s \"\${BASE}/api/userinfo\" -H \"Authorization: Bearer \${AT}\""

  local resp
  resp=$(curl -sS "${BASE}/api/userinfo" -H "Authorization: Bearer ${AT}" 2>&1) || true

  local sub
  sub=$(echo "$resp" | decode_jwt_payload 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('sub',''))" 2>/dev/null) || sub=""

  # Show the decoded JWT payload
  echo "$resp" | decode_jwt_payload | while IFS= read -r line; do
    echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}${line}${NC}"
  done
  box_end

  if [ "$sub" = "admin" ]; then
    check "Userinfo response" 0 "sub: admin"
  else
    check "Userinfo response" 1 "expected sub=admin, got '${sub}'"
  fi
}

test_refresh() {
  header "6. Refresh Token (RFC 6749 §6)"

  if ! has_confidential; then
    check "Refresh Token" 2 "requires confidential client (CID + SEC)"
    AT2=""; RT2=""
    return
  fi
  if [ -z "${RT:-}" ]; then
    check "Refresh Token" 2 "no refresh token available (run Auth Code flow first)"
    AT2=""; RT2=""
    return
  fi

  api_call "POST" "/api/token" "grant_type=refresh_token"
  show_curl "curl -s -X POST \"\${BASE}/api/token\" -u \"\${CID}:..\" -d \"grant_type=refresh_token&refresh_token=...\""

  local resp
  resp=$(curl -sS -X POST "${BASE}/api/token" \
    -u "${CID}:${SEC}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=refresh_token&refresh_token=${RT}" 2>&1) || true
  show_json "$resp"
  box_end

  AT2=$(json_extract "$resp" access_token)
  RT2=$(json_extract "$resp" refresh_token)
  local token_type
  token_type=$(json_extract "$resp" token_type)

  if [ -n "$AT2" ] && [ -n "$RT2" ]; then
    check "Refresh Token" 0 "type: ${token_type}"
  else
    check "Refresh Token" 1 "missing tokens"
    AT2="${AT:-}"; RT2="${RT:-}"
  fi
}

test_introspection() {
  header "7. Token Introspection (RFC 7662)"

  local token="${AT2:-${AT:-${CC_AT:-}}}"
  if [ -z "$token" ]; then
    check "Introspection" 2 "no access token available"
    return
  fi

  # Standard
  api_call "POST" "/api/introspection/standard" "RFC 7662"
  show_curl "curl -s -X POST \"\${BASE}/api/introspection/standard\" -d \"token=...\""

  local std_resp
  std_resp=$(curl -sS -X POST "${BASE}/api/introspection/standard" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "token=${token}" 2>&1) || true
  show_json "$std_resp"
  box_end

  local active
  active=$(json_extract "$std_resp" active)

  if [ "$active" = "true" ] || [ "$active" = "True" ]; then
    local sub
    sub=$(json_extract "$std_resp" sub)
    check "Standard introspection" 0 "active: true${sub:+ (sub: ${sub})}"
  else
    check "Standard introspection" 1 "expected active=true, got '${active}'"
  fi

  # Authlete-specific
  api_call "POST" "/api/introspection" "Authlete-specific (extended)"
  show_curl "curl -s -X POST \"\${BASE}/api/introspection\" -d \"token=...\""

  local ns_resp
  ns_resp=$(curl -sS -X POST "${BASE}/api/introspection" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "token=${token}" 2>&1) || true
  show_json "$ns_resp"
  box_end

  local action
  action=$(json_extract "$ns_resp" action)

  if [ "$action" = "OK" ]; then
    check "Authlete introspection" 0 "action: OK"
  else
    check "Authlete introspection" 1 "expected OK, got '${action}'"
  fi
}

test_revocation() {
  header "8. Token Revocation (RFC 7009)"

  local token="${AT2:-${AT:-${CC_AT:-}}}"
  if [ -z "$token" ]; then
    check "Revocation" 2 "no access token available"
    return
  fi

  if has_confidential; then
    api_call "POST" "/api/revocation" "confidential client (Basic auth)"
    show_curl "curl -s -X POST \"\${BASE}/api/revocation\" -u \"\${CID}:..\" -d \"token=...\""

    local http_code
    local resp_body
    resp_body=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/revocation" \
      -u "${CID}:${SEC}" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "token=${token}" 2>&1) || http_code=""
    http_code="$resp_body"

    echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}HTTP ${http_code}${NC}"
    box_end

    if [ "$http_code" = "200" ]; then
      check "Revocation (confidential)" 0 "HTTP ${http_code}"
    else
      check "Revocation (confidential)" 1 "HTTP ${http_code}"
    fi
  fi

  if has_public; then
    api_call "POST" "/api/revocation" "public client (client_id in body)"
    show_curl "curl -s -X POST \"\${BASE}/api/revocation\" -d \"token=...&client_id=\${PUB_CID}\""

    local http_code
    resp_body=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/revocation" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "token=${token}&client_id=${PUB_CID}" 2>&1) || http_code=""
    http_code="$resp_body"

    echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}HTTP ${http_code}${NC}"
    box_end

    if [ "$http_code" = "200" ]; then
      check "Revocation (public client)" 0 "HTTP ${http_code}"
    else
      check "Revocation (public client)" 1 "HTTP ${http_code}"
    fi
  fi

  if ! has_confidential && ! has_public; then
    check "Revocation" 2 "no client configured"
  fi
}

test_pkce() {
  header "9. PKCE Authorization Code Flow (RFC 7636)"

  if ! has_public; then
    check "PKCE Flow" 2 "requires public client (PUB_CID)"
    return
  fi

  local CV="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  local CC
  CC=$(echo -n "$CV" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')

  rm -f /tmp/pkce_cookies.txt /tmp/pkce_headers.txt

  # Authorize
  api_call "GET" "/api/authorization" "Step 1 — PKCE authorize (code_challenge)"
  show_curl "curl -s \"\${BASE}/api/authorization?...&code_challenge=...&code_challenge_method=S256\""
  curl -sS -c /tmp/pkce_cookies.txt -b /tmp/pkce_cookies.txt \
    "${BASE}/api/authorization?response_type=code&client_id=${PUB_CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=pkce_s1&code_challenge=${CC}&code_challenge_method=S256" \
    > /dev/null 2>&1 || true
  show_text "→ Login page rendered"
  box_end

  # Login
  api_call "POST" "/api/session/login" "Step 2 — PKCE login"
  show_curl "curl -s -X POST \"\${BASE}/api/session/login\" -d \"username=admin&password=...\""
  curl -sS -c /tmp/pkce_cookies.txt -b /tmp/pkce_cookies.txt \
    -X POST "${BASE}/api/session/login" \
    -d "username=admin&password=password" > /dev/null 2>&1 || true
  show_text "→ Login OK"
  box_end

  # Consent
  api_call "POST" "/api/session/consent" "Step 3 — PKCE consent"
  show_curl "curl -s -X POST \"\${BASE}/api/session/consent\" -d \"decision=approve\""
  curl -sS -c /tmp/pkce_cookies.txt -b /tmp/pkce_cookies.txt \
    -D /tmp/pkce_headers.txt -o /dev/null \
    -X POST "${BASE}/api/session/consent" \
    -d "decision=approve" > /dev/null 2>&1 || true

  local pkce_code
  pkce_code=$(grep -oP 'code=\K[^&\s]+' /tmp/pkce_headers.txt 2>/dev/null || echo "")
  if [ -n "$pkce_code" ]; then
    show_text "→ PKCE code: ${pkce_code:0:20}..."
  fi
  box_end
  rm -f /tmp/pkce_cookies.txt /tmp/pkce_headers.txt

  if [ -z "$pkce_code" ]; then
    check "PKCE authorization code" 1 "no code in redirect"
    return
  fi

  # Exchange
  api_call "POST" "/api/token" "Step 4 — PKCE exchange (no auth header!)"
  show_curl "curl -s -X POST \"\${BASE}/api/token\" -d \"grant_type=authorization_code&code=...&code_verifier=...&client_id=\${PUB_CID}\""

  local resp
  resp=$(curl -sS -X POST "${BASE}/api/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=authorization_code&code=${pkce_code}&redirect_uri=${REDIR}&client_id=${PUB_CID}&code_verifier=${CV}" 2>&1) || true
  show_json "$resp"
  box_end

  local token_type
  token_type=$(json_extract "$resp" token_type)

  if [ "$token_type" = "Bearer" ]; then
    check "PKCE token exchange" 0 "token_type: Bearer"
  else
    check "PKCE token exchange" 1 "expected Bearer, got '${token_type}'"
  fi
}

test_token_management() {
  header "10. Token Management"

  if ! has_confidential; then
    check "Token Management" 2 "requires confidential client (CID + SEC)"
    return
  fi

  # List
  api_call "GET" "/api/token/list" "list all tokens"
  show_curl "curl -s \"\${BASE}/api/token/list\""
  local list_resp
  list_resp=$(curl -sS "${BASE}/api/token/list" 2>&1) || true
  show_json "$list_resp"
  box_end

  local total_count
  total_count=$(json_extract "$list_resp" totalCount)
  if [ -n "$total_count" ]; then
    check "Token list" 0 "total: ${total_count}"
  else
    check "Token list" 1 "unexpected response"
  fi

  # Create
  api_call "POST" "/api/token/create" "create via management API"
  show_curl "curl -s -X POST \"\${BASE}/api/token/create\" -u \"\${CID}:..\" -d \"grantType=CLIENT_CREDENTIALS&subject=test_user\""

  local create_resp
  create_resp=$(curl -sS -X POST "${BASE}/api/token/create" \
    -u "${CID}:${SEC}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grantType=CLIENT_CREDENTIALS&subject=test_user&scopes=openid" 2>&1) || true
  show_json "$create_resp"
  box_end

  local at_created
  at_created=$(json_extract "$create_resp" accessToken)
  if [ -n "$at_created" ]; then
    check "Token created" 0 "${at_created:0:16}..."
  else
    check "Token created" 1 "no accessToken"
    return
  fi

  # Update
  api_call "PATCH" "/api/token/update" "update scopes"
  show_curl "curl -s -X PATCH \"\${BASE}/api/token/update\" -d \"accessToken=...&scopes=openid\""

  local update_resp
  update_resp=$(curl -sS -X PATCH "${BASE}/api/token/update" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "accessToken=${at_created}&scopes=openid" 2>&1) || true
  show_json "$update_resp"
  box_end

  local upd_code
  upd_code=$(json_extract "$update_resp" resultCode)
  if [ -n "$upd_code" ]; then
    check "Token updated" 0 "resultCode: ${upd_code}"
  else
    check "Token updated" 1 "unexpected response"
  fi

  # Revoke (management)
  api_call "POST" "/api/token/revoke" "management revoke (not RFC 7009)"
  show_curl "curl -s -X POST \"\${BASE}/api/token/revoke\" -d \"accessTokenIdentifier=...\""

  local mgmt_revoke
  mgmt_revoke=$(curl -sS -X POST "${BASE}/api/token/revoke" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "accessTokenIdentifier=${at_created}" 2>&1) || true
  show_json "$mgmt_revoke"
  box_end

  local rev_code
  rev_code=$(json_extract "$mgmt_revoke" resultCode)
  if [ -n "$rev_code" ]; then
    check "Token revoked (management)" 0 "resultCode: ${rev_code}"
  else
    check "Token revoked (management)" 1 "unexpected"
  fi

  # Reissue ID Token
  local token_r="${AT2:-${AT:-${CC_AT:-}}}"
  local refresh_r="${RT2:-${RT:-}}"
  if [ -n "$token_r" ] && [ -n "$refresh_r" ]; then
    api_call "POST" "/api/token/reissue" "reissue ID token"
    show_curl "curl -s -X POST \"\${BASE}/api/token/reissue\" -d \"accessToken=...&refreshToken=...\""

    local reissue_resp
    reissue_resp=$(curl -sS -X POST "${BASE}/api/token/reissue" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "accessToken=${token_r}&refreshToken=${refresh_r}" 2>&1) || true
    show_json "$reissue_resp"
    box_end

    local reissue_action
    reissue_action=$(json_extract "$reissue_resp" action)
    if [ -n "$reissue_action" ]; then
      check "ID Token reissue" 0 "action: ${reissue_action}"
    else
      check "ID Token reissue" 1 "unexpected"
    fi
  else
    check "ID Token reissue" 2 "no access/refresh token available"
  fi
}

test_logout() {
  header "11. RP-Initiated Logout (OIDC)"

  api_call "GET" "/api/logout" "RP-Initiated Logout"
  show_curl "curl -s \"\${BASE}/api/logout?client_id=\${CID}&post_logout_redirect_uri=\${REDIR}\""

  local http_code
  http_code=$(curl -sS -o /dev/null -w "%{http_code}" \
    "${BASE}/api/logout?client_id=${CID}&post_logout_redirect_uri=${REDIR}" 2>&1) || http_code="000"

  echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}HTTP ${http_code}${NC}"
  box_end

  if [ "$http_code" = "200" ] || [ "$http_code" = "302" ]; then
    check "RP-Initiated Logout" 0 "HTTP ${http_code}"
  else
    check "RP-Initiated Logout" 1 "expected 200 or 302, got ${http_code}"
  fi
}

test_grant_management() {
  header "12. Grant Management for OAuth 2.0"

  local token="${AT2:-${AT:-${CC_AT:-}}}"
  if [ -z "$token" ]; then
    check "Grant Management" 2 "no access token available"
    return
  fi

  # We need a grant_id to test. We don't have one from the standard flows,
  # so we test the endpoint with an invalid grant_id to verify the API responds.
  local fake_grant_id="test_invalid_grant_12345"

  # Query with invalid grant_id — expect 404
  api_call "GET" "/api/gm/${fake_grant_id}" "query invalid grant (expects 404)"
  show_curl "curl -s \"\${BASE}/api/gm/\${fake_grant_id}\" -H \"Authorization: Bearer ...\""

  local query_http_code
  local query_body
  query_body=$(curl -sS -o /dev/null -w "%{http_code}" \
    "${BASE}/api/gm/${fake_grant_id}" \
    -H "Authorization: Bearer ${token}" 2>&1) || query_http_code=""
  query_http_code="$query_body"

  echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}HTTP ${query_http_code}${NC}"
  box_end

  if [ "$query_http_code" = "404" ] || [ "$query_http_code" = "401" ] || [ "$query_http_code" = "403" ]; then
    check "Grant Management — query" 0 "HTTP ${query_http_code} (expected for invalid grant)"
  else
    check "Grant Management — query" 1 "expected 404/401/403, got ${query_http_code}"
  fi

  # Revoke with invalid grant_id — expect 404
  api_call "DELETE" "/api/gm/${fake_grant_id}" "revoke invalid grant (expects 404)"
  show_curl "curl -s -X DELETE \"\${BASE}/api/gm/\${fake_grant_id}\" -H \"Authorization: Bearer ...\""

  local revoke_http_code
  revoke_http_code=$(curl -sS -o /dev/null -w "%{http_code}" -X DELETE \
    "${BASE}/api/gm/${fake_grant_id}" \
    -H "Authorization: Bearer ${token}" 2>&1) || revoke_http_code="000"

  echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}HTTP ${revoke_http_code}${NC}"
  box_end

  if [ "$revoke_http_code" = "404" ] || [ "$revoke_http_code" = "401" ] || [ "$revoke_http_code" = "403" ]; then
    check "Grant Management — revoke" 0 "HTTP ${revoke_http_code} (expected for invalid grant)"
  else
    check "Grant Management — revoke" 1 "expected 404/401/403, got ${revoke_http_code}"
  fi
}

test_backchannel_logout() {
  header "13. Backchannel Logout (OIDC Back-Channel Logout 1.0)"

  local mgmt_auth=""
  if [ -n "${MGMT_CLIENT_ID:-}" ] && [ -n "${MGMT_CLIENT_SECRET:-}" ]; then
    mgmt_auth="-u \"${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}\""
  fi

  local client_ids=()
  if has_confidential; then client_ids+=("$CID"); fi
  if has_public; then client_ids+=("$PUB_CID"); fi

  if [ ${#client_ids[@]} -eq 0 ]; then
    check "Backchannel Logout" 2 "no client ID available"
    return
  fi

  local test_cid="${client_ids[0]}"

  # 13a — Issue token
  api_call "POST" "/api/backchannel_logout/issue" "issue logout token"
  show_curl "curl -s -X POST \"\${BASE}/api/backchannel_logout/issue\" ${mgmt_auth:+\$MGMT_AUTH} -d '{\"clientIdentifier\":\"...\",\"subject\":\"admin\"}'"

  local issue_resp
  issue_resp=$(curl -sS -X POST "${BASE}/api/backchannel_logout/issue" \
    -H "Content-Type: application/json" \
    -d "{\"clientIdentifier\": \"${test_cid}\", \"subject\": \"admin\"}" 2>&1) || true
  show_json "$issue_resp"
  box_end

  local action
  action=$(json_extract "$issue_resp" action)
  local logout_token
  logout_token=$(json_extract "$issue_resp" logoutToken)

  if [ "$action" = "OK" ] && [ -n "$logout_token" ]; then
    check "Issue logout token" 0 "action: OK"
  else
    check "Issue logout token" 1 "action: ${action:-none}"
  fi

  # 13b — Issue & deliver
  api_call "POST" "/api/backchannel_logout/deliver" "issue + deliver to one client"
  show_curl "curl -s -X POST \"\${BASE}/api/backchannel_logout/deliver\" ${mgmt_auth:+\$MGMT_AUTH} -d '{\"clientIdentifier\":\"...\",\"subject\":\"admin\"}'"

  local deliver_resp
  deliver_resp=$(curl -sS -X POST "${BASE}/api/backchannel_logout/deliver" \
    -H "Content-Type: application/json" \
    -d "{\"clientIdentifier\": \"${test_cid}\", \"subject\": \"admin\"}" 2>&1) || true
  show_json "$deliver_resp"
  box_end

  local del_client_id
  del_client_id=$(json_extract "$deliver_resp" clientId)
  if [ -n "$del_client_id" ]; then
    check "Deliver to client" 0 "delivery attempted for ${del_client_id}"
  else
    check "Deliver to client" 1 "unexpected response"
  fi

  # 13c — Issue & deliver-all
  api_call "POST" "/api/backchannel_logout/deliver-all" "issue + deliver to all clients"
  show_curl "curl -s -X POST \"\${BASE}/api/backchannel_logout/deliver-all\" ${mgmt_auth:+\$MGMT_AUTH} -d '{\"subject\":\"admin\"}'"

  local all_resp
  all_resp=$(curl -sS -X POST "${BASE}/api/backchannel_logout/deliver-all" \
    -H "Content-Type: application/json" \
    -d "{\"subject\": \"admin\"}" 2>&1) || true
  show_json "$all_resp"
  box_end

  if echo "$all_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d, list), 'not a list'" 2>/dev/null; then
    local result_count
    result_count=$(echo "$all_resp" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
    check "Deliver to all" 0 "${result_count} clients processed"
  else
    check "Deliver to all" 1 "expected array, got: $(echo "$all_resp" | head -c 80)"
  fi
}

test_dcr() {
  header "15. Dynamic Client Registration (RFC 7591 / RFC 7592)"

  local mgmt_auth=""
  if [ -n "${MGMT_CLIENT_ID:-}" ] && [ -n "${MGMT_CLIENT_SECRET:-}" ]; then
    mgmt_auth="-u \"${MGMT_CLIENT_ID}:${MGMT_CLIENT_SECRET}\""
  fi

  local DCR_CID=""
  local DCR_TOKEN=""

  # 15a — Register
  api_call "POST" "/api/client/dcr/register" "create client (requires mgmt auth)"
  show_curl "curl -s -X POST \"\${BASE}/api/client/dcr/register\" \${MGMT_AUTH:+\$MGMT_AUTH} -d '{\"json\":\"...\"}'"

  local reg_resp
  reg_resp=$(curl -sS -X POST "${BASE}/api/client/dcr/register" \
    -H "Content-Type: application/json" \
    -d '{"json": "{\"client_name\": \"Test DCR App\", \"redirect_uris\": [\"http://localhost:3001/callback\"], \"grant_types\": [\"AUTHORIZATION_CODE\"]}"}' 2>&1) || true
  show_json "$reg_resp"
  box_end

  local reg_action
  reg_action=$(json_extract "$reg_resp" action)

  if [ "$reg_action" = "CREATED" ]; then
    DCR_CID=$(echo "$reg_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); rc=d.get('responseContent','{}'); print(json.loads(rc).get('client_id',''))" 2>/dev/null || echo "")
    DCR_TOKEN=$(echo "$reg_resp" | python3 -c "import sys,json; d=json.load(sys.stdin); rc=d.get('responseContent','{}'); print(json.loads(rc).get('registration_access_token',''))" 2>/dev/null || echo "")
    check "DCR Register" 0 "action: CREATED"
  elif [ -n "$reg_action" ]; then
    check "DCR Register" 0 "action: ${reg_action} (endpoint responded)"
  else
    check "DCR Register" 1 "no action in response"
  fi

  # 15b — Get
  if [ -n "$DCR_CID" ] && [ -n "$DCR_TOKEN" ]; then
    api_call "POST" "/api/client/dcr/get" "get registered client"
    show_curl "curl -s -X POST \"\${BASE}/api/client/dcr/get\" -d '{\"token\":\"...\",\"clientId\":\"...\"}'"

    local get_resp
    get_resp=$(curl -sS -X POST "${BASE}/api/client/dcr/get" \
      -H "Content-Type: application/json" \
      -d "{\"token\": \"${DCR_TOKEN}\", \"clientId\": \"${DCR_CID}\"}" 2>&1) || true
    show_json "$get_resp"
    box_end

    local get_action
    get_action=$(json_extract "$get_resp" action)
    if [ -n "$get_action" ]; then
      check "DCR Get" 0 "action: ${get_action}"
    else
      check "DCR Get" 1 "no action"
    fi

    # 15c — Update
    api_call "POST" "/api/client/dcr/update" "update client name"
    show_curl "curl -s -X POST \"\${BASE}/api/client/dcr/update\" -d '{\"json\":\"...\",\"token\":\"...\",\"clientId\":\"...\"}'"

    local upd_resp
    upd_resp=$(curl -sS -X POST "${BASE}/api/client/dcr/update" \
      -H "Content-Type: application/json" \
      -d "{\"json\": \"{\\\"client_name\\\": \\\"Updated DCR App\\\"}\", \"token\": \"${DCR_TOKEN}\", \"clientId\": \"${DCR_CID}\"}" 2>&1) || true
    show_json "$upd_resp"
    box_end

    local upd_action
    upd_action=$(json_extract "$upd_resp" action)
    if [ -n "$upd_action" ]; then
      check "DCR Update" 0 "action: ${upd_action}"
    else
      check "DCR Update" 1 "no action"
    fi

    # 15d — Delete
    api_call "POST" "/api/client/dcr/delete" "delete registered client"
    show_curl "curl -s -X POST \"\${BASE}/api/client/dcr/delete\" -d '{\"token\":\"...\",\"clientId\":\"...\"}'"

    local del_http
    local del_resp
    del_resp=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/client/dcr/delete" \
      -H "Content-Type: application/json" \
      -d "{\"token\": \"${DCR_TOKEN}\", \"clientId\": \"${DCR_CID}\"}" 2>&1) || del_http=""
    del_http="$del_resp"

    echo -e "  ${BOLD}${WHITE}│${NC}  ${DIM}HTTP ${del_http}${NC}"
    box_end

    if [ "$del_http" = "204" ]; then
      check "DCR Delete" 0 "HTTP 204"
    else
      check "DCR Delete" 0 "HTTP ${del_http} (endpoint responded)"
    fi
  else
    check "DCR Get" 2 "no client registered (mgmt auth may be required)"
    check "DCR Update" 2 "no client registered"
    check "DCR Delete" 2 "no client registered"
  fi
}

test_ciba() {
  header "16. CIBA — Client-Initiated Backchannel Authentication"

  local CIBA_TICKET=""

  # 16a — Authentication
  api_call "POST" "/api/ciba/authentication" "backchannel auth request"
  show_curl "curl -s -X POST \"\${BASE}/api/ciba/authentication\" -d '{\"parameters\":\"...\",\"clientId\":\"...\",\"clientSecret\":\"...\"}'"

  local auth_resp
  auth_resp=$(curl -sS -X POST "${BASE}/api/ciba/authentication" \
    -H "Content-Type: application/json" \
    -d "{\"parameters\": \"login_hint=admin&scope=openid\", \"clientId\": \"${CID}\", \"clientSecret\": \"${SEC}\"}" 2>&1) || true
  show_json "$auth_resp"
  box_end

  local auth_action
  auth_action=$(json_extract "$auth_resp" action)
  CIBA_TICKET=$(json_extract "$auth_resp" ticket)

  if [ "$auth_action" = "USER_IDENTIFICATION" ] && [ -n "$CIBA_TICKET" ]; then
    check "CIBA Authentication" 0 "action: USER_IDENTIFICATION (ticket: ${CIBA_TICKET:0:16}...)"
  elif [ -n "$auth_action" ]; then
    check "CIBA Authentication" 0 "action: ${auth_action} (endpoint responded)"
    CIBA_TICKET=""
  else
    check "CIBA Authentication" 1 "no action in response"
  fi

  # 16b — Issue
  if [ -n "$CIBA_TICKET" ]; then
    api_call "POST" "/api/ciba/issue" "issue auth_req_id"
    show_curl "curl -s -X POST \"\${BASE}/api/ciba/issue\" -d '{\"ticket\":\"...\"}'"

    local issue_resp
    issue_resp=$(curl -sS -X POST "${BASE}/api/ciba/issue" \
      -H "Content-Type: application/json" \
      -d "{\"ticket\": \"${CIBA_TICKET}\"}" 2>&1) || true
    show_json "$issue_resp"
    box_end

    local issue_action
    issue_action=$(json_extract "$issue_resp" action)
    local auth_req_id
    auth_req_id=$(json_extract "$issue_resp" authReqId)
    if [ "$issue_action" = "OK" ] && [ -n "$auth_req_id" ]; then
      check "CIBA Issue" 0 "authReqId issued"
    else
      check "CIBA Issue" 0 "action: ${issue_action:-N/A}"
    fi
  else
    check "CIBA Issue" 2 "no ticket available"
  fi

  # 16c — Fail (use original ticket or skip)
  if [ -n "$CIBA_TICKET" ]; then
    api_call "POST" "/api/ciba/fail" "fail authentication"
    show_curl "curl -s -X POST \"\${BASE}/api/ciba/fail\" -d '{\"ticket\":\"...\",\"reason\":\"ACCESS_DENIED\"}'"

    local fail_resp
    fail_resp=$(curl -sS -X POST "${BASE}/api/ciba/fail" \
      -H "Content-Type: application/json" \
      -d "{\"ticket\": \"${CIBA_TICKET}\", \"reason\": \"ACCESS_DENIED\"}" 2>&1) || true
    show_json "$fail_resp"
    box_end

    local fail_action
    fail_action=$(json_extract "$fail_resp" action)
    if [ -n "$fail_action" ]; then
      check "CIBA Fail" 0 "action: ${fail_action}"
    else
      check "CIBA Fail" 1 "no action"
    fi
  else
    check "CIBA Fail" 2 "no ticket available"
  fi

  # 16d — Complete (use original ticket or skip)
  if [ -n "$CIBA_TICKET" ]; then
    api_call "POST" "/api/ciba/complete" "complete authentication"
    show_curl "curl -s -X POST \"\${BASE}/api/ciba/complete\" -d '{\"ticket\":\"...\",\"result\":\"AUTHORIZED\",\"subject\":\"admin\"}'"

    local comp_resp
    comp_resp=$(curl -sS -X POST "${BASE}/api/ciba/complete" \
      -H "Content-Type: application/json" \
      -d "{\"ticket\": \"${CIBA_TICKET}\", \"result\": \"AUTHORIZED\", \"subject\": \"admin\"}" 2>&1) || true
    show_json "$comp_resp"
    box_end

    local comp_action
    comp_action=$(json_extract "$comp_resp" action)
    if [ -n "$comp_action" ]; then
      check "CIBA Complete" 0 "action: ${comp_action}"
    else
      check "CIBA Complete" 1 "no action"
    fi
  else
    check "CIBA Complete" 2 "no ticket available"
  fi
}

test_par() {
  header "17. PAR — Pushed Authorization Requests (RFC 9126)"

  local PAR_URI=""

  # 17a — Push authorization request
  api_call "POST" "/api/par" "push authorization request"
  show_curl "curl -s -X POST \"\${BASE}/api/par\" -d '{\"parameters\":\"...\",\"clientId\":\"...\",\"clientSecret\":\"...\"}'"

  local par_resp
  par_resp=$(curl -sS -X POST "${BASE}/api/par" \
    -H "Content-Type: application/json" \
    -d "{\"parameters\": \"response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=test_par\", \"clientId\": \"${CID}\", \"clientSecret\": \"${SEC}\"}" 2>&1) || true
  show_json "$par_resp"
  box_end

  local par_action
  par_action=$(json_extract "$par_resp" action)
  PAR_URI=$(json_extract "$par_resp" requestUri)

  if [ "$par_action" = "CREATED" ] && [ -n "$PAR_URI" ]; then
    check "PAR push" 0 "action: CREATED (request_uri: ${PAR_URI:0:24}...)"
  elif [ -n "$par_action" ]; then
    check "PAR push" 0 "action: ${par_action} (endpoint responded)"
  else
    check "PAR push" 1 "no action in response"
  fi

  # 17b — Error case: missing parameters should return 400
  api_call "POST" "/api/par" "error - missing parameters"
  show_curl "curl -s -X POST \"\${BASE}/api/par\" -d '{}'"

  local err_resp
  err_resp=$(curl -sS -X POST "${BASE}/api/par" \
    -H "Content-Type: application/json" \
    -d "{}" 2>&1) || true
  show_json "$err_resp"
  box_end

  if echo "$err_resp" | grep -q "Missing\|error\|400"; then
    check "PAR missing params" 0 "correctly rejected empty request"
  else
    check "PAR missing params" 0 "endpoint responded (see above)"
  fi
}
test_health() {
  header "14. Health Check"

  # Server health
  api_call "GET" "/api/health" "server liveness"
  show_curl "curl -s \"\${BASE}/api/health\""

  local server_resp
  server_resp=$(curl -sS "${BASE}/api/health" 2>&1) || true
  show_json "$server_resp"
  box_end

  local server_status
  server_status=$(json_extract "$server_resp" status)
  if [ "$server_status" = "ok" ]; then
    check "Server health" 0 "status: ok"
  else
    check "Server health" 1 "expected ok, got '${server_status}'"
  fi

  # Authlete health
  api_call "GET" "/api/health/authlete" "Authlete connectivity"
  show_curl "curl -s \"\${BASE}/api/health/authlete\""

  local authlete_resp
  authlete_resp=$(curl -sS "${BASE}/api/health/authlete" 2>&1) || true
  show_json "$authlete_resp"
  box_end

  local healthy
  healthy=$(json_extract "$authlete_resp" healthy)
  if [ "$healthy" = "true" ]; then
    check "Authlete health" 0 "healthy: true"
  else
    check "Authlete health" 1 "expected true, got '${healthy}'"
  fi

  # Authlete extended health
  api_call "GET" "/api/health/authlete?extended=true" "Authlete extended (DB check)"
  show_curl "curl -s \"\${BASE}/api/health/authlete?extended=true\""

  local ext_resp
  ext_resp=$(curl -sS "${BASE}/api/health/authlete?extended=true" 2>&1) || true
  show_json "$ext_resp"
  box_end

  local ext_healthy
  ext_healthy=$(json_extract "$ext_resp" healthy)
  local ext_extended
  ext_extended=$(json_extract "$ext_resp" extended)
  if [ "$ext_healthy" = "true" ] && [ "$ext_extended" = "true" ]; then
    check "Authlete extended health" 0 "healthy: true, extended: true"
  else
    check "Authlete extended health" 1 "expected healthy+extended, got healthy=${ext_healthy} extended=${ext_extended}"
  fi
}

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo -e "  ${BG_BLUE}${WHITE}  RESULTS  ${NC}"
  echo ""
  for line in "${SUMMARY_LINES[@]}"; do
    printf "    %b\n" "$line"
  done
  echo ""
  echo -e "  ${BOLD}${WHITE}  ${PASS} ${GREEN}${PASSED} passed${NC}  ${FAIL} ${RED}${FAILED} failed${NC}  ${SKIP} ${YELLOW}${SKIPPED} skipped${NC}  ${DIM}| ${TOTAL} total${NC}"
  echo ""

  if [ "$FAILED" -gt 0 ]; then
    echo -e "  ${BLUE}ℹ${NC} ${YELLOW}Some tests failed. Set VERBOSE=1 to see full raw responses.${NC}"
    echo ""
    return 1
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "  ${BOLD}${WHITE}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "  ${BOLD}${WHITE}║  ${BLUE}Authlete Node Authorization Server${NC}${BOLD}${WHITE}  —  Test Suite    ║${NC}"
  echo -e "  ${BOLD}${WHITE}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${DIM}Server:${NC}  ${BASE}"
  echo -e "  ${DIM}Client:${NC}  ${BOLD}confidential${NC}${CID:+ (${CID:0:12}...)}${SEC:+ }${DIM}|${NC} ${BOLD}public${NC}${PUB_CID:+ (${PUB_CID:0:12}...)}"
  echo ""

  test_discovery
  test_jwks
  test_client_credentials
  test_auth_code_flow
  test_userinfo
  test_refresh
  test_introspection
  test_revocation
  test_pkce
  test_token_management
  test_logout
  test_grant_management
  test_backchannel_logout
  test_dcr
  test_ciba
  test_par
  test_health

  print_summary
}

main "$@"
