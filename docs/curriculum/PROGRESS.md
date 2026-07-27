# Progress Tracker

**The short version:** check off each module as you finish it, but only after you can honestly pass its
**self-assessment gate** — a plain-language "can you actually do this?" test. The gates matter more than the
checkboxes. Cumulative exams follow Modules 03, 07, and 11; a final exam precedes the capstone.

> How to grade yourself honestly: a gate is passed only if you can do it **without notes** and **explain
> why**, not just recite what. If you can describe *what* PKCE is but not *what breaks without it*, the gate
> is not passed yet.

## One-time setup

- [ ] Server running on `:3000` (`npm --prefix server run dev`)
- [ ] Dashboard running on `:3001` (`npm --prefix client run dev`)
- [ ] `docs/curriculum/scripts/curriculum.env` created and sourced
- [ ] `node docs/curriculum/scripts/decode-jwt.mjs` runs on a token you obtained

## Modules

| ✓ | Module | Self-assessment gate (do this without notes) |
|---|--------|----------------------------------------------|
| [x] | 00 · Web + JOSE | Given a raw JWT, decode it locally and explain why decoding ≠ trusting; name the three JWS parts and what each protects. |
| [x] | 01 · Delegation problem | Explain the password anti-pattern and name all six core roles + which endpoint each talks to. |
| [x] | 02 · OAuth core + threats | Draw the authorization-code flow at wire level; name two grants RFC 9700 deprecates and why. |
| [x] | 03 · PKCE + public clients | Explain the exact attack PKCE closes and why `state` doesn't close it; compute an `S256` challenge. |
| [ ] | 04 · Token lifecycle + metadata | Introspect and revoke a token via `curl`; explain when to use a JWT AT vs. an opaque token. |
| [ ] | 05 · Request integrity + binding | Explain what PAR, JAR, `iss`, mTLS, and DPoP each protect; reproduce the `ath`-vs-`sub` DPoP failure. |
| [ ] | 06 · Machine + delegated grants | Distinguish impersonation from delegation in a token-exchange response; choose a grant for a daemon. |
| [ ] | 07 · OAuth 2.1 + Security BCP | Map five RFC 9700 attacks to the module that defends each; state what OAuth 2.1 removes. |
| [ ] | 08 · OIDC Core + logout | Explain why an access token doesn't authenticate a user; validate an ID token step by step; `nonce` vs. `state`. |
| [ ] | 09a · Interaction extensions | Explain what JARM adds over `state`; pick poll/ping/push for a CIBA scenario; force a step-up challenge. |
| [ ] | 09b · Identity + credentials | Explain selective disclosure in SD-JWT; place OID4VCI/VP and federation in the graph. |
| [ ] | 10 · FAPI + grant management | State the FAPI 2.0 attacker model in your own words; explain why refresh-token rotation is forbidden. |
| [ ] | 11 · API security beyond the token | Find a BOLA in a code snippet; explain why a valid token can't stop it; choose RBAC vs. ABAC vs. ReBAC. |
| [ ] | 12 · Capstone | Design a high-assurance multi-tenant authZ architecture and defend it; then find the flaws in the vulnerable variant. |

## Assessment gates

- [ ] **Cumulative Exam A** (after Module 03) — foundations through PKCE
- [ ] **Cumulative Exam B** (after Module 07) — full OAuth 2.0 + hardening + consolidation
- [ ] **Cumulative Exam C** (after Module 11) — OIDC, extensions, FAPI, API security
- [ ] **Final Exam** (before Module 12) — everything, with a self-grading rubric
- [ ] **Capstone** — design + adversarial review, graded against the rubric

## Quiz tiers (what "passing" means)

Each module quiz has 15–20 items across four tiers. You have passed a module when you can:

- **Tier 1 — Recall:** name the roles, endpoints, parameters, and which spec defines what.
- **Tier 2 — Applied reasoning:** choose the right flow/grant/client-auth for a scenario and justify it.
- **Tier 3 — Trace & diagnose:** find the defect in a real HTTP exchange, log, Authlete flag, or code snippet.
- **Tier 4 — Adversarial & design:** exploit a misconfiguration or defend a design against a named attacker
  model. **Do not advance until you can pass Tier 4** — it is the whole point.

---

_The definition of done for the entire curriculum is at the bottom of [README.md](README.md). Measure yourself
against it before calling the capstone complete._

---

## Build Log (resume state for a fresh session)

> This section is the author's build tracker, not learner content. A fresh session should read it to know
> exactly what is written, what was verified, and what is still open. Newest entry first. Modules are written
> one per turn in order (00 → 12, with 09a/09b). Plan file:
> `/home/blackadi/.claude/plans/playful-stargazing-hoare.md`.

