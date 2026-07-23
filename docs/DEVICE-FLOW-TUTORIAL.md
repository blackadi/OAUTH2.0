# OAuth 2.0 Device Authorization Grant (Device Flow) — RFC 8628

A comprehensive guide to the Device Flow: what it is, why it exists, how Authlete implements it, and how to test it with this server and client.

---

## Table of Contents

- [Part 1: Introduction & Motivation](#part-1-introduction--motivation)
- [Part 2: How Device Flow Works](#part-2-how-device-flow-works)
- [Part 3: Authlete Device Flow Configuration](#part-3-authlete-device-flow-configuration)
- [Part 4: Server Implementation](#part-4-server-implementation)
- [Part 5: Step-by-Step Device Flow (API)](#part-5-step-by-step-device-flow-api)
- [Part 6: Step-by-Step Device Flow (Browser)](#part-6-step-by-step-device-flow-browser)
- [Part 7: The Device Flow API Endpoints](#part-7-the-device-flow-api-endpoints)
- [Part 8: Token Endpoint — Device Code Exchange](#part-8-token-endpoint--device-code-exchange)
- [Part 9: Client SPA Testing Tool Walkthrough](#part-9-client-spa-testing-tool-walkthrough)
- [Part 10: Complete End-to-End Test Scenarios](#part-10-complete-end-to-end-test-scenarios)
- [Part 11: Error Scenarios](#part-11-error-scenarios)
- [Part 12: RFC 8628 Compliance Checklist](#part-12-rfc-8628-compliance-checklist)
- [Part 13: Security Considerations](#part-13-security-considerations)
- [Part 14: Troubleshooting](#part-14-troubleshooting)

---

## Part 1: Introduction & Motivation

### What is Device Flow?

The **Device Authorization Grant** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)), commonly called "Device Flow," is an OAuth 2.0 extension that allows devices with limited input capabilities (smart TVs, media consoles, printers, IoT devices) to obtain access tokens by having the user authorize on a **separate device** (phone, laptop) that has a full browser.

### Why was Device Flow created?

| Problem | How Device Flow Fixes It |
|---------|--------------------------|
| **No browser** — Smart TVs, game consoles, and IoT devices cannot open a browser for standard OAuth redirects | The device only needs to display a URL and a short code. The user opens the browser on their phone/laptop and enters the code there. |
| **Limited input** — Devices with only a remote control or voice input cannot type complex credentials | The user types on their phone's keyboard, which is much easier. The user code is designed to be short (e.g., `WDJB-MJHT`). |
| **No redirect URI** — Devices behind NAT or without a web server cannot receive OAuth callbacks | The device **polls** the token endpoint instead of waiting for a redirect. No redirect URI needed. |
| **Input security** — Typing passwords on a shared TV screen is insecure (shoulder surfing) | The user authenticates on their personal device (phone), keeping credentials private. |

### Real-World Use Cases

| Device | Example |
|--------|---------|
| Smart TV | Netflix, YouTube, Spotify on TV — shows code, user authorizes on phone |
| Game Console | PlayStation, Xbox streaming apps |
| CLI Tools | `gh` (GitHub CLI) — shows a one-time code, user authorizes in browser |
| IoT / Printers | Network printers, smart home hubs |
| Set-Top Boxes | Roku, Apple TV, Fire TV Stick |

### When should you use Device Flow?

- **When** the device cannot reliably open a browser or receive redirects
- **When** the device has limited text input (remote control, voice only)
- **When** the user has a secondary device (phone, laptop) they can use
- **Never** as a replacement for browser-based flows on capable devices (smartphones, desktops)

---

## Part 2: How Device Flow Works

### The Flow at a Glance

```
     Device (TV/App)                          Authorization Server                        User (Phone/Laptop)
          │                                         │                                          │
          │  (A) POST /device/authorization          │                                          │
          │  (client_id, scope)                      │                                          │
          │────────────────────────────────────────>│                                          │
          │                                         │                                          │
          │  (B) { device_code, user_code,           │                                          │
          │        verification_uri,                 │                                          │
          │        expires_in, interval }            │                                          │
          │<────────────────────────────────────────│                                          │
          │                                         │                                          │
          │  (C) Display to user:                    │                                          │
          │  "Go to https://example.com/device"      │                                          │
          │  "Enter code: WDJB-MJHT"                │                                          │
          │                                         │                                          │
          │                                         │    (D) User visits verification_uri      │
          │                                         │    and enters user_code                   │
          │                                         │<─────────────────────────────────────────│
          │                                         │                                          │
          │  (E) Poll: POST /token                   │    (F) User authenticates + approves     │
          │  grant_type=device_code                  │<─────────────────────────────────────────│
          │  device_code=...                         │                                          │
          │  (every N seconds)                       │                                          │
          │────────────────────────────────────────>│                                          │
          │                                         │                                          │
          │  ... still pending ...                  │                                          │
          │<────────────────────────────────────────│                                          │
          │                                         │                                          │
          │  (G) POST /token (poll again)            │                                          │
          │────────────────────────────────────────>│                                          │
          │                                         │                                          │
          │  (H) { access_token, token_type, ... }  │                                          │
          │<────────────────────────────────────────│                                          │
```

### Detailed Steps

#### (A) Device Authorization Request

The device sends a POST to the **device authorization endpoint** with:
- `client_id` (REQUIRED for public clients, optional for confidential clients)
- `scope` (OPTIONAL — the requested permissions)

#### (B) Device Authorization Response

The authorization server responds with:
- `device_code` — A high-entropy code the device uses for polling
- `user_code` — A short, human-readable code the user enters
- `verification_uri` — The URL the user visits
- `verification_uri_complete` (OPTIONAL) — URL with user_code embedded (for QR codes)
- `expires_in` — Lifetime of device_code and user_code (in seconds)
- `interval` (OPTIONAL) — Minimum seconds between polls (default: 5)

#### (C) User Instruction

The device displays:
```
┌─────────────────────────────────────────┐
│                                         │
│  Using a browser on another device,     │
│  visit: https://example.com/device      │
│                                         │
│  And enter the code:                    │
│  WDJB-MJHT                             │
│                                         │
└─────────────────────────────────────────┘
```

#### (D) User Interaction

The user opens their phone/laptop browser, navigates to the verification URI, enters the user code, authenticates (login), and approves/denies the request.

#### (E) Polling

The device **repeatedly** polls the token endpoint:
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=1406020730
```

#### (F-H) Token Response

The server responds based on the state:
- **Still pending:** `400 { "error": "authorization_pending" }` — keep polling
- **Slow down:** `400 { "error": "slow_down" }` — increase interval by 5s
- **User denied:** `400 { "error": "access_denied" }` — stop polling
- **Code expired:** `400 { "error": "expired_token" }` — restart flow
- **Success:** `200 { "access_token": "...", "token_type": "Bearer", ... }`

### Polling Error Codes (RFC 8628 Section 3.5)

| Error | Meaning | Device Action |
|-------|---------|---------------|
| `authorization_pending` | User hasn't completed interaction yet | Continue polling (wait at least `interval` seconds) |
| `slow_down` | Too fast! | Increase interval by 5 seconds for this and all subsequent requests |
| `access_denied` | User denied the request | Stop polling, show error |
| `expired_token` | `device_code` has expired | Stop polling, optionally restart the entire flow |
| `invalid_client` | Client authentication failed | Stop polling, check credentials |
| `invalid_grant` | Device code is invalid | Stop polling |

---

## Part 3: Authlete Device Flow Configuration

### Authlete Service Settings

In the [Authlete web console](https://console.authlete.com/), configure:

| Setting | Location | Description |
|---------|----------|-------------|
| **Device Authorization Endpoint** | Service → Device Flow | The URL of your device authorization endpoint (e.g., `https://your-server.com/api/device/authorization`) |
| **Device Verification URI** | Service → Device Flow | The URL users visit to enter their code (e.g., `https://your-server.com/device`) |
| **Device Verification URI Complete** | Service → Device Flow | URI with `USER_CODE` placeholder (e.g., `https://your-server.com/device?user_code=USER_CODE`) |
| **Device Flow Code Duration** | Service → Device Flow | Lifetime of device/user codes in seconds (default varies) |
| **Device Flow Polling Interval** | Service → Device Flow | Minimum seconds between token polls (e.g., 5) |
| **Supported Grant Types** | Service → General | Must include `urn:ietf:params:oauth:grant-type:device_code` |

### Server Metadata

When Device Flow is configured, Authlete includes these in `.well-known/openid-configuration`:

```json
{
  "device_authorization_endpoint": "https://your-server.com/api/device/authorization",
  "grant_types_supported": [
    "authorization_code",
    "client_credentials",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code"
  ]
}
```

### Authlete SDK Methods

The server uses three Authlete SDK methods:

| SDK Method | API Endpoint | Purpose |
|-----------|-------------|---------|
| `authleteApi.deviceFlow.authorization()` | `/device/authorization` | Process device authorization request, return device_code + user_code |
| `authleteApi.deviceFlow.verification()` | `/device/verification` | Validate user_code entered by the user |
| `authleteApi.deviceFlow.complete()` | `/device/complete` | Record user's approval/denial decision |

The token endpoint uses `authleteApi.token.process()` — Authlete handles `grant_type=device_code` natively with no special code path needed.

---

## Part 4: Server Implementation

### Architecture Overview

```
server/src/
├── services/
│   └── device.service.ts              # Authlete SDK wrapper (3 methods)
├── controllers/
│   ├── device.controller.ts           # REST API controllers (3 endpoints)
│   └── device-session.controller.ts   # Browser flow controllers (3 endpoints)
├── routes/
│   └── device.routes.ts              # Route definitions (6 routes)
├── views/
│   └── device-verification.ejs       # Browser UI template (3 states)
├── utils/
│   └── validation.ts                 # Zod schemas for request validation
└── middleware/
    ├── csrf.ts                       # CSRF protection (browser routes)
    └── rate-limit.ts                 # Rate limiting (browser routes)
```

### API Routes vs. Browser Routes

The server exposes **two sets** of endpoints for device flow:

| Route | Method | Purpose | Auth | Rate Limited |
|-------|--------|---------|------|-------------|
| `/api/device/authorization` | POST | Start device flow (API) | Client auth in body | No |
| `/api/device/verification` | POST | Verify user code (API) | None | No |
| `/api/device/complete` | POST | Approve/deny (API) | None | No |
| `GET /device` | GET | Show user code entry form (Browser) | None | generalLimiter (60/min) |
| `POST /device` | POST | Submit user code (Browser) | CSRF | generalLimiter (60/min) |
| `POST /device/consent` | POST | Authenticate + approve/deny (Browser) | CSRF + credentials | generalLimiter (60/min) |

**Why two sets?** The API endpoints are for programmatic clients (e.g., the React SPA testing tool). The browser endpoints are for real device flow user interaction — a user opens their phone browser, navigates to `/device`, and interacts with a rendered HTML form.

### The Device Service (`device.service.ts`)

Three methods, each wrapping one Authlete SDK call:

```typescript
// 1. Start the flow — returns device_code, user_code, verification_uri
async authorization(req): Promise<GMResponse> {
  // Requires: parameters (URL-encoded), clientId, clientSecret
  // Returns: device_code, user_code, verification_uri, expires_in, interval
}

// 2. Verify the user_code — checks if it's valid, not expired, etc.
async verification(userCode): Promise<GMResponse> {
  // Returns: action (VALID / NOT_EXIST / EXPIRED), clientName, scopes
}

// 3. Complete the flow — record user's decision
async complete(userCode, result, subject, extra?): Promise<GMResponse> {
  // result: "AUTHORIZED" | "ACCESS_DENIED" | "TRANSACTION_FAILED"
  // subject: the authenticated user's identifier
  // Returns: action (SUCCESS / USER_CODE_NOT_EXIST / USER_CODE_EXPIRED)
}
```

### The Session Controller (`device-session.controller.ts`)

Handles the browser-based flow with three states:

| State | Template Rendered | User Sees |
|-------|-------------------|-----------|
| Initial | Code entry form | "Enter the code displayed on your device" + user_code input |
| Verified | Consent form | Client name, requested scopes, username/password, Authorize/Deny buttons |
| Done | Success/failure page | "Authorization successful! You can close this window." or error message |

### EJS Template (`device-verification.ejs`)

Three conditional states in a single template:

1. **`done` state** — Shows success/error message with "Go Home" link
2. **Code entry form** — User code input with monospace font + letter-spacing for readability
3. **Consent form** — Client name with icon, scope list, username/password fields, Authorize (green) / Deny (red) buttons

---

## Part 5: Step-by-Step Device Flow (API)

This is the programmatic flow using the API endpoints (what the React SPA testing tool does).

### Step 1: Device Authorization Request

```bash
curl -X POST http://localhost:3000/api/device/authorization \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "client_id=YOUR_CLIENT_ID&scope=openid+profile",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

**Response:**
```json
{
  "type": "deviceAuthorizationResponse",
  "action": "OK",
  "deviceCode": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "userCode": "WDJB-MJHT",
  "verificationUri": "https://your-server.com/device",
  "verificationUriComplete": "https://your-server.com/device?user_code=WDJB-MJHT",
  "expiresIn": 1800,
  "interval": 5
}
```

### Step 2: Display to User

The device shows:
```
Using a browser on another device, visit:
https://your-server.com/device

And enter the code:
WDJB-MJHT
```

### Step 3: User Visits Verification URI

The user opens their phone browser, goes to `https://your-server.com/device`, and enters the code `WDJB-MJHT`.

### Step 4: Device Polls Token Endpoint

```bash
curl -X POST http://localhost:3000/api/token \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS"
```

**While pending:** `400 { "error": "authorization_pending" }`
**After approval:** `200 { "access_token": "...", "token_type": "Bearer", ... }`

---

## Part 6: Step-by-Step Device Flow (Browser)

This is the human-facing flow — what the end user actually does.

### Step 1: Device Shows Code

After the device calls `/api/device/authorization` (Step 1 from Part 5), it displays the `verification_uri` and `user_code` to the user.

### Step 2: User Opens Browser

The user opens their phone browser and navigates to:
```
https://your-server.com/device
```

They see the **Device Verification** page with a single input field:

```
┌─────────────────────────────────────────┐
│                                         │
│  Device Verification                    │
│                                         │
│  Enter the code displayed on your       │
│  device to sign in.                     │
│                                         │
│  User Code                              │
│  ┌─────────────────────────────────┐    │
│  │  ABCD-1234                      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Verify]                               │
│                                         │
└─────────────────────────────────────────┘
```

### Step 3: User Submits Code

After clicking "Verify," the server calls Authlete's `/device/verification` API. If the code is valid, the user sees the **consent page**:

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─┐                                   │
│  │Y│  Your TV App                       │
│  └─┘  requesting access to your account │
│                                         │
│  This device would like to:             │
│  • openid                               │
│  • profile                              │
│                                         │
│  Username                               │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│  Password                               │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Authorize]  [Deny]                    │
│                                         │
└─────────────────────────────────────────┘
```

### Step 4: User Authenticates and Approves

The user enters their credentials (default: `admin` / `password`) and clicks **Authorize**. The server:
1. Validates credentials
2. Calls Authlete's `/device/complete` API with `result=AUTHORIZED` and `subject=admin`
3. Shows success page

### Step 5: Device Gets Token

The device has been polling `/api/token` with the `device_code`. Once the user approves, the next poll returns the access token:

```json
{
  "access_token": "FOMxkE5baq...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid profile"
}
```

---

## Part 7: The Device Flow API Endpoints

### POST `/api/device/authorization`

Initiates the device flow. Called by the device (not the end user).

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `parameters` | string | Yes | URL-encoded OAuth parameters (`client_id=...&scope=...`) |
| `clientId` | string | No | Client identifier (alternative to including in `parameters`) |
| `clientSecret` | string | No | Client secret (for confidential clients) |

**Response (200 OK):**

| Field | Type | Description |
|-------|------|-------------|
| `deviceCode` | string | High-entropy code for the device to use when polling |
| `userCode` | string | Short code for the user to enter (e.g., `WDJB-MJHT`) |
| `verificationUri` | string | URL the user should visit |
| `verificationUriComplete` | string | URL with user_code embedded (for QR codes) |
| `expiresIn` | number | Lifetime of codes in seconds |
| `interval` | number | Minimum seconds between token polls |

**Error Responses:**

| Status | Action | Meaning |
|--------|--------|---------|
| 400 | `BAD_REQUEST` | Invalid client_id, scope, or other parameters |
| 401 | `UNAUTHORIZED` | Client authentication failed |
| 500 | `INTERNAL_SERVER_ERROR` | Server error |

### POST `/api/device/verification`

Verifies the user code entered by the end user.

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userCode` | string | Yes | The user code entered by the user |

**Response (200 OK):**

| Action | Status | Description |
|--------|--------|-------------|
| `VALID` | 200 | Code is valid. Response includes `clientName`, `scopes`, etc. |
| `NOT_EXIST` | 404 | Code does not exist |
| `EXPIRED` | 400 | Code has expired |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

### POST `/api/device/complete`

Records the user's authorization decision.

**Request Body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userCode` | string | Yes | The user code |
| `result` | string | Yes | `AUTHORIZED`, `ACCESS_DENIED`, or `TRANSACTION_FAILED` |
| `subject` | string | Yes | The authenticated user's identifier (e.g., `admin`) |

**Response (200 OK):**

| Action | Status | Description |
|--------|--------|-------------|
| `SUCCESS` | 200 | Decision recorded |
| `USER_CODE_NOT_EXIST` | 404 | Code does not exist |
| `USER_CODE_EXPIRED` | 400 | Code has expired |
| `INVALID_REQUEST` | 400 | Missing or invalid parameters |

---

## Part 8: Token Endpoint — Device Code Exchange

The device code exchange uses the **standard token endpoint** — no separate endpoint needed.

### Request

```
POST /api/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
```

### Polling Responses

| Response | Meaning | Device Action |
|----------|---------|---------------|
| `400 { "error": "authorization_pending" }` | Still waiting for user | Continue polling (wait `interval` seconds) |
| `400 { "error": "slow_down" }` | Polling too fast | Increase interval by 5 seconds |
| `400 { "error": "access_denied" }` | User denied | Stop polling |
| `400 { "error": "expired_token" }` | Code expired | Stop polling, restart flow |
| `200 { "access_token": "...", ... }` | Success! | Use the token |

### Success Response

```json
{
  "access_token": "FOMxkE5baqGjIAznqmhANgw1ITiwCK4CRdo0Pbi2p-A",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid profile",
  "id_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

---

## Part 9: Client SPA Testing Tool Walkthrough

### Accessing the Device Flow Section

1. Start the client: `npm --prefix client run dev`
2. Navigate to `http://localhost:3001`
3. Click **"Device Flow"** in the sidebar (under OIDC & Extensions)

### UI Components

The testing UI provides three tabs:

#### Tab 1: Authorization
- **Parameters (URL-encoded)** — Textarea for `client_id=xxx&scope=openid+profile` (pre-filled with default)
- **Client ID** — Optional standalone client_id field
- **Client Secret** — Optional standalone client_secret field
- **Run** button — Calls `POST /api/device/authorization`

After success, the `user_code` is **auto-populated** into the Verification and Complete tabs.

#### Tab 2: Verification
- **User Code** — Auto-populated from Authorization tab (or manual entry)
- **Run** button — Calls `POST /api/device/verification`
- Shows client name, scopes on success

#### Tab 3: Complete
- **User Code** — Auto-populated from Authorization tab
- **Result** — Dropdown: `AUTHORIZED`, `ACCESS_DENIED`, `TRANSACTION_FAILED`
- **Subject** — Text input (default: `admin`)
- **Run** button — Calls `POST /api/device/complete`

### Typical SPA Testing Workflow

1. **Authorization tab:** Click "Run" → Get `device_code` and `user_code`
2. **Verification tab:** Click "Run" → See client name and scopes
3. **Complete tab:** Select "AUTHORIZED", click "Run" → Device flow approved
4. **Token exchange:** Use curl to poll `/api/token` with the `device_code` to get the access token

> **Note:** The SPA does NOT do the token polling automatically. You must use curl or a separate client to poll the token endpoint with the `device_code`.

---

## Part 10: Complete End-to-End Test Scenarios

### Scenario 1: Happy Path — Full Device Flow

```bash
# Step 1: Start device flow
DEVICE_RESP=$(curl -s -X POST http://localhost:3000/api/device/authorization \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "client_id=YOUR_CID&scope=openid+profile",
    "clientId": "YOUR_CID",
    "clientSecret": "YOUR_SEC"
  }')

DEVICE_CODE=$(echo $DEVICE_RESP | jq -r '.deviceCode')
USER_CODE=$(echo $DEVICE_RESP | jq -r '.userCode')
VERIFICATION_URI=$(echo $DEVICE_RESP | jq -r '.verificationUri')

echo "User code: $USER_CODE"
echo "Visit: $VERIFICATION_URI"

# Step 2: Verify user code (simulating the browser interaction)
curl -s -X POST http://localhost:3000/api/device/verification \
  -H "Content-Type: application/json" \
  -d "{\"userCode\": \"$USER_CODE\"}" | jq .

# Step 3: Complete with approval
curl -s -X POST http://localhost:3000/api/device/complete \
  -H "Content-Type: application/json" \
  -d "{\"userCode\": \"$USER_CODE\", \"result\": \"AUTHORIZED\", \"subject\": \"admin\"}" | jq .

# Step 4: Exchange device_code for access token
curl -s -X POST http://localhost:3000/api/token \
  -u "YOUR_CID:YOUR_SEC" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=$DEVICE_CODE" | jq .
```

### Scenario 2: User Denies Access

```bash
# Steps 1-2: Same as Scenario 1

# Step 3: Complete with denial
curl -s -X POST http://localhost:3000/api/device/complete \
  -H "Content-Type: application/json" \
  -d "{\"userCode\": \"$USER_CODE\", \"result\": \"ACCESS_DENIED\", \"subject\": \"admin\"}" | jq .

# Step 4: Token exchange fails
curl -s -X POST http://localhost:3000/api/token \
  -u "YOUR_CID:YOUR_SEC" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=$DEVICE_CODE"
# Response: 400 { "error": "access_denied" }
```

### Scenario 3: Expired User Code

```bash
# Start device flow
DEVICE_RESP=$(curl -s -X POST http://localhost:3000/api/device/authorization \
  -H "Content-Type: application/json" \
  -d '{"parameters": "client_id=YOUR_CID&scope=openid", "clientId": "YOUR_CID", "clientSecret": "YOUR_SEC"}')

USER_CODE=$(echo $DEVICE_RESP | jq -r '.userCode')

# Wait for expiration (depends on Authlete config, default is 300s)
sleep 301

# Try to verify — should fail
curl -s -X POST http://localhost:3000/api/device/verification \
  -H "Content-Type: application/json" \
  -d "{\"userCode\": \"$USER_CODE\"}" | jq .
# Response: 400 { "action": "EXPIRED" }
```

### Scenario 4: Invalid User Code

```bash
curl -s -X POST http://localhost:3000/api/device/verification \
  -H "Content-Type: application/json" \
  -d '{"userCode": "XXXX-XXXX"}' | jq .
# Response: 404 { "action": "NOT_EXIST" }
```

### Scenario 5: Browser Flow (End User Perspective)

This is what a real end user would do:

```bash
# Step 1: Device calls the API (done by the device, not the user)
# (Device gets device_code and user_code)

# Step 2: User opens phone browser
# Visit: http://localhost:3000/device
# Enter the user code in the form

# Step 3: User sees consent page with client name and scopes
# Enters username: admin
# Enters password: password
# Clicks "Authorize"

# Step 4: User sees "Authorization successful! You can now close this window."

# Step 5: Device polls and gets the access token
```

### Scenario 6: Missing Parameters (Error)

```bash
curl -s -X POST http://localhost:3000/api/device/authorization \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# Response: 400 { "error": "invalid_request", "error_description": "Missing required body field: parameters" }
```

### Scenario 7: Transaction Failed

```bash
# Start flow, verify code, then report transaction failure
curl -s -X POST http://localhost:3000/api/device/complete \
  -H "Content-Type: application/json" \
  -d '{"userCode": "VALID_CODE", "result": "TRANSACTION_FAILED", "subject": "admin"}' | jq .
# Response: 200 { "action": "SUCCESS" }
# Device will see an error when polling
```

---

## Part 11: Error Scenarios

### Device Authorization Errors

| Scenario | HTTP Status | Error | Cause |
|----------|-------------|-------|-------|
| Missing parameters | 400 | `invalid_request` | `parameters` field is empty or missing |
| Invalid client | 401 | `invalid_client` | `client_id` or `client_secret` is wrong |
| Unknown client | 401 | `invalid_client` | Client not registered in Authlete |

### Verification Errors

| Scenario | HTTP Status | Error | Cause |
|----------|-------------|-------|-------|
| Invalid code | 404 | `NOT_EXIST` | User code doesn't match any pending flow |
| Expired code | 400 | `EXPIRED` | Code has passed its `expires_in` duration |

### Token Exchange Errors (Polling)

| Scenario | HTTP Status | Error | Device Action |
|----------|-------------|-------|---------------|
| Still pending | 400 | `authorization_pending` | Continue polling |
| Polling too fast | 400 | `slow_down` | Increase interval by 5s |
| User denied | 400 | `access_denied` | Stop polling |
| Code expired | 400 | `expired_token` | Stop polling, restart |
| Invalid device code | 400 | `invalid_grant` | Stop polling |
| Wrong client | 401 | `invalid_client` | Check credentials |

---

## Part 12: RFC 8628 Compliance Checklist

| RFC 8628 Section | Requirement | Status | Location |
|------------------|-------------|--------|----------|
| **Section 3.1** | Device Authorization Endpoint accepts POST | **Implemented** | `POST /api/device/authorization` |
| **Section 3.1** | Accepts `client_id` and `scope` | **Implemented** | `parameters` string in body |
| **Section 3.1** | Confidential clients authenticate per RFC 6749 §3.2.1 | **Implemented** | `clientId`/`clientSecret` in body or Basic auth |
| **Section 3.2** | Response includes `device_code`, `user_code`, `verification_uri`, `expires_in` | **Implemented** | Authlete SDK returns all fields |
| **Section 3.2** | `verification_uri_complete` is OPTIONAL | **Implemented** | Authlete returns if configured |
| **Section 3.2** | `interval` is OPTIONAL (default 5) | **Implemented** | Authlete returns if configured |
| **Section 3.3** | User navigates to `verification_uri` and enters `user_code` | **Implemented** | `GET /device` serves verification page |
| **Section 3.3.1** | `verification_uri_complete` can be used with QR codes | **Available** | Authlete returns the field if configured |
| **Section 3.4** | Token request uses `grant_type=urn:ietf:params:oauth:grant-type:device_code` | **Implemented** | Standard token endpoint, Authlete handles natively |
| **Section 3.4** | Client authenticates per RFC 6749 §3.2.1 | **Implemented** | Basic auth or client_id/client_secret in body |
| **Section 3.5** | `authorization_pending` error for continued polling | **Handled by Authlete** | Token endpoint returns as-is |
| **Section 3.5** | `slow_down` error with +5s interval increase | **Handled by Authlete** | Token endpoint returns as-as |
| **Section 3.5** | `access_denied` error to stop polling | **Handled by Authlete** | Token endpoint returns as-is |
| **Section 3.5** | `expired_token` error when code expires | **Handled by Authlete** | Token endpoint returns as-is |
| **Section 4** | `device_authorization_endpoint` in server metadata | **Handled by Authlete** | Included when configured |
| **Section 5.1** | Rate-limit user code attempts (brute force protection) | **Authlete handles** | Server-side rate limiting |
| **Section 5.2** | High-entropy device codes | **Authlete handles** | Generated by Authlete |
| **Section 6.1** | Usable user code format (case-insensitive, dashes) | **Implemented** | EJS template with monospace font |

---

## Part 13: Security Considerations

### User Code Brute Force

- The user code is short and human-readable (e.g., `WDJB-MJHT`), which means lower entropy
- Authlete rate-limits user code verification attempts
- The user code has a finite lifetime (`expires_in`)
- The server uses `generalLimiter` (60/min) on browser routes

### Device Code Brute Force

- The device code is a high-entropy string — not displayed to the user
- Authlete validates the device code on every token poll
- Device code is tied to a specific `client_id`

### Non-Confidential Clients

- Device clients are often public (no client_secret)
- The `client_id` parameter is required for public clients
- Additional security measures (PKCE, etc.) should be considered

### Session Spying

- The user code is displayed on the device screen
- An observer could see the code and enter it on their own device
- The consent page shows the client name and scopes so the user can verify

### CSRF Protection

- All browser routes (`GET /device`, `POST /device`, `POST /device/consent`) use CSRF tokens
- The CSRF token is generated on GET and validated on POST via the `_csrf` hidden field

---

## Part 14: Troubleshooting

### "Missing required body field: parameters"

The `parameters` field in the JSON body is required and must be a URL-encoded string:
```json
{
  "parameters": "client_id=YOUR_CID&scope=openid"
}
```

### Token exchange returns "authorization_pending" forever

- The user hasn't completed the verification flow yet
- Make sure the user visits the `verification_uri` and enters the correct `user_code`
- Check that the `user_code` hasn't expired

### Token exchange returns "expired_token"

- The device/user codes have expired (based on `expires_in`)
- Restart the entire flow by calling `/api/device/authorization` again

### Verification returns 404 "NOT_EXIST"

- The user code doesn't match any pending flow
- Check for typos (codes are case-insensitive, dashes are optional)
- The code may have already been used or expired

### Browser page shows "Invalid credentials"

- The default demo credentials are `admin` / `password`
- If `AUTH_USERS` env var is set, use those credentials instead

### Token exchange returns 401 "invalid_client"

- For confidential clients: check `client_id` and `client_secret`
- Use HTTP Basic auth: `Authorization: Basic base64(client_id:client_secret)`
- Or use `client_id` and `client_secret` in the form body

### Device flow not available in Authlete

- Ensure `urn:ietf:params:oauth:grant-type:device_code` is in `supportedGrantTypes`
- Set `deviceAuthorizationEndpoint`, `deviceVerificationUri`, `deviceFlowCodeDuration`, and `deviceFlowPollingInterval` in the Authlete service configuration
- Check `feature.gm.enabled` if using Grant Management with device flow

### QR code with `verification_uri_complete`

- The `verification_uri_complete` is only returned if `deviceVerificationUriComplete` is configured in Authlete with a `USER_CODE` placeholder
- The client can render this URL as a QR code for the user to scan with their phone camera
