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
npm --prefix server run test              # unit + integration (1130 tests, 77 files)
npm --prefix server run test:watch        # watch mode
npm --prefix server run test:coverage     # run with coverage report
npm --prefix server run test:unit         # unit tests only (828 tests, 70 files)
npm --prefix server run test:integration  # integration tests only (302 tests, 7 files)
npm --prefix server run lint               # ESLint (flat config, 0 errors)
npm --prefix server run typecheck          # TypeScript check (tsc --noEmit, 0 errors)
npm --prefix server run test:e2e          # E2E (101 tests, requires real Authlete creds)

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
7. Client `.env` should set `VITE_CLIENT_ID`, `VITE_REDIRECT_URI` — defaults to `your_client_id` placeholder. **Leave `VITE_CLIENT_SECRET` empty**: the SPA's own client is public, and the literal `your_client_secret` is recognised as a placeholder and treated as absent (`secretOrEmpty` in `client/src/config.ts`) — see the public-client bullet under **DPoP & Client Auth**
8. Optional Redis: `docker compose up -d` + set `REDIS_URL=redis://localhost:6379` in `server/.env`

## Where the rest of this lives

**This file is the obligation. `docs/agents/` is the explanation.** Everything below in this file
applies to every change; the linked files carry the detail for one area and are meant to be read when a
task touches that area. Nothing that is expensive to get wrong has been moved behind a link — if a rule
appears only in a linked file, it is because breaking it costs a wasted round trip rather than a
security defect or a broken lab.

| Read this | When |
|---|---|
| [`docs/agents/server-endpoints.md`](docs/agents/server-endpoints.md) | Touching any `/api` route — action→status mappings, auth posture, response shape, and where this deployment departs from the spec it advertises |
| [`docs/agents/client-spa.md`](docs/agents/client-spa.md) | Changing anything under `client/src/` — the transport boundary, the session-key owner, the four debugging surfaces, the theme tokens |
| [`docs/agents/dpop-and-client-auth.md`](docs/agents/dpop-and-client-auth.md) | Touching a DPoP proof, a client credential, or how an access token is presented at a protected resource |
| [`docs/agents/quirks.md`](docs/agents/quirks.md) | Something behaves in a way the specification does not explain, or **before "simplifying" anything in the server** |
| [`docs/agents/testing-and-checks.md`](docs/agents/testing-and-checks.md) | Adding or changing a test, or wondering why a gate passed something it should not have |
| [`docs/agents/curriculum-contract.md`](docs/agents/curriculum-contract.md) | **Before** changing server behaviour or Authlete configuration — see the warning below |
| [`docs/agents/authlete-service-config.md`](docs/agents/authlete-service-config.md) | Changing a service flag, or needing to know why one is set as it is |
| [`docs/agents/doc-style.md`](docs/agents/doc-style.md) | Writing anything under `docs/` |

**About 45 files elsewhere say "see `AGENTS.md`" for something now in `docs/agents/`** — source comments,
tutorials, module labs. They were deliberately **not** rewritten to name the new files. Two reasons: the
sentence is still true, because this file remains the entry point and the table above routes in one hop;
and pointing 45 files at a directory layout would couple them to a structure that may change again,
which is how a reference goes stale in the first place. **The table is the router.** If you grep this
file for a rule and do not find it, the area file that holds it is named above.

## Rules that apply to every change

These are stated here in full rather than behind a link, because the cost of missing one is a security
defect, a broken lab, or spent vendor quota.

- **Never run `npm --prefix server run test:e2e`** unless explicitly asked. It spends real Authlete API
  quota and trips the ~15-call rate limit. It is deliberately absent from `ci.yml` for the same reason —
  which means **nothing runs it**, so after any change to a response body, a status mapping or an auth
  gate, assume it is stale. A green `npm test` says nothing about that file.
- **Use plan mode for any change whose *concern* is on the Security-critical surfaces list below**, not
  merely for changes to a file on it. A one-line change to token issuance needs a plan; a large refactor
  of `metrics.service.ts` does not. The only exemption is a semantics-free edit.
