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
| "~120 work-item IDs" (`RESUME.md:317`) | **280** — 239 Phase 2 + 41 Phase 3 | §5.1 |
| Two of the four `AGENTS.md` surface additions are open | **One.** `controllers/logout.controller.ts` landed too — `AGENTS.md:230` | §6.4 |
| EH-W3 and EH-W5 remain open | **Both closed.** All five EH items shipped 2026-08-11 | §1.2 |

### 1.1 The S1 register, re-verified against the working tree

`RESUME.md` §6 carried eight entries as S1-bearing. Each was re-read against the code on 2026-08-11, not
against its Phase 2 entry — **two entries still describe pre-fix code in their headers and findings.**

**8 found · 3 downgraded · 5 open.**

| # | Entry | Phase 2 | Working tree, 2026-08-11 | Entry accurate? |
|---|---|---|---|---|
| 1 | [`RFC8628-device-authorization-grant.md`](02-findings/RFC8628-device-authorization-grant.md) | S1 | **Downgraded.** `POST /api/device/complete` gated by `developmentOnly` + `deviceCodeLimiter` (`server/src/routes/device.routes.ts:27`); `/verification` and `POST /device` carry `deviceCodeLimiter` (`:26`, `:31`). **8628-W1 ✅ and 8628-W2 ✅** | ❌ **stale** — header still reads S1, work items still read "close this" |
| 2 | [`OIDC-RP-INITIATED-LOGOUT-1.0.md`](02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md) | S1 | **Downgraded three times.** `isAllowedPostLogoutRedirectUri` (`server/src/services/logout.service.ts:131-138`) refuses both verified payloads — by exact origin comparison from 2026-08-10, and by exact matching against the client's registered set (`registeredPostLogoutRedirectUris`, `:91`) since 2026-08-12. **2026-08-11 (T0-2): `id_token_hint` is verified, not decoded** (`utils/verify-id-token-hint.ts`), closing F-3 and **unblocking BCL-W5**. **2026-08-12 (T0-3): the §2 confirmation MUST is met** (`server/src/routes/logout.routes.ts:21-22`), closing F-2 and the CSRF-able GET. Remaining: RPL-W4 → RPL-W1 (T0-4), RPL-W5 | ✅ banner + severity revised S1→S2→**S3** (fixed 2026-08-12) |
| 3 | [`ERRORHANDLER-STATUS-INVERSION.md`](02-findings/ERRORHANDLER-STATUS-INVERSION.md) | S1 | **Closed.** `errorStatusFrom()` (`server/src/middleware/errorHandler.ts:25-33`) trusts a supplied status only inside 400–599. **All five items EH-W1…W5 ✅** | ✅ banner + severity revised S1→S3 |
| 4 | [`FAPI-2.0-SECURITY-PROFILE.md`](02-findings/FAPI-2.0-SECURITY-PROFILE.md) | S1 | **Partially remediated.** All six posture fields read live (`server/src/controllers/fapi.controller.ts:51-64`). **FAPI2-W1 ✅, FAPI2-W2 ✅**; W3/W4/W5/W6 open | ✅ banner + severity revised S1→S2 |
| 5 | [`RFC7662-token-introspection.md`](02-findings/RFC7662-token-introspection.md) | S1 | **CLOSED 2026-08-12 (T1-1).** Both endpoints now require admin Basic auth (`requireBasicAuth`, fails closed) and carry `generalLimiter`; the gate runs **before** any Authlete call, so a rejected caller learns nothing. F-1, F-2 and F-3 all closed — F-3 by deleting the hand-rolled decoder rather than porting it. **S1 → S3**; the residue is that this is admin auth, not client auth (**7662-W6**). `introspection_endpoint_auth_methods_supported: []` stays accurate, since no *client* method is supported | ✅ banner + severity revised S1→S3 |
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
| 2026-08-10 | The logout open redirect (**not RPL-W1** — see §6.3; RPL-W1 landed 2026-08-12) | `server/src/services/logout.service.ts:131-138` |
| 2026-08-10 | Three of four `AGENTS.md` surface additions | `AGENTS.md:225`, `AGENTS.md:230` |
| 2026-08-11 | **EH-W1, EH-W2, EH-W3, EH-W4, EH-W5** — all five | `server/src/middleware/errorHandler.ts:25-33`; `AGENTS.md:358-360`; Module 10 Ex 4 reframed |
| 2026-08-11 | **FAPI2-W1, FAPI2-W2** (widened from five literals to six fields) | `server/src/controllers/fapi.controller.ts:51-64` |
| 2026-08-11 | **9700-W1, 9700-W2** — **T0-1, the first Phase 5 action.** Request-body logging stopped at both sites | `server/src/services/token.service.ts:57-60`, `server/src/services/revocation.service.ts:64-67`, `server/tests/unit/services/credential-logging.test.ts`; `AGENTS.md:363` |
| 2026-08-11 | **T0-5, T0-6** — the MCP opening sentence, both stale entries banner-ed, and 21 drifted citations re-anchored | `docs/MCP-OAUTH-TUTORIAL.md:3`; the two entry banners; §6.3 |
| 2026-08-11 | **RPL-W2** — **T0-2.** `id_token_hint` verified rather than decoded; **BCL-W5 unblocked** | `server/src/utils/verify-id-token-hint.ts`, `server/src/services/logout.service.ts:176`, `server/tests/unit/utils/verify-id-token-hint.test.ts` |
| 2026-08-12 | **RPL-W3** — **T0-3.** RP-Initiated Logout §2's confirmation MUST; the CSRF-able `GET` is closed | `server/src/routes/logout.routes.ts:21-22`, `showConfirmation` in `server/src/services/logout.service.ts:296`, `server/src/views/logout-confirm.ejs`, `server/tests/unit/routes/logout.routes.test.ts` |
| 2026-08-12 | **RPL-W1, RPL-W4, RPL-W5** — **T0-4.** §3 per-client exact matching, as far as Authlete permits (**F-4**). **Tier 0 complete** | `registeredPostLogoutRedirectUris` + `isAllowedPostLogoutRedirectUri` (`server/src/services/logout.service.ts:91,131-138`), `server/src/utils/verify-id-token-hint.ts` (verified `aud`), `server/.env.example`; new entry `audit/02-findings/CLIENT-UPDATE-FIELD-LOSS.md` |
| 2026-08-12 | **7662-W1…W5** — **T1-1, first of Tier 1.** The last easily-exploitable open S1. Both introspection endpoints authenticated + rate-limited | `server/src/routes/introspection.routes.ts`, both introspection controllers, `server/src/services/introspection.service.ts`, `server/tests/unit/routes/introspection.routes.test.ts` (20 tests) |
| 2026-08-12 | **OIDC-W1 = 9470-W3** — **T1-7**, shipped as one change. `prompt=none` answers per §3.1.2.6 and the fabricated authentication event is gone; **the latent S1 is retired**. **9470-W2 subsumed** (see T1-8) | `server/src/utils/step-up.ts` (new, 15 tests), `decideWithoutInteraction` in `server/src/controllers/authorization.controller.ts`, `server/src/controllers/session.controller.ts` |

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
| `token_endpoint_auth_methods_supported` | ~~nine methods incl. `spiffe_jwt`, `tls_client_auth`, `self_signed_tls_client_auth`, `attest_jwt_client_auth`~~ → **five since 2026-08-12 (T1-5)**; all four withdrawn, and both `client_attestation_*_signing_alg_values_supported` members went with them | **ATT-W3 ✅**, 8705-W1 ✅ |
| `id_token_signing_alg_values_supported` | ~~`HS256, HS512, ES256, HS384` — **no RS256, no PS256**~~ → **since 2026-08-12 (T1-2)** also `RS256, RS384, RS512, PS256, PS384, PS512` | OIDC-W2 ✅, FAPI1A-W2 ✅, CUR-3b-W9 |
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
| ~~`private_key_jwt`~~ | ~~No client configured with it, no client JWKS~~ | **7523-W4 ✅ 2026-08-12** — the inverse case is now the interesting one: it is advertised, usable, and required of nobody |
| `tls_client_auth`, `self_signed_tls_client_auth` | mTLS declined; `tls_client_certificate_bound_access_tokens: false` | 8705-W1 |
| `attest_jwt_client_auth` (+ both attestation alg lists) | **`challenge_endpoint` absent** | ATT-W3 |
| `spiffe_jwt` | Breaks `service.get()` in SDK 1.0.0 — the enum gap | ATT-W3 |
| All five grant-management actions | Authorization-request side never exercised | GM-W2 |
| All three CIBA delivery modes | No client has `bcDeliveryMode` | CIBA-W4 |
| 14 request-object signing algorithms; `require_request_uri_registration: true` | ~~No client has an asymmetric key~~ (**9101-W3 ✅ 2026-08-12** — one client signs `ES256` against a registered key) or `requestUris` | 9101-W2 |

