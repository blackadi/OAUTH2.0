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

- **OAuth 2.0 grants**: Authorization Code (confidential + PKCE), Client Credentials, Password (ROPC), Refresh Token
- **OpenID Connect**: Discovery (`/.well-known/openid-configuration`), JWKS, Userinfo (signed JWT), ID Token, RP-Initiated Logout
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
| `LOGOUT_CLIENT_ID` | — | Client ID for logout view |
| `LOGOUT_REDIRECT_URI` | — | Post-logout redirect |
| `LOG_LEVEL` | `debug` (dev), `info` (prod) | Winston log level |
| `JWT_PUBLIC_KEY_PEM` | — | Required if `ACCESS_TOKEN_TYPE=jwt` |
| `JWT_PRIVATE_KEY_PEM` | — | Required if `ACCESS_TOKEN_TYPE=jwt` |

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
- The Authlete SDK (`@authlete/typescript-sdk`) wraps the Authlete REST API. Controllers call SDK methods; the SDK calls Authlete; the server formats the response.
- The React SPA in `client/` is a comprehensive testing dashboard exercising all OAuth/OIDC endpoints, grant types, and token management operations. It never has access to the Authlete API key.

## File Structure

```
server/
├── src/
│   ├── server.ts                        # Entry point
│   ├── app.ts                           # Express app (middleware stack, route mounting)
│   ├── config/
│   │   ├── app.config.ts                # Env var loading via dotenv
│   │   └── authlete.config.ts           # Authlete SDK client initialization
│   ├── controllers/                     # Request handlers per endpoint
│   │   ├── authorization.controller.ts
│   │   ├── authorization-response.controller.ts
│   │   ├── authorization-response.handler.ts
│   │   ├── token.controller.ts
│   │   ├── token-issue.controller.ts
│   │   ├── token-fail.controller.ts
│   │   ├── token-exchange-response.handler.ts
│   │   ├── token-fail-response.handler.ts
│   │   ├── token-issue-response.handler.ts
│   │   ├── token.management.controller.ts
│   │   ├── session.controller.ts
│   │   ├── userinfo.controller.ts
│   │   ├── userinfo-issue.controller.ts
│   │   ├── userinfo-issue-response.handler.ts
│   │   ├── introspection.controller.ts
│   │   ├── introspection-standard.controller.ts
│   │   ├── revocation.controller.ts
│   │   ├── logout.controller.ts
│   │   ├── discovery.controller.ts
│   │   └── jwks.controller.ts
│   ├── services/
│   │   ├── authlete.service.ts          # Authlete API client singleton
│   │   ├── token.operations.service.ts  # Token management CRUD
│   │   └── userinfo.service.ts          # Userinfo processing + issuing
│   ├── routes/                          # Express Router definitions
│   │   ├── authorization.routes.ts
│   │   ├── token.routes.ts
│   │   ├── userinfo.routes.ts
│   │   ├── introspection.routes.ts
│   │   ├── revocation.routes.ts
│   │   ├── session.routes.ts
│   │   ├── jwks.routes.ts
│   │   ├── discovery.routes.ts
│   │   ├── logout.routes.ts
│   │   ├── routes-list.routes.ts        # /api/routes and /api/routes.json
│   │   └── default.routes.ts            # Catch-all for index page
│   ├── middleware/
│   │   ├── session.ts                   # express-session config
│   │   └── errorHandler.ts              # Global error handler (JSON for /api/*)
│   ├── views/                           # EJS templates
│   │   ├── index.ejs                    # Dashboard page
│   │   ├── login.ejs                    # Login form
│   │   ├── consent.ejs                  # Consent form
│   │   ├── logout.ejs                   # Logout page
│   │   ├── error.ejs                    # Error page
│   │   ├── routes.ejs                   # Standalone routes page
│   │   └── partials/
│   │       ├── head.ejs                 # HTML head + CSS
│   │       └── routes-table.ejs         # Reusable routes table partial
│   ├── types/
│   │   ├── express.d.ts                 # req.id / req.logger augmentation
│   │   └── express-session.d.ts         # Session shape
│   └── utils/
│       ├── logger.ts                    # Winston logger
│       ├── crypto.ts                    # PKCE helpers
│       ├── jwksClient.ts                # JWKS fetch utilities
│       ├── jwtAssertionValidator.ts     # JWT assertion validation
│       └── createLocalJWT.ts            # Local JWT creation
├── public/
│   └── css/style.css                    # All styles (responsive, dark theme)
├── patches/
│   └── @authlete+typescript-sdk+1.1.6.patch  # SDK Zod passthrough fix
├── logs/                                # Daily-rotated log files (gitignored)
├── .env.example
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
│       ├── LogoutSection.tsx            # RP-Initiated Logout test
│       └── DiscoverySection.tsx         # OIDC config + JWKS fetchers
```

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/authorization` | OAuth authorization endpoint (triggers login flow) |
| `POST` | `/api/authorization/issue` | Authlete callback — authorization issue |
| `POST` | `/api/token` | Token endpoint — code exchange, refresh, client credentials |
| `POST` | `/api/token/issue` | Authlete callback — token issue |
| `POST` | `/api/token/fail` | Authlete callback — token failure |
| `POST` | `/api/token/create` | Create token via management API |
| `DELETE` | `/api/token/delete/:id` | Delete token by identifier |
| `GET` | `/api/token/list` | List tokens |
| `PATCH` | `/api/token/update` | Update token scopes |
| `POST` | `/api/token/revoke` | Revoke token via management API |
| `POST` | `/api/token/reissue` | Reissue ID token |
| `GET` | `/api/token/createLocalToken` | Create locally-signed JWT |
| `GET` | `/api/userinfo` | Userinfo (token in Authorization header) |
| `POST` | `/api/userinfo` | Userinfo (token in body or header) |
| `POST` | `/api/userinfo/issue` | Authlete callback — userinfo issue |
| `POST` | `/api/introspection` | Authlete-specific token introspection |
| `POST` | `/api/introspection/standard` | RFC 7662 introspection |
| `POST` | `/api/revocation` | RFC 7009 token revocation |
| `GET` | `/api/session/login` | Login page |
| `POST` | `/api/session/login` | Login form submission |
| `GET` | `/api/session/consent` | Consent page |
| `POST` | `/api/session/consent` | Consent form submission |
| `GET` | `/.well-known/openid-configuration` | OIDC Discovery document |
| `GET` | `/.well-known/jwks.json` | JSON Web Key Set |
| `GET` | `/api/logout` | RP-initiated logout |
| `POST` | `/api/backchannel_logout` | Backchannel logout callback |
| `GET` | `/api/routes` | Routes dashboard |
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

See [`CURL-TEST.md`](CURL-TEST.md) for a complete test suite covering all endpoints.

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

```bash
# End-to-end curl test suite — copy-paste each section or run as a standalone script
# Note: Replace the example client IDs with your own Authlete credentials
source CURL-TEST.md  # or run each section individually
```

See [`CURL-TEST.md`](CURL-TEST.md) for the full test suite covering OpenID Discovery, JWKS, all grant types, introspection, revocation, token management, and RP-initiated logout.

## Known Limitations

- **Token management revoke**: Authlete's management API cannot always locate tokens created via the management endpoint — returns `A313301` (token not found). This is an Authlete API constraint.
- **No persistent session store**: In-memory sessions are lost on server restart. Configure Redis for production.
- **No CSRF protection**: The login/consent forms lack CSRF tokens. Not suitable for production without additional hardening.
- **Single-user demo auth**: The built-in auth uses a static user list from `AUTH_USERS` env var. Replace with a real identity provider for production.

## License

This project is provided for educational purposes. Not production-ready. See LICENSE for details.