- **The SDK is pinned to the exact version `@authlete/typescript-sdk@1.0.0` — no caret.** `1.1.5`/`1.1.6`
  are numerically higher but are *older code*; widening to `^1.0.0` resolves up and silently
  reintroduces three bugs. A Dependabot `ignore` rule blocks that "upgrade", and GitHub's releases page
  showing v1.1.6 as "Latest" is stale metadata. `patch-package` was removed and **must not come back** —
  all three of its fixes are native to 1.0.0. See `docs/DEVELOPMENT.md` → SDK Version Pin.
- **No raw `fetch()` to Authlete.** Everything goes through the SDK client in
  `src/services/authlete.service.ts`. Exactly one *call* is exempt —
  `backchannel-logout.service.ts`'s `callAuthleteIssueToken`, because the SDK exposes no backchannel
  logout token API. Check the SDK before writing a `fetch`.
- **Never log a request body — log its length.** `token.service.ts` and `revocation.service.ts` once
  logged `body: parameters`, which wrote client secrets, end-user passwords, authorization codes, PKCE
  verifiers, refresh tokens and JWT assertions to a 14-day-retained log at `info`. Copy
  `introspection.service.ts`: `{ length: parameters.length }` and nothing else.
- **Never commit `.env` files or real Authlete credentials, tokens or client secrets.** Redact them in
  logs, docs and examples.
- ⚠️ **Some behaviour in this repo is intentionally wrong because a module teaches it.** Fixing it
  silently breaks a lab, and **nothing in the build or the test suites will tell you** — labs are prose.
  The table of what is deliberate, and the grep recipes to run after changing server behaviour *or*
  Authlete configuration, are in
  [`docs/agents/curriculum-contract.md`](docs/agents/curriculum-contract.md). Read it before you change
  server behaviour, not after.
