# CIBA (Client-Initiated Backchannel Authentication)

> **The short version:** CIBA lets a device (like a POS terminal or call center screen) initiate authentication without a browser redirect. The user approves on their own phone, and the device gets tokens via server-side polling.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Part 1: What is CIBA?](#part-1-what-is-ciba)
- [Part 2: Authlete Setup](#part-2-authlete-setup)
- [Part 3: Delivery Modes](#part-3-delivery-modes)
- [Part 4: Step-by-Step Flow](#part-4-step-by-step-flow)
- [Part 5: SPA Testing Tool](#part-5-spa-testing-tool)
- [Part 6: Failure Demonstrations](#part-6-failure-demonstrations)
- [Part 7: Troubleshooting](#part-7-troubleshooting)
- [Appendix: Server Architecture](#appendix-server-architecture)

---

## Quick Start

Get a working CIBA POLL flow in 5 minutes.

### 1. Enable CIBA in Authlete

| Setting | Path | Value |
|---------|------|-------|
| Supported Backchannel Token Delivery Modes | **Service Settings → Endpoints → CIBA** | Check `POLL` |
| Backchannel Authentication Endpoint | Same page | `http://localhost:3000/api/ciba/authentication` |
| Auth Req ID Duration | Same page | `600` (10 minutes) |
| Polling Interval | Same page | `5` (seconds) |

### 2. Create a Client

1. **Clients → Create** → Client Type: `Confidential`
2. Token Auth Method: `CLIENT_SECRET_BASIC`
3. CIBA tab → Token Delivery Mode: `POLL`
4. Save and note `clientId` and `clientSecret`

### 3. Start Servers

```bash
npm --prefix server run dev
npm --prefix client run dev
```

### 4. Test in SPA

1. Open `http://localhost:3001` → **CIBA** in sidebar
2. **Authentication tab**: `login_hint=admin&scope=openid` + credentials → **Run**
3. **Issue tab**: **Run** (ticket auto-filled)
4. **Complete tab**: **Run** (defaults: `AUTHORIZED`, subject `admin`)
5. **Poll Token tab**: **Poll Token** → tokens

---

## Part 1: What is CIBA?

### The Problem: No Browser Redirect

Imagine you're at a hotel check-in kiosk. You need to sign in, but:
- Typing your password on a shared touchscreen is risky
- The kiosk can't redirect to your bank's login page
- You're holding your phone, which has your banking app

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    subgraph Traditional["Traditional OAuth"]
        T1["Browser"] -->|"Redirect"| T2["Auth Server"]
        T2 -->|"Redirect back"| T1
    end
    subgraph CIBA["CIBA (Decoupled)"]
        C1["Kiosk"] -->|"Server-to-server"| C2["Auth Server"]
        C2 -->|"Push to phone"| C3["User's Phone"]
    end
```

### The Solution: Decouple the Flow

CIBA splits the "consumption device" (kiosk) from the "authentication device" (phone):

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Kiosk as 🖥️ Kiosk
    participant Server as Auth Server
    participant Phone as 📱 Phone
    participant User as 👤 User

    Kiosk->>Server: "I need to authenticate user X"
    Server->>Phone: "Hey, approve login for kiosk?"
    User->>Phone: Opens app, approves
    Server->>Kiosk: "Done! Here's the token"
```

### When to Use CIBA

| Scenario | Use CIBA? | Why |
|----------|:---------:|-----|
| Call center authentication | **Yes** | Operator on desktop, user on phone |
| POS terminal | **Yes** | Payment app on user's phone |
| Smart TV | **Yes** | No keyboard for password entry |
| ATM/Banking | **Yes** | Approve transaction on banking app |
| SPA with browser | **No** | Standard OAuth works fine |

### Three Delivery Modes

| Mode | How It Works | Best For |
|------|-------------|----------|
| **POLL** | Device polls server for tokens | Simplest, no push infrastructure |
| **PING** | Server pings device, then device polls | Moderate real-time needs |
| **PUSH** | Server pushes tokens directly to device | Lowest latency |

---

## Part 2: Authlete Setup

### Service-Level Configuration

In the [Authlete Console](https://console.authlete.com/), configure your service:

**Step 1: Enable CIBA grant type**

| Tab | Setting | Value |
|-----|---------|-------|
| Endpoints → Global Settings | Supported Grant Types | Enable `CIBA` |

**Step 2: Configure CIBA endpoint and parameters**

| Tab | Setting | Value |
|-----|---------|-------|
| Endpoints → CIBA | Supported Backchannel Token Delivery Modes | Check `POLL` (and `PING`/`PUSH` if needed) |
| Endpoints → CIBA | Backchannel Authentication Endpoint | `http://localhost:3000/api/ciba/authentication` |
| Endpoints → CIBA | Auth Req ID Duration | `600` (10 minutes) |
| Endpoints → CIBA | Polling Interval | `5` (seconds) |

**Step 3: Enable CLIENT_SECRET_BASIC**

| Tab | Setting | Value |
|-----|---------|-------|
| Endpoints → Token | Supported Client Authentication Methods | Enable `CLIENT_SECRET_BASIC` |

> **Critical Rule:** The client authentication method at the backchannel authentication endpoint **must be the same** as at the token endpoint. Both endpoints must use the same method. See [Authlete CIBA Guide §2.2](https://developers.authlete.com/guides/flows-and-protocols/grant-types-and-token-flows/how-to-implement-ciba-with-authlete).

### Client-Level Configuration

| Tab | Setting | Value | Why |
|-----|---------|-------|-----|
| Basic | Client Type | `Confidential` | CIBA requires confidential clients |
| Endpoints → Token | Client Authentication Method | `CLIENT_SECRET_BASIC` | Must match service's supported methods |
| CIBA | Token Delivery Mode | `POLL` | Start simple (no notification endpoint needed) |
| CIBA | Notification Endpoint | *(leave empty for POLL)* | Required only for PING/PUSH modes |
| CIBA | User Code Required | `Not Required` | Simplify initial testing |

> **Why CLIENT_SECRET_BASIC?** Authlete's own [CIBA implementation guide](https://developers.authlete.com/guides/flows-and-protocols/grant-types-and-token-flows/how-to-implement-ciba-with-authlete) uses `client_secret_basic` exclusively. The client sends credentials via `Authorization: Basic` header, not in the request body. This is also more secure — RFC 6749 states authorization servers SHOULD prefer Basic auth over POST.

### Verify Configuration

```bash
curl http://localhost:3000/api/.well-known/openid-configuration | jq '.backchannel_authentication_endpoint'
```

---

## Part 3: Delivery Modes

### POLL Mode (Simplest)

The client polls the token endpoint until tokens are available.

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client as 🖥️ Client
    participant Server as Auth Server
    participant Phone as 📱 Phone

    Client->>Server: Backchannel Auth Request
    Server->>Client: auth_req_id
    Server->>Phone: "Approve login?"
    loop Polling (every 5s)
        Client->>Server: Token request
        Server->>Client: authorization_pending
    end
    Phone->>Server: User approves
    Client->>Server: Token request
    Server->>Client: access_token + id_token
```

**Pros:** Simple, no push infrastructure needed
**Cons:** Higher latency (poll interval)

### PING Mode

Server sends a lightweight notification when auth completes.

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client as 🖥️ Client
    participant Server as Auth Server
    participant Phone as 📱 Phone

    Client->>Server: Backchannel Auth Request
    Server->>Client: auth_req_id
    Server->>Phone: "Approve login?"
    Phone->>Server: User approves
    Server->>Client: PING (notification)
    Client->>Server: Token request
    Server->>Client: access_token + id_token
```

**Pros:** No unnecessary polling
**Cons:** Requires notification endpoint

### PUSH Mode

Server pushes tokens directly to client.

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client as 🖥️ Client
    participant Server as Auth Server
    participant Phone as 📱 Phone

    Client->>Server: Backchannel Auth Request
    Server->>Client: auth_req_id
    Server->>Phone: "Approve login?"
    Phone->>Server: User approves
    Server->>Client: access_token + id_token (pushed)
```

**Pros:** Lowest latency
**Cons:** Requires notification endpoint + token handling

### Mode Comparison

| Feature | POLL | PING | PUSH |
|---------|:----:|:----:|:----:|
| Notification endpoint | No | Yes | Yes |
| Client polls | Yes | Yes | No |
| Latency | Highest | Medium | Lowest |
| Complexity | Lowest | Medium | Highest |

---

## Part 4: Step-by-Step Flow

### Complete POLL Mode Flow

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant Client as 🖥️ Client
    participant Server as Express
    participant Authlete
    participant Phone as 📱 Phone

    Note over Client,Phone: Step 1: Backchannel Auth Request
    Client->>Server: POST /api/ciba/authentication<br/>login_hint=admin&scope=openid
    Server->>Authlete: ciba.processAuthentication()
    Authlete->>Server: ticket + hint
    Server->>Client: 200 { ticket }

    Note over Client,Phone: Step 2: Issue Auth Req ID
    Client->>Server: POST /api/ciba/issue<br/>ticket
    Server->>Authlete: ciba.issue()
    Authlete->>Server: auth_req_id + interval
    Server->>Client: 200 { auth_req_id, expiresIn, interval }

    Note over Client,Phone: Step 3: User Approves on Phone
    Server->>Phone: Notification
    Phone->>User: Shows approval screen
    User->>Phone: Approves
    Phone->>Server: User decision

    Note over Client,Phone: Step 4: Complete Authentication
    Client->>Server: POST /api/ciba/complete<br/>ticket + AUTHORIZED + admin
    Server->>Authlete: ciba.complete()
    Authlete->>Server: NO_ACTION
    Server->>Client: 200 { action: NO_ACTION }

    Note over Client,Phone: Step 5: Poll for Tokens
    loop Until tokens available
        Client->>Server: POST /api/token<br/>grant_type=ciba&auth_req_id=...
        Server->>Authlete: token.process()
        Authlete->>Server: authorization_pending
        Server->>Client: 400 { error: authorization_pending }
    end
    Client->>Server: POST /api/token
    Server->>Authlete: token.process()
    Authlete->>Server: access_token + id_token
    Server->>Client: 200 { access_token, id_token }
```

### What Just Happened?

1. **Client** told the server: "I need to authenticate user X (hint: `admin`)"

2. **Authlete** validated the request and returned a `ticket` — an opaque identifier for this flow

3. **Server** issued an `auth_req_id` — what the client uses to poll for tokens

4. **User** approved on their phone

5. **Client** called `complete` to record the approval

6. **Client** polled the token endpoint until tokens were available

### API Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|:-------------:|
| `/api/ciba/authentication` | POST | Start CIBA flow | Client creds |
| `/api/ciba/issue` | POST | Get `auth_req_id` | No |
| `/api/ciba/complete` | POST | Record approval | No |
| `/api/ciba/fail` | POST | Record denial | No |
| `/api/token` | POST | Exchange for tokens | Client creds |

### Request/Response Examples

**Step 1: Authentication Request**

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid&binding_message=Approve+kiosk+login",
    "clientId": "YOUR_CID",
    "clientSecret": "YOUR_SEC"
  }'
```

**Response:**
```json
{
  "action": "USER_IDENTIFICATION",
  "ticket": "ticket-abc123",
  "hintType": "LOGIN_HINT",
  "hint": "admin",
  "deliveryMode": "POLL",
  "scopes": [{"name": "openid"}],
  "clientName": "My Client"
}
```

**Step 2: Issue Auth Req ID**

```bash
curl -X POST http://localhost:3000/api/ciba/issue \
  -H "Content-Type: application/json" \
  -d '{"ticket": "ticket-abc123"}'
```

**Response:**
```json
{
  "action": "OK",
  "authReqId": "auth_req_id_xyz789",
  "expiresIn": 600,
  "interval": 5
}
```

**Step 3: Complete (User Approved)**

```bash
curl -X POST http://localhost:3000/api/ciba/complete \
  -H "Content-Type: application/json" \
  -d '{"ticket": "ticket-abc123", "result": "AUTHORIZED", "subject": "admin"}'
```

**Response:**
```json
{
  "action": "NO_ACTION"
}
```

**Step 4: Poll for Tokens**

```bash
curl -X POST http://localhost:3000/api/token \
  -u "YOUR_CID:YOUR_SEC" \
  -d "grant_type=urn:openid:params:grant-type:ciba&auth_req_id=auth_req_id_xyz789"
```

**While pending:**
```json
{"error": "authorization_pending", "interval": 5}
```

**On success:**
```json
{
  "access_token": "eyJraWQ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJraWQ..."
}
```

---

## Part 5: SPA Testing Tool

### Accessing CIBA

1. Start servers
2. Open `http://localhost:3001`
3. Click **CIBA** in sidebar

### Five Tabs

| Tab | Purpose | Key Fields |
|-----|---------|------------|
| **Authentication** | Start CIBA flow | Parameters, Client ID, Secret |
| **Issue** | Get `auth_req_id` | Ticket (auto-filled) |
| **Fail** | Record denial | Ticket, Reason |
| **Complete** | Record approval | Ticket, Result, Subject |
| **Poll Token** | Get tokens | `auth_req_id` (auto-filled) |

### Testing Workflow

1. **Authentication**: `login_hint=admin&scope=openid` → **Run** → get `ticket`
2. **Issue**: **Run** → get `auth_req_id`
3. **Complete**: **Run** (defaults: `AUTHORIZED`, `admin`)
4. **Poll Token**: **Poll Token** → get tokens

> **Note:** The SPA doesn't poll automatically. Click **Poll Token** manually after each interval.

---

## Part 6: Failure Demonstrations

### No Client Credentials

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{"parameters": "login_hint=admin&scope=openid"}'
```

**Response:**
```json
HTTP/1.1 401 Unauthorized
{
  "action": "UNAUTHORIZED",
  "responseContent": "..."
}
```

### Wrong Client Secret

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=admin&scope=openid",
    "clientId": "YOUR_CID",
    "clientSecret": "wrong_secret"
  }'
```

**Response:**
```json
HTTP/1.1 401 Unauthorized
{
  "action": "UNAUTHORIZED"
}
```

### Unknown User

```bash
curl -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": "login_hint=nonexistent&scope=openid",
    "clientId": "YOUR_CID",
    "clientSecret": "YOUR_SEC"
  }'
```

Then call fail:
```bash
curl -X POST http://localhost:3000/api/ciba/fail \
  -H "Content-Type: application/json" \
  -d '{"ticket": "YOUR_TICKET", "reason": "UNKNOWN_USER_ID"}'
```

**Response:**
```json
HTTP/1.1 403 Forbidden
{
  "action": "FORBIDDEN"
}
```

### Security Summary

| Attack | Protected By | Result |
|--------|-------------|:------:|
| No client auth | Authlete requires credentials | ❌ Blocked |
| Wrong secret | Authlete validates | ❌ Blocked |
| Unknown user | Hint-based identification fails | ❌ Blocked |
| Public client | Authlete rejects | ❌ Blocked |

---

## Part 7: Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "Missing required field: parameters" | `parameters` not in body | Add `"parameters": "login_hint=admin&scope=openid"` |
| 401 on authentication | Wrong credentials | Check `clientId`/`clientSecret` |
| "No user found with given hint" | Unknown `login_hint` | Use valid user (default: `admin`) |
| `auth_req_id` expires | Too slow to poll | Increase `backchannelAuthReqIdDuration` |
| "authorization_pending" forever | `complete` not called | Call `POST /api/ciba/complete` with `AUTHORIZED` |
| "slow_down" | Polling too fast | Wait `interval` seconds between polls |
| "INVALID_TICKET" | Ticket used/expired | Get fresh ticket from authentication |
| "CIBA not enabled" | Service not configured | Enable CIBA in Authlete Service Settings → Global Settings → Supported Grant Types |
| Token endpoint returns 401 for polling | Client auth method mismatch | Client must use the same auth method configured in Authlete. If configured as `CLIENT_SECRET_BASIC`, use `-u "cid:secret"` (Basic auth), not `client_id`/`client_secret` in body |
| Backchannel auth returns 401 | Wrong credentials or auth method | Verify `clientId`/`clientSecret` match Authlete client settings. For `CLIENT_SECRET_BASIC`, credentials go in `Authorization: Basic` header |
| PING/PUSH: `NOTIFICATION` action | Caller must deliver | Send `responseContent` to notification endpoint |

---

## Appendix: Server Architecture

### Files

| File | Role |
|------|------|
| `server/src/services/ciba.service.ts` | Authlete SDK wrapper |
| `server/src/controllers/ciba.controller.ts` | Request handling |
| `server/src/routes/ciba.routes.ts` | Route definitions |
| `client/src/services/ciba.service.ts` | Client API calls |
| `client/src/components/oidc/CibaSection.tsx` | SPA testing UI |

### Authlete SDK Mapping

| Express Endpoint | Authlete Method |
|-----------------|----------------|
| `POST /api/ciba/authentication` | `ciba.processAuthentication()` |
| `POST /api/ciba/issue` | `ciba.issue()` |
| `POST /api/ciba/fail` | `ciba.fail()` |
| `POST /api/ciba/complete` | `ciba.complete()` |

### Action-to-Status Mapping

| Endpoint | Action | HTTP Status |
|----------|--------|:-----------:|
| Authentication | `USER_IDENTIFICATION` | 200 |
| Authentication | `UNAUTHORIZED` | 401 |
| Issue | `OK` | 200 |
| Issue | `INVALID_TICKET` | 400 |
| Fail | `FORBIDDEN` | 403 |
| Complete | `NO_ACTION` | 200 (POLL) |
| Complete | `NOTIFICATION` | 200 (PING/PUSH) |

---

## Summary

CIBA is simple:

1. **Client** sends backchannel auth request → gets `ticket`
2. **Server** issues `auth_req_id` for polling
3. **User** approves on phone
4. **Client** calls `complete` with approval
5. **Client** polls token endpoint → gets tokens

**Use CIBA when:**
- No browser redirect possible
- User has a separate authentication device
- Need server-side authentication (call center, POS)

**Don't use CIBA when:**
- Standard OAuth works (SPA, mobile app)

---

## References

- [CIBA Core 1.0](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html)
- [Authlete: How to Implement CIBA](https://developers.authlete.com/guides/flows-and-protocols/grant-types-and-token-flows/how-to-implement-ciba-with-authlete) — Service and client configuration details
- [Authlete: Configuring Client Authentication](https://developers.authlete.com/configuration-reference/endpoints/configuring-client-authentication.md) — CLIENT_SECRET_BASIC vs CLIENT_SECRET_POST
- [FAPI-CIBA Profile](https://openid.net/specs/fapi-1_0-final.html#client-initiated-backchannel-authentication-profile)
