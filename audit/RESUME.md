# RESUME — audit state, and what a fresh session must not re-derive

**Purpose.** The RFC conformance audit spans five phases and does not fit one context window. This file pins
the state so a new session resumes without re-reading the repo, re-fetching specifications, or re-probing
Authlete. Read this first; read `00-inventory.md` §11 and `01-spec-matrix.md` §5 second.

- **Last updated:** 2026-08-14 — **Tier 0 and Tier 1 complete; Tier 2 at 16 of 17 (only T2-17 remains); VCI-W6 closed.** Read §0 in full before anything else. *(The remainder of this bullet is the 2026-08-13 state, kept because its rulings still hold.)* (Gate 4 approved; **Phase 5 in progress — Tier 0 complete; Tier 1: T1-1 … T1-10 and T1-17 shipped, T1-13 closed as unachievable, T1-21 declined**, see `04-remediation-plan.md` §1.2). **T1-9 + T1-10 + 6749-W1 shipped 2026-08-13**: `/api/gm/:grantId` is now a protected resource in the same sense UserInfo is — `DPoP` accepted, the §7.2 downgrade refused, an RFC 6750 §3.1-shaped no-token challenge — every `htu` derives from `dpopHttpTarget()` so a query string no longer breaks proof validation, a caller can no longer choose the introspection `targetUri`, and dual-channel client credentials are refused at `/api/token` and `/api/par`. **Two probes rewrote that design before any code**: `/gm` checks the DPoP binding independently of the ownership introspection (`[A281305]`), and one proof serves both calls. **B1-W1 + B1-W2 + MS-W1 also shipped 2026-08-13**: `/api/jar/process` was unauthenticated and returned Authlete's whole authorization response **including the `ticket`** — a credential — plus `service` and `client`, always with status 200; it is now admin-only with an allowlist, and `jar.controller.ts` joins the surfaces list (**a DR-12 dependency settled**). RFC 9701 JWT introspection returns a signed `token-introspection+jwt` instead of **500**, the profile's only live one — and it signs with the key T1-2 registered, so an earlier ⚙️ action is what made a later code fix produce a signature. **`rsUri` is required for that path and must not be defaulted or sent unconditionally** — see `AGENTS.md`. **T1-14 + T1-15 shipped 2026-08-13 too**: `POST /api/backchannel_logout` performed **5 of §2.6's 11 validation steps** — no `iss`, no `aud`, no `iat` bound, no `sub`/`sid` presence, no `nonce` rejection — and then destroyed **`req.session`**, which is the *caller's* session, so it terminated nothing while answering 200. Both fixed and driven live against a locally-served JWKS. The `jwt.verify` rule is in `AGENTS.md` and **its second clause is the one that gets skipped**: pass `issuer`/`audience`, *and* refuse when they are unconfigured, because omitting an option silently downgrades the check. Two new settings (`BACKCHANNEL_LOGOUT_ISSUER`/`_AUDIENCE`) — **not** `JWT_ISSUER`, since there this server is the RP. **BCL-W3 and BCL-W7 rode along.** The entry is **S2 → S3**. **T1-16 + T1-18 shipped 2026-08-13**: one line (`requestBody: {}`) turned federation's **400 blaming the caller** into a **500 naming the missing configuration** — but **FED-W1's criteria cannot be met by it**, because an entity statement needs a federation JWK Set on the service (`[A316201]`), so **FED-W2 stays blocked** on a feature-enablement decision. **FED-W5 closed with no change of its own**, since the controller mapping was already right once the SDK stopped throwing — the same defect shape as BCL-W3 but a different fix, because *where the throw happens* decides which. **T1-20 shipped 2026-08-13**: `ciba.service.ts` never read `Authorization: Basic`, so the `CLIENT_SECRET_BASIC` configuration `AGENTS.md` *recommends* for CIBA could not authenticate. Three channels now, matching PAR; `appendToParams` extracted to `utils/params.ts`. Verified live — Basic reaches `USER_IDENTIFICATION`, and body credentials for that client now correctly earn `401 [A157357]` instead of being **silently converted** onto the Basic channel. **The three S1 residues are closed as documentation**: `README.md` opens with a *"Read this before you copy anything"* table of the four deliberate departures, and the feature tables carry honest statuses (FAPI 2.0 / Native SSO / Federation **Not enabled**, Backchannel Logout **Partial**, PKCE **supported, not required**). **A CI gap was found while verifying**: the client job ran `vite build` alone, which does not typecheck, so `npm run typecheck` was never invoked and **16 client test files never ran** — 4 real type errors had accumulated. Fixed, and both gates added to `ci.yml`. **1081 server tests / 73 files; 109 client tests / 16 files** (721/63 before the route-coverage backlog was drained, 969/70 before T1-19 batches 2 and 3 — see §0). **`npm run lint` was added to both CI jobs on 2026-08-14**; it had never run on either, and the client's was failing with 4 errors and 7 warnings. **TIER 1 IS COMPLETE as of 2026-08-14** — `T1-19` (all 13 items, three batches) and `T1-11` (the JAR half on 08-13, the four spec-shaped endpoints on 08-14). What remains in the plan is Tier 2's 11 open documentation items and Tier 3's decisions. **PKCE is now ENFORCED (2026-08-13) and `RFC7636-pkce.md` drops S1 → S3** — `pkceRequired` + `pkceS256Required` are `true` on `4277838306` and `2176571218`, verified live (`[A124301]` with no challenge, `[A124308]` on `plain`, `INTERACTION` on `S256`). **`1523514379` and `1678274156` stay unenforced deliberately** and must not be "fixed": Module 02 teaches the plain flow and Module 03 shows what it costs, so the lesson needs a client that still permits it — recorded in `AGENTS.md`. **Gate 4 Q1 is superseded**; it asked whether the entry stays S1 until PKCE is *actually* required, and it now is. Note §7.2's Tier 1 exit criterion is **under-specified** — it covers only the ⚙️ half of a tier titled *configuration and contained code*, and says *three* probes where T1-17 had five; fix it before using it to judge the tier complete. **T1-17 answered all five unprobed behaviours and deleted work rather than creating it**: `9449-W4` resolved *in our favour* (`/auth/introspection` enforces `cnf.jkt` with no proof — `[A065308]`), so **9449-W3 stays S2 and T1-10 is not escalated**; `7523-W1` showed Authlete refuses a no-`exp` assertion (`[A314305]`), demoting **7523-W2** to defence-in-depth; `GM-W2` works end to end with **no AS code**; `8628-W6` is substituted. Only **6749-W1** still owes a ruling — Authlete does *not* reject dual-channel credentials and the strict-checking page is silent, so the plan's "no code change if Authlete already rejects" escape does not apply. **Do not re-run these five probes.** **S1 register: 8 found, 0 remain — verified entry by entry on 2026-08-13, not asserted.** Current severities: `ERRORHANDLER-…` **closed**; `OIDC-RP-INITIATED-LOGOUT-1.0` **S4**; `RFC8628-…`, `RFC7662-…`, `RFC9470-…`, `RFC7636-pkce`, `FAPI-2.0-SECURITY-PROFILE`, `RFC9700-…` all **S3**. The last three fell on 2026-08-13 — PKCE by being enforced, the other two because `README.md` stopped claiming what was not true. The latent S1 (9470 F-3) is retired rather than downgraded. **The ⚙️ configuration block is complete.** **T1-5 shipped with DR-07 ruled and executed** — nine advertised client-auth methods → five, `service.get()` works, and both FAPI endpoints answer `200` with live values for the first time since 2026-08-06; Module 10 Ex 4 was **rebuilt, not retired**. **T1-4 is deliberately half-landed** — the 24-hour lifetime is kept on purpose (GM-W1/FAPI1-W3 open by decision). **B1-W6 is closed**: `idTokenReissuable` is now `true` and kept, because the `ID_TOKEN_REISSUABLE` branch was calling the wrong Authlete API and now calls `POST /idtoken/reissue`.
- **Repo:** `/home/blackadi/Documents/OAUTH2.0`, branch `audit/phase3-and-tier0-fixes`
- **Skill:** `.claude/skills/rfc-audit/SKILL.md` — invoke with `/rfc-audit` or follow it directly
- **Verify anything under `audit/` still resolves:** `node scripts/check-docs.mjs` — currently **167 markdown files, 103 source refs, clean**

---

## 0. START HERE — the next piece of work, and why it is that one

