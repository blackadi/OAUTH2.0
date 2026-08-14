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
npm --prefix server run test              # unit + integration (939 tests, 69 files)
npm --prefix server run test:watch        # watch mode
npm --prefix server run test:coverage     # run with coverage report
npm --prefix server run test:unit         # unit tests only (662 tests, 62 files)
npm --prefix server run test:integration  # integration tests only (277 tests, 7 files)
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

> **Check which Authlete service you are pointed at before trusting anything.** On 2026-08-14 the public
> deployment turned out to be using a **different service** from the one the entire RFC audit was conducted
> against — and the difference was material: the deployment's service had no RSA key (so no RS256/PS256) and
> no `private_key_jwt`, both of which Tier 1 had "shipped". Three signals gave it away, and any one of them
> is enough to check: the `issuer` string differed by a trailing slash, the endpoint hosts differed, and the
> discovery document had **59 members against 62**.
>
> **`3693555522` is canonical** (ruled 2026-08-14). Compare
> `GET /api/{serviceId}/service/configuration` against the document your deployment actually serves at
> `/.well-known/openid-configuration` — **reading either alone proves nothing about the other.**


1. Copy `.env.example` → `.env` in both `server/` and `client/`
2. Required env vars: `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID`, `SESSION_SECRET`
3. The `server` reads `.env` via `dotenv` (called in `src/config/app.config.ts` only)
4. Config validation fails fast on startup — missing `SESSION_SECRET`, `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, or `AUTHLETE_SERVICE_ID` throws immediately
5. Demo users default to `admin:password` if `AUTH_USERS` env var is not set. Set `AUTH_USERS=subject:username:password:name;sub2:user2:pass2:Name2` for custom users
6. Logout endpoint validates `post_logout_redirect_uri` by **parsed origin, exactly** — see the RP-Initiated Logout note under **Quirks & gotchas**. `LOGOUT_REDIRECT_URI` matches as a full URI; `ALLOWED_ORIGINS` entries match by origin. Prefix matching was an open redirect and is gone
7. Client `.env` should set `VITE_CLIENT_ID`, `VITE_REDIRECT_URI` — defaults to `your_client_id` placeholder
8. Optional Redis: `docker compose up -d` + set `REDIS_URL=redis://localhost:6379` in `server/.env`

## Testing architecture

- **Vitest** runner, **Supertest** for HTTP integration tests
- 17 Authlete-dependent services accept `authleteApi` as optional constructor param (defaults to real SDK client)
- 2 services using raw `fetch()` (`backchannel-logout`, `metrics`) accept config as optional constructor param. `health` used to be a third: SDK 1.0.0 exposes `lifecycle.getApiLifecycleHealthcheck()` for `GET /api/lifecycle/healthcheck`, so it now goes through the SDK like every other Authlete call. `backchannel-logout` still cannot — the SDK exposes no backchannel logout token API (re-verified against 1.0.0)
- `app.ts` exports `createApp()` factory — tests build fresh app instances without `listen()`
- Integration tests use `vi.hoisted()` + `vi.mock()` to replace `authlete.service` module at import time
- Mock API defined in `tests/helpers/mock-authlete.ts` covers every SDK method
- **Unit tests**: 62 files across 5 categories (662 tests):
  - `tests/unit/services/` — 25 files (163 tests), each service in isolation with mocked SDK (includes consent-store, device, hsk, metrics, par, userinfo). One file is a cross-service invariant rather than a service: `credential-logging.test.ts` asserts no request body reaches a log line (see **Quirks & gotchas**)
  - `tests/unit/controllers/` — 9 files (113 tests), token/authorization/authorization-fail-response/DCR/backchannel-logout/device/hsk/introspection/vci
  - `tests/unit/middleware/` — 6 files (60 tests), error handler, session, audit-log, csrf, require-basic-auth, require-grant-ownership (plus `development-only.ts`, covered via `tests/unit/routes/device.routes.test.ts`)
  - `tests/unit/utils/` — 8 files (125 tests), basic-auth/createLocalJWT/jwksClient/properties/validate/validation/dpop/verify-id-token-hint
  - `tests/unit/routes/` — 5 files, fapi + metrics + openapi + protected-resource-metadata + device routes
