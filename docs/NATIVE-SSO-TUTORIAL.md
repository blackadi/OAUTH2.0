# OpenID Connect Native SSO for Mobile Apps 1.0 — Deep Dive

A comprehensive guide to Native SSO: why it was created, the security problems it solves, how it works step by step, how Authlete implements it, and how to test it.

---

## Table of Contents

- [Part 1: Why Native SSO Exists](#part-1-why-native-sso-exists)
- [Part 2: The Core Concepts](#part-2-the-core-concepts)
- [Part 3: How Native SSO Works (Step by Step)](#part-3-how-native-sso-works-step-by-step)
- [Part 4: The Device Secret — Deep Dive](#part-4-the-device-secret--deep-dive)
- [Part 5: The `ds_hash` and `sid` Claims](#part-5-the-ds_hash-and-sid-claims)
- [Part 6: Authlete Console Setup](#part-6-authlete-console-setup)
- [Part 7: Server Implementation Analysis](#part-7-server-implementation-analysis)
- [Part 8: Step-by-Step curl Testing](#part-8-step-by-step-curl-testing)
- [Part 9: Native SSO + Token Exchange (RFC 8693)](#part-9-native-sso--token-exchange-rfc-8693)
- [Part 10: Real-World Use Cases](#part-10-real-world-use-cases)
- [Part 11: How Native SSO Hardens Security](#part-11-how-native-sso-hardens-security)
- [Part 12: Logout — Revoking All Apps](#part-12-logout--revoking-all-apps)
- [Part 13: Error Scenarios](#part-13-error-scenarios)
- [Part 14: Troubleshooting](#part-14-troubleshooting)
- [Appendix A: Specification References](#appendix-a-specification-references)
- [Appendix B: Server Architecture](#appendix-b-server-architecture)

---

## Part 1: Why Native SSO Exists

### The Problem

Imagine a bank with three mobile apps: a main banking app, a credit card app, and an investment app. All three are made by the same bank and installed on the same phone.

**Without Native SSO:**

1. User opens the banking app → logs in with username/password
2. User opens the credit card app → **must log in again** with username/password
3. User opens the investment app → **must log in again** with username/password

Every time the user switches between apps, they have to re-authenticate. This is terrible UX.

**The Browser-Based SSO Workaround (and why it's fragile):**

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

> "The purpose of this specification is to provide a single-sign-on (SSO) mechanism across mobile applications installed on the same device that addresses the risks highlighted above." — OpenID Connect Native SSO §1

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

**Phase 1: Authentication (App 1)**

```
App 1 → AS: "Log me in (with device_sso scope)"
AS → App 1: access_token + refresh_token + id_token + device_secret
App 1 → Shared Storage: stores id_token + device_secret
```

**Phase 2: SSO Token Exchange (App 2)**

```
App 2 ← Shared Storage: reads id_token + device_secret
App 2 → AS: "Exchange these for my own tokens"
AS → App 2: access_token + refresh_token + id_token + device_secret
```

### The New Scope: `device_sso`

The `device_sso` scope is the trigger. When an authorization request includes `openid device_sso`, the AS knows to:

1. Issue a **device secret** alongside the normal tokens
2. Include `ds_hash` and `sid` claims in the ID token
3. Prepare for future token exchange requests from other apps

### The New Token Type: Device Secret

The device secret is:
- An **opaque string** (like `b81d5ae9-9f85-4c6d-8658-1a36ffa42c83`)
- Issued by the AS and unique to the device + user combination
- **Completely opaque to the client** — apps cannot decode or tamper with it
- Stored in **secure shared storage** (iOS Keychain, Android Account Manager)
- Used to **prove device identity** during token exchange

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

## Part 3: How Native SSO Works (Step by Step)

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

The AS performs these checks (see Part 9 for details):

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

```
App 1 authenticates → AS generates device_secret
                        ↓
              App 1 stores in Keychain
                        ↓
App 2 reads from Keychain → sends to AS in token exchange
                        ↓
              AS validates → issues new tokens
                        ↓
              AS may rotate device_secret (optional)
                        ↓
              App 2 stores updated device_secret
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

## Part 7: Server Implementation Analysis

### Current State: Native SSO Is NOT Implemented

A thorough analysis of this codebase reveals that **Native SSO is entirely unimplemented**. Here's what exists and what's missing:

### What Exists (SDK Support)

The Authlete TypeScript SDK (`@authlete/typescript-sdk@^1.1.6`) includes full Native SSO support:

| Component | Location | Status |
|-----------|----------|--------|
| `NativeSso` class | `node_modules/@authlete/typescript-sdk/src/sdk/nativesso.ts` | ✅ Present |
| `NativeSsoRequest` model | `node_modules/@authlete/typescript-sdk/src/models/nativessorequest.ts` | ✅ Present |
| `NativeSsoResponse` model | `node_modules/@authlete/typescript-sdk/src/models/nativessoresponse.ts` | ✅ Present |
| `NativeSsoLogoutRequest` model | `node_modules/@authlete/typescript-sdk/src/models/nativessologoutrequest.ts` | ✅ Present |
| `NativeSsoLogoutResponse` model | `node_modules/@authlete/typescript-sdk/src/models/nativessologoutresponse.ts` | ✅ Present |
| `authleteApi.nativeSso` getter | `node_modules/@authlete/typescript-sdk/src/sdk/sdk.ts` | ✅ Present |
| `AuthorizationResponse.nativeSsoRequested` field | `node_modules/@authlete/typescript-sdk/src/models/authorizationresponse.ts` | ✅ Present |

### What's Missing (Application Code)

| Component | What's Needed | Current Status |
|-----------|--------------|----------------|
| **Token controller `NATIVE_SSO` action** | Handle `action === "NATIVE_SSO"` from `/auth/token` → call `authleteApi.nativeSso.process()` | ❌ Missing — falls to `default` case → returns 500 |
| **`sessionId` in authorization/issue** | When `nativeSsoRequested === true`, pass `sessionId` to `/auth/authorization/issue` | ❌ Missing — `authorization.service.ts:58-95` doesn't pass `sessionId` |
| **Native SSO processing endpoint** | `POST /api/nativesso` route, controller, and service | ❌ Missing — no routes exist |
| **Native SSO logout endpoint** | `POST /api/nativesso/logout` route, controller, and service | ❌ Missing — no routes exist |
| **Device secret management** | Generate, store, validate device secrets | ❌ Missing — no device secret handling |

### What Would Need to Change

#### 1. Token Controller (`server/src/controllers/token.controller.ts`)

Add a `case "NATIVE_SSO":` handler. The current code at line 186 falls through to:

```typescript
default: {
  const log2 = req.logger || logger;
  log2.error("Unknown token action", { action: result.action });
  return res.status(500).send("Unknown token action");
}
```

This means if Authlete returns `NATIVE_SSO`, the client gets a 500 error.

#### 2. Authorization Service (`server/src/services/authorization.service.ts`)

The `issue()` method at line 83 spreads `authorizationIssueRequest` from session but doesn't include `sessionId`. When Authlete returns `nativeSsoRequested: true` in the authorization response, the implementation must:

1. Generate or retrieve a session ID
2. Store it in the session
3. Pass it to the `/auth/authorization/issue` call

#### 3. Native SSO Service (New File)

A new service would need to:

```typescript
// Conceptual — NOT implemented in this codebase
export class NativeSsoService {
  async process(request: NativeSsoRequest): Promise<NativeSsoResponse> {
    return this.authleteApi.nativeSso.process({
      serviceId,
      nativeSsoRequest: request,
    });
  }

  async logout(request: NativeSsoLogoutRequest): Promise<NativeSsoLogoutResponse> {
    return this.authleteApi.nativeSso.logout({
      serviceId,
      nativeSsoLogoutRequest: request,
    });
  }
}
```

### SDK Request/Response Types

#### NativeSsoRequest (what you pass to `/nativesso`)

```typescript
{
  accessToken: string;        // REQUIRED — from /auth/token response
  refreshToken?: string;      // OPTIONAL — from /auth/token response
  deviceSecret: string;       // REQUIRED — generated or from /auth/token response
  deviceSecretHash?: string;  // OPTIONAL — SHA-256 hash of device secret
  sub?: string;               // OPTIONAL — subject claim override
  claims?: string;            // OPTIONAL — additional claims (JSON string)
  idtHeaderParams?: string;   // OPTIONAL — additional JWS header params
  idTokenAudType?: string;    // OPTIONAL — "array" or "string" for aud claim
}
```

#### NativeSsoResponse (what you get back)

```typescript
{
  resultCode?: string;
  resultMessage?: string;
  action?: "OK" | "INTERNAL_SERVER_ERROR" | "CALLER_ERROR";
  responseContent?: string;   // Use as-is for HTTP response body
  idToken?: string;           // The issued ID token
}
```

---

## Part 8: Step-by-Step curl Testing

### Prerequisites

Before testing, you need:
- An Authlete service with Native SSO enabled
- Two registered clients (`app_1` and `app_2`) with `TOKEN_EXCHANGE` and `device_sso` scope
- A valid access token for `app_1` (from a previous authorization code flow with `scope=openid device_sso`)

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

## Part 9: Native SSO + Token Exchange (RFC 8693)

Native SSO is **not a standalone protocol** — it's a **profile** (extension) of OAuth 2.0 Token Exchange (RFC 8693). Here's how they relate:

### RFC 8693 (Generic Token Exchange)

RFC 8693 defines a generic mechanism for swapping one token for another. It's flexible — you can exchange any token type for any other token type, with any audience.

### Native SSO Profile (Restrictive Extension)

Native SSO **restricts** RFC 8693 to a specific use case:

| Aspect | RFC 8693 (Generic) | Native SSO Profile |
|--------|--------------------|--------------------|
| `subject_token` | Any token type | Must be an ID token |
| `subject_token_type` | Any type identifier | Must be `urn:ietf:params:oauth:token-type:id_token` |
| `actor_token` | Any token type | Must be a device secret |
| `actor_token_type` | Any type identifier | Must be `urn:openid:params:token-type:device-secret` |
| `audience` | Any audience | Must be the AS's issuer URI |
| Additional validation | Standard token validation | Must verify `ds_hash`, `sid`, device secret binding |

### The Authlete Flow

When Authlete receives a token request at `/auth/token`, it analyzes the parameters and determines the appropriate action:

```
grant_type=authorization_code + scope=openid device_sso
  → action: NATIVE_SSO (first time, App 1)

grant_type=refresh_token + device_sso scope
  → action: NATIVE_SSO (refresh flow)

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
  + actor_token_type=urn:openid:params:token-type:device-secret
  → action: NATIVE_SSO (App 2's token exchange)
```

When `action === "NATIVE_SSO"`, the implementation must:

1. **Validate the session ID** (`sessionId` from the response)
2. **Validate or generate the device secret** (`deviceSecret` from the response)
3. **Call the `/nativesso` API** to generate the Native SSO-compliant token response

### Key Difference from Generic Token Exchange

In the server's current implementation, `TOKEN_EXCHANGE` is handled by `token-exchange-response.handler.ts`, which calls `tokenManagementService.create()`. This works for generic token exchange but **does NOT work for Native SSO** because:

1. Native SSO requires generating an ID token with `ds_hash` and `sid` claims
2. Native SSO requires returning a `device_secret` in the response
3. Native SSO requires session ID validation
4. The `/nativesso` API handles all of this — `tokenManagement.create()` does not

---

## Part 10: Real-World Use Cases

### 1. Banking Apps (Primary Use Case)

A bank with multiple mobile apps:

| App | Purpose | SSO Benefit |
|-----|---------|-------------|
| Main Banking | Account overview, transfers | Initial authentication |
| Credit Cards | Card management, transactions | No re-login needed |
| Investments | Portfolio, trading | No re-login needed |
| Insurance | Policy management | No re-login needed |

All four apps share the same device secret and session. User logs in once in the main app, and all other apps get SSO.

### 2. Enterprise Suites

A company with multiple productivity apps:

| App | Purpose |
|-----|---------|
| Email | Mail, calendar |
| Documents | Word processing, spreadsheets |
| Messaging | Chat, video calls |
| HR | Payroll, benefits |

Employees authenticate once and get seamless access across all apps.

### 3. Healthcare Platforms

A hospital system with multiple apps:

| App | Purpose |
|-----|---------|
| Patient Portal | Appointments, records |
| Telehealth | Video consultations |
| Pharmacy | Prescription management |
| Lab Results | Test results |

Patients authenticate once and access all health services.

### 4. Government Services

A government with multiple citizen-facing apps:

| App | Purpose |
|-----|---------|
| Tax Portal | File taxes |
| Benefits | Apply for benefits |
| Licensing | Driver's license, permits |
| Voting | Voter registration |

Citizens authenticate once and access all government services.

---

## Part 11: How Native SSO Hardens Security

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

### 7. Consent Requirements

The AS should verify that the scopes requested by App 2 don't require explicit user consent. If they do, the AS returns `interaction_required`, forcing the user to authenticate explicitly in App 2.

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

## Part 12: Logout — Revoking All Apps

### The Problem

In a multi-app scenario, logging out of one app should log out of **all apps**. Without Native SSO, each app manages its own tokens independently — logging out of App 1 doesn't affect App 2.

### The Solution: Session-Based Logout

Native SSO ties all tokens to a single session via the `sid` claim. The `/nativesso/logout` API deletes **all access/refresh token records** associated with a session ID.

### How It Works

```
User clicks "Logout" in App 1
  → App 1 calls POST /api/nativesso/logout with sessionId
  → Authlete deletes all tokens for that sessionId
  → App 1 clears its local tokens
  → App 2's tokens are now invalid (deleted server-side)
  → Next time App 2 tries to use its token → 401 Unauthorized
```

### API Call

```bash
POST /api/{serviceId}/nativesso/logout
Content-Type: application/json
Authorization: Bearer {service_access_token}

{
  "sessionId": "session_abc123"
}
```

### Response

```json
{
  "resultCode": "S232001",
  "resultMessage": "[S232001] The /nativesso/logout API call successfully deleted 2 access/refresh token record(s).",
  "action": "OK"
}
```

### Logout Flow Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  App 1  │     │  App 2  │     │   AS    │     │Storage  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ [1] User clicks Logout        │               │
     │               │               │               │
     │ [2] Clear local tokens        │               │
     │               │               │               │
     │ [3] POST /nativesso/logout    │               │
     │     { sessionId }             │               │
     │ ──────────────────────────>  │               │
     │               │               │               │
     │               │         [4] Delete all        │
     │               │             tokens for        │
     │               │             sessionId         │
     │               │               │               │
     │ [5] 200 OK    │               │               │
     │ <──────────────────────────  │               │
     │               │               │               │
     │               │ [6] App 2 tries to use token  │
     │               │ ──────────────────────────>  │
     │               │               │               │
     │               │ [7] 401 Unauthorized          │
     │               │ <──────────────────────────  │
     │               │               │               │
     │               │ [8] App 2 clears local tokens │
     │               │               │               │
```

---

## Part 13: Error Scenarios

### Error 1: Invalid Device Secret Hash

**When:** App 2 sends a device secret that doesn't match the `ds_hash` in the ID token.

**HTTP Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "invalid_grant",
  "error_description": "The device secret hash in the subject token does not correspond to the device secret."
}
```

**Cause:** Device secret was tampered with, or App 2 has a stale/incorrect device secret.

**Fix:** App 2 should re-read the device secret from shared storage. If the problem persists, App 1 may need to re-authenticate.

---

### Error 2: Invalid Session ID

**When:** The `sid` in the ID token refers to an expired or revoked session.

**HTTP Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "invalid_grant",
  "error_description": "The session ID is no longer valid."
}
```

**Cause:** The user's session expired, or an admin revoked the session, or the user logged out from another app.

**Fix:** App 2 must start a fresh authorization code flow (no SSO possible).

---

### Error 3: Missing Required Parameters

**When:** Token exchange request is missing `audience`, `actor_token`, or `actor_token_type`.

**HTTP Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "invalid_request",
  "error_description": "The request is missing a required parameter."
}
```

**Fix:** Ensure all required parameters are included in the token exchange request.

---

### Error 4: Unauthorized App

**When:** The requesting app (`app_2`) is not authorized for Native SSO token exchange.

**HTTP Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "invalid_grant",
  "error_description": "The client is not authorized for Native SSO."
}
```

**Cause:** The AS's configuration doesn't allow `app_2` to participate in token exchange.

**Fix:** Configure the AS to authorize `app_2` for token exchange (in Authlete: enable `TOKEN_EXCHANGE` grant type on the client and set `extension.tokenExchangePermitted = true`).

---

### Error 5: Interaction Required

**When:** The scopes requested by App 2 require explicit user consent.

**HTTP Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "interaction_required",
  "error_description": "The request requires user interaction."
}
```

**Cause:** App 2 is requesting scopes that weren't previously consented to.

**Fix:** App 2 must start a standard authorization code flow to get user consent.

---

### Error 6: Native SSO Not Enabled

**When:** The service doesn't have `nativeSsoSupported = true`.

**HTTP Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "invalid_request",
  "error_description": "The token type 'urn:openid:params:token-type:device-secret' is not supported."
}
```

**Cause:** Native SSO is not enabled on the Authlete service.

**Fix:** Enable Native SSO in the Authlete Console (see Part 6, Step 1).

---

### Error 7: `device_sso` Scope Not Registered

**When:** The `device_sso` scope is not registered on the service.

**HTTP Response:**

The authorization request succeeds, but `nativeSsoRequested` is `false` in the Authlete response, and no device secret is issued. The token response looks like a standard OIDC response (no `device_secret`).

**Cause:** OAuth 2.0 silently ignores unknown scopes. If `device_sso` isn't registered, it's treated as an unknown scope and ignored.

**Fix:** Register the `device_sso` scope in the Authlete Console (see Part 6, Step 2).

---

## Part 14: Troubleshooting

### Problem: No `device_secret` in Token Response

**Checklist:**
1. ✅ Is `nativeSsoSupported = true` on the service?
2. ✅ Is `device_sso` registered as a scope?
3. ✅ Does the authorization request include `scope=openid device_sso`?
4. ✅ Does the client have `device_sso` in its requestable scopes?
5. ✅ Does the client have `TOKEN_EXCHANGE` in its grant types?

### Problem: Token Exchange Returns 500

**Cause:** The server's token controller doesn't handle `NATIVE_SSO` action.

**Fix:** Implement the `NATIVE_SSO` case in the token controller (see Part 7).

### Problem: `ds_hash` Doesn't Match

**Checklist:**
1. ✅ Are you using the same device secret that was originally issued?
2. ✅ Was the device secret stored correctly in shared storage?
3. ✅ Is the hash computation correct (SHA-256, base64url)?

### Problem: Session ID Validation Fails

**Checklist:**
1. ✅ Is the session still active on the AS?
2. ✅ Has the session been revoked (by logout or admin action)?
3. ✅ Is the session ID value correct (not truncated or corrupted)?

### Problem: App 2 Gets `interaction_required`

**Cause:** App 2 is requesting scopes that require explicit consent.

**Fix:** Either:
- Pre-authorize the scopes for App 2 during registration
- Have App 2 use a standard authorization code flow for initial consent

---

## Appendix A: Specification References

| Specification | Full Name | Version |
|--------------|-----------|---------|
| Native SSO | OpenID Connect Native SSO for Mobile Apps 1.0 | draft-07 (January 2025) |
| Token Exchange | OAuth 2.0 Token Exchange | RFC 8693 (January 2020) |
| OAuth 2.0 | The OAuth 2.0 Authorization Framework | RFC 6749 (October 2012) |
| OIDC Core | OpenID Connect Core 1.0 | Final (December 2023) |
| OIDC Discovery | OpenID Connect Discovery 1.0 | Final (December 2023) |

### Native SSO-Specific Registration

| Item | Value | Registry |
|------|-------|----------|
| Scope | `device_sso` | OpenID Connect |
| Token Type | `urn:openid:params:token-type:device-secret` | IANA OAuth Parameters |
| Parameter | `device_secret` | IANA OAuth Parameters |
| Metadata | `native_sso_supported` | IANA OAuth AS Metadata |

---

## Appendix B: Server Architecture

### Current Token Controller Flow

```
POST /api/token
  → tokenService.process(req)     // calls Authlete /auth/token
  → switch (result.action)
      case "OK":                  → return responseContent
      case "BAD_REQUEST":         → 400
      case "INVALID_CLIENT":      → 401/400
      case "INTERNAL_SERVER_ERROR": → 500
      case "JWT_BEARER":          → jwtVerificationService.processJwtBearer()
      case "PASSWORD":            → validate credentials → issue/fail
      case "TOKEN_EXCHANGE":      → handleTokenExchange()
      case "ID_TOKEN_REISSUABLE": → tokenService.issue()
      default:                    → 500 "Unknown token action"  ← Native SSO falls here
```

### What Native SSO Would Need

```
POST /api/token
  → tokenService.process(req)
  → switch (result.action)
      ...
      case "NATIVE_SSO":         → nativeSsoHandler(req, res, result)
        1. Validate sessionId
        2. Validate/generate deviceSecret
        3. Call authleteApi.nativeSso.process()
        4. Return responseContent
      ...

POST /api/nativesso/logout
  → nativeSsoService.logout({ sessionId })
  → return responseContent
```

### SDK Native SSO Methods

```typescript
// Processing (token exchange for App 2)
authleteApi.nativeSso.process({
  serviceId: "YOUR_SERVICE_ID",
  nativeSsoRequest: {
    accessToken: "...",
    deviceSecret: "...",
    deviceSecretHash: "...",  // optional, computed if omitted
  }
})

// Logout (revoke all tokens for a session)
authleteApi.nativeSso.logout({
  serviceId: "YOUR_SERVICE_ID",
  nativeSsoLogoutRequest: {
    sessionId: "session_abc123"
  }
})
```