**Five of the nine advertised client-auth methods were unusable** — Phase 2 said four; `private_key_jwt` was the
fifth, and it was the one worth fixing rather than withdrawing. **Fixed 2026-08-12 (T1-3), so it is four again.**
That leaves T1-5's review facing a cleaner question: of the four remaining, two are declined by decision (mTLS),
one is blocked by an absent endpoint (attestation) and one breaks the SDK (`spiffe_jwt`) — **none is fixable by
registering a client**, which is what separates them from the case just closed.

> **✅ All four withdrawn 2026-08-12 (T1-5). Theme 1's client-auth rows are closed:** nine advertised methods →
> **five**, every one of which is either in use by a registered client (`NONE`, `CLIENT_SECRET_BASIC`,
> `PRIVATE_KEY_JWT`), or usable without registering anything (`CLIENT_SECRET_POST` — Authlete's DCR default;
> `CLIENT_SECRET_JWT` — needs only a secret). **The theme's diagnosis predicted the fix exactly**: the four that
> could not be fixed by registering a client were the four that had to be withdrawn.
>
> And it removed a row the table never had. `attest_jwt_client_auth`'s two algorithm lists are **derived** from
> the method, so withdrawing one advertisement withdrew three, taking discovery 64 → 62 members. A capability
> can be advertised in more places than the field that enables it — worth checking before any future withdrawal
> is called "one field".

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

`RESUME.md:317` estimated *"~120"*. The estimate was low by a factor of 2.3 — recorded here because a plan
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
| 4 | ~~**7523-W4** = 9101-W3~~ | ✅ shipped 2026-08-12 — the prerequisite FAPI2-W5, FAPI1-W4 and MS-W5 were waiting on is met |
| 5 | ~~**OIDC-W2** = FAPI1A-W2~~ | ✅ shipped 2026-08-12 — one RSA key, both specifications, four advertised alg lists |
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
   **Sharpened by T1-2/T1-3:** two of the audit's own conclusions rested on unrefreshed `UNVERIFIED` markers and
   one of them was false (§6.2), so the convention needs a *re-check date*, not just a marker.
2. ~~**7523-W4**~~ ✅ **shipped 2026-08-12** — and it delivered what the row promised: §2.2, asymmetric JAR and FAPI's prerequisite, from one `client/create`.
3. **ATT-W3** — one `supportedTokenAuthMethods` review. Subsumes the mTLS metadata fix, the attestation finding and `SPIFFE_JWT`.
4. ~~**OIDC-W2**~~ ✅ **shipped 2026-08-12** — one registered RSA key, RS256 *and* PS256.
5. ~~**EH-W1**~~ ✅ → **9700-W1**. Two lines, an S1, and no curriculum impact.

---

## 6. The lab-breakage register — both directions

`RESUME.md` §8.2 item 3. Phase 3 opened this one-directionally; batch 3b found the inverse coupling. **Both
columns must be checked before any Tier 1 configuration change ships.**

### 6.1 Fixes that break a correct lab

| Lab | Broken by | Mitigation | State |
|---|---|---|---|
| Module 00 Ex 2 — expects `key count: 1`, EC key at `keys[0]` | **OIDC-W2** | **CUR-3a-W3** — select by `kty === 'EC'`, drop the count | ✅ **landed together 2026-08-12 (T1-2).** The register worked exactly as intended. Two further hits the register did not name were found by the §7.4 grep and fixed in the same commit: Module 08 §6d, whose *transcript inverts* (it printed the RS256-less list and reasoned about the violation), and `modules/11…/README.md`'s *"one EC P-256 key"* |
| Module 04 introspection steps; Module 11 exercises using unauthenticated admin access as live exploits | **7662-W1** | `grep -rn "introspection" docs/curriculum/modules`; expected outputs go 200 → 401 | ⬜ **grep before, not after** |
| Module 04 opaque-token exercises; `STEP-UP-AUTH-TUTORIAL.md` Part 4 | **9068-W1** | 9068-W3 (separate the two halves) and 9068-W4 (label the payload) first | ⬜ Tier 3 |
| Module 10 Ex 4 — the 200-with-stack-trace | Dropping **`SPIFFE_JWT`** — **not** EH-W1 | **EH-W4 ✅** reframed it as *two defects, one symptom*; the 200 kept as a dated historical transcript | ✅ **and the register's prediction was wrong in the useful direction.** T1-5 dropped the member on 2026-08-12 and the exercise was **not** retired: it now walks *three* dated states and teaches the closed-enum mechanism, which is legible only after the fix. **The general rule this yields:** before paying a curriculum cost, ask whether the lab is about the *symptom* or the *mechanism*. A symptom-based lab dies with the fix; a mechanism-based one gets a second data point |
| Module 10 lab — the `-- no token --` transcript at `/api/gm` | **9449-W3** (T1-10), via the RFC 6750 §3.1 half | Update the transcript in the same commit; the `curl` prints the status line and `WWW-Authenticate` instead of a body | ✅ **landed 2026-08-13, and the lab got *better* rather than merely current.** The §3.1 change was ruled on separately before the code was written, precisely because it cost a live transcript. The replacement teaches the thing the old transcript hid: an absent token is not an *invalid* one, so an empty error beats a wrong one, and a client written to retry on `invalid_token` would have looped instead of prompting for login. A short `Bearer`/`DPoP` pairing section came with it. **Module 11 was checked and is unaffected** — all seven of its `/gm` calls present valid Bearer tokens |
| Module 06 Ex 6b — the four silent discards | **8693-W5** | Not recommended. If taken: lab + quiz-answers + Part 12 + `PROGRESS.md` in the same commit | ⬜ Tier 3, discouraged |
| Module 01 Ex 3 + Module 07 §3b — both hinge on ROPC succeeding | **FAPI2-W5** | ✅ **already mitigated** — both modules name `fapiModes` (3d-F2) | ✅ closed |
| Module 05 Ex 3–4 | if `parRequired` were ever set `true` | ✅ Module 05 already declares the dependency (`lab.md:23-35`) | ✅ closed |

