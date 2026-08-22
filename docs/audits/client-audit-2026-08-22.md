# `client/` Audit — 2026-08-22

Review panel: Staff Front-End Engineer · Principal Product Designer · Developer-Education Specialist.
Constraints C1–C9 from the commissioning prompt apply. Read-only on source; this file is the only write.

> ## ✅ Remediated — 2026-08-22
>
> **40 of 43 findings are fixed, tested and gate-verified.** The client suite went **420 → 571 tests**
> (53 files) and every gate is green: `tsc --noEmit`, `eslint --max-warnings 0` (now **type-aware**),
> prettier, coverage with new per-layer floors, `vite build`, and all five repo checks.
>
> Three findings are deliberately **not** fixed, each for a stated reason — see
> §10 *Remediation Record* at the end of this document, which lists every finding, what was done, and
> what was measured. Two of the audit's own recommendations were **evaluated and rejected on evidence**
> (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`: 124 diagnostics, zero defects between them),
> and the remediation found **four defects the audit had missed** — recorded there too.

**Contents** — §1 Executive Summary · §2 Observation Method & Coverage · §3 Scorecards (inside Phases
1–3) · §4 Findings Register · §5 Novice Walkthrough (inside Phase 2) · §6 Revamp Decision Rubric
(Phase 4) · §7 Roadmap (Phase 5) · §8 Open Questions for Odai · §9 Screenshots Requested.

---

## 1 · Executive Summary

**Verdict: iterate on the code, and build the missing narrative layer.** The revamp rubric scores
**9 / 24** — inside the "systematic refactor" band — but 4 of those 9 points are S5 (IA) and S6
(pedagogy), and the band's prescription, *"introduce a token/component layer"*, describes work this repo
has already done and gated in CI. Components score 1, tokens 1, styling 0. **Nothing needs rebuilding,
and a revamp would risk the four things this product is already best-in-class at.**

The codebase is in better shape than most audits find: text colour is 100% tokenised and clears WCAG AA
in **both** themes (measured, by running the repo's own gate); `transport.ts` is a single disciplined HTTP
egress; `errorDocs.ts` decodes 46 error codes, **26 reproduced live against this deployment**, and refuses
to invent one; `authParams.ts` documents 24 parameters with primary-source citations; `JwtInspector`
starts **unverified** on purpose.

The gap is not effort or care. It is that **the pedagogy is deep at the parameter and the error, and
absent at the flow as a narrative.** Eight of eleven High findings are pedagogy or IA.

**Top five findings**

1. **PED-04** · The token request has **0 of 6** parameters documented, no preview, no visible step — so
   the step where PKCE is *proven* rather than asserted is the one the tool does not teach.
2. **PED-05** · The authorization request **never enters the trace**: it is a navigation, and only
   `transport.ts` records. *"Each arrow is a request that actually happened"* is missing the one request
   the user built by hand.
3. **SEC-01** · The RFC 9207 mix-up check is a **prefix match**: `iss=https://oauth.example` passes
   against `https://oauth.example.com` — the `startsWith` class the server already removed from logout
   matching.
4. **PED-06** · `attack`/`attacker` appear **0 times** in ~2,100 lines of teaching prose. The threat
   reasoning exists in this repo's own code comments, never promoted into the UI.
5. **UX-09** · Six irreversible actions, **zero confirmations**. Four hit live Authlete; two clients
   reachable that way are curriculum infrastructure for Modules 02 and 03.

**If I had one day: P1-1** — record the authorization request and the callback redirect into the trace
store. Thirty lines, nothing to design, and it makes front-channel versus back-channel visible in the
four-lane diagram built to teach exactly that.

---

## 2 · Observation Method & Coverage


**No browser or screenshot tooling is available in this session.** I checked for Playwright, Puppeteer,
Chrome DevTools and `claude-in-chrome` MCP tools; none are exposed. Every visual, layout and responsive
claim in this report is therefore marked **`[INFERRED]`** and phrased as risk, derived from declared
Tailwind classes, the token stylesheet, and layout primitives in the JSX. Nothing in this report asserts
how the application *looks*.

Section 9 lists the specific screens and breakpoints to screenshot in order to convert the
highest-value inferences into observations.

**What I did run** (offline only, per C3): `npm --prefix client run typecheck`, `run lint`, `run test`,
`vitest run --coverage`, `vite build`, and the repo's four client checks (`check-theme-tokens`,
`check-client-docs`, `check-contrast`, `extract-authlete-codes --check`). **No e2e, no integration, no
server tests, no dev server, no Authlete calls.** No source file was modified (C1) — `git status` shows
only `docs/audits/` as new. `vite build` writes `client/dist/`, which is gitignored; nothing else on disk
changed.

---

## Phase 0 — Recon & Contract

### Baseline health

| Gate | Result |
|---|---|
| `tsc --noEmit` | **clean** |
| `eslint src/ --max-warnings 0` | **clean** |
| `vitest run` | **41 files, 420 tests, all pass, 7.9s** |

The numbers match what `AGENTS.md` records, re-measured rather than carried.

### Stack, as it actually is

| Concern | What is there | Note |
|---|---|---|
| UI runtime | React **19.2.7** + `react-dom` 19.2.7 | function components only; no class components except `ErrorBoundary` |
| Router | `react-router-dom` **7.18.0** | `Routes`/`Route`, 21 routes, `lazy()` per section |
| Build | Vite **8.2.0** + `@vitejs/plugin-react-swc` 4.3.3 | `sourcemap: true` in prod build |
| Styling | Tailwind CSS **4.3.3** via `@tailwindcss/vite` | tokens in `@theme inline`, `client/src/styles/globals.css:131-151` |
| Component primitives | hand-rolled, 17 files in `components/ui/` | `class-variance-authority` 0.7.1 + `clsx` + `tailwind-merge`; **no shadcn/ui, no Radix** |
| Icons | `lucide-react` **1.28.0** | |
| Forms | `react-hook-form` 7.84.0 + `@hookform/resolvers` 5.4.0 + `zod` 4.4.3 | **all three are installed and unused in `src/` — see ENG flag F-0.1** |
| Toasts | `sonner` 2.0.7 | |
| Server state | **none** — no TanStack Query, no SWR, no Redux | hand-rolled `useAsyncCall` (101 LOC) |
| Client state | React Context ×2 (`TokenContext`, `CredentialContext`) + local `useState` | |
| Data fetching | `services/transport.ts` → `services/http.ts` → 15 domain services | single egress point, deliberate |
| Tests | Vitest 4.1.11 + Testing Library (react 16.3.2, user-event 14.6.6, jest-dom 7.0.0) + jsdom 30 | coverage ratchet in `vitest.config.ts:38-52` |
| TS | TypeScript **6.0.3**, `strict: true` | see F-0.2 for what `strict` does *not* turn on |
| Lint | ESLint **10.8.0** flat config, `react-hooks` 7.1.1, `@typescript-eslint` 8.62 | **not type-aware — see F-0.3** |
| Node floor | `>=22` in `engines` | matches the repo-wide floor |

### Module map

```
client/src/
├── App.tsx (277)                 route table + SECTIONS group model; 20 lazy sections, 1 eager (CallbackPage)
├── main.tsx (25)                 mount, BrowserRouter, Toaster
├── config.ts (158)               62 endpoint constants + placeholder-secret handling + env accessors
├── pkce.ts (33)                  code_verifier/code_challenge (S256)
├── components/
│   ├── layout/ (413)             AppLayout (shell, header, mobile nav, trace drawer), Sidebar, SectionPanel,
│   │                             ErrorBoundary, AdminAuth
│   ├── auth/ (1229)              AuthFlowsSection (grant runner), AuthorizeRequestBuilder (28-param builder)
│   ├── oidc/ (2517)              11 sections: DCR, CIBA, PAR, RAR, JAR, Device, BackchannelLogout,
│   │                             Discovery, Federation, Logout, StepUp, TokenOps
│   ├── admin/ (1271)             TokenMgmt, ClientMgmt, GrantMgmt, Health
│   ├── fapi/ (558)               FAPI config/status + DPoP key tools + 4-step wizard
│   ├── mcp/ (647)                AS/PRM/CIMD metadata + 6-step wizard
│   ├── vci/ (538)                OID4VCI: discovery, offers, issuance
│   ├── trace/ (674)              TracePanel (request log drawer), SequenceView (ladder diagram)
│   └── ui/ (1357)                17 primitives: Button, Input, Select, Textarea, Badge, Card, TabBar,
│                                 Spinner, Skeleton, FlowDiagram, SplitPane, RequestBuilder, TokenVault,
│                                 JsonBlock, HelpPopover, OperationDescription, JwtInspector, ErrorExplainer
├── context/ (153)                TokenContext (sessionStorage-backed), CredentialContext (memory only)
├── data/ (2278)                  operationDocs (1291, 20 sections × 60 ops), authParams (344, 28 params),
│                                 errorDocs (324), claimDocs (149, 26 claims), authlete-codes.generated (69)
├── hooks/ (310)                  useAsyncCall, useClipboard, useServerStatus, useTheme, useTraces
├── pages/ (272)                  CallbackPage — the only non-section page
├── services/ (1699)              transport (egress), http (shapes), trace-store, session-keys, dpop-fetch,
│                                 crypto-utils, client-assertion, + 12 domain services
├── styles/globals.css (221)      two palettes, @theme inline token bridge
├── types/ (64)                   token.ts, api.ts, index.ts
└── utils/ (549)                  jwt (271, decode+verify), decode-error, flow-progress, curl, cn
```

### Size metrics

- **63 `.tsx` + 76 `.ts` + 1 `.css`**; **16,012 LOC** in `src/` excluding tests, **4,920 LOC** of tests.
- Files over 400 LOC — **9**:

| LOC | File |
|---|---|
| 1291 | `src/data/operationDocs.ts` |
| 647 | `src/components/mcp/McpSection.tsx` |
| 623 | `src/components/auth/AuthFlowsSection.tsx` |
| 606 | `src/components/auth/AuthorizeRequestBuilder.tsx` |
| 587 | `src/components/admin/ClientManagementSection.tsx` |
| 558 | `src/components/fapi/FapiSection.tsx` |
| 538 | `src/components/vci/VciSection.tsx` |
| 446 | `src/components/trace/TracePanel.tsx` |
| 412 | `src/components/oidc/RarSection.tsx` |

`operationDocs.ts` is data, not logic — its size is not a smell. The five 500+ LOC section components are.

### Client↔server contract

- **62 endpoint constants** in `config.ts:34-116`, consumed by 15 domain services under `services/`.
- Server mounts **90 routes** across 29 route files in `server/src/routes/`.
- **The contract is stringly-typed in both directions.** `types/` is 3 files / 64 LOC total:
  `TokenRequest`, `TokenResponse` (with `[key: string]: unknown`), `JwksResponse`, and four health
  shapes. There is **no shared type for**: the discovery document, introspection responses, JWT claim
  sets, OAuth error responses, DCR responses, PAR responses (that one is local to `par.service.ts`),
  client objects, or CIBA/Device/VCI payloads. No generated client, no zod parsing at the boundary
  despite zod being installed.
- **One dead endpoint constant**: `MCP_AS_METADATA_ENDPOINT` (`config.ts:110`) has **zero** consumers
  anywhere in `src/`. `mcp.service.ts` builds both well-known paths itself. This is a leftover, not a
  break — `AGENTS.md` records that all 62 constants *resolve to mounted routes*, which is a different
  question from whether anything calls them.

### Flags — things that make the rest of this audit harder or shape its findings

**F-0.1 · `react-hook-form`, `@hookform/resolvers` and `zod` are installed and never imported.**
Verified: zero imports of any of the three across `src/`. Every form in the app is hand-rolled
`useState` + manual validation. This matters for Phase 1 (there is no validation layer to assess) and
for any Phase 5 recommendation — the dependency is already paid for.

**F-0.2 · `strict: true`, but the sharp options are off.** `tsconfig.json` has no
`noUncheckedIndexedAccess`, no `exactOptionalPropertyTypes`, no `noImplicitOverride`,
no `noPropertyAccessFromIndexSignature`. Combined with `TokenResponse`'s `[key: string]: unknown`
index signature (`types/token.ts:22`), indexing into protocol payloads is unchecked by construction.

**F-0.3 · ESLint is not type-aware.** `eslint.config.js` sets `parserOptions` with `ecmaVersion` and
`sourceType` only — no `project` / `projectService`. So `@typescript-eslint`'s `no-unsafe-assignment`,
`no-unsafe-member-access`, `no-floating-promises` and `no-misused-promises` **cannot run**. In an app
whose whole job is handling untyped JSON from a protocol endpoint, those are exactly the rules that
would matter. `no-explicit-any` is set to `warn` (not `error`) but with `--max-warnings 0` it is
effectively an error — and only 2 `any` sites exist, both in DPoP/assertion crypto code.

**F-0.4 · There is no reading surface in the application.** This is the single most consequential
Phase 0 finding, because the commissioning prompt's responsive posture is built around a
reading/doing split:
- `/` **redirects** to `/auth-flows` (`App.tsx:265`). There is no landing page.
- There is **no** `/docs`, `/glossary`, `/learn` or `/about` route. Grepped; absent.
- **No route carries state.** Zero uses of `useSearchParams`, `useParams` or `location.search` outside
  `CallbackPage`, which reads `window.location.href` directly (`CallbackPage.tsx:37-49`). Section
  routes are bare paths.
- Therefore **a completed run cannot be shared, deep-linked, or exported** — and "a shareable or
  deep-linked view of a completed run" is explicitly named as a reading surface in the brief.

The consequence for Phase 3: the reading/doing classification will come out close to *20 doing
surfaces, 0 reading surfaces*. That is a finding about the product, not about the CSS, and I will
report it as such rather than generating twenty mobile-overflow findings against panes that were
never meant for a phone.

**F-0.5 · No container queries anywhere; 38 breakpoint prefixes total, in 13 of 63 components.**
`sm:` ×21, `lg:` ×12, `xl:` ×3, `md:` ×2. `SplitPane` — a two-pane inspector, the textbook
container-query case — is included in that 13. Phase 3 will assess this properly; recording the raw
count here so the later claim is anchored.

**F-0.6 · The pedagogy layer is real and wired everywhere, which changes what Phase 2 should look for.**
`operationDocs.ts` covers **20 of 20 sections and 60 operations**, and `getDoc` + `OperationDescription`
are called in **every** section component (verified: 20/20 have the import and a call site).
`authParams.ts` carries **28 parameter specs** each with a `spec` citation, a conformance word and a
note. `claimDocs.ts` covers 26 claims. `errorDocs.ts` has an OAuth table plus a CI-gated Authlete table.
So Phase 2 is not "is there any explanation" — it is **"is the explanation at the right altitude, in the
right place, and does it teach the attacker model or only the mechanism."**

**F-0.7 · No `dangerouslySetInnerHTML` anywhere.** The XSS surface around rendered protocol responses
is structurally closed. Phase 1's security axis will focus on token persistence and leakage instead.

**F-0.8 · No favicon and no app icon.** `index.html` has no `<link rel="icon">`; `public/` holds only
a `_redirects` file. Browsers will request `/favicon.ico` and 404. Minor, but it is a craft signal and
it is free to fix.

### Proposed depth-vs-breadth plan for Phases 1–3 (C9)

16k LOC across 139 files is auditable in full at the file level, but not line-by-line in every file.
My plan:

**Read in full** (the load-bearing logic, ~4,800 LOC): all of `services/`, all of `hooks/`,
`context/`, `utils/`, `types/`, `config.ts`, `pkce.ts`, `App.tsx`, `main.tsx`, `pages/CallbackPage.tsx`,
all 17 `components/ui/` primitives, all 5 `components/layout/`.

