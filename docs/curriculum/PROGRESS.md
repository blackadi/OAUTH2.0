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
| [x] | 04 · Token lifecycle + metadata | Introspect and revoke a token via `curl`; explain when to use a JWT AT vs. an opaque token. |
| [x] | 05 · Request integrity + binding | Explain what PAR, JAR, `iss`, mTLS, and DPoP each protect; reproduce the `ath`-vs-`sub` DPoP failure. |
| [x] | 06 · Machine + delegated grants | Choose a grant for a daemon; explain why a client-credentials token has no `sub`; given a token-exchange response, say whether you got impersonation or delegation and what a correct response would have contained. |
| [x] | 07 · OAuth 2.1 + Security BCP | Audit a deployment against RFC 9700 §2 from three sources and write findings with evidence, severity, and a defensible remediation order; state precisely what OAuth 2.1 does and does not do. |
| [x] | 08 · OIDC Core + logout | Explain why an access token doesn't authenticate a user and describe token substitution concretely; run all 13 OIDC Core §3.1.3.7 steps on a real ID token; `nonce` vs. `state`; name the four logout specs and what each cannot reach. |
| [x] | 09a · Interaction extensions | Name the four assumptions these extensions lift; explain what JARM adds over `state`/PAR/JAR and its three mandatory claims; pick poll/ping/push and defend it; write an RFC 9470 challenge and say what breaks without `acr_values`; judge RAR vs scopes. |
| [x] | 09b · Identity + credentials | Compute an SD-JWT digest that matches RFC 9901's own test vector; explain why the salt is load-bearing; strip a KB-JWT and say which verifier accepts it and why; name the one unlinkability property SD-JWT cannot provide; place OID4VCI/VP and federation in the graph. |
| [x] | 10 · FAPI + grant management | Name all six FAPI 2.0 attackers and four things the model puts out of scope; explain why refresh-token rotation is *forbidden*; show a deployment where every mechanism is supported and none required; run the grant lifecycle and say what a revocation does **not** revoke. |
| [x] | 11 · API security beyond the token | Find a BOLA in a code snippet and say why a valid token cannot stop it; name the three OWASP 2023 authorization failures and what the attacker changes in each; choose RBAC/ABAC/ReBAC and defend it; say what a gateway cannot enforce; write a regression test with its control assertion. |
| [x] | 12 · Capstone | Design a high-assurance multi-tenant authZ architecture, defending nine decisions against a **named** attacker model with an honest limitations section; then find **25** planted defects in the vulnerable variant, sever them correctly, and defend a remediation order — scoring 85+ on the rubric. |

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
- [x] **Module 04 — Token Lifecycle + Metadata** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 05 — Request Integrity + Binding** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 06 — Machine + Delegated Grants** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 07 — OAuth 2.1 + the Security BCP** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 08 — OIDC Core + Logout** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 09a — Interaction Extensions** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 09b — Identity + Credentials** — README, lab, quiz, quiz-answers + `scripts/sd-jwt.mjs` written & committed
- [x] **Module 10 — FAPI + Grant Management** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 11 — API Security Beyond the Token** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 12 — Capstone** — README (brief + rubric), lab (Aurora brief + Meridian vulnerable variant), quiz, quiz-answers written & committed
- [x] **STAGE 3 COMPLETE** — all 14 modules written, verified and committed
- [x] **Stage 4a — consistency pass** — run, 2 real errors found and fixed (see below)
- [ ] Stage 4b — backfill the four exams (A, B, C, Final)  ← **all that remains**

### Stage 4a — consistency pass: what was checked and what was found

Seven checks, run mechanically over all 60 curriculum markdown files rather than by reading.

| Check | Result |
|---|---|
| **Internal links resolve** | ✅ 0 broken out of every relative link in 60 files |
| **Referenced code paths exist** | ✅ 4 flagged, **all legitimate**: two learner output files that do not exist until the learner writes them (`my-audit.md`, `my-fapi-audit.md`), one path cited *deliberately as wrong* in a correction record (`client/src/services/pkce.ts`), and one file that the gated RFC 9728 proposal says would be created |
| **Cited line numbers within file bounds** | ✅ 0 past EOF |
| **Cited line numbers point at the right code** | ❌ **1 real error — fixed** (below) |
| **Distinctive bolded terms present in GLOSSARY** | ✅ 62/62 found; GLOSSARY is 207 rows |
| **No module depends on a later concept** | ✅ 169 forward references, all *labelled previews* (`→ Module NN`, "you'll meet this again in", "It **feeds** Module NN", "Onward") — the intended pattern. No lab step or argument requires an unexplained later mechanism |
| **Every RFC cited appears in SPEC-INVENTORY** | ❌ **4 missing — fixed** (below). No inventory row is uncited |
| **Cross-module factual claims** | ✅ all 8 ("Module 03 proved…", "Module 05 established…") checked against the verified records in this log; all accurate |

**Error 1 — a fabricated transcript, now corrected.** Module 09b's lab showed a `grep -n` output for
`federation.service.ts` that I wrote from expectation rather than from running the command: it claimed the
`federation.configuration({ serviceId })` call is at **line 16**. It is at **line 14**; line 16 is `});`, and
the real grep prints **two** lines (12 and 14). Fixed in the lab, and the `federation.service.ts:16` citation
was corrected to `:14` in the findings section of this file. **This is the only invented output found in the
whole curriculum**, and it is exactly the class of error Stage 4 exists to catch — every other transcript in
every lab was pasted from a command that actually ran.

**Error 2 — four cited RFCs were not in the inventory.** RFC 2119, RFC 8174, RFC 3986 and RFC 7800 were cited
by name in modules while the inventory claimed to list "every specification this curriculum touches". All four
were verified against rfc-editor.org (titles, BCP/STD numbers, dates) and added as a new **§0a Supporting
references** section. RFC 7800 is the substantive one — it defines the `cnf` claim that DPoP (`jkt`), mTLS
(`x5t#S256`) and SD-JWT key binding (`jwk`) all depend on, so Modules 05, 09b and 10 all rest on it.

**Also resolved:** Stage 1's critique item 5 ("`AGENTS.md` says 21 sections but there are 20") is **no longer
true** — `AGENTS.md:137` says 20, and `client/src/App.tsx` has exactly 20 `sectionComponents` entries. No edit
needed; the item is closed.
- [ ] Stage 4 — consistency pass **+ backfill all four exams** (decided 2026-07-28, see below)

### Awaiting a decision — gated source changes

