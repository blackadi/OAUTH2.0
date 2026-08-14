# RFC 9449 — OAuth 2.0 Demonstrating Proof of Possession (DPoP)

> ## ✅ F-1 AND F-2 CLOSED — 2026-08-13 (T1-9, T1-10)
>
> **F-1 (`htu` carried the query string).** All five call sites now derive `htu` from `dpopHttpTarget()`.
> Proven live: `GET /api/gm/{id}?verbose=true` with a valid proof returns **200**, where any request with a
> query string previously failed proof validation despite a correct client. `targetUri` is sent only where the
> SDK request model has it — `IntrospectionRequest` and `UserinfoRequest` do; `TokenRequest`,
> `PushedAuthorizationRequest` and `GMRequest` do not. **9449-W2** shipped with it: a caller can no longer
> supply `targetUri`, closing the last place the URI a proof is validated against was attacker-chosen.
>
> **F-2 (grant management spoke neither §7.1 nor §7.2).** `/api/gm/:grantId` is now a full protected resource,
> answering identically to UserInfo, verified live in all four cases:
>
> | Presentation | Before | Now |
> |---|---|---|
> | `DPoP <bound>` + proof | `401` — unreachable | **200** |
> | `Bearer <bound>` + proof | accepted, proof honoured — the §7.2 downgrade | **400 `invalid_request`** |
> | `DPoP <bound>`, no proof | `401 invalid_token` *"invalid or expired"* — wrong about the cause | **401 `invalid_dpop_proof`** |
> | no token | `401 invalid_token` | **401, no error code**, `WWW-Authenticate: Bearer, DPoP` (RFC 6750 §3.1) |
>
> **Two things the work items did not predict.** `/api/gm` makes **two** Authlete calls and *both* check the
> binding independently — `/gm` without a forwarded proof answers `[A281305]`, so fixing the middleware alone
> would have moved the 401 one call later; and the **same proof serves both calls**, which Authlete does not
> treat as a replay. Both established by probe before the code was written.
>
> **Severity unchanged at S2**, and that was decided by evidence rather than by default: 9449-W4 (T1-17) showed
> `/auth/introspection` enforces `cnf.jkt` even with no proof present (`[A065308]`), so the fail-open case that
> would have made this S1 does not exist. F-3 and F-4 (the nonce path) are untouched.

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Authlete version required:** **2.2+** (`01-spec-matrix.md` §2); running 3.0
- **Repo docs under test:** `docs/FAPI-TUTORIAL.md`, `docs/PAR-TUTORIAL.md` Part 9, `docs/curriculum/modules/05-request-integrity-and-binding/` Exercises 4–5, `AGENTS.md` "DPoP & Client Auth", `docs/curriculum/SPEC-INVENTORY.md:137`

<thinking>
1. RFC MUSTs, split by role. Proof syntax §4.2: header `typ: dpop+jwt`, asymmetric `alg` (never `none`),
   `jwk` public key; payload `jti`, `htm`, `htu` (*"without query and fragment parts"*), `iat`, plus `ath`
   whenever presented with an access token. §4.3's twelve checks. §5: a valid proof at the token endpoint,
   `token_type: DPoP` in the response. §6: `cnf.jkt` = RFC 7638 thumbprint. §7.1: a bound token is sent with
   the **`DPoP`** scheme and the RS must check the proof and match the key. §7.2: an RS *"MUST reject a
   DPoP-bound access token received as a bearer token."* §8: the **AS** answers a missing nonce with **400**
   `use_dpop_nonce` plus a `DPoP-Nonce` header; a mismatched nonce MUST be rejected. §9: an **RS** does the
   same with **401**. §5.1/§5.2: `dpop_signing_alg_values_supported`, `dpop_bound_access_tokens`.
2. Authlete boundary: Authlete validates the proof and owns the `cnf.jkt` comparison. The AS passes `dpop`,
   `htm`, `htu` (and `targetUri` where the request type has it), relays `dpopNonce`, and — the part that is
   genuinely the AS's — decides which authentication scheme it accepts on a protected resource, because
   neither `UserinfoResponse` nor `IntrospectionResponse` exposes `cnf`, so the server cannot see the binding.
