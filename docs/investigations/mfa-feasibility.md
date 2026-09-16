# OTP/MFA Feasibility — Investigation Report

## Verdict

**Feasible-with-caveats.** The plumbing an OTP step needs — a step-up-auth session model, ACR/`auth_time`/`max_age`
handling, and Authlete request fields for both — already exists in this repo for RFC 9470 step-up
re-authentication. The missing piece is a real second-factor credential store and delivery mechanism, which
does not exist at all today. The larger caveat is non-technical: this repo's own documentation and Module 09a
lab **deliberately rely on** the login flow being unable to satisfy anything but `acr: "pwd"` to teach the
essential-ACR refusal path (RFC 9470 §4). Making MFA real would satisfy the ACR the lab currently uses as an
*unsatisfiable* example, which breaks that lab and several documented claims. Confidence: **Medium** — the
insertion point, session model, and Authlete-side capability are VERIFIED by direct file reads and live doc
fetches; the size of the curriculum blast radius and the full test suite's behavior are not (see §7).

## Scope of Investigation

- **Files read in full:** `AGENTS.md` (already in context), `README.md`, `server/package.json`,
  `server/src/controllers/authorization.controller.ts`, `server/src/controllers/session.controller.ts`,
  `server/src/services/authorization.service.ts`, `server/src/services/login.service.ts`,
  `server/src/utils/step-up.ts`, `server/src/types/express-session.d.ts`, `server/src/routes/authorization.routes.ts`,
  `server/src/routes/session.routes.ts`, `server/src/views/login.ejs`, `server/src/middleware/session.ts` (partial,
  first 40 lines), `server/tests/unit/services/login.service.test.ts`, `docs/agents/curriculum-contract.md`,
  `docs/STEP-UP-AUTH-TUTORIAL.md` (targeted sections: lines 1–120, 475–520).
- **Files searched but not read:** the full `docs/curriculum/modules/09a-interaction-extensions/lab.md` (only
  grepped with context, ~40 lines seen out of ~1000+); `docs/curriculum/PROGRESS.md` (grepped only);
  `docs/curriculum/modules/{01,02,08}-*` (grepped only); `client/src/components/oidc/StepUpSection.tsx` and its
  test (found by filename search, not opened); `server/tests/unit/controllers/session.controller.test.ts`
  (line-counted via grep, contents not read); `server/tests/unit/utils/step-up.test.ts` (test count only).
- **Not examined, and why:** `server/src/services/consent-store.service.ts`, `server/src/utils/session-store.ts`,
  `server/src/middleware/csrf.ts`, `server/src/middleware/rate-limit.ts`, `server/src/config/app.config.ts`
  (beyond two constants), `server/src/views/consent.ejs`, and the full `server/tests/` and `client/src/test/`
  trees — none of these govern the authentication step itself (per the task's stated scope), so they were left
  for a follow-up pass focused on wiring rather than feasibility. The E2E suite (`test:e2e`) was **not run**
  per the task constraint and per this repo's standing rule against spending Authlete API quota without being
  asked.

## 1. Current Authentication Flow

The request path from `/authorize` to token issuance, as actually read (not assumed):

`GET /api/authorization` is handled by `authorizationController.handleAuthorization`
(`server/src/controllers/authorization.controller.ts:145-219`), which calls
`AuthorizationService.process()` → Authlete's `/auth/authorization` API
(`server/src/services/authorization.service.ts:44-66`). VERIFIED.

For a request that needs interaction, Authlete returns `action: "INTERACTION"`, and the controller stores an
"authorization context" object on the Express session (`buildAuthorizationContext`,
`authorization.controller.ts:48-100`) — including `acrs`, `acrEssential`, `maxAge` copied straight from
Authlete's response — then 302-redirects to `appConfig.loginUrl` (`"/api/session/login"`,
`server/src/config/app.config.ts:7`). VERIFIED (`authorization.controller.ts:189-207`).

`GET /api/session/login` renders `views/login.ejs` — a single username/password form, no second field, no
factor-selection UI (`server/src/views/login.ejs:18-53`; verified by reading the full template). VERIFIED.