**JARM is no longer one of them.** Module 09a established that the authorization server already builds and
signs JARM responses: `response_mode=jwt` returns `[A012305] … the 'authorization_signed_response_alg' metadata
of the client … is not set`, i.e. **a configuration gap, not an implementation gap, on the AS side.** No
`server/src` change is needed and the proposal to "implement JARM" is withdrawn. What *does* remain a genuine
gap is **client-side consumption** — the dashboard SPA cannot parse or verify a `response` JWT — which is
optional for the curriculum since the labs verify JARM with a standalone script. SPEC-INVENTORY has been
corrected in two places (the spec's title was also wrong).

**Two proposals remain open. No code has been written for either.**

1. **RFC 9728 Protected Resource Metadata** (Module 04) — one additive route + controller + config value +
   unit test at true root, beside `oauthAsMetadataRoutes`. Small.
2. **mTLS / RFC 8705** (Module 05) — dev TLS listener requesting a client certificate, a local-CA script,
   certificate pass-through to Authlete on token/PAR/introspection calls, `cnf["x5t#S256"]` in introspection
   output, and registration examples for `tls_client_auth` / `self_signed_tls_client_auth`. **Substantially
   larger**; my recommendation is to treat it as its own piece of work rather than a curriculum side effect.
   If declined, Module 10 teaches mTLS against the spec and the Authlete configuration surface, labelled as
   not-run-here.

Each is written up in full at the end of its module README —
[RFC 9728](modules/04-token-lifecycle-and-metadata/README.md#proposed-source-change--serve-rfc-9728-needs-your-approval)
and [mTLS](modules/05-request-integrity-and-binding/README.md#proposed-source-change--implement-mtls-needs-your-approval).

### Findings worth acting on outside the curriculum

> Fourteen now, and **the two added by Module 11 are the most serious of the build** — they are listed first.
> Four of the rest are in one file (`token-exchange-response.handler.ts`, 89 lines) and three more are in the
> logout/authorization path. None were fixed — all are server source, and the standing rule is to surface
> rather than repair. Each is taught as a Tier-3 exercise in the module that found it.

- **🔴 Cross-user BOLA on `/api/gm/:grantId`, with a write primitive.** Verified live on an isolated
  two-user instance (`PORT=3005 AUTH_USERS="alice:…;bob:…"`; nothing on :3000 or in Authlete's config was
  changed, and the instance was killed afterwards). With **valid, correctly scoped, unexpired** tokens:
  **bob's token read alice's grant → 200 with alice's contents**, alice's token read bob's grant → 200 with
  *bob's* contents (they were deliberately given different scopes, which proves the object **is** resolved
  correctly and only ownership is unchecked), and **bob's token `DELETE`d alice's grant → 204, after which
  alice's grant returned 404.** Any holder of a `grant_management_revoke` token can enumerate grant IDs and
  destroy every consent on the service. Scope enforcement itself works (a query-only token gets 401 on
  `DELETE`), which is the point: **every OAuth control passed and the outcome is still catastrophic.**
  *Attribution, stated to the confidence the evidence supports:* `grant-management.service.ts:10-26` forwards
  only `{accessToken, gmAction, grantId}` and relays the answer; a **direct call to Authlete's `/gm` API with
  bob's token and alice's grant ID returns `action: OK` / `[A277001]`**, so the check is not made upstream
  either. No service- or client-level setting governing grant ownership exists on this deployment
  (`grantManagementActionRequired`, `grantManagementEndpoint`, `supportedGrantManagementActions` are the only
  grant switches). **Whether this is an Authlete defect or a missing configuration is `UNVERIFIED` — raise
  with the vendor, do not assert.** What is not ambiguous is the expectation: Grant Management §5.2 says
  *"the respective client must be authorized to use the particular grant id"*, and a grant is defined
  throughout as belonging to a client **and** a resource owner.
- **🔴 Unauthenticated read of a confidential client's secret.** `GET /api/client/get/<clientId>` with **no
  credentials of any kind** returns the full client object including `clientSecret` in plaintext — the
  credential that PKCE, PAR and DPoP exist to protect. Also unauthenticated: `GET /api/client/auth/list/<subject>`
  (enumerate any subject's authorized clients), `GET /api/client/scopes/granted/<clientId>/<subject>`, and
  `GET /api/token/list` (returned **65** access tokens on this service). Cause is **not** a missing check —
  `requireBasicAuth("client_management")` is imported and called in every one of the sixteen controllers;
  `require-basic-auth.ts:8` does `if (!mgmtClientId || !mgmtClientSecret) return true;`, i.e. **fail-open on
  absent configuration**, and `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are empty in `server/.env`. Verified that
  setting both restores 401. `AGENTS.md` **does** document that unset MGMT vars leave management routes
  unprotected, so this is a known dev default rather than a hidden bug — but the documentation says
  "unprotected" where the behaviour is "hands a confidential client's secret to anonymous callers", and the
  fail-open design is itself the defect (a missing security config should refuse to start). Taught as
  Module 11's Lab 1.

- **Both FAPI introspection endpoints return HTTP 200 with an error body and a stack trace.**
  `GET /api/fapi/config` **and** `GET /api/fapi/status` respond **200** with
  `{"error":"Bad Request","message":"Response validation failed","stack":"ResponseValidationError: …"}` —
  an SDK `ResponseValidationError` from `serviceGet`, surfaced verbatim. Three defects in one response, and
  the status code is the worst of them: a monitor checking status codes reports these endpoints healthy
  forever. The `stack` field leaks absolute filesystem paths on unauthenticated endpoints. And the practical
  consequence is that **the deployment cannot report its own FAPI posture** — Module 10's lab had to read the
  Authlete service configuration directly to establish anything. This supersedes the earlier PROGRESS note
  that "only `/api/fapi/config`" was affected and that its status code "may be a second bug": both endpoints
  are affected and the 200 is confirmed. **Fourth instance of "a server-side failure reported as a caller
  error"** after Modules 06, 08 and 09b.
- **Grant revocation leaves access tokens alive for 24 hours.** Verified end to end in Module 10: after
  `DELETE /api/gm/<grant_id>` → **204**, the grant's refresh token is correctly gone
  (`[A053305] The refresh token … does not exist.`) but its access token still introspects `active: true`
  with a full 24 hours remaining. Grant Management §6.5 says the AS *"MUST revoke the grant and all refresh
  tokens … it should revoke all access tokens"* — so **the MUST is satisfied and the should is not.** Not a
  MUST violation; report it precisely. Its severity comes from the *interaction* with
  `accessTokenDuration: 86400`: the `should` is only tolerable because access tokens are assumed short-lived,
  and here they are not, so a user who withdraws consent stays exposed for a day. Cheapest remediation is to
  shorten the lifetime, not to implement access-token revocation.
- **The OpenID Federation entity-configuration endpoint cannot work, and misreports why.**
  `federation.service.ts:14` calls `authleteApi.federation.configuration({ serviceId })` with **no
  `requestBody`**. The SDK types that field as optional (`requestBody?: FederationConfigurationApiRequestBody`
  where the type is `{}`), so omitting it compiles and passes review — but Authlete requires a body. Both
  `GET /.well-known/openid-federation` and `GET /api/federation/configuration` therefore return **400** with
  `[A126203] The request body is missing or empty.` Verified two ways during the Module 09b build: the repo's
  failure, and a **direct call to Authlete with `{}` returning HTTP 200 and the real diagnosis** —
  `[A316201] Because a JWK Set for federation has not been set up, this service cannot generate entity
  configuration.` So there are two stacked faults and the code one **hides** the configuration one. Two extra
  defects in the same response: it is an unhandled SDK `ResultError` reaching the generic error handler, so a
  federation endpoint answers `{"error":"Bad Request"}` rather than a typed error; and the body includes a
  **`stack` field with absolute filesystem paths**, returned to an unauthenticated caller on a public
  discovery endpoint. Fix is `requestBody: {}` plus action handling plus suppressing `stack`. **Third instance
  of the same class** after Module 06 (Zod failure → `"Bad Request"`) and Module 08 (unset `JWKS_URI` →
  `"Invalid logout token"`): *a server configuration error reported as a caller error.* For contrast,
  `POST /api/federation/registration` in the same file is written correctly.
- **`prompt=none` returns a 302 with an empty `Location` header.** `authorization.controller.ts:50-53` treats
  Authlete's `NO_INTERACTION` action as though `responseContent` held a redirect URL. It does not: verified by
  calling `/auth/authorization/authorization` directly, `NO_INTERACTION` comes back with
  `responseContent: null` and a **ticket**, meaning *"decide without showing UI, then call issue or fail."* So
  `res.redirect(null ?? "")` emits `Location: `. OIDC Core §3.1.2.6 requires one of `login_required`,
  `consent_required`, `interaction_required`, `account_selection_required`. **Second half of the defect:** the
  controller *does* contain `prompt === "none"` handling at line 96 — inside `case "INTERACTION"`, which a
  `prompt=none` request never reaches, because the AS answers it with `NO_INTERACTION`. Dead code that reads
  as a feature. Not exploitable; breaks every client that relies on silent renewal, in a way the client cannot
  classify.
- **The logout endpoint is an open redirect, and it survives production.**
  `logout.service.ts` validates `post_logout_redirect_uri` with two `startsWith` prefix checks. Verified live:
  `http://localhost:3000.evil.example.com/bye` and `http://localhost:3001@evil.example.com/` both get a **302
  to the attacker's host**. The middle clause is gated on `NODE_ENV !== "production"`, but the
  `allowedOrigins.some(o => uri.startsWith(o))` clause is not — so with `ALLOWED_ORIGINS=https://app.example.com`,
  `https://app.example.com.evil.net/` still passes. **Do not file as dev-only.** RFC 9700 §2.1 forbids
  exactly this. Note the contrast: the *authorization* endpoint gets exact matching right (400, no `Location`).
  Fix is one line — exact comparison against a registered set.
- **Back-channel logout receipt cannot work, and misreports why.** `JWKS_URI` is unset, so
  `logout.controller.ts:45` throws and the `catch` returns `{"error":"invalid_request","error_description":
  "Invalid logout token"}` — blaming the caller's input for a server configuration problem. Confirmed against
  the server log (*"JWKS_URI must be configured to verify backchannel logout tokens"*). Two structural defects
  beyond the config: (1) `jwt.verify(token, key, { algorithms })` passes no `issuer` or `audience`, so `iss`
  and `aud` are never checked and only the `events` claim is validated — OIDC Back-Channel Logout also
  requires rejecting a token carrying `nonce`; (2) it calls `req.session.destroy()`, but a back-channel logout
  is a server-to-server POST with no browser cookie, so `req.session` belongs to nobody — acting on a logout
  token needs a session store queryable by `sub`/`sid`. Fixing the config alone would turn a no-op into a
  cross-RP forced-logout primitive.

- **Token exchange is broken for any scoped subject token.** The SDK's `TokenResponse` schema types
  `subjectTokenInfo.scopes` as `string[]`; Authlete returns `[{"name":"profile","defaultEntry":false}]`. Zod
  rejects the response inside `tokenProcess`, so the controller never runs and the client gets
  `{"error":"Bad Request","message":"Response validation failed"}` plus a stack trace — not an OAuth error at
  all. Verified three ways during the Module 06 build: the failure with a scoped subject token; a direct call
  to Authlete's `/auth/token` with identical parameters returning `[A311001] … processed successfully`; and a
  standalone `TokenResponse$inboundSchema.safeParse` reproducing the exact Zod issue. A **scopeless** subject
  token succeeds, which is why any smoke test built on a bare `client_credentials` token passes. Likely needs
  a `patches/` entry alongside the existing `clientCreate.js` patch.
- **The token-exchange handler discards four request parameters.**
  `token-exchange-response.handler.ts:29-34` builds its `token.create` request from exactly `grantType`,
  `clientId`, `scopes`, `subject`. Verified live: `actor_token`, `resource`, `audience`, and
  `requested_token_type` all produce byte-identical 200 responses, and introspection of the `resource` case
  shows **no `aud`** (the same parameter does produce `aud` on the authorization-code path — Module 04). The
  consequence that matters: **a delegation request is answered with an impersonation token, HTTP 200, no
  `act`, no error.** RFC 8693 §1.1 defines impersonation as being *"indistinguishable from B"* — which is
  exactly what the downstream service gets.
- **`issued_token_type` is missing from the token-exchange success response.** RFC 8693 §2.2.1 marks it
  **REQUIRED**. `token-exchange-response.handler.ts:48-55` emits `access_token`, `token_type`, `expires_in`,
  `scope`, plus two parameters that are not in the spec (`client_id`, `subject`). Since
  `requested_token_type` is also ignored, the client has no way to learn what it actually received.
- **A live access token is written into a `sub` claim.** `token-exchange-response.handler.ts:27` does
  `result.subject || subjectToken`. When Authlete resolves no subject — correct for a client-credentials
  subject token — the fallback stores **the credential string itself** as the new token's subject. Verified:
  `sub == subject_token` on the exchanged token, and that value still introspects `active: true`. It is
  returned to the client in the response body as `subject` and by introspection as `sub`, i.e. placed in a
  field whose entire contract is "safe to copy into logs." (Checked and *not* over-claimed: this repo's audit
  logger takes `user` from the session, not from a token subject, so that particular log is unaffected.)
  Correct behavior is to fail closed.
- **UserInfo cannot accept a DPoP-bound token.** `server/src/services/userinfo.service.ts:21` does
  `authHeader.replace("Bearer ", "")`, so `Authorization: DPoP <token>` — the scheme RFC 9449 §7.1 **requires**
  for DPoP-bound tokens — passes the literal string `"DPoP <token>"` to Authlete, which answers `[A088302] The
  access token does not exist.` Verified end to end during the Module 05 build: the token endpoint issues a
  `token_type: DPoP` token with a valid `cnf.jkt`, and the resource endpoint then cannot accept it. One-line
  fix (strip either scheme, case-insensitively). Taught as Module 05's Tier-3 finding; not fixed, because it is
  server source.
- **The introspection endpoint is unauthenticated.** `POST /api/introspection/standard` (and
  `/api/introspection`) answer fully with no client credentials and no bearer token. RFC 7662 §2.1: *"To
  prevent token scanning attacks, the endpoint MUST also require some form of authorization to access this
  endpoint."* Verified repeatedly during the Module 04 build. It is taught as the module's Tier-3 finding
  rather than silently fixed, but it is a real defect in the server and worth a separate issue.

### Service configuration — resolved, and what is still outstanding

**RESOLVED 2026-07-27.** `fapiModes` and `supportedServiceProfiles` were cleared on service `local-testing`
(API key `3693555522`). The full authorization-code flow now runs end to end. For the record, that one
setting — **not** `require_pushed_authorization_requests` — was the cause of every earlier failure:

| Symptom while `fapiModes = ["FAPI2_SECURITY"]` | Observed error |
|---|---|
| Plain `GET /api/authorization` refused | `[A294308] The authorization request was sent without PAR.` |
| `client_secret_basic` refused | `[A295301] The client authentication method … is not allowed.` |
| `password` grant refused | `[A295306] The grant type ('password') is not allowed.` |

> **`fapiModes` was NOT re-enabled for Module 10.** Confirmed absent again on 2026-07-28. Module 10 was
> therefore written as an audit of a *supported-but-not-required* deployment rather than a demonstration of
> FAPI enforcement — which is defensible (it is the commonest real posture) but means **no lab step in the
> curriculum shows FAPI being enforced**. Setting `fapiModes = ["FAPI2_SECURITY"]` would flip most of the
> Module 10 report's FAIL rows at once and is the highest-value single console change outstanding. Note it
> would also re-break Modules 03–09's labs, so set it *after* working through those, or expect the three
> symptoms in the table above to return.

**Public client — RESOLVED 2026-07-27.** Client `4277838306` now reads `clientType: PUBLIC`,
`tokenAuthMethod: NONE`, `parRequired: false`. The Module 03 labs run against it.

**Token exchange — RESOLVED 2026-07-28.** Client `1523514379` now has
`extension.tokenExchangePermitted: true`; the repo owner made the console change during the Module 06 build.
Before that, every exchange returned `[A311305] This service does not allow unpermitted clients to make token
exchange requests.`, because the service sets `tokenExchangeByPermittedClientsOnly: true`. Module 06's lab
documents both states. Service-level grant types already included `TOKEN_EXCHANGE` and `JWT_BEARER`, and the
client already had both in its `grantTypes` — the per-client permission flag was the only gate.

**Module 09a config — requested 2026-07-28, NOT YET APPLIED.** The repo owner chose "set all five." As of the
end of that turn none had landed. Each unblocks exactly one thing:

| Where | Field | Set to | Unblocks |
|---|---|---|---|
| Service | `supportedAcrs` | `pwd`, `mfa` | RFC 9470 step-up (lab 4b) — currently `[A021303]` |
| Service | `supportedAuthorizationDetailsTypes` | `payment_initiation` | RAR success path (lab 5b) — currently `[A249302]` |
| Client `1523514379` | `authorizationSignAlg` | `ES256` | JARM (lab 2c) — currently `[A012305]` |
| Client `1523514379` | `bcDeliveryMode` | `POLL` | CIBA (lab 3d) — currently `[A169301]` |
| Both clients | `idTokenSignAlg` | `ES256` | Module 08 lab 3d + public-client `openid` |

**Still outstanding:**

- **`idTokenSignAlg: HS256` on BOTH clients — still outstanding as of 2026-07-28.** The repo owner chose
  "set both clients to ES256" when asked during the Module 08 build, but the change had not landed by the end
  of that turn, so Module 08 shipped with its ES256/JWKS exercise (3d) marked `UNVERIFIED` and no transcript.
  Two consequences while it stands: (1) the public client `4277838306` **cannot request `openid` at all** —
  `[A406301] The algorithm is symmetric (HS256), but the client type of the client … is not 'confidential'.`
  (verified again this session); (2) on the confidential client, HS256 means the client secret both verifies
  **and forges** ID tokens — demonstrated live in Module 08 lab B6, where a token with `sub` changed to
  `ceo@example.com` and re-signed with the client secret passed all thirteen validation steps. **Flipping both
  clients to `ES256` unblocks lab 3d and public-client OIDC, and removes the forgery capability.** Module 09a
  does not depend on it; Module 10 (FAPI) does.
- `GET /api/fapi/config` still fails: the body is an SDK `ResponseValidationError` from `serviceGet`
  (`{"error":"Bad Request","message":"Response validation failed",…}`). Pre-existing and unrelated to the
  curriculum; it affects Module 10. Two notes: the earlier guess that `fapiModes` caused it is **disproven**
  — the field is cleared and the failure persists; and the endpoint returned that error body under HTTP
  **200** on the last check (400 earlier), so the status code itself may be a second, separate bug.

Nothing on the Authlete service was changed by the curriculum build; the repo owner made the console change.

*(Gated source changes — JARM, mTLS, RFC 9728 PRM — are still proposed inside Modules 05/09a/10 as planned;
this is a configuration issue, not one of those.)*

### The cumulative exams — DECIDED: backfill in Stage 4

**Decision (repo owner, 2026-07-28): all four exams are written in Stage 4, not as they come due.** Stage 3
stays one-module-per-turn through Module 12.

To write in Stage 4:

- **Cumulative Exam A** (after Module 03) — foundations through PKCE
- **Cumulative Exam B** (after Module 07) — full OAuth 2.0 + hardening + consolidation
- **Cumulative Exam C** (after Module 11) — OIDC, extensions, FAPI, API security
- **Final Exam** (before Module 12) — everything, with a self-grading rubric

Interim cover: Module 07's quiz Tier 4 was written to reach back across 02–06 and stands in for B. Nothing
stands in for A. When writing them, note that Module 07 introduced the audit method and Module 08 the
thirteen-step validation — both are natural exam material that did not exist when the earlier module quizzes
were written.

### Module 12 — Capstone — done / verified / uncertain

- **Done:** the capstone is a different artifact from the other thirteen — it teaches nothing new and measures
  whether the rest transferred. `README.md` — the brief, the **nine decisions** a design must make and defend,
  and a **100-point rubric** deliberately weighted so the two criteria people skip (*rejected alternatives*
  and *an honest limitations section*, 14 points together) are what separate an architecture document from a
  list of technologies; an absent limitations section scores zero on that line however good the rest is. Also
  a score-to-reading table, an explicit "how to grade yourself honestly" sequence (write Part A **before**
  reading Part B, score **before** reading the model answer), and a mapping from every clause of the
  curriculum README's definition of done to where the capstone tests it. `lab.md` — **Part A: Aurora**, a
  multi-tenant clinical platform brief with four client types, three API tiers and five non-negotiable
  constraints, containing **three deliberate tensions** a strong answer must name (offline validation vs
  demonstrable revocation; self-service onboarding vs strong client auth; attributability vs service
  accounts). **Part B: Meridian Health v4.2**, a complete, plausible, real-shaped architecture document for
  the same brief with **exactly 25 planted defects** spanning Modules 01–11. `quiz.md` + `quiz-answers.md`
  (18 items across 4 tiers), where Tier 4 asks the learner to attack **their own** design rather than
  Meridian's.
- **Verified (self-consistency, since this module has nothing to run):** all **25 defects re-read against the
  Meridian text one by one** and confirmed present, each mapped to its module and given a severity as
  *strength × reachability* rather than by modal verb. The count is stated identically in three places
  (README, lab, answer key) and the rubric line scores `round(found / 25 × 20)` so the totals still sum to
  100. **Seven deliberately correct passages** are planted as false-positive traps — PAR + `private_key_jwt`
  + DCR-with-JWKS for partners, `typ: at+jwt`/RS256, a tenant-scoped query, 404-not-403, and an explicit
  response projection — and the rubric deducts for reporting them; quiz Q15 makes mis-reporting one of them
  an explicit exercise. Every spec citation in the answer key (RFC 9700 §2.1.2/§2.4/§4.1, RFC 8707, RFC 7662
  §2.1, RFC 9068, RFC 8693 §1.1, RFC 9449, RFC 9470, RFC 9901 §7.1/5 + §7.3/1 + §9.5, OIDC Core §3.1.3.7,
  FAPI 2.0 §5.3.2.1, Grant Management §6.5) reuses wording already verified against primary sources in
  Modules 01–11 — **no new spec claims were introduced**, deliberately, so the capstone cannot contradict the
  inventory.
- **Design decisions worth recording for a future editor:** (1) the defect count was raised from 20 to **25**
  after the Meridian document was drafted and the planted defects were actually counted — the number is
  stated because "I found them all" is otherwise unfalsifiable, so it must stay accurate if the document is
  ever edited; (2) the answer key's remediation order is argued by *exposure removed per unit of effort* and
  explicitly notes two places where a different order is equally defensible, so a learner who disagrees with
  reasons is not marked wrong; (3) Meridian is deliberately written as competent-but-insecure — quiz Q18 asks
  *how a document like this happens*, which is the most transferable question in the curriculum and the real
  ending of the course.
- **Uncertain / notes:** **nothing in this module was executed** — it is a paper exercise by design, and the
  Meridian document is fictional. Its code snippets are illustrative and are **not** drawn from this repo,
  though several defects deliberately mirror real ones found during the build (the fail-open and BOLA themes
  from Module 11, the userinfo-login bug from Module 08) so a learner who did the labs has seen the shapes
  before. The **four exams are still unwritten** (Stage 4), so the capstone README states plainly that they
  are not a prerequisite and points at Module 07's Tier 4 as the interim stand-in for Exam B — this is the
  one place the curriculum's advertised structure and its actual contents currently differ, and it is
  flagged to the learner rather than hidden. The rubric's score bands are a judgement call and are labelled
  as such.

### Module 11 — done / verified / uncertain

- **Done:** `README.md` — the module's thesis is that Modules 00–10 answered *"can I trust this token?"* until
  the answer was provable, and the question was never sufficient. Opens with a request that passes **every**
  control in the curriculum — DPoP-bound, audience-restricted, correctly scoped — and asks whether account
  `91847` belongs to the caller. Contains: the OWASP 2023 list with the **three** authorization failures
  marked and the observation that API2, the one this curriculum spent eleven modules on, is *one item out of
  ten and not the first*; **BOLA/BOPLA/BFLA distinguished by what the attacker changes** — "wrong row, wrong
  column, wrong verb", with the fix location for each; a four-step argument for why a valid token **cannot**
  prevent BOLA (issued before the request exists / scopes are type-level / ownership is application data /
  therefore the check is yours), including why RAR only moves the goalposts; **owner-scoped queries over
  ownership checks** — make the insecure version unrepresentable, tied back to FAPI 2.0 choosing PKCE over
  `c_hash`; 404-not-403 as the same anti-oracle reasoning as RFC 7662; scopes/claims/RAR as three
  granularities with the rule *scopes gate the endpoint, claims feed the policy, the data layer enforces the
  object*; RBAC/ABAC/ReBAC keyed on "can your rule be expressed without reference to the specific object?",
  with the observation that **pure RBAC has a BOLA by construction**; the gateway/service split as a
  capability boundary rather than a preference; and short sections on key rotation and on certification being
  *evidence about the protocol layer and silence about the application layer*. `lab.md` — six exercises, two
  of them live exploits. `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added ten concepts to
  GLOSSARY and expanded the OWASP row in SPEC-INVENTORY to the full enumerated list.
- **Verified against the live server (every lab command executed):** **BFLA** — unauthenticated
  `GET /api/client/get/<id>` returns `clientSecret` in plaintext; `/api/client/auth/list/admin` enumerates a
  subject's clients; `/api/token/list` reports **65** access tokens; cause traced to
  `require-basic-auth.ts:8` fail-open, and confirmed that setting `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`
  restores **401**. **BOLA** — full cross-user read *and* delete, on an isolated `PORT=3005` instance with two
  demo users, as described in the findings section above; the two grants were given **different scopes** so
  the output proves correct object resolution with absent ownership checking. **Attribution** established by
  a direct Authlete `/gm` call returning `action: OK` `[A277001]`, plus a search of service and client
  configuration for any ownership switch (none). Also verified: grant management is correctly restricted to
  confidential clients (`[A285311]` on the public client) — a control that *does* work, and worth showing
  next to two that do not. **Verified (primary source):** the complete OWASP API Security Top 10 **2023
  edition** identifiers and titles, quoted from `owasp.org/API-Security/editions/2023/`.
- **Environment discipline:** the two-user instance ran on `PORT=3005` with `AUTH_USERS` passed inline —
  **no file was edited, no Authlete configuration was changed**, `server/.env` was untouched, and the process
  was confirmed dead afterwards (`:3005` → connection refused, `:3000` → 200). Test grants were revoked and
  all extracted credentials deleted from the scratchpad. The lab tells the learner to do the same.
- **Uncertain / notes:** **the BOLA attribution is deliberately `UNVERIFIED`** — the behaviour is confirmed
  exhaustively, but whether the missing ownership check is an Authlete defect or a configuration gap could not
  be determined from the available surface, and the lab makes writing the finding *at that confidence* an
  exercise (Tier-3 Q14 tests exactly this). A **cross-client** BOLA could not be tested: only one confidential
  client exists and grant management is confidential-only, so the second principal had to be a second *user*
  rather than a second client; cross-client remains untested and is called out as such. `docs/MONITORING.md`
  is used for the detection exercise but Prometheus/Grafana were **not** started, so Exercise 5's answers
  reason from the metric and audit-log definitions in code rather than from observed dashboards — labelled
  accordingly. The three code-review snippets in Exercise 6 are written for the module, not drawn from this
  repo.

### Module 10 — done / verified / uncertain

- **Done:** `README.md` — the module's thesis is that Module 07 taught auditing against a *checklist* and this
  one asks the question a checklist cannot answer: **how do you know the list is complete?** FAPI 2.0 is
  presented as the only spec in the curriculum that makes a **falsifiable** claim — attacker model, stated
  goals, formal analysis — and therefore the only one that can be *wrong*. Contains: all three security goals
  and all six attackers quoted; the observation that **A4 is defined and then declared irrelevant** because a
  design decision eliminated it, which is what a mature threat model looks like; §8's exclusions with §8.5
  ("implementation errors") called out as the section that separates a proof about a spec from a claim about
  your code — every finding in this curriculum lives there; the **FAPI 1.0 → 2.0 table quoted verbatim** with
  the argument that 2.0 is *smaller* because it was derived rather than accreted; the insight that dropping
  the hybrid flow was a **failure-visibility** decision (*"nonce/signature check can be skipped by clients,
  PKCE cannot"*), which generalises; the refresh-token-rotation prohibition unpacked in four steps, resolving
  the tension Module 03 left open; Message Signing scoped to non-repudiation; and grant management with the
  MUST/should asymmetry as the centrepiece. `lab.md` — seven exercises producing a conformance report.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added ten concepts, two parameters and one acronym
  row to GLOSSARY.
- **Verified against the live server (every lab command executed):** **the anti-FAPI flow** — one
  authorization-code flow with no PAR, no PKCE, `client_secret_basic`, yielding
  `{"access_token":…,"token_type":"Bearer","expires_in":86400,…}`, i.e. four `shall` requirements breached and
  a **24-hour bearer token** issued with no warning. `iss` **is** present (the deployment's one clean PASS).
  **PAR `expires_in` = 600**, where §5.3.2.2 requires *less than* 600 — non-conformant by one second, and
  corroborated by `pushedAuthReqDuration: 600` read from the service. `authorizationCodeDuration: 0` recorded
  as **NOT EVIDENCED** (service default; not observable from configuration) rather than guessed either way.
  Advertised metadata read as an attacker would: `require_pushed_authorization_requests: false`,
  `code_challenge_methods_supported` includes `plain`, `token_endpoint_auth_methods_supported` includes
  `none`, `response_types_supported` includes the implicit forms. **Grant management verified end to end** —
  `grant_management_action=create` → a token response with a sixth member, `grant_id`; then query → **200**
  with scopes and claims, no token → **401**, unknown grant → **404**, revoke → **204** empty, re-query →
  **404**; scope enforcement confirmed with a `profile`-only token → 401. Then the revocation gap above.
  Both FAPI endpoints confirmed returning **200** with a stack trace. **Verified (primary sources, this
  session):** FAPI 2.0 Security Profile and Attacker Model both **Final, 22 Feb 2025**, read off the document
  headers; the complete §5.3.2.1 and §5.3.2.2 `shall` lists, NOTE 1 on rotation, and the §5.5 comparison table
  — all quoted from the HTML rather than a summariser. Attacker Model §5.2–5.4 goals, §6 scope exclusions,
  §7.2–§7.7 all six attackers, §8.2–§8.6 limitations. FAPI 2.0 Message Signing **Final, 25 Sep 2025**. FAPI
  1.0 Parts 1 and 2 **Final, 12 Mar 2021**. Grant Management **`oauth-v2-grant-management-03`, 9 May 2023**,
  §5.2 parameters, §6.1 scopes, §6.5 revocation sentence and the token-vs-grant note.
- **A citation trap caught mid-build, now taught in the lab:** `openid.net/specs/fapi-2_0-attacker-model.html`
  still serves a **December 2022 Internet-Draft** in which the token-endpoint and resource-server attackers are
  **A5 and A7**; in the Final (`fapi-attacker-model-2_0.html`) they are **A4 and A5**. I fetched the draft
  first and would have published the wrong numbering. The FAPI 2.0 URLs moved generally (`fapi-2_0-*` →
  `fapi-*-2_0`). Also noted as an editorial artefact in the Final itself: §8.2 still refers to "(A3a/A5/A7)",
  the old numbering, while §7 defines A1/A1a/A2/A3a/A4/A5.
- **Three SPEC-INVENTORY errors found and corrected:** Message Signing was dated "approved 2025-07-29" and is
  **published 25 Sep 2025**; the FAPI 1.0 Parts had no dates and are both **12 Mar 2021**; and Grant Management
  was labelled an **"OpenID 2nd Implementer's Draft"**, which the document header does not support — it is
  Internet-Draft `oauth-v2-grant-management-03` and its own title ends in *"(Draft)"*. The module and
  inventory now say so.
- **Uncertain / notes:** **FAPI is entirely off on this service** (`fapiModes` and `supportedServiceProfiles`
  both absent), so **no lab step shows FAPI enforcement** — the module is deliberately built as an audit of a
  supported-but-not-required deployment, which is the commonest real posture, and says so up front. Turning
  `fapiModes` on remains the single highest-value console change and would let a future pass verify the
  enforcement side. **`private_key_jwt` still cannot be exercised** — the service advertises it but neither
  client has a JWKS (same limitation Module 06 recorded). **mTLS is still not implemented**; the module
  teaches it from the spec and the config surface, labelled not-run-here, and the gated proposal stands. The
  `authorizationCodeDuration` row is the one requirement I could not evidence in either direction. The lab's
  transcript is deployment-specific by design, as Module 07's was. Redaction: the service's
  `grantManagementEndpoint`, `pushed_authorization_request_endpoint` and the confidential client's registered
  `redirectUris` all contain a live tunnel hostname, and the flow produces a real `grant_id` — all redacted in
  the committed lab.

### Module 09b — done / verified / uncertain

- **Done:** `README.md` — organised around **four unexamined assumptions** that every module 01–09a shared
  (the issuer is reachable at time of use → OID4VCI/VP; you already have a relationship with it → Federation;
  its word needs no account → Identity Assurance; claims travel all-or-nothing → SD-JWT), with the point made
  up front that these are four *different kinds* of problem — cryptographic, governance, topology,
  architecture — and are worth keeping apart. Contains: the **issuer/holder/verifier ↔ OAuth role mapping**
  with the observation that resource owner and client *fuse* into the holder, which makes the holder a
  plausible attacker and is why every §7.1 check exists; identity assurance framed as **provenance, not
  cryptography** (two identically-signed tokens, wildly different assurance); federation with trust chains
  drawn as **discovery walking up, policy flowing down**; SD-JWT **derived from four requirements** rather
  than asserted, with the salt introduced as the answer to "claim value spaces are tiny"; key binding named as
  the **fourth appearance of commit-then-prove**; the three §7.1 checks a naïve verifier omits; and the
  unlinkability §10.1 says *cannot* be achieved. `lab.md` — eight exercises, six of which need no server.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added seven roles, fifteen concepts, seven
  claims/parameters and seven acronyms to GLOSSARY. **New lab asset: `scripts/sd-jwt.mjs`** (~350 lines, no
  dependencies) — `keygen`/`digest`/`issue`/`inspect`/`present`/`verify`, where `verify` prints a numbered
  PASS/FAIL trace following §7.1 and §7.3 step by step.
- **Verified locally (every lab command executed):** the tool's digest **matches RFC 9901 §4.2.3's own
  published test vector** (`X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0`), reproduced twice — once via the
  script, once via `openssl dgst | basenc --base64url`. A six-claim credential issued with 2 decoys → `_sd`
  holds 8 digests; `vct`/`iss`/`iat`/`cnf` stay in the clear. A presentation of **2 of 6** claims verified
  with all §7.1 and §7.3/5 steps PASS, and the processed payload contains **no name, birthdate or email**.
  Six attacks, all executed: **(1) KB stripping → REJECTED by the strict verifier and ACCEPTED by the
  permissive one** — the module's headline, and §9.5's warning reproduced exactly; (2) cross-verifier replay →
  caught by `aud`; (3) forged disclosure value → caught at **§7.1/5, not at the signature check**; (4) a
  **whitespace-only re-serialization** (identical value) → rejected, demonstrating §4.2.3; (5) an
  **hour-expired credential accepted** when `exp` was made selectively disclosable and withheld, then rejected
  once `--require-claims exp` states the §9.7 defence; (6) digest reuse left as reasoning. Unlinkability
  measured directly: two presentations disclosing **disjoint** claims share a **byte-identical issuer-signed
  JWT** and identical `cnf.jwk`. **Verified against the live server:** five distinct VCI refusals —
  `A364301`/`A416301`/`A402301` (NOT_FOUND → 404 on metadata/jwtissuer/jwks), `A366201` and `A383201`
  (FORBIDDEN → 403 on offer/create and credential/issue) — plus local pre-Authlete validation on
  `credential/batch` and `deferred/issue`; and the full federation diagnosis above. **Verified (primary
  sources, this session):** RFC 9901 title/Standards Track/Nov 2025, §1.2 all seven terms quoted, §4 both
  serialization formats and the empty-last-element rule, §4.1.1 the `sha-256` default, §4.1.2 `cnf`, §4.2.1/
  §4.2.2/§4.2.3 (including the "not the bytes encoded by" sentence), §4.2.4.1 order-hiding, §4.2.4.2 the
  three-dots key, §4.2.5 decoys, §4.3 all four REQUIRED claims + `typ`, §4.3.1 `sd_hash`, **all of §7.1's
  numbered steps and §7.3's eight**, §9.3 salt, §9.5 KB stripping, §9.7 the five security-critical claims,
  §10.1 all four unlinkability types — pulled from `rfc9901.txt` and quoted byte-exactly rather than via a
  summariser. OpenID Federation 1.0 Final **17 Feb 2026** (read off the document header), §1.2 terms, §3.1.2
  `authority_hints`, §9's well-known construction rule, the `entity-statement+jwt` type. OID4VCI 1.0 Final
  **16 Sep 2025**, §2 definitions, the pre-authorized URN, §3.5 `tx_code` quoted. OID4VP 1.0 Final
  **9 Jul 2025**, §2 definitions, §5.2 `nonce`. SD-JWT VC **‑17, 6 Jul 2026**, `vct` and
  `application/dc+sd-jwt`. Identity Assurance **Final 1 Oct 2024**, errata set 1 revision **1 Jul 2026**.
- **A bug found in my own tooling, and fixed before shipping:** the first `sd-jwt.mjs` checked `exp` on the
  **raw** issuer-signed payload. §7.1/6 requires it on the **processed** payload, so a disclosed-and-expired
  credential passed. Caught by testing the §9.7 case in both directions; fixed, and `--require-claims` added
  so the lab can demonstrate the defence and not merely the attack.
- **Uncertain / notes:** **`UNVERIFIED` — everything past the VCI refusals.** Verifiable credentials are
  disabled on the service, so no lab step shows a real credential offer or issuance; the lab says so inline
  and verifies only the surface, the auth model and the refusal semantics. **OID4VP is not run at all** — no
  verifier implementation exists here; it is taught from the spec, and the KB-JWT half is exercised locally
  instead. **Identity Assurance's detailed schema is deliberately not quoted**: the required/optional members
  of `verification` and the full `evidence` type enumeration are normatively defined in a *separate referenced
  schema document* that was not read, so the README marks that gap `UNVERIFIED` rather than asserting a list.
  The `evidence` values named (`document`, `electronic_record`, `vouch`, `electronic_signature`) are labelled
  illustrative. One low-severity observation recorded in the lab rather than as a finding, because
  `AGENTS.md` already documents it: `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are unset, and
  `require-basic-auth.ts` returns *allow* when they are — so the "admin" VCI offer endpoints answered with no
  credentials. **Fail-open**, by documented design; flagged as a Module 07 audit item. Also noted for
  Stage 4: OpenID Federation 1.0's own reference list cites an **OpenID Federation 1.1** of the same date, so
  the inventory row should be re-checked if any later module leans on federation.

### Module 09a — done / verified / uncertain

- **Done:** `README.md` — organised around **four unexamined assumptions** the earlier modules baked in (the
  response is trustworthy → JARM; there is a browser → CIBA; one authentication covers the session → RFC 9470;
  scopes describe authority well enough → RAR), plus Native SSO's "one app per device" as a fifth. Contains:
  JARM framed as **completing Module 05's triangle** (PAR = request confidentiality, JAR = request integrity,
  JARM = response integrity) with all three mandatory claims quoted and the observation that `iss` inside a
  signature makes mix-up *structurally impossible* rather than merely detectable; the four `response_mode`
  values and three client metadata parameters; CIBA with a dark mermaid showing the
  consumption-device/authentication-device split, a poll/ping/push decision table, and **the threat that has no
  redirect analogue** — the prompt is unsolicited, so `binding_message` cannot do what people think it does;
  RFC 9470's full round trip with the error and both challenge parameters quoted, and the observation that
  omitting `acr_values` converts a recoverable state into a dead end; RAR with all five common data fields
  quoted, three properties scopes cannot provide, and an explicit "when not to use it"; and Native SSO with a
  prominent not-Final caveat. `lab.md` — five exercises on one repeated shape: **request → read the refusal →
  find the one field → enable → re-run.** `quiz.md` + `quiz-answers.md` (19 items across 4 tiers). Added six
  concepts and four parameter groups to GLOSSARY.
- **Verified against the live server (every refusal executed):** **JARM** — `response_mode=jwt` and
  `query.jwt` → `[A012305]`, naming `authorization_signed_response_alg` **in spec vocabulary**. **CIBA** →
  `[A169301] The backchannel token delivery mode of the client application is not set.` **Step-up** —
  `acr_values=pwd` *and* an essential `acr` claim both → `[A021303] ACR values cannot be specified by any means
  ('claim', 'acr_values' or 'default_acr_values') because this service supports no ACR value.` **RAR** — four
  malformations, four distinct diagnostics under one spec error code: `[A249302]` unsupported type,
  `[A249301]` absent type, `[A249304]` malformed JSON, `[A249304]` not-an-array. CIBA sub-endpoints with a
  bogus ticket: `issue` → **400** `[A181201]`, `fail` → **403** `[A185001]`, `complete` → **500** `[A186202]`;
  and the CIBA token grant → a clean `invalid_grant [A200304]`. Full service and client configuration read for
  Exercise 1's inventory. **Verified (primary sources, this session):** JARM — title, Final status, **errata
  set 1 dated 17 Aug 2025**, the three mandatory claims quoted, all four `response_mode` values, all three
  client metadata parameters. RFC 9470 — title, Standards Track, Sep 2023, the `insufficient_user_authentication`
  definition, both challenge parameters, §3 on `acr`/`auth_time`, and the example header. RFC 9396 — title,
  Standards Track, May 2023, the `authorization_details` and `type` definitions, all five common data fields,
  `invalid_authorization_details`, and the scope-coexistence sentences.
- **Two findings, plus a corrected inventory entry:** (1) a **vendor anomaly** — `response_mode=form_post.jwt`
  produces a 302 whose `Location` is a URL-encoded HTML document, traced by direct API call to Authlete
  returning `action: LOCATION` with HTML in `responseContent`, so the repo's controller behaved correctly and
  the fault is upstream; scoped explicitly to the **error** path, since the success path cannot be observed
  until JARM is configured. (2) the **CIBA endpoints return Authlete's internal envelope** (`resultCode`,
  `resultMessage`, `action`, `clientId`) with the real OAuth error JSON-escaped inside a `responseContent`
  string — unlike the token endpoint, which is correct; and `complete` maps a nonexistent ticket to **500**.
  (3) **ACR theatre**, established by holding two verified facts together: `supportedAcrs` is absent, yet live
  ID tokens carry `acr: "pwd"` — the value is not wrong, it is unaccountable.
- **Uncertain / notes:** **`UNVERIFIED` — every post-enablement step.** None of the five requested settings had
  landed by the end of the turn, so the lab shows **no success transcripts** for JARM, CIBA, step-up or RAR;
  each is marked `UNVERIFIED on this deployment as of 2026-07-28` inline, and the lab states up front that
  refusals are observed and enablement steps are the spec's promise. This is the largest UNVERIFIED surface of
  any module so far and the main reason to re-run Module 09a's lab once the console changes land. Native SSO is
  **not run at all** (`nativeSsoSupported: false`) and is labelled a 2nd Implementer's Draft throughout.
  `verify-jarm.mjs` is an adaptation of Module 08's validator whose asymmetric branch is likewise unexercised.

### Module 08 — done / verified / uncertain

- **Done:** `README.md` — opens on the one-line login bug (`loginAs(profile.sub)` from an access token) and
  takes three paragraphs to say exactly why it is an authentication bypass rather than asserting "use an ID
  token"; the access-token-vs-ID-token table with the two rows that generate most bugs; every REQUIRED and
  conditional claim quoted from OIDC Core §2; **the thirteen §3.1.3.7 validation steps grouped into four
  jobs** (envelope / issuer+audience defeats substitution / authenticity defeats forgery / currency defeats
  replay / request-binding defeats injection) with commentary on the three that trip people — step 6's TLS
  shortcut and its precondition, step 7 as *the* algorithm-confusion defence, step 8 as the reason HS256 does
  not scale; a `nonce`-vs-`state` table settling the standing confusion (the key asymmetry: `nonce` is inside
  the signature, `state` is not); `at_hash`/`c_hash`/`s_hash` as the same commit-then-prove pattern; the
  response-type table with why hybrid exists and why FAPI 2.0 dropped it; `prompt`/`max_age` with the four
  §3.1.2.6 errors; and **the four logout specs in one table** keyed on who gets told and whether a live
  browser is needed. `lab.md` — six exercises; the learner **writes** a 13-step validator rather than using a
  library. `quiz.md` + `quiz-answers.md` (19 items across 4 tiers). Added seven concepts, three claims and
  three parameters to GLOSSARY.
- **Verified against the live server (every lab command executed):** adding `openid` to `scope` turns a
  5-key token response into a 6-key one. ID token decodes as `alg: HS256`, **no `kid`**, with
  `iss/sub/aud/exp/iat/auth_time/nonce/acr/s_hash`; `aud` is an **array** (`idTokenAudType` unset, so not the
  `"string"` form `AGENTS.md` recommends). **The validator was written and run: all ten applicable steps PASS**
  on a live token, including HMAC-with-client-secret per step 8. Six forgeries: tampered `sub` with the
  original signature → step 6 FAIL; **`alg:none` → step 7 FAIL *and* step 6 FAIL, in that order**; wrong `aud`
  → step 3 FAIL twice; expired → step 9; `nonce` mismatch → step 11; and **`sub` changed to `ceo@example.com`
  and re-signed with the client secret → ACCEPT, all checks passed** — the module's headline, a correct
  validator losing to a symmetric-algorithm choice. Hybrid `response_type=code id_token` → both artefacts in
  the **fragment** and **`c_hash` appears**. `nonce` echoed when sent, absent when not. `max_age=0` →
  `auth_time == iat`. UserInfo returns the profile claims. `[A406301]` reproduced on the public client.
  **Verified (primary sources, this session):** OIDC Core 1.0 *"incorporating errata set 2"* (15 Dec 2023) —
  §2's five REQUIRED claims and the `auth_time`/`nonce`/`acr`/`amr`/`azp` conditions quoted; **all thirteen
  §3.1.3.7 steps quoted**; §3.1.2.1 on `prompt=none`; §3.1.2.6's four error definitions; §3.1.3.6 `at_hash`;
  §3.3.2.11 `c_hash`; §5.3.2's `sub` check. OIDC Discovery 1.0 errata set 2 — the
  `id_token_signing_alg_values_supported` definition including *"The algorithm RS256 MUST be included."*
- **Three new findings, all verified, none fixed** (see the findings section above for the full write-ups):
  `prompt=none` → 302 with an **empty `Location`** (and the `prompt=none` handling is dead code in an
  unreachable branch); the logout endpoint is an **open redirect** via `startsWith` prefix matching, which
  **survives `NODE_ENV=production`**; and back-channel logout receipt cannot work (`JWKS_URI` unset) while
  reporting a server config error as *"Invalid logout token"*, plus two structural defects in the handler.
  Also a low-severity discovery-conformance gap: `id_token_signing_alg_values_supported` omits RS256.
- **Uncertain / notes:** **`UNVERIFIED` — the ES256/JWKS validation path.** The repo owner chose to set both
  clients to `ES256`; as of writing both are still `HS256`, so lab Exercise 3d gives the commands and the live
  JWKS contents (one EC P-256 key, `kid: "1"`) but **shows no transcript**, and is marked `UNVERIFIED on this
  deployment as of 2026-07-28` inline. Everything in 3a–3c is verified. Flipping the flag makes 3d a
  two-minute exercise and also unblocks `openid` on the public client. **The lab trips the rate limiter** —
  `loginLimiter` is 5/min and this lab runs the most flows of any; hit it during verification, and the failure
  surfaces three steps downstream as an empty redirect then a confusing `403 no ticket in session`, so the lab
  now warns about it explicitly and uses it as a diagnostic lesson. The ID token's 24-hour lifetime
  (`idTokenDuration: 86400`) is flagged as a Module 07 report item rather than a Module 08 finding.

### Module 07 — done / verified / uncertain

- **Done:** `README.md` — the module adds no mechanism; it adds a **review method**. Contains: the observation
  that Module 02 only gave you half of RFC 9700 (the §4 attack catalogue) and this module gives the other half
  (§2's sixteen requirements, all quoted verbatim in one table with normative strength and the module that
  taught each mechanism); how to read MUST/SHOULD/RECOMMENDED as a reviewer, with the rule that *a SHOULD
  without a written rationale is a finding and a SHOULD with one is a decision*; **what OAuth 2.1 actually
  changes**, framed as requires/omits/restricts from §1.8 quoted verbatim, plus the correction that it does
  not *prohibit* implicit — it does not specify it; draft-citation discipline; **three-source triangulation**
  (advertised / configured / observed) with a dark mermaid, each source's failure mode, and a worked example
  of each drawn from Modules 02, 04 and 06; severity as **strength × reachability** with a 2×3 table; and
  **conformance theatre** named as the meta-threat in three shapes. `lab.md` — six exercises producing an
  actual conformance report as the deliverable, plus three self-directed breaks. `quiz.md` +
  `quiz-answers.md` (18 items across 4 tiers; Tier 4 doubles as interim Cumulative Exam B). Added six terms
  to GLOSSARY. Added `docs/curriculum/.gitignore` for the learner's `my-audit.md`.
- **Verified against the live server (every lab command executed):** the full advertised/configured evidence
  base as printed. **§2.1 PASS** — registered URI + `x` and an unrelated `http://evil.example.com/cb` both →
  **400 with no `Location` header**, which evidences the exact-matching MUST and the open-redirect MUST NOT at
  once. **§2.1.1 FAIL** — public client, no PKCE parameters at all → access token **plus a refresh token**.
  **§2.1.2** — `response_type=token` → live 24 h access token in the URL **fragment**. **§2.4 FAIL —
  `grant_type=password` returns an access token and a 10-day refresh token.** **§2.2.2 PASS** — refresh
  rotation confirmed *by observation* (new refresh token returned), not by reading `refreshTokenKept`.
  **§2.3** — `resource` produces `aud` on the client-credentials path (so it works on two of three paths and
  is discarded on token exchange, per Module 06) and is absent when not requested; `accessTokenDuration`
  86400, `refreshTokenDuration` 864000. **§2.5 / RFC 7662 §2.1** — introspection with **no credentials** →
  200 with full metadata, while revocation with no credentials → `[A116302]`, with `client_id` only →
  `[A157357]`, and with full credentials → 200 and the token dies. Both endpoints advertise an **empty**
  auth-methods array, so the metadata misdescribes revocation — a three-source divergence found in the lab
  itself. **Verified (primary sources, this session):** RFC 9700 §2's complete subsection list (2.1, 2.1.1,
  2.1.2, 2.2, 2.2.1, 2.2.2, 2.3, 2.4, 2.5, 2.6) and the normative sentences in each, quoted; §2.2.1, §2.2.2,
  §2.3, §2.5 and §2.6 pulled a second time from `rfc9700.txt` for full sentences. `draft-ietf-oauth-v2-1-15`,
  dated **2 March 2026**, expiring 3 September 2026, title *"The OAuth 2.1 Authorization Framework"*; §1.8
  quoted verbatim (fetched twice, identical); §10 confirmed to have exactly two subsections, 10.1 and 10.2.
  SPEC-INVENTORY's draft row was **corrected** — wrong title and imprecise date.