3. Code: the UserInfo path is the best-audited code in the repo — `utils/dpop.ts` plus
   `userinfo.service.ts:26-73`, with §7.1 and §7.2 enforced locally and four live transcripts in the lab. The
   other four DPoP call sites are weaker: each rebuilds `htu` inline with the query string attached, and the
   grant-management middleware accepts only `Bearer` while still forwarding a proof.
4. Docs: Module 05 Exercises 4–5 are accurate and reproducible. `AGENTS.md:303` and `FAPI-TUTORIAL.md` are
   not — one has the wrong status code for the AS nonce challenge, the other prints a response the server
   cannot produce.
5. Delta: (3) vs (1) on `htu` and on §7.2 at `/api/gm`; (4) vs (1) on the nonce status code; (4) vs (3) on
   the FAPI transcript. Nonce behaviour is unobservable either way — see 6.
6. Can the nonce path be exercised at all? Probe 2 says no: `dpopNonceRequired = False`,
   `dpopNonceDuration = 0`, and no call site sets the SDK's per-request `dpopNonceRequired` override. So every
   nonce claim in the docs is unverified, and one is provably wrong against §8.
</thinking>

## Normative requirements

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Proof header: `typ: dpop+jwt`, asymmetric `alg`, `jwk` public key, no private key | §4.2 | ✅ client side, `client/src/services/dpop.service.ts:70` |
| 2 | Proof payload: `jti`, `htm`, `htu`, `iat` | §4.2 | ✅ `client/src/services/dpop.service.ts:50-57` |
| 3 | `ath` present when a proof accompanies an access token | §4.2, §7 | ✅ `client/src/services/dpop.service.ts:59-61` |
| 4 | Twelve validation checks | §4.3 | ⊘ Authlete's |
| 5 | `htu` excludes query and fragment | §4.2, §4.3 #9 | ✅ **all five call sites, 2026-08-13 (T1-9)** — was correct at UserInfo only; see the banner |
| 6 | Valid proof required at the token endpoint to bind a token; `token_type: DPoP` returned | §5 | ✅ `token.service.ts:76-83`; `token_type: "DPoP"` observed (`FAPI-TUTORIAL.md:432`) |
| 7 | `cnf.jkt` = RFC 7638 thumbprint of the proof key | §6 | ⊘ Authlete's — **verified live**, `[A089312]` on a foreign key (`modules/05…/lab.md:735`) |
| 8 | A bound token is presented with the `DPoP` scheme; the RS checks the proof and matches the key | §7.1 | ✅ **both protected resources, 2026-08-13 (T1-10)** — UserInfo and Grant Management now share `utils/dpop.ts:111-141` |
| 9 | An RS MUST reject a bound token received as a bearer token | §7.2 | ✅ **both, 2026-08-13** — refused locally as `400 invalid_request`, and by Authlete when presented with no proof (`[A089311]` UserInfo, `[A065308]` introspection, `[A281305]` `/gm`) |
| 10 | AS: missing nonce → **400** `use_dpop_nonce` + `DPoP-Nonce` | §8 | ⊘ Authlete's, **unexercisable** — F-3; and `AGENTS.md` documents 401 — **F-4** |
| 11 | AS: mismatched nonce MUST be rejected; response MAY carry a fresh nonce | §8, §8.2 | ⊘ Authlete's, unexercisable — F-3 |
| 12 | RS: nonce challenge uses **401** + `WWW-Authenticate: DPoP` + `DPoP-Nonce` | §9 | ⊘ Authlete's, unexercisable — F-3 |
| 13 | Advertise `dpop_signing_alg_values_supported` | §5.1 | ✅ live: 11 algorithms (probe 2); mirrored into the PRM document (`protected-resource-metadata.controller.ts:51-53`) |
| 14 | Client metadata `dpop_bound_access_tokens` | §5.2 | ⚠️ settable as `dpopRequired` (`client.management.service.ts:425`); **`False` on all three clients** |
| 15 | Error codes `invalid_dpop_proof` and `use_dpop_nonce` on a 401 challenge | §7.1 | ✅ `invalid_dpop_proof` (`userinfo.service.ts:41`, `utils/dpop.ts:78-90`); `use_dpop_nonce` never emitted — F-3 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Proof generation | The client SPA | `client/src/services/dpop.service.ts` |
| The twelve §4.3 checks, the `cnf.jkt` comparison, `token_type: DPoP` | Authlete | `token.process`, `userinfo.process`, `introspection.process` |
| Passing `dpop` / `htm` / `htu` / `targetUri` from HTTP context | **This server** | `utils/dpop.ts:157-161` + 5 call sites |
| Deciding which auth scheme is acceptable on a protected resource | **This server** — Authlete cannot help: no `cnf` on `UserinfoResponse` **or** `IntrospectionResponse` | `utils/dpop.ts:111-141`, `userinfo.service.ts:38-58` |
| Relaying `DPoP-Nonce` | **This server** | `utils/dpop.ts:3-7`, 5 call sites |
| Requiring nonces at all | Service config | `dpopNonceRequired = False`, `dpopNonceDuration = 0` |
| Requiring DPoP per client | Client config | `dpopRequired = False` on all three |

