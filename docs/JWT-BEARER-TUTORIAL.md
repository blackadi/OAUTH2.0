# JWT Authorization Grant (RFC 7523 §2.1) — Deep Dive

A comprehensive guide to JWT Authorization Grants: why they exist, the security problems they solve, how Authlete implements them, and how to test them with this server.

---

## Table of Contents

- [Part 1: Why JWT Authorization Grants Exist](#part-1-why-jwt-authorization-grants-exist)
- [Part 2: The Core Concept](#part-2-the-core-concept)
- [Part 3: How JWT Bearer Grant Works (Step by Step)](#part-3-how-jwt-bearer-grant-works-step-by-step)
- [Part 4: JWT Claims and Validation](#part-4-jwt-claims-and-validation)
- [Part 5: Authlete Console Setup](#part-5-authlete-console-setup)
- [Part 6: Server Implementation](#part-6-server-implementation)
- [Part 7: Step-by-Step curl Testing](#part-7-step-by-step-curl-testing)
- [Part 8: Real-World Use Cases](#part-8-real-world-use-cases)
- [Part 9: How JWT Bearer Grant Hardens Security](#part-9-how-jwt-bearer-grant-hardens-security)
- [Part 10: Error Scenarios](#part-10-error-scenarios)
- [Part 11: JWT Bearer Grant vs. Other Flows](#part-11-jwt-bearer-grant-vs-other-flows)
- [Part 12: JWT Bearer Grant + Other Specs](#part-12-jwt-bearer-grant--other-specs)
- [Part 13: Troubleshooting](#part-13-troubleshooting)
- [Appendix: Server Architecture](#appendix-server-architecture)

---

## Part 1: Why JWT Authorization Grants Exist

### The Problem

In a standard OAuth 2.0 authorization code flow, you need a browser redirect. The user clicks "Login", gets redirected to the authorization server, authenticates, sees a consent screen, gets redirected back with a code, and the client exchanges the code for a token.

That works great for web apps. But what about:

- **Server-to-server communication** — Two backend services need to exchange tokens. There's no browser, no user, no redirect.
- **Cross-domain federation** — Company A has already authenticated a user and issued a JWT. Company B needs to trust that JWT and issue its own access token without re-authenticating the user.
- **CI/CD pipelines** — A deployment system needs short-lived tokens to push code or deploy services. There's no interactive login possible.
- **Microservice architectures** — Service A has a signed assertion proving its identity. It needs an access token to call Service B, but going through a browser redirect is impossible.

### The Solution

RFC 7523 Section 2.1 defines a way to use a **JWT as an authorization grant**. Instead of presenting an authorization code (which came from a browser redirect), you present a **signed JWT** directly at the token endpoint.

The JWT acts as a "proof of identity" — it's signed by someone the authorization server trusts, and it contains claims about who is requesting the token and what they want.

### The Real-World Analogy

Think of it like a **bank wire transfer**:

- **Authorization code flow**: You walk into the bank (browser redirect), show your ID (login), sign a form (consent), and get a cashier's check (access token).
- **JWT bearer grant**: You already have a notarized document (signed JWT) from a trusted notary (issuer). You walk up to the bank window (token endpoint), hand over the notarized document, and the bank verifies it and gives you cash (access token). No need to go through the whole ID verification process — the notarized document IS your proof.

### Before JWT Bearer Grant vs. After

| Scenario | Before (Bad) | After (JWT Bearer Grant) |
|----------|-------------|------------------------|
| Service A calls Service B | A shares its own access token with B (dangerous — B gets full access) | A presents a signed JWT → B's auth server issues a narrow token |
| Company A authenticates user, Company B needs access | User re-authenticates at Company B (bad UX) | A gives user a signed JWT → user presents it at B's token endpoint → B issues its own token |
| CI/CD needs deployment token | Store long-lived credentials in CI config (security risk) | CI system signs a short-lived JWT → exchanges it for a deployment token |
| Cross-domain SSO | Complex SAML federation setup | Simple JWT exchange at the token endpoint |

---

## Part 2: The Core Concept

### The Two Roles

In JWT bearer grant, there are two distinct roles:

1. **JWT Issuer** — The entity that creates and signs the JWT. This could be another authorization server, an identity provider, or any trusted party.

2. **Authorization Server** — The entity that receives the JWT, verifies it, and issues an access token.

### The Flow in One Sentence

> "I have a signed JWT that proves who I am. Please give me an access token."

That's it. The JWT replaces the authorization code. The token endpoint processes it just like any other grant type — but instead of exchanging a code for a token, it exchanges a JWT for a token.

### The Grant Type

```
grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
```

This tells the authorization server: "I'm presenting a JWT as my authorization grant."

### Client Authentication: Optional

Unlike most OAuth flows, JWT bearer grant **does not require client authentication**. The RFC states:

> "JWT authorization grants may be used with or without client authentication or identification."

This makes sense — the JWT itself IS the proof of identity. If the JWT is valid and signed by a trusted issuer, the authorization server doesn't necessarily need to know which client is making the request.

However, authorization servers can (and should) require client authentication as an additional security layer. This is a deployment decision.

---

## Part 3: How JWT Bearer Grant Works (Step by Step)

### The Flow

```
┌──────────┐                              ┌──────────────┐
│          │  1. Some system authenticates │              │
│  JWT     │     and issues a signed JWT  │  JWT Issuer  │
│  Issuer  │     (out of scope of RFC)    │  (e.g., IdP) │
│          │                              │              │
└────┬─────┘                              └──────────────┘
     │
     │  2. Client presents JWT at token endpoint
     │
     │  POST /api/token
     │  grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
     │  assertion=<signed_jwt>
     │
     ▼
┌──────────┐                              ┌──────────────┐
│          │ ───────────────────────────→ │              │
│  Client  │                              │  Auth Server │
│          │ ←─────────────────────────── │  (Authlete)  │
│          │   access_token               │              │
└──────────┘                              └──────────────┘
```

### Step by Step

**Step 1**: A JWT is created and signed by a trusted issuer. The JWT contains claims about the subject (who), the issuer (who created it), the audience (who should accept it), and expiration (when it expires).

**Step 2**: The client sends the JWT to the authorization server's token endpoint:

```
POST /api/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer
&assertion=eyJhbGciOiJSUzI1NiIs...
```

**Step 3**: The authorization server validates the JWT:
- Is the format valid?
- Does it have the required claims (`iss`, `sub`, `aud`, `exp`)?
- Is the `aud` claim pointing to this authorization server?
- Is the JWT within its validity window (`exp`, `nbf`, `iat`)?
- Is the signature valid? (The server must verify this)

**Step 4**: If all checks pass, the authorization server issues an access token:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile"
}
```

**Step 5**: The client uses the access token to call protected resources.

---

## Part 4: JWT Claims and Validation

### Required Claims

RFC 7523 §3 specifies these required claims in the JWT:

| Claim | Required | Description |
|-------|:--------:|-------------|
| `iss` | YES | **Issuer** — who created the JWT. Must be a unique identifier for the issuing entity. |
| `sub` | YES | **Subject** — who this JWT is about. Typically the user or service identity. |
| `aud` | YES | **Audience** — who should accept this JWT. Must include the authorization server's identifier. |
| `exp` | YES | **Expiration Time** — when the JWT expires. The server rejects expired JWTs. |

### Optional Claims

| Claim | Required | Description |
|-------|:--------:|-------------|
| `nbf` | NO | **Not Before** — the JWT must not be accepted before this time. |
| `iat` | NO | **Issued At** — when the JWT was created. The server may reject very old JWTs. |
| `jti` | NO | **JWT ID** — a unique identifier for replay protection. The server may track used `jti` values. |

### Example JWT Claims Set

```json
{
  "iss": "https://identity-provider.example.com",
  "sub": "alice@example.com",
  "aud": "https://auth.example.com",
  "exp": 1700000000,
  "nbf": 1699996400,
  "iat": 1699996400,
  "jti": "unique-token-id-123"
}
```

### What Authlete Validates Automatically

When a JWT bearer grant request arrives, Authlete performs these validations:

| Step | Validation | What Happens on Failure |
|:----:|-----------|----------------------|
| 1 | `assertion` parameter is present and not empty | Rejected (missing assertion) |
| 2 | JWT format is valid (header.payload.signature) | Rejected (malformed JWT) |
| 3 | If JWT is encrypted: check `jwtGrantEncryptedJwtRejected` flag | Reject or skip validation |
| 4 | `iss` claim exists and is a string | Rejected (missing issuer) |
| 5 | `sub` claim exists and is a string | Rejected (missing subject) |
| 6 | `aud` claim exists and is a string or array | Rejected (missing audience) |
| 7 | `aud` includes this server's issuer or token endpoint URL | Rejected (wrong audience) |
| 8 | `exp` claim exists and JWT is not expired | Rejected (expired JWT) |
| 9 | `iat` claim: current time >= iat (if present) | Rejected (JWT from the future) |
| 10 | `nbf` claim: current time >= nbf (if present) | Rejected (JWT not yet valid) |
| 11 | JWT is signed (check `jwtGrantUnsignedJwtRejected` flag) | Reject or skip |

> **Critical**: Authlete does **NOT** verify the JWT signature. This is by design — there's no standard way to obtain the signing key. Your server must verify the signature separately. In this server, `JwtVerificationService` calls Authlete's JOSE verify API to handle signature verification.

### Audience Validation Detail

The `aud` claim must include one of:
- The **issuer identifier** of the Authlete service (configured in the Console)
- The **token endpoint URL** of the service

This ensures the JWT was specifically created for this authorization server — you can't take a JWT meant for Server A and use it at Server B.

---

## Part 5: Authlete Console Setup

### Step 1: Enable JWT Bearer Grant at the service level

JWT Bearer Grant is enabled as part of the token endpoint — no separate endpoint needed. However, you need to configure the security settings.

1. Log into [Authlete Console](https://console.authlete.com/)
2. Select your Service
3. Go to **Service Settings → Endpoints → Token → JWT Authz Grant**

### Step 2: Configure security settings

| Setting | Recommended | Description |
|---------|:-----------:|-------------|
| **Client ID** | `Required` | Reject token requests without a `client_id`. Adds an extra layer of security — even if the JWT is valid, the client must also identify itself. |
| **Encrypted JWT** | `Rejected` | Reject encrypted JWTs. Authlete can't decrypt them (no standard key exchange mechanism), so accepting them creates a security gap. |
| **Unsigned JWT** | `Rejected` | Reject unsigned JWTs. Anyone can create an unsigned "JWT" — it's just a JSON blob. Always require a signature. |

### Step 3: Verify the issuer identifier

The JWT's `aud` claim must match either:
- Your service's **issuer identifier** (the `issuer` field in service metadata)
- Your service's **token endpoint URL**

Check your service's issuer:

```bash
curl http://localhost:3000/api/fapi/status | python3 -m json.tool | grep issuer
```

The JWT you create must have `"aud": "<this_issuer_value>"` or `"aud": "<token_endpoint_url>"`.

---

## Part 6: Server Implementation

### How It Works

JWT Bearer Grant in this server follows a **two-phase** approach:

```
Phase 1: Token request arrives at /api/token
  → TokenService sends raw params to Authlete /auth/token
  → Authlete validates JWT structure and claims
  → Authlete returns action=JWT_BEARER with the assertion

Phase 2: Controller delegates to JwtVerificationService
  → Calls Authlete's JOSE verify API to check the JWT signature
  → Decodes the JWT to extract subject, issuer, audience
  → Calls Authlete's token management API to create the access token
  → Returns the access token to the client
```

### Key Files

| File | Role |
|------|------|
| `server/src/controllers/token.controller.ts:84-99` | Routes `JWT_BEARER` action to `JwtVerificationService` |
| `server/src/services/jwt-verification.service.ts` | Core logic: verifies JWT signature via Authlete JOSE API, creates token via management API |
| `server/src/services/token.service.ts` | Forwards token requests to Authlete's `/auth/token` API |
| `server/src/services/token.operations.service.ts:32` | Maps `urn:ietf:params:oauth:grant-type:jwt-bearer` → `JWT_BEARER` |

### Action-to-HTTP Status Mapping

| Authlete Action | HTTP Status | Meaning |
|----------------|:-----------:|---------|
| `JWT_BEARER` | — | Routed to `JwtVerificationService` (not a final status) |
| (success) | 200 | Token created successfully |
| `BAD_REQUEST` | 400 | Invalid JWT, missing claims, or token creation failed |
| `FORBIDDEN` | 403 | Client not authorized |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

### What JwtVerificationService Does

```typescript
// 1. Extract the assertion from Authlete's response
const assertion = result.assertion;

// 2. Call Authlete's JOSE verify API to check the signature
const verifyResp = await authleteApi.joseObject.joseVerifyApi({
  serviceId,
  joseVerifyRequest: {
    jose: assertion,
    clientIdentifier,
    signedByClient: true,
    mandatoryClaims: ["iss", "sub", "aud"],
  },
});

// 3. If valid, decode the JWT to extract claims
const decoded = jwt.decode(assertion, { complete: true });

// 4. Create a new access token via Authlete's token management API
const createRequest = {
  grantType: "JWT_BEARER",
  subject: decoded.payload.sub,
  clientId: result.clientId,
  issuer: decoded.payload.iss,
  audience: [decoded.payload.aud],
  scopes: result.scopes,
};
const createResp = await tokenManagementService.create(createRequest);
```

### Two-Phase Validation

This is important to understand:

1. **Authlete Phase 1** (`/auth/token`): Validates JWT **structure and claims** (format, `iss`, `sub`, `aud`, `exp`, `nbf`, `iat`). Does NOT verify the signature.

2. **Authlete Phase 2** (`joseVerifyApi`): Verifies the JWT **signature** using the JOSE verification API. This is where the cryptographic check happens.

This two-phase approach exists because signature verification requires knowing which key to use, and the key discovery mechanism is deployment-specific. Authlete leaves that to the authorization server implementation.

---

## Part 7: Step-by-Step curl Testing

### Prerequisites

1. Authlete service configured (see Part 5)
2. This server running on `http://localhost:3000`
3. A way to create signed JWTs (we'll use `openssl` and `node`)

### Scenario 1: Basic JWT Bearer Grant (RS256)

**Step 1**: Generate an RSA key pair

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

**Step 2**: Create a signed JWT

```bash
# Create JWT header
HEADER=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Create JWT payload with required claims
PAYLOAD=$(echo -n '{"iss":"https://auth.example.com","sub":"alice@example.com","aud":"https://auth.example.com","exp":'$(date -d '+1 hour' +%s)',"iat":'$(date +%s)'}' | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Sign the JWT
SIGNATURE=$(echo -n "${HEADER}.${PAYLOAD}" | openssl dgst -sha256 -sign private.pem | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Combine into full JWT
JWT="${HEADER}.${PAYLOAD}.${SIGNATURE}"

echo "JWT: $JWT"
```

**Step 3**: Exchange the JWT for an access token

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  -d "assertion=$JWT" \
  -d "client_id=your_client_id"
```

**Response** (if JWT is valid):

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": ""
}
```

### Scenario 2: JWT Bearer Grant Using Node.js

For easier JWT creation, use Node.js:

```bash
node -e "
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('private.pem');
const token = jwt.sign(
  {
    iss: 'https://auth.example.com',
    sub: 'alice@example.com',
    aud: 'https://auth.example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  privateKey,
  { algorithm: 'RS256' }
);
console.log(token);
"
```

Then use the output as the `assertion` value.

### Scenario 3: JWT Bearer Grant with Scopes

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  -d "assertion=$JWT" \
  -d "client_id=your_client_id" \
  -d "scope=openid profile email"
```

### Scenario 4: JWT Bearer Grant with ES256 (ECDSA)

```bash
# Generate EC private key
openssl ecparam -genkey -name prime256v1 -noout -out ec-private.pem

# Extract EC public key
openssl ec -in ec-private.pem -pubout -out ec-public.pem

# Create and sign JWT with ES256
node -e "
const jwt = require('jsonwebtoken');
const fs = require('fs');
const privateKey = fs.readFileSync('ec-private.pem');
const token = jwt.sign(
  {
    iss: 'https://auth.example.com',
    sub: 'bob@example.com',
    aud: 'https://auth.example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  privateKey,
  { algorithm: 'ES256' }
);
console.log(token);
"
```

### Scenario 5: JWT Bearer Grant Without Client Authentication

If the authorization server allows unauthenticated clients:

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  -d "assertion=$JWT"
```

Note: No `client_id` or `client_secret` — the JWT itself is the proof.

---

## Part 8: Real-World Use Cases

### 1. Cross-Domain SSO (Single Sign-On)

**Problem**: User logs into Company A. Company B needs to give the user access to its services without re-authenticating.

**Solution**:

```
User → Company A: logs in
Company A → User: signed JWT with user claims
User → Company B: presents JWT at token endpoint
Company B → Auth Server: "Verify this JWT, issue a token for my API"
Auth Server → Company B: "Here's an access token"
```

This is how many enterprise SSO systems work — the JWT acts as a portable identity credential.

### 2. Service-to-Service Authentication

**Problem**: Microservice A needs to call Microservice B, but there's no user involved and no browser for redirects.

**Solution**:

```
Service A → Auth Server: "Here's my signed JWT (证明我是Service A). Give me a token for Service B."
Auth Server → Service A: "Here's an access token, valid for 5 minutes"
Service A → Service B: calls with the access token
```

### 3. CI/CD Pipeline Authentication

**Problem**: A CI/CD pipeline needs to push code to a repository or deploy to a cloud provider. Storing long-lived credentials is a security risk.

**Solution**:

```
CI System → Auth Server: "Here's a signed JWT (证明我是GitHub Actions). Give me a deployment token."
Auth Server → CI System: "Here's a short-lived token (60 seconds)"
CI System → Deployment API: deploys with the short-lived token
```

### 4. Device Authorization (IoT)

**Problem**: A smart device needs to authenticate, but has no browser and limited input capabilities.

**Solution**:

```
Device → Auth Server: "Here's my device certificate wrapped in a JWT. Give me a token."
Auth Server → Device: "Here's an access token, valid for 24 hours"
Device → Cloud API: reports temperature data with the token
```

### 5. Legacy System Integration

**Problem**: A legacy system uses SAML assertions. You need to bridge SAML to OAuth.

**Solution**:

```
Legacy System → Identity Provider: authenticates user, gets SAML assertion
Identity Provider → converts SAML to JWT, signs it
Client → Auth Server: "Here's the JWT (from the SAML conversion). Give me an OAuth token."
Auth Server → Client: "Here's an OAuth access token"
Client → Modern API: calls with the OAuth token
```

---

## Part 9: How JWT Bearer Grant Hardens Security

### 1. Stateless Authentication

The JWT is self-contained. The authorization server doesn't need to look up the user in a database — all the identity information is in the JWT itself. This reduces database load and eliminates session state.

### 2. Cryptographic Proof

The JWT is signed. The authorization server can verify that:
- The JWT was created by a trusted issuer (signature check)
- The JWT hasn't been tampered with (integrity check)
- The JWT is still valid (expiration check)

### 3. Audience Restriction

The `aud` claim ensures the JWT is only valid at the intended authorization server. You can't take a JWT meant for Company A and use it at Company B.

### 4. Short-Lived Credentials

JWTs have `exp` claims. Even if a JWT is stolen, it's only valid for a limited time. The access token issued in exchange can have an even shorter lifetime.

### 5. No Long-Lived Secrets

Unlike API keys or client secrets (which are long-lived and must be stored securely), JWTs are typically short-lived. The signing key can be rotated regularly without breaking existing integrations.

### 6. Authlete Security Settings

| Setting | Security Benefit |
|---------|-----------------|
| **Client ID Required** | Even if the JWT is valid, the client must also identify itself. Prevents stolen JWTs from being used by unknown clients. |
| **Reject Encrypted JWT** | Authlete can't decrypt JWTs — accepting them would skip validation entirely. |
| **Reject Unsigned JWT** | Unsigned "JWTs" are just JSON. Anyone can forge them. Always require a signature. |

### 7. Signature Verification Is Mandatory

The RFC states: "The JWT MUST be digitally signed or have a Message Authentication Code (MAC) applied by the issuer. The authorization server MUST reject JWTs with an invalid signature or MAC."

This server implements this via Authlete's JOSE verify API — every JWT signature is verified before a token is issued.

---

## Part 10: Error Scenarios

### Error 1: Missing assertion parameter

```bash
curl -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer"
```

**Response** (400 Bad Request):

```json
{
  "error": "invalid_request",
  "error_description": "Missing assertion"
}
```

### Error 2: Expired JWT

If the JWT's `exp` claim is in the past:

```json
{
  "error": "invalid_grant",
  "error_description": "The JWT has expired."
}
```

### Error 3: Wrong audience

If the JWT's `aud` claim doesn't include this authorization server:

```json
{
  "error": "invalid_grant",
  "error_description": "Audience validation failed."
}
```

### Error 4: Invalid signature

If the JWT signature doesn't match the signing key:

```json
{
  "error": "invalid_request",
  "error_description": "Invalid assertion"
}
```

### Error 5: Missing required claims

If the JWT is missing `iss`, `sub`, or `aud`:

```json
{
  "error": "invalid_request",
  "error_description": "Invalid assertion"
}
```

### Error 6: Unsigned JWT (when rejected)

If `jwtGrantUnsignedJwtRejected` is `true` and the JWT is not signed:

```json
{
  "error": "invalid_grant",
  "error_description": "The JWT is not signed."
}
```

### Error 7: Client not authenticated (when required)

If the server requires client authentication but none is provided:

```json
{
  "error": "invalid_client",
  "error_description": "Client authentication required."
}
```

---

## Part 11: JWT Bearer Grant vs. Other Flows

| Feature | Authorization Code | Client Credentials | JWT Bearer Grant | Token Exchange |
|---------|:--:|:--:|:--:|:--:|
| Requires browser redirect | YES | NO | NO | NO |
| Requires user interaction | YES | NO | NO | NO |
| Client authentication required | YES | YES | OPTIONAL | OPTIONAL |
| Input credential | Authorization code | Client secret | Signed JWT | Existing token |
| Use case | Web apps, SPAs | Machine-to-machine | Cross-domain, federation | Token scoping, delegation |
| JWT signature verification needed | NO | NO | YES | Depends on token type |
| RFC | 6749 §4.1 | 6749 §4.4 | 7523 §2.1 | 8693 |

### When to Use JWT Bearer Grant

- You already have a signed JWT from a trusted source
- There's no browser available (server-to-server)
- You need cross-domain identity federation
- You want to avoid storing long-lived secrets

### When to Use Something Else

- **User is present**: Use authorization code flow (with PKCE for public clients)
- **Machine-to-machine, no JWT**: Use client credentials flow
- **Need to swap one token for another**: Use token exchange (RFC 8693)

---

## Part 12: JWT Bearer Grant + Other Specs

### JWT Bearer Grant + OpenID Connect

If the JWT is an ID Token from an OpenID Connect provider, you can use it as an authorization grant. The authorization server can discover the provider's signing keys via the OpenID Connect Discovery endpoint.

### JWT Bearer Grant + FAPI

In FAPI 2.0 deployments, JWT bearer grant can be used for backchannel authentication. The JWT is signed with a key registered during Dynamic Client Registration.

### JWT Bearer Grant + DPoP

If the authorization server requires DPoP-bound tokens, include a DPoP proof with the token exchange request:

```bash
curl -X POST http://localhost:3000/api/token \
  -H "DPoP: <dpop_proof_jwt>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  -d "assertion=<signed_jwt>"
```

The issued token will be bound to the DPoP key.

### JWT Bearer Grant + Token Exchange

You can combine both: use a JWT bearer grant to get an initial token, then use token exchange to get a scoped token for a specific service.

```
Step 1: JWT Bearer Grant → get access token
Step 2: Token Exchange → swap access token for scoped token
```

---

## Part 13: Troubleshooting

### "Missing assertion" error

**Cause**: The `assertion` parameter was not sent in the request body.
**Fix**: Ensure your request includes `assertion=<your_jwt>`.

### "Invalid assertion" error

**Cause**: The JWT signature verification failed, or the JWT format is malformed.
**Fix**:
1. Check that the JWT is properly signed with the correct algorithm (RS256, ES256, etc.)
2. Verify the signing key matches what the authorization server expects
3. Ensure the JWT has the correct format (header.payload.signature)

### "invalid_grant" with "expired" in description

**Cause**: The JWT's `exp` claim is in the past.
**Fix**: Create a fresh JWT with a future `exp` value.

### "invalid_grant" with "audience" in description

**Cause**: The JWT's `aud` claim doesn't include the authorization server's identifier.
**Fix**: Set `aud` to the authorization server's issuer identifier or token endpoint URL.

### 401 Unauthorized

**Cause**: Client authentication failed (if the server requires it).
**Fix**: Include valid `client_id` and `client_secret` (Basic auth or body params).

### "The JWT is not signed"

**Cause**: The JWT has `"alg":"none"` in the header.
**Fix**: Always sign JWTs with a real algorithm (RS256, ES256, etc.). The `jwtGrantUnsignedJwtRejected` setting rejects unsigned JWTs.

### Signature verification fails but JWT looks correct

**Cause**: The authorization server's JOSE verification endpoint can't find the signing key.
**Fix**:
1. If the JWT is from an external issuer, ensure the issuer supports OpenID Connect Discovery (so the server can fetch the signing keys from `jwks_uri`)
2. If the JWT is self-issued, ensure the public key is registered with the authorization server

---

## Appendix: Server Architecture

### Data Flow Diagram

```
┌──────────┐  POST /api/token             ┌──────────────┐
│          │  grant_type=jwt-bearer        │              │
│  Client  │  assertion=<signed_jwt>       │  Express     │
│          │ ───────────────────────────→  │  Server      │
│          │                              │              │
│          │                              │  TokenService│
│          │                              │  ────────────│
│          │                              │  sends raw   │
│          │                              │  params to   │
│          │                              │  Authlete    │
│          │                              │              │
│          │                              │  Authlete    │
│          │                              │  validates:  │
│          │                              │  ✓ JWT format│
│          │                              │  ✓ claims    │
│          │                              │  ✓ audience  │
│          │                              │  ✓ expiry    │
│          │                              │              │
│          │ ←─────────────────────────── │  action=     │
│          │  (routed to JwtVerification) │  JWT_BEARER  │
│          │                              │              │
│          │                              │  JwtVerif.   │
│          │                              │  Service     │
│          │                              │  ────────────│
│          │                              │  calls JOSE  │
│          │                              │  verify API  │
│          │                              │  (signature) │
│          │                              │              │
│          │                              │  token/mgmt  │
│          │                              │  creates new │
│          │                              │  token       │
│          │                              │              │
│          │ ←─────────────────────────── │              │
│          │  access_token                │              │
└──────────┘                              └──────────────┘
```

### Files Involved

| File | Role |
|------|------|
| `server/src/controllers/token.controller.ts:84-99` | Routes `JWT_BEARER` action to `JwtVerificationService` |
| `server/src/services/jwt-verification.service.ts` | Core JWT verification and token creation (104 lines) |
| `server/src/services/token.service.ts` | Forwards token requests to Authlete's `/auth/token` API |
| `server/src/services/token.operations.service.ts` | Token management API wrapper |
| `server/src/routes/openapi.routes.ts:115` | Documents `urn:ietf:params:oauth:grant-type:jwt-bearer` in OpenAPI spec |
| `server/tests/e2e/e2e.test.ts:1261-1277` | E2E test: JWT bearer grant happy path |
| `server/tests/unit/services/jwt-verification.service.test.ts` | Unit tests for JwtVerificationService (7 tests) |
| `server/tests/unit/controllers/token.controller.test.ts:136-177` | Unit tests for JWT_BEARER action routing |

### Action-to-HTTP Status Mapping (Complete)

**Token endpoint (`POST /api/token`) — JWT Bearer path:**

| Step | Action/Status | HTTP Status | Meaning |
|------|--------------|:-----------:|---------|
| 1 | Authlete returns `JWT_BEARER` | — | JWT passed basic validation; routed to handler |
| 2a | JOSE verify fails | 400 | Invalid signature or malformed JWT |
| 2b | JOSE verify succeeds | — | Signature valid; proceed to token creation |
| 3a | Token create: `OK` | 200 | Token issued successfully |
| 3b | Token create: `BAD_REQUEST` | 400 | Token creation failed (policy, etc.) |
| 3c | Token create: `FORBIDDEN` | 403 | Client not authorized |
| 3d | Token create: other | 500 | Server error |

### Test Coverage

- **Unit tests** (`jwt-verification.service.test.ts`): 7 tests covering missing assertion, missing clientId, verification failure, clientIdAlias fallback, success, BAD_REQUEST, FORBIDDEN, and unknown actions
- **Unit tests** (`token.controller.test.ts:136-177`): 2 tests covering successful JWT_BEARER flow and error passthrough
- **E2E tests** (`e2e.test.ts:1261-1277`): 1 test exchanging a JWT assertion for an access token (accepts 200, 400, or 429)
- **Integration tests**: Covered through the standard token endpoint integration tests (the `TOKEN_EXCHANGE` case tests the action routing)
