# OAuth 2.0 Token Exchange (RFC 8693) — Deep Dive

A comprehensive guide to Token Exchange: why it was created, the security problems it solves, how it works step by step, how Authlete implements it, and how to test it with this server.

---

## Table of Contents

- [Part 1: Why Token Exchange Exists](#part-1-why-token-exchange-exists)
- [Part 2: The Core Concepts](#part-2-the-core-concepts)
- [Part 3: How Token Exchange Works (Step by Step)](#part-3-how-token-exchange-works-step-by-step)
- [Part 4: Delegation vs. Impersonation](#part-4-delegation-vs-impersonation)
- [Part 5: Authlete Console Setup](#part-5-authlete-console-setup)
- [Part 6: Server Implementation](#part-6-server-implementation)
- [Part 7: Step-by-Step curl Testing](#part-7-step-by-step-curl-testing)
- [Part 8: Real-World Use Cases](#part-8-real-world-use-cases)
- [Part 9: How Token Exchange Hardens Security](#part-9-how-token-exchange-hardens-security)
- [Part 10: Error Scenarios](#part-10-error-scenarios)
- [Part 11: Token Exchange + Other Specs](#part-11-token-exchange--other-specs)
- [Part 12: Troubleshooting](#part-12-troubleshooting)
- [Appendix: Server Architecture](#appendix-server-architecture)

---

## Part 1: Why Token Exchange Exists

### The Problem

Imagine this: a user logs into a web app. That web app gets an access token. Now the web app needs to call a backend service on behalf of the user. But the backend service needs a **different** token — narrower scope, different audience, maybe a different format entirely.

Before Token Exchange, you had two bad options:

1. **Forward the original token** — This violates the principle of least privilege. Your frontend token might have `read write admin` scopes, but the backend only needs `read`. Passing the full token to the backend is a security risk: if the backend is compromised, the attacker gets admin access.

2. **Issue a brand new token via a separate flow** — This means redirecting the user through a whole new authorization flow just to call a backend service. Terrible UX.

Token Exchange solves this by giving you a third option: **swap one token for another** at the token endpoint, no browser redirect needed.

### The Real-World Analogy

Think of it like an airport:

- You (the user) get a **boarding pass** (access token) from the airline counter (authorization server)
- The boarding pass lets you through security and into the lounge
- But to enter the cockpit, you need a **crew badge** (exchanged token) — a different credential, for a different purpose, derived from the same identity
- The cockpit doesn't accept your boarding pass. It only accepts crew badges.
- Token Exchange is the process of going to a special desk at the airport and swapping your boarding pass for a crew badge

### Before Token Exchange vs. After

| Scenario | Before (Bad) | After (Token Exchange) |
|----------|-------------|----------------------|
| Frontend calls backend | Forward full-scoped token to backend | Exchange for narrow-scoped token for backend |
| Microservice A calls Service B | Pass user's token directly | Exchange for service-specific token |
| Third-party needs limited access | Give them the user's actual token | Exchange for token with reduced scope |
| User on shared device | Token with full access sits in browser | Exchange for short-lived, scoped token |

---

## Part 2: The Core Concepts

### The Two Tokens

Token Exchange works with **two** input tokens:

#### Subject Token (REQUIRED)

> "Represents the identity of the party on behalf of whom the request is being made." — RFC 8693 §2.1

In plain English: **who is this token for?** The subject token says "this is the user we're acting on behalf of."

Example: An access token issued to user `alice@example.com` from a login flow.

#### Actor Token (OPTIONAL)

> "Represents the identity of the acting party." — RFC 8693 §2.1

In plain English: **who is doing the acting?** The actor token says "this is the service that's using the user's token."

Example: A backend service `payment-service.example.com` that's calling another service on Alice's behalf.

**Without the actor token**: The new token looks like it came from Alice directly (impersonation).

**With the actor token**: The new token says "Alice delegated to payment-service, and payment-service is calling this API" (delegation).

### The Grant Type

Token Exchange uses a special grant type:

```
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
```

This tells the authorization server: "I'm not doing a regular login flow. I'm swapping tokens."

### Token Types

RFC 8693 defines standard identifiers for token types:

| Token Type | Identifier | What It Is |
|-----------|-----------|-----------|
| Access Token | `urn:ietf:params:oauth:token-type:access_token` | Standard OAuth access token |
| Refresh Token | `urn:ietf:params:oauth:token-type:refresh_token` | Standard OAuth refresh token |
| ID Token | `urn:ietf:params:oauth:token-type:id_token` | OpenID Connect ID token |
| JWT | `urn:ietf:params:oauth:token-type:jwt` | Any JSON Web Token |
| SAML 1.1 | `urn:ietf:params:oauth:token-type:saml1` | SAML 1.1 assertion |
| SAML 2.0 | `urn:ietf:params:oauth:token-type:saml2` | SAML 2.0 assertion |

### Request Parameters

| Parameter | Required | Description |
|-----------|:--------:|-------------|
| `grant_type` | YES | Must be `urn:ietf:params:oauth:grant-type:token-exchange` |
| `subject_token` | YES | The token representing the user's identity |
| `subject_token_type` | YES | The type of the subject token (from the table above) |
| `resource` | NO | The target service URL where the new token will be used (can repeat) |
| `audience` | NO | Logical name of the target service (can repeat) |
| `scope` | NO | Desired scopes for the new token |
| `requested_token_type` | NO | What type of token you want back |
| `actor_token` | NO | Token representing the acting party |
| `actor_token_type` | NO | Type of the actor token (required if `actor_token` is present) |

### Response Parameters

| Parameter | Required | Description |
|-----------|:--------:|-------------|
| `access_token` | YES | The newly issued token (despite the name, it can be any token type) |
| `issued_token_type` | YES | The type of the newly issued token |
| `token_type` | YES | How to use the token (`Bearer` or `N_A`) |
| `expires_in` | RECOMMENDED | Lifetime in seconds |
| `scope` | CONDITIONAL | Required if different from what was requested |
| `refresh_token` | NO | A refresh token (uncommon in token exchange) |

---

## Part 3: How Token Exchange Works (Step by Step)

### The Flow

```
┌──────────┐                              ┌──────────────┐
│          │  1. Client authenticates     │              │
│  Client  │     and gets access token    │              │
│  (App)   │ ←──────────────────────────  │  Auth Server │
│          │                              │              │
│          │  2. Client needs to call     │              │
│          │     a backend service        │              │
│          │     with narrower scope      │              │
│          │                              │              │
│          │  3. POST /api/token          │              │
│          │     grant_type=token-exchange │              │
│          │     subject_token=<old_token> │              │
│          │     resource=https://backend │              │
│          │     scope=read               │              │
│          │ ────────────────────────────→ │              │
│          │                              │  Authlete     │
│          │                              │  validates:   │
│          │                              │  - old token  │
│          │                              │  - client     │
│          │                              │  - policy     │
│          │                              │              │
│          │ ←──────────────────────────  │              │
│          │  4. New token (narrower)     │              │
│          │                              │              │
│          │  5. Client calls backend     │              │
│          │     with new token           │              │
│          │ ────────────────────────────→│  Backend     │
│          │     Authorization: Bearer    │  Service     │
│          │     <new_token>              │              │
└──────────┘                              └──────────────┘
```

### Step by Step

**Step 1**: Client gets an access token (via any standard OAuth flow — authorization code, client credentials, etc.)

**Step 2**: Client needs to call a backend service, but the current token has too much scope

**Step 3**: Client sends a token exchange request to the token endpoint:

```
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange
&subject_token=eyJhbGciOiJSUzI1NiIs...
&subject_token_type=urn%3Aietf%3Aparams%3Aoauth%3Atoken-type%3Aaccess_token
&resource=https%3A%2F%2Fbackend.example.com%2Fapi
&scope=read
```

**Step 4**: Authlete validates everything:
- Is the client authenticated and authorized for token exchange?
- Is the subject token valid (not expired, belongs to this service)?
- Does the policy allow this exchange?

**Step 5**: If all checks pass, Authlete creates a new token and returns it:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 600,
  "scope": "read"
}
```

**Step 6**: Client uses the new token to call the backend service

---

## Part 4: Delegation vs. Impersonation

This is the most important concept in Token Exchange. Understanding the difference between delegation and impersonation is key to using Token Exchange correctly.

### Impersonation

**A pretends to be B.** A gets all the rights that B has. The receiver of the token can't tell the difference between A and B.

```
User (Alice) ──→ Service A ──→ Auth Server
                    │
                    │ token exchange (no actor token)
                    │
                    ↓
              New token: "sub": "alice"
              (Service A is invisible)
```

When Service A calls Service B with this token, Service B thinks it's talking directly to Alice. Service A is invisible.

**When to use impersonation**: When the downstream service doesn't need to know about the intermediary. Example: A proxy service forwarding requests on behalf of a user.

### Delegation

**A acts on behalf of B, but A has its own identity.** The token carries information about both parties.

```
User (Alice) ──→ Service A ──→ Auth Server
                    │
                    │ token exchange (with actor token for Service A)
                    │
                    ↓
              New token:
              "sub": "alice"
              "act": { "sub": "service-a" }
              (Both identities present)
```

When Service A calls Service B with this token, Service B knows it's dealing with Service A, who is acting on behalf of Alice. Service B can make fine-grained decisions: "Alice's data, but only accessible to Service A."

**When to use delegation**: When the downstream service needs to know both the user AND the acting service. Example: A payment service calling a banking API — the bank needs to know both the user (who owns the account) and the payment service (who is initiating the transaction).

### The JWT `act` Claim

RFC 8693 defines the `act` (actor) claim for delegation:

```json
{
  "iss": "https://auth.example.com",
  "sub": "alice",
  "aud": "https://backend.example.com",
  "exp": 1443904177,
  "act": {
    "sub": "service-a"
  }
}
```

The `act` claim is nested — you can have chains of delegation:

```json
{
  "sub": "alice",
  "act": {
    "sub": "service-a",
    "act": {
      "sub": "service-b"
    }
  }
}
```

This means: Alice delegated to Service A, who delegated to Service B. The deepest `act` is the most recent actor.

### The `may_act` Claim

The `may_act` claim is the "permission slip" — it says who is authorized to act on behalf of the subject:

```json
{
  "iss": "https://auth.example.com",
  "sub": "alice",
  "may_act": {
    "sub": "service-a"
  }
}
```

This means: "Alice says Service A is allowed to act on her behalf." The authorization server can check this claim to decide whether to honor the token exchange request.

---

## Part 5: Authlete Console Setup

### Step 1: Enable Token Exchange at the service level

1. Log into [Authlete Console](https://console.authlete.com/)
2. Select your Service
3. Go to **Service Settings → Endpoints → Global Settings → Supported Grant Types**
4. Enable `TOKEN_EXCHANGE`
5. Click **Save**

### Step 2: Configure security settings

Go to **Tokens and Claims → Advanced → Token Exchange**:

| Setting | Recommended | Description |
|---------|:-----------:|-------------|
| Identifiable Clients Only | `true` | Reject requests from clients that don't identify themselves |
| Confidential Clients Only | `true` | Reject requests from public clients (e.g., SPAs) |
| Permitted Clients Only | `true` | Only allow clients explicitly granted permission to do token exchange |
| Reject Encrypted JWT | `true` | Reject encrypted JWTs as input tokens (Authlete can't decrypt them) |
| Reject Unsigned JWT | `true` | Reject unsigned JWTs as input tokens (security risk) |

> **Important**: If `Permitted Clients Only` is `true`, you must grant permission to each client individually (see Step 3).

### Step 3: Grant permission to specific clients

For each client that needs to perform token exchange:

1. Go to **Client Settings** → select your client
2. Navigate to **Tokens and Claims → Advanced → Token Exchange**
3. Enable **Explicit Permission for Token Exchange**
4. Click **Save**

### Step 4: Verify configuration

Use the server's FAPI status endpoint:

```bash
curl http://localhost:3000/api/fapi/status | python3 -m json.tool | grep -i token.exchange
```

---

## Part 6: Server Implementation

### How It Works

Token Exchange in this server goes through the **standard `/api/token` endpoint** — no separate route needed. The flow:

```
1. Client POSTs to /api/token with grant_type=urn:ietf:params:oauth:grant-type:token-exchange
2. TokenService sends the raw URL-encoded body to Authlete's /auth/token API
3. Authlete validates everything (client auth, subject token, policy)
4. Authlete returns action=TOKEN_EXCHANGE with validated token info
5. Token controller delegates to handleTokenExchange()
6. handleTokenExchange() calls Authlete's /auth/token/create with grantType=TOKEN_EXCHANGE
7. Authlete creates the new token and returns it
```

### Key Files

| File | Role |
|------|------|
| `server/src/services/token.service.ts` | Forwards the token request to Authlete (line 95) |
| `server/src/controllers/token.controller.ts:156` | Routes `TOKEN_EXCHANGE` action to the handler |
| `server/src/controllers/token-exchange-response.handler.ts` | Creates the new token via Authlete's token management API |
| `server/src/services/token.operations.service.ts` | Token management API wrapper (create/update/delete) |

### Action-to-HTTP Status Mapping

| Authlete Action | HTTP Status | Meaning |
|----------------|:-----------:|---------|
| `OK` | 200 | Token created successfully |
| `BAD_REQUEST` | 400 | Invalid request (bad tokens, missing params) |
| `FORBIDDEN` | 403 | Client not permitted to do token exchange |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

### What Authlete Validates

When a token exchange request arrives, Authlete automatically validates:

1. **Client authentication** — if `Identifiable Clients Only` or `Confidential Clients Only` is set
2. **Client permission** — if `Permitted Clients Only` is set, checks the client has explicit permission
3. **Subject token type** — must be a recognized type identifier
4. **Subject token validity** — depends on the token type:

| Input Token Type | What Authlete Validates |
|-----------------|----------------------|
| Access Token | Issued by this service, not expired, belongs to this service |
| Refresh Token | Issued by this service, not expired, belongs to this service |
| JWT | Valid JWT format, `exp`/`iat`/`nbf` claims (signature NOT verified) |
| ID Token | Full JWT validation + `iss` is HTTPS + signature verification |
| SAML 1.1/2.0 | No validation (Authlete doesn't parse SAML) |

> **Key limitation**: Access tokens and refresh tokens from **other** authorization servers cannot be used as input tokens. Authlete only recognizes tokens it issued itself.

---

## Part 7: Step-by-Step curl Testing

### Prerequisites

1. Authlete service configured with Token Exchange (see Part 5)
2. A confidential client with `clientId`, `clientSecret`, and token exchange permission
3. This server running on `http://localhost:3000`
4. An existing access token (from client_credentials or authorization code flow)

### Scenario 1: Exchange Access Token for a Narrower Token

This is the most common use case. You have an access token with broad scope, and you want a token with narrow scope for a specific backend service.

**Step 1**: Get an initial access token (client credentials)

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=read write admin"
```

Save the `access_token` from the response.

**Step 2**: Exchange it for a narrower token

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "resource=https://backend.example.com/api" \
  -d "scope=read"
```

**Response** (if permitted):

```json
{
  "access_token": "NEdL-q9EfOI4S5XzaMeimXAXVqS139Jm9DTYeLUAd5o",
  "token_type": "Bearer",
  "expires_in": 600,
  "scope": "read"
}
```

The new token only has `read` scope — even though the original had `read write admin`.

### Scenario 2: Exchange an ID Token for an Access Token

You have an ID token (from OIDC login) and need an access token for a specific API:

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
  -d "audience=https://api.example.com" \
  -d "scope=profile email"
```

> **Note**: ID tokens undergo full validation by Authlete — including signature verification and `iss` claim checks. The ID token must be signed with an asymmetric algorithm.

### Scenario 3: Exchange with Delegation (Actor Token)

Service A wants to call Service B on behalf of the user, and Service B should know both identities:

```bash
curl -X POST http://localhost:3000/api/token \
  -u "service_a_client_id:service_a_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "actor_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "actor_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "resource=https://service-b.example.com" \
  -d "scope=read"
```

The issued token will contain:

```json
{
  "sub": "alice",
  "act": {
    "sub": "service-a"
  }
}
```

### Scenario 4: Requesting a Specific Token Type

You can request a specific type of token back:

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJhbGciOiJSUzI1NiIs..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:jwt" \
  -d "scope=openid profile"
```

---

## Part 8: Real-World Use Cases

### 1. Microservice Token Scoping

**Problem**: User logs into a web app → gets a token with `read write admin` scopes. The web app calls a read-only analytics service. Passing the admin token to the analytics service is a security risk.

**Solution**: The web app exchanges the broad token for a narrow one:

```
Web App → Auth Server: "I have a token for alice. Give me a new token
                        for analytics.example.com with scope=read"
Auth Server → Web App: "Here's a narrow token, valid for 5 minutes"
Web App → Analytics Service: "Here's the narrow token"
```

If the analytics service is compromised, the attacker only gets `read` access — not `write` or `admin`.

### 2. Cross-Domain Federation

**Problem**: Company A authenticates a user. Company B needs to verify the user's identity and issue its own token.

**Solution**: Company A issues a JWT. Company B receives the JWT and exchanges it for its own access token:

```
User → Company A: logs in
Company A → User: JWT with user claims
User → Company B: presents JWT
Company B → Auth Server: "Exchange this JWT for a token for my API"
Auth Server → Company B: "Here's a token, validated and scoped for your API"
```

### 3. Legacy System Integration

**Problem**: A modern OAuth system needs to call a legacy system that expects SAML tokens.

**Solution**: Exchange an OAuth access token for a SAML assertion:

```
Modern App → Auth Server: "Exchange this access token for a SAML 2.0 assertion"
Auth Server → Modern App: "Here's a SAML assertion, use it with the legacy system"
```

### 4. Device Authorization (IoT)

**Problem**: A smart device needs limited access to user data, but the device can't do a full OAuth flow.

**Solution**: The user's phone exchanges a token for a device-specific token:

```
Phone → Auth Server: "Exchange alice's token for a token for device-123,
                       scope=temperature:read, expires in 1 hour"
Auth Server → Phone: "Here's a short-lived, narrow token for the device"
Phone → Device: "Here's your token"
```

### 5. Session Management

**Problem**: User has an active session with broad access. Time to refresh, but with tighter permissions.

**Solution**: Exchange the current session token for a new one with updated scope:

```
App → Auth Server: "Exchange session token for new token,
                     scope=openid profile (no more admin)"
Auth Server → App: "Here's your refreshed token with reduced scope"
```

---

## Part 9: How Token Exchange Hardens Security

### 1. Principle of Least Privilege

Token Exchange enforces least privilege by allowing you to issue tokens with the **minimum** scope needed for each downstream service.

| Without Token Exchange | With Token Exchange |
|----------------------|-------------------|
| One token with all scopes, passed everywhere | Each service gets only the scopes it needs |
| Compromised service = full access | Compromised service = limited access |

### 2. Token Lifetime Control

Each exchanged token can have a shorter lifetime than the original. The backend service gets a token valid for 5 minutes, not the user's full 1-hour session.

### 3. Audience Restriction

The `resource` and `audience` parameters ensure the new token is **only** valid for the intended service. Even if the token is stolen, it can't be used elsewhere.

```bash
# This token is ONLY valid for backend.example.com
resource=https://backend.example.com
```

### 4. Audit Trail

When using delegation (with `act` claim), every hop in the call chain is recorded. You know exactly who acted on behalf of whom:

```json
{
  "sub": "alice",
  "act": {
    "sub": "service-a",
    "act": {
      "sub": "service-b"
    }
  }
}
```

### 5. No Token Forwarding

Without Token Exchange, developers tend to forward tokens between services. This is dangerous because:

- The original token might have too much scope
- The original token might have the wrong audience
- You lose control over token lifetime

Token Exchange forces a deliberate, audited exchange at the authorization server, giving you full control.

### 6. Authlete Security Settings

Authlete provides extra security controls beyond what the RFC requires:

| Setting | Security Benefit |
|---------|-----------------|
| `Confidential Clients Only` | Prevents public clients (SPAs, mobile apps) from doing token exchange — only server-side apps |
| `Identifiable Clients Only` | Prevents anonymous clients — you always know who is exchanging tokens |
| `Permitted Clients Only` | Whitelist approach — only pre-approved clients can exchange tokens |
| `Reject Encrypted JWT` | Prevents Authlete from accepting JWTs it can't decrypt (reduces attack surface) |
| `Reject Unsigned JWT` | Prevents unsigned JWTs (which anyone could forge) |

---

## Part 10: Error Scenarios

### Error 1: Missing subject_token

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"
```

**Response** (400 Bad Request):

```json
{
  "error": "invalid_request",
  "error_description": "The request is missing one or more required parameters."
}
```

### Error 2: Expired subject_token

If the access token passed as `subject_token` has expired:

```json
{
  "error": "invalid_request",
  "error_description": "The subject token has expired."
}
```

### Error 3: Client not permitted

If `Permitted Clients Only` is enabled and the client hasn't been granted permission:

```bash
curl -X POST http://localhost:3000/api/token \
  -u "unpermitted_client:secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=some_token" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"
```

**Response** (403 Forbidden):

```json
{
  "error": "invalid_target",
  "error_description": "The client is not permitted to perform token exchange."
}
```

### Error 4: Unauthenticated client

If `Confidential Clients Only` is enabled and the client doesn't authenticate:

**Response** (401 Unauthorized):

```json
{
  "error": "invalid_client",
  "error_description": "Client authentication required."
}
```

### Error 5: Invalid token type identifier

```bash
-d "subject_token_type=invalid_type"
```

**Response** (400 Bad Request):

```json
{
  "error": "invalid_request",
  "error_description": "The subject_token_type is not recognized."
}
```

### Error 6: Token from different service

If you present an access token issued by a **different** Authlete service:

```json
{
  "error": "invalid_request",
  "error_description": "The subject token was not issued by this service."
}
```

> **Key point**: Authlete only accepts tokens it issued. You can't exchange tokens from external providers (Google, Auth0, etc.) unless they're JWTs with the right format.

---

## Part 11: Token Exchange + Other Specs

### Token Exchange + Resource Indicators (RFC 8707)

Use the `resource` parameter to tie the exchanged token to a specific resource server:

```bash
resource=https://api.example.com/resource-server-1
resource=https://api.example.com/resource-server-2
```

The issued token will be valid at both resources. See the [Resource Indicators docs](https://www.rfc-editor.org/rfc/rfc8707) for details.

### Token Exchange + DPoP (RFC 9449)

If your service requires DPoP-bound tokens, include a DPoP proof with the token exchange request:

```bash
curl -X POST http://localhost:3000/api/token \
  -u "client_id:client_secret" \
  -H "DPoP: <dpop_proof_jwt>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=<token>" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token"
```

The issued token will be bound to the DPoP key — only the holder of the private key can use it.

### Token Exchange + Grant Management

After exchanging a token, you can manage the resulting grant using the [Grant Management API](GRANT-MANAGEMENT.md). Query what grants exist, or revoke them when they're no longer needed.

---

## Part 12: Troubleshooting

### "invalid_target" error

**Cause**: The `resource` or `audience` value is not recognized by the authorization server.
**Fix**: Ensure the resource URI matches what's configured in your Authlete service, or remove the `resource` parameter to let the server decide.

### "The subject token was not issued by this service"

**Cause**: You're trying to exchange a token from an external provider (e.g., Google, Auth0).
**Fix**: Only tokens issued by this Authlete service can be used as subject tokens. For external tokens, use the JWT type (`urn:ietf:params:oauth:token-type:jwt`) — but Authlete only validates the JWT structure, not the signature.

### 403 Forbidden on token exchange

**Cause**: The client hasn't been granted permission for token exchange, or `Permitted Clients Only` is enabled.
**Fix**: Go to the client's settings in Authlete Console → **Tokens and Claims → Advanced → Token Exchange** → enable **Explicit Permission for Token Exchange**.

### "The token exchange request is not supported"

**Cause**: Token Exchange is not enabled as a supported grant type.
**Fix**: Go to Authlete Console → **Service Settings → Endpoints → Global Settings → Supported Grant Types** → enable `TOKEN_EXCHANGE`.

### Token exchange works but the issued token has unexpected scope

**Cause**: The authorization server's policy may limit the scope based on the client, subject, or resource.
**Fix**: Check the `scope` in the response. Authlete may have downscoped the token based on policy. The response always reflects the actual granted scope.

### Exchanged token is rejected by the backend service

**Cause**: The backend service may check `aud` claim or token issuer.
**Fix**: Ensure the `resource` or `audience` in the exchange request matches what the backend service expects. The `aud` claim in the issued token will match the `resource` value.

---

## Appendix: Server Architecture

### Data Flow Diagram

```
┌──────────┐  POST /api/token        ┌──────────────┐
│          │  grant_type=token-exchange│              │
│  Client  │ ───────────────────────→ │  Express     │
│          │  subject_token=...       │  Server      │
│          │  subject_token_type=...  │              │
│          │                          │  TokenService│
│          │                          │  ────────────│
│          │                          │  sends raw   │
│          │                          │  params to   │
│          │                          │  Authlete    │
│          │                          │              │
│          │                          │  Authlete    │
│          │                          │  validates:  │
│          │                          │  ✓ client    │
│          │                          │  ✓ token     │
│          │                          │  ✓ policy    │
│          │                          │              │
│          │ ←─────────────────────── │  action=     │
│          │  access_token (new)      │  TOKEN_EXCHANGE│
│          │  issued_token_type       │              │
│          │  token_type              │  token/create│
│          │  expires_in              │  creates new │
│          │  scope                   │  token       │
└──────────┘                          └──────────────┘
```

### Files Involved

| File | Role |
|------|------|
| `server/src/services/token.service.ts` | Forwards token requests to Authlete's `/auth/token` API |
| `server/src/controllers/token.controller.ts:156` | Routes `TOKEN_EXCHANGE` action to handler |
| `server/src/controllers/token-exchange-response.handler.ts` | Creates the new token via Authlete's token management API |
| `server/src/services/token.operations.service.ts` | Token management wrapper (`normalizeGrantType` maps `token_exchange` → `TOKEN_EXCHANGE`) |
| `server/src/routes/openapi.routes.ts:114` | Documents `urn:ietf:params:oauth:grant-type:token-exchange` in OpenAPI spec |
| `server/tests/e2e/e2e.test.ts:1282-1304` | E2E test: exchange access token for new token |

### Authlete API Mapping

| Express Endpoint | Authlete API | Description |
|-----------------|-------------|-------------|
| `POST /api/token` (with token exchange grant) | `POST /auth/token` | Validates request, returns `action=TOKEN_EXCHANGE` |
| (handled internally) | `POST /auth/token/create` | Creates the new token with `grantType=TOKEN_EXCHANGE` |

### Token Exchange Request/Response Lifecycle

```
1. Client POSTs to /api/token
   → grant_type=urn:ietf:params:oauth:grant-type:token-exchange
   → subject_token=<access_token>
   → subject_token_type=urn:ietf:params:oauth:token-type:access_token

2. TokenService sends raw params to Authlete /auth/token

3. Authlete validates:
   → Client authentication (if required)
   → Client permission for token exchange (if configured)
   → Subject token validity (not expired, belongs to this service)
   → Token type identifiers are valid
   → Policy checks (scope, audience, resource)

4. Authlete returns action=TOKEN_EXCHANGE with:
   → subjectToken (the validated input token)
   → subjectTokenInfo (metadata about the token)
   → clientId, scopes, subject

5. token.controller.ts routes to handleTokenExchange()

6. handleTokenExchange() builds a TokenCreateRequest:
   → grantType: "TOKEN_EXCHANGE"
   → clientId, subject, scopes from the Authlete response

7. TokenManagementService.create() calls Authlete /auth/token/create

8. Authlete creates the new token and returns:
   → accessToken, tokenType, expiresIn, scopes

9. Server returns to client:
   → access_token, token_type, expires_in, scope
```

### Test Coverage

- **E2E tests** (`tests/e2e/e2e.test.ts:1282-1304`): Single test — exchanges an access token for a new token. Accepts 200 (success), 400 (not permitted), or 429 (rate limit).
- **Unit tests**: Token exchange is covered implicitly through `TokenService` unit tests (the same `process()` method handles all grant types).
- **Integration tests**: Token endpoint integration tests cover the action routing, including the `TOKEN_EXCHANGE` case.
