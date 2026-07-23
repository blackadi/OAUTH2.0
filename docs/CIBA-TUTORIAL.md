# CIBA (Client-Initiated Backchannel Authentication) Tutorial

- [Quick Start (5-Minute CIBA + POLL Mode)](#quick-start-5-minute-ciba--poll-mode)
- [Part 1: What is CIBA?](#part-1-what-is-ciba)
- [Part 2: Authlete Console Setup](#part-2-authlete-console-setup)
- [Part 3: CIBA Delivery Modes](#part-3-ciba-delivery-modes)
- [Part 4: Step-by-Step CIBA Flow](#part-4-step-by-step-ciba-flow)
- [Part 5: Client Demo Walkthrough](#part-5-client-demo-walkthrough)
- [Part 6: Troubleshooting](#part-6-troubleshooting)
- [Part 7: Failure Demonstrations](#part-7-failure-demonstrations)
- [Appendix: Server Architecture](#appendix-server-architecture)

## Quick Start (5-Minute CIBA + POLL Mode)

Get a working CIBA POLL mode flow end-to-end in 5 minutes.

### 1. Enable CIBA in Authlete Console

| Setting | Path in Console |
|---------|----------------|
| Supported Backchannel Token Delivery Modes | **Service Settings → Endpoints → CIBA** → check `POLL`, `PING`, `PUSH` |
| Backchannel Authentication Endpoint | **Same page** → set to `http://localhost:3000/api/ciba/authentication` |
| Auth Req ID Duration | **Same page** → set to `600` (10 minutes) |
| Polling Interval | **Same page** → set to `5` (seconds) |

### 2. Create a confidential client

1. **Clients → Create** → Client Type: `Confidential`
2. Token Auth Method: `CLIENT_SECRET_POST` (simplest for testing)
3. Grant Types: `AUTHORIZATION_CODE`, `REFRESH_TOKEN`
4. CIBA tab → Token Delivery Mode: `POLL`
5. CIBA tab → User Code Required: `Not Required` (simplest for testing)
6. Save and note the `clientId` and `clientSecret`

### 3. Start the servers

```bash
docker compose up -d redis          # optional, for session storage
npm --prefix server run dev          # Express on :3000
npm --prefix client run dev          # SPA on :3001
```

### 4. Run the CIBA flow in the SPA

1. Open `http://localhost:3001` → click **CIBA** in the sidebar (under OIDC & Extensions)
2. **Authentication tab**: Enter:
   - Parameters: `login_hint=admin&scope=openid`
   - Client ID: your `clientId`
   - Client Secret: your `clientSecret`
3. Click **Run** → you should get `action: USER_IDENTIFICATION` with a `ticket`
4. The ticket is auto-filled into the Issue, Fail, and Complete tabs
5. **Issue tab**: Click **Run** → returns `authReqId`, `expiresIn`, `interval`
   - The `authReqId` is auto-filled into the **Poll Token** tab
6. **Complete tab**: Click **Run** (defaults: `AUTHORIZED`, subject `admin`)
   - Returns `NO_ACTION` (expected for POLL mode — tokens are now available for polling)
7. **Poll Token tab**: Click **Poll Token** → returns `access_token`, `id_token`, etc.
   - If you see `authorization_pending`, wait the interval and retry

### 5. Verify it's working

```bash
# Check the CIBA server config
curl http://localhost:3000/api/fapi/status | python3 -m json.tool | grep -E "backchannel|bc_"
# Expected: backchannelAuthenticationEndpoint set, supportedBackchannelTokenDeliveryModes includes POLL
```

---

## Part 1: What is CIBA?

**CIBA** (Client-Initiated Backchannel Authentication) is an OpenID Connect extension (CIBA Core 1.0) that defines a **decoupled authentication flow**. Unlike the traditional OAuth/OIDC flows where the user is redirected through a browser (redirect flow), CIBA allows the client application to directly communicate with the authorization server via a **backchannel** (server-to-server) — the user authenticates on a separate device.

### Key Concept: Decoupled Flow

```
Traditional (Redirect Flow):
  Browser ──→ Authorization Server ←── Client
  (user sees login page)                  │
                                          └── redirects browser

CIBA (Decoupled Flow):
  Consumption Device ──→ Authorization Server ←── Authentication Device
  (client app, no          │                       (user's phone,
   browser redirect)       │                        authenticates here)
                           └── server-to-server
                                (backchannel)
```

### Real-World Use Cases

| Use Case | How CIBA Helps |
|----------|---------------|
| **Call center authentication** | Operator initiates auth on desktop; user approves on phone |
| **Smart TV login** | TV shows a code; user authenticates on phone and enters the code |
| **CIBA Pay** | POS terminal shows binding message; user confirms payment on phone |
| **IoT device authorization** | Device requests access; owner approves via mobile app |
| **Banking "approve transaction"** | ATM/terminal initiates; user approves on banking app |

### Why CIBA?

- **No browser redirect** — the client app doesn't need a browser or redirect URI
- **Decoupled devices** — consumption device and authentication device can be physically separate
- **Better UX** — user authenticates on their familiar device (phone) instead of a shared terminal
- **Higher security** — authentication on a trusted personal device reduces phishing risk
- **Client always confidential** — CIBA only works with confidential clients (public clients not allowed)

### Three Delivery Modes

CIBA defines three ways tokens are delivered after authentication:

| Mode | Client Polls? | Server Pushes? | Use Case |
|------|:---:|:---:|---------|
| **POLL** | Yes (client polls token endpoint) | No | Simplest; no notification endpoint needed |
| **PING** | Yes (client polls after notification) | Yes (ping to notification endpoint) | Reduces polling; needs notification endpoint |
| **PUSH** | No | Yes (tokens pushed to notification endpoint) | Lowest latency; needs notification endpoint |

See [Part 3](#part-3-ciba-delivery-modes) for detailed comparisons.

---

## Part 2: Authlete Console Setup

All CIBA configuration happens in the [Authlete Console](https://console.authlete.com/), not in code or env vars.

### Step 1: Enable CIBA at the service level

1. Log into [Authlete Console](https://console.authlete.com/)
2. Select your Service
3. Go to **Service Settings → Endpoints → CIBA**
4. Set the following:

| Setting | Recommended Value | Description |
|---------|------------------|-------------|
| Supported Backchannel Token Delivery Modes | `POLL`, `PING`, `PUSH` | At least `POLL` for testing |
| Backchannel Authentication Endpoint | `http://localhost:3000/api/ciba/authentication` | Must match this server's route |
| Backchannel Auth Req ID Duration | `600` | How long `auth_req_id` is valid (seconds) |
| Backchannel Polling Interval | `5` | Minimum interval between polls (seconds) |
| Backchannel User Code Parameter | `Supported` | Enable `user_code` support (optional but useful) |

5. Click **Save**

### Step 2: Create or configure a client for CIBA

1. Go to **Clients → Create** (or edit an existing client)
2. **Basic tab**:
   - Client Type: `Confidential` (required — CIBA does not allow public clients)
   - Token Auth Method: `CLIENT_SECRET_POST` (simplest for testing)
3. **Grant Types**: at minimum, the ones you need. CIBA uses `urn:openid:params:grant-type:ciba` which is always enabled.
4. **CIBA tab**:

| Setting | Recommended | Description |
|---------|-------------|-------------|
| Token Delivery Mode | `POLL` | Choose the mode you want to test |
| Notification Endpoint | `https://your-app.com/notification` | Required for PING/PUSH only |
| Notification Token | (auto-generated) | Bearer token sent with notifications |
| User Code Required | `Not Required` | Set to `Required` if you want to test `user_code` |
| Requested Expiry (seconds) | (optional) | Override the service's default `auth_req_id` duration |

5. If testing PING or PUSH mode, you must set up a **Notification Endpoint** that can receive POST requests from the authorization server.

### Step 3: Verify configuration

Use the server's FAPI status endpoint to check the live configuration:

```bash
curl http://localhost:3000/api/fapi/status | python3 -m json.tool | grep -i backchannel
```

Expected output includes:
- `backchannelAuthenticationEndpoint: "http://localhost:3000/api/ciba/authentication"`
- `supportedBackchannelTokenDeliveryModes: ["POLL", ...]`
- `backchannelAuthReqIdDuration: 600`
- `backchannelPollingInterval: 5`

### Step 4: Using the enable_ciba.ts helper

The repo includes a helper script that configures CIBA on your Authlete service via the API:

```bash
# Set env vars first
export AUTHLETE_BEARER_TOKEN=your_token
export AUTHLETE_BASE_URL=https://api.authlete.com
export AUTHLETE_SERVICE_ID=your_service_id
export BASE_URL=http://localhost:3000

# Run the helper
npx ts-node tests/e2e/enable_ciba.ts
```

This script:
1. Reads the current service configuration
2. Sets `backchannelAuthenticationEndpoint`, `supportedBackchannelTokenDeliveryModes: ["POLL"]`, `backchannelAuthReqIdDuration: 600`, `backchannelPollingInterval: 5`
3. Verifies the changes are applied

> **Important:** If your test also sets other service properties (like `supportedScopes`, `jwks`), you must send all desired properties in a single `service/update` call. Subsequent `PUT` calls overwrite previous fields.

---

## Part 3: CIBA Delivery Modes

CIBA defines three distinct modes for delivering tokens after the end-user authenticates on their device.

### POLL Mode (Simplest)

In POLL mode, the client periodically polls the token endpoint until tokens are available.

```
Client (CD)          Auth Server            Auth Device
    │                     │                      │
    │── Auth Request ────→│ (backchannel)         │
    │←─ auth_req_id ─────│                      │
    │                     │── Authenticate ─────→│
    │                     │←──── Approve ────────│
    │── Token Poll ──────→│ (grant_type=ciba)     │
    │── Token Poll ──────→│                      │
    │←── tokens ─────────│                      │
```

**Key characteristics:**
- Client **does not** need a notification endpoint
- Client polls the token endpoint at the `interval` specified in the auth response
- Poll returns `authorization_pending` until authentication is complete
- Simplest to implement — no server-side push infrastructure needed

**Request/Response:**

```http
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

grant_type=urn:openid:params:grant-type:ciba&auth_req_id=<auth_req_id>
```

While pending:
```json
HTTP/1.1 400 Bad Request
{"error": "authorization_pending", "error_description": "...", "interval": 5}
```

On success:
```json
HTTP/1.1 200 OK
{"access_token": "...", "token_type": "Bearer", "id_token": "...", "expires_in": 3600}
```

### PING Mode

In PING mode, the server sends a lightweight notification (ping) to the client's notification endpoint when authentication is complete. The client then polls the token endpoint.

```
Client (CD)          Auth Server            Auth Device
    │                     │                      │
    │── Auth Request ────→│ (backchannel)         │
    │←─ auth_req_id ─────│                      │
    │                     │── Authenticate ─────→│
    │                     │←──── Approve ────────│
    │←── PING ───────────│ (notification)        │
    │── Token Poll ──────→│ (grant_type=ciba)     │
    │←── tokens ─────────│                      │
```

**Key characteristics:**
- Client **must** have a notification endpoint (`client_notification_endpoint`)
- Client **must** provide a `client_notification_token` in the auth request
- Notification contains only `auth_req_id` (lightweight)
- Client polls token endpoint only after receiving the ping

### PUSH Mode

In PUSH mode, the server pushes the tokens directly to the client's notification endpoint.

```
Client (CD)          Auth Server            Auth Device
    │                     │                      │
    │── Auth Request ────→│ (backchannel)         │
    │←─ auth_req_id ─────│                      │
    │                     │── Authenticate ─────→│
    │                     │←──── Approve ────────│
    │←── tokens ─────────│ (push notification)   │
```

**Key characteristics:**
- Client **must** have a notification endpoint
- Client **must** provide a `client_notification_token`
- Tokens are **pushed directly** — no polling needed
- Lowest latency but requires more infrastructure
- ID token includes `urn:openid:params:jwt:claim:auth_req_id` claim

### Mode Comparison

| Feature | POLL | PING | PUSH |
|---------|:---:|:----:|:----:|
| Notification endpoint needed | No | Yes | Yes |
| Client polls token endpoint | Yes (periodically) | Yes (after ping) | No |
| Latency | Highest (poll interval) | Medium | Lowest |
| Server-side complexity | Lowest | Medium | Highest |
| `client_notification_token` in auth request | No | Yes | Yes |
| `interval` in auth response | Yes | Yes | No |
| `expires_in` in auth response | Yes | Yes | Yes |
| Best for | Simple testing, no push infra | Moderate real-time needs | Real-time, production |

### What this server supports

This server's CIBA implementation delegates all mode-specific logic to Authlete. The four API endpoints (`authentication`, `issue`, `fail`, `complete`) are mode-agnostic — Authlete handles the delivery based on the client's configured `backchannelTokenDeliveryMode`.

For PING and PUSH modes, the server's CIBA `complete` endpoint returns `action=NOTIFICATION` (instead of `NO_ACTION` for POLL), and the caller must send the notification to the client's notification endpoint.

---

## Part 4: Step-by-Step CIBA Flow

This section walks through a complete CIBA POLL mode flow using curl commands.

### Prerequisites

1. Authlete service configured with CIBA (see Part 2)
2. A confidential client with `clientId`, `clientSecret`, and CIBA POLL mode
3. This server running on `http://localhost:3000`

### Step 1: Backchannel Authentication Request

The client sends a backchannel authentication request to the server's CIBA endpoint. The `parameters` field is a URL-encoded string containing all the CIBA request parameters.

**Basic example (login_hint only):**

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

**With binding_message:** A human-readable message shown on both the consumption device and the authentication device so the end-user can confirm the transaction is related:

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid&binding_message=Pay+%2450+to+Acme+Corp",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

**With user_code:** A secret code (like a PIN) known only to the user, providing an extra layer of security against fraudulent authentication requests:

```bash
# Requires client configured with User Code Required = Required
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid&user_code=123456",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

**With acr_values:** Request a specific authentication context class reference (e.g., a particular level of assurance):

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid&acr_values=urn%3Amace%3Aincommon%3Aiap%3Asilver",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

**Using request object (JAR-based CIBA):** Instead of URL-encoded parameters, you can pass a signed JWT request object via the `request` parameter. This is useful for FAPI-compliant deployments:

```bash
# First create a JWT with the CIBA claims, then:
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "request=<signed_jwt>&client_id=<your_client_id>",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

When using a `request` object, standard JWT claims like `iss`, `aud`, `exp`, `iat` are validated, and the JWT must be signed with the client's registered key.

**With login_hint_token or id_hint_token (alternative hint types):**

```bash
# login_hint_token — an opaque token referencing the end-user
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint_token=some_opaque_token&scope=openid",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'

# id_token_hint — a previously-issued ID token identifying the end-user
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "id_token_hint=<previous_id_token>&scope=openid",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

**Successful response (action=USER_IDENTIFICATION):**

```json
{
  "action": "USER_IDENTIFICATION",
  "responseContent": "...",
  "ticket": "ticket-abc123",
  "hintType": "LOGIN_HINT",
  "hint": "admin",
  "deliveryMode": "POLL",
  "scopes": [{"name": "openid", ...}],
  "clientName": "My Client"
}
```

Save the `ticket` value — you'll need it for subsequent steps.

**Error responses:**
- `400 BAD_REQUEST` — missing required parameters
- `401 UNAUTHORIZED` — client authentication failed
- `500 INTERNAL_SERVER_ERROR` — server error

### Step 2: Issue Auth Req ID

After identifying the end-user from the hint, the server issues an `auth_req_id`.

```http
POST /api/ciba/issue HTTP/1.1
Content-Type: application/json

{
  "ticket": "ticket-abc123"
}
```

```bash
curl -X POST http://localhost:3000/api/ciba/issue \
  -H "Content-Type: application/json" \
  -d '{"ticket": "ticket-abc123"}'
```

**Successful response (action=OK):**

```json
{
  "action": "OK",
  "responseContent": "...",
  "authReqId": "auth_req_id_xyz789",
  "expiresIn": 600,
  "interval": 5
}
```

The `authReqId` is what the client uses to poll for tokens. `expiresIn` tells how long the `auth_req_id` is valid, and `interval` tells the minimum polling interval.

### Step 3: Complete Authentication

After the end-user authenticates on their device, call the complete endpoint.

```http
POST /api/ciba/complete HTTP/1.1
Content-Type: application/json

{
  "ticket": "ticket-abc123",
  "result": "AUTHORIZED",
  "subject": "admin"
}
```

```bash
curl -X POST http://localhost:3000/api/ciba/complete \
  -H "Content-Type: application/json" \
  -d '{"ticket": "ticket-abc123", "result": "AUTHORIZED", "subject": "admin"}'
```

**Response (POLL mode — action=NO_ACTION):**

```json
{
  "action": "NO_ACTION",
  "responseContent": "..."
}
```

In POLL mode, `NO_ACTION` means the server has stored the authorization result. The client will now poll the token endpoint.

In PING/PUSH mode, `action=NOTIFICATION` means the server should send a notification to the client's notification endpoint (handled by the caller, not this endpoint).

**Possible `result` values:**
| Value | Meaning |
|-------|---------|
| `AUTHORIZED` | End-user approved the request |
| `ACCESS_DENIED` | End-user rejected the request |
| `TRANSACTION_FAILED` | Could not reach authentication device |

### Step 4: Poll Token Endpoint (POLL mode)

The client polls the token endpoint with `grant_type=urn:openid:params:grant-type:ciba` + `auth_req_id`.

```http
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

grant_type=urn:openid:params:grant-type:ciba&auth_req_id=auth_req_id_xyz789
```

```bash
# You may need to wait a moment for Authlete to process the complete request
sleep 3

curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "<client_id>:<client_secret>" \
  -d "grant_type=urn:openid:params:grant-type:ciba&auth_req_id=auth_req_id_xyz789"
```

**Successful response:**

```json
{
  "access_token": "eyJraWQiOiI...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJraWQiOiI...",
  "refresh_token": "...",
  "scope": "openid"
}
```

**Pending response (not yet authorized):**

```json
HTTP/1.1 400 Bad Request
{
  "error": "authorization_pending",
  "error_description": "[A055103] The authorization request is still pending.",
  "interval": 5
}
```

The client should wait `interval` seconds before polling again.

**Slow down response (polling too fast):**

```json
HTTP/1.1 400 Bad Request
{
  "error": "slow_down",
  "error_description": "[A055104] The polling interval is too short.",
  "interval": 10
}
```

When receiving `slow_down`, the client must increase the polling interval (e.g., add 5 seconds) and MUST NOT poll faster than the new `interval` value. This prevents overwhelming the server.

**Error response (access denied):**

```json
HTTP/1.1 400 Bad Request
{
  "error": "access_denied",
  "error_description": "[A055105] The end-user denied the authorization request."
}
```

**Expired token response (auth_req_id expired):**

```json
HTTP/1.1 400 Bad Request
{
  "error": "expired_token",
  "error_description": "[A055106] The authentication request ID has expired."
}
```

When the `auth_req_id` expires, the client must start a new CIBA flow from scratch (Step 1).

### Step 5: Fail Authentication (Error Path)

If the end-user cannot be identified or the request is invalid, call the fail endpoint.

```http
POST /api/ciba/fail HTTP/1.1
Content-Type: application/json

{
  "ticket": "ticket-abc123",
  "reason": "UNKNOWN_USER_ID"
}
```

```bash
curl -X POST http://localhost:3000/api/ciba/fail \
  -H "Content-Type: application/json" \
  -d '{"ticket": "ticket-abc123", "reason": "UNKNOWN_USER_ID"}'
```

**Response:**

```json
{
  "action": "FORBIDDEN",
  "responseContent": "..."
}
```

**Possible `reason` values:**

| Reason | HTTP Status | Description |
|--------|:-----------:|-------------|
| `ACCESS_DENIED` | 403 | End-user rejected |
| `EXPIRED_LOGIN_HINT_TOKEN` | 400 | Hint token expired |
| `INVALID_BINDING_MESSAGE` | 400 | Binding message invalid |
| `INVALID_TARGET` | 400 | Invalid target |
| `INVALID_USER_CODE` | 400 | Wrong user code |
| `MISSING_USER_CODE` | 400 | User code required but missing |
| `SERVER_ERROR` | 500 | Server-side error |
| `UNAUTHORIZED_CLIENT` | 400 | Client not authorized for CIBA |
| `UNKNOWN_USER_ID` | 403 | Could not identify end-user |

### Full Flow Summary (POLL Mode)

```
Client                          Server
  │                                │
  │  1. POST /api/ciba/authentication
  │───── parameters + creds ──────→│  Authlete validates
  │←──── ticket + hint ───────────│
  │                                │
  │  2. POST /api/ciba/issue
  │───── ticket ──────────────────→│  Authlete issues auth_req_id
  │←──── auth_req_id + interval ──│
  │                                │
  │  3. Authenticate user on device│
  │   (real implementation)        │
  │                                │
  │  4. POST /api/ciba/complete
  │───── ticket + result + sub ───→│  Authlete stores result
  │←──── NO_ACTION ───────────────│
  │                                │
  │  5. GET /api/token (polling)
  │───── auth_req_id ─────────────→│  Authlete issues tokens
  │←──── access_token + id_token ─│
```

---

## Part 5: Client Demo Walkthrough

The React SPA includes a **CIBA** section that lets you test the complete CIBA POLL flow interactively — from authentication through token polling.

### Opening the CIBA section

1. Start both servers: `npm --prefix server run dev` + `npm --prefix client run dev`
2. Open `http://localhost:3001`
3. Click **CIBA** in the sidebar (under OIDC & Extensions)

### Using the CIBA tools

The CIBA section has a tab bar with 5 operations:

**1. Authentication tab:**

| Field | Description |
|-------|-------------|
| Parameters | URL-encoded CIBA parameters. Must include at minimum `login_hint=<user>` and `scope=openid` |
| Client ID | Your confidential client's ID |
| Client Secret | Your confidential client's secret |

Click **Run** → on success, the `ticket` is auto-filled into the Issue, Fail, and Complete tabs.

**2. Issue tab:**

| Field | Description |
|-------|-------------|
| Ticket | Auto-filled from the authentication response |

Click **Run** → on success, returns `auth_req_id`, `expires_in`, and `interval`.

**3. Fail tab:**

| Field | Description |
|-------|-------------|
| Ticket | Auto-filled from the authentication response |
| Reason | Dropdown with all 9 fail reasons |

Click **Run** → calls the fail endpoint and returns the error response.

**4. Complete tab:**

| Field | Description |
|-------|-------------|
| Ticket | Auto-filled from the authentication response |
| Result | Dropdown: `AUTHORIZED`, `ACCESS_DENIED`, `TRANSACTION_FAILED` |
| Subject | The end-user subject identifier (e.g., `admin`) |

Click **Run** → on success, completes the CIBA flow.

**5. Poll Token tab:**

| Field | Description |
|-------|-------------|
| auth_req_id | Auto-filled from Issue response |
| Poll Token button | Polls `/api/token` with `grant_type=urn:openid:params:grant-type:ciba` |
| Expected interval | Shows the polling interval from the Issue response |

Click **Poll Token** → on success, returns `access_token`, `id_token`, `refresh_token` (if applicable). If the user hasn't completed authorization yet, you'll see `authorization_pending` or `slow_down`.

### Testing the full flow

1. Go to **CIBA** section
2. **Authentication tab**:
   - Parameters: `login_hint=admin&scope=openid`
   - Enter your `clientId` and `clientSecret`
   - Click **Run** → expect `action: USER_IDENTIFICATION`
3. **Issue tab**: Click **Run** (ticket is pre-filled) → `authReqId` auto-filled into Poll Token tab
4. **Complete tab**: Click **Run** (defaults: `AUTHORIZED`, subject `admin`)
5. **Poll Token tab**: Click **Poll Token** → expect `access_token`, `id_token`, `refresh_token` (if applicable)

---

## Part 6: Troubleshooting

### "action is INTERNAL_SERVER_ERROR"

**Cause:** Authlete API call failed.
**Fix:** Check `responseContent` for error details. Common causes:
- `login_hint` format wrong or user not found
- CIBA not enabled on the service (check `supportedBackchannelTokenDeliveryModes`)
- `scope=openid` missing from parameters

### "Missing required field: parameters"

**Cause:** The `parameters` field was not sent in the request body.
**Fix:** Ensure your JSON body includes `"parameters": "login_hint=admin&scope=openid"`.

### 401 Unauthorized on authentication

**Cause:** Client authentication failed.
**Fix:** Verify `clientId` and `clientSecret` match a CIBA-enabled confidential client. CIBA only allows confidential clients — public clients will be rejected.

### "No user found with the given hint"

**Cause:** The `login_hint` value doesn't match any known user.
**Fix:** Use a valid user. For this server's demo, use `admin` (the default demo user). If `AUTH_USERS` env var is set, use one of those subjects.

### auth_req_id expires before polling

**Cause:** The polling interval or authentication process took too long.
**Fix:** Increase `backchannelAuthReqIdDuration` in Authlete Console (e.g., to 600 or 1200 seconds).

### Polling returns "authorization_pending" forever

**Cause:** The `complete` endpoint was not called, or was called with wrong values.
**Fix:**
1. Ensure you called `POST /api/ciba/complete` with the correct `ticket`
2. Check that `result` is `"AUTHORIZED"` (not `ACCESS_DENIED`)
3. Verify the `ticket` matches the one from the authentication response

### Polling returns "slow_down"

**Cause:** Polling interval is too short (less than the `interval` returned in the issue response).
**Fix:** Wait at least `interval` seconds between token endpoint requests.

### "action is INVALID_TICKET"

**Cause:** The ticket was already used, expired, or never existed.
**Fix:** Get a fresh ticket from `POST /api/ciba/authentication` and use it immediately.

### PING/PUSH mode: "action is NOTIFICATION" but no notification sent

**Cause:** This server's `complete` endpoint returns `NOTIFICATION` in PING/PUSH modes, but the notification delivery to the client's endpoint is the caller's responsibility.
**Fix:** After receiving `action=NOTIFICATION`, the caller must:
1. Extract `clientNotificationEndpoint` and `clientNotificationToken` from the original authentication response
2. POST the `responseContent` to the notification endpoint with `Authorization: Bearer <token>`

### "CIBA is not enabled on this service"

**Cause:** The Authlete service does not have `supportedBackchannelTokenDeliveryModes` configured.
**Fix:** Go to Authlete Console → **Service Settings → Endpoints → CIBA** → check at least `POLL` → Save.

---

## Part 7: Failure Demonstrations

This section proves that CIBA's client authentication and hint-based identification actually prevent unauthorized access.

### Demo 1: CIBA request without client credentials

A client that doesn't authenticate cannot initiate a CIBA flow:

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{"parameters": "login_hint=admin&scope=openid"}'
```

Expected response:
```json
HTTP/1.1 400 Bad Request
{
  "error": "invalid_request",
  "error_description": "Missing required field: parameters"
}
```

Wait — actually the validation passes because `clientId` and `clientSecret` are optional fields. Authlete itself will reject the request:

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{"parameters": "login_hint=admin&scope=openid"}'
```

Expected response:
```json
HTTP/1.1 401 Unauthorized
{
  "action": "UNAUTHORIZED",
  "resultCode": "...",
  "resultMessage": "...",
  "responseContent": "..."
}
```

Authlete requires client authentication at the backchannel authentication endpoint. Anonymous requests are rejected.

### Demo 2: Wrong client secret

A client with correct `clientId` but wrong `clientSecret` will be rejected:

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid",
    "clientId": "<your_client_id>",
    "clientSecret": "wrong_secret"
  }'
```

Expected response:
```json
HTTP/1.1 401 Unauthorized
{
  "action": "UNAUTHORIZED",
  "responseContent": "..."
}
```

### Demo 3: Unknown login_hint

A request with a non-existent user hint will fail:

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=nonexistent_user&scope=openid",
    "clientId": "<your_client_id>",
    "clientSecret": "<your_client_secret>"
  }'
```

The server forwards the request to Authlete, which returns `action=USER_IDENTIFICATION` with the hint. Since the server doesn't manage user data (Authlete doesn't either), the identification happens in the caller's code. If you then call `POST /api/ciba/fail` with `reason=UNKNOWN_USER_ID`, it returns `403 FORBIDDEN`.

### Demo 4: Public client cannot use CIBA

CIBA requires confidential clients. A client registered as `public` would be rejected at the Authlete level.

### What this proves

| Attack Scenario | Protected By | Result |
|----------------|-------------|--------|
| No client authentication | Authlete requires client auth at BC endpoint | ❌ Fails (Demo 1) |
| Wrong client secret | Authlete validates credentials | ❌ Fails (Demo 2) |
| Unknown user hint | Hint-based identification fails; caller returns UNKNOWN_USER_ID | ❌ Fails (Demo 3) |
| Public client | Authlete rejects non-confidential clients | ❌ Fails (Demo 4) |
| Stolen bearer token (no DPoP) | Token theft is possible in standard Bearer tokens — see FAPI tutorial for DPoP protection | ⚠️ Bearer |

---

## Appendix: Server Architecture

### Files involved in CIBA

| File | Role |
|------|------|
| `server/src/routes/ciba.routes.ts` | Route definitions (`POST /ciba/authentication`, `POST /ciba/issue`, `POST /ciba/fail`, `POST /ciba/complete`) |
| `server/src/controllers/ciba.controller.ts` | Request validation, action-to-status mapping, error handling |
| `server/src/services/ciba.service.ts` | Authlete API delegation (`ciba.processAuthentication`, `ciba.issue`, `ciba.fail`, `ciba.complete`) |
| `server/src/utils/validation.ts` | Zod schemas (`cibaAuthenticationSchema`, `cibaIssueSchema`, `cibaFailSchema`, `cibaCompleteSchema`) |
| `client/src/services/ciba.service.ts` | Client-side API calls to all 4 CIBA endpoints |
| `client/src/components/oidc/CibaSection.tsx` | CIBA demo UI with tabbed operations |
| `client/src/data/operationDocs.ts:438-480` | Inline documentation for each CIBA operation |
| `client/src/config.ts:60-63` | CIBA endpoint URLs |
| `server/tests/e2e/enable_ciba.ts` | Helper script to configure CIBA on Authlete service |
| `server/tests/e2e/e2e.test.ts:1023-1135` | E2E tests for CIBA happy path and denied path |
| `server/tests/unit/services/ciba.service.test.ts` | Unit tests for CibaService |
| `server/tests/integration/routes.test.ts:108-135` | Integration tests for CIBA route handlers |

### CIBA API endpoints

| Endpoint | Method | Request Body | Auth | Description |
|----------|--------|-------------|------|-------------|
| `/api/ciba/authentication` | POST | `{ parameters, clientId?, clientSecret? }` | Optional (passed to Authlete) | Process backchannel authentication request |
| `/api/ciba/issue` | POST | `{ ticket }` | None | Issue `auth_req_id` for polling |
| `/api/ciba/fail` | POST | `{ ticket, reason }` | None | Fail a CIBA authentication |
| `/api/ciba/complete` | POST | `{ ticket, result, subject }` | None | Complete CIBA authentication with user decision |

### Authlete API mapping

This server's CIBA implementation maps 1:1 to Authlete's CIBA API:

| Express Endpoint | Authlete API SDK Method |
|-----------------|------------------------|
| `POST /api/ciba/authentication` | `authleteApi.ciba.processAuthentication()` |
| `POST /api/ciba/issue` | `authleteApi.ciba.issue()` |
| `POST /api/ciba/fail` | `authleteApi.ciba.fail()` |
| `POST /api/ciba/complete` | `authleteApi.ciba.complete()` |

The token endpoint (`POST /api/token`) handles CIBA token requests via the standard `authleteApi.token.create()` call, with `grant_type=urn:openid:params:grant-type:ciba` — no custom token endpoint is needed.

### Action-to-HTTP status mapping

**Authentication endpoint:**

| Authlete Action | HTTP Status |
|----------------|:-----------:|
| `USER_IDENTIFICATION` | 200 |
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `INTERNAL_SERVER_ERROR` | 500 |

**Issue endpoint:**

| Authlete Action | HTTP Status |
|----------------|:-----------:|
| `OK` | 200 |
| `INVALID_TICKET` | 400 |
| `INTERNAL_SERVER_ERROR` | 500 |

**Fail endpoint:**

| Authlete Action | HTTP Status |
|----------------|:-----------:|
| `FORBIDDEN` | 403 |
| `BAD_REQUEST` | 400 |
| `INTERNAL_SERVER_ERROR` | 500 |

**Complete endpoint:**

| Authlete Action | HTTP Status | Meaning |
|----------------|:-----------:|---------|
| `NO_ACTION` | 200 | POLL mode — tokens available for polling |
| `NOTIFICATION` | 200 | PING/PUSH mode — caller must deliver notification |

### Data flow diagram

```
┌──────────┐    POST /api/ciba/authentication  ┌──────────────┐
│          │ ── {parameters, clientId,           │              │
│  Client  │      clientSecret}                │  Express     │
│  (SPA)   │                                    │  Server      │
│          │    POST /api/ciba/issue             │              │
│          │ ── {ticket}                       │  Authlete    │
│          │                                    │  SDK         │
│          │    POST /api/ciba/complete          │              │
│          │ ── {ticket, result, subject}      │              │
│          │                                    │              │
│          │    POST /api/token (poll)           │   Authlete   │
│          │ ── grant_type=CIBA + auth_req_id  │   Cloud API  │
│          │                                    │              │
│          │←── access_token + id_token ────────│              │
└──────────┘                                    └──────────────┘
```

### Test coverage

- **Unit tests** (`tests/unit/services/ciba.service.test.ts`): Mocks all 4 Authlete SDK methods — `processAuthentication`, `issue`, `fail`, `complete`
- **Integration tests** (`tests/integration/routes.test.ts:108-135`): Full Express stack with mocked Authlete — validates route wiring, action-to-status mapping, and error handling
- **E2E tests** (`tests/e2e/e2e.test.ts:1023-1135`): Two complete flows:
  - **Happy path**: authenticate → issue → complete → token exchange (200)
  - **Denied path**: authenticate → issue → fail → poll token (400)
- **Validation tests** (`tests/unit/utils/validation.test.ts`): Tests all 4 Zod schemas — valid data and missing field errors

### Configuration summary

| Setting | Console Path | Required Value |
|---------|-------------|----------------|
| Supported Backchannel Token Delivery Modes | **Endpoints → CIBA** | `["POLL"]` minimum |
| Backchannel Authentication Endpoint | **Endpoints → CIBA** | `http://localhost:3000/api/ciba/authentication` |
| Client Type | **Clients → Basic** | `Confidential` |
| Token Delivery Mode | **Clients → CIBA** | `POLL` (for testing) |
| Grant Types | **Clients → Basic** | At minimum what you need + implicit CIBA support |