- **Integration tests**: 7 files (277 tests) — full Express stack with mocked SDK, via `createApp()`. `routes.test.ts` is the general one (49 tests); the other six were written to drain the route-coverage backlog and each drives one module's routes **through its middleware chain**, asserting the auth posture first: `client.routes.test.ts` (16 routes), `admin-surfaces.routes.test.ts` (token/HSK/federation/JAR/device-consent/health/route-index, 16), `vci.routes.test.ts` (10), `backchannel-logout.routes.test.ts` (4), `native-sso.routes.test.ts` (2), `root.routes.test.ts` (2). **Prefer adding to these over a new controller test** when the thing under test is a gate, a status mapping or a route parameter — a controller test calls the handler directly and cannot see any of it
- **E2E tests**: 1 file `tests/e2e/e2e.test.ts` (100 tests) — real Authlete API, 26 section headers fixed for sequential numbering
- Run with `npm --prefix server run test` — 939 tests across 69 files, completes in ~2s
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
- Grant Management API at `/api/gm/:grantId` (GET=query, DELETE=revoke) delegates to `authleteApi.grantManagement.processRequest()`. **`Bearer` or `DPoP` — it is a protected resource and follows the RFC 6750 §2 / RFC 9449 §7 rules above verbatim** (since 2026-08-13). **`requireGrantOwnership` (`middleware/require-grant-ownership.ts`) runs first**: it introspects the token and requires the grant it was issued under to equal `:grantId`, returning 403 otherwise — Authlete's `/gm` API validates the token but not who owns the grant, and its response carries no owner information. This is deliberately stricter than [Grant Management for OAuth 2.0](https://openid.net/specs/oauth-v2-grant-management.html): a client-credentials token has no grant, so machine-to-machine grant management is not supported. **The DPoP proof must reach both Authlete calls** — the ownership introspection *and* `/gm` — because each checks the binding independently; see the protected-resource bullets above.
- **The grant-management *authorization* side needs no server code, and it works** (verified end to end 2026-08-12, GM-W2). `grant_management_action` (`create`/`merge`/`replace`) and `grant_id` ride inside the opaque `parameters` string of an authorization request, Authlete processes them, and the resulting `grant_id` comes back in the token response — which `token.controller.ts:52` already forwards verbatim. So all five advertised actions are real: three are Authlete's on the authorization request, two are this server's management API. Do not schedule code for the first three.
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
- **Backchannel Logout**: Three POST endpoints at `/api/backchannel_logout/{issue,deliver,deliver-all}`. The Authlete SDK v1.0.0 does NOT expose the backchannel logout token API — raw `fetch()` to Authlete is used in `backchannel-logout.service.ts`. All three endpoints require admin Basic auth (`requireBasicAuth`). Carrying `backchannel=true` through RP-Initiated Logout triggers deliver-all server-side after session destruction — on the confirming **`POST /api/logout`**, not the `GET`, which only replays the parameter into the confirmation form (see the RP-Initiated Logout note under **Quirks & gotchas**). The receiving endpoint at `POST /api/backchannel_logout` (in `logout.routes.ts`) handles incoming logout tokens from other OPs. **It performs all of §2.6's eleven validation steps and terminates the *subject's* sessions** — see the note under **Quirks & gotchas**. Until 2026-08-13 this file claimed it *"properly destroys `req.session`"*: it did exactly that, and that was the bug.
- **Dynamic Client Registration (DCR)**: Four POST endpoints at `/api/client/dcr/{register,get,update,delete}`. Delegates to `authleteApi.dynamicClientRegistration.*` (SDK v1.0.0 includes these natively). `register` requires admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`); `get`/`update`/`delete` use the registration access token in the request body (no admin auth). The `action` field in Authlete's response is mapped to HTTP status: `CREATED`→201, `OK`/`UPDATED`→200, `DELETED`→204, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500. The `responseContent` field is returned as the response body. See `DcrSection.tsx` in the client for the testing UI.
- **CIBA (Client-Initiated Backchannel Authentication)**: Four POST endpoints at `/api/ciba/{authentication,issue,fail,complete}`. Delegates to `authleteApi.ciba.*` (backchannel authentication, issue, fail, complete). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body (passed to Authlete). The authentication endpoint receives URL-encoded `parameters` (containing `login_hint`, `scope`, etc.) plus `clientId`/`clientSecret`. It returns `USER_IDENTIFICATION` → 200 with `ticket`, `hintType`, `hint`, `deliveryMode`; or error statuses (500, 400, 401). The `issue` endpoint takes a `ticket` and returns `OK` → 200 with `authReqId`, `expiresIn`, `interval`. The `fail` endpoint takes `ticket` + `reason` and returns `FORBIDDEN` → 403, `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500. The `complete` endpoint takes `ticket` + `result` + `subject` and returns `NO_ACTION`→200 (poll mode) or `NOTIFICATION`→200 (ping/push mode). See `CibaSection.tsx` in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:openid:params:grant-type:ciba` — no custom token endpoint needed for the polling phase. **Recommended Authlete config:** Client Auth Method = `CLIENT_SECRET_BASIC` (per [Authlete CIBA guide](https://developers.authlete.com/guides/flows-and-protocols/grant-types-and-token-flows/how-to-implement-ciba-with-authlete)); backchannel auth endpoint and token endpoint must use the same client auth method. **That recommendation only became true on 2026-08-13** (CIBA-W3): `ciba.service.ts` read `clientId`/`clientSecret` from the JSON body and never looked at `Authorization: Basic`, so the very configuration this paragraph recommends could not authenticate. It now uses **the same three channels as `par.service.ts`** — see that table under *DPoP & Client Auth*; Basic wins if both are present. Verified live: a Basic-authenticated request reaches `USER_IDENTIFICATION`, and body credentials for that same `CLIENT_SECRET_BASIC` client now correctly earn `401 [A157357]` instead of being silently converted to the Basic channel. `appendToParams` moved to `utils/params.ts` and is shared by both services rather than copied. **6749-W1's dual-channel refusal is deliberately not applied here**: this endpoint takes a JSON body, so credentials never ride in a `rawBody` that reaches Authlete unmodified, and the ambiguous shape cannot arise. The SPA's CIBA section gained a **Client Auth Method** selector, matching `ParSection.tsx`.
- **PAR (Pushed Authorization Requests — RFC 9126)**: Single POST endpoint at `/api/par`. Delegates to `authleteApi.pushedAuthorization.*` (SDK v1.0.0 includes this natively). Accepts `parameters` (URL-encoded OAuth params), `clientId`, `clientSecret` in JSON body. No admin auth required. **Client authentication takes either an `Authorization: Basic` header (for `CLIENT_SECRET_BASIC` clients) or `clientId`/`clientSecret` body fields (for `CLIENT_SECRET_POST`)** — see the two-channel table under Quirks & gotchas; the SPA exposes this as a "Client Auth Method" selector in `ParSection.tsx`. Action mapped to HTTP status: `CREATED`→201, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `FORBIDDEN`→403, `PAYLOAD_TOO_LARGE`→413, `INTERNAL_SERVER_ERROR`→500. The response includes `requestUri` (the `request_uri` for the authorization call), `responseContent` (JSON with `expires_in`, `request_uri`). See `ParSection.tsx` in the client for the testing UI.
- **HSK (Hardware Security Keys)**: Four endpoints at `/api/hsk/{create,get/:handle,delete/:handle,list}`. Delegates to `authleteApi.hardwareSecurityKeys.*` (SDK v1.0.0 includes natively). All endpoints require admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`). Create accepts `kty`, `use`, `kid`, `hsmName`, `alg` in JSON body; requires `kty` and `hsmName`. Action mapping: `SUCCESS`→201 (create) / 200 (get/list) / 204 (delete), `INVALID_REQUEST`→400, `NOT_FOUND`→404, `SERVER_ERROR`→500. Get/delete use `:handle` route param. List returns all keys. See `src/services/hsk.service.ts`, `src/controllers/hsk.controller.ts`, `src/routes/hsk.routes.ts`.
- **Device Flow (RFC 8628)**: Three POST API endpoints at `/api/device/{authorization,verification,complete}` plus three browser paths at `/device` (GET show form, POST verify code, POST /device/consent authenticate+complete). Delegates to `authleteApi.deviceFlow.*` (SDK v1.0.0 includes natively). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body. Action→status mappings live in `device.controller.ts` and match the SDK's action enums exactly: authorization `OK`→200 (with `deviceCode`, `userCode`, `verificationUri`, `expiresIn`, `interval`) / `BAD_REQUEST`→400 / `UNAUTHORIZED`→401 / `INTERNAL_SERVER_ERROR`→500; verification `VALID`→200 / `NOT_EXIST`→404 / `EXPIRED`→400 / `INTERNAL_SERVER_ERROR`→500; complete `SUCCESS`→200 / `USER_CODE_NOT_EXIST`→404 / `USER_CODE_EXPIRED`→400 / `INVALID_REQUEST`→400 / `SERVER_ERROR`→500. **`ACCESS_DENIED` is a request `result` value, not a response action** — `DeviceCompleteRequestResult` is `{AUTHORIZED, ACCESS_DENIED, TRANSACTION_FAILED}`, while `DeviceCompleteResponseAction` has no `ACCESS_DENIED` member. A denial returns `SUCCESS`→200; the device learns of it as `access_denied` on its next token poll. Service must have `supportedGrantTypes` including `DEVICE_CODE`, plus `deviceAuthorizationEndpoint`. `deviceVerificationUri` and a positive `deviceFlowCodeDuration` are **mandatory** — Authlete errors on `/device/authorization` without them. `deviceFlowPollingInterval` is optional (0 omits `interval` from the response); `deviceVerificationUriComplete`, `userCodeCharset` (default `BASE20`) and `userCodeLength` (0 → 8 for `BASE20`, 9 for `NUMERIC`) are optional. **Security posture (changed 2026-08-10):** `POST /api/device/complete` approves any live `userCode` as any `subject`, with no authentication of that subject — so it is now **development-only**, gated by `middleware/development-only.ts` and answering a flat `404` anywhere else. It used to carry no middleware at all in every environment, which made it a token-minting oracle for anyone who could read a user code off a screen (RFC 8628 §5.5). The authenticated path is `POST /device/consent`, which is available in all environments. `/api/device/verification` and `POST /device` carry `deviceCodeLimiter` (5/min) because unlimited attempts are a code-enumeration oracle — RFC 8628 §5.1 asks for rate limiting and its own worked example assumes ~5 attempts; `/api/device/authorization` carries `generalLimiter` and stays public, since it is §3.1's device authorization endpoint and Authlete authenticates the client from the body credentials. See `docs/DEVICE-FLOW-TUTORIAL.md` Part 12 and `DeviceSection.tsx` (4 tabs: Authorization, Verification, Complete, Poll Token) in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:ietf:params:oauth:grant-type:device_code` — no custom token endpoint needed for polling.
- **VCI (Verifiable Credential Issuance — OID4VCI)**: 9 API endpoints + `/.well-known/openid-credential-issuer` (OID4VCI 1.0 Final). Three auth categories: (1) **Discovery** (metadata, jwtissuer, jwks, well-known) — public GET; (2) **Offers** (offer/create, offer/info) — admin Basic auth; (3) **Credential** (credential/issue, credential/batch, deferred/issue) — access token via `Authorization: Bearer` or `DPoP` header (both case-insensitive, through `extractAccessToken`) or a JSON `accessToken` body field. Action→status: discovery `OK`→200/`NOT_FOUND`→404; offer `CREATED`→201/`FORBIDDEN`→403/`CALLER_ERROR`→400/`AUTHLETE_ERROR`→500; issue `OK`→200/`ACCEPTED`→202; batch `OK`→200; deferred parse `OK`→200/`BAD_REQUEST`→400/`UNAUTHORIZED`→401/`FORBIDDEN`→403, then deferred issue `OK`→200/`ACCEPTED`→202. Files: `vci.service.ts`, `vci.controller.ts`, `vci.routes.ts` in server; `VciSection.tsx` in client.

  **`POST /api/vci/deferred/issue` makes *two* Authlete calls, and that is not incidental** (fixed 2026-08-13; it authenticated nobody until then). The deferred path is the one place in this repo where **Authlete splits authentication away from the operation**:

  | Authlete API | Takes | So the token is validated… |
  |---|---|---|
  | `/vci/single/issue` | `accessToken` **+** `order` | on that one call — no parse step needed |
  | `/vci/batch/issue` | `accessToken` **+** `orders` | same |
  | `/vci/deferred/issue` | `order` **only** | **nowhere** — the request model has no `accessToken` field |
  | `/vci/deferred/parse` | `accessToken` + `requestContent` | here, and only here. `UNAUTHORIZED` is a member of `VciDeferredParseResponseAction` for exactly this |

  Verified against SDK 1.0.0 and the vendored `docs/openapi-spec.json` (3.0.16). So `handleIssueDeferred` calls `parse` first and issues only on `OK`. **Two rules not to undo.** `requestIdentifier` comes from `parse`'s `info.identifier`, **never from `req.body`** — it names the credential request Authlete resolved from the *validated* `transaction_id`, and taking it from the body would let any valid token name any pending request (the same server-determined-fields rule `introspection.service.ts` and `userinfo.service.ts` follow). And `transactionId` is **required** while a bare `requestIdentifier` is **refused**: that was the shape which bypassed validation, and it carries no `transaction_id` for `parse` to check.

  **What this looked like before**, since it is the clearest instance of a defect class this repo keeps finding: the handler collected no token at all, so a caller holding a `transactionId` — a handle, not a credential — reached issuance. Its two siblings on the same router both answered `401` without a token; **the asymmetry was the bug**, and a controller test could not see it because it never drives the route. Found by `check-route-coverage.mjs`, not by reading the code. **Verified live 2026-08-14, once DR-03 enabled VCI:** `POST /vci/deferred/parse` with a bogus access token answers **`UNAUTHORIZED`**, `[A375304] The access token does not exist.` So the endpoint is live, **the deferred path really does validate the token**, and the `requestContent` this server synthesises is accepted — Authlete parsed it far enough to reach token validation. `UNAUTHORIZED` → 401 is the mapping above. **Still UNVERIFIED, and narrower:** §9's normative sentence on authenticating the request was never quoted verbatim, so no MUST is cited — the design rests on the four facts above instead. **The request shape is still Authlete's** (`{ order: { transactionId } }`) rather than §9.1's — that is **T1-11**'s scope, and this endpoint is a fourth site for it alongside PAR, Device and DCR.
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
| `ID_TOKEN_REISSUABLE` | Reissue ID token during refresh flow → **`token.management.reissueIdToken()`** (`POST /idtoken/reissue`), **not** `token.issue()` — there is no ticket. See the note below |
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
| Access control | `middleware/require-grant-ownership.ts`, `middleware/csrf.ts`, `middleware/development-only.ts`, `middleware/require-basic-auth.ts`, `routes/device.routes.ts`, `controllers/jar.controller.ts` |
| Session termination & redirect targets | `services/logout.service.ts`, `controllers/logout.controller.ts` |

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

### Two mechanical checks — run both, and know what each cannot see

```bash
node scripts/check-docs.mjs           # offline: source refs, relative links, anchors. CI runs this on every push
node scripts/check-docs.mjs --links   # also fetches external URLs. CI runs this weekly, not per-push
node scripts/check-route-coverage.mjs # every route is named by some test. CI runs this on every push
```

**`check-route-coverage.mjs` exists because a green test suite proved nothing four times running.** During
the Phase 5 remediation, `POST /api/backchannel_logout` validated 5 of Back-Channel Logout §2.6's 11 required
steps and terminated nobody's session; `POST /api/jar/process` returned Authlete **tickets** — credentials —
to anonymous callers; `federation.service.ts` had no tests and *could not* have had any, because the shared
`tests/helpers/mock-authlete.ts` had no `federation` member while claiming to cover every SDK method. Each
was found by reading code, one at a time. **The question that finds them as a list is *"which routes does no
test mention?"***, and that is all this script asks.

**The backlog is drained: `scripts/route-coverage-baseline.json` is empty and all 91 routes are named by a
test** (2026-08-13). An empty baseline is the intended terminal state, not a missing file — the check now
fails on *any* unreferenced route, so a new endpoint without a test breaks the build immediately. It still
**ratchets**, which is how it got here: 47 routes were carried as debt on day one, `--triage` split them into
**4** with no test anywhere and **43 across 10 modules** with a unit-tested controller but **nothing driving
the route with its middleware**, and the second group was worked one integration block per module with the
auth posture asserted first. Bank progress with `--update-baseline`; **never regenerate it to silence a
failure**, which is the one move the design cannot defend against.

**Why the second group was the one with history**, and why the ordering matters if this ever refills:
`/api/jar/process` had a controller test *and* no auth middleware; `/api/device/complete` was ungated outside
development; both introspection endpoints were unauthenticated. **A controller test calls the handler
directly and never touches the middleware chain**, so it cannot see any of that. Draining the backlog found
one more of exactly that shape — `POST /api/vci/deferred/issue` authenticated nobody, and its two siblings on
the same router both answered `401` without a token. **The asymmetry was the bug**, which is why the fix
asserts the three endpoints as one posture rather than one at a time. See the VCI bullet above.

Two things it does **not** claim. A route *named* by a test is not a *tested* route: it measures reference,
not assertion quality — a smoke detector, not a fire inspection. And **it reads only executable text**;
whole-line comments are stripped before matching. That is not tidiness. A comment in the new native-SSO test
citing `/api/jar/process` as the defect it was modelled on moved that route out of the backlog on its own,
and fixing it revealed that `POST /api/backchannel_logout` — the endpoint this script exists because of — was
referenced in the entire suite **only inside two comments**.

**The client had the same shape of hole at the CI level**: `ci.yml` ran `npm run build` alone, and `vite
build` does not typecheck, so `npm run typecheck` was never invoked and 16 client test files never ran. Both
are now gated. **When something has survived a long time, ask what was supposed to have caught it before
asking how to fix it.**

### Documentation drift check

Covers 104 markdown files. It catches the mechanically detectable drift only — `file.ts:NNN` references
past the end of the file, broken relative links, anchors matching no heading, and dead external links.

Two design decisions worth keeping:

- **External links are checked on a schedule, not per push.** A third party moving a page is not a
  reason to fail somebody's pull request.
- **Only markdown links (`[text](url)`) are fetched, never bare URLs.** A bare URL in a table or code
  block is *data* — an `iss` value, a sample redirect, a placeholder host — not a reference anyone
  follows. Narrowing to links removed 20 of 20 false positives on the first run. Reserved TLDs
  (`.example`, `.invalid`, `.test`, `.internal`) are skipped per RFC 6761/6762.

**A hit is a symptom, not the bug.** The `TOKEN-EXCHANGE-TUTORIAL.md` audit started with one 404 and
found wrong line numbers, fabricated test-coverage claims, and prose contradicting the curriculum behind
it. When this script reports something, check whether the surrounding claim is still true.

## DPoP & Client Auth

- **DPoP proof signature format**: For ES256, the JWS signature must be raw IEEE P1363 R||S concatenation (64 bytes for P-256), **not** DER-encoded. The `crypto.subtle.sign()` returns raw R||S natively. Using DER encoding causes `"invalid_dpop_proof: Signed JWT rejected: Invalid signature"`. See `client/src/services/dpop.service.ts:76-84` — the `crypto.subtle.sign()` call and the `rawSignature` conversion that follows it.
- **DPoP proof `ath` claim (not `sub`)**: Per RFC 9449 §4.3, when a DPoP proof is used with an access token (resource access), the payload MUST contain `ath` (base64url-encoded SHA-256 hash of the access token), **not** `sub`. Using `sub` causes the server to reject the proof or ignore the binding. The `computeAth()` function computes the hash correctly; the proof body sets it at `client/src/services/dpop.service.ts:59-61` (`if (ath) payload.ath = ath`).
- **DPoP proof JWT header**: Per RFC 9449 §2.1, the JOSE header MUST include the `jwk` member with the public key. The `kid` parameter alone is insufficient. Without `jwk`, Authlete returns `"The DPoP header did not include a public key in JWK format."`. See `client/src/services/dpop.service.ts:70` — the `const header = { typ, alg, jwk }` literal.
- **Client auth for DCR confidential clients**: Authlete defaults DCR-created confidential clients to `CLIENT_SECRET_POST` even when the service's `supportedTokenAuthMethods` lists only `CLIENT_SECRET_BASIC`. Token exchange requests must send `client_id` and `client_secret` in the URL-encoded body, not as `Authorization: Basic`. Using Basic auth produces `"The client authentication method is 'client_secret_post' but the request does not include a client secret."`. The SPA callback must persist `client_secret` to `sessionStorage` before the auth redirect. See `client/src/pages/CallbackPage.tsx:72-90`, `client/src/components/auth/AuthFlowsSection.tsx:112`.
- **PAR client authentication has two channels, and Authlete checks which one you used** (verified 2026-08-05 against a `CLIENT_SECRET_BASIC` client). `par.service.ts` picks the channel from how the caller presented the credentials and must never guess:

  | Caller sends | → Authlete request | Serves |
  |---|---|---|
  | `Authorization: Basic` | top-level `clientId`/`clientSecret`; `parameters` untouched | `CLIENT_SECRET_BASIC` |
  | body `clientId`+`clientSecret` | merged into `parameters` via `appendToParams` | `CLIENT_SECRET_POST` |
  | body `clientId` only | `client_id` in `parameters` | `none` (public) |

  **Presenting both channels at once is refused with `400 invalid_request`** (2026-08-13, 6749-W1) — see the
  dual-channel bullet below; the table's rows are therefore mutually exclusive by enforcement, not merely by
  convention. Getting the *channel* wrong is a 401 in both directions: creds-in-`parameters` for a Basic client gives `[A157357] The client identifier is not found at the expected location`, and Basic for a POST client gives `The client authentication method is 'client_secret_post' but the request does not include a client secret`. Header decoding uses `parseBasicAuth` (`src/utils/basic-auth.ts`), which splits on the **first** colon only so a secret may contain colons. **Known gap:** `clientCertificate`, `oauthClientAttestation` and `oauthClientAttestationPop` are accepted by Authlete's `/pushed_auth_req` but not forwarded — no client here uses them, so they are unverifiable end-to-end, and **since 2026-08-12 attestation is not advertised either** (see the next bullet).
- **The service advertises five client-authentication methods, and the four it dropped were dropped on purpose** (2026-08-12, T1-5). `supportedTokenAuthMethods` is `NONE`, `CLIENT_SECRET_BASIC`, `CLIENT_SECRET_POST`, `CLIENT_SECRET_JWT`, `PRIVATE_KEY_JWT`. Withdrawn: `TLS_CLIENT_AUTH` and `SELF_SIGNED_TLS_CLIENT_AUTH` (mTLS is not implemented and `tlsClientCertificateBoundAccessTokens` is `false`, so both were unhonourable), `ATTEST_JWT_CLIENT_AUTH` (no Client Attester is configured and the discovery document has no `challenge_endpoint`), and `SPIFFE_JWT` (nothing here uses SPIFFE, and it broke `service.get()` — see the SDK note below). **Two side effects worth knowing.** Withdrawing attestation also removed `client_attestation_signing_alg_values_supported` and `client_attestation_pop_signing_alg_values_supported` from the discovery document — those two members exist only to describe that method, so one withdrawal removed three advertisements and took the document from 64 members to 62. And `par.service.ts`'s un-forwarded attestation headers are now unreachable by construction rather than merely unused. Re-adding any of the four means re-checking the SDK enum first: a member `ClientAuthMethod` does not know takes `service.get()` down for every caller.
- **Client credentials on both channels are refused, and the reason this is ours to enforce is worth keeping** (2026-08-13, 6749-W1). RFC 6749 §2.3.1: *"The client MUST NOT use more than one authentication method in each request."* **Authlete does not enforce it** — verified live 2026-08-12: a request carrying correct top-level credentials plus a **wrong** `client_secret` in the body is accepted and a token issued, because the top-level channel wins. Authlete's [strict-checking page](https://developers.authlete.com/configuration-reference/endpoints/strict-checking-on-client-authentication-parameters) governs only *method matching* (*"Authlete version 2.0 and later strictly check client type and client authentication method settings"*) and says nothing about presenting both, or about precedence. **Nor did this server resolve the conflict, despite appearing to**: the `clientId`/`clientSecret` assignment in `token.service.ts` sets only the *top-level* fields, while `parameters` is preferentially `req.rawBody`, so body credentials reached Authlete untouched and both channels genuinely crossed the boundary. So `hasDualChannelClientAuth()` (`src/utils/basic-auth.ts`) now refuses the shape at `token.controller.ts` and `par.controller.ts`, **before any Authlete call** — the same gate-before-call arrangement the introspection endpoints use, and the client-authentication counterpart of `extractAccessToken()`'s enforcement of RFC 6750 §2's identical rule for token *presentation*. Two things not to undo: **only a second *credential* counts** — a bare `client_id` beside a Basic header is not a second method, since §2.3.1's methods differ in where the *secret* travels and a public client legitimately sends `client_id` alone; and **both endpoints are covered**, because RFC 9126 §2 gives PAR the token endpoint's client authentication, so exempting one would rebuild the inconsistency this removed. **This is the third consequence of the raw-body design choice**, after signature fidelity and the RFC 9700 §4.2.4 credential leak — when a finding quotes a variable assignment in `token.service.ts` or `revocation.service.ts`, check what actually goes on the wire.
- **`parseBasicAuth` (`src/utils/basic-auth.ts`) is the only Basic-auth decoder for OAuth client credentials** — used by both `token.service.ts` and `par.service.ts`. It splits on the first colon (a secret may contain colons), treats the scheme case-insensitively per RFC 9110 §11.1, and returns `undefined` rather than partial credentials when the payload has no colon, so a malformed header cannot clobber body-supplied `clientId`/`clientSecret`. Do not hand-roll `authorization.split(":")` again. `require-basic-auth.ts` stays separate on purpose: it validates *this deployment's* management credentials with `timingSafeEqual`, which is a different job from decoding a client's.
- **DPoP nonce flow**: Nonces are OPTIONAL (controlled by `dpopNonceRequired`). First request without nonce → 401 `use_dpop_nonce` error + `DPoP-Nonce` header. Client retries with nonce. Expired nonce → 401 `invalid_dpop_proof` + new nonce. Token/PAR endpoints can return nonce on success; protected resource endpoints return it only on error per RFC 9449. See `docs/FAPI-TUTORIAL.md`.
- **Presenting an access token at a protected resource (RFC 6750 §2, RFC 9449 §7)**: this repo has **two**
  protected resources — `UserInfo` and the **Grant Management API** (`/api/gm/:grantId`, since 2026-08-13,
  T1-10) — and they answer identically, because both route every presentation through
  `server/src/utils/dpop.ts`: `extractAccessToken()`, `dpopHttpTarget()`, `authChallenge()`,
  `isTokenPresentationError()`. Use these rather than re-deriving a token from the `Authorization` header.
  Grant management used to accept `Bearer` **only**, case-sensitively, while still forwarding any `DPoP`
  proof it found — so a bound token could not be presented conformantly at all, and `Bearer` + a proof was a
  working §7.2 downgrade. The two resources now agree case by case; if you add a third, reuse these helpers
  rather than re-deriving the rules.
  - **Both schemes, case-insensitively.** `Bearer` (RFC 6750 §2.1) and `DPoP` (RFC 9449 §7.1); RFC 9110 §11.1
    makes auth-scheme case-insensitive. An unrecognised scheme yields "no token presented", never a token.
  - **`DPoP` is mandatory for a bound token.** RFC 9449 §7.1 — a DPoP-bound token *"is sent using the
    `Authorization` request header field… with an authentication scheme of `DPoP`"*. There is no alternative.
  - **§7.2 downgrade is enforced by Authlete at every protected-resource API, and all three fail closed.**
    `Bearer <dpop-bound-token>` with no proof is refused by whichever API the request reaches, each with its
    own code — **`[A089311]`** at `/auth/userinfo` (verified 2026-08-04), **`[A065308]`** at
    `/auth/introspection` and **`[A281305]`** at `/gm` (both verified 2026-08-12). Every one of them carries
    the `DPoP` scheme plus an accurate `algs` list already, so do **not** hand-write a DPoP challenge on paths
    where Authlete answers; forward `responseContent` verbatim. Neither `UserinfoResponse` nor
    `IntrospectionResponse` exposes `cnf`, so the server cannot detect the downgrade locally — this
    compliance is delegated by design, and the delegation was **tested rather than assumed** before
    `/api/gm` was allowed to rely on it.
  - **A protected-resource call must forward the proof to *every* Authlete API it makes.** `/api/gm` makes
    two — `/auth/introspection` for the ownership gate, then `/gm` — and **both** check the binding
    independently. Passing the first and omitting the proof on the second just moves the 401 one call later
    (`[A281305]`). The **same** proof serves both: it describes one client→RS request, and Authlete does not
    treat the second use as a replay (verified 2026-08-12).
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
    **Every `htu` in the server now comes from `dpopHttpTarget()`** (2026-08-13, T1-9) — `token.service.ts`,
    `par.service.ts`, `introspection.service.ts`, `require-grant-ownership.ts` and
    `grant-management.service.ts` each built it by hand from `req.originalUrl` before, so a DPoP proof failed
    on any request carrying a query string even though the client was entirely correct. Do not rebuild it
    inline. **Send `targetUri` only where the request model has it** — `IntrospectionRequest` and
    `UserinfoRequest` do; `TokenRequest`, `PushedAuthorizationRequest` and `GMRequest` do not.
  - **No query-parameter tokens.** RFC 6750 §2.3 is not implemented: RFC 9700 §4.3.2 (BCP 240) says *"Clients
    MUST NOT pass access tokens in a URI query parameter"*.
  - **A `DPoP` scheme on an *unbound* token succeeds** (verified) — the token has no `cnf`, so there is no
    binding to check and the proof is decorative. Proof-of-possession comes from `cnf.jkt` on the token, not
    from the scheme the caller chose. Never treat "the request used DPoP" as evidence of sender-constraint.
- **RFC 9470 Step-Up Authentication**: The server binds `acr` and `auth_time` to JWT access tokens during authorization. On login, `session.controller.ts` records the satisfied ACR ("pwd" for password) and `authTime` (epoch seconds), then checks Authlete's `acrs`/`acrEssential`/`maxAge` requirements. If ACR doesn't match and `acrEssential` is true, the authorization fails with `ACR_NOT_SATISFIED`. If `maxAge` is exceeded, fails with `EXCEEDS_MAX_AGE`. The `stepUp` object in session (`{ acr, authTime }`) is passed to Authlete's `/auth/authorization/issue` API via `authorization.service.ts`. **Since 2026-08-12 both the login path and the non-interactive `prompt=none` path share one check — `checkStepUpRequirements` in `utils/step-up.ts`** — and its rule is that absence is answered as *no*: an unknown `acr` does not satisfy an essential `acr` request, and an unknown `auth_time` does not satisfy a `max_age`. That matters because `prompt=none` previously **invented** an authentication event (`acr: "pwd"`, `auth_time: now`) when the session had recorded none, which would have let a resource server accept fabricated freshness; see the `prompt=none` note under **Quirks & gotchas**. **`max_age` can only genuinely fail on the `prompt=none` path** — on the login POST the End-User has just actively authenticated, so any maximum age is satisfied by construction. The introspection controller (`introspection.controller.ts:47`) parses Authlete's `WWW-Authenticate` header for `insufficient_user_authentication` and returns structured JSON with `acr_values`/`max_age` for the client to re-authorize. The client UI includes a **Step-Up Auth** section (`StepUpSection.tsx`) that tests the full flow. See `docs/STEP-UP-AUTH-TUTORIAL.md`.

## Quirks & gotchas

- **`validateAuthorizationParams` (`src/utils/validate.ts`) checks `client_id` and nothing else — deliberately.** `client_id` is the only parameter required in every request shape: plain (RFC 6749 §4.1.1), PAR (RFC 9126), and JAR (RFC 9101 §5, *"REQUIRED … MUST match the request or request_uri Request Object's client_id"*). Everything else is shape-dependent and belongs to Authlete. Do **not** reintroduce a per-shape allowlist: the previous version demanded `response_type` + `redirect_uri` unless `request_uri` was present, which (a) refused the canonical JAR shape (`client_id` + `request`, everything else inside the signed object) with `Missing required parameter: response_type` before Authlete saw it, (b) required `redirect_uri` even though RFC 6749 §3.1.2.3 makes it optional when exactly one full URI is registered, and (c) answered `400 {json}` where RFC 6749 §4.1.2.1 wants an error redirect. Sibling validators `validateTokenParams` (`grant_type`) and `validateIntrospectionParams` (`token`) are correct as-is — those parameters *are* unconditionally required (RFC 6749 §4, RFC 7662 §2.1) — so the same bug class does not apply to them.
- **Client `attributes` is validated, not cast** (2026-08-14, ATTR-W1; `clientAttributesSchema` in `src/utils/validation.ts`, applied in `buildClientInput`). It was the **one** field in that ~40-field mapper carrying `as any`: every sibling is coerced (`String(…)`, `Number(…)`) or cast to a named SDK type, so a malformed `attributes` was the only client input reaching Authlete unexamined — and a **non-array was silently dropped**, which answers 200 for a setting that never took effect. Both are 400s now. **Stricter than the SDK on one point, deliberately:** the SDK's `Pair` makes *both* members optional, so `[{}]` satisfies it, but an attribute with no key cannot be addressed by anything and the namespace is not inert — Authlete assigns meaning to some keys, which is how the `regex` *scope* attribute drives parameterized scopes. `value` stays optional, matching `Pair`. Applies to create and update alike; they share the mapper.
- **`normalizeGrantType` refuses rather than defaults, and the default was the bug** (2026-08-14, B1-W3; `services/token.operations.service.ts`). It used to end `|| "AUTHORIZATION_CODE"`. `grantType` is Authlete's record of **what authorised a token**, so coercing an unrecognised — or entirely absent — value did not fail to answer the question, it answered it **wrongly**, and the token carried that answer for its whole life. A typo in the admin UI's free-text field minted a token whose provenance was a fiction, with HTTP 200 and nothing in the log. Now `AppError(400)`. Same rule as `utils/step-up.ts` on an unknown `acr` and `require-basic-auth.ts` on unset management credentials: **an absent value selects the safest behaviour, and for an assertion the safest behaviour is to make none.** Three further defects went with it: **`CIBA` had no map entry at all** though it is an SDK enum member, so CIBA tokens were recorded as authorization-code; the canonical wire URNs for **device code** (RFC 8628 §3.4) and **token exchange** (RFC 8693 §2.1) were absent, only the short forms `device_code`/`token_exchange` mapping, and neither is what a client sends; and `as GrantType` at the call site defeated the closed enum, which is what let the `CIBA` omission survive. The map is now keyed by **both** the wire value and Authlete's enum name, typed `Record<string, GrantType>` so the compiler checks all ten. **`controllers/token-exchange-response.handler.ts` is the second caller** — it sends the camelCase `grantType: "TOKEN_EXCHANGE"`, which still resolves; tests on both sides assert that, because it is a **Deliberate defect** whose lab would break if it ever 400'd.
- **The dev-only local JWT is a worked example of RFC 9068 §2, not a counter-example** (2026-08-14, 9068-W2; `utils/createLocalJWT.ts`). `GET /api/token/createLocalToken` is dev-only and admin-authenticated, but its token is **the only JWT in this repo a learner can obtain and decode as an "access token"** — in a curriculum whose Module 04 objective is to state §2's required claims and `typ` value. It emitted `typ: JWT` and five claims, missing `client_id`, `jti` and `scope`, so the one available specimen contradicted the lesson. Now `typ: at+jwt` (§2.1 — `jsonwebtoken` defaults to `JWT`, which §4 check 1 makes a resource server **MUST-reject**) plus all seven §2.2 REQUIRED claims and an optional `scope` (§2.2.3). **`clientId` is a required positional parameter, not an option** — an optional field would let the specimen stay non-conformant by omission. `jti` is a fresh UUID per call, never derived from the other claims, because §4's replay guidance only works if tokens are distinguishable. **Two advertised no-ops were found while doing it:** `openapi.routes.ts` documented `acr` and `authTime` as query parameters and `localSignedToken` dropped them before `createLocalJWT` could see them; both are wired now, and an unparseable `authTime` yields **no claim** rather than `Number("") === 0`, i.e. the Unix epoch — a fabricated authentication time is what a resource server enforces `max_age` against. §5's cross-JWT-confusion guidance and §3's default-`aud` MUST remain unmet (`RFC9068-…` F-3), deliberately: `aud` is caller-supplied and unvalidated, which is out of scope for a fixture.
- **The Authlete authorization request is built from named fields** (2026-08-14, 9101-W5; `services/authorization.service.ts`). It used to pass `req.query` **itself** — mutated with a `parameters` key — as the `AuthorizationRequest`, so every parameter the client sent was also offered to Authlete as a top-level vendor field. **Not exploitable, and establishing that is why it was S4:** the request type has exactly three members (`parameters`, `context`, `cimdOptions`) and the SDK's outbound `z.object` strips the rest, and crucially there is **no `clientCertificate` member on this request type**. What did survive was `context` — the arbitrary text Authlete attaches to the ticket, chosen by whoever wrote the URL. This is the same rule the protected-resource bullets state as *"server-determined fields never come from the body"*, and **`jar.service.ts` calling the same Authlete API already followed it**, so the fix made two siblings agree rather than inventing anything. The `req.query` mutation is gone too: nothing read it (`authorization.controller.ts` reads `req.query.prompt` and `req.query.properties` directly), and a service that quietly rewrites the request it was handed is a trap. **The next member Authlete adds to this request type should be a decision somebody makes, not a query parameter somebody discovers.**
- **Authlete's authorization-error channel splits on `response_type`** (verified 2026-08-04). With `response_type` present and some other parameter invalid → `302` to the redirection URI carrying `error`, `state` and `iss`, per RFC 6749 §4.1.2.1 and RFC 9207. With `response_type` **absent** → `400 [A009301]` as a body, because without it the AS cannot determine the response mode and so cannot shape a redirect. Vendor behavior, not configurable here; do not "fix" the local validator to paper over it.
- **`post_logout_redirect_uri` is matched exactly against the client's registered set** (RPL-W1, 2026-08-12; `registeredPostLogoutRedirectUris` + `isAllowedPostLogoutRedirectUri` in `src/services/logout.service.ts`). RP-Initiated Logout 1.0 §3: *"The OP also MUST NOT perform post-logout redirection if the `post_logout_redirect_uri` value supplied does not exactly match one of the previously registered `post_logout_redirect_uris` values."* The rule:

  | Step | Behaviour |
  |---|---|
  | identify the client | the `client_id` parameter, else the `aud` of a **verified** `id_token_hint` (§2 makes `client_id` OPTIONAL precisely because the hint can name the RP) |
  | no client identified | **no redirect** — an unidentified client has an empty registered set, and §3's answer for an empty set is to refuse |
  | match | `===` against an entry of that client's set, byte for byte. `http://localhost:3000` does **not** match `http://localhost:3000/` |

  **The registry is `POST_LOGOUT_REDIRECT_URIS`, a JSON object of `clientId → string[]`, and it lives here because Authlete has nowhere to put it.** Verified 2026-08-12 against the vendored `docs/openapi-spec.json` (**3.0.16**): none of the `Client` schema's 108 properties contains *"post"*, none of the 33 schemas defines a post-logout member, and `ClientExtension` carries only scopes and durations. Authlete's only client-level logout fields are `backchannelLogoutUri` and `backchannelLogoutSessionRequired` — note the lowercase `c`, which is **not** the `backChannelLogoutUri` several documents used to cite. **A write of `postLogoutRedirectUris` through `client/update` returns `200` and is silently discarded**, confirmed live on all three clients with no other field disturbed. So the departure from §3 is now *where the registration is stored*, not what the rule is.

  **What this replaced, and why the old warning no longer applies.** Until 2026-08-12 the comparison was against `ALLOWED_ORIGINS` by parsed origin, which was itself a fix for a `startsWith` **open redirect** — verified live in both directions: with `ALLOWED_ORIGINS=http://localhost:3000`, `http://localhost:3000.evil.example.com/bye` passed because the allowed origin is a *prefix of the attacker's hostname*, and `http://localhost:3001@evil.example.com/` passed because everything before `@` is *userinfo*. The second survived `NODE_ENV=production`. Origin matching closed both but left every client sharing one deployment-wide list. Both payloads are still refused, now for the plainer reason that nobody registered them.

  Three things not to undo. **`ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` no longer authorise anything** — the first is CORS only, the second is the "Return to application" link on the signed-out page. **The non-production `localhost` clause is gone**; there is no environment in which an unregistered URI redirects. And **there is no `new URL()` parsing left**: matching whole registered URIs needs no parser, and a comparison with no parser has no parser bugs. Do not reintroduce prefix matching, origin matching, or an env-wide allowlist — and note that `some(u => u === candidate)` is element equality, a different operation from `String.prototype.includes`.