- **Verify every spec citation against the primary source before writing it.** Never cite from recall.
  Label each reference by status (published RFC, active Internet-Draft with revision and date consulted,
  OpenID final, implementer's draft, or vendor behaviour), and distinguish Authlete implementation
  behaviour from normative requirements wherever both are in play. Mark anything unverified inline as
  `UNVERIFIED` and say so.

## Checks, and what each cannot see

Run all of these before proposing a commit. **Re-measure counts; never quote them from documentation.**

```bash
# server — all three must be clean
npm --prefix server run typecheck && npm --prefix server run lint && npm --prefix server run test

# client
npm --prefix client run typecheck && npm --prefix client run lint && npm --prefix client run format
npm --prefix client run test && npm --prefix client run test:coverage && npm --prefix client run build
npm --prefix client run check:theme      # every semantic colour utility is mapped, both palettes agree
npm --prefix client run check:codes      # the vendor code table still matches docs/openapi-spec.json
npm --prefix client run check:docs       # every getDoc key exists and every entry is reachable
npm --prefix client run check:contrast   # WCAG AA in BOTH themes, from the built stylesheet
npm --prefix client run test:visual      # Playwright, Chromium + Firefox, starts its own server

# repo
node scripts/check-docs.mjs              # source refs, bare paths, md line refs, endpoints, links
node scripts/check-route-coverage.mjs    # every route is named by some test
node scripts/check-discovery.mjs         # the discovery baseline, BY NAME rather than by count
```

**What they cannot see, in one place**, because every one of these has let a real defect through:

- **A green suite is not a working screen.** Typecheck, lint, test and build cannot see a CSS class that
  does not exist, a screen that never renders, a doc entry nobody asks for, or a vendor table drifting
  from its source. That is what the four `check:*` scripts and the Playwright pass are for.
- **A route *named* by a test is not a *tested* route.** `check-route-coverage.mjs` measures reference,
  not assertion quality — a smoke detector, not a fire inspection. And **a controller test calls the
  handler directly and never touches the middleware chain**, so it cannot see an auth gate at all.
- **A line number that resolves is not a line number that is right.** `check-docs.mjs` asserts the file
  has that many lines, which is all it can do offline. Re-resolve the refs naming a file you edited.
- **A count is not evidence.** `check-discovery.mjs` exists because the discovery document's member
  *count* changed and nobody could say which member. Keep the list, not the number.
- **An auth gate added on the server is a client change too**, and the documentation being right is not
  the client being right. Nothing asks "does the SPA still send what this route now requires?"

For the detail behind each — and for the client's own three-layer test strategy — see
[`docs/agents/testing-and-checks.md`](docs/agents/testing-and-checks.md).

## Security-critical surfaces

Changes here decide whether a token is issued, to whom, and on what proof. A wrong edit is a
security bug, not a rendering glitch — and because this repo teaches OAuth, it also propagates
into other people's mental models. Treat these as review-before-edit, **regardless of diff size**:
a one-line change to token issuance outweighs a large one anywhere else.

| Concern | Files |
|---------|-------|
| Token issuance | `services/token.service.ts`, `controllers/token.controller.ts`, `services/token.operations.service.ts`, `controllers/token.management.controller.ts`, `controllers/token-exchange-response.handler.ts`, `services/jwt-verification.service.ts` |
| Client authentication | `utils/basic-auth.ts`, `services/par.service.ts`, `middleware/require-basic-auth.ts` |
| DPoP / proof-of-possession | `utils/dpop.ts`, `client/src/services/dpop.service.ts` |
| Authorization & consent | `services/authorization.service.ts`, `controllers/authorization.controller.ts`, `controllers/session.controller.ts` (ACR / `auth_time` binding), `utils/validate.ts` |
| Token presentation & introspection | `services/userinfo.service.ts`, `services/introspection.service.ts`, `controllers/introspection.controller.ts`, `controllers/introspection-standard.controller.ts` |
| Access control | `middleware/require-grant-ownership.ts`, `middleware/csrf.ts`, `middleware/development-only.ts`, `middleware/require-basic-auth.ts`, `routes/device.routes.ts`, `controllers/jar.controller.ts` |
| Session termination & redirect targets | `services/logout.service.ts`, `controllers/logout.controller.ts` |
| **Failure disclosure & status derivation** | `middleware/errorHandler.ts` |

Paths are under `server/src/` unless noted. **Not** on this list, despite living in the same
directories: `metrics`, `health`, `discovery`, `jwks`, `federation`, `vci`, `hsk` — ordinary changes
there need no special ceremony. **`controllers/fapi.controller.ts` is deliberately excluded too**: it
*reports* the security posture, it does not decide outcomes, and its tests pin it against both a hardened
and an unhardened service — stronger protection than a review gate (ruled 2026-08-14, DR-12).

> **`middleware/errorHandler.ts` has its own row on purpose, and the row title is the point** (added
> 2026-08-14, DR-12). Every other row names a *token or authorization* decision. This file decides
> **how a failure is reported and how much it discloses**, which is a different concern and would be
> invisible folded into any of the others. Three grounds: it sets the HTTP status of every failure in the
> application — all 57 SDK call sites plus every local throw, through `errorStatusFrom`; it is the **sole
> gate on stack-trace disclosure**, emitting `err.stack` when `isDevelopment`, so a wrong edit leaks stack
> traces in production; and **it has already produced one security-relevant defect** — every SDK validation
> failure served as HTTP 200, invisible to any monitor watching status codes. That file was edited without a
> plan precisely because it was not on this list.
>
> The objection — that a generic middleware invites ceremony over formatting — is answered by the two rules
> below plus `CLAUDE.md`'s existing exemption for semantics-free edits.

Two rules learned the hard way:

- **Size is not the trigger; the concern is.** Judging by diff size is how a "3-line cleanup" to
  `token.service.ts` turned out to change three behaviours, one of which altered how a malformed
  `Authorization` header interacts with body credentials.
- **A change described in an earlier plan's follow-up section is not an approved change.** A
  follow-up note is a pointer to work, not a reviewed design.
