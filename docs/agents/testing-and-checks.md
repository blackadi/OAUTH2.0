<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# Testing architecture, and the checks that guard it

> **Read this when** you are adding or changing a test, wondering why a gate passed something it
> should not have, or about to trust a green suite. Every subsection ends with what that check
> *cannot* see, which is the part worth knowing.

## Testing architecture

- **Vitest** runner, **Supertest** for HTTP integration tests
- 17 Authlete-dependent services accept `authleteApi` as optional constructor param (defaults to real SDK client)
- 2 services using raw `fetch()` (`backchannel-logout`, `metrics`) accept config as optional constructor param. `health` used to be a third: SDK 1.0.0 exposes `lifecycle.getApiLifecycleHealthcheck()` for `GET /api/lifecycle/healthcheck`, so it now goes through the SDK like every other Authlete call. `backchannel-logout` still cannot — the SDK exposes no backchannel logout token API (re-verified against 1.0.0)
- `app.ts` exports `createApp()` factory — tests build fresh app instances without `listen()`
- Integration tests use `vi.hoisted()` + `vi.mock()` to replace `authlete.service` module at import time
- Mock API defined in `tests/helpers/mock-authlete.ts` covers every SDK method
- **Unit tests**: 70 files across 7 categories (828 tests). **Counts are re-measured, not carried** — they read 62/662 until 2026-08-18, four months of growth behind the actual tree:
  - `tests/unit/services/` — 27 files, each service in isolation with mocked SDK (includes consent-store, device, hsk, metrics, par, userinfo). One file is a cross-service invariant rather than a service: `credential-logging.test.ts` asserts no request body reaches a log line (see **Quirks & gotchas**)
  - `tests/unit/controllers/` — 14 files, token/authorization/authorization-fail-response/DCR/backchannel-logout/device/hsk/introspection/vci/native-sso-response and others
  - `tests/unit/middleware/` — 6 files, error handler, session, audit-log, csrf, require-basic-auth, require-grant-ownership (plus `development-only.ts`, covered via `tests/unit/routes/device.routes.test.ts`)
  - `tests/unit/utils/` — 12 files, basic-auth/createLocalJWT/jwksClient/properties/validate/validation/dpop/verify-id-token-hint/step-up/session-store and others
  - `tests/unit/routes/` — 7 files, fapi + metrics + openapi + protected-resource-metadata + device + introspection + logout routes
  - `tests/unit/config/` — 1 file, `app.config.test.ts`, which asserts **the default itself** (`NODE_ENV` absent ⇒ `production`) — the `development-only` tests mock the config module and so can never see it
  - `tests/unit/views/` — 2 files, `consent-rar.test.ts` and `login.test.ts`. Both render the **real** `.ejs` file, which is the only kind of test here that can see a template throw or silently drop what a controller passed it
- **Integration tests**: 7 files (302 tests) — full Express stack with mocked SDK, via `createApp()`. `routes.test.ts` is the general one; the other six were written to drain the route-coverage backlog and each drives one module's routes **through its middleware chain**, asserting the auth posture first: `client.routes.test.ts` (16 routes), `admin-surfaces.routes.test.ts` (token/HSK/federation/JAR/device-consent/health/route-index, 16), `vci.routes.test.ts` (10), `backchannel-logout.routes.test.ts` (4), `native-sso.routes.test.ts` (2), `root.routes.test.ts` (2). **Prefer adding to these over a new controller test** when the thing under test is a gate, a status mapping or a route parameter — a controller test calls the handler directly and cannot see any of it
- **E2E tests**: 1 file `tests/e2e/e2e.test.ts` (**101 tests: 99 pass, 2 skipped outside development**) —
  real Authlete API, 26 section headers fixed for sequential numbering. The two skips are the device-flow
  approval chain, which drives the development-only `POST /api/device/complete`.

  > **This suite rots silently, and on 2026-08-20 it was found 11 of 100 failing.** Every failure was a
  > stale expectation from an intentional change — T1-11's spec-shaped bodies (PAR, DCR, Device), CIBA-W3's
  > client-auth channel, T1-1's introspection gate, T1-10's protected-resource challenge, T1-14/15's
  > fail-closed back-channel receiver, and the 2026-08-10 development-only gate on device completion. Not one
  > was a server defect. It had been red for **ten days**.
  >
  > **The cause is structural: nothing runs it.** It is not in `ci.yml` — deliberately, since it spends real
  > Authlete quota and trips the ~15-call rate limit — and this file tells you not to run it casually. So the
  > usual signal that a behaviour change needs a test update never fires here. **After any change to a
  > response body, a status mapping or an auth gate, assume e2e is stale until you have run it**, the same way
  > you would grep the curriculum. A green `npm test` says nothing about this file.
  >
  > It also hid a genuine test bug for far longer: the DCR update had **never** sent a conformant RFC 7592
  > §2.2 request — the metadata document must contain `client_id`, and sending only the changed field earns
  > `[A214301]`.
