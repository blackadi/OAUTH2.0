# RFC 8693 — OAuth 2.0 Token Exchange

- **Verdict:** `PARTIAL` — **deliberate, confirmed, not to be "fixed" in isolation**
- **Severity:** **S2**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/TOKEN-EXCHANGE-TUTORIAL.md` (esp. Part 12), `docs/curriculum/modules/06-machine-and-delegated-grants/lab.md` Exercise 6, `AGENTS.md` Deliberate-defects table, `tests/unit/controllers/token-exchange-response.handler.test.ts`

> **Scope note.** `AGENTS.md` marks three behaviours in `token-exchange-response.handler.ts` as intentionally
> wrong because Module 06 teaches them. This entry **confirms** them against the RFC and does **not** propose
> fixing them independently of the curriculum. Everything below that is *new* is flagged as such.

<thinking>
1. RFC MUSTs on the AS: §2.1 — `subject_token` and `subject_token_type` REQUIRED; `actor_token_type` REQUIRED
   when `actor_token` is present and MUST NOT appear otherwise; `resource`, `audience`, `scope`,
   `requested_token_type` OPTIONAL. §2.2.1 — `access_token`, **`issued_token_type`** and `token_type` are all
   REQUIRED. §2.2.2 — an invalid request or invalid subject/actor token MUST be `invalid_request`; an
   unwillingness to issue for a named target SHOULD be `invalid_target`. §4.1 — `act` expresses delegation;
   a consumer MUST consider only top-level claims plus the current actor. The AS MUST validate the subject
   token, and the actor token if present.
2. Authlete boundary: Authlete parses the exchange and hands back every parameter on `TokenResponse`
   (`resources`, `audiences`, `requestedTokenType`, `subjectToken(+Info)`, `actorToken(+Info)`), then the AS
   mints via `token.management.create`. `01-spec-matrix.md` §5.1 already established by live probe that
   Authlete does **not** supply `issued_token_type` — the AS must synthesize it.
3. Code: `controllers/token-exchange-response.handler.ts` forwards four fields and emits six response members.
   Three deliberate defects, all commented, all locked by a characterization test.
4. Docs: Part 12 is an unusually good self-report. Two of its statements are now stale, and one of its implied
   remedies is impossible.
5. Delta: the code↔RFC delta is known and intentional. The *new* deltas are docs↔code (stale test claim, stale
   line numbers) and docs↔vendor (`audience` has no Authlete surface at all).
6. Is `audiences` forwardable? This is the question that changes Module 06 Exercise 6b's framing, so I checked
   it twice — the SDK model and Authlete's own published request schema. Neither has an audience field.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` | §2.1 | ✅ Authlete's — `TOKEN_EXCHANGE` action; live `grant_types_supported` includes the URN |
| 2 | `subject_token` + `subject_token_type` REQUIRED | §2.1 | ⊘ Authlete's |
| 3 | `actor_token_type` REQUIRED with `actor_token`, MUST NOT appear otherwise | §2.1 | ⊘ Authlete's |
| 4 | The AS MUST validate the subject token, and the actor token if present | §2.1 (processing) | ⊘ Authlete's for validation; ❌ **the result is discarded** — `actorToken`/`actorTokenInfo` never read |
| 5 | Response MUST include `access_token` | §2.2.1 | ✅ `:70` |
| 6 | Response MUST include **`issued_token_type`** | §2.2.1 | ❌ **deliberate** — `:63-65`; Authlete does not supply it (probe, `01-spec-matrix.md` §5.1), so synthesizing it is the AS's job |
| 7 | Response MUST include `token_type` | §2.2.1 | ✅ `:71`, defaulting to `"Bearer"` |
| 8 | `expires_in` RECOMMENDED | §2.2.1 | ✅ present — but the value is the 24 h service default (**deliberate**) |
| 9 | `scope` REQUIRED when narrower than requested | §2.2.1 | ⚠️ always emitted, never narrowed — no scope-narrowing logic exists |
| 10 | Audience-restrict to `resource` / `audience`, or refuse with `invalid_target` | §2.1, §2.2.2 | ❌ **deliberate** for `resource`; ❌ **impossible via this API** for `audience` — F-1 |
| 11 | `act` claim for delegation | §4.1 | ❌ **deliberate** — delegation silently becomes impersonation |
| 12 | Errors: `invalid_request` for a bad request or bad token; `invalid_target` for a target it will not serve | §2.2.2 | ⚠️ Authlete's `responseContent` is forwarded; no local `invalid_target` is ever produced, because no target is ever considered |
| 13 | Members the spec does not define | §2.2.1 | ❌ **deliberate** — `client_id` and `subject` emitted (`:74-75`) |

