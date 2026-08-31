# RFC 9700 — Best Current Practice for OAuth 2.0 Security (BCP 240)

> ## ✅ FIXED 2026-08-11 — 9700-W1 and 9700-W2 shipped (T0-1); severity **S1 → S2**
>
> `body: parameters` is gone from both sites. `services/token.service.ts:57-60` and
> `services/revocation.service.ts:64-67` now log `{ length: parameters.length }` and nothing else, which is
> `introspection.service.ts:115-117`'s pattern. **F-1 is closed.**
>
> - **9700-W1** ✅ — both log calls, plus a comment at each site naming the eight credentials that used to
>   land on disk, so the line is not "simplified" back.
> - **9700-W2** ✅ — `grep -rn 'body: parameters\|body: req.body' server/src` returns nothing. The
>   prohibition is recorded in **two** places, per the item's acceptance criteria: the code comments above,
>   and a new `AGENTS.md` **Quirks & gotchas** bullet (*"Never log a request body — log its length"*).
> - **The test** is `tests/unit/services/credential-logging.test.ts` — a Winston-shaped spy logger
>   (`CallableLogger` until 2026-08-31, when the shim was removed), driven by ROPC, `authorization_code` + PKCE, `refresh_token`, `jwt-bearer`, token
>   exchange, the `rawBody`-absent fallback rebuild, and both client-auth channels; for revocation the
>   revoked token in all three shapes. It asserts on distinctive **values** rather than parameter names
>   (asserting `code` would false-positive on *"URL-en**code**d"* and *"de**code**d Basic auth"*), plus the
>   unambiguous `name=` forms, plus — in the other direction — that the length *is* still logged, so
>   "log nothing at all" cannot pass instead. Verified as a real net: reintroducing `body: parameters`
>   fails **11 of its 12 tests**. Suite 514 → **526** across 54 files.
> - **Edits were line-preserving on purpose.** Both blocks were four lines and remain four lines, because
>   ~14 citations across `audit/` point *below* `token.service.ts:60` (`:76`, `:82`, `:86-89`,
>   `:97,106,115`) and ~8 below `revocation.service.ts:67` (`:73-74`, `:82`). `scripts/check-docs.mjs` only
>   catches refs past EOF, so deleting a line would have silently created ~20 off-by-one citations.
>
> **Severity, restated.** This entry's S1 rested entirely on F-1. What remains is F-2 (ROPC advertised
> without its §2.4 caveat — S3, and deliberate teaching material), F-3 (`implicit` mappable — S4), and
> F-4/F-4a's residue: the posture is still unreadable *through the SDK* because `service.get()` throws on
> the `SPIFFE_JWT` enum gap. That residue is **S2**, so the header reads S2 — the same basis on which
> `FAPI-2.0-SECURITY-PROFILE.md` went S1→S2. The verdict stays `PARTIAL`: §2.4 is still deliberately unmet.
>
> **⚠️ The residue is gone as of 2026-08-12 (T1-5).** `SPIFFE_JWT` was withdrawn, `service.get()` parses, and
> `GET /api/fapi/config` reports the live posture — including `pkceRequired: false` and `scopeRequired: false`,
> the two §2.1.1/§2.2 controls this entry could not observe. **So the F-4/F-4a residue drops from S2 to S4**
> (documentation only) and the entry's severity now rests on **F-2 alone — S3**, which is deliberate curriculum
> material. §2.4 remains unmet by decision; the verdict stays `PARTIAL`. The `<thinking>` item 6 below — *"whether
> `pkceRequired` is actually set on the live service. Cannot observe it"* — was answered by the 2026-08-10 probe
> and is now answerable **through the repo's own endpoint**, which is the difference between a probe and an
> operable deployment.
>
> **One other part of this entry is now stale.** F-4a's *"`/api/fapi/config` **hardcodes**
> `pkceRequired: true`"* was fixed by **FAPI2-W1** on 2026-08-11 — all six posture fields are read live at
> `controllers/fapi.controller.ts:51-64`. The endpoint still fails, but it no longer fabricates. **9700-W4's
> hardcoding half is therefore already shipped**; its observability half remains blocked on the enum gap,
> which is DR-07's decision, not this item's.
>
> **Curriculum impact: nil, re-confirmed before the change** (§7.4 steps 2–4, the steps skipped on
> 2026-08-10). Phrase greps — not error-string greps — for *"logs the request body"*, *"body: parameters"*,
> *"credential leak"*, *"secrets in logs"* and *"redact"* across `docs/`, `README.md` and `AGENTS.md` found
> nothing that teaches this log line. The one near-hit,
> `modules/05-request-integrity-and-binding/quiz-answers.md:213` (*"Stop logging credentials at all…"*), is a
> hypothetical exercise that **recommends this fix** and makes no claim about the code. 9700-W1/W2 appear in
> neither direction of the lab-breakage register (`04-remediation-plan.md` §6.1, §6.2).