### 6.2 Fixes that complete a lab currently marked `UNVERIFIED`

The direction the register was missing. **These four make Tier 1 net-positive for the curriculum**, which is
the argument for scheduling configuration before documentation.

| Lab | Completed by | Retires |
|---|---|---|
| Module 09a Ex 2 / 2a — JARM | **JARM-W1** (`authorizationSignAlg = ES256`) | ✅ **2026-08-12** — marker retired with a live transcript; **JARM-W2 is now answerable** |
| Module 09a Ex 3 — CIBA delivery mode | **CIBA-W4** (`bcDeliveryMode`) | ✅ **2026-08-12** — full poll sequence run; also answers Ex 3d's open question (`auth_req_id` is single-use) |
| Module 09a Ex 4 — the ACR *success* path | **9470-W5** (`supportedAcrs` → `acr_values_supported`) | ✅ **2026-08-12** — *both* halves; the refusal half needed a second, deliberately unsatisfiable ACR |
| Module 09a Ex 5 — RAR | **9396-W1** (register one `authorization_details` type) | ✅ **2026-08-12** — and it required **re-pointing Ex 5a's control**, which had used the very type now registered |
| ~~Module 08 asymmetric ID-token validation (`lab.md:365-399`)~~ | ~~**OIDC-W2**~~ | ⚠️ **This row was wrong, and it is the most instructive correction in the register.** The branch was **never blocked**: only the *confidential* client is `HS256`, and the two public clients have been `ES256` throughout — a fact `OIDC-CORE-1.0.md` F-2 states two paragraphs above the clause that says otherwise. The lab's marker said *"Both clients here are still `HS256`"*, this register believed it, and **nobody ran the two-command check that would have falsified it**. Retired 2026-08-12 by *running the branch* (all thirteen steps `PASS`), not by OIDC-W2. The lesson: an `UNVERIFIED` marker is a claim about the deployment, and it decays like any other |
| Module 09b — SD-JWT | **CUR-3c-W3** + **CUR-3c-W5** (trailing tilde + a test file) | fixes a wrong ACCEPT |

**One change appeared in both columns — and half of that turned out to be false.** **OIDC-W2** does break
Module 00 Ex 2, and it was recorded as also completing Module 08's asymmetric branch, which made it look like
a wash. Executing it (2026-08-12) showed the second half was never true: nothing blocked that branch. So the
bidirectional argument survives in a **weaker and more useful form**. OIDC-W2 is not a cost offset by a
benefit; it is a cost, offset by a *different* benefit the register missed entirely — with two keys published,
Module 08's `kid` selection stops being decorative. Its validator carries
`?? (jwks.keys.length === 1 ? jwks.keys[0] : undefined)`, a fallback that silently rescued any broken `kid`
lookup while there was one key. **A fallback that always fires is a check you are not running**, and the
second key is what turns that line into a real test.