**Read in full — the pedagogy core** (Phase 2's subject, ~1,900 LOC): `data/authParams.ts`,
`data/errorDocs.ts`, `data/claimDocs.ts`, plus `AuthorizeRequestBuilder.tsx`, `JwtInspector.tsx`,
`ErrorExplainer.tsx`, `TracePanel.tsx`, `SequenceView.tsx`, `HelpPopover.tsx`,
`OperationDescription.tsx`, `FlowDiagram.tsx`.

**Read in full — the headline flow** (what a novice actually meets): `AuthFlowsSection.tsx`,
`CallbackPage.tsx`, `TokenVault.tsx`.

**Sample, declared as sampling:** the remaining 15 section components (~3,600 LOC). I will read
`ParSection` and `DeviceSection` in full as representatives of the "simple section" and "multi-tab
section" shapes, skim the other 13 for the specific patterns Phase 1 and 3 are looking for
(effect misuse, unmemoized derivation, inline colour literals, fixed widths, `as` casts, error
handling), and say explicitly in the report which were sampled rather than read.

**`operationDocs.ts` (1291 LOC):** read the 20 section headers and the `auth-flows`, `par`, `device`
and `token-ops` entries in full for Phase 2's parameter-explanation inventory; treat the rest as data
and spot-check.

**Phase 2 gets at least as much depth as Phase 1**, per the self-verification checklist. Concretely:
Phase 2 will produce a full parameter inventory for the authorization-code flow with an
explained/unexplained count, and a novice walkthrough traced against actual line numbers in
`AuthFlowsSection` → `CallbackPage` → `TokenVault`.


---

## Phase 1 — Engineering Review (Staff Front-End Engineer)

### What I ran, and what it measured

| Command | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint src/ --max-warnings 0` | clean |
| `vitest run` | 41 files / 420 tests pass |
| `vitest run --coverage` | 58.17 stmts · 54.05 branch · **46.5 funcs** · 58.75 lines (ratchet floor 57/53/45/58 — passes) |
| `vite build` | succeeds; bundle table below |
| `check-theme-tokens` · `check-client-docs` · `check-contrast` · `extract-authlete-codes --check` | all four pass |

### Axis scorecard

| # | Axis | Score | What drove it |
|---|---|:---:|---|
| 1 | Architecture & boundaries | **3/5** | Single HTTP egress and a clean `data/` → component split, against five 500+ LOC sections holding 16–33 `useState` each (ENG-14) |
| 2 | State & data flow | **3/5** | `useSyncExternalStore` for traces, session-key registry, derived-not-mirrored builder params — against two asymmetric session writes (ENG-04) and no server-state layer |
| 3 | TypeScript rigour | **2/5** | `strict` on and only 2 `any`, but 64 LOC of types for 62 endpoints, `zod` installed and unused, lint not type-aware (ENG-07) |
| 4 | Async & error handling | **4/5** | The strongest axis: `transport.ts` captures status/headers/timing, `ErrorExplainer` explains and refuses to guess. Docked for one unhandled throw (ENG-02) and for flattening the structured error to a string (ENG-08) |
| 5 | Rendering performance | **4/5** | Route splitting is real — largest section chunk is 3.9 kB gzip. Docked for unmemoized `JSON.stringify` and an unvirtualized 200-row trace list |
| 6 | Security posture in the browser | **3/5** | No `dangerouslySetInnerHTML`, sessionStorage not localStorage, memory-only admin credentials, shell-quoted cURL, fail-closed PKCE/state — against SEC-01 (High) and ENG-05 |
| 7 | Testing | **2/5** | Logic layer genuinely covered (`transport` 100%, `utils` 96%); the interactive surface at 1.5–20% function coverage while the gate passes (ENG-06) |
| 8 | Accessibility (code-level) | **2/5** | Skip link, `aria-current`, APG-correct `TabBar` roving tabindex, `HelpPopover` focus trap, all 11 `outline-none` paired with a ring — against zero live regions (A11Y-01), nested buttons (A11Y-02), no `<h1>` (A11Y-03) |
| 9 | Tooling & DX | **3/5** | Four bespoke checks that catch what tests cannot, plus a ratchet. Docked because none of them would have caught anything above: not type-aware, no a11y plugin, and the ratchet is satisfied at 5% section function coverage |

### Bundle composition (measured, `vite build`)

| Chunk | raw | gzip |
|---|---|---|
| `index` (eager entry) | 351.79 kB | **109.34 kB** |
| `operationDocs` (shared, loads on first section) | 73.61 kB | 21.44 kB |
| shared primitives chunk (named `Button`) | 50.29 kB | 16.87 kB |
| `AuthFlowsSection` | 38.58 kB | 11.62 kB |
| CSS | 51.55 kB | 8.93 kB |
| largest other section (`VciSection`) | 13.62 kB | 3.91 kB |

First screen ≈ 118 kB gzip, first section ≈ 160 kB gzip. Route-level splitting is working: no section exceeds 4 kB gzip. `operationDocs` is 21 kB gzip of prose downloaded on the first navigation — the pedagogy payload, and worth it. Production **ships sourcemaps** (1.6 MB for the entry chunk) — see ENG-12.

### Top 10 engineering findings, by severity

**SEC-01 · High · Security posture — the RFC 9207 mix-up check is a prefix match**
`client/src/pages/CallbackPage.tsx:112`

```
API_BASE_URL.startsWith(new URL(issParam).origin)
```

`startsWith` on an origin accepts any origin that is a *prefix* of the configured one. Measured with Node:
against `API_BASE_URL = https://oauth.example.com`, `iss=https://oauth.example.co` → **passes**, and
`iss=https://oauth.example` → **passes**. So a response from an authorization server whose origin is a
truncation of the expected one satisfies the check that exists to detect exactly that substitution.

Why it matters here specifically: this is the **same bug class the server already removed** — `AGENTS.md`
records `post_logout_redirect_uri` matching being changed away from `startsWith` after two live-verified
open-redirect payloads, and the file's own comment says *"RFC 9207 exists to catch exactly this."* A
teaching tool that models a prefix comparison in a mix-up defence teaches the prefix comparison.
The two existing tests (`CallbackPage.test.tsx:88,99`) check an obviously-different origin and an exact
match, so neither can see it.
**Recommendation:** `new URL(issParam).origin === new URL(API_BASE_URL).origin`. **Effort: S.**

**ENG-01 · High · Async — the authorization code is redeemed twice in development**
`client/src/pages/CallbackPage.tsx:35-229`, `client/src/main.tsx:10`

The code exchange runs inside `useEffect` with no once-guard (no ref latch, no `AbortController`), and
`main.tsx` wraps the tree in `React.StrictMode`. In development React mounts → unmounts → remounts, so
`processCallback()` fires twice against a **one-time** authorization code. The two requests race; the
second is refused (`invalid_grant`), and because `setState` lands in resolution order the later failure
can overwrite the earlier success.

Why it matters here: `npm --prefix client run dev` is the documented way to run this app, so development
*is* the learner's environment — and the failure mode is "the headline authorization-code + PKCE flow
appears broken when the user did everything right." Production is unaffected (`location` and
`setTokenSet` are both stable), which is why nothing has flagged it.
**Recommendation:** latch on a `useRef` keyed by the code, or move the exchange to an explicit
"Exchange code" action — which would also make the step inspectable, a Phase 2 win.
**Effort: S.**

**A11Y-01 · High · Accessibility — there are no live regions anywhere**
`aria-live`: **0**. `role="status"`: **0**. `role="alert"`: **3**, all of them the field-error span inside
`Input.tsx:35`, `Select.tsx:49`, `Textarea.tsx:35`.

Every one of the 20 sections works the same way: press a control, a request goes out, and the response
renders into a pane below. For a screen-reader user, **none of that is announced** — not "loading", not
"200, here is the token response", not "401, here is the challenge". The response is not decoration in
this product; it is the entire content.

This is architectural rather than cosmetic, and that cuts in the project's favour: the announcement
belongs in `useAsyncCall` (which every section already routes through) and in `SplitPane`'s right-hand
pane, so it is one or two changes rather than twenty.
**Recommendation:** a polite live region for results and an assertive one for errors, driven from
`useAsyncCall`'s state. **Effort: M.**

**ENG-02 · Medium · Async — a malformed `iss` hangs the callback page on a spinner**
`client/src/pages/CallbackPage.tsx:111-119`

`new URL(issParam)` throws `TypeError: Invalid URL` on `notaurl`, `""` or `http://` (verified). The call
sits at line 112; the `try` does not begin until line 131. The throw escapes `processCallback`, becomes an
unhandled rejection, and `state.loading` is never cleared — so the page shows the spinner and the text
"Exchanging authorization code for tokens…" forever, with no error and no way forward. It needs a
matching `state`, so this is robustness rather than an attack, but a truncated pasted callback URL or an
AS emitting a relative `iss` reaches it.
**Recommendation:** parse inside the existing `try`, or a `safeOrigin()` helper returning `null`.
**Effort: S.**

**ENG-03 · Medium · Correctness of the teaching material — the comment states the opposite of the code**
`client/src/pages/CallbackPage.tsx:106-112`

The comment says: *"a **missing** `iss` is reported rather than ignored, since silence would make the
check indistinguishable from not having one."* The code is `if (issParam && !…)` — a missing `iss` **is**
silently ignored. In a repo whose `CLAUDE.md` treats a wrong citation as propagating into other people's
mental models, a security comment that contradicts its own five lines of code is the same defect one
layer up. Either implement the stated behaviour or correct the comment; the first is better, because
`issSuppressed: false` on this service means a missing `iss` really is anomalous.
**Effort: S.**

**ENG-04 · Medium · State — a cleared client secret is not cleared**
`client/src/components/auth/AuthFlowsSection.tsx:182` and `:247`

```
if (clientSecret) writeKey(SESSION_KEYS.activeClientSecret, clientSecret);
if (acSecret)     writeKey(SESSION_KEYS.authzClientSecret, acSecret);
```

Both write when the value is present and **never remove it when it is not**. So: run the flow once with a
confidential client, empty the Client Secret field, run it again — `CallbackPage.tsx:159` reads
`readKey(authzClientSecret) || CLIENT_SECRET`, finds the stale secret, and sends `client_secret` for a
client that must send none. Authlete answers `[A157303]`, and the field the user is looking at is empty.

This is exactly the invisible-mode class `session-keys.ts` was written to end — its own header calls out
"a mode you cannot see and cannot reset" — reintroduced by a write with no else-branch.
**Recommendation:** `acSecret ? writeKey(…) : removeKey(…)` at both sites. **Effort: S.**

**A11Y-02 · Medium · Accessibility — nested `<button>` in the sidebar, on every route**
`client/src/components/ui/TokenVault.tsx:42` (expand toggle) contains `:57` (Clear tokens).

A `<button>` inside a `<button>` is invalid HTML: the parser hoists the inner one out of the outer, so the
rendered DOM is not the authored tree, and keyboard/AT behaviour is undefined. `e.stopPropagation()`
patches the mouse click and nothing else. `TokenVault` is the sidebar header, so this is on all 20 routes.
**Recommendation:** make the outer element a `<div>` with a `<button>` header, or move Clear outside.
**Effort: S.**

**A11Y-03 · Medium · Accessibility — no `<h1>`, and the document outline starts at `<h2>`**
`SectionPanel.tsx:35` renders every section title as `<h2>`; `Card.tsx:28` likewise; the product name in
`AppLayout.tsx:56` is a `<span>` inside a `<button>`. Sub-headings are five `<h4>` and one `<h3>`.
So each of the 20 pages presents a heading tree with no root and at least one skipped level. Route change
also does not move focus — which is separate from, and compounds, the missing live regions.
Worth crediting what *is* right: `TabBar.tsx:41` implements APG roving-tabindex arrow navigation and
`HelpPopover.tsx:77-129` implements a real focus trap with focus return. The gaps are in the shell, not
the widgets.
**Effort: S** for headings, **M** for route-change focus.

**ENG-05 · Medium · Security — "copy as cURL" leaks the authorization code and the access token**
`client/src/services/trace-store.ts:118-127`

`SENSITIVE_PARAMS` covers `client_secret`, `password`, `code_verifier`, `refresh_token`, `assertion`,
`client_assertion`, `subject_token`, `actor_token`. It does **not** cover:

| Missing param | Sent by | So the redacted cURL contains |
|---|---|---|
| `code` | `token.service.exchangeCodeForToken` | a live one-time authorization code |
| `token` | `revocation`, `introspection`, `introspectionStandard` | a live access or refresh token |

Both flow through `TracePanel.tsx:95` and `:262`, which is the export path *with redaction on*. Since
`refresh_token` is already on the list, omitting `token` — the parameter RFC 7662 §2.1 and RFC 7009 §2.1
define for exactly the same value — reads as an oversight rather than a decision.
**Recommendation:** add `code` and `token`. **Effort: S.**

**ENG-06 · Medium · Testing — the gate is green at ~5% function coverage of the interactive surface**
Measured per file:

| Component | % functions |
|---|---|
| `ClientManagementSection.tsx` | **1.53** |
| `AdminSection.tsx` | 3.12 |
| `McpSection.tsx` | 3.22 |
| `FapiSection.tsx` | 3.70 |
| `CibaSection.tsx` | 4.54 |
| `DcrSection.tsx` | 5.55 |
| `JarSection.tsx` | 9.09 |
| `VciSection.tsx` | 11.62 |
| `hooks/useAsyncCall.ts` | 42.85 funcs / **0 branch** |
| `ui/HelpPopover.tsx` | 15.38 |
| `ui/TokenVault.tsx` | 14.28 |

Two of these are the ones that matter most. `useAsyncCall`'s `describeError` is the function that turns
a 401-plus-`WWW-Authenticate` into the sentence all 20 sections display, and its three branches are **0%
covered**. `HelpPopover` is the delivery mechanism for the per-parameter explanations that are this
product's differentiator, at 15%.

The suite is honest about this — `sections.smoke.test.tsx:11-14` calls itself "a smoke detector, not a
fire inspection" — and the ratchet is behaving as designed. The finding is that **the ratchet cannot
distinguish 58% overall from 5% on the surface where the 2026-08-22 sweep found four dead flows**, and
nothing else asks the question either: `check-route-coverage.mjs` is server-side only.
**Recommendation:** a per-area function-coverage floor for `src/components/**`, plus a driven test per
section modelled on the four dead-flow classes. **Effort: L**, but P1-shaped rather than P0.

**ENG-07 · Medium · TypeScript — the protocol boundary is unchecked at compile time and unlintable**
`client/src/types/` is 64 LOC across 3 files against 62 endpoint constants. There is no type for the
discovery document, introspection responses, JWT claim sets, OAuth error responses, or the DCR / CIBA /
Device / VCI payloads; `TokenResponse` carries `[key: string]: unknown` (`types/token.ts:22`).
`zod@4.4.3` is a dependency and is imported **nowhere**. And `eslint.config.js` sets no
`parserOptions.project`, so `@typescript-eslint`'s `no-unsafe-member-access`, `no-unsafe-assignment`,
`no-floating-promises` and `no-misused-promises` cannot run at all.

For most apps that is a style debt. Here the untyped values *are* the subject matter — and a tool that
teaches people to read a token response should be able to state its shape. `services/token.service.ts:221`
shows the counter-example done right: `getJwks` is the one response that is validated, and its comment
explains why.
**Recommendation:** zod schemas for the six or seven response shapes the UI actually reads, at the
`transport` boundary; turn on the type-aware lint config. **Effort: M.**

### Also found, Low severity

