# OpenID Connect Native SSO for Mobile Apps 1.0 — The Complete Guide

> **The short version:** Native SSO lets mobile apps from the same vendor share authentication state directly through secure device storage (iOS Keychain, Android Account Manager), eliminating the need for browser cookies and providing SSO that works even in incognito mode.

---

## Table of Contents

- [Part 1: Why Native SSO Exists](#part-1-why-native-sso-exists)
- [Part 2: The Core Concepts](#part-2-the-core-concepts)
- [Part 3: How Native SSO Works](#part-3-how-native-sso-works)
- [Part 4: The Device Secret — Deep Dive](#part-4-the-device-secret--deep-dive)
- [Part 5: The `ds_hash` and `sid` Claims](#part-5-the-ds_hash-and-sid-claims)
- [Part 6: Authlete Console Setup](#part-6-authlete-console-setup)
- [Part 7: Step-by-Step Flow](#part-7-step-by-step-flow)
- [Part 8: Logout — Revoking All Apps](#part-8-logout--revoking-all-apps)
- [Part 9: Security Hardening](#part-9-security-hardening)
- [Part 10: Troubleshooting](#part-10-troubleshooting)

---

## Part 1: Why Native SSO Exists

### The Problem: Re-Authentication Hell

Imagine a bank with three mobile apps: a main banking app, a credit card app, and an investment app. All three are made by the same bank and installed on the same phone.

**Without SSO:**

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant User as 👤 User
    participant Bank as 🏦 Banking App
    participant Card as 💳 Credit Card App
    participant Invest as 📈 Investment App

    User->>Bank: Open app, log in
    User->>Card: Open app, log in AGAIN
    User->>Invest: Open app, log in AGAIN

    Note over User: Every app requires<br/>separate login!
```

Every time the user switches between apps, they must re-authenticate. This is terrible UX.

### The Browser SSO Workaround (and Why It's Fragile)

OAuth 2.0 already has a browser-based SSO mechanism: if all three apps use the same system browser for authentication, the browser's session cookies can provide SSO. But this has serious problems:

| Problem | What Happens |
|---------|-------------|
| User clears browser cookies | SSO broken for all apps — user must re-authenticate everywhere |
| Private/Incognito browsing on iOS/Android | No cookies available — SSO impossible |
| User uninstalls/reinstalls the browser | Cookies gone — SSO broken |
| Enterprise MDM policies | May clear browser data periodically |
| No shared browser on some platforms | Smart TVs, car infotainment, wearables |

### The Solution: Native SSO

Native SSO (formally "OpenID Connect Native SSO for Mobile Apps 1.0") solves this by letting mobile apps **share authentication state directly** through secure device storage (like iOS Keychain or Android Account Manager), without relying on browser cookies.

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant User as 👤 User
    participant Bank as 🏦 Banking App
    participant Card as 💳 Credit Card App
    participant Invest as 📈 Investment App
    participant Keychain as 🔐 Keychain

    User->>Bank: Open app, log in
    Bank->>Keychain: Store id_token + device_secret
    User->>Card: Open app
    Card->>Keychain: Read id_token + device_secret
    Card->>Card: Token exchange (no login!)
    User->>Invest: Open app
    Invest->>Keychain: Read id_token + device_secret
    Invest->>Invest: Token exchange (no login!)

    Note over User: Single login!<br/>All apps work seamlessly
```

### Before vs. After

| Scenario | Before (No SSO) | Before (Browser SSO) | After (Native SSO) |
|----------|-----------------|---------------------|-------------------|
| User opens app 2 after app 1 | Must re-login | Works if cookies exist | Works always (via Keychain) |
| User clears browser data | N/A | SSO broken | SSO still works |
| User uses incognito mode | N/A | SSO broken | SSO still works |
| Cross-device | N/A | N/A | Explicitly blocked (security) |
| Token format | Standard tokens | Standard tokens | Standard tokens + device_secret |

---

## Part 2: The Core Concepts

### The Three Players

| Player | Role | Example |
|--------|------|---------|
| **App 1** (Authenticating App) | The first app the user logs into. Gets the initial tokens and stores them in shared storage. | Bank's main app |
| **App 2** (SSO App) | A second app by the same vendor. Reads tokens from shared storage and exchanges them for its own tokens — no login needed. | Bank's credit card app |
| **Authorization Server (AS)** | Issues tokens, manages device secrets, validates token exchange requests. | Your Authlete-powered server |

### The Two-Phase Flow

Native SSO works in two phases:

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    subgraph Phase1["Phase 1: Authentication"]
        A1[App 1 authenticates]
        A2[AS issues device_secret]
        A3[App 1 stores in Keychain]
        A1 --> A2 --> A3
    end
    
    subgraph Phase2["Phase 2: SSO Token Exchange"]
        B1[App 2 reads from Keychain]
        B2[App 2 calls AS]
        B3[AS validates & issues tokens]
        B1 --> B2 --> B3
    end
    
    Phase1 --> Phase2
```

**Phase 1: Authentication (App 1)**

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant App1 as 🏦 App 1
    participant AS as Auth Server
    participant Keychain as 🔐 Keychain

    App1->>AS: "Log me in (with device_sso scope)"
    AS->>AS: Authenticate user
    AS->>App1: access_token + refresh_token + id_token + device_secret
    App1->>Keychain: Store id_token + device_secret
```

**Phase 2: SSO Token Exchange (App 2)**

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant App2 as 💳 App 2
    participant AS as Auth Server
    participant Keychain as 🔐 Keychain

    App2->>Keychain: Read id_token + device_secret
    App2->>AS: "Exchange these for my own tokens"
    AS->>AS: Validate device_secret + ds_hash + sid
    AS->>App2: access_token + refresh_token + id_token + device_secret
```

### The New Scope: `device_sso`

The `device_sso` scope is the trigger. When an authorization request includes `openid device_sso`, the AS knows to:

1. Issue a **device secret** alongside the normal tokens
2. Include `ds_hash` and `sid` claims in the ID token
3. Prepare for future token exchange requests from other apps

### The New Grant Type Extension: Token Exchange with Device Secret

App 2 doesn't use the authorization code flow. Instead, it uses **Token Exchange (RFC 8693)** with specific parameters:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` | Standard token exchange |
| `audience` | The AS's issuer URI | "I want tokens from this AS" |
| `subject_token` | The ID token from App 1 | "This is the user's identity" |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:id_token` | "The subject token is an ID token" |
| `actor_token` | The device secret | "This proves I'm on the same device" |
| `actor_token_type` | `urn:openid:params:token-type:device-secret` | "The actor token is a device secret" |

---

## Part 3: How Native SSO Works

### Phase 1: App 1 Authentication

#### Step 1: Authorization Request

App 1 opens a browser (or uses ASWebAuthenticationSession on iOS) to:

```
GET /api/authorization?
  client_id=app_1
  &response_type=code
  &scope=openid+device_sso
  &redirect_uri=com.bank.app1:/callback
  &state=abc123
```

The critical difference from standard OIDC: **both `openid` and `device_sso` are in the scope**.

#### Step 2: User Authenticates

The user logs in via the AS's login page (username/password, biometric, etc.).

#### Step 3: Authorization Code Issued

The AS redirects back with an authorization code:

```
com.bank.app1:/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=abc123
```

#### Step 4: Token Request

App 1 exchanges the code for tokens:

```http
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

client_id=app_1
&grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=com.bank.app1:/callback
```

#### Step 5: Token Response (Native SSO Enhanced)

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid device_sso",
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "device_secret": "b81d5ae9-9f85-4c6d-8658-1a36ffa42c83"
}
```

**Two new things:**
1. `device_secret` — the device credential
2. The `id_token` contains `ds_hash` and `sid` claims (see Part 5)

#### Step 6: Store in Shared Storage

App 1 stores the ID token and device secret in the platform's secure shared storage:

| Platform | Storage Mechanism |
|----------|------------------|
| iOS | Keychain (with `kSecAttrAccessGroup`) |
| Android | Account Manager or EncryptedSharedPreferences |
| Both | Any IPC mechanism that guarantees same-vendor app access |

**Critical security requirement:** Only apps signed by the same vendor certificate can access this storage.

### Phase 2: App 2 SSO Token Exchange

#### Step 7: Read from Shared Storage

App 2 reads the ID token and device secret from shared storage.

#### Step 8: Token Exchange Request

App 2 calls the token endpoint directly (no browser needed):

```http
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

client_id=app_2
&grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&audience=https://your-authlete-service.authlete.com
&subject_token=eyJhbGciOiJSUzI1NiIs...
&subject_token_type=urn:ietf:params:oauth:token-type:id_token
&actor_token=b81d5ae9-9f85-4c6d-8658-1a36ffa42c83
&actor_token_type=urn:openid:params:token-type:device-secret
&scope=openid
```

#### Step 9: AS Validates and Issues Tokens

The AS performs these checks:

1. Validates the device secret
2. Verifies the ID token signature
3. Verifies `ds_hash` matches the device secret
4. Verifies the `sid` is still valid
5. Verifies both apps are authorized for SSO

If all checks pass, the AS issues new tokens for App 2:

```json
{
  "access_token": "2YotnFZFEjr1zCsicMWpAA",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid",
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "device_secret": "b81d5ae9-9f85-4c6d-8658-1a36ffa42c83",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}
```

**Key observations:**
- The `id_token` has the **same `ds_hash` and `sid`** as App 1's ID token (same device, same session)
- The `id_token` has a **different `aud`** claim — now it's `["app_2"]` instead of `["app_1"]`
- The `device_secret` is the **same value** (or rotated if the AS chooses)
- The `issued_token_type` field indicates this was a token exchange result

---

## Part 4: The Device Secret — Deep Dive

### What Is It?

The device secret is a credential that represents **the device itself** and the user's authentication session on that device. Think of it as a "device passport" that proves:

1. "I am the same physical device where user X logged in"
2. "I have the cryptographic proof (ds_hash) that binds me to the ID token"

### How Is It Generated?

The specification says:

> "The device secret contains relevant data to the device and the current users authenticated with the device. The device secret is completely opaque to the client and as such the AS MUST adequately protect the value such as using a JWE if the AS is not maintaining state on the backend." — Native SSO §3.2

In practice, the AS generates a random opaque string (like a UUID or a JWE). Authlete generates it internally when you call the `/nativesso` API.

### Lifecycle

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart TD
    A[App 1 authenticates] --> B[AS generates device_secret]
    B --> C[App 1 stores in Keychain]
    C --> D[App 2 reads from Keychain]
    D --> E[App 2 sends to AS in token exchange]
    E --> F{AS validates}
    F -->|Valid| G[Issues new tokens]
    F -->|Invalid| H[Rejects request]
    G --> I[App 2 stores tokens]
```

### Rotation

The AS **may** rotate the device secret on each token exchange, but the spec says:

> "If an existing device_secret is provided as part of the token request and is still valid, the Authorization Server MAY return a new device_secret but doing so is not RECOMMENDED." — Native SSO §3.4.3

**Recommendation:** Don't rotate unless you have a specific reason. Keep the same device secret for the lifetime of the device/user pair.

### Protection Requirements

| Requirement | Rationale |
|-------------|-----------|
| Must be encrypted (JWE) if no backend state | Prevents device secret leakage |
| Must be stored in secure shared storage | Only same-vendor apps can access |
| Must not be logged or transmitted in cleartext | Device secret = device credential |
| Must be validated on every token exchange | Prevents replay from different devices |

---

## Part 5: The `ds_hash` and `sid` Claims

### `ds_hash` — Device Secret Hash

The `ds_hash` claim in the ID token **binds the ID token to the device secret**. This is the cryptographic link that proves "this ID token was issued to the same device that holds this device secret."

#### How It's Computed

The spec doesn't mandate a specific hash function. Authlete uses:

```
ds_hash = base64url(SHA-256(device_secret))
```

#### Example

```
device_secret = "b81d5ae9-9f85-4c6d-8658-1a36ffa42c83"
ds_hash = base64url(SHA-256("b81d5ae9-9f85-4c6d-8658-1a36ffa42c83"))
        = "XkbgGCRJQ1NAHnKnMn8J0XHKn_8EMzxB9aQuFHNM2p4"
```

#### Decoded ID Token with `ds_hash`

```json
{
  "iss": "https://your-as.example.com",
  "sub": "user123",
  "aud": ["app_1"],
  "exp": 1746437119,
  "iat": 1746350719,
  "auth_time": 1746350672,
  "ds_hash": "XkbgGCRJQ1NAHnKnMn8J0XHKn_8EMzxB9aQuFHNM2p4",
  "sid": "session_abc123"
}
```

### `sid` — Session ID

The `sid` claim identifies the **user's authentication session**. It's the same value across all apps in the same SSO session.

#### Why It Matters

- On token exchange, the AS verifies the `sid` is still valid (not expired, not revoked)
- On logout, the AS can revoke **all tokens** associated with a `sid` — this is how "logout from all apps" works
- If the session expires, **all refresh tokens** associated with that `sid` become invalid

#### Value

The `sid` is an opaque string managed by the OpenID Provider. It could be:
- A UUID (`"550e8400-e29b-41d4-a716-446655440000"`)
- A session store key (`"sess_abc123def456"`)
- Any unique identifier for the authentication session

---

## Part 6: Authlete Console Setup

### Prerequisites

- Authlete 3.0 or later (Native SSO support requires v3.0+)
- A service (authorization server) already configured in Authlete
- Two client applications registered (e.g., `app_1` and `app_2`)

### Step 1: Enable Native SSO on the Service

1. Log in to the [Authlete Management Console](https://console.authlete.com/)
2. Navigate to **Service Settings > Tokens and Claims > Advanced > Token Exchange**
3. In the **Native SSO** section, toggle **Allow** to enable
4. Click **Save Changes**

This sets `nativeSsoSupported = true` on the service. The discovery document will now include:

```json
"native_sso_supported": true
```

### Step 2: Register the `device_sso` Scope

1. Navigate to **Service Settings > Tokens and Claims > Advanced > Scope**
2. In **Supported Scopes**, click **Add**
3. Enter `device_sso` as the scope name
4. Click **Add**, then **Save Changes**

**Critical:** If you skip this, the `device_sso` scope will be silently ignored (OAuth 2.0 ignores unknown scopes), and Native SSO processing will never trigger.

### Step 3: Add `TOKEN_EXCHANGE` Grant Type

1. Navigate to **Service Settings > Endpoints > Global Settings > General**
2. In **Supported Grant Types**, select **Token_Exchange**
3. Click **Save Changes**

### Step 4: Configure Client Apps

For **each client app** (`app_1` and `app_2`):

1. Navigate to **Client Settings > Endpoints > Global Settings > General**
2. In **Supported Grant Types**, add **Token_Exchange**
3. Click **Save Changes**

4. Navigate to **Client Settings > Tokens and Claims > Advanced > Scope**
5. Add `device_sso` to **Requestable Scopes**
6. Click **Save Changes**

### Step 5: Enable Explicit Permission for Token Exchange

For each client:

1. Navigate to **Client Settings > Tokens and Claims > Advanced > Token Exchange**
2. Enable **Explicit Permission for Token Exchange**
3. Click **Save Changes**

### Summary Checklist

| Setting | Location | Value |
|---------|----------|-------|
| Native SSO | Service Settings > Tokens > Advanced > Token Exchange | Enabled |
| `device_sso` scope | Service Settings > Tokens > Advanced > Scope | Registered |
| `TOKEN_EXCHANGE` grant (service) | Service Settings > Endpoints > General | Added |
| `TOKEN_EXCHANGE` grant (client) | Client Settings > Endpoints > General | Added per client |
| `device_sso` scope (client) | Client Settings > Tokens > Advanced > Scope | Requestable per client |
| Explicit token exchange permission | Client Settings > Tokens > Advanced > Token Exchange | Enabled per client |

---

## Part 7: Step-by-Step Flow

### Phase 1: Get Tokens for App 1

#### Step 1: Start Authorization

```bash
# Open this URL in a browser or use ASWebAuthenticationSession
curl -v "https://YOUR_AUTHLETE_BASE/YOUR_SERVICE_ID/authorization?\
client_id=app_1&\
response_type=code&\
scope=openid+device_sso&\
redirect_uri=https://your-app.example.com/callback&\
state=test123"
```

Log in with your test credentials. You'll get an authorization code in the redirect.

#### Step 2: Exchange Code for Tokens

```bash
curl -v -X POST https://YOUR_AUTHLETE_BASE/YOUR_SERVICE_ID/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=app_1" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "redirect_uri=https://your-app.example.com/callback"
```

**Expected Response:**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid device_sso",
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "device_secret": "b81d5ae9-9f85-4c6d-8658-1a36ffa42c83"
}
```

**Save these values:**
- `id_token` → for App 2's token exchange
- `device_secret` → for App 2's token exchange

#### Step 3: Decode the ID Token to Verify

```bash
# Decode the payload (middle part) of the JWT
echo "eyJpc3MiOiJodHRwczovL3lvdXItYXMuZXhhbXBsZS5jb20iLCJzdWIiOiJ1c2VyMTIzIiwiYXVkIjpbImFwcF8xIl0sImV4cCI6MTc0NjQzNzExOSwiaWF0IjoxNzQ2MzUwNzE5LCJhdXRoX3RpbWUiOjE3NDYzNTA2NzIsImRzX2hhc2giOiJYa2JnR0NSSlExTkFIbktuTW44SjBYSEtuXzhFTXp4QjlhUXVGSE5NMnA0Iiwic2lkIjoic2Vzc2lvbl9hYmMxMjMifQ" | base64 -d 2>/dev/null || echo '{"iss":"https://your-as.example.com","sub":"user123","aud":["app_1"],"exp":1746437119,"iat":1746350719,"auth_time":1746350672,"ds_hash":"XkbgGCRJQ1NAHnKnMn8J0XHKn_8EMzxB9aQuFHNM2p4","sid":"session_abc123"}'
```

Verify you see `ds_hash` and `sid` claims.

### Phase 2: Token Exchange for App 2

#### Step 4: Exchange for App 2's Tokens

```bash
curl -v -X POST https://YOUR_AUTHLETE_BASE/YOUR_SERVICE_ID/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=app_2" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "audience=https://YOUR_AUTHLETE_BASE" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
  -d "actor_token=b81d5ae9-9f85-4c6d-8658-1a36ffa42c83" \
  -d "actor_token_type=urn:openid:params:token-type:device-secret" \
  -d "scope=openid"
```

**Expected Response:**

```json
{
  "access_token": "2YotnFZFEjr1zCsicMWpAA",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "openid",
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "device_secret": "b81d5ae9-9f85-4c6d-8658-1a36ffa42c83",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}
```

**Verify:**
- New `id_token` has `aud: ["app_2"]` (not `app_1`)
- Same `ds_hash` and `sid` values as App 1's ID token
- `device_secret` is the same (or rotated if AS chose to)
- `issued_token_type` is present

### Phase 3: Logout (All Apps)

#### Step 5: Revoke All Tokens for a Session

```bash
curl -v -X POST https://YOUR_AUTHLETE_BASE/YOUR_SERVICE_ID/nativesso/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ACCESS_TOKEN" \
  -d '{"sessionId": "session_abc123"}'
```

**Expected Response:**

```json
{
  "resultCode": "S232001",
  "resultMessage": "[S232001] The /nativesso/logout API call successfully deleted 2 access/refresh token record(s).",
  "action": "OK"
}
```

This revokes **all tokens** for all apps in that session. Both `app_1` and `app_2` lose their tokens.

### Error Testing

#### Test: Wrong Device Secret

```bash
curl -v -X POST https://YOUR_AUTHLETE_BASE/YOUR_SERVICE_ID/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=app_2" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "audience=https://YOUR_AUTHLETE_BASE" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
  -d "actor_token=WRONG_DEVICE_SECRET" \
  -d "actor_token_type=urn:openid:params:token-type:device-secret" \
  -d "scope=openid"
```

**Expected:** `invalid_grant` error (device secret hash doesn't match)

#### Test: Expired Session

If the `sid` in the ID token refers to an expired/revoked session:

**Expected:** `invalid_grant` error (session no longer valid)

#### Test: Missing Required Parameters

```bash
curl -v -X POST https://YOUR_AUTHLETE_BASE/YOUR_SERVICE_ID/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=app_2" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token"
```

**Expected:** Error — missing `audience`, `actor_token`, `actor_token_type`

---

## Part 8: Logout — Revoking All Apps

### The Problem

In a multi-app scenario, logging out of one app should log out of **all apps**. Without Native SSO, each app manages its own tokens independently — logging out of App 1 doesn't affect App 2.

### The Solution: Session-Based Logout

Native SSO ties all tokens to a single session via the `sid` claim. The `/nativesso/logout` API deletes **all access/refresh token records** associated with a session ID.

### How It Works

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant User as 👤 User
    participant App1 as 🏦 App 1
    participant App2 as 💳 App 2
    participant AS as Auth Server

    User->>App1: Click "Logout"
    App1->>AS: POST /nativesso/logout<br/>{ sessionId }
    AS->>AS: Delete all tokens for sessionId
    AS->>App1: 200 OK
    App1->>App1: Clear local tokens

    Note over App2: App 2 still has tokens...<br/>but they're now invalid server-side

    App2->>AS: Try to use token
    AS->>App2: 401 Unauthorized
    App2->>App2: Clear local tokens
```

### What Just Happened?

1. User clicks "Logout" in App 1
2. App 1 calls POST `/api/nativesso/logout` with the session ID
3. Authlete deletes **all tokens** for that session ID
4. App 1 clears its local tokens
5. App 2's tokens are now invalid (deleted server-side)
6. Next time App 2 tries to use its token → 401 Unauthorized

---

## Part 9: Security Hardening

### 1. No Browser Cookie Dependency

Browser cookies can be:
- Cleared by the user
- Cleared by MDM policies
- Unavailable in incognito mode
- Lost on browser uninstall

Native SSO uses **platform secure storage** (Keychain/Account Manager) which is:
- Persistent across app restarts
- Not affected by browser data clearing
- Protected by hardware security modules (HSM) on modern devices
- Accessible only to apps signed by the same vendor certificate

### 2. Device-Bound Credentials

The device secret is bound to the physical device. Even if an attacker steals the ID token, they can't use it without the device secret — and the device secret never leaves the secure storage.

### 3. Session-Level Revocation

The `sid` claim enables **session-level revocation**. When a user logs out (or an admin revokes access), the AS can invalidate the session, and **all tokens across all apps** become invalid immediately.

### 4. No Token Leakage Across Vendors

The device secret is only accessible to apps signed by the **same vendor certificate**. A malicious app from a different vendor cannot:
- Read the device secret from Keychain
- Perform a token exchange
- Impersonate the user

### 5. ds_hash Binding

The `ds_hash` claim cryptographically binds the ID token to the device secret. An attacker who steals an ID token cannot use it with a different device secret — the hash won't match.

### 6. Explicit App Authorization

The AS should maintain a list of apps authorized for SSO. During token exchange, it verifies that:
- Both the requesting app (`client_id`) and the original app (`aud` in the ID token) are authorized
- This prevents unauthorized apps from using the SSO mechanism

### Security Comparison

| Attack Vector | Browser SSO | Native SSO |
|--------------|-------------|------------|
| Cookie theft | Possible (XSS, malware) | Impossible (Keychain) |
| Session fixation | Possible | Prevented (device-bound) |
| Cross-app leakage | Possible (shared browser) | Prevented (vendor cert) |
| Device theft | Cookies accessible | Keychain requires biometric |
| MDM policy | Can clear cookies | Cannot clear Keychain |
| Replay on different device | Possible | Prevented (device secret) |

---

## Part 10: Troubleshooting

### Problem: No `device_secret` in Token Response

**Checklist:**
1. Is `nativeSsoSupported = true` on the service?
2. Is `device_sso` registered as a scope?
3. Does the authorization request include `scope=openid device_sso`?
4. Does the client have `device_sso` in its requestable scopes?
5. Does the client have `TOKEN_EXCHANGE` in its grant types?

### Problem: Token Exchange Returns 500

**Cause:** The server's token controller doesn't handle `NATIVE_SSO` action.

**Fix:** Implement the `NATIVE_SSO` case in the token controller (see Part 7).

### Problem: `ds_hash` Doesn't Match

**Checklist:**
1. Are you using the same device secret that was originally issued?
2. Was the device secret stored correctly in shared storage?
3. Is the hash computation correct (SHA-256, base64url)?

### Problem: Session ID Validation Fails

**Checklist:**
1. Is the session still active on the AS?
2. Has the session been revoked (by logout or admin action)?
3. Is the session ID value correct (not truncated or corrupted)?

### Problem: App 2 Gets `interaction_required`

**Cause:** App 2 is requesting scopes that require explicit consent.

**Fix:** Either:
- Pre-authorize the scopes for App 2 during registration
- Have App 2 use a standard authorization code flow for initial consent

---

## Summary

Native SSO is simple but powerful:

1. **App 1** authenticates and stores `id_token` + `device_secret` in Keychain
2. **App 2** reads from Keychain and exchanges for its own tokens
3. **AS** validates the device secret and issues new tokens
4. **Logout** revokes all tokens for the session

**Use Native SSO when:**
- Multiple mobile apps from the same vendor
- Need SSO that works in incognito mode
- Need SSO that survives browser data clearing
- High-security requirements

**Don't use Native SSO when:**
- Single app (no SSO needed)
- Browser-based SSO is sufficient
- Cross-device scenarios

---

## References

- [OpenID Connect Native SSO for Mobile Apps 1.0](https://openid.net/specs/openid-connect-native-sso-1_0.html)
- [RFC 8693: OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693.html)
- [Authlete KB: Native SSO](https://kb.authlete.com/en/s/oauth-and-openid-connect/a/native-sso)
