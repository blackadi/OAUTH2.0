# Pushed Authorization Requests (PAR) — RFC 9126

A comprehensive guide to PAR: what it is, why it exists, how Authlete implements it, and how to test it with this server and client.

---

## Table of Contents

- [Part 1: Introduction & Motivation](#part-1-introduction--motivation)
- [Part 2: How PAR Works](#part-2-how-par-works)
- [Part 3: Authlete PAR Configuration](#part-3-authlete-par-configuration)
- [Part 4: Step-by-Step PAR Flow](#part-4-step-by-step-par-flow)
- [Part 5: Client Authentication at PAR](#part-5-client-authentication-at-par)
- [Part 6: SPA Testing Tool Walkthrough](#part-6-spa-testing-tool-walkthrough)
- [Part 7: Error Scenarios](#part-7-error-scenarios)
- [Part 8: Industry Use Cases](#part-8-industry-use-cases)
- [Part 9: PAR + DPoP (FAPI 2.0)](#part-9-par--dpop-fapi-20)
- [Part 10: Troubleshooting](#part-10-troubleshooting)

---

## Part 1: Introduction & Motivation

### What is PAR?

Pushed Authorization Requests (PAR), defined in [RFC 9126](https://www.rfc-editor.org/rfc/rfc9126.html), allow an OAuth client to "push" the authorization request content directly to the authorization server via a dedicated POST endpoint (the PAR endpoint), rather than sending it through the browser as query parameters in a redirect URL.

The PAR endpoint validates the request, authenticates the client, and returns a short-lived `request_uri` identifier. The client then uses this `request_uri` in the browser redirect to `/authorize`, removing the need to pass the full authorization payload through the user-agent.

### Why was PAR created?

PAR solves several security and practical problems with the traditional authorization redirect:

| Problem | How PAR Fixes It |
|---------|------------------|
| **Request tampering** — Attackers can modify query parameters in the browser redirect URL (e.g., swapping `redirect_uri`, downgrading scopes) | The full authorization payload is POSTed server-to-server. The browser only sees an opaque `request_uri` that cannot be tampered with. |
| **Large payloads** — Complex authorization requests (many claims, RAR `authorization_details`, [Rich Authorization Requests](https://oauth.net/2/rich-authorization-requests/)) can exceed URL length limits (~8KB for most browsers) | PAR uses a POST body with no size limit. The browser redirect contains only `client_id` + `request_uri`. |
| **Privacy leakage** — Sensitive authorization parameters (claims, prompts, ID tokens) are visible in the browser URL bar, history, and referrer headers | Only the opaque `request_uri` (a `urn:ietf:params:oauth:request_uri:...` value) passes through the browser. |
| **SPA limitations** — Single-page applications cannot reliably maintain state across redirects to the authorization server | The PAR endpoint stores the full request server-side. The SPA only needs to store the `request_uri` before redirect. |
| **Mobile app complexity** — Native apps must open a browser for authorization, risking state loss during app-switching | PAR ensures the authorization request is fully captured before the browser opens. |

### When should you use PAR?

- **Always** when using a public client (SPA, native app) — PAR + PKCE is the gold standard for public client security
- **Always** in FAPI-compliant deployments — FAPI 2.0 Security Profile **requires** PAR
- **When** you need to pass `authorization_details` (RAR) with large or complex structures
- **When** the authorization request includes claims that should not be exposed in the browser URL
- **When** you want to ensure the authorization request has not been tampered with between the client and the authorization server

---

## Part 2: How PAR Works

### Architecture

```
┌──────────┐                     ┌──────────────────┐                ┌──────────┐
│          │  1. POST /as/par    │                  │                │          │
│  Client  │ ──────────────────→ │  Authorization   │  (Authlete     │  Authlete │
│  (SPA)   │     parameters      │  Server (Express)│   backend)     │   API    │
│          │ ←────────────────── │                  │ ←────────────→ │          │
│          │   request_uri       │                  │                │          │
│          │                     │                  │                │          │
│          │  2. Redirect to     │                  │                │          │
│          │  /authorize?        │                  │                │          │
│          │  client_id=...&     │                  │                │          │
│  Browser │  request_uri=...    │                  │                │          │
│  ───────→│ ──────────────────→ │                  │                │          │
│  (User   │                     │  (Resolves       │                │          │
│   Agent) │                     │   request_uri    │                │          │
│          │  3. Login + Consent │   via Authlete)  │                │          │
│          │ ←────────────────── │                  │                │          │
│          │   code redirect     │                  │                │          │
└──────────┘                     └──────────────────┘                └──────────┘
```

### The two-step flow

PAR splits the traditional authorization request into two HTTP exchanges:

**Step 1 — Push (server-to-server):** The client POSTs the full authorization payload to the PAR endpoint. The authorization server delegates to Authlete's `/pushed_auth_req` API, which validates the request, authenticates the client, stores the request, and returns:

```json
{
  "action": "CREATED",
  "requestUri": "urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4",
  "responseContent": "{\"expires_in\":600,\"request_uri\":\"urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4\"}"
}
```

**Step 2 — Authorize (browser redirect):** The client redirects the browser to the authorization endpoint with only `client_id` and the `request_uri`:

```
GET /authorize?client_id=3280859750204&request_uri=urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4
```

The authorization server passes these parameters to Authlete's `/auth/authorization` API, which resolves the `request_uri` internally, retrieves the stored authorization request, and processes it as if it had been sent directly. The user experience (login, consent, code redirect) is identical to the traditional flow.

### Why two steps?

The separation of the provisioning step (Step 1) from the authorization step (Step 2) provides:

1. **Integrity**: The `request_uri` is bound to the exact parameters that were pushed. Any attempt to tamper with the authorization request would require guessing the cryptographically random `request_uri`.
2. **Auditability**: The client is authenticated at the PAR endpoint before any user interaction, providing a clean audit trail.
3. **Flexibility**: Different components of the system can handle each step. An SPA can call the PAR endpoint from JavaScript (using `fetch`), then open the browser for Step 2 via `window.location.href`.

---

## Part 3: Authlete PAR Configuration

### Service-level settings

In the [Authlete Console](https://console.authlete.com/), navigate to **Service Settings → Pushed Authorization Request (PAR)**:

| Setting | Description | Recommended |
|---------|-------------|-------------|
| **Require PAR** | If enabled, ALL clients MUST use PAR. Authorization requests without `request_uri` are rejected. | `false` (use per-client flag instead) |
| **Request URI Duration** | Lifetime of the `request_uri` in seconds (default: 600). After expiration, the `request_uri` is invalid. | `600` (10 minutes) |

### Client-level settings

Open **Client Settings → Endpoints → General → Pushed Authorization Request**:

| Setting | Description |
|---------|-------------|
| **Require PAR** | Overrides the service-level flag. Forces this specific client to use PAR. |

Client-level enforcement is useful during phased rollouts — require PAR for new clients while legacy clients continue without it.

### Verifying configuration

```bash
# Check if PAR is enabled on your service
curl http://localhost:3000/api/fapi/status | python3 -m json.tool | grep -E "pushedAuth|requirePar|par_|request_uri"

# Or check the full OpenID Configuration
curl http://localhost:3000/api/.well-known/openid-configuration | python3 -m json.tool | grep pushed
```

Expected output includes `"pushed_authorization_request_endpoint"` pointing to the PAR endpoint.

---

## Part 4: Step-by-Step PAR Flow

### Prerequisites

- Authlete service with PAR enabled (see Part 3)
- A confidential client with `client_id` and `client_secret`
- Redirect URI registered: `http://localhost:3001/callback`
- Servers running: `npm --prefix server run dev` + `npm --prefix client run dev`

### Step 1: Push Authorization Request

Send the full authorization request to the PAR endpoint as a URL-encoded `parameters` string:

```bash
curl -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid%20profile&state=my_state&code_challenge_method=S256&code_challenge=YOUR_CODE_CHALLENGE",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

**Successful response (HTTP 201):**

```json
{
  "action": "CREATED",
  "requestUri": "urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4",
  "responseContent": "{\"expires_in\":600,\"request_uri\":\"urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4\"}"
}
```

### Step 2: Authorize with request_uri

Open the authorization endpoint in a browser with the `request_uri`:

```
http://localhost:3000/api/authorization?client_id=YOUR_CLIENT_ID&request_uri=urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4
```

The authorization server will:
1. Receive `client_id` + `request_uri`
2. Forward them to Authlete's `/auth/authorization` API
3. Authlete resolves the `request_uri` to retrieve the stored authorization request
4. Normal authorization flow proceeds: login → consent → code redirect

### Step 3: Complete the OAuth flow

After login and consent, the browser redirects to your callback URL with an authorization code:

```
http://localhost:3001/callback?code=abc123&state=my_state
```

### Step 4: Exchange code for tokens

Use the authorization code at the token endpoint:

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=abc123" \
  -d "redirect_uri=http://localhost:3001/callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code_verifier=YOUR_CODE_VERIFIER"
```

**Successful response (HTTP 200):**

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJ..."
}
```

### Full scripted flow

```bash
#!/bin/bash
# PAR → Authorize → Code → Token (requires running server)

CID="YOUR_CLIENT_ID"
SEC="YOUR_CLIENT_SECRET"
REDIR="http://localhost:3001/callback"

# 1. Generate PKCE
CODE_VERIFIER=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
STATE=$(openssl rand -hex 16)

# 2. Push to PAR
echo "=== PAR request ==="
PAR_RESP=$(curl -s -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "parameters": "response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=${STATE}&code_challenge_method=S256&code_challenge=${CODE_CHALLENGE}",
  "clientId": "${CID}",
  "clientSecret": "${SEC}"
}
EOF
)")
REQUEST_URI=$(echo "$PAR_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['requestUri'])")
echo "request_uri: $REQUEST_URI"

# 3. Open in browser manually (login + consent required)
echo "Open this URL in your browser:"
echo "http://localhost:3000/api/authorization?client_id=${CID}&request_uri=${REQUEST_URI}"

# 4. After getting code from redirect, set CODE=... and run:
# curl -X POST http://localhost:3000/api/token \
#   -H "Content-Type: application/x-www-form-urlencoded" \
#   -d "grant_type=authorization_code" \
#   -d "code=${CODE}" \
#   -d "redirect_uri=${REDIR}" \
#   -d "client_id=${CID}" \
#   -d "client_secret=${SEC}" \
#   -d "code_verifier=${CODE_VERIFIER}"
```

---

## Part 5: Client Authentication at PAR

Authlete applies the same client authentication method settings for the PAR endpoint as for the token endpoint. This is configured in **Service Settings → Endpoints → Token → Supported Client Authentication Methods**.

### client_secret_basic

The client sends credentials via `Authorization: Basic` header. The server passes both `clientId` and `clientSecret` in the request body:

```json
{
  "parameters": "response_type=code&client_id=CID...",
  "clientId": "3280859750204",
  "clientSecret": "qfd0ScLHhD..."
}
```

### client_secret_post

The client sends `client_id` and `client_secret` in the POST body. Our PAR implementation merges credentials into the `parameters` string (as documented in AGENTS.md), which Authlete processes correctly for this auth method.

### private_key_jwt

The client includes a `client_assertion` (signed JWT) and `client_assertion_type` in the `parameters` string:

```json
{
  "parameters": "response_type=code&client_id=CID&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer&client_assertion=eyJ...&redirect_uri=...&scope=openid&state=...&code_challenge_method=S256&code_challenge=..."
}
```

This is how the FAPI 2.0 wizard in the SPA handles PAR — the client assertion is generated from a locally-stored ES256 key pair.

### none (public client)

Public clients (SPAs, native apps) can omit `clientSecret`:

```json
{
  "parameters": "response_type=code&client_id=PUBLIC_CID&redirect_uri=...&scope=openid&state=...&code_challenge_method=S256&code_challenge=...",
  "clientId": "PUBLIC_CID"
}
```

> **Note**: Even though public clients are not "authenticated" with a secret, Authlete still validates the `client_id` and enforces that PAR is allowed for this client type. Public clients MUST use PKCE.

---

## Part 6: SPA Testing Tool Walkthrough

The React SPA includes a **PAR** section that provides a full PAR testing interface.

### Opening the PAR section

1. Start both servers: `npm --prefix server run dev` + `npm --prefix client run dev`
2. Open `http://localhost:3001`
3. Click **PAR** in the sidebar (under OIDC & Extensions — look for the paper-plane icon)

### Using the PAR tools

The PAR section provides:

| Feature | Description |
|---------|-------------|
| **Parameters (URL-encoded)** | Editable textarea with the full authorization request payload. The default template includes: `response_type=code`, `redirect_uri`, `scope=openid`, `state`, `code_challenge_method=S256`, `code_challenge` |
| **Generate PKCE + State** | One-click PKCE pair generation. Creates `code_verifier` (stored in `sessionStorage`), `code_challenge` (SHA-256), and a UUID `state` for CSRF protection. The verifier hash is shown in the UI. |
| **Client ID** | Your confidential or public client's identifier |
| **Client Secret** | Optional — omit for public clients, provide for confidential clients |
| **Use DPoP** | Checkbox to enable DPoP sender-constrained token binding. Generates a DPoP key pair on first use, creates a DPoP proof, and sends it with the PAR request. |
| **Push Authorization Request** | Sends the request to `POST /api/par`. On success, shows the `request_uri`, expiration time, and the full auth URL. |
| **Authorize (redirect)** | After PAR succeeds, redirects the browser to `/authorize?client_id=...&request_uri=...`. |
| **Push + Authorize** | Does both in one click — pushes the PAR request, then immediately redirects to the authorization endpoint. |
| **Reset** | Clears the PAR result to start over. |

### Testing the full flow

**Scenario 1: Standard PAR (confidential client + PKCE)**

1. Click **Generate PKCE + State** → fills parameters with PKCE and state
2. Enter your `Client ID` and `Client Secret`
3. Click **Push Authorization Request** → see `request_uri` in the response
4. Click **Authorize (redirect)** → browser goes to login page
5. Log in as `admin` / `password` → consent page
6. Approve → redirect to callback with authorization code
7. Callback page exchanges the code for tokens automatically

**Scenario 2: PAR with public client (no secret)**

1. Click **Generate PKCE + State**
2. Enter your public client's `Client ID`, leave **Client Secret** empty
3. Click **Push Authorization Request** → succeeds without secret
4. Continue with authorize → login → consent → code → token

**Scenario 3: PAR with DPoP**

1. Click **Generate PKCE + State**
2. Enter credentials
3. Check **Use DPoP**
4. Click **Push Authorization Request** → generates DPoP key, creates proof, sends with DPoP header
5. If the server returns a `DPoP-Nonce`, it is stored automatically
6. Click **Authorize (redirect)** → continues the flow with DPoP-bound tokens

### What to expect

- **HTTP 201** + `action: CREATED` + `requestUri`: PAR succeeded. The `request_uri` is valid for the configured duration.
- **HTTP 400** + `error: invalid_request`: Missing or invalid parameters. Common causes: missing `parameters` field, invalid `client_id`, invalid `redirect_uri`.
- **HTTP 401** + `error: invalid_client`: Client authentication failed. Wrong `clientSecret` or unregistered `clientId`.
- **HTTP 413** + `error: payload_too_large`: Parameters exceeded the maximum allowed size.

---

## Part 7: Error Scenarios

| HTTP Status | Authlete Action | Meaning | Common Causes |
|:-----------:|:---------------:|---------|---------------|
| `400` | `BAD_REQUEST` | Request validation failed | Missing `response_type`, invalid `redirect_uri`, expired `request_uri`, invalid `scope` |
| `401` | `UNAUTHORIZED` | Client authentication failed | Wrong client secret, unregistered client ID, expired client credentials |
| `403` | `FORBIDDEN` | Client not authorized for PAR | Client-level `requirePar` is off and client is not allowed to use PAR; or client is a public client but PKCE is missing |
| `413` | `PAYLOAD_TOO_LARGE` | Parameters too large | URL-encoded parameters exceed Authlete's size limit |
| `500` | `INTERNAL_SERVER_ERROR` | Server-side error | Authlete API call failed, service configuration issue |

### Error response format

```json
{
  "action": "BAD_REQUEST",
  "resultCode": "A245002",
  "resultMessage": "[A245002] The pushed authorization request is invalid.",
  "responseContent": "{\"error\":\"invalid_request\",\"error_description\":\"[A245002] The pushed authorization request is invalid. One of the required parameters is missing.\"}"
}
```

The server returns the `responseContent` as the HTTP response body.

### Handling errors in the SPA

- **Bad request**: Check your parameters — ensure `client_id`, `redirect_uri`, `response_type` are present and valid
- **Unauthorized**: Verify `clientSecret`. For DCR-created clients, remember they default to `CLIENT_SECRET_POST` — send credentials in the body
- **Forbidden**: Check that PAR is enabled for this client in Authlete Console (client-level `requirePar`)
- **Large payload**: Reduce the size of `authorization_details` or other large claims

---

## Part 8: Industry Use Cases

### 1. Open Banking / Financial-grade API (FAPI)

FAPI 2.0 Security Profile **requires** PAR for all authorization requests. The Pushed Authorization Request endpoint must be implemented with client authentication (typically `private_key_jwt`) and DPoP binding.

**Why**: Open Banking requires strong guarantees about request integrity and client authentication. PAR ensures that:
- The authorization request cannot be tampered with during the browser redirect
- The client is authenticated before any user interaction
- Large payloads (e.g., payment consent JWT in `authorization_details`) are handled without URL size limits

### 2. Single-page Applications (SPAs)

SPAs cannot keep client secrets and must use the authorization code flow with PKCE. PAR adds an additional security layer:

- The SPA calls the PAR endpoint using `fetch()` with the full authorization payload
- The browser redirect only contains `client_id` + `request_uri`
- No sensitive parameters (state, PKCE challenge, scopes) appear in the URL bar or browser history

**Implementation pattern:**
```
// SPA code
const response = await fetch('/api/par', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parameters: 'response_type=code&client_id=...&redirect_uri=...&scope=openid&code_challenge_method=S256&code_challenge=...&state=...',
    clientId: '...',
  }),
});
const { requestUri } = await response.json();
window.location.href = `/api/authorization?client_id=...&request_uri=${requestUri}`;
```

### 3. Mobile and Native Apps

Mobile apps face unique challenges with OAuth:
- Opening a browser (or Embedded WebView / Custom Tab) for authorization
- Receiving the callback via deep link or redirect URI
- Maintaining app state across the browser switch

PAR simplifies this:
1. The app calls the PAR endpoint while it's still in the foreground
2. The full authorization request is captured server-side
3. The app opens the browser with just `client_id` + `request_uri`
4. After authorization, the browser redirects back to the app with the code
5. The app exchanges the code for tokens

**Benefit**: The app does not need to encode complex authorization parameters into the redirect URL, avoiding URL encoding issues with deep links and custom schemes.

### 4. Server-side Web Apps (Backend-for-Frontend)

In a BFF architecture, the backend server handles the OAuth flow on behalf of the frontend:

1. Frontend sends a request to the BFF: "I want to authenticate"
2. BFF constructs the full authorization request, calls PAR
3. BFF returns the `request_uri` to the frontend
4. Frontend redirects to `/authorize` with the `request_uri`
5. Authorization completes, code redirects to BFF's callback endpoint
6. BFF exchanges code for tokens

**Security benefit**: The authorization payload never touches the browser. The BFF controls exactly what parameters are sent, preventing parameter injection from a compromised frontend.

---

## Part 9: PAR + DPoP (FAPI 2.0)

In FAPI 2.0 Security Profile, PAR is used together with DPoP (RFC 9449) and `private_key_jwt` client authentication:

### How it works

1. The client generates a DPoP key pair and a signing key pair (for `private_key_jwt`)
2. The client constructs the authorization request with `client_assertion` (signed with the signing key)
3. The client creates a DPoP proof (signed with the DPoP key) and sends it via the `DPoP` HTTP header
4. The PAR endpoint validates both the client assertion and the DPoP proof
5. The client receives a `DPoP-Nonce` header in the response (for subsequent requests)
6. The authorization request and the resulting tokens are bound to the DPoP key

### SPA FAPI 2.0 wizard

This SPA includes a **FAPI** section with a 4-step test flow that demonstrates the complete FAPI 2.0 + PAR flow:

1. **DPoP & Keys**: Generate DPoP key pair + signing key pair
2. **PAR**: Push the authorization request with DPoP proof + `private_key_jwt`
3. **Authorize**: Redirect to `/authorize` with `request_uri`
4. **Token**: After callback, exchange the code using DPoP-bound token request

### Request with DPoP

```bash
curl -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -H "DPoP: eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2IiwiandrIjp7Imt0eSI6IkVDIiwiY3J2IjoiUC0yNTYiLCJ4Ijoi...In0.eyJodG0iOiJQT1NUIiwiaHR1IjoiaHR0cDovL2xvY2FsaG9zdDozMDAwL2FwaS9wYXIiLCJpYXQiOjE3MTk0NzUyMTIsImp0aSI6IjAxOHFic2N4MDl6In0.xyz" \
  -d '{
    "parameters": "response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer&client_assertion=eyJ...&code_challenge_method=S256&code_challenge=...&state=...",
    "clientId": "YOUR_CLIENT_ID"
  }'
```

### DPoP Nonce handling

- First PAR request without nonce → server returns `DPoP-Nonce` header
- Client stores the nonce and includes it in the next DPoP proof
- Expired nonce → server returns 401 with new `DPoP-Nonce`
- The SPA stores nonces in `sessionStorage` under `dpop_nonce`

---

## Part 10: Troubleshooting

### "Missing required body field: parameters"

**Cause:** The `parameters` field was not sent in the request body.
**Fix:** Ensure your JSON body includes `"parameters": "response_type=code&client_id=..."`.

### "The redirected URI is not registered"

**Cause:** The `redirect_uri` in the PAR `parameters` does not match any of the client's registered redirect URIs.
**Fix:** Use a `redirect_uri` that matches one registered in Authlete Console for your client.

### "unknown_client"

**Cause:** The `client_id` sent in the PAR request (either in `parameters` or as a separate field) is not registered with this Authlete service.
**Fix:** Verify the `clientId` and that the client exists in Authlete Console.

### "expired_request_uri" at /authorize

**Cause:** The `request_uri` has expired before the user completed authorization. Default lifetime is 600 seconds (10 minutes).
**Fix:** Perform the PAR push and the authorization redirect within the configured `request_uri_duration`. For testing, increase the duration in Authlete Console.

### 401 on PAR but correct credentials

**Cause for DCR clients:** DCR-created confidential clients default to `CLIENT_SECRET_POST` authentication, even when the service's `supportedTokenAuthMethods` lists only `CLIENT_SECRET_BASIC`. PAR expects credentials in the body for these clients.
**Fix:** Send `clientId` and `clientSecret` in the JSON body (not as HTTP Basic auth). The server merges them into the `parameters` string.

### "PAR is not enabled for this client"

**Cause:** The client does not have the `requirePar` flag enabled, and the service does not require PAR.
**Fix:** Either:
- Enable `requirePar` for this client in Authlete Console
- Or enable PAR at the service level
- Or use the standard `/authorize` endpoint without PAR

### DPoP "invalid_dpop_proof"

**Cause:** The DPoP proof signature is invalid, or the DPoP key does not match the key used in the DPoP proof `jwk` header.
**Fix:** Ensure:
- The DPoP proof is signed with the correct private key
- The `jwk` header contains the corresponding public key
- The `htm` and `htu` claims match the actual request (`POST` and `http://localhost:3000/api/par`)
- The `ath` claim is NOT included (only used for resource access with tokens, not for PAR)
- For ES256, the signature is raw R||S (64 bytes), not DER-encoded

### "payload_too_large"

**Cause:** The URL-encoded parameters string exceeds Authlete's maximum allowed size.
**Fix:** Reduce the payload size. Common culprits:
- Large `authorization_details` (RAR) JSON objects
- Large `claims` parameter with many requested claims
- Large `client_assertion` JWT (though this is usually small)

---

## References

- [RFC 9126: OAuth 2.0 Pushed Authorization Requests](https://www.rfc-editor.org/rfc/rfc9126.html)
- [Authlete KB: Pushed Authorization Requests](https://www.authlete.com/kb/oauth-and-openid-connect/authorization-requests/pushed-authorization-requests/)
- [OAuth 2.0 for Browser-Based Apps (Best Current Practice)](https://www.rfc-editor.org/rfc/rfc8252.html)
- [Financial-grade API (FAPI) 2.0 Security Profile](https://openid.net/specs/fapi-2_0-security-profile.html)
- [DPoP: OAuth 2.0 Demonstration of Proof-of-Possession (RFC 9449)](https://www.rfc-editor.org/rfc/rfc9449.html)