- Run with `npm --prefix server run test` — **1130 tests across 77 files**, completes in ~3s. **Do not carry these numbers forward from memory; re-run and read them.** Client: `npm --prefix client run test` — **1117 tests across 81 files** (measured 2026-08-23), plus `test:coverage` (ratcheted thresholds), `check:theme`, `check:codes`, `check:docs`
- E2E uses `vitest.e2e.config.ts` — run via `npm --prefix server run test:e2e` or `npx vitest run --config vitest.e2e.config.ts`
- E2E tests conditionally skip blocks based on env vars: `CID`/`SEC` (confidential), `PUB_CID` (public), `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` (management)

### Two mechanical checks — run both, and know what each cannot see

```bash
node scripts/check-docs.mjs           # offline: source refs, bare paths, md line refs, prose pointers, endpoint paths, links, anchors. CI runs this on every push
node scripts/check-docs.mjs --links   # also fetches external URLs. CI runs this weekly, not per-push
node scripts/check-route-coverage.mjs # every route is named by some test. CI runs this on every push
node scripts/check-discovery.mjs      # offline: the discovery baseline is sorted, deduped, consistent with the claim map. Every push
node scripts/check-discovery.mjs --live          # member drift BY NAME + README claims vs the live document. Weekly
node scripts/check-discovery.mjs --live --update # re-baseline. Review the reported diff FIRST
```

**Three checks, and `check-discovery.mjs` is the newest (2026-08-17) — it exists because a *count* is
not evidence.** On 2026-08-17 the discovery document measured **66** members against the **65** recorded on
2026-08-15, and the extra member could not be attributed: August had kept a count and not a list. So
`scripts/discovery-baseline.json` stores the **member list**, and drift is reported by name. A count tells
you something changed; only a list tells you *what*.

It does a second job the first two cannot: it asserts that **every feature `README.md` marks as working has
its discovery member present, and every feature marked declined does not.** That second half is the guard
against the DR-03 failure — a flag switched on without its paired doc change. Two design rules worth keeping:

- **Live mode is weekly, not per-push.** An Authlete configuration change is somebody else's action; it is
  not a reason to fail somebody's pull request. Same argument as `--links`.
- **It states what it cannot see, in `NOT_VISIBLE`.** `fapiModes`, `accessTokenSignAlg` and `dpopNonceRequired`
  have **no discovery member**, and `pkceRequired`/`idTokenSignAlg` are **per client** — so roughly half of any
  profile's requirements are invisible to `/.well-known`, and a report written from discovery metadata alone
  scores those rows PASS when nobody checked them. Printing the list is the difference between a check and a
  false assurance.

**`check-route-coverage.mjs` exists because a green test suite proved nothing four times running.** During
the Phase 5 remediation, `POST /api/backchannel_logout` validated 5 of Back-Channel Logout §2.6's 11 required
steps and terminated nobody's session; `POST /api/jar/process` returned Authlete **tickets** — credentials —
to anonymous callers; `federation.service.ts` had no tests and *could not* have had any, because the shared
`tests/helpers/mock-authlete.ts` had no `federation` member while claiming to cover every SDK method. Each
was found by reading code, one at a time. **The question that finds them as a list is *"which routes does no
test mention?"***, and that is all this script asks.

**The backlog is drained: `scripts/route-coverage-baseline.json` is empty and all 92 routes are named by a
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

