# Phase 4 — synthesis and remediation plan

- **Written:** 2026-08-11
- **Repo:** `/home/blackadi/Documents/OAUTH2.0`, branch `audit/phase3-and-tier0-fixes`
- **Inputs:** [`00-inventory.md`](00-inventory.md), [`01-spec-matrix.md`](01-spec-matrix.md), [`02-findings/`](02-findings) (55 entries), [`03-curriculum-audit.md`](03-curriculum-audit.md), [`RESUME.md`](RESUME.md)
- **Companion:** [`05-decision-records.md`](05-decision-records.md) — the twelve genuine choices, written up separately
- **Status:** ⬜ awaiting **Gate 4**. Phase 4 is read-and-analyse only; nothing here is executed until Gate 4 approves it.
- **Baseline at time of writing:** 514 tests / 53 files passing, `node scripts/check-docs.mjs` clean

This document does four things no earlier phase could: it re-verifies the S1 register against the **working
tree** rather than against the finding entries, closes the last three cheap verification items, reconciles
**280** work-item IDs into one ordered plan, and carries the lab-breakage register in both directions.

It deliberately does **not** enumerate the findings. The aggregation unit is the five systemic themes in §4.

---

## 1. Headline

**Three conclusions, in the order they should be read.**

1. **No rebuild.** The evidence was settled at Gate 2 and Phase 4 does not disturb it (§3). The defects are
   localized and repetitive: five endpoints share one wire-format pattern, one middleware clause inverted every
   failure status, ~12 configuration flags account for every `MISCONFIGURED` verdict, and four documents carry
   the same stale line numbers. Targeted work on roughly **15 files plus one console pass**.

2. **The single most productive artifact in the whole audit is the discovery document.** ATT-W5 was scheduled as
   one call to settle two absent members. It settled those two and, from the same 62-member response,
   independently corroborated **nineteen** separate findings across four of the five themes (§2.2). Phase 5
   should treat `GET /service/configuration` as a *test fixture*, not a probe — §7.3 proposes exactly that.

3. **The curriculum is more accurate than the code it teaches and than the tutorials it assigns.** Seventeen
   modules plus nine exam files produced 0×S1 and 0×S2 across ~25,500 lines; the nine tutorials produced 6×S2 in
   5,566 lines. The difference is one convention — marking what was run versus what was reasoned. **CUR-3c-W1
   is therefore the highest-leverage item in the plan, and it is a writing task.**

**And one calibration on the audit's own confidence.** Five Phase 3 findings, plus three in this phase, correct
*the audit* rather than the repo. Every one arose where the audit reasoned from a grep or a recollection while
the target had reasoned from a primary source. The three found here:

| The audit said | The working tree says | Where |
|---|---|---|
| "~120 work-item IDs" (`RESUME.md:267`) | **280** — 239 Phase 2 + 41 Phase 3 | §5.1 |
| Two of the four `AGENTS.md` surface additions are open | **One.** `controllers/logout.controller.ts` landed too — `AGENTS.md:230` | §6.4 |
| EH-W3 and EH-W5 remain open | **Both closed.** All five EH items shipped 2026-08-11 | §1.2 |

### 1.1 The S1 register, re-verified against the working tree

`RESUME.md` §6 carried eight entries as S1-bearing. Each was re-read against the code on 2026-08-11, not
against its Phase 2 entry — **two entries still describe pre-fix code in their headers and findings.**

**8 found · 3 downgraded · 5 open.**

| # | Entry | Phase 2 | Working tree, 2026-08-11 | Entry accurate? |
|---|---|---|---|---|
| 1 | [`RFC8628-device-authorization-grant.md`](02-findings/RFC8628-device-authorization-grant.md) | S1 | **Downgraded.** `POST /api/device/complete` gated by `developmentOnly` + `deviceCodeLimiter` (`server/src/routes/device.routes.ts:27`); `/verification` and `POST /device` carry `deviceCodeLimiter` (`:26`, `:31`). **8628-W1 ✅ and 8628-W2 ✅** | ❌ **stale** — header still reads S1, work items still read "close this" |
| 2 | [`OIDC-RP-INITIATED-LOGOUT-1.0.md`](02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md) | S1 | **Downgraded.** `isAllowedPostLogoutRedirectUri` (`server/src/services/logout.service.ts:33-70`) parses with `new URL()` and compares origins exactly; both verified payloads refused; malformed allowlist entries dropped rather than widening | ❌ **stale** — header still reads S1 |
| 3 | [`ERRORHANDLER-STATUS-INVERSION.md`](02-findings/ERRORHANDLER-STATUS-INVERSION.md) | S1 | **Closed.** `errorStatusFrom()` (`server/src/middleware/errorHandler.ts:25-33`) trusts a supplied status only inside 400–599. **All five items EH-W1…W5 ✅** | ✅ banner + severity revised S1→S3 |
| 4 | [`FAPI-2.0-SECURITY-PROFILE.md`](02-findings/FAPI-2.0-SECURITY-PROFILE.md) | S1 | **Partially remediated.** All six posture fields read live (`server/src/controllers/fapi.controller.ts:51-64`). **FAPI2-W1 ✅, FAPI2-W2 ✅**; W3/W4/W5/W6 open | ✅ banner + severity revised S1→S2 |
| 5 | [`RFC7662-token-introspection.md`](02-findings/RFC7662-token-introspection.md) | S1 | **OPEN — and worse than the entry.** `server/src/routes/introspection.routes.ts:7-8` carries **no middleware at all**: no authentication, no rate limiter. New corroboration: discovery advertises `introspection_endpoint_auth_methods_supported: []` | ✅ |
| 6 | [`RFC9700-security-bcp.md`](02-findings/RFC9700-security-bcp.md) | S1 | ~~OPEN~~ → **CLOSED 2026-08-11 (T0-1).** `body: parameters` is gone from both sites; they log `{ length }` only, locked by `server/tests/unit/services/credential-logging.test.ts`. **9700-W1 ✅ and 9700-W2 ✅**, severity **S1 → S2** on F-4a's residue. The non-F-1 findings stand: discovery confirms `implicit` + `password` in `grant_types_supported` and `plain` in `code_challenge_methods_supported` | ✅ banner + severity revised S1→S2 |
| 7 | [`RFC7636-pkce.md`](02-findings/RFC7636-pkce.md) | S1 | **OPEN, narrowed — a fourth downgrade is available at Gate 4.** The false-reporting half died with FAPI2-W1. The substantive half is live: `plain` is advertised, and `pkceRequired` is *still unreadable* because `service.get()` throws, so 7636-W3 cannot be closed until the enum gap is | ⚠️ severity basis halved |
| 8 | [`RFC9470-step-up-authentication.md`](02-findings/RFC9470-step-up-authentication.md) | latent S1 | **OPEN, and reachable through an advertised capability.** `server/src/controllers/authorization.controller.ts:107-111` still fabricates `{acr:"pwd", authTime: now}`; `server/src/services/authorization.service.ts:101-102` forwards both to Authlete. **New:** `prompt_values_supported` includes `"none"`, so the path is *advertised in discovery* | ✅ its own header reads **S2 + latent S1**, not S1 |

**Two honesty notes on the count.** Entry 8's own header reads *"S2 — with one latent S1"*, so "eight S1s" is
`RESUME.md` §6's framing rather than eight S1 severity headers; the precise composition is **seven S1 headers
plus one latent S1**. And entry 7's severity rests on two halves, one of which is now fixed. Neither changes
the actionable count: **five are open**, and Gate 4 should rule on whether entry 7 joins the downgraded column.

**Where the five open S1s land in the tiers**, since three of them do not qualify for Tier 0:

| Open S1 | Tier | Why not sooner |
|---|---|---|
| RFC 9700 — request-body logging | **T0-1** | No curriculum dependency; already grepped clean. Ships first |
| RFC 9470 — fabricated `acr`/`auth_time` | **T1-7** | Must ship as one change with OIDC-W1; needs a plan; Module 09a Ex 4 checked and unaffected |
| RFC 7662 — unauthenticated introspection | **T1-1** | Behaviour change with a real curriculum dependency: Module 11 uses this as a live exploit and Module 04's expected outputs go 200→401 |
| RFC 7636 — PKCE not required | **T3** | Inseparable from the FAPI 2.0 decision — requiring PKCE-S256 is one of FAPI 2.0's `shall`s |
| FAPI 2.0 — profile not enabled | **T3** | The Gate 4 decision itself (FAPI2-W5) |

