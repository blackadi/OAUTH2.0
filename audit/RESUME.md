# RESUME — audit state, and what a fresh session must not re-derive

**Purpose.** The RFC conformance audit spans five phases and does not fit one context window. This file pins
the state so a new session resumes without re-reading the repo, re-fetching specifications, or re-probing
Authlete. Read this first; read `00-inventory.md` §11 and `01-spec-matrix.md` §5 second.

- **Last updated:** 2026-08-13 (Gate 4 approved; **Phase 5 in progress — Tier 0 complete; Tier 1: T1-1 … T1-10 and T1-17 shipped, T1-13 closed as unachievable, T1-21 declined**, see `04-remediation-plan.md` §1.2). **T1-9 + T1-10 + 6749-W1 shipped 2026-08-13**: `/api/gm/:grantId` is now a protected resource in the same sense UserInfo is — `DPoP` accepted, the §7.2 downgrade refused, an RFC 6750 §3.1-shaped no-token challenge — every `htu` derives from `dpopHttpTarget()` so a query string no longer breaks proof validation, a caller can no longer choose the introspection `targetUri`, and dual-channel client credentials are refused at `/api/token` and `/api/par`. **Two probes rewrote that design before any code**: `/gm` checks the DPoP binding independently of the ownership introspection (`[A281305]`), and one proof serves both calls. **B1-W1 + B1-W2 + MS-W1 also shipped 2026-08-13**: `/api/jar/process` was unauthenticated and returned Authlete's whole authorization response **including the `ticket`** — a credential — plus `service` and `client`, always with status 200; it is now admin-only with an allowlist, and `jar.controller.ts` joins the surfaces list (**a DR-12 dependency settled**). RFC 9701 JWT introspection returns a signed `token-introspection+jwt` instead of **500**, the profile's only live one — and it signs with the key T1-2 registered, so an earlier ⚙️ action is what made a later code fix produce a signature. **`rsUri` is required for that path and must not be defaulted or sent unconditionally** — see `AGENTS.md`. **T1-14 + T1-15 shipped 2026-08-13 too**: `POST /api/backchannel_logout` performed **5 of §2.6's 11 validation steps** — no `iss`, no `aud`, no `iat` bound, no `sub`/`sid` presence, no `nonce` rejection — and then destroyed **`req.session`**, which is the *caller's* session, so it terminated nothing while answering 200. Both fixed and driven live against a locally-served JWKS. The `jwt.verify` rule is in `AGENTS.md` and **its second clause is the one that gets skipped**: pass `issuer`/`audience`, *and* refuse when they are unconfigured, because omitting an option silently downgrades the check. Two new settings (`BACKCHANNEL_LOGOUT_ISSUER`/`_AUDIENCE`) — **not** `JWT_ISSUER`, since there this server is the RP. **BCL-W3 and BCL-W7 rode along.** The entry is **S2 → S3**. **T1-16 + T1-18 shipped 2026-08-13**: one line (`requestBody: {}`) turned federation's **400 blaming the caller** into a **500 naming the missing configuration** — but **FED-W1's criteria cannot be met by it**, because an entity statement needs a federation JWK Set on the service (`[A316201]`), so **FED-W2 stays blocked** on a feature-enablement decision. **FED-W5 closed with no change of its own**, since the controller mapping was already right once the SDK stopped throwing — the same defect shape as BCL-W3 but a different fix, because *where the throw happens* decides which. **T1-20 shipped 2026-08-13**: `ciba.service.ts` never read `Authorization: Basic`, so the `CLIENT_SECRET_BASIC` configuration `AGENTS.md` *recommends* for CIBA could not authenticate. Three channels now, matching PAR; `appendToParams` extracted to `utils/params.ts`. Verified live — Basic reaches `USER_IDENTIFICATION`, and body credentials for that client now correctly earn `401 [A157357]` instead of being **silently converted** onto the Basic channel. **The three S1 residues are closed as documentation**: `README.md` opens with a *"Read this before you copy anything"* table of the four deliberate departures, and the feature tables carry honest statuses (FAPI 2.0 / Native SSO / Federation **Not enabled**, Backchannel Logout **Partial**, PKCE **supported, not required**). **A CI gap was found while verifying**: the client job ran `vite build` alone, which does not typecheck, so `npm run typecheck` was never invoked and **16 client test files never ran** — 4 real type errors had accumulated. Fixed, and both gates added to `ci.yml`. **721 server tests / 63 files; 109 client tests / 16 files.** **Still open in Tier 1: T1-11's three spec-shaped endpoints (deferred as their own batch — the change breaks the SPA) and T1-19.** **PKCE is now ENFORCED (2026-08-13) and `RFC7636-pkce.md` drops S1 → S3** — `pkceRequired` + `pkceS256Required` are `true` on `4277838306` and `2176571218`, verified live (`[A124301]` with no challenge, `[A124308]` on `plain`, `INTERACTION` on `S256`). **`1523514379` and `1678274156` stay unenforced deliberately** and must not be "fixed": Module 02 teaches the plain flow and Module 03 shows what it costs, so the lesson needs a client that still permits it — recorded in `AGENTS.md`. **Gate 4 Q1 is superseded**; it asked whether the entry stays S1 until PKCE is *actually* required, and it now is. Note §7.2's Tier 1 exit criterion is **under-specified** — it covers only the ⚙️ half of a tier titled *configuration and contained code*, and says *three* probes where T1-17 had five; fix it before using it to judge the tier complete. **T1-17 answered all five unprobed behaviours and deleted work rather than creating it**: `9449-W4` resolved *in our favour* (`/auth/introspection` enforces `cnf.jkt` with no proof — `[A065308]`), so **9449-W3 stays S2 and T1-10 is not escalated**; `7523-W1` showed Authlete refuses a no-`exp` assertion (`[A314305]`), demoting **7523-W2** to defence-in-depth; `GM-W2` works end to end with **no AS code**; `8628-W6` is substituted. Only **6749-W1** still owes a ruling — Authlete does *not* reject dual-channel credentials and the strict-checking page is silent, so the plan's "no code change if Authlete already rejects" escape does not apply. **Do not re-run these five probes.** **S1 register: 8 found, 0 remain — verified entry by entry on 2026-08-13, not asserted.** Current severities: `ERRORHANDLER-…` **closed**; `OIDC-RP-INITIATED-LOGOUT-1.0` **S4**; `RFC8628-…`, `RFC7662-…`, `RFC9470-…`, `RFC7636-pkce`, `FAPI-2.0-SECURITY-PROFILE`, `RFC9700-…` all **S3**. The last three fell on 2026-08-13 — PKCE by being enforced, the other two because `README.md` stopped claiming what was not true. The latent S1 (9470 F-3) is retired rather than downgraded. **The ⚙️ configuration block is complete.** **T1-5 shipped with DR-07 ruled and executed** — nine advertised client-auth methods → five, `service.get()` works, and both FAPI endpoints answer `200` with live values for the first time since 2026-08-06; Module 10 Ex 4 was **rebuilt, not retired**. **T1-4 is deliberately half-landed** — the 24-hour lifetime is kept on purpose (GM-W1/FAPI1-W3 open by decision). **B1-W6 is closed**: `idTokenReissuable` is now `true` and kept, because the `ID_TOKEN_REISSUABLE` branch was calling the wrong Authlete API and now calls `POST /idtoken/reissue`.
- **Repo:** `/home/blackadi/Documents/OAUTH2.0`, branch `audit/phase3-and-tier0-fixes`
- **Skill:** `.claude/skills/rfc-audit/SKILL.md` — invoke with `/rfc-audit` or follow it directly
- **Verify anything under `audit/` still resolves:** `node scripts/check-docs.mjs` — currently **167 markdown files, 103 source refs, clean**