Covers **167 markdown files and ~1,400 references**. It catches the mechanically detectable drift only, and
**five of its six reference forms were added 2026-08-14** (T2-7 ⊃ CUR-3a-W1, CUR-3b-W5, CUR-3c-W11) — before
that it validated `file.ts:NNN` refs, relative links, anchors and external links, which was 103 references
out of the 1,400 now checked:

| Form | Example | Why it was missing |
|---|---|---|
| `file.ts:NNN` | `token.service.ts:59` | the original check |
| **bare path** | `client/src/pkce.ts` | no colon, so the original regex never saw it. This is how the audit cited `components/oidc/VciSection.tsx` for weeks while the file lived under `components/vci/` |
| **`file.md:NNN`** | `modules/05…/lab.md:97` | nothing validated markdown line refs at all — 216 of them |
| **prose pointer** | `Line ~89`, `(~line 74)` | no colon and no path adjacency the old form recognised. Caught two pointers **past end-of-file** on its first run |
| **endpoint path** | `/api/client/update/:clientId` | checked against the routes `routes/*.ts` mounts. Caught ~~`PUT /api/client/:clientId`~~ — wrong **method and path** — in two documents |
| external URL | `[text](https://…)` | opt-in, `--links` |

**Three conventions the checker had to learn, because rejecting them would mean rejecting the repo's own
documentation style.** Abbreviated paths come in two forms — an explicit ellipsis (`modules/09a…/lab.md`) and
a silent prefix (`modules/05/README.md`) — both resolved by unique-prefix matching per segment. Endpoints are
routinely named as **stems** without their parameters (`/api/client/update`), so a stem that prefixes a real
route passes. And a path or endpoint quoted **as wrong** must not be flagged: file paths use the small
`PATHS_DISCUSSED_NOT_REFERENCED` list, endpoints use **`~~strikethrough~~`**, which is better because the
document declares its intent at the point of use instead of in a list somebody must remember to prune.

> **What it still cannot see: 465 context-relative `file.md:NNN` refs.** A bare `lab.md:520` means *"the lab
> of the module this entry is about"*, and resolving it means guessing the subject. **The count is printed on
> every run** rather than omitted, so nobody mistakes the check for complete coverage.

**And one thing worth knowing about writing acceptance criteria.** CUR-3a-W1's read: *"A reference to
`client/src/utils/pkce.ts` fails the check."* Implementing it makes **the sentence stating it** one of the
references that fails. A criterion phrased as an example of the defect cannot distinguish itself from the
defect.

Two design decisions worth keeping:

- **External links are checked on a schedule, not per push.** A third party moving a page is not a
  reason to fail somebody's pull request. **And only `404`/`410` fail it** (2026-08-17): `401`/`403` mean the
  server refused *us*, `429` means it rate-limited us, `5xx` means it is having a bad day — none of which
  is a dead link. They are printed as a ⚠️ list and never fatal. **Found the hard way:** the first weekly
  run to fail did so on **one** URL, `https://support.authlete.com`, which answers **403 to a bare request
  and 200 to a browser**. The page was fine throughout. A gate that cries wolf is a gate people learn to
  ignore, and this one had exactly one job a week.
- **Only markdown links (`[text](url)`) are fetched, never bare URLs.** A bare URL in a table or code
  block is *data* — an `iss` value, a sample redirect, a placeholder host — not a reference anyone
  follows. Narrowing to links removed 20 of 20 false positives on the first run. Reserved TLDs
  (`.example`, `.invalid`, `.test`, `.internal`) are skipped per RFC 6761/6762.

> **A line number that resolves is not a line number that is right.** The check asserts the file has that
> many lines, which is all it can do offline — so a `file.ts:NNN` that has drifted onto a *different*
> statement passes silently. Found on 2026-08-23: of the three `dpop.service.ts:NNN` refs in this file,
> **two already pointed at the wrong statement** before that day's edit moved them further, and every run
> of the checker had been green. When you edit a file, re-resolve the refs that name it rather than
> trusting the gate.

**A hit is a symptom, not the bug.** The `TOKEN-EXCHANGE-TUTORIAL.md` audit started with one 404 and
found wrong line numbers, fabricated test-coverage claims, and prose contradicting the curriculum behind
it. When this script reports something, check whether the surrounding claim is still true.
