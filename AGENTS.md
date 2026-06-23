# AGENTS.md — authlete-node-authz-server

## Repo structure

Two independent packages in `server/` and `client/`. No monorepo tooling — use `--prefix` or `cd`.

| Directory | What                      | Entrypoint                |
|-----------|---------------------------|---------------------------|
| `server/` | Express + Authlete SDK    | `src/server.ts`           |
| `client/` | React testing dashboard (Vite + SWC) | `src/main.tsx`      |

## Commands

```bash
# Server dev (ts-node-dev --respawn --transpile-only, no build needed)
npm --prefix server run dev

# Server production build + start
npm --prefix server run build && npm --prefix server run start

# Client dev (Vite on :3001, proxies /api -> localhost:3000)
npm --prefix client run dev

# Client production build
npm --prefix client run build

# Both install
npm --prefix server install && npm --prefix client install

# Render deploy build (builds both)
npm --prefix client run build && npm --prefix server run build
```

## Dev setup

1. Copy `.env.example` → `.env` in both `server/` and `client/`
2. Required env vars: `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID`, `SESSION_SECRET`
3. The `server` reads `.env` via `dotenv` (called in `src/config/app.config.ts` only)
4. Config validation fails fast on startup — missing `SESSION_SECRET`, `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, or `AUTHLETE_SERVICE_ID` throws immediately
5. Demo users default to `admin:password` if `AUTH_USERS` env var is not set. Set `AUTH_USERS=subject:username:password:name;sub2:user2:pass2:Name2` for custom users
6. Logout endpoint validates `post_logout_redirect_uri` against `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` env vars
7. Client `.env` should set `VITE_CLIENT_ID`, `VITE_REDIRECT_URI` — defaults to `your_client_id` placeholder

## Architecture notes

- All API routes under `/api` prefix (defined in `server/src/app.ts`)
- Server delegates OAuth logic to Authlete SDK (`@authlete/typescript-sdk`)
- Login/consent pages are server-rendered EJS (views in `server/src/views/`)
- Interactive OAuth flow: authorization → login → consent → redirect with code
- Session-based (express-session, in-memory store, 30-min expiry)
- Each request gets a unique ID (`req.id`) and per-request logger (`req.logger`)
- Server accepts both `application/json` and `application/x-www-form-urlencoded` on token endpoint
- `client/` Vite dev server proxies `/api` → `http://localhost:3000`
- Security headers set globally (X-Content-Type-Options, X-Frame-Options, XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS in production)
- CORS restricted to `http://localhost:3000,http://localhost:3001` by default (configurable via `ALLOWED_ORIGINS`)
- Admin token management under `/api/token/*` requires Basic auth with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` if set
- Grant Management API at `/api/gm/:grantId` (GET=query, DELETE=revoke) delegates to `authleteApi.grantManagement.processRequest()`. Bearer token required. Spec-compliant with [Grant Management for OAuth 2.0](https://openid.net/specs/oauth-v2-grant-management.html).
- Client dashboard stores tokens in sessionStorage via React Context (`src/context/TokenContext.tsx`)
- **Backchannel Logout**: Three POST endpoints at `/api/backchannel_logout/{issue,deliver,deliver-all}`. The Authlete SDK v1.1.6 does NOT expose the backchannel logout token API — raw `fetch()` to Authlete is used in `backchannel-logout.service.ts`. All three endpoints require admin Basic auth (`requireBasicAuth`). The existing `GET /api/logout?backchannel=true` triggers deliver-all server-side after session destruction. The receiving endpoint at `POST /api/backchannel_logout` (in `logout.routes.ts`) handles incoming logout tokens from other OPs — now properly destroys `req.session`.
- **Dynamic Client Registration (DCR)**: Four POST endpoints at `/api/client/dcr/{register,get,update,delete}`. Delegates to `authleteApi.dynamicClientRegistration.*` (SDK v1.1.6 includes these natively). `register` requires admin Basic auth (`MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`); `get`/`update`/`delete` use the registration access token in the request body (no admin auth). The `action` field in Authlete's response is mapped to HTTP status: `CREATED`→201, `OK`/`UPDATED`→200, `DELETED`→204, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500. The `responseContent` field is returned as the response body. See `DcrSection.tsx` in the client for the testing UI.
- **CIBA (Client-Initiated Backchannel Authentication)**: Four POST endpoints at `/api/ciba/{authentication,issue,fail,complete}`. Delegates to `authleteApi.ciba.*` (backchannel authentication, issue, fail, complete). No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body (passed to Authlete). The authentication endpoint receives URL-encoded `parameters` (containing `login_hint`, `scope`, etc.) plus `clientId`/`clientSecret`. It returns `USER_IDENTIFICATION` → 200 with `ticket`, `hintType`, `hint`, `deliveryMode`; or error statuses (500, 400, 401). The `issue` endpoint takes a `ticket` and returns `OK` → 200 with `authReqId`, `expiresIn`, `interval`. The `fail` endpoint takes `ticket` + `reason` and returns `FORBIDDEN` → 403, `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500. The `complete` endpoint takes `ticket` + `result` + `subject` and returns `NO_ACTION`→200 (poll mode) or `NOTIFICATION`→200 (ping/push mode). See `CibaSection.tsx` in the client for the testing UI. The Authlete Token endpoint natively supports `grant_type=urn:openid:params:grant-type:ciba` — no custom token endpoint needed for the polling phase.
- **PAR (Pushed Authorization Requests — RFC 9126)**: Single POST endpoint at `/api/par`. Delegates to `authleteApi.pushedAuthorization.*` (SDK v1.1.6 includes this natively). Accepts `parameters` (URL-encoded OAuth params), `clientId`, `clientSecret` in JSON body. No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body. Action mapped to HTTP status: `CREATED`→201, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `FORBIDDEN`→403, `PAYLOAD_TOO_LARGE`→413, `INTERNAL_SERVER_ERROR`→500. The response includes `requestUri` (the `request_uri` for the authorization call), `responseContent` (JSON with `expires_in`, `request_uri`). See `ParSection.tsx` in the client for the testing UI.

## Quirks & gotchas

- **No tests exist** in either package
- **No linter configured.** Type checking is enforced at build time (tsconfig target: ES2022)
- `server/tsconfig.json` compiles to CommonJS; `client/tsconfig.json` uses ESNext modules (bundler)
- Build copies `public/` and `src/views/` into `dist/` via `postbuild` script — if you rename/move them, update that script
- All Authlete API calls go through the SDK client in `src/services/authlete.service.ts` — do not add raw `fetch()` calls
- The `server/logs/` directory is gitignored (except `.gitkeep`)
- SDK now at `@authlete/typescript-sdk@^1.1.6` (was `0.0.5-beta`)
- `dotenv` only loaded in `app.config.ts` (was duplicated in `authlete.config.ts`)
- All logging uses `const log = req.logger || logger;` pattern (no more `req.logger(...) || logger(...)` double-calls)
- No hardcoded credentials in source — login template passes empty strings
- Login page credentials moved to env var `AUTH_USERS` (defaults to `admin:password` demo user)
