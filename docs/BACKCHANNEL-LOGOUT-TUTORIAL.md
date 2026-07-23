# OpenID Connect Back-Channel Logout 1.0 — Deep Dive

A comprehensive guide to Back-Channel Logout: why it was created, the security problems it solves, how it works step by step, how Authlete implements it, and how to test it.

---

## Table of Contents

- [Part 1: Why Back-Channel Logout Exists](#part-1-why-back-channel-logout-exists)
- [Part 2: Front-Channel vs. Back-Channel](#part-2-front-channel-vs-back-channel)
- [Part 3: The Core Concepts](#part-3-the-core-concepts)
- [Part 4: The Logout Token — Deep Dive](#part-4-the-logout-token--deep-dive)
- [Part 5: How Back-Channel Logout Works (Step by Step)](#part-5-how-back-channel-logout-works-step-by-step)
- [Part 6: Authlete Console Setup](#part-6-authlete-console-setup)
- [Part 7: Server Implementation Analysis](#part-7-server-implementation-analysis)
- [Part 8: Step-by-Step curl Testing](#part-8-step-by-step-curl-testing)
- [Part 9: Receiving Incoming Logout Tokens](#part-9-receiving-incoming-logout-tokens)
- [Part 10: RP-Initiated Logout with Backchannel](#part-10-rp-initiated-logout-with-backchannel)
- [Part 11: How Back-Channel Logout Hardens Security](#part-11-how-back-channel-logout-hardens-security)
- [Part 12: Real-World Use Cases](#part-12-real-world-use-cases)
- [Part 13: Error Scenarios](#part-13-error-scenarios)
- [Part 14: Troubleshooting](#part-14-troubleshooting)
- [Appendix A: Specification References](#appendix-a-specification-references)
- [Appendix B: Server Architecture](#appendix-b-server-architecture)

---

## Part 1: Why Back-Channel Logout Exists

### The Problem

OpenID Connect defines two logout mechanisms:

1. **Front-Channel Logout** — The OP redirects the user's browser to each RP's logout URL. The RP logs the user out when the browser loads the image/iframe.
2. **Back-Channel Logout** — The OP sends a Logout Token directly to each RP's server via HTTP POST. No browser involvement.

Front-Channel Logout has serious limitations:

| Problem | What Happens |
|---------|-------------|
| **No guarantee of delivery** | If the user closes the browser before the redirect chain completes, some RPs never get logged out |
| **Slow** | Browser must sequentially load iframes/redirects for each RP — can take seconds or minutes |
| **Visible to user** | Browser redirects cause flickering, loading spinners, or blank pages |
| **Blocked by privacy tools** | Ad blockers, tracking protection, and browser privacy settings can block third-party iframes |
| **No confirmation** | RP has no way to know if the logout token was actually delivered — it just renders a 1x1 pixel |
| **Session fixation risk** | If the RP's front-channel logout endpoint doesn't properly destroy the session, the user appears logged out but the session persists |

### The Solution: Back-Channel Logout

Back-Channel Logout solves all of these by using **direct server-to-server communication**:

```
┌──────────┐                          ┌──────────┐
│    OP    │ ─── Logout Token (HTTP POST) ──→ │  RP 1   │
│          │ ─── Logout Token (HTTP POST) ──→ │  RP 2   │
│          │ ─── Logout Token (HTTP POST) ──→ │  RP 3   │
└──────────┘                          └──────────┘
     │                                      │
     │  No browser involved                 │  Each RP destroys
     │  Fast, reliable, guaranteed          │  its session server-side
     │  delivery                            │
```

### Before vs. After

| Aspect | Front-Channel | Back-Channel |
|--------|--------------|--------------|
| Delivery mechanism | Browser redirects/iframes | Direct HTTP POST server-to-server |
| Reliability | Depends on browser completing redirect chain | Guaranteed delivery (HTTP POST with retry) |
| Speed | Sequential browser loads (slow) | Parallel HTTP calls (fast) |
| User experience | Visible flickering/loading | Invisible to user |
| Ad blocker risk | High (third-party iframes) | None (server-to-server) |
| Confirmation | None (1x1 pixel) | HTTP 200 response confirms receipt |
| Token format | Logout Token (JWT) | Logout Token (JWT) |
| When to use | Simple setups, compliance requirement | Production multi-RP environments |

---

## Part 2: Front-Channel vs. Back-Channel

### Front-Channel Logout Flow

```
User clicks "Logout" in RP
  → Browser redirects to OP: /logout?id_token_hint=...
  → OP destroys its session
  → OP redirects browser to RP 1's front-channel logout URL
    → RP 1 renders 1x1 pixel (user sees nothing)
    → RP 1 should destroy its session (but may not)
  → OP redirects browser to RP 2's front-channel logout URL
    → RP 2 renders 1x1 pixel
    → RP 2 should destroy its session
  → ... (sequential, slow, unreliable)
  → OP redirects user to post_logout_redirect_uri
```

**Problems:** Sequential, slow, visible, unreliable, blocked by privacy tools.

### Back-Channel Logout Flow

```
User clicks "Logout" in RP
  → RP calls OP's logout endpoint
  → OP destroys its session
  → OP sends HTTP POST to RP 1's backchannel_logout_uri with Logout Token
    → RP 1 verifies the Logout Token
    → RP 1 destroys its session
    → RP 1 returns HTTP 200
  → OP sends HTTP POST to RP 2's backchannel_logout_uri with Logout Token
    → RP 2 verifies the Logout Token
    → RP 2 destroys its session
    → RP 2 returns HTTP 200
  → ... (parallel, fast, invisible, reliable)
  → OP redirects user to post_logout_redirect_uri
```

**Advantages:** Parallel, fast, invisible, reliable, guaranteed delivery.

### Side-by-Side Comparison

```
FRONT-CHANNEL:                          BACK-CHANNEL:
                                         OP ──POST──→ RP 1 ──200──→ OP
OP ──redirect──→ Browser ──→ RP 1       OP ──POST──→ RP 2 ──200──→ OP
  (1x1 pixel) ──→ Browser ──→ OP        OP ──POST──→ RP 3 ──200──→ OP
OP ──redirect──→ Browser ──→ RP 2       (all parallel, no browser)
  (1x1 pixel) ──→ Browser ──→ OP
OP ──redirect──→ Browser ──→ RP 3       Total time: ~100ms
  (1x1 pixel) ──→ Browser ──→ OP
Total time: ~5-30 seconds
```

---

## Part 3: The Core Concepts

### The Three Players

| Player | Role |
|--------|------|
| **OP (OpenID Provider)** | Issues Logout Tokens, sends them to RPs |
| **RP (Relying Party)** | Receives Logout Tokens, destroys local sessions |
| **End-User** | The person who clicks "Logout" |

### The Logout Token

A Logout Token is a JWT that tells an RP "please log out this user." It contains:

| Claim | Required | Description |
|-------|----------|-------------|
| `iss` | Yes | Issuer — the OP's identifier |
| `sub` | Conditionally | Subject — the user to log out. Required if `sid` is not present |
| `aud` | Yes | Audience — the RP's client ID |
| `iat` | Yes | Issued At — when the token was created |
| `exp` | Yes | Expiration — when the token becomes invalid |
| `jti` | Yes | JWT ID — unique token identifier (replay protection) |
| `sid` | Conditionally | Session ID — the session to log out. Required if `sub` is not present |
| `events` | Yes | Must contain `http://schemas.openid.net/event/backchannel-logout` |

**Key rule:** At least one of `sub` or `sid` must be present. Both may be present.

### The Back-Channel Logout URI

Each RP must register a **Back-Channel Logout URI** — an HTTP endpoint that accepts POST requests containing Logout Tokens.

```
https://rp.example.com/backchannel-logout
```

Requirements:
- Must be HTTPS (or HTTP in development)
- Must accept `application/x-www-form-urlencoded` with `logout_token` parameter
- Must return HTTP 200 on success
- Must verify the Logout Token's signature before destroying the session

### Session Destruction

When an RP receives a valid Logout Token, it must:

1. Verify the JWT signature (using the OP's JWKS)
2. Validate the claims (`iss`, `aud`, `exp`, `jti`, `events`)
3. Identify the session to destroy (via `sub` and/or `sid`)
4. Destroy the local session
5. Return HTTP 200

---

## Part 4: The Logout Token — Deep Dive

### Header

```json
{
  "alg": "ES256",
  "typ": "logout+jwt",
  "kid": "3TSs3E8v77qxPrHB5KCzwXctQj8IcAAltn18UafuOTs"
}
```

Key points:
- `typ` is `logout+jwt` (not `at+jwt` or `JWT`)
- `kid` identifies the signing key in the OP's JWKS
- `alg` indicates the signing algorithm (ES256, RS256, etc.)

### Payload

```json
{
  "iss": "https://your-as.example.com",
  "sub": "user123",
  "aud": "client001",
  "iat": 1778461562,
  "exp": 1778461682,
  "jti": "30a69ce7-144a-4179-b38b-132475d97ca8",
  "sid": "session_abc123",
  "events": {
    "http://schemas.openid.net/event/backchannel-logout": {}
  }
}
```

### The `events` Claim

The `events` claim is what distinguishes a Logout Token from other JWTs. It MUST contain:

```json
{
  "events": {
    "http://schemas.openid.net/event/backchannel-logout": {}
  }
}
```

This is the **only** event type defined by the Back-Channel Logout spec. The empty object `{}` is required as the value.

### Replay Protection

The `jti` claim provides replay protection. The RP should:

1. Store the `jti` of every Logout Token it receives
2. Reject any Logout Token with a `jti` that has been seen before
3. The `exp` claim provides natural expiration — old tokens can be discarded after they expire

### `sub` vs. `sid`

| Claim | Meaning | When to Use |
|-------|---------|-------------|
| `sub` | The user's unique identifier | When the RP identifies users by subject |
| `sid` | The session identifier | When the RP manages sessions by session ID |
| Both | Both user and session | Maximum flexibility |

The spec says:

> "At least one of `sub` or `sid` MUST be present. If the OP supports session management and issues an `sid` claim in the ID Token, the OP SHOULD include an `sid` claim in the Logout Token." — OIDC Back-Channel Logout §2.4

---

## Part 5: How Back-Channel Logout Works (Step by Step)

### Scenario: User Logs Out from RP 1

Three RPs are registered with the OP:
- `rp_1` (banking app) — has `backchannel_logout_uri`
- `rp_2` (credit card app) — has `backchannel_logout_uri`
- `rp_3` (investment app) — has `backchannel_logout_uri`

#### Step 1: User Clicks Logout

The user clicks "Logout" in RP 1.

#### Step 2: RP 1 Calls OP's Logout Endpoint

```
GET /api/logout?
  id_token_hint=eyJhbGciOiJSUzI1NiIs...
  &post_logout_redirect_uri=https://rp1.example.com/logged-out
  &state=xyz123
  &client_id=rp_1
  &backchannel=true
```

The `backchannel=true` query parameter tells the OP to fire Back-Channel Logout to all RPs.

#### Step 3: OP Identifies the User

The OP decodes the `id_token_hint` to extract the `sub` claim, or reads it from the session.

#### Step 4: OP Sends Logout Tokens to All RPs

The OP issues a Logout Token for each RP and sends it via HTTP POST:

```
POST https://rp1.example.com/backchannel-logout
Content-Type: application/x-www-form-urlencoded

logout_token=eyJhbGciOiJFUzI1NiIs...
```

```
POST https://rp2.example.com/backchannel-logout
Content-Type: application/x-www-form-urlencoded

logout_token=eyJhbGciOiJFUzI1NiIs...
```

```
POST https://rp3.example.com/backchannel-logout
Content-Type: application/x-www-form-urlencoded

logout_token=eyJhbGciOiJFUzI1NiIs...
```

Each Logout Token has:
- The **same `sub`** (same user)
- **Different `aud`** (each RP's client ID)
- The **same or different `sid`** (depends on OP implementation)

#### Step 5: Each RP Verifies and Destroys Session

Each RP:
1. Receives the HTTP POST with `logout_token`
2. Decodes the JWT
3. Verifies the signature using the OP's JWKS
4. Validates claims (`iss`, `aud`, `exp`, `events`)
5. Checks for replay (`jti`)
6. Destroys the local session for that user
7. Returns HTTP 200

#### Step 6: OP Redirects User

After all RPs have been notified (or after a timeout), the OP redirects the user:

```
https://rp1.example.com/logged-out?state=xyz123
```

### Complete Flow Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   User   │     │   RP 1   │     │    OP    │     │   RP 2   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ [1] Click      │                │                │
     │ "Logout"       │                │                │
     │ ─────────────→ │                │                │
     │                │                │                │
     │                │ [2] GET /logout?id_token_hint=...│
     │                │     &backchannel=true            │
     │                │ ─────────────→ │                │
     │                │                │                │
     │                │                │ [3] Identify   │
     │                │                │     user       │
     │                │                │                │
     │                │                │ [4a] POST      │
     │                │                │ /backchannel   │
     │                │                │ _logout        │
     │                │ ←───────────── │                │
     │                │                │                │
     │                │ [5a] Verify    │                │
     │                │ Logout Token   │                │
     │                │ + destroy      │                │
     │                │ session        │                │
     │                │                │                │
     │                │                │ [4b] POST      │
     │                │                │ /backchannel   │
     │                │                │ _logout        │
     │                │                │ ─────────────→ │
     │                │                │                │
     │                │                │                │ [5b] Verify
     │                │                │                │ Logout Token
     │                │                │                │ + destroy
     │                │                │                │ session
     │                │                │                │
     │                │                │ [6] Redirect   │
     │                │                │ to post_logout │
     │                │                │ _redirect_uri  │
     │                │                │                │
     │ [7] Redirect   │                │                │
     │ to logged-out  │                │                │
     │ page           │                │                │
     │ ←───────────── │                │                │
     │                │                │                │
```

---

## Part 6: Authlete Console Setup

### Prerequisites

- Authlete 3.0.32 or later (Back-Channel Logout support requires v3.0.32+)
- A service (authorization server) already configured
- At least one client registered

### Step 1: Enable Back-Channel Logout on the Service

1. Log in to the [Authlete Management Console](https://console.authlete.com/)
2. Navigate to **Service Settings > Endpoints > Logout**
3. Enable **Back-Channel Logout Supported** (`backchannelLogoutSupported = true`)
4. Optionally enable **Back-Channel Logout Session Supported** (`backchannelLogoutSessionSupported = true`) — this tells the OP to include `sid` in Logout Tokens
5. Click **Save Changes**

### Step 2: Configure Each Client

For **each RP** that should receive Logout Tokens:

1. Navigate to the client's settings
2. Go to **Endpoints > Logout**
3. Set the **Back-Channel Logout URI** (`backchannelLogoutUri`) — e.g., `https://rp.example.com/backchannel-logout`
4. Optionally enable **Back-Channel Logout Session Required** (`backchannelLogoutSessionRequired = true`) — this requires the Logout Token to include `sid`
5. Click **Save Changes**

### Step 3: Set JWKS_URI (for receiving logout tokens)

If your server needs to **receive** and **verify** incoming Logout Tokens from other OPs:

1. Set the `JWKS_URI` environment variable to your OP's JWKS endpoint
2. The server uses this to fetch signing keys for Logout Token verification

```
JWKS_URI=https://your-as.example.com/jwks
```

### Summary Checklist

| Setting | Location | Value |
|---------|----------|-------|
| Back-Channel Logout Supported | Service Settings > Endpoints > Logout | Enabled |
| Back-Channel Logout Session Supported | Service Settings > Endpoints > Logout | Enabled (recommended) |
| Client Back-Channel Logout URI | Client Settings > Endpoints > Logout | Set per client |
| Client Back-Channel Logout Session Required | Client Settings > Endpoints > Logout | Optional per client |
| JWKS_URI | Environment variable | Set for receiving logout tokens |

---

## Part 7: Server Implementation Analysis

### Architecture Overview

This server implements Back-Channel Logout with two distinct roles:

1. **As OP (issuer)** — Generates and delivers Logout Tokens to RPs
2. **As RP (receiver)** — Receives and verifies Logout Tokens from other OPs

### As OP: Issuing Logout Tokens

#### The Authlete API (Not SDK)

The Authlete TypeScript SDK v1.1.6 does **not** expose the Back-Channel Logout API. The server uses **raw `fetch()`** to call Authlete's REST API directly:

```typescript
// backchannel-logout.service.ts:28
const url = `${this.config.baseUrl}/api/${this.config.serviceId}/backchannel/logout/token`;
```

This is one of only 3 services in the codebase that use raw `fetch()` instead of the SDK.

#### Three Operations

| Endpoint | Method | What It Does |
|----------|--------|-------------|
| `POST /api/backchannel_logout/issue` | Issue only | Generates a Logout Token and returns it (does not deliver) |
| `POST /api/backchannel_logout/deliver` | Issue + Deliver | Generates a Logout Token and POSTs it to the client's `backchannel_logout_uri` |
| `POST /api/backchannel_logout/deliver-all` | Issue + Deliver to All | Lists all clients with `backchannel_logout_uri`, generates and delivers Logout Tokens to each |

All three require admin Basic authentication (`MGMT_CLIENT_ID` / `MGMT_CLIENT_SECRET`).

#### The Deliver-All Algorithm

`issueAndDeliverToAll()` (lines 114-174) implements a paginated broadcast:

1. Lists clients from Authlete (100 per page)
2. Filters to clients with `backchannelLogoutUri` configured
3. For each client: generates a Logout Token, POSTs it to the client's `backchannelLogoutUri`
4. Collects results (success/failure per client)
5. Returns an array of delivery results

### As RP: Receiving Logout Tokens

#### The Incoming Endpoint

`POST /api/backchannel_logout` (`logout.controller.ts:21-89`) handles incoming Logout Tokens:

1. Extracts `logout_token` from the POST body
2. Decodes the JWT header to get the `kid`
3. Fetches the OP's JWKS (via `JWKS_URI` env var)
4. Verifies the JWT signature (RS256 or ES256)
5. Validates the `events` claim contains `http://schemas.openid.net/event/backchannel-logout`
6. Extracts the `sub` claim
7. Destroys the local session
8. Returns HTTP 200

#### The JWKS Client

`jwksClient.ts` implements a cached JWKS fetcher:

- Fetches the OP's JWKS endpoint
- Caches keys for 5 minutes (300 seconds)
- Converts JWK to PEM format for `jsonwebtoken.verify()`
- Supports both RSA and EC keys

### RP-Initiated Logout with Backchannel

`logout.service.ts` extends RP-Initiated Logout with Back-Channel support:

When the user visits `/api/logout?backchannel=true`, the server:

1. Identifies the user (from session or `id_token_hint`)
2. **Before destroying the session**, fires `issueAndDeliverToAll(subject)` to notify all RPs
3. Destroys the local session
4. Redirects to `post_logout_redirect_uri`

The order matters: Back-Channel delivery happens **before** session destruction so the `sub` is still available.

---

## Part 8: Step-by-Step curl Testing

### Prerequisites

- Server running on `http://localhost:3000`
- Admin credentials (`MGMT_CLIENT_ID` and `MGMT_CLIENT_SECRET`)
- A client with `backchannel_logout_uri` configured

### Operation 1: Issue a Logout Token

Generate a Logout Token for a specific client without delivering it:

```bash
curl -v -X POST http://localhost:3000/api/backchannel_logout/issue \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'YOUR_MGMT_ID:YOUR_MGMT_SECRET' | base64)" \
  -d '{
    "clientIdentifier": "your_client_id",
    "subject": "user123",
    "sessionId": "session_abc123"
  }'
```

**Expected Response:**

```json
{
  "action": "OK",
  "logoutToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6ImxvZ291dCtqd3QiLCJraWQiOiIzVFNzM0U4djc3cXhQckhCNUtDendYY3RRajhJY0FBbHRuMThVYWZ1T1RzIn0...",
  "backchannelLogoutUri": "https://rp.example.com/backchannel-logout",
  "resultCode": "A518001",
  "resultMessage": "[A518001] A Logout Token for the client 'your_client_id' was issued successfully."
}
```

**Decode the Logout Token:**

```bash
# Extract the payload (middle part) of the JWT
echo "eyJpc3MiOiJodHRwczovL3lvdXItYXMuZXhhbXBsZS5jb20iLCJzdWIiOiJ1c2VyMTIzIiwiYXVkIjoieW91cl9jbGllbnRfaWQiLCJpYXQiOjE3Nzg0NjE1NjIsImV4cCI6MTc3ODQ2MTY4MiwianRpIjoiMzBhNjljZTctMTQ0YS00MTc5LWIzOGItMTMyNDc1ZDk3Y2E4Iiwic2lkIjoic2Vzc2lvbl9hYmMxMjMiLCJldmVudHMiOnsiaHR0cDovL3NjaGVtYXMub3BlbmlkLm5ldC9ldmVudC9iYWNrY2hhbm5lbC1sb2dvdXQiOnt9fX0" | base64 -d 2>/dev/null
```

### Operation 2: Issue and Deliver to One Client

Generate a Logout Token and immediately POST it to the client's `backchannel_logout_uri`:

```bash
curl -v -X POST http://localhost:3000/api/backchannel_logout/deliver \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'YOUR_MGMT_ID:YOUR_MGMT_SECRET' | base64)" \
  -d '{
    "clientIdentifier": "your_client_id",
    "subject": "user123",
    "sessionId": "session_abc123"
  }'
```

**Expected Response:**

```json
{
  "clientId": "your_client_id",
  "success": true,
  "statusCode": 200,
  "backchannelLogoutUri": "https://rp.example.com/backchannel-logout"
}
```

**If the client has no `backchannel_logout_uri`:**

```json
{
  "clientId": "your_client_id",
  "success": false,
  "error": "Client has no backchannelLogoutUri configured",
  "backchannelLogoutUri": null
}
```

### Operation 3: Issue and Deliver to All Clients

Generate and deliver Logout Tokens to **every** client with a `backchannel_logout_uri` configured:

```bash
curl -v -X POST http://localhost:3000/api/backchannel_logout/deliver-all \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'YOUR_MGMT_ID:YOUR_MGMT_SECRET' | base64)" \
  -d '{
    "subject": "user123",
    "sessionId": "session_abc123"
  }'
```

**Expected Response:**

```json
[
  {
    "clientId": "rp_1",
    "clientName": "Banking App",
    "success": true,
    "statusCode": 200,
    "backchannelLogoutUri": "https://rp1.example.com/backchannel-logout"
  },
  {
    "clientId": "rp_2",
    "clientName": "Credit Card App",
    "success": true,
    "statusCode": 200,
    "backchannelLogoutUri": "https://rp2.example.com/backchannel-logout"
  },
  {
    "clientId": "rp_3",
    "clientName": "Investment App",
    "success": false,
    "error": "connect ECONNREFUSED 127.0.0.1:443",
    "backchannelLogoutUri": "https://rp3.example.com/backchannel-logout"
  }
]
```

### Operation 4: RP-Initiated Logout with Backchannel

Trigger logout for all RPs via the RP-Initiated Logout endpoint:

```bash
curl -v "http://localhost:3000/api/logout?\
id_token_hint=eyJhbGciOiJSUzI1NiIs...\
&post_logout_redirect_uri=http://localhost:3000/logged-out\
&state=xyz123\
&client_id=your_client_id\
&backchannel=true"
```

This:
1. Decodes the `id_token_hint` to get the `sub`
2. Fires `issueAndDeliverToAll(subject)` — delivers Logout Tokens to all RPs
3. Destroys the local session
4. Redirects to `post_logout_redirect_uri?state=xyz123`

### Operation 5: Receive an Incoming Logout Token

Simulate receiving a Logout Token from another OP:

```bash
# First, get a Logout Token from the issue endpoint
LOGOUT_TOKEN=$(curl -s -X POST http://localhost:3000/api/backchannel_logout/issue \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'YOUR_MGMT_ID:YOUR_MGMT_SECRET' | base64)" \
  -d '{"clientIdentifier": "your_client_id", "subject": "user123"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['logoutToken'])")

# Then, send it to the backchannel_logout endpoint
curl -v -X POST http://localhost:3000/api/backchannel_logout \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "logout_token=$LOGOUT_TOKEN"
```

**Expected Response:** HTTP 200 (if JWKS verification succeeds) or HTTP 400 (if JWKS_URI is not configured)

---

## Part 9: Receiving Incoming Logout Tokens

### When This Matters

Your server acts as an RP when it needs to receive Logout Tokens from **other** OpenID Providers. This happens when:

- Your app is a client of an external OP (e.g., Google, Azure AD, Authlete)
- The external OP supports Back-Channel Logout
- You want your server to destroy sessions when users log out from the external OP

### The Verification Process

When `POST /api/backchannel_logout` receives a Logout Token:

```
1. Extract logout_token from POST body
   ↓
2. Decode JWT header → get kid
   ↓
3. Fetch OP's JWKS (cached for 5 min)
   ↓
4. Find key by kid → convert JWK to PEM
   ↓
5. Verify JWT signature (RS256 or ES256)
   ↓
6. Validate events claim:
   "http://schemas.openid.net/event/backchannel-logout" must exist
   ↓
7. Extract sub claim
   ↓
8. Destroy local session for that subject
   ↓
9. Return HTTP 200
```

### Configuration

Set the `JWKS_URI` environment variable to your OP's JWKS endpoint:

```bash
# In server/.env
JWKS_URI=https://your-op.example.com/.well-known/jwks.json
```

If `JWKS_URI` is not set, the server returns an error when receiving Logout Tokens.

### Security Checks

| Check | Description |
|-------|-------------|
| JWT signature | Verified against OP's JWKS public keys |
| `events` claim | Must contain `http://schemas.openid.net/event/backchannel-logout` |
| `exp` claim | JWT must not be expired (checked by `jsonwebtoken.verify()`) |
| Algorithm | Only RS256 and ES256 are accepted |
| `jti` replay | Not implemented — the server does not track seen `jti` values |

---

## Part 10: RP-Initiated Logout with Backchannel

### The `backchannel=true` Parameter

The RP-Initiated Logout endpoint (`GET /api/logout`) supports an optional `backchannel=true` query parameter. When set:

1. The server identifies the user (from session or `id_token_hint`)
2. **Before destroying the session**, it calls `issueAndDeliverToAll(subject)`
3. Each client with a `backchannel_logout_uri` receives a Logout Token
4. The local session is destroyed
5. The user is redirected to `post_logout_redirect_uri`

### Why Before Session Destruction?

The `sub` is extracted from the session or `id_token_hint`. If the session is destroyed first, the `sub` would be lost. By delivering Logout Tokens first, the server ensures all RPs are notified while the user identity is still available.

### Flow Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│   User   │     │   RP 1   │     │    OP    │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │ [1] GET /logout?backchannel=true│
     │     &id_token_hint=...          │
     │ ─────────────────────────────→  │
     │                │                │
     │                │ [2] Decode     │
     │                │ id_token_hint  │
     │                │ → get sub      │
     │                │                │
     │                │ [3] issueAnd   │
     │                │ DeliverToAll   │
     │                │ (notify all    │
     │                │  RPs)          │
     │                │                │
     │                │ [4] Destroy    │
     │                │ local session  │
     │                │                │
     │ [5] Redirect   │                │
     │ to post_logout │                │
     │ _redirect_uri  │                │
     │ ←─────────────────────────────  │
```

---

## Part 11: How Back-Channel Logout Hardens Security

### 1. Guaranteed Delivery

Front-Channel Logout relies on the browser completing a redirect chain. If the user closes the tab, some RPs never get logged out. Back-Channel uses HTTP POST with retry semantics — the OP knows exactly which RPs received the Logout Token.

### 2. No Browser Dependency

Ad blockers, tracking protection, and privacy-focused browser settings can block third-party iframes. Back-Channel Logout bypasses all of this — it's pure server-to-server communication.

### 3. Invisible to User

No flickering, no loading spinners, no blank pages. The logout happens silently in the background while the user sees a clean redirect to the logged-out page.

### 4. Cryptographic Verification

Each Logout Token is a signed JWT. The RP verifies the signature using the OP's JWKS. This prevents:
- **Forged Logout Tokens** — An attacker can't create a valid Logout Token without the OP's signing key
- **Tampered Claims** — The signature covers the entire payload, so `sub`, `sid`, and `aud` can't be modified
- **Replay Attacks** — The `jti` claim provides uniqueness (RP should track seen `jti` values)

### 5. Session-Level Granularity

The `sid` claim allows the OP to target a **specific session** rather than all sessions for a user. This is important when:
- A user has multiple active sessions (e.g., different devices)
- Only one session should be terminated (e.g., user logs out from one device)

### 6. No Token Leakage

Unlike Front-Channel Logout where the `id_token` is sent in the URL (visible in browser history, server logs, referrer headers), Back-Channel Logout Tokens are sent via HTTP POST body — never visible in URLs.

### 7. Immediate Revocation

The OP can immediately revoke all tokens associated with a session by notifying all RPs. With Front-Channel, RPs may continue accepting tokens until their local session expires.

### Security Comparison

| Attack Vector | Front-Channel | Back-Channel |
|--------------|---------------|--------------|
| Forged logout | Browser-based, harder to forge | JWT signature prevents forgery |
| Replay attack | No built-in protection | `jti` claim + `exp` expiration |
| Token leakage in URL | Possible (id_token in query) | Impossible (POST body) |
| Session fixation | RP may not properly destroy session | RP must verify JWT before destroying |
| Blocked by ad blockers | Yes | No |
| Timing attacks | Slow (sequential redirects) | Fast (parallel HTTP POSTs) |

---

## Part 12: Real-World Use Cases

### 1. Multi-Application SSO Logout

A bank with 5 mobile apps. When the user logs out from the main banking app:
- All 5 apps must be logged out immediately
- Back-Channel Logout ensures all RPs receive the notification
- No browser redirects needed (mobile apps don't use browsers for this)

### 2. Enterprise SSO

A company with 10+ SaaS applications. When an employee logs out from the identity provider:
- All SaaS apps must terminate the session
- Back-Channel Logout delivers Logout Tokens to each app's server
- IT can verify which apps received the notification (delivery confirmation)

### 3. Healthcare Platform

A hospital system with patient portal, telehealth, pharmacy, and lab apps. When a patient logs out:
- All apps must terminate immediately (HIPAA compliance)
- Back-Channel Logout provides guaranteed delivery with audit trail
- No reliance on browser behavior

### 4. Government Services

A government portal with tax, benefits, licensing, and voting apps. When a citizen logs out:
- All services must terminate the session
- Back-Channel Logout works across all devices and browsers
- Compliance with government security requirements

---

## Part 13: Error Scenarios

### Error 1: Missing `logout_token`

**When:** The POST body doesn't contain `logout_token`.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "Missing logout_token"
}
```

### Error 2: Invalid Logout Token Format

**When:** The `logout_token` is not a valid JWT.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "Invalid logout token"
}
```

### Error 3: Missing Back-Channel Logout Event

**When:** The `events` claim doesn't contain `http://schemas.openid.net/event/backchannel-logout`.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "Token is not a backchannel logout token"
}
```

### Error 4: Signature Verification Failed

**When:** The JWT signature doesn't match any key in the OP's JWKS, or `JWKS_URI` is not configured.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "Invalid logout token"
}
```

### Error 5: Client Has No `backchannel_logout_uri`

**When:** The deliver endpoint is called for a client that doesn't have a Back-Channel Logout URI configured.

```json
{
  "clientId": "client_1",
  "success": false,
  "error": "Client has no backchannelLogoutUri configured",
  "backchannelLogoutUri": null
}
```

### Error 6: RP Not Reachable

**When:** The HTTP POST to the RP's `backchannel_logout_uri` fails (connection refused, timeout, etc.).

```json
{
  "clientId": "client_1",
  "success": false,
  "error": "connect ECONNREFUSED 127.0.0.1:443",
  "backchannelLogoutUri": "https://rp.example.com/backchannel-logout"
}
```

### Error 7: Missing `clientIdentifier`

**When:** The issue or deliver endpoint is called without `clientIdentifier`.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "Missing required field: clientIdentifier"
}
```

### Error 8: Missing `subject` and `sessionId`

**When:** The deliver-all endpoint is called without either `subject` or `sessionId`.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_request",
  "error_description": "At least one of subject or sessionId is required"
}
```

---

## Part 14: Troubleshooting

### Problem: Deliver-all returns empty array

**Cause:** No clients have `backchannel_logout_uri` configured.

**Fix:** Configure `backchannelLogoutUri` on each client in the Authlete Console.

### Problem: Logout token signature verification fails

**Cause:** `JWKS_URI` is not set or points to the wrong endpoint.

**Fix:** Set `JWKS_URI` in `server/.env` to your OP's JWKS endpoint:
```
JWKS_URI=https://your-op.example.com/.well-known/jwks.json
```

### Problem: Backchannel logout not triggered on logout

**Cause:** The `backchannel=true` parameter is not included in the logout URL.

**Fix:** Add `&backchannel=true` to the logout URL:
```
GET /api/logout?id_token_hint=...&backchannel=true
```

### Problem: Clients not receiving Logout Tokens

**Cause:** The client's `backchannel_logout_uri` is not configured or is incorrect.

**Fix:** Verify the client's Back-Channel Logout URI in the Authlete Console. Use the Get Client API to check:
```bash
curl http://localhost:3000/api/client/get/YOUR_CLIENT_ID | python3 -m json.tool | grep backchannel
```

### Problem: Logout token has no `sid` claim

**Cause:** `backchannelLogoutSessionSupported` is not enabled on the service.

**Fix:** Enable it in the Authlete Console under Service Settings > Endpoints > Logout.

---

## Appendix A: Specification References

| Specification | Full Name | Section |
|--------------|-----------|---------|
| Back-Channel Logout | OpenID Connect Back-Channel Logout 1.0 | Full spec |
| OIDC Core | OpenID Connect Core 1.0 | §12 (Logout) |
| OIDC Discovery | OpenID Connect Discovery 1.0 | §7.2 (Server Metadata) |

### Authlete Metadata

| Service Property | Description |
|-----------------|-------------|
| `backchannelLogoutSupported` | Whether the service supports Back-Channel Logout |
| `backchannelLogoutSessionSupported` | Whether Logout Tokens include `sid` claim |

### Client Metadata

| Client Property | Description |
|----------------|-------------|
| `backchannelLogoutUri` | The RP's Back-Channel Logout endpoint URL |
| `backchannelLogoutSessionRequired` | Whether Logout Tokens must include `sid` |

### IANA Registration

| Item | Value |
|------|-------|
| JWT Typ | `logout+jwt` |
| Event URI | `http://schemas.openid.net/event/backchannel-logout` |
| Parameter | `logout_token` |

---

## Appendix B: Server Architecture

### Route Map

```
POST /api/backchannel_logout/issue     → backchannelLogoutIssueController
POST /api/backchannel_logout/deliver   → backchannelLogoutDeliverController
POST /api/backchannel_logout/deliver-all → backchannelLogoutDeliverAllController
POST /api/backchannel_logout           → opBackchannelLogout (incoming)
GET  /api/logout?backchannel=true      → rpInitiatedLogout (with backchannel)
```

### Service Dependencies

```
backchannel-logout.controller.ts
  └── backchannel-logout.service.ts
        └── Authlete REST API: /api/{serviceId}/backchannel/logout/token
            (raw fetch — SDK v1.1.6 does not expose this API)

logout.controller.ts
  └── opBackchannelLogout()
        ├── jwt.decode() + jwt.verify()
        ├── JwksClient (cached JWKS fetch)
        └── req.session.destroy()

logout.service.ts
  └── rpInitiatedLogoutService
        └── backchannel-logout.service.ts (for deliver-all)
```

### Authentication

All three backchannel_logout endpoints require admin Basic authentication:

```
Authorization: Basic base64(MGMT_CLIENT_ID:MGMT_CLIENT_SECRET)
```

If `MGMT_CLIENT_ID` and `MGMT_CLIENT_SECRET` are not set in the environment, all management routes are unprotected (no auth required).

### Client SPA

The SPA includes a Back-Channel Logout testing tool at `/backchannel-logout`:

| Feature | Description |
|---------|-------------|
| Issue Token | Generates a Logout Token for a specific client |
| Issue & Deliver | Generates and delivers to one client |
| Issue & Deliver All | Broadcasts to all clients with `backchannel_logout_uri` |
| JWT Decoder | Automatically decodes and displays the Logout Token payload |
| Admin Auth | Requires MGMT Client ID/Secret for authentication |