- **`id_token_hint` is verified, not decoded** (fixed 2026-08-11; `utils/verify-id-token-hint.ts`, called from `services/logout.service.ts`). It used to be `jwt.decode`d with `payload.sub` taken as the End-User — and that subject drives back-channel logout delivery, so an unsigned hand-made JWT naming any subject was a remote forced-logout primitive via `/api/logout?backchannel=true` — a bare GET at the time, see the next bullet. It was inert only because no client had registered a `backchannel_logout_uri`. The rule now: signature against **Authlete's service JWKS** (not `JWKS_URI`, which is unset here), `iss` against the **live discovery document** (not `JWT_ISSUER`, also unset — using it would silently disable the check), both cached 5 minutes; `aud` pinned to `client_id` when the caller supplies it, since RP-Initiated Logout §2 makes `client_id` OPTIONAL. **`alg` is pinned to the nine asymmetric algorithms `jsonwebtoken@9` can verify**, so `alg: none` and the `HS*` family are refused — which means the client whose `idTokenSignAlg` is `HS256` has its hints ignored (HS256 is symmetric; the OP would need that client's secret). Failure yields **no subject**, never an error: the session is still destroyed and the redirect still validated, but nothing is delivered. `exp` is deliberately **not** enforced — a hint is an old token by definition — and that choice is marked `UNVERIFIED` against §2 in the code. Do not "simplify" this back to a decode, and when adding a `jwt.verify` anywhere else, pass `issuer` and `audience` as this does. **Since RPL-W1 the verified `aud` is returned as well as `sub`** — it is how a request that omits `client_id` identifies its client for the §3 redirect check, so the hint is now verified whenever it could supply either piece, not only when the session lacks a subject. An `aud` naming more than one client yields no client, and an unverifiable hint yields neither.
- **RP-Initiated Logout is two requests, and collapsing it back to one is a MUST violation** (added 2026-08-12; `routes/logout.routes.ts`, `showConfirmation` in `services/logout.service.ts`, `views/logout-confirm.ejs`). RP-Initiated Logout 1.0 §2: *"the OP **MUST** ask the End-User this question if an `id_token_hint` was not provided or if the supplied ID Token does not belong to the current OP session"*, wrapped in a SHOULD to always ask. `GET /api/logout` now renders a confirmation page carrying a CSRF token and **destroys nothing**; `POST /api/logout` — validated by `csrfProtection`, the same GET-renders/POST-validates arrangement as `routes/device.routes.ts` — is the only thing that verifies the hint, delivers back-channel logout tokens, destroys the session or redirects.

  | | Before | Now |
  |---|---|---|
  | `GET /api/logout` | verified the hint, delivered, destroyed the session, `302` | `200` confirmation page, no state change |
  | `POST /api/logout` | did not exist | does all of the above, `_csrf` required |
  | `<img src="…/api/logout">` | **logged the viewer out** | renders a page nobody sees |

  The question is asked **unconditionally**, which satisfies the SHOULD as well as the MUST. The narrower reading — skip the page when a verified hint names the current session's subject — was considered and rejected: it leaves a GET that still destroys a session, so a captured `id_token_hint` stays a forced-logout primitive. Three consequences worth knowing: the parameters are read **body-first, query second** (§2 blesses both GET and POST for the request itself); the CSRF token is **single-use and the logout destroys the session holding it**, so scripted logouts need one GET per POST; and the confirmation page shows the destination only when `isAllowedPostLogoutRedirectUri` would honour it, so an unvetted URI is never echoed back at the user. Locked by `tests/unit/routes/logout.routes.test.ts`. **Still open:** the endpoint carries no rate limiter (`audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md` F-1). §3's per-client matching landed separately as RPL-W1 — see the bullet above.
