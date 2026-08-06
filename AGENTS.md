# AGENTS.md — authlete-node-authz-server

## Repo structure

Two independent packages in `server/` and `client/`. No monorepo tooling — use `--prefix` or `cd`.

| Directory | What                      | Entrypoint                |
|-----------|---------------------------|---------------------------|
| `server/` | Express + Authlete SDK    | `src/server.ts`           |
| `client/` | React OAuth debugger (Vite + SWC) | `src/main.tsx`      |
| root      | Docker Compose            | `docker-compose.yml`      |
| `.github/` | CI, templates, CODEOWNERS | `workflows/ci.yml`       |

### Community Health Files

| File | Purpose |
|------|---------|
| `LICENSE` | MIT License |
| `CONTRIBUTING.md` | Contribution guide (setup, workflow, PR process) |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 |
| `SECURITY.md` | Vulnerability reporting policy |
| `.github/CODEOWNERS` | Auto-assign reviewers |
| `.github/ISSUE_TEMPLATE/` | Bug report + feature request forms |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist |
| `.github/dependabot.yml` | Auto-update dependencies weekly |

## Commands

```bash
# Server dev (ts-node-dev --respawn --transpile-only, no build needed)
npm --prefix server run dev

# Server production build + start
npm --prefix server run build && npm --prefix server run start

# Server tests
npm --prefix server run test              # unit + integration (464 tests, 51 files)
npm --prefix server run test:watch        # watch mode
npm --prefix server run test:coverage     # run with coverage report
npm --prefix server run test:unit         # unit tests only (416 tests, 50 files)
npm --prefix server run test:integration  # integration tests only (48 tests)
npm --prefix server run lint               # ESLint (flat config, 0 errors)
npm --prefix server run typecheck          # TypeScript check (tsc --noEmit, 0 errors)
npm --prefix server run test:e2e          # E2E (100 tests, requires real Authlete creds)

# Client dev (Vite on :3001, proxies /api -> localhost:3000)
npm --prefix client run dev

# Client production build
npm --prefix client run build

# Both install
npm --prefix server install && npm --prefix client install

# Render deploy build (builds both)
npm --prefix client run build && npm --prefix server run build

# Docker Redis (local dev)
docker compose up -d redis
# Set REDIS_URL=redis://localhost:6379 in server/.env to use it

# Docker Prometheus + Grafana (monitoring)
docker compose up -d prometheus grafana
# Prometheus UI at http://localhost:9090
# Grafana at http://localhost:3002 (admin/admin)
# See docs/MONITORING.md for usage
```

## Dev setup

1. Copy `.env.example` → `.env` in both `server/` and `client/`
2. Required env vars: `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID`, `SESSION_SECRET`
3. The `server` reads `.env` via `dotenv` (called in `src/config/app.config.ts` only)
4. Config validation fails fast on startup — missing `SESSION_SECRET`, `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, or `AUTHLETE_SERVICE_ID` throws immediately
5. Demo users default to `admin:password` if `AUTH_USERS` env var is not set. Set `AUTH_USERS=subject:username:password:name;sub2:user2:pass2:Name2` for custom users
6. Logout endpoint validates `post_logout_redirect_uri` against `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` env vars
7. Client `.env` should set `VITE_CLIENT_ID`, `VITE_REDIRECT_URI` — defaults to `your_client_id` placeholder
8. Optional Redis: `docker compose up -d` + set `REDIS_URL=redis://localhost:6379` in `server/.env`

## Testing architecture

- **Vitest** runner, **Supertest** for HTTP integration tests
- 17 Authlete-dependent services accept `authleteApi` as optional constructor param (defaults to real SDK client)
- 2 services using raw `fetch()` (`backchannel-logout`, `metrics`) accept config as optional constructor param. `health` used to be a third: SDK 1.0.0 exposes `lifecycle.getApiLifecycleHealthcheck()` for `GET /api/lifecycle/healthcheck`, so it now goes through the SDK like every other Authlete call. `backchannel-logout` still cannot — the SDK exposes no backchannel logout token API (re-verified against 1.0.0)
- `app.ts` exports `createApp()` factory — tests build fresh app instances without `listen()`
- Integration tests use `vi.hoisted()` + `vi.mock()` to replace `authlete.service` module at import time
- Mock API defined in `tests/helpers/mock-authlete.ts` covers every SDK method
- **Unit tests**: 50 files across 5 categories (416 tests):
  - `tests/unit/services/` — 24 files (127 tests), each service in isolation with mocked SDK (includes consent-store, device, hsk, metrics, par, userinfo)
  - `tests/unit/controllers/` — 9 files (113 tests), token/authorization/authorization-fail-response/DCR/backchannel-logout/device/hsk/introspection/vci
  - `tests/unit/middleware/` — 6 files (55 tests), error handler, session, audit-log, csrf, require-basic-auth, require-grant-ownership
  - `tests/unit/utils/` — 7 files (104 tests), basic-auth/createLocalJWT/jwksClient/properties/validate/validation/dpop
  - `tests/unit/routes/` — 4 files (17 tests), fapi + metrics + openapi + protected-resource-metadata routes
- **Integration tests**: 1 file `tests/integration/routes.test.ts` (48 tests) — full Express stack with mocked SDK
- **E2E tests**: 1 file `tests/e2e/e2e.test.ts` (100 tests) — real Authlete API, 26 section headers fixed for sequential numbering
- Run with `npm --prefix server run test` — 464 tests across 51 files, completes in ~2s
- E2E uses `vitest.e2e.config.ts` — run via `npm --prefix server run test:e2e` or `npx vitest run --config vitest.e2e.config.ts`
- E2E tests conditionally skip blocks based on env vars: `CID`/`SEC` (confidential), `PUB_CID` (public), `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` (management)