## The three deliberate defects — confirmed, with corrected locations

All three reproduce, all three are commented in the file, and all three are locked by
`tests/unit/controllers/token-exchange-response.handler.test.ts`. **The line numbers recorded in `AGENTS.md`
and in the tutorial are stale** — the ⚠️ comment blocks moved them:

| Defect | `AGENTS.md` / Part 12 says | **Actual** | Test that locks it |
|---|---|---|---|
| Four parameters dropped; no lifetime | `:29-34` | **`:47-52`** | `…handler.test.ts:87-125` |
| `issued_token_type` omitted; non-spec members emitted | `:48-55` | **`:66-76`** | `:127-159` |
| `result.subject \|\| subjectToken` | `:27` | **`:32`** | `:161-175` |

`scripts/check-docs.mjs` cannot catch this: every stale reference still points *inside* the file, so it passes
the bounds check while pointing at the wrong code. This is exactly the drift class `AGENTS.md` warns about in
its documentation-drift section, occurring in `AGENTS.md` itself.

## Finding F-1 — `audience` cannot be forwarded at all, and the docs imply it can (S2, **new**)

Part 12's table treats `resource` and `audience` as the same defect with the same fix:

| Parameter sent | This server | Consequence (as documented) |
|---|---|---|
| `resource` | discarded | "A token minted 'for the orders API' is valid everywhere" |
| `audience` | discarded | "Same" |

**They are not the same, and only one is fixable through this API.** Verified twice:

- **SDK 1.0.0** `models/tokencreaterequest.ts` — 23 fields. `resources` is present (and
  `services/token.operations.service.ts:80-84` already forwards it when supplied). There is **no** `audiences`.
- **Authlete's own published spec** for `POST /api/{serviceId}/auth/token/create`
  (`docs/openapi-spec.json`) — 23 properties: `accessToken, accessTokenDuration, accessTokenPersistent, acr,
  authTime, authorizationDetails, certificateThumbprint, clientEntityIdUsed, clientId, clientIdAliasUsed,
  clientIdentifier, dpopKeyThumbprint, forExternalAttachment, grantType, jwtAtClaims, metadataDocumentUsed,
  properties, refreshToken, refreshTokenDuration, resources, scopes, sessionId, subject`. No audience field.

So this is **not** an SDK gap of the `SPIFFE_JWT` kind — Authlete's token-creation API genuinely has no
audience parameter. RFC 8693 §2.1 defines `audience` as *"The logical name of the target service"*, deliberately
distinct from `resource`'s URI, and there is nowhere to put it.

**Consequences, in order of importance:**