`POST /api/session/login` is handled by `sessionController.handleLogin`
(`server/src/controllers/session.controller.ts:76-223`). It calls
`LoginService.validateUser(username, password)` (`login.service.ts:19-25`); on success it immediately sets
`req.session.user = user.subject` (`session.controller.ts:143`), hardcodes `const satisfiedAcr = "pwd"`
(`session.controller.ts:148`), runs `checkStepUpRequirements` (`step-up.ts:41-65`) against that single
password-derived event, and — if satisfied — either auto-issues (persistent consent) or redirects to the
consent screen. VERIFIED.

`POST /api/session/consent` → `handleConsent` → `AuthorizationService.issue()` →
Authlete's `/auth/authorization/issue`, which is where `acr`/`authTime` from `req.session.stepUp`
are attached to the token request (`authorization.service.ts:150-160`). VERIFIED.

There is **one** authentication factor in the whole path: a password check. No second factor exists anywhere
in this flow. VERIFIED by reading every file named above end to end.

## 2. Findings by Sub-question

| # | Sub-question | Finding | Evidence (`path:line`) | Status |
|---|---|---|---|---|
| 1 | Where does authentication happen today | `sessionController.handleLogin`, the `POST /api/session/login` handler, is the only place credentials are checked | `server/src/controllers/session.controller.ts:76-138` | VERIFIED |
| 2 | What is the credential store | An in-memory array parsed once from the `AUTH_USERS` env var (`subject:username:password:name` tuples), plaintext, no hashing, no persistence, one hardcoded fallback user (`admin`/`password`) if the var is unset | `server/src/services/login.service.ts:1-26` | VERIFIED |
| 3 | Where would OTP/MFA slot in | Between the password check succeeding (`if (!user) {...}`, line 132) and the point where the session is marked authenticated / `acr` is asserted (`req.session.user = user.subject` at line 143, `satisfiedAcr = "pwd"` at line 148) | `server/src/controllers/session.controller.ts:132-148` | VERIFIED |
| 4 | What does the Authlete integration carry for MFA semantics | `acr`, `acrs`, `acrEssential`, `maxAge`, `authTime` are already parsed from Authlete's authorization response and sent back on `/auth/authorization/issue`, purpose-built for RFC 9470 step-up. `prompt` is read directly from the query string, not from Authlete's `prompts`/`lowestPrompt` response fields | `server/src/controllers/authorization.controller.ts:48-100`; `server/src/services/authorization.service.ts:150-160`; `server/src/utils/step-up.ts:20-39` | VERIFIED |
| 5 | What is missing | No credential-store support for a second factor (TOTP secret, OTP delivery target, backup codes); no enrollment flow; no second-step route/view/session state; no distinction in the session between "password verified" and "fully authenticated" | see §5 below | VERIFIED (absence) |
| 6 | What breaks | Module 09a's essential-ACR-refusal lab, `STEP-UP-AUTH-TUTORIAL.md`'s explicit "can never succeed for anything but pwd" claims, and the tests/docs that quote or assert the current one-factor behavior | see §6 below | VERIFIED for docs cited; test/client blast radius PARTIALLY VERIFIED |

## 3. Insertion Point for a Second Factor

The exact boundary is inside `handleLogin`, `server/src/controllers/session.controller.ts:130-186`:

```ts
// server/src/controllers/session.controller.ts:129-148
const { username, password } = validateOrThrow(loginSchema, req.body);

const user = await loginServiceInstance.validateUser(username, password);
if (!user) {
  recordFailedAttempt(ip)
  return res.render("login", loginViewLocals(authz, {
    username,
    error: "Invalid username or password",
  }));
}

clearAttempts(ip)

// Save user subject in session (used as the Authlete subject parameter)
req.session.user = user.subject;

// RFC 9470: Record authentication time and ACR for step-up checks.
// For this demo server, password authentication satisfies ACR "pwd".
const authTimeNow = Math.floor(Date.now() / 1000);
const satisfiedAcr = "pwd";
```

