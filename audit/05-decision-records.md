# Phase 4 — decision records

- **Written:** 2026-08-11
- **Companion:** [`04-remediation-plan.md`](04-remediation-plan.md) — the ordered plan these records gate
- **Status:** ✅ **CLOSED. All 21 records are ruled.** Gate 4 approved 2026-08-12; **DR-21** (OpenID Federation) was written and ruled **2026-08-18** — it had been invisible until then, implied by `FED-W2`'s blocked state and recorded nowhere. **Nothing in this file is awaiting an answer.**

**What belongs here.** A record for each **genuine choice** — a case where the audit found no defect to fix but a
position to take, and where taking a different position would have been defensible. A missing feature with an
obvious fix is a work item, not a decision. That distinction is why RFC 9901 gets no record (DR-19) and why
`accessTokenDuration` does not either: shortening it is simply correct.

**Twenty-one records.** Twelve were rulings Gate 4 had to make and all twelve are made; seven confirm standing
declines with their rationale corrected; one is the meta-decision to write no record. DR-01's metadata half
shipped with DR-07 without needing a re-ruling.

**Two were added after the audit closed, and both for the same reason — a decision that had been *taken by
default* rather than made.** **DR-20** (2026-08-17): `dpopNonceRequired` had been switched on and reverted
twice without anyone ruling on it, which is a decision postponed. **DR-21** (2026-08-18): OpenID Federation was
never recorded at all, yet `FED-W2` sat ⛔ blocked pointing at *"a Tier 3-shaped decision"* that no record
held — so the audit could report "every decision is ruled" while one was merely unwritten. **A blocked work
item whose blocker is a decision is evidence that the decision exists**; if no record answers it, the record is
missing, not the decision. Both are now ruled.

Each record carries a **revisit trigger** — the condition under which the decision should be reopened. A
decline with no trigger is a dead end rather than a decision.

