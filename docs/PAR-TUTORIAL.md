# Pushed Authorization Requests (PAR) — RFC 9126

> **The short version:** PAR lets you send authorization parameters directly to the server (server-to-server) instead of through the browser URL. The browser only gets an opaque `request_uri` — no sensitive data leaks through the URL bar.

> ### How the transcripts below were verified, and the one way this endpoint is not RFC 9126
>
> Labels are **captured** / *illustrative* / **`UNVERIFIED`** — defined once in
> [the tutorial index](README.md#how-to-read-the-transcripts-in-these-tutorials).
>
> **PAR runs here, on every client.** Nothing in this file needs a setting turned on: `parRequired` is
> `false`, which means PAR is *optional*, not unavailable. Values in the blocks below are *illustrative*
> except `expires_in`, which is the service's live `pushedAuthReqDuration` — **600**, re-checked 2026-08-14.
>
> ### ⚠️ The response is RFC 9126's. The request is not.
>
> | | RFC 9126 requires | This server accepts |
> |---|---|---|
> | request | §2 — a **form-encoded** POST whose body is the authorization parameters themselves (`response_type=code&client_id=…`), with client authentication as at the token endpoint | a **JSON** body: `{"parameters": "<url-encoded string>", "clientId": …, "clientSecret": …}` |
> | success response | §2.2 — `{"request_uri": …, "expires_in": …}` | ✅ **exactly that**, since 2026-08-14 (T1-11). Two members, snake_case, no vendor envelope |
>
> **So a conformant PAR client cannot call `/api/par`** — it would send §2's form body and get
> `400 Missing required body field: parameters`. This is an open finding, not a design choice, and it is worth
> being precise about *why* it is tempting: Part 1 lists "an SPA can call PAR from JavaScript" as a benefit,
> and that is true here **only because** the endpoint takes JSON. A conformant PAR endpoint requires client
> authentication, which is exactly what an SPA cannot do — so the convenience and the non-conformance are the
> same fact. Read that bullet as a description of this deployment, not as advice.
>
> The response half used to be non-conformant too: `requestUri` in camelCase, beside `action` and
> `resultCode`, with §2.2's body carried as a `responseContent` **string** the caller had to know to parse.
> If you are reading an older copy of this file, that is what changed.

---

## Table of Contents

- [Part 1: Why PAR Exists](#part-1-why-par-exists)
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

## Part 1: Why PAR Exists

### The Problem: Everything in the URL

In the traditional OAuth authorization code flow, you build the authorization URL by stuffing all the parameters into the query string:

```
GET /authorize?
  response_type=code&
  client_id=3280859750204&
  redirect_uri=https://myapp.com/callback&
  scope=openid profile email&
  state=abc123&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256
```

This URL goes through the browser. And that creates several problems:

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    subgraph Problems["The URL Problem"]
        A["🔒 Tampering<br/>Anyone can modify params<br/>in the browser"]
        B["📏 Size limits<br/>URLs can't exceed ~8KB"]
        C["👁️ Privacy<br/>Sensitive params visible<br/>in URL bar + history"]
        D["📱 Mobile<br/>State lost during<br/>app switching"]
    end
```

| Problem | What Happens | Real Impact |
|---------|-------------|-------------|
| **Request tampering** | Attacker modifies `redirect_uri` or `scope` in the URL | Steals tokens, escalates privileges |
| **URL length limits** | Complex RAR `authorization_details` exceed ~8KB | Request fails silently |
| **Privacy leakage** | `scope`, `claims`, `prompt` visible in URL bar, history, referrer headers | User's permissions exposed |
| **Mobile complexity** | State lost during app switching between browser and app | Authorization fails |

### The Solution: Push Parameters Server-Side

PAR fixes all of this by splitting the authorization request into two steps:

1. **Push** (server-to-server): Send all parameters directly to the authorization server via POST
2. **Redirect** (browser): The browser only sees an opaque `request_uri`

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    subgraph Traditional["Traditional Flow"]
        T1["Client"] -->|"All params in URL"| T2["Browser"]
        T2 -->|"Full URL"| T3["Auth Server"]
    end
    subgraph PAR["PAR Flow"]
        P1["Client"] -->|"All params via POST"| P3["Auth Server"]
        P3 -->|"request_uri"| P1
        P1 -->|"Only request_uri"| P2["Browser"]
        P2 -->|"Opaque ID"| P3
    end
```

### When Should You Use PAR?

| Scenario | Use PAR? | Why |
|----------|:--------:|-----|
| SPA or mobile app | **Always** | PAR + PKCE is the gold standard for public clients |
| FAPI 2.0 deployment | **Required** | FAPI 2.0 Security Profile mandates PAR |
| Large `authorization_details` (RAR) | **Yes** | URLs can't handle large payloads |
| Sensitive claims in request | **Yes** | Keeps them out of the browser URL |
| Any production deployment | **Recommended** | Defense-in-depth against tampering |

---

## Part 2: How PAR Works

### The Two-Step Flow

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client
    participant AuthServer as Auth Server (Express)
    participant Authlete
    participant Browser

    Note over Client,Authlete: Step 1: Push (server-to-server)
    Client->>AuthServer: POST /api/par<br/>parameters: response_type=code&client_id=...&scope=...
    AuthServer->>Authlete: /pushed_auth_req (with client auth)
    Authlete->>Authlete: Validate, authenticate client, store request
    Authlete->>AuthServer: { requestUri, responseContent: "{request_uri, expires_in}" }
    AuthServer->>Client: 201 Created + request_uri

    Note over Client,Browser: Step 2: Redirect (browser)
    Client->>Browser: Redirect to /api/authorization?client_id=...&request_uri=...
    Browser->>AuthServer: GET /api/authorization?client_id=...&request_uri=...
    AuthServer->>Authlete: /auth/authorization (resolve request_uri)
    Authlete->>AuthServer: Login/consent page
    AuthServer->>Browser: Login page
    Browser->>AuthServer: User logs in + consents
    AuthServer->>Browser: Redirect with ?code=...
```

### What Just Happened?

1. **Client** sent the full authorization request (with scopes, redirect URI, PKCE challenge, etc.) directly to the server via POST. The browser never saw these parameters.

2. **Authlete** validated the request, authenticated the client, and stored everything. It returned a short-lived `request_uri` — an opaque identifier.

3. **Client** redirected the browser to the authorization endpoint with just `client_id` and `request_uri`.

4. **Authlete** resolved the `request_uri` internally, retrieved the stored request, and processed it as if it had been sent directly.

5. **User** experienced the normal login → consent → code redirect flow.

The `request_uri` expires after a configurable duration (default: 10 minutes). It can only be used once.

### Why Two Steps?

The separation provides three key benefits:

1. **Integrity** — The `request_uri` is bound to the exact parameters that were pushed. Any tampering requires guessing a cryptographically random identifier.

2. **Auditability** — The client is authenticated at the PAR endpoint before any user interaction, providing a clean audit trail.

3. **Flexibility** — Different components can handle each step. An SPA can call PAR from JavaScript, then open the browser via `window.location.href`.

---

## Part 3: Authlete PAR Configuration

### Service-Level Settings

In the [Authlete Console](https://console.authlete.com/), navigate to **Service Settings → Pushed Authorization Request (PAR)**:

| Setting | Recommended | Why |
|---------|:-----------:|-----|
| **Require PAR** | `false` (use per-client) | Allows gradual rollout — new clients use PAR, legacy clients don't |
| **Request URI Duration** | `600` (10 min) | Long enough for user to complete login, short enough to limit exposure |

### Client-Level Settings

Open **Client Settings → Endpoints → General → Pushed Authorization Request**:

| Setting | Description |
|---------|-------------|
| **Require PAR** | Forces this specific client to use PAR |

Client-level enforcement is useful during phased rollouts.

### Verifying Configuration

```bash
# Check if PAR is enabled
curl http://localhost:3000/api/.well-known/openid-configuration | python3 -m json.tool | grep pushed
```

Expected output includes `"pushed_authorization_request_endpoint"` pointing to the PAR endpoint.

---

## Part 4: Step-by-Step PAR Flow

### Prerequisites

- Authlete service with PAR enabled
- A confidential client with `client_id` and `client_secret`
- Servers running on `http://localhost:3000` and `http://localhost:3001`

### Step 1: Push Authorization Request

```bash
curl -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3001/callback&scope=openid%20profile&state=my_state&code_challenge_method=S256&code_challenge=YOUR_CODE_CHALLENGE",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

**Response (201):**
```json
{
  "expires_in": 600,
  "request_uri": "urn:ietf:params:oauth:request_uri:UymBrux4ZEMrBRKx9UyKyIm98zpX1cHmAPGAGNofmm4"
}
```

### Step 2: Authorize with request_uri

Open in browser:
```
http://localhost:3000/api/authorization?client_id=YOUR_CLIENT_ID&request_uri=urn:ietf:params:oauth:request_uri:...
```

### Step 3: Complete the Flow

After login and consent, you'll be redirected with an authorization code:
```
http://localhost:3001/callback?code=abc123&state=my_state
```

### Step 4: Exchange Code for Tokens

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

### Complete Scripted Flow

```bash
#!/bin/bash
# PAR → Authorize → Code → Token

CID="YOUR_CLIENT_ID"
SEC="YOUR_CLIENT_SECRET"
REDIR="http://localhost:3001/callback"

# 1. Generate PKCE
CODE_VERIFIER=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
STATE=$(openssl rand -hex 16)

# 2. Push to PAR
PAR_RESP=$(curl -s -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d "{
    \"parameters\": \"response_type=code&client_id=${CID}&redirect_uri=${REDIR}&scope=openid%20profile&state=${STATE}&code_challenge_method=S256&code_challenge=${CODE_CHALLENGE}\",
    \"clientId\": \"${CID}\",
    \"clientSecret\": \"${SEC}\"
  }")
REQUEST_URI=$(echo "$PAR_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['request_uri'])")

# 3. Open in browser
echo "http://localhost:3000/api/authorization?client_id=${CID}&request_uri=${REQUEST_URI}"
```

---

## Part 5: Client Authentication at PAR

Authlete applies the same client authentication methods for the PAR endpoint as for the token endpoint.

### Authentication Methods

| Method | How It Works | When to Use |
|--------|-------------|-------------|
| `client_secret_basic` | HTTP Basic auth header | Server-side apps |
| `client_secret_post` | `client_id` + `client_secret` in body | DCR-created clients (default) |
| `private_key_jwt` | Signed JWT assertion | FAPI 2.0, high-security |
| `none` | No authentication | Public clients (must use PKCE) |

### Picking the right channel — this is the #1 cause of a 401 here

**Authlete checks *where* your credentials arrive, not just what they are.** It compares the
channel against the client's registered auth method and rejects a mismatch. So the method you
pick has to match how you send them:

| Client's registered method | Send credentials as | `/api/par` request |
|---|---|---|
| `client_secret_basic` | `Authorization: Basic` header | header + `parameters` in the body |
| `client_secret_post` | `clientId` / `clientSecret` JSON fields | server merges them into `parameters` |
| `none` | `clientId` only | `client_id` inside `parameters` |

Get it wrong and Authlete tells you exactly what happened:

```
401  [A157357] The client identifier is not found at the expected location:
     The 'client_secret_basic' client authentication method is used...
```

### client_secret_basic

Send the credentials in the **`Authorization` header**, not in the JSON body:

```bash
curl -X POST http://localhost:3000/api/par \
  -u "3280859750204:qfd0ScLHhD..." \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "response_type=code&client_id=3280859750204&redirect_uri=http://localhost:3001/callback&scope=openid&state=xyz"
  }'
```

The server decodes the header and hands the credentials to Authlete as its top-level
`clientId` / `clientSecret` fields — the channel Authlete expects for `client_secret_basic`.

> In the SPA, choose **Client Auth Method → `client_secret_basic`** in the PAR section. Putting
> the secret in the JSON body for a `client_secret_basic` client will 401.

### client_secret_post

Here the credentials *do* belong in the JSON body. The server merges them into the pushed
`parameters` string, which is where Authlete looks for a `client_secret_post` client:

```json
{
  "parameters": "response_type=code&client_id=CID...",
  "clientId": "3280859750204",
  "clientSecret": "qfd0ScLHhD..."
}
```

### private_key_jwt (FAPI 2.0)

The client includes a signed JWT assertion in the `parameters` string:

```json
{
  "parameters": "response_type=code&client_id=CID&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer&client_assertion=eyJ...&redirect_uri=...&scope=openid&state=...&code_challenge_method=S256&code_challenge=...",
  "clientId": "YOUR_CLIENT_ID"
}
```

### none (Public Client)

Public clients omit `clientSecret`:

```json
{
  "parameters": "response_type=code&client_id=PUBLIC_CID&redirect_uri=...&scope=openid&state=...&code_challenge_method=S256&code_challenge=...",
  "clientId": "PUBLIC_CID"
}
```

> **Note:** Public clients MUST use PKCE. Authlete enforces this.

---

## Part 6: SPA Testing Tool Walkthrough

The React SPA includes a **PAR** section with a full testing interface.

### Opening the PAR Section

1. Start both servers
2. Open `http://localhost:3001`
3. Click **PAR** in the sidebar (under OIDC & Extensions)

### Testing Scenarios

**Scenario 1: Standard PAR (confidential client + PKCE)**

1. Click **Generate PKCE + State**
2. Enter `Client ID` and `Client Secret`
3. Click **Push Authorization Request** → see `request_uri`
4. Click **Authorize (redirect)** → login → consent → code → tokens

**Scenario 2: PAR with public client**

1. Click **Generate PKCE + State**
2. Enter public `Client ID`, leave Secret empty
3. Click **Push Authorization Request** → succeeds without secret
4. Continue the flow

**Scenario 3: PAR with DPoP**

1. Click **Generate PKCE + State**
2. Enter credentials, check **Use DPoP**
3. Click **Push Authorization Request** → DPoP key generated, proof sent
4. Continue with DPoP-bound tokens

---

## Part 7: Error Scenarios

| HTTP Status | Meaning | Common Causes |
|:-----------:|---------|---------------|
| `400` | Bad request | Missing `response_type`, invalid `redirect_uri`, expired `request_uri` |
| `401` | Client auth failed | Wrong `clientSecret`, unregistered `clientId` |
| `403` | Client not authorized | PAR not enabled for this client |
| `413` | Payload too large | Parameters exceed size limit |
| `500` | Server error | Authlete API failure |

### Common Errors

**"Missing required body field: parameters"**
→ Ensure your JSON body includes `"parameters": "response_type=code&client_id=..."`

**"The redirected URI is not registered"**
→ Use a `redirect_uri` registered in Authlete Console for your client

**"expired_request_uri" at /authorize**
→ The `request_uri` expired. Default lifetime is 10 minutes. Push and redirect within that window.

**401 with correct credentials (DCR clients)**
→ DCR-created confidential clients default to `CLIENT_SECRET_POST`. Send credentials in the body, not as Basic auth.

---

## Part 8: Industry Use Cases

### Open Banking / FAPI

FAPI 2.0 Security Profile **requires** PAR for all authorization requests. Open Banking APIs use PAR with `private_key_jwt` and DPoP to ensure:
- Request integrity (no tampering during browser redirect)
- Strong client authentication (before any user interaction)
- Large payloads (payment consent JWT in `authorization_details`)

### SPAs

SPAs can't keep secrets. PAR adds security:
- Call PAR from JavaScript using `fetch()`
- Browser redirect only contains `client_id` + `request_uri`
- No sensitive parameters in URL bar or history

```javascript
// SPA code
const response = await fetch('/api/par', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parameters: 'response_type=code&client_id=...&scope=openid&code_challenge_method=S256&code_challenge=...',
    clientId: '...',
  }),
});
const { request_uri } = await response.json();
window.location.href = `/api/authorization?client_id=...&request_uri=${request_uri}`;
```

### Mobile Apps

Mobile apps face unique challenges with OAuth. PAR simplifies:
1. App calls PAR while still in the foreground
2. Full request captured server-side
3. App opens browser with just `request_uri`
4. After authorization, browser redirects back with code

No need to encode complex parameters into deep link URLs.

### Backend-for-Frontend (BFF)

In a BFF architecture:
1. Frontend asks BFF to authenticate
2. BFF constructs full request, calls PAR
3. BFF returns `request_uri` to frontend
4. Frontend redirects to `/authorize` with `request_uri`
5. Authorization completes, code redirects to BFF
6. BFF exchanges code for tokens

**Security benefit:** The authorization payload never touches the browser.

---

## Part 9: PAR + DPoP (FAPI 2.0)

In FAPI 2.0, PAR is used with DPoP (RFC 9449) and `private_key_jwt`:

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client
    participant AuthServer as Auth Server
    participant Authlete

    Client->>Client: Generate DPoP key pair + signing key pair
    Client->>Client: Create DPoP proof (signed JWT)
    Client->>AuthServer: POST /api/par + DPoP header + client_assertion
    AuthServer->>Authlete: /pushed_auth_req
    Authlete->>AuthServer: request_uri + DPoP-Nonce
    AuthServer->>Client: 201 + request_uri + DPoP-Nonce

    Client->>Client: Store nonce, create new DPoP proof with nonce
    Client->>AuthServer: GET /authorize?request_uri=...
    AuthServer->>Browser: Login page
    Browser->>AuthServer: Login + consent
    AuthServer->>Browser: Redirect with code
    Browser->>Client: Callback with code

    Client->>Client: Create DPoP proof for token request
    Client->>AuthServer: POST /api/token + code + code_verifier + DPoP
    AuthServer->>Authlete: /auth/token
    Authlete->>AuthServer: Tokens (DPoP-bound)
    AuthServer->>Client: access_token + id_token
```

### DPoP Nonce Handling

- First request without nonce → server returns `DPoP-Nonce` header
- Client stores nonce, includes it in next DPoP proof
- Expired or missing nonce at PAR → server returns **400** `use_dpop_nonce` with a new `DPoP-Nonce`
- SPA stores nonces in `sessionStorage` under `dpop_nonce`

> ### **captured** under a temporary configuration — and **deliberately off here** (DR-20, 2026-08-17)
>
> `dpopNonceRequired` is **`false`** and `dpopNonceDuration` is **`0`** on this deployment, so nothing above is
> reproducible as you find it. That is now a **decision**, not a gap: see
> [`audit/05-decision-records.md` → DR-20](../audit/05-decision-records.md#dr-20--dpop-nonces-dpopnoncerequired).
> The flag has been switched on twice and reverted twice, so **the behaviour itself is captured** — at the token
> endpoint on 2026-08-15 and at **PAR** on 2026-08-17:
>
> | Endpoint | Proof carries | Result |
> |---|---|---|
> | `/api/token` | no `nonce` | **400** `use_dpop_nonce` `[A254307]`, **plus** a `DPoP-Nonce` header |
> | `/api/token` | that nonce | **success** — and a `DPoP-Nonce` again |
> | `/api/token` | a stale/bogus `nonce` | **400** `use_dpop_nonce` — **not** `invalid_dpop_proof` |
> | `/api/par` | no `nonce` | **400** `use_dpop_nonce` **`[A350308]`** + a `DPoP-Nonce` |
> | `/api/par` | that nonce | **201 Created** — **and a `DPoP-Nonce` on the success too**, which is the header the diagram above draws |
> | either | no DPoP header at all | unaffected — the flag gates *proofs*, not requests |
>
> **Four things RFC 9449 does not tell you, and two of them change how you write a client:**
>
> - **The nonce is time-based, not one-time.** Every call returned the *same* `DPoP-Nonce`, including the
>   successful ones — it is valid for `dpopNonceDuration`. So **cache it and reuse it**. A client that treats a
>   repeated nonce as a replay attempt would be wrong.
> - **A nonce comes back on success**, at PAR as well as at the token endpoint — not only on the error that
>   demands one. So the `201 + DPoP-Nonce` shape in the diagram is real.
> - **PAR and the token endpoint use different result codes for one condition** — `A350308` and `A254307`. Match
>   on the `error` code `use_dpop_nonce`, never on the vendor code.
> - **Authlete's message misdirects on first contact**: a proof with *no* `nonce` and one with a *wrong* `nonce`
>   produce the same code and the same text, *"the value of the 'nonce' claim … is different from the expected
>   one"* — describing a mismatch that did not happen. Trust the `error` code, not the prose.
>
> **A retried request is not a lost request.** An authorization code **survives** a `use_dpop_nonce` refusal —
> the refusal happens before the code is redeemed, so the same code replayed with the nonce succeeds. The dance
> costs a round trip, not a re-authorization.
>
> ### The SPA used to break if you turned this on. It no longer does — fixed 2026-08-17
>
> **This box used to say "do not turn this flag on".** It was right at the time, and the reason is worth
> keeping because it is a defect shape rather than a one-off:
>
> ```
> client/src/services/token.service.ts:36   if (!response.ok) throw new Error(...);   ← threw first
> client/src/services/token.service.ts:38   response.headers.get('dpop-nonce')        ← never reached
> ```
>
> The throw sat on the line **before** the header read, so the SPA **discarded the very nonce the server sent
> to make the retry possible** — and `sessionStorage.dpop_nonce` is only ever written from a *success*, which
> could then never happen. Not a failed first request: a failed **every** request, forever.
>
> **`client/src/services/dpop-fetch.ts` now owns every DPoP request.** It captures `DPoP-Nonce` on success
> *and* failure, and retries once with a **re-signed** proof — re-signed because the nonce lives inside the
> signature, so a cached proof string cannot be reused. Verified against the live deployment with the flag
> temporarily on: the old single-shot path gets a 400 and loses the nonce; the new one is refused, re-signs,
> and succeeds on attempt 2, then needs a single attempt once the nonce is cached.
>
> **The flag is still off** — see [DR-20](../audit/05-decision-records.md#dr-20--dpop-nonces-dpopnoncerequired),
> which now rests on nonces being OPTIONAL and the transcripts being banked, rather than on the client being
> unable to cope. If you enable it on a deployment of your own, this SPA will work.
>
> **DPoP itself works without any of this** — nonces are OPTIONAL in RFC 9449, and the flag controls nonce
> *enforcement*, not whether tokens can be sender-constrained. The `DPoP` sender-constraining that *does* work
> here is demonstrated end to end, with captured responses, in
> [`FAPI-TUTORIAL.md` Part 6](FAPI-TUTORIAL.md#part-6-failure-demonstrations).

---

## Part 10: Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| "Missing required body field: parameters" | `parameters` field not in body | Add `"parameters": "response_type=code&client_id=..."` to JSON body |
| "The redirected URI is not registered" | `redirect_uri` not in Authlete Console | Register the redirect URI for your client |
| "unknown_client" | `client_id` not registered | Verify client exists in Authlete Console |
| "expired_request_uri" | `request_uri` expired (default 10 min) | Push and redirect within the window |
| 401 with correct credentials | DCR client defaults to CLIENT_SECRET_POST | Send credentials in body, not Basic auth |
| "PAR is not enabled for this client" | `requirePar` not enabled | Enable in Authlete Console |
| DPoP "invalid_dpop_proof" | Wrong key or wrong claims | Ensure `htm`=`POST`, `htu`=PAR URL, raw R||S signature for ES256 |
| "payload_too_large" | Parameters too large | Reduce `authorization_details` or claims payload |

---

## Summary

PAR is simple but powerful. Instead of stuffing everything into the browser URL:

1. POST all parameters to `/api/par` (server-to-server)
2. Get back an opaque `request_uri`
3. Redirect the browser with just `client_id` + `request_uri`
4. Authlete resolves the `request_uri` internally

**PAR + PKCE = gold standard for public client security.**
**PAR is required for FAPI 2.0.**
**Use PAR for any production deployment.**

---

## References

- [RFC 9126: OAuth 2.0 Pushed Authorization Requests](https://www.rfc-editor.org/rfc/rfc9126.html)
- [Authlete KB: Pushed Authorization Requests](https://www.authlete.com/kb/oauth-and-openid-connect/authorization-requests/pushed-authorization-requests/)
- [FAPI 2.0 Security Profile](https://openid.net/specs/fapi-2_0-security-profile.html)
- [DPoP: RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html)