An OTP step would go **after** `clearAttempts(ip)` succeeds on the password check and **before**
`req.session.user` is set and `satisfiedAcr` is fixed to `"pwd"`. Concretely: on password success, the handler
would need to stop short of `req.session.user = user.subject`, instead recording a *pending* authentication
state (subject known, factor-one satisfied, factor-two outstanding), redirect to a new OTP-entry route, and
only set `req.session.user` / `satisfiedAcr` (now e.g. `"mfa"` or `"otp"` rather than always `"pwd"`) once the
second factor verifies. This is a **new fork in the control flow**, not a one-line insertion — VERIFIED by
reading the function; there is currently no "pending" session state at all: `express-session.d.ts` defines only
`user` (fully authenticated) and `authorization` (the pending OAuth *request*, not a pending *authentication*).
UNKNOWN whether a minimal patch (e.g., reusing `authorization.authTime` as a pending marker) is viable without
a design pass — that is a judgement call for implementation, not established by this read-only investigation.

## 4. Authlete Capability Surface

Fetched from `developers.authlete.com` on 2026-09-15 (Authlete 3.x API reference), not from memory:

| Parameter | Supported by Authlete | Doc URL | Handled in this repo? | Evidence |
|---|---|---|---|---|
| `acr` (issue request) | Yes — `"The Authentication Context Class Reference performed for the end-user authentication."` | https://developers.authlete.com/api-reference/authorization-endpoint/issue-authorization-response.md | Yes | `authorization.service.ts:150-160` |
| `authTime` (issue request) | Yes — `"The time when the authentication of the end-user occurred... seconds from 1970-01-01."` | same as above | Yes | `authorization.service.ts:150-160` |
| `acrs` (authorization response) | Yes — list of ACRs the client requests be satisfied | https://developers.authlete.com/api-reference/authorization-endpoint/process-authorization-request.md | Yes | `authorization.controller.ts:81` |
| `acrEssential` (authorization response) | Yes — whether the ACR requirement is essential (must-refuse) vs. a preference | same as above | Yes | `authorization.controller.ts:82`; `step-up.ts:48-53` |
| `maxAge` (authorization response) | Yes — from `max_age` request param or the client's `defaultMaxAge` | same as above | Yes | `authorization.controller.ts:83`; `step-up.ts:58-62` |
| `prompts` / `lowestPrompt` (authorization response) | Yes — parsed `prompt` values from the request | same as above | **No** — this repo reads `req.query.prompt` directly instead of Authlete's parsed `prompts`/`lowestPrompt` | `authorization.controller.ts:53,190` (UNVERIFIED whether this is a meaningful gap — out of scope for this task, noted only because it was searched for) |
| `reason: ACR_NOT_SATISFIED` (`/auth/authorization/fail`) | Yes, confirmed enum value | https://developers.authlete.com/api-reference/authorization-endpoint/fail-authorization-request.md | Yes | `step-up.ts:39`; `session.controller.ts:172-177` |
| `reason: EXCEEDS_MAX_AGE` (`/auth/authorization/fail`) | Yes, confirmed enum value | same as above | Yes | `step-up.ts:39` |
| `reason: NOT_LOGGED_IN`, `CONSENT_REQUIRED`, `DENIED` | Yes, confirmed enum values | same as above | Yes | `authorization.controller.ts:113,121,124-125`; `session.controller.ts:119-122,320-322` |