1. **Module 06 Exercise 6b's framing needs narrowing.** "The handler drops four parameters" is true; "forwarding them fixes it" is true for `resources` and `requestedTokenType`-adjacent behaviour, and **false for `audience`**. A learner told the fix is symmetric will go looking for a field that does not exist. This is the same correction `01-spec-matrix.md` §5.1 already had to make for `issued_token_type`, and it is a better teaching point than the original: *the vendor's API shapes what conformance you can reach.*
2. **The characterization test asserts the impossible-to-change case.** `…handler.test.ts:105-108` — `it("drops audiences")` — will pass forever regardless of any remediation, because there is no field to forward it to. Worth a comment in the test saying so, or the next maintainer reads a green assertion as a live constraint.
3. **The only routes to an `aud` on an exchanged token are `resources` — which Authlete does map to `aud`, verified live (`modules/04…/lab.md:180-184`) — or `jwtAtClaims`.** And `jwtAtClaims` requires JWT access tokens, which this service does not issue (`accessTokenType = Bearer`, `accessTokenSignAlg` absent — see `RFC9068-…`). So on this deployment, an exchanged token cannot be audience-restricted by the `audience` parameter under any currently available configuration.

## Finding F-2 — Part 12's "Not covered by tests" is now false (S3, **new**)

`docs/TOKEN-EXCHANGE-TUTORIAL.md` Part 12:

> ### Not covered by tests
> There is no unit or integration test for `token-exchange-response.handler.ts`. The only automated coverage
> is one E2E case, and its assertion is `expect([200, 400, 429]).toContain(res.status)`.

That was true when written and is not now: `tests/unit/controllers/token-exchange-response.handler.test.ts`
exists — 14 assertions across four blocks, added in `a7d2159` *"test(token-exchange): lock in the handler's
deliberate gaps so they cannot rot a lab"* — and `AGENTS.md`'s deliberate-defects table already cites it as the
lock. So the tutorial now understates the repo's own safeguards, in a section whose purpose is to be candid
about them.

Also stale in the same section: it quotes the handler's create-request literal as six lines at `:29-34`; the
literal is now at `:47-52` and reads `as TokenCreateRequest` with the ⚠️ block above it.

## Finding F-3 — `scope` is never narrowed, so §2.2.1's conditional REQUIRED is untestable (S4, **new**)

§2.2.1: `scope` is *"OPTIONAL if the scope of the issued security token is identical to the scope requested by
the client; otherwise, it is REQUIRED."* The handler forwards `result.scopes` unchanged (`:23,50`) and echoes
them back (`:73`), so requested and issued scope are identical by construction and the conditional never
engages. Not a defect — but it means the repo cannot demonstrate the one case §2.2.1 legislates for, and
Module 06 should not imply otherwise. It does not currently.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Four parameters accepted and silently discarded, each returning 200 | `TOKEN-EXCHANGE-TUTORIAL.md` Part 12 | Confirmed against the RFC and the test | **Accurate** |
| `audience` discarded → "Same" consequence as `resource` | Part 12 table | Only `resource` is forwardable; `audience` has no Authlete field — F-1 | `DOC_INCORRECT` / **S2** |
| `issued_token_type` is REQUIRED and missing; "Authlete's own documentation tells implementations to return it" | Part 12 | The omission is confirmed. The second clause is the doc error `01-spec-matrix.md` §5.1 settled by live probe: Authlete's documentation says that and **is wrong** — it supplies no such field | `DOC_INCORRECT` / S3 |
| `expires_in` is the 24 h service default; "Part 9's 'exchanged token: 5 minutes' is the goal, not the behavior" | Part 12 | Confirmed live (`expiresIn: 86400`, `01-spec-matrix.md` §5.1) | **Accurate** |
| The `subject` field can contain a live credential | Part 12 | Confirmed; test at `…handler.test.ts:169-175` | **Accurate** |
| "There is no unit or integration test for `token-exchange-response.handler.ts`" | Part 12 | The characterization test exists — F-2 | `DOC_INCORRECT` / S3 |
| Handler line references `:29-34`, `:27` | Part 12; `AGENTS.md` deliberate-defects table (`:29-34`, `:48-55`, `:27`) | All stale — actual `:47-52`, `:66-76`, `:32`. Mechanically undetectable | `DOC_INCORRECT` / S3 |
| Module 06 Exercise 6a/6b/6c reproduce the three defects | `modules/06…/lab.md:438,475,542` | Structure matches the code and the test | **Accurate** |

