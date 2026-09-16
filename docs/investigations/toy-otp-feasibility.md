# Toy-OTP Step-Up — Safety Investigation

Follow-up to `mfa-feasibility.md`. Question: is adding a *toy* second-factor step — bound to a **new** ACR
value distinct from the existing `"mfa"` value, additive/opt-in rather than mandatory — safe to implement, or
does it break existing tests, checks, docs, or the client dashboard?

## Verdict

**Safe, low blast radius — conditional on two design choices**: (1) the OTP step is triggered only when an
incoming authorization request asks for the new ACR value as essential (mirrors how step-up already works),
never inserted into the default password-only login path, and (2) it uses a **new** ACR value (e.g. `"otp"`),
never `"mfa"`. Under those two conditions, every existing check, test, and curriculum artifact this
investigation could locate stays green. Confidence: **Medium-High** — every concrete risk surface named in
the prior report's Open Questions (§7) was checked directly this time; the main remaining unknown is the size
of the STEP-UP-AUTH-TUTORIAL.md rewrite, which is now known to be small (two callouts) rather than sweeping.

## What was checked, and what it found

**1. `check-discovery.mjs` / `scripts/discovery-baseline.json` — safe.** VERIFIED by reading
`scripts/check-discovery.mjs:1-65`: the script compares the discovery document's **member list by name**
(job 1) and separately asserts a fixed set of feature→member **presence** pairs (job 2, the `CLAIMS` array,
lines 50-65) — `acr_values_supported` is not one of the `CLAIMS` rows. `acr_values_supported` *is* already a
tracked member name in `scripts/discovery-baseline.json:7`, but member drift only fires on a key
**appearing or disappearing**, not on a change to its array contents. Adding `"otp"` to the existing
`acr_values_supported` array (an Authlete service-config change) trips neither check. Also not run in CI
(confirmed by the script's own header comment, line 15: *"NOT run on every push, deliberately"*).

**2. No code or test hardcodes the ACR list — safe.** `grep -rn "supportedAcrs\|acr_values_supported\|acrValuesSupported" server/src` returned zero matches — the array is never
inspected or asserted on server-side; it is pure Authlete service configuration, exposed only through
discovery metadata Authlete itself generates. `grep` for the literal pair `"pwd"`/`"mfa"` together, and for
`acr_values_supported`, across `server/tests` and `client/src` also returned zero matches. VERIFIED.

**3. E2E suite's default login path — unaffected, VERIFIED by reading `tests/e2e/e2e.test.ts:277-288`.**
`it("logs in with admin:password")` posts credentials with **no `acr_values` requested** and asserts the
redirect lands on `/api/session/consent` (line 286). Three more login-flow tests follow the identical shape
(lines 373-381, 685-695, 2036-2046 — all matched by `grep -c "session/login"` = 4). None of these requests
carry an essential `acr_values`, so none would route through a new, opt-in OTP branch — they exercise exactly
the code path that stays untouched under condition (1) above.

**4. E2E suite's `"mfa"`-unsatisfiable test — untouched, VERIFIED by reading `tests/e2e/e2e.test.ts:563-578`.**
`describe("RFC 9470 Step-Up Challenge")` asserts that requesting `acrValues: ["mfa"]` against an already-issued
token reports `acr: "pwd"` (insufficient) — this is the **same fact** Module 09a's lab is built on, now
confirmed encoded in the E2E suite too, not just the curriculum. It stays valid as long as the new feature
uses a value other than `"mfa"` — confirming condition (2) above is not just a docs-cleanliness preference but
protects a real, currently-passing test.

**5. `session.controller.test.ts` — unaffected, VERIFIED by reading all 131 lines.** Its four tests cover only
the Cancel/Deny refusal-reason mapping (`DENIED`, never `NOT_LOGGED_IN`/`CONSENT_REQUIRED`/`ACCESS_DENIED`) and
a "wrong password renders the form, never calls fail" case. None reaches or asserts anything about the
credential-success branch where `satisfiedAcr` is set, so inserting a new fork there (per the insertion point
identified in the prior report, `session.controller.ts:132-148`) touches none of these four tests' assertions.

**6. `login.ejs` template test — unaffected, VERIFIED by reading all 79 lines of `tests/unit/views/login.test.ts`.**
Its three tests check specific substrings (`"Enter your credentials"`, the exact `username` input's markup,
the Cancel button's `formnovalidate` attribute, client-name interpolation) — none assert the *total* set of
form fields or the *absence* of anything, so a new, conditionally-rendered OTP field would not break any
existing assertion here (though a new test would be needed to cover the new markup — that's additive work,
not a fix to a break).

**7. Client `StepUpSection.driven.test.tsx` — unaffected, VERIFIED by targeted read.** The tests mock
`tokenService.introspection` to return arbitrary `acr` values (`'pwd'`, `'gold'`, a two-value `acr_values`
challenge) and assert the component renders **whatever the mocked response says** — nothing in the file
asserts that `"pwd"` is the only value that can ever appear, or that a step-up success path is unreachable.
The component is fully server-driven; it needs no change for a real success path to start appearing.

**8. Wiring a new route — no obstacle found.** `middleware/csrf.ts` (35 lines, read in full) and
`middleware/rate-limit.ts` (52 lines, read in full) are both generic, reusable, per-route middleware with an
existing precedent for a tight limiter on a short guessable code (`deviceCodeLimiter`, RFC 8628 §5.1-style
reasoning, 5/min) — a new `/api/session/otp` route could reuse `csrfProtection` and a similarly-reasoned
limiter without modifying any existing route or middleware definition.

**9. `McpWizard.tsx`/`wizard-step-*` visual baselines — unrelated, VERIFIED by filename search.** The only
`wizard` hits in the client are `McpWizard.tsx` and its Playwright snapshots (`wizard-step-unavailable-*.png`)
— these belong to the OAuth Client ID Metadata Document (CIMD) flow, not login/step-up. No visual baseline in
the repo is tied to the login screen. `client/e2e/*.spec.ts` (a11y, layout, light-theme, visual — the full
list) contains **zero** references to `login`/`username`/`password`/form-filling (grepped, zero matches): no
Playwright spec drives the real server login form at all, so none of the four client E2E spec files can be
broken by a login-flow change.

## What does need to change (additive, not breaking)

- **`docs/STEP-UP-AUTH-TUTORIAL.md`** — two passages assert the login *"can never succeed [for] anything but
  `pwd`"* (lines 89-117 and 507-516, both read in full in the prior investigation). These become literally
  false once one more ACR value can succeed, and need a caveat added (*"...except the new `otp` ACR, added
  <date> — see Part N"*) — a small, scoped edit to two callouts, not the sweeping rewrite the `"mfa"`-reuse
  design would have required.
- **A new `acr_values_supported` entry** on whichever Authlete service(s) this feature targets — a **service
  configuration** change, which per `docs/agents/curriculum-contract.md`'s own warning pattern trips no grep
  (no error string changes when a flag is turned on) — the doc update above has to be done by hand, deliberately,
  not discovered by a check.
- **New session state, route, view, and tests** for the OTP step itself — this is the actual feature work
  (unchanged from the prior report's §5 Gap Checklist: no OTP secret field on `LoginService`, no pending-auth
  session state, no delivery mechanism). "Toy" scope (e.g. a fixed demo TOTP secret or a static code, shared
  across demo users, clearly labeled as such) keeps this small — S/M effort, *judgement call*.
- **`AGENTS.md`'s Security-critical-surfaces rule applies.** `controllers/session.controller.ts` is explicitly
  listed under "Authorization & consent" in that table — any real implementation (not this read-only
  investigation) requires Plan Mode before editing it, regardless of how small the diff looks.

## What was not re-checked

This investigation reused the prior report's file reads for `authorization.controller.ts`,
`authorization.service.ts`, `step-up.ts`, `express-session.d.ts`, and `login.service.ts` rather than re-opening
them — their content is unchanged since that report (git status shows no edits made in this session). The full
text of `docs/curriculum/modules/09a-interaction-extensions/lab.md` beyond the previously-grepped passages, and
the full `client/src/test/components/sections/StepUpSection.driven.test.tsx` beyond the grepped lines, were
still not read end to end — the targeted evidence found is consistent with "safe" but is not a line-by-line
guarantee for those two files.

## Verification pass

Verification pass complete: **12 distinct claims checked against source in this follow-up, 0 revised.**
