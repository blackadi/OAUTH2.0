# MCP OAuth 2.1 — Testing & Configuration Guide

**The short version:** MCP (Model Context Protocol) uses OAuth 2.1 for authorization, and this guide walks the
discovery, registration, authorization and token steps end to end. **The code for all of it is here** — CIMD
client discovery, resource indicators for scoped access, PKCE for public clients. What is *not* here is a
service configured to let those steps succeed. Read the box below before you run anything, or you will debug
your own request when the answer is a service flag.

> ### ⚠️ MCP does not work end to end on the reference deployment — three preconditions fail
>
> This guide used to open by saying the server *"supports MCP flows out of the box"*. That was wrong, and it is
> the kind of wrong that costs an afternoon: the wiring is complete, so the failures look like your bugs.
> Verified against the live service on **2026-08-10**, against the discovery document on **2026-08-11**, and
> re-checked on **2026-08-14** — when the document had grown to **64 members**. Labels below are
> **captured** / *illustrative* / **`UNVERIFIED`**, defined once in
> [the tutorial index](README.md#how-to-read-the-transcripts-in-these-tutorials).
>
> | Precondition | What MCP requires | This deployment | Fix |
> |---|---|---|---|
> | **OAuth 2.1** | *"Authorization servers **MUST** implement OAuth 2.1"* (MCP Authorization, Overview) | ⚠️ **still unmet.** `implicit` **and** `password` are in `grant_types_supported`, and OAuth 2.1 removes both. PKCE is required **per client, not service-wide**: `pkceRequired`/`pkceS256Required` are `true` on two clients since 2026-08-13, while the service flag stays `false` — verified live, `/api/fapi/config` answers `pkceRequired: false`. Two other clients deliberately still permit the plain flow, because Modules 02 and 03 teach what it costs | a differently-configured service, or scope the claim |
> | **A self-consistent issuer** | RFC 8414 §3 — the metadata must be served from the `issuer` host, because that correspondence *is* the trust anchor discovery rests on | ✅ **fixed 2026-08-14 (DR-11).** `issuer` and all 14 URL fields are now `https://oauth2-0-ekh2.onrender.com`, so §3.3 passes — the issuer is exactly the host and every URL member sits under it. Until then `issuer` was `https://blackadi.dev` while the metadata lived on an ephemeral tunnel host, so a client following §3 could not resolve this AS at all | — |
> | **CIMD** | an HTTPS URL as `client_id`, with metadata auto-fetched | ✅ **enabled 2026-08-14 (DR-05).** `clientIdMetadataDocumentSupported = true`, verified live — `/api/fapi/config` answers `cimdSupported: true`. Authlete handles CIMD entirely server-side, so no endpoint or client code was needed | — |
>
> Two more, both about members that are **absent** from the 64-member document (re-checked 2026-08-14):
>
> - **`registration_endpoint`** — so there is nothing for a client to discover and Dynamic Client Registration
>   cannot be found the way RFC 7591 clients find it. This repo's DCR routes are at `/api/client/dcr/*` behind
>   admin Basic auth — use those directly (see [DCR](API.md)).
> - **`resource_indicators_supported`** — and this one cannot be fixed from the console. Of the `Service`
>   schema's properties in Authlete 3.0.16, **none** carries the word `resource` except
>   `resourceSignatureKeyId`, and the string `resource_indicators_supported` appears nowhere in Authlete's own
>   OpenAPI document. So the row for it in [Required Authlete Configuration](#required-authlete-configuration)
>   names **a setting that does not exist** — corrected below. **✅ Settled 2026-08-17, and the answer is
>   stronger than the question:** RFC 8707 (*Resource Indicators for OAuth 2.0*, **Standards Track, February
>   2020**) §5 registers exactly two things — the **`resource` request parameter** and the **`invalid_target`
>   error code**. It registers **no authorization-server metadata parameter at all.** So
>   `resource_indicators_supported` is not a member Authlete declines to emit; **it is not a member.** Its
>   absence from the discovery document is correct, and the original configuration row was wrong twice over:
>   no console field *and* no such metadata member. The `resource` **request** parameter is a separate
>   question and is forwarded normally.
>
> That is the **fourth** time in this audit that an instruction said "set X in the console" for an X with no
> console field. The habit worth copying: check the field exists before writing the step.
>
> **The retired grants are enabled deliberately.** The curriculum uses `implicit` and `password` as the
> *"here is what OAuth 2.1 removed, and why"* exhibit — see
> [Module 07](curriculum/modules/07-oauth-2-1-and-security-bcp/README.md). That is a good reason to keep them
> and an equally good reason not to claim MCP support on the same service: MCP's first MUST is precisely that
> the server does not behave that way. **The two goals conflict on one service**, and choosing between them is
> an open decision (`audit/05-decision-records.md` DR-05, DR-11).
>
> Everything below is still worth reading and running: the protocol description is accurate, the request shapes
> are right, and each step tells you what a conformant AS would answer. Where this deployment answers something
> else, that is noted at the step.

## What is MCP?

MCP (Model Context Protocol) is a standard for AI assistants to connect to external tools and data sources. Think of it like **USB for AI** — a universal plug that lets any AI model talk to any tool provider.

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  AI Client   │────▶│  Auth Server     │────▶│  MCP Server      │
│  (Claude,    │     │  (this server)   │     │  (tool provider) │
│   ChatGPT)   │     │                  │     │                  │
└──────────────┘     └──────────────────┘     └──────────────────┘
     │                      │                         │
     │  1. Register         │                         │
     │  2. Authorize         │                         │
     │  3. Get Token         │                         │
     │  4. Call Tools ◄────────────────────────────────┘
     │                      │
```

### Why MCP Needs OAuth 2.1

MCP servers expose tools (functions) that AI clients want to call. But you don't want any random AI assistant calling your tools — you need:

1. **Authentication** — Who is this AI client?
2. **Authorization** — What tools can it access?
3. **Scoped access** — The token should only work for specific resources
4. **Proof of possession** — Prevent token theft (PKCE)

MCP uses OAuth 2.1 with these requirements:

| Requirement | OAuth 2.1 Spec | Why |
|-------------|---------------|-----|
| PKCE (S256) | RFC 7636 | Prevents authorization code interception |
| Resource Indicators | RFC 8707 | Tokens scoped to specific MCP servers |
| Public Client Support | RFC 6749 | AI clients can't keep secrets |
| Authorization Server Metadata | RFC 8414 | Auto-discovery of AS endpoints |

## How MCP Auth Works (The Airport Analogy)

Imagine an airport security system:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Authorization Flow                    │
│                                                             │
│  1. 🛫 AI Client arrives at the airport                     │
│     "I need to access tools at tools.example.com"           │
│                                                             │
│  2. 🏢 Goes to Information Desk (Discovery)                 │
│     "Where do I get a boarding pass?"                       │
│     → AS metadata tells you: "Go to Gate 42"               │
│                                                             │
│  3. 📋 Shows CIMD URL (like a digital business card)        │
│     "Here's who I am and what I need"                       │
│     → Server auto-verifies the client                       │
│                                                             │
│  4. 🛂 Gets boarding pass (Authorization Code)              │
│     "You're cleared to access tools.example.com"            │
│                                                             │
│  5. 💳 Swaps boarding pass for lounge access (Token)         │
│     "Your pass works at these gates: /tools, /data"         │
│                                                             │
│  6. ✈️ Uses tools at the resource server                    │
│     "I'll have the calculator and database, please"         │
└─────────────────────────────────────────────────────────────┘
```

## Server Setup

### Prerequisites

Your Authlete service must have **CIMD enabled** for MCP flows. **On this deployment it already is** — DR-05
set `clientIdMetadataDocumentSupported: true` on 2026-08-14, and `GET /api/fapi/config` reports it as
`cimdSupported: true`, so you can check rather than assume. On a service of your own, in the Authlete Console:

1. Go to your Service → Security
2. Enable **Client ID Metadata Document (CIMD)** — set `clientIdMetadataDocumentSupported: true`
3. Ensure `supportedGrantTypes` includes `AUTHORIZATION_CODE`
4. Ensure `supportedResponseTypes` includes `CODE`

### Required Authlete Configuration

| Setting | Value | Where | Live here (2026-08-14) |
|---------|-------|-------|---|
| `clientIdMetadataDocumentSupported` | `true` | Service → Security | ✅ `true` |
| `pkceRequired` | `true` | Service → Security (recommended) | ⚠️ `false` at the service; `true` on clients `4277838306` and `2176571218` |
| `supportedGrantTypes` | `AUTHORIZATION_CODE` | Service → Supported Grant Types | ✅ present — alongside `implicit` and `password`, which OAuth 2.1 removes |
| `supportedResponseTypes` | `CODE` | Service → Supported Response Types | ✅ present |
| ~~`resourceIndicatorsSupported`~~ | — | — | ❌ **no such Authlete field.** Struck rather than deleted so nobody re-adds it; see the box at the top |

**Scopes are the row that is missing from every table like this one.** `scopes_supported` here is
`address`, `email`, `openid`, `offline_access`, `phone`, `profile`, `grant_management_query`,
`grant_management_revoke` — so the `mcp:tools` and `mcp:resources` scopes used throughout this guide are
**not registered**, and `scopeRequired` is `false`. An unregistered scope is not an error: OAuth drops
unknown scopes, so the request succeeds and the granted scope silently omits them. Register them before
expecting a token to carry them.

### Server Endpoints Used by MCP

| Endpoint | Purpose | MCP Spec Ref |
|----------|---------|--------------|
| `/.well-known/oauth-authorization-server` | AS metadata discovery | RFC 8414 |
| `/.well-known/openid-configuration` | Fallback AS metadata | OIDC Discovery |
| `/api/authorization` | Authorization endpoint | RFC 6749 §3.1 |
| `/api/token` | Token exchange | RFC 6749 §3.2 |
| `/api/introspection/standard` | Token validation | RFC 7662 — **admin Basic auth required** (§2.1) |
| `/api/userinfo` | Token introspection | OIDC Core §5.3 |

## MCP Authorization Flow

### Step 1: Discovery

The AI client first discovers the authorization server. MCP clients support two discovery mechanisms:

```
┌─────────────────────────────────────────────────────────────┐
│                  AS Metadata Discovery                      │
│                                                             │
│  Client tries:  /.well-known/oauth-authorization-server     │
│       ↓ (if not found)                                      │
│  Fallback:      /.well-known/openid-configuration           │
│                                                             │
│  Returns:                                                   │
│  {                                                          │
│    "issuer": "https://auth.example.com",                    │
│    "authorization_endpoint": "https://auth.example.com/...", │
│    "token_endpoint": "https://auth.example.com/...",        │
│    "registration_endpoint": "https://auth.example.com/...", │
│    "resource_indicators_supported": true,                   │
│    "code_challenge_methods_supported": ["S256"],            │
│    ...                                                      │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

> **This is what a *conformant* AS returns, not exactly what this one does — re-checked live 2026-08-17, and
> two of this note's own claims had gone stale.** The document has **66** members, not 64, and
> `registration_endpoint` **is** present (`/api/client/dcr/register`) — it was absent when this note was
> written and is not now. What still holds:
>
> | Member | This deployment |
> |---|---|
> | `registration_endpoint` | ✅ **present** — though it requires admin Basic auth rather than RFC 7591 §3's initial access token, so an MCP client still cannot self-register |
> | `resource_indicators_supported` | **absent, and correctly so** — no specification defines it; see the box at the top |
> | `code_challenge_methods_supported` | `["plain", "S256"]`, not `["S256"]` — the service still permits `plain`, deliberately, because two teaching clients need it |
>
> **A stale count is why this block asked to be re-fetched, and it was right to.** Fetch the real thing
> rather than trusting any of the above:
>
> ```bash
> curl -s https://oauth2-0-ekh2.onrender.com/.well-known/oauth-authorization-server | python3 -m json.tool
> ```

### Step 2: Client Registration (CIMD)

MCP uses **Client ID Metadata Document (CIMD)** for dynamic client registration. Instead of sending a full registration request, the client provides an HTTPS URL that describes itself:

```json
{
  "client_name": "My AI Assistant",
  "redirect_uris": ["http://localhost:3001/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "mcp:tools mcp:resources openid"
}
```

The server fetches this URL, validates the metadata, and registers the client automatically. This is simpler than DCR — no need to send client secrets.

```
┌─────────────────────────────────────────────────────────────┐
│                    CIMD Registration                        │
│                                                             │
│  Client: "My metadata is at https://myapp.com/client.json"  │
│     ↓                                                       │
│  Server: *fetches the URL*                                  │
│     ↓                                                       │
│  Server: "I've registered you as client_id: abc123"         │
│     ↓                                                       │
│  Client: "Great, now I'll authorize at /authorize"          │
└─────────────────────────────────────────────────────────────┘
```

### Step 3: Authorization

The client builds an authorization URL with PKCE and resource indicators:

```
https://auth.example.com/api/authorization
  ?response_type=code
  &client_id=abc123
  &redirect_uri=http://localhost:3001/callback
  &scope=mcp:tools mcp:resources openid
  &state=xyz789
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
  &resource=https://mcp-server.example.com
```

Key parameters:
- `code_challenge` + `code_challenge_method=S256` — PKCE proof
- `resource` — RFC 8707 resource indicator (tokens scoped to this MCP server)
- `scope` — Requested permissions

### Step 4: Token Exchange

After the user approves, the client exchanges the authorization code for tokens:

```
POST /api/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=http://localhost:3001/callback
&client_id=abc123
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

Response — *illustrative*:
```json
{
  "access_token": "eyJhbGciOiJSUz...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "mcp:tools mcp:resources",
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA"
}
```

> Two values to distrust here. `expires_in` is this service's `accessTokenDuration` — **86400**, a 24-hour
> token, which is not what an MCP client should be handed and is deliberate only because the curriculum needs
> it. And `scope` echoes `mcp:tools mcp:resources`, which **would not appear**: neither is a registered scope
> on this service, so both are dropped silently. `access_token` is shown as a JWT for illustration;
> `accessTokenSignAlg` is unset here, so real access tokens are opaque.

### Step 5: Call MCP Server

The client uses the access token to call the MCP server:

```
GET https://mcp-server.example.com/tools
Authorization: Bearer eyJhbGciOiJSUz...
```

The MCP server validates the token via introspection or JWT verification, then returns the available tools.

## What Just Happened?

```
┌─────────────────────────────────────────────────────────────┐
│                  Complete MCP Flow Summary                   │
│                                                             │
│  1. Discovery    → Client finds the auth server             │
│  2. CIMD         → Client registers via HTTPS URL           │
│  3. Authorize    → User approves access with PKCE           │
│  4. Token        → Client gets scoped access token          │
│  5. Resources    → Client calls MCP server tools            │
│                                                             │
│  Security layers:                                           │
│  ✓ PKCE prevents code interception                         │
│  ✓ Resource indicators scope tokens                         │
│  ✓ CIMD enables passwordless registration                   │
│  ✓ Tokens are short-lived + refreshable                     │
└─────────────────────────────────────────────────────────────┘
```

## Common Mistakes

### ❌ Don't: Use client_secret with CIMD

```bash
# WRONG — CIMD clients are public (no secret)
curl -X POST /api/token \
  -d "grant_type=authorization_code&code=...&client_secret=abc123"

# CORRECT — CIMD clients use PKCE only
curl -X POST /api/token \
  -d "grant_type=authorization_code&code=...&code_verifier=..."
```

### ❌ Don't: Forget the resource parameter

```bash
# WRONG — Token has no resource scope
GET /authorize?scope=mcp:tools&...

# CORRECT — Token scoped to specific MCP server
GET /authorize?scope=mcp:tools&resource=https://mcp-server.example.com&...
```

### ❌ Don't: Use HTTP for CIMD URLs

```
# WRONG — CIMD URLs must be HTTPS
http://myapp.com/client.json

# CORRECT — HTTPS required for security
https://myapp.com/client.json
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| `invalid_client` | Client ID not registered | Use CIMD to register first, or check DCR |
| `invalid_grant` | Code expired or already used | Get a fresh authorization code |
| `unauthorized_client` | Client not allowed this grant type | Check Authlete service `supportedGrantTypes` |
| `invalid_scope` | Scope not configured | Add scope to Authlete service `supportedScopes` |
| `access_denied` | User denied consent | Re-authorize with `prompt=consent` |
| Resource indicator error | `resource` parameter invalid | Ensure `resource` is a valid HTTPS URI |

## Related Specs

| Spec | Title | Purpose |
|------|-------|---------|
| RFC 6749 | OAuth 2.0 | Base authorization framework |
| RFC 7636 | PKCE | Proof Key for Code Exchange |
| RFC 8414 | AS Metadata | Authorization Server Discovery |
| RFC 8707 | Resource Indicators | Scoped token issuance |
| MCP Auth Spec | MCP OAuth 2.1 | AI tool authorization |
| CIMD | Client ID Metadata Document | Passwordless client registration |