## Sources consulted

- RFC 8693 §§2.1, 2.1.1, 2.2.1, 2.2.2, 3, 4.1, 4.2, 4.3, 5 and full ToC — `https://www.rfc-editor.org/rfc/rfc8693.txt`
- Authlete token-exchange page and the live `/auth/token/create` probe that refuted it — recorded in `01-spec-matrix.md` §5.1
- Vendored Authlete API spec: `docs/openapi-spec.json`, `POST /api/{serviceId}/auth/token/create` — 23 request properties enumerated above
- SDK 1.0.0: `models/tokencreaterequest.ts` (23 fields), `models/tokenresponse.ts:170-262` (`resources`, `audiences`, `requestedTokenType`, `subjectToken`, `subjectTokenInfo`, `actorToken`, `actorTokenInfo`, `assertion`)
- Live probe 2 (2026-08-10): `grant_types_supported`, `accessTokenType`, `accessTokenSignAlg` — `SERVICE-CONFIG-PROBE.md` §5–§6
- Code: `controllers/token-exchange-response.handler.ts:21-108`, `services/token.operations.service.ts:47-84`, `tests/unit/controllers/token-exchange-response.handler.test.ts:60-200`

## Proposed work items

**None of these fixes the deliberate defects.** Each either corrects a statement about them or narrows a claim
that cannot be met.

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 8693-W1 | Correct the `audience` claim everywhere it appears | S | Part 12's table, Module 06 Exercise 6b and its quiz answers state that `resource` is forwardable and `audience` has **no Authlete token-create field**, citing the 23-property request schema. The `it("drops audiences")` test gains a comment saying it can never change. |
| 8693-W2 | Delete the "Not covered by tests" section | S | Replaced by a pointer to the characterization test and what it locks. |
| 8693-W3 | Fix the stale line numbers in `AGENTS.md` and Part 12 | S | ✅ **DONE 2026-08-14 (T2-10), across four documents, and the advice in this criterion turned out to be the whole point.** The three refs are now `:47-52` (the `tokenCreateRequest` literal), **`:69-76`** (the response body — this criterion said `:66-76`, which is the `return res` chain starting three lines earlier; the `.send({…})` object is `:69-76`) and `:32`. **Every one is now paired with a content anchor**: *"the `tokenCreateRequest` literal"*, *"under the ⚠️ comment naming §2.2.1"*, *"the `const subject = result.subject \|\| subjectToken;` line"*. Fixed in `AGENTS.md`, `docs/TOKEN-EXCHANGE-TUTORIAL.md` (two sites), `modules/06…/lab.md` (two sites). `03-curriculum-audit.md`'s copies were **deliberately left** — they quote the wrong numbers *as* the defect. **Why the advice mattered:** while applying it, two *other* replacement numbers in T2-10's bundle were found to have drifted **again** since the audit wrote them (`parseBearerError` `:20-36` → `:45`, `ParSection.tsx` `:43` → `:41`). A `path:line` reference is a pointer that rots; a quoted comment is one that does not. |
| 8693-W4 | Keep all three deliberate defects | — | Confirmed against the RFC. Any change requires the full curriculum update `AGENTS.md` prescribes. |
| 8693-W5 | *(Optional, Gate 4 decision)* Forward `resources` and pass `accessTokenDuration` | M | **Retires Module 06 Exercise 6b in part.** Only with the lab, quiz-answers, Part 12 and `PROGRESS.md` updated in the same commit, per `AGENTS.md`. Listed so the option is visible, not recommended here. |

**Ordering.** W1–W3 are documentation and safe now. W5 must not be taken as pre-approved: `AGENTS.md` is
explicit that a change described in a follow-up section is not an approved change, and this file is on the
**Security-critical surfaces** list under Token issuance.