> **✅ F-2's framing residue closed 2026-08-13.** The entry rested on `README.md` presenting a deliberately
> unhardened teaching deployment as production guidance. It now opens with a *"Read this before you copy
> anything"* block that tabulates all four departures — ROPC/implicit enabled, PKCE not required, 24-hour
> tokens, the three deliberate token-exchange defects — each against what production would do, and says
> plainly to copy the request handling rather than the service configuration. **§2.4 remains unmet by
> decision, which is the point of the lab; it is no longer unmet *silently*.**

- **Verdict:** `PARTIAL`
- **Severity:** **S3** — was S1, then S2; see the banners above. F-2's framing residue closed 2026-08-13, so what remains is deliberate curriculum material with the departure stated in `README.md`'s posture table
- **Original severity:** **S1** (F-1, fixed 2026-08-11)
- **Authlete version:** 3.0 — no vendor surface; RFC 9700 is realised through other flags and through this server's own code
- **Repo docs under test:** `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/curriculum/modules/07-oauth-2-1-and-security-bcp/`, `modules/01`, `modules/02`, `modules/03`

<thinking>
1. RFC 9700's AS-side MUSTs relevant here: §2.1 exact redirect-URI matching except localhost ports;
   §2.1.1 authorization servers MUST support PKCE and MUST enforce `code_verifier` when a challenge was
   sent; §2.2.2 refresh tokens for public clients MUST be sender-constrained or rotated; §2.4 the ROPC
   grant MUST NOT be used; §2.1.2 clients SHOULD NOT use implicit; §4.3.2 clients MUST NOT pass access
   tokens in a query parameter.
2. Authlete boundary: redirect matching, PKCE enforcement, refresh-token policy and grant-type
   enablement are all Authlete's, gated by flags. What is *this server's* alone is everything RFC 9700
   says about not leaking credentials — logging, error surfaces, proxy handling. That is where I should
   look hardest, because no flag protects it.
3. Code: found a credential-leak defect in the two most sensitive services. `token.service.ts:59` and
   `revocation.service.ts:66` log the full URL-encoded request body. `introspection.service.ts:115-116`
   logs only the length, which proves the codebase knows the correct pattern. Checked the logger: the
   callable form resolves to `info` in production, and there is an `info`-level file transport with
   14-day retention. So this is not debug-only.
4. Docs: `AGENTS.md`/`CLAUDE.md` say, in as many words, "Redact them in logs". The repo violates its own
   rule. Separately, `README.md` lists ROPC as "Working" without a §2.4 caveat, while Module 01 teaches
   that §2.4 says MUST NOT.
5. Delta: (3) vs (1) and (3) vs (4) both fail on credential logging. The ROPC case is a
   documentation-framing issue, not a code defect — ROPC exists here to be taught.
6. Unsure: whether `pkceRequired` is actually set on the live service. Cannot observe it, because the
   only code path that reads it (`fapi.controller.ts`) throws on the `SPIFFE_JWT` enum gap. Recorded as
   a genuine observability gap, not guessed.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | *"Authorization servers MUST support PKCE"* | §2.1.1 | ⊘ Authlete's; gated by `Service.pkceRequired` / `pkceS256Required`. **Live values unobservable** — see F-4 |
| 2 | *"If a client sends a valid PKCE `code_challenge` … the authorization server MUST enforce the correct usage of `code_verifier` at the token endpoint"* | §2.1.1 | ⊘ Authlete's |
| 3 | *"Authorization servers MUST utilize exact string matching except for port numbers in `localhost` redirection URIs of native apps"* | §2.1 | ⊘ Authlete's; `Service.loopbackRedirectionUriVariable` |
| 4 | *"Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation"* | §2.2.2 | ⚠️ `Service.refreshTokenKept=true` **disables** rotation, so public-client refresh tokens must then be sender-constrained (DPoP). Unverified on the live service — see F-4 |
| 5 | *"The resource owner password credentials grant MUST NOT be used."* | §2.4 | ❌ Implemented (`controllers/token.controller.ts:98-145`) — deliberately, as teaching material; see F-2 |
| 6 | *"Clients SHOULD NOT use the implicit grant"* | §2.1.2 | ⚠️ `implicit` is a mappable grant type (`services/token.operations.service.ts:29`) |
| 7 | *"Clients MUST NOT pass access tokens in a URI query parameter"* | §4.3.2 | ✅ **Deliberately not implemented**, with the citation in the code — `utils/dpop.ts:100-102` |
| 8 | Do not leak credentials | §4.2.4 and the BCP's general posture | ✅ **fixed 2026-08-11** — was ❌ Violated; see F-1 |