| ID | Finding | Evidence |
|---|---|---|
| ENG-08 | `useDiscriminatedAsyncCall` returns `result: unknown`, so 13 sections cast or JSON-dump. The *loading* state is a discriminated label rather than boolean soup, which is right; the payload type is discarded | `hooks/useAsyncCall.ts:68` |
| ENG-09 | `TokenContext`'s value object is not memoized while `CredentialContext`'s is. Harmless today — `TokenProvider`'s only state is `tokenSet` — and a trap for whoever adds the second piece | `context/TokenContext.tsx:70-72` vs `context/CredentialContext.tsx:50` |
| ENG-10 | Four copy-confirmation `setTimeout`s are never cleared on unmount | `hooks/useClipboard.ts:11`, `ui/RequestBuilder.tsx:37`, `ui/JsonBlock.tsx:19`, `auth/AuthorizeRequestBuilder.tsx:235` |
| ENG-11 | `JsonBlock` runs `JSON.stringify(data, null, 2)` on every render, unmemoized — the discovery document is 66 members and the client list is unbounded | `ui/JsonBlock.tsx:13` |
| ENG-12 | Production build emits sourcemaps (entry map 1.6 MB). Defensible for an open-source teaching tool; flagged as a decision, not a defect | `vite.config.ts:26` |
| ENG-13 | The toggle deciding whether **real client secrets** reach the clipboard is labelled `reveal` / `redacted?` — one ambiguous word and a question mark | `ui/RequestBuilder.tsx:67-77` |
| ENG-14 | Five sections over 500 LOC mixing protocol orchestration, form state and markup. `useState` counts: `ClientManagementSection` **33**, `AuthFlowsSection` 24, `McpSection` 20, `DeviceSection` 19, `AdminSection` 18 | `admin/ClientManagementSection.tsx`, `auth/AuthFlowsSection.tsx`, `mcp/McpSection.tsx` |
| ENG-15 | `MCP_AS_METADATA_ENDPOINT` has zero consumers | `config.ts:110` |
| A11Y-04 | `prefers-reduced-motion` is referenced nowhere. Kept Low deliberately: the total motion is 5 animations (`animate-pulse` ×3 on a 6px dot, `animate-spin` ×2) and 29 transitions, 24 of them `transition-colors` — nothing vestibular | `styles/globals.css`, sweep across `src/**` |
| A11Y-05 | No `eslint-plugin-jsx-a11y`, so A11Y-01/02/03 were all invisible to lint | `eslint.config.js`, `package.json` |

### Where the three voices disagree

**On ENG-01's severity.** The engineer rates it Medium — it is development-only, production is provably
unaffected, and the fix is four lines. The education specialist rates it **High** and won: a novice
running `npm run dev`, following the documented path, can watch a correct flow report `invalid_grant`,
and the single most damaging thing a teaching tool can do is make correct behaviour look like a mistake.
The report carries it as High for that reason and says so.

**On ENG-12 (sourcemaps).** The engineer wants them off in production on principle. The designer and the
education specialist both want them **on**: the source is public on GitHub, and a learner who opens
DevTools on the deployment and finds readable, commented source is getting the product's core value.
Recorded as an open question for Odai rather than a finding to fix.

**On displaying unredacted `Authorization` headers on screen** (`ui/RequestBuilder.tsx:84`,
`trace-store.ts:98-101`). The engineer calls it a leak vector — a screenshot in a tutorial is as public as
a pasted cURL. The education specialist calls it essential: `AGENTS.md`'s two-channel client-auth table is
only legible if you can *see* which channel was used. Current behaviour — real on screen, redacted on
export — is the stated design, so this is not filed as a finding, only recorded as considered.


---

## Phase 2 — Pedagogical UX Audit (Developer-Education Specialist)

The product's reason to exist is explanation, so this phase is judged against that and nothing else.
The short version: **the explanation layer is real, cited, and better than every reference tool at the
level of the individual parameter and the individual error code — and it stops at four specific
boundaries, each of which is a composition gap rather than a build.**

### Pedagogy scorecard

| Axis | Score | One-line verdict |
|---|:---:|---|
| P1 · Flow coverage | **4/5** | 20 sections, 19 specs. Token Exchange (RFC 8693) is absent despite the server implementing it |
| P2 · Step granularity | **2/5** | `FlowDiagram` is used in **3 of 20** sections; 8 sections render an ordered sequence as peer tabs |
| P3 · Parameter explanation — authorization request | **5/5** | 24/24 with spec, section, conformance word, and deployment-specific note. Best-in-class |
| P4 · Parameter explanation — token request | **0/5** | 0 of 6 parameters documented or previewed, in the step where PKCE is actually proven |
| P5 · Wire-level fidelity | **3/5** | Excellent for everything `fetch` touches; the front-channel authorization request never enters the trace at all |
| P6 · Progressive disclosure | **4/5** | A genuine three-rung ladder — summary → popover → raw. Docked because rung 1 is a form, not an orientation |
| P7 · Attacker-model-first | **1/5** | "attack"/"attacker": **0 occurrences** in ~2,100 LOC of teaching prose. The threat reasoning exists — in code comments, for maintainers |
| P8 · Error as teaching moment | **4/5** | 20 spec codes + 26 live-verified vendor codes, cause/fix/spec, never invented. Docked because it is context-free and 2 sections don't use it |
| P9 · Conceptual scaffolding | **2/5** | 26 claim definitions reachable from exactly one component; no glossary; no definition of front-channel, confidential client, bearer, sender-constrained |
| P10 · The "so what" moment | **1/5** | Success renders a `JsonBlock` and stops. **Zero** cross-section guidance strings in the codebase |
| P11 · Reproducibility & sharing | **2/5** | Redacted markdown export and copy-as-cURL are real; deep-linking and shareable runs do not exist (F-0.4) |

### P1 — Flow coverage

Nineteen specifications have a section: RFC 6749 (5 grants), 7636, 7591/7592, 7662, 7009, 8414, 8628,
9101, 9126, 9396, 9449, 9470, 7523, OIDC Core, RP-Initiated Logout, Back-Channel Logout, CIBA, OIDC
Federation, OID4VCI, plus MCP and Grant Management. That is broader than any of the four reference tools.

**PED-01 · Medium · RFC 8693 Token Exchange has no section.** The only trace of it in the client is a
dropdown option, `admin/AdminSection.tsx:32`. The server implements the grant, `token.controller.ts`
handles a `TOKEN_EXCHANGE` action, and Module 06 teaches it through *three deliberate defects*
(`AGENTS.md` → Deliberate defects). So the curriculum has a lab for a flow the debugger cannot send.
Delegation-vs-impersonation is also one of the harder ideas in OAuth and would benefit most from a
step-by-step surface. **Hybrid** and **Implicit** are present only as `response_type` values to watch be
refused — which is the right treatment, but the anti-pattern is one clause of one note
(`data/authParams.ts:70`) rather than an explained comparison.

### P2 — Step granularity: the flattening is measurable

`FlowDiagram` exists, supports `completedSteps`, and `utils/flow-progress.ts` derives progress from the
request trace so the diagram cannot claim a step that produced no request. All of that machinery is
applied to **three** sections:

| Uses `FlowDiagram` | Uses `TabBar` for what is an ordered sequence |
|---|---|
| `auth/AuthFlowsSection.tsx` · `oidc/StepUpSection.tsx` · `vci/VciSection.tsx` | `oidc/CibaSection.tsx` · `oidc/DeviceSection.tsx` · `oidc/DcrSection.tsx` · `oidc/FederationSection.tsx` · `mcp/McpSection.tsx` · `vci/VciSection.tsx` (both) |

**PED-02 · High · Eight sections model a sequence as a set of alternatives.** A tab bar says *"these are
peers, pick one."* CIBA Core is a strict four-call sequence — backchannel authentication, then issue,
then poll, then complete — and `CibaSection` renders those four as four tabs. RFC 8628 §3.1–3.5 is a
sequence; `DeviceSection` renders four tabs. RFC 7591 `register` **mints the registration access token**
that 7592's `get`/`update`/`delete` require, so it is strictly first; `DcrSection` renders four tabs.

For a novice this is the difference between learning a protocol and learning a menu. It is also the
cheapest large win in this report: `FlowDiagram` + `flow-progress.ts` are written, tested
(`flow-progress.ts` is at 100% statements) and already derive state from the trace.
**Recommendation:** give CIBA, Device and DCR a `FlowDiagram` above the tab bar, and disable a tab whose
prerequisite has not produced a trace entry. **Effort: M.**

**PED-03 · Medium · `FlowStep.description` is declared and never rendered.** `ui/FlowDiagram.tsx:7`
declares `description?: string`; nothing in the component body renders it and no call site passes one.
So the headline flow's five steps are the five bare words *Authorize · Login · Consent · Callback ·
Token*. The diagram shows a novice **where they are** and never **what happens there** — in a product
whose thesis is that each step should be explained. The field is already in the interface.
**Effort: S** for the component, **M** for writing five good sentences per flow.

### P3/P4 — Parameter inventory for the authorization-code flow

The brief asks for this quantified. The headline flow sends **two** requests. They are not treated alike.

**Request 1 — `GET /api/authorization`.** `data/authParams.ts` carries **24** parameter specs. Every one
has `spec` (document *and* section), `note` (what it does plus what this deployment does with it), and
`kind`; 24 of 24 carry a `requirement` conformance word; the header records that every citation was
verified against the primary source on 2026-08-21.

| Criterion from the brief | Coverage |
|---|---|
| What it is | **24 / 24** |
| REQUIRED / RECOMMENDED / OPTIONAL | **24 / 24** |
| Governing RFC **and section** | **24 / 24** |
| A valid example | **21 / 24** as `placeholder`; the other 3 (`state`, `nonce`, `code_challenge`) show the live generated value, which is better |
| Failure mode if omitted or malformed | **19 / 24** |

The five without a stated failure mode are `login_hint`, `display`, `ui_locales` — which genuinely have
none interesting — and **`request_uri`** and **`dpop_jkt`**, which do and should get one. That is the
entire gap in 344 lines. Several notes go beyond the brief: `response_type` explains that its *presence*
decides whether an error arrives as a 302 redirect or a 400 `[A009301]`; `code_challenge_method` states
that absence **defaults to `plain`**, which is the single most consequential default in PKCE.

**PED-04 · High · Request 2 — `POST /api/token` — has no parameter documentation and no preview.**
`pages/CallbackPage.tsx:206-213` sends six parameters: `grant_type`, `code`, `redirect_uri`, `client_id`,
`code_verifier`, and `client_secret` (or `client_assertion_type` + `client_assertion`). For those six:

- **no builder** — `AuthorizeRequestBuilder` has no counterpart;
- **no `RequestBuilder` preview** — `AuthFlowsSection.tsx:301` returns `null` for this grant, correctly,
  because the authorization request has its own builder; nothing covers the token request;
- **no parameter-level docs** — `data/operationDocs.ts:15-22` lists exactly two prose entries for the
  whole flow, *"Client ID"* and *"Redirect URI"*;
- **no visible step** — it fires inside a `useEffect` on page load (see ENG-01).

The only place in the entire application that documents `code_verifier` as a request parameter is the
**MCP** section (`data/operationDocs.ts:1199`). So the MCP wizard explains the headline flow's token
exchange better than the headline flow does.

Why this is the report's most important pedagogical finding: **step 5 is where the protocol's promises
are actually kept.** PKCE is not proven in the authorization request — it is *asserted* there and
**proven** at the token endpoint. Client authentication happens there. Four of the six most-hit OAuth
errors (`invalid_grant`, `invalid_client`, `unauthorized_client`, `unsupported_grant_type`) can only
occur there. A learner finishes this flow able to recite 24 authorization parameters and unable to name
one field of the request that redeemed their code.

**Recommendation:** a `TokenRequestBuilder` — the same 6-column treatment, seeded from what the callback
would send, with an explicit *Exchange* button. It fixes PED-04, ENG-01 and half of P2 in one change.
**Effort: M.** This is the single highest-value item in the report.

### P5 — Wire-level fidelity

What exists is strong: `services/transport.ts` captures status, statusText, every response header
lower-cased, the parsed and raw body, and a monotonic duration for **every** call; `TracePanel`
surfaces `www-authenticate`, `dpop-nonce`, `retry-after` and `location` as *notable* headers with the
RFC citation for why (`TracePanel.tsx:50-56`); `utils/curl.ts` produces a runnable, POSIX-quoted,
credential-redacted command; `toMarkdown` exports the whole trace redacted; and `SequenceView` draws a
four-lane message flow in which **every arrow is a request that actually happened**, clickable through
to its captured headers.

**PED-05 · High · The authorization request never enters the trace.** `recordTrace` is called from
exactly one place — `services/transport.ts:135` and `:166` — and the authorization request is not a
`fetch`. `AuthFlowsSection.tsx:249` does `window.location.href = url`, a full-page navigation, and the
redirect back to `/callback` is another. So:

- the request the user just spent five minutes composing in a 24-parameter builder **disappears** from
  the request history;
- the `code` arriving on the callback is never recorded either;
- `SequenceView` draws a one-arrow conversation for a flow with two front-channel hops and one
  back-channel exchange — and front-channel-versus-back-channel is precisely what the four lanes exist
  to teach;
- `utils/flow-progress.ts:30` even has a `hasAuthorizeRequest(traces)` predicate that **can never be
  true** for this flow. It is harmless because `authorizeSent` reads session storage instead, but it is
  evidence the gap was not noticed.

The store already models a request with no response (`status: 0`, `networkError`), so the fix is to
synthesise two entries — one on navigate, one on return — rather than to build anything.
**Effort: S.** Highest ratio of pedagogical value to work in the report.

### P6 — Progressive disclosure

There is a real ladder, and it is well built: `OperationDescription` renders a one-paragraph summary
inline (rung 1) with an `i` button opening `HelpPopover`'s description / **Parameters** / **Returns** /
**Tips** panel (rung 2), and `JsonBlock` / `JwtInspector` / `TracePanel` expose the raw article (rung 3).
`data/operationDocs.ts` covers **80 operations across all 20 sections, and all 80 carry `tips`** — that
is unusual completeness. `JwtInspector` deserves specific credit: it starts **unverified** with a Verify
button, because *"a decoded payload is legible, which makes it look authoritative"*
(`utils/jwt.ts:11-12`). That is the correct pedagogy for the single most common OAuth misreading, and no
reference tool does it.

Docked one point for the rung below rung 1: the first thing a novice meets is a form (see the
walkthrough), not an orientation.

### P7 — Attacker-model-first: the weakest axis, and it is measurable

Across ~2,100 lines of teaching prose in `src/data/` I counted occurrences:

| Term | Count | | Term | Count |
|---|:---:|---|---|:---:|
| `attack` / `attacker` | **0** | | `replay` | 6 |
| `mix-up` | **0** | | `CSRF` | 5 |
| `injection` | **0** | | `forge` | 3 |
| `steal` | **0** | | `tamper` | 3 |
| `intercept` | 1 | | `stolen` | 2 |

**PED-06 · High · The notes teach failure modes, not threats.** The prose is consistently
*"change this and watch it break"* — `state`: *"tamper with it and watch the callback refuse the
result"*; `code_challenge`: *"the two stop matching and the exchange fails"*; `response_mode`:
*"watch the callback stop finding the code"*. Every one of those is good, and none of them is the
attacker model. The difference is not academic:

> *Failure-mode:* "Edit `state` and the callback refuses the response."
> *Attacker-model:* "Without `state`, any page can start a flow in your browser and receive a code
> bound to your session — `state` is what proves the response answers a request **you** made."

The first teaches that a check exists. The second teaches why anyone would write one, which is the thing
a practitioner needs and the thing the brief names as the differentiator.

The sharp part: **this repo already contains the attacker-model prose, written for maintainers rather
than rendered for users.** `pages/CallbackPage.tsx:66-75` explains that a permissive `state` check meant
*"the one place a learner looks to see how CSRF protection is done modelled the mistake."*
`services/session-keys.ts:5-14`, `services/trace-store.ts:129-136` and
`utils/verify-id-token-hint.ts` do the same for their concerns. The raw material for this axis is
already written in the codebase's own comments; it has simply never been promoted into the UI.
**Recommendation:** one `threat` field on `AuthParamSpec`, populated for the ~10 parameters that carry a
security promise, rendered above `note`. **Effort: M** (mostly writing).

### P8 — Error as teaching moment

The strongest asset in the product. `data/errorDocs.ts` carries **20 specification error codes** with
cause / fix / spec, and **26 Authlete result codes reproduced live on this deployment**, each flagged
`verifiedHere` and rendered with a flask icon and the tooltip *"Reproduced against this deployment, not
read out of a document"* (`ui/ErrorExplainer.tsx:197-205`). A third, generated set of 38 vendor codes is
CI-gated against `docs/openapi-spec.json`. **The overlap between the vendor set and the live-verified
set is zero, and that was measured rather than assumed** (`data/errorDocs.ts:14-21`) — so a decoder built
from the vendor document alone would explain nothing a developer actually hits. An unrecognised code is
reported as unrecognised. `ui/ErrorExplainer.tsx:44-61` even opens the panel when the only thing to say
is *"this code is not one I know"*, because being told that is useful.

