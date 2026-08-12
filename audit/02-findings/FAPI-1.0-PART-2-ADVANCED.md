# Financial-grade API Security Profile 1.0 — Part 2: Advanced

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S3**
- **Status:** OpenID **Final**, **12 March 2021** — re-verified against the primary source this session
- **Authlete version:** 3.0 (`Service.fapiModes`)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md:227`, `docs/curriculum/modules/10-fapi-and-grant-management/`, `AGENTS.md` flags table

<thinking>
1. AS-facing shall statements (§5.2.2): authenticate confidential clients with **mTLS or `private_key_jwt`** —
   note `client_secret_jwt` is permitted in Part 1 and **not** here; **require a JWS-signed request object** by
   value or reference (JAR); protect the authorization response with either `response_type=code id_token` (hybrid)
   **or** `response_type=code` plus `response_mode=jwt` (JARM); **PS256 or ES256** for JWS, **not** `none`, and
   RS256 discouraged; include **`s_hash`** in the ID Token when the hybrid flow is used with `state`; **only issue
   sender-constrained access tokens**, with mTLS as the mechanism the AS shall support; request objects bounded by
   `exp` ≤ 60 **minutes** after `nbf`, and `nbf` no more than 60 minutes in the past.
2. Authlete boundary: all enforcement, gated by `fapiModes`. The AS-side surface is nil beyond reporting.
3. Code: nothing Part-2-specific. Every mechanism Part 2 requires is *available* — JAR, JARM, mTLS fields, DPoP —
   and none is configured.
4. Docs: `SPEC-INVENTORY.md:227` describes Part 2 as "JAR + JARM + `s_hash` + MTLS; hybrid flow", which is an
   accurate one-line summary. `AGENTS.md`'s flags table carries the 60s/60min error.
5. Delta: this is the strictest profile in the audit and the deployment satisfies **none** of its eight shall
   statements — but unlike FAPI 2.0 it is not claimed as "Working" anywhere, so the severity is S3.
6. The interesting structural point: Part 2 needs mTLS, which the repo has *declined* with a written record. So
   Part 2 is not merely unconfigured — it is unreachable by an accepted decision, which changes the recommendation.
</thinking>

## Normative requirements (AS side) versus the live configuration

| # | §5.2.2 shall | Live value | Status |
|---|---|---|---|
| 1 | Authenticate confidential clients with **mTLS** or **`private_key_jwt`** (note: **not** `client_secret_jwt`, which Part 1 allows) | one confidential client, `CLIENT_SECRET_BASIC`; no JWKS on any client | ❌ |
| 2 | **Require** a JWS-signed request object, by value (`request`) or reference (`request_uri`) | `requestObjectRequired = false` service-wide and per client; `require_signed_request_object = false`; no client has `requestSignAlg`; `require_request_uri_registration = true` with no client `requestUris` | ❌ (`RFC9101-…` F-2, F-3) |
| 3 | Protect the authorization response: `code id_token` **or** `code` + `response_mode=jwt` | both response types are *available* (`response_types_supported` includes `code id_token`; `response_modes_supported` includes `jwt`); neither is **required**, and JARM is unusable — no client has `authorizationSignAlg` | ❌ (`JARM-…` F-1) |
| 4 | **PS256 or ES256** for JWS; **not** `none`; RS256 discouraged | `id_token_signing_alg_values_supported = [HS256, HS512, ES256, HS384]` — **PS256 absent, three HMAC algorithms present**; `userinfo_signing_alg_values_supported` includes **`none`**; one client signs ID tokens with **HS256** | ❌ |
| 5 | Include **`s_hash`** in the ID Token when hybrid + `state` | ⊘ Authlete's; unexercised — no hybrid-flow lab step and no `s_hash` anywhere in `server/src` or the curriculum transcripts | ❌ unverified |
| 6 | **Only issue sender-constrained access tokens**; shall support mTLS as the mechanism | `tlsClientCertificateBoundAccessTokens = false`; mTLS **declined** by decision record (`RFC8705-mutual-tls.md`); DPoP available but `dpopRequired = false` | ❌ — and see F-1 |
| 7 | Request object `exp` ≤ **60 minutes** after `nbf` | `nbfOptional = false` ⇒ `nbf` required ✅, but no request object is required at all (#2), so the bound is never applied | ⚠️ flag right, unreachable |
| 8 | Request object `nbf` no more than **60 minutes** in the past | same | ⚠️ same |
| — | `fapiModes` set to a FAPI 1.0 Advanced mode | **absent**; and `computeFapiMode` cannot represent it (`FAPI-1.0-PART-1-BASELINE.md` F-2) | ❌ |

**None of the eight met.** Every required mechanism exists in the codebase or the vendor; nothing is switched on.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Enforcing the whole profile | Authlete, gated by `fapiModes` | not enabled |
| Signed request objects | Authlete | available; no client key material (`RFC9101-…` F-3) |
| JARM | Authlete builds and signs it | available; no client `authorizationSignAlg` (`JARM-…` F-1) |
| `s_hash` | Authlete | never exercised |
| Certificate-bound tokens | Authlete + a certificate this deployment cannot receive | **declined** (`RFC8705-…`) |
| Algorithm restriction | Service key set + client metadata | PS256 not available; HMAC algorithms are |

## Finding F-1 — Part 2 is unreachable by an accepted decision, not merely unconfigured (S3)

§5.2.2 requires the AS to *"only issue sender-constrained access tokens"* and to *"support [MTLS] as mechanism for
constraining the legitimate senders of access tokens."* The mTLS decision record
(`modules/05…/README.md:367-401`, upheld in `RFC8705-mutual-tls.md`) declines mTLS on the grounds that TLS
terminates upstream in every deployment of this repo.

So FAPI 1.0 Advanced cannot be satisfied here **by design**, and that is a different situation from every other
`MISCONFIGURED` verdict in this audit:

- FAPI 2.0 permits **either** mTLS or DPoP for sender-constraining, and DPoP is implemented and verified here — so FAPI 2.0 is reachable in principle (`FAPI-2.0-SECURITY-PROFILE.md` FAPI2-W5).
- FAPI 1.0 Advanced names mTLS as a mechanism the AS **shall support**. DPoP post-dates it and is not an alternative in the 2021 text.

The mTLS record already anticipates this. Its revisit triggers include *"an ecosystem this repo targets mandates
FAPI 1.0 Advanced, which requires mTLS"* — exactly the condition this entry tests. It is not met: nothing here
targets such an ecosystem.

**Consequence for the recommendation.** Part 2 should be `OUT_OF_SCOPE` by inheritance from the mTLS decline
rather than treated as configuration debt. I have kept the verdict at `MISCONFIGURED` because the *other* seven
requirements are independent of mTLS and are all configured against — but the scope ruling at Gate 4 should be
"document-only, inheriting the mTLS decline", with the record cross-referenced. Flagging the distinction rather
than silently choosing.

## Finding F-2 — PS256 is unavailable and three HMAC algorithms are advertised (S3)

§5.2.2: implementations *"shall use PS256 or ES256 algorithms"* and *"shall not use `none`"*, with RSASSA-PKCS1-v1_5
(RS256) discouraged. Live:

```
id_token_signing_alg_values_supported   = ["HS256", "HS512", "ES256", "HS384"]
authorization_signing_alg_values_supported = ["HS256", "HS512", "ES256", "HS384"]
userinfo_signing_alg_values_supported   = ["HS256", "HS512", "ES256", "HS384", "none"]
```

Three observations, in order of importance:

1. **`none` is advertised for UserInfo responses.** §5.2.2 forbids `none` for JWS. It is only reachable if a client sets `userInfoSignAlg: none`, and none does — but it is in the advertised list.
2. **PS256 is absent**, so of the two permitted algorithms only ES256 is available. The service key set evidently has an EC key and no RSA key — the same absence that makes `id_token_signing_alg_values_supported` omit RS256 in violation of OIDC Discovery §3 (`OIDC-CORE-1.0.md` F-2). **One registered RSA key fixes both**: it adds RS256 (satisfying Discovery) and PS256 (satisfying FAPI). That is a pleasing convergence and it is work item **OIDC-W2**.
3. **The HMAC algorithms are the real gap.** `HS256`/`HS384`/`HS512` mean the ID Token's integrity rests on a secret the client already holds, so no third party can verify it — and one client (`1523514379`) actually uses HS256. FAPI Advanced exists for high-value write operations where non-repudiation matters; a symmetric ID Token cannot provide it.

## Finding F-3 — `s_hash` appears nowhere, and the hybrid flow is never exercised (S3)

Grep: `s_hash` occurs in neither `server/src`, `client/src`, nor any curriculum transcript. §5.2.2 requires the AS
to include it in the ID Token when the hybrid flow is used with `state`.

This is Authlete's to emit, so there is no code gap — but it is unverified, and `response_types_supported` includes
all four hybrid combinations, so the flow is available and untested. Module 08 Exercise 3c does verify `c_hash`
appearing (`modules/08…/lab.md:326`), which is the same mechanism for the authorization code, so extending it to
`s_hash` on a hybrid request is a small step and would be the only FAPI-1.0-Advanced-specific behaviour this
deployment could actually demonstrate.

## Finding F-4 — the 60s/60min error, cross-referenced (S2)

`AGENTS.md`'s flags table states the request-object lifetime bound as **≤60 seconds**; §5.2.2 says **60 minutes**,
in both directions. Full analysis in `FAPI-1.0-PART-1-BASELINE.md` F-3; recorded here because the requirement is
Part 2's, and the work item is **FAPI1-W1**.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"Financial-grade API Security Profile 1.0 - Part 2: Advanced"*, Final, **12 Mar 2021** | `SPEC-INVENTORY.md:227` | **Confirmed** against `openid.net/specs/openid-financial-api-part-2-1_0.html` this session | **Accurate** |
| "JAR + JARM + `s_hash` + MTLS; hybrid flow" | `SPEC-INVENTORY.md:227` | An accurate one-line summary of §5.2.2's mechanisms | **Accurate** |
| "Enforce request object lifespan ≤60s for FAPI 1.0 compliance" | `AGENTS.md` flags table | 60 **minutes** — F-4 | `DOC_INCORRECT` / **S2** |
| Part 2 **not** listed as "Working" in `README.md` | `README.md:92-130` | Correct — a welcome contrast with FAPI 2.0, which is | **Accurate** |
| mTLS revisit trigger names "an ecosystem … mandates FAPI 1.0 Advanced" | `modules/05…/README.md:394-395` | Correctly anticipates this entry; the trigger is not met | **Accurate** |
| Nothing states that Part 2 is unreachable while mTLS is declined | Module 10, `SPEC-INVENTORY.md` | F-1 — the most useful fact about this row | **Omission** / S3 |
| Nothing notes that PS256 is unavailable | all docs | F-2 | **Omission** / S3 |

## Sources consulted

- FAPI 1.0 Part 2: Advanced §5.2.2 — `https://openid.net/specs/openid-financial-api-part-2-1_0.html`, fetched this session. Quoted: the two permitted client-authentication methods, *"shall require a JWS signed JWT request object"*, the `code id_token` / `code` + `response_mode=jwt` alternatives, *"shall use PS256 or ES256"* and *"shall not use none"*, the `s_hash` requirement, *"shall only issue sender-constrained access tokens"*, and both 60-minute request-object bounds.
- FAPI 1.0 Part 1: Baseline §5.2.2 (for the client-authentication contrast) — `https://openid.net/specs/openid-financial-api-part-1-1_0.html`
- FAPI 2.0 Security Profile §5.3.2.1 (for the DPoP-as-alternative contrast) — `https://openid.net/specs/fapi-security-profile-2_0-final.html`
- OpenID Connect Discovery 1.0 §3 (the RS256 MUST that the same missing RSA key causes) — `https://openid.net/specs/openid-connect-discovery-1_0.html`
- Live probes 1–3 (2026-08-10): `fapiModes`, `requestObjectRequired`, `require_signed_request_object`, `require_request_uri_registration`, `nbfOptional`, `response_types_supported`, `response_modes_supported`, the three signing-algorithm lists, `tlsClientCertificateBoundAccessTokens`, per-client `tokenAuthMethod` / `requestSignAlg` / `authorizationSignAlg` / `idTokenSignAlg` / `dpopRequired` — `SERVICE-CONFIG-PROBE.md` §2–§10
- Code: `controllers/fapi.controller.ts:5-20`; grep for `s_hash` — zero occurrences repo-wide

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| FAPI1A-W1 | Rule Part 2 `OUT_OF_SCOPE` by inheritance from the mTLS decline | S | **Gate 4 decision.** A short record: Part 2 requires mTLS as a sender-constraining mechanism, mTLS is declined with reasons, therefore Part 2 is document-only; the revisit trigger is the existing one. Removes it from configuration-debt tracking where it does not belong. |
| FAPI1A-W2 | Register an RSA key | S | = **OIDC-W2**. Adds PS256 (FAPI §5.2.2) and RS256 (OIDC Discovery §3) in one console change. |
| FAPI1A-W3 | Fix the 60s/60min error | S | = **FAPI1-W1**. |
| FAPI1A-W4 | Add an `s_hash` observation to Module 08 or 10 | S | Extend the existing `c_hash` exercise (`modules/08…/lab.md:326`) to a hybrid request with `state`, and record whether `s_hash` appears. The only Part-2-specific behaviour demonstrable here without mTLS. |
| FAPI1A-W5 | Note the HMAC exposure | S | Module 10 states that HS256 ID tokens cannot provide the non-repudiation FAPI Advanced exists for, tying it to the one client that uses HS256. |

**Ordering.** FAPI1A-W1 is the framing decision and should come first — it determines whether W2/W4 are worth
doing for FAPI reasons (they remain worth doing for OIDC Discovery and Module 08 reasons regardless).