### Stage / module status

- [x] Stage 1 — plan (approved)
- [x] Stage 2 — scaffold + top-level docs (README, SPEC-INVENTORY, GLOSSARY, PROGRESS, scripts) — committed
- [x] **Module 00 — Web + JOSE Foundations** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 01 — The Delegation Problem** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 02 — OAuth Core + Threats** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 03 — PKCE + Public Clients** — README, lab, quiz, quiz-answers written & committed
- [ ] Module 04 — Token Lifecycle + Metadata  ← **next**
- [ ] Modules 05–12 (09a/09b) — pending
- [ ] Stage 4 — consistency pass

### Service configuration — resolved, and what is still outstanding

**RESOLVED 2026-07-27.** `fapiModes` and `supportedServiceProfiles` were cleared on service `local-testing`
(API key `3693555522`). The full authorization-code flow now runs end to end. For the record, that one
setting — **not** `require_pushed_authorization_requests` — was the cause of every earlier failure:

| Symptom while `fapiModes = ["FAPI2_SECURITY"]` | Observed error |
|---|---|
| Plain `GET /api/authorization` refused | `[A294308] The authorization request was sent without PAR.` |
| `client_secret_basic` refused | `[A295301] The client authentication method … is not allowed.` |
| `password` grant refused | `[A295306] The grant type ('password') is not allowed.` |

> **Re-enable `fapiModes` at Module 10**, where FAPI is the subject. Modules 03–09 assume it is off.

**Public client — RESOLVED 2026-07-27.** Client `4277838306` now reads `clientType: PUBLIC`,
`tokenAuthMethod: NONE`, `parRequired: false`. The Module 03 labs run against it.

**Still outstanding:**

- Client `4277838306` has `idTokenSignAlg: HS256`, which a public client cannot use — requesting the `openid`
  scope fails with `[A406301] The algorithm is symmetric (HS256), but the client type of the client … is not
  'confidential'.` Module 03 sidesteps this by using `scope=profile`, but **Module 08 (OIDC) needs it set to
  an asymmetric algorithm — `ES256`.**
- `GET /api/fapi/config` still fails: the body is an SDK `ResponseValidationError` from `serviceGet`
  (`{"error":"Bad Request","message":"Response validation failed",…}`). Pre-existing and unrelated to the
  curriculum; it affects Module 10. Two notes: the earlier guess that `fapiModes` caused it is **disproven**
  — the field is cleared and the failure persists; and the endpoint returned that error body under HTTP
  **200** on the last check (400 earlier), so the status code itself may be a second, separate bug.

Nothing on the Authlete service was changed by the curriculum build; the repo owner made the console change.

*(Gated source changes — JARM, mTLS, RFC 9728 PRM — are still proposed inside Modules 05/09a/10 as planned;
this is a configuration issue, not one of those.)*

### Module 03 — done / verified / uncertain

- **Done:** `README.md` — derives PKCE from four requirements rather than asserting it (fresh per request /
  one-way front-channel value / bound at the server / not downgradable); public-vs-confidential table; a
  `state`-vs-PKCE table that settles the most common confusion; the §4.8 downgrade rule **in both
  directions**; RFC 8252 native-app hardening (embedded-webview prohibition + the three redirect strategies);
  and the public-client refresh-token rule with the FAPI 2.0 tension spelled out. `lab.md` — six exercises.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added RFC 8252 to SPEC-INVENTORY and five terms to
  GLOSSARY.