**Severity calibration, stated rather than assumed.** RFC 7662's spec severity is S1 (§2.1 is a MUST). Its
*practical* severity in this deployment is lower: the tokens exposed belong to a demo `admin:password` subject
on an ephemeral tunnel, and no real user data is reachable. That is a reason to sequence it in Tier 1 behind a
curriculum grep — **not** a reason to leave it open, and the plan does not.

### 1.2 Already shipped — do not re-plan

| Shipped | Items closed | Evidence |
|---|---|---|
| 2026-08-10 | **8628-W1, 8628-W2** (device approval oracle + rate limits) | `server/src/routes/device.routes.ts:25-32`, `server/tests/unit/routes/device.routes.test.ts` |
| 2026-08-10 | The logout open redirect (**not RPL-W1** — see §6.3) | `server/src/services/logout.service.ts:33-70` |
| 2026-08-10 | Three of four `AGENTS.md` surface additions | `AGENTS.md:225`, `AGENTS.md:230` |
| 2026-08-11 | **EH-W1, EH-W2, EH-W3, EH-W4, EH-W5** — all five | `server/src/middleware/errorHandler.ts:25-33`; `AGENTS.md:357-359`; Module 10 Ex 4 reframed |
| 2026-08-11 | **FAPI2-W1, FAPI2-W2** (widened from five literals to six fields) | `server/src/controllers/fapi.controller.ts:51-64` |
| 2026-08-11 | **9700-W1, 9700-W2** — **T0-1, the first Phase 5 action.** Request-body logging stopped at both sites | `server/src/services/token.service.ts:57-60`, `server/src/services/revocation.service.ts:64-67`, `server/tests/unit/services/credential-logging.test.ts`; `AGENTS.md:363` |

**EH-W5's sweep, re-run independently here, agrees and adds one item.** The clamp covers every path that
reaches the global handler. Four sites derive a status from a caught error locally and therefore bypass it:
`server/src/controllers/par.controller.ts:42` and the `AppError`-narrowed branches in
`server/src/controllers/ciba.controller.ts:59`, `server/src/controllers/device.controller.ts:52` and
`server/src/utils/controller-error.ts:12` are **safe by construction** (this repo's own error types, deliberate
statuses); `server/src/controllers/userinfo.controller.ts:165-166` is safe for the same reason, via
`isTokenPresentationError`. The two the entry names — `server/src/controllers/jwks.controller.ts:17` and
`server/src/services/health.service.ts:49` — read a status from an SDK error **by design** and must not be
clamped. **The residue is one line of API surface: `errorStatusFrom` is not exported** (it is declared
`function` at `server/src/middleware/errorHandler.ts:25`), so the guarantee is not reusable and the next
controller that catches an `AuthleteError` and derives its own status will reintroduce the inversion. Tracked
as **T2-9**.

---

## 2. Verification items closed in this phase

`RESUME.md` §8.3 listed three cheap items. **All three are now closed**, and two produced more than expected.

### 2.1 CUR-3d-W1 — the RFC 9846 obsoletion question ✅ **SPEC-INVENTORY.md was right; Module 00 is stale**

Four fetches, 2026-08-11. This was *"the largest remaining hole in the audit's citation coverage"*.

| Identifier | Exact title | Status | Date | Relationships |
|---|---|---|---|---|
| **RFC 9846** | The Transport Layer Security (TLS) Protocol Version 1.3 | Standards Track | **July 2026** | **Obsoletes 5077, 5246, 6961, 7627, 8422, 8446**; Updates 5705, 6066 |
| RFC 8446 | The Transport Layer Security (TLS) Protocol Version 1.3 | Standards Track | Aug 2018 | **Obsoleted by RFC 9846** — the page carries *"This RFC is now obsolete, see RFC 9846"* |
| RFC 9110 | HTTP Semantics | **Internet Standard (STD 97)** | June 2022 | Obsoletes 2818, 7231–7233, 7235, 7538, 7615, 7694, part of 7230. Not obsoleted |
| RFC 9864 | Fully-Specified Algorithms for JSON Object Signing and Encryption (JOSE) and CBOR Object Signing and Encryption (COSE) | Proposed Standard | **Dec 2025** | **Updates RFC 7518, 8037, 9053** |

Sources fetched 2026-08-11: `https://www.rfc-editor.org/rfc/rfc9846.txt` (header block read verbatim),
`https://www.rfc-editor.org/info/rfc8446`, `https://www.rfc-editor.org/info/rfc9110`,
`https://www.rfc-editor.org/info/rfc9864`.

