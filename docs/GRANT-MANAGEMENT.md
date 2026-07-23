# Grant Management for OAuth 2.0

A comprehensive guide to Grant Management: what it is, why it exists, how Authlete implements it, and how to test it with this server and client.

---

## Table of Contents

- [Part 1: Introduction & Motivation](#part-1-introduction--motivation)
- [Part 2: How Grant Management Works](#part-2-how-grant-management-works)
- [Part 3: Authlete Grant Management Configuration](#part-3-authlete-grant-management-configuration)
- [Part 4: Step-by-Step Grant Management Flows](#part-4-step-by-step-grant-management-flows)
- [Part 5: The Grant Management API](#part-5-the-grant-management-api)
- [Part 6: Client SPA Testing Tool Walkthrough](#part-6-client-spa-testing-tool-walkthrough)
- [Part 7: Complete End-to-End Test Scenarios](#part-7-complete-end-to-end-test-scenarios)
- [Part 8: Error Scenarios](#part-8-error-scenarios)
- [Part 9: Relationship to Resource Indicators (RFC 8707)](#part-9-relationship-to-resource-indicators-rfc-8707)
- [Part 10: Industry Use Cases](#part-10-industry-use-cases)
- [Part 11: Troubleshooting](#part-11-troubleshooting)

---

## Part 1: Introduction & Motivation

### What is Grant Management?

Grant Management, defined in [Grant Management for OAuth 2.0](https://openid.net/specs/oauth-v2-grant-management.html) (part of [FAPI 2.0](https://openid.net/specs/openid-financial-api-2_0.html)), gives clients explicit control over their authorizations. Instead of the implicit "grant = whatever tokens I have," clients can:

- **Query** the exact permissions (scopes, claims, authorization details) currently granted
- **Revoke** specific grants they no longer need
- **Merge** new permissions into an existing grant (e.g., add scopes without re-authorizing old ones)
- **Replace** all permissions in a grant (revoke old, authorize new)

### Why was Grant Management created?

In traditional OAuth 2.0, there is no explicit representation of a "grant." A client has tokens, and when they expire or are revoked, access is lost. This creates problems:

| Problem | How Grant Management Fixes It |
|---------|-------------------------------|
| **No visibility** — Clients cannot see what permissions they currently have | The query endpoint returns the full grant status: scopes, resources, claims, and authorization details |
| **No selective revocation** — Clients can only revoke individual tokens, not the underlying authorization | The revoke endpoint revokes the entire grant (all associated tokens) |
| **Scope creep** — When adding new scopes, the entire authorization must be re-done | `grant_management_action=merge` adds new scopes while preserving existing ones |
| **No concurrent grants** — A single client+user pair has at most one authorization | Each `grant_management_action=create` produces a new, independent grant with its own `grant_id` |
| **Regulatory requirements** — UK Open Banking, Australian CDR, and Brazil Open Banking require TPPs to manage consents explicitly | Grant Management provides a standardized API for consent management |

### Who uses Grant Management?

Grant Management is a mandatory part of **FAPI 2.0 Security Profile**, which is the basis for:

- **UK Open Banking** — TPPs use equivalent endpoints (`GET/DELETE /account-access-consents/{ConsentId}`)
- **Australian Consumer Data Right** — Data Recipients use `cdr_arrangement_id` with revoke endpoints
- **Open Banking Brasil** — Follows FAPI 2.0 with Grant Management
- **GAIN** (Global Assured Identity Network) — References Grant Management in its whitepaper

### When should you use Grant Management?

- **Always** in FAPI 2.0 compliant deployments
- **When** you need clients to know what permissions they currently have
- **When** you need clients to revoke authorizations they no longer need
- **When** you need to support concurrent grants for the same client+user pair
- **When** regulatory requirements mandate explicit consent management

---

## Part 2: How Grant Management Works

### Core Concepts

#### Grant

A **grant** is the set of permissions (authorization) granted by a Resource Owner to a Client. In Authlete, a grant is defined as a collection of "live" access token records tied to the same `grant_id`.

#### Grant ID

A **grant ID** is a unique, URL-safe identifier assigned to each grant. It is issued by the authorization server when a client includes `grant_management_action=create` in an authorization request. The grant ID is returned in the token response.

#### Grant Management Actions

| Action | Description | Requires `grant_id` |
|--------|-------------|---------------------|
| `create` | Creates a new grant. The AS assigns a new grant ID. | No (must NOT be present) |
| `merge` | Adds new permissions to an existing grant. Existing permissions are preserved. | Yes |
| `replace` | Replaces all permissions in an grant. Old permissions are revoked. | Yes |

### The Grant Lifecycle

```
1. CREATION
   Client sends authorization request with grant_management_action=create
   → User authenticates and consents
   → AS creates grant, issues tokens + grant_id
   
2. QUERY
   Client calls GET /gm/{grantId} with a query-scoped token
   → AS returns current grant status (scopes, claims, authorization_details)

3. MERGE (optional)
   Client sends another authorization request with grant_management_action=merge & grant_id=...
   → User consents to additional permissions
   → AS merges new permissions into existing grant
   → New access token inherits all permissions (old + new)

4. REPLACE (optional)
   Client sends authorization request with grant_management_action=replace & grant_id=...
   → Old permissions are revoked
   → New permissions replace them entirely

5. REVOCATION
   Client calls DELETE /gm/{grantId} with a revoke-scoped token
   → AS revokes all tokens associated with the grant
```

### Request Parameters

#### Authorization Request Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `grant_management_action` | `create` | Create a new grant |
| `grant_management_action` | `merge` | Merge new permissions into existing grant (requires `grant_id`) |
| `grant_management_action` | `replace` | Replace all permissions in grant (requires `grant_id`) |
| `grant_id` | `<grant-id>` | Reference an existing grant (required for `merge` and `replace`) |

#### Token Response Parameters

| Parameter | Description |
|-----------|-------------|
| `grant_id` | The grant ID associated with the issued tokens. Present when `grant_management_action` was used. |

#### Grant Management API Scopes

| Scope | Access |
|-------|--------|
| `grant_management_query` | Allows querying grant status (GET) |
| `grant_management_revoke` | Allows revoking grants (DELETE) |

---

## Part 3: Authlete Grant Management Configuration

### Authlete Service Settings

In the [Authlete web console](https://console.authlete.com/), configure:

| Setting | Location | Description |
|---------|----------|-------------|
| **Grant Management Endpoint** | Service → Grant Management | The URL of your grant management endpoint (e.g., `https://your-server.com/api/gm`) |
| **Grant Management Action Required** | Service → Grant Management | If `true`, every authorization request MUST include `grant_management_action`. If `false` (default), it's optional. |

### Server Metadata

When Grant Management is configured, Authlete includes these in the `.well-known/openid-configuration`:

```json
{
  "grant_management_actions_supported": ["create", "query", "merge", "replace", "revoke"],
  "grant_management_endpoint": "https://your-server.com/api/gm",
  "grant_management_action_required": false
}
```

> **Note:** If the grant management endpoint is not configured on the Authlete service, only `create`, `merge`, and `replace` actions are supported (no `query` or `revoke` since there's no endpoint to call).

### SDK Configuration

The server uses `@authlete/typescript-sdk` v1.1.6. The GM API is accessed via:

```typescript
authleteApi.grantManagement.processRequest({
  serviceId,
  gMRequest: {
    accessToken: "<bearer-token>",
    gmAction: "QUERY" | "REVOKE",
    grantId: "<grant-id>",
  },
});
```

---

## Part 4: Step-by-Step Grant Management Flows

### Flow 1: Create a Grant

This is the standard authorization flow with Grant Management enabled.

```
┌──────────┐                                    ┌──────────────┐                                    ┌──────────┐
│  Client   │                                    │  Auth Server  │                                    │   User   │
└────┬─────┘                                    └──────┬───────┘                                    └────┬─────┘
     │                                                 │                                                 │
     │  GET /api/authorization                          │                                                 │
     │  ?response_type=code                             │                                                 │
     │  &client_id=...                                  │                                                 │
     │  &scope=openid profile                           │                                                 │
     │  &redirect_uri=...                               │                                                 │
     │  &grant_management_action=create                 │                                                 │
     │────────────────────────────────────────────────>│                                                 │
     │                                                 │                                                 │
     │                                                 │  Redirect to /login                             │
     │<────────────────────────────────────────────────│                                                 │
     │                                                 │                                                 │
     │  POST /api/session/login                         │                                                 │
     │  (username: admin, password: password)           │                                                 │
     │────────────────────────────────────────────────>│                                                 │
     │                                                 │                                                 │
     │                                                 │  Redirect to /consent                           │
     │<────────────────────────────────────────────────│                                                 │
     │                                                 │                                                 │
     │  POST /api/authorization/issue                   │                                                 │
     │  (user consents)                                 │                                                 │
     │────────────────────────────────────────────────>│                                                 │
     │                                                 │                                                 │
     │                                                 │  302 redirect with ?code=...                    │
     │<────────────────────────────────────────────────│                                                 │
     │                                                 │                                                 │
     │  POST /api/token                                 │                                                 │
     │  grant_type=authorization_code                   │                                                 │
     │  &code=...                                       │                                                 │
     │  &code_verifier=...                              │                                                 │
     │────────────────────────────────────────────────>│                                                 │
     │                                                 │                                                 │
     │  {                                               │                                                 │
     │    "access_token": "...",                        │                                                 │
     │    "grant_id": "abc123",  ← NEW!                 │                                                 │
     │    ...                                           │                                                 │
     │  }                                               │                                                 │
     │<────────────────────────────────────────────────│                                                 │
```

**Key point:** The `grant_id` appears in the token response only when `grant_management_action` was present in the authorization request.

### Flow 2: Query a Grant

```
Client                        Auth Server
  │                               │
  │  GET /api/gm/abc123           │
  │  Authorization: Bearer <token-with-grant_management_query-scope>
  │──────────────────────────────>│
  │                               │
  │  200 OK                       │
  │  {                            │
  │    "scopes": [                │
  │      {                        │
  │        "scope": "openid profile",
  │        "resource": ["https://api.example.com"]
  │      }                        │
  │    ],                         │
  │    "claims": ["sub","name","email"],
  │    "authorization_details": [...],
  │    "created_at": 1700000000,
  │    "last_updated_at": 1700000000
  │  }                            │
  │<──────────────────────────────│
```

### Flow 3: Merge Permissions into an Existing Grant

```
Client                        Auth Server                        User
  │                               │                               │
  │  GET /api/authorization       │                               │
  │  ?response_type=code          │                               │
  │  &client_id=...               │                               │
  │  &scope=openid profile payments  ← added new scope            │
  │  &redirect_uri=...            │                               │
  │  &grant_management_action=merge                               │
  │  &grant_id=abc123             │                               │
  │──────────────────────────────>│                               │
  │                               │                               │
  │                               │  Redirect to /consent         │
  │<──────────────────────────────│                               │
  │                               │                               │
  │  POST /api/authorization/issue│                               │
  │  (user consents)              │                               │
  │──────────────────────────────>│                               │
  │                               │                               │
  │  POST /api/token              │                               │
  │  grant_type=authorization_code│                               │
  │──────────────────────────────>│                               │
  │                               │                               │
  │  {                            │                               │
  │    "access_token": "...",     │                               │
  │    "grant_id": "abc123",  ← same grant_id                     │
  │    ...                        │                               │
  │  }                            │                               │
  │<──────────────────────────────│                               │
```

**Key point:** The new access token inherits ALL permissions — both the original (`openid profile`) and the newly added (`payments`). The `grant_id` stays the same.

### Flow 4: Replace Grant Permissions

```
Client                        Auth Server
  │                               │
  │  GET /api/authorization       │
  │  ?response_type=code          │
  │  &scope=openid payments       │  ← completely new scope set
  │  &grant_management_action=replace
  │  &grant_id=abc123             │
  │──────────────────────────────>│
  │                               │
  │  ... (authorization flow) ... │
  │                               │
  │  POST /api/token              │
  │──────────────────────────────>│
  │                               │
  │  {                            │
  │    "access_token": "...",     │
  │    "grant_id": "abc123",      │
  │    ...                        │
  │  }                            │
  │<──────────────────────────────│
```

**Key point:** The old permissions (`profile`) are revoked. Only the new permissions (`openid payments`) remain. The `grant_id` stays the same.

### Flow 5: Revoke a Grant

```
Client                        Auth Server
  │                               │
  │  DELETE /api/gm/abc123        │
  │  Authorization: Bearer <token-with-grant_management_revoke-scope>
  │──────────────────────────────>│
  │                               │
  │  204 No Content               │
  │<──────────────────────────────│
```

**Key point:** All refresh tokens are revoked. All access tokens are revoked (subject to self-contained token limitations). The `grant_id` can no longer be used.

---

## Part 5: The Grant Management API

### Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/gm/:grantId` | Query the status of a grant |
| `DELETE` | `/api/gm/:grantId` | Revoke a grant |

### Authentication

Both endpoints require a Bearer access token in the `Authorization` header:

```
Authorization: Bearer <access-token>
```

The token must have been obtained with the appropriate scope:

- **Query:** Token must have `grant_management_query` scope
- **Revoke:** Token must have `grant_management_revoke` scope

### Query Response (200 OK)

```json
{
  "scopes": [
    {
      "scope": "openid profile",
      "resource": ["https://api.example.com"]
    }
  ],
  "claims": ["sub", "name", "email", "email_verified"],
  "authorization_details": [
    {
      "type": "payment_initiation",
      "actions": ["initiate"],
      "locations": ["https://api.example.com/payments"]
    }
  ],
  "created_at": 1700000000,
  "last_updated_at": 1700000000,
  "expires_at": 1700086400,
  "updated_by": "client"
}
```

| Field | Description |
|-------|-------------|
| `scopes` | Array of scope-resource clusters. Each cluster has `scope` (space-delimited) and optionally `resource` (array of URIs). |
| `claims` | Array of OpenID Connect claim names the user has consented to. |
| `authorization_details` | Array of RAR (Rich Authorization Requests) authorization details. |
| `created_at` | Unix timestamp when the grant was created. |
| `last_updated_at` | Unix timestamp of last modification. |
| `expires_at` | Unix timestamp when the grant expires. |
| `updated_by` | Who last modified the grant: `"client"` or `"authorization_server"`. |

### Revoke Response (204 No Content)

Empty body on success.

### Error Responses

| Status | Error | When |
|--------|-------|------|
| `401` | `invalid_token` | Missing, expired, or invalid Bearer token |
| `403` | `access_denied` | Token lacks required scope (`grant_management_query` or `grant_management_revoke`) |
| `404` | `not_found` | Grant ID does not exist |
| `400` | `caller_error` | Malformed request |
| `500` | — | Internal server error |

---

## Part 6: Client SPA Testing Tool Walkthrough

### Accessing the Grant Management Section

1. Start the client: `npm --prefix client run dev`
2. Navigate to `http://localhost:3001`
3. Click **"Grant Management"** in the sidebar (under the Admin group)

### UI Components

The testing UI provides:

- **Access Token** input — Paste a Bearer token with the appropriate GM scope
- **Grant ID** input — Paste the `grant_id` from a token response
- **Query** button — Calls `GET /api/gm/{grantId}`
- **Revoke** button (danger) — Calls `DELETE /api/gm/{grantId}`
- **Response** panel — Displays the JSON response

### How to Obtain the Required Tokens

#### Token with `grant_management_query` scope

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=grant_management_query"
```

#### Token with `grant_management_revoke` scope

```bash
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=grant_management_revoke"
```

### How to Obtain a Grant ID

The `grant_id` is returned in the token response when you include `grant_management_action=create` in the authorization request. For a confidential client using the authorization code flow:

```bash
# Step 1: Start authorization with grant_management_action=create
# (Use browser or SPA to follow the redirect)
curl "http://localhost:3000/api/authorization?\
response_type=code&\
client_id=your_client_id&\
redirect_uri=http://localhost:3001/callback&\
scope=openid profile&\
state=test&\
grant_management_action=create"

# Step 2: After login + consent, exchange the code for tokens
curl -X POST http://localhost:3000/api/token \
  -u "your_client_id:your_client_secret" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=THE_CODE&redirect_uri=http://localhost:3001/callback"

# Response includes:
# { "access_token": "...", "grant_id": "abc123", ... }
```

---

## Part 7: Complete End-to-End Test Scenarios

### Scenario 1: Create and Query a Grant

**Prerequisites:** Confidential client with `grant_management_query` scope configured in Authlete.

```bash
# 1. Create a grant via authorization code flow
# (Complete the full auth flow with grant_management_action=create)
# Result: You have an access_token, refresh_token, and grant_id

# 2. Get a query-scoped token
QUERY_TOKEN=$(curl -s -X POST http://localhost:3000/api/token \
  -u "CID:SEC" \
  -d "grant_type=client_credentials&scope=grant_management_query" \
  | jq -r '.access_token')

# 3. Query the grant
curl -s http://localhost:3000/api/gm/GRANT_ID \
  -H "Authorization: Bearer $QUERY_TOKEN" | jq .

# Expected: Full grant status JSON
```

### Scenario 2: Create, Merge, and Verify

```bash
# 1. Create initial grant with scope "openid profile"
# (Complete auth flow with grant_management_action=create, scope=openid profile)
# Result: grant_id = "g1", access_token with "openid profile"

# 2. Query to see current state
curl -s http://localhost:3000/api/gm/g1 \
  -H "Authorization: Bearer $QUERY_TOKEN" | jq .scopes
# Expected: [{ "scope": "openid profile" }]

# 3. Merge additional scope "payments" into the same grant
# (Complete auth flow with grant_management_action=merge, grant_id=g1, scope=openid profile payments)
# Result: New access_token, same grant_id "g1"

# 4. Query again to see merged state
curl -s http://localhost:3000/api/gm/g1 \
  -H "Authorization: Bearer $QUERY_TOKEN" | jq .scopes
# Expected: Both "openid profile" AND "openid profile payments" scope-resource clusters
```

### Scenario 3: Replace Grant Permissions

```bash
# 1. Start with a grant containing "openid profile payments"
# (From Scenario 2)

# 2. Replace with only "openid" scope
# (Complete auth flow with grant_management_action=replace, grant_id=g1, scope=openid)
# Result: New access_token with only "openid", same grant_id "g1"

# 3. Query to verify old scopes are gone
curl -s http://localhost:3000/api/gm/g1 \
  -H "Authorization: Bearer $QUERY_TOKEN" | jq .scopes
# Expected: Only "openid" scope-resource cluster
```

### Scenario 4: Revoke a Grant

```bash
# 1. Get a revoke-scoped token
REVOKE_TOKEN=$(curl -s -X POST http://localhost:3000/api/token \
  -u "CID:SEC" \
  -d "grant_type=client_credentials&scope=grant_management_revoke" \
  | jq -r '.access_token')

# 2. Revoke the grant
curl -s -X http://localhost:3000/api/gm/g1 \
  -H "Authorization: Bearer $REVOKE_TOKEN" -w "%{http_code}"
# Expected: 204

# 3. Try to query the revoked grant
curl -s http://localhost:3000/api/gm/g1 \
  -H "Authorization: Bearer $QUERY_TOKEN" | jq .
# Expected: 404 with { "error": "not_found" }
```

### Scenario 5: Concurrent Grants

```bash
# 1. Create grant A with scope "openid profile"
# (Complete auth flow with grant_management_action=create)

# 2. Create grant B with scope "openid payments" (same user, same client)
# (Complete ANOTHER auth flow with grant_management_action=create)
# Result: Two different grant_ids: "gA" and "gB"

# 3. Query both — they coexist independently
curl -s http://localhost:3000/api/gm/gA -H "Authorization: Bearer $QT" | jq .scopes
# Expected: [{ "scope": "openid profile" }]

curl -s http://localhost:3000/api/gm/gB -H "Authorization: Bearer $QT" | jq .scopes
# Expected: [{ "scope": "openid payments" }]
```

### Scenario 6: Introspection with Resource Indicators

```bash
# 1. Create a grant with resource indicators
# (Complete auth flow with:
#   grant_management_action=create,
#   scope=openid profile,
#   resource=https://api.example.com/)

# 2. Exchange code for token (resource is embedded in the access token)
# Result: access_token with audience restricted to https://api.example.com/

# 3. Introspect the token
curl -s -X POST http://localhost:3000/api/introspection \
  -u "CID:SEC" \
  -d "token=THE_ACCESS_TOKEN" | jq .
# Expected: Response includes "aud": ["https://api.example.com/"]

# 4. Query the grant — see scope-resource clusters
curl -s http://localhost:3000/api/gm/g1 \
  -H "Authorization: Bearer $QT" | jq .scopes
# Expected: [{ "scope": "openid profile", "resource": ["https://api.example.com/"] }]
```

### Scenario 7: Narrowing Resources with Refresh Token

```bash
# 1. Create grant with multiple resources
# (Complete auth flow with:
#   grant_management_action=create,
#   scope=read write,
#   resource=https://api.example.com/&
#   resource=https://other-api.example.com/)

# 2. Exchange code — token has both resources
# Result: access_token + refresh_token, grant_id = "g1"

# 3. Use refresh token with narrowed resource
curl -s -X POST http://localhost:3000/api/token \
  -u "CID:SEC" \
  -d "grant_type=refresh_token&refresh_token=THE_RT&resource=https://api.example.com/"

# Result: New access_token scoped to only https://api.example.com/
```

---

## Part 8: Error Scenarios

### Missing Bearer Token

```bash
curl http://localhost:3000/api/gm/some-grant
# Response: 401 { "error": "invalid_token" }
# Header: WWW-Authenticate: ...
```

### Wrong Scope Token

```bash
# Token with grant_management_revoke scope used for query
curl http://localhost:3000/api/gm/some-grant \
  -H "Authorization: Bearer $REVOKE_SCOPED_TOKEN"
# Response: 401 { "error": "invalid_token" }
```

### Non-Existent Grant

```bash
curl http://localhost:3000/api/gm/non-existent \
  -H "Authorization: Bearer $QUERY_TOKEN"
# Response: 404 { "error": "not_found" }
```

### Missing grant_id with merge/replace

```bash
# Authorization request with grant_management_action=merge but no grant_id
curl "http://localhost:3000/api/authorization?\
response_type=code&\
client_id=CID&\
scope=openid&\
grant_management_action=merge"
# Response: Authlete returns error — grant_id is required for merge
```

### Grant ID with create action

```bash
# Authorization request with grant_management_action=create AND grant_id
curl "http://localhost:3000/api/authorization?\
response_type=code&\
client_id=CID&\
scope=openid&\
grant_management_action=create&\
grant_id=some-id"
# Response: Authlete returns error — grant_id must NOT be present with create
```

### Public Client Attempt

```bash
# Public client (no client_secret) trying to use grant management
# Per spec: "Grant management is restricted to confidential only clients"
# Authlete enforces this automatically
```

---

## Part 9: Relationship to Resource Indicators (RFC 8707)

Resource Indicators (RFC 8707) and Grant Management are complementary specifications that work together:

| Aspect | Resource Indicators (RFC 8707) | Grant Management |
|--------|-------------------------------|------------------|
| **Purpose** | Specifies which resource server(s) a token is for | Manages the lifecycle of authorizations |
| **Parameter** | `resource` in authorization/token requests | `grant_management_action` + `grant_id` in authorization requests |
| **Effect on token** | Restricts token audience (`aud` claim) | Assigns a `grant_id` to track the authorization |
| **Effect on introspection** | Returns `aud` with resource URIs | Returns `scopes` as scope-resource clusters |
| **Server-side** | Authlete handles natively | Authlete handles natively |

### How they interact

When you use both together:

1. Authorization request includes `resource=https://api.example.com/` and `grant_management_action=create`
2. Authlete creates a grant AND binds the token to the specified resource
3. The token response includes `grant_id`
4. The access token's `aud` claim contains the resource URI
5. Querying the grant shows `scope-resource clusters` with the resource binding

This is the recommended approach for FAPI 2.0 deployments — use both Resource Indicators AND Grant Management together.

---

## Part 10: Industry Use Cases

### UK Open Banking (PSD2)

```
TPP (Client)                  ASPSP (Auth Server)
    │                               │
    │  POST /account-access-consents│
    │  { permissions: [...] }       │
    │──────────────────────────────>│
    │                               │
    │  201 Created                  │
    │  { ConsentId: "abc123" }      │  ← Equivalent to grant_id
    │<──────────────────────────────│
    │                               │
    │  GET /account-access-consents/abc123
    │──────────────────────────────>│
    │                               │
    │  200 OK                       │
    │  { status: "Authorised",      │
    │    permissions: [...] }       │  ← Equivalent to GM query
    │<──────────────────────────────│
    │                               │
    │  DELETE /account-access-consents/abc123
    │──────────────────────────────>│
    │                               │
    │  204 No Content               │  ← Equivalent to GM revoke
    │<──────────────────────────────│
```

### Australian Consumer Data Right

```
Data Recipient              Data Holder
    │                           │
    │  POST /arrangements       │
    │  (create consent)         │
    │──────────────────────────>│
    │                           │
    │  { arrangement_id: "x" }  │  ← Equivalent to grant_id
    │<──────────────────────────│
    │                           │
    │  POST /arrangements/revoke │
    │  { arrangement_id: "x" }  │  ← Equivalent to GM revoke
    │──────────────────────────>│
    │                           │
    │  204 No Content           │
    │<──────────────────────────│
```

### FAPI 2.0 Compliance Checklist

- [ ] Grant Management endpoint configured in Authlete console
- [ ] `grant_management_actions_supported` includes `create`, `query`, `merge`, `replace`, `revoke`
- [ ] `grant_management_endpoint` is set in service metadata
- [ ] Server implements `GET /api/gm/:grantId` and `DELETE /api/gm/:grantId`
- [ ] Both endpoints require Bearer token authentication
- [ ] Scope validation (`grant_management_query`, `grant_management_revoke`) delegated to Authlete
- [ ] `grant_management_action` parameter accepted in authorization requests (passed through to Authlete)
- [ ] `grant_id` returned in token responses (delegated to Authlete)
- [ ] Confidential clients only enforced (delegated to Authlete)

---

## Part 11: Troubleshooting

### "Grant not found" when querying

- Verify the `grant_id` is correct (copy from token response)
- Check that the grant was created with `grant_management_action=create`
- Grants with expired tokens may no longer be "live" in Authlete's view

### 401 "invalid_token" when querying/revoking

- Ensure the token has the correct scope:
  - Query requires `grant_management_query`
  - Revoke requires `grant_management_revoke`
- Check token expiry
- Ensure `Authorization: Bearer <token>` header format

### No `grant_id` in token response

- Verify `grant_management_action=create` was included in the authorization request
- Check that the Authlete service has Grant Management enabled
- The `grant_id` is only in the token response, not the authorization response

### Authlete returns error for `grant_management_action`

- Ensure the Authlete service has `grantManagementEndpoint` configured
- Check that `feature.gm.enabled` is `true` in Authlete server properties
- Verify the client is confidential (public clients are rejected per spec)

### Merge doesn't seem to work

- `merge` requires an existing `grant_id` from a previous `create`
- The user authenticating for the merge must be the SAME user who created the original grant
- Authlete silently skips GM operations if the user is different (no error, but no merge either)

### Refresh token rotation conflict

- If "single access token per subject" is enabled in Authlete, using a refresh token invalidates the previous access token
- When narrowing resources via refresh token, each use produces a new access token and the old one is revoked