## Finding F-1 — ✅ FIXED 2026-08-11 — the token endpoint wrote client secrets, passwords, authorization codes, PKCE verifiers and refresh tokens to disk (was S1)

> **Fixed by T0-1 / 9700-W1.** Both sites log the length only; the description below is the **pre-fix**
> state, retained because it is the evidence. See the banner at the top of this file.

`server/src/services/token.service.ts:57-60`:

```
log("TokenService: URL-encoded parameters (length), body", {
  length: parameters.length,
  body: parameters,          // <-- the entire request body
});
```

`parameters` is preferentially the **raw, unmodified request body**, captured by the `verify` hook on
`express.urlencoded` in `app.ts` and read at `:42` (`(req as any).rawBody`). *(The hook was on the
`body-parser` package until 2026-08-31; Express 5 re-exports the same function, so the mechanism is
unchanged and the direct dependency is gone.)* The exclusion list at `:47` that strips
`client_secret` applies **only to the fallback rebuild path**, which does not run when `rawBody` is
present — i.e. it does not run in normal operation.

So for a request to `POST /api/token`, the log line contains, depending on the grant:

| Grant | Credentials written to the log |
|---|---|
| `client_secret_post` (any grant) | **`client_secret`** |
| `password` (ROPC) | **`username` + `password`** — the resource owner's actual credentials |
| `authorization_code` | **`code`** and **`code_verifier`** (the PKCE secret) |
| `refresh_token` | **`refresh_token`** |
| `urn:…:jwt-bearer` | **`assertion`** |
| token exchange | **`subject_token`**, **`actor_token`** |

`client_secret_post` is not an edge case here: `AGENTS.md` records that *"Authlete defaults DCR-created
confidential clients to `CLIENT_SECRET_POST`"*, so the common client shape in this repo sends its secret
in the body.

**This is not debug-only.** `utils/logger.ts:48-52`:

```
const level = server.logLevel === "debug" ? "debug" : "info";
winstonLogger.log(level, msg, meta);
```

In production `logLevel` is `info` (`config/app.config.ts:27`), so the callable form logs at **`info`**,
which is exactly the level of the rotating file transport `logs/app-%DATE%.log` with **14-day
retention** (`utils/logger.ts:13-19`), plus the console transport.

**Failure scenario.** A confidential client performs a routine `client_secret_post` token exchange
against a production deployment. `logs/app-2026-08-10.log` now contains that client's secret in
cleartext, retained 14 days, replicated wherever logs ship. Any log reader — an SRE, a log aggregator,
a backup — becomes a credential holder. For the ROPC path the same line contains an end user's password.

**`server/src/services/revocation.service.ts:64-66` has the identical defect**, logging the full body —
which for revocation is the token being revoked plus, for `client_secret_post`, the client secret.

**The codebase already knows better.** `server/src/services/introspection.service.ts:115-117` logs
**only** `length`. The correct pattern exists three files away.

**This violates the repo's own written rule.** `AGENTS.md` and `CLAUDE.md`: *"Never commit `.env` files
or real Authlete credentials, tokens, or client secrets. **Redact them in logs**, docs, and examples."*
And `services/token.service.ts` is listed in the same document under **Security-critical surfaces →
Token issuance**.

**Not in `PROGRESS.md`'s open-findings register** — new.

## Finding F-2 — ROPC is implemented and advertised without its §2.4 prohibition (S3, documentation)

`controllers/token.controller.ts:98-145` implements the `PASSWORD` action, validating credentials
locally and calling `token.issue`. RFC 9700 §2.4 is unambiguous: *"The resource owner password
credentials grant [RFC6749] MUST NOT be used. This grant type insecurely exposes the credentials of the
resource owner to the client."*

This is almost certainly **deliberate** — Module 01's objectives include *"what ROPC was for (RFC 6749
§4.3) and why RFC 9700 §2.4 says MUST NOT"*, and you cannot demonstrate that without an implementation.
The audit is not proposing removal.