- **`prompt=none` decides without UI, and asserts only what it observed** (fixed 2026-08-12; `decideWithoutInteraction` in `controllers/authorization.controller.ts`, `utils/step-up.ts`). Authlete answers `prompt=none` with **`action: NO_INTERACTION`**, a ticket, and **`responseContent: null`** — it is a *"you decide"* answer, not a redirect URL. The branch used to `res.redirect(responseContent ?? "")`, so every silent-renewal request got a **302 with an empty `Location`**: neither success nor one of OIDC Core §3.1.2.6's four errors. The `prompt=none` logic that existed sat inside `case "INTERACTION"`, which such a request never reaches — dead code that read as a feature.

  **The obvious fix was a trap, and this is the part to remember.** That dead block began:

  ```ts
  if (!req.session.stepUp) { req.session.stepUp = { acr: "pwd", authTime: Math.floor(Date.now() / 1000) }; }
  ```

  Routing `NO_INTERACTION` into it would have made the OP attest `acr: "pwd"` with no evidence and `auth_time: now` for an event at an unknown earlier time — with **no** `max_age` or essential-`acr` check on that path, since those run on the login POST that `prompt=none` bypasses. A resource server enforcing step-up would have accepted fabricated freshness. So `OIDC-W1` and `9470-W3` were **one change, and the audit says do not split them**.

  The rule now: identify the client, then `NOT_LOGGED_IN` → `CONSENT_REQUIRED` → `checkStepUpRequirements` → issue. Both the login path and this one use that one function, so they cannot drift. Do not reintroduce a default `acr`/`authTime` anywhere, and do not "simplify" the `NO_INTERACTION` branch back to a redirect.