**The register's real failure mode is not asymmetry, it is staleness.** Both entries in this column that
proved wrong (this one, and §6.1's Module 08 row) were wrong because a *lab's own `UNVERIFIED` marker* was
taken as evidence about the deployment. Before trusting a row here, re-run the check the marker describes —
`CUR-3b-W14` already exists to refresh Module 09a's four markers and should be read as the general rule.

### 6.3 Live drift — the register's third category

Not a forward dependency. **A fix has already shipped and the curriculum still teaches the pre-fix behaviour.**

| Where | State |
|---|---|
| Module 10 — five references to the logout open redirect (`README.md:205`; `lab.md:81-91,423,430-431,469`) | ⚠️ **stale since 2026-08-10.** CUR-3b-W1. **Re-anchored 2026-08-12 by content, because T1-5 edited this lab and step 7 requires it — and three of the four `lab.md` numbers did not point where `03-curriculum-audit.md:621-622` says they did, *before* T1-5 touched anything.** The five, anchored on their text: `README.md:205` (*"shall not expose open redirectors"* row) · `lab.md:81-91` (Exercise 1's set-piece, unmoved) · `lab.md:501` (the conformance row *"No open redirectors | FAIL"*, previously cited as `:423`, which is Exercise 7's opening line) · `lab.md:508-509` (remediation item 1, previously `:430-431`, which is Exercise 7's **finding 4**) · `lab.md:547` (the closing-checklist item, previously `:469`, which is remediation item **3**). **The mis-description is the more useful find:** four numbers were carried as a set and only the first was ever re-checked, so T2-2 should verify each against its quoted text rather than trust this list either. Two other Module 10 refs moved with T1-5: 3b row 11's `lab.md:229-246,475` and row 18's `lab.md:428-444` (remediation order) — now `:229-281` and `:506-522` |
| `final-exam-answers.md:227-229` — a sixth reference | ⚠️ **stale.** CUR-3d-W2 (3d-F4) |
| `02-findings/RFC8628-…md`, `02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md` | ✅ **fixed 2026-08-11 (T0-6).** Both banner-ed, severities revised S1→S3 and S1→S2, and the stale in-body rows corrected |
| **Every `PROGRESS.md:NNN` citation in `audit/`** — 20 refs across 11 files | ✅ **fixed 2026-08-11 (T0-6)**, and it was worse than a uniform shift. See below |

**The citation drift, and why it is a fourth detection gap rather than a typo.** Found while shipping T0-1 and
fixed with T0-6. Commit `b5e60d4` (the 2026-08-11 Tier-0 fixes) inserted **77 lines into `PROGRESS.md` in two
hunks** — 69 at `:91` and 8 at `:391` — so every `audit/` citation below those points was wrong. Four things
this exposed, all worth carrying:

1. **The drift was not uniform.** Refs above the second hunk moved by 69, refs below it by 77. Arithmetic
   applied blanket would have "fixed" nine refs into new wrong positions. Each of the 20 was re-resolved by
   matching its **content** across three revisions (`b5e60d4~1`, `HEAD`, working tree).
2. **Two refs were not drift at all.** `MCP-OAUTH.md:70` and `03-curriculum-audit.md:153` cite the *same*
   `PROGRESS.md:1088-1089` for **different content**, because one was written before `b5e60d4` and one after —
   they resolve to `:1060-1061` and `:983-984`. And `03-curriculum-audit.md`'s `PROGRESS.md:1401` matched
   *neither* baseline: it was **wrong when written** (correct target `:1327-1328`).
3. **One citation could not be renumbered.** `OIDC-RP-INITIATED-LOGOUT-1.0.md` quoted `PROGRESS.md:401`'s
   *"Fix is one line — exact comparison against a registered set"*, and `b5e60d4` **deleted that sentence**
   when it recorded the fix. Reworded to quote the pre-fix revision explicitly by git ref.
4. **`check-docs.mjs` cannot see any of this.** Its source-ref regex covers only `server/`|`client/`
   `.ts/.tsx/.ejs/.mjs`, so **markdown line references are a fourth detection gap**, alongside the three
   **T2-7** already bundles (bare paths, prose `Line ~NN`, endpoint paths in fenced blocks). Add it there.

**`PROGRESS.md` will do this again**, because entries are appended *at the top*: any future build-log entry
re-breaks every citation below it. Two options, and the second is better — **(a)** teach `check-docs.mjs` the
`.md:NNN` form so the breakage is at least loud, or **(b)** stop citing `PROGRESS.md` by line and cite it by
**section heading** instead, which is stable under prepending. Recommend both, (a) in T2-7 and (b) as a
convention note in `RESUME.md` §7.

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
| **T0-2** | ✅ **SHIPPED 2026-08-11.** **Verify `id_token_hint` before trusting `sub`** — signature against the OP JWKS, plus `iss` and `aud`; an unverifiable hint yields "no subject", never an attacker-chosen one | RPL-W2 ✅ | 📋 **BCL-W5 is unblocked** — a client may now register a `backchannel_logout_uri`. Delivered as a pure verifier (`server/src/utils/verify-id-token-hint.ts`, 21 tests) called from `logout.service.ts:176`. Keys from Authlete's service JWKS, **not** `JWKS_URI` (unset); `iss` from live discovery, **not** `JWT_ISSUER` (unset, and using it would have silently disabled the check); both cached 5 min. `alg` pinned to the nine asymmetric algs `jsonwebtoken@9` can verify, so `alg: none` and `HS*` are refused — **the `HS256` client's hints are now ignored** (T1-5 territory). `exp` deliberately unenforced, marked `UNVERIFIED` in code. Restoring the old behaviour fails 4 service tests. **553 tests / 55 files** |
| **T0-3** | ✅ **SHIPPED 2026-08-12.** **Add the logout confirmation step** — GET renders a confirm page with a CSRF token; the session dies only on POST | RPL-W3 ✅ | 📋 Planned under plan mode. Satisfies RP-Initiated Logout §2's MUST **and its SHOULD** — the question is asked unconditionally, because the narrower reading leaves a GET that still destroys a session, so a captured `id_token_hint` would stay a forced-logout primitive. `csrfProtection` reused verbatim from the device flow's browser paths; no new CSRF machinery. Parameters read **body-first, query second** (§2 blesses both methods for the request). **The rate limiter was deliberately left out** — F-1's second aggravating factor stays open and visible rather than being closed outside the acceptance criteria. Suite 553 → **569** / 56 files. `docs/DATA-FLOWS.md` had documented this page and a `POST /api/logout` since before either existed; the change makes it true, and its other branch (a `400` that never existed) was corrected too. **Module 08 Ex 6b reframed, not retired**: its `GET` loop now demonstrates §2 and a new `POST` loop preserves the open-redirect discrimination — both transcripts run live, no Authlete call on either path |
| **T0-4** | ✅ **SHIPPED 2026-08-12.** **Register the post-logout redirect URIs, then match the client's registered set** | RPL-W4 ⚠️, RPL-W1 ✅, RPL-W5 ✅ | 📋 Planned under plan mode. **RPL-W4's premise was wrong and that is the finding**: Authlete 3.0 has **no client field for `post_logout_redirect_uris`** — 0 of the `Client` schema's 108 properties, 0 of 33 schemas, nothing in `ClientExtension` — and a write returns **200 and is silently discarded** (verified live on all three clients; net change `modifiedAt` only). Recorded as **F-4**. So the registry is the deployment's own `POST_LOGOUT_REDIRECT_URIS` (`clientId → string[]`), and RPL-W1 matches it with `===`. Client identity: `client_id`, else a **verified** hint's `aud`; **no client ⇒ no redirect**. `ALLOWED_ORIGINS`, `LOGOUT_REDIRECT_URI` and the non-production `localhost` clause no longer authorise anything, and no `new URL()` parsing remains. Suite 569 → **589** / 56 files. Two further findings fell out: the audit's `backChannelLogoutUri` casing (Authlete's is `backchannelLogoutUri`) and `CLIENT-UPDATE-FIELD-LOSS.md`. Module 08 Ex 6b gains the vendor-gap lesson; §3's own two clauses are now separated in the findings table |
| **T0-5** | ✅ **SHIPPED 2026-08-11.** **Correct `MCP-OAUTH-TUTORIAL.md`'s opening sentence** — name the two preconditions MCP discovery needs here (a self-consistent issuer; `clientIdMetadataDocumentSupported = true`) and that neither holds | CUR-3c-W2 ✅, 8414-W5 ✅ | Smallest fix with the largest blast radius in Phase 3. Delivered as a three-row precondition table plus **a fourth item the work items did not name** — `registration_endpoint` is absent, so DCR cannot be discovered at all — and a pointer to the deliberate reason the retired grants are on. **`MCP-W3` is now down to its "link it from both tutorial indexes" half** |
| **T0-6** | ✅ **SHIPPED 2026-08-11.** **Add fixed-banners to the two stale audit entries** | §1.1 rows 1–2 | The audit must not be the last carrier of pre-fix state (§6.3). Both banner-ed, with severities revised (`RFC8628-…` **S1→S3**, `OIDC-RP-INITIATED-LOGOUT-1.0.md` **S1→S2**) and the stale in-body rows corrected — 8628's normative rows 8–9 and its boundary table said "no rate limiter" and "not implemented". **Also fixed in the same pass: 21 drifted line citations** — see §6.3's fourth row |

### Tier 1 — configuration and contained code

⚙️ items need no code and **four of them complete labs** (§6.2). Sequenced so prerequisites land first.

| # | Action | Items | Notes |
|---|---|---|---|
| **T1-1** | ✅ **SHIPPED 2026-08-12.** **Require caller authentication on both introspection endpoints**, plus a rate limiter | 7662-W1 ✅(=9701-W2), 7662-W2 ✅(=7009-W2 in part), 7662-W3 ✅, 7662-W4 ✅, 7662-W5 ✅ | 📋 🔍 Planned under plan mode. **Admin Basic on both, not client auth** — nothing here can validate a client secret, and whether Authlete's `standardProcess` rejects bad ones is unestablished, so demanding one would look like protection and provide none (**new: 7662-W6**). The gate runs **before** any Authlete call, which is what closes the oracle. `parseBasicAuth` was *not* adopted: the header read was **deleted**, because that header now carries admin credentials and forwarding them would ship our management secret to Authlete as a client secret. Suite 589 → **612** / 57 files. Curriculum: **21 call sites** across six module labs, both root scripts, three tutorials and two exam files; **Module 04's "Break it" and Module 07's Exercise 5a both inverted** and were reframed. **7009-W2's revocation limiter is not covered here** — revocation already requires client auth, so only its limiter remains, in T1-19 |
| **T1-2** | ✅ **SHIPPED 2026-08-12.** **Register one RSA key** on the service | OIDC-W2 ✅ (=FAPI1A-W2 ✅) | ⚙️ 🔍 RSA-2048, `kid: "rsa-1"`, **no `alg` member** — which is what yields RS256 *and* PS256 from one key, and the acceptance criteria did not say so. Diff: `jwks` + `modifiedAt` out of 129 fields; **four** advertised alg lists changed, not one. Verified from the discovery document per §7.2, then verified *usable* by issuing an RS256 ID token — Theme 1 applies to the audit's own fixes. **CUR-3a-W3 landed in the same commit.** §6.2's Module 08 row was **wrong**: that branch was never blocked (see §6.2) |
| **T1-3** | ✅ **SHIPPED 2026-08-12.** **Register one client with `private_key_jwt` + a JWKS** | 7523-W4 ✅ (=9101-W3 ✅) | ⚙️ Client `2176571218` **created**, not converted — the other three carry labs, the SPA and 14 E2E blocks. `requestSignAlg: ES256` in the same call. Both halves exercised live, with negative controls: a tampered request-object signature → `[A005328]`, a wrong `aud` → `[A157318]`. Two behaviours established that no work item asked for — this deployment accepts **either** the issuer or the token endpoint as `aud`, and **`jti` replay is not enforced** (conformant; §3/§6 make it OPTIONAL). Private key in `server/.env` (gitignored) so the labs repeat. 9101-W3's *"Step 3 becomes 'here is the registered key'"* was **deliberately not followed** — see its work-item row |
| **T1-4** | ⚠️ **PARTLY SHIPPED 2026-08-12 — the lifetime change was deliberately reverted; the flag half completed later that day via B1-W6.** | OIDC-W4 ✅(recorded), GM-W1 ⬜, FAPI1-W3 ⬜, OIDC-W5 ✅ | ⚙️ Theme 4. **The shortening was applied, verified (`expires_in: 3600`) and reverted**: the blast radius is ~55 deployment-specific references, and two are arguments rather than transcripts — **Module 07's audit lab** ranks the 24-hour lifetime as finding (iv), **Module 10's thesis** uses it as its worked example. OIDC-W4 closes on its *"record it"* branch; GM-W1 and FAPI1-W3 stay **open by decision**, in `PROGRESS.md`. `idTokenAudType = "string"` ✅ kept. **`idTokenReissuable` exposed a defect and was reverted** — the handled action requires a `ticket` Authlete does not send, so every refresh returned 400 with a valid body: **new work item B1-W6**, 📋 security-critical. ✅ **B1-W6 shipped 2026-08-12 and the flag is now on and kept** — the branch was calling the wrong API entirely (`/auth/token/issue`, which consumes tickets) instead of `POST /idtoken/reissue`, which exists for this action; **the work item's own acceptance criteria named the wrong remedy** (`B1-authlete-boundary.md` F-9). A refresh returns 200 with a reissued `id_token`. Two behaviours nobody had asked about: the reissue request's `idTokenAudType` **defaults to `array` and overrides the service**, so omitting it would have silently reversed T1-4's `"string"` decision on one code path; and `responseContent` on this action carries **no `id_token`**, which is what makes the failure path safe. **OIDC-W5 is closed.** Suite 635 → **644** |
| **T1-5** | ✅ **SHIPPED 2026-08-12.** **Review all nine `supportedTokenAuthMethods` together** — nine members → **five** | ATT-W3 ✅ ⊃ 8705-W1 ✅ ⊃ CIMD-W3 ✅ ⊃ `SPIFFE_JWT` ✅ | ⚙️ 🔍 **DR-07 approved, and approved *after* a read-only proof rather than on the mechanism.** `service.get()` works; both FAPI endpoints answer **200** with live values for the first time since 2026-08-06. Withdrawn: `SPIFFE_JWT`, the mTLS pair, `ATTEST_JWT_CLIENT_AUTH`. **Four things the proof corrected**: the response is **132** fields, not the 129 nine documents claim; the failing parse produced **exactly one** Zod issue, which is itself proof nothing else fails (Zod aggregates); the enum types **three** service fields, not the one every document named (both siblings absent here, so one field moved); and of 16 enum-typed `Service` fields, `ClientAuthMethod` is the **only** gap, with no nullability mismatch anywhere. **One withdrawal removed three advertisements** — both attestation algorithm lists are derived from `attest_jwt_client_auth`, so discovery went 64 → 62 (*a different 62* from the audit's earlier one). **CIMD-W3's premise was false**: the SDK models `clientIdMetadataDocumentSupported`, so the cast was covering nothing. Module 10 Ex 4 **rebuilt, not retired** — three dated states and the closed-enum lesson. Suite unchanged at **635 / 58**; `fapi.routes.test.ts` always mocked `service.get()`. Evidence: `SERVICE-CONFIG-PROBE.md` §17–§18 |
| **T1-6** | ✅ **SHIPPED 2026-08-12.** **The four lab-completing settings** | JARM-W1 ✅, CIBA-W4 ✅, 9396-W1 ✅, 9470-W5 ✅ | ⚙️ §6.2 — **all four `UNVERIFIED` markers in Module 09a retired, each by running the success path**, not by asserting it. Discovery 62 → **64** members. `supportedAcrs` also took `mfa`, deliberately unsatisfiable, because that is what makes the essential-ACR *refusal* reachable. Three findings fell out: RAR introspection returns Authlete's `{elements, otherFields}` envelope rather than RFC 9396's shape (theme 3, → T2-15); `supportedAcrs` is `readOnly` in the 3.0.16 schema and was **written anyway**; and **CUR-3b-W14 is closed outright** rather than shrunk |
| **T1-7** | ✅ **SHIPPED 2026-08-12.** **Fix `prompt=none` and the fabricated event together** | OIDC-W1 ✅ = 9470-W3 ✅ | 📋 Planned under plan mode. **The latent S1 is retired, not downgraded** — the activation route was built correctly rather than built at all. `NO_INTERACTION` now follows Authlete's contract (`decideWithoutInteraction`): `NOT_LOGGED_IN` → `CONSENT_REQUIRED` → step-up → issue. The fabrication block is **deleted**; the decision runs through **`utils/step-up.ts`**, a pure function shared with the login path whose rule is that **absence is answered as "no"**. The dead `INTERACTION` branch **delegates** rather than being removed, so the two cannot drift. Suite 613 → **635** / 58 files. Verified live incl. `max_age=0` refused against a 2-second-old session — **the first time `EXCEEDS_MAX_AGE` has been reachable**. Curriculum: Module 08 Ex 5c/5d reframed around the *trap* (fixing the visible bug alone would have armed the latent one), plus its README, quiz, quiz-answers and `AUDIT-PASS-A` row 7 |
| **T1-8** | ⚠️ **SUBSUMED by T1-7, 2026-08-12 — and the framing was wrong.** The login-path check is vacuous because `authTime` is set immediately before it is read, but that is **correct**: the End-User has just actively authenticated, so any `max_age` is satisfied by construction. **The path where `max_age` can genuinely fail is `prompt=none`, which did not exist until T1-7 built it.** `EXCEEDS_MAX_AGE` is now reachable and tested | 9470-W2 ⚠️ | No code change owed. Recorded in the entry rather than closed silently |
| **T1-9** | ✅ **SHIPPED 2026-08-13.** **Route every DPoP `htu` through `dpopHttpTarget()`**; stop reading `targetUri` from the introspection body | 9449-W1 ✅ ⊃ 9126-W4 ✅, 9449-W2 ✅ | 📋 Planned under plan mode, with T1-10. **Five call sites, not four** — `grant-management.service.ts` was not on the list because the `/gm` call was not known to accept DPoP fields at all. `targetUri` is sent only where the SDK model has it (`IntrospectionRequest`, `UserinfoRequest`), checked in the models rather than inferred. **Proven live**: `GET /api/gm/{id}?verbose=true` with a valid proof returns **200**, where any query string previously failed proof validation against a correct client. 9449-W2 is the quiet security half — a caller could choose the `targetUri` its own proof was validated against, the identical defect already closed at UserInfo. Retires CUR-3b-W11 |
| **T1-10** | ✅ **SHIPPED 2026-08-13.** **Accept `DPoP` at `/api/gm/:grantId`; refuse the downgrade.** One shared extractor | 9449-W3 ✅ ⊃ GM-W4 ✅ | 📋 Planned under plan mode. 9449-W4 ran first as instructed and **resolved in our favour**, so this shipped as a conformance fix at S2 rather than an escalated S1. **The acceptance criteria were incomplete, and a probe caught it before code**: `/api/gm` makes **two** Authlete calls and both check the binding independently — `/gm` without a forwarded proof answers `[A281305]` — so fixing only the middleware would have moved the 401 one call later. The same proof serves both calls; Authlete does not treat the second use as a replay. All four presentations verified live. The no-token response also became RFC 6750 §3.1-shaped (no error code, `Bearer, DPoP`), which was approved separately because it changed a Module 10 transcript. Suite 644 → **665** / 58 files |
| **T1-11** | ⚠️ **PARTLY SHIPPED 2026-08-13 — the JAR half; the three spec-shaped endpoints deferred to their own batch.** **The `responseContent`-as-body pattern**, four endpoints — plus an auth posture for `/api/jar/process` | 9126-W2 ⬜, 8628-W3 ⬜, 7591-W1 ⬜, B1-W1 ✅ (= 9101-W1), **B1-W2 ✅** | 📋 Planned under plan mode. **B1-W1 + B1-W2 shipped**: `/api/jar/process` was unauthenticated and returned Authlete's whole authorization response — **including the `ticket`**, a credential — plus `service` and `client`, always with status 200. Now admin Basic (checked before the Authlete call) and an **allowlist**. Note the criteria's *"`action` + `responseContent` only"* was **not** followed, deliberately: this endpoint has **no specification shape** — it is a repo-invented debugging surface — so `resultMessage` and `scopes` were kept as its entire pedagogical value. When a work item prescribes a body shape, check whether the endpoint has one. **B1-W2 settles a DR-12 dependency**: `jar.controller.ts` joins the surfaces list. **The other three are deferred with a reason** (§7.1's logic, applied to the response half): the premise is probe-confirmed — PAR returns exactly `{"expires_in":600,"request_uri":"urn:…"}`, Device exactly RFC 8628 §3.2 — but the change **breaks the SPA** (`ParSection.tsx:112`, `DeviceSection.tsx:159-160` read camelCase envelope fields). Server + SPA + lab transcripts belong in one commit. Theme 3. Three lines each; follows `token.controller.ts:52`. 7591-W1 must land with 7591-W3's `AGENTS.md` correction. **B1-W2 is not optional**: the endpoint emits Authlete tickets to unauthenticated callers, and admin-only is defensible where unauthenticated is not. It also gates DR-12's ruling on `jar.controller.ts` |
| **T1-12** | ✅ **SHIPPED 2026-08-13.** **Handle `action: "JWT"` on standard introspection** | MS-W1 ✅ = 9701-W1 ✅, 9701-W5 ✅ | 📋 Planned under plan mode (`introspection.service.ts` is on the surfaces list). **The profile's only live 500 is closed.** Verified end to end: `typ: token-introspection+jwt`, `alg: RS256`, `kid: rsa-1`, claims `iss`/`aud`/`iat`/`token_introspection` — **signed with the key T1-2 registered**, so a configuration action taken a day earlier is what makes this produce a signature at all. **Two things the criteria did not name, both settled by probe.** The action needs `rsUri` as well as the Accept header; without it Authlete answers `[A404301]`, and that 400 is **passed through on purpose** because `rsUri` becomes the `aud` naming the caller, which the server cannot honestly guess. And `rsUri` must **not** be sent unconditionally — the vendored spec makes a non-matching `rsUri` return `active: false`, so defaulting it would silently report audience-restricted tokens as dead. **A planning error is recorded in `PROGRESS.md`**: the plan claimed `standardProcess` never forwarded the Accept header; it always had, and the real fix was one missing `case`. 9701-W5's `curl` recipe landed in the same commit so its documented output was never aspirational |
| **T1-13** | ⚠️ **CLOSED AS UNACHIEVABLE 2026-08-12 — there is no knob.** Drop `none` from `userinfo_signing_alg_values_supported` and `introspection_signing_alg_values_supported` | JOSE-W2 ⚠️ ⊃ MS-W3 ⚠️ | ⚙️ **RPL-W4's shape a second time.** No Authlete 3.0 `Service` property lists either set: both are derived from the service JWK Set, and `none` is unconditional — Authlete's own `service/configuration` example carries it. **Established by writing, not by reading the schema**: `userInfoSignatureKeyId`/`introspectionSignatureKeyId` → `rsa-1` changed both lists (`ES256` dropped, the RSA pin removing the EC candidate) and **`none` survived both**; reverted, only `modifiedAt` moved. The advertisement is also *accurate* for UserInfo — `Client.userInfoSignAlg` accepts `NONE` — and for introspection the `Client` schema has **no** signing property at all, so nothing on either side can narrow it. Both work items become documentation, in T2-17. Evidence: `SERVICE-CONFIG-PROBE.md` §19 |
| **T1-14** | **`jwt.verify` hygiene rule** — `issuer` + `audience` on every call, recorded in `AGENTS.md` | JOSE-W1 ⊃ BCL-W1 | 📋 `controllers/logout.controller.ts` is now on the surfaces list |
| **T1-15** | **Terminate the user's session on back-channel logout**, not the request's | BCL-W2 | 📋 Then correct `AGENTS.md`'s *"properly destroys `req.session`"* |
| **T1-16** | **`{ requestBody: {} }` to `federation.configuration`** | FED-W1 → FED-W2 | One line; unblocks the entity-statement verification |
| **T1-17** | ✅ **SHIPPED 2026-08-12. All five answered; no source file changed.** **Establish the five unprobed behaviours** | GM-W2 ✅, 7523-W1 ✅, 9449-W4 ✅, 8628-W6 ✅, 6749-W1 ⚠️ | **The item that could delete work, and it did.** **9449-W4: the binding IS enforced with no proof** (`[A065308]`; wrong key `[A065309]`) — so **9449-W3 stays S2 and T1-10 is NOT escalated**. **7523-W1: a no-`exp` assertion is refused** (`[A314305]`) before `/jose/verify` is reached — **7523-W2 downgraded to defence-in-depth**, folded into T2-17. **GM-W2: the authorization side works end to end** including `GET /api/gm/{id}` → 200 through this server, the first live exercise of `requireGrantOwnership` on a real grant — **no code; GM-W5 is pure documentation**. **8628-W6: `USER_CODE` is substituted**, and the same response's `responseContent` is exactly §3.2's snake_case shape — direct corroboration for **8628-W3** in T1-11. **6749-W1: Authlete does NOT reject dual channels and top-level wins**; the strict-checking page is silent on the question, so the *"no code change if Authlete already rejects"* escape does not apply and **a Gate 4 ruling is owed**. Two by-products: the issuer/host mismatch observed live (`issuer = https://blackadi.dev`, token endpoint on the tunnel — **DR-11**), and **`RFC6749-…` F-1's mechanism corrected** — `parameters` is `rawBody`, so this server *emits* the dual-channel request rather than resolving it. Transcripts in `PROGRESS.md` |
| **T1-18** | **Server-misconfiguration vs bad-token statuses** — unset `JWKS_URI` → 500, not 400 | BCL-W3, FED-W5 | Same pattern in both |
| **T1-19** | **Remaining contained code items**: `normalizeGrantType` total; echoing `default` branches; `attributes` validated; duplicate client-listing `fetch()`; `Cache-Control: no-store` on the logout receiver; `parseBearerError` quoted-string aware; PRM `bearer_methods_supported`; PRM well-known path; 405 on `/api/par`; JAR built from named fields; dev JWT made §2-shaped; `computeFapiMode` total over `fapiModes`; `/api/fapi/status` reports the whole profile | B1-W3 📋, B1-W4(=7009-W3), ATTR-W1, BCL-W6, BCL-W7, 9470-W6, 9728-W2, 9728-W1, 9126-W3, 9101-W5 📋, 9068-W2, FAPI1-W2, FAPI2-W4 ⊃ 7636-W2 | Independent of each other; batch freely. **FAPI2-W4 completes what FAPI2-W1 started** — the endpoint can then fail honestly on all eight FAPI requirements instead of six |
| **T1-20** | **Use `parseBasicAuth` for CIBA client authentication** — the same three-channel logic as `par.service.ts:39-54`, with a unit test per channel | CIBA-W3 📋 | Client authentication, so it needs a plan. **This is what makes `AGENTS.md`'s recommended CIBA configuration (`CLIENT_SECRET_BASIC`) actually work** — today the guide and the code disagree. Independent of CIBA-W1/W2, which are deferred (§7.1) |
| **T1-21** | ⛔ **DECLINED 2026-08-13, not deferred.** **Forward the attestation headers at PAR, and reject duplicates explicitly** | ATT-W2 ⛔, ATT-W4 ⛔ | Ruled after T1-5: `ATTEST_JWT_CLIENT_AUTH` is withdrawn and `challenge_endpoint` is absent (§2.2), so the path is unreachable **by construction** — no client and no test can exercise it, and shipping it would put permanently dead code on a Security-critical surface. Attached instead to **T1-5's existing re-add trigger** (re-advertising a withdrawn method already requires re-checking the SDK's `ClientAuthMethod` enum). **The row's own cross-reference was wrong**: this does not gate 9126-W4, which merged into 9449-W1 and shipped in T1-9 |

### Tier 2 — documentation, and the highest leverage in the audit

| # | Action | Items | Notes |
|---|---|---|---|
| **T2-1** | **Adopt the `UNVERIFIED` convention across the nine tutorials** | CUR-3c-W1 ⊃ **9396-W4** | **The single highest-leverage item in the plan.** The aggregate behind six S2s. Every transcript either reproducible or marked with the field responsible, per `modules/09a…/lab.md:36`. 9396-W4 (`RAR-TUTORIAL.md`'s three unproducible transcripts) is the worked example — and after T1-6 registers a RAR type, those transcripts become *runnable* rather than merely labelled |
| **T2-2** | **The seven stale open-redirect references** | CUR-3b-W1 ⊃ CUR-3d-W2 | §6.3. Module 10 ×5 + `final-exam-answers.md:227-229` + **`exams/final-exam.md:76`**, found 2026-08-12 during T0-3's phrase grep — the *question* still asserts the `startsWith` check, so it and its answer key had drifted apart. Six → **seven** |
| **T2-3** | **Fix the remediation grep rule** — search the *phrase*, and check every module cross-referencing the one edited | CUR-3b-W2 | The rule that would have prevented T2-2 |
| **T2-4** | **The TLS citation reconciliation** — Module 00 `:87` and `:250` note RFC 9846; RFC 9110 sharpened to Internet Standard STD 97; a new RFC 9864 row. **`SPEC-INVENTORY.md:42-50` is correct and is not to be edited** | CUR-3d-W1's outcome, CUR-3a-W4 | §2.1 |
| **T2-5** | **One `SPEC-INVENTORY.md` pass** — 15 IDs in one commit, each row carrying its fetched URL and header line | cluster 29 + **FED-W4** | Theme 5's remedy |
| **T2-6** | **`sd-jwt.mjs`: enforce the trailing tilde, fix `--out`/`--iss`, add a test file** | CUR-3c-W3, CUR-3c-W4, CUR-3c-W5 | The wrong ACCEPT is the substantive one. `scripts/` is outside both Vitest configs — the repo's only SD-JWT implementation has no regression net |
| **T2-7** | **Teach `check-docs.mjs` four reference forms** — bare paths, prose `Line ~NN`, `/api/…` endpoint paths in fenced blocks, and **`*.md:NNN` markdown line refs** | CUR-3a-W1 + CUR-3b-W5 + CUR-3c-W11 + **the fourth gap found 2026-08-11** | **Scope as one change.** Two EOF-overrunning pointers slipped through the first two gaps. The fourth gap let **20 `PROGRESS.md` citations drift silently** (§6.3) — the checker validates only `server/`\|`client/` source refs, so no markdown-to-markdown pointer is checked at all. Note the checker can only catch *past-EOF* refs; the `PROGRESS.md` drift was mostly *in-range and wrong*, which argues for §6.3's option (b) — cite `PROGRESS.md` by **section heading** — as the real fix, with the checker as the backstop |
| **T2-8** | **The claimed-working/flag-off table**, derived from live configuration | NSSO-W4 ⊃ FAPI2-W3, MCP-W3, VCI-W1's doc half | Theme 2. See §7.3 for the mechanical version |
| **T2-9** | **Export `errorStatusFrom`**, or record the prohibition | EH-W5's residue (§1.2) | So the next local handler inherits the clamp instead of re-deriving the bug |
| **T2-10** | **The stale line-number sets** — handler refs across four documents; `dpop.service.ts` pointers; `introspection.controller.ts:47`; two Phase 2 re-anchors; `ParSection.tsx` | 8693-W3 ⊃ CUR-3b-W6 ⊃ CUR-3c-W10, CUR-3b-W4, CUR-3b-W7, CUR-3c-W12, CUR-3a-W2 | Prefer anchoring on the ⚠️ comment text — these have drifted once already |
| **T2-11** | **The step-up challenge status everywhere**, including the sequence-diagram arrow | 9470-W1 ⊃ CUR-3c-W6 ⊃ CUR-3b-W8 | A learner reading only the diagram must not build a 403 challenge |
| **T2-12** | **Correct CUR-3b-W9's acceptance criteria, then ship it** | CUR-3b-W9 + §2.2 result 2 | `ES256` **is** advertised. The row is "partially", not FAIL |
| **T2-13** | **Fix the 60s/60min error** in `AGENTS.md` and Module 05 | FAPI1-W1 = FAPI1A-W3 ⊃ CUR-3b-W10 | A spec-accuracy defect in the repo's most-read reference file |
| **T2-14** | **The five citation and section-number fixes** | CUR-3b-W3, CUR-3b-W12, CUR-3b-W13(=NSSO-W3), CUR-3b-W15, CUR-3b-W16, 9470-W4, 9449-W5, 8252-W1 | CUR-3b-W15 is now evidenced (§2.3). CUR-3b-W12 and 8252-W1 each need one fetch (§2.4) |
| **T2-15** | **The wire-format gaps, stated until Tier 3 closes them** | 9126-W6, CIBA-W5, 8628-W5, 9101-W4, 7592-W3 | Theme 3's honest interim. Style: `modules/04…/lab.md:340` |
| **T2-16** | **The vendor-feature documentation pass** — HSK endpoints, `attributes`, parameterized scopes, all labelled *vendor feature, not a specification* | HSK-W1, HSK-W2, ATTR-W2, ATTR-W4, PS-W1, PS-W2 | One `docs/API.md` + `SPEC-INVENTORY.md` edit for all three |
| **T2-17** | **Remaining documentation items** | ~~6749-W1~~ ✅ **shipped 2026-08-13 as code, not documentation** — Authlete does not reject dual-channel client credentials, so the escape clause did not apply; `400 invalid_request` at `/api/token` and `/api/par`. 6749-W2, 7521-W2, 8705-W2, 8705-W3, 8707-W2, 9068-W3, 9068-W4, 9207-W2, 9701-W3, 9701-W5, 9728-W3, 8414-W3, 8414-W4, 9396-W2, 8693-W1, 8693-W2, JOSE-W4, JOSE-W5, CIMD-W4, GM-W3 ⚙️, GM-W5, MDL-W2, MCP-W1, 7591-W2, 7662-W4, 7662-W5, 9700-W3, 9700-W5, 8707-W1, 8707-W3, CUR-3a-W6, CUR-3c-W8, CUR-3c-W9, CUR-3c-W13, CUR-3c-W14, JARM-W2, JARM-W4, JARM-W5, JARM-W6, 7523-W2 (= JOSE-W3), 7523-W3 📋, 7523-W5, 9449-W6, 9449-W7 ⚙️, FAPI1A-W4, FAPI1A-W5, MS-W2, FCL-W3, BCL-W4, BCL-W5, **RPL-W5**, **B1-W5**, **CUR-3b-W14** | Independent; batch by file. **BCL-W5 is unblocked** — T0-2 shipped 2026-08-11. **RPL-W5 ✅ shipped with T0-4 (2026-08-12)** — remove it from this batch. The departure it names changed shape in the process: not *"we match origins, not registered values"* but *"we match registered values, held here because Authlete models none"*. ~~CUR-3b-W14~~ ✅ **closed by T1-6 (2026-08-12)** — all four markers deleted rather than re-dated; remove it from this batch |

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
| 0 | ✅ **MET 2026-08-12.** All six actions shipped (T0-1…T0-6); **589 tests / 56 files** green; `check-docs.mjs` clean at 167 files; both stale entries banner-ed. One acceptance criterion could not be met as written — RPL-W4's client registration — and the reason is recorded as **F-4** rather than waived |
| 1 | **Every T1 action shipped, or explicitly closed with its reason recorded** — plus: every ⚙️ change verified **from the discovery document**, not from the console UI; the four `UNVERIFIED` markers retired; T1-17's **five** probes recorded in `PROGRESS.md`. *(Corrected 2026-08-13. As written this criterion said "three probes" — T1-17 has five — and covered only the ⚙️ half of a tier titled "configuration and contained code", so it would have marked Tier 1 complete on 2026-08-12 with eleven code actions untouched. An exit criterion that omits most of its tier is worse than none.)* |
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
7. **Re-anchor every citation that points into a file you edited** — by matching *content*, not by adding an
   offset. Added 2026-08-11, because its absence is what produced both drifts in §6.3, and the second one was
   created by the very commit that fixed the first. Two rules learned doing it:
   - **A multi-hunk diff shifts different regions by different amounts.** `b5e60d4` moved one range by 69 and
     another by 77; blanket arithmetic would have "fixed" nine refs into new wrong positions.
   - **Sometimes the target is gone, not moved** — `PROGRESS.md:401`'s quoted sentence was deleted. Then the
     citation has to be *reworded* (quote the revision by git ref), not renumbered.

   `check-docs.mjs` cannot help here: it validates only `server/`|`client/` source refs, and only that the line
   is not past EOF. **Prefer an edit that does not move lines at all** when one exists — T0-1 kept both of its
   blocks at four lines for exactly this reason.

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
