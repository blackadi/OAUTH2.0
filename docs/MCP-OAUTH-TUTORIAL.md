# MCP OAuth 2.1 — Testing & Configuration Guide

> **The short version:** MCP (Model Context Protocol) uses OAuth 2.1 to let AI assistants reach external
> tools and data. This guide walks discovery, registration, authorization and the token exchange end to
> end.

> ### ⚠️ MCP does not work end to end on the reference deployment
>
> The code is all here — CIMD discovery, resource indicators, PKCE. What is missing is a *service*
> configured to let the steps succeed, and because the wiring is complete the failures look like your
> bugs. Read this before you debug your own request. Labels are **captured** / *illustrative* /
> **`UNVERIFIED`**, defined once in
> [the tutorial index](README.md#how-to-read-the-transcripts-in-these-tutorials).
>
> | Precondition | Status here (verified 2026-08-14; re-checked live 2026-09-11 — still holds) |
> |---|---|
> | **OAuth 2.1** — MCP says the AS *"MUST implement OAuth 2.1"* | ⚠️ **unmet.** `implicit` and `password` are still in `grant_types_supported`, and OAuth 2.1 removes both. PKCE is per-client here, not service-wide |
> | **A self-consistent issuer** — RFC 8414 §3 requires the metadata to be served from the `issuer` host | ✅ met |
> | **CIMD** — an HTTPS URL as `client_id` | ✅ met (`clientIdMetadataDocumentSupported`) |
> | **RFC 9728 discovery via `WWW-Authenticate`** — the usual MCP bootstrap is: call the resource unauthenticated, read `resource_metadata` off the 401's `WWW-Authenticate` header, fetch that URL | ⚠️ **unmet, verified live 2026-09-11.** `GET /api/userinfo` with no token answers `WWW-Authenticate: Bearer, DPoP` — no `resource_metadata` parameter. The document itself is served correctly (see [Step 1b](#step-1b-protected-resource-metadata-rfc-9728) below); a client just cannot *find* it from a 401 alone here. It has to already know the well-known path. |
>
> Two discovery members are **absent**, and they are different problems:
>
> - **`registration_endpoint`** — so RFC 7591 clients cannot find DCR. This repo's routes are at
>   `/api/client/dcr/*` behind admin Basic auth; call them directly ([DCR](API.md)).
> - **`resource_indicators_supported`** — **not a member of anything.** RFC 8707 §5 registers exactly two
>   things: the `resource` request *parameter* and the `invalid_target` error code. It registers no
>   authorization-server metadata parameter, and there is no Authlete field for one. So its absence is
>   correct, not a gap — see the struck row in
>   [Required Authlete Configuration](#required-authlete-configuration). The `resource` request parameter
>   is a separate question and is forwarded normally.
>
> **The retired grants are deliberate.** The curriculum uses `implicit` and `password` as the *"here is
> what OAuth 2.1 removed, and why"* exhibit
> ([Module 07](curriculum/modules/07-oauth-2-1-and-security-bcp/README.md)) — a good reason to keep them,
> and an equally good reason not to claim MCP support on the same service, since MCP's first MUST is that
> the server does not behave that way. The two goals conflict on one service; choosing between them is an
> open decision (`audit/05-decision-records.md` DR-05, DR-11).
>
> **Everything below still transfers.** The protocol description, the request shapes and the expected
> answers are all accurate; where this deployment answers something else, the step says so.

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
| `/.well-known/oauth-protected-resource` | Protected Resource Metadata — which AS(es) protect this resource | RFC 9728 |
| `/api/authorization` | Authorization endpoint | RFC 6749 §3.1 |
| `/api/token` | Token exchange | RFC 6749 §3.2 |
| `/api/introspection/standard` | Token validation | RFC 7662 — **admin Basic auth required** (§2.1) |
| `/api/userinfo` | Token introspection | OIDC Core §5.3 |

**This deployment genuinely serves that fourth row** — real, live JSON, not the SPA's catch-all. See
[Step 1b](#step-1b-protected-resource-metadata-rfc-9728) for the exact URI and how to test it.

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
> two of this note's own claims had gone stale.** The document had **66** members, not 64, and
> `registration_endpoint` **is** present (`/api/client/dcr/register`) — it was absent when this note was
> written and is not now. **Re-measured again live 2026-09-11: 67 members now** — that is the count
> drifting a *third* time, which is exactly why the rule below is "fetch it," not "trust this paragraph."
> What still holds:
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

### Step 1b: Protected Resource Metadata (RFC 9728)

**Why this RFC exists, in plain English.** Picture an AI client that wants to call some API it has never
talked to before — it knows the API's URL, and nothing else. Which authorization server does it get a
token from? What scopes does that API even accept? Classic OAuth just assumes the client's developer
already knows this and hard-coded it. That assumption falls apart the moment clients are meant to show up
at APIs nobody configured them for in advance — which is exactly MCP's situation: one AI client, many
MCP tool servers, none pre-arranged. RFC 9728 closes that gap: **the API itself publishes a small,
public, no-login-required JSON document** at a fixed, guessable location, saying "here is my identity, and
here is the authorization server (or servers) that can hand out valid tokens for me." A client reads that
one small file before it does anything else, and now it knows where to go.

**Who publishes it:** the *resource server* (the API), not the AS. In this repo the same deployment plays
both roles (it is the AS, and it stands in for a resource server via `/api/userinfo`), so the document is
served from the same host.

**How Authlete handles this — and the contrast with CIMD that's worth knowing before you go looking for an
Authlete setting for it: there isn't one.** Unlike CIMD (next section), Authlete has **no built-in feature
for RFC 9728 at all** — confirmed by checking the SDK itself (`@authlete/typescript-sdk`) for any
protected-resource-metadata API; the only "protected resource" references anywhere in it are about DPoP
proof validation (RFC 9449 §7.2), an unrelated concern. **This entire endpoint is this repository's own
code** — `server/src/controllers/protected-resource-metadata.controller.ts` — which just asks Authlete for
its regular service configuration (the same discovery data behind `/.well-known/openid-configuration`) and
copies three values out of it (`issuer`, `scopes_supported`, `dpop_signing_alg_values_supported`) into the
shape RFC 9728 requires. If you ever needed this on your own Authlete service, you would write this same
small amount of code yourself — there is no service flag to flip.

**The correct URI to fetch — this is the answer to "what URI do I use":**

```
{origin}/.well-known/oauth-protected-resource
```

Just the origin (scheme + host, no path) — e.g. `http://localhost:3000` locally, or
`https://oauth2-0-ekh2.onrender.com` against the reference deployment. That is also exactly what the
"Protected Resource" tab in this app's MCP section expects in its **Resource URL** field.

**How to test it — this is the easiest thing in this whole guide to test, and needs no setup:**

### Option A — just your browser (zero experience needed)

This document requires no login, no token, no client — it's meant to be public. So:

1. Make sure a server is running: either `npm --prefix server run dev` in this repo (serves on
   `http://localhost:3000`), or use the reference deployment, which needs no setup at all.
2. Open your browser and go to:
   - Local: `http://localhost:3000/.well-known/oauth-protected-resource`
   - Reference deployment: `https://oauth2-0-ekh2.onrender.com/.well-known/oauth-protected-resource`
3. **That's it.** You'll see a page of plain JSON text. That page *is* the test passing — the document
   loaded, which is all RFC 9728 asks of it. Look for two fields to confirm it's doing its job:
   - `"resource"` — the identity of the API this document describes.
   - `"authorization_servers"` — the AS (or AS's) trusted to issue tokens for that API.

   There is no failure mode to chase here beyond "the page doesn't load" (wrong host/port) or "you get an
   HTML page instead of JSON" (wrong URL — see the Troubleshooting table's PRM row further down).

### Option B — this app's own UI, or `curl`, if you want the request/response mechanics

- **In the running app**: MCP section → **Protected Resource** tab → enter the origin (already
  pre-filled with `http://localhost:3000`) → **Fetch Resource Metadata**. Same plain `GET`, rendered in
  the app instead of a raw browser tab.
- **From a terminal**:

  ```bash
  curl -s http://localhost:3000/.well-known/oauth-protected-resource | python3 -m json.tool
  ```

  Verified live 2026-09-11 against this repo's own dev server:

  ```json
  {
    "resource": "https://oauth2-0-ekh2.onrender.com/api/userinfo",
    "authorization_servers": ["https://oauth2-0-ekh2.onrender.com"],
    "bearer_methods_supported": ["header", "body"],
    "scopes_supported": ["address", "email", "openid", "offline_access", "phone", "profile", "device_sso", "grant_management_query", "grant_management_revoke"],
    "dpop_signing_alg_values_supported": ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "ES256K", "EdDSA"]
  }
  ```

**One RFC 9728 wrinkle worth knowing before you go looking for it elsewhere:** §3 technically builds the
well-known URL by inserting `/.well-known/oauth-protected-resource` **between the host and the path** of
`resource` — and `resource` here is the UserInfo endpoint, which has a path. So the fully spec-correct URL
is actually `{origin}/.well-known/oauth-protected-resource/api/userinfo`, not the path-less form above.
**Both forms work on this deployment** — it serves the identical document at either — so for testing
purposes the short, path-less URI above is all you need. The full technical breakdown (why two routes
exist, and what breaks if you change `PROTECTED_RESOURCE_IDENTIFIER`) is in
[`docs/agents/server-endpoints.md`](agents/server-endpoints.md).

**What it is *not*, and why the warning box above calls this "partially met":** a real MCP client
typically never types the well-known path in by hand. It calls the resource, gets a `401`, and reads a
`resource_metadata="..."` parameter off the `WWW-Authenticate` header to find this document (RFC 9728
§5.1). **This deployment does not send that parameter** — verified live 2026-09-11,
`curl -i http://localhost:3000/api/userinfo` with no token returns `WWW-Authenticate: Bearer, DPoP` and
nothing more. The document is real and correct; the breadcrumb that is supposed to lead a client to it is
missing. Use the direct URI above instead of relying on 401-driven discovery against this deployment.

### Step 2: Client Registration (CIMD)

**Why this RFC exists, in plain English.** Every AS needs to know who's asking before it hands out a
token. The traditional way is a phone book: a developer fills out a form ahead of time, the AS writes down
a `client_id` (and usually a secret), and checks new requests against that book. That falls apart for
something like MCP, where **any** AI client might connect to **any** MCP server that nobody pre-arranged —
there's no admin to fill out the form in advance, and plenty of these clients (a CLI tool, a browser
extension) have no safe place to keep a secret even if one were issued. CIMD's fix: skip the phone book.
The client's identity **is** an HTTPS URL it controls, and it publishes the same information a
registration form would have asked for, at that URL, for the AS to read live.

MCP uses **Client ID Metadata Document (CIMD)** for exactly this. Instead of sending a full
registration request, the client uses an HTTPS URL *as its `client_id`*, and publishes the metadata that
describes it at that same URL:

```json
{
  "client_id": "https://myapp.com/client.json",
  "client_name": "My AI Assistant",
  "redirect_uris": ["http://localhost:3001/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "mcp:tools mcp:resources openid"
}
```

**How Authlete handles this — the opposite of Step 1b's PRM.** Authlete — not this server — fetches that
URL the first time it sees the client ID, validates the metadata, and registers the client automatically.
This is a genuine Authlete feature (`clientIdMetadataDocumentSupported`), triggered purely by the shape of
the `client_id` value: start it with `https://` and Authlete takes over from there. Compare that to Step
1b's Protected Resource Metadata, which Authlete has **no** feature for at all and this repo builds by
hand — CIMD is the mirror image, entirely the vendor's job. **The URL itself is the `client_id`,
permanently, for every request the client makes from here on — no new identifier is minted.** This is
simpler than DCR: no registration round trip, no client secret to send or store (a CIMD client is
necessarily public). See [`CIMD.md`](CIMD.md) for the full mechanism, its configuration flags, and this
deployment's live settings.

```
┌─────────────────────────────────────────────────────────────┐
│                    CIMD Registration                        │
│                                                             │
│  Client: "My client_id is https://myapp.com/client.json"    │
│     ↓                                                       │
│  Authlete: *fetches that URL, the first time it is seen*    │
│     ↓                                                       │
│  Authlete: "Registered — and your client_id stays exactly   │
│             https://myapp.com/client.json"                  │
│     ↓                                                       │
│  Client: "Great, now I'll authorize at /authorize using     │
│           that same URL as client_id"                       │
└─────────────────────────────────────────────────────────────┘
```

**How to test this — and the one thing worth understanding before you do:** the **CIMD Metadata** tab in
this app's MCP section only does a plain client-side `GET` on whatever URL you paste into it and shows you
the JSON — it never talks to Authlete. That is a *preview*, useful for checking your document is
well-formed before you rely on it, but it does not exercise CIMD at all.

**Don't have a URL to test with yet?** [`CIMD.md`](CIMD.md#how-to-test-it) has a complete, no-coding
walkthrough for hosting a free test document on GitHub Gist in under five minutes — start there if this is
your first time, then come back here for what happens next.

**The real test is the authorization request** — that is the one moment Authlete actually fetches and
validates the URL (see [`CIMD.md`](CIMD.md) → *"metadata retrieval happens only on the initiating request
of an authorization flow"*). Two ways to trigger it:

1. **In this app**: MCP section → Full Flow Wizard → Step 2 → paste your HTTPS URL into **CIMD URL** →
   **CIMD (URL as client_id)** (this only previews it) → **Authorize** in Step 3, which is what actually
   sends the URL to Authlete as `client_id`. What you'll see: a redirect to the login page on success, or
   an error toast quoting Authlete's rejection on failure.
2. **From a terminal**, directly against `/api/authorization` — reproduced live 2026-09-11 against this
   repo's own dev server, using a URL that does not serve valid CIMD JSON (`https://www.google.com/`) as
   a deliberately-broken example:

   ```bash
   curl -s -G http://localhost:3000/api/authorization \
     --data-urlencode "response_type=code" \
     --data-urlencode "client_id=https://www.google.com/" \
     --data-urlencode "redirect_uri=http://localhost:3001/callback" \
     --data-urlencode "scope=openid" \
     --data-urlencode "state=teststate" \
     --data-urlencode "code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" \
     --data-urlencode "code_challenge_method=S256"
   ```

   Real response:

   ```json
   {"error":"invalid_client_metadata","error_description":"[A505302] Failed to read the client's metadata document retrieved from 'https://www.google.com/': Invalid JSON","error_uri":"https://docs.authlete.com/#A505302"}
   ```

   That `A505302` is Authlete telling you it genuinely fetched your URL and could not parse it as JSON —
   proof the CIMD fetch is real, not simulated. A well-formed document at a self-consistent HTTPS URL
   (see [`CIMD.md`](CIMD.md) → Metadata Document Requirements for the exact shape) succeeds the same way
   a pre-registered `client_id` would, and the response continues to the normal login/consent screen.

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
| `invalid_client_metadata` (`[A505302]` or similar) | CIMD fetch failed — the `client_id` URL didn't return valid, self-consistent JSON | Confirm the URL is reachable over HTTPS, returns JSON whose own `client_id` field equals the fetch URL exactly, and declares no `client_secret*` auth method — see [`CIMD.md`](CIMD.md) |
| `/.well-known/oauth-protected-resource` returns 404 or HTML | Wrong host, or you appended the well-known path after an existing path instead of at the origin | Use just the origin — `{scheme}://{host}/.well-known/oauth-protected-resource` — see [Step 1b](#step-1b-protected-resource-metadata-rfc-9728) |

## Related Specs

| Spec | Title | Purpose |
|------|-------|---------|
| RFC 6749 | OAuth 2.0 | Base authorization framework |
| RFC 7636 | PKCE | Proof Key for Code Exchange |
| RFC 8414 | AS Metadata | Authorization Server Discovery |
| RFC 8707 | Resource Indicators | Scoped token issuance |
| RFC 9728 | Protected Resource Metadata | Resource-server discovery — which AS(es) protect this API |
| MCP Auth Spec | MCP OAuth 2.1 | AI tool authorization |
| CIMD | Client ID Metadata Document | Passwordless client registration |