## Architecture notes

- All API routes under `/api` prefix (defined in `server/src/app.ts`)
- Server delegates OAuth logic to Authlete SDK (`@authlete/typescript-sdk`)
- Login/consent pages are server-rendered EJS (views in `server/src/views/`)
- Interactive OAuth flow: authorization → login → consent → redirect with code
- Session-based (express-session, in-memory or Redis store, 30-min expiry)
- Each request gets a unique ID (`req.id`) and per-request logger (`req.logger`)
- Server accepts both `application/json` and `application/x-www-form-urlencoded` on token endpoint
- **CSRF protection** on all state-changing form submissions: 32-byte random token generated on GET, validated on POST/PUT/PATCH/DELETE via `_csrf` body field. Forces `req.session.save()` for new sessions with `resave:false` + `saveUninitialized:false`. Returns 403 on mismatch. See `src/middleware/csrf.ts`.
- `client/` Vite dev server proxies `/api` → `http://localhost:3000`
- Security headers set globally (X-Content-Type-Options, X-Frame-Options, XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS in production)
- CORS restricted to `http://localhost:3000,http://localhost:3001` by default (configurable via `ALLOWED_ORIGINS`)
- Admin token management under `/api/token/*` requires Basic auth with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`. **Fails closed**: if either is unset the routes return 401 rather than allowing the request
- Grant Management API at `/api/gm/:grantId` (GET=query, DELETE=revoke) delegates to `authleteApi.grantManagement.processRequest()`. Bearer token required. **`requireGrantOwnership` (`middleware/require-grant-ownership.ts`) runs first**: it introspects the token and requires the grant it was issued under to equal `:grantId`, returning 403 otherwise — Authlete's `/gm` API validates the token but not who owns the grant, and its response carries no owner information. This is deliberately stricter than [Grant Management for OAuth 2.0](https://openid.net/specs/oauth-v2-grant-management.html): a client-credentials token has no grant, so machine-to-machine grant management is not supported.
- Client SPA stores tokens in sessionStorage via React Context (`src/context/TokenContext.tsx`)
- **Prometheus metrics**: `GET /metrics` and `GET /api/metrics` — tracks HTTP request duration (histogram) + total (counter) via `prom-client` + `collectDefaultMetrics`. Labels: `method`, `route`, `status`. See `src/services/metrics.service.ts` and `src/middleware/metrics.ts`.
- **Audit logging**: Winston daily-rotate-file logger at `logs/audit-*.log` (90-day retention). Captures `reqId`, method, path, status, duration, IP, user-agent, `user`, `clientId`. Records client identity from Basic auth headers. See `src/utils/audit-logger.ts` and `src/middleware/audit-log.ts`.
- **Rate limiting**: `tokenLimiter` (20/min, skips Basic auth), `authLimiter` (60/min), `loginLimiter` (5/min), `generalLimiter` (60/min). See `src/middleware/rate-limit.ts`.
- **Brute-force protection**: 5 failed logins/IP → 60s ban. In-memory Map, cleared on success. See `src/middleware/rate-limit.ts`.
- **Health endpoints**: `GET /api/health` (server liveness — status, uptime, timestamp), `GET /api/health/authlete` (Authlete connectivity check, `?extended=true` for DB), `GET /api/health/all` (aggregate: redis + authlete). The client SDA polls `/api/health` every 30s for a live server-status indicator in the header. The Authlete check delegates to `authleteApi.lifecycle.getApiLifecycleHealthcheck()`, which resolves only on 200 and throws otherwise — a non-2xx is a health *result*, not a transport failure, so `AuthleteError.statusCode`/`.body` are reported (the admin UI renders `statusCode` as "HTTP n"); only a genuine network failure yields `error` with no status. See `src/services/health.service.ts`, `client/src/hooks/useServerStatus.ts`.
- **Graceful shutdown**: `SIGTERM`/`SIGINT` handlers close Redis then HTTP server. See `src/server.ts`.
- **Protected Resource Metadata (RFC 9728)**: `GET /.well-known/oauth-protected-resource` at **true root** (not under `/api`). Derives `resource`, `authorization_servers`, `scopes_supported` and `dpop_signing_alg_values_supported` from the live discovery document so they cannot drift; `resource` defaults to this deployment's UserInfo endpoint and is overridable with `PROTECTED_RESOURCE_IDENTIFIER`. Returns 500 rather than emitting a document without the sole REQUIRED member. See `src/routes/protected-resource-metadata.routes.ts`.
- **OpenAPI spec**: `GET /api/openapi.json` — comprehensive 3.0.3 spec covering all endpoints. See `src/routes/openapi.routes.ts`.
- **Persistent consent**: In-memory Map with 24h TTL (`src/services/consent-store.service.ts`). Scoped by `{clientId}:{subject}`. Auto-approves if stored scopes cover requested scopes; `prompt=consent` bypasses.
- **Token management admin routes**: `/api/token/{list,create,delete/:id,update,revoke,reissue,createLocalToken}`. Protected by `requireBasicAuth` using `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`. See `src/routes/token.routes.ts` and `src/controllers/token.management.controller.ts`.
- **Backchannel Logout**: Three POST endpoints at `/api/backchannel_logout/{issue,deliver,deliver-all}`. The Authlete SDK v1.0.0 does NOT expose the backchannel logout token API — raw `fetch()` to Authlete is used in `backchannel-logout.service.ts`. All three endpoints require admin Basic auth (`requireBasicAuth`). The existing `GET /api/logout?backchannel=true` triggers deliver-all server-side after session destruction. The receiving endpoint at `POST /api/backchannel_logout` (in `logout.routes.ts`) handles incoming logout tokens from other OPs — properly destroys `req.session`.
- **Dynamic Client Registration (DCR)**: Four POST endpoints at `/api/client/dcr/{register,get,update,delete}`. Delegates to `authleteApi.dynamicClientRegistration.*` (SDK v1.0.0 includes these natively). `register` requires admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`); `get`/`update`/`delete` use the registration access token in the request body (no admin auth). The `action` field in Authlete's response is mapped to HTTP status: `CREATED`→201, `OK`/`UPDATED`→200, `DELETED`→204, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500. The `responseContent` field is returned as the response body. See `DcrSection.tsx` in the client for the testing UI.
- **CIBA (Client-Initiated Backchannel Authentication)**: Four POST endpoints at `/api/ciba/{authentication,issue,fail,complete}`. Delegates to `authleteApi.ciba.*` (backchannel authentication, issue, fail, complete). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body (passed to Authlete). The authentication endpoint receives URL-encoded `parameters` (containing `login_hint`, `scope`, etc.) plus `clientId`/`clientSecret`. It returns `USER_IDENTIFICATION` → 200 with `ticket`, `hintType`, `hint`, `deliveryMode`; or error statuses (500, 400, 401). The `issue` endpoint takes a `ticket` and returns `OK` → 200 with `authReqId`, `expiresIn`, `interval`. The `fail` endpoint takes `ticket` + `reason` and returns `FORBIDDEN` → 403, `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500. The `complete` endpoint takes `ticket` + `result` + `subject` and returns `NO_ACTION`→200 (poll mode) or `NOTIFICATION`→200 (ping/push mode). See `CibaSection.tsx` in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:openid:params:grant-type:ciba` — no custom token endpoint needed for the polling phase. **Recommended Authlete config:** Client Auth Method = `CLIENT_SECRET_BASIC` (per [Authlete CIBA guide](https://developers.authlete.com/guides/flows-and-protocols/grant-types-and-token-flows/how-to-implement-ciba-with-authlete)); backchannel auth endpoint and token endpoint must use the same client auth method.
- **PAR (Pushed Authorization Requests — RFC 9126)**: Single POST endpoint at `/api/par`. Delegates to `authleteApi.pushedAuthorization.*` (SDK v1.0.0 includes this natively). Accepts `parameters` (URL-encoded OAuth params), `clientId`, `clientSecret` in JSON body. No admin auth required. **Client authentication takes either an `Authorization: Basic` header (for `CLIENT_SECRET_BASIC` clients) or `clientId`/`clientSecret` body fields (for `CLIENT_SECRET_POST`)** — see the two-channel table under Quirks & gotchas; the SPA exposes this as a "Client Auth Method" selector in `ParSection.tsx`. Action mapped to HTTP status: `CREATED`→201, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `FORBIDDEN`→403, `PAYLOAD_TOO_LARGE`→413, `INTERNAL_SERVER_ERROR`→500. The response includes `requestUri` (the `request_uri` for the authorization call), `responseContent` (JSON with `expires_in`, `request_uri`). See `ParSection.tsx` in the client for the testing UI.
- **HSK (Hardware Security Keys)**: Four endpoints at `/api/hsk/{create,get/:handle,delete/:handle,list}`. Delegates to `authleteApi.hardwareSecurityKeys.*` (SDK v1.0.0 includes natively). All endpoints require admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`). Create accepts `kty`, `use`, `kid`, `hsmName`, `alg` in JSON body; requires `kty` and `hsmName`. Action mapping: `SUCCESS`→201 (create) / 200 (get/list) / 204 (delete), `INVALID_REQUEST`→400, `NOT_FOUND`→404, `SERVER_ERROR`→500. Get/delete use `:handle` route param. List returns all keys. See `src/services/hsk.service.ts`, `src/controllers/hsk.controller.ts`, `src/routes/hsk.routes.ts`.
- **Device Flow (RFC 8628)**: Three POST API endpoints at `/api/device/{authorization,verification,complete}` plus three browser paths at `/device` (GET show form, POST verify code, POST /device/consent authenticate+complete). Delegates to `authleteApi.deviceFlow.*` (SDK v1.0.0 includes natively). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body. Action→status mappings live in `device.controller.ts` and match the SDK's action enums exactly: authorization `OK`→200 (with `deviceCode`, `userCode`, `verificationUri`, `expiresIn`, `interval`) / `BAD_REQUEST`→400 / `UNAUTHORIZED`→401 / `INTERNAL_SERVER_ERROR`→500; verification `VALID`→200 / `NOT_EXIST`→404 / `EXPIRED`→400 / `INTERNAL_SERVER_ERROR`→500; complete `SUCCESS`→200 / `USER_CODE_NOT_EXIST`→404 / `USER_CODE_EXPIRED`→400 / `INVALID_REQUEST`→400 / `SERVER_ERROR`→500. **`ACCESS_DENIED` is a request `result` value, not a response action** — `DeviceCompleteRequestResult` is `{AUTHORIZED, ACCESS_DENIED, TRANSACTION_FAILED}`, while `DeviceCompleteResponseAction` has no `ACCESS_DENIED` member. A denial returns `SUCCESS`→200; the device learns of it as `access_denied` on its next token poll. Service must have `supportedGrantTypes` including `DEVICE_CODE`, plus `deviceAuthorizationEndpoint`. `deviceVerificationUri` and a positive `deviceFlowCodeDuration` are **mandatory** — Authlete errors on `/device/authorization` without them. `deviceFlowPollingInterval` is optional (0 omits `interval` from the response); `deviceVerificationUriComplete`, `userCodeCharset` (default `BASE20`) and `userCodeLength` (0 → 8 for `BASE20`, 9 for `NUMERIC`) are optional. **Security note:** `/api/device/*` carries no rate limiter and `/api/device/complete` has no authentication at all — it approves any live `userCode` as any `subject`. Those are local testing surfaces; the authenticated path is `POST /device/consent`. See `docs/DEVICE-FLOW-TUTORIAL.md` Part 12 and `DeviceSection.tsx` (4 tabs: Authorization, Verification, Complete, Poll Token) in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:ietf:params:oauth:grant-type:device_code` — no custom token endpoint needed for polling.
- **VCI (Verifiable Credential Issuance — OID4VCI)**: 9 API endpoints + `/.well-known/openid-credential-issuer` (OID4VCI 1.0 Final). Three auth categories: (1) **Discovery** (metadata, jwtissuer, jwks, well-known) — public GET; (2) **Offers** (offer/create, offer/info) — admin Basic auth; (3) **Credential** (credential/issue, credential/batch, deferred/issue) — access token via `Authorization: Bearer` header or body. Action→status: discovery `OK`→200/`NOT_FOUND`→404; offer `CREATED`→201/`FORBIDDEN`→403/`CALLER_ERROR`→400/`AUTHLETE_ERROR`→500; issue `OK`→200/`ACCEPTED`→202; batch `OK`→200; deferred `OK`→200/`ACCEPTED`→202. Files: `vci.service.ts`, `vci.controller.ts`, `vci.routes.ts` in server; `VciSection.tsx` in client.
- **MCP (Model Context Protocol — OAuth 2.1)**: `GET /.well-known/oauth-authorization-server` serves RFC 8414 AS metadata at root (same content as `openid-configuration`). Client UI: `McpSection.tsx` with 3 tabs (AS Metadata, Protected Resource Metadata, CIMD Metadata) + 5-step Full Flow Wizard (Discover → Register Client → Authorize with PKCE+Resource → Token Exchange → UserInfo). Service layer: `mcp.service.ts` — `fetchAsMetadata()` tries both well-known paths, `fetchProtectedResourceMetadata()` (RFC 9728), `fetchCimdMetadata()`, `buildAuthorizationUrl()` (PKCE S256 + RFC 8707 resource indicator), `exchangeCode()`, `fetchUserInfo()`. Requires CIMD enabled in Authlete (`clientIdMetadataDocumentSupported: true`). Tutorial: `docs/MCP-OAUTH-TUTORIAL.md`.

## Client SPA architecture

- **Routing**: React Router v6 with lazy-loaded sections, map-based route resolution via `sectionComponents` record in `App.tsx`. Typed `Section` and `SectionGroup` interfaces.
- **Sections**: 20 sections organized in 3 sidebar groups — OAuth 2.0 (Grant Flows, Token Operations, Step-Up Auth, Logout), OIDC & Extensions (DCR, CIBA, PAR, RAR, JAR, Device Flow, Backchannel Logout, Discovery, OIDC Federation, FAPI 2.0/DPoP, MCP, Verifiable Credentials), Admin (Token Management, Client Management, Grant Management, Health Check).
- **Layout**: Sticky 48px header with AppLayout, collapsible mobile nav, 56px sidebar (desktop only). Backdrop blur on header. Grouped sidebar with lucide icons and active-state shadows.
- **Components**: Organized into `components/layout/` (AppLayout, Sidebar, SectionPanel, ErrorBoundary, AdminAuth), `components/auth/` (AuthFlowsSection), `components/oidc/` (8 OIDC/OAuth section components), `components/admin/` (4 admin section components), `components/fapi/` (FapiSection — FAPI config/status + DPoP key tools + 4-step Test Flow wizard), `components/mcp/` (McpSection — MCP discovery + CIMD + 5-step Full Flow wizard), `components/ui/` (Button, Input, Select, Textarea, Badge, Card, TabBar, Spinner, Skeleton, FlowDiagram, SplitPane, RequestBuilder, TokenVault, JsonBlock, HelpPopover, OperationDescription).
- **Server status indicator**: `useServerStatus` hook (in `hooks/`) polls `GET /api/health` every 30s (10s retry on failure, 5s timeout). Color-coded badge in header: green=connected, red=offline, yellow pulse=checking. Hover shows uptime.
- **Hooks**: `useApi`, `useAsyncCall`, `useClipboard`, `useLocalStorage`, `useServerStatus` in `hooks/`.
- **Services**: Organized by domain in `services/` — `token.service.ts`, `admin.service.ts`, `client.service.ts`, `dcr.service.ts`, `ciba.service.ts`, `par.service.ts`, `device.service.ts`, `grant.service.ts`, `backchannel-logout.service.ts`, `health.service.ts`, `mcp.service.ts`. Shared HTTP utilities in `http.ts`. All exported from `services/index.ts`.
- **Config**: `config.ts` reads `VITE_*` env vars at build time, provides per-environment overrides via `PROD_CONFIG` + `getApiBaseUrl()`/`getRedirectUri()`. Separate `HEALTH_ENDPOINT` for the live status polling.
- **Token storage**: `TokenContext` (React Context API) persists tokens in `sessionStorage`. TokenVault in sidebar displays/copies/decodes stored tokens. Cleared on explicit action or tab close.
- **Test framework**: Vitest with 17 test files across `test/components/ui/`, `test/hooks/`, `test/services/`, `test/utils/`. Runs with `npm --prefix client run test`.
- **Styling**: Tailwind CSS v4 via `styles/globals.css`. Dark palette (slate-900/950), Inter + JetBrains Mono fonts, custom scrollbar, grid background utility.

## Documentation style guide

All documentation in `docs/` follows a clear, highly visual, step-by-step, and beginner-friendly technical style. Keep the writing warm, clear, direct, and heavily focused on practical, step-by-step examples with clear diagrams or flow breakdowns. Maintain a neutral voice — do not reference external individuals, personal brands, or third-party authors in documentation, commit messages, or prompts.

**Structure:**
- "The short version" intro (1-2 sentence summary)
- Mermaid sequence/flow diagrams with dark theme
- Real-world analogies (airport, bank, hotel)
- "Why before how" — explain the problem before the solution
- "What just happened?" recaps after complex flows
- Common mistakes sections with red/green examples
- Troubleshooting tables at the end

**Tone:**
- Direct, conversational, no jargon without explanation
- Use "you" to address the reader
- Bold key terms on first use
- Tables for quick reference
- Code blocks with comments explaining each line

## Authlete service configuration

The Authlete service (configured via the [Authlete web console](https://console.authlete.com/)) controls most OAuth/OIDC spec behavior through boolean flags. These flags address common spec implementation mistakes documented in [OAuth & OIDC Implementation Mistakes](https://darutk.medium.com/oauth-oidc-mistakes-7f3bb909518b).

| Flag | Recommended | Rationale | Article Ref |
|------|------------|-----------|-------------|
| `scopeRequired` | `true` | Reject authorization requests without `scope` per RFC 6749 §3.3 | Mistake #1 |
| `claimShortcutRestrictive` | `true` | Only embed scope-requested claims in ID token when no AT issued (OIDC Core §5.4) | Mistake #2 |
| `refreshTokenKept` | `true` | Disable refresh token rotation (FAPI 2.0 §5.3.2.1 forbids it) | Mistake #3 |
| `refreshTokenIdempotent` | `true` | Idempotent refresh token handling within 60s window | Mistake #3 |
| `dcrScopeUsedAsRequestable` | `true` | Honor `scope` metadata in DCR to restrict client scopes (RFC 7591) | Mistake #4 |
| `missingClientIdAllowed` | `false` | Require `client_id` in token requests; never look up from auth code (RFC 6749 §4.1.3) | Mistake #5 |
| `issSuppressed` | `false` | Include `iss` response param for mix-up attack prevention (RFC 9207) | Mistake #6 |
| `idTokenAudType` | `"string"` | Use single string for `aud` claim (FAPI WG decision Nov 2024) | Mistake #7 |
| `loopbackRedirectionUriVariable` | `true` | Treat loopback redirect ports as variable (RFC 8252 §7.3) | Mistake #8 |
| `traditionalRequestObjectProcessingApplied` | `false` | Use RFC 9101 JAR processing (not legacy OIDC Core §6) | Mistake #9 |
| `nbfOptional` | `false` | Enforce request object lifespan ≤60s for FAPI 1.0 compliance | Mistake #13 |
| `unauthorizedOnClientConfigSupported` | `true` | Return proper 401 for non-existent DCR clients (RFC 7592) | Mistake #11 |
| `idTokenReissuable` | `true` | Enable ID token reissuance during refresh token flow (OIDC Core §12.2) | Mistake #16 |
| `clientIdMetadataDocumentSupported` | `false` | Enable OAuth Client ID Metadata Document (CIMD) — allows HTTPS URLs as client_id with auto-fetched metadata. Set `true` only if targeting MCP or CIMD-aware ecosystems. | CIMD spec |

**Brazil-specific flags** (set only if targeting Brazil's API ecosystem):

| Flag | Recommended | Rationale |
|------|------------|-----------|
| `dcrDuplicateSoftwareIdBlocked` | `true` | Reject DCR with duplicate `software_id` (Brazil local rule) |
| `frontChannelRequestObjectEncryptionRequired` | `true` | Encrypt front-channel request objects |
| `requestObjectEncryptionAlgMatchRequired` | `true` | Enforce `alg` match in encrypted request objects |
| `requestObjectEncryptionEncMatchRequired` | `true` | Enforce `enc` match in encrypted request objects |

### Token endpoint action coverage

The token controller (`src/controllers/token.controller.ts`) handles every Authlete action value.

| Action | Behavior |
|--------|----------|
| `BAD_REQUEST` | 400 with response content |
| `INVALID_CLIENT` | 401 (with Basic auth) or 400 |
| `INTERNAL_SERVER_ERROR` | 500 |
| `JWT_BEARER` | Verify JWT bearer assertion, return token |
| `OK` | 200 with access token |
| `PASSWORD` | Local credential validation → `token.issue()` or `token.fail()` |
| `TOKEN_EXCHANGE` | Create exchanged token via token management API |
| `ID_TOKEN_REISSUABLE` | Reissue ID token during refresh flow → `token.issue()` |
| `default` | 500 (logged as unknown action) |

## Security-critical surfaces

Changes here decide whether a token is issued, to whom, and on what proof. A wrong edit is a
security bug, not a rendering glitch — and because this repo teaches OAuth, it also propagates
into other people's mental models. Treat these as review-before-edit, **regardless of diff size**:
a one-line change to token issuance outweighs a large one anywhere else.

| Concern | Files |
|---------|-------|
| Token issuance | `services/token.service.ts`, `controllers/token.controller.ts`, `services/token.operations.service.ts`, `controllers/token.management.controller.ts`, `controllers/token-exchange-response.handler.ts` |
| Client authentication | `utils/basic-auth.ts`, `services/par.service.ts`, `middleware/require-basic-auth.ts` |
| DPoP / proof-of-possession | `utils/dpop.ts`, `client/src/services/dpop.service.ts` |
| Authorization & consent | `services/authorization.service.ts`, `controllers/authorization.controller.ts`, `controllers/session.controller.ts` (ACR / `auth_time` binding), `utils/validate.ts` |
| Token presentation & introspection | `services/userinfo.service.ts`, `services/introspection.service.ts`, `controllers/introspection.controller.ts` |
| Access control | `middleware/require-grant-ownership.ts`, `middleware/csrf.ts` |

Paths are under `server/src/` unless noted. **Not** on this list, despite living in the same
directories: `metrics`, `health`, `discovery`, `jwks`, `federation`, `vci`, `hsk` — ordinary changes
there need no special ceremony.

Two rules learned the hard way:

- **Size is not the trigger; the concern is.** Judging by diff size is how a "3-line cleanup" to
  `token.service.ts` turned out to change three behaviours, one of which altered how a malformed
  `Authorization` header interacts with body credentials.
- **A change described in an earlier plan's follow-up section is not an approved change.** A
  follow-up note is a pointer to work, not a reviewed design.

### Deliberate defects — do not "fix" these without updating the curriculum

Some behaviour in this repo is **intentionally wrong** because a module teaches it. Fixing it silently
breaks a lab, and nothing in the build or test suites will tell you: labs are prose. This already
happened once — pinning the SDK to 1.0.0 fixed a schema bug that Module 06's gate was built on, and the
gate had to be rebuilt.

| File | Deliberate gap | Taught by | Locked by |
|------|----------------|-----------|-----------|
| `controllers/token-exchange-response.handler.ts:29-34` | Drops `resources`, `audiences`, `actorToken`, `requestedTokenType`; passes no lifetime. So `resource`/`audience` do not audience-restrict, `actor_token` downgrades delegation to impersonation, and tokens live 24h | Module 06 Exercise 6b | `tests/unit/controllers/token-exchange-response.handler.test.ts` |
| same, response at `:48-55` | Omits `issued_token_type` (RFC 8693 §2.2.1 **REQUIRED**); emits non-spec `client_id`/`subject` | Module 06 Exercise 6a | same |
| same, `:27` | `result.subject \|\| subjectToken` puts a live access token in an identity field when Authlete resolves no subject | Module 06 Exercise 6c | same |

The characterization test asserts the current behaviour and names the docs to update, so a change fails
loudly instead of rotting a lab. If you change any of these on purpose, update Module 06's lab and
quiz-answers, `docs/TOKEN-EXCHANGE-TUTORIAL.md` (Part 12 and Parts 7/9/11), and the `PROGRESS.md` Build
Log.

**After any change to server behaviour**, grep the curriculum for the symptom you changed —
`grep -rn "<the error string>" docs/curriculum/modules` — before assuming nothing else is affected.

## DPoP & Client Auth

- **DPoP proof signature format**: For ES256, the JWS signature must be raw IEEE P1363 R||S concatenation (64 bytes for P-256), **not** DER-encoded. The `crypto.subtle.sign()` returns raw R||S natively. Using DER encoding causes `"invalid_dpop_proof: Signed JWT rejected: Invalid signature"`. See `client/src/services/dpop.service.ts:95-101`.
- **DPoP proof `ath` claim (not `sub`)**: Per RFC 9449 §4.3, when a DPoP proof is used with an access token (resource access), the payload MUST contain `ath` (base64url-encoded SHA-256 hash of the access token), **not** `sub`. Using `sub` causes the server to reject the proof or ignore the binding. The `computeAth()` function computes the hash correctly. See `client/src/services/dpop.service.ts:81-83`.
- **DPoP proof JWT header**: Per RFC 9449 §2.1, the JOSE header MUST include the `jwk` member with the public key. The `kid` parameter alone is insufficient. Without `jwk`, Authlete returns `"The DPoP header did not include a public key in JWK format."`. See `client/src/services/dpop.service.ts:89`.
- **Client auth for DCR confidential clients**: Authlete defaults DCR-created confidential clients to `CLIENT_SECRET_POST` even when the service's `supportedTokenAuthMethods` lists only `CLIENT_SECRET_BASIC`. Token exchange requests must send `client_id` and `client_secret` in the URL-encoded body, not as `Authorization: Basic`. Using Basic auth produces `"The client authentication method is 'client_secret_post' but the request does not include a client secret."`. The SPA callback must persist `client_secret` to `sessionStorage` before the auth redirect. See `client/src/pages/CallbackPage.tsx:72-90`, `client/src/components/auth/AuthFlowsSection.tsx:112`.
- **PAR client authentication has two channels, and Authlete checks which one you used** (verified 2026-08-05 against a `CLIENT_SECRET_BASIC` client). `par.service.ts` picks the channel from how the caller presented the credentials and must never guess:

  | Caller sends | → Authlete request | Serves |
  |---|---|---|
  | `Authorization: Basic` | top-level `clientId`/`clientSecret`; `parameters` untouched | `CLIENT_SECRET_BASIC` |
  | body `clientId`+`clientSecret` | merged into `parameters` via `appendToParams` | `CLIENT_SECRET_POST` |
  | body `clientId` only | `client_id` in `parameters` | `none` (public) |

  Basic wins if both are present, matching `token.service.ts`. Getting it wrong is a 401 in both directions: creds-in-`parameters` for a Basic client gives `[A157357] The client identifier is not found at the expected location`, and Basic for a POST client gives `The client authentication method is 'client_secret_post' but the request does not include a client secret`. Header decoding uses `parseBasicAuth` (`src/utils/basic-auth.ts`), which splits on the **first** colon only so a secret may contain colons. **Known gap:** `clientCertificate`, `oauthClientAttestation` and `oauthClientAttestationPop` are accepted by Authlete's `/pushed_auth_req` but not forwarded — no client here uses them, so they are unverifiable end-to-end.
- **`parseBasicAuth` (`src/utils/basic-auth.ts`) is the only Basic-auth decoder for OAuth client credentials** — used by both `token.service.ts` and `par.service.ts`. It splits on the first colon (a secret may contain colons), treats the scheme case-insensitively per RFC 9110 §11.1, and returns `undefined` rather than partial credentials when the payload has no colon, so a malformed header cannot clobber body-supplied `clientId`/`clientSecret`. Do not hand-roll `authorization.split(":")` again. `require-basic-auth.ts` stays separate on purpose: it validates *this deployment's* management credentials with `timingSafeEqual`, which is a different job from decoding a client's.
- **DPoP nonce flow**: Nonces are OPTIONAL (controlled by `dpopNonceRequired`). First request without nonce → 401 `use_dpop_nonce` error + `DPoP-Nonce` header. Client retries with nonce. Expired nonce → 401 `invalid_dpop_proof` + new nonce. Token/PAR endpoints can return nonce on success; protected resource endpoints return it only on error per RFC 9449. See `docs/FAPI-TUTORIAL.md`.
- **Presenting an access token at a protected resource (RFC 6750 §2, RFC 9449 §7)**: `UserInfo` is this repo's
  only protected resource, and all token-presentation parsing lives in `server/src/utils/dpop.ts` —
  `extractAccessToken()`, `dpopHttpTarget()`, `authChallenge()`, `isTokenPresentationError()`. Use these rather
  than re-deriving a token from the `Authorization` header.
  - **Both schemes, case-insensitively.** `Bearer` (RFC 6750 §2.1) and `DPoP` (RFC 9449 §7.1); RFC 9110 §11.1
    makes auth-scheme case-insensitive. An unrecognised scheme yields "no token presented", never a token.
  - **`DPoP` is mandatory for a bound token.** RFC 9449 §7.1 — a DPoP-bound token *"is sent using the
    `Authorization` request header field… with an authentication scheme of `DPoP`"*. There is no alternative.
  - **§7.2 downgrade is enforced by Authlete, verified 2026-08-04.** `Bearer <dpop-bound-token>` with no proof
    → Authlete `401 [A089311] Expected a DPoP header but none was provided.`, and its challenge already
    carries the `DPoP` scheme plus an accurate `algs` list. Do **not** hand-write a DPoP challenge on paths
    where Authlete answers; forward `responseContent` verbatim. `UserinfoResponse` exposes no `cnf`, so the
    server cannot detect the downgrade locally — this compliance is delegated by design.
  - **`Bearer` + a `DPoP` header → 400 `invalid_request`, rejected locally.** Honouring the proof would make
    `Bearer` a working route for bound tokens (the §7.2 downgrade); silently dropping it would report "no DPoP
    header provided" to a client that plainly sent one.
  - **`DPoP` scheme + no proof header → 401 `invalid_dpop_proof`, rejected locally**, before any Authlete call.
  - **Server-determined fields never come from the body.** `token`, `dpop`, `htm`, `htu`, `targetUri` and
    `clientCertificate` are set from HTTP context only — the same rule `introspection.service.ts` follows.
    Spreading `req.body` into the Authlete request let a client choose the `htu` its own proof was validated
    against, making a proof captured at another endpoint replayable (verified: a proof minted for `/api/par`
    returned `200` at `/api/userinfo`). Only `access_token` is read from a form body, per RFC 6750 §2.2.
  - **`htu` excludes the query and fragment** (RFC 9449 §4.2); the full request URI goes in `targetUri`. The
    Authlete SDK documents exactly this split. Sending the query string as `htu` broke any request with one.
  - **No query-parameter tokens.** RFC 6750 §2.3 is not implemented: RFC 9700 §4.3.2 (BCP 240) says *"Clients
    MUST NOT pass access tokens in a URI query parameter"*.
  - **A `DPoP` scheme on an *unbound* token succeeds** (verified) — the token has no `cnf`, so there is no
    binding to check and the proof is decorative. Proof-of-possession comes from `cnf.jkt` on the token, not
    from the scheme the caller chose. Never treat "the request used DPoP" as evidence of sender-constraint.
- **RFC 9470 Step-Up Authentication**: The server binds `acr` and `auth_time` to JWT access tokens during authorization. On login, `session.controller.ts` records the satisfied ACR ("pwd" for password) and `authTime` (epoch seconds), then checks Authlete's `acrs`/`acrEssential`/`maxAge` requirements. If ACR doesn't match and `acrEssential` is true, the authorization fails with `ACR_NOT_SATISFIED`. If `maxAge` is exceeded, fails with `EXCEEDS_MAX_AGE`. The `stepUp` object in session (`{ acr, authTime }`) is passed to Authlete's `/auth/authorization/issue` API via `authorization.service.ts`. The introspection controller (`introspection.controller.ts:47`) parses Authlete's `WWW-Authenticate` header for `insufficient_user_authentication` and returns structured JSON with `acr_values`/`max_age` for the client to re-authorize. The client UI includes a **Step-Up Auth** section (`StepUpSection.tsx`) that tests the full flow. See `docs/STEP-UP-AUTH-TUTORIAL.md`.

## Quirks & gotchas

- **`validateAuthorizationParams` (`src/utils/validate.ts`) checks `client_id` and nothing else — deliberately.** `client_id` is the only parameter required in every request shape: plain (RFC 6749 §4.1.1), PAR (RFC 9126), and JAR (RFC 9101 §5, *"REQUIRED … MUST match the request or request_uri Request Object's client_id"*). Everything else is shape-dependent and belongs to Authlete. Do **not** reintroduce a per-shape allowlist: the previous version demanded `response_type` + `redirect_uri` unless `request_uri` was present, which (a) refused the canonical JAR shape (`client_id` + `request`, everything else inside the signed object) with `Missing required parameter: response_type` before Authlete saw it, (b) required `redirect_uri` even though RFC 6749 §3.1.2.3 makes it optional when exactly one full URI is registered, and (c) answered `400 {json}` where RFC 6749 §4.1.2.1 wants an error redirect. Sibling validators `validateTokenParams` (`grant_type`) and `validateIntrospectionParams` (`token`) are correct as-is — those parameters *are* unconditionally required (RFC 6749 §4, RFC 7662 §2.1) — so the same bug class does not apply to them.
- **Authlete's authorization-error channel splits on `response_type`** (verified 2026-08-04). With `response_type` present and some other parameter invalid → `302` to the redirection URI carrying `error`, `state` and `iss`, per RFC 6749 §4.1.2.1 and RFC 9207. With `response_type` **absent** → `400 [A009301]` as a body, because without it the AS cannot determine the response mode and so cannot shape a redirect. Vendor behavior, not configurable here; do not "fix" the local validator to paper over it.
- `server/tsconfig.json` uses `module: "node16"` + `moduleResolution: "node16"` — dynamic imports need `.js` extension
- Build copies `public/` and `src/views/` into `dist/` via `postbuild` script (`rm -rf dist/views dist/public && cp -r src/views dist/views && cp -r public dist/public`). The destructive copy prevents nested `dist/views/views/` on subsequent rebuilds. If you rename/move these directories, update the script.
- All Authlete API calls go through the SDK client in `src/services/authlete.service.ts` — do not add raw `fetch()` calls. **`backchannel-logout.service.ts` is the sole remaining exception**, and only because the SDK exposes no backchannel logout token API (re-verified against 1.0.0). Before writing a `fetch()`, check the SDK first — `health.service.ts` carried one for `GET /api/lifecycle/healthcheck` until 1.0.0 added `lifecycle.getApiLifecycleHealthcheck()`
- The `server/logs/` directory is gitignored (except `.gitkeep`)
- **SDK is pinned to the exact version `@authlete/typescript-sdk@1.0.0` — no caret, and this is deliberate.** `1.1.5`/`1.1.6` are numerically *higher* but are **older code**: Speakeasy auto-versioning ran the package up to 1.1.6 in Nov 2025, upstream then restarted at `0.0.1-beta`, and on 2026-04-08 hand-set the version back to a stable `1.0.0` (commit *"Promote SDK to stable v1.0.0 and align Speakeasy config"*, `versioningStrategy: automatic` → `manual`), published 2026-04-09 as npm's `latest`. Widening this to `^1.0.0` resolves *up* to 1.1.6 and silently reintroduces three bugs — see `docs/DEVELOPMENT.md` → SDK Version Pin. A Dependabot `ignore` rule in `.github/dependabot.yml` blocks that "upgrade". **GitHub's releases page shows v1.1.6 as "Latest" — ignore it**: every later release is flagged `prerelease=true` and the Apr 2026 stable 1.0.0 got no GitHub release at all, so the badge is stale metadata, not currency.
- The repo previously carried `patches/@authlete+typescript-sdk+1.1.6.patch` via `patch-package`. **It is gone, and must not come back** — all three of its fixes are native to 1.0.0 (verified against `openapi-spec`).
- `dotenv` only loaded in `app.config.ts` (was duplicated in `authlete.config.ts`)
- All logging uses `const log = req.logger || logger;` — `CallableLogger` is callable + has `.error()`, `.warn()`, `.child()`
- No hardcoded credentials in source — login template passes empty strings
- Login page credentials moved to env var `AUTH_USERS` (defaults to `admin:password` demo user)
- **`server/coverage/`** is gitignored — generated report dir
- **`crypto.ts`** (`server/src/utils/crypto.ts`) was deleted — unused. The client-side `pkce.ts` handles PKCE
- **CSRF force-save**: `req.session.save()` is called explicitly in `csrf.ts` because express-session with `resave:false` + `saveUninitialized:false` does not autosave new sessions even when modified. Without this, the CSRF token generated on GET is lost before POST, causing a 403 mismatch.
- **Controller tests** (under `tests/unit/controllers/`) use `vi.hoisted()` to set up mutable mocks for config-dependent behavior
- **Supertest 7.2.2 bug**: `_attachCookies` throws `Invalid URL` on relative URL redirects with JSON chars. Workaround: avoid browser-flow tests or use `request` (non-agent)
- **Request object E2E test** creates ephemeral DCR client (deleted in `afterAll`). Guarded by `hasManagement`
- **Authlete rate limit**: ~15+ token calls in short window → 429; E2E tests accept 429 as valid
- **`requireBasicAuth`** checks `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` and **fails closed** — if either is unset, every management route returns 401 (it previously allowed all requests). Uses `timingSafeEqual` and splits the Basic payload on the first colon only, so a secret may contain colons
- **CIMD (Client ID Metadata Document)**: Authlete handles CIMD entirely server-side — when `clientIdMetadataDocumentSupported: true`, an HTTPS URL as `client_id` triggers automatic metadata fetch and client registration. No new endpoints or client code needed. Surfaced in FAPI config/status endpoints and client UI. [CIMD spec](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