| # | Subject | Status | Gates |
|---|---|---|---|
| [DR-01](#dr-01--mutual-tls-rfc-8705) | Mutual TLS | **UPHELD** — decline, rationale corrected | FAPI 1.0 Part 2, FAPI 2.0's mTLS branch |
| [DR-02](#dr-02--fapi-20-security-profile) | FAPI 2.0 Security Profile | ✅ **RULED 2026-08-14 — qualify the claim; do NOT enable the profile** | The most curriculum material of any record |
| [DR-03](#dr-03--oid4vci-verifiable-credential-issuance) | OID4VCI | ✅ **DECIDED + EXECUTED 2026-08-14 — enabled.** `/vci/metadata` answers `OK`; F-1 closed | Module 09b, `README.md` |
| [DR-04](#dr-04--native-sso) | Native SSO | ✅ **RULED 2026-08-14, RE-RULED 2026-08-17 — do NOT enable.** Upheld on live evidence; a new Phase-1 defect found | `NATIVE-SSO-TUTORIAL.md`, Module 09a |
| [DR-05](#dr-05--cimd-and-the-mcp-claim) | CIMD / MCP | ✅ **DECIDED + EXECUTED 2026-08-14 — CIMD enabled; MCP still qualified** | `MCP-OAUTH-TUTORIAL.md` |
| [DR-06](#dr-06--fapi-10-baseline-and-advanced) | FAPI 1.0 | ✅ **RULED 2026-08-14 — document-only** | Module 10 |
| [DR-07](#dr-07--spiffe_jwt-and-the-nine-advertised-client-auth-methods) | `SPIFFE_JWT` | ✅ **DECIDED + EXECUTED 2026-08-12 — dropped; Ex 4 rebuilt, not retired** | **Module 10 Exercise 4** |
| [DR-08](#dr-08--session-management-and-front-channel-logout) | Session Management + Front-Channel Logout | ✅ **RULED 2026-08-14 — decline both, as one decision** | Module 08 |
| [DR-09](#dr-09--jwt-access-tokens-rfc-9068) | JWT access tokens | ✅ **RULED 2026-08-14, RE-RULED 2026-08-17 — defer.** Access tokens stay opaque | Module 04, `STEP-UP-AUTH-TUTORIAL.md` Part 4 |
| [DR-10](#dr-10--the-three-deliberate-token-exchange-defects) | Token-exchange defects | ✅ **RULED 2026-08-14 — keep all three; 8693-W5 not approved** | Module 06 Ex 6a/6b/6c |
| [DR-11](#dr-11--the-issuerhost-mismatch) | The issuer/host mismatch | ✅ **DECIDED + EXECUTED 2026-08-14 — aligned to the Render host; §3.3 passes; 8628-W5 closed** | Module 04, MCP, RFC 9207 |
| [DR-12](#dr-12--agentsmds-security-critical-surfaces-list) | `AGENTS.md` surfaces list | ✅ **RULED AND EXECUTED 2026-08-14 — five surfaces added, one exclusion made explicit** | Every future plan-mode trigger |
| [DR-13](#dr-13--oid4vp) | OID4VP | **UPHELD** — structurally inapplicable | — |
| [DR-14](#dr-14--haip-10) | HAIP 1.0 | **UPHELD** — cost-declined | — |
| [DR-15](#dr-15--mdl--mdoc-isoiec-18013-5) | mDL / mdoc | **UPHELD** — declined, paywalled | The curriculum's verification promise |
| [DR-16](#dr-16--saml-assertion-profile-rfc-7522) | RFC 7522 | **UPHELD** — declined at the vendor layer | Module 06 |
| [DR-17](#dr-17--hardware-security-keys) | HSK | **UPHELD** — document-only | — |
| [DR-18](#dr-18--parameterized-scopes-and-scopeclient-attributes) | Vendor scope features | **UPHELD** — document-only | Module 04, Module 09a |
| [DR-19](#dr-19--rfc-9901-sd-jwt--no-decision-record) | RFC 9901 | **DELIBERATELY NO RECORD** | — |
| [DR-20](#dr-20--dpop-nonces-dpopnoncerequired) | DPoP nonces | ✅ **RULED 2026-08-17 — do NOT enable.** The SPA discards the nonce on the error path | `PAR-TUTORIAL.md`, `FAPI-TUTORIAL.md` |
| [DR-21](#dr-21--openid-federation) | OpenID Federation | ✅ **RULED 2026-08-18 — do NOT enable.** No trust anchor exists, so an entity statement would be signed by us, for us, validated by nobody | `FED-W2`, the SPA's OIDC Federation section |

---

## Status at a glance — all 21 records ruled as of 2026-08-18

**Every decision record is closed.** Nothing in this file is awaiting a ruling. The last to arrive was **DR-21 (OpenID Federation)**, written *and* ruled on 2026-08-18 after the cleanup found that `FED-W2` had been blocked since 2026-08-13 on a decision no record held — so this file could report *"all 20 records ruled"* while a twenty-first was outstanding and unwritten.

> **Nine status labels in this file were stale until 2026-08-17, and the direction of the error is the
> lesson.** Seven index rows still read `⬜ open` for records whose bodies had been ruled on 2026-08-14 — and
> **two bodies (DR-03, DR-05) read `⬜ open` for decisions already executed against the live Authlete
> service.** The table directly below had said *"every decision record is now closed"* the entire time. **A
> summary and the thing it summarises drifted apart in opposite directions**, so whichever one a reader
> happened to consult, there was a fifty-fifty chance of being told the opposite of the truth. Corrected while
> re-ruling DR-04 and DR-09 — neither of which could be re-ruled without first noticing they were not, in
> fact, open.

| Ruling | Records |
|---|---|
| **Executed — configuration changed** | DR-03 (VCI enabled, + a credential-issuer JWK Set via VCI-W6), DR-05 (CIMD enabled), DR-07 (`SPIFFE_JWT` withdrawn, nine methods → five), DR-11 (issuer aligned) |
| **Executed — documentation/code only** | DR-12 (five surfaces added, one exclusion made explicit), DR-17, DR-18 |
| **Ruled: do not enable / decline** | DR-01 (mTLS), DR-02 (FAPI 2.0 — qualify, do not enable), DR-04 (Native SSO), DR-06 (FAPI 1.0, document-only), DR-08 (Session Management + Front-Channel Logout, as one), DR-13, DR-14, DR-15, DR-16, **DR-20 (DPoP nonces)**, **DR-21 (OpenID Federation)** |
| **Ruled: defer** | DR-09 (JWT access tokens) |
| **Ruled: keep as-is** | DR-10 (the three deliberate token-exchange defects — 8693-W5 **not** approved) |
| **Deliberately no record** | DR-19 (RFC 9901) |

> ### The shape of the outcome is worth reading before the individual records
>
> **Four records enabled something; eleven declined; one deferred; one kept a defect on purpose.** That ratio is
> not timidity — it is what happens when a *teaching* deployment is audited against production profiles. The
> recurring reason for declining is the same one, stated three times independently: **DR-02, DR-06 and DR-04 all
> collide with the retired-grant curriculum**, because requiring PKCE-S256 and PAR removes the very behaviours
> Modules 01, 02, 03 and 07 exist to demonstrate. A profile that forbids what the curriculum teaches is not a
> configuration this deployment can hold and still be what it is.
>
> **The one ruling to re-read before changing anything: DR-08.** Four separate gaps — Session Management,
> Front-Channel Logout, back-channel logout's `sid` mode, and Native SSO's `sid` (DR-04) — share **one**
> prerequisite, durable OP session identity. Building it for any one consumer reopens all four at once. Treating
> them as independent was the mistake Phase 2 corrected, and it is the mistake most likely to recur.
>
> **Nothing is left.** Every Tier 2 row is shipped — **T2-17, the last, on 2026-08-15** — and DR-08's three
> documentation consequences were discharged by T2-5, with DR-13's role list and DR-14/DR-15's inventory rows
> applied in the same pass. **No record is blocked on anything, and none is awaiting an answer** (DR-21, the
> last, was ruled 2026-08-18).

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
- `token_endpoint_auth_methods_supported` ~~**advertises `tls_client_auth` and `self_signed_tls_client_auth`**~~ → **both withdrawn 2026-08-12 (T1-5)**

So the deployment currently advertises two authentication methods it cannot honour — theme 1, and the reason
8705-W1 is a real action rather than tidying.

> **✅ 8705-W1 shipped 2026-08-12, inside DR-07's single console pass.** The decline is now visible from the
> metadata alone: `token_endpoint_auth_methods_supported` no longer offers either method, and
> `mtls_endpoint_aliases` remaining absent is consistent rather than contradictory. **The decline did not
> change; what changed is that the deployment stopped claiming otherwise.** DR-01 needed no re-ruling — this was
> its metadata half executing.

**Consequences.** FAPI 1.0 Part 2 is document-only **by inheritance** (DR-06). FAPI 2.0's mTLS branch is closed,
leaving `private_key_jwt` + DPoP as the only viable route (DR-02).

**Revisit trigger.** A deployment behind a proxy that terminates TLS *and* is configured to strip and re-add a
client-certificate header per RFC 9440 — the stripping is the load-bearing half.

---

## DR-02 — FAPI 2.0 Security Profile

**Status: ✅ RULED 2026-08-14 — qualify the claim; do NOT enable the profile.** The recommendation is taken as written. **Every paired doc change had already shipped**, which is why this ruling adds no work: FAPI2-W3 landed in T2-8 (`README.md`'s row), FAPI2-W4 in T1-19 batch 1 (`getStatus` reports the whole profile), FAPI2-W6 in T2-1 (`FAPI-TUTORIAL.md` labelled, Parts 3–4 marked `UNVERIFIED`). **One measured value in this record is now stale in our favour**: `id_token_signing_alg_values_supported` gained `PS256` when T1-2 registered an RSA key, so *both* FAPI-permitted algorithms are advertised — and T2-12 turned that into Module 10's `PARTIAL` row, because `idTokenSignAlg` is per client and the labs' client is `HS256`.

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

**Status: ✅ DECIDED AND EXECUTED 2026-08-14 — enabled.** *(This line read `⬜ open` until 2026-08-17, three days after the write it describes landed on the live service. The index row above had been right the whole time; the body a reader scrolls to had not.)* The recommendation below is kept as written, because it is the reasoning the ruling was made on.

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

**Status: ✅ RULED 2026-08-14 — do NOT enable. ✅ RE-RULED 2026-08-17 — upheld, on evidence rather than prediction.**

> **What the 2026-08-17 re-derivation changed.** The 2026-08-14 ruling *predicted* that enabling the flag
> *"would produce a two-app sequence that half-works."* A set → probe → revert (`SERVICE-CONFIG-PROBE.md` §24.3,
> throwaway confidential client, 0 unexpected field changes, revert read-back confirmed) shows it does **not
> half-work — it produces an HTTP 500 on the very first request**, and found three things the record did not
> know:
>
> 1. **`controllers/native-sso-response.handler.ts:22-28` cannot complete Phase 1.** Authlete's
>    `action: NATIVE_SSO` response to an authorization-code exchange carries **no `deviceSecret`** — SDK 1.0.0's
>    own model says the AS *"is free to generate a new device secret"* — but the handler requires it and
>    otherwise answers `500 server_error`. This server never mints one and never computes `deviceSecretHash`.
>    **A new defect, deliberately NOT fixed:** fixing it ships half of a declined feature. Recorded in
>    `NATIVE-SSO-1.0.md`. Once the AS mints a secret the rest of the chain works — `/nativesso` → `A501001`,
>    ID token with `sid` and a matching `ds_hash` — which is what makes this a scoped work item rather than a
>    guess.
> 2. **`tokenExchangeByConfidentialClientsOnly` is `true`**, so Phase 2 is refused for **public** clients
>    (`[A311304]`) — and Native SSO exists *for native mobile apps*, which are public clients. Enabling the flag
>    would advertise a capability the specification's own target client type cannot use here.
> 3. **`sessionId` is mandatory** at `/auth/authorization/issue` (`[A499201]`), and `authorization.service.ts:135`
>    already supplies it. The server clears a bar a naive probe does not — worth knowing before anyone reads a
>    failed probe as a server defect.
>
> **The `sid` question this record declined to answer is therefore not the first blocker, only the deepest
> one.** Two shallower ones sit in front of it, and both are ours.
>
> **Update, same day: blocker 1 is fixed; the decline is unchanged.** `native-sso-response.handler.ts` now
> mints a device secret when Authlete returns none and computes `deviceSecretHash` as
> `base64url(SHA-256(secret))` — the value §24.3 step 4 observed Authlete echoing as `ds_hash`. Phase 1 no
> longer answers HTTP 500. **That removes one of three blockers and none of the two original grounds.**
> Native SSO 1.0 is still an Internet-Draft, the `sid` derivation is still a security-critical change to
> `services/authorization.service.ts`, and `tokenExchangeByConfidentialClientsOnly` still refuses Phase 2 to
> the public clients the specification exists to serve. **Fixing a defect in a declined feature is not a
> step toward enabling it** — it is making the code honest about what it would do.

Both grounds stand unchanged, and the second is the binding one: `sid` derivation is a change to `services/authorization.service.ts`, which is on the Security-critical surfaces list, and **enabling the flag first would produce a two-app sequence that half-works** — worse teaching material than a stated gap. The paired doc change is done: `README.md` reads *"Not enabled — `nativeSsoSupported` is `false`"*, and `NATIVE-SSO-TUTORIAL.md` was rewritten under T2-1 with a whole-file `UNVERIFIED` banner naming the three settings responsible. As this record predicted, **declining and rewriting were the same commit**.

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

**Status: ✅ DECIDED AND EXECUTED 2026-08-14 — CIMD enabled; the MCP claim still qualified.** *(Same staleness as DR-03, corrected 2026-08-17.)* The recommendation below is kept as written, because it is the reasoning the ruling was made on. **Two decisions, not one.**

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

**Status: ✅ RULED 2026-08-14 — document-only. Part 2 `OUT_OF_SCOPE` by inheritance; Part 1 not claimed.** Taken as written, including the reasoning that Part 1's collision *is* DR-02's collision and must get the same answer, so the deployment does not hold two inconsistent positions on one trade-off. **Both "worth doing regardless" items are now done**: OIDC-W2 shipped as T1-2, and **FAPI1A-W4 shipped with this ruling** — Module 08's `c_hash` exercise now continues into `s_hash`, with a runnable hash computation, the three-way `at_hash`/`c_hash`/`s_hash` table, and the reason it is the *only* Part-2-specific behaviour observable here (mTLS, the other half, is DR-01). It also states what it does **not** mean: one emitted claim is not a profile. FAPI1-W1's 60s/60min error shipped as T2-13, in three files.

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

**Status: ✅ DECIDED AND EXECUTED 2026-08-12 — drop, with Module 10 Exercise 4 rebuilt in the same commit.**
Approved as recommended, plus the mTLS pair and `ATTEST_JWT_CLIENT_AUTH`: **nine advertised methods → five.**
`service.get()` parses, and `GET /api/fapi/config` / `GET /api/fapi/status` answer **200** with live values.

> **The procedural point is the transferable one.** The ruling was taken *after* a **read-only proof**, not on
> the mechanism recorded below. One raw-HTTP `service/get`, the member filtered **in memory**, and the SDK's own
> `Service$inboundSchema.safeParse` run in-process — no write, no curriculum edit, and a definite answer before
> a working exercise was spent. It found three things the mechanism section had wrong or unexamined: the
> response is **132** fields (not 129), the enum types **three** service fields (not one), and the failing parse
> yields **exactly one** Zod issue — which, because Zod aggregates, is itself the proof that nothing else in the
> response fails. **Establishing the fix works is cheaper than the cheapest thing the fix costs.** Full evidence:
> `SERVICE-CONFIG-PROBE.md` §17–§18.
>
> **The predicted cost did not materialise.** Module 10 Exercise 4 was **rebuilt, not retired** — it now walks
> three dated states (invisible 200 → honest 500 → live data) and lands on the closed-enum lesson, which is
> only legible after the fix. The rebuild being *better material* was this record's own prediction; what it did
> not anticipate is that a mechanism-based lab **gains** a data point from the fix. See
> `04-remediation-plan.md` §6.1.
>
> **A fourth escape route existed and nobody found it, because it is not available.** The general fragility
> stands: `ClientAuthMethod` is still closed, and the *class* is unfixed. But it is now measured — of 16
> enum-typed `Service` fields it was the only gap, and the schema strips the 8 of 193 properties it does not
> model rather than failing on them. **Tolerant of new fields, brittle about new values.**
>
> **Revisit trigger, unchanged:** an SDK release whose `ClientAuthMethod` tolerates unknown members, at which
> point the member could return. Recorded in `AGENTS.md` alongside the five surviving methods.

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
| Drop `SPIFFE_JWT` from the service | `service.get()` works; both endpoints work | ✅ **this decision — executed 2026-08-12** |
| Wait for an SDK that knows the member | Same, on someone else's schedule | ⛔ not actionable |
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

**Status: ✅ RULED 2026-08-14 — decline both, as one decision.** Taken as written. The grounds hold and the third has strengthened: `prompt=none` now answers *"is the user still logged in?"* correctly, because T1-7 landed — this record asked for that to come first, and it did. **The three documentation consequences (FCL-W2, FCL-W3, SM-W2) remain in T2-5**, which is still open; they are the last thing this ruling owes. The revisit trigger is unchanged and is the reason the record covers two specifications: **durable OP session identity has four consumers** — Session Management, Front-Channel Logout, back-channel logout's `sid` mode and Native SSO (DR-04) — and building it for any one reopens all four.

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

**Documentation consequences — ✅ all three discharged 2026-08-14 (T2-5).** FCL-W2 (date the row 12 Sep 2022,
drop the *(see note)* qualifier), FCL-W3 (the implementation column reads *"not implemented"*, not *"logout
routes"*), SM-W2 (a real row replacing the footnote-only treatment). Both dates were **fetched, not assumed**,
and came back **identical — 12 September 2022** for Front-Channel Logout, Session Management *and* RP-Initiated
Logout. **That shared date is the part worth keeping**: the three logout specifications were published as one
family covering the three channels, which is why the missing dates looked like three unrelated small gaps
rather than one. **Note FCL-W3 was absent from cluster 29's list of fifteen** — this record was its only
pointer, which is an argument for stating documentation consequences inside the decision record even when a
work item already exists.

**Revisit trigger.** Durable OP session identity is built for **any** of its four consumers — at which point
this record is reopened for all four at once. That is the point of recording them together.

---

## DR-09 — JWT access tokens (RFC 9068)

**Status: ✅ RULED 2026-08-14 — defer. ✅ RE-RULED 2026-08-17 — defer upheld, with F-3 promoted from predicted to observed.**

> **What the 2026-08-17 re-derivation established.** `accessTokenSignAlg` was set to `ES256`, **one** access
> token minted and decoded, and the field unset again — `SERVICE-CONFIG-PROBE.md` §24.5, 0 unexpected field
> diffs both ways, and a post-revert token confirmed opaque again (43 chars, 0 dots).
>
> **1. This record's own instruction is correct — and it is the only one of the three flags checked today whose
> instruction was.** `STEP-UP-AUTH-TUTORIAL.md` said *"Set `accessTokenSignAlg` to make Part 4 literal."*
> Setting it does exactly that: `typ: at+jwt`, and **all eight** claims Part 4 prints are present, with
> `acr: "pwd"` and an `auth_time` equal to the value passed to `/auth/authorization/issue`. Authlete adds two
> the tutorial does not show — `jti` and a **non-RFC-9068 `grant_type`**.
>
> **2. 9068-F3 is confirmed, and it is the reason to keep deferring rather than a footnote to it.** With no
> `resource` parameter the token carries **no `aud` at all** — so enabling this flag makes every access token
> this deployment issues violate **RFC 9068 §2.2**, which lists `aud` as REQUIRED, and **§3**, which requires a
> default resource indicator. F-3 recorded that as *latent*; it is now measured. **Enabling would trade one
> honest gap ("we do not issue JWTs") for a silent conformance violation in every token issued**, and the
> tokens would still be accepted by everything, because nothing here checks.
>
> **3. The curriculum coupling is much larger than this record states.** Not *"Module 04's opaque-token
> exercises and `STEP-UP-AUTH-TUTORIAL.md` Part 4"* but **86 lines across 13 files** — including
> `modules/04…/lab.md`'s `# → 43 chars, opaque`, five separate assertions in Module 04's README, and Modules
> 02, 03, 06, 08 and 10. Any future enablement must budget for that, and the count belongs in the record
> rather than in whoever's head last grepped for it.
>
> **So the ruling is unchanged and better grounded: defer.** The prerequisite is now specific — satisfy §3's
> default `aud` first, which is a service-configuration or code decision in its own right.

Access tokens stay opaque. Taken as written: turning `accessTokenSignAlg` on changes the format of **every** access token this deployment issues, needs a plan, has two live curriculum couplings, and activates 9068-F3's latent §3 `aud` MUST. **All three "do these now" items are done**: 9068-W2 shipped in T1-19 batch 3 (the dev fixture is `typ: at+jwt` with all seven §2.2 claims); 9068-W4 shipped in T2-1 (Part 4's payload is marked `UNVERIFIED`, naming `accessTokenSignAlg`, and points at introspection as §6.2's route); and **9068-W3 shipped with this ruling** — Module 04 now separates **audience restriction (runnable here, via introspection)** from **self-contained tokens (not runnable)**, with the point that the two are *orthogonal*: you can audience-restrict an opaque token, and you can issue a JWT with no `aud` at all.

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

**Status: ✅ RULED 2026-08-14 — keep all three. 8693-W5 is NOT approved.** Taken as written, and the machinery is the reason: the characterization test asserts the behaviour and names the documents to update, so a change fails loudly instead of rotting a lab. **All three safe corrections are now done.** 8693-W3 shipped in T2-10 (four documents, now content-anchored). **8693-W1 and 8693-W2 shipped with this ruling**, and W1 turned out sharper than written: `resource` and `audience` look identical from outside — both dropped, both no `aud`, both 200 — but `TokenCreateRequest` **has** a `resources` field and **no audience field at all**, so one drop is a *choice this server makes* and the other is a *vendor boundary that no fix can cross*. Verified against the SDK model. The test's `it("drops audiences")` case now carries that reasoning in a comment, because it can never legitimately change. W2 replaced *"Not covered by tests"* — true when written, false since — with an explanation of why a **characterization** test beats one asserting the fix.

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

**Status: ✅ DECIDED AND EXECUTED 2026-08-14 — aligned to `https://oauth2-0-ekh2.onrender.com`.**

> **What was done.** `issuer` plus all **fourteen** URL-valued service fields were set to the Render host —
> 15 fields written, 16 changed including `modifiedAt`, **0 unexpected**. RFC 8414 §3.3 now passes: the
> generated document's `issuer` is exactly the host and all 13 URL members sit under it.
>
> **The stable host was chosen over the tunnel**, which is *better* than this record's original
> recommendation: `deviceVerificationUri` moved too, so **8628-W5 closes** rather than staying time-bombed.
>
> **A prerequisite surfaced during the write and is recorded in `SERVICE-CONFIG-PROBE.md` §21.1: the public
> deployment was pointing at a *different Authlete service*** — one lacking T1-2's RSA key and T1-3's
> `private_key_jwt` client. `3693555522` was ruled canonical and the deployment is to be repointed at it.
> Without that ruling this write would have made a service nobody reaches conformant.
>
> **Still open, and not this record's:** no client has a redirect URI on the Render host, so an
> authorization-code flow cannot complete there until they are added.

The original recommendation and its reasoning follow.

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

**Status: ✅ RULED AND EXECUTED 2026-08-14.** All five additions are in `AGENTS.md`, and the conditional resolved.

| File | Row | State |
|---|---|---|
| `middleware/errorHandler.ts` | **Failure disclosure & status derivation** — a **new** row | ✅ added |
| `services/jwt-verification.service.ts` | Token issuance | ✅ added |
| `controllers/introspection-standard.controller.ts` | Token presentation & introspection | ✅ added |
| `controllers/jar.controller.ts` | Access control | ✅ **already added** — the conditional was *"once B1-W2 settles its auth posture"*, and **B1-W2 shipped 2026-08-13** |
| `controllers/fapi.controller.ts` | — | ⛔ **declined**, and the exclusion is now *explicit* in `AGENTS.md` rather than implied |

**Two things the execution added beyond the decision.** The `errorHandler.ts` row carries its three grounds in
the file itself — it sets the status of every failure across all 57 SDK call sites, it is the **sole gate on
stack-trace disclosure**, and it has **already produced one security-relevant defect** (every SDK validation
failure served as HTTP 200, invisible to any monitor watching status codes) — because a list of filenames does
not tell a future reader *why* a generic middleware is on it. And the `fapi.controller.ts` decline is written
down: it **reports** posture rather than deciding outcomes, and its tests pin it against both a hardened and an
unhardened service, which is stronger protection than a review gate. **An exclusion that is only implied is an
exclusion somebody will undo.**

**Re-verified against `AGENTS.md` on 2026-08-11 — superseded by the table above.** *(Kept because it records the
state the decision was taken from. `RESUME.md` §5.3 named four candidate additions and recorded two as landed;
three had. The `⬜ open` row below was closed on 2026-08-14 and is answered by the ✅ table at the top of this
record — do not read it as current.)*

| File | Row | State |
|---|---|---|
| `routes/device.routes.ts` | Access control — the **Access control** row of `AGENTS.md`'s Security-critical surfaces table | ✅ landed |
| `middleware/development-only.ts` | Access control — same row | ✅ landed |
| `services/logout.service.ts` | the **Session termination & redirect targets** row | ✅ landed |
| `controllers/logout.controller.ts` | the **Session termination & redirect targets** row | ✅ landed |
| **`middleware/errorHandler.ts`** | — | ⬜ open *(as of 2026-08-11 — **closed 2026-08-14**, see above)* |

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

> **One factual correction, made 2026-08-14 when the document was fetched for VP-W2; the ruling is unaffected.**
> OID4VP 1.0 defines **three** roles, not two — Wallet, Verifier and **Credential Issuer** — plus the Holder as
> the person controlling the wallet. The Credential Issuer appears only as whoever issued the credential being
> presented; it carries no OID4VP protocol obligations, so "this component is none of them" still holds and
> holds for the same reason. The row in `SPEC-INVENTORY.md` states three rather than repeating a two-role claim
> the source does not make. **Recorded because a decision that rests on a role list should be checkable against
> the list**, and this one was written from recall.

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

**Status: ✅ UPHELD AND EXECUTED 2026-08-14 — keep the code, document it, no SPA section.** The documentation half shipped in **T2-16**: four endpoints in `docs/API.md` with shapes, required-vs-optional fields, the action→status map and the fail-closed admin auth, plus a `SPEC-INVENTORY.md` row in the new **vendor features** section. Two departures from HSK-W2, both deliberate: **no separate `docs/` page** (a page for four endpoints nothing else consumes is prose in search of a reader — promote it if HSK gains a consumer), and `DELETE` got its own ⚠️ box making the point that **deleting a handle is not deleting a key** — the material lives in the HSM and this API never sees it, which is the whole reason for the indirection. "No SPA section" stands.

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

**Status: ✅ UPHELD AND EXECUTED 2026-08-14 — document-only. Both are vendor features, not specifications.** Shipped in **T2-16**, and the writing found something the record had not: parameterized scopes are the **inverse** of the *advertised but unusable* pattern this audit met four times. Authlete accepts `payment:123.50` against a `regex` scope of `payment:.*` and returns the value in `dynamicScopes` — the feature works — but `scopes_supported` can only list **literal** strings, so **a client that discovers this AS correctly can never use it while a client that hardcodes the value can.** Module 09a's capability taxonomy gained a fourth state, **accepted but unadvertisable**, in a table whose last column names what misreading each state costs. In a capability matrix this one does not look like a green tick; **it looks like the feature is absent.** `attributes` is documented in `docs/API.md` with two vendor-assigned keys (`regex`, `fapi2=sp`) and the advice to prefix your own.

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

---

## DR-20 — DPoP nonces (`dpopNonceRequired`)

**Status: ✅ RULED 2026-08-17 — do NOT enable. ⚠️ REVISIT TRIGGER SATISFIED the same day — the decline stands on narrower ground.**

> **The blocking objection is gone.** This record declined nonces because the SPA discarded the nonce it was
> sent, making every DPoP flow fail permanently. `client/src/services/dpop-fetch.ts` now captures
> `DPoP-Nonce` on **success and failure alike** and retries once with a re-signed proof; all four DPoP
> service functions route through it. **Verified against the live deployment**, not only a mock
> (`SERVICE-CONFIG-PROBE.md` §25.1): with `dpopNonceRequired: true`, the old single-shot client gets a 400
> and throws the nonce away, while `dpopRequest` is refused, re-signs, and succeeds on attempt 2 — then
> needs only one attempt once the nonce is cached.
>
> **So this record no longer rests on the client.** What holds it up now is what was previously secondary:
> nonces are **OPTIONAL** in RFC 9449 and required by nothing this deployment claims (FAPI 2.0 is declined
> under DR-02), and **both transcripts are already banked**, so enabling adds no documentation value. Those
> are real grounds, but they are *preference* grounds rather than *blocking* ones.
>
> **What that means for whoever reads this next: enabling is now an available decision, not a blocked one.**
> It would need one more thing the old objection made moot — the tutorials' captured transcripts would have
> to be re-captured with nonces in them, and `PAR-TUTORIAL.md`'s and `FAPI-TUTORIAL.md`'s "not reproducible
> here" boxes would become wrong. That is a doc change with a known shape, not an unknown.

**Original ruling below, unchanged.** Nonces stay off; the behaviour stays captured.

**The choice.** `dpopNonceRequired = true` (with a non-zero `dpopNonceDuration`), so this deployment demands
the RFC 9449 §8/§9 nonce dance — or leave it off and keep the dance as a captured transcript of a temporary
configuration.

**Why this record exists at all.** It is the one flag of the three with **no** curriculum coupling and **no**
prior record, so nothing had ever decided it. The nonce transcript had been captured twice (§23.1 at the token
endpoint on 2026-08-15, §24.1 at PAR on 2026-08-17) and both times the flag was reverted **without anyone
ruling whether it should have been**. A reverted probe is not a decision; it is a decision postponed.

**Why not enable — one binding reason, re-derived live.** Nonces cost nothing to a client that retries on
`use_dpop_nonce`. **This repo contains no such client.** In `client/src/services/token.service.ts` the
`if (!response.ok) throw` sits on the line **before** the `DPoP-Nonce` header is read, and `http.ts` repeats
that shape at nine call sites — so the SPA **discards the nonce the server sends it**, and
`sessionStorage.dpop_nonce` is only ever written from a *success*. The failure is therefore **permanent, not
first-request-only**: every DPoP path in the SPA (`FapiSection`, `ParSection`, `RarSection`, `CallbackPage`)
would fail on every attempt, with no route to recovery. Enabling would break four working demonstrations to
make one prose section literal.

**What the probe removed as an objection, and this is worth keeping.** The obvious fear — that a nonce refusal
burns the authorization code — is **false**: the same code, retried with the nonce, yields `OK` (§24.1 row A2).
The refusal happens before redemption. So the specification's retry really is available, and the *only* thing
standing in the way is our own client. That is a much better reason to decline than the one that was assumed.

**Two corrections that ship with this ruling.**

- **`PAR-TUTORIAL.md` told readers to turn the flag on** *"to make the section runnable yourself"*. It does the
  opposite. The instruction is replaced.
- **The `DPoP-Nonce` header on PAR's `201` is real.** `FAPI-TUTORIAL.md` removed it on 2026-08-14 as *"not
  producible here"*; §24.1 row B2 shows Authlete emitting it on the PAR success response. Accurate about the
  deployment, misleading about the protocol — the block was unreachable, not wrong. PAR's nonce error is also
  **`A350308`**, not the token endpoint's `A254307`.

**Measured gap:** `dpopNonceRequired` **`false`**, `dpopNonceDuration` **`0`** (live, 2026-08-17). Nonces are
**OPTIONAL** in RFC 9449 and are not required by anything this deployment claims; FAPI 2.0 is declined (DR-02).

**What declining costs.** Nothing that is not already banked. Both transcripts exist, and the markers now say
*"declined, and here is what it looks like"* instead of *"unverified"*.

**Revisit trigger.** ~~The SPA's HTTP layer reads `DPoP-Nonce` from error responses and retries once.~~
✅ **Done 2026-08-17** — `client/src/services/dpop-fetch.ts`, live-verified. The trigger this record was
written with is spent; see the banner above for what now holds the decline up. **Remaining trigger:** DR-02
flips, or somebody decides the tutorials should show the nonce dance as *reproducible* rather than captured.

---

## DR-21 — OpenID Federation

**Status: ✅ RULED 2026-08-18 — do NOT enable.** *(Written and ruled the same day. The recommendation below was accepted as written; it is kept in full because it is the reasoning the ruling was made on.)*

**Why this record exists at all, and why it is late.** Every other Tier 3 question was written up in Phase 4.
This one was not, and nothing noticed for five days — because the *work item* recorded the blockage instead.
`FED-W2` has read ⛔ **BLOCKED** since 2026-08-13 with the words *"a **Tier 3-shaped decision** … not taken
here"*, pointing at a record that does not exist. So the audit could truthfully report *"all 20 decision
records are ruled"* while a twenty-first was outstanding and invisible.

> **The transferable finding: a blocked work item whose blocker is a decision is evidence that the decision
> exists.** The register of decisions was built by asking *"where did the audit find a choice?"* — and this
> choice was found by Phase 5, after that register was closed. **When an item blocks on "a decision", check
> that a record answers it**; a pointer to a decision is not a decision. Same shape as DR-20, where a flag had
> been toggled twice with nobody ruling on it.

### The question

Configure a **federation JWK Set** on Authlete service `3693555522`, so `GET /.well-known/openid-federation`
can produce a real entity configuration — or leave both federation endpoints answering an honest 500?

### What is actually true today, established by probe (2026-08-13, FED-W1)

| Call | Result |
|---|---|
| `federation.configuration` with no `requestBody` (pre-fix) | **400** — `[A258201] … Content-Type header is not specified`, i.e. the caller blamed for our fault |
| `federation.configuration` with `requestBody: {}` (shipped) | **200 HTTP**, `action: INTERNAL_SERVER_ERROR` — `[A316201] Because a JWK Set for federation has not been set up, this service cannot generate entity configuration` |

So the shipped fix **changed the failure rather than removing it**, deliberately: both routes now answer **500
naming the missing configuration**. FED-W5 closed with it, because the controller's action mapping was already
correct and had only ever seen a thrown SDK error.

### The ruling: decline, and for three reasons in descending order of weight

1. **Nothing claims it works, so nothing is false.** `README.md` makes no federation claim and the SPA's OIDC
   Federation section shows the honest 500. This is the *opposite* of Theme 2 ("claimed working, flag off") —
   there is no false advertisement to correct, which is why declining costs nothing a reader can observe.
2. **Enabling it would be demonstrable, not interoperable — and this repo has been caught by that distinction
   before.** An entity configuration is only meaningful inside a trust chain with a **trust anchor and at least
   one peer**, and there is none. Enabling the flag would produce a signed document that nobody validates
   against anybody, which is exactly the caveat `AGENTS.md` already records for back-channel logout (BCL-W5:
   *"the loop is closed against ourselves, so do not write up a successful delivery as 'back-channel logout
   works'"*). One such closed loop is a teaching artefact; a second is a pattern.
3. **It is a key-material write, and key material is the one thing this audit never added casually.** T1-2's
   RSA key and VCI-W6's credential-issuer key were each preceded by a stated purpose and followed by a
   read-back diff. A federation JWK Set with no federation to join has no purpose to state.

**Consistent with the standing shape of these records:** DR-02 (FAPI 2.0), DR-04 (Native SSO) and DR-08
(Session Management) all decline a feature whose prerequisites the deployment does not have, and all three say
the same thing — *a teaching deployment audited against production profiles will decline more than it enables.*

### What declining costs

- **`FED-W2` is ⛔ closed by ruling, not blocked pending one.** Its verification steps remain correct and are
  worth keeping for whoever reopens this; what changed on 2026-08-18 is that the thing standing in front of it
  is a **decision on the record** rather than a question nobody had asked. *That distinction is the whole point
  of this record: a reader can now tell "nobody got to it" from "we looked at it and said no."*
- Both federation endpoints keep answering 500. That is already the documented behaviour.
- `federation.service.ts` keeps its tests (added by T1-16, which also fixed the shared mock's missing
  `federation` member).

### What enabling would cost, if it is ever ruled the other way

One `service/update` writing `federationJwks` (read → write → read-back → key-by-key diff, per the standing
probe discipline), then FED-W2's §3 verification, then a documentation pass — `README.md` gains a federation
row, and `SPEC-INVENTORY.md`'s Federation rows move from *"endpoints non-functional"*. **Per `AGENTS.md`, the
service write and its paired documentation change ship in the same commit** — this is precisely the control
DR-03 skipped on 2026-08-14, which silently invalidated a whole Module 09b exercise.

**Revisit trigger.** A trust anchor or federation peer becomes available to test against, **or** a curriculum
module is written that needs a real entity statement. Not before — an entity configuration with no federation
is a signature in search of a verifier.