- **Verified against the live server (every lab command executed against public client `4277838306`):**
  S256 pair generation and the round-trip check; full flow → token with **no client secret in the request**
  (`access_token, token_type, expires_in, scope, refresh_token`, `scope=profile`). Breaks: no verifier →
  `invalid_grant [A050312]`; wrong verifier → `invalid_grant [A050315]`; **no PKCE at all → ACCESS TOKEN
  ISSUED** (43 chars) from a bare `client_id` replay, which is the module's headline demonstration;
  `code_challenge_method=plain` → accepted; verifier-without-challenge → `invalid_grant [A050317]`, so this
  deployment enforces **both** directions of RFC 9700 §4.8; `refresh_token` grant → the refresh token
  **rotated** (consistent with the service's `refreshTokenKept = false`, read from `/service/get`).
  **Verified (primary sources):** RFC 7636 title/status/date, §4.1 ABNF and the 43–128 bound quoted verbatim,
  §4.2 S256 formula, §4.3 `plain` default, §4.6 `invalid_grant` requirement; RFC 8252 title/BCP 212/Oct 2017,
  §7.1–§7.3, §8.12 embedded-user-agent prohibition and the §7.3 loopback-port sentence quoted verbatim;
  RFC 9700 §2.1.1 (S256 recommendation), §2.2.2 (public-client refresh tokens), §4.8 (downgrade) quoted
  verbatim. Service flags read directly: `pkceRequired`/`pkceS256Required`/`refreshTokenKept` all `false`.
- **Uncertain / notes:** the lesson's modulo-bias observation about `client/src/pkce.ts` is my own arithmetic
  (66-character alphabet, `% 66` on a byte ⇒ ~6.039 vs 6.044 bits/char, ~386 vs ~387 bits over 64
  characters) — presented as *not* exploitable, and used deliberately to teach calibrated severity judgement
  rather than as a finding. Two behaviors are labelled non-normative: refresh-token rotation (service
  config) and the bracketed Authlete error codes. The lab **cannot** verify the `pkceRequired=true` fix,
  since that is a console change on the reader's own service; it is described as configuration guidance, not
  as an exercise with a claimed output. Corrected the SPEC-INVENTORY path for PKCE: it is
  `client/src/pkce.ts`, not `client/src/services/pkce.ts`.

### Module 02 — done / verified / uncertain

- **Done:** `README.md` — derives the code-vs-token choice from the front-channel constraint; full
  parameter-by-parameter walk of RFC 6749 §4.1.1–§4.1.4; "why a code, not a token" comparison; the grant
  catalogue keyed on *human present?* + *can the client keep a secret?*; the device grant (RFC 8628) with its
  four polling error codes quoted; the two error channels (§4.1.2.1 vs §5.2) and the rule that an error may
  only be redirected to an already-validated URI; the complete RFC 9700 §4 attack catalogue (17 rows) mapped
  to the module that defends each; and what `state` does *not* do, as the setup for Module 03. `quiz.md` +
  `quiz-answers.md` (18 items across 4 tiers). Added authorization code / code interception / polling to
  `GLOSSARY.md`.
- **Done (second pass, after `fapiModes` was cleared):** `lab.md` — the full code flow driven leg by leg with
  `curl` + a cookie jar; local decode of the real tokens; five break-it exercises (code replay, mismatched
  `redirect_uri` at the token endpoint, unregistered `redirect_uri` at the authorization endpoint, the
  implicit grant, the device grant).
- **Verified against the live server (every lab command was executed):** full flow → `302` to
  `/api/session/login` → 64-char CSRF → login `302` to `/api/session/consent?…&scopes=openid,profile` →
  consent `302` to the callback with `code` (43 chars) + `state` + `iss` → token exchange returns
  `access_token, token_type, expires_in, scope, refresh_token, id_token`. The **access token is opaque**
  (43 chars, no dots) so `decode-jwt.mjs` prints its "not a JWS … introspect it instead" path; the **ID token
  decodes** as `alg:HS256` with `iss/sub/aud/exp/iat/auth_time/acr:"pwd"/s_hash`; `GET /api/userinfo` with the
  access token returns the profile claims. Breaks: replay → `invalid_grant [A050305] No such authorization
  code.`; mismatched redirect → `invalid_grant [A050309]`; unregistered redirect → **400 with no `Location`
  header**, `[A011304]`; `response_type=token` → live access token in the URL **fragment** alongside
  `token_type/expires_in/scope/iss`; device authorization → `userCode`, `interval:5`, `expiresIn:600`, and
  polling → `authorization_pending [A242307]`.
- **Verified (primary sources, this session):** RFC 6749 §3.1.1 "Response Type", §3.3 "Access Token Scope",
  §4.1 + §4.1.1–§4.1.4 titles, §4.2, §4.4, §5.1, §5.2, §6, §10.12 "Cross-Site Request Forgery"; the six §5.2
  error codes and the seven §4.1.2.1 error codes (both enumerated from the RFC). RFC 8628 title, Standards
  Track, August 2019, §3.1/§3.2/§3.4/§3.5, the grant-type URN, and all four polling error definitions quoted
  verbatim. RFC 9700 §2 and §4 subsection lists in full, plus the PKCE sentence (§2.1.1) and the exact-string
  redirect-matching sentence (§4.1) quoted verbatim. **Verified against the live server:** the three FAPI 2.0
  symptoms in the BLOCKER table, plus `[A157302]` on the public client, plus `fapiModes`/`parRequired` read
  from `/service/get`.
- **Uncertain:** `state`'s §10.12 purpose is cited by section number and title only — the fetched text of that
  paragraph came back paraphrased, so nothing from §10.12 is quoted verbatim. Two behaviors are labelled in
  the lab as **Authlete-specific, not normative**: opaque (non-JWT) access tokens, and the fact that a
  *failed* token exchange does **not** consume the authorization code (only a successful one does) — verified
  by retrying the same code with the correct `redirect_uri` after a mismatch and getting tokens. Break 4
  requires the learner to temporarily enable the `IMPLICIT` grant; the lab says so twice and tells them to
  turn it back off.

### Module 01 — done / verified / uncertain

- **Done:** full lesson (`README.md`) — the password anti-pattern and its five structural harms, deriving the
  role separation from the "client never touches the credential" constraint, the six-actor cast (four RFC 6749
  §1.1 roles + user agent + Authlete as policy engine, both explicitly flagged as *not* spec roles), an
  endpoint→actor→channel table, credential-vs-token across five properties, and a dark-theme mermaid diagram
  contrasting the anti-pattern with delegation. `lab.md` — actor inventory from live metadata, the credential
  boundary in `login.ejs:18`, server-side enforcement, three break-it exercises. `quiz.md` +
  `quiz-answers.md` (17 items across 4 tiers). Added a **Concepts** table + `User agent` / `Policy engine`
  rows to `GLOSSARY.md`. No new SPEC-INVENTORY rows needed (RFC 6749/6750/9700 already present).
- **Verified (ran against the live server on :3000):** discovery one-liner prints issuer + all six endpoints +
  `grant_types_supported`; `curl "$API/session/login" | grep -o '<form[^>]*>'` →
  `action="/api/session/login"`; `grep -n 'action=' server/src/views/consent.ejs` → line 13; POST of **valid**
  credentials to `/api/session/login` with a fresh CSRF token → **401** `"Missing authorization context -
  session not found"`; `GET /api/session/consent` → **403** `"Unauthorized - no ticket in session"`; ROPC
  token request (both `client_secret_basic` and `client_secret_post`) → `[A295306] The grant type ('password')
  is not allowed.`; `Authorization: Bearer <password>` on `/api/userinfo` → **401** with
  `WWW-Authenticate: Bearer error="invalid_token" … [A088302]`. Spec citations verified against rfc-editor.org
  this session: RFC 6749 §1.1 role definitions (quoted verbatim), §1.2, §2.1, §3.1, §3.2, §4.3 (both quoted
  sentences); RFC 6750 title/date, §2.1, §3, §3.1 `invalid_token` definition; RFC 9700 title, BCP 240,
  January 2025, **§2.4** *"The resource owner password credentials grant [RFC6749] MUST NOT be used."* and
  §2.1.2 on the implicit grant.
- **Uncertain / notes:** the ROPC lab documents **both** outcomes (refused here; if a learner's deployment
  permits it, they analyse what they did and did not gain) because the refusal is Authlete policy, not
  something the spec makes observable. Three deployment issues surfaced that affect *later* modules, not this
  one — see **Open decisions** above; the most consequential is service-level mandatory PAR, which means no
  Module 02 lab can complete a plain authorization-code flow until that is resolved. Error strings with
  bracketed codes are labelled in-lab as Authlete vendor behavior, distinct from the spec-defined status codes
  and `WWW-Authenticate` structure.

### Module 00 — done / verified / uncertain

- **Done:** full lesson (`README.md`) covering front/back channel, TLS scope, JOSE stack, decode≠verify;
  `lab.md` (discovery + JWKS + AS-metadata inspection, local decode, three break-it exercises); `quiz.md` +
  `quiz-answers.md` (16 items across 4 tiers, incl. two DPoP JOSE-precision Tier-3 items previewing Module 05).
  Added transport/encoding foundations (RFC 8446, 9110, 4648) to SPEC-INVENTORY §0.
- **Verified (ran against the live server on :3000 / locally):** `GET /api/health` → 200; `GET
  /api/.well-known/openid-configuration` → JSON (issuer/jwks_uri/endpoints); `GET
  /api/.well-known/jwks.json` → 1 EC P-256 ES256 sig key (fields kty/use/crv/kid/x/y/alg); `GET
  /.well-known/oauth-authorization-server` → JSON. `decode-jwt.mjs` sample decode + `--ath`; Break 1 (tamper
  claim, keep sig → decodes as `sub:attacker`) and Break 2 (`alg:none`) both run as written. Spec dates
  verified against primary sources (RFC 8446 Aug 2018, RFC 9110 Jun 2022, RFC 4648 Oct 2006, JOSE RFC
  7515–7519/7638).
- **Uncertain / notes:** the running server advertises a tunnel hostname + issuer `https://blackadi.dev` in
  discovery (deployment-specific) — lab notes this and uses `localhost` directly; JWKS lives at
  `/api/.well-known/jwks.json` (the `/api/jwks` path is the SPA fallback — corrected before writing). Two
  Tier-3 quiz items reference DPoP (`ath` vs `sub`, required `jwk` header) as forward previews but embed the
  RFC 9449 requirement in the question so they stay self-contained.
