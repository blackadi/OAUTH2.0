# Development

- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Config](#config)
- [Service Configuration](#service-configuration)
- [Middleware Stack](#middleware-stack)
- [Rate Limits](#rate-limits)
- [Brute-Force Protection](#brute-force-protection)
- [CSRF Protection](#csrf-protection)
- [Admin Routes](#admin-routes)
- [Session Store](#session-store)
- [Graceful Shutdown](#graceful-shutdown)
- [Build & Deploy](#build--deploy)
- [Quirks & Gotchas](#quirks--gotchas)

---

## Setup

```bash
# 1. Clone and install
git clone <repo>
npm --prefix server install
npm --prefix client install

# 2. Configure environment
cp server/.env.example server/.env
cp client/.env.example client/.env

# 3. Start Redis (optional, for production-like sessions)
docker compose up -d

# 4. Run development servers
npm --prefix server run dev   # Express on :3000
npm --prefix client run dev   # SPA on :3001 (Vite proxies /api → :3000)
```

### Required Authlete Credentials

Get these from [Authlete Console](https://console.authlete.com/):
- `AUTHLETE_BEARER_TOKEN` — API access token
- `AUTHLETE_BASE_URL` — Authlete API base URL
- `AUTHLETE_SERVICE_ID` — Authlete service ID

### Admin credentials — you invent these

> **The short version:** `MGMT_CLIENT_ID` and `MGMT_CLIENT_SECRET` are a username and password **you make
> up**. They are not from Authlete, and there is no correct value to go and find.

The names are the trap. They read exactly like an OAuth `client_id` / `client_secret`, so the natural
assumption is that you copy them out of the Authlete console like the three above. **You don't.** They are
HTTP Basic credentials for *this server's own* admin endpoints, compared straight against the two
environment variables and nothing else:

```ts
// src/middleware/require-basic-auth.ts — no Authlete call anywhere in this file
const idMatches     = safeEqual(id,     process.env.MGMT_CLIENT_ID);
const secretMatches = safeEqual(secret, process.env.MGMT_CLIENT_SECRET);
```

Whatever you put in `.env` **is** the correct value. Nothing outside this repo knows them.

| Variable | Where the value comes from |
|---|---|
| `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID` | **Authlete console** |
| `CID` / `SEC`, `PUB_CID`, `PKJWT_CID` (E2E) | **Authlete console** — real registered OAuth clients |
| **`MGMT_CLIENT_ID`, `MGMT_CLIENT_SECRET`** | **You choose them.** Any username; a random secret |

**Generate and set them:**

```bash
openssl rand -base64 32          # -> use as MGMT_CLIENT_SECRET
```

```bash
# server/.env
MGMT_CLIENT_ID=admin
MGMT_CLIENT_SECRET=<the value openssl printed>
```

**Use them** as ordinary HTTP Basic credentials:

```bash
curl -u "admin:<your-secret>" http://localhost:3000/api/client/list
```

**Three things worth knowing:**

1. **They fail closed.** Leave either blank and every admin endpoint answers `401` — in development too.
   That is deliberate: the middleware used to *allow* all requests when unconfigured, which silently
   disabled authentication on routes that return a confidential client's secret in plaintext. The server
   logs a warning at startup naming every surface that will reject requests.
2. **A colon in the secret is safe.** The decoder splits on the **first** colon only, so `openssl` output
   with punctuation works. (`base64` output has no colons anyway, but the rule holds if you pick your own.)
3. **Your host needs them separately.** `server/.env` is local and gitignored. Set both in your hosting
   provider's environment (Render dashboard, etc.) or the deployed admin endpoints will all 401.

**Common mistake:**

```bash
# ❌ Looking for these in the Authlete console, finding nothing, and leaving them blank
MGMT_CLIENT_ID=
MGMT_CLIENT_SECRET=
#    -> every admin endpoint returns 401 {"error":"invalid_client"}

# ✅ Any username you like, plus a generated secret
MGMT_CLIENT_ID=admin
MGMT_CLIENT_SECRET=Yk3n8...              # openssl rand -base64 32
```

> **Why a 401 looks the same either way.** A wrong password and *unconfigured credentials* both return
> `401 {"error":"invalid_client","error_description":"Client authentication required"}`. Telling an
> anonymous caller that admin auth is misconfigured is free reconnaissance, so the distinction goes to the
> server log instead — check there if you are unsure which one you are hitting.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Express listen port |
| `NODE_ENV` | No | **`production`** | `development` or `production`. **The default is `production`, and that is a security control** — it used to default to `development`, and the live deployment did not set it, so `development-only.ts` never fired and `POST /api/device/complete` (which approves a device authorization as any subject the caller names) was reachable on the public internet. `npm run dev` sets `development` explicitly; `server.ts` warns loudly whenever the resolved environment is `development` |
| `SESSION_SECRET` | **Yes** | — | Session encryption secret. Only non-emptiness is enforced; 32+ random chars is a recommendation, not a check |
| `AUTHLETE_BEARER_TOKEN` | **Yes** | — | Authlete API token |
| `AUTHLETE_BASE_URL` | **Yes** | — | Authlete API base URL (e.g. `https://eu.authlete.com`) |
| `AUTHLETE_SERVICE_ID` | **Yes** | — | Authlete service ID |
| `REDIS_URL` | No | — | Redis connection string (e.g., `redis://localhost:6379`) |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,http://localhost:3001` | CORS allowed origins |
| `AUTH_USERS` | No | `admin:admin:password:Administrator` | Demo users: `subject:username:password:name;...` |
| `MGMT_CLIENT_ID` | No | — | Admin API Basic auth username. **You choose this — not from Authlete.** **Fails closed** — unset means every admin route 401s. See [Admin credentials](#admin-credentials--you-invent-these) |
| `MGMT_CLIENT_SECRET` | No | — | Admin API Basic auth password. **You generate this** (`openssl rand -base64 32`). Same fail-closed behaviour |
| `JWKS_URI` | No | — | JWKS URI for backchannel logout token verification |
| `LOGOUT_REDIRECT_URI` | No | — | Valid post-logout redirect URI |
| `LOGOUT_CLIENT_ID` | No | — | Client ID rendered in the logout view |
| `JWT_ISSUER` | No | — | `iss` for locally-signed JWTs (`/api/token/createLocalToken`) |
| `JWT_PRIVATE_KEY_PEM` | No | — | Private key for locally-signed JWTs (dev only) |
| `JWT_PUBLIC_KEY_PEM` | No | — | Public key for verifying locally-signed JWTs |
| `PROTECTED_RESOURCE_IDENTIFIER` | No | UserInfo endpoint | RFC 9728 `resource` value |
| `PROTECTED_RESOURCE_DOCUMENTATION` | No | — | RFC 9728 `resource_documentation` value |
| `LOG_LEVEL` | No | `debug` (dev) / `info` (prod) | Winston log level |
| `MORGAN_FORMAT` | No | `combined` | Morgan access log format |

### E2E only (`server/.env`, used by `npm run test:e2e`)

Missing values **skip** blocks rather than fail them, so a partial set produces a green run
that never exercised most of the suite.

| Variable | Unlocks | Notes |
|----------|---------|-------|
| `CID` + `SEC` | 14 blocks (auth code, refresh, CIBA, PAR, token management, …) | Must be a CONFIDENTIAL client using `CLIENT_SECRET_BASIC` — the tests authenticate via HTTP Basic |
| `PUB_CID` | PKCE (RFC 7636), public-client PAR | Must be a PUBLIC client whose `idTokenSignAlg` is **asymmetric** (RS256/ES256). HS256 signs the ID token with the client secret and Authlete refuses with `[A406301]` |
| `REDIR` | — | Must be registered on both clients above, or the auth-code and PAR blocks fail on `redirect_uri` mismatch |
| `PKJWT_CID` + `PKJWT_PRIVATE_JWK` | RFC 7523 §2.2 client auth and asymmetric JAR (Module 06 Ex 4, Module 05 Ex 2) | A CONFIDENTIAL client with `tokenAuthMethod: PRIVATE_KEY_JWT` and a registered JWKS. `PKJWT_PRIVATE_JWK` is the **private** half as a single-line JWK — **single-quote it**, or the shell strips the JSON's double quotes and every assertion fails with `[A157326]`. It is a client credential: never commit it. The curriculum labs read the same pair as `PKJWT_CLIENT_ID` / `PKJWT_PRIVATE_JWK` (see `docs/curriculum/scripts/curriculum.env.example`) |
| `BASE_URL` | — | Only for the standalone `tests/e2e/enable_ciba.ts` helper |

### Client (`client/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_CLIENT_ID` | No | `your_client_id` | OAuth client ID for testing |
| `VITE_CLIENT_SECRET` | No | — | OAuth client secret for testing. **Leave empty for a public client** — the literal `your_client_secret` is treated as absent, since sending any secret for a `none` client is refused with `[A157303]` |
| `VITE_REDIRECT_URI` | No | `http://localhost:3001/callback` | Redirect URI for auth flows |
| `VITE_API_BASE_URL` | No | `http://localhost:3000` | Backend API URL |
| `VITE_PROD_API_BASE_URL` | No | — | Backend API URL in production |
| `VITE_PROD_REDIRECT_URI` | No | — | Redirect URI in production |
| `VITE_SCOPES` | No | `openid profile email` | Default scope list for tests |
| `VITE_DEV_CLIENT_PORT` | No | `3001` | Vite dev server port |
| `VITE_DEV_CLIENT_HOST` | No | `localhost` | Vite dev server host |

---

## Config

### Server Config Loading

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#475569', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
flowchart LR
    ENV[".env file"] --> DOT["dotenv.config()<br/>Called once in app.config.ts"]
    DOT --> APP["app.config.ts<br/>Required() validation"]
    APP --> AUTH["authlete.config.ts<br/>SDK settings, JWKS"]
    APP --> SESSION["session.ts<br/>Store config"]
    APP --> SERVER["server.ts<br/>Port, shutdown handler"]
```

- `dotenv` is loaded **only** in `src/config/app.config.ts` (was previously duplicated in `authlete.config.ts`)
- Fails fast: missing `SESSION_SECRET`, `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, or `AUTHLETE_SERVICE_ID` throws immediately on startup
- Config validation is import-order-dependent — `app.config.ts` must be imported before other configs

### Client Config

Client env vars are prefixed with `VITE_` and accessed via `import.meta.env` at build time. The `config.ts` module exports `API_BASE_URL` directly and `getRedirectUri()`, which respects the per-environment override in `PROD_CONFIG`. There was a matching `getApiBaseUrl()`; it had no callers and was removed — read `API_BASE_URL`.

---

## Service Configuration

The Authlete service (configured via the [Authlete web console](https://console.authlete.com/)) controls OAuth/OIDC behavior through boolean flags. These address common spec implementation mistakes documented in [OAuth & OIDC Implementation Mistakes](https://darutk.medium.com/oauth-oidc-mistakes-7f3bb909518b).

### Recommended Flags

| Flag | Value | Rationale |
|------|-------|-----------|
| `scopeRequired` | `true` | Reject requests without `scope` (RFC 6749 §3.3) |
| `claimShortcutRestrictive` | `true` | Only embed scope-requested claims in ID token when no AT issued |
| `refreshTokenKept` | `true` | Disable refresh token rotation (FAPI 2.0 forbids it) |
| `refreshTokenIdempotent` | `true` | Idempotent refresh within 60s window |
| `dcrScopeUsedAsRequestable` | `true` | Honor `scope` metadata in DCR (RFC 7591) |
| `missingClientIdAllowed` | `false` | Require `client_id` in token requests |
| `issSuppressed` | `false` | Include `iss` param for mix-up attack prevention (RFC 9207) |
| `idTokenAudType` | `"string"` | Single string for `aud` claim |
| `loopbackRedirectionUriVariable` | `true` | Variable loopback ports (RFC 8252 §7.3) |
| `traditionalRequestObjectProcessingApplied` | `false` | Use RFC 9101 JAR processing |
| `nbfOptional` | `false` | Require `nbf` on request objects, so their lifetime can be bounded. FAPI 1.0 Part 2 §5.2.2 sets that bound at **60 minutes**, not 60 seconds — this row said `≤60s` until 2026-08-14 |
| `unauthorizedOnClientConfigSupported` | `true` | Return 401 for non-existent DCR clients |
| `idTokenReissuable` | `true` | Enable ID token reissuance during refresh |

### Brazil-Specific Flags

Set only if targeting Brazil's API ecosystem:

| Flag | Value |
|------|-------|
| `dcrDuplicateSoftwareIdBlocked` | `true` |
| `frontChannelRequestObjectEncryptionRequired` | `true` |
| `requestObjectEncryptionAlgMatchRequired` | `true` |
| `requestObjectEncryptionEncMatchRequired` | `true` |

---

## Middleware Stack

Ordered as applied in `app.ts`:

1. Static file serving (`public/`)
2. Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS in prod)
3. CORS (`ALLOWED_ORIGINS`)
4. Request ID (`req.id` — **UUID v4**; an inbound `X-Request-Id` is honoured only if it is a valid UUID)
5. Per-request logger (`req.logger` — Winston child)
6. Morgan access logs (→ Winston)
7. Metrics (Prometheus histogram + counter)
8. Audit log (Winston daily-rotate at `logs/audit-*.log`, 90-day retention)
9. Body parsers (urlencoded + json; captures `req.rawBody`)
10. Cookie parser
11. Trust proxy (`app.set("trust proxy", 1)`)
12. Session (30-min expiry, in-memory or Redis)
13. Rate limiters (applied per route, not globally)
14. CSRF (applied per route on session/device browser routes)
15. Request timeout (30s on `/api/*`)
16. Routes

---

## Rate Limits

| Limiter | Rate | Applied To | Skip Condition |
|---------|------|------------|----------------|
| `tokenLimiter` | 20/min | `POST /api/token` | Skipped when Basic auth present |
| `authLimiter` | 60/min | `GET /api/authorization` | — |
| `loginLimiter` | 5/min | `POST /api/session/login` | — |
| `generalLimiter` | 60/min | Session, DCR, CIBA, PAR, VCI, federation, device browser routes, **`GET`/`POST /api/logout`** | — |

Rate limiting uses `express-rate-limit` with in-memory store.

---

## Brute-Force Protection

**5 failed login attempts / IP → 60s ban**

- In-memory `Map<string, { count, banUntil }>` in `session.controller.ts`
- Cleared on successful login
- 429 "Too many login attempts" response when banned
- Distinct from rate limiter — this is per-IP, per-brute-force, not per-time-window

---

## CSRF Protection

| Aspect | Detail |
|--------|--------|
| Token length | 32 bytes → 64-character hex string |
| Generation | On every GET that renders a form |
| Validation | POST/PUT/PATCH/DELETE via `_csrf` body field |
| Consumption | Replaced with new token after each successful POST |
| Force-save | `req.session.save()` called explicitly after token generation |
| TTL | Session lifetime (30 min) |
| Error | 403 `{ error: "invalid_request", message: "CSRF token mismatch" }` |

**Why force-save matters**: `express-session` with `resave: false` + `saveUninitialized: false` does not autosave new sessions, even when modified. The CSRF token generated during GET would be lost before POST without explicit `save()`.

---

## Admin Routes

Routes requiring admin Basic auth use `requireBasicAuth` middleware checking `MGMT_CLIENT_ID` /
`MGMT_CLIENT_SECRET` (see [Admin credentials — you invent these](#admin-credentials--you-invent-these) for
where those values come from). Nine realms:

| Realm | Routes |
|---|---|
| `token_management` | `/api/token/*` — list, create, delete, update, revoke, reissue, createLocalToken |
| `client_management` | `/api/client/*` — CRUD |
| `dcr` | `/api/client/dcr/register` (only; `get`/`update`/`delete` use the registration access token) |
| `hsk` | `/api/hsk/*` — create, get, delete, list |
| `vci` | `/api/vci/offer/create`, `/api/vci/offer/info` |
| `introspection` | `/api/introspection` and `/api/introspection/standard` |
| `jar` | `/api/jar/process` |
| `federation` | `/api/federation/registration` |
| `nativesso` | native SSO endpoints |
| *(also)* | `/api/backchannel_logout/{issue,deliver,deliver-all}` |

> ### ⚠️ Corrected 2026-08-15 — this section said the opposite, and the opposite was dangerous
>
> It read: *"If `MGMT_CLIENT_ID` and `MGMT_CLIENT_SECRET` are **not set**, all admin routes are unprotected
> (no auth required)."*
>
> **That was true once and has not been for some time.** `requireBasicAuth` **fails closed**: unset either
> value and every route above returns `401`. The old sentence did not merely describe stale behaviour — it
> told a reader that leaving the credentials blank was a working, open configuration, on routes including
> one that returns a confidential client's secret in plaintext.
>
> The fix that changed it is the reason the middleware carries a `managementCredentialsConfigured()` helper
> and a startup warning: an unset variable must be loud, not permissive.

---

## Session Store

| Mode | Store | Config |
|------|-------|--------|
| Default | In-memory | No additional config needed |
| Production | Redis | `REDIS_URL=redis://localhost:6379` |

The session store is configured in `src/middleware/session.ts`. Redis is optional — when `REDIS_URL` is not set, the server uses the default in-memory store.

To enable Redis:
```bash
docker compose up -d
# Add to server/.env:
REDIS_URL=redis://localhost:6379
```

---

## Graceful Shutdown

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#e2e8f0', 'primaryBorderColor': '#475569', 'lineColor': '#6366f1', 'secondaryColor': '#0f172a', 'tertiaryColor': '#334155', 'fontFamily': 'Inter'}}}%%
sequenceDiagram
    participant OS as OS (SIGTERM/SIGINT)
    participant S as Server (server.ts)
    participant H as HTTP Server
    participant R as Redis Client
    
    OS->>S: SIGTERM or SIGINT
    S->>S: Log "Shutting down gracefully..."
    S->>H: httpServer.close()
    H-->>S: All connections drained
    alt Redis is connected
        S->>R: redisClient.quit()
        R-->>S: Disconnected
    end
    S->>S: process.exit(0)
```

Implemented in `server/src/server.ts`. Redis logout is conditional — only called if the Redis client was initialized.

---

## Build & Deploy

```bash
# Server build (TypeScript → dist/)
npm --prefix server run build

# Client build (Vite → dist/)
npm --prefix client run build

# Both (Render deploy)
npm --prefix client run build && npm --prefix server run build

# Production start
npm --prefix server run start   # node dist/server.js
```

### Build Output

```
server/dist/
├── server.js          # Compiled entry point
├── config/            # Compiled config
├── controllers/       # Compiled controllers
├── services/          # Compiled services
├── routes/            # Compiled routes
├── middleware/        # Compiled middleware
├── types/             # Compiled type definitions
├── utils/             # Compiled utilities
├── views/             # Copied from src/views/ via postbuild
└── public/            # Copied from public/ via postbuild
```

### Postbuild Script

```json
{
  "postbuild": "rm -rf dist/views dist/public && cp -r src/views dist/views && cp -r public dist/public"
}
```

The destructive `rm -rf` prevents nested `dist/views/views/` on subsequent rebuilds. If you rename/move these directories, update the script.

---

## Quirks & Gotchas

### TypeScript Module Resolution

`server/tsconfig.json` uses `module: "node16"` + `moduleResolution: "node16"`. Dynamic imports need `.js` extension:

```typescript
// Correct
const { redisClient } = await import("../middleware/session.js");

// Wrong — will fail at runtime
const { redisClient } = await import("../middleware/session");
```

### SDK Version Pin

`server/package.json` pins the SDK to the **exact** version, with no caret:

```json
"@authlete/typescript-sdk": "1.0.0"
```

**This looks like a downgrade and is not.** Version `1.1.6` is numerically higher but is
*older code*:

| When | What happened |
|------|---------------|
| Nov 6–9, 2025 | Speakeasy `versioningStrategy: automatic` ran the package up to `1.1.6`. Only `1.1.5`/`1.1.6` reached npm. |
| Nov 12, 2025 | Upstream restarted at `0.0.1-beta`, all flagged as GitHub prereleases. |
| → Mar 2026 | Betas iterated to `0.0.14-beta`. |
| **Apr 8, 2026** | Commit *"Promote SDK to stable v1.0.0 and align Speakeasy config"* — `versioningStrategy` → `manual`, `version` → `1.0.0`. |
| Apr 9, 2026 | Published to npm as `1.0.0`, tagged `latest`. |

So `1.0.0` is newer, larger (84 operations vs 75) and is what a plain
`npm install @authlete/typescript-sdk` gives you today.

> **GitHub's releases page shows `v1.1.6` as "Latest" — disregard it.** GitHub's badge
> picks the newest release *not* flagged `prerelease`, every release after v1.1.6 *is*
> flagged prerelease, and the Apr 2026 stable `1.0.0` was never given a GitHub release.
> The badge is stale metadata. npm's `latest` dist-tag and `.speakeasy/gen.yaml` on `main`
> both say `1.0.0`.

**Never widen the pin.** `^1.0.0` resolves up to `1.1.6` and silently reintroduces every
bug below. `.github/dependabot.yml` carries an `ignore` rule for `1.1.5`/`1.1.6` so the
weekly bot cannot propose that "upgrade".

#### What 1.0.0 fixes (why the old patch existed)

The repo used to carry `patches/@authlete+typescript-sdk+1.1.6.patch` applied by
`patch-package` in `postinstall`. Both are now removed. Each hunk corrected a place where
the generated SDK contradicted Authlete's own OpenAPI contract:

| Divergence | Spec says | SDK 1.1.6 did | 1.0.0 |
|------------|-----------|---------------|-------|
| `clientCreate` status | `/client/create` declares **both** `201` and `200` | matched `200` only, so a real 201 fell through to `M.fail("4XX")` | native `[200, 201]` |
| Discovery document | `additionalProperties: true` | `z.object({})` stripped it to `{}` | schema removed; returns the raw object |
| Service JWKS | `keys[]` items `additionalProperties: true` | stripped every JWK to `{}` | `keys: z.array(z.record(z.any()))` |
| `TokenRequest.properties` | array of `{key,value,hidden}` | typed `string` — the **only** one of seven request models to get it wrong | `Array<Property>` |

The last row was never patched, so it was a live bug: `token.service.ts` followed the wrong
type and `JSON.stringify`d the value, putting a JSON *string* on the wire where Authlete
wants an array. Normalization now lives in `src/utils/properties.ts` (`parseProperties`),
shared by `token.service.ts` and `token.controller.ts`.

#### Migrating (what changed in our code)

Two breaking changes, both mechanical:

- `client.management.*` — `subjectPathParameter` + `subjectQueryParameter` collapsed into a
  single `subject`. 1.1.6 merged Authlete's path and query variants into one operation and
  sent the subject twice (`/get/list/{subject}?subject=…`); 1.0.0 splits them and these
  methods are the documented path variant. Behavior is unchanged.
- `TokenRequest.properties` — now `Array<Property>` instead of `string`.

Verified across the 74 operations both versions share: **zero URL or HTTP-method changes**.
One operation was dropped (`serviceCreate`, unused here) and ten added. Dependencies are
identical (`zod: ^3.25.0 || ^4.0.0`).

### Audit Log Retention

Winston daily-rotate at `logs/audit-*.log` with 90-day retention. The `logs/` directory is gitignored (except `.gitkeep`).

### Supertest 7.2.2

There's a bug in Supertest 7.2.2: `_attachCookies` throws `Invalid URL` on relative URL redirects with JSON chars. Workaround: avoid browser-flow tests or use `request` (non-agent).

### Coverage Directory

`server/coverage/` is gitignored — generated report directory from `npm run test:coverage`.

### Crypto Utility

`server/src/utils/crypto.ts` was deleted (unused). The client-side `pkce.ts` handles PKCE code generation. Only server-side crypto used is `crypto.randomBytes()` for CSRF tokens.

### Loggers

All logging uses `const log = req.logger || logger;`, and `log` is a plain Winston `Logger` — `.info()`, `.warn()`, `.error()`, `.child()`. It used to be a `CallableLogger` shim that was *also* callable as `log("msg")` for info level; that gave one job two idioms and is gone.

### Login Page

Credentials are never hardcoded in source. The login template passes empty strings. `AUTH_USERS` env var provides demo users (defaults to `admin:password`).

### E2E Dependencies

The E2E test (`tests/e2e/e2e.test.ts`) conditionally skips blocks based on env vars:
- `CID`/`SEC` — confidential client credentials
- `PUB_CID` — public client credentials
- `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` — management credentials

### Authlete Rate Limit

~15+ token API calls in a short window triggers Authlete's rate limit (HTTP 429). E2E tests handle this as a valid response.
