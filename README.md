# Authlete Node.js Authorization Server

<p align="center">
  <img src="./authlete-server.jpg" alt="Authlete Server" width="300">
</p>

A Node.js OAuth 2.0 / OpenID Connect authorization server built with [Express](https://expressjs.com/) and the [Authlete TypeScript SDK](https://github.com/authlete/authlete-typescript-sdk). OAuth logic is delegated to Authlete's cloud API — the server is stateless and DB-less.

| Package | Purpose | Stack |
|---------|---------|-------|
| `server/` | Authorization server | Express + Authlete SDK + EJS |
| `client/` | OAuth debugging SPA | React + Vite + SWC + Tailwind v4 |

## Quick Start

```bash
npm --prefix server install && npm --prefix client install
cp server/.env.example server/.env && cp client/.env.example client/.env
# Edit server/.env with Authlete credentials, then:
npm --prefix server run dev    # Express on :3000
npm --prefix client run dev    # SPA on :3001 (proxies /api → :3000)
```

**Required env vars:** `AUTHLETE_BEARER_TOKEN`, `AUTHLETE_BASE_URL`, `AUTHLETE_SERVICE_ID`, `SESSION_SECRET`

## Features

- **OAuth 2.0**: Auth Code (+PKCE), Client Credentials, ROPC, Refresh Token, JWT Bearer, Token Exchange
- **OIDC**: Discovery, JWKS, UserInfo (signed JWT), ID Token, RP-Initiated Logout
- **Extensions**: CIBA, Device Flow (RFC 8628), PAR (RFC 9126), DCR (RFC 7591/7592), Grant Management, Backchannel Logout
- **Admin**: Token management, Client CRUD, Prometheus metrics, structured audit logs, rate limiting, brute-force protection
- **Security**: CSRF tokens, security headers, CORS, session-based auth, request-level logging

## Documentation

| Document | Contents |
|----------|----------|
| [Architecture](docs/ARCHITECTURE.md) | System design, middleware pipeline, deployment topology, diagrams |
| [Data Flows](docs/DATA-FLOWS.md) | Authorization code flow, token variations, CIBA, Device, PAR, logout sequences |
| [API Reference](docs/API.md) | Complete endpoint catalog with request/response formats |
| [Component Reference](docs/COMPONENT-REFERENCE.md) | Server services/controllers + React component tree |
| [Testing](docs/TESTING.md) | 246 server tests + 17 client tests — architecture, mock strategy, patterns |
| [Development](docs/DEVELOPMENT.md) | Setup, env vars, middleware stack, rate limits, CSRF, known quirks |

## Key Commands

```
npm --prefix server run dev         # Dev server (ts-node-dev, auto-reload)
npm --prefix server run test        # 246 tests (unit + integration)
npm --prefix server run lint        # ESLint (0 errors)
npm --prefix server run typecheck   # tsc --noEmit (0 errors)
npm --prefix client run dev         # Vite dev server on :3001
npm --prefix client run test        # 17 client tests
```

## License

Provided for educational purposes. See LICENSE for details.