---

## 0. START HERE — the next piece of work, and why it is that one

*(Added 2026-08-13, after Phase 5's Tier 1 code batches. Read this before §1.)*

**Phase 5's Tier 1 is essentially done; Tier 2 is documentation; Tier 3 is decisions. The highest
defect-per-hour work in this repo is none of those — it is the route-coverage backlog**, because every code
defect found on 2026-08-13 came out of that population and the population is not yet exhausted.

```bash
node scripts/check-route-coverage.mjs           # gate: fails only on NEW uncovered routes
node scripts/check-route-coverage.mjs --triage  # the backlog, split by how blind it is
```

**"47 uncovered routes" is two different problems, and the split is what makes it tractable:**

| | Count | What it means |
|---|---|---|
| **A** | **4** | No test anywhere for the module — nothing asserts this code at all |
| **B** | **43**, in **10 modules** | The controller *is* unit-tested; **nothing drives the route with its middleware** |

**B is the group with history.** `/api/jar/process` had a controller test and no auth middleware — it handed
Authlete **tickets** to anonymous callers. `/api/device/complete` was ungated outside development. Both
introspection endpoints were unauthenticated. **A controller test cannot see any of those**: it calls the
handler directly and never touches the route's middleware chain. That is the defect class, and one
integration block per module catches it.

**So the work is 10 blocks, not 43 tests**, and the first assertion in each is *does this endpoint enforce
the auth posture it claims?* — `401` without credentials, and **Authlete not called**. Order by blast radius:
`client` (14 routes, admin surface returning secrets), `vci` (10), `token` (5, admin token management),
`hsk` (4), then the rest.

**Group A is ~30 minutes** and two of its four are `nativesso`, which is `nativeSsoSupported: false` — assert
the honest failure rather than inventing a happy path.

**Bank progress with `--update-baseline`** and commit the diff; never regenerate the baseline to silence a
failure. `tests/integration/routes.test.ts` is the pattern to copy (`vi.hoisted()` + `vi.mock()` on
`authlete.service`, `createApp()` factory).

**After that**, in descending value: **T1-11's three spec-shaped endpoints** (PAR/Device/DCR return
Authlete's camelCase envelope instead of the RFC body — probe-confirmed, but it breaks `ParSection.tsx:112`
and `DeviceSection.tsx:159-160`, so server + SPA + lab transcripts belong in **one** batch); **T1-19**'s
remaining small items; then **Tier 2** documentation and **Tier 3** decisions.

---

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
| `03-curriculum-audit.md` citing `PROGRESS.md:1401` for the RFC 8446 verification claim | Wrong **when written** — it matched no revision of the file. Correct target `PROGRESS.md:2226-2227` | fixed 2026-08-11 during T0-6; see `04-remediation-plan.md` §6.3 |

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
