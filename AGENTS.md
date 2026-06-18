# AGENTS.md — authlete-node-authz-server

## Repo structure

Two independent packages in `server/` and `client/`. No monorepo tooling — use `--prefix` or `cd`.

| Directory | What                      | Entrypoint                |
|-----------|---------------------------|---------------------------|
| `server/` | Express + Authlete SDK    | `src/server.ts`           |
| `client/` | React SPA (Vite + SWC)    | `src/main.tsx`            |

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
6. Logout view uses `LOGOUT_CLIENT_ID` and `LOGOUT_REDIRECT_URI` env vars (see `.env.example`)

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

## Quirks & gotchas

- **No tests exist** in either package
- **No linter configured.** Type checking is enforced at build time (tsconfig target: ES2022)
- `server/tsconfig.json` compiles to CommonJS; `client/tsconfig.json` uses ESNext modules (bundler)
- Build copies `public/` and `src/views/` into `dist/` via `postbuild` script — if you rename/move them, update that script
- All Authlete API calls go through the SDK client in `src/services/authlete.service.ts` — do not add raw `fetch()` calls
- The `server/logs/` directory is gitignored (except `.gitkeep`)
- SDK now at `@authlete/typescript-sdk@^1.0.0` (was `0.0.5-beta`)
- `src/utils/http.ts` was deleted — dead code, not imported anywhere
- `dotenv` only loaded in `app.config.ts` (was duplicated in `authlete.config.ts`)
- All logging uses `const log = req.logger || logger;` pattern (no more `req.logger(...) || logger(...)` double-calls)
- No dynamic `import()` calls remain (all converted to static imports)
- No hardcoded credentials in source — login template passes empty strings
- Login page credentials moved to env var `AUTH_USERS` (defaults to `admin:password` demo user)