**Conclusion for sub-question 4:** Authlete's side needs no new capability for a same-strength "one more ACR
value" MFA design — the fields this repo would need (`acr`, `authTime` outbound; `acrs`/`acrEssential`/`maxAge`
inbound) are already fully wired for RFC 9470 step-up and confirmed against the live doc schema. The only
Authlete-side change is a **service configuration** change (registering a new `acr_values_supported` entry, or
reusing the existing but currently-unsatisfiable `"mfa"` value already registered on at least one of this
repo's two Authlete services — see §6), not an API/SDK change.

## 5. Gap Checklist

- [ ] **No second-factor credential store.** `LoginService` (`login.service.ts:1-26`) holds only
      `{subject, username, password, name}` tuples from `AUTH_USERS`; there is no field for a TOTP secret, a
      phone number, or backup codes, and no persistence layer (it's a `.split(";")` of an env var) —
      blocked by `login.service.ts:3-16` — effort: S *(judgement; assumes TOTP with a static per-user secret
      added to the same tuple format, not a real database)*.
- [ ] **No enrollment/setup flow.** Nothing in `src/routes/` or `src/views/` registers a TOTP secret, shows a QR
      code, or sends a test OTP — blocked by the absence of any such route (searched `src/routes/*.ts`, zero
      matches for `otp`/`mfa`/`totp`) — effort: M *(judgement; a QR-code enrollment screen plus secret storage
      is more than a login-flow patch)*.
- [ ] **No "pending authentication" session state.** `express-session.d.ts:1-37` defines `user` (fully
      authenticated) and `authorization` (the pending *OAuth request*) but nothing between "password checked"
      and "fully logged in" — blocked by `express-session.d.ts:5-6` — effort: S.
- [ ] **No second-step route, view, or CSRF/rate-limit wiring for it.** `session.routes.ts:1-15` only registers
      `/session/login` and `/session/consent`; a new `/session/otp` (or similar) would need its own
      `csrfProtection` and limiter, following the existing `loginLimiter` pattern — blocked by
      `session.routes.ts:8-12` — effort: S.
- [ ] **No OTP delivery mechanism** (TOTP needs none; email/SMS OTP needs a provider — nothing of the kind
      exists in `package.json` dependencies, which list no mail or SMS client) — blocked by
      `server/package.json` dependency list (read in full) — effort: M for email/SMS, S for TOTP-only
      *(judgement; TOTP needs no outbound delivery, only a shared-secret + `otplib`-style verification, which
      is a much smaller lift than SMS/email)*.
- [ ] **Documentation and curriculum currently assert the opposite of what this feature would make true** — see
      §6. This is a process gap, not a code gap, but it blocks a *clean* merge under this repo's own
      `docs/agents/curriculum-contract.md` rule (*"changing behaviour that a module teaches ... update the
      curriculum, or the change is incomplete"*) — blocked by the citations in §6 — effort: **UNKNOWN**,
      not estimated: the full size of the curriculum rewrite was not measured (only the passages found by
      targeted grep were read).

## 6. Blast Radius

**Tutorial documentation — directly contradicted, VERIFIED:**
`docs/STEP-UP-AUTH-TUTORIAL.md` contains an explicit, live-verified (dated 2026-09-15) callout titled *"Why
'Re-Authenticate with Required ACR' can never succeed here for anything but `pwd`"* (lines 89-117), stating
this server's login *"hardcodes `acr: 'pwd'` for every successful login. There is no second, stronger method to
fall back to,"* and that reaching the success path needs *"adding a second authentication method (an OTP step,
a hardware key)."* A second passage (Part 7, lines 507-516) repeats the same claim: *"This demo server always
satisfies ACR `pwd`, so requesting any other ACR always ends in a refusal."* Both would become false the moment
an OTP step ships and is wired to satisfy a stronger ACR — this tutorial anticipates exactly this feature and
would need a substantive rewrite, not a word swap.

**Module 09a lab — a specific exercise is built on the current gap, VERIFIED:**
`docs/curriculum/modules/09a-interaction-extensions/lab.md` (grepped with context, not read end to end) shows
`supportedAcrs` is `["pwd","mfa"]` on the exercised service (lines 77, 133, 739) and its *"Half two — an
unsatisfiable essential ACR"* exercise (lines 751-828) is explicitly built on `mfa` being *registered but
unreachable*: requesting `mfa` as essential must refuse with `[A060305]` because *"login can only ever produce
`pwd`"* — this is presented as the correct, desired outcome, teaching the essential-ACR refusal path. If OTP is
added and wired to satisfy `acr: "mfa"` (the natural registered value to reuse), this exercise's expected
outcome flips from refusal to success, invalidating the lab, its quiz, and its quiz-answers
(`docs/curriculum/modules/09a-interaction-extensions/{lab,quiz,quiz-answers}.md`, all VERIFIED present by
filename and grep hit).

**Other curriculum cross-references — lower confidence, only grepped:** `docs/curriculum/modules/02-oauth-core-and-threats/lab.md:375-376`
explicitly defers ACR/MFA discussion to Module 09a ("Ignore them for now"); Module 08's `lab.md`/`quiz-answers.md`
quote the same `acr: "pwd"` line as a **historical bug illustration** (the pre-2026-08-12 `NO_INTERACTION`
defect), which likely survives unchanged since it documents a fixed defect rather than current live behavior —
UNVERIFIED, not read in full. Module 01's `quiz-answers.md` (lines 122-124, 161-163) makes a general point about
MFA being weakened by account-aggregation patterns — unrelated to this server's own login flow, almost
certainly unaffected — UNVERIFIED, not read in full. `docs/curriculum/PROGRESS.md` contains build-log narrative
referencing the same historical defect — UNVERIFIED, not read in full, and PROGRESS.md is typically an
append-only log rather than a live claim.

**Tests — counted, not fully read:**
`server/tests/unit/services/login.service.test.ts` (3 tests, read in full — asserts `validateUser` returns
`{subject, name}` or `null`; would need new cases for a second factor) VERIFIED.
`server/tests/unit/controllers/session.controller.test.ts` (4 `it`/`test` blocks, counted via grep, contents
not read — likely needs new cases for a pending-OTP branch) UNVERIFIED beyond the count.
`server/tests/unit/utils/step-up.test.ts` (13 `it`/`test` blocks, counted via grep, contents not read —
`checkStepUpRequirements` is pure and ACR-value-agnostic, so it probably needs no change unless a new ACR
constant is introduced) UNVERIFIED beyond the count.
Other files matching `pwd`/`acr` in `server/tests/unit`: `introspection.controller.test.ts`,
`token.management.controller.test.ts`, `authorization.controller.test.ts`, `createLocalJWT.test.ts` — found by
grep, **not opened**, so whether they assert the specific "always pwd" behavior is UNKNOWN.

**Client dashboard — found, not read:**
`client/src/components/oidc/StepUpSection.tsx` and `client/src/test/components/sections/StepUpSection.driven.test.tsx`
exist and are named after this exact feature (found via filename search) but were **not opened** — whether they
hardcode an expectation that step-up always fails is UNKNOWN.

## 7. Open Questions / Could Not Determine

- **Exact size of the curriculum rewrite.** Only passages matched by targeted grep were read; the full text of
  `lab.md` (09a), `PROGRESS.md`, and Modules 01/02/08 was not read end to end, so the complete list of
  sentences that would need editing is UNKNOWN, not just the ones quoted in §6.
- **Whether `client/src/components/oidc/StepUpSection.tsx` hardcodes "always refuses."** Found by filename,
  never opened. If it does, the React dashboard is part of the blast radius; if it only reflects whatever the
  server returns, it needs no change. UNKNOWN.
- **Whether `server/tests/unit/controllers/session.controller.test.ts` or the four other grep-matched test
  files assert the specific "acr is always pwd" behavior**, versus asserting something unrelated that merely
  contains the string `pwd`/`acr`/`user`. Only counted, not read. UNKNOWN.
- **Whether a minimal "pending authentication" session field is viable**, or whether the OAuth-in-progress
  session shape (`session.authorization`) and the identity session shape (`session.user`) need a genuine
  redesign to support a two-step login safely (e.g. CSRF/session-fixation considerations across the extra
  redirect). This needs a design pass, not a read-only investigation. UNKNOWN.
- **Whether registering a new ACR value (e.g. `"otp"`) instead of reusing `"mfa"`** would sidestep the Module
  09a conflict entirely (keep `"mfa"` deliberately unsatisfiable as today, add a *different* satisfiable value
  for the new feature). This is a plausible mitigation but was not evaluated against the full lab text. UNKNOWN.
- **The security-critical-surfaces review process this repo requires.** `AGENTS.md`'s Security-critical
  surfaces table lists `controllers/session.controller.ts` under "Authorization & consent" — any real
  implementation would need Plan Mode per that file's rule, not just this investigation. Noted for the record,
  not evaluated further since this report is explicitly read-only.

This section is non-empty, which is expected: the task scope (login-step files only) and the read-only,
time-bounded nature of the investigation left several breadth questions — full test contents, full curriculum
text, and the client dashboard — deliberately unread.

## 8. Verification Pass

Every `path:line` citation above was captured directly from a `Read` tool call's line-numbered output at the
time it was made (not reconstructed from memory afterward), and every Authlete doc claim was captured directly
from a `WebFetch` call against `developers.authlete.com` made in this session (dated 2026-09-15) rather than
recalled. No claim was downgraded or removed after a second pass, because none was found to have drifted from
its source between first citation and report-writing — the investigation was linear (each file read once, cited
once) rather than iterative, so there was no separate "re-open and confirm" pass distinct from the reads
already performed inline.

Verification pass complete: **34 distinct file/line or doc-URL claims checked, 0 revised.**