The defect is that `README.md`'s feature table (`:92-130`) lists ROPC among features marked **"Working"**
with no caveat. A reader who never reaches Module 01 sees a maintained OAuth server advertising a grant
that BCP 240 forbids, as a feature.

Aggravating: F-1 means the ROPC path is also the one that writes end-user passwords to disk. The two
findings compound — a grant that "insecurely exposes the credentials of the resource owner" here also
persists them for 14 days.

## Finding F-3 — `implicit` is a mappable grant type (S4)

`services/token.operations.service.ts:29` maps `implicit` → `IMPLICIT`, so the admin token-create
surface can mint tokens attributed to a grant §2.1.2 says clients SHOULD NOT use. It is admin-only and
`SHOULD NOT` binds clients rather than servers, so this is informational. Worth a one-line note in the
admin API docs rather than a code change.

## Finding F-4 — RESOLVED by live probe; posture now known and partly non-compliant (S2)

`GET /api/{serviceId}/service/get` over raw HTTP returned **HTTP 200 with all 129 fields**
(`SERVICE-CONFIG-PROBE.md`). So the posture was never unobservable — it is unobservable *through the SDK*,
because the failure is SDK-side Zod validation of `SPIFFE_JWT`, confirmed on the wire.

Requirements #1–#4 against the live values:

| Req | Requirement | Live | Verdict |
|---|---|---|---|
| 1 | AS MUST support PKCE | `pkceRequired = False`, `pkceS256Required = False` | **Supported but not required** — see `RFC7636-pkce.md`, now `MISCONFIGURED`/S1 |
| 3 | Exact redirect matching except localhost ports | `loopbackRedirectionUriVariable = True` | ✅ matches §2.1 |
| 4 | Public-client refresh tokens sender-constrained **or** rotated | `refreshTokenKept = False` ⇒ **rotation on** | ✅ **§2.2.2 satisfied** |

Requirement #4 is worth dwelling on: rotation being on satisfies RFC 9700 §2.2.2 and simultaneously
contradicts FAPI 2.0 §5.3.2.1 as `AGENTS.md` cites it (*shall not* rotate). Both readings are correct; which
governs depends on the profile claimed. Module 03 already names "the rotation-vs-FAPI-2.0 tension" as an
objective — the live config is a worked instance of it and should be cited as one.

The **reporting** defect below stands unchanged, and is now demonstrably worse than "unverified":
`/api/fapi/config` hardcodes `pkceRequired: true` and `scopeRequired: true`, while the live service holds
`False` for both.

## Finding F-4a — the posture is unobservable *through the SDK*, and misreported by the one endpoint that answers (S2)

Requirements #1–#4 are Authlete's to enforce, which is correct delegation. But **this server cannot
report what Authlete is configured to do**, because the only code path that reads those flags —
`controllers/fapi.controller.ts:25,60` via `authleteApi.service.get()` — throws on the SDK's
`ClientAuthMethod` enum gap (confirmed in `01-spec-matrix.md`: the enum has 8 members and no
`SPIFFE_JWT`, and it is a strict `z.nativeEnum`).

So `pkceRequired`, `pkceS256Required`, `refreshTokenKept` and `loopbackRedirectionUriVariable` cannot be
read at runtime. Module 07's central skill is *"triangulate a deployment's posture from three
independent sources (advertised metadata / stored configuration / observed behaviour)"* — and the
stored-configuration leg is broken on the very deployment the module is taught against.

Compounding: `GET /api/fapi/config` **hardcodes** `pkceRequired: true` and `scopeRequired: true`
(`fapi.controller.ts:41,43`) rather than reading them, so the one endpoint that appears to answer the
question fabricates the answer. `AGENTS.md` already flags this as "a plain reporting bug"; this audit
adds that it converts an unobservable posture into a *confidently wrong* one.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| *"Redact them in logs, docs, and examples"* | `AGENTS.md`, `CLAUDE.md` | ~~The token and revocation endpoints log full bodies~~ → **✅ resolved 2026-08-11**: they log the length only, and `AGENTS.md` now carries the prohibition explicitly rather than only as a general instruction | ~~`DOC_INCORRECT` / **S1**~~ → **CONSISTENT.** The rule and the code agree. Scope note retained for the record: the instruction addresses contributors, not learners, and **no document told readers the logs were safe to share** (checked: no `docs/` file mentions `logs/app-*`), so the harm was the live defect in F-1 rather than a false reassurance |
| ROPC listed as "Working" with no §2.4 note | `README.md:94` — `\| Resource Owner Password \| Working \| API Reference \|` | Correct that it works; omits that BCP 240 forbids it | `DOC_INCORRECT` / S3 — a learner reading only the feature table would ship ROPC believing it is a supported modern grant |
| `GET /api/fapi/config` reports `pkceRequired: true` | `fapi.controller.ts:41` | Hardcoded, not read | `DOC_INCORRECT` / S2 — a learner auditing this deployment records a PKCE posture nobody verified |
| Module 07 teaches posture triangulation against this deployment | `modules/07…/README.md:66-78` | The stored-configuration leg is broken | `S2` — the lab cannot complete as written |

