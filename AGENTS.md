# AGENTS.md — authlete-node-authz-server

## Repo structure

Two independent packages in `server/` and `client/`. No monorepo tooling — use `--prefix` or `cd`.

| Directory | What                      | Entrypoint                |
|-----------|---------------------------|---------------------------|
| `server/` | Express + Authlete SDK    | `src/server.ts`           |
| `client/` | React OAuth debugger (Vite + SWC) | `src/main.tsx`      |
| root      | Docker Compose            | `docker-compose.yml`      |

## Commands

```bash
# Server dev (ts-node-dev --respawn --transpile-only, no build needed)
npm --prefix server run dev

# Server production build + start
npm --prefix server run build && npm --prefix server run start

# Server tests
npm --prefix server run test              # unit + integration (316 tests, 43 files)
npm --prefix server run test:watch        # watch mode
npm --prefix server run test:coverage     # run with coverage report
npm --prefix server run test:unit         # unit tests only (247 tests, 39 files)
npm --prefix server run test:integration  # integration tests only (23 tests)
npm --prefix server run lint               # ESLint (flat config, 0 errors/warnings)
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
- 16 Authlete-dependent services accept `authleteApi` as optional constructor param (defaults to real SDK client)
- 3 services using raw `fetch()` (`health`, `backchannel-logout`, `metrics`) accept config as optional constructor param
- `app.ts` exports `createApp()` factory — tests build fresh app instances without `listen()`
- Integration tests use `vi.hoisted()` + `vi.mock()` to replace `authlete.service` module at import time
- Mock API defined in `tests/helpers/mock-authlete.ts` covers every SDK method
- **Unit tests**: 39 files across 5 categories (247 tests):
  - `tests/unit/services/` — 21 files (86 tests), each service in isolation with mocked SDK (includes consent-store, device, hsk, metrics, par)
  - `tests/unit/controllers/` — 6 files (60 tests), token/authorization/authorization-fail-response/DCR/backchannel-logout/device
  - `tests/unit/middleware/` — 4 files (28 tests), error handler, session, audit-log, csrf
  - `tests/unit/utils/` — 4 files (22 tests), createLocalJWT/jwksClient/validate/validation
  - `tests/unit/routes/` — 2 files (24 tests), metrics routes + openapi routes
- **Integration tests**: 1 file `tests/integration/routes.test.ts` (31 tests) — full Express stack with mocked SDK
- **E2E tests**: 1 file `tests/e2e/e2e.test.ts` (100 tests) — real Authlete API, 26 section headers fixed for sequential numbering
- Run with `npm --prefix server run test` — 316 tests across 43 files, completes in ~2s
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
- Admin token management under `/api/token/*` requires Basic auth with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` if set
- Grant Management API at `/api/gm/:grantId` (GET=query, DELETE=revoke) delegates to `authleteApi.grantManagement.processRequest()`. Bearer token required. Spec-compliant with [Grant Management for OAuth 2.0](https://openid.net/specs/oauth-v2-grant-management.html).
- Client SPA stores tokens in sessionStorage via React Context (`src/context/TokenContext.tsx`)
- **Prometheus metrics**: `GET /metrics` and `GET /api/metrics` — tracks HTTP request duration (histogram) + total (counter) via `prom-client` + `collectDefaultMetrics`. Labels: `method`, `route`, `status`. See `src/services/metrics.service.ts` and `src/middleware/metrics.ts`.
- **Audit logging**: Winston daily-rotate-file logger at `logs/audit-*.log` (90-day retention). Captures `reqId`, method, path, status, duration, IP, user-agent, `user`, `clientId`. Records client identity from Basic auth headers. See `src/utils/audit-logger.ts` and `src/middleware/audit-log.ts`.
- **Rate limiting**: `tokenLimiter` (20/min, skips Basic auth), `authLimiter` (60/min), `loginLimiter` (5/min), `generalLimiter` (60/min). See `src/middleware/rate-limit.ts`.
- **Brute-force protection**: 5 failed logins/IP → 60s ban. In-memory Map, cleared on success. See `src/middleware/rate-limit.ts`.
- **Health endpoints**: `GET /api/health` (server liveness — status, uptime, timestamp), `GET /api/health/authlete` (Authlete connectivity check, `?extended=true` for DB), `GET /api/health/all` (aggregate: redis + authlete). The client SDA polls `/api/health` every 30s for a live server-status indicator in the header. See `src/services/health.service.ts`, `client/src/hooks/useServerStatus.ts`.
- **Graceful shutdown**: `SIGTERM`/`SIGINT` handlers close Redis then HTTP server. See `src/server.ts`.
- **OpenAPI spec**: `GET /api/openapi.json` — comprehensive 3.0.3 spec covering all endpoints. See `src/routes/openapi.routes.ts`.
- **Persistent consent**: In-memory Map with 24h TTL (`src/services/consent-store.service.ts`). Scoped by `{clientId}:{subject}`. Auto-approves if stored scopes cover requested scopes; `prompt=consent` bypasses.
- **Token management admin routes**: `/api/token/{list,create,delete/:id,update,revoke,reissue,createLocalToken}`. Protected by `requireBasicAuth` using `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`. See `src/routes/token.routes.ts` and `src/controllers/token.management.controller.ts`.
- **Backchannel Logout**: Three POST endpoints at `/api/backchannel_logout/{issue,deliver,deliver-all}`. The Authlete SDK v1.1.6 does NOT expose the backchannel logout token API — raw `fetch()` to Authlete is used in `backchannel-logout.service.ts`. All three endpoints require admin Basic auth (`requireBasicAuth`). The existing `GET /api/logout?backchannel=true` triggers deliver-all server-side after session destruction. The receiving endpoint at `POST /api/backchannel_logout` (in `logout.routes.ts`) handles incoming logout tokens from other OPs — properly destroys `req.session`.
- **Dynamic Client Registration (DCR)**: Four POST endpoints at `/api/client/dcr/{register,get,update,delete}`. Delegates to `authleteApi.dynamicClientRegistration.*` (SDK v1.1.6 includes these natively). `register` requires admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`); `get`/`update`/`delete` use the registration access token in the request body (no admin auth). The `action` field in Authlete's response is mapped to HTTP status: `CREATED`→201, `OK`/`UPDATED`→200, `DELETED`→204, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500. The `responseContent` field is returned as the response body. See `DcrSection.tsx` in the client for the testing UI.
- **CIBA (Client-Initiated Backchannel Authentication)**: Four POST endpoints at `/api/ciba/{authentication,issue,fail,complete}`. Delegates to `authleteApi.ciba.*` (backchannel authentication, issue, fail, complete). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body (passed to Authlete). The authentication endpoint receives URL-encoded `parameters` (containing `login_hint`, `scope`, etc.) plus `clientId`/`clientSecret`. It returns `USER_IDENTIFICATION` → 200 with `ticket`, `hintType`, `hint`, `deliveryMode`; or error statuses (500, 400, 401). The `issue` endpoint takes a `ticket` and returns `OK` → 200 with `authReqId`, `expiresIn`, `interval`. The `fail` endpoint takes `ticket` + `reason` and returns `FORBIDDEN` → 403, `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500. The `complete` endpoint takes `ticket` + `result` + `subject` and returns `NO_ACTION`→200 (poll mode) or `NOTIFICATION`→200 (ping/push mode). See `CibaSection.tsx` in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:openid:params:grant-type:ciba` — no custom token endpoint needed for the polling phase.
- **PAR (Pushed Authorization Requests — RFC 9126)**: Single POST endpoint at `/api/par`. Delegates to `authleteApi.pushedAuthorization.*` (SDK v1.1.6 includes this natively). Accepts `parameters` (URL-encoded OAuth params), `clientId`, `clientSecret` in JSON body. No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body. Action mapped to HTTP status: `CREATED`→201, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `FORBIDDEN`→403, `PAYLOAD_TOO_LARGE`→413, `INTERNAL_SERVER_ERROR`→500. The response includes `requestUri` (the `request_uri` for the authorization call), `responseContent` (JSON with `expires_in`, `request_uri`). See `ParSection.tsx` in the client for the testing UI.
- **HSK (Hardware Security Keys)**: Four endpoints at `/api/hsk/{create,get/:handle,delete/:handle,list}`. Delegates to `authleteApi.hardwareSecurityKeys.*` (SDK v1.1.6 includes natively). All endpoints require admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`). Create accepts `kty`, `use`, `kid`, `hsmName`, `alg` in JSON body; requires `kty` and `hsmName`. Action mapping: `SUCCESS`→201 (create) / 200 (get/list) / 204 (delete), `INVALID_REQUEST`→400, `NOT_FOUND`→404, `SERVER_ERROR`→500. Get/delete use `:handle` route param. List returns all keys. See `src/services/hsk.service.ts`, `src/controllers/hsk.controller.ts`, `src/routes/hsk.routes.ts`.
- **Device Flow (RFC 8628)**: Three POST API endpoints at `/api/device/{authorization,verification,complete}` plus three browser paths at `/device` (GET show form, POST verify code, POST /device/consent authenticate+complete). Delegates to `authleteApi.deviceFlow.*` (SDK v1.1.6 includes natively). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body. The authorization endpoint validates `parameters` is present and returns `OK` → 200 with `deviceCode`, `userCode`, `verificationUri`, `expiresIn`, `interval`. The verification endpoint returns `VALID` → 200, `NOT_EXIST` → 404, `EXPIRED` → 400. The complete endpoint returns `SUCCESS` → 200, `ACCESS_DENIED` → 403, `USER_CODE_NOT_EXIST` → 404, `USER_CODE_EXPIRED` → 400. Service must have `supportedGrantTypes` including `DEVICE_CODE`, plus `deviceAuthorizationEndpoint`, `deviceVerificationUri`, `deviceFlowCodeDuration`, and `deviceFlowPollingInterval` configured. See `DeviceSection.tsx` in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:ietf:params:oauth:grant-type:device_code` — no custom token endpoint needed for polling.
- **VCI (Verifiable Credential Issuance — OID4VCI)**: 9 API endpoints + `/.well-known/openid-credential-issuer` (OID4VCI 1.0 Final). Three auth categories: (1) **Discovery** (metadata, jwtissuer, jwks, well-known) — public GET; (2) **Offers** (offer/create, offer/info) — admin Basic auth; (3) **Credential** (credential/issue, credential/batch, deferred/issue) — access token via `Authorization: Bearer` header or body. Action→status: discovery `OK`→200/`NOT_FOUND`→404; offer `CREATED`→201/`FORBIDDEN`→403/`CALLER_ERROR`→400/`AUTHLETE_ERROR`→500; issue `OK`→200/`ACCEPTED`→202; batch `OK`→200; deferred `OK`→200/`ACCEPTED`→202. Files: `vci.service.ts`, `vci.controller.ts`, `vci.routes.ts` in server; `VciSection.tsx` in client.

## Client SPA architecture

- **Routing**: React Router v6 with lazy-loaded sections, map-based route resolution via `sectionComponents` record in `App.tsx`. Typed `Section` and `SectionGroup` interfaces.
- **Sections**: 12 sections organized in 3 sidebar groups — OAuth 2.0 (Grant Flows, Token Operations, Logout), OIDC & Extensions (DCR, CIBA, PAR, Device Flow, Backchannel Logout, Discovery), Admin (Token Management, Client Management, Grant Management, Health Check).
- **Layout**: Sticky 48px header with AppLayout, collapsible mobile nav, 56px sidebar (desktop only). Backdrop blur on header. Grouped sidebar with lucide icons and active-state shadows.
- **Components**: Organized into `components/layout/` (AppLayout, Sidebar, SectionPanel, ErrorBoundary, AdminAuth), `components/auth/` (AuthFlowsSection), `components/oidc/` (8 OIDC/OAuth section components), `components/admin/` (4 admin section components), `components/fapi/` (FapiSection — FAPI config/status + DPoP key tools + 4-step Test Flow wizard), `components/ui/` (Button, Input, Select, Textarea, Badge, Card, TabBar, Spinner, Skeleton, FlowDiagram, SplitPane, RequestBuilder, TokenVault, JsonBlock, HelpPopover, OperationDescription).
- **Server status indicator**: `useServerStatus` hook (in `hooks/`) polls `GET /api/health` every 30s (10s retry on failure, 5s timeout). Color-coded badge in header: green=connected, red=offline, yellow pulse=checking. Hover shows uptime.
- **Hooks**: `useApi`, `useAsyncCall`, `useClipboard`, `useLocalStorage`, `useServerStatus` in `hooks/`.
- **Services**: Organized by domain in `services/` — `token.service.ts`, `admin.service.ts`, `client.service.ts`, `dcr.service.ts`, `ciba.service.ts`, `par.service.ts`, `device.service.ts`, `grant.service.ts`, `backchannel-logout.service.ts`, `health.service.ts`. Shared HTTP utilities in `http.ts`. All exported from `services/index.ts`.
- **Config**: `config.ts` reads `VITE_*` env vars at build time, provides per-environment overrides via `PROD_CONFIG` + `getApiBaseUrl()`/`getRedirectUri()`. Separate `HEALTH_ENDPOINT` for the live status polling.
- **Token storage**: `TokenContext` (React Context API) persists tokens in `sessionStorage`. TokenVault in sidebar displays/copies/decodes stored tokens. Cleared on explicit action or tab close.
- **Test framework**: Vitest with 17 test files across `test/components/ui/`, `test/hooks/`, `test/services/`, `test/utils/`. Runs with `npm --prefix client run test`.
- **Styling**: Tailwind CSS v4 via `styles/globals.css`. Dark palette (slate-900/950), Inter + JetBrains Mono fonts, custom scrollbar, grid background utility.

## Authlete service configuration

The Authlete service (configured via the [Authlete web console](https://console.authlete.com/)) controls most OAuth/OIDC spec behavior through boolean flags. These flags map directly to lessons learned from real-world spec implementation mistakes documented in [this article](https://darutk.medium.com/oauth-oidc-mistakes-7f3bb909518b).

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

## DPoP & Client Auth

- **DPoP proof signature format**: For ES256, the JWS signature must be raw IEEE P1363 R||S concatenation (64 bytes for P-256), **not** DER-encoded. The `crypto.subtle.sign()` returns raw R||S natively. Using DER encoding causes `"invalid_dpop_proof: Signed JWT rejected: Invalid signature"`. See `client/src/services/dpop.service.ts:95-101`.
- **DPoP proof `ath` claim (not `sub`)**: Per RFC 9449 §4.3, when a DPoP proof is used with an access token (resource access), the payload MUST contain `ath` (base64url-encoded SHA-256 hash of the access token), **not** `sub`. Using `sub` causes the server to reject the proof or ignore the binding. The `computeAth()` function computes the hash correctly. See `client/src/services/dpop.service.ts:81-83`.
- **DPoP proof JWT header**: Per RFC 9449 §2.1, the JOSE header MUST include the `jwk` member with the public key. The `kid` parameter alone is insufficient. Without `jwk`, Authlete returns `"The DPoP header did not include a public key in JWK format."`. See `client/src/services/dpop.service.ts:89`.
- **Client auth for DCR confidential clients**: Authlete defaults DCR-created confidential clients to `CLIENT_SECRET_POST` even when the service's `supportedTokenAuthMethods` lists only `CLIENT_SECRET_BASIC`. Token exchange requests must send `client_id` and `client_secret` in the URL-encoded body, not as `Authorization: Basic`. Using Basic auth produces `"The client authentication method is 'client_secret_post' but the request does not include a client secret."`. The SPA callback must persist `client_secret` to `sessionStorage` before the auth redirect. See `client/src/pages/CallbackPage.tsx:72-90`, `client/src/components/auth/AuthFlowsSection.tsx:112`.
- **PAR `client_secret` in parameters**: For `CLIENT_SECRET_POST` clients, `client_secret` must be merged into the `parameters` string, not sent as a separate JSON field. Authlete's PAR API only recognizes client credentials inside the `parameters` string for `CLIENT_SECRET_POST`. See `server/src/services/par.service.ts:29-34`.
- **DPoP nonce flow**: Nonces are OPTIONAL (controlled by `dpopNonceRequired`). First request without nonce → 401 `use_dpop_nonce` error + `DPoP-Nonce` header. Client retries with nonce. Expired nonce → 401 `invalid_dpop_proof` + new nonce. Token/PAR endpoints can return nonce on success; protected resource endpoints return it only on error per RFC 9449. See `docs/FAPI-TUTORIAL.md`.

## Quirks & gotchas

- `server/tsconfig.json` uses `module: "node16"` + `moduleResolution: "node16"` — dynamic imports need `.js` extension
- Build copies `public/` and `src/views/` into `dist/` via `postbuild` script (`rm -rf dist/views dist/public && cp -r src/views dist/views && cp -r public dist/public`). The destructive copy prevents nested `dist/views/views/` on subsequent rebuilds. If you rename/move these directories, update the script.
- All Authlete API calls go through the SDK client in `src/services/authlete.service.ts` — do not add raw `fetch()` calls
- The `server/logs/` directory is gitignored (except `.gitkeep`)
- SDK at `@authlete/typescript-sdk@^1.1.6` with `patches/@authlete+typescript-sdk+1.1.6.patch` — `clientCreate.js` accepts `[200, 201]` because Authlete returns 201 for created resources (SDK bug); `postinstall` applies via `patch-package`
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
- **`requireBasicAuth`** checks `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`; if unset, all management routes are unprotected