- `server/tsconfig.json` uses `module: "node16"` + `moduleResolution: "node16"` — dynamic imports need `.js` extension
- Build copies `public/` and `src/views/` into `dist/` via `postbuild` script (`rm -rf dist/views dist/public && cp -r src/views dist/views && cp -r public dist/public`). The destructive copy prevents nested `dist/views/views/` on subsequent rebuilds. If you rename/move these directories, update the script.
- All Authlete API calls go through the SDK client in `src/services/authlete.service.ts` — do not add raw `fetch()` calls. **One exception survives, and it is now exactly one call rather than a file**: `backchannel-logout.service.ts`'s `callAuthleteIssueToken`, because the SDK exposes no backchannel logout token API (re-verified against 1.0.0). Before writing a `fetch()`, check the SDK first — `health.service.ts` carried one for `GET /api/lifecycle/healthcheck` until 1.0.0 added `lifecycle.getApiLifecycleHealthcheck()`. **The same file used to hand-roll `/client/get/list` beside it** (BCL-W6, fixed 2026-08-14): a second URL, a second bearer header and a second hand-written response shape, none of which the SDK gap justified. One legitimate exception in a file makes the next one look like the house style — so state which *call* is exempt, not which file
- The `server/logs/` directory is gitignored (except `.gitkeep`)
- **SDK is pinned to the exact version `@authlete/typescript-sdk@1.0.0` — no caret, and this is deliberate.** `1.1.5`/`1.1.6` are numerically *higher* but are **older code**: Speakeasy auto-versioning ran the package up to 1.1.6 in Nov 2025, upstream then restarted at `0.0.1-beta`, and on 2026-04-08 hand-set the version back to a stable `1.0.0` (commit *"Promote SDK to stable v1.0.0 and align Speakeasy config"*, `versioningStrategy: automatic` → `manual`), published 2026-04-09 as npm's `latest`. Widening this to `^1.0.0` resolves *up* to 1.1.6 and silently reintroduces three bugs — see `docs/DEVELOPMENT.md` → SDK Version Pin. A Dependabot `ignore` rule in `.github/dependabot.yml` blocks that "upgrade". **GitHub's releases page shows v1.1.6 as "Latest" — ignore it**: every later release is flagged `prerelease=true` and the Apr 2026 stable 1.0.0 got no GitHub release at all, so the badge is stale metadata, not currency.
- The repo previously carried `patches/@authlete+typescript-sdk+1.1.6.patch` via `patch-package`. **It is gone, and must not come back** — all three of its fixes are native to 1.0.0 (verified against `openapi-spec`).
- **`authleteApi.service.get()` works, and what it took is the durable lesson** (broken 2026-08-06 → 2026-08-12). Authlete returned `supportedTokenAuthMethods` including `SPIFFE_JWT`; SDK 1.0.0's `ClientAuthMethod` is a **closed** Zod enum of eight members that does not include it, so one unrecognised value rejected the whole response. `GET /api/fapi/config` and `GET /api/fapi/status` — the only two `service.get()` call sites, both in `fapi.controller.ts` — were down for six days. **Fixed by withdrawing the member at the service** (T1-5, `supportedTokenAuthMethods` nine members → five), never by a `patch-package` patch, which stays forbidden.

  **The gap is one enum, and it sits in three fields, not one.** `ClientAuthMethod` types `supportedTokenAuthMethods`, `supportedRevocationAuthMethods` **and** `supportedIntrospectionAuthMethods`. Only the first was ever set here — the other two are absent, so the drop was a single field — but setting either sibling to a list containing a member the SDK does not know breaks `service.get()` again, and every document that discussed this named only `supportedTokenAuthMethods`. **It is the only such gap in the schema**: of the 16 enum-typed fields reachable from `Service`, the other 15 match Authlete 3.0.16 member-for-member, and no field is Authlete-nullable while the SDK refuses null (checked 2026-08-12 by diffing the SDK's `Service$inboundSchema` against `docs/openapi-spec.json`, then confirmed live — the failing response produced **exactly one** Zod issue out of 132 fields).

  **The asymmetry to remember when adding an SDK call:** the schema models 185 of Authlete's 193 service properties and *silently strips* the 8 it does not know (`z.object` default, no `.strict()`), while one unknown **value** in a modelled field is fatal. Tolerant of new fields, brittle about new values — so any client-auth method Authlete adds is a breaking change for every TypeScript SDK caller whose service enables it. Note Authlete's own OpenAPI document declares `SPIFFE_JWT`: the vendor's specification is ahead of the vendor's SDK.

  **`Client` and `Service` do not behave the same way, and the sentence above is only about `Service`** (established 2026-08-14, BCL-W6). `Service$inboundSchema` is a plain `z.object` and strips. **`Client$inboundSchema` wraps itself in the SDK's `collectExtraKeys$`**, so unmodelled members are *collected* into **`client.additionalProperties`** rather than dropped. SDK 1.0.0's `Client` carries **104** of Authlete 3.0.16's **108** properties; the four it omits are **`backchannelLogoutUri`**, **`backchannelLogoutSessionRequired`**, `spiffeId` and `spiffeBundleEndpoint` — the last two being the client-side sibling of the `SPIFFE_JWT` gap above. Verified by parsing a fixture through `Client$inboundSchema` and reading where the field landed, not inferred from the model. **This decides whether a migration off a raw `fetch()` is even possible:** BCL-W6 moved client listing onto `client.list`, and had `Client` stripped like `Service`, `issueAndDeliverToAll` would have delivered logout tokens to **nobody**, silently, while still answering 200. Locked by a test in `tests/unit/services/backchannel-logout.service.test.ts` that parses through the real schema, so an SDK bump that changes this fails loudly. **Do not generalise either model's behaviour to the other — check which wrapper the schema uses.**

  **Two separable layers, and only one was about `SPIFFE_JWT`** (separated 2026-08-11). The enum gap explained *why the call failed*; it did not explain why the failure was served as **HTTP 200 with an error body** — that was `middleware/errorHandler.ts` deriving the HTTP status from the thrown error, and `AuthleteError` subclasses carry the status of the response they were *reading*, which for a 200 body that fails Zod validation is 200. `errorStatusFrom()` now trusts an error-supplied status only inside 400–599. Both halves are closed; **Module 10 Exercise 4 was rebuilt around the three states** (invisible 200 → honest 500 → live data) rather than retired. See `tests/unit/routes/fapi.routes.test.ts`.
- **`GET /api/fapi/config` reports live values only** (fixed 2026-08-11). It used to hardcode `requiredClientAuth`, `senderConstrainedTokens`, `parRequired`, `pkceRequired`, `scopeRequired` and `refreshTokenRotation` — six constants describing the deployment's security posture, every one the opposite of the live configuration, on an endpoint whose entire job is to report that posture. It now reads all six from the service, and two are not straight passthroughs: **`supportedTokenAuthMethods`** replaces the scalar `requiredClientAuth`, because client auth is pinned *per client* (`tokenAuthMethod`) and FAPI 2.0 permits mTLS *or* `private_key_jwt`, so no service-level "required method" exists to report; and **`refreshTokenRotation` is `refreshTokenKept === false`**, since a kept refresh token is one that is *not* rotated (the console label "Enable Token Rotation" is the trap). `dpopEnabled` remains `dpopNonceRequired` and is **not** "is DPoP available" — DPoP works without nonces. Whether DPoP is *required* is per-client and is still unreported. **`clientIdMetadataDocumentSupported` is read as a typed field, not through a cast** (2026-08-12): SDK 1.0.0 models it in both the `Service` type and `Service$inboundSchema`, so the `(service as Record<string, unknown>)` that used to wrap it was never covering an SDK gap. Do not reinstate it.

  **`mode` spans both FAPI generations, and `"disabled"` no longer absorbs everything it cannot name** (2026-08-14, FAPI1-W2). Authlete's `fapiModes` is a six-member closed enum — `FAPI1_BASELINE`, `FAPI1_ADVANCED`, `FAPI2_SECURITY` and three `FAPI2_MESSAGE_SIGNING_*`. `computeFapiMode` recognised only the FAPI 2.0 half, so a service configured for **FAPI 1.0 was reported as having FAPI switched off** — on the endpoint whose entire job is reporting the FAPI posture, for a profile `SPEC-INVENTORY.md` carries two rows for and Module 10 teaches. The domain is now `sp` · `ms` · `fapi1-advanced` · `fapi1-baseline` · `unknown` · `disabled`, and **the last two are deliberately distinct**: `"disabled"` means no mode is set, `"unknown"` means one is set that this server does not recognise. Collapsing the second into the first asserts a posture nobody checked, which is FAPI2-W1's hardcoded-literal defect one layer down; a seventh enum member Authlete adds lands on `unknown`, not silently off. Within a generation the stronger mode wins (message signing over security profile, Advanced over Baseline) because `fapiModes` is a list and may carry both. `specs.securityProfile` follows `mode` rather than being the constant string `"FAPI 2.0 Security Profile"`. **Live value is still `disabled`** — `fapiModes` is absent on this service — so Module 10's transcripts are unaffected.
- **`ID_TOKEN_REISSUABLE` has its own API, and a flag was the only thing hiding that the branch used the wrong one** (fixed 2026-08-12, B1-W6; `controllers/token.controller.ts`). Authlete answers a refresh request carrying `openid` with `action: ID_TOKEN_REISSUABLE`, **`subject`**, **`accessToken`**, **`refreshToken`**, a `responseContent` that is a complete token response **with no `id_token` in it**, and **no `ticket`** (all verified against `/auth/token` directly). The branch demanded a ticket and fell through to `res.status(400).send(result.responseContent)`, so **every refresh returned HTTP 400 carrying a valid token body** the moment `idTokenReissuable` was enabled. The correct call is **`POST /idtoken/reissue`** — the vendored spec says it is *"expected to be called only when the value of the `action` parameter in a response from the `/auth/token` API is ID_TOKEN_REISSUABLE"* — wrapped as `TokenManagementService.reissueIdToken()`, which now accepts either an Express `Request` (the admin route) or a plain params object (this path).

  Four things to keep, in descending order of how easily they are undone:

  1. **`idTokenAudType` must be sent, and it is a trap.** The *request* parameter *"takes precedence over the `idTokenAudType` property of Service"* and **defaults to `"array"` on omission**. The service is deliberately `"string"` (Mistake #7 above), so omitting it would give reissued ID tokens an array `aud` while every other ID token here carries a string. It is passed from the `ID_TOKEN_AUD_TYPE` constant in `token.controller.ts`; **if the service flag changes, that constant moves with it.** Verified live: the reissued `aud` is a string.
  2. **Every field is server-derived; none comes from `req.body`.** `sub` from `result.subject`, the tokens from the Authlete response. A client that could set `sub` could name any subject in an ID token this OP signs, and `claims`/`idtHeaderParams` would let it choose the payload and JWS header. Same rule as `introspection.service.ts` and `userinfo.service.ts`. Locked by a test that puts an attacker's `sub` in the body and asserts it never reaches the call.
  3. **A failed reissue still returns 200 with the tokens Authlete already issued**, logged at `error`. The access and refresh tokens exist by the time this action arrives, and no specification requires an `id_token` on a refresh, so enabling a flag must not break a refreshing client on a server-side fault. This deliberately differs from `token.management.controller.ts`'s 400/500 mapping, where the caller *asked* to reissue and has no tokens riding on the answer. Safe because `responseContent` carries **no** `id_token` — the degrade path can never return a stale one.
  4. **`accessToken` follows the spec's precedence** — `jwtAccessToken` when present, else `accessToken`. A no-op while JWT access tokens are off; it is what keeps the call correct if they are ever enabled.

  **Observed, and one question left open.** The reissued ID token keeps `iss`, `sub`, `aud`, `acr`, advances `iat` and `exp`, and correctly holds `auth_time` at the **original** authentication time (verified with a deliberate 4-second gap). It **drops `nonce` and `s_hash`**. Whether dropping `nonce` conforms to OIDC Core §12.2 is **UNVERIFIED** — §12.2 was not fetched for this change, and it is vendor behaviour either way. Named next action: read §12.2 before relying on `nonce` surviving a refresh.
- **`none` cannot be withdrawn from the UserInfo and introspection signing-algorithm lists, and it is not a misconfiguration** (established 2026-08-12, T1-13). `userinfo_signing_alg_values_supported` and `introspection_signing_alg_values_supported` both advertise `none`, and **no Authlete 3.0 service field controls either list**: the algorithms are derived from the service JWK Set, and `none` is unconditional vendor output — Authlete's own `service/configuration` example in `docs/openapi-spec.json` carries it too. Verified by writing the only candidate fields (`userInfoSignatureKeyId`, `introspectionSignatureKeyId` → `rsa-1`): both lists changed, losing `ES256` because pinning an RSA key removes the EC key as a candidate, and **`none` survived both**. Reverted; only `modifiedAt` moved. The advertisement is also *accurate* for UserInfo — `Client.userInfoSignAlg` accepts `NONE`, so an unsigned UserInfo response is a real, selectable outcome. For introspection there is no client-side field at all, so the list describes the default unsigned response and nothing can narrow it. If this needs to change, it changes per client or not at all.
- `dotenv` only loaded in `app.config.ts` (was duplicated in `authlete.config.ts`)
- All logging uses `const log = req.logger || logger;` — `CallableLogger` is callable + has `.error()`, `.warn()`, `.child()`
- **Never log a request body — log its length** (fixed 2026-08-11; RFC 9700 §4.2.4). `token.service.ts` and `revocation.service.ts` logged `body: parameters`, and `parameters` is preferentially `req.rawBody`, so the `client_secret` exclusion list in the fallback rebuild never ran on the real path. That wrote **client secrets, end-user passwords (ROPC), authorization codes, PKCE `code_verifier`s, refresh tokens, JWT `assertion`s and token-exchange `subject_token`/`actor_token`** to `logs/app-*.log` — at `info`, which is the rotating file transport's level in production, retained 14 days. The callable logger is `info` unless `LOG_LEVEL=debug`, so this was never debug-only. The pattern to copy is `introspection.service.ts`: `{ length: parameters.length }` and nothing else. `clientId` is fine to log; `clientSecret` is not. Locked by `tests/unit/services/credential-logging.test.ts`, which drives six grant shapes plus both client-auth channels through a spy logger — extend it rather than adding a new log line to these services.
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
- **`/api/jar/process` is a debugging surface, and it is admin-only because of what the upstream response contains** (2026-08-13, B1-W1/B1-W2). No RFC defines this endpoint — it exists so a learner can post a Request Object and see how Authlete parsed it. It used to be unauthenticated and return `res.json(result)`, the entire `/auth/authorization` response, which carries a **`ticket`** (a credential — whoever holds one can drive an authorization to completion), the full `service` configuration and the `client` object. It now requires `requireBasicAuth("jar")`, checked **before** the Authlete call, and returns an **allowlist**: `action`, `resultCode`, `resultMessage`, `responseContent`, `scopes`. Allowlist, not denylist, so the next field the SDK adds cannot leak by default. `resultMessage` and `scopes` are kept deliberately — they are the endpoint's whole pedagogical value (`[A005328]` on a bad signature; what the signed object asked for), and Module 05's lab reads exactly those. `action` now maps to a status (`BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500, everything else→200) instead of always answering 200.
- **RFC 9701 JWT introspection works, and the `rsUri` requirement is the part people miss** (2026-08-13, MS-W1 = 9701-W1). `Accept: application/token-introspection+jwt` on `/api/introspection/standard` returns a signed JWT with that media type — verified live: `typ: token-introspection+jwt`, `alg: RS256`, `kid: rsa-1`, claims `iss`, `aud`, `iat`, `token_introspection`. It signs with the RSA key **T1-2** registered; before that there was no RSA key to sign with. **The JWT form additionally requires `rsUri` in the request body** — without it Authlete answers `[A404301] The URI of the resource server is required when a JWT introspection response is requested.` That 400 is passed through **on purpose**: `rsUri` becomes the `aud`, naming the resource server that asked, and this server has no honest way to guess which one that is. **Do not default it.** And do not send `rsUri` on the non-JWT path either: the vendored spec says that when it is present and the token carries audience values, Authlete returns `active: false` if the two do not match — so an unconditional `rsUri` would silently report audience-restricted tokens as inactive. The action previously fell through `default:` and answered **500**, the only live 500 among the FAPI 2.0 Message Signing requirements.
- **Every `jwt.verify` passes `issuer` and `audience`, and an unconfigured expectation refuses rather than proceeds** (the rule, 2026-08-13, JOSE-W1). A signature check answers *"who signed this"*. It never answers *"were they allowed to say it"*, or *"was this addressed to me"* — those are `iss` and `aud`, and `jsonwebtoken` checks neither unless you ask. Both live call sites now pass them: `utils/verify-id-token-hint.ts` (the worked example, T0-2) and `controllers/logout.controller.ts`. **The second half of the rule is the one that gets skipped**: when the expected issuer or audience is not configured, the correct behaviour is to *refuse the request*, not to omit the option — omitting it silently downgrades the check to "any issuer, any audience", which looks identical in the code and in the logs. T0-2 declined to fall back to an unset `JWT_ISSUER` for exactly this reason; the back-channel receiver answers **500** when `BACKCHANNEL_LOGOUT_ISSUER` / `BACKCHANNEL_LOGOUT_AUDIENCE` are missing. Note `jwt.decode` is *not* verification and appears deliberately in three places (`verify-id-token-hint.ts`, `logout.controller.ts`, `jwt-verification.service.ts`) only to read a `kid` or a `sub` from an object whose signature is checked separately or elsewhere.
- **Back-channel logout: two env vars, and they are not `JWT_ISSUER`** (2026-08-13). `BACKCHANNEL_LOGOUT_ISSUER` is the *other* OP's issuer identifier and `BACKCHANNEL_LOGOUT_AUDIENCE` is this deployment's `client_id` **there**, because on this endpoint the server is an **RP**, not the OP. Reusing `jwt.issuer` — which describes tokens this server mints — would compare an incoming token against our own identity and pass nothing legitimate. **The receiving endpoint terminates sessions by subject** (`utils/session-store.ts`), and the two supported session stores disagree about what `Store.all()` returns: express-session's MemoryStore yields an **object keyed by session id** whose values carry no `id`, while connect-redis yields an **array** with `sess.id` attached. Handling only one silently terminates nothing against the other, so both shapes are normalised; a test runs the real MemoryStore rather than trusting the reading. **A token carrying only `sid` is accepted and acts on nothing** — this OP issues no `sid` of its own (Session Management is declined), so there is nothing to match; that is a gap in what can be acted on, not grounds to reject a conformant token.
- **PKCE is required on two clients and deliberately optional on two others — do not "fix" the latter** (2026-08-13, `RFC7636-pkce.md`). RFC 9700 §2.1.1 says clients MUST use PKCE, and this deployment now enforces it where enforcement costs nothing:

  | Client | `pkceRequired` / `pkceS256Required` | Why |
  |---|---|---|
  | `4277838306` (SPA) | **true / true** | The SPA sends `S256` already (`AuthFlowsSection.tsx:140`) |
  | `2176571218` (`private_key_jwt`) | **true / true** | Created by T1-3; no lab depends on it |
  | `1523514379` (`$CLIENT_ID`) | false / false | **Module 02 teaches the plain code flow.** Enforcing here deletes the lesson |
  | `1678274156` (`$PUB_CLIENT_ID`) | false / false | **Module 03 shows what the plain flow costs**, which needs a client that permits it |

  Verified live at all four: a request with no `code_challenge` to an enforcing client is refused with `[A124301]`, `code_challenge_method=plain` with `[A124308]`, and both teaching clients still reach `INTERACTION` without any challenge. **Note the refusals arrive as `action: LOCATION` — an error *redirect*, not a body** — because `response_type` is present; that is the `response_type`-dependent error channel documented under **Quirks & gotchas**, and it is why the labs see a redirect with `error=invalid_request` rather than JSON. The two `false` rows are curriculum infrastructure: changing them silently breaks Modules 02 and 03, and nothing in the build or tests will say so.
- **CIMD (Client ID Metadata Document)**: Authlete handles CIMD entirely server-side — when `clientIdMetadataDocumentSupported: true`, an HTTPS URL as `client_id` triggers automatic metadata fetch and client registration. No new endpoints or client code needed. Surfaced in FAPI config/status endpoints and client UI. [CIMD spec](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