**Resolution — and the direction is the opposite of what 3d-F3 assumed.** 3d-F3 recorded the obsoletion as *an
assertion the audit had not verified*, implying `SPEC-INVENTORY.md` might be over-claiming. It is not:
`docs/curriculum/SPEC-INVENTORY.md:42-50` is **correct on every particular** — the number, the July 2026 date,
the obsoletion, and its explanatory note (same wire version, backward compatible, *"obsolescence lives in the
Datatracker metadata, not in the RFC text"*). That note is the best piece of citation pedagogy in the file and
should be left exactly as it is.

**Module 00 is the file that needs the edit.** `docs/curriculum/modules/00-web-and-jose-foundations/README.md:87`
and `:250` both cite *"RFC 8446 (Aug 2018)"*. Neither is factually wrong — RFC 8446 **is** August 2018 — but
both now cite a superseded document without saying so, in the module that teaches citation hygiene. RFC 9110 at
`:88` is confirmed correct and needs nothing; the status can be sharpened to **Internet Standard, STD 97**.

**RFC 9864 is a new row this audit did not have.** It updates RFC 7518, which is the RFC Module 00 correctly
cites for `alg: "none"` at `:93`. `none` is not a polymorphic algorithm, so **§3.6 is unaffected in substance
and the citation stands** — but a file teaching JOSE identifiers should know that its algorithm registry now has
a fully-specified successor. One inventory row, one cross-reference. Tracked as **T2-4**.

### 2.2 ATT-W5 — the full discovery member list ✅ **and it corroborated nineteen findings**

One authorised read-only call, 2026-08-11: `GET /api/{serviceId}/service/configuration` → **HTTP 200, exactly
62 members**, confirming the count `SERVICE-CONFIG-PROBE.md:178` recorded. Response retained locally; no
credential appears in this file.

**The two questions ATT-W5 was scheduled to answer:**

| Member | Result |
|---|---|
| `challenge_endpoint` | **ABSENT** |
| `client_attestation_pop_methods_supported` | **ABSENT** |

**But the answer is sharper than either alternative the entry anticipated,** because two *sibling* attestation
members **are** present with full algorithm lists — `client_attestation_signing_alg_values_supported` and
`client_attestation_pop_signing_alg_values_supported` (14 and 11 algorithms) — and
`attest_jwt_client_auth` is in `token_endpoint_auth_methods_supported`. So attestation-based client
authentication is advertised in **three** dimensions and missing the one endpoint a client would need. That is
theme 1 in its purest form, and it is now evidenced from a single document rather than inferred.

**Nineteen findings corroborated from the same response.** Nine members are **absent** and each one backs a
`README.md` claim that the feature works:

| Absent member | Finding it corroborates |
|---|---|
| `native_sso_supported` | NSSO-W1 |
| `client_id_metadata_document_supported` | CIMD-W2, MCP-W4 |
| `credential_issuer` | VCI-W1, VCI-W2 |
| `registration_endpoint` | 7592-W3, MCP-W4 |
| `acr_values_supported` | 9470-W5 |
| `authorization_details_types_supported` | 9396-W1 |
| `backchannel_logout_supported` | BCL-W5 |
| `frontchannel_logout_supported` | FCL-W3 |
| `check_session_iframe` | SM-W2 |

Ten present members corroborate the rest:

| Member | Value | Finding |
|---|---|---|
| `issuer` | `https://blackadi.dev` — while **every** endpoint is on `…ngrok-free.dev` | **8414-W1**, AM-W1, 9207-W2, 8628-W5 |
| `token_endpoint_auth_methods_supported` | nine methods incl. `spiffe_jwt`, `tls_client_auth`, `self_signed_tls_client_auth`, `attest_jwt_client_auth` | **ATT-W3**, 8705-W1 |
| `id_token_signing_alg_values_supported` | `HS256, HS512, ES256, HS384` — **no RS256, no PS256** | OIDC-W2, FAPI1A-W2, CUR-3b-W9 |
| `response_modes_supported` | all four JARM modes present | JARM-W1, **JARM-W4** |
| `code_challenge_methods_supported` | `plain`, `S256` | 7636-W3, 9700-W4 |
| `grant_types_supported` | incl. `implicit`, `password`, `…pre-authorized_code` | 9700-W3, MCP-W5, VCI-W1 |
| `grant_management_actions_supported` | all five; `grant_management_action_required: false` | GM-W2, GM-W5 |
| `backchannel_token_delivery_modes_supported` | `poll`, `ping`, `push` | CIBA-W4 |
| `tls_client_certificate_bound_access_tokens` | `false` — while two mTLS auth methods are advertised | 8705-W1, FAPI2-W4 |
| `prompt_values_supported` | **includes `none`** | **9470-W3 / OIDC-W1** |

**Three results that change a finding rather than confirm it:**

1. **`introspection_endpoint_auth_methods_supported: []` and `revocation_endpoint_auth_methods_supported: []`.**
   Empty arrays. RFC 8414 §2 makes both OPTIONAL, so absence would be unremarkable — but an *empty array* is a
   positive statement that no authentication method is supported, published by an endpoint that in fact accepts
   every unauthenticated caller (`server/src/routes/introspection.routes.ts:7-8`). This is the **mirror image of
   theme 1**: not advertised-but-unusable, but *advertised-as-nothing while accepting everything*. It
   strengthens RFC 7662's S1 with the deployment's own metadata.

2. **`id_token_signing_alg_values_supported` includes `ES256`.** CUR-3b-W9 was scoped to add *"shall use PS256,
   ES256 or EdDSA"* → **FAIL** to Module 10's table. The measured value makes that too blunt: the service
   advertises **one algorithm FAPI 2.0 permits (`ES256`) alongside three it forbids (`HS256`, `HS384`,
   `HS512`)**, and the client in use is HS256. The honest row is *"partially — the permitted algorithm is
   available and the forbidden ones are not withdrawn"*, which is a better lesson than a flat FAIL.
   **CUR-3b-W9's acceptance criteria need this correction before it ships.**

3. **`prompt_values_supported` includes `none`.** The fabricated `acr`/`auth_time` path
   (`server/src/controllers/authorization.controller.ts:96-111`) is reachable through a capability this service
   *advertises*, not an obscure one. The latent S1 is materially closer to the surface than the Phase 2 entry
   could establish, and `acrs`/`acrEssential`/`maxAge` — stored at `:89-91` — are never consulted on the
   auto-issue branch, so a `prompt=none` request carrying `acr_values` with `acrEssential` receives a token
   asserting `acr: "pwd"` regardless.

### 2.3 AM-W2 — the superseded-URL question ✅ **closed; there is no superseded version**

Fetched 2026-08-11: `https://openid.net/specs/fapi-attacker-model-2_0.html` → **"FAPI 2.0 Attacker Model",
Final, 22 February 2025**, declaring no supersession. Identical title, status and date to the `-final`-suffixed
URL already recorded in `RESUME.md` §2.3. **Both slugs serve the same document**; the URL trap is the Security
Profile's alone (`fapi-2_0-security-profile-final.html` 404s — `RESUME.md` §2.4). One of the ten
`01-spec-matrix.md` §7 spot-check rows retires.

**A free second result:** the fetch independently reports **six** attacker personas, confirming 3b-F13 from the
primary source — Module 10 is right and `FAPI-2.0-ATTACKER-MODEL.md`'s prose is wrong. **CUR-3b-W15 is now
evidenced, not merely argued.**

### 2.4 Still unverified, deliberately

Three fetches remain unmade, and Phase 5 should not treat them as oversights:

| Item | Why it is still open |
|---|---|
| **CUR-3b-W12** — RFC 9101 §10.1 vs §6.2 | A section-level question inside a spec whose title/date are already verified. Out of scope for this phase by instruction; one fetch in Phase 5 |
| **8252-W1** — RFC 8252 §7.3 wording | Same shape. The entry's verdict is confirmed-pending-this |
| ISO/IEC 18013-5 | **Paywalled.** `MDL-MDOC-ISO18013-5.md` F-1 records why and cites nothing from it. MDL-W2 exists so the curriculum's verification promise carves this case out honestly |

---

## 3. No rebuild — the numbers, restated

Settled at Gate 2 (`RESUME.md` §5.1); Phase 4 does not reopen it, and nothing found in this phase moves it.

- **35 of 36** Authlete action mappings complete against the SDK enums; every branch point has a `default`.
- **Four** cases that read like bugs are correct: `native-sso` literals, the `hsk` list map, the `vci`
  asymmetric maps, and `device`'s `ACCESS_DENIED` (a request `result`, not a response action).
- **Three** specs needed no work at all — RFC 6749, RFC 6750, RFC 7521 — plus RFC 7009 after its probe.
- **18** work items are explicit no-ops recording that the code is correct: `6750-W1`, `7521-W1`, `7522-W3`,
  `7636-W4`, `8693-W4`, `8705-W4`, `8707-W4`, `9207-W3`, `9396-W3`, `9701-W2`, `9901-W3`, `9901-W4`, `AM-W4`,
  `HAIP-W4`, `HSK-W4`, `MDL-W4`, `VCI-W4`, `VP-W4`.
- Defect concentration: **five endpoints** share one wire-format pattern; **one clause** in one middleware
  inverted every failure status (now fixed); **~12 configuration flags** account for every `MISCONFIGURED`
  verdict; **four documents** carry one stale line-number set.

**Scope: roughly 15 source files, one console configuration pass, and a documentation pass.** The plan in §7
is sized to that and no larger.

---

## 4. The five systemic themes

The aggregation unit for 55 findings. Each theme now carries the ATT-W5 evidence, which is why three of them
are sharper here than in `RESUME.md` §5.2.

### Theme 1 — Advertised but unusable

**A capability appears in the discovery document that no client can exercise.** Phase 2 identified four
instances; the discovery document shows **eight**, plus two inverse cases.

| Advertised | Blocked by | Item |
|---|---|---|
| All four JARM response modes | No client has `authorizationSignAlg` | JARM-W1 |
| `private_key_jwt` | No client configured with it, no client JWKS | **7523-W4** |
| `tls_client_auth`, `self_signed_tls_client_auth` | mTLS declined; `tls_client_certificate_bound_access_tokens: false` | 8705-W1 |
| `attest_jwt_client_auth` (+ both attestation alg lists) | **`challenge_endpoint` absent** | ATT-W3 |
| `spiffe_jwt` | Breaks `service.get()` in SDK 1.0.0 — the enum gap | ATT-W3 |
| All five grant-management actions | Authorization-request side never exercised | GM-W2 |
| All three CIBA delivery modes | No client has `bcDeliveryMode` | CIBA-W4 |
| 14 request-object signing algorithms; `require_request_uri_registration: true` | No client has an asymmetric key or `requestUris` | 9101-W2, **9101-W3** |

**Five of the nine advertised client-auth methods are unusable** — Phase 2 said four; `private_key_jwt` is the
fifth, and it is the one worth fixing rather than withdrawing.

**Two inverse cases, and they matter because they are the ones a reader of the metadata would never find:**

- **Accepted but unadvertisable** — parameterized scopes work and have no discovery member (PS-W2).
- **Advertised as nothing, accepting everything** — `introspection_endpoint_auth_methods_supported: []` and
  `revocation_endpoint_auth_methods_supported: []` on endpoints with no authentication (§2.2, RFC 7662 S1).

Module 09a's own taxonomy (`lab.md:120-124`) already has the vocabulary for the first two states
(*"supported but not required"*, *"permitted but not configured"*); it needs the third and fourth.
**Remedy:** ATT-W3 as one console decision, plus PS-W2 and 8705-W3 as the teaching material.

### Theme 2 — Claimed working, service flag off

**Four features `README.md` presents as shipped are disabled at the service.** Nine absent discovery members
back this (§2.2): Native SSO, FAPI 2.0, VCI and MCP/CIMD, plus back-channel logout, front-channel logout and
Session Management.

The code is right in every case — routing, auth tiers and action mapping all verified. The claim is wrong.

**Remedy: NSSO-W4, and §7.3 upgrades it.** Rather than hand-correcting four tables that will drift again,
derive or check them against the live document. One call returns all 62 members; a check script can diff the
claims against it. That converts a recurring documentation defect into a CI failure.

### Theme 3 — Authlete's envelope crossing the boundary

**Five endpoints speak the vendor's internal shape on paths they advertise as standard.** Token and
grant-management get it right, which is what proves the pattern is fixable rather than structural.

| Endpoint | Wire-format gap | Body-shape gap |
|---|---|---|
| `/api/par` (RFC 9126) | 9126-W1 | 9126-W2 |
| `/api/ciba/authentication` (CIBA §7.1) | CIBA-W1 | CIBA-W2 (returns a `ticket`, not `auth_req_id`) |
| `/api/device/authorization` (RFC 8628 §3.1) | 8628-W4 | 8628-W3 |
| `/api/client/dcr/register` (RFC 7591) | — | 7591-W1 |
| `/api/jar/process` | — | B1-W1 (and B1-W2: it emits tickets unauthenticated) |

**Remedy: two patterns, not five endpoints.** `responseContent`-as-body (9126-W2 + 8628-W3 + 7591-W1 + B1-W1)
is three lines each and follows `token.controller.ts:52`. Accept-the-standard-wire-format (9126-W1 + CIBA-W1 +
8628-W4) is one shared parsing helper. **Do the body-shape pattern first** — it is what a conformant client
needs *after* the wire format lets it in.

### Theme 4 — `accessTokenDuration = 86400`

**One configuration value is load-bearing for four findings.** Grant revocation leaves a 24-hour access token
live (Grant Management §6.5), token exchange mints 24-hour tokens, ID tokens live 24 hours, and FAPI Baseline
§5.2.2's guidance is 10 minutes.

**One change: GM-W1 = OIDC-W4 = FAPI1-W3.** Schedule it once. `refreshTokenDuration` (864000) rides with it.

### Theme 5 — Citation provenance

**Where a status, date or version was taken from recall or a sibling document rather than a fetched header, it
was wrong.** Native SSO's date, Federation's version, CIMD's revision, the attestation draft's missing row,
`AGENTS.md`'s 60s/60min error, three stale line-number sets, and the TLS obsoletion — resolved in §2.1 as the
*inventory being right and the module being stale*, which is itself an instance: 3d-F3 assumed the direction
from a grep.

**This theme also indicts the audit.** Eight findings correct the audit rather than the repo (§1). Every one
came from the same failure mode.

**Remedy: FED-W4 — per-row provenance.** Every `SPEC-INVENTORY.md` row records the URL fetched and the header
line the status and date came from. It would have caught all three instances of the class, and it is the one
process change that makes the next audit cheaper.

---

## 5. Work-item reconciliation

### 5.1 The count

| Source | Unique IDs |
|---|---|
| Phase 2 — 55 entries in `02-findings/` | **239** |
| Phase 3 — `03-curriculum-audit.md` batches 3a–3d | **41** |
| **Total** | **280** |

`RESUME.md:267` estimated *"~120"*. The estimate was low by a factor of 2.3 — recorded here because a plan
built for 120 items would have silently dropped half of them.

**280 reduces to 55 numbered actions.** The reduction:

| Reduction | IDs | How |
|---|---|---|
| Already shipped | 9 | §1.2 |
| Explicit no-ops | 18 | §3 |
| Already satisfied, already done, or closed in this phase | 11 | §5.3 |
| Deliberately deferred beyond this plan | 5 | §7.1 |
| **Remaining, folded into 55 numbered actions via §5.2's clusters** | **237** | §7 |

**Every one of the 280 is accounted for.** The mapping was checked mechanically, not by eye: the set of IDs
appearing in this file and in [`05-decision-records.md`](05-decision-records.md) was diffed against the set
extracted from all 56 audit sources. That check found 21 items this plan had initially dropped, all of which are
now scheduled — which is the same lesson as §1's calibration table, applied to the plan itself.

### 5.2 Identity and containment clusters

`=` means the same change under different prefixes. `⊃` means the first item's scope contains the second's.
**Every cluster is scheduled once, under the ID in bold.**

| # | Cluster | Action |
|---|---|---|
| 1 | **GM-W1** = OIDC-W4 = FAPI1-W3 | `accessTokenDuration` (theme 4) |
| 2 | ~~FAPI2-W1 = 7636-W1 = 9700-W4~~ | ✅ shipped |
| 3 | ~~EH-W1 = FAPI2-W2~~ | ✅ shipped |
| 4 | **7523-W4** = 9101-W3; prerequisite of FAPI2-W5, FAPI1-W4, MS-W5 | One client with `private_key_jwt` + a JWKS |
| 5 | **OIDC-W2** = FAPI1A-W2 | One registered RSA key |
| 6 | **FAPI1-W1** = FAPI1A-W3 ⊃ CUR-3b-W10 | The 60s/60min error, in `AGENTS.md` **and** Module 05 |
| 7 | **ATT-W3** ⊃ 8705-W1 ⊃ CIMD-W3 ⊃ the `SPIFFE_JWT` question | One `supportedTokenAuthMethods` review |
| 8 | **JOSE-W2** ⊃ MS-W3 | Drop `none` from both advertised alg lists |
| 9 | **9449-W1** ⊃ 9126-W4 ⊃ 9449-W2; retires CUR-3b-W11 | Route every `htu` through `dpopHttpTarget()` |
| 10 | **9449-W3** ⊃ GM-W4 | One shared bearer/DPoP extractor |
| 11 | **7662-W1** = 9701-W2 | Introspection caller authentication |
| 12 | **MS-W1** = 9701-W1 | `action: "JWT"` → 200 `application/token-introspection+jwt` |
| 13 | **JOSE-W1** ⊃ BCL-W1 | `jwt.verify` hygiene rule — `issuer` + `audience` everywhere |
| 14 | **OIDC-W1** = 9470-W3 | `prompt=none` + the fabricated event. **Must not be split** |
| 15 | **OIDC-W3** = 9207-W1 = MCP-W2; pairs with JARM-W3 | Client-side `iss` / `sub` / JARM verification |
| 16 | **9126-W2** + 8628-W3 + 7591-W1 + B1-W1 | The `responseContent`-as-body pattern (theme 3) |
| 17 | **9126-W1** + CIBA-W1 + 8628-W4 | The accept-standard-wire-format pattern (theme 3) |
| 18 | **8693-W3** ⊃ CUR-3b-W6 ⊃ CUR-3c-W10 | Stale handler line numbers — **four** documents |
| 19 | **CUR-3b-W1** ⊃ CUR-3d-W2 | Six stale open-redirect references |
| 20 | **CUR-3a-W1** + CUR-3b-W5 + CUR-3c-W11 | Three `check-docs.mjs` detection gaps — one change |
| 21 | **9470-W1** ⊃ CUR-3c-W6 ⊃ CUR-3b-W8 | The step-up challenge status, including the diagram arrow |
| 22 | **9126-W5** = CUR-3c-W7 ⊂ FAPI2-W6 | `/api/authorize` → `/api/authorization`, two files |
| 23 | **NSSO-W3** = CUR-3b-W13 | The Native SSO date — five files |
| 24 | **FCL-W4** = SM-W3 | "Durable OP session identity" as one blocker, not four |
| 25 | **NSSO-W4** ⊃ FAPI2-W3 ⊃ MCP-W3 ⊃ VCI-W1's doc half | The claimed-working/flag-off table (theme 2) |
| 26 | **CUR-3c-W2** = 8414-W5 ⊂ MCP-W3 | The MCP opening sentence |
| 27 | **B1-W4** = 7009-W3 | The two echoing `default` branches |
| 28 | **7662-W2** = 7009-W2 | Rate limiters on introspection and revocation |
| 30 | **B1-W1** = 9101-W1 | Same change, recorded under two prefixes — folded into cluster 16 |
| 31 | **FAPI2-W4** ⊃ 7636-W2 | Report the whole profile, `pkceS256Required` included |
| 32 | **7523-W2** = JOSE-W3 | Require `exp` on JWT-bearer assertions — RFC 7519 §4.1.4 framing |
| 33 | **ATT-W2** + ATT-W4 | Both blocked on the same absent `challenge_endpoint` (§2.2) |
| 29 | **HAIP-W2** + NSSO-W3 + FED-W3 + CIMD-W1 + FCL-W2 + SM-W2 + ATT-W1 + 9701-W4 + 9901-W1 + VP-W2 + HSK-W2 + PS-W1 + ATTR-W3 + MDL-W3 + §2.1's outcome | **One `SPEC-INVENTORY.md` pass** — 15 IDs, one commit |

### 5.3 Items that need no work

| Item | Status | Established by |
|---|---|---|
| **CUR-3a-W5** — name `fapiModes` in Modules 01 and 07 | ✅ **already satisfied** | 3d-F2 — both modules name it; Module 01 goes further and records the misdiagnosis |
| **AM-W3** — use A1–A5 as Module 10's vocabulary | ✅ **already satisfied** | Batch 3b — Module 10 uses all six as working vocabulary |
| **CUR-3d-W4** — correct 3c's Module 07 graph note | ✅ **already done** in `03-curriculum-audit.md` | 3d-F1 |
| **CUR-3a-W4** — verify RFC 8446 / 9110 dates | ✅ **closed** | §2.1 |
| **CUR-3d-W1** — the obsoletion question | ✅ **closed** | §2.1 — direction inverted; the edit is Module 00's |
| **ATT-W5** — the full discovery member list | ✅ **closed** | §2.2 |
| **AM-W2** — the superseded URL | ✅ **closed** | §2.3 |
| **7009-W1** — verify RFC 7009 §2.2 behaviour | ✅ **already done** — struck through in its own entry; the probe upgraded the verdict | `RFC7009-token-revocation.md` |
| **9901-W2** — audit `sd-jwt.mjs` against §§4.2.3/4.2.4/7.3 | ✅ **done in batch 3c** — the script was *executed*, not inspected. The three defects it found are **T2-6** | 3c-F1…F3 |
| **CUR-3a-W7** — record the lab-versus-remediation coupling for Phase 4 | ✅ **satisfied by §6 of this file** — the register, now bidirectional | §6.1, §6.2 |
| **CUR-3d-W3** — close CUR-3a-W5 as satisfied and correct 3a-F5 | ✅ **satisfied by this table** — the forward dependency on FAPI2-W5 is the part that carries, and it is **DR-02** | 3d-F2 |

### 5.4 The highest-leverage five

Unchanged from `RESUME.md` §5.4 except that one has shipped and one is re-pointed:

1. **CUR-3c-W1** — the `UNVERIFIED` convention across nine tutorials. The aggregate behind six S2s. A writing task.
2. **7523-W4** — one client with `private_key_jwt` + a JWKS. Unblocks RFC 7523 §2.2, asymmetric JAR, and FAPI.
3. **ATT-W3** — one `supportedTokenAuthMethods` review. Subsumes the mTLS metadata fix, the attestation finding and `SPIFFE_JWT`.
4. **OIDC-W2** — one registered RSA key. Satisfies OIDC Discovery §3's RS256 MUST and FAPI's PS256.
5. ~~**EH-W1**~~ ✅ → **9700-W1**. Two lines, an S1, and no curriculum impact.

---

## 6. The lab-breakage register — both directions

`RESUME.md` §8.2 item 3. Phase 3 opened this one-directionally; batch 3b found the inverse coupling. **Both
columns must be checked before any Tier 1 configuration change ships.**

### 6.1 Fixes that break a correct lab

| Lab | Broken by | Mitigation | State |
|---|---|---|---|
| Module 00 Ex 2 — expects `key count: 1`, EC key at `keys[0]` | **OIDC-W2** | **CUR-3a-W3** — select by `kty === 'EC'`, drop the count | ⬜ **must land first** |
| Module 04 introspection steps; Module 11 exercises using unauthenticated admin access as live exploits | **7662-W1** | `grep -rn "introspection" docs/curriculum/modules`; expected outputs go 200 → 401 | ⬜ **grep before, not after** |
| Module 04 opaque-token exercises; `STEP-UP-AUTH-TUTORIAL.md` Part 4 | **9068-W1** | 9068-W3 (separate the two halves) and 9068-W4 (label the payload) first | ⬜ Tier 3 |
| Module 10 Ex 4 — the 200-with-stack-trace | Dropping **`SPIFFE_JWT`** — **not** EH-W1 | **EH-W4 ✅** reframed it as *two defects, one symptom*; the 200 kept as a dated historical transcript | ✅ mitigated |
| Module 06 Ex 6b — the four silent discards | **8693-W5** | Not recommended. If taken: lab + quiz-answers + Part 12 + `PROGRESS.md` in the same commit | ⬜ Tier 3, discouraged |
| Module 01 Ex 3 + Module 07 §3b — both hinge on ROPC succeeding | **FAPI2-W5** | ✅ **already mitigated** — both modules name `fapiModes` (3d-F2) | ✅ closed |
| Module 05 Ex 3–4 | if `parRequired` were ever set `true` | ✅ Module 05 already declares the dependency (`lab.md:23-35`) | ✅ closed |

### 6.2 Fixes that complete a lab currently marked `UNVERIFIED`

The direction the register was missing. **These four make Tier 1 net-positive for the curriculum**, which is
the argument for scheduling configuration before documentation.

| Lab | Completed by | Retires |
|---|---|---|
| Module 09a Ex 2 / 2a — JARM | **JARM-W1** (`authorizationSignAlg = ES256`) | one `UNVERIFIED` marker; also makes JARM-W2 answerable |
| Module 09a Ex 3 — CIBA delivery mode | **CIBA-W4** (`bcDeliveryMode`) | one marker |
| Module 09a Ex 4 — the ACR *success* path | **9470-W5** (`supportedAcrs` → `acr_values_supported`) | one marker |
| Module 09a Ex 5 — RAR | **9396-W1** (register one `authorization_details` type) | one marker; exercises the consent-render path for the first time |
| Module 08 asymmetric ID-token validation (`lab.md:365-399`) | **OIDC-W2** | the branch has never run |
| Module 09b — SD-JWT | **CUR-3c-W3** + **CUR-3c-W5** (trailing tilde + a test file) | fixes a wrong ACCEPT |

**One change appears in both columns.** **OIDC-W2** breaks Module 00 Ex 2 *and* completes Module 08's
asymmetric branch. That is the clearest argument for keeping the register bidirectional: judged from column one
alone, OIDC-W2 looks like a cost.

### 6.3 Live drift — the register's third category

Not a forward dependency. **A fix has already shipped and the curriculum still teaches the pre-fix behaviour.**

| Where | State |
|---|---|
| Module 10 — five references to the logout open redirect (`README.md:205`; `lab.md:81-91,423,430-431,469`) | ⚠️ **stale since 2026-08-10.** CUR-3b-W1 |
| `final-exam-answers.md:227-229` — a sixth reference | ⚠️ **stale.** CUR-3d-W2 (3d-F4) |
| `02-findings/RFC8628-…md`, `02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md` | ⚠️ **the audit's own entries are stale** (§1.1). Add fixed-banners, as `ERRORHANDLER-…` and `FAPI-2.0-…` already carry |

**Why it happened, and the fix for the process.** The 2026-08-10 change correctly updated `AGENTS.md`,
`docs/API.md`, `docs/DEVICE-FLOW-TUTORIAL.md`, `PROGRESS.md`, the tests and **Module 08** — and missed
**Module 10**, which cross-references Module 08 five times. `AGENTS.md`'s existing rule (*"grep the curriculum
for the symptom you changed"*) would have caught it only if the search term had been the **phrase** *"open
redirect"* rather than an error string. **CUR-3b-W2** fixes the rule; §7.4 makes it a per-commit checklist step
rather than a habit.

### 6.4 `AGENTS.md` Security-critical surfaces — the four additions, decided

`RESUME.md` §5.3 named four files. **Re-verified against `AGENTS.md` on 2026-08-11: three have landed, not
two.**

| File | Concern row | State |
|---|---|---|
| `routes/device.routes.ts` | Access control | ✅ **landed** — `AGENTS.md:225` |
| `middleware/development-only.ts` | Access control | ✅ landed (added with it) |
| `services/logout.service.ts` | Session termination & redirect targets | ✅ **landed** — `AGENTS.md:230` |
| `controllers/logout.controller.ts` | Session termination & redirect targets | ✅ **landed** — `AGENTS.md:230` |
| **`middleware/errorHandler.ts`** | — | ⬜ **the only one still open** |

**Decision: add it.** Full reasoning in [`05-decision-records.md`](05-decision-records.md) DR-12. In short — it
decides the HTTP status of every failure across all 57 SDK call sites, it *and only it* gates stack-trace
disclosure (`server/src/middleware/errorHandler.ts:65` and `:77`, both on `isDevelopment`), and it has already
produced one security-relevant defect that plan-mode review existed to catch. It needs its **own concern row**;
the existing six are all about token and authorization decisions, and this one is about failure disclosure.

**Four adjacent candidates surfaced across Phase 2 and are explicitly *not* folded in silently.** DR-12 rules
on them; they are listed here so the scope of the decision is visible: `services/jwt-verification.service.ts`
(**recommend add** — it decides what subject a token is minted for), `controllers/introspection-standard.controller.ts`
(**recommend add** — its sibling is listed), `controllers/jar.controller.ts` (**conditional** on B1-W2's auth
posture), `controllers/fapi.controller.ts` (**recommend decline** — it reports posture rather than deciding
outcomes, and FAPI2-W1 locked it with tests in both directions).

---

## 7. The ordered plan

Four tiers, sequenced per `RESUME.md` §8.4. **55 numbered actions** — 6 in Tier 0, 21 in Tier 1, 17 in Tier 2,
11 decisions in Tier 3. Every action names its cluster ID from §5.2, whether it needs plan mode, and its
curriculum coupling. Two rows (**T1-19**, **T2-17**) are deliberately batches of small independent items rather
than single changes.

**Legend.** 📋 = plan mode required (`CLAUDE.md` — the file is on the Security-critical surfaces list, or is a
DR-12 candidate). 🔍 = mandatory curriculum grep before the change lands. ⚙️ = console configuration, no code.

### Tier 0 — ship before Gate 4

Exposure or false reporting, no curriculum dependency. `RESUME.md` §8.4 recorded EH-W1 and FAPI2-W1 as Tier 0
and both shipped 2026-08-11; **this is what remains.**

| # | Action | Items | Notes |
|---|---|---|---|
| **T0-1** | ✅ **SHIPPED 2026-08-11.** **Stop logging request bodies.** Remove `body: parameters` from `server/src/services/token.service.ts:59` and `server/src/services/revocation.service.ts:66`; match `introspection.service.ts`'s length-only pattern. Add a spy-logger test asserting no captured message contains `client_secret`, `password`, `code_verifier`, `refresh_token`, `assertion`, `subject_token` or `actor_token` | 9700-W1 ✅, 9700-W2 ✅ | 📋 Planned under plan mode. **The S1 is closed.** Both blocks kept at four lines deliberately — a deletion would have shifted ~20 `audit/` citations below the edit, which `check-docs.mjs` cannot see. Test: 12 cases, 11 of which fail if the line returns. Suite 514 → **526** / 54 files. Curriculum re-checked by phrase per §7.4 steps 2–4: still empty |
| **T0-2** | **Verify `id_token_hint` before trusting `sub`** — signature against the OP JWKS, plus `iss` and `aud`; an unverifiable hint yields "no subject", never an attacker-chosen one | RPL-W2 | 📋 **Blocks BCL-W5** — no client may register a `backchannel_logout_uri` until this lands |
| **T0-3** | **Add the logout confirmation step** — GET renders a confirm page with a CSRF token; the session dies only on POST | RPL-W3 | 📋 Satisfies RP-Initiated Logout §2's MUST and closes the CSRF-able GET |
| **T0-4** | **Register `postLogoutRedirectUris` on the clients, then switch the comparison to the client's registered set.** W4 before W1 — matching an empty set would break the SPA's logout flow | RPL-W4 ⚙️ → RPL-W1 📋 | **This is the conformance item the 2026-08-10 fix did *not* deliver** (§6.3). RP-Initiated Logout §3 wants exact matching against per-client registered URIs; what shipped was origin-exact matching against `ALLOWED_ORIGINS`. Both are safe; only one is §3 |
| **T0-5** | **Correct `MCP-OAUTH-TUTORIAL.md`'s opening sentence** — name the two preconditions MCP discovery needs here (a self-consistent issuer; `clientIdMetadataDocumentSupported = true`) and that neither holds | CUR-3c-W2, 8414-W5 | Smallest fix with the largest blast radius in Phase 3 |
| **T0-6** | **Add fixed-banners to the two stale audit entries** | §1.1 rows 1–2 | The audit must not be the last carrier of pre-fix state (§6.3) |

### Tier 1 — configuration and contained code

⚙️ items need no code and **four of them complete labs** (§6.2). Sequenced so prerequisites land first.

| # | Action | Items | Notes |
|---|---|---|---|
| **T1-1** | **Require caller authentication on both introspection endpoints**, plus a rate limiter and `parseBasicAuth`. Client auth for `/introspection/standard`; admin Basic for `/introspection` | 7662-W1(=9701-W2), 7662-W2(=7009-W2), 7662-W3 | 📋 🔍 **Open S1, first in tier.** `server/src/routes/introspection.routes.ts:7-8` has no middleware at all. Grep Modules 04 and 11 first — expected outputs go 200→401 |
| **T1-2** | **Register one RSA key** on the service | OIDC-W2 (=FAPI1A-W2) | ⚙️ 🔍 **CUR-3a-W3 must land in the same commit** (§6.1). Completes Module 08's asymmetric branch (§6.2) |
| **T1-3** | **Register one client with `private_key_jwt` + a JWKS** | 7523-W4 (=9101-W3) | ⚙️ Unblocks RFC 7523 §2.2, asymmetric JAR, and every FAPI option |
| **T1-4** | **Shorten `accessTokenDuration`** (and review `idTokenDuration`, `refreshTokenDuration`). In the same pass, apply or retire the two divergent flags `idTokenAudType` and `idTokenReissuable` | GM-W1 = OIDC-W4 = FAPI1-W3; OIDC-W5 | ⚙️ Theme 4. One change, four findings. OIDC-W5 rides here because it is the same console screen — note the handled `ID_TOKEN_REISSUABLE` action is **unreachable** while the flag is `false` |
| **T1-5** | **Review all nine `supportedTokenAuthMethods` together** | ATT-W3 ⊃ 8705-W1 ⊃ CIMD-W3 ⊃ `SPIFFE_JWT` | ⚙️ **DR-07.** Five of nine are unusable (§4 theme 1). Dropping `SPIFFE_JWT` retires Module 10 Ex 4 — see §6.1 |
| **T1-6** | **The four lab-completing settings**: `authorizationSignAlg = ES256`; `bcDeliveryMode`; one `authorization_details` type; `supportedAcrs` incl. `pwd` | JARM-W1, CIBA-W4, 9396-W1, 9470-W5 | ⚙️ §6.2 — retires four `UNVERIFIED` markers in Module 09a |
| **T1-7** | **Fix `prompt=none` and the fabricated event together** | OIDC-W1 = 9470-W3 | 📋 **Open latent S1. Do not ship the first half alone.** `authorization.controller.ts:107-111` + `authorization.service.ts:101-102`; honour `acrs`/`acrEssential`/`maxAge` on this path. Module 09a Ex 4 checked and unaffected (3b-F11) |
| **T1-8** | **Make the `max_age` check able to fail** — compare before `authTime` is overwritten | 9470-W2 | 📋 No test drives `EXCEEDS_MAX_AGE` today |
| **T1-9** | **Route every DPoP `htu` through `dpopHttpTarget()`**; stop reading `targetUri` from the introspection body | 9449-W1 ⊃ 9126-W4, 9449-W2 | 📋 Retires CUR-3b-W11 |
| **T1-10** | **Accept `DPoP` at `/api/gm/:grantId`; refuse the downgrade.** One shared extractor | 9449-W3 ⊃ GM-W4 | 📋 **Run 9449-W4 first** — it gates this item's severity |
| **T1-11** | **The `responseContent`-as-body pattern**, four endpoints — plus an auth posture for `/api/jar/process` | 9126-W2, 8628-W3, 7591-W1, B1-W1 (= 9101-W1), **B1-W2** | Theme 3. Three lines each; follows `token.controller.ts:52`. 7591-W1 must land with 7591-W3's `AGENTS.md` correction. **B1-W2 is not optional**: the endpoint emits Authlete tickets to unauthenticated callers, and admin-only is defensible where unauthenticated is not. It also gates DR-12's ruling on `jar.controller.ts` |
| **T1-12** | **Handle `action: "JWT"` on standard introspection** | MS-W1 = 9701-W1 | The profile's only live 500 |
| **T1-13** | **Drop `none`** from `userinfo_signing_alg_values_supported` and `introspection_signing_alg_values_supported` | JOSE-W2 ⊃ MS-W3 | ⚙️ Confirmed present in both (§2.2) |
| **T1-14** | **`jwt.verify` hygiene rule** — `issuer` + `audience` on every call, recorded in `AGENTS.md` | JOSE-W1 ⊃ BCL-W1 | 📋 `controllers/logout.controller.ts` is now on the surfaces list |
| **T1-15** | **Terminate the user's session on back-channel logout**, not the request's | BCL-W2 | 📋 Then correct `AGENTS.md`'s *"properly destroys `req.session`"* |
| **T1-16** | **`{ requestBody: {} }` to `federation.configuration`** | FED-W1 → FED-W2 | One line; unblocks the entity-statement verification |
| **T1-17** | **Establish the five unprobed behaviours**: does the grant-management authorization side work; is an assertion with no `exp` accepted; is `cnf.jkt` enforced without a proof; is `USER_CODE` substituted in `deviceVerificationUriComplete`; does Authlete reject dual-channel client credentials | GM-W2, 7523-W1, 9449-W4, 8628-W6, 6749-W1 | **Each determines whether later work is needed at all** — 9449-W4 gates T1-10's severity, 7523-W1 gates 7523-W2, and 6749-W1 may make its own follow-up a no-op. Record every result in `PROGRESS.md` |
| **T1-18** | **Server-misconfiguration vs bad-token statuses** — unset `JWKS_URI` → 500, not 400 | BCL-W3, FED-W5 | Same pattern in both |
| **T1-19** | **Remaining contained code items**: `normalizeGrantType` total; echoing `default` branches; `attributes` validated; duplicate client-listing `fetch()`; `Cache-Control: no-store` on the logout receiver; `parseBearerError` quoted-string aware; PRM `bearer_methods_supported`; PRM well-known path; 405 on `/api/par`; JAR built from named fields; dev JWT made §2-shaped; `computeFapiMode` total over `fapiModes`; `/api/fapi/status` reports the whole profile | B1-W3 📋, B1-W4(=7009-W3), ATTR-W1, BCL-W6, BCL-W7, 9470-W6, 9728-W2, 9728-W1, 9126-W3, 9101-W5 📋, 9068-W2, FAPI1-W2, FAPI2-W4 ⊃ 7636-W2 | Independent of each other; batch freely. **FAPI2-W4 completes what FAPI2-W1 started** — the endpoint can then fail honestly on all eight FAPI requirements instead of six |
| **T1-20** | **Use `parseBasicAuth` for CIBA client authentication** — the same three-channel logic as `par.service.ts:39-54`, with a unit test per channel | CIBA-W3 📋 | Client authentication, so it needs a plan. **This is what makes `AGENTS.md`'s recommended CIBA configuration (`CLIENT_SECRET_BASIC`) actually work** — today the guide and the code disagree. Independent of CIBA-W1/W2, which are deferred (§7.1) |
| **T1-21** | **Forward the attestation headers at PAR, and reject duplicates explicitly** | ATT-W2 📋, ATT-W4 | ⚠️ **Both are unverifiable end-to-end and will stay so**: `challenge_endpoint` is absent (§2.2) and no client uses attestation, so neither change can be exercised. Ship them for correctness and say in the code comment that they are untested by construction — do **not** claim attestation works |

### Tier 2 — documentation, and the highest leverage in the audit

| # | Action | Items | Notes |
|---|---|---|---|
| **T2-1** | **Adopt the `UNVERIFIED` convention across the nine tutorials** | CUR-3c-W1 ⊃ **9396-W4** | **The single highest-leverage item in the plan.** The aggregate behind six S2s. Every transcript either reproducible or marked with the field responsible, per `modules/09a…/lab.md:36`. 9396-W4 (`RAR-TUTORIAL.md`'s three unproducible transcripts) is the worked example — and after T1-6 registers a RAR type, those transcripts become *runnable* rather than merely labelled |
| **T2-2** | **The six stale open-redirect references** | CUR-3b-W1 ⊃ CUR-3d-W2 | §6.3. Module 10 ×5 + `final-exam-answers.md:227-229` |
| **T2-3** | **Fix the remediation grep rule** — search the *phrase*, and check every module cross-referencing the one edited | CUR-3b-W2 | The rule that would have prevented T2-2 |
| **T2-4** | **The TLS citation reconciliation** — Module 00 `:87` and `:250` note RFC 9846; RFC 9110 sharpened to Internet Standard STD 97; a new RFC 9864 row. **`SPEC-INVENTORY.md:42-50` is correct and is not to be edited** | CUR-3d-W1's outcome, CUR-3a-W4 | §2.1 |
| **T2-5** | **One `SPEC-INVENTORY.md` pass** — 15 IDs in one commit, each row carrying its fetched URL and header line | cluster 29 + **FED-W4** | Theme 5's remedy |
| **T2-6** | **`sd-jwt.mjs`: enforce the trailing tilde, fix `--out`/`--iss`, add a test file** | CUR-3c-W3, CUR-3c-W4, CUR-3c-W5 | The wrong ACCEPT is the substantive one. `scripts/` is outside both Vitest configs — the repo's only SD-JWT implementation has no regression net |
| **T2-7** | **Teach `check-docs.mjs` three reference forms** — bare paths, prose `Line ~NN`, `/api/…` endpoint paths in fenced blocks | CUR-3a-W1 + CUR-3b-W5 + CUR-3c-W11 | **Scope as one change.** Two EOF-overrunning pointers slipped through the first two gaps |
| **T2-8** | **The claimed-working/flag-off table**, derived from live configuration | NSSO-W4 ⊃ FAPI2-W3, MCP-W3, VCI-W1's doc half | Theme 2. See §7.3 for the mechanical version |
| **T2-9** | **Export `errorStatusFrom`**, or record the prohibition | EH-W5's residue (§1.2) | So the next local handler inherits the clamp instead of re-deriving the bug |
| **T2-10** | **The stale line-number sets** — handler refs across four documents; `dpop.service.ts` pointers; `introspection.controller.ts:47`; two Phase 2 re-anchors; `ParSection.tsx` | 8693-W3 ⊃ CUR-3b-W6 ⊃ CUR-3c-W10, CUR-3b-W4, CUR-3b-W7, CUR-3c-W12, CUR-3a-W2 | Prefer anchoring on the ⚠️ comment text — these have drifted once already |
| **T2-11** | **The step-up challenge status everywhere**, including the sequence-diagram arrow | 9470-W1 ⊃ CUR-3c-W6 ⊃ CUR-3b-W8 | A learner reading only the diagram must not build a 403 challenge |
| **T2-12** | **Correct CUR-3b-W9's acceptance criteria, then ship it** | CUR-3b-W9 + §2.2 result 2 | `ES256` **is** advertised. The row is "partially", not FAIL |
| **T2-13** | **Fix the 60s/60min error** in `AGENTS.md` and Module 05 | FAPI1-W1 = FAPI1A-W3 ⊃ CUR-3b-W10 | A spec-accuracy defect in the repo's most-read reference file |
| **T2-14** | **The five citation and section-number fixes** | CUR-3b-W3, CUR-3b-W12, CUR-3b-W13(=NSSO-W3), CUR-3b-W15, CUR-3b-W16, 9470-W4, 9449-W5, 8252-W1 | CUR-3b-W15 is now evidenced (§2.3). CUR-3b-W12 and 8252-W1 each need one fetch (§2.4) |
| **T2-15** | **The wire-format gaps, stated until Tier 3 closes them** | 9126-W6, CIBA-W5, 8628-W5, 9101-W4, 7592-W3 | Theme 3's honest interim. Style: `modules/04…/lab.md:340` |
| **T2-16** | **The vendor-feature documentation pass** — HSK endpoints, `attributes`, parameterized scopes, all labelled *vendor feature, not a specification* | HSK-W1, HSK-W2, ATTR-W2, ATTR-W4, PS-W1, PS-W2 | One `docs/API.md` + `SPEC-INVENTORY.md` edit for all three |
| **T2-17** | **Remaining documentation items** | 6749-W2, 7521-W2, 8705-W2, 8705-W3, 8707-W2, 9068-W3, 9068-W4, 9207-W2, 9701-W3, 9701-W5, 9728-W3, 8414-W3, 8414-W4, 9396-W2, 8693-W1, 8693-W2, JOSE-W4, JOSE-W5, CIMD-W4, GM-W3 ⚙️, GM-W5, MDL-W2, MCP-W1, 7591-W2, 7662-W4, 7662-W5, 9700-W3, 9700-W5, 8707-W1, 8707-W3, CUR-3a-W6, CUR-3c-W8, CUR-3c-W9, CUR-3c-W13, CUR-3c-W14, JARM-W2, JARM-W4, JARM-W5, JARM-W6, 7523-W2 (= JOSE-W3), 7523-W3 📋, 7523-W5, 9449-W6, 9449-W7 ⚙️, FAPI1A-W4, FAPI1A-W5, MS-W2, FCL-W3, BCL-W4, BCL-W5, **RPL-W5**, **B1-W5**, **CUR-3b-W14** | Independent; batch by file. **BCL-W5 is blocked on T0-2.** RPL-W5 names the env-allowlist model as a departure from §3 and stops the `AGENTS.md` paragraph reading as assurance — pair it with T0-4. CUR-3b-W14 refreshes Module 09a's four `UNVERIFIED` dates to 2026-08-10, and **four of them are retired outright by T1-6** — do T1-6 first and the item shrinks |

### Tier 3 — Gate 4 decisions

Each retires or reverses curriculum material. **None ships without its paired documentation change in the same
commit**, per `AGENTS.md`.

| # | Decision | Items | Record |
|---|---|---|---|
| **T3-1** | Is FAPI 2.0 a claim this deployment makes? | FAPI2-W5 ⊃ MS-W4, MS-W5, FAPI1-W4, FAPI1A-W1, 7636-W1's residue | **DR-02**, **DR-06** |
| **T3-2** | Enable VCI? | VCI-W1 → VCI-W2, VCI-W3 | **DR-03** |
| **T3-3** | Enable Native SSO? | NSSO-W1 → NSSO-W2 📋 | **DR-04** |
| **T3-4** | Enable CIMD / claim MCP support? | CIMD-W2, MCP-W5, MCP-W4 | **DR-05** |
| **T3-5** | Drop `SPIFFE_JWT`? | inside ATT-W3 | **DR-07** — the only route that retires Module 10 Ex 4 |
| **T3-6** | Turn on JWT access tokens? | 9068-W1 📋 | **DR-09** |
| **T3-7** | Change the token-exchange deliberate defects? | 8693-W5 📋 | **DR-10** — listed to be visible, **not recommended** |
| **T3-8** | The issuer/host mismatch: which host is canonical? | 8414-W1, 8414-W2, AM-W1 | **DR-11** — a deployment decision, not only code |
| **T3-9** | The `AGENTS.md` surfaces list | §6.4 | **DR-12** — decided in the record; Gate 4 confirms |
| **T3-10** | Session Management + Front-Channel Logout, as one decision | SM-W1, FCL-W1, FCL-W4 = SM-W3 | **DR-08** |
| **T3-11** | Confirm the seven standing declines, plus the one deliberate non-record | 8705-W4, VP-W1, HAIP-W1, MDL-W1, 7522-W1, HSK-W3, PS-W3, ATTR-W5, 9901-W4 | **DR-01, DR-13…DR-18**; **DR-19** is the non-record |

### 7.1 Deliberately deferred beyond this plan — five items

Recorded so they do not read as omissions. **Each is a change of its own size, not a line item.**

**The three wire-format items — 9126-W1, CIBA-W1, 8628-W4.** T1-11 ships the body shape; the wire format does
not ship here. All three are `M` effort, all three touch endpoints the SPA and the labs call, and
`par.service.ts` is on the Security-critical surfaces list. Doing them well means one shared parsing helper plus
a lab pass. **T2-15 states the gap honestly in the meantime**, which is the pattern `modules/04…/lab.md:340`
already uses.

**RFC 7592's HTTP surface — 7592-W1, 7592-W2.** The registration access token is read from the request body
rather than an `Authorization: Bearer` header (W1), and there are no RFC 7592-shaped `GET`/`PUT`/`DELETE` methods
on a client-configuration path (W2) — only the four `POST` aliases this repo defines. W1 is a
client-authentication change needing a plan; W2 is a new HTTP surface. **7592-W3 is in T2-15** and is the honest
interim: `SPEC-INVENTORY.md:104` must distinguish *"the Authlete management APIs are wired"* from *"the RFC 7592
protocol is served"*. Corroborated by the live document — **`registration_endpoint` is ABSENT** from all 62
members (§2.2), so nothing currently advertises a registration protocol at all.

**Why deferral is the right call for all five.** Every one of them makes an endpoint *more* standards-conformant
without closing a security finding, and each carries a lab cost. They belong in a follow-on pass with its own
gate, after Tier 0–2 have closed the five open S1s and the false reporting.

### 7.2 Per-tier exit criteria

| Tier | Exits when |
|---|---|
| 0 | Five actions shipped; 514+ tests green; `check-docs.mjs` clean; the two stale entries banner-ed |
| 1 | Every ⚙️ change verified **from the discovery document**, not from the console UI; the four `UNVERIFIED` markers retired; T1-17's three probes recorded in `PROGRESS.md` |
| 2 | `check-docs.mjs` clean **with the three new detection forms enabled** — that is what makes T2-7 worth doing |
| 3 | Each decision record dated, with its revisit trigger, and its curriculum change in the same commit |

### 7.3 One new mechanism worth building: the discovery-diff check

Theme 2's remedy is currently *"correct four tables"*. They will drift again — that is what happened to Module
10 (§6.3). ATT-W5 showed the whole posture is one call away, and this session used it to corroborate nineteen
findings.

**Proposal:** extend `scripts/check-docs.mjs` (or add a sibling) with an opt-in mode that fetches
`GET /service/configuration` and asserts that every feature `README.md` marks as working has its corresponding
discovery member present. Run it on the same weekly schedule as `--links`, for the same reason: a service
configuration change is not a reason to fail somebody's pull request, but it *is* something the repo should
notice within a week.

**Cost:** one call, one mapping table of roughly nine rows. **It converts theme 2 from a recurring
documentation defect into a scheduled check** — and it is the only proposal in this plan that would have caught
a defect *before* the audit did.

### 7.4 The remediation checklist — mandatory per commit in Phases 5

`RESUME.md` §6 asked for this as a checklist step rather than a habit. Six steps:

1. **Plan first** if the file is on the Security-critical surfaces list (or is a DR-12 candidate) — the trigger
   is the concern, not the diff size.
2. **Grep the curriculum for the *phrase*** naming the defect, not only the error string (CUR-3b-W2).
3. **Check every module that cross-references the module you edited** — this is the step that was missing on
   2026-08-10.
4. **Check the lab-breakage register in both directions** (§6.1, §6.2) — a fix that completes a lab still needs
   the `UNVERIFIED` marker removed.
5. **Update the audit entry**, with a fixed-banner and a revised severity. §1.1 rows 1–2 exist because this was
   skipped twice.
6. **Run** `npm --prefix server run typecheck && lint && test`, then `node scripts/check-docs.mjs`. Never
   `test:e2e` (quota + rate limit).

---

## 8. What Phase 5 must not do

- **Do not re-probe Authlete.** Five authorised read-only passes are recorded (`SERVICE-CONFIG-PROBE.md` §1–§10
  plus §2.2 here). The only outstanding live questions are T1-17's three, and each is a *behavioural* sequence
  rather than a configuration read.
- **Do not re-fetch the ~45 specifications** in `RESUME.md` §2.3, or the four in §2.1. The two remaining
  fetches are CUR-3b-W12 and 8252-W1 (§2.4).
- **Do not reopen the settled rulings** — Authlete 3.0, no rebuild, the mTLS decline, the three deliberate
  token-exchange defects, Group C's inheritance.
- **Do not enumerate the 55 findings** in any Phase 5 artifact. The five themes are the unit.
- **Do not split OIDC-W1 from 9470-W3** (T1-7). Shipping the `prompt=none` fix alone activates the latent S1.
- **Do not treat a follow-up note as an approved change** — `AGENTS.md` is explicit, and T3-8 is the item this
  rule exists for.

---

## 9. Gate 4 — what needs a ruling

1. **The S1 count and the fourth downgrade.** §1.1 states 8 found / 3 downgraded / 5 open. Does
   `RFC7636-pkce.md` join the downgraded column now that its false-reporting half is fixed, or stay S1 until
   PKCE is actually required?
2. **The tier order.** Two open S1s (RFC 7662, RFC 9470) sit in Tier 1 rather than Tier 0, both for curriculum
   reasons stated in §1.1. Accept, or promote either to Tier 0?
3. **The nineteen decision records** in [`05-decision-records.md`](05-decision-records.md) — eleven open rulings,
   seven confirmations of standing declines, and one deliberate non-record. In particular **DR-02** (FAPI 2.0),
   which gates the most curriculum material; **DR-07** (`SPIFFE_JWT`), the only route that retires Module 10
   Exercise 4; and **DR-11** (the issuer/host mismatch), which four other records wait on.
4. **DR-12** — `middleware/errorHandler.ts` added to the surfaces list under its own concern row, plus the four
   adjacent candidates (§6.4).
5. **§7.1** — accepting the wire-format deferral, or pulling 9126-W1 / CIBA-W1 / 8628-W4 into Tier 1.
6. **§7.3** — build the discovery-diff check, or hand-correct the four tables and accept the drift.
7. **9901-W4** — confirm RFC 9901 deliberately gets no decision record (`RFC9901-sd-jwt.md`'s verdict
   reasoning: an AS has no RFC 9901 obligations, so there is no choice to record).