- **Corrected two stale claims in Module 01's lab** (not silently — the reversal is now taught):
  ROPC was recorded as *refused* with `[A295306]`, which was true when written and is false now, because
  clearing `fapiModes` removed a restriction that had been blocking it incidentally. The lab now shows both
  outcomes, tells the learner to record which they saw **with the date**, and forward-links to Module 07 §3c.
  The stale "Deployment note for Module 02" about `require_pushed_authorization_requests` was rewritten to
  record that the original diagnosis was wrong and `fapiModes` was the real cause.
- **Uncertain / notes:** the lab's transcript is **deployment-specific by design** — it is a template for
  auditing *a* server, and it says so twice; a learner on a different service will get different rows, which
  is the intent but does make this the least reproducible lab in the curriculum. The OAuth 2.1 §10 content was
  fetched three times and the fetcher summarised rather than quoted on two of them; **only §1.8 is quoted
  verbatim**, and the §10 claim is limited to its subsection titles and count, which came back identically
  each time. The severity ranking in Exercise 6b is explicitly labelled *a* defensible order, not *the*
  answer, and item 3 is flagged as arguable. `my-audit.md` is now gitignored, but nothing stops a learner
  writing their report elsewhere — the redaction warning is the only control.

### Module 06 — done / verified / uncertain

