# Phase 4 — decision records

- **Written:** 2026-08-11
- **Companion:** [`04-remediation-plan.md`](04-remediation-plan.md) — the ordered plan these records gate
- **Status:** ⬜ awaiting **Gate 4**

**What belongs here.** A record for each **genuine choice** — a case where the audit found no defect to fix but a
position to take, and where taking a different position would have been defensible. A missing feature with an
obvious fix is a work item, not a decision. That distinction is why RFC 9901 gets no record (DR-19) and why
`accessTokenDuration` does not either: shortening it is simply correct.

**Nineteen records.** Eleven are open rulings Gate 4 must make; seven confirm standing declines with their
rationale corrected; one is the meta-decision to write no record.

Each record carries a **revisit trigger** — the condition under which the decision should be reopened. A
decline with no trigger is a dead end rather than a decision.

| # | Subject | Status | Gates |
|---|---|---|---|
| [DR-01](#dr-01--mutual-tls-rfc-8705) | Mutual TLS | **UPHELD** — decline, rationale corrected | FAPI 1.0 Part 2, FAPI 2.0's mTLS branch |
| [DR-02](#dr-02--fapi-20-security-profile) | FAPI 2.0 Security Profile | ⬜ **open — recommend qualify, do not enable** | The most curriculum material of any record |
| [DR-03](#dr-03--oid4vci-verifiable-credential-issuance) | OID4VCI | ⬜ open — recommend enable | Module 09b, `README.md` |
| [DR-04](#dr-04--native-sso) | Native SSO | ⬜ open — recommend do not enable | `NATIVE-SSO-TUTORIAL.md`, Module 09a |
| [DR-05](#dr-05--cimd-and-the-mcp-claim) | CIMD / MCP | ⬜ open — recommend enable CIMD, qualify MCP | `MCP-OAUTH-TUTORIAL.md` |
| [DR-06](#dr-06--fapi-10-baseline-and-advanced) | FAPI 1.0 | ⬜ open — recommend document-only | Module 10 |
| [DR-07](#dr-07--spiffe_jwt-and-the-nine-advertised-client-auth-methods) | `SPIFFE_JWT` | ⬜ **open — recommend drop, with Module 10 Ex 4 rebuilt** | **Module 10 Exercise 4** |
| [DR-08](#dr-08--session-management-and-front-channel-logout) | Session Management + Front-Channel Logout | ⬜ open — recommend decline | Module 08 |
| [DR-09](#dr-09--jwt-access-tokens-rfc-9068) | JWT access tokens | ⬜ open — recommend defer | Module 04, `STEP-UP-AUTH-TUTORIAL.md` Part 4 |
| [DR-10](#dr-10--the-three-deliberate-token-exchange-defects) | Token-exchange defects | ⬜ open — **recommend keep** | Module 06 Ex 6a/6b/6c |
| [DR-11](#dr-11--the-issuerhost-mismatch) | The issuer/host mismatch | ⬜ open — recommend align the issuer | Module 04, MCP, RFC 9207 |
| [DR-12](#dr-12--agentsmds-security-critical-surfaces-list) | `AGENTS.md` surfaces list | ⬜ **open — decided below, per the brief** | Every future plan-mode trigger |
| [DR-13](#dr-13--oid4vp) | OID4VP | **UPHELD** — structurally inapplicable | — |
| [DR-14](#dr-14--haip-10) | HAIP 1.0 | **UPHELD** — cost-declined | — |
| [DR-15](#dr-15--mdl--mdoc-isoiec-18013-5) | mDL / mdoc | **UPHELD** — declined, paywalled | The curriculum's verification promise |
| [DR-16](#dr-16--saml-assertion-profile-rfc-7522) | RFC 7522 | **UPHELD** — declined at the vendor layer | Module 06 |
| [DR-17](#dr-17--hardware-security-keys) | HSK | **UPHELD** — document-only | — |
| [DR-18](#dr-18--parameterized-scopes-and-scopeclient-attributes) | Vendor scope features | **UPHELD** — document-only | Module 04, Module 09a |
| [DR-19](#dr-19--rfc-9901-sd-jwt--no-decision-record) | RFC 9901 | **DELIBERATELY NO RECORD** | — |

---

## DR-01 — Mutual TLS (RFC 8705)

**Status: UPHELD — decline stands, rationale corrected.** Ruled at Gate 0, re-examined in
[`RFC8705-mutual-tls.md`](02-findings/RFC8705-mutual-tls.md), and Group C inherits it.

**Decision.** mTLS client authentication and certificate-bound access tokens are **not implemented**. The
service **stops advertising** what it cannot serve (8705-W1).

**Why the rationale needed correcting.** The original one-liner said a client certificate *"cannot arrive"*.
That is too strong: it cannot arrive **in this deployment's current fronting**. RFC 8705 §6.5 leaves the
TLS-terminating-proxy hop unspecified, and RFC 9440 (*Client-Cert HTTP Header Field*, **Informational**, July
2023) defines a mechanism for forwarding it — with an explicit sanitisation hazard, since a header a proxy adds
is a header a client can forge if the proxy does not strip it.

**Evidence, now measured rather than inferred** (`04-remediation-plan.md` §2.2):

- `tls_client_certificate_bound_access_tokens: false`
- `token_endpoint_auth_methods_supported` **advertises `tls_client_auth` and `self_signed_tls_client_auth`**

So the deployment currently advertises two authentication methods it cannot honour — theme 1, and the reason
8705-W1 is a real action rather than tidying.

**Consequences.** FAPI 1.0 Part 2 is document-only **by inheritance** (DR-06). FAPI 2.0's mTLS branch is closed,
leaving `private_key_jwt` + DPoP as the only viable route (DR-02).

**Revisit trigger.** A deployment behind a proxy that terminates TLS *and* is configured to strip and re-add a
client-certificate header per RFC 9440 — the stripping is the load-bearing half.

---

## DR-02 — FAPI 2.0 Security Profile

**Status: ⬜ open. Recommendation: qualify the claim; do not enable the profile.**

**The choice.** Enabling FAPI 2.0 requires, together: one client with `private_key_jwt` + a JWKS (T1-3), PAR
required, PKCE S256 required, DPoP required, refresh-token rotation disabled, and PS256/ES256/EdDSA only.

**Why the recommendation is "qualify".** Requiring PKCE-S256 and PAR **breaks the retired-grant exercises** —
Module 01 Exercise 3 and Module 07 §3b both hinge on ROPC succeeding, and Module 05 Exercises 3–4 require
`parRequired: false` (`lab.md:23-35`). This is a **teaching** authorization server whose curriculum depends on
being able to demonstrate the grants FAPI forbids. A profile that forbids them is not a configuration this
deployment can hold and still teach what it teaches.

**The honest alternative is already established practice in this repo.** Module 05 teaches mTLS from the
specification and states plainly that it is not runnable here. FAPI 2.0 can be taught the same way, and Module
10 largely already does.

**What "qualify" costs.** `README.md`'s FAPI 2.0 row becomes *"profile not enabled; DPoP implemented and
verified"* (FAPI2-W3, inside T2-8). `getStatus` reports the whole profile so it can fail honestly on all eight
requirements (FAPI2-W4). `FAPI-TUTORIAL.md` gets real transcripts or labels (FAPI2-W6, inside T2-1).

**Measured gap** (`04-remediation-plan.md` §2.2): `require_pushed_authorization_requests: false`;
`tls_client_certificate_bound_access_tokens: false`; `id_token_signing_alg_values_supported` =
`HS256, HS512, ES256, HS384` — **`ES256` is permitted by FAPI 2.0 and is available**, while three forbidden HMAC
algorithms are not withdrawn. That nuance corrects CUR-3b-W9 (T2-12).

**Curriculum consequence if Gate 4 enables it instead.** Module 01 Ex 3 and Module 07 §3b reverse. Both modules
already name `fapiModes` as the cause (3d-F2), so the labs would explain the reversal rather than break
silently — the cheapest version of this cost the audit found.

**Revisit trigger.** The deployment splits into two service profiles — one for the retired-grant curriculum, one
FAPI-conformant. That is MCP-W5's option 2 and would serve DR-05 too.

**Blocks:** MS-W5 (Message Signing is not meaningful separately), FAPI1-W4, and RFC 7636's residual S1.

---

## DR-03 — OID4VCI (Verifiable Credential Issuance)

**Status: ⬜ open. Recommendation: enable — after DR-11.**

**The choice.** `verifiableCredentialsEnabled = true` + `credentialIssuerMetadata` configured, or stop
presenting VCI as shipped.

**Why enable.** Unlike DR-02 and DR-04, **enabling costs the curriculum nothing** — it breaks no lab and
reverses no transcript. The code is already correct: routing, the three auth tiers, and the asymmetric action
maps were all verified (VCI-W4 is an explicit no-op). Module 09b teaches VCI and would gain a runnable path.
The `pre-authorized_code` grant is **already advertised** in `grant_types_supported`
(`04-remediation-plan.md` §2.2) — so the deployment is already claiming part of this in metadata.

**Why it is sequenced behind DR-11.** VCI-W2 links the AS and the issuer via `credential_issuer` in AS discovery
and `authorization_servers` in the issuer document. With the issuer/host mismatch unresolved, that linkage points
at a host that does not serve the document. **Enabling before DR-11 produces a metadata pair that is internally
inconsistent** — worse than the current honest absence.

**Measured gap:** `credential_issuer` **ABSENT** from the 62 members.

**If declined instead.** `README.md` and `VciSection.tsx` read *"implemented, service flag off"*, and Module 09b
carries the same banner — theme 2's remedy (T2-8).

**Revisit trigger (if declined).** A wallet becomes available, which is also DR-13's trigger.

---

## DR-04 — Native SSO

**Status: ⬜ open. Recommendation: do not enable.**

**The choice.** `nativeSsoSupported = true`, or stop claiming the feature works.

**Why not enable.** Two reasons, and the second is the substantive one.

1. Native SSO 1.0 is an **active Internet-Draft (draft 07, 16 Jan 2025)**, not a Final specification — the one
   feature in this group resting on a moving document.
2. **NSSO-W2's `sid` question is unresolved, and resolving it is a security-critical code change.** The
   deployment generates a fresh `sessionId` per authorization; a second app must be able to exchange an ID token
   issued under an *earlier* session. If it cannot, `sessionId` must derive from the browser session — a change
   to `services/authorization.service.ts`, which is on the Security-critical surfaces list. **Enabling the flag
   first would produce a two-app sequence that half-works**, and a half-working SSO transcript is worse teaching
   material than a stated gap.

**Measured gap:** `native_sso_supported` **ABSENT**.

**What declining costs.** `README.md`'s table reads *"implemented, service flag off"*, and
`NATIVE-SSO-TUTORIAL.md` carries the same banner. That tutorial is **already** one of batch 3c's S2s — four
transcript blocks share one fabricated `device_secret` with zero `UNVERIFIED` markers — so it is being rewritten
under T2-1 regardless. **Declining and rewriting are the same commit.**

**Revisit trigger.** Native SSO reaches Final **and** the `sid` derivation question is answered by DR-08's
durable-session-identity work — the two share a prerequisite.

---

## DR-05 — CIMD and the MCP claim

**Status: ⬜ open. Recommendation: enable CIMD; qualify the MCP claim. Two decisions, not one.**

**Why they separate.** CIMD is a capability with a flag. "MCP support" is a *conformance claim* about OAuth 2.1,
and OAuth 2.1 forbids the implicit and password grants this curriculum exists to demonstrate. Enabling CIMD does
not make the MCP claim true, and that is precisely the conflation `MCP-OAUTH-TUTORIAL.md`'s opening sentence
makes.

**Recommend enabling CIMD** (`clientIdMetadataDocumentSupported = true`, subject to confirming the service's
patch level meets Authlete 3.0.22). Authlete handles CIMD entirely server-side — no new endpoints, no client
code. It breaks no lab. And it gives an MCP client a registration path, which is MCP-W4: **`registration_endpoint`
is ABSENT** from the 62 members, so today an MCP client has no way to register at all.

**Recommend qualifying the MCP claim.** A teaching service that must demonstrate `implicit` and `password`
cannot simultaneously claim OAuth 2.1 conformance — and `grant_types_supported` advertises both
(`04-remediation-plan.md` §2.2). The tutorial states which MCP requirements this deployment meets, which it does
not, and that the retired grants are enabled deliberately.

**Measured gap:** `client_id_metadata_document_supported` **ABSENT**; `registration_endpoint` **ABSENT**.

**Curriculum consequence.** T0-5 (CUR-3c-W2) corrects the opening sentence and is in **Tier 0** — it is the
smallest fix with the largest blast radius in Phase 3, and it does not wait for this decision. This record
decides what the *corrected* sentence says about CIMD.

**Also record CIMD-W4:** draft-02 forbids following redirects when fetching a CIMD document; Authlete performs
the fetch; this deployment cannot verify compliance. Same delegated-MUST treatment as RFC 9449 §7.2.

**Revisit trigger.** CIMD reaches RFC status, or a two-profile deployment (DR-02's trigger) makes an
OAuth 2.1-conformant MCP claim possible.

---

## DR-06 — FAPI 1.0 Baseline and Advanced

**Status: ⬜ open. Recommendation: document-only. Part 2 `OUT_OF_SCOPE` by inheritance; Part 1 not claimed.**

**Part 2 (Advanced) — decline by inheritance.** Part 2 requires mTLS as a sender-constraining mechanism; mTLS is
declined with reasons (DR-01); therefore Part 2 is document-only. This is **FAPI1A-W1** and its real value is
removing Part 2 from configuration-debt tracking, where it does not belong — it is not an unfinished feature.

**Part 1 (Baseline) — do not claim.** Part 1 is roughly three-fifths met already, so "enable Baseline" is a
smaller step than DR-02. But it still requires PKCE-S256 mandatory and a JWKS-bearing client, which collides
with the same retired-grant exercises. **The collision is DR-02's, and the answer should be the same** —
otherwise the deployment holds two inconsistent positions on the same trade-off.

**Two items are worth doing regardless of this decision**, because they serve OIDC Discovery and Module 08:

- **OIDC-W2** (= FAPI1A-W2) — one RSA key satisfies OIDC Discovery §3's RS256 MUST *and* FAPI's PS256. T1-2.
- **FAPI1A-W4** — extend Module 08's existing `c_hash` exercise (`lab.md:326`) to observe `s_hash`. The only
  Part-2-specific behaviour demonstrable here without mTLS.

**And one spec-accuracy fix that is not a decision at all:** the **60s/60min error** in `AGENTS.md`'s flags table
and Module 05 (FAPI1-W1 = FAPI1A-W3 ⊃ CUR-3b-W10). §5.2.2's bound is 60 **minutes**. T2-13.

**Revisit trigger.** DR-02 is revisited — these move together.

---

## DR-07 — `SPIFFE_JWT` and the nine advertised client-auth methods

**Status: ⬜ open. Recommendation: drop `SPIFFE_JWT`, and rebuild Module 10 Exercise 4 in the same commit.**

**This is the highest-consequence record**, because it is the only route that retires a working exercise.

**The mechanism, established and not to be re-tested.** Authlete returns `supportedTokenAuthMethods` containing
`SPIFFE_JWT`; SDK 1.0.0's `ClientAuthMethod` is a **strict** Zod enum of eight members that does not include it;
one unrecognised value rejects the whole 129-field response. So `authleteApi.service.get()` throws, and both
`GET /api/fapi/config` and `GET /api/fapi/status` fail.

**Confirmed from the live document:** `spiffe_jwt` is present in `token_endpoint_auth_methods_supported`
(`04-remediation-plan.md` §2.2).

**Three escape routes, and the third one already shipped.**

| Route | Effect | State |
|---|---|---|
| Drop `SPIFFE_JWT` from the service | `service.get()` works; both endpoints work | ⬜ **this decision** |
| Wait for an SDK that knows the member | Same, on someone else's schedule | ⬜ not actionable |
| **Fix the status inversion** so the failure is honest | Endpoints still fail — but with **500**, not 200 | ✅ **shipped 2026-08-11** (EH-W1) |

**Why the general problem matters more than this member.** Any client-auth method Authlete adds in future breaks
`service.get()` for every TypeScript SDK caller whose service enables it. Dropping `SPIFFE_JWT` fixes today's
instance, not the class. **A `patch-package` patch is not an option** — `AGENTS.md` records that the previous
patch directory is gone and must not return.

**Why "drop" is nonetheless recommended.** Nothing in this deployment uses SPIFFE. It is one of **five of nine
advertised methods that are unusable** (`04-remediation-plan.md` §4 theme 1), and ATT-W3 reviews all nine as one
console decision — which also delivers 8705-W1 (DR-01's metadata fix) and the attestation finding. **One console
change, three findings, and two currently-broken endpoints start working.**

**The cost, stated exactly.** Dropping `SPIFFE_JWT` **retires Module 10 Exercise 4.** EH-W1 did *not* — the
exercise was reframed around *two defects with one symptom* (EH-W4 ✅), keeping the 200 as a dated historical
transcript. Dropping the member removes the second defect too, and with it the exercise's subject. **It must be
rebuilt, in the same commit**, per `AGENTS.md`'s rule that a behaviour change ships with its curriculum change.

**A rebuild is available and is better material.** The exercise's real lesson — a strict client-side enum makes a
server's forward-compatible field a breaking change — survives the fix and is *more* interesting once the
learner has seen it fixed. `AGENTS.md`'s **Deliberate defects** table must be consulted before this ships, and
this decision must not be taken as pre-approving that edit.

**Revisit trigger.** An SDK release whose `ClientAuthMethod` tolerates unknown members — at which point the
general fragility is fixed and the member could return.

---

## DR-08 — Session Management and Front-Channel Logout

**Status: ⬜ open. Recommendation: decline both, as one decision with one shared prerequisite.**

**Why one record for two specifications.** FCL-W4 = SM-W3: both are blocked by the same missing thing —
**durable OP session identity**. So are back-channel logout's `sid` mode and Native SSO's `sid` (DR-04). Treating
them as four independent gaps was the mistake Phase 2 corrected.

**Decision.** Neither is implemented. Both are **Final** OpenID specifications (12 September 2022) and the
records must not imply otherwise — the reason is mechanism, not status.

**Grounds.**

1. **The OP-side prerequisite is durable session identity, not the iframe page.** Building the iframe without a
   stable `sid` produces a mechanism that reports "changed" unreliably.
2. **Browser third-party-cookie restrictions** have made the `check_session_iframe` polling model unreliable in
   practice, independently of this deployment.
3. `prompt=none` already serves the "is the user still logged in?" question here — and note that path has its
   own open finding (T1-7), which should land before anything else depends on it.

**Measured gap:** `check_session_iframe` **ABSENT**; `frontchannel_logout_supported` **ABSENT**;
`backchannel_logout_supported` **ABSENT**.

**Documentation consequences.** FCL-W2 (date the row 12 Sep 2022, drop the *(see note)* qualifier), FCL-W3 (the
implementation column reads *"not implemented"*, not *"logout routes"*), SM-W2 (a real row replacing the
footnote-only treatment). All inside T2-5.

**Revisit trigger.** Durable OP session identity is built for **any** of its four consumers — at which point
this record is reopened for all four at once. That is the point of recording them together.

---

## DR-09 — JWT access tokens (RFC 9068)

**Status: ⬜ open. Recommendation: defer. Do the three documentation items now.**

**The choice.** Set `accessTokenSignAlg` so access tokens are `at+jwt`, or keep them opaque.

**Why defer.** Turning it on **changes the format of every access token this deployment issues** — Token
issuance in substance, so it needs a plan (`utils/createLocalJWT.ts` is not on the surfaces list, but the change
is). It also has two live curriculum couplings: Module 04's opaque-token exercises, and
`STEP-UP-AUTH-TUTORIAL.md` Part 4. And it activates 9068-F3 — §3's default-`aud` MUST, currently latent because
no JWT is issued. **Deferring costs nothing; enabling costs a lab pass and activates a new requirement.**

**Do these three now, regardless** — they are independent and none waits on the decision:

- **9068-W2** — make the dev-only local JWT §2-shaped: `typ: at+jwt`, plus `client_id`, `jti`, `scope`. T1-19.
- **9068-W3** — separate the two halves of Module 04's lesson: audience restriction is runnable here via
  introspection; self-contained tokens are not. Learners should know which claim they can verify.
- **9068-W4** — label `STEP-UP-AUTH-TUTORIAL.md` Part 4's JWT payload as illustrative, and state that this
  deployment conveys `acr`/`auth_time` through introspection (RFC 9470 §6.2), not in a JWT access token.

**Revisit trigger.** Module 04 gains an exercise needing a self-contained token, or DR-02 flips (FAPI 2.0 does
not require JWT access tokens, but the two decisions would be taken together).

---

## DR-10 — The three deliberate token-exchange defects

**Status: ⬜ open. Recommendation: keep all three. This record exists to make the option visible, not to take it.**

**The defects, confirmed against RFC 8693 and deliberately retained** — `AGENTS.md`'s **Deliberate defects**
table, `controllers/token-exchange-response.handler.ts`:

| Defect | Taught by |
|---|---|
| Drops `resources`, `audiences`, `actorToken`, `requestedTokenType`; passes no lifetime — so `resource`/`audience` do not audience-restrict, `actor_token` downgrades delegation to impersonation, tokens live 24 h | Module 06 Ex 6b |
| Omits `issued_token_type` (§2.2.1 **REQUIRED**); emits non-spec `client_id`/`subject` | Module 06 Ex 6a |
| `result.subject \|\| subjectToken` puts a live access token in an identity field | Module 06 Ex 6c |

**Why keep.** The coupling is **intentional**, unlike §6.3's live drift. A characterization test
(`tests/unit/controllers/token-exchange-response.handler.test.ts`) asserts the current behaviour and names the
documents to update, so a change fails loudly rather than rotting a lab. This is the repo's best-engineered
piece of deliberate-defect machinery and there is no conformance reason to disturb it.

**If Gate 4 takes 8693-W5 anyway** (forward `resources`, pass `accessTokenDuration`): it **retires Module 06
Exercise 6b in part**, and requires the lab, the quiz answers, `docs/TOKEN-EXCHANGE-TUTORIAL.md` (Part 12 and
Parts 7/9/11) and `PROGRESS.md` updated in the same commit. **`AGENTS.md` is explicit that a change described in
a follow-up section is not an approved change** — this record does not approve it.

**Three corrections to statements *about* the defects are safe now** and are not part of this decision:
8693-W1 (the `audience` claim — Authlete has **no** token-create field for it, so the drop can never change),
8693-W2 (delete the "Not covered by tests" section), 8693-W3 (the stale line numbers across **four**
documents — T2-10).

**Revisit trigger.** Module 06 is rewritten, or RFC 8693 conformance becomes a deployment requirement.

---

## DR-11 — The issuer/host mismatch

**Status: ⬜ open. Recommendation: align the service `issuer` with the host that serves the document.**

**The defect, now measured exactly** (`04-remediation-plan.md` §2.2):

- `issuer`: `https://blackadi.dev`
- **every** endpoint — authorization, token, userinfo, jwks, introspection, revocation, PAR, device, CIBA, GM,
  federation: `https://cecile-soapsudsy-zoila.ngrok-free.dev/api/…`

RFC 8414 §3.3 requires the `issuer` to equal the prefix of the URL the document was retrieved from. It does not.

**Why this is a decision and not just a fix.** It is a **deployment** choice as much as a code one: either set
the service `issuer` to the host that actually serves the document, or serve the document at the declared
issuer. The second option means putting a stable host in front of the deployment, which is a bigger change than
a console edit — and it is also what **8628-W5** wants (RFC 8628 §3.2's `verification_uri` is on the same
ephemeral tunnel, so the device flow's human-facing leg is time-bombed).

**Recommend aligning the issuer to the serving host** as the cheap immediate fix, and treating a stable host as
a separate deployment item. A self-consistent issuer on a tunnel is better than an inconsistent one on a domain.

**Why it gates more than it looks.**

| Blocked by this | Item |
|---|---|
| RFC 9207 `iss` validation is unteachable — the expected issuer has no correspondence to fetch | 9207-W2 |
| MCP discovery cannot work; it is one of the two preconditions the tutorial misstates | 8414-W5, T0-5 |
| VCI's AS↔issuer linkage would point somewhere unretrievable | **DR-03**, VCI-W2 |
| FAPI 2.0 Attacker Model **A1a** — the fix should be justified by the threat, not by a path convention | AM-W1 |

**Also fix, in the same pass:** serve OIDC Discovery at the **true root** (8414-W2), keeping the `/api` path as a
documented alias so `SPEC-INVENTORY.md:126`'s lab instruction keeps working. And Module 04's metadata exercises
should have the learner *observe* the §3.3 mismatch before it is fixed — a better lesson than routing trivia.

**Revisit trigger.** The deployment moves off the ephemeral tunnel — at which point 8628-W5 closes too.

---

## DR-12 — `AGENTS.md`'s Security-critical surfaces list

**Status: DECIDED below, per the Phase 4 brief. Gate 4 confirms.**

**Re-verified against `AGENTS.md` on 2026-08-11.** `RESUME.md` §5.3 named four candidate additions and recorded
two as landed. **Three have landed:**

| File | Row | State |
|---|---|---|
| `routes/device.routes.ts` | Access control (`AGENTS.md:225`) | ✅ landed |
| `middleware/development-only.ts` | Access control (`AGENTS.md:225`) | ✅ landed |
| `services/logout.service.ts` | Session termination & redirect targets (`AGENTS.md:230`) | ✅ landed |
| `controllers/logout.controller.ts` | Session termination & redirect targets (`AGENTS.md:230`) | ✅ landed |
| **`middleware/errorHandler.ts`** | — | ⬜ **open** |

### Decision: add `middleware/errorHandler.ts`, under its own concern row

**Three grounds.**

1. **It decides the HTTP status of every failure in the application** — all 57 SDK call sites plus every local
   throw. `errorStatusFrom` (`server/src/middleware/errorHandler.ts:25-33`) is the only thing standing between a
   thrown `AuthleteError` and the status line a monitor reads.
2. **It is the sole gate on stack-trace disclosure.** `server/src/middleware/errorHandler.ts:65` and `:77` both
   emit `err.stack` when `isDevelopment`. A wrong edit there leaks stack traces in production — a disclosure
   control, not a rendering concern.
3. **It has already produced one security-relevant defect** — every SDK validation failure served as HTTP 200 —
   which is exactly the class plan-mode review exists to catch. The file was edited without a plan because it
   was not on the list.

**It needs a new concern row, not an existing one.** The six current rows all describe *token and authorization
decisions*. This file decides **how failures are reported and how much they disclose**. Recommended row:

| Concern | Files |
|---|---|
| Failure disclosure & status derivation | `middleware/errorHandler.ts` |

**The counter-argument, and why it does not carry.** Adding a generic middleware invites ceremony on formatting
changes. But `AGENTS.md`'s own rule is *"size is not the trigger; the concern is"*, and `CLAUDE.md` already
exempts semantics-free edits (renames, comments, formatting). The exemption covers the objection.

### The four adjacent candidates — ruled on, not folded in silently

Each surfaced in a Phase 2 entry's ordering note. Listing them makes the scope of this decision visible.

| File | Ruling | Reason |
|---|---|---|
| `services/jwt-verification.service.ts` | **Add** — Token issuance | It decides what subject a token is minted for. 7523's entry already says *"I would treat it as if it were"*; make that explicit rather than relying on a reader finding the note |
| `controllers/introspection-standard.controller.ts` | **Add** — Token presentation & introspection | Its sibling `controllers/introspection.controller.ts` is listed, and both shape introspection output. An asymmetric list is a list people mistrust |
| `controllers/jar.controller.ts` | **Conditional** — add once B1-W2 settles its auth posture | Today it emits Authlete tickets to unauthenticated callers. That is a defect to fix (B1-W1/W2), and *after* the fix the file mediates authorization requests and qualifies. Adding it now would freeze a broken design behind ceremony |
| `controllers/fapi.controller.ts` | **Decline** | It *reports* posture; it does not decide outcomes. FAPI2-W1 locked it with tests against both a hardened and an unhardened service, which is stronger protection than plan mode. `AGENTS.md` already excludes `fapi` explicitly, and that exclusion is correct |

**Revisit trigger.** Any future audit finding whose root cause is *"this file decided a security outcome and was
edited without a plan"* — the same evidence that produced this record.

---

## DR-13 — OID4VP

**Status: UPHELD — structurally inapplicable, not merely unbuilt.**

**Decision.** No implementation. **An authorization server has no OID4VP obligations at all** — the specification's
roles are **Wallet** and **Verifier**, and this component is neither.

**Why the distinction matters.** `SPEC-INVENTORY.md`'s row currently reads as an unbuilt feature. It is not
unbuilt; it is *inapplicable*. That is the same correction RFC 9901 needs (DR-19), and getting it wrong inflates
the apparent conformance debt with work that does not exist. **VP-W2** fixes the row with one clause.

**Distinguish from DR-14.** `01-spec-matrix.md` §3 currently gives OID4VP and HAIP the same treatment. They are
different rulings: OID4VP is **structurally inapplicable**; HAIP is **cost-declined**. HAIP-W3 separates them.

**Optional, and worth doing:** **VP-W3** — a prose page in Module 09b on the presentation leg (DCQL, the Key
Binding JWT's `aud`/`nonce`/`sd_hash`, and why unlinkability matters), labelled not-run-here in the style
Module 05 uses for mTLS.

**Revisit trigger.** A wallet becomes available **and** OID4VCI is enabled (DR-03). Issuance is blocked first.

---

## DR-14 — HAIP 1.0

**Status: UPHELD — cost-declined.**

**Decision.** No implementation. **OpenID4VC High Assurance Interoperability Profile 1.0**, OpenID Final,
**24 December 2025** (HAIP-W2 — the last undated Group C row).

**Grounds: a three-link prerequisite chain, none of which is cleared.**

1. OID4VCI must be enabled — DR-03.
2. A wallet must exist — DR-13's trigger.
3. HAIP builds on a FAPI 2.0-style profile — and **DR-02 declines FAPI 2.0 because it conflicts with the
   curriculum.** That is the binding constraint, and it is a curriculum conflict rather than a cost.

**Revisit trigger.** Links 1–2 cleared **and** a FAPI 2.0 service profile exists — i.e. DR-02's two-profile
option.

---

## DR-15 — mDL / mdoc (ISO/IEC 18013-5)

**Status: UPHELD — declined.**

**Four grounds.** (1) An AS has no mdoc obligations. (2) It requires a wallet *and* a CBOR/COSE toolchain —
neither present. (3) **SD-JWT VC satisfies the same HAIP requirement** at a fraction of the cost, and this repo
already has an SD-JWT implementation. (4) **The standard is paywalled**, so a citation-standard page cannot be
written for it — `MDL-MDOC-ISO18013-5.md` F-1 cites nothing from the text, deliberately.

**The consequence that reaches beyond this row.** `docs/curriculum/README.md:116-122` promises that every
specification claim is verified against the primary source. For a paywalled standard that promise cannot be
kept. **MDL-W2** adds a category for standards whose text is not publicly retrievable, so the promise stays
true. It should be reviewed alongside FED-W4's per-row provenance discipline (T2-5) — both are about making the
curriculum's accuracy claims survive contact with reality.

**Also:** **MDL-W3** — the inventory row's gating condition reads *"requires a wallet **and** a CBOR/COSE
toolchain; SD-JWT VC satisfies the same HAIP requirement"*.

**Revisit trigger.** An ecosystem requirement for mdoc **specifically** — not for verifiable credentials
generally, which SD-JWT VC covers.

---

## DR-16 — SAML assertion profile (RFC 7522)

**Status: UPHELD — declined at the vendor layer.**

**Decision.** No implementation. **Authlete 3.0 exposes no SAML grant type**, so the cost is a full SAML
assertion verifier in Node — XML canonicalisation, XML-DSIG, and the attendant XML attack surface — for a grant
Authlete cannot accept anyway.

**Why the framing matters (7522-W2).** Module 06 currently reads as though *this repo* chose not to implement it.
The real reason is that the **vendor does not offer it**, which is both more accurate and more instructive:
it shows learners where the delegation boundary actually lies. One sentence.

**Revisit trigger.** An ecosystem requiring SAML bridging, **or** Authlete adding the grant type. The second is
the realistic one.

---

## DR-17 — Hardware Security Keys

**Status: UPHELD — keep the code, document it, no SPA section.**

**Decision.** The four `/api/hsk/*` endpoints stay as they are. **HSK-W4 is an explicit no-op**: routing, admin
authentication and the action mapping (including the asymmetric list map, which reads like a bug and is not) are
all correct and tested. **Recording that is the finding.**

**Why it needs a record at all.** It is a **vendor feature, not a specification** — so it has no place in a
conformance matrix, and leaving it unlabelled makes the inventory look like it is tracking a standard.
**HSK-W2** labels it, alongside the same treatment for parameterized scopes and scope/client attributes
(DR-18). **HSK-W1** adds the endpoints to `docs/API.md` — which is also what makes the *"40+ endpoints"* claim
true — with an explicit note that `DELETE` destroys a key handle on the service.

**Revisit trigger.** An HSM becomes available to demonstrate against. Until then a testing UI would exercise
nothing.

---

## DR-18 — Parameterized scopes and scope/client attributes

**Status: UPHELD — document-only. Both are vendor features, not specifications.**

**Decision.** No AS code required for either; no conformance weight; document both and label them.

**Parameterized scopes are theme 1's inverse case, and that is the interesting part.** The feature *works* —
Authlete accepts a `regex` scope attribute and returns `dynamicScopes` — but **there is no discovery member that
can advertise it.** Module 09a's taxonomy (`lab.md:120-124`) has *"supported but not required"* and *"permitted
but not configured"*; **PS-W2** adds *"accepted but unadvertisable"*, with the Authlete citation.

**Scope/client attributes need one small code fix, and it is not a decision:** **ATTR-W1** — replace the `as any`
with a Zod shape for the key/value array, so an invalid shape is rejected with 400 rather than forwarded. T1-19.
The namespace is **not inert** — Authlete assigns meaning to some keys, `regex` on scope attributes being the
example — which is why validation matters.

**Declined, explicitly:** **ATTR-W5** (a scope-management surface) and **PS-W4** (implementing parameterized
scopes end to end). Both are out of proportion: this repo manages no scopes at all, and adding a management
surface to unblock two document-only vendor features inverts the cost/benefit.

**Revisit trigger.** The repo gains a scope-management surface for an unrelated reason — then both features
become demonstrable at no extra cost.

---

## DR-19 — RFC 9901 (SD-JWT) — no decision record

**Status: DELIBERATELY NO RECORD. Gate 4 confirms.**

**Why this is itself worth writing down.** Every other unimplemented specification in this audit got either a
work item or a decision record. RFC 9901 gets neither, and the reason is not oversight:

- **An authorization server has no RFC 9901 obligations.** The roles are Issuer, Holder and Verifier. This
  component is none of them unless it issues credentials under OID4VCI — and that is DR-03's decision, recorded
  there.
- **There is therefore no choice to record.** A decision record documents a road not taken. Here there is no
  road: the specification does not address this component.

**The two actions that follow are documentation, not decisions:**

- **9901-W1** — one clause in the inventory row stating the no-obligations fact, so the row stops reading as an
  unimplemented feature. Identical treatment to VP-W2 (DR-13).
- **9901-W3** — an explicit no-op: there is nothing for an authorization server to implement.

**Where the real RFC 9901 work is.** Not in the server — in `docs/curriculum/scripts/sd-jwt.mjs`, which batch 3c
**executed** and found substantially correct (§4.2.3 matches the spec's published vector; §9.3 verified over 200
salts, all distinct and all 128 bits; §4.3.1 `sd_hash` catches replay) **with three defects, the first of which
is a wrong ACCEPT on a missing trailing tilde.** That is **T2-6** (CUR-3c-W3/W4/W5), and it includes giving the
script a test file — `scripts/` sits outside both Vitest configs, so the repo's only SD-JWT implementation
currently has no regression net, and the prior in-repo audit recorded it as *"CLEAN, 0 defects"* (3c-F4).

**Revisit trigger.** DR-03 enables OID4VCI **and** this deployment issues SD-JWT VC credentials — at which point
the AS acquires Issuer obligations and this record is replaced by a real one.
