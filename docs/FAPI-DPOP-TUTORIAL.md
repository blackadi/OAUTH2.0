# FAPI 2.0 & DPoP Tutorial

- [Quick Start (5-Minute FAPI 2.0 + DPoP)](#quick-start-5-minute-fapi-20--dpop)
- [Part 1: What is FAPI 2.0?](#part-1-what-is-fapi-20)
- [Part 2: Authlete Console Setup](#part-2-authlete-console-setup)
- [Part 3: DPoP Sender-Constrained Tokens](#part-3-dpop-sender-constrained-tokens)
- [Part 4: Step-by-Step FAPI 2.0 Flow](#part-4-step-by-step-fapi-20-flow)
- [Part 5: Client Demo Walkthrough](#part-5-client-demo-walkthrough)
- [Part 6: Troubleshooting](#part-6-troubleshooting)
- [Part 7: Failure Demonstrations](#part-7-failure-demonstrations)
- [Appendix: Server Architecture](#appendix-server-architecture)

## Quick Start (5-Minute FAPI 2.0 + DPoP)

Get a working FAPI 2.0 Security Profile flow end-to-end in 5 minutes.

### 1. Enable FAPI + DPoP in Authlete Console

| Setting | Path in Console |
|---------|----------------|
| FAPI 2.0 Security Profile | **Service Settings → Endpoints → Advanced → FAPI** → check `FAPI2_SECURITY` |
| DPoP Nonce Required | **Service Settings → Tokens and Claims → Advanced → DPoP Token** → set Require Nonce to `true` |
| DPoP Nonce Duration | **Same page** → set to `3600` (1 hour) |

### 2. Create a confidential client

1. **Clients → Create** → Client Type: `Confidential`
2. Token Auth Method: `CLIENT_SECRET_POST` (simplest for testing)
3. Grant Types: `AUTHORIZATION_CODE`, `REFRESH_TOKEN`
4. Redirect URIs: `http://localhost:3001/callback`
5. Enable **PAR (Pushed Authorization Requests)** requirement
6. Save and note the `clientId` and `clientSecret`

### 3. Start the servers

```bash
docker compose up -d redis          # optional, for session storage
npm --prefix server run dev          # Express on :3000
npm --prefix client run dev          # SPA on :3001
```

### 4. Run the wizard

1. Open `http://localhost:3001` → click **FAPI 2.0 & DPoP** in sidebar
2. Scroll to **Test Flow (FAPI 2.0 + DPoP)** card
3. **Step 1**: Enter your `clientId` and `clientSecret`, click **Generate DPoP Key Pair**
4. **Step 2**: Click **Push PAR** → creates a pushed authorization request with DPoP
5. **Step 3**: Click **Open Authorize Page** → log in as `admin` / `password` → consent
6. You'll be redirected to the callback page — tokens are stored automatically
7. Navigate back to the FAPI section
8. **Step 4**: Click **Call Userinfo with DPoP** → fetches userinfo with DPoP-bound token

### 5. Verify it's working

```bash
# Check the FAPI mode
curl http://localhost:3000/api/fapi/config
# Expected: {"mode":"sp","dpopEnabled":true,...}
```

Your `access_token` has `token_type: "DPoP"` and is cryptographically bound to your browser key. See [Part 7](#part-7-failure-demonstrations) to prove that stolen tokens are useless without the private key.

---

## Part 1: What is FAPI 2.0?

**FAPI** (Financial-grade API) is a security profile built on top of OAuth 2.0 and OpenID Connect. It was originally designed for the financial industry but is now widely adopted for any high-security API.

### FAPI 2.0 Security Profile (the default mode)

The **Security Profile** (what we call `"sp"` mode) requires:

| Requirement | Why | FAPI 2.0 SP | FAPI 2.0 MS | FAPI 1.0 Adv |
|-------------|-----|:---:|:---:|:---:|
| **PAR** (RFC 9126) | Prevents auth request tampering | ✅ | ✅ | suggested |
| **PKCE** (RFC 7636) | Prevents code interception | ✅ | ✅ | — |
| **Sender-constrained tokens** (DPoP or mTLS) | Binds token to legitimate holder | ✅ | ✅ | mTLS only |
| **Client auth** (private_key_jwt or tls_client_auth) | Strong client auth | ✅ | ✅ | ✅ |
| **No refresh token rotation** | FAPI 2.0 §5.3.2.1 | ✅ | ✅ | — |
| **`scope` required** | Prevents scope-less tokens | ✅ | ✅ | ✅ |
| **`iss` response param** (RFC 9207) | Mix-up attack prevention | ✅ | ✅ | ✅ |
| **Signed request object** (JAR) | Prevents request tampering | — | ✅ | ✅ |
| **`nbf` claim ≤ 60 min** | Replay prevention for request objects | — | ✅ | ✅ |
| **JARM** (signed auth response) | Prevents response tampering | — | ✅ | ✅ |
| **DPoP** as token binding | Client-held key binding | ✅ | ✅ | — |
| **mTLS** as token binding | Certificate-bound token | ✅ | ✅ | ✅ |

✅ = required by the spec, — = not required, "suggested" = recommended but not mandatory

**Key takeaway:** FAPI 2.0 Security Profile relies on **PAR + PKCE + DPoP** for the authorization channel security. FAPI 1.0 Advanced and FAPI 2.0 Message Signing rely on **signed request objects + `nbf`** instead. If you enable `FAPI2_SECURITY` alone (our default), `nbfOptional: false` and JAR settings are **not** needed — they only matter in Message Signing or FAPI 1.0 modes.

### FAPI 2.0 Message Signing (the "ms" mode)

Adds all of the above, plus:

| Extra Requirement | Why |
|------------------|-----|
| **JARM** (JWT Secured Authorization Response Mode) | Authorization response is a signed JWT, preventing tampering |
| **Signed request objects** with `nbf` claim | Request object must be signed AND have a narrow time window |
| **Introspection response signing** | Token introspection results are signed JWTs |

### How the server determines your FAPI mode

The server calls `authleteApi.service.get()` and inspects the `fapiModes` array:

| `fapiModes` | Mode Shown | PAR Required | Request Object Required | Notes |
|---|---|---|---|---|
| `[]` (empty) | `disabled` | No | No | Standard OAuth/OIDC |
| `["FAPI2_SECURITY"]` | `sp` (Security Profile) | ✅ Implied | No | Uses PAR instead of signed request objects. PKCE + DPoP required. This is the default FAPI 2.0 mode. |
| `["FAPI2_SECURITY", "FAPI2_MESSAGE_SIGNING"]` | `ms` (+ Message Signing) | ✅ | ✅ (signed + `nbf`) | Adds JARM + introspection signing. Requires signed request objects with `nbf` claim. |

You can check the live mode at `GET /api/fapi/config` in the client UI or via curl:

```bash
curl http://localhost:3000/api/fapi/config
```

> **Important:** `FAPI2_SECURITY` and `FAPI1_ADVANCED` are independent profiles. You can enable one, the other, or both. They enforce different requirement sets (see table above). This tutorial focuses on **FAPI 2.0 Security Profile** (`FAPI2_SECURITY`).

---

## Part 2: Authlete Console Setup

All FAPI configuration happens in the [Authlete Console](https://console.authlete.com/), not in code or env vars. The server dynamically reads these settings at runtime.

### Step 1: Enable FAPI profile

1. Log into [Authlete Console](https://console.authlete.com/)
2. Select your Service
3. Go to **Service Settings → Endpoints → Advanced → FAPI**
4. Under **Supported Service Profiles**, check **FAPI 2.0 Modes** and select one of:
   - `FAPI2_SECURITY` — enables the Security Profile only (recommended for most use cases)
   - `FAPI2_SECURITY + FAPI2_MESSAGE_SIGNING_*` — enables Message Signing mode
5. Click **Save**

### Step 2: Required service settings

These are Authlete API property names. They can be set either via the [Authlete Management Console](https://console.authlete.com/) at the paths below, or directly via the `service/update` API endpoint.

| API Property | Recommended | Authlete 3.0 Console Location |
|---|---|---|
| `scopeRequired` | `true` | **Tokens and Claims → Advanced**: *Requests Without Scope Parameter* → Require |
| `claimShortcutRestrictive` | `true` | **Tokens and Claims → Claims**: *Restrict Shortcut* → Enable |
| `refreshTokenKept` | `true` | **Tokens and Claims → Refresh Token**: *Refresh Token Rotation → Enable Token Rotation* → unchecked (disabling rotation keeps old tokens) |
| `refreshTokenIdempotent` | `true` | **Tokens and Claims → Refresh Token**: *Enable Idempotency* → checked |
| `dcrScopeUsedAsRequestable` | `true` | **Endpoints → Advanced → DCR's Scope Parameter**: enable |
| `missingClientIdAllowed` | `false` | **Endpoints → Token**: *Client ID* → Require |
| `issSuppressed` | `false` | **Endpoints → Authorization**: *Issuer Identification Response Parameter* → Include (not Suppress) |
| `idTokenAudType` | `string` | **Tokens and Claims → ID Token**: *Audience Claim Format* → `string` |
| `loopbackRedirectionUriVariable` | `true` | **Endpoints → Authorization**: *Loopback Redirection URI* → Variable |
| `traditionalRequestObjectProcessingApplied` | `false` | **Endpoints → Authorization**: *Request Object Processing* → Enable JAR Compatibility (checked = JAR rules, not traditional). Only needed for FAPI 1.0 or FAPI 2.0 Message Signing mode. |
| `nbfOptional` | `false` | **Endpoints → Authorization**: *nbf Claim* → Require. Only needed for FAPI 1.0 or FAPI 2.0 Message Signing mode. |
| `unauthorizedOnClientConfigSupported` | `true` | **Endpoints → Advanced → Dynamic Client Registration (DCR)**: *Client Configuration Error Behavior* |
| `idTokenReissuable` | `true` | **Tokens and Claims → ID Token**: *Enable Reissuable* → checked |

### Step 3: Create FAPI scopes (FAPI 1.0 only)

For **FAPI 1.0 Baseline/Advanced**, each scope that triggers FAPI validation must have an attribute key `fapi` with value `rw`. This is done in the service console under **Scopes → Create → Attributes**.

For **FAPI 2.0**, FAPI validation is applied globally via the `fapiModes` property — no scope-level attribute is needed.

| FAPI Version | How FAPI is triggered |
|--------------|----------------------|
| 1.0 | Per-scope: add attribute `fapi: rw` to scopes like `payment`, `accounts` |
| 2.0 | Global: set `fapiModes` to `["FAPI2_SECURITY"]` at the service level |

### Step 4: Register a confidential client

1. Go to **Clients → Create**
2. Set **Client Type** to `Confidential`
3. Set **Token Auth Method** — FAPI 2.0 Security Profile requires `PRIVATE_KEY_JWT` or `TLS_CLIENT_AUTH`. However, DCR-created clients default to `CLIENT_SECRET_POST` if no method is explicitly set. For testing with this server, any of these work:
   - `CLIENT_SECRET_POST` (simplest — send `client_id` + `client_secret` in body)
   - `CLIENT_SECRET_BASIC` (send as `Authorization: Basic`)
   - `PRIVATE_KEY_JWT` (FAPI 2.0 spec-compliant)
4. Set **Grant Types** to at minimum: `AUTHORIZATION_CODE`, `REFRESH_TOKEN`
5. Set **Redirect URIs** to your application's callback URL
6. Upload or paste the client's JWK Set (public keys) if using `PRIVATE_KEY_JWT`
7. Enable **PAR (Pushed Authorization Requests)** requirement
8. Click **Save**

### Step 5: Configure DPoP (next section)

See [Part 3](#step-2-enable-dpop-in-authlete-console) for the DPoP-specific settings.

---

## Part 3: DPoP Sender-Constrained Tokens

**DPoP** (Demonstration of Proof-of-Possession, RFC 9449) binds an access token to a client's public key. If a token is stolen, the thief cannot use it because they don't have the private key.

### How DPoP works

```
Client                           Server
  │                                │
  │── 1. Create key pair ─────────→│ (stored in browser)
  │                                │
  │── 2. Token request + DPoP ───→│  Authlete validates DPoP
  │    proof (signed with          │  and issues DPoP-bound token.
  │    private key)                │  May return `DPoP-Nonce` on
  │                                │  success or require nonce
  │←── 3. Access token ───────────│  via `use_dpop_nonce` error
  │    (token_type: DPoP)          │  (see nonce flow below)
  │                                │
  │── 4. API call + new DPoP ────→│  Resource server validates
  │    proof (includes `ath`)      │  DPoP proof against the token
  │                                │
  │←── 5. Protected resource ─────│
```

### DPoP Proof JWT Structure

**Header:** Per RFC 9449 §2.1, the JWS header MUST contain the `jwk` member with the public key. The `kid` is optional.

```json
// JWT Header
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": {
    "kty": "EC",
    "crv": "P-256",
    "x": "base64url-encoded-x-coordinate",
    "y": "base64url-encoded-y-coordinate"
  }
}

// JWT Payload
{
  "iat": 1700000000,       // issued at (required)
  "jti": "uuid-here",      // unique JWT ID (required, prevents replay)
  "htm": "POST",           // HTTP method (required)
  "htu": "http://localhost:3000/api/token",  // HTTP URI (required)
  "ath": "base64url-sha256-of-access-token", // access token hash (optional, for token-bound proofs)
  "nonce": "server-nonce"  // nonce from server (optional, for replay prevention)
}
```

**Signature format:** For ES256, the JWS signature value is the raw IEEE P1363 R||S concatenation (64 bytes), **not** DER-encoded. This is critical — using DER encoding will produce `"invalid_dpop_proof: Signed JWT rejected: Invalid signature"` from Authlete.

### DPoP Nonce Flow

Nonces are **optional** — controlled by `dpopNonceRequired` (service-level) and `dpopNonceDuration`.

**When nonce is required** (`dpopNonceRequired: true`):
1. First request without `nonce` in the DPoP proof → server returns `401` with `WWW-Authenticate: DPoP error="use_dpop_nonce"` and a `DPoP-Nonce` header
2. Client retries with the nonce in the proof → request succeeds; the server **may** return a new nonce on success
3. Nonce expires → server returns `401` with `invalid_dpop_proof` and a new `DPoP-Nonce`

**When nonce is not required** (`dpopNonceRequired: false`):
- Requests succeed without a nonce; the server still **may** return a `DPoP-Nonce` on success responses (particularly from `POST /api/token` and `POST /api/par`)

**Token / PAR endpoints** (authorization server endpoints via Authlete API):
- Can return `DPoP-Nonce` on success (the Authlete API response includes `dpopNonce`)

**Protected resource endpoints** (userinfo, introspection):
- Typically return nonce only on error responses per RFC 9449

The client should store the most recent nonce from any endpoint and include it in subsequent DPoP proofs.

### Step 1: DPoP key pair generation (client-side)

The client generates an ES256 (ECDSA P-256) key pair using the Web Crypto API:

```typescript
// client/src/services/dpop.service.ts
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
```

The private key never leaves the browser. The public key is sent to Authlete as a JWK during the token request.

### Step 2: Enable DPoP in Authlete Console

1. In Authlete Console, go to **Service Settings → Tokens and Claims → Advanced → DPoP Token**
2. Set **Require Nonce** (DPoP Nonce Required) to `true` — this also makes the server report `dpopEnabled: true`
3. Set **Nonce Duration** (e.g., `3600` = 1 hour)
4. Click **Save**

### Step 3: Client DPoP proof creation

```typescript
// Full DPoP proof creation
const proof = await createProof(
  privateKeyJwk,    // the generated EC private key
  "POST",           // http method (htm)
  "http://localhost:3000/api/token",  // target URI (htu)
  athValue,         // access token hash (ath claim, optional)
  serverNonce,      // nonce from server's DPoP-Nonce header (optional)
);
```

Send the proof as the `DPoP` HTTP header:

```http
DPoP: eyJ0eXAiOiJkb3Arand0IiwiYWxnIjoiRVMyNTYiLCJraWQiOiJLUk45Rmx4...
```

### Step 4: Server DPoP forwarding

The server extracts `dpop`, `htm`, and `htu` from **HTTP headers only** (never from the request body — this is a security principle) and forwards them to Authlete:

```typescript
// Example from token.service.ts
const dpopHeader = req.headers["dpop"];
if (dpopHeader) {
  reqBody.dpop = dpopHeader;
  reqBody.htm = req.method;           // from the actual HTTP method
  reqBody.htu = `${protocol}://${host}${req.originalUrl}`;  // from the actual URL
}
```

This happens in:
- `token.service.ts:73-81`
- `introspection.service.ts:56-64`
- `userinfo.service.ts:24-32`
- `par.service.ts:29-37`

### Step 5: DPoP-Nonce response header

Each controller calls `setDpopNonce()` to relay Authlete's nonce back to the client:

```typescript
// dpop.ts helper
export function setDpopNonce(res: Response, dpopNonce?: string): void {
  if (dpopNonce) {
    res.setHeader("DPoP-Nonce", dpopNonce);
  }
}
```

---

## Part 4: Step-by-Step FAPI 2.0 Flow

This section walks through a complete FAPI 2.0 authorization code flow with DPoP.

### Prerequisites

1. Authlete service configured with FAPI 2.0 Security Profile (see Part 2)
2. DPoP enabled in Authlete Console (see Part 3 Step 2)
3. A confidential client with `clientId`, `clientSecret`, and private key

### Step 1: Client generates DPoP key pair

```javascript
const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();
// Store privateKeyJwk securely in sessionStorage
```

### Step 2: Client creates DPoP proof for PAR

```javascript
const parProof = await createProof(
  privateKeyJwk,
  "POST",
  "http://localhost:3000/api/par",
  undefined,  // no ath yet — no access token
  undefined,  // no nonce yet — first request
);
```

### Step 3: Push authorization request (PAR)

```http
POST /api/par HTTP/1.1
Content-Type: application/json
DPoP: <parProof>

{
  "parameters": "response_type=code&client_id=<clientId>&redirect_uri=<redirectUri>&scope=openid%20accounts&code_challenge=<pkceChallenge>&code_challenge_method=S256",
  "clientId": "<clientId>",
  "clientSecret": "<clientSecret>"
}
```

Possible responses:

**Success (nonce not required, or nonce valid):**
```http
HTTP/1.1 201 Created
DPoP-Nonce: <serverNonce>

{
  "requestUri": "urn:ietf:params:oauth:request_uri:<id>",
  "expires_in": 90
}
```

**Nonce required but missing (dpopNonceRequired: true):**
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: DPoP error="use_dpop_nonce"
DPoP-Nonce: <newNonce>
```

If you receive the `use_dpop_nonce` error, retry the PAR request with the nonce included in the DPoP proof's `nonce` claim.

### Step 4: User authorizes (browser flow)

Redirect the user to:

```
GET /api/authorize?client_id=<clientId>&request_uri=urn:ietf:params:oauth:request_uri:<id>
```

The server shows login → consent → redirects back with authorization code.

### Step 5: Exchange code for token (with DPoP)

Create a new DPoP proof for the token endpoint (include the nonce from Step 3):

```javascript
const tokenProof = await createProof(
  privateKeyJwk,
  "POST",
  "http://localhost:3000/api/token",
  undefined,  // still no ath yet
  serverNonce, // nonce from PAR response
);
```

```http
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
DPoP: <tokenProof>

grant_type=authorization_code&code=<authCode>&redirect_uri=<redirectUri>&code_verifier=<pkceVerifier>&client_id=<clientId>&client_secret=<clientSecret>
```

> **Note:** DCR-created confidential clients default to `CLIENT_SECRET_POST` authentication (even if the service lists only `CLIENT_SECRET_BASIC` in `supportedTokenAuthMethods`). Send `client_id` and `client_secret` in the URL-encoded body, **not** as `Authorization: Basic`. Using Basic auth with such clients produces `invalid_client — The client authentication method is 'client_secret_post' but the request does not include a client secret.`

Response:

```http
HTTP/1.1 200 OK
DPoP-Nonce: <newNonce>
Cache-Control: no-store

{
  "access_token": "DPoP-bound-token",
  "token_type": "DPoP",
  "expires_in": 3600,
  "refresh_token": "refresh-token",
  "scope": "openid accounts"
}
```

### Step 6: Call userinfo (with DPoP proof + ath)

Compute the `ath` (access token hash):

```javascript
const ath = await computeAth(accessToken);
// returns base64url-encoded SHA-256 hash of the access token
```

Create a new DPoP proof bound to this access token:

```javascript
const userinfoProof = await createProof(
  privateKeyJwk,
  "POST",
  "http://localhost:3000/api/userinfo",
  ath,        // bind to this access token
  newNonce,   // nonce from token response
);
```

```http
POST /api/userinfo HTTP/1.1
Authorization: Bearer <accessToken>
DPoP: <userinfoProof>
```

### Step 7: Refresh token (with DPoP)

```javascript
const refreshProof = await createProof(
  privateKeyJwk,
  "POST",
  "http://localhost:3000/api/token",
  ath,        // bind to the access token being refreshed
  latestNonce,
);
```

```http
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
DPoP: <refreshProof>

grant_type=refresh_token&refresh_token=<refreshToken>&scope=openid&client_id=<clientId>&client_secret=<clientSecret>
```

> **Client auth:** DCR-created confidential clients use `CLIENT_SECRET_POST` by default, so `client_id` and `client_secret` go in the body. If your client is configured for `CLIENT_SECRET_BASIC`, use `Authorization: Basic` instead. For `PRIVATE_KEY_JWT` clients, include `client_assertion_type` and `client_assertion` in the body.

---

## Part 5: Client Demo Walkthrough

The React SPA includes a **FAPI 2.0 & DPoP** section that lets you explore the configuration and generate DPoP proofs interactively.

### Opening the FAPI section

1. Start both servers: `npm --prefix server run dev` + `npm --prefix client run dev`
2. Open `http://localhost:3001`
3. Click **FAPI 2.0 & DPoP** in the sidebar

### Using the FAPI tools

**1. Fetch Config** — Shows the live FAPI mode and DPoP status:
- `mode`: `"sp"` (Security Profile), `"ms"` (+ Message Signing), or `"disabled"`
- `dpopEnabled`: whether DPoP nonce is required
- `parRequired`, `pkceRequired`, `scopeRequired`: enforced requirements
- `requiredClientAuth`: depends on your service/client config (e.g. `"PRIVATE_KEY_JWT"`, `"CLIENT_SECRET_POST"`)

**2. Fetch Status** — Shows raw Authlete service configuration:
- `issuer`, `fapiModes` (array), `dpopNonceRequired`, `dpopNonceDuration`
- All Authlete flags (`scopeRequired`, `refreshTokenKept`, etc.)

**3. DPoP Key Utilities**:

```
┌──────────────────────────────────────────────┐
│  [Generate DPoP Key Pair (ES256)]             │
│                                              │
│  Public Key (JWK):    │  Private Key (redacted): │
│  { "kty": "EC", ... } │  { "d": "***present***" }│
│                                              │
│  ── DPoP Proof Builder ──                    │
│  HTTP Method:  [POST    ]                     │
│  HTTP URI:     [http://localhost:3000/api/...]│
│  ath:          [base64url SHA-256 hash of AT] │
│  Nonce:        [server DPoP-Nonce          ] │
│                                              │
│  [Compute ath from Token]  [Create DPoP Proof]│
│                                              │
│  DPoP Proof JWT:                              │
│  ┌──────────────────────────────────────────┐ │
│  │ eyJ0eXAiOiJ...                           │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**Step-by-step demo:**

1. Click **Generate DPoP Key Pair** — creates a fresh ES256 key pair
2. Set **HTTP Method** to the method of your target endpoint
3. Set **HTTP URI** to the full URL (e.g., `http://localhost:3000/api/token`)
4. If you have a token stored, click **Compute ath from Token** to auto-fill the `ath`
5. If you received a DPoP-Nonce from the server, enter it in the **Nonce** field
6. Click **Create DPoP Proof JWT** — the proof JWT appears in the textarea below
7. Copy the proof and use it as the `DPoP` HTTP header in your API call

### Testing the full flow

1. Go to **OAuth 2.0 → Grant Flows** section
2. Use the **Authorization Code** flow with PKCE to get a token
3. Copy the access token
4. Switch to **FAPI 2.0 & DPoP** section
5. Generate a key pair
6. Click **Compute ath from Token** (uses the stored token from step 2)
7. Create a proof for the userinfo endpoint
8. Go to **OIDC & Extensions → Userinfo** section
9. Add the `DPoP` header with your proof JWT
10. Click **Fetch Userinfo**

---

## Part 6: Troubleshooting

### "FAPI mode shows disabled"

**Cause:** Authlete service does not have FAPI enabled.
**Fix:** Go to Authlete Console → **Service Settings → Endpoints → Advanced → FAPI** → enable `FAPI2_SECURITY`.

### "dpopEnabled is false"

**Cause:** Authlete service has `dpopNonceRequired` set to `false`.
**Fix:** Go to Authlete Console → **Service Settings → Tokens and Claims → Advanced → DPoP Token** → set **Require Nonce** to `true`.

### "Invalid DPoP proof" errors

**Common causes:**
- `htm` does not match the HTTP method used
- `htu` does not match the actual URL (including path)
- `ath` is wrong or missing when the token endpoint requires it
- `nonce` is wrong or missing
- DPoP key does not match the key used in the token request

**Verify your proof:**
1. Decode the JWT at [jwt.io](https://jwt.io/)
2. Check that `htm` matches the HTTP method
3. Check that `htu` matches the full URL (protocol + host + path)
4. Check that `iat` is recent (within the allowed clock skew)
5. If using DPoP with an access token, verify `ath` is the base64url SHA-256 hash of the token

### 401 Unauthorized on token endpoint

**Possible causes:**
- Client authentication failed (wrong `clientId`/`clientSecret`)
- DPoP proof is malformed
- The `clientId` in the DPoP proof doesn't match the client

### "Not a DPoP bearer token" error

**Cause:** The access token was issued without DPoP binding (token_type = "Bearer"), but you're sending a DPoP proof.
**Fix:** Ensure the token endpoint receives a valid DPoP proof during the initial token request. Check that:
- `DPoP` header is present in the token request
- The proof is correctly signed
- Authlete's DPoP settings are enabled

### "DPoP-Nonce not returned"

**Cause 1:** DPoP is not enabled in Authlete Console.
**Fix:** Enable `dpopNonceRequired` in Authlete Console.

**Cause 2:** Authlete did not issue a nonce because the previous one is still valid.
**Note:** Nonces are not returned on every response. When `dpopNonceRequired` is `true`, the first request without a nonce returns a 401 with `use_dpop_nonce` + new nonce. On subsequent requests with a valid nonce, the server may or may not return a new nonce. If you don't get a nonce, reuse the last known one.

---

## Part 7: Failure Demonstrations

This section proves that DPoP sender-constrained tokens actually prevent token theft. Each demo requires a working DPoP-bound access token (get one from the [Quick Start](#quick-start-5-minute-fapi-20--dpop) or the [Test Flow wizard](#part-5-client-demo-walkthrough) in the SPA).

### Demo 1: Stolen token without a DPoP proof

A thief who steals the `access_token` value cannot use it without a DPoP proof:

```bash
# Replace <YOUR_ACCESS_TOKEN> with the DPoP-bound token from the wizard
curl -v -X POST http://localhost:3000/api/userinfo \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

Expected response:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="The access token is bound to a DPoP key but the request does not include a DPoP proof."
```

The server (via Authlete) detects that the token was issued with `token_type: DPoP` and requires a valid DPoP proof. A bare Bearer token is rejected.

### Demo 2: Stolen token with a different DPoP key

A thief who steals the token AND generates their own key pair still cannot use it:

```bash
# 1. Generate a DIFFERENT key pair from the one used during the flow
node -e "
const crypto = require('crypto');
const { subtle } = crypto;
(async () => {
  const kp = await subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify']);
  const pub = await subtle.exportKey('jwk', kp.publicKey);
  const priv = await subtle.exportKey('jwk', kp.privateKey);
  console.log(JSON.stringify({publicKeyJwk: pub, privateKeyJwk: priv}, null, 2));
})();
"
```

Save the output as `thief-keys.json`, then create a DPoP proof with the thief's key:

```bash
# 2. Create a DPoP proof signed with the thief's private key
#    (Replace <YOUR_ACCESS_TOKEN>, <THIEF_PRIVATE_KEY_JWK>, <ATH_VALUE>)
```

Send it:
```bash
curl -v -X POST http://localhost:3000/api/userinfo \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "DPoP: <THIEF_DPOP_PROOF>"
```

Expected response:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: error="invalid_dpop_proof"
```

Authlete validates that the public key in the DPoP proof's `jwk` header matches the key that was used when the token was issued. Since the thief used a different key, the proof is rejected.

### Demo 3: Bearer token sent as DPoP (wrong header)

A token issued without DPoP binding (old-style Bearer token) cannot be used with a DPoP proof:

```bash
# Get a Bearer token via the standard auth code flow (no DPoP)
# then try to use it with a DPoP proof
curl -v -X POST http://localhost:3000/api/userinfo \
  -H "Authorization: Bearer <BEARER_TOKEN>" \
  -H "DPoP: <SOME_DPOP_PROOF>"
```

Expected response:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="Not a DPoP bearer token."
```

### What this proves

| Attack Scenario | Protected By | Result |
|----------------|-------------|--------|
| Token stolen from browser storage | DPoP binding requires private key | ❌ Fails (Demo 1) |
| Token + attacker's own key pair | Public key in `jwk` header must match | ❌ Fails (Demo 2) |
| Bearer token used with DPoP header | Server checks token_type before DPoP validation | ❌ Fails (Demo 3) |

Without DPoP, a stolen Bearer token can be used from anywhere by anyone. With DPoP, the token is cryptographically bound to the original client's private key — which never leaves the browser.

---

## Appendix: Server Architecture

### Files involved in FAPI/DPoP

| File | Role |
|------|------|
| `src/controllers/fapi.controller.ts` | FAPI config/status endpoints — calls `authleteApi.service.get()` |
| `src/utils/dpop.ts` | `setDpopNonce()` helper |
| `src/services/token.service.ts:73-81` | Forwards DPoP headers to Authlete token API |
| `src/services/introspection.service.ts:56-64` | Forwards DPoP headers to Authlete introspection API |
| `src/services/userinfo.service.ts:24-32` | Forwards DPoP headers to Authlete userinfo API |
| `src/services/par.service.ts:29-37` | Forwards DPoP headers to Authlete PAR API |
| `src/controllers/token.controller.ts:57` | Sets `DPoP-Nonce` response header |
| `src/controllers/introspection.controller.ts:26` | Sets `DPoP-Nonce` response header |
| `src/controllers/userinfo.controller.ts:18` | Sets `DPoP-Nonce` response header |
| `src/controllers/par.controller.ts:29` | Sets `DPoP-Nonce` response header |
| `src/routes/fapi.routes.ts` | Route definitions (`GET /fapi/config`, `GET /fapi/status`) |
| `client/src/services/dpop.service.ts` | Client-side DPoP key generation and proof creation |
| `client/src/services/fapi.service.ts` | Client-side FAPI config/status fetcher |
| `client/src/components/fapi/FapiSection.tsx` | FAPI demo UI component |

### Data flow diagram

```
┌──────────┐    PAR + DPoP proof     ┌──────────────┐
│          │ ────────────────────────→│              │
│  Client  │                          │  Express     │
│  (React  │   DPoP-Nonce header      │  Server      │
│   SPA)   │ ←────────────────────────│              │
│          │                          │  Authlete    │
│          │   Token req + DPoP proof │  SDK         │
│          │ ────────────────────────→│              │
│          │                          │              │
│          │   DPoP-Nonce + AT        │   Authlete   │
│          │ ←────────────────────────│   Cloud API  │
│          │                          │              │
│          │   API call + DPoP proof  │              │
│          │   (with ath + nonce)     │              │
│          │ ────────────────────────→│              │
│          │                          │              │
│          │   Protected data         │              │
│          │ ←────────────────────────│              │
└──────────┘                          └──────────────┘
```

### Security principle: headers vs body

DPoP fields (`dpop`, `htm`, `htu`) are **always extracted from HTTP headers**, never from the request body. This prevents a compromised or confused client from overriding the DPoP binding that the server determines from the actual HTTP context. Every service follows this pattern:

```typescript
// CORRECT — from HTTP headers
const dpopHeader = req.headers["dpop"];
if (dpopHeader) {
  reqBody.dpop = dpopHeader;
  reqBody.htm = req.method;                    // actual HTTP method
  reqBody.htu = `${protocol}://${host}${path}`; // actual request URL
}
```