`A157357`'s entry is the exemplar: *"The credentials may be entirely correct — this is about the
**channel** they arrived on, not their value."* No reference tool can say that, because none of them
knows which authorization server you are talking to.

Two gaps.

**PED-07 · Medium · The explainer is context-free, and the context is already captured.**
`ui/ErrorExplainer.tsx` takes a **string**; `utils/decode-error.ts` never reads the trace store
(verified: no import, no reference). So on `invalid_grant` the fix text says *"check that the PKCE
verifier matches the challenge that was sent"* (`data/errorDocs.ts:61`) — asking the user to do by hand
something the application can compute. At that moment the app holds the authorization URL (in the
builder's state) **and** the token request body (in the trace), so it could say: *"the `code_verifier`
you sent hashes to `X`; the `code_challenge` in step 1 was `Y`."* The brief's exact example is
mechanically available and unused. Same for `redirect_uri` byte-mismatch between the two requests, which
is trivially diffable. **Effort: M.**

**PED-08 · Low · Two sections show a raw error with no explanation.** 18 of 20 render `ErrorExplainer`;
`fapi/FapiSection.tsx` and `oidc/JarSection.tsx` use `toast.error` only. Those two produce some of the
most cryptic errors in the deployment — `[A005328]` on a bad JAR signature, `[A157303]` when a stored
FAPI signing key rewires client authentication — and `AUTHLETE_NOTES` has entries for both.
**Effort: S.**

### P9 — Conceptual scaffolding

`data/claimDocs.ts` defines **26 JWT claims**, and its header is careful about the two distinctions
readers get wrong: RFC 7519 §4.1's claims are *"all OPTIONAL in that document"* and become required by
the profile that uses them, and `auth_time` is *"OPTIONAL until you ask for it."* That is exactly the
right level of care.

**PED-09 · Medium · It is reachable from exactly one component, and there is no glossary.**
`CLAIM_DOCS` is imported only by `ui/JwtInspector.tsx:11` and read at `:290`, so a definition is visible
**only if you decode a token that happens to contain that claim**. And the table covers claims, not
concepts: nothing anywhere in the application defines *front-channel*, *back-channel*, *public* versus
*confidential client*, *bearer*, *sender-constrained*, *relying party* or *resource owner* — all of which
appear in the UI copy. Combined with F-0.4 (no `/glossary` route exists), a novice meeting
*"sender-constrain with DPoP"* on their first screen (`auth/AuthFlowsSection.tsx:388`) has nowhere to look.
**Effort: M.**

### P10 — The "so what" moment

**PED-10 · High · The flow completes and the tool goes silent.** On success `AuthFlowsSection`'s right
pane renders `<JsonBlock data={displayResult} label="Token Response" />` (`:610`) and nothing else. Not
a `JwtInspector` — so the ID token the headline flow just obtained is **not inspectable from the section
that obtained it**; you must find the Token Vault in the sidebar or still be on the callback page. Not a
summary of what is now held, its scope, or its lifetime. And I grepped the whole codebase for
cross-section guidance — *"next step"*, *"now that you"*, *"try the"*, *"go to the"*, *"head to"* — and
found **one** hit, which is Authlete's word "next step" inside a CIBA description.

So a novice's reward for completing OAuth's central flow is a JSON blob and five green ticks. Every
component needed to do better already exists — `JwtInspector`, `TokenVault`, `FlowDiagram` — and the
`operationDocs` `returns` field is already written for all 80 operations. This is composition, not
construction. **Effort: S** for a `JwtInspector` in the success pane; **M** for a real synthesis panel.

### P11 — Reproducibility & sharing

Real: per-request **copy as cURL** (redacted by default, POSIX-quoted, shared implementation with the
trace panel) and a **whole-trace markdown export** with credentials redacted, which is a genuinely good
"show someone else what happened" artefact.

Absent, per F-0.4: no state in any URL, so no deep link, no shareable run, no reset-and-replay. The
brief names *"a shareable or deep-linked view of a completed run"* as a **reading surface**; it does not
exist, which is why Phase 3's classification will show no reading surfaces at all. Also note ENG-05:
the export and the cURL both omit `code` and `token` from redaction.

---

### Novice Walkthrough Simulation

A developer who has never issued a token request opens the app. Traced against real line numbers.

**1 · There is no front door.** `/` immediately redirects to `/auth-flows` (`App.tsx:265`). No landing
page, no "what is this", no "start here". First paint is a **form**, inside a sidebar of twenty items in
three groups whose labels — *OAuth 2.0*, *OIDC & Extensions*, *Admin* — presuppose knowing the
difference. Nothing marks a beginning.

**2 · Five acronyms, no ordering.** The tab bar reads *Auth Code (PKCE) · Client Credentials · Password
(ROPC) · Refresh Token · JWT Bearer (RFC 7523)* (`AuthFlowsSection.tsx:35-41`). The right one is
selected by default — good — but nothing says it is the one to learn first, or that ROPC is a legacy
last resort. Five unexplained labels on first paint.

**3 · Five bare words for five steps.** The `FlowDiagram` shows numbered circles: *Authorize · Login ·
Consent · Callback · Token*. `FlowStep.description` exists (`FlowDiagram.tsx:7`) and is never rendered
(PED-03). The novice does not know what "Callback" means, and the diagram will not tell them.

**4 · The blue box is genuinely good.** `OperationDescription` gives a solid paragraph on the code flow
and PKCE, with a 20px `i` button (`HelpPopover.tsx:133`, `aria-label="Help"`) opening Parameters /
Returns / Tips. This is the first thing that helps. Whether a novice notices a 20px circle is
`[INFERRED]` and on the screenshot list.

**5 · The first field is pre-filled with a value guaranteed to fail.** Client ID shows
`your_client_id` (`config.ts:3`), deliberately — the comment explains that a placeholder client id
*"fails loudly and says exactly what is wrong"*, which is correct reasoning. But **nothing on screen
says where to set the real one.** No hint, no link, no "copy `.env.example` to `.env`". The novice's
first action produces an error about a client that does not exist and no route to fixing it. This is the
sharpest onboarding cliff in the app and among the cheapest to fix.

**6 · The secret field cannot be answered.** *Client Secret*, `type="password"`, placeholder *"Used at
the token endpoint, not here"* (`AuthFlowsSection.tsx:362`). A novice cannot tell whether they need one.
Nothing says that the SPA's own client is **public** and this must be left **empty**, nor that pasting
the `.env.example` placeholder is silently treated as empty (`config.ts:secretOrEmpty`) — the right
behaviour, unexplained. The concept that would resolve it, *public versus confidential client*, is
defined nowhere (PED-09).

**7 · Third control on the first screen: DPoP.** A dense, accurate RFC 9449 paragraph mentioning
*sender-constrain*, *thumbprint*, `dpop_jkt`, `token_type: DPoP` and the `Bearer` prohibition
(`AuthFlowsSection.tsx:383-400`). Correct, and three concepts deep for paint one.

**8 · Then the best screen in the product.** `AuthorizeRequestBuilder`: four collapsible groups showing
*Core (RFC 6749 §4.1.1) 5/5*, *OpenID Connect 2/10*, *PKCE 2/2*, *Extensions 0/7*; every row has its
spec citation, its conformance word, a toggle, an editable value and its own `i`; `state`, `nonce` and
`code_challenge` are **shown** rather than hidden, each with a regenerate button; the URL below is
**the string the Send button navigates to** (`:205-220`), by construction. Nothing in the reference
class comes close. If the novice gets this far, the tool starts earning its premise.

**9 · Send — and the request vanishes.** `window.location.href = url` (`:249`). The server's login and
consent pages appear (outside this audit), then `/callback`. Open the Trace panel afterwards and **the
authorization request is not in it** (PED-05). The one request they composed by hand is the one the
request history does not have.

**10 · In development, the flow may report failure for doing everything right.** `CallbackPage` runs the
exchange in an effect with no once-guard under `React.StrictMode` (ENG-01), so the one-time code is
redeemed twice and the losing race can leave `invalid_grant` on screen.

**11 · The success page is good, and skips the step that mattered.** *"Successfully obtained tokens"*, a
`JsonBlock`, then two `JwtInspector`s — ID token open, access token collapsed, both starting
**unverified** with a Verify button. Excellent. But the exchange that produced them was never shown:
no URL, no six-parameter table, no explanation of `grant_type` or `code_verifier` (PED-04). The novice
has just used PKCE and cannot say how.

**12 · "Return to Dashboard", and silence.** Back on `/auth-flows` the right pane is a JSON blob and the
diagram is five green ticks. No statement of what they now hold, what it is scoped to, how long it
lives, or that *Token Operations* in the sidebar will let them spend it (PED-10). The flow is finished
and the tool has nothing further to say.

**13 · Failure is where the product is strongest.** Any error goes to `ErrorExplainer`, which decodes the
OAuth code and the `[Annnnnn]`, gives cause / fix / specification, and marks the ones reproduced against
this very deployment. This is materially better than every reference tool. It just cannot see what the
user did (PED-07), so on `invalid_grant` it asks them to compare a verifier and a challenge by hand
while holding both.

**14 · Jargon has nowhere to lead.** *Audience*, *front-channel*, *bearer*, *sender-constrained*,
*confidential client* appear in the copy. 26 claim definitions exist and are reachable from one
component, conditional on decoding a token that contains the claim (PED-09). There is no glossary.

**The novice's honest outcome:** they can send a superbly instrumented authorization request and read a
decoded ID token with a real signature verification — and they leave without having seen the token
exchange, without a threat model for any of the protections they just used, and without being told what
to do with the token they now hold. **The gap is not effort or care; both are conspicuous. It is that
the pedagogy is deep at the parameter and error levels and thin at the level of the *flow as a
narrative*.**

### Where the three voices disagree

**On PED-06 (attacker model).** The engineer objects that this is a content project, not an engineering
one, and that the notes are already longer than any competitor's. The education specialist's answer
carried: the brief names attacker-model-first as *the* differentiator, the count is 0, and the prose
already exists in the repo's own comments — so this is promotion, not authorship.

**On PED-04's fix.** The designer would rather not add a second 600-line builder to the first screen and
proposes reusing `RequestBuilder`'s compact preview plus a parameter table on demand. The engineer wants
the full builder for symmetry. Both agree an explicit **Exchange** button is required regardless, since
it also fixes ENG-01 — recorded as an open question on how far to go, not whether.

**On the placeholder `client_id` (walkthrough step 5).** The engineer defends `config.ts`'s reasoning as
written and correct. The education specialist accepts the reasoning and rejects the outcome: failing
loudly is only pedagogy if the error tells you what to do next, and this one does not. Both agree the
fix is a hint on the field, not a change to the placeholder.


---

## Phase 3 — Interface, Visual & Responsive Review (Principal Product Designer)

**Observation method for this phase: `[INFERRED]` throughout.** No browser tooling was available. Every
layout claim below is derived from declared Tailwind classes, the built stylesheet, and layout primitives
in the JSX, and is phrased as risk. Two exceptions are **measured**, not inferred: the colour counts come
from grepping source, and the WCAG results come from running the repo's own `check-contrast.mjs` against
the built CSS. §9 lists what to screenshot.

### Surface classification (published before any responsive finding, as required)

| Route | Class | Reasoning |
|---|---|---|
| `/` | — | Redirect to `/auth-flows` (`App.tsx:265`). Not a surface |
| `/auth-flows` | **Doing** | Parameter editor (24 fields) + `SplitPane` response inspector |
| `/token-ops` | **Doing** | Four operations, each a form + response pane |
| `/step-up` | **Doing** | Form + `FlowDiagram` + response |
| `/logout` | **Doing** | Form that navigates away |
| `/dcr` · `/ciba` · `/par` · `/rar` · `/jar` · `/device` · `/backchannel-logout` | **Doing** | Forms + response panes |
| `/discovery` · `/federation` | **Doing**, leaning reading | Two buttons and a JSON document. Almost pure output |
| `/fapi` · `/mcp` | **Doing** | Multi-step wizards with key generation |
| `/vci` | **Doing** | Forms + wizard |
| `/admin` · `/client-mgmt` · `/grant-mgmt` · `/health` | **Doing** | Admin forms |
| `/callback` | **Straddles → stays Doing** | See below |

**Totals: 20 doing surfaces, 0 reading surfaces, 1 straddle resolved to doing.**

**`/callback` is the straddle, and the analysis argues for leaving it a doing surface.** It looks like a
reading surface — a completed-run result, arrived at by redirect, showing a token response and two JWT
inspectors, and it is the page most plausibly opened on a phone. But a shared `/callback` URL is
**guaranteed to fail for the recipient**: the `code` is one-time, and `state` plus `pkce_code_verifier`
live in the originating browser's `sessionStorage` (`session-keys.ts:27-29`). It cannot be a shareable
view of a run, so reclassifying it would be aspirational rather than descriptive. What *is* true is that a
learner may legitimately complete an authorization on a phone and land here, so it should hold at 360px
as a matter of ordinary quality — and it uses `Card variant="default"`, which is where UX-05 bites.

**UX-01 · High · There are no reading surfaces, and the reading *content* already exists.**
This is the Phase 3 headline and it is a product finding, not a CSS one. The brief's reading class names
"docs, glossary, per-parameter explanations, attacker-model content, RFC references, and any shareable or
deep-linked view of a completed run." In this application:

- the per-parameter explanations exist — 24 of them, with verified citations — and live **inside
  `HelpPopover` on a doing surface** (`data/authParams.ts` → `AuthorizeRequestBuilder`);
- the RFC references exist — ~150 of them across `authParams`, `claimDocs`, `errorDocs`, `operationDocs`
  — and are reachable only by opening the control they annotate;
- there is no `/docs`, `/glossary`, `/learn` or `/about` route (grepped; absent);
- no route carries state, so no run can be deep-linked or shared (F-0.4).

So the corpus that would populate a reading surface is written and shipped; it has no surface to live on.
A learner sent a link on a phone has nowhere to arrive except a form. **This is the single change that
would most alter what this product is**, and it needs no new content — a `/reference` route rendering
`authParams` + `claimDocs` + `errorDocs` as prose would be a genuine reading surface built from files
that already exist. **Effort: M.**

### Design scorecard

| Axis | Score | Verdict |
|---|:---:|---|
| D1 · Information architecture & navigation | **3/5** | Flow → step → detail is right; nothing is deep-linkable and there is no front door |
| D2 · Visual hierarchy & density | **3/5** | Consistent card grammar; the type scale undercuts hierarchy (D4) |
| D3 · Design system integrity — colour | **4/5** | **Text is 100% tokenised (0 literals) and passes AA in both themes, measured.** 127 background/border literals remain, outside any gate |
| D4 · Typography | **2/5** | 6 arbitrary sizes in a 0.25rem band = 91 of 253 declarations (36%); `text-[0.55rem]` is 8.8px |
| D5 · Long-token / wrapping strategy | **5/5** | The category's usual killer is genuinely solved — see below |
| D6 · Responsive mechanics | **3/5** | `grid-cols-1 sm:grid-cols-2` collapse is correct and graceful; the header is the one real risk; no container queries |
| D7 · Interaction states | **2/5** | Six irreversible actions with no confirmation (UX-04); the skeleton state is dead code |
| D8 · Motion | **4/5** | Restrained to the point of being barely present; no `prefers-reduced-motion`, and almost nothing to reduce |
| D9 · Craft signals | **3/5** | Real empty states and microcopy; no favicon, no `<h1>`, one heavy dark shadow in light mode |

### D3 — Design system integrity, measured

| | Count | Covered by a gate? |
|---|---|---|
| `text-<palette>-<n>` literals in components | **0** | n/a — migration complete |
| Semantic text tokens (`text-accent-text` etc.) | 5 distinct, 152 usages | **Yes** — `check-contrast.mjs`, passing AA in **both** themes |
| `bg`/`border`/`ring`/`shadow`/`divide` literals **with** opacity | **102** | **No** |
| The same, opaque | **25** | **No** |
| Distinct opacity levels in use | **11** (`/5 /8 /10 /15 /20 /25 /30 /40 /50 /60`) | **No** |
| Distinct spacing values | **12**, all on Tailwind's scale, **0 arbitrary** | n/a |

Two honest conclusions. **The text-colour work is finished and verified** — I ran the gate; both palettes
clear 4.5:1. Credit where it is due: `styles/globals.css:131-151` bridges `:root` into `@theme inline`
with a comment explaining exactly why the utilities would otherwise emit nothing, and both palettes
define the same 18 colour tokens.

**And `AGENTS.md`'s own caveat — "translucent fills (`bg-indigo-500/10` on white) … treat those as
unverified" — is now quantified: 102 sites across 11 opacity levels.** `[INFERRED]` risk: these were
chosen against `#020617`, where a `/10` indigo tint is a whisper. Over `#ffffff` the same declaration
produces a cooler, more saturated wash, and the *ordering* of the surface hierarchy is what may fail
rather than the contrast — `/10` versus `/15` versus `/20` tints may cease to be distinguishable, and
`border-indigo-500/40` may read as a smudge rather than an edge. The contrast gate cannot see any of this,
because a fill that is too faint or too strong is still a valid colour. **UX-02 · Medium.**

**UX-03 · Medium · Three declared theme tokens are mapped and referenced by nothing.**
`check-theme-tokens.mjs` reports 20 declared, 18 mapped, **15 referenced**. Dead tokens are how a palette
starts drifting from what the app actually uses. **Effort: S.**

### D4 — Typography

| Size | Usages | |
|---|---|---|
| `text-xs` (0.75rem) | 126 | on-scale |
| `text-[0.65rem]` | 41 | arbitrary |
| `text-sm` | 33 | on-scale |
| `text-[0.7rem]` | 23 | arbitrary |
| `text-[0.6rem]` | 22 | arbitrary |
| `text-[0.72rem]` | 2 | arbitrary |
| `text-[0.55rem]` | 2 | arbitrary |
| `text-[0.8rem]` | 1 | arbitrary |
| `text-lg` / `text-base` | 3 | on-scale |

**UX-04 · Medium · 91 of 253 font-size declarations (36%) are arbitrary values, and six of them crowd a
0.25rem band.** `0.7rem` and `0.72rem` differ by **0.32px** and both exist in the codebase; `0.6rem`,
`0.65rem` and `0.7rem` are all used tens of times for what is functionally the same role ("small
secondary label"). The long tail the brief asks about is here, in type — and notably *not* in spacing,
which is clean.

Two consequences for this product specifically. First, hierarchy: when secondary text comes in four
near-identical sizes, size stops encoding rank and the eye has nothing to follow in a dense inspector.
Second, legibility: **`text-[0.55rem]` is 8.8px** — used for the "verified here" badge
(`ui/ErrorExplainer.tsx:199`), which is one of the highest-value labels in the app — and
`text-[0.6rem]` (9.6px) appears 22 times, including the token values in `TokenVault.tsx:98`. These clear
*contrast* AA and are below any reasonable size floor.
**Recommendation:** collapse to three `@theme` steps (`--text-2xs`, `--text-xs`, `--text-sm`), floor at
0.6875rem/11px. **Effort: M** — mechanical, ~90 sites.

### D5 — Long-token handling: solved, and worth saying so

This is the failure mode the brief calls "the #1 layout killer in this product category", and it is
handled deliberately at every site that renders protocol content:

| Surface | Treatment |
|---|---|
| `ui/JsonBlock.tsx:47` | `whitespace-pre-wrap break-all` **and** `overflow-x-auto` |
| `ui/RequestBuilder.tsx:90` | same, plus `max-h-32` |
| `ui/TokenVault.tsx:98-104` | `break-all`, and truncated at 100 chars with a Copy button beside it |
| `ui/JwtInspector.tsx:295-300` | `min-w-0 flex-1` + `break-all` — the correct flex-overflow idiom, not the common bug |
| `trace/TracePanel.tsx` (header table) | `break-all` on values |
| `trace/SequenceView.tsx:100` | fixed 760px SVG inside `overflow-auto` — **contained** scroll, so the page body never scrolls sideways |

No finding. **5/5**, and it is the axis most tools in this class get wrong.

### D6 — Responsive mechanics, judged against the declared posture

**What the numbers actually mean.** 38 breakpoint prefixes across 13 of 63 components looked thin in
Phase 0; reading the code, the low count is because two idioms cover most of the need and both are
content-driven rather than viewport-dogmatic:

- `grid-cols-1` → `sm:grid-cols-2` (17 + 10 usages) for paired form fields;
- `flex` + `flex-wrap` in 15 components for toolbars and badge rows.

**Per the brief, a doing surface that collapses gracefully is not a finding, so most of this is not
reported.** `SplitPane` going single-column below `xl:`, form grids going one-up below `sm:`, and the
trace toolbar wrapping are all deliberate, coherent collapses. `TracePanel`'s drawer is a good example of
care: `height: min(52vh, 30rem)`, a wrapping toolbar with `min-w-[8rem]` on the filter and `shrink-0` on
every button, and `AppLayout.tsx:177` reserves matching bottom padding on the main region so the last
control on a page stays reachable while the drawer is open.

Fixed dimensions are few and all justified: eight sites, all `min-h`/`max-w` on textareas, truncated
labels and a filter input. **No `w-[NNNpx]` traps, no `min-width` traps.**

Three findings survive.

**UX-05 · High · The header is a non-wrapping flex row and it is on every surface.**
`layout/AppLayout.tsx:40` — `flex items-center justify-between px-4` with **no `flex-wrap`**, and neither
group carries `truncate` or `min-w-0`. It holds five things: menu button, logo + "OAuth Debugger", Trace
button with a count, theme button, status pill, and "Authlete Node Server". Only the theme *label* and
the server name hide below `sm:` (`:107`, `:133`).

`[INFERRED]` risk: at 360px the available width is 328px after padding, and the intrinsic widths of the
remaining items plausibly exceed it — the left group alone is roughly 180px. Without `flex-wrap`, the
overflow either pushes the page body sideways or squashes the items unpredictably. **Severity is High
rather than Medium because the header is not a doing surface** — it is the chrome on *every* route,
including `/callback`, and a horizontally-scrolling page is precisely the failure the declared posture
exists to prevent. If a screenshot shows it holding, this drops to Low. **First item on the screenshot
list. Effort: S** (`flex-wrap` + `min-w-0 truncate` on the title).

**UX-06 · Medium · `HelpPopover` uses a fixed 480px height and can be unreachable on a short viewport.**
`ui/HelpPopover.tsx:15,38` — `MAX_HEIGHT = 480`, and the inner scroller is
`maxHeight: MAX_HEIGHT - 44` = 436px, both viewport-independent. When `vh < 504`, `vh - 480 - 12` is
negative, so the clamp at `:38` resolves to `top: 12` and a 480px panel is positioned inside a shorter
viewport. `[INFERRED]`: the bottom of the panel is then off-screen **with no scroll to reach it**, because
the scroll container is sized in pixels rather than relative to the viewport. A landscape phone
(~375px tall) and a short desktop window both hit this.

Capped at Medium under the posture — but note *what* is cut off: this popover is the delivery mechanism
for the per-parameter explanations that Phase 2 scored 5/5, i.e. the product's differentiator. And
because the popover is `position: fixed` in a portal, the content it renders is not reachable by any
other route. **Effort: S** — `min(480px, 100vh - 24px)` and a `vh`-relative inner scroller.

**UX-07 · Low · `SplitPane` solves a container problem with a viewport query.**
`ui/SplitPane.tsx:24` — `grid-cols-1 xl:grid-cols-2`. The pane's real constraint is the *container*: the
main region is `max-w-5xl` minus a 224px sidebar that appears at `lg:`, minus `p-4/lg:p-6/xl:p-8`, and
minus a trace drawer that changes height but not width. A viewport width of 1280px therefore does not
reliably mean "there is room for two columns", and the breakpoint has to be set conservatively to be
safe — which is why the two-pane inspector, the app's signature layout, does not appear until 1280px.
This is the textbook container-query case the brief names, and Tailwind v4 supports `@container` natively.
Low because the current behaviour is safe, just pessimistic. **Effort: S.**

### D1/D2 — Information architecture and hierarchy

The mental model is right: three sidebar groups matching OAuth core / OIDC extensions / admin, then a
section, then tabs or steps, then a two-pane request/response. `Sidebar.tsx` uses real `<Link>`s with
`aria-current` and a comment explaining why (middle-click, open-in-new-tab, screen-reader semantics) — a
detail most projects get wrong.

**UX-08 · Medium · The URL stops at the section, so nothing below it is addressable.**
Twenty routes, zero query state (F-0.4). A tab, a wizard step, an expanded trace row and a decoded token
are all invisible to the URL, so *"look at what happened on step 3"* cannot be communicated, back does
not undo a tab change, and reload loses position. In a debugger this is felt more than in most apps,
because the natural unit of conversation is *a specific request in a specific run*.
**Effort: M** (`useSearchParams` for tab/step is small; a shareable run is larger).

**Density.** The card grammar is consistent — `SectionPanel` for the page, `Card` for standalone,
`rounded-lg border border-border` for every inner block — and signal-to-chrome is good: the response pane
is plain monospace on a sunken `bg-code` surface, and chrome is reserved to 0.65rem uppercase labels.
The primary action is unambiguous per section (one gradient `Button` variant; everything else is
`secondary`/`ghost`). Docked to 3 only because D4's type flattening costs the hierarchy that the layout
otherwise establishes.

### D7 — Interaction states

Present and good: `focus-visible` ring on `Button`, ring-paired focus on every input, `disabled:opacity-50`
with `pointer-events-none`, `loading` prop with an inline spinner, real empty states with useful copy
(*"No requests yet. Run an operation and the exchange will be drawn here."* — `SequenceView.tsx:89`),
copy-confirmation on four surfaces with a 2s revert.

**UX-09 · High · Six irreversible actions, none of them confirmed.**

| Action | Site | Reach |
|---|---|---|
| Delete client | `admin/ClientManagementSection.tsx:336` | **permanent, live Authlete service** |
| DCR delete | `oidc/DcrSection.tsx:186` | **permanent, live** |
| Revoke grant | `admin/GrantManagementSection.tsx:74` | **permanent, live** |
| Revoke token | `oidc/TokenOpsSection.tsx:157` | **permanent, live** |
| Clear tokens | `oidc/LogoutSection.tsx:19`, `ui/TokenVault.tsx:57` | local session, incl. DPoP keys |
| Clear traces | `trace/TracePanel.tsx:397` | destroys the debugging evidence |

`window.confirm` and any dialog are **absent from the codebase** (grepped). The top four hit the shared
Authlete service, and `AGENTS.md` records that two of the live clients are **curriculum infrastructure** —
`1523514379` carries Module 02's plain code flow and `1678274156` carries Module 03's. Client Management
offers a free-text client-id field beside an unguarded Delete button, so one misclick can permanently
remove a client a lab depends on, and nothing in this repo could restore it. That is why this is High
rather than a nicety. **Effort: S** for a typed-confirmation on the four live ones.

**UX-10 · Low · The skeleton loading state is dead code.** `layout/SectionPanel.tsx:12,44` accepts a
`loading` prop and renders `SkeletonCard`; **no call site passes it** (grepped all 20 sections), and
`Skeleton.tsx` reports **0% statements / 0% functions** in coverage, corroborating. So the considered
choice — skeleton for a panel, spinner for an action — exists in code and never reaches the screen;
sections show a spinner inside a button instead. **Effort: S.**

### D8 — Motion

Deliberately minimal: 5 animations (`animate-pulse` ×3 on a 6px status dot, `animate-spin` ×2 on
spinners) and 29 transitions, **24 of them `transition-colors`**. Durations appear as `duration-150`,
`duration-200`, `duration-300`, `duration-500` — four values, mildly inconsistent, invisible in practice
at these amplitudes. No `prefers-reduced-motion` anywhere (A11Y-04, Low), and almost nothing that would
need reducing. Motion does not currently do any *work* either — step progression in `FlowDiagram` has
`transition-all duration-300` on the circle but no reveal, so a new response appears instantly with no
cue drawing the eye. That is a missed opportunity rather than a defect, and it belongs in P3 of the
roadmap.

### D9 — Craft signals

| Signal | State |
|---|---|
| Favicon | **absent** — no `<link rel="icon">` in `index.html`; `public/` holds only `_redirects`. Browsers will request `/favicon.ico` and 404 (F-0.8) |
| `<title>` / meta description | present and reasonable (`index.html:5,8`) |
| `color-scheme` meta | present, `"dark light"` — correct, prevents a white flash before CSS |
| Fonts | Inter + JetBrains Mono via Google Fonts with `preconnect` ×2 and `display=swap` — done properly |
| `<h1>` | **absent** (A11Y-03) |
| Skip link | present and correct (`AppLayout.tsx:34-39`) |
| Empty states | present, specific, well written |
| Microcopy | strong — the theme toggle's title names *what pressing it will do*, not what is showing (`AppLayout.tsx:91-97`) |
| Layout shift | `[INFERRED]` risk: `<Suspense fallback={<SpinnerPage />}>` with `min-h-[200px]` swaps to full section content on every navigation |

**UX-11 · Medium · One hardcoded dark shadow reaches the light theme on the page every learner sees.**
`ui/Card.tsx:13-14` — `variant="default"` is `shadow-lg shadow-slate-900/80` and `elevated` is
`shadow-2xl shadow-slate-900/80`. `#0f172a` at 80% is a near-black drop shadow, chosen against `#020617`
where it is invisible. `pages/CallbackPage.tsx:232` uses `<Card>` with the default variant, so
`[INFERRED]`: in light mode the callback page — the destination of the headline flow — carries a heavy
dark halo. **Effort: S** — a `--shadow-card` token per palette.

### Competitive benchmark

⚠️ **`[UNVERIFIED]` — method stated plainly.** oauthdebugger.com, oauth.tools and the two curity.io pages
are **not** on this session's pre-approved WebFetch list, so I did not visit them. The scores below are
from training knowledge and may be stale on any point. **Say the word and I will fetch all four and
re-score with receipts.** `@client` scores are from this audit and are firm.

| Rubric | `@client` | oauthdebugger | oauth.tools | curity OAuth Tools | curity Assistant |
|---|:---:|:---:|:---:|:---:|:---:|
| Clarity of step sequencing | **2** | 2 | 4 | 4 | 3 |
| Parameter explanation depth | **4** | 2 | 3 | 3 | 3 |
| Wire-level transparency | **3** | 3 | 5 | 5 | 3 |
| Visual polish | **3** | 3 | 4 | 4 | 4 |
| Novice on-ramp | **1** | 3 | 3 | 3 | 4 |
| Expert velocity | **3** | 4 | 4 | 4 | 2 |

**Ahead of the field, clearly:** error diagnosis (nothing else can decode a vendor result code against
*this* deployment, let alone flag 26 of them as reproduced live), per-parameter conformance and citation
depth, and `JwtInspector` starting **unverified** on purpose. Also ahead on breadth — 19 specs including
CIBA, VCI, Federation and MCP, which none of the four cover.

**At parity:** visual polish, and wire-level transparency for anything reached by `fetch`.

**Behind, and each for a nameable reason:**

- **Novice on-ramp — 1 vs 3–4, the widest gap in the table.** oauthdebugger opens with a single
  pre-filled form and a sentence; the curity assistant walks you in. This app redirects `/` to a
  20-item dashboard whose first field is a placeholder guaranteed to fail (Phase 2, walkthrough step 5),
  with no front door and no reading surface (UX-01).
- **Step sequencing — 2 vs 4.** oauth.tools' flow model is its central metaphor. Here `FlowDiagram` is
  applied to 3 of 20 sections and eight sequences are drawn as tab bars (PED-02).
- **Wire-level — 3 vs 5.** The trace layer is genuinely good, and it is missing the *authorization
  request* (PED-05), which is the one request the competitors always show.
- **Expert velocity — 3 vs 4.** No deep-linking, no saved runs, no shareable state (UX-08).

The honest summary the designer and the education specialist both signed: **this product is already the
best of the five at explaining a parameter and at explaining an error, and the worst of the five at
getting someone started.** Those are separable problems, and the second one is smaller.

### Where the three voices disagree

**On UX-05's severity (the header).** The engineer wants it Medium until a screenshot confirms overflow —
"an inferred layout break is a hypothesis". The designer holds High on the grounds that the header is
chrome on every surface including the reading-class straddle, and that the fix is `flex-wrap` plus
`min-w-0` regardless of what the screenshot shows. Filed High with the downgrade condition stated
explicitly, which is the compromise.

**On UX-01 (no reading surfaces).** The engineer notes this is not a defect against the declared
posture — the posture says *reading surfaces must be responsive*, not *reading surfaces must exist*.
Technically correct, and the designer and educator both overrode it: a teaching product whose entire
reading corpus is only reachable by clicking a 20px icon inside a form has an architecture problem, and
the brief's own failure mode — "a learner opening a shared link on a phone" — is unreachable here not
because it breaks but because there is nothing to share.

**On UX-04 (type scale).** The engineer calls a 90-site mechanical sweep poor value. The designer's
counter, which held: this is a *data-dense inspector*, four indistinguishable sizes for one role is
precisely how such a screen loses its hierarchy, and 8.8px text is a defect on its own terms
regardless of scale.


---

## Phase 4 — The Verdict: Revamp or Iterate

### Scored rubric

| Signal | Score | Evidence |
|---|:---:|---|
| **S1** — No design token layer; visual decisions are scattered magic numbers | **1** | A token layer exists and is **CI-enforced**: 18 colour tokens per palette, both palettes complete, `@theme inline` bridge (`styles/globals.css:131-151`), and `check-theme-tokens.mjs` + `check-contrast.mjs` gate it on every push. **Zero** `text-<palette>-<n>` literals remain; spacing is 12 values with **zero** arbitrary. The gaps are bounded and mechanical: 91 arbitrary font sizes (UX-04), 102 untokenised translucent fills (UX-02), no shadow token (UX-11), 3 dead tokens (UX-03) |
| **S2** — Component model can't express the core interactions without duplication | **1** | It expresses them: `SplitPane`, `SectionPanel`, `TabBar`, `FlowDiagram`, `RequestBuilder`, `JsonBlock`, `JwtInspector`, `ErrorExplainer`, `HelpPopover`, `TokenVault`, `SequenceView`. Composition is proven — `OperationDescription` and `getDoc` in **20/20** sections, `ErrorExplainer` in 18/20. PED-02's fix is *"use the component already in 3 sections in 8 more."* The duplication that exists is section-level **form state** (33 `useState` in `ClientManagementSection.tsx`), a refactor, not a rebuild |
| **S3** — Responsive strategy can't express the declared posture | **1** | It can. `grid-cols-1 sm:grid-cols-2` (27 usages) plus `flex-wrap` (15 components) plus contained `overflow-auto` already produce graceful collapse on doing surfaces, and long-token handling is a clean 5/5. A reading route would be ordinary responsive prose needing **no new components and no duplication**. Not 0, because UX-05 is a live overflow risk on chrome present on every surface, and because UX-01 means the posture's reading half is untested by construction |
| **S4** — Accessibility failures are architectural, not cosmetic | **1** | They are real and **centralised, which is the opposite of architectural**. Every one lands in a single shared file: A11Y-01 → `useAsyncCall.ts` + `SplitPane.tsx`; A11Y-03 → `SectionPanel.tsx` + `AppLayout.tsx`; A11Y-02 → `TokenVault.tsx`; the `role="img"` conflict → `SequenceView.tsx`. Six files. And the hard parts are already right: APG roving tabindex (`TabBar.tsx:41`), a real focus trap with focus return (`HelpPopover.tsx:77-129`), skip link, `aria-current`, every input labelled with `aria-describedby`/`aria-invalid`, all 11 `outline-none` paired with a ring, and a **text equivalent for colour-coded step state** (`FlowDiagram.tsx:29-32`) |
| **S5** — IA doesn't match the product's mental model | **2** | The top level matches — three sidebar groups → section → tabs/steps → split pane is flow → step → detail. One level down it flattens: **8 of 20 sections render an ordered sequence as peer tabs** (PED-02), the URL stops at the section so no tab, step, trace row or token is addressable (UX-08), and there is no front door (UX-01) |
| **S6** — Pedagogical layer is bolted on rather than designed in | **2** | Half of it is genuinely **designed in**: `data/` is a first-class 2,278-LOC layer, `authParams` drives the request it documents, `errorDocs` is CI-gated against the vendor spec, and `check-client-docs.mjs` asserts every doc key is reachable and every section is in the README. The **narrative** half was never designed: no token-request docs (PED-04), no attacker model in the UI (PED-06), `FlowStep.description` declared and unrendered (PED-03), no synthesis after success (PED-10), no glossary (PED-09), no home for the reading corpus (UX-01). Not "bolted on" — *"one of two pedagogical layers is missing"* |
| **S7** — Styling approach is unmaintainable or fights the framework | **0** | Idiomatic Tailwind v4. `@theme inline` is the correct v4 idiom and its comment records learning it the hard way; CVA for variants; `cn()` = clsx + tailwind-merge; four CI checks on the styling layer alone. Nothing is being fought |
| **S8** — Fixing findings piecemeal would touch >60% of components anyway | **1** | Counted. Every correctness, a11y and pedagogy finding lands in ~25 of 63 components plus ~8 non-component files — **~40%**. The one finding that spreads wider is UX-04's type sweep (~90 sites over ~28 files), and that is a rename of six class names, not a rewrite |
| | **9 / 24** | |

### Decision band

**9 falls in 8–15 → "Systematic refactor."** And the band's own parenthetical — *"introduce a token/component
layer, migrate incrementally, keep the app shippable"* — **does not describe this codebase**, because the
token layer and the component layer both exist and are CI-enforced. So the score is reported as it lands
and the label is corrected rather than accepted:

> ### Verdict, in one sentence
>
> **Iterate on the code and build the missing narrative layer: the rubric scores 9, and 4 of those 9
> points come from S5 and S6 — an IA that flattens sequences into tabs and a pedagogy that explains
> parameters and errors superbly while never explaining the flow as a story — not from anything wrong
> with the components, the tokens or the styling, which score 1, 1 and 0.**

The three findings that most drove it:

1. **PED-04** — the token request has no documentation, no preview and no visible step, so the one step
   where PKCE is *proven* rather than asserted is the one step the tool does not teach.
2. **PED-05** — the authorization request never enters the trace, because it is a navigation and only
   `transport.ts` records. The tool's central claim about itself — *"each arrow is a request that
   actually happened"* — is missing the request the user composed by hand.
3. **UX-01 / PED-06** — the reading corpus (24 cited parameters, 46 documented error codes, 26 claims) has
   no surface of its own, and the attacker-model prose that would complete it **already exists in the
   repo's own code comments**, written for maintainers and never promoted into the UI.

**A revamp is not remotely justified**, and would be actively destructive: it would put at risk the four
things this product is already best-in-class at — `errorDocs`' live-verified vendor decoding, `authParams`'
verified citations, `JwtInspector`'s deliberate unverified-by-default posture, and `transport.ts`'
single-egress capture with `SequenceView` on top.

---

## Phase 5 — Roadmap

Effort key: **S** ≤ half a day · **M** 1–3 days · **L** ≥ 1 week.

### P0 — Correctness & safety

| ID | Title | Rationale | Files | Effort | Risk | Acceptance criteria |
|---|---|---|---|:--:|:--:|---|
| **P0-1** | `iss` compared by exact origin | SEC-01. A prefix match in an RFC 9207 mix-up defence, in a file that teaches mix-up defence | `pages/CallbackPage.tsx:112` | **S** | Low | `iss=https://oauth.example` is **refused** against `API_BASE_URL=https://oauth.example.com`; a test covers the truncation case, not just an obviously-different origin |
| **P0-2** | Once-guard the code exchange | ENG-01. StrictMode redeems a one-time code twice; a correct flow can report `invalid_grant` | `pages/CallbackPage.tsx:35`, `main.tsx:10` | **S** | Low | Exactly one `POST /api/token` per callback under StrictMode; a test asserts the second mount does not re-request |
| **P0-3** | Confirm the four live destructive actions | UX-09. A misclick permanently deletes a client Modules 02/03 depend on | `admin/ClientManagementSection.tsx:336`, `oidc/DcrSection.tsx:186`, `admin/GrantManagementSection.tsx:74`, `oidc/TokenOpsSection.tsx:157` | **S** | Low | Each requires typing the client/grant id to proceed; local-only clears (tokens, traces) stay unguarded |
| **P0-4** | Parse `iss` inside the `try` | ENG-02. A malformed `iss` throws and leaves the callback on a spinner forever | `pages/CallbackPage.tsx:111-119` | **S** | Low | `?iss=notaurl` renders an error, not a spinner; covered by a test |
| **P0-5** | Clear the stored secret when the field is emptied | ENG-04. A stale secret makes a public client send `client_secret` → `[A157303]`, field visibly empty | `auth/AuthFlowsSection.tsx:182,247` | **S** | Low | Emptying the field and re-running sends **no** `client_secret`; asserted on both keys |
| **P0-6** | Redact `code` and `token` on export | ENG-05. cURL and markdown export carry a live authorization code or access token *with redaction on* | `services/trace-store.ts:118-127` | **S** | Low | `redactBody` masks `code=` and `token=`; extends the existing test |
| **P0-7** | Announce results and errors to AT | A11Y-01. Zero live regions in an app whose content *is* the async response | `hooks/useAsyncCall.ts`, `ui/SplitPane.tsx` | **M** | Low | A polite region announces status + outcome; an assertive one announces errors; verified with one AT pass |
| **P0-8** | Un-nest the vault buttons | A11Y-02. Invalid HTML in the sidebar on every route | `ui/TokenVault.tsx:42,57` | **S** | Low | No `<button>` inside a `<button>`; expand still keyboard-operable |
| **P0-9** | Header wraps and the title truncates | UX-05. Non-wrapping flex chrome on every surface, incl. the reading straddle | `layout/AppLayout.tsx:40` | **S** | Low | No horizontal body scroll at 360px; **verify by screenshot before closing** |
| **P0-10** | `<h1>` per page, focus on route change | A11Y-03. No document root on 20 pages; focus never moves on navigation | `layout/SectionPanel.tsx:35`, `layout/AppLayout.tsx` | **S** | Low | One `<h1>` per route, no skipped levels; focus lands on the main region after navigation |
| **P0-11** | Correct the `iss` comment | ENG-03. A security comment stating the opposite of its own code, in a teaching repo | `pages/CallbackPage.tsx:106-112` | **S** | None | Comment and code agree — preferably by implementing the stated behaviour |

### P1 — Pedagogical depth (the differentiator)

| ID | Title | Rationale | Files | Effort | Risk | Acceptance criteria |
|---|---|---|---|:--:|:--:|---|
| **P1-1** | Record the front-channel hops | PED-05. The authorization request and the callback redirect never enter the trace, so the sequence diagram misses both front-channel hops | `auth/AuthFlowsSection.tsx:249`, `pages/CallbackPage.tsx`, `services/trace-store.ts` | **S** | Low | Both appear in the timeline and as arrows in `SequenceView`, marked as navigations rather than fetches; `flow-progress.hasAuthorizeRequest` becomes reachable |
| **P1-2** | `TokenRequestBuilder` | PED-04. 0 of 6 token-request parameters documented, in the step where PKCE is proven and 4 of the 6 commonest errors occur. Also gives ENG-01 its explicit action | new `auth/TokenRequestBuilder.tsx`, `pages/CallbackPage.tsx`, `data/tokenParams.ts` | **M** | Med | Six parameters each with spec, section, conformance word, example and failure mode; the previewed body **is** the body sent; an explicit *Exchange* button |
| **P1-3** | Close the "so what" | PED-10. Success renders a JSON blob; the ID token just obtained is not inspectable from the section that obtained it | `auth/AuthFlowsSection.tsx:610` | **S** | Low | Success pane shows `JwtInspector` for `id_token` and `access_token`, plus scope/lifetime and one next-step link |
| **P1-4** | A `threat` field on the parameters that carry a promise | PED-06. `attack`/`attacker` appear **0** times in ~2,100 LOC of teaching prose; the prose exists in code comments | `data/authParams.ts`, `auth/AuthorizeRequestBuilder.tsx` | **M** | Low | ~10 parameters (`state`, `nonce`, `code_challenge`, `redirect_uri`, `dpop_jkt`, `request`, `max_age`, `acr_values`, `client_id`, `response_mode`) each state the attack prevented, rendered above `note` |
| **P1-5** | `FlowDiagram` for CIBA, Device, DCR | PED-02. Three strict sequences rendered as peer tabs; the machinery is written and at 100% coverage | `oidc/CibaSection.tsx`, `oidc/DeviceSection.tsx`, `oidc/DcrSection.tsx` | **M** | Low | Each shows a diagram driven by `flow-progress`; a tab whose prerequisite produced no trace entry is disabled with a reason |
| **P1-6** | Render `FlowStep.description` | PED-03. Declared at `FlowDiagram.tsx:7`, never rendered — five bare words for five steps | `ui/FlowDiagram.tsx`, its 3 call sites | **S** | None | Each step carries one sentence on what happens there |
| **P1-7** | Context-aware error diagnosis | PED-07. `ErrorExplainer` takes a string; the trace holds both requests, so PKCE and `redirect_uri` mismatches are computable | `utils/decode-error.ts`, `ui/ErrorExplainer.tsx` | **M** | Med | On `invalid_grant`, if both requests are in the trace, state whether the verifier hashes to the challenge and whether the two `redirect_uri`s are byte-identical |
| **P1-8** | A `/reference` reading surface | UX-01. 20 doing surfaces, 0 reading surfaces, and the whole reading corpus already written | new `pages/ReferencePage.tsx`, `App.tsx` | **M** | Low | Renders `authParams` + `claimDocs` + `errorDocs` as prose, deep-linkable per entry, holds at 360px |
| **P1-9** | `ErrorExplainer` in FAPI and JAR | PED-08. The two sections with the most cryptic errors are the two that only `toast.error` | `fapi/FapiSection.tsx`, `oidc/JarSection.tsx` | **S** | Low | Both render `ErrorExplainer`; `[A005328]` shows its entry |
| **P1-10** | RFC 8693 Token Exchange section | PED-01. The server implements it and Module 06 teaches it through three deliberate defects; the debugger cannot send it | new `oidc/TokenExchangeSection.tsx` | **L** | Med | Sends a token-exchange request; documents `subject_token`, `actor_token`, `requested_token_type`, `resource`, `audience`; names the three deliberate defects as such |
| **P1-11** | Glossary | PED-09. 26 claims reachable from one component; *front-channel*, *confidential client*, *bearer*, *sender-constrained* defined nowhere | new `data/glossary.ts`, `ui/HelpPopover.tsx` | **M** | Low | ~25 concepts defined and cited; inline terms link to the entry |
| **P1-12** | Coverage floor for components + driven section tests | ENG-06. Function coverage 1.5–20% on the interactive surface while the gate passes | `vitest.config.ts`, `src/test/components/**` | **L** | Low | A `src/components/**` function-coverage floor is added and ratcheted; each section has one test that drives its primary control against the four dead-flow classes |
| **P1-13** | Type and validate the protocol boundary | ENG-07. 64 LOC of types for 62 endpoints; `zod` installed and unused; lint not type-aware | `types/`, `services/transport.ts`, `eslint.config.js` | **M** | Med | zod schemas for the 6–7 response shapes the UI reads; `parserOptions.projectService` on, `no-floating-promises` and `no-unsafe-member-access` enabled and clean |

### P2 — Design system foundation

| ID | Title | Rationale | Files | Effort | Risk |
|---|---|---|---|:--:|:--:|
| **P2-1** | Collapse the type scale to 3 tokens, floor at 11px | UX-04. 91 of 253 declarations arbitrary; `0.7rem` and `0.72rem` coexist; `text-[0.55rem]` is 8.8px | `styles/globals.css` + ~28 files | **M** | Low |
| **P2-2** | Tokenise the 102 translucent fills | UX-02. Chosen against `#020617`; the light-theme surface hierarchy is unverified and outside every gate | `styles/globals.css` + ~30 files | **M** | Med |
| **P2-3** | A per-palette shadow token | UX-11. `shadow-slate-900/80` reaches light mode on the callback page | `ui/Card.tsx:13-14`, `styles/globals.css` | **S** | Low |
| **P2-4** | `HelpPopover` height viewport-relative | UX-06. Fixed 480px panel unreachable below ~504px of viewport height — and it holds the differentiator content | `ui/HelpPopover.tsx:15,38` | **S** | Low |
| **P2-5** | Container queries for `SplitPane` | UX-07. A viewport query solving a container problem; the signature two-pane layout waits for 1280px | `ui/SplitPane.tsx:24` | **S** | Low |
| **P2-6** | URL state for tab and wizard step | UX-08. Nothing below the section is addressable; back does not undo a tab change | `App.tsx`, 8 tabbed sections | **M** | Low |
| **P2-7** | Remove the 3 unreferenced theme tokens | UX-03. Dead tokens are how a palette drifts from the app | `styles/globals.css` | **S** | None |
| **P2-8** | Decompose the five 500+ LOC sections | ENG-14. 33 / 24 / 20 / 19 / 18 `useState` per file; `react-hook-form` + `zod` are installed and unused (F-0.1) | 5 section files | **L** | Med |

### P3 — Polish & delight

| ID | Title | Files | Effort |
|---|---|---|:--:|
| **P3-1** | Favicon and app icon (F-0.8) | `index.html`, `public/` | **S** |
| **P3-2** | Wire `SectionPanel`'s `loading` prop or delete it (UX-10) | `layout/SectionPanel.tsx` + sections | **S** |
| **P3-3** | Motion that does work — reveal on response arrival, step advance | `ui/FlowDiagram.tsx`, `ui/SplitPane.tsx` | **M** |
| **P3-4** | Export and re-import a run (completes UX-01's shareable half) | `services/trace-store.ts`, new route | **L** |
| **P3-5** | `prefers-reduced-motion` (A11Y-04) | `styles/globals.css` | **S** |
| **P3-6** | Housekeeping: clear the 4 `setTimeout`s, memoise `JsonBlock`, delete the dead constant (ENG-10/11/15) | 5 files | **S** |

### Recommended first sprint — top 5 by impact-to-effort

| # | ID | Why this one |
|---|---|---|
| 1 | **P1-1** | ~30 lines makes the front-channel visible in both the timeline and the sequence diagram, and makes the tool's central claim about itself true |
| 2 | **P0-1** | A prefix match in a mix-up defence, in the file that teaches mix-up defence, in a repo that treats a wrong citation as a defect. One line |
| 3 | **P0-2** | Stops the headline flow reporting `invalid_grant` for a correct run in the environment learners actually use |
| 4 | **P1-3** | Turns "here is a JSON blob" into "here is what you hold and what to do with it", entirely from components that already exist |
| 5 | **P0-3** | Prevents one misclick permanently deleting a client Modules 02 and 03 are built on |

Four of the five are **S**. P0-4, P0-5, P0-6, P0-8, P0-11 are each a handful of lines and should ride along.

### What I'd do first if I had one day

**P1-1 — synthesise the authorization request and the callback redirect into the trace store.**

`recordTrace` already accepts a response-less entry (`status: 0`), so this is two calls: one in
`AuthFlowsSection.sendAuthorizeRequest` before `window.location.href = url`, one in `CallbackPage`
recording the inbound redirect and its parameters. Nothing needs designing.

Why this over the security fix or the token builder: it is the smallest change that alters what the
product *is*. Today a learner composes an authorization request in a 24-parameter builder, sends it, and
watches it vanish — the request history and the four-lane sequence diagram both begin at the token
exchange. After this change the trace shows the whole conversation: client → AS (front channel), AS →
client (redirect with the code), client → AS (back channel). **Front-channel versus back-channel is the
single most important structural idea in OAuth, the four lanes exist to teach it, and the diagram
currently cannot show it.** One afternoon, and the tool's best feature starts telling the truth about the
flow it was built for.


---

## Findings Register

**43 findings: 0 Critical · 11 High · 19 Medium · 13 Low.** Eight of the eleven High findings are pedagogy
or IA, which is the verdict restated as a distribution. Every row carries a `file:line` anchor; full
detail is in the phase section named in the last column.

| ID | Sev | Axis | Evidence | One line | Effort | Detail |
|---|:--:|---|---|---|:--:|:--:|
| **SEC-01** | High | Security | `pages/CallbackPage.tsx:112` | RFC 9207 `iss` check is a prefix match; `https://oauth.example` passes against `https://oauth.example.com` | S | §1 |
| **ENG-01** | High | Async | `pages/CallbackPage.tsx:35-229`, `main.tsx:10` | StrictMode redeems the one-time code twice; a correct flow can report `invalid_grant` in dev | S | §1 |
| **A11Y-01** | High | A11y | `hooks/useAsyncCall.ts`, `ui/SplitPane.tsx` | Zero live regions (`aria-live` 0, `role="status"` 0) in an app whose content is the async response | M | §1 |
| **PED-02** | High | Pedagogy | `oidc/CibaSection.tsx`, `oidc/DeviceSection.tsx`, `oidc/DcrSection.tsx` +5 | 8 of 20 sections render an ordered sequence as peer tabs; `FlowDiagram` is used in 3 | M | §2 |
| **PED-04** | High | Pedagogy | `pages/CallbackPage.tsx:206-213`, `data/operationDocs.ts:15-22` | The token request has 0 of 6 parameters documented, no preview, no visible step | M | §2 |
| **PED-05** | High | Pedagogy | `auth/AuthFlowsSection.tsx:249`, `services/transport.ts:135,166` | The authorization request never enters the trace — it is a navigation, and only `transport.ts` records | S | §2 |
| **PED-06** | High | Pedagogy | `data/authParams.ts`, `data/operationDocs.ts` | `attack`/`attacker`: **0** occurrences in ~2,100 LOC of teaching prose; the notes teach failure modes | M | §2 |
| **PED-10** | High | Pedagogy | `auth/AuthFlowsSection.tsx:610` | Success renders a `JsonBlock` and stops; zero cross-section guidance strings in the codebase | S | §2 |
| **UX-01** | High | IA | `App.tsx:265`, absence of `/docs`,`/glossary` | 20 doing surfaces, 0 reading surfaces — and the whole reading corpus is already written | M | §3 |
| **UX-05** | High* | Responsive | `layout/AppLayout.tsx:40` | Header is a non-wrapping flex row with no `truncate`/`min-w-0`, on every surface. *Downgrades to Low if a 360px screenshot shows it holding | S | §3 |
| **UX-09** | High | Interaction | `admin/ClientManagementSection.tsx:336` +3 | Six irreversible actions, zero confirmations; four hit live Authlete, two clients are curriculum infrastructure | S | §3 |
| **ENG-02** | Med | Async | `pages/CallbackPage.tsx:111-119` | A malformed `iss` throws outside the `try`; the callback hangs on a spinner forever | S | §1 |
| **ENG-03** | Med | Correctness | `pages/CallbackPage.tsx:106-112` | The comment claims a missing `iss` is reported; the code ignores it | S | §1 |
| **ENG-04** | Med | State | `auth/AuthFlowsSection.tsx:182,247` | Write-if-present with no clear: a stale secret makes a public client send `client_secret` → `[A157303]` | S | §1 |
| **ENG-05** | Med | Security | `services/trace-store.ts:118-127` | `redactBody` omits `code` and `token`, so cURL and markdown export leak both *with redaction on* | S | §1 |
| **ENG-06** | Med | Testing | `vitest.config.ts:38-52`; `admin/ClientManagementSection.tsx` 1.53% funcs | The gate passes at ~5% function coverage of the interactive surface; `useAsyncCall` is 0% branch | L | §1 |
| **ENG-07** | Med | TypeScript | `types/token.ts:22`, `eslint.config.js:13-18` | Protocol boundary untyped and unlintable; `zod` installed and imported nowhere | M | §1 |
| **A11Y-02** | Med | A11y | `ui/TokenVault.tsx:42,57` | `<button>` nested in `<button>` in the sidebar, on every route | S | §1 |
| **A11Y-03** | Med | A11y | `layout/SectionPanel.tsx:35`, `layout/AppLayout.tsx:56` | No `<h1>` anywhere; outline starts at `<h2>` and skips to `<h4>`; no focus move on route change | S | §1 |
| **A11Y-06** | Med | A11y | `trace/SequenceView.tsx:104,151-162` | `role="img"` makes the SVG subtree presentational, so the `role="button" tabIndex={0}` arrows inside are focusable but never announced | S | §3 |
| **PED-01** | Med | Pedagogy | `admin/AdminSection.tsx:32` | RFC 8693 Token Exchange has no section, though the server implements it and Module 06 teaches it | L | §2 |
| **PED-03** | Med | Pedagogy | `ui/FlowDiagram.tsx:7` | `FlowStep.description` is declared, never rendered, never passed — five bare words for five steps | S | §2 |
| **PED-07** | Med | Pedagogy | `utils/decode-error.ts`, `ui/ErrorExplainer.tsx:47` | The explainer takes a string and never reads the trace, so PKCE/`redirect_uri` mismatches go undiagnosed | M | §2 |
| **PED-09** | Med | Pedagogy | `data/claimDocs.ts` → `ui/JwtInspector.tsx:290` | 26 claim definitions reachable from one component; no glossary; *front-channel*, *bearer* undefined | M | §2 |
| **UX-02** | Med | Design system | 102 sites over ~30 files, e.g. `ui/JwtInspector.tsx`, `trace/TracePanel.tsx` | Translucent literal fills chosen against `#020617`; the light-theme surface hierarchy is outside every gate | M | §3 |
| **UX-03** | Med | Design system | `styles/globals.css:21-43`; `scripts/check-theme-tokens.mjs` reports 20/18/15 | Three declared, mapped theme tokens are referenced by no utility | S | §3 |
| **UX-04** | Med | Typography | 91 of 253 declarations; `ui/ErrorExplainer.tsx:199`, `ui/TokenVault.tsx:98` | Six arbitrary sizes in a 0.25rem band; `0.7rem` and `0.72rem` coexist; `text-[0.55rem]` is 8.8px | M | §3 |
| **UX-06** | Med | Responsive | `ui/HelpPopover.tsx:15,38` | Fixed 480px panel with a pixel-sized scroller; unreachable content below ~504px viewport height | S | §3 |
| **UX-08** | Med | IA | `App.tsx`, no `useSearchParams` | The URL stops at the section; tab, step, trace row and token are all unaddressable | M | §3 |
| **UX-11** | Med | Design system | `ui/Card.tsx:13-14`, `pages/CallbackPage.tsx:232` | `shadow-slate-900/80` is a near-black shadow reaching the light theme on the callback page | S | §3 |
| **ENG-08** | Low | TypeScript | `hooks/useAsyncCall.ts:68` | `useDiscriminatedAsyncCall` returns `result: unknown`; 13 sections cast or JSON-dump | S | §1 |
| **ENG-09** | Low | Perf | `context/TokenContext.tsx:70-72` | Context value not memoised while `CredentialContext` is; harmless today, a trap tomorrow | S | §1 |
| **ENG-10** | Low | Correctness | `hooks/useClipboard.ts:11` +3 | Four copy-confirmation `setTimeout`s never cleared on unmount | S | §1 |
| **ENG-11** | Low | Perf | `ui/JsonBlock.tsx:13` | `JSON.stringify(data, null, 2)` on every render, unmemoised | S | §1 |
| **ENG-12** | Low | Build | `vite.config.ts:26` | Production ships sourcemaps (1.6 MB entry map). A decision to confirm, not a defect | S | §1 |
| **ENG-13** | Low | UX/Security | `ui/RequestBuilder.tsx:67-77` | The toggle deciding whether real client secrets reach the clipboard is labelled `reveal` / `redacted?` | S | §1 |
| **ENG-14** | Low | Architecture | `admin/ClientManagementSection.tsx` (33 `useState`) +4 | Five sections over 500 LOC mixing orchestration, form state and markup | L | §1 |
| **ENG-15** | Low | Dead code | `config.ts:110` | `MCP_AS_METADATA_ENDPOINT` has zero consumers | S | §1 |
| **A11Y-04** | Low | A11y | `styles/globals.css` (no media query); `ui/FlowDiagram.tsx:44` | No `prefers-reduced-motion`. Kept Low: 5 animations total, 24 of 29 transitions are colour | S | §1 |
| **A11Y-05** | Low | Tooling | `eslint.config.js`, `package.json` | No `eslint-plugin-jsx-a11y`, so A11Y-01/02/03/06 were invisible to lint | S | §1 |
| **PED-08** | Low | Pedagogy | `fapi/FapiSection.tsx`, `oidc/JarSection.tsx` | The only two sections without `ErrorExplainer` are two of the three with the most cryptic errors | S | §2 |
| **UX-07** | Low | Responsive | `ui/SplitPane.tsx:24` | A viewport query (`xl:`) solving a container problem; the signature two-pane layout waits for 1280px | S | §3 |
| **UX-10** | Low | Interaction | `layout/SectionPanel.tsx:12,44` | The `loading` prop and `SkeletonCard` are never called — corroborated by 0% coverage on `Skeleton.tsx` | S | §3 |

### Findings deliberately *not* raised

Recorded so a later reader knows they were considered rather than missed.

- **Doing surfaces that collapse to one column** — `SplitPane` below `xl:`, form grids below `sm:`, the
  trace toolbar wrapping. Per the declared posture these are graceful collapses, not findings.
- **Unredacted `Authorization` headers on screen** (`ui/RequestBuilder.tsx:84`). The stated design is
  "real on screen, redacted on export", and the two-channel client-auth distinction the repo teaches is
  only legible if the scheme is visible. Considered; not filed.
- **`SequenceView`'s fixed 760px SVG.** It sits in `overflow-auto`, so the scroll is *contained* and the
  page body never scrolls sideways. That is the correct pattern.
- **`HelpPopover`'s `aria-modal="true"`** on a non-modal-looking popover. It genuinely traps focus, has
  Escape, and returns focus to the trigger — so the attribute is honest.
- **`operationDocs.ts` at 1,291 LOC.** It is data, and it is a 21 kB gzip chunk loaded on first
  navigation. That is the pedagogy payload and it earns its weight.
- **The placeholder `client_id`.** `config.ts:28-30` explains why it is deliberately *not* normalised,
  and the reasoning is sound. The finding is the missing hint beside it (walkthrough step 5), not the
  placeholder.
- **Anything that would apply identically to a to-do app.** Generic memoisation advice, folder-structure
  preferences and import ordering were cut.

---

## Open Questions for Odai

Decisions only you can make. Ordered by how much downstream work each one gates.

**Q1 · Novice-vs-expert balance on first paint.** `/` currently redirects to a 20-item dashboard whose
first control is a form (UX-01, walkthrough steps 1–7). Three options, and they lead to different
roadmaps: **(a)** keep the redirect and add a hint beside the `client_id` field — smallest change,
leaves the on-ramp at 1/5; **(b)** a genuine landing route that says what this is, what to configure, and
offers "run your first flow" — fixes the widest competitive gap; **(c)** a `/reference` reading surface
(P1-8) and let `/` stay a dashboard for returning users. My recommendation is **(b) then (c)**, because
(b) is the finding and (c) is the corpus that already exists.

**Q2 · How far to take PED-04.** The engineer wants a full `TokenRequestBuilder` symmetric with
`AuthorizeRequestBuilder`; the designer wants a compact `RequestBuilder` preview plus an on-demand
parameter table, on the grounds that a second 600-line builder on the first screen is a lot. Both agree
the explicit *Exchange* button is required either way, because it also fixes ENG-01. **Your call on
scope.**

**Q3 · Appetite for a component library.** The 17 hand-rolled primitives in `components/ui/` are
competent and the a11y gaps are centralised in six files (S4 = 1), so **nothing in this audit requires
one**. But `HelpPopover` reimplements a positioned, focus-trapped popover from scratch (218 LOC,
UX-06's bug lives there), `TabBar` reimplements roving tabindex, and UX-09 needs a dialog that does not
exist. If the appetite exists, those three are the case for it. **Per C6 I have deliberately not
verified any candidate library's current version or maintenance status** — that costs a WebFetch each
and I will only spend it if you want the option costed.

**Q4 · Match or diverge from the reference tools.** Their model is a single-page flow runner; yours is a
20-section spec catalogue, and that is *why* your breadth is uncatchable and your on-ramp is 1/5. Do you
want to close the on-ramp gap (a guided path through the sections) or lean further into being the
reference implementation for people who already know what they are looking for? The roadmap assumes the
former; say so if it is the latter, because P1-8 and Q1 change shape.

**Q5 · Production sourcemaps** (ENG-12). The engineer wants them off; the designer and educator want
them on, because the source is public and a learner reading commented source in DevTools is getting the
product's value. **Currently on. Confirm or flip.**

**Q6 · Surface misclassification — I believe there is none, and here is the one I nearly moved.**
`/callback` looks like a reading surface and I resolved it to *doing*, because a shared `/callback` URL is
**guaranteed to fail** for the recipient — the `code` is one-time and `state`/`pkce_code_verifier` live in
the originating browser's `sessionStorage`. If you disagree, the consequence is concrete: it would make
UX-11 (the dark shadow on `Card`) and the 360px behaviour of `/callback` **High** rather than Medium.
`/discovery` and `/federation` are the other candidates — two buttons and a JSON document each, almost
pure output — but they still require a click to produce anything, so I left them doing.

**Q7 · Should I fetch and re-score the four reference tools?** The benchmark in §3 is `[UNVERIFIED]` —
scored from training knowledge, because oauthdebugger.com, oauth.tools and curity.io are not on this
session's pre-approved WebFetch list. Approve the domains and I will re-score with receipts.

---

## Screenshots Requested

Rendering was unavailable, so the highest-value inferences are listed in priority order. Each row names
what the screenshot would settle — several could downgrade a finding, which is the point.

| # | Screen | Viewport(s) | Theme | What it settles |
|:--:|---|---|---|---|
| 1 | Any route — **the header** | **360**, 390, 768 | both | **UX-05.** Does the header overflow or squash? A clean 360px shot downgrades it from High to Low |
| 2 | `/auth-flows` full page | **360**, 768, 1024, 1440 | both | UX-02's light-theme surface hierarchy: are `/10`, `/15`, `/20` tints still distinguishable on white? Plus the DPoP checkbox block and the amber signing-key warning |
| 3 | `/callback` after a successful flow | 360, 1024 | **light** | **UX-11.** How heavy is `shadow-slate-900/80` on white? Also whether the two `JwtInspector`s hold at 360px |
| 4 | `HelpPopover` open, from a parameter row | 1440×**700**, 1440×**500**, 360 | dark | **UX-06.** Is the bottom of a 480px panel reachable in a short viewport? |
| 5 | `/auth-flows` — `AuthorizeRequestBuilder`, all four groups expanded | 1440, 768, 360 | both | The best screen in the product, unverified. Row density, the 24-parameter table, whether `text-[0.6rem]`/`0.65rem` labels are legible (UX-04) |
| 6 | Trace panel open, **sequence** view, ≥6 requests | 1440, 1024, 360 | both | Whether the 760px SVG scroll is discoverable, and whether the drawer + reserved padding behave as designed |
| 7 | Trace panel open, **timeline** view, one row expanded | 1440, 360 | dark | Header table and body wrapping under real token lengths |
| 8 | `/client-mgmt` | 1440 | both | UX-09's context: how close is the free-text client-id field to the unguarded Delete button? |
| 9 | `ErrorExplainer` on a real `[A157357]` or `[A124301]` | 1024, 360 | both | The product's strongest asset, unverified. Legibility of the `text-[0.55rem]` "verified here" badge (UX-04) |
| 10 | `/mcp` or `/fapi` wizard mid-flow | 1440, 1024 | both | The two wizards have **no component test** (`AGENTS.md` says so) and no rendering evidence here |

**Also useful, and not a screenshot:** one keyboard-only pass through `/auth-flows` → Send → `/callback`
(does focus ever land somewhere sensible after navigation? — A11Y-03), and one screen-reader pass over a
request/response cycle (A11Y-01, which I expect to be silent).


---

## 10 · Remediation Record — 2026-08-22

**40 of 43 findings fixed. 420 → 571 tests. All gates green, including three that are new or tightened.**

### What the gates say now

| Gate | Before | After |
|---|---|---|
| `tsc --noEmit` | clean | clean, **+ `noImplicitOverride`** |
| `eslint --max-warnings 0` | clean, **not type-aware** | clean, **type-aware** — `no-floating-promises`, `no-misused-promises`, `no-unsafe-member-access`, `no-unsafe-argument` |
| `vitest run` | 420 tests / 41 files | **571 tests / 53 files** |
| coverage | 58.17 / 54.05 / 46.5 / 58.75, two per-area floors | **62.09 / 57.60 / 51.46 / 62.52**, **six** per-area floors |
| `vite build` | ✓ | ✓ |
| `check-theme-tokens` · `check-contrast` · `check-client-docs` · `check-docs` · `extract-authlete-codes` · `check-discovery` · `check-route-coverage` | ✓ | ✓ |

The type-aware lint found **47 real issues on its first run**, and every one was fixed at its cause
rather than silenced. `check-client-docs.mjs` was **tightened** after it gave a false pass, and the
tightened version immediately found three more genuinely undocumented sections.

### Findings fixed

| ID | Sev | Fix | Test that pins it |
|---|:--:|---|---|
| **SEC-01** | High | `iss` compared by whole origin with `===`; unparseable value treated as a failed comparison | `CallbackPage.test.tsx` — two truncation cases (`https://oauth.example`, `…example.co`), **proven to fail against the old `startsWith`** |
| **ENG-01** | High | `useRef` latch keyed on the query string, set synchronously before the first `await` | A real `<StrictMode>` render asserting exactly one exchange — **proven to report 2 without the latch** |
| **A11Y-01** | High | `services/announcer.ts` + `LiveAnnouncer` mounted once in `AppLayout`, driven from `useAsyncCall` — reaches all 22 sections from one change | 16 tests incl. both regions mounted empty before first paint |
| **PED-02** | High | `utils/sequence-progress.ts` + `FlowDiagram` in CIBA, Device and DCR, with per-step prose | 7 tests incl. back-fill from an unobservable step |
| **PED-04** | High | `data/tokenParams.ts` (8 params, every citation verified against RFC 6749 §4.1.3 / 7636 §4.5–4.6 / 7523 §2.2) + `TokenRequestPanel`, rendered on **both** outcomes | 20 tests incl. "every param has citation + conformance + note + failure mode" |
| **PED-05** | High | `recordNavigation` with an explicit `direction`; both front-channel hops recorded; `SequenceView` draws one dashed arrow per hop in the right direction; `TracePanel` shows `NAV` not `ERR` | 11 tests incl. the inbound hop attributed to the AS, not the client |
| **PED-06** | High | `threat` field on the 16 parameters that carry a security promise, rendered behind a `why` toggle; omitted on the 8 that carry none | 3 tests naming the security-bearing set explicitly |
| **PED-10** | High | `TokenOutcome` — what you hold, the scheme it needs, its lifetime and scope, plus JWT inspectors and three next steps. Shared by Grant Flows and the callback | covered via the routes and callback suites |
| **UX-01** | High | `/reference` — the first reading surface. Glossary (26 terms) + all params + claims + errors, single column, every entry deep-linkable, read from the **same modules** the panels use | 24 tests incl. "only cross-references terms that exist" |
| **UX-05** | High | Header `flex-wrap` + `min-w-0` + `truncate` on the identity | — (layout; see the screenshot list) |
| **UX-09** | High | `ConfirmDialog` with focus trap, Escape, focus return, and **typed confirmation** on the four live-Authlete deletions; `useConfirmedAction` so four sections share one implementation | 11 tests incl. prefix/superstring rejection and "starts empty after reopen" |
| **ENG-02** | Med | `originOf()` returns `null` instead of throwing | covered |
| **ENG-03** | Med | The stated behaviour implemented: a missing `iss` is now **reported** non-fatally | covered |
| **ENG-04** | Med | Both writes clear the key when the value is empty | — |
| **ENG-05** | Med | `code` and `token` added to redaction, with an identifier-boundary regex verified against 7 shapes | 4 tests, incl. the nested-JSON form body |
| **ENG-06** | Med | Global ratchet raised; **four new per-layer floors** (`hooks`, `context`, `data`, `pages`) — **proven to fail when breached** | the floors themselves |
| **ENG-07** | Med | Type-aware lint on; 47 errors fixed at cause; `utils/parse-json.ts` replaces the `JSON.parse → any` boundary in 5 sections | 13 tests on `useAsyncCall`'s previously-0%-branch error path |
| **ENG-08** | Low | `useDiscriminatedAsyncCall<Label, Result>` — `unknown` stays the default | a test that fails if the parameter is removed |
| **ENG-09/10/11** | Low | `TokenContext` memoised; `useCopyFeedback` owns all **five** copy timers; `JsonBlock` memoised | — |
| **ENG-13** | Low | `secrets: shown` / `secrets: hidden` with `aria-pressed` | — |
| **ENG-15** | Low | Dead constant removed | — |
| **A11Y-02** | Med | Sibling buttons, not nested | — |
| **A11Y-03** | Med | `<h1>` per route via `SectionPanel`; `CardTitle` takes `as`; sub-headings normalised; focus moves to `#main` on route change | route suite asserts **exactly one `h1`** per route |
| **A11Y-04** | Low | `prefers-reduced-motion` block; spinners slowed rather than stopped | — |
| **A11Y-06** | Med | `role="img"` removed from the SVG; label on a `role="group"` wrapper | 2 tests incl. "the old role must not come back" |
| **PED-01** | Med | `/token-exchange` section — the flow the debugger could not send. Surfaces the **three deliberate Module 06 defects as deliberate**, detected from the response | 18 tests across section + service |
| **PED-03** | Med | `FlowStep.description` rendered, and written for all five grants + three sequences | — |
| **PED-07** | Med | `utils/diagnose.ts` — recomputes the PKCE transform and diffs `redirect_uri` and `client_id` against the authorization request, on request | 10 tests; never guesses, reports `inconclusive` |
| **PED-08** | Low | `ErrorExplainer` in FAPI, JAR and Health — 21 of 22 sections now | — |
| **PED-09** | Med | 26-term glossary, including the six terms defined nowhere before | 5 tests on the data itself |
| **UX-02** | Med | 116 translucent literals → **15 tokens** across 5 roles × 3 strengths, all four palette blocks | `check-theme-tokens` — **it caught two missing light tokens mid-fix** |
| **UX-03** | Med | The three dead tokens made load-bearing: `--ring: var(--accent)`, `::selection` via `color-mix`, `text-card-foreground`, `text-accent-foreground` | `check-theme-tokens` |
| **UX-04** | Med | Six arbitrary sizes → three on-scale steps; `--text-2xs` floor at **11px**; 92 sites swept; zero arbitrary sizes remain | `check-contrast` |
| **UX-06** | Med | Popover height derived from the viewport, with a `MIN_HEIGHT` floor and a viewport-relative scroller | — |
| **UX-07** | Low | `@container` + `@[44rem]` — the signature two-pane layout now appears when there is room, not at 1280px | — |
| **UX-08** | Med | `useUrlState` — the selected operation lives in the URL in **9 sections**, validated against the allowed set, `replace` not `push` | 7 tests, replace-vs-push asserted via `useNavigationType` |
| **UX-10** | Low | `SectionPanel.loading` deleted (never called); `SkeletonCard` became the route-level Suspense fallback, removing layout shift on every navigation | — |
| **UX-11** | Med | `--shadow-card` / `--shadow-card-elevated` per palette | `check-theme-tokens` |
| **F-0.2** | — | `noImplicitOverride` on (2 real fixes). The other two options **measured and rejected** — see below | — |
| **F-0.8** | Low | `public/favicon.svg` + `<link rel="icon">` | — |

### Not fixed, and why

| ID | Sev | Why not |
|---|:--:|---|
| **ENG-12** — production sourcemaps | Low | **Yours to decide (Q5).** The three voices split: source is public on GitHub and a learner reading commented source in DevTools is getting the product's value. Left **on**, unchanged. |
| **A11Y-05** — no `eslint-plugin-jsx-a11y` | Low | **Blocked by constraint C4** (no installing dependencies). Recommended, not installed. Its absence is now partly compensated: A11Y-01/02/03/06 are all fixed and pinned by tests. |
| **ENG-14** — five 500+ LOC sections | Low | **Deliberately deferred.** Decomposing components that hold token-handling logic is an L-effort refactor with real regression risk, and it buys no behaviour. Two things reduced the pressure honestly: `useUrlState` and `useConfirmedAction` removed state from four of the five, and `ClientManagementSection` is down from 33 `useState` calls. The right sequencing is per-section tests **first** — which is why the coverage floors were added and why `src/components/**` deliberately has none yet. |

### Two of my own recommendations, rejected on evidence

The audit named `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` as gaps (F-0.2). Both were
enabled against the real codebase and reverted:

| Option | Diagnostics | Real defects | Verdict |
|---|:--:|:--:|---|
| `noUncheckedIndexedAccess` | 82 | **0** | Every one a narrowing the compiler cannot do after an explicit `length` check. 82 non-null assertions would cost more safety than the option buys. |
| `exactOptionalPropertyTypes` | 42 | **0** | All React components receiving `undefined` for an optional prop. The one case that genuinely matters — omitted key versus `undefined`, which `URLSearchParams` turns into the literal `"undefined"` — is already handled by construction. |

The gap those two were pointing at is real and it is closed differently: type-aware ESLint (47 genuine
issues) and `utils/parse-json.ts`, which removed the `JSON.parse → any` boundary that was the actual
source of unchecked protocol data. Recorded in `client/README.md` so the decision is not re-litigated
from the finding alone.

### Four defects the audit missed, found while fixing

1. **`check-client-docs.mjs` gave a false pass.** It normalised the whole README into one string, so the
   new Token Exchange section counted as documented because the *FAPI* section's prose contained the
   phrase "token exchange with a proof". Now matched against **headings** — and the tightened version
   immediately found **three sections that were never documented at all**: Grant Flows (whose heading
   still said "Auth Flows — The Four Standard Grant Types", for five grants), RAR, and Device Flow. All
   three are written up now.
2. **`TokenSet` and `TokenResponse` were the same shape declared twice** and mutually unassignable over
   an index signature nothing needed. Surfaced as a compile error the moment one component tried to
   render both. Unified on `IssuedTokens`.
3. **`JSON.parse` → `crypto.subtle.importKey`** in four places: a stored key went into a *signing* call
   as `any`, and a corrupted `sessionStorage` entry threw inside a `catch` that reported it as "failed to
   exchange code for token". Now read through `readJsonKey<JWK>`, which returns `null`.
4. **Five uncleared copy timers, not four.** The audit found four; `TracePanel` had a fifth on its
   markdown export.

### One thing the remediation could not change

Everything visual is still **`[INFERRED]`** — no browser tooling was available for the fixes either. The
screenshot list in §9 stands, and two rows are now specifically about verifying a fix rather than a
finding: **#1 (the header at 360px)** confirms UX-05, and **#4 (`HelpPopover` at 500px viewport height)**
confirms UX-06. UX-02's light-theme tints are measured for *contrast* by `check-contrast`, but whether
the surface *hierarchy* still reads on white is a judgement only an eye can make — row #2.
