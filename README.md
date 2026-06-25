# Authlete Node.js Authorization Server

<p align="center">
  <img src="./authlete-server.jpg" alt="Authlete Server" width="300">
</p>

A Node.js OAuth 2.0 / OpenID Connect authorization server built with [Express](https://expressjs.com/) and the [Authlete TypeScript SDK](https://github.com/authlete/authlete-typescript-sdk). OAuth logic is delegated to Authlete's cloud API — the server itself is stateless and DB-less.

Two independent packages:

| Directory | Purpose | Stack |
|-----------|---------|-------|
| `server/` | Authorization server (backend) | Express + Authlete SDK + EJS views |
| `client/` | Testing dashboard for all OAuth/OIDC endpoints | React + Vite + SWC |

## Features

- **OAuth 2.0 grants**: Authorization Code (confidential + PKCE), Client Credentials, Resource Owner Password (ROPC), Refresh Token, JWT Bearer (`urn:ietf:params:oauth:grant-type:jwt-bearer`), Token Exchange (`urn:ietf:params:oauth:grant-type:token-exchange`)
- **OpenID Connect**: Discovery (`/.well-known/openid-configuration`), JWKS, Userinfo (signed JWT), ID Token, RP-Initiated Logout
- **Backchannel Logout**: Issue and deliver logout tokens following OIDC Back-Channel Logout 1.0 spec — standalone token generation, single-client deliver, deliver-to-all, and automatic trigger via `?backchannel=true` on RP-Initiated Logout
- **Grant Management for OAuth 2.0**: Query and revoke grants via RESTful API (`GET`/`DELETE /api/gm/:grantId`)
- **Dynamic Client Registration (DCR)**: Register, get, update, and delete OAuth clients per RFC 7591 / RFC 7592 (`/api/client/dcr/*`)
- **CIBA (Client-Initiated Backchannel Authentication)**: Backchannel authentication, issue, fail, and complete endpoints — poll/ping/push delivery modes
- **Device Flow (RFC 8628)**: Device authorization, verification, and complete endpoints — also includes an interactive browser verification page at `/device` for end-users to enter codes and authorize
- **Client Management API**: Full CRUD for OAuth clients — list, get, create, update, delete, rotate secrets, manage authorizations and scopes (`/api/client/*`)
- **Token management**: Introspection (RFC 7662 + Authlete-specific), Revocation (RFC 7009), token CRUD via Authlete management API
- **Interactive flow**: Server-rendered login and consent pages (EJS) with session state
- **Logging**: Per-request unique IDs, structured Winston logging, Morgan HTTP access logs
- **Dashboard**: Interactive routes page with copy-paste curl examples at `/api/routes`

## Prerequisites

- Node.js 18+
- npm
- An [Authlete](https://www.authlete.com/) account with a configured service and API bearer token

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> && cd authlete-node-authz-server
npm --prefix server install
npm --prefix client install
```

### 2. Configure environment

Copy the template in both packages:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Required variables in `server/.env`:

| Variable | Description |
|----------|-------------|
| `AUTHLETE_BEARER_TOKEN` | Authlete API key (from Authlete Console) |
| `AUTHLETE_BASE_URL` | Authlete API base URL, e.g. `https://eu.authlete.com` |
| `AUTHLETE_SERVICE_ID` | Your Authlete service numeric ID |
| `SESSION_SECRET` | Random string for session encryption |

Optional variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `NODE_ENV` | `development` | Enables production HSTS headers when `production` |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | CORS origins |
| `AUTH_USERS` | `admin:password` | Demo users in `subject:username:password:name;...` format |
| `LOGOUT_REDIRECT_URI` | `http://localhost:3000` | Default post-logout redirect URI |
| `LOGOUT_CLIENT_ID` | — | Client ID for logout view |
| `LOG_LEVEL` | `debug` (dev), `info` (prod) | Winston log level |
| `MORGAN_FORMAT` | `combined` | Morgan HTTP access log format |
| `MGMT_CLIENT_ID` | — | Basic auth user for management APIs (token mgmt, DCR register, backchannel logout, client mgmt) |
| `MGMT_CLIENT_SECRET` | — | Basic auth password for management APIs |
| `JWKS_URI` | — | External JWKS URI to verify incoming backchannel logout tokens |
| `JWT_PUBLIC_KEY_PEM` | — | Public key for locally-signed JWTs (dev only) |
| `JWT_PRIVATE_KEY_PEM` | — | Private key for locally-signed JWTs (dev only) |
| `JWT_ISSUER` | — | JWT issuer for locally-signed tokens (dev only) |

Optional variables in `client/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3000` | Authlete server URL for API calls |
| `VITE_CLIENT_ID` | `your_client_id` | Pre-fills the client ID on the dashboard |
| `VITE_CLIENT_SECRET` | `your_client_secret` | Pre-fills the client secret on the dashboard |
| `VITE_REDIRECT_URI` | `http://localhost:3001/callback` | OAuth redirect URI for the test dashboard |
| `VITE_SCOPES` | `openid profile email` | Default scopes for test flows |
| `VITE_DEV_CLIENT_PORT` | `3001` | Dev server port for Vite |
| `VITE_DEV_CLIENT_HOST` | `localhost` | Dev server host for Vite |
| `VITE_PROD_API_BASE_URL` | (falls back to `VITE_API_BASE_URL`) | Production API base URL override |
| `VITE_PROD_REDIRECT_URI` | (falls back to `VITE_REDIRECT_URI`) | Production redirect URI override |

E2E test env vars (set in shell, not in `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `CID` | Yes (for E2E) | Confidential client ID registered in Authlete |
| `SEC` | Yes (for E2E) | Confidential client secret |
| `PUB_CID` | Yes (for E2E) | Public client ID registered in Authlete |
| `REDIR` | No | Redirect URI for E2E flows (default: `http://localhost:3000`) |

### 3. Start the server

```bash
npm --prefix server run dev
```

The server starts on `http://localhost:3000`. Open `http://localhost:3000/api/routes` to see all endpoints with copy-paste curl commands.

### 4. (Optional) Start the demo client

```bash
npm --prefix client run dev
```

The client SPA starts on `http://localhost:3001`. In development, Vite proxies `/api` requests to the server. The client also supports absolute URLs via `VITE_API_BASE_URL`.

## Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  Client     │────▶│  Express Server      │────▶│  Authlete    │
│  (SPA /     │     │  (server/src/)       │     │  Cloud API   │
│   curl)     │◀────│                      │◀────│              │
└─────────────┘     │  ┌────────────────┐  │     └──────────────┘
                    │  │ Authlete SDK   │  │
                    │  │ (delegates to  │  │
                    │  │  Authlete API) │  │
                    │  └────────────────┘  │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │ EJS Views      │  │
                    │  │ (login/consent │  │
                    │  │  /routes)      │  │
                    │  └────────────────┘  │
                    └──────────────────────┘
```

- The server **never stores tokens, clients, or user data locally** — all OAuth state lives in Authlete's cloud.
- The Authlete SDK (`@authlete/typescript-sdk`) wraps the Authlete REST API. Controllers call SDK methods; the SDK calls Authlete; the server formats the response. Some endpoints (backchannel logout issuing, health check) use raw `fetch()` to Authlete when the SDK does not expose the necessary method.
- Admin-protected endpoints (token management, DCR register, backchannel logout, client management) are gated by HTTP Basic auth with `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` — if those env vars are unset, the endpoints are unprotected.
- The React SPA in `client/` is a comprehensive testing dashboard exercising all OAuth/OIDC endpoints, grant types, DCR, CIBA, token management, and backchannel logout. It never has access to the Authlete API key.

## File Structure

```
server/
├── src/
│   ├── server.ts                             # Entry point — listens on PORT
│   ├── app.ts                                # Express app factory (createApp)
│   ├── config/
│   │   ├── app.config.ts                     # Env var loading via dotenv, server config
│   │   └── authlete.config.ts               # Authlete SDK config + JWT JWKS settings
│   ├── controllers/                          # Request handlers
│   │   ├── authorization.controller.ts       # GET /api/authorization
│   │   ├── authorization-response.handler.ts # Shared authz response helper
│   │   ├── backchannel-logout.controller.ts  # POST /api/backchannel_logout/{issue,deliver,deliver-all}
│   │   ├── ciba.controller.ts               # CIBA authentication/issue/fail/complete
│   │   ├── client.management.controller.ts   # Client CRUD + secrets + scopes + authorizations
│   │   ├── dcr.controller.ts                # Dynamic Client Registration
│   │   ├── default.controller.ts            # GET /* — renders index.ejs
│   │   ├── discovery.controller.ts          # GET /.well-known/openid-configuration
│   │   ├── grant-management.controller.ts   # GET/DELETE /api/gm/:grantId
│   │   ├── health.controller.ts             # GET /api/health, GET /api/health/authlete
│   │   ├── introspection.controller.ts      # POST /api/introspection (Authlete-specific)
│   │   ├── introspection-standard.controller.ts # POST /api/introspection/standard (RFC 7662)
│   │   ├── jwks.controller.ts              # GET /.well-known/jwks.json
│   │   ├── logout.controller.ts            # RP-initiated logout + incoming backchannel logout
│   │   ├── par.controller.ts               # POST /api/par (RFC 9126)
│   │   ├── revocation.controller.ts        # POST /api/revocation (RFC 7009)
│   │   ├── session.controller.ts           # Login + consent form display and handling
│   │   ├── token.controller.ts             # POST /api/token (all grant types)
│   │   ├── token-fail-response.handler.ts  # Token fail response helper
│   │   ├── token-issue-response.handler.ts # Token issue response helper
│   │   ├── token-exchange-response.handler.ts # Token exchange response helper
│   │   ├── token.management.controller.ts  # Token CRUD + reissue + local signed JWT
│   │   ├── userinfo.controller.ts          # GET/POST /api/userinfo
│   │   ├── userinfo-issue-response.handler.ts # Userinfo issue response helper
│   │   └── userinfo-issue.controller.ts    # Userinfo issue helper
│   ├── services/                            # Business logic (all DI-friendly)
│   │   ├── authlete.service.ts             # Authlete SDK singleton
│   │   ├── authorization.service.ts        # Authlete authorization API wrapper
│   │   ├── backchannel-logout.service.ts   # Raw fetch() for logout token API
│   │   ├── ciba.service.ts                # CIBA SDK wrapper
│   │   ├── client.management.service.ts    # Client CRUD + secrets + scopes via SDK
│   │   ├── dcr.service.ts                 # DCR SDK wrapper
│   │   ├── discovery.service.ts           # Discovery SDK wrapper
│   │   ├── grant-management.service.ts    # Grant Management SDK wrapper
│   │   ├── health.service.ts             # Authlete health via raw fetch()
│   │   ├── introspection.service.ts      # Introspection + standard via SDK
│   │   ├── jwks.service.ts              # JWKS SDK wrapper
│   │   ├── jwt-verification.service.ts  # JWT bearer assertion verification (JWT_BEARER grant type)
│   │   ├── login.service.ts            # AUTH_USERS-based credential validation
│   │   ├── logout.service.ts           # RP-initiated logout + redirect validation
│   │   ├── par.service.ts             # PAR SDK wrapper
│   │   ├── revocation.service.ts      # Revocation SDK wrapper
│   │   ├── token.operations.service.ts # Token management CRUD via SDK
│   │   ├── token.service.ts           # Token endpoint via SDK
│   │   └── userinfo.service.ts        # Userinfo via SDK
│   ├── routes/                             # Express Router definitions
│   │   ├── authorization.routes.ts
│   │   ├── backchannel-logout.routes.ts
│   │   ├── ciba.routes.ts
│   │   ├── client.routes.ts               # 17 endpoints: CRUD + secrets + scopes + auth
│   │   ├── dcr.routes.ts
│   │   ├── default.routes.ts
│   │   ├── discovery.routes.ts
│   │   ├── grant-management.routes.ts
│   │   ├── health.routes.ts
│   │   ├── introspection.routes.ts
│   │   ├── jwks.routes.ts
│   │   ├── logout.routes.ts               # RP-initiated + incoming backchannel logout
│   │   ├── par.routes.ts
│   │   ├── revocation.routes.ts
│   │   ├── routes-list.routes.ts          # /api/routes and /api/routes.json
│   │   ├── session.routes.ts
│   │   ├── token.routes.ts                # Token + management endpoints
│   │   └── userinfo.routes.ts
│   ├── middleware/
│   │   ├── session.ts                     # express-session config (30-min, secure in prod)
│   │   └── errorHandler.ts                # JSON for /api/*, EJS for HTML routes
│   ├── types/
│   │   ├── express.d.ts                   # req.id / req.logger augmentation
│   │   └── express-session.d.ts           # Session shape (user, authorization, secret)
│   ├── utils/
│   │   ├── createLocalJWT.ts             # Dev-only local JWT signer
│   │   ├── env.ts                        # Shared required() helper for env vars
│   │   ├── jwksClient.ts                # JWKS fetcher with cache
│   │   ├── logger.ts                    # Winston logger (daily rotation)
│   │   └── validate.ts                  # Request parameter validation
│   └── views/                            # EJS templates
│       ├── index.ejs                    # Dashboard
│       ├── login.ejs                    # Login form
│       ├── consent.ejs                  # Consent form
│       ├── logout.ejs                   # Logout page
│       ├── error.ejs                    # Error page
│       ├── routes.ejs                   # Routes listing
│       └── partials/
│           ├── head.ejs                 # HTML head + CSS
│           └── routes-table.ejs         # Reusable routes table
├── tests/                                # Test suites
│   ├── setup.ts                         # Global test env defaults
│   ├── helpers/
│   │   ├── mock-authlete.ts             # SDK mock for all 15+ SDK methods
│   ├── helpers/
│   │   └── mock-authlete.ts             # SDK mock for all 15+ SDK methods
│   ├── unit/services/                   # 18 files, 59 tests
│   │   ├── authorization.service.test.ts
│   │   ├── backchannel-logout.service.test.ts
│   │   ├── ciba.service.test.ts
│   │   ├── client.management.service.test.ts
│   │   ├── dcr.service.test.ts
│   │   ├── discovery.service.test.ts
│   │   ├── grant-management.service.test.ts
│   │   ├── health.service.test.ts
│   │   ├── introspection.service.test.ts
│   │   ├── jwks.service.test.ts
│   │   ├── jwt-verification.service.test.ts
│   │   ├── login.service.test.ts
│   │   ├── logout.service.test.ts
│   │   ├── par.service.test.ts
│   │   ├── revocation.service.test.ts
│   │   ├── token.operations.service.test.ts
│   │   ├── token.service.test.ts
│   │   └── userinfo.service.test.ts
│   ├── unit/controllers/               # 4 files, 30 tests
│   │   ├── authorization.controller.test.ts
│   │   ├── backchannel-logout.controller.test.ts
│   │   ├── dcr.controller.test.ts
│   │   └── token.controller.test.ts
│   ├── unit/middleware/                # 2 files, 14 tests
│   │   ├── errorHandler.test.ts
│   │   └── session.test.ts
│   ├── unit/utils/                     # 3 files, 19 tests
│   │   ├── createLocalJWT.test.ts
│   │   ├── jwksClient.test.ts
│   │   └── validate.test.ts
│   ├── integration/
│   │   └── routes.test.ts               # 23 tests, full Express stack with mocked SDK
│   └── e2e/
│       └── e2e.test.ts                  # 37 tests, real Authlete API
├── public/
│   └── css/style.css                    # All styles (responsive, dark theme)
├── patches/
│   └── @authlete+typescript-sdk+1.1.6.patch  # SDK Zod passthrough fix
├── logs/                                # Daily-rotated log files (gitignored)
├── .env.example
├── vitest.config.ts                     # Unit + integration test config
├── vitest.e2e.config.ts                # E2E test config
└── package.json                         # postinstall: patch-package

client/
├── src/
│   ├── main.tsx                         # React entry point
│   ├── App.tsx                          # Router + TokenProvider wrapper
│   ├── config.ts                        # Env-based endpoint config
│   ├── styles.css                       # Global styles (dark theme)
│   ├── pkce.ts                          # PKCE verifier/challenge generation
│   ├── context/
│   │   └── TokenContext.tsx             # Global token state + sessionStorage
│   ├── services/
│   │   └── api.ts                       # All OAuth/OIDC API methods
│   ├── pages/
│   │   ├── Dashboard.tsx                # Main dashboard with all sections
│   │   └── CallbackPage.tsx             # Auth code callback + PKCE exchange
│   └── components/
│       ├── TokenVault.tsx               # Stored token display + copy/decode
│       ├── AuthFlowsSection.tsx         # 4 grant types in one form
│       ├── TokenOpsSection.tsx          # UserInfo, introspection, revocation
│       ├── AdminSection.tsx             # Token management CRUD ops
│       ├── GrantManagementSection.tsx        # Grant Management (query/revoke)
│       ├── BackchannelLogoutSection.tsx       # Backchannel Logout (issue/deliver/deliver-all + JWT decoder)
│       ├── DcrSection.tsx                    # Dynamic Client Registration (register/get/update/delete)
│       ├── CibaSection.tsx                   # CIBA (authentication/issue/fail/complete)
│       ├── HealthSection.tsx                 # Health Check (server + Authlete)
│       ├── LogoutSection.tsx                 # RP-Initiated Logout test
│       ├── DiscoverySection.tsx              # OIDC config + JWKS fetchers
│       └── HelpPopover.tsx                   # Reusable documentation popover
```

## API Routes

### OAuth / OIDC Core

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/authorization` | OAuth authorization endpoint (triggers login flow) |
| `POST` | `/api/token` | Token endpoint — supports `authorization_code`, `client_credentials`, `password`, `refresh_token`, `urn:ietf:params:oauth:grant-type:jwt-bearer`, `urn:ietf:params:oauth:grant-type:token-exchange`, `urn:openid:params:grant-type:ciba` |
| `GET` / `POST` | `/api/userinfo` | Userinfo (signed JWT) — token in Authorization header or form body |
| `POST` | `/api/introspection/standard` | RFC 7662 token introspection |
| `POST` | `/api/introspection` | Authlete-specific token introspection (extended response) |
| `POST` | `/api/revocation` | RFC 7009 token revocation (works with confidential or public clients) |
| `GET` | `/api/logout` | RP-initiated logout (add `&backchannel=true` to auto-deliver backchannel logout) |
| `GET` | `/api/.well-known/openid-configuration` | OIDC Discovery document (RFC 8414) |
| `GET` | `/api/.well-known/jwks.json` | JSON Web Key Set (RFC 7517) |

### Interactive Session (Login / Consent)

| Method | Path | Description |
|--------|------|-------------|
| `GET` / `POST` | `/api/session/login` | Login page and form submission |
| `GET` / `POST` | `/api/session/consent` | Consent page and form submission |

### Token Management API

Protected by `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth if configured.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/token/list` | List all tokens |
| `POST` | `/api/token/create` | Create a token |
| `PATCH` | `/api/token/update` | Update token scopes |
| `POST` | `/api/token/revoke` | Revoke a token (by identifier) |
| `DELETE` | `/api/token/delete/:accessTokenIdentifier` | Delete a token by identifier |
| `POST` | `/api/token/reissue` | Reissue ID token |
| `GET` | `/api/token/createLocalToken` | Create a locally-signed JWT (no Authlete call) |

### Dynamic Client Registration (RFC 7591 / RFC 7592)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/client/dcr/register` | Register a new client — requires Basic auth (MGMT credentials) |
| `POST` | `/api/client/dcr/get` | Get registered client by registration access token |
| `POST` | `/api/client/dcr/update` | Update registered client |
| `POST` | `/api/client/dcr/delete` | Delete registered client |

### CIBA — Client-Initiated Backchannel Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ciba/authentication` | Initiate backchannel authentication (pass `parameters`, `clientId`, `clientSecret` in body) |
| `POST` | `/api/ciba/issue` | Issue `auth_req_id` from a validated ticket |
| `POST` | `/api/ciba/fail` | Fail a backchannel authentication request with a reason |
| `POST` | `/api/ciba/complete` | Complete backchannel authentication with end-user result |

### PAR — Pushed Authorization Requests (RFC 9126)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/par` | Push authorization parameters — returns `request_uri` for use in the authorization endpoint |

### Device Flow (RFC 8628)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/device/authorization` | Initiate device flow — returns `device_code`, `user_code`, `verification_uri` |
| `POST` | `/api/device/verification` | Verify a `user_code` — returns client info on VALID |
| `POST` | `/api/device/complete` | Complete device flow — `AUTHORIZED`, `ACCESS_DENIED`, or `TRANSACTION_FAILED` |
| `GET` | `/device` | Browser form for end-user code entry |
| `POST` | `/device` | Submit user_code for verification |
| `POST` | `/device/consent` | Authenticate user + complete authorization in one step |

### Grant Management for OAuth 2.0

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/gm/:grantId` | Query grant status (Bearer token with `grant_management_query` scope) |
| `DELETE` | `/api/gm/:grantId` | Revoke a grant (Bearer token with `grant_management_revoke` scope) |

### Backchannel Logout (OIDC Back-Channel Logout 1.0)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/backchannel_logout/issue` | Issue a logout token JWT — requires Basic auth (MGMT credentials) |
| `POST` | `/api/backchannel_logout/deliver` | Issue + deliver to one client |
| `POST` | `/api/backchannel_logout/deliver-all` | Issue + deliver to all clients with `backchannelLogoutUri` configured |
| `POST` | `/api/backchannel_logout` | Receiving endpoint — handles incoming logout tokens from other OPs |

### Client Management API

Protected by `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` Basic auth if configured.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/client/list` | List all registered clients |
| `GET` | `/api/client/get/:clientId` | Get a single client by ID |
| `POST` | `/api/client/create` | Create a new client |
| `PATCH` | `/api/client/update/:clientId` | Update an existing client |
| `DELETE` | `/api/client/delete/:clientId` | Delete a client |
| `PATCH` | `/api/client/flag/:clientIdentifier` | Update lock flag on a client |
| `POST` | `/api/client/secret/refresh/:clientIdentifier` | Rotate client secret |
| `PUT` | `/api/client/secret/update/:clientIdentifier` | Set client secret to a specific value |
| `GET` | `/api/client/auth/list/:subject` | List authorizations for a subject |
| `POST` | `/api/client/auth/update/:clientId` | Update authorizations for a client |
| `DELETE` | `/api/client/auth/delete/:clientId/:subject` | Delete authorizations for a client/subject pair |
| `GET` | `/api/client/scopes/granted/:clientId/:subject` | Get granted scopes |
| `DELETE` | `/api/client/scopes/granted/:clientId/:subject` | Delete granted scopes |
| `GET` | `/api/client/scopes/requestable/:clientId` | Get requestable scopes |
| `PUT` | `/api/client/scopes/requestable/:clientId` | Update requestable scopes |
| `DELETE` | `/api/client/scopes/requestable/:clientId` | Delete requestable scopes |

### Health & Utility

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health check — status, uptime, timestamp (no auth) |
| `GET` | `/api/health/authlete` | Authlete connectivity check (add `?extended=true` for DB check) |
| `GET` | `/api/routes` | Routes dashboard (HTML) |
| `GET` | `/api/routes.json` | Routes as JSON |

## Example Flows

All examples use the test client. Replace client IDs, secrets, and tokens with your own.

### Client Credentials (RFC 6749 §4.4)

```bash
curl -s -X POST http://localhost:3000/api/token \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

### Authorization Code + PKCE (RFC 7636)

Generate a code verifier and challenge:

```bash
CODE_VERIFIER="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXkdBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
```

Open in browser (Step 1 — authorization):

```
http://localhost:3000/api/authorization?response_type=code&client_id=PUBLIC_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=openid%20profile&state=s1&code_challenge=CHALLENGE&code_challenge_method=S256
```

After login + consent, extract the `code` from the redirect URL, then exchange (Step 2):

```bash
curl -s -X POST http://localhost:3000/api/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=CODE_FROM_REDIRECT" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=PUBLIC_CLIENT_ID" \
  -d "code_verifier=CODE_VERIFIER"
```

### Refresh Token (RFC 6749 §6)

```bash
curl -s -X POST http://localhost:3000/api/token \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN"
```

### Userinfo (OIDC §5.3)

```bash
curl -s http://localhost:3000/api/userinfo \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Introspection (RFC 7662)

```bash
curl -s -X POST http://localhost:3000/api/introspection/standard \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN" | jq
```

### Revocation (RFC 7009)

Choose the auth method that matches your client type (see [CURL-TEST.md](./CURL-TEST.md#client-types--what-you-need-to-know)):

**Option A — Confidential client** (authenticates via `client_secret_basic`):

```bash
curl -s -X POST http://localhost:3000/api/revocation \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN"
```

**Option B — Public client** (no secret, auth method = `none`):

```bash
curl -s -X POST http://localhost:3000/api/revocation \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=ACCESS_TOKEN&client_id=YOUR_PUBLIC_CLIENT_ID"
```

> **Common mistake:** Using Basic auth (`-u`) with a **public** client returns `invalid_client` (error `A157303`). Public clients have no secret — pass `client_id` in the request body instead.

### Dynamic Client Registration (RFC 7591)

Register a new OAuth client dynamically:

```bash
curl -s -X POST http://localhost:3000/api/client/dcr/register \
  -u "MGMT_CLIENT_ID:MGMT_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"json": "{\"client_name\": \"My App\", \"redirect_uris\": [\"http://localhost:3001/callback\"], \"grant_types\": [\"AUTHORIZATION_CODE\"]}"}' | jq
```

Expected: `action: "CREATED"` with `responseContent` containing `client_id`, `client_secret`, `registration_access_token`.

### CIBA — Backchannel Authentication

Step 1 — Initiate backchannel authentication:

```bash
CIBA_RESP=$(curl -s -X POST http://localhost:3000/api/ciba/authentication \
  -H "Content-Type: application/json" \
  -d '{"parameters": "login_hint=admin&scope=openid", "clientId": "YOUR_CLIENT_ID", "clientSecret": "YOUR_CLIENT_SECRET"}')
echo "$CIBA_RESP" | jq
CIBA_TICKET=$(echo "$CIBA_RESP" | jq -r '.ticket')
```

Step 2 — Issue `auth_req_id` from the ticket (after end-user identification):

```bash
curl -s -X POST http://localhost:3000/api/ciba/issue \
  -H "Content-Type: application/json" \
  -d "{\"ticket\": \"${CIBA_TICKET}\"}" | jq
```

Step 3 — Client polls the token endpoint with the `auth_req_id`:

```bash
curl -s -X POST http://localhost:3000/api/token \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:openid:params:grant-type:ciba" \
  -d "auth_req_id=AUTH_REQ_ID"
```

### PAR — Pushed Authorization Requests (RFC 9126)

Push authorization parameters to get a `request_uri`, then use it in the authorization endpoint:

```bash
PAR_RESP=$(curl -s -X POST http://localhost:3000/api/par \
  -H "Content-Type: application/json" \
  -d "{\"parameters\":\"response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/callback&scope=openid%20profile&state=par1\",\"clientId\":\"YOUR_CLIENT_ID\",\"clientSecret\":\"YOUR_CLIENT_SECRET\"}")
echo "$PAR_RESP" | jq -r '.requestUri'
```

Then use the `request_uri` in the authorization URL:
```
http://localhost:3000/api/authorization?client_id=YOUR_CLIENT_ID&request_uri=REQUEST_URI
```

See [`CURL-TEST.md`](CURL-TEST.md) and the [Vitest E2E suite](tests/e2e/e2e.test.ts) for complete test coverage.

## Session Handling

The server uses `express-session` (in-memory store) to track interactive authorization state:

- `req.session.user` — authenticated user subject
- `req.session.authorization` — OAuth authorization context (ticket, client ID, scopes)

**For production**, replace the in-memory store with Redis or PostgreSQL via `connect-redis` or `connect-pg-simple`.

## Error Handling

The global error handler (`server/src/middleware/errorHandler.ts`):

- Returns **JSON** for all `/api/*` routes — structured errors parsable by API clients
- Returns **HTML** for non-API routes (login, consent, error pages)
- Logs every error with request ID for traceability
- Stacks included in development; suppressed in production

## Security

- Security headers set globally: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- HSTS enabled in production (`Strict-Transport-Security`)
- CORS restricted to configured origins (default: localhost:3000, localhost:3001)
- Authlete API key never exposed to clients — all Authlete calls happen server-side
- Session cookie is `HttpOnly` and `SameSite=Lax`
- PKCE enforced for public clients

## Logging

| Channel | Format | Content |
|---------|--------|---------|
| Console (dev) | Colorized human-readable | All logs |
| Console (prod) | JSON with timestamps | All logs |
| `logs/app-*.log` | JSON | `info`+ level |
| `logs/error-*.log` | JSON | `error`+ level (30-day retention) |

Each request gets a unique ID (`req.id`) attached to all log entries via `express-request-id`. Use `req.logger` in controllers/services for request-scoped logging.

## SDK Patch

The `@authlete/typescript-sdk` v1.1.6 Zod codegen strips unknown properties from inbound schemas (`Key$inboundSchema`, `ServiceConfigurationApiResponse$inboundSchema`). This is fixed via `patch-package` — see [`server/patches/`](server/patches/%40authlete%2Btypescript-sdk%2B1.1.6.patch). The fix is applied automatically on `npm install` via the `postinstall` script.

## Development

```bash
# Start server with auto-reload
npm --prefix server run dev

# Start client SPA (Vite dev server on :3001)
npm --prefix client run dev

# Build for production
npm --prefix server run build && npm --prefix client run build
```

## Testing

Three testing approaches are provided:

### 1. Vitest (unit + integration) — 166 tests

**27 unit test files** in four categories:

| Category | Files | Tests | What's Tested |
|----------|-------|-------|---------------|
| Services | 18 | 59 | Each service in isolation with mocked Authlete SDK |
| Controllers | 4 | 30 | Request handlers (token, authorization, DCR, backchannel-logout) |
| Middleware | 2 | 14 | Error handler and session middleware |
| Utils | 3 | 19 | createLocalJWT, jwksClient, validate |

**1 integration file** (23 tests): Full Express stack via Supertest with SDK mocked at module level.

```bash
# Run all unit + integration tests
npm --prefix server run test

# Watch mode
npm --prefix server run test:watch

# Coverage report
npm --prefix server run test:coverage

# Unit tests only
npm --prefix server run test:unit

# Integration tests only
npm --prefix server run test:integration
```

### 2. Vitest E2E — 37 tests (real Authlete API)

Tests all 17 OAuth flows end-to-end against a running server with real Authlete credentials. Gracefully skips tests where credentials are missing.

```bash
# Requires real Authlete credentials in server/.env
npm --prefix server run test:e2e
```

### 3. Interactive curl test suite ([`CURL-TEST.md`](CURL-TEST.md))

Copy-paste individual curl commands to test each endpoint manually. Covers all OAuth/OIDC flows, grant types, PKCE, DCR, CIBA, PAR, token management, backchannel logout, and health. The embedded smoke test script at the bottom requires `CID`, `SEC`, and `PUB_CID` env vars. See [`CURL-TEST.md`](CURL-TEST.md) for details.

## Known Limitations

- **Token management revoke**: Authlete's management API cannot always locate tokens created via the management endpoint — returns `A313301` (token not found). This is an Authlete API constraint.
- **No persistent session store**: In-memory sessions are lost on server restart. Configure Redis for production.
- **No CSRF protection**: The login/consent forms lack CSRF tokens. Not suitable for production without additional hardening.
- **Single-user demo auth**: The built-in auth uses a static user list from `AUTH_USERS` env var. Replace with a real identity provider for production.
- **CIBA must be enabled in Authlete Console**: The backchannel authentication endpoints return 404/400 if CIBA is not enabled on your Authlete service. Enable it via Authlete Console under Service > Authorization > CIBA settings.
- **Device Flow requires Authlete service configuration**: The `deviceAuthorizationEndpoint`, `deviceVerificationUri`, `deviceFlowCodeDuration`, `deviceFlowPollingInterval`, and `supportedGrantTypes` (including `DEVICE_CODE`) must be configured via the Authlete admin API or Authlete Console. The server exposes no admin UI for this — configure it using the service update API or the Console.
- **DCR requires mgmt auth**: The `register` endpoint requires `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` to be configured (or unprotected if empty). The `get`/`update`/`delete` endpoints use the registration access token instead.
- **No notification delivery for CIBA push mode**: When CIBA complete returns `NOTIFICATION`, the server should POST to `clientNotificationEndpoint`. This is not implemented — the response is returned to the caller instead.

## License

This project is provided for educational purposes. Not production-ready. See LICENSE for details.