> ### ⏭️ NEXT: exactly ONE item remains in the whole plan — **T2-17**
>
> **Tier 0, Tier 1 and Tier 3 are complete. Tier 2 is 16 of 17.** Every decision record is ruled, every
> Authlete probe the audit owed is spent, CU-W1 is proven, and **T2-5 shipped 2026-08-14**. One documentation
> batch is left.
>
> #### T2-5 is done — and four things it learned are worth carrying into T2-17
>
> **The sweep found 5 of 15 already shipped**, as predicted, but **not the five predicted**. HSK-W2, PS-W1 and
> §2.1's outcome were marked done; **NSSO-W3 and ATTR-W3 were done but never marked**, so they read as open
> work in the only place a planner would look. **FCL-W2 and SM-W2 — which the previous version of this section
> flagged as *"check against DR-08"* — were genuinely open**, because DR-08 ruled the decision and deliberately
> left its documentation to T2-5. **"Shipped inside another item" and "recorded as shipped" are different
> facts, and only the second is visible.**
>
> 1. **A sixteenth ID was missing from the list.** **FCL-W3** (the row's implementation column) is named only
>    in DR-08 and in its own finding — cluster 29's fifteen omit it. It was the worse half of the pair: the
>    column claimed *"logout routes"* for a mechanism this repo does not serve.
> 2. **Two of the fifteen were not in `SPEC-INVENTORY.md` at all.** HAIP-W2's *"last undated Group C row"* and
>    MDL-W3's *"the inventory row"* are both `01-spec-matrix.md` §3 — neither HAIP nor mdoc appears anywhere in
>    `docs/`. **Check which table a row is in before planning the edit.**
> 3. **A criterion can be falsified by a fix, not just by drift.** ATT-W1 asked for a row saying the method is
>    *"advertised but unconfigured"* — T1-5/DR-07 had **withdrawn** it, so the row says withdrawn.
> 4. **Three rows were confirmed, not corrected** (RFC 9901's Nov 2025, OID4VP's 9 Jul 2025, both Federation
>    dates). That is recorded on purpose: a provenance pass reporting only errors cannot tell *checked and
>    correct* from *never checked*.
>
> **The `-final.html` trap was tested twice and did not fire** — Front-Channel Logout and Federation 1.1 serve
> identical documents at both URLs. The rule stays *fetch both and take the later*, not *always use one*.
>
> **The one substantive correction: "OpenID Federation 1.0 superseded by 1.1" was misleading.** Both dates were
> right. **1.1 is a split, not an upgrade** — its own abstract says it introduces no new functionality — and the
> protocol-specific half went to a *separate* Final of the same date, **OpenID Federation for OpenID Connect
> 1.1**. This repo's two federation surfaces now live in **different documents**: entity configuration is 1.1
> §9; Explicit Registration is the Connect document's. Following the old shorthand, a reviewer would search 1.1
> for a registration requirement and conclude it had been dropped.
>
> **T2-17 — the remaining documentation items**, ~40 IDs, listed on its row in `04-remediation-plan.md`.
> **Batch by file, not by ID** — that is what the row says and it is right; many touch the same three or four
> documents. Several are already closed by other work (RPL-W5, CUR-3b-W14, 6749-W1, 8693-W1/W2, 9068-W3/W4,
> CUR-3c-W13's premise), so **the first task is a coverage sweep of the list, not writing.**
>
> **And carry this from the nine Tier 2 items shipped on 2026-08-14: eight of nine had criteria that were
> WRONG, not merely vague** — see the table under *Tier 2 progress* below. The plan predates Tier 1. **Re-derive
> every value an item hands you**, including its replacement line numbers and its "already established" facts.



*(Rewritten 2026-08-14. Everything the previous version described as "next" is done and merged. Read this
before §1.)*

**Branch `audit/phase3-and-tier0-fixes` is merged to `main` (PR #47, 10 commits, `19b0cd5`).** `main` now
carries every Phase 5 fix. Render auto-deploys from `main`, so the deployment tracks it.

### What changed on 2026-08-14, and the two findings that outrank the code

**1. The live deployment had every `NODE_ENV` gate inverted.** `app.config.ts` read
`process.env.NODE_ENV || "development"` and the Render dashboard did not set it — so
`middleware/development-only.ts` never fired and **`POST /api/device/complete`, which approves a device
authorization as any subject the caller names, was reachable on the public internet.** That is RFC 8628 §5.5,
and it is the S1 this audit records as *closed*: closed **in code**, disabled by deployment configuration.

**The default now fails safe** (`|| "production"`), `render.yaml` pins it, `server.ts` warns loudly when the
resolved environment is `development`, and `tests/unit/config/app.config.test.ts` asserts *the default itself* —
the existing `development-only` tests mock the config module and so could never see which value an absent
`NODE_ENV` produces. **Verified live afterwards:** `device/complete` → `404 {"error":"not_found"}` (our gate,
*not* Authlete's `[A227301]`), `createLocalToken` → 404, HSTS present.

> **The lesson is about verification, not configuration.** The first probe of `device/complete` returned
> **404** and looked like the gate firing. The *body* said `[A227301] No record for the user code exists` —
> Authlete's `USER_CODE_NOT_EXIST`. The request had reached Authlete; the gate had not fired. **Right status,
> wrong reason.** Check bodies, not status codes, whenever a status could come from two places.

**2. This audit had been reading a different Authlete service than the public deployment.** Found by comparing
the document the deployment *serves* against the document the service *generates*. Three independent
differences — `issuer` differing by a trailing slash, different endpoint hosts, **59 members against 62** — and
the live one had **no RSA key and no `private_key_jwt`**, i.e. T1-2 and T1-3 were absent where it mattered.
**`3693555522` is canonical** (ruled 2026-08-14) and the deployment has been repointed at it. Full record:
`SERVICE-CONFIG-PROBE.md` §21.1. **Reading either document alone proves nothing about the other.**

### Authlete writes executed 2026-08-14 — do not redo

All read → write → read-back → diffed key-by-key, **0 unexpected field changes**. `SERVICE-CONFIG-PROBE.md` §21.

| Item | Result |
|---|---|
| **DR-11** | `issuer` + all 14 URL fields → `https://oauth2-0-ekh2.onrender.com`. **RFC 8414 §3.3 passes** — issuer is exactly the host, all 13 URL members sit under it. `DISCOVERY-…` F-1, `8414-W1` and **8628-W5** close |
| **DR-03** | `verifiableCredentialsEnabled: true` + `credentialIssuerMetadata`. `/vci/metadata` answers `OK` with all three §12.2.4 REQUIRED members. **`OID4VCI-1.0.md` F-1 closes; the entry drops `MISCONFIGURED`/S2 → `IMPLEMENTED_VERIFIED`/S4** |
| **DR-05** | `clientIdMetadataDocumentSupported: true` |
| clients | All four gained a Render callback, **additively** |

**Two traps recorded so nobody repeats them.** `credentialIssuerMetadata.credentialsSupported` is typed
**`string`** — a *stringified JSON object* keyed by configuration id, not an array; Authlete changed it in
December 2023 and the array form is refused with `[A126202]`. And **VCI-W2's AS half is UNACHIEVABLE**: no
`Service` property surfaces `credential_issuer` in the AS discovery document. That is the **third** criterion
naming a console change with no console field, after RPL-W4 and T1-13 — *check the field exists before writing
"set X" as a criterion.*

**VCI-W5's `UNVERIFIED` marker is retired.** With VCI enabled, `POST /vci/deferred/parse` with a bogus token
answers **`UNAUTHORIZED`, `[A375304]`** — proving the endpoint is live, that the deferred path really does
validate the access token, and that the `requestContent` this server synthesises is accepted.

> ### ⚠️ These three writes shipped WITHOUT their paired doc changes, and broke three labs
>
> Found 2026-08-14 while scoping T1-11; **fixed the same day**. `04-remediation-plan.md` requires a Tier 3
> decision to ship with its doc change *in the same commit*, and that control was not applied here.
>
> **DR-03 invalidated Module 09b Exercise 7 entirely** — four transcripts, two observations drawn from them,
> two `UNVERIFIED` markers, the module README's status row and two `SPEC-INVENTORY.md` rows. **Rebuilt from
> fresh probes, and the replacement lesson is better than the original**: not *"every VCI endpoint refuses
> because the feature is off"* but **"enabling a feature is not the same as configuring it"** — `/vci/metadata`
> returns a conformant §12.2.4 document while `/vci/jwks` and `/vci/jwtissuer` fail **`A403201`** / **`A417202`**
> for want of a **credential-issuer JWK Set**, and the codes moved `NOT_FOUND` → `INTERNAL_SERVER_ERROR`, which
> is the honest transition. **DR-05 and DR-11** invalidated two of three rows in `MCP-OAUTH-TUTORIAL.md`'s
> precondition table plus two `iss` transcripts.
>
> **The rule that failed could not have worked, and that is the finding.** `AGENTS.md` said *"grep the
> curriculum for the symptom you changed"* — **a configuration flag has no symptom string**, and you cannot
> grep for output you are about to create. `AGENTS.md` now carries the three searches that do work: the flag
> name, the vocabulary of being off, and the vendor result codes that only occur while it is off. Register
> rows in `03-curriculum-audit.md`; full record in `PROGRESS.md`.
>
> **Still open and genuinely a gap, not drift:** the credential issuer has **no JWK Set** (`credentialJwks` /
> `credentialJwksUri` unset), so `/vci/jwks` and `/vci/jwtissuer` answer 500 and no credential can be issued.
> Setting it is a service write and needs its own decision. Module 09b now documents that boundary explicitly
> rather than leaving it invisible.

### Where the work stands

**Done:** P0 (fail-safe default, `lint` added to both CI jobs, root `.gitignore` + `logs/` untracked),
P1 (the three Authlete writes), and **T1-19 — all 13 items, complete**.

**T1-19 batch 1:** 9728-W1 (PRM path-suffixed route), 9728-W2 (`bearer_methods_supported`), 9126-W3 (405 on
`/api/par`), 9470-W6 (`parseBearerError` quote-aware), B1-W4 (two echoing `default` branches), FAPI2-W4.
*Three of those were the same defect — an endpoint answering **200 with HTML** where it meant "no".*

**T1-19 batch 2 (2026-08-14):** **FAPI1-W2** — `computeFapiMode` is total over the six-member `FapiMode`
enum, so a FAPI 1.0 service is no longer reported as having FAPI **off**; `"unknown"` and `"disabled"` are
now distinct, because a mode we cannot name is not a mode nobody set. **ATTR-W1** — `attributes` was the one
`as any` in a ~40-field mapper, and a *non-array* was silently dropped, which answers 200 and stores nothing.
**BCL-W6** — the duplicate client-listing `fetch()` is gone.

> **BCL-W6 corrected a claim this audit had been reasoning from, and the correction is the durable part.**
> `AGENTS.md` said the SDK *"silently strips"* what it does not model. **True of `Service`, false of
> `Client`**: `Service$inboundSchema` is a plain `z.object`; `Client$inboundSchema` wraps itself in
> `collectExtraKeys$` and collects into `client.additionalProperties`. SDK 1.0.0's `Client` carries **104**
> of Authlete 3.0.16's **108** properties, omitting `backchannelLogoutUri`,
> `backchannelLogoutSessionRequired`, `spiffeId` and `spiffeBundleEndpoint`. Had the generalisation held,
> moving off the raw `fetch()` would have delivered logout tokens to **nobody**, silently, while answering
> 200. Found by the **compiler**, settled by parsing a fixture through the real schema, locked by a test that
> does the same. **Do not generalise one SDK model's tolerance to another.**

**T1-19 batch 3 (2026-08-14), under plan mode — and T1-19 closes here.** All three were **one defect class:
a value the caller controls, or a value nobody supplied, becoming a server assertion.** **B1-W3** —
`normalizeGrantType` ended `|| "AUTHORIZATION_CODE"`, so an unrecognised or absent grant type was not
refused but answered *wrongly*, and `grantType` is Authlete's record of what authorised the token. Now 400.
**9068-W2** — the dev JWT is now `typ: at+jwt` with all seven §2.2 REQUIRED claims; it was the only RFC 9068
specimen a learner can obtain here and it contradicted the lesson. **9101-W5** — the authorization request is
built from named fields, matching `jar.service.ts`, which calls the same Authlete API and already did.

> **Two criteria under-counted their own defect, and that is the transferable finding.** B1-W3's named three
> map additions, but **`CIBA` had no entry at all** — a missing *grant type*, not a missing URN — and
> `as GrantType` at the call site is why it survived: **a cast is not a type, it is a promise nobody
> verifies.** Dropping it made the compiler find the tenth member. And 9068-W2's ordering note exempted
> itself from plan mode by judging the *file* (`createLocalJWT.ts`, not listed) rather than the call chain,
> which runs through `token.operations.service.ts` **and** `token.management.controller.ts`, both under
> **Token issuance**. *The trigger is the concern, and the concern travels with the parameter.* An earlier
> revision of this file had inherited that misgrouping.
>
> Two by-products. 9068-W2 found **two query parameters `openapi.routes.ts` advertised and the controller
> dropped** (`acr`, `authTime`) — a fourth site for the *advertised-but-unusable* theme, found by reading the
> spec entry beside the code rather than either alone; an unparseable `authTime` now stamps **no** claim,
> because `Number("")` is `0` and that would record the Unix epoch as an authentication time. 9101-W5 removed
> an unnamed `req.query` mutation nothing read.

**A gap in the record, now closed:** the 2026-08-14 work *before* batch 2 — P0, P1, T1-19 batch 1 and
FAPI2-W4 — had landed with **no `PROGRESS.md` Build Log entry**, so the resume state jumped from 2026-08-13
straight to batch 2. Backfilled 2026-08-14 **from the commits** (`3725a76`, `dd7c1cd`, `ecfab07`, `960fcd6`,
`3d0a736`) rather than from this file, so it is not a paraphrase of a summary.

### Tier 2 progress, 2026-08-14 — **16 of 17 done; only T2-17 remains**

**Nine items shipped on 2026-08-14 in one session**: T2-1, T2-11, T2-4, T2-12, T2-8, T2-10, T2-15, T2-16, T2-14
(plus VCI-W6, which was not a Tier 2 item). Each has its own note below and a `PROGRESS.md` Build Log entry.

> ### The one pattern that repeated in every single item, and should shape how T2-5 and T2-17 are approached
>
> **A Tier 2 acceptance criterion is stale until you re-derive it.** The plan was written before Tier 1 ran, and
> Tier 1 changed the deployment underneath it. Count for this session alone:
>
> | Item | What its criteria got wrong |
> |---|---|
> | **T2-1** | four of nine tutorials called "unreproducible" had become **runnable** (T1-6 ×2, T1-3, DR-05) |
> | **T2-12** | prescribed **FAIL**; the answer is **PARTIAL**, because T1-2 added `PS256` and the algorithm is per client |
> | **T2-10** | **three of five** replacement line numbers had drifted *again* before anyone applied them |
> | **T2-15** | 9101-W4's *"symmetric-only"* was false (T1-3); 8628-W5 was already closed (DR-11) |
> | **T2-14** | both remaining fetches **contradicted the audit**, not the curriculum; and a criterion's own `<thinking>` had a MUST as *"should"* |
> | **T2-11** | *"everywhere"* was four locations; there were **five** |
> | **T2-8** | theme 2 had inverted — the defect was no longer a false claim but an **absent** one |
> | **T2-16** | HSK-W2 asked for a `docs/` page that should not exist |
>
> **Eight of nine.** The only item whose criteria survived intact was T2-4, and even there the *inventory* it was
> told not to edit had a wrong date. **Probe first, every time** — and when an item hands you a replacement value,
> re-derive that too.

### Tier 2 progress, 2026-08-14 — 7 of 17 done

**T2-1 is done — the highest-leverage single item in the plan, and its premise had rotted in the *good*
direction.** 5 `UNVERIFIED` markers across 3 tutorials → **29 across 9**. Three labels — **captured** /
*illustrative* / **`UNVERIFIED`** — defined **once** in `docs/README.md`, with each tutorial carrying only its
own facts, so nine near-duplicate boxes cannot drift apart. **None of the three words was coined**:
`UNVERIFIED` is the curriculum's, *illustrative* is FAPI2-W6's own acceptance criterion, and **captured** is
`TOKEN-EXCHANGE-TUTORIAL.md`'s existing *"what this server actually returns (captured 2026-08-06)"* — that
file already had the convention and batch 3c graded it exemplary, so the convention was never really *"three
files away in the curriculum"*: there was an in-tutorial precedent nobody had generalised.

> **Batch 3c's reproducibility table was stale in four of nine files, every one of them now *runnable*.**
> T1-6 registered `payment_initiation`, so RAR's three "cannot have been produced" transcripts come from the
> live 2026-08-12 round trip instead; T1-6 also set `bcDeliveryMode = POLL`, so CIBA runs; T1-3's
> `private_key_jwt` client makes half of FAPI Part 4 runnable; DR-05 enabled CIMD. **Writing
> "unreproducible" from the audit's own table would have been wrong four times** — which is why the probe
> came before the prose. Only **Native SSO** is still wholly unrunnable (`nativeSsoSupported = false`), and
> it is the one file marked that way throughout.

**Three defects surfaced that no work item had named**, all found by checking a transcript against live
configuration rather than by reading it:

- **`CIBA-TUTORIAL.md`'s every worked example 401s against the configuration the tutorial tells you to
  build.** Part 2 recommends `CLIENT_SECRET_BASIC`, citing Authlete's own guide; the one client here with
  `bcDeliveryMode` set is that; and the examples all passed credentials in the **body**, which earns
  `[A157357]` for the *channel* before the secret is examined. That also means Part 6's *"Wrong Client
  Secret"* demo **passed for the wrong reason** — a negative test that cannot distinguish a wrong secret from
  a wrong channel is not a test.
- **`RAR-TUTORIAL.md` carried a PAR response shape that never existed** — `{"action":"CREATED",
  "request_uri":…}`, half Authlete's envelope and half RFC 9126 §2.2's body. A T1-11 residue: the pass that
  fixed six tutorials did not reach a seventh file that quoted PAR incidentally. **When a wire format
  changes, grep for the *shape*, not just for the endpoint's own tutorial.**
- **`MCP-OAUTH-TUTORIAL.md` told you to set `resourceIndicatorsSupported`, which is not an Authlete field** —
  no `Service` property in 3.0.16 matches `resource` except `resourceSignatureKeyId`, and the string appears
  nowhere in the vendored OpenAPI document. **The fourth instance** of a documented "set X in the console"
  with no X, after RPL-W4, T1-13 and VCI-W2's AS half. Struck through rather than deleted, so nobody re-adds
  it.

**Six stale literals went with them**: five `expires_in: 3600` where `accessTokenDuration` is **86400**, and
PAR's `expires_in: 90` where `pushedAuthReqDuration` is **600**. **T2-1 also discharged four other IDs** —
9396-W4, FAPI2-W6 ⊃ 9126-W5 = CUR-3c-W7 (cluster 22, the `/api/authorize` path in two files), and the
tutorial halves of 9126-W6 and CIBA-W5, whose `AGENTS.md`/Module 05 halves stay in T2-15. **FAPI2-W6 had no
tier row at all** — it was reachable only through §5.2's cluster list, so the plan's mechanical coverage check
counted it without ever scheduling it. Worth knowing that the check can do that.

### Tier 2 progress, 2026-08-14 — the first six

**Shipped:** **T2-2** (Module 10 taught the *fixed* logout open redirect as live — rebuilt mechanism-first
around the fix's three-version history, since the first fix was correct *and insufficient*) · **T2-3** (the
grep rule, **extended to configuration changes**, which have no symptom string) · **T2-6** (all three
`sd-jwt.mjs` items) · **T2-7** (`check-docs` learns four reference forms) · **T2-9** (`errorStatusFrom`
exported) · **T2-13** (the 60s/60min error — **it was in three files, not one**).

> **`check-docs.mjs` went from 103 validated references to ~1,400**, and found three real defects on its first
> runs: two prose pointers **past end-of-file** in Module 05's README, ~~`PUT /api/client/:clientId`~~ in two
> documents where the route is `PATCH /api/client/update/:clientId` (wrong **method and path**), and five refs
> to a `pkce.ts` path the audit had already corrected. **The last class is the instructive one**: a checker
> validating every path mentioned cannot distinguish *"here is a path"* from *"here is a path that was
> wrong"* — and **CUR-3a-W1's own acceptance criterion is an instance of the defect it specifies.** Solved two
> ways: a small annotated allowlist for file paths, and `~~strikethrough~~` for endpoints, which is better
> because the document declares its intent at the point of use. **465 context-relative `file.md:NNN` refs
> remain unverifiable** and the count is printed on every run so nobody assumes otherwise.

> **`sd-jwt.mjs` had three defects while `AUDIT-PASS-A.md` recorded it "CLEAN, 0 defects"** — and the worst
> was a *security* defect: omitting the trailing tilde made the last Disclosure be reclassified as a KB-JWT
> and dropped, so a malformed credential was **ACCEPTED with a claim silently missing**. Every later step
> passed honestly, and `7.1/1` — the step that separates the SD-JWT into its parts — was hardcoded `PASS`.
> **A step that cannot fail is not a check.** Now fixed structurally (a KB-JWT is a JWS with dots; a
> Disclosure has none, so the omission is *detectable* rather than suspected), taught as Break 5d-bis, and
> locked by **12 CLI-level tests** — the script's first ever. Its justification is one line: CUR-3c-W4's fix
> broke a lab command I had added minutes earlier, and only *running* it showed that.

**Tier 2 remaining (1):** T2-17. *(T2-5 shipped 2026-08-14 — see §0.)*

**T2-14 shipped 2026-08-14, and it spent the audit's last two fetches — both of which went against the audit.**

| Fetch | Result |
|---|---|
| **RFC 9101 §10.1** (CUR-3b-W12) | *"Choice of Algorithms"*, and it carries **verbatim** the MUST-be-signed sentence Module 05 attributes to it. The Phase 2 entry's mapping to §6.2 (*"JWS-Signed Request Object"*) was the incomplete one. §10.8 *"Cross-JWT Confusion"* exists, settling claim 9 |
| **RFC 8252 §7.3** (8252-W1) | *"Loopback Interface Redirection"*, and the requirement is a **MUST** — *"The authorization server MUST allow any port to be specified…"* — where the entry's own `<thinking>` block said **"should"**. Verdict `IMPLEMENTED_VERIFIED` stands and is now stronger; the *source gap* note is closed |

> **A by-product neither item predicted closed CUR-3b-W3.** Asking the same document where the *precedence* rule
> lives established that it is **§6.3** (*Request Parameter Assembly and Validation*), that the phrase occurs
> **exactly once** in RFC 9101, and that **the repo's quotation carried an extra word** — the RFC says *"the
> parameters in the Request Object"*, not *"the parameters **included** in"*. Module 05's **lab had it right and
> its README did not**, so the lesson and the lab disagreed for a fortnight and the lab was correct. **§5 is
> where a request is *passed*; §6.3 is where the server *assembles and validates* it** — which makes the right
> section memorable rather than arbitrary.

**Two other items reached files their criteria could not have named.** 9470-W4's two code comments include
`utils/step-up.ts`, which **T1-7 created** after the item was written; both edits are **comment-only**, so
`session.controller.ts`'s plan-mode requirement does not apply (`CLAUDE.md` exempts a semantics-free edit). And
CUR-3b-W7's introspection fix, in T2-10, reached the step-up tutorial's appendix.

> **9449-W5 is the one with a live consequence.** RFC 9449 **§8 gives the AS `400 use_dpop_nonce`** and **§9
> gives a resource server `401`** — and `AGENTS.md` documented **401 for both**. A client that retries only on a
> 401 never retries at the token endpoint, so the wrong status does not merely mislabel the error, **it stops
> the nonce dance from ever starting**. Also corrected: a stale nonce is refused with `use_dpop_nonce`, not
> `invalid_dpop_proof`. None of it is exercisable here (`dpopNonceRequired` is `false`), and the bullet now says so.

**T2-16 shipped 2026-08-14 — all six items, and the *"one edit for all three"* instruction was right.**
`SPEC-INVENTORY.md` gains **one new section**, *Vendor features — implemented here, defined by no
specification*, carrying HSK, parameterized scopes and `attributes` together, and stating why they belong in a
specification inventory at all: **the most useful thing to know about each is that there is no RFC to check it
against.** `docs/API.md` gains the four HSK endpoints, the `attributes` shape, and a table naming what *no
scope management* blocks. **One deliberate departure**: HSK-W2 asked for a separate `docs/` page and did not get
one — four endpoints nothing else consumes do not need a page; promote it if HSK gains a consumer.

> **PS-W2 turned out to be the interesting half, and it earned a table rather than a sentence.** Module 09a's
> taxonomy had three states — *supported but not required*, *permitted but not configured*, *advertised but
> unusable* — and all three describe a capability that **is listed** and delivers less than the listing implies.
> **Parameterized scopes are the inverse.** Authlete accepts `payment:123.50` against a registered `payment:.*`
> and returns the granted value in `dynamicScopes`, but `scopes_supported` can only list **literal** strings —
> there is no metadata member for a pattern. So **a client that discovers this AS correctly can never use the
> feature, and a client that hardcodes the value can**, which inverts the advice every other module gives.
> In a capability matrix it does not look like a green tick; **it looks like the feature is absent.** The new
> table's last column names what misreading each state costs, which is what makes the four legible together.

**T2-15 shipped 2026-08-14** — its tutorial halves rode along with T2-1, and the rest landed here. Module 05
gains a **four-row table** separating what runs from what does not, and the pattern in it is the transferable
part: **PAR is conformant on the way out and non-conformant on the way in.** Reading only the response tells you
nothing about whether a conformant client could have reached the endpoint. `AGENTS.md`'s CIBA paragraph now
states both §7.1 and §7.3 departures and cross-references the two siblings, so theme 3 reads as one finding.

> **Two of the five criteria were stale.** **9101-W4** said *"object signing symmetric-only until W3"* — W3
> shipped 2026-08-12, so JAR **by value** now runs *asymmetrically* against `2176571218`'s ES256 key; only
> **by reference** is unavailable. And **8628-W5** was already closed by DR-11. That is the fourth, fifth and
> sixth stale criterion this session: see also T2-12's FAIL, T2-10's three line numbers, and CU-W2's phantom
> dependency. **Assume a Tier 2 criterion is stale until re-derived** — the plan was written before Tier 1 ran.

> **7592-W3 is the sharpest of the five and worth reading if you touch DCR.** Every RFC 7592 *operation* is
> reachable and **none of its HTTP surface is**: no per-registration client configuration endpoint, no
> `GET`/`PUT`/`DELETE`, no `registration_client_uri`; four `POST` routes taking the registration access token in
> a JSON body. It sits directly beside the RFC 7591 half that **was** fixed on 2026-08-14, which makes the pair
> easy to misread as done. `SPEC-INVENTORY.md` now says both: **the body is conformant, the endpoint is not.**

**T2-10 shipped 2026-08-14, and the item's own advice was the finding.** The plan noted *"prefer anchoring on
the ⚠️ comment text — these have drifted once already."* **Three of the bundle's replacement numbers had drifted
a second time, before anyone applied them:**

| Item's correction | Actual, 2026-08-14 | Why it moved |
|---|---|---|
| `parseBearerError` at `:20-36` | **`:45`** | T1-1's auth gate and the DPoP-nonce relay grew the controller |
| RFC 9470 branch at `:81-97` | **`case "FORBIDDEN"` at `:142-167`** | same |
| `ParSection.tsx:43` (the PKCE write) | **`:41`** (read back at `:34`) | the component shifted by two lines |

**Every reference fixed now carries a content anchor** — *"the `tokenCreateRequest` literal"*, *"the
`case \"FORBIDDEN\"` branch"*, *"written there; read back at `:34`"* — so the next drift leaves them findable
rather than silently wrong. **CUR-3c-W12 was closed by deleting its numbers rather than correcting them**: T2-1
and T2-11 had already invalidated `:391` and `:182-183`, so seven tutorial citations across two findings now
name a **section**, which is `04-remediation-plan.md` §6.3's option (b) applied to findings instead of to
`PROGRESS.md`. **CUR-3b-W4 turned out already satisfied, by deletion** — Module 05 carries no
`dpop.service.ts:NNN` reference at all now, which is more durable than renumbering a file that had drifted
twice. One ref no item had named: `STEP-UP-AUTH-TUTORIAL.md`'s appendix cited `:114`, the *validation-error*
branch. `03-curriculum-audit.md`'s copies were deliberately left — they quote the wrong numbers **as** the defect.

> **The rule worth carrying: never cite a line number in a file you are actively rewriting.** A section heading
> survives insertion above it; a line number does not. And when a work item hands you a replacement number,
> **re-derive it** — three of five here were wrong.

**T2-8 shipped 2026-08-14, and theme 2 had drifted in the direction nobody was watching.** The finding was
*"four features claimed as working while their service flag is off"* — Native SSO, FAPI 2.0, VCI, MCP/CIMD. Two
of the four have since been switched **on** (VCI via DR-03 + VCI-W6, CIMD via DR-05), so the live defect was no
longer a false claim but **an absent one: `README.md` had no VCI row and no MCP row at all.** A feature missing
from the table cannot be caught by re-reading the table.

Both rows added — VCI **Working** with *issuance needs a wallet this repo does not contain*; MCP/CIMD
**Partial**, because CIMD works while MCP end to end does not (OAuth 2.1's first MUST is that the AS reject
`implicit` and `password`, and both are enabled here deliberately, plus there is no `registration_endpoint`).

> **The deliverable is the derivation, not the rows.** A note under the table names the five service fields the
> statuses depend on, gives the read-only command that prints them, and records the captured values with a date.
> **The command was run before being published** and prints exactly what the prose quotes — it emits `<set>`
> rather than `credentialJwks` itself, because that field holds a private scalar, and uses `json.dumps` so
> booleans read `false`/`true` rather than Python's `False`/`True`. **Deliberately not a CI check:** a service
> configuration change is not a reason to fail somebody's pull request, the same argument that schedules
> `--links` weekly. **§7.3's discovery-diff check is still unbuilt** and is the only proposal in the plan that
> would have caught a defect before this audit did — worth doing if Tier 3 leaves budget.

**T2-4 and T2-12 shipped 2026-08-14, and both corrected the audit's own criteria rather than the curriculum's
text.** T2-4 applied §2.1's four fetches to Module 00 (**RFC 9846** leads, RFC 8446 named as the superseded
number, RFC 9110 sharpened to **Internet Standard STD 97**) — and found `SPEC-INVENTORY.md`'s RFC 9864
annotation wrong **twice**: dated **Oct 2025** against a verified **Dec 2025**, and scoped to RFC 7518 where the
header block says **7518, 8037 and 9053**. *A date carried from recall, in the file whose entire job is citation
provenance* — which is the argument for T2-5's per-row "URL fetched + header line read" discipline, and T2-5 is
the next item.

**T2-12's criteria were stale twice over.** They said Module 10's missing §5.3.2.1 signing row should read
**FAIL**; §2.2 had already recorded `ES256` as advertised, and **T1-2 then added `PS256`**, so the live list
carries *both* permitted algorithms. The row is **PARTIAL**, because `idTokenSignAlg` is pinned **per client** —
`ES256` on three, **`HS256` on `1523514379`**, the client the labs use.

> **The generalisation, and it belongs in any conformance work that follows:** a report written from discovery
> metadata alone scores that row **PASS**. Roughly half of FAPI §5.3.2's `shall` statements bind the **AS**
> (metadata, code lifetime, `iss`); the rest bind a **client configuration** (`tokenAuthMethod`,
> `pkceRequired`, `dpopRequired`, `idTokenSignAlg`), and `/.well-known` cannot see those. Module 10's Exercise 7
> now separates **PARTIAL** / **NOT REACHABLE** / **NOT EVIDENCED** as three distinct reporting errors.

**T2-11 shipped 2026-08-14 — and "everywhere" was five locations, not the plan's four.**
`STEP-UP-AUTH-TUTORIAL.md`'s Part 1 diagram arrow and both Part 5 transcripts, Module 09a's *"❌ 403 for a
step-up requirement"* entry, and **`docs/DATA-FLOWS.md`**, which drew `RS-->>C: 403 Forbidden` carrying the
challenge and had never been checked for it — recorded as the new **9470-W7**. It was missed because F-1
searched the tutorial, batch 3c searched the nine tutorials and batch 3b searched the modules, and a top-level
architecture document that redraws every flow in the repo is none of those three.

> **The rule that finds the next one: a defect stated as *a status code on a particular arrow* recurs wherever
> that arrow is drawn.** Grep the *shape* — `insufficient_user_authentication` beside a status — across `docs/`
> rather than auditing document by document. Doing that also confirmed three places have it **right**:
> `GLOSSARY.md` says 401, and `API.md` and `StepUpSection.tsx` describe the *introspection* 403, which is
> correct.

**No code changed, and that was the finding's own instruction.** `introspection.controller.ts`'s 403 is the
**AS → resource server** response, where Authlete's action is `FORBIDDEN` and 403 is a defensible mapping for
a vendor introspection API. RFC 9470 §3's challenge is the **resource server → client** response and must be
**401** — and this repo implements no resource server, so it never sends one. The defect was always the
*conflation*, which is why Part 5 now prints both responses side by side with a boundary table, and the
client-action table is split: `acr_values`/`max_age` hang off the 401, `acr`/`auth_time` are labelled
*Response 1 only*.
**T2-15 and T2-17 are each one item lighter** — T2-1 took the tutorial halves of 9126-W6 and CIBA-W5, and
`docs/README.md` gained the two index rows CUR-3c-W14 wants for `STEP-UP-AUTH-TUTORIAL.md` and
`MCP-OAUTH-TUTORIAL.md` (the `TICKET-PARAMETER.md` / `AUDIT-PASS-A/B.md` / `CHANGELOG.md` rows are still owed).
**Do T2-11 next if you want the cheapest win**: it is the step-up 403→401 correction, and
`STEP-UP-AUTH-TUTORIAL.md` was deliberately left carrying its wrong challenge status so that T2-11 remains one
reviewable change rather than being half-absorbed here.

### ✅ Was blocked on the operator — now closed

**VCI-W6 — the credential-issuer JWK Set. ✅ CLOSED 2026-08-14, verified live, not assumed.** The operator set
`credentialJwks` on service `3693555522`: one EC P-256 key, `kid: vc-issuer-1`, `alg: ES256`. All three checks
this file was carrying as owed now pass, against the live deployment:

| Check | Result |
|---|---|
| `GET /api/vci/jwks` | **200** — was 500 `A403201` |
| `GET /api/vci/jwtissuer` | **200** — was 500 `A417202`; returns the same key set wrapped in an `issuer` |
| **only the public half is published** | ✅ members are `alg,crv,kid,kty,use,x,y`; **`d` absent on both endpoints** |

**The third check is the one that needed doing properly, and it was done by parsing the body.** The stored
service value contains the private scalar `d` — it must, since the issuer signs with it — and Authlete strips it
on the way out. A JWKS endpoint that echoed `d` would publish the key every credential it ever signs is verified
against **and would still answer 200**. Asserting on `d`/`p`/`q`/`dp`/`dq`/`qi`/`k` is the check; the status code
is not.

**Module 09b Exercise 7 was rebuilt a second time, and is better again.** The two-state *"enabling a feature is
not the same as configuring it"* lesson becomes **three dated states of the same three endpoints** — `NOT_FOUND`
(feature off) → `INTERNAL_SERVER_ERROR` (`A403201`/`A417202`, on but keyless) → `200` — with each transition
naming a *different* missing value, which is the argument for reading vendor codes rather than HTTP statuses.
The tagline gains its third clause: *…and configuring it is not the same as configuring it safely.* Two smaller
consequences worth keeping: the exercise's own probe loop now prints the **same** value for all three endpoints,
so the lab says plainly that **a probe that cannot distinguish its inputs has stopped being a measurement**; and
`README.md`'s status row plus a `SPEC-INVENTORY.md` row moved with it.

> **Closing the gap improved a diagnosis instead of deleting one, which is the transferable part.** The
> `UNVERIFIED` marker on *issuing an actual credential* used to blame the missing JWK Set — and that was
> **hiding the fact that nothing else was missing**. Issuance now needs only a **wallet this repo does not
> contain**. *"Runnable, with a client we do not have"* is a weaker claim than *"blocked by configuration"* and
> a far more useful one: it tells a reader what to build rather than what to switch on. A blocked marker hides
> everything behind it.

*(The `service/update` refusal this entry used to describe still applies to any **new** write from this
environment — reads succeed, which is how all of the above was probed.)*

**P0's two operator actions are CLOSED — verified live 2026-08-14, not assumed.** They were carried as "still
owed" and both had already resolved:

| Check | Result |
|---|---|
| `Strict-Transport-Security` on `/api/health` | **present** (`max-age=31536000; includeSubDomains; preload`) — production only |
| `POST /api/device/complete` | **`404 {"error":"not_found"}`** — *our* gate, **not** Authlete's `[A227301]` |
| `GET /api/token/createLocalToken` | **404** |
| `GET /api/.well-known/openid-configuration` | **64 members**, `issuer = https://oauth2-0-ekh2.onrender.com` |
| `GET /api/fapi/config` | live values — so `service.get()` works |

So **`NODE_ENV` is effectively `production`** — the fail-safe default (`|| "production"`) did it, and
`render.yaml` pins it as a second layer — and **the `AUTHLETE_BEARER_TOKEN` is valid**, since discovery and
`service.get()` both succeed. The device-complete oracle is closed by the gate itself rather than by a broken
token, which is the outcome P0 was aiming for. Setting `NODE_ENV` in the Render dashboard explicitly is now
belt-and-braces, not a requirement. **Re-check with the five probes above rather than trusting this table.**

### ✅ TIER 1 IS COMPLETE — T1-11 and CU-W2 shipped 2026-08-14, under plan mode

**T1-11.** `/api/par`, `/api/device/authorization`, `/api/client/dcr/*` and `/api/vci/deferred/issue` now
return the **specification's** body via `sendSpecBody` (`utils/http-utils.ts`), not Authlete's envelope.
Three of that helper's four rules are about when *not* to apply the pattern: the envelope stays as a
**fallback**; error bodies go through it too (that is the RFC's error object); an endpoint with **no spec
shape** keeps the envelope — **only `DeviceAuthorizationResponse` has a `responseContent` member**, so
applying it to all three device endpoints would have sent `undefined`; and **one of the four is not JSON** —
`/vci/deferred/issue`'s is a `WWW-Authenticate` **challenge string**, which RFC 6750 §3 puts in the header.
*"Return `responseContent` as the body"* is the wrong instruction for exactly one of them. SPA (five sites in
`ParSection.tsx`, not the one the audit named), six tutorials and two labs moved in the same commit —
including two shell extractors that would have silently produced empty strings. `modules/05…/README.md` was
**ahead** of the code and is now correct rather than broken.

**CU-W2, and its criterion was wrong.** It said *"conditional on CU-W1"* — the unrun live proof that Authlete
replaces rather than merges. But **preserving unnamed fields is a no-op if Authlete merges and prevents data
loss if it replaces**, so the code is correct either way and an S2 sat open behind a dependency it did not
have. `update()` is read-modify-write now. The criterion's suggested `additionalProperties` plumbing is also
unnecessary: `Client$inboundSchema` collects unmodelled members and `ClientInput$outboundSchema` **spreads
them back**, so the two are a matched round-trip pair and all four unmodelled properties survive untouched —
asserted directly in `tests/unit/services/client-roundtrip.test.ts`, because if either half changed this
method would delete `backchannelLogoutUri` from every client it touched.

**CU-W1 is closed — proven 2026-08-14, and the answer reframes the finding.** Authlete **REPLACES**. On a
throwaway client, **0 of 15** fields survived an update whose body carried only `clientId` and a changed
`clientName`. Twelve cleared or zeroed. **Two reset to Authlete's non-empty defaults, and one is a security
posture:**

| Field | Was | After an update that omitted it |
|---|---|---|
| **`tokenAuthMethod`** | `CLIENT_SECRET_BASIC` | **`NONE`** — the client stops authenticating at all |
| `idTokenSignAlg` | `ES256` | `RS256` |
| `pkceRequired` / `pkceS256Required` | `true` | `false` |

> **So the defect was never "data loss".** Before CU-W2, renaming a client through the admin surface could have
> turned a confidential client into one requiring **no client authentication**, withdrawn its PKCE requirement,
> and answered **200** with nothing in the log. *"Resets to defaults"* is the accurate phrasing, and for
> `tokenAuthMethod` the default is the weakest available value. This is the strongest argument for CU-W2's
> read-modify-write, and worth recording even though the code was already correct under either answer.

**Two process notes.** Authlete's `client/delete` requires the **`DELETE`** method — `POST` gives **405**, and
the probe's first cleanup silently failed on exactly that, leaving the throwaway client alive until a second
pass removed it. *Verify a cleanup ran.* And all four real clients were re-listed afterwards and are identical
to the pre-probe snapshot.

### ✅ TIER 3 IS COMPLETE — all 19 decision records ruled, 2026-08-14

**No decision is outstanding.** `05-decision-records.md` opens with a status table; the shape is **four enabled,
nine declined, one deferred, one defect kept on purpose, one deliberately unrecorded**.

**None of the remaining rulings needed an Authlete write** — DR-02 and DR-04 are *do not enable*, DR-06 is
document-only, DR-08 declines, DR-09 defers, DR-10 keeps, DR-12 is a doc edit. The service writes were all in
DR-03/05/07/11, which shipped earlier. **Worth knowing before planning a Tier 3 session: "take the decisions"
was mostly a writing task, not a configuration one.**

**Four items of real work shipped with the rulings**, each in the same commit as its decision per `AGENTS.md`:

| Item | What landed |
|---|---|
| **DR-12** | `middleware/errorHandler.ts` under a **new** row, *Failure disclosure & status derivation* — with its three grounds written into `AGENTS.md`, because a filename does not explain why a generic middleware is listed. Plus `jwt-verification.service.ts` and `introspection-standard.controller.ts`. `jar.controller.ts`'s conditional had already resolved (B1-W2). **`fapi.controller.ts`'s decline is now explicit** — an exclusion that is only implied is one somebody will undo |
| **DR-10 / 8693-W1** | `resource` and `audience` look identical from outside — both dropped, both no `aud`, both 200 — but `TokenCreateRequest` **has `resources` and no audience field at all**. One drop is a *choice*, the other a *vendor boundary no fix can cross*. Verified against the SDK model; the test comment now says the `audiences` case can never legitimately change |
| **DR-10 / 8693-W2** | *"Not covered by tests"* — true when written, false since — replaced by why a **characterization** test beats one asserting the fix: a test of the *correct* behaviour fails today and gets deleted; a test of the *current* behaviour fails when somebody changes it and names the docs to update |
| **DR-09 / 9068-W3** | Module 04 separates **audience restriction (runnable here, via introspection)** from **self-contained tokens (not runnable)** — and states they are *orthogonal*: you can audience-restrict an opaque token, and you can issue a JWT with no `aud` |
| **DR-06 / FAPI1A-W4** | Module 08's `c_hash` exercise continues into **`s_hash`** — a runnable hash computation, the three-way `at_hash`/`c_hash`/`s_hash` table, and why it is the *only* FAPI 1.0 Advanced behaviour observable here. Also what it does **not** mean: one emitted claim is not a profile |

> **The ruling most likely to be undone by accident is DR-08.** Session Management, Front-Channel Logout,
> back-channel logout's `sid` mode and Native SSO's `sid` (DR-04) share **one** prerequisite — durable OP session
> identity — so building it for any one consumer reopens all four. Treating them as four independent gaps was the
> mistake Phase 2 corrected.

**Then, in order:** **P4** Tier 2's 17 documentation items,
**T2-1 first** (the `UNVERIFIED` convention across nine tutorials — six S2s collapse into one writing task) ·
**P5** the remaining Tier 3 decisions (DR-02 qualify-don't-enable, DR-04 don't enable, DR-06/08/09/10/12 and
the seven standing declines) plus **`CLIENT-UPDATE-FIELD-LOSS`**, which I recommend fixing: `buildClientInput`
names ~40 of the `Client` schema's 108 properties against a **replace-semantics** API, so an admin `PATCH`
silently clears the rest.

**Current baselines:** **1081 server tests / 73 files**, **109 client / 16**, server lint **4 pre-existing
warnings** (client lint clean at `--max-warnings 0`), `check-docs` **167 files**, route coverage **92 routes,
empty baseline**.

## 1. Phase status

| Phase | Output | Status |
|---|---|---|
| 0 — cartography, version pin | `audit/00-inventory.md` | ✅ complete, Gate 0 approved |
| 1 — specification matrix | `audit/01-spec-matrix.md` | ✅ complete, Gate 1 approved |
| 2 — per-spec deep audit | `audit/02-findings/` — **55 files** | ✅ **complete**, all batches B1–B7 approved at Gate 2 |
| 3 — curriculum audit | `audit/03-curriculum-audit.md` | ✅ **complete** — 3a, 3b, 3c, 3d all written |
| 4 — synthesis + remediation plan | `audit/04-remediation-plan.md`, `audit/05-decision-records.md` | ✅ **complete** — awaiting Gate 4. **§8 below is superseded by those two files** |
| 5 — execution | code + docs | 🔨 **in progress** — Gate 4 approved. **Tier 0 complete: T0-1, T0-2, T0-5, T0-6 (2026-08-11), T0-3, T0-4 (2026-08-12). Tier 1: T1-1 … T1-7 (2026-08-12), the ⚙️ block complete; T1-13 closed as unachievable.** RFC 9700 S1 closed; `id_token_hint` verified so **BCL-W5 is unblocked**; §2's confirmation MUST met; §3's per-client matching shipped as far as the vendor permits. The logout entry is **S1 → S4** and all five RPL items are closed. **T1-1 closed the last easily-exploitable open S1**; **T1-7 retired the latent one.** Three S1s remain, all non-exploitable and all now **narrower than their entries**: `FAPI-2.0-…` (the false attestation is gone; open on `README.md`'s claim), `RFC7636-pkce.md` (the false report is gone in both halves; open on the unenforced control), `RFC9700-…` (open on F-2's ROPC framing alone). **T1-5 closed the last of the false-reporting halves** by making `service.get()` work — see `SERVICE-CONFIG-PROBE.md` §17. |

> **Phase 4 output, and what it settled.** Read [`04-remediation-plan.md`](04-remediation-plan.md) first — its
> §1.1 supersedes §6 below, and its §2 supersedes §8.3.
>
> - **All three §8.3 verification items are closed.** **CUR-3d-W1**: RFC 9846 exists (Standards Track, July 2026,
>   obsoletes RFC 8446) — `SPEC-INVENTORY.md:42-50` was **right**; Module 00 is the stale file. RFC 9110 confirmed
>   (Internet Standard, STD 97, Jun 2022); RFC 9864 is a new row. **ATT-W5**: `challenge_endpoint` and
>   `client_attestation_pop_methods_supported` both **ABSENT**, and the same 62-member response corroborated
>   **nineteen** other findings. **AM-W2**: both attacker-model URLs serve the same Final 22 Feb 2025 document —
>   no superseded version exists.
> - **S1 register: 8 found / 3 downgraded / 5 open**, each re-verified against the working tree. **Two entries in
>   `02-findings/` still describe pre-fix code** — `RFC8628-…` and `OIDC-RP-INITIATED-LOGOUT-1.0.md`.
> - **Work items: 280, not ~120.** Reconciled into 55 numbered actions across four tiers; coverage checked
>   mechanically, so every ID is accounted for.
> - **`AGENTS.md` surfaces (§5.3): three of four landed**, not two. Only `middleware/errorHandler.ts` is open —
>   decided in **DR-12**.
> - **All five EH items are closed** (W1–W5), not three.
> - **Do not re-probe Authlete and do not re-fetch** the four specs in the plan's §2.1. Two fetches remain in the
>   whole audit: **CUR-3b-W12** (RFC 9101 §10.1) and **8252-W1** (RFC 8252 §7.3).

**61 markdown files under `audit/`** — 6 top-level plus 55 findings. *(The pre-Phase-4 figure read 58; the
actual count was 59. Corrected here rather than carried.)* Verdict spread across Phase 2: 20 `PARTIAL`, 10 `MISCONFIGURED`,
7 `IMPLEMENTED_VERIFIED`, 4 `DOC_ONLY`, 4 `ABSENT`, 4 `OUT_OF_SCOPE`, 2 `IMPLEMENTED_UNVERIFIED`,
2 `CODE_ONLY`. Severities: **8×S1, 20×S2, 17×S3, 11×S4**.

Phase 3 additions (S1/S2/S3/S4): 3a **0/0/2/5** · 3b **0/0/6/9** · 3c **0/6/5/3** · 3d **0/0/2/2**.
**Phase 3 total across ~31,500 lines: 0×S1, 6×S2, 15×S3, 19×S4.**

**The Phase 3 headline:** twelve modules audited at depth produced **no S1 and no S2**; the nine tutorials
produced **six S2s in 5,566 lines**. Same subject matter, same deployment — the difference is that the
curriculum adopted a convention for marking what was run versus what was reasoned, and the tutorials never
did (`03-curriculum-audit.md` 3c-F7, work item **CUR-3c-W1**).

---

## 2. Do **not** re-derive these

Each cost real effort and is recorded with evidence. Re-running them wastes budget and risks contradicting a
recorded finding.

### 2.1 Live Authlete probes — four read-only passes, all recorded

`audit/02-findings/SERVICE-CONFIG-PROBE.md` §1–§10 holds the results of **four** authorised read-only probes
(`service/get`, `service/configuration`, `client/get/list`). It covers: all service flags, the 62-member
discovery document, all three clients' metadata, CIBA/device/RAR/logout/JARM/mTLS/attestation fields, and the
five Module 09a `UNVERIFIED` settings re-checked as **still unset on 2026-08-10**.

**Only one fact remains unprobed:** whether the discovery document advertises `challenge_endpoint` or
`client_attestation_pop_methods_supported` (work item **ATT-W5** — one call printing all 62 members).
*(Closed in Phase 4 §2.2 — both ABSENT.)*

**An eighth pass ran 2026-08-12 (T1-5, T1-13)** — `SERVICE-CONFIG-PROBE.md` §17–§19. Three facts worth carrying
beyond their work items. **The read-only proof came first, deliberately**: `service.get()`'s failure was
reproduced and the counterfactual tested *in memory* (`Service$inboundSchema.safeParse` on the live response with
`SPIFFE_JWT` filtered out) before any write, because the fix's cost was a working exercise. It yielded a rule —
**establishing that a fix works is cheaper than the cheapest thing the fix costs.** Second, **one withdrawal can
remove several advertisements**: dropping `attest_jwt_client_auth` also removed both
`client_attestation_*_signing_alg_values_supported` lists, so discovery went 64 → 62 (*not* the audit's earlier
62, which lacked T1-6's two additions). Third, **T1-13 had no knob** — no Authlete 3.0 `Service` property lists
the userinfo/introspection signing algorithms, and a write to the only candidate fields left `none` in place.
That is **RPL-W4's shape a second time**, so check for the field before writing acceptance criteria that say
"console change".

**A seventh pass ran 2026-08-12 (T1-4, T1-6) and wrote too** — `SERVICE-CONFIG-PROBE.md` §15–§16. Two
results worth carrying beyond their work items. **`readOnly` in the vendored 3.0.16 schema does not mean
read-only**: `supportedAcrs` carries `"readOnly": true` and the write was accepted and persisted — set that
beside T0-4's opposite (a field *absent* from the schema, accepted with `200` and discarded) and the rule is
that **the schema predicts neither storage nor rejection; only write-then-read-back does**. And
**`NO_INTERACTION` is not only the `prompt=none` path** — `offline_access` without `prompt=consent` reaches
it too, so T1-7 fixed a second live symptom of that S1 that nobody had noticed.

**A sixth pass ran 2026-08-12 (T1-2, T1-3) and also wrote** — one `service/update`, one `client/create` and
three `client/update`s, each read back and diffed key-by-key. Recorded in `SERVICE-CONFIG-PROBE.md` §11–§14.
Its two durable facts: **one RSA key with no `alg` member changed four advertised algorithm lists**, and the
**E2E suite mutates shared client state**, so every client snapshot in this audit has a shelf life.

**A fifth pass ran 2026-08-12, and it was the first that wrote.** T0-4 read all three clients
(`client/get/list`), attempted to register `postLogoutRedirectUris`, and re-read to verify. **Authlete accepted
the write with `200` and silently discarded the field** — it does not exist in the 3.0 `Client` schema
(`OIDC-RP-INITIATED-LOGOUT-1.0.md` **F-4**). Net effect on the service: **nothing but `modifiedAt`**, confirmed
by a before/after key-by-key diff. Two corrections came out of it: `postLogoutRedirectUris` was never a client
field, and the field this audit spelled `backChannelLogoutUri` is actually **`backchannelLogoutUri`**.

### 2.2 The `service.get()` 200-status mechanism — verified empirically

`ERRORHANDLER-STATUS-INVERSION.md` records a live run proving the chain: Authlete returns 200 → SDK throws
`ResponseValidationError` → which extends `AuthleteError` → which sets `statusCode` from the *successful* HTTP
response → `middleware/errorHandler.ts:14-18` emits that as the HTTP status. **`AGENTS.md`'s claim is correct
and its stated cause is one layer short.** Do not re-test this.

### 2.3 Specifications fetched and verified this session

Titles, statuses and dates confirmed against primary sources — cite these rather than re-fetching:

RFC 6749 · 6750 · 7009 · **7515** (JWS, May 2015) · **7517** (JWK, May 2015) · **7519** (JWT, May 2015) ·
7521 (May 2015) · 7523 (May 2015) · 7636 · 7662 · 8252 · 8414 · 8628 (Aug 2019) · 8693 (Jan 2020) ·
8705 (Feb 2020) · 8707 (Feb 2020) · **9440** (Informational, Jul 2023) · 9068 (Oct 2021) · 9101 (Aug 2021) ·
9126 (Sep 2021) · 9207 (Mar 2022) · 9396 (May 2023) · 9449 (Sep 2023) · 9470 (Sep 2023) · 9700 · 9701 ·
9728 · **9901** (Nov 2025) · OIDC Core 1.0 errata set 2 (15 Dec 2023) · OIDC Discovery 1.0 errata set 2 ·
RP-Initiated Logout (12 Sep 2022) · **Front-Channel Logout (12 Sep 2022)** · **Session Management (12 Sep 2022)** ·
Back-Channel Logout errata set 1 (15 Dec 2023) · CIBA Core 1.0 (1 Sep 2021) · JARM errata set 1 (17 Aug 2025) ·
Grant Management `-03` (9 May 2023) · Native SSO **draft 07 (16 Jan 2025)** · OID4VCI 1.0 (16 Sep 2025) ·
OID4VP 1.0 (9 Jul 2025) · **HAIP 1.0 (24 Dec 2025)** · OpenID Federation **1.0 (17 Feb 2026)** ·
FAPI 1.0 Part 1 & Part 2 (12 Mar 2021) · FAPI 2.0 SP (22 Feb 2025) · FAPI 2.0 Attacker Model (22 Feb 2025) ·
FAPI 2.0 Message Signing (25 Sep 2025) · CIMD **draft-02 (6 Jul 2026)** ·
attestation-based client auth **draft-10 (6 Jul 2026)** · MCP Authorization (`draft`)

**The audit's fetch budget is now spent.** RESUME §1 recorded *"two fetches remain in the whole audit —
CUR-3b-W12 (RFC 9101 §10.1) and 8252-W1 (RFC 8252 §7.3)."* **Both were made on 2026-08-14 (T2-14) and both
contradicted the audit rather than the curriculum**: §10.1 is *"Choice of Algorithms"* and says what Module 05
said it says, and §7.3 is a **MUST** where the finding's own reasoning said *"should"*. A third question to the
same RFC 9101 document settled the precedence rule as **§6.3** and caught a misquotation. **Nothing further is
owed.**

**Not fetched, deliberately:** ISO/IEC 18013-5 (paywalled — `MDL-MDOC-ISO18013-5.md` F-1 records why and cites
nothing from it). **Still unverified:** RFC 8446 and RFC 9110 dates cited at `modules/00…/README.md:87-88`
(work item **CUR-3a-W4**).

### 2.4 URL traps found

- FAPI 2.0 Security Profile is at `fapi-security-profile-2_0-final.html`. **`fapi-2_0-security-profile-final.html` 404s** — the slug most people would construct.
- OpenID Federation's canonical URL serves **1.0, 17 Feb 2026**, not the 1.1 / 5 May 2026 the inventory claims (`OPENID-FEDERATION.md` F-3).

### 2.5 Corrections the audit made to itself — do not re-introduce

| Was | Is | Where |
|---|---|---|
| `client/src/utils/pkce.ts` | **`client/src/pkce.ts`** | `RFC7636-pkce.md`, fixed in batch 3a |
| `none` framed as an RFC 7515 registry matter | **RFC 7518 §3.6** defines it — Module 00 is right | `JOSE-rfc7515-7517-7519.md` F-1 vs `modules/00…/README.md:93` |
| Assumed the JWT-bearer path put the AS's own `aud` on the issued token | It does not — the fields are silently dropped | `RFC7523-…` F-2 |
| Assumed Module 01 and Module 07 contradicted each other on ROPC | Deliberate, explained, cross-linked in both | `03-curriculum-audit.md` 3a-F5 |
| *"five attacker archetypes"* while listing six | **Six** — A1, A1a, A2, A3a, A4, A5. Module 10 is right | `FAPI-2.0-ATTACKER-MODEL.md` vs 3b-F13 (**CUR-3b-W15**) |
| *"Neither Module 01 nor 07 names `fapiModes`"* (3a-F5) | **Both do** — `modules/01…/lab.md:270`, `modules/07…/lab.md:298`. **CUR-3a-W5 is already satisfied** | 3d-F2 |
| *"Module 07 declares no `## Prerequisites` section"* (3c) | It does — *"**Modules 02–06, all of them**"* (`README.md:10-13`). A grep missed the plural range form | 3d-F1 |
| Deferred item 4: *"Module 09b's **two** `UNVERIFIED` markers and the VCI **tutorials**"* | **One** marker; there is **no** separate VCI tutorial | 3c, deferred-items table (**CUR-3c-W13**) |
| *"this server supports MCP flows out of the box"* attributed to `docs/MCP-OAUTH-TUTORIAL.md` **and `README.md`** | `MCP-OAUTH-TUTORIAL.md:3` **only** — `README.md` mentions neither MCP nor CIMD. So **MCP-W3's `README.md` half is a no-op** and T0-5 closed the claim completely | `MCP-OAUTH.md` doc-delta row, corrected 2026-08-11 during T0-5 |
| `04-remediation-plan.md` §7.2 — *"Tier 0 exits when **five** actions shipped"* | **Six** (T0-1…T0-6). The criterion predated T0-6 being split out | fixed 2026-08-11 during T0-6 |
| `postLogoutRedirectUris` recorded as client metadata that is *unset* on all three clients | **It is not a field Authlete 3.0 has.** 0 of the `Client` schema's 108 properties; a write returns 200 and is discarded | `SERVICE-CONFIG-PROBE.md` §10 row withdrawn 2026-08-12; `OIDC-RP-INITIATED-LOGOUT-1.0.md` F-4 |
| *"No client has `jwks` or `jwksUri`"* (`RFC7523-…` F-3, `RFC9101-…` F-3) | Client `1523514379` **does** have one — `kid: "e2e-test-key"`, written by `tests/e2e/e2e.test.ts:1169`, private half discarded per run. The substance holds (no *usable* client key) but the wording was falsified by a **test run**, not by an edit | found 2026-08-12 during T1-3; `SERVICE-CONFIG-PROBE.md` §14 |
| *"Module 08's asymmetric validation branch remains unexercised"* — in `OIDC-CORE-1.0.md` F-2, the lab's own marker, and `04-remediation-plan.md` §6.2 | **Nothing was blocking it.** Only the confidential client is `HS256`; both public clients have been `ES256` throughout. Three documents inherited one lab marker nobody re-checked | corrected 2026-08-12 during T1-2, by running it |
| *"`NO_INTERACTION` is the `prompt=none` path"* (`OIDC-CORE-1.0.md` F-1, `RFC9470-…` F-3) | **It is not the only one.** A request with no `prompt` at all reaches it whenever it asks for `offline_access` (OIDC Core §11). So the empty-`Location` S1 had a **second live symptom** nobody had looked for | found 2026-08-12 during T1-4; `SERVICE-CONFIG-PROBE.md` §16 |
| *"the handled `ID_TOKEN_REISSUABLE` action is unreachable while the flag is `false`"* (probe §3.3, OIDC-W5) | True, and it hid a **defect**. Enabling the flag showed the branch requires a `ticket` Authlete does not send, so every refresh returned **400 with a valid token body**. *Handled*, *exercisable* and *correct* are three different claims. **And the work item written from that symptom named the wrong remedy** — the branch was calling `/auth/token/issue` when this action has its own API, `POST /idtoken/reissue`; no arrangement of arguments to the first would have worked | found 2026-08-12 during T1-4; **B1-W6 ✅ fixed the same day** |
| `backChannelLogoutUri` (capital `C`) cited as absent on all three clients | Authlete's field is **`backchannelLogoutUri`**. The conclusion survives — the correct key is also unset — but the probe was reading a key that cannot exist | `SERVICE-CONFIG-PROBE.md` §10, `OIDC-BACKCHANNEL-LOGOUT-1.0.md` ×2, fixed 2026-08-12 |
| `03-curriculum-audit.md` citing `PROGRESS.md:1401` for the RFC 8446 verification claim | Wrong **when written** — it matched no revision of the file. Correct target `PROGRESS.md:2354-2355` | fixed 2026-08-11 during T0-6; see `04-remediation-plan.md` §6.3 |
| *"the `issue` APIs accept the credential request directly, so a separate parse step is optional"* — the reason VCI's three unused `*Parse*` APIs were graded harmless | **True of two of the three, false of the third.** `/vci/single/issue` and `/vci/batch/issue` take `accessToken` alongside the order; **`/vci/deferred/issue` takes `order` alone**, so for the deferred path `parse` is the *only* place a token can be validated. The generalisation turned a live authentication gap into a reassurance | `OID4VCI-1.0.md` F-3 → **F-6**, corrected 2026-08-13 during VCI-W5. **Rule: when a finding groups vendor APIs by name, check whether their request models agree before reasoning about the group** |
| VCI-W4: *"Keep the code as-is — routing, auth tiers and action mapping are correct"* | **Withdrawn.** It sat nine lines below a boundary-table row recording `VciDeferredParse` as *existing and unused*. Those are the same fact; joining them is the finding. An *"unused vendor API"* line in a boundary table is a finding, not inventory | `OID4VCI-1.0.md`, 2026-08-13 |
| `OID4VCI-1.0.md`'s doc-delta grading `AGENTS.md`'s VCI paragraph *"Matches the code"* | **It did not** — the paragraph put `deferred/issue` in the access-token category and the handler collected no token. Graded by comparing the prose against `vci.routes.ts`'s route **table**, not the handler. **Two documents agreeing with each other is not evidence about code** | `OID4VCI-1.0.md`, 2026-08-13 |

**Calibration worth carrying into Phase 4:** five of Phase 3's findings correct the audit rather than the
curriculum, and **every one arose where the audit reasoned from a grep or a recollection while the curriculum
had reasoned from the primary source.** Weight `AUDIT-PASS-A/B.md` accordingly too — it recorded `sd-jwt.mjs`
as *"CLEAN, 0 defects"* and the script has three (3c-F4).

---

## 3. Governing rulings (still in force)

From Gate 0 and Gate 1 — do not reopen without saying so:

- **Authlete version pinned: 3.0**, six pieces of evidence (`00-inventory.md` §1).
- **Delta audit**: `SPEC-INVENTORY.md` / `AUDIT-PASS-A.md` / `AUDIT-PASS-B.md` are claims under test, not evidence.
- **Live calls**: targeted, announced, read-only. `test:e2e` is never run (quota + rate limit).
- **Group C inherits the mTLS decline** (upheld in `RFC8705-mutual-tls.md`, with its rationale corrected).
- **The three deliberate token-exchange defects are confirmed, not fixed** (`RFC8693-token-exchange.md`).
- Phases 0–4 are read-and-analyse only. The only files created are under `audit/`.

---

## 4. Phase 3, re-scoped by risk

Batch 3a found **0×S1 and 0×S2** across four modules: the curriculum is more accurate than the code it teaches.
Auditing the remaining 21,864 lines at 3a's depth would cost ~300k tokens for predominantly S3/S4 yield. The
remaining value is concentrated, so the batches are re-cut:

| Batch | Target | Lines | Rationale | Status |
|---|---|---|---|---|
| **3b** | Modules **05, 06, 09a, 10** | ~7,100 | The only modules sitting directly on S1/S2 code findings. Where a lab can teach a broken behaviour as correct. | ✅ **complete** — 0×S1, 0×S2 |
| **3c** | The nine tutorials + `sd-jwt.mjs` | ~6,000 | Phase 2 already found fabricated transcripts, a wrong challenge status and stale test claims here. Highest defect density in the repo's prose. | ✅ **complete** — 6×S2 |
| **3d** | Modules 04, 07, 08, 11, 12 · exams · `docs/curriculum/README.md`, `GLOSSARY.md`, `PROGRESS.md`, `SPEC-INVENTORY.md`, `AUDIT-PASS-A/B.md` | ~14,400 | **Light sweep only** — citation and claim spot-checks, not line-by-line. 3a/3b evidence predicts S3/S4. | ✅ **complete** — 0×S1, 0×S2; the prediction held |

The **dependency-order graph is complete** and is at the end of `03-curriculum-audit.md`: no cycles, no forward
dependency on a later concept, no undeclared dependency on a server capability. Two structural items for 3d —
**Module 07 declares no `## Prerequisites` section** though its body depends on 02/03/04, and the Module 08 →
Module 10 edge is the one the audit found stale in content (3b-F9).

### Items Phase 3 explicitly owed — **all eight closed**

Deferred with intent during Phase 2. Full results in `03-curriculum-audit.md` → *Deferred items — final status*.

| # | Item | Result |
|---|---|---|
| 1 | `sd-jwt.mjs` vs RFC 9901 (`RFC9901-…` F-1, **9901-W2**) | ✅ Audited **and executed**. Substantially correct — §4.2.3 matches the spec's published vector, §9.3 verified over 200 salts (all distinct, all 128 bits), §4.3.1 `sd_hash` catches replay. **Three defects** (3c-F1–F3), the first a wrong ACCEPT on a missing trailing tilde |
| 2 | `RAR-TUTORIAL.md` transcripts | ✅ Three success transcripts, none producible, **zero** markers — S2 |
| 3 | `NATIVE-SSO-TUTORIAL.md` transcripts | ✅ Four blocks sharing one fabricated `device_secret`, **zero** markers — S2 |
| 4 | Module 09b's markers + "the VCI tutorials" | ✅ **The premise was wrong:** Module 09b has **one** marker (`lab.md:556`), correctly scoped, and there is **no separate VCI tutorial** — VCI is taught inside Module 09b (**CUR-3c-W13**) |
| 5 | `DEVICE-FLOW-TUTORIAL.md:185,619` | ✅ Both honest, both correctly scoped to undocumented **vendor** behaviour, neither resolvable without a probe. No action |
| 6 | Module 10 vs the unmet `shall`s | ✅ Six of eight present; **two absent**, incl. *"shall use PS256, ES256 or EdDSA"* — which this deployment fails visibly (HS256 ID tokens), and Module 05 already states the fact without connecting it (3b-F14) |
| 7 | Whether Module 10 uses A1–A5 (**AM-W3**) | ✅ **Already satisfied** — AM-W3 needs no work. And Module 10 is right that there are **six** archetypes; `FAPI-2.0-ATTACKER-MODEL.md`'s prose says five while listing six (**CUR-3b-W15**) |
| 8 | The five orphaned documents | ✅ `MCP-OAUTH-TUTORIAL.md` audited — its opening sentence is the batch's most consequential S2. `AUDIT-PASS-A/B` tested against `sd-jwt.mjs` and found to have recorded it *"CLEAN, 0 defects"* (3c-F4). `TICKET-PARAMETER.md` / `CHANGELOG.md` make no conformance claim — indexing only, carried to 3d (**CUR-3c-W14**) |

### Highest-value work items Phase 3 produced

- **CUR-3c-W1** — adopt the curriculum's `UNVERIFIED` convention across the nine tutorials. The aggregate behind six S2 rows; a writing task, not an engineering one.
- **CUR-3b-W1** — re-point Module 10 at the fixed logout endpoint (five references).
- **CUR-3c-W2** — correct `MCP-OAUTH-TUTORIAL.md`'s opening sentence. Smallest fix, largest blast radius.
- **CUR-3c-W3 / W5** — enforce the trailing tilde in `sd-jwt.mjs` and give it a test file.
- **CUR-3a-W1 + CUR-3b-W5 + CUR-3c-W11** — three separate `check-docs.mjs` detection gaps (bare paths, prose `Line ~NN` refs, endpoint paths in fenced blocks). **Scope them as one change.**

### New finding category: labs broken *by* the remediation

Batch 3a opened a register Phase 4 must carry — correct labs that a recommended fix would invalidate:

| Lab | Broken by | Mitigation |
|---|---|---|
| ~~Module 00 Ex 2 expects `key count: 1`, EC key at `keys[0]`~~ | ~~**OIDC-W2** / **FAPI1A-W2**~~ | ✅ **both landed in one commit, 2026-08-12.** And the register was short by two — Module 08 §6d and `modules/11…/README.md` also asserted the pre-fix key set |
| Module 01 Ex 3 + Module 07 §3b both hinge on ROPC succeeding | **FAPI2-W5** — enabling FAPI 2.0 reverses both transcripts | Name `fapiModes` in both (**CUR-3a-W5**) |
| Module 10 Ex 4 teaches the 200-with-stack-trace | ~~Dropping `SPIFFE_JWT` **retires** it~~ — **it did not.** Both fixes shipped (2026-08-11, 2026-08-12) and the exercise was **rebuilt**: three dated states plus the closed-enum lesson | See `ERRORHANDLER-…` F-2's four-row table and the note under it. **Rule:** a symptom-based lab dies with the fix; a mechanism-based one gains a data point |

This is distinct from `AGENTS.md`'s **Deliberate defects** table, where the coupling is intentional.

---

## 5. Phase 4 inputs already established

### 5.1 The rebuild question is answered: **no rebuild**

Evidence, all from Phase 2:

- **35 of 36** Authlete action mappings complete against the SDK enums; every branch point has a `default` (`B1-authlete-boundary.md`, `01-spec-matrix.md` §6).
- Four cases that look like bugs are correct (`native-sso` literals, `hsk` list map, `vci` asymmetric maps, `device` `ACCESS_DENIED`).
- Defects are **localized and repetitive**, not structural: three endpoints share one wire-format pattern; one clause in one middleware inverts every failure status; five hardcoded literals in one controller; ~12 configuration flags account for most `MISCONFIGURED` verdicts; four documents carry stale line numbers.
- Targeted work on roughly **15 files plus a console configuration pass**.

Phase 4 must still state the numbers, but the conclusion should not change.

### 5.2 Five systemic themes — aggregate these, don't list 55 findings

1. **Advertised but unusable** — JARM's four response modes; four of nine client-auth methods; five grant-management actions; parameterized scopes (the inverse case). Module 09a's own taxonomy (`lab.md:120-124`) already has the vocabulary.
2. **Claimed working, flag off** — Native SSO, FAPI 2.0, VCI, MCP/CIMD. Remedy: derive `README.md`'s status tables from live configuration.
3. **Authlete's envelope crossing the boundary** — PAR, CIBA, Device speak the vendor's internal shape on endpoints they advertise; token and grant-management get it right.
4. **`accessTokenDuration = 86400`** — load-bearing for four findings (grant revocation, token exchange, 24 h ID tokens, FAPI Baseline's 10-minute guidance). One change: **GM-W1** = **OIDC-W4** = **FAPI1-W3**.
5. **Citation provenance** — Native SSO's date, Federation's version, CIMD's revision, the attestation draft's missing row, `AGENTS.md`'s 60s/60min error, three stale line-number sets. Remedy: per-row "URL fetched + header line read" (**FED-W4**).

### 5.3 Candidate additions to `AGENTS.md`'s Security-critical surfaces list

Four files decide security outcomes and are not on it: `routes/device.routes.ts`,
`services/logout.service.ts`, `controllers/logout.controller.ts`, `middleware/errorHandler.ts`.

### 5.4 Highest-leverage single changes

- ~~**One client with `private_key_jwt` + a JWKS**~~ ✅ **shipped 2026-08-12 (T1-3)** — RFC 7523 §2.2, asymmetric JAR and FAPI's prerequisite, from one `client/create` (**7523-W4** = **9101-W3**).
- ~~**One registered RSA key**~~ ✅ **shipped 2026-08-12 (T1-2)** — RS256 *and* PS256, because the key carries no `alg` member (**OIDC-W2** = **FAPI1A-W2**).
- **One clause in `errorHandler.ts`** stops every SDK validation failure being served as 2xx (**EH-W1**).
- **One review of `supportedTokenAuthMethods`** subsumes the mTLS metadata fix, the attestation finding and the `SPIFFE_JWT` question (**ATT-W3**).

---

## 6. The eight S1 findings

> **⚠️ The first two were remediated in the working tree on 2026-08-10, after their Phase 2 entries were
> written.** Batch 3c confirmed both fixes against the code (`03-curriculum-audit.md` 3b-F9). The two entries
> in `audit/02-findings/` still describe the **pre-fix** state in their findings and work items — **Phase 4
> must re-verify both against the working tree, not against the entries.** Neither S1 is closed; both are
> downgraded. See the rows below.

| Entry | Verdict | Exploitable now? |
|---|---|---|
| `RFC8628-device-authorization-grant.md` | `PARTIAL` | ~~YES~~ → **fixed 2026-08-10.** `POST /api/device/complete` is now gated by `middleware/development-only.ts` (flat 404 outside development) plus `deviceCodeLimiter`, at `routes/device.routes.ts:27`; asserted by `tests/unit/routes/device.routes.test.ts`. **Still unauthenticated *within* development.** The wire-format and rate-limit findings in the entry are unaffected |
| `OIDC-RP-INITIATED-LOGOUT-1.0.md` | `PARTIAL` | ~~YES~~ → **fixed 2026-08-10.** `isAllowedPostLogoutRedirectUri` (`services/logout.service.ts:131-138`) refused both verified payloads — first by comparing **origins exactly** (2026-08-10), and since 2026-08-12 by matching the identified client's registered set with `===`, no parsing at all. **The fix is not RPL-W1** — RP-Initiated Logout §3 wants exact matching against per-client registered `post_logout_redirect_uris`, no client registers any, so the deployment kept an env-driven allowlist and recorded the departure in `AGENTS.md`. **RPL-W2 ✅ (2026-08-11, T0-2) and RPL-W3 ✅ (2026-08-12, T0-3) have since landed; RPL-W1 and RPL-W4 remain, as T0-4.** Severity S1 → S2 → **S3** |
| `ERRORHANDLER-STATUS-INVERSION.md` | ~~`PARTIAL`~~ → **`RESOLVED`** | No — silent failure, not a breach. Systemic across 57 call sites. **Both layers closed: the status clamp 2026-08-11 (EH-W1), the enum-gap residue 2026-08-12 (T1-5).** S1 → S3 → **closed** |
| `FAPI-2.0-SECURITY-PROFILE.md` | `MISCONFIGURED` | No — false attestation (five literals opposite to live values). **F-1 fully closed: the literals 2026-08-11 (FAPI2-W1), the endpoint failure 2026-08-12 (T1-5) — both endpoints now report the live posture.** S1 → **S2**, on F-2's basis (`README.md` still calls FAPI 2.0 "Working") |
| `RFC7636-pkce.md` | `MISCONFIGURED` | No — PKCE not required and falsely reported as required. **The false report is gone in both halves** (FAPI2-W1 2026-08-11; T1-5 2026-08-12 made the live read observable — `/api/fapi/config` answers `pkceRequired: false`). **Open on the unenforced control alone; the downgrade is Gate 4 Q1's ruling, not taken here** |
| `RFC7662-token-introspection.md` | `PARTIAL` | ~~No — unauthenticated introspection (RFC 7662 §2.1 MUST)~~ → **fixed 2026-08-12 (T1-1).** Both endpoints require admin Basic auth and carry `generalLimiter`; the gate runs **before** any Authlete call. **S1 → S3.** The residue is architectural: it is not *client* authentication, and whether it could be depends on an unestablished Authlete behaviour (**7662-W6**) |
| `RFC9700-security-bcp.md` | `PARTIAL` | No — implicit + password grants enabled, no PKCE requirement. **F-4/F-4a's residue closed 2026-08-12 (T1-5)**: the posture is readable through the repo's own endpoint, so the entry now rests on F-2 alone (**S3**, deliberate teaching material). §2.4 unmet by decision |
| `RFC9470-step-up-authentication.md` | `PARTIAL` | ~~Not yet — fabricated `acr`/`auth_time`~~ → **retired 2026-08-12 (T1-7).** OIDC-W1 and 9470-W3 shipped as one change, so the activation route was built correctly rather than built at all. The fabrication block is deleted; `utils/step-up.ts` answers absence as "no". **S2+latent-S1 → S3** |

**Recommendation on record:** the first two should be fixed ahead of Gate 4 rather than waiting for the plan.
Both need plan mode per `CLAUDE.md` (Security-critical surfaces — and note both files are among the four
missing from that list, §5.3). **✅ Carried out on 2026-08-10** — both files have since been added to
`AGENTS.md`'s Security-critical surfaces list, which closes half of §5.3.

**The lesson the remediation left behind**, and Phase 4 should carry it as a checklist step rather than a
habit: the change updated `AGENTS.md`, `docs/API.md`, `docs/DEVICE-FLOW-TUTORIAL.md`, `PROGRESS.md`, the tests
and **Module 08** — and missed **Module 10**, which cross-references Module 08's open redirect five times and
still teaches it as live. `AGENTS.md`'s existing rule (*"grep the curriculum for the symptom you changed"*)
would have caught it only if the search term had been the **phrase** "open redirect" rather than an error
string. Work items **CUR-3b-W1** (fix Module 10) and **CUR-3b-W2** (fix the rule).

---

## 7. Working conventions

- Every codebase claim carries `path:line`; every external claim carries a URL fetched in that session.
- Findings live one-file-per-spec in `audit/02-findings/`, with the schema from the skill's `<one_shot_example>`: verdict header → `<thinking>` → normative table → Authlete boundary table → findings → documentation delta → sources → work items.
- Cross-reference sibling findings rather than restating them; never count one defect twice.
- Work-item IDs are per-entry prefixes (`9126-W1`, `EH-W1`, `CUR-3a-W3`). Phase 4 reconciles them.
- **An acceptance criterion must name the call it expects to change** — added 2026-08-13. Six work items in
  Phase 5 prescribed remedies that could not reach their stated outcome, and the shared tell was that none
  named an endpoint: a criterion phrased as *"issue from the fields Authlete actually sends"* or *"return 200
  with an entity statement"* describes a **result**, and results do not tell you which call produces them.
  Write *"call `POST /idtoken/reissue` instead of `/auth/token/issue`"*. If you cannot, you have not finished
  the finding — **probe first**; see `04-remediation-plan.md` §7.4 step 0.
- **Ask "what was supposed to have caught this?" before asking "how do I fix it?"** — added 2026-08-13. In
  Phase 5 that question found more real defects than reading code did: four surfaces with no test naming them
  at all, one of them *unmockable* because the shared Authlete mock lacked a member, and the client's entire
  test suite plus its `typecheck` script, which CI never invoked because `vite build` does not typecheck. It
  is now partly mechanical — `node scripts/check-route-coverage.mjs` ratchets against a recorded baseline.
- **Never cite code by line number in `PROGRESS.md`** — added 2026-08-14. The file **prepends** new entries, so
  every line-anchored reference below an insertion point rots, and T0-6 already had to re-resolve **20** of them
  by content across three git revisions. Cite the **symbol or the comment text** instead: *"`handler.ts`'s
  `tokenCreateRequest` literal"* is findable forever, and there is no number to go stale. The four
  `token-exchange-response.handler.ts:NN` refs in historical Build Log entries were converted this way rather
  than renumbered — **deletion beats renumbering** for a pointer in an append-at-top file, the same conclusion
  CUR-3b-W4 and CUR-3c-W12 reached independently. **What must not be converted:** a reference that quotes a
  wrong number *as the defect* (`03-curriculum-audit.md`'s rows). Those are evidence, not navigation.
- Run `node scripts/check-docs.mjs` after writing — it validates `file.ts:NNN` refs, relative links and anchors across `audit/` too. **Three known detection gaps**, all found by this audit and all to be scoped as one change: bare paths with no line number (**CUR-3a-W1**), prose refs of the form `Line ~89` (**CUR-3b-W5**), and endpoint paths inside fenced blocks (**CUR-3c-W11**).

---

## 8. Phase 4 — what it has to do, and what it must not re-derive

Phase 4 is **synthesis and a remediation plan**, written to `audit/04-remediation-plan.md` and
`audit/05-decision-records.md`. It is still read-and-analyse only; Phase 5 executes, gated on Gate 4.

### 8.1 Inputs that are settled — do not reopen

- **No rebuild.** §5.1 states the evidence; the conclusion should not change.
- **The five systemic themes** (§5.2) are the aggregation unit. **Do not enumerate 55 findings.**
- **Authlete 3.0**, the four live probes (§2.1), the ~45 verified specs (§2.3), the mTLS decline, and the three deliberate token-exchange defects.
- **Phase 3's headline** (§1): 0×S1 and 0×S2 across seventeen modules; 6×S2 across nine tutorials; the difference is one convention.

### 8.2 The four things Phase 4 must do that no earlier phase could

1. **Re-verify the two remediated S1s against the working tree**, not against their Phase 2 entries — both entries still describe pre-fix code (§6). Then restate the S1 count honestly: 8 found, 2 downgraded, 6 open.
2. **Reconcile ~120 work-item IDs into one ordered plan.** Many are the same change under different prefixes — **GM-W1 = OIDC-W4 = FAPI1-W3** (`accessTokenDuration`); **FAPI2-W1 = 7636-W1 = 9700-W4** (the hardcoded literals); **8693-W3** now spans four documents; **CUR-3a-W1 + CUR-3b-W5 + CUR-3c-W11** are one `check-docs.mjs` change; **9101-W3 = 7523-W4 = FAPI2-W5's prerequisite** (one client with `private_key_jwt` + a JWKS).
3. **Carry the lab-breakage register in both directions** (`03-curriculum-audit.md`, end of batch 3b). Some fixes break correct labs; **JARM-W1 / CIBA-W4 / 9396-W1 and a `supportedAcrs` entry complete four labs that are currently `UNVERIFIED`.** The register was one-directional until 3b.
4. **Write the decision records** for the genuine choices only — mTLS (declined, rationale corrected), FAPI 2.0 (**FAPI2-W5**), VCI, Native SSO, CIMD/MCP (**CIMD-W2**), Session Management, and the `SPIFFE_JWT` question. **RFC 9901 deliberately gets none** (`RFC9901-…` verdict reasoning); Gate 4 confirms.

### 8.3 Close these before or during Phase 4 — they are cheap and they close real holes

| Item | Why now |
|---|---|
| **CUR-3d-W1** — fetch RFC 9846 + RFC 8446 (+ 9110, 9864) | The largest remaining hole in citation coverage. `SPEC-INVENTORY.md` instructs *"cite RFC 9846 instead"* on an obsoletion this audit never verified, and Module 00 contradicts it. Four fetches |
| **ATT-W5** — one call printing all 62 discovery members | The **only** unprobed fact left (§2.1); settles `challenge_endpoint` / `client_attestation_pop_methods_supported` |
| **AM-W2** — fetch the unsuffixed `fapi-attacker-model-2_0.html` | Closes the superseded-URL question and one §7 spot-check row |

### 8.4 Recommended sequencing for the plan itself

**Tier 0 — ship before Gate 4** (no curriculum dependency, false reporting or exposure):
~~**EH-W1**~~ ✅ · ~~**FAPI2-W1**~~ ✅ · ~~**RPL-W2**~~ ✅ · ~~**RPL-W3**~~ ✅ · ~~**RPL-W1/W4/W5**~~ ✅ ·
~~**CUR-3c-W2**~~ ✅ — **Tier 0 is complete as of 2026-08-12.** RPL-W4 did not land as written: there is no
Authlete field to register into, so the registry is the deployment's own (F-4).

> **Shipped 2026-08-11 — do not re-plan these.** `middleware/errorHandler.ts` now clamps an error-supplied
> status to 400–599 (`errorStatusFrom()`), so no SDK validation failure is served as 2xx across any of the
> 57 call sites; and `GET /api/fapi/config` reads all six posture fields from the live service instead of
> asserting them. **EH-W1/W2/W3/W4/W5 and FAPI2-W1/W2 are closed**; FAPI2-W3/W4/W5/W6 remain open. Both
> entries carry a fixed-banner and a revised severity (`ERRORHANDLER-…` S1→S3, `FAPI-2.0-SECURITY-PROFILE.md`
> S1→S2). Consumers updated in the same commit: `AGENTS.md`, `docs/FAPI-TUTORIAL.md`, Module 10
> (README, lab, quiz-answers), the OpenAPI spec, the client `FapiConfig` interface and `operationDocs.ts`,
> plus `PROGRESS.md`. Tests 504 → **514**. **Module 10 Exercise 4 was reframed, not retired** — the enum gap
> still breaks both endpoints, so the exercise now separates *two defects with one symptom*.
>
> **Consequence for the S1 count:** of the eight S1 findings in §6, **two were remediated on 2026-08-10 and
> a third on 2026-08-11**. Phase 4 should state 8 found / 3 downgraded / 5 open, and re-verify each against
> the working tree.

**Tier 1 — configuration, no code:** **OIDC-W2** (one RSA key) · **7523-W4** (one client with
`private_key_jwt` + JWKS) · **GM-W1** (`accessTokenDuration`) · **ATT-W3** (`supportedTokenAuthMethods`
review, which subsumes the mTLS metadata fix, the attestation finding and `SPIFFE_JWT`) · **JARM-W1 /
CIBA-W4 / 9396-W1** + `supportedAcrs` — *these four complete labs rather than breaking them.*

**Tier 2 — documentation, highest leverage in the whole audit:** **CUR-3c-W1** (the `UNVERIFIED` convention
across nine tutorials — the aggregate behind six S2s) · **CUR-3b-W1 + CUR-3d-W2** (six stale open-redirect
references) · **CUR-3b-W2** (the grep rule that would have caught them).

**Tier 3 — Gate 4 decisions:** **FAPI2-W5**, **CIMD-W2**, **9068-W1**, **8693-W5**, `SPIFFE_JWT`. Each
retires or reverses curriculum material; none should ship without the paired doc change in the same commit,
per `AGENTS.md`.