## Sources consulted

- RFC 9700 §§2.1, 2.1.1, 2.1.2, 2.2.2, 2.4, 4.2.4, 4.3.2 — `https://www.rfc-editor.org/rfc/rfc9700.html`
- Code: `services/token.service.ts:42,47,57-60`, `services/revocation.service.ts:64-66`, `services/introspection.service.ts:115-117`, `utils/logger.ts:13-19,48-52`, `config/app.config.ts:27`, `controllers/token.controller.ts:98-145`, `controllers/fapi.controller.ts:25,41,43,60`, `utils/dpop.ts:100-102`, `services/token.operations.service.ts:29`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9700-W1 | ✅ **DONE 2026-08-11.** **Stop logging request bodies.** Remove `body: parameters` from `token.service.ts:59` and `revocation.service.ts:66`, matching `introspection.service.ts`'s length-only pattern | S | **Met.** Both sites log `{ length }` only; `tests/unit/services/credential-logging.test.ts` drives six grant shapes and both client-auth channels through a spy logger and asserts on the values (11 of its 12 tests fail if the line is reintroduced). Planned under plan mode, as the file is on the Security-critical surfaces list |
| 9700-W2 | ✅ **DONE 2026-08-11.** Sweep for the same pattern elsewhere | S | **Met.** `grep -rn 'body: parameters\|body: req.body' server/src` returns nothing (`health.service.ts:42`'s `body` is a return value, not a log). Prohibition recorded twice: a comment at each site, and an `AGENTS.md` **Quirks & gotchas** bullet. No lint rule — the two greppable forms plus the test are cheaper than a custom rule, and a rule could not see a rename |
| 9700-W3 | Caveat ROPC in `README.md` | S | The feature row cites RFC 9700 §2.4 and points at Module 01; "Working" becomes "Working — deliberately, to teach why §2.4 forbids it" |
| 9700-W4 | Make the deployment's posture observable | M | Depends on the `service.get()` fix (B7). Then remove the hardcoded values at `fapi.controller.ts:38-43` so `config` reports what the service holds. Blocks Module 07's lab. |
| 9700-W5 | Note `implicit` on the admin surface | S | `docs/API.md` records that admin token-create accepts `implicit` and why that is not a client-facing grant |

**Ordering.** ~~9700-W1 is the highest-priority item found in the audit so far~~ — **shipped 2026-08-11 as
T0-1, the first action of Phase 5**, planned under plan mode because `token.service.ts` is
security-critical. It was a two-line change and the prediction held: no curriculum consequence, no lab
touched. 9700-W3 and 9700-W5 are documentation and sit in `04-remediation-plan.md` T2-17. **9700-W4 is
half-shipped** — the hardcoding is gone (FAPI2-W1), the observability half is still blocked on the
`SPIFFE_JWT` enum gap, i.e. on DR-07 rather than on B7 as originally written.

**Curriculum check — performed twice, both times empty.** Pre-remediation: `grep -rn "TokenService:
URL-encoded\|URL-encoded parameters" docs/` returns **nothing**, so no lab or tutorial shows this log line
as expected output. Re-run on 2026-08-11 before the change landed, this time as the **phrase** grep that
`04-remediation-plan.md` §7.4 step 2 requires (*"logs the request body"*, *"body: parameters"*, *"credential
leak"*, *"secrets in logs"*, *"redact"*) plus step 3's check of cross-referencing modules: still nothing.
The single near-hit is `modules/05-request-integrity-and-binding/quiz-answers.md:213`, a hypothetical
*"what I would change about the logging"* answer that **recommends this fix** and asserts nothing about
`token.service.ts`. So 9700-W1 was an isolated code change with **no curriculum impact** — unusually clean
for this repo, and the reason it went first.