**The `cnf` gap is worth stating precisely** because it decides where the §7.2 obligation lives. I checked
both response models: `UserinfoResponse` has no `cnf`/thumbprint member, and `IntrospectionResponse` has
`certificateThumbprint` (RFC 8705's `x5t#S256`) but **no DPoP `jkt`**. So this server can never learn locally
that a presented token is DPoP-bound. §7.2 compliance is therefore either delegated to Authlete — which
enforces it, verified — or achieved by refusing ambiguous presentations up front, which is what
`utils/dpop.ts` does. Both are legitimate; what is not legitimate is a path that does neither, which is F-2.

## What this repo gets right, verified end to end

Recorded first because it is unusual and it bounds the severity of everything below. `modules/05…/lab.md`
Exercise 5 contains four live transcripts against this deployment:

| Presentation | Result | Spec basis |
|---|---|---|
| `Bearer <bound token>`, no proof | `401` + `WWW-Authenticate: DPoP error="invalid_token" … [A089311] Expected a DPoP header but none was provided.` with an `algs` list | §7.2 MUST, enforced by Authlete |
| `DPoP <bound token>`, no proof | `401 invalid_dpop_proof`, refused **locally** before any Authlete call | §7.1 |
| `DPoP <bound token>` + a proof signed by a key the AS has never seen | `401 … [A089312] Thumbprint of the provided DPoP key does not match` | §6 + §7.1 |
| `Bearer <bound token>` + a `DPoP` header | `400 invalid_request`, both schemes in the challenge | §7.1/§7.2 — the ambiguity is refused rather than resolved |

That is the whole §7 matrix, with the two locally-refused cases distinguishable from the two Authlete-refused
ones by the presence of a bracketed code. The lab also records the fix history: until 2026-08-04
`userinfo.service.ts` stripped only `"Bearer "`, so a bound token could not be spent at all
(`modules/05…/README.md:432-441`).

## Finding F-1 — four of five DPoP call sites send an `htu` that includes the query string (S3)

| Call site | `htu` construction |
|---|---|
| `services/userinfo.service.ts:68` | ✅ `dpopHttpTarget(req)` — query stripped, `targetUri` set separately |
| `services/token.service.ts:80-82` | ❌ `` `${protocol}://${host}${req.originalUrl}` `` |
| `services/introspection.service.ts:61-63` | ❌ same |
| `services/par.service.ts:61-63` | ❌ same |
| `middleware/require-grant-ownership.ts:69` | ❌ same, inline |

`utils/dpop.ts:157-161` exists precisely to get this right and carries the reasoning in its doc comment
(*"Sending the query string as `htu` (as this code used to) makes any request carrying a query fail proof
validation even when the client is correct"*). Four call sites predate or ignore it.

**Direction of failure: false rejection, not false acceptance.** A client that builds `htu` per §4.2 (no
query) while the server reports one with a query produces a mismatch on §4.3 check 9, and Authlete rejects a
valid proof. Nothing is let through that should not be. Today none of the four endpoints is normally called
with a query string, so the values are right by accident — `POST /api/token?x=1` is all it takes to break it.

`TokenRequest` and `IntrospectionRequest` differ here: `IntrospectionRequest` has `targetUri` (*"The target
URI of the resource request, including the query part, if any"*) while `TokenRequest` and
`PushedAuthorizationRequest` do not. So on the token and PAR calls the query simply must not be sent;
on introspection it belongs in `targetUri`. Note `introspection.service.ts:51` currently takes `targetUri`
**from the request body**, contradicting its own comment at `:19-21` and `AGENTS.md`'s rule that
server-determined fields never come from the body.

## Finding F-2 — `/api/gm/:grantId` neither accepts the DPoP scheme nor enforces §7.2 (S2)

`middleware/require-grant-ownership.ts` does two incompatible things:

```ts
// :27-33  — Bearer only, and case-sensitively
if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7).trim() || undefined;

// :65-70  — but a DPoP proof is read and forwarded anyway
const dpop = req.headers["dpop"];
if (typeof dpop === "string" && dpop) { introspectionRequest.dpop = dpop; … }
```

Consequences, in order of how much they matter:

1. **A DPoP-bound token cannot be presented conformantly.** §7.1 requires the `DPoP` scheme for a bound token; `Authorization: DPoP <token>` yields `401 "An access token is required"` at `:52-57`. The Grant Management API is unreachable for exactly the tokens this AS advertises the ability to sender-constrain.
2. **`Bearer` + a proof is accepted, and the proof is validated.** That is the §7.2 downgrade shape: `Bearer` becomes a working route for a bound token. `userinfo.service.ts:52-58` refuses this same presentation with `400 invalid_request`; two protected surfaces in one codebase, opposite answers.
3. **The failing-open case cannot be settled from here.** `Bearer <bound token>` with **no** proof forwards no `dpop` field, so whether Authlete's proprietary `/auth/introspection` still enforces the `cnf.jkt` binding is unknown. At UserInfo it does (`[A089311]`, verified 2026-08-04). If `/auth/introspection` does not, a stolen bound token works at `/api/gm/*` with a plain `Bearer` header and sender-constraint is defeated there. The middleware's own comment at `:64` already says `UNVERIFIED: no DPoP-bound grant-management token exists on this deployment to test against.`

**Severity S2, not S1 — and as of 2026-08-12 that is settled rather than provisional.** Case 2 still validates
the proof, so possession of the private key is still required; the security property survives the scheme
violation. S1 would have needed case 3 to resolve against us, and **it did not**.

> **✅ Case 3 closed 2026-08-12 (T1-17, work item 9449-W4).** `/auth/introspection` **does** enforce the
> `cnf.jkt` binding when no `dpop` field is supplied — a bound token introspected with no proof returns
> `UNAUTHORIZED` / `[A065308] Expected a DPoP header but none was provided.`, and a proof signed by a
> different key returns `[A065309]` thumbprint mismatch. **A stolen bound token therefore does not work at
> `/api/gm/*` with a plain `Bearer` header**, sender-constraint is not defeated there, and this finding stays
> **S2**. `middleware/require-grant-ownership.ts:64`'s `UNVERIFIED` comment is now false and should be deleted
> by 9449-W3 rather than re-dated.
>
> **Case 1 was reproduced in the same pass**, live rather than by reading: `Authorization: DPoP <token>` at
> `GET /api/gm/{grant_id}` returns **401 `invalid_token` — *"Access token is invalid or expired"***. Note the
> message is **wrong about the cause**: the token is neither invalid nor expired, the extractor simply did not
> recognise the scheme. 9449-W3 should fix that string as well as the `startsWith("Bearer ")` test above it.
> Full transcripts in `PROGRESS.md`, entry 2026-08-12 T1-17.

## Finding F-3 — the nonce path cannot be exercised on this deployment (S3)

```
dpopNonceRequired = False
dpopNonceDuration = 0
```

Authlete therefore never returns a `dpopNonce`, so `setDpopNonce` (`utils/dpop.ts:3-7`) never sets a header at
any of its five call sites, and `use_dpop_nonce` is never emitted — consistent with the grep result that the
string exists nowhere in `server/src`. Every nonce claim in the documentation is unverified, and one is wrong
(F-4).

There is a cheap route to a real transcript that does not require touching the service flag: both
`TokenRequest` and `PushedAuthorizationRequest` carry a per-request `dpopNonceRequired` override, documented in
the SDK as *"Even if the service's `dpopNonceRequired` property is `false`, calling the … API with this
`dpopNonceRequired` parameter `true` will force the Authlete API to check whether the DPoP proof JWT includes
the expected `nonce` value."* Neither call site uses it. Whether `dpopNonceDuration = 0` means "disabled" or
"use the default" is not stated on the flags page and does not matter while the boolean is off.

## Finding F-4 — `AGENTS.md` documents the wrong status code for the AS nonce challenge (S2)

`AGENTS.md:303`:

> First request without nonce → **401** `use_dpop_nonce` error + `DPoP-Nonce` header. Client retries with
> nonce. Expired nonce → **401** `invalid_dpop_proof` + new nonce. … See `docs/FAPI-TUTORIAL.md`.

Against RFC 9449 as fetched this session:

| Claim | §8/§9 |
|---|---|
| Missing nonce → 401 | ❌ **400**. §8: *"the authorization server responds to requests that do not include a nonce with an HTTP 400 (Bad Request) error response … using `use_dpop_nonce` as the error code value."* 401 is §9's **resource server** case. |
| Expired nonce → 401 `invalid_dpop_proof` | ❌ mostly. §8: a nonce that does not match *"MUST"* be rejected, and *"The rejection response MAY include a `DPoP-Nonce` HTTP header providing a new nonce value"* — the code that tells a client to retry is `use_dpop_nonce`, not `invalid_dpop_proof`. |
| "Token/PAR endpoints can return nonce on success" | ✅ §8.2 allows a `DPoP-Nonce` on a 200. |
| "protected resource endpoints return it only on error per RFC 9449" | ✅ consistent with §9. |
| "See `docs/FAPI-TUTORIAL.md`" | ❌ **dangling** — `use_dpop_nonce` appears in no file under `docs/`. The pointer resolves to a document that does not discuss the thing being pointed at. |

**Failure scenario.** `AGENTS.md` is the instruction file every agent and contributor reads before touching
this repo. A contributor implementing the nonce challenge — the one piece of DPoP the AS *would* own if the
flag were on — emits 401 at the token endpoint. A conformant client keyed on §8's 400 never retries with the
nonce, and DPoP appears broken for every client while the server logs look fine. That is S2: the reader builds
something broken, from the file that is supposed to be authoritative.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| The four §7 presentation cases, with transcripts | `modules/05…/lab.md:678-770` | Reproduced live; error codes and layers correctly attributed | **Accurate** — the best DPoP material in the repo |
| "Present an ordinary, unbound token under the `DPoP` scheme … and you get `200`… The security property lives on the token's `cnf.jkt`, not on the scheme" | `modules/05…/lab.md:800-808` | Correct, and the right lesson | **Accurate** |
| ES256 signature must be raw R‖S, not DER | `AGENTS.md`; `client/src/services/dpop.service.ts:76-85` | Matches the code and RFC 7515's JWS ES256 encoding | **Accurate** |
| `ath` not `sub`; `jwk` required in the header | `AGENTS.md`; `dpop.service.ts:59-61,70` | Matches §4.2 | **Accurate** |
| Nonce flow: 401 for a missing nonce | `AGENTS.md:303` | §8 requires 400 at the AS | `DOC_INCORRECT` / **S2** — F-4 |
| PAR response with `DPoP-Nonce: <serverNonce>` and `{"requestUri":…,"expires_in":90}` | `FAPI-TUTORIAL.md:377-384` | Neither header nor body is producible: nonces are off, and the body is a shape the server never emits | `DOC_INCORRECT` / **S2** (also RFC 9126 F-2) |
| "First request without nonce → server returns `DPoP-Nonce` header" | `PAR-TUTORIAL.md:428-431` | Omits that §8 makes this a **400 error response**, not a header on success | `DOC_INCORRECT` / S3 |
| "SPA stores nonces in `sessionStorage` under `dpop_nonce`" | `PAR-TUTORIAL.md:431` | Unexercisable — no nonce is ever issued | `IMPLEMENTED_UNVERIFIED` / S4 |
| "Require Nonce: `true`, Nonce Duration `3600`" as the recommended config | `FAPI-TUTORIAL.md:257-258` | Live values are `False` / `0` — the tutorial's own recommendation is not applied to the service the tutorial runs against | **S3** |
| `dpopEnabled` reports `dpopNonceRequired`, not "is DPoP available" | `FAPI-TUTORIAL.md:524-529,697-700` | Correct, and an unusually careful distinction | **Accurate** |
| `SPEC-INVENTORY.md:137` — points at `dpop.service.ts`, `utils/dpop.ts`, `FAPI-TUTORIAL.md` | `:137` | Accurate as a pointer | **Accurate** |

## Sources consulted

- RFC 9449 §§4.2, 4.3, 5, 5.1, 5.2, 6, 7, 7.1, 7.2, 8, 8.1, 8.2, 9 and full ToC — `https://www.rfc-editor.org/rfc/rfc9449.txt`, `https://www.rfc-editor.org/rfc/rfc9449.html` (§§8–9 quoted verbatim this session)
- Authlete, Using DPoP — `https://developers.authlete.com/configuration-reference/tokens-and-claims/using-dpop.md` *(the page does **not** document the nonce flags, `targetUri`, or whether `htu` includes the query — recorded as a source gap, as `01-spec-matrix.md` §8 predicted)*
- SDK 1.0.0: `models/tokenrequest.ts:74-94,149`, `models/pushedauthorizationrequest.ts`, `models/introspectionrequest.ts:108-120`, `models/introspectionresponse.ts:122-126,248`, `models/userinforesponse.ts:217`
- Live probe 2 (2026-08-10): `dpopNonceRequired`, `dpopNonceDuration`, `dpop_signing_alg_values_supported`, per-client `dpopRequired` — `SERVICE-CONFIG-PROBE.md` §6–§7
- Code: `utils/dpop.ts` (whole file), `services/userinfo.service.ts:26-73`, `services/token.service.ts:76-83`, `services/introspection.service.ts:51,57-64`, `services/par.service.ts:57-64`, `middleware/require-grant-ownership.ts:27-33,65-70`, `controllers/protected-resource-metadata.controller.ts:51-53`, `client/src/services/dpop.service.ts:41-86`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9449-W1 | Route all DPoP `htu` construction through `dpopHttpTarget()` | S | ✅ **DONE 2026-08-13 (T1-9).** All five sites now use it — the four named plus **`grant-management.service.ts`**, which the item did not list because the `/gm` call was not known to take DPoP fields at all. `targetUri` is sent only where the request model has it: `IntrospectionRequest` and `UserinfoRequest` yes; `TokenRequest`, `PushedAuthorizationRequest` and `GMRequest` no — checked in the SDK models rather than assumed. Regression tests assert a query string never reaches `htu` at each site, and it was proven live: a `GET /api/gm/{id}?verbose=true` with a valid proof now returns **200** where it previously failed validation. **9126-W4 closes with this.** |
| 9449-W2 | Stop reading `targetUri` from the introspection request body | S | ✅ **DONE 2026-08-13 (T1-9).** The body read is deleted and replaced by a comment naming the reason, so it is not restored by someone tidying. `targetUri` now comes from `dpopHttpTarget()` alongside `htu`. This closes the last place a caller could choose the URI its own proof was validated against — the identical defect already fixed at UserInfo, where a proof minted for `/api/par` had returned `200`. A unit test drives a body `targetUri` of `https://…/api/par` and asserts the request carries the real one. |
| 9449-W3 | Accept the `DPoP` scheme at `/api/gm/:grantId`, and refuse the downgrade | M | ✅ **DONE 2026-08-13 (T1-10).** All four cases shipped and **verified live, not just unit-tested**: `DPoP` + proof → **200** (was 401), `Bearer` + proof → **400 `invalid_request`**, `DPoP` without a proof → **401 `invalid_dpop_proof`**, and no token → **401 with no error code** and `WWW-Authenticate: Bearer, DPoP` (RFC 6750 §3.1, matching UserInfo — approved separately because it changed a live lab transcript). Scheme matching is case-insensitive by construction now that `extractAccessToken()` owns it. **The acceptance criteria were incomplete and that is the lesson**: they name only the middleware, but `/api/gm` makes **two** Authlete calls and both check the binding independently — `/gm` without a forwarded proof answers `[A281305] The access token is bound to a public key but the grant management request includes no DPoP header.` Fixing the middleware alone would have moved the 401 one call later. `grant-management.service.ts` forwards the same proof, which Authlete accepts rather than treating as a replay (verified). **GM-W4 closed in the same change.** |
| 9449-W4 | Settle whether `/auth/introspection` enforces `cnf.jkt` without a proof | S | ✅ **DONE 2026-08-12 (T1-17). It enforces it, and it fails closed** — so **9449-W3 is NOT reclassified; F-2 stays S2.** A `client_credentials` token minted with a proof (`token_type: DPoP`) was introspected three ways: correct proof → `OK` `[A056001]`; **no `dpop` at all → `UNAUTHORIZED` `[A065308] Expected a DPoP header but none was provided.`**; a proof signed by a different key → `UNAUTHORIZED` `[A065309] Thumbprint of the provided DPoP key does not match the expected DPoP thumbprint.` Same posture as UserInfo under a different code (`[A089311]` there), and Authlete's challenge already carries the `DPoP` scheme plus an accurate `algs` list — so `AGENTS.md`'s "forward `responseContent` verbatim, do not hand-write a DPoP challenge" rule extends to this endpoint. The `UNVERIFIED` comment at `middleware/require-grant-ownership.ts:64` can be **deleted**, not re-dated. Transcript in `PROGRESS.md`, entry 2026-08-12 T1-17. |
| 9449-W5 | Correct `AGENTS.md:303` | S | ✅ **DONE 2026-08-14 (T2-14), all four clauses.** The bullet now carries a two-row table — **AS: 400 `use_dpop_nonce` + `DPoP-Nonce`** (§8, quoted verbatim) versus **RS: 401 + `WWW-Authenticate: DPoP` + `DPoP-Nonce`** (§9) — states that a stale or mismatched nonce is refused with **`use_dpop_nonce`, not `invalid_dpop_proof`**, and reserves `invalid_dpop_proof` for a genuinely malformed proof. **The `FAPI-TUTORIAL.md` pointer was *made good* rather than dropped**, with the caveat that its nonce material is now marked `UNVERIFIED` (T2-1) for the same reason this bullet needs one: `dpopNonceRequired` is `false`, so none of it is exercisable here. **Why §8's 400 is not a detail, and the reason this was worth an S3 rather than an S4:** a client that retries only on a 401 never retries at the token endpoint at all — the wrong status does not merely mislabel the error, it stops the nonce dance from starting. |
| 9449-W6 | Produce one real nonce transcript | M | Either set `dpopNonceRequired` on the service, or send the SDK's per-request override from the token/PAR calls; capture the actual status and headers; rewrite the nonce sections of `FAPI-TUTORIAL.md` and `PAR-TUTORIAL.md` against it. |
| 9449-W7 | Enable `dpopRequired` on the `DPOP` client | S | The client named `DPOP` (1678274156) actually requires DPoP, so §5.2's `dpop_bound_access_tokens` semantics can be demonstrated — a token request without a proof is rejected. |

**Ordering and gating.** W1/W2 touch `services/token.service.ts` and `services/introspection.service.ts`,
both on the `AGENTS.md` **Security-critical surfaces** list (Token issuance; Token presentation &
introspection), and `utils/dpop.ts` is listed under DPoP — so **W1, W2 and W3 each require a plan before
editing**. W4 gates W3's severity and should run first. W5 is a documentation fix with no code risk and should
not wait for any of them.