- **Done:** `README.md` — the module is organised around one question, *where does the authority come from?*,
  and the three answers (the client's own registration / a trusted issuer's signature / an existing token).
  Contains: why a client-credentials token has no `sub` and why that absence is the whole semantics; RFC
  7523's **two** jobs (§2.1 grant vs §2.2 client auth) laid out side by side, because conflating them means
  having the security properties backwards; the trust shift that makes the AS a *relying party*, and the
  control the specs deliberately leave to the deployment — which subjects an issuer may assert; RFC 8693's
  impersonation-vs-delegation definitions quoted verbatim, with the observation that impersonation is
  *"indistinguishable"* by design, i.e. delegation with the audit trail deleted; `act` nesting for identity
  chains and `may_act` as the pre-authorisation; and a dark mermaid keyed on the single optional parameter
  (`actor_token`) that changes the meaning of the whole request. `lab.md` — six exercises plus three breaks.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added three roles, six concepts, seven parameters
  and two claims to GLOSSARY. **No new SPEC-INVENTORY rows needed** — §6 already carried RFC 7521/7522/7523/8693
  and all four were re-verified against primary sources this session.
- **Verified against the live server (every lab command executed):** client credentials → `expires_in: 86400`,
  **no `refresh_token`**, and introspection with **no `sub`** — contrasted against an authorization-code token
  carrying `sub`/`auth_time`/`acr`. `scope=openid profile` → `scope: "profile"`, HTTP 200, **silently
  dropped**. Public client → `unauthorized_client [A052301]`. JWT bearer: an HS256 assertion signed with the
  client secret → access token; changing one field to `sub: alice` → **an access token introspecting as
  `"sub": "alice"` for a user who never authenticated** (the module's headline); `iss` set to a nonexistent
  issuer → **still accepted**, proving the trust anchor is the client's key, not `iss`. Five assertion breaks,
  all `invalid_grant`: `[A314310]` unsigned, `Invalid assertion` (wrong key), `[A314314]` wrong audience,
  `[A314309]` expired, and the repo's own "'sub' claim failed to be extracted" — the split between bracketed
  Authlete codes (phase 1, claims) and bare sentences (phase 2, signature, `jwt-verification.service.ts:55`
  and `:77`) is taught as a diagnostic. A valid `client_assertion` against a `client_secret_basic` client →
  `[A157357]`, i.e. auth method is pinned per client. Token exchange: the scoped-subject-token failure, the
  Authlete-direct call proving Authlete is fine (`[A311001]`), the standalone Zod reproduction, the scopeless
  success, four identical 200s for `actor_token`/`resource`/`audience`/`requested_token_type`, no `aud` on the
  `resource` case, and `sub == subject_token` still `active: true`. Breaks: `[A311306]` nonexistent subject
  token, `[A250302]` missing `subject_token_type`, `[A244305]` no client identification.
  **Verified (primary sources, this session):** RFC 8693 title/Standards Track/Jan 2020, §1.1 both definitions
  quoted verbatim, §2.1 full parameter table with REQUIRED/OPTIONAL status, §2.2.1 the three REQUIRED
  parameters and the conditional-`scope` sentence, §2.2.2 `invalid_target`, §4.1 `act` and §4.4 `may_act`
  definitions quoted. RFC 7523 title/Standards Track/May 2015, both URNs, §3's four MUSTs and three MAYs
  quoted individually, §3.1 `invalid_grant` sentence, and the with-or-without-client-authentication sentence.
  RFC 7521 title/Standards Track/May 2015, §3 Issuer/Relying Party/Subject definitions, §5.2 validation list
  including the mandatory-audience sentence, §8.1–8.3. RFC 6749 §4.4 confidential-clients-only sentence, the
  §4.4 opening paragraph, §4.4.3 refresh-token SHOULD NOT, §2.1 client types, and §3.3's
  scope-divergence MUST.
- **Uncertain / notes:** **`act` is never produced on this deployment**, so no lab step shows a real delegated
  token — the module gate was rewritten accordingly, from "read `act` out of a response" to "say which one you
  got and what a correct response would have contained," which is arguably the better test but is a change
  from the original plan. **RFC 7522 (SAML) is not wired up** and nothing claims to run it; it is taught only
  to make the framework/binding split legible. **§2.2 (`private_key_jwt`) is not exercised** — no client here
  is registered for it; the lab demonstrates the *pinning* refusal instead and defers the real thing to Module
  10. The assertion grant is verified against the client's own secret via HS256, which is a property of this
  client's registration (`client_secret_basic`), not of RFC 7523 — flagged in the lab. Exercise 2's condensed
  auth-code flow needed a `case` branch because stored consent (24 h, in-memory) makes the login leg redirect
  either to the consent page or straight to the callback; both paths were observed. The lab tells the learner
  to read `AUTHLETE_BEARER_TOKEN` from `server/.env` for Exercise 6b — necessary to prove the fault is in the
  SDK and not Authlete, and the only lab in the curriculum that touches the management API.

### Module 05 — done / verified / uncertain

- **Done:** `README.md` — two unexamined assumptions (the request is not trustworthy; possession is not
  entitlement) drive the whole module; PAR vs JAR as a genuine design choice rather than two names for one
  thing; mix-up and why PKCE does not stop it; DPoP built up claim by claim with each element tied to the
  attack it defends; a DPoP-vs-mTLS comparison table; and the observation that PKCE → DPoP is the same
  commit-then-prove pattern one level up (third occurrence in the curriculum, named as a pattern). `lab.md` —
  five exercises plus a four-way DPoP break. `quiz.md` + `quiz-answers.md` (19 items across 4 tiers). Added
  five terms to GLOSSARY. Contains the gated mTLS proposal.
- **Verified against the live server (every lab command executed):** PAR → **201** with
  `urn:ietf:params:oauth:request_uri:…` and `expires_in: 600`; the handle drives a complete authorization
  flow carrying only `client_id` + `request_uri` through the browser; **reuse → `invalid_request_uri`
  `[A008303]`** (RFC 9126 §4 single-use enforced). JAR: `alg:none` request object → **`[A008311]` "the service
  is configured to conform to JAR … request objects must be always signed."** `iss` present on success **and**
  error redirects; `authorization_response_iss_parameter_supported: true`. DPoP: proof built by hand
  (64-byte raw P1363 signature confirmed), token exchange → **`token_type: DPoP`**, introspection →
  `cnf: {"jkt": …}`, and **an independently computed RFC 7638 thumbprint matched the `jkt` exactly**. Four
  break cases: DER signature → `[A254301] Signed JWT rejected: Invalid signature`; `kid` without `jwk` →
  `[A254303] The DPoP header did not include a public key in JWK format.`; wrong `htu` → `[A254301]` htu
  mismatch; correct proof → success. Resource access with `Authorization: DPoP` → `[A088302]` (the server bug
  above). **Verified (primary sources):** RFC 9126 title/date, §2.2 201 requirement, unguessability and
  client-binding sentences, the 5–600 s guidance, §4 single-use sentence, and the client-authentication
  sentence — all quoted verbatim. RFC 9101 title/date, §5 parameter-precedence sentence, §10.1 signing
  requirement, §4 `iss`/`aud` guidance, §10.8 on `oauth-authz-req+jwt`. RFC 9207 title/date, §2 definition and
  AS requirement (including error responses), §2.4 client extraction and rejection requirements, §3 metadata
  name. RFC 9449 title/date, §4.2 header and claim requirements and the `ath` definition, §6.1 `jkt`
  definition, §7 and §7.1 scheme and `ath` requirements. RFC 8705 title/date, §2.1/§2.2/§3, both auth-method
  values, the `x5t#S256` definition, and the protected-resource verification sentence.
- **Uncertain / notes:** **the signed-JAR path is not exercised** — the lab's public client has no registered
  JWKS, so only the `alg:none` rejection is demonstrated; labelled in the lab as a client-configuration limit,
  not a spec or server limit. **mTLS is not implemented and nothing claims to run it.** The `htu` this server
  compares against is derived from its own `Host` header and omitted the port on this deployment
  (`http://localhost/api/par`) — noted in the lab as deployment behaviour, and flagged as the shape of a
  classic false failure behind a proxy. Bracketed Authlete codes are labelled vendor behavior throughout.

### Module 04 — done / verified / uncertain

- **Done:** `README.md` — the self-contained-vs-reference decision framed as a real trade-off (latency,
  revocation lag, availability); RFC 7662 with both anti-oracle rules quoted; RFC 7009 including the cascade
  **SHOULD**; RFC 9068's `typ: at+jwt` and seven required claims, with token confusion explained; RFC 8707
  `resource` → `aud`; a table separating the **three** metadata documents by consumer; RFC 7591/7592 and the
  registration access token; a flowchart converging both token formats on the same three RS checks; and the
  gated RFC 9728 proposal. `lab.md` — six exercises. `quiz.md` + `quiz-answers.md` (18 items across 4 tiers).
  Added eight terms to GLOSSARY.
- **Verified against the live server (every lab command executed):** `/api/introspection/standard` →
  `{"active":true,"scope":"profile","client_id":…,"token_type":"Bearer","exp":…,"sub":"admin","iss":…,
  "auth_time":…,"acr":"pwd"}`; `/api/introspection` → Authlete's richer object (`existent`/`usable`/
  `sufficient`/`refreshable`/`scopes`/`grantType`/`consentedClaims`/`scopeDetails`). Revocation → 200, then
  introspection → `{"active":false}`. Garbage token: revoke → **200**, introspect → **200
  `{"active":false}`** — both anti-oracle rules confirmed. **`resource=https://api.example.com/orders` →
  `aud":["https://api.example.com/orders"]` in the introspection response.** Both RFC 8707 violations →
  `invalid_target`, delivered as a **redirect**: `[A251308]` (fragment) and `[A251307]` (not absolute).
  AS metadata at true root and OIDC discovery under `/api` are **byte-identical key sets** on this
  deployment. `/.well-known/oauth-protected-resource` → **200 `text/html`** (SPA catch-all), as does an
  invented path; `grep -rn "oauth-protected-resource" server/src/` finds nothing. DCR → `[A206201] Service
  does not support dynamic client registration.` **Verified (primary sources):** RFC 7662 title/date, §2.1
  endpoint-protection sentence and §2.2 not-active sentence quoted verbatim, full member list; RFC 7009
  title/date, §2.2 200-on-invalid sentence and the cascade SHOULD quoted verbatim; RFC 9068 title/date, §2.1
  `typ` requirement quoted, all seven §2.2 required claims; RFC 8707 title/date, §2 absolute-URI/no-fragment
  and multiple-occurrence sentences and the `invalid_target` definition quoted; RFC 9728 title, Apr 2025, §3
  path, sole REQUIRED field `resource`, and the `WWW-Authenticate` sentence quoted.
- **Uncertain / notes:** **the introspection endpoint is unauthenticated** — surfaced above as a real finding
  and taught as the module's Tier-3 exercise, not fixed. The DCR exercise is marked optional because the
  service does not have dynamic registration enabled, so its output is described from the spec rather than
  claimed as observed; the one thing verified about it is the **request shape**, which wraps RFC 7591 metadata
  in a `{"json": "…"}` field — a deployment adaptation, labelled as such. `at+jwt` access tokens **cannot** be
  produced on this deployment (opaque tokens), so RFC 9068 is taught but no lab step claims to show one. The
  identical AS-metadata/OIDC-discovery documents are labelled a deployment simplification, explicitly not a
  spec equivalence.

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
