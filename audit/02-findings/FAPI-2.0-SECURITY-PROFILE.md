# FAPI 2.0 Security Profile

> ## 🔶 PARTIALLY REMEDIATED 2026-08-11 — FAPI2-W1 shipped, widened to six fields
>
> **F-1's second half is fixed.** `/api/fapi/config` no longer asserts a FAPI posture it never checked.
> All six values now come from the live service:
>
> | Was hardcoded | Now |
> |---|---|
> | `requiredClientAuth: "PRIVATE_KEY_JWT"` | `supportedTokenAuthMethods` — client auth is pinned **per client** (`tokenAuthMethod`), and §5.3.2.1 permits mTLS *or* `private_key_jwt`, so no service-level "required method" exists to report |
> | `senderConstrainedTokens` (from the nonce flag) | `certificateBoundAccessTokens` ← `tlsClientCertificateBoundAccessTokens`. DPoP binding is per-client and stays unreported |
> | `parRequired: true` · `pkceRequired: true` · `scopeRequired: true` | live values |
> | `refreshTokenRotation: false` | `refreshTokenKept === false` — a *kept* refresh token is one that is **not** rotated |
>
> **W1's acceptance criteria were widened from five fields to six** at the user's decision:
> `senderConstrainedTokens` was the same defect class (asserting a control from an unrelated flag) in the
> same line block, and leaving it would have shipped a known-false field. Recorded here rather than
> silently.
>
> Locked by `tests/unit/routes/fapi.routes.test.ts` and `tests/integration/routes.test.ts`, each with a
> hardened **and** an unhardened service, so a constant returning would fail the suite.
>
> ~~**F-1's first half is NOT fixed**~~ → **✅ fixed 2026-08-12 (T1-5).** `SPIFFE_JWT` was withdrawn from
> `supportedTokenAuthMethods`, `service.get()` parses, and **both endpoints answer 200 with live values**
> (`mode: "disabled"`). So F-1 is closed in both halves: the endpoint neither lies nor fails. **FAPI2-W2** ✅
> (= EH-W1). **FAPI2-W3/W4/W5/W6 remain open** — and FAPI2-W4 is now the *only* thing between this endpoint and
> an honest report of all eight §5.3.2.1 requirements, since it reports six.
>
> **One measured value in this entry moved with T1-5**, and it matters for §5.3.2.1: the profile permits mTLS
> *or* `private_key_jwt`, and `token_endpoint_auth_methods_supported` no longer advertises the mTLS pair at all,
> so the only FAPI-acceptable method this service offers is `private_key_jwt` — which **one client now actually
> uses** (T1-3). The gap is that it is required of nobody.
>
> **✅ F-2 closed 2026-08-13, and the severity moves with it — S2 → S3.** F-2 was *"`README.md` still calls
> FAPI 2.0 'Working'"*. It now reads **"Not enabled — `fapiModes` is unset on the service, so none of the
> profile's constraints are enforced. The code supports it; the deployment does not claim conformance."*
> DPoP is listed separately as **Working**, because it genuinely is — the old single row conflated a
> *profile* with a *mechanism*. **What remains is S3 and is not a false claim**: the profile is off, which is
> a Tier 3 decision (**DR-02**), and the deployment now says so in the first place a reader looks.

- **Verdict:** `MISCONFIGURED` *(unchanged — the profile itself is still not enabled)*
- **Severity:** ~~**S1**~~ → ~~S2~~ → **S3** (FAPI2-W1 2026-08-11; F-2's `README.md` claim corrected 2026-08-13)
- **Status:** OpenID **Final**, **22 February 2025** — re-verified against the primary source this session
- **Authlete version:** 3.0 (`Service.fapiModes`, `FAPI2_SECURITY`)
- **Repo docs under test:** `README.md` feature tables, `docs/FAPI-TUTORIAL.md`, `docs/curriculum/modules/10-fapi-and-grant-management/`, `AGENTS.md`, `client/src/components/fapi/FapiSection.tsx`

<thinking>
1. The AS-facing shall statements (§5.3.2.1): authenticate clients with **mTLS or `private_key_jwt`**; support
   PAR and **reject authorization requests sent without it**; **require PKCE with S256**; **only issue
   sender-constrained tokens** (mTLS or DPoP); **shall not** rotate refresh tokens except in extraordinary
   circumstances; **return `iss`** per RFC 9207; require `redirect_uri` in the PAR request; use PS256, ES256 or
   EdDSA(Ed25519).
2. Authlete boundary: one flag — `fapiModes` including `FAPI2_SECURITY` — plus the individual switches the
   profile implies. Authlete enforces; the AS reports.
3. Code: `controllers/fapi.controller.ts` is the only place the profile appears, and it is the two broken
   reporting endpoints. No enforcement code is needed or present.
4. Docs: `README.md` says FAPI 2.0 is **"Working"**; a 798-line tutorial walks a FAPI 2.0 flow.
5. Delta: measured against the live configuration, **seven of eight** AS-facing shall statements are unmet, and
   the deployment's own reporting endpoint asserts four of them are met. That combination is what makes this S1
   rather than another *claimed working, flag off* row.
6. Careful on one point: `refreshTokenKept = false` means rotation is ON, which satisfies RFC 9700 §2.2.2 and
   **violates** FAPI 2.0 §5.3.2.1. Probe 1 §3.2 already framed that tension correctly and I should preserve it.
</thinking>

## Normative requirements (AS side) versus the live configuration

| # | §5.3.2.1 shall | Live value | Status |
|---|---|---|---|
| 1 | Authenticate clients with **mTLS** or **`private_key_jwt`** | `tokenAuthMethod`: `NONE`, `CLIENT_SECRET_BASIC`, `NONE` on the three clients; no client has `jwks`/`jwksUri` | ❌ **no client can satisfy this** |
| 2 | Support PAR, and **reject authorization requests sent without it** | `parRequired = false` (service and all clients) | ❌ |
| 3 | **Require PKCE with `S256`** | `pkceRequired = false`, `pkceS256Required = false` | ❌ (`RFC7636-pkce.md` F-1) |
| 4 | **Only issue sender-constrained access tokens** (mTLS or DPoP) | `tlsClientCertificateBoundAccessTokens = false`; `dpopRequired = false` on all clients | ❌ |
| 5 | **Shall not** use refresh token rotation except in extraordinary circumstances | `refreshTokenKept = false` ⇒ rotation **is** on | ❌ — and see the tension note below |
| 6 | Return `iss` in the authorization response per RFC 9207 | `issSuppressed = false`; verified live | ✅ **the one requirement met** |
| 7 | Require `redirect_uri` in the pushed authorization request | unenforced — `parRequired = false`, so PAR is optional to begin with | ❌ |
| 8 | Use `PS256`, `ES256` or `EdDSA` (Ed25519) | `id_token_signing_alg_values_supported = [HS256, HS512, ES256, HS384]`; `authorization_signing_alg_values_supported` the same. **PS256 absent, three HMAC algorithms present**, and one client signs ID tokens with **HS256** | ❌ |
| — | `fapiModes` includes `FAPI2_SECURITY` | **absent** ⇒ `computeFapiMode` returns `"disabled"` | ❌ |

**One met, seven unmet.** And the profile is not switched on, so Authlete is not enforcing any of them.

### The rotation tension, preserved rather than flattened

`refreshTokenKept = false` means refresh tokens **are** rotated. That simultaneously:

- **satisfies** RFC 9700 §2.2.2 — *"Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation"*; and
- **violates** FAPI 2.0 §5.3.2.1 — *"shall not use refresh token rotation except in extraordinary circumstances"*.

Probe 1 §3.2 already recorded this and called it *"a genuinely good teaching artifact"*. I agree, and it is the
single best argument for the recommendation at the end of this entry: the same switch is required by BCP 240 and
forbidden by FAPI 2.0, so a deployment cannot claim both profiles at once, and this one claims both.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Enforcing every requirement above | Authlete, gated by `fapiModes` | not enabled |
| Reporting the posture | **This server** | `controllers/fapi.controller.ts` — broken twice over, F-1 |
| The individual switches the profile implies | Service + client configuration | all off |
| DPoP proof validation (the one sender-constraining route available) | Authlete | implemented and verified at UserInfo (`RFC9449-dpop.md`), unrequired |

No enforcement code belongs in this repo, which is why the code-side verdict is not "unimplemented" — it is
`MISCONFIGURED`: the vendor can enforce the profile and nothing has asked it to.

## Finding F-1 — the deployment's own FAPI reporting endpoints are broken **and** assert compliance they never checked (S1)

`GET /api/fapi/config` (`controllers/fapi.controller.ts:23-56`) returns five **hardcoded literals**:

```ts
requiredClientAuth: "PRIVATE_KEY_JWT",   // :38   — live: NONE / CLIENT_SECRET_BASIC / NONE
parRequired: true,                        // :40   — live: false
pkceRequired: true,                       // :41   — live: false
refreshTokenRotation: false,              // :42   — live: rotation is ON
scopeRequired: true,                      // :43   — live: false
```

Every one of those five is the **opposite of the live value**. `GET /api/fapi/status` (`:58-89`) reads the real
values — and both endpoints call `authleteApi.service.get()`, which throws, so neither can answer at all.

And the failure is served as **HTTP 200**. That is not the enum gap; it is the error handler deriving the HTTP
status from an error object carrying `statusCode: 200`, which I verified empirically this session — full mechanism
in `ERRORHANDLER-STATUS-INVERSION.md`.

**So the compound behaviour is:**

| Endpoint | What a caller gets |
|---|---|
| `/api/fapi/status` | `200 OK` with `{"error":"Bad Request","message":"Response validation failed", …}` — cannot report the truth |
| `/api/fapi/config` | Same 200-with-error-body — and the five literals it *would* have emitted are all false |

**Failure scenario, and why S1.** Module 07 teaches auditing a deployment by triangulating advertised metadata,
stored configuration and observed behaviour. A reviewer applying that method to this deployment's FAPI posture
queries the endpoint built for exactly that purpose. It answers with a success status. If the reviewer's tooling
parses the body loosely — or if the enum gap is ever fixed without removing the literals — they record
`private_key_jwt` required, PAR required, PKCE required, rotation disabled, scope required: **a fully compliant
FAPI 2.0 profile on a service that meets one requirement in eight.** That is conformance theatre produced by the
repo's own instrumentation, and `AGENTS.md` already names the literals as *"a plain reporting bug, not teaching
material."* It is worse than a reporting bug: it is a false attestation.

## Finding F-2 — `README.md` lists FAPI 2.0 as "Working" (S2)

`README.md:92-130` asserts **"Working"** for FAPI 2.0 + DPoP. The DPoP half is true and verified
(`RFC9449-dpop.md` — four live transcripts at UserInfo). The FAPI 2.0 half has `fapiModes` absent and seven of
eight shall statements unmet.

Third member of the *claimed working, flag off* pattern (`NATIVE-SSO-1.0.md` F-1), and the most consequential,
because FAPI is the profile a reader would take as a statement about the deployment's security posture rather than
about a feature's presence.

`PROGRESS.md` already records the operational half honestly: `fapiModes` *"never re-enabled, so **no lab step
shows FAPI being enforced**"*. The feature table has not caught up with the build log.

## Finding F-3 — the tutorial's transcripts cannot have been produced (S2)

`docs/FAPI-TUTORIAL.md` walks a full FAPI 2.0 flow — `private_key_jwt` client assertion, PAR with DPoP, a
`token_type: "DPoP"` response, DPoP at UserInfo. Against the live configuration:

- no client is registered for `private_key_jwt` and none has a JWKS (probe 2 §7), so the client assertion at `:344-350` cannot be produced;
- the PAR response block at `:377-384` is a shape the server never emits, with `expires_in: 90` against a live `pushedAuthReqDuration` of 600 — already recorded as `RFC9126-…` F-2 and `RFC9449-…` F-5;
- the `DPoP-Nonce` header shown there cannot appear (`dpopNonceRequired = false`, `dpopNonceDuration = 0`);
- `:390` uses `/api/authorize`, which is not a route (`/api/authorization` is).

The parts that *are* real — `token_type: "DPoP"`, the §7.1/§7.2 scheme discussion at `:440-460` — are verified
elsewhere in this audit. The FAPI-specific scaffolding around them is not.

To its credit the tutorial does state the prerequisite honestly at `:257-258` (*"Require Nonce: `true`, Nonce
Duration `3600`"*) and at `:524-529` explains that `dpopEnabled` reports `dpopNonceRequired` rather than "is DPoP
on" — an unusually careful distinction. The problem is transcripts presented as observations.

## Finding F-4 — `fapi.controller.ts` never reads five of the switches the profile turns on (S3)

`getStatus` reports `scopeRequired`, `refreshTokenKept`, `refreshTokenIdempotent`, `pkceRequired`, `parRequired`,
`dpopNonceRequired`, `dpopNonceDuration` and `clientIdMetadataDocumentSupported`. It never reads:

`pkceS256Required` · `tlsClientCertificateBoundAccessTokens` · `supportedTokenAuthMethods` ·
`accessTokenSignAlg` · `authorizationSignAlg`-adjacent algorithm lists

Those are requirements 1, 3 (the S256 half), 4 and 8 above — i.e. **half the profile is not merely unmet but
unreported**. A reporting endpoint that omits the fields it would fail on is a weaker instrument than one that
reports failures. Same class as `RFC7636-pkce.md` F-2, which found `pkceS256Required` absent from both endpoints.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title, Final, **22 Feb 2025** | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **Confirmed** against `openid.net/specs/fapi-security-profile-2_0-final.html` this session | **Accurate** |
| FAPI 2.0 listed as **"Working"** | `README.md:92-130` | One requirement of eight met; profile not enabled | `DOC_INCORRECT` / **S2** |
| `requiredClientAuth: "PRIVATE_KEY_JWT"`, `parRequired: true`, `pkceRequired: true`, `refreshTokenRotation: false`, `scopeRequired: true` served as API output | `controllers/fapi.controller.ts:38,40-43` | All five are the opposite of the live values | `DOC_INCORRECT` / **S1** — F-1 |
| "a plain reporting bug, not teaching material… once `service.get()` works again, `config` will assert values the service may not hold" | `AGENTS.md` | Correct, and understated — the values are already known to be wrong | **Accurate** |
| "FAPI 2.0 also permits `tls_client_auth`, so the hardcoded `PRIVATE_KEY_JWT` would misreport an mTLS deployment" | `AGENTS.md` | **Confirmed** against §5.3.2.1's two permitted methods | **Accurate** |
| `fapiModes` "never re-enabled, so no lab step shows FAPI being enforced" | `PROGRESS.md` | Confirmed by probes 1 and 3 | **Accurate** |
| A full FAPI 2.0 flow with transcripts | `docs/FAPI-TUTORIAL.md` | Unreproducible — F-3 | `DOC_INCORRECT` / **S2** |
| `dpopEnabled` reports `dpopNonceRequired`, not "is DPoP available" | `FAPI-TUTORIAL.md:524-529,697-700` | Correct and carefully drawn | **Accurate** |

## Sources consulted

- FAPI 2.0 Security Profile §5.3.2.1 — `https://openid.net/specs/fapi-security-profile-2_0-final.html`, fetched this session. Quoted: the client-authentication methods, *"shall reject authorization requests sent without RFC9126"*, *"shall require PKCE RFC7636 with `S256`"*, *"shall only issue sender-constrained access tokens"*, *"shall not use refresh token rotation except in extraordinary circumstances"*, *"shall return an `iss` parameter … according to RFC9207"*, and the PS256/ES256/EdDSA algorithm requirement. *(Note: `fapi-2_0-security-profile-final.html` returns 404; the document is served at the URL above.)*
- RFC 9700 §2.2.2 (the rotation requirement FAPI 2.0 contradicts) — `https://www.rfc-editor.org/rfc/rfc9700.html`
- Live probes 1–3 (2026-08-10): `fapiModes`, `parRequired`, `pkceRequired`, `pkceS256Required`, `refreshTokenKept`, `tlsClientCertificateBoundAccessTokens`, `id_token_signing_alg_values_supported`, `authorization_signing_alg_values_supported`, per-client `tokenAuthMethod` / `jwksUri` / `dpopRequired` / `idTokenSignAlg` — `SERVICE-CONFIG-PROBE.md` §2–§10
- **Live verification of the 200-status mechanism, 2026-08-10** — `ERRORHANDLER-STATUS-INVERSION.md`
- Code: `controllers/fapi.controller.ts` (whole file), `middleware/errorHandler.ts:14-18`, `routes/fapi.routes.ts:6,7`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| FAPI2-W1 | **Delete the five hardcoded literals** | S | `/api/fapi/config` either reports live values or omits the field; it never asserts a control it has not read. Independent of the `service.get()` decision and of the curriculum — the literals are wrong whether or not the call works. Same item as `7636-W1`, `9700-W4`. |
| FAPI2-W2 | Clamp the error status | S | = **EH-W1**. Until then, both endpoints answer 200 on failure. |
| FAPI2-W3 | Correct `README.md`'s feature table | S | ✅ **DONE — the row itself landed with the S1-residue documentation pass (2026-08-13) and the *derivation* landed with T2-8 (2026-08-14).** The row reads *"Not enabled — `fapiModes` is unset on the service, so none of the profile's constraints are enforced. The code supports it; the deployment does not claim conformance"*, and DPoP has its own **Working** row citing both protected resources. What T2-8 added is the part that keeps it true: the note under the table names `fapiModes` as the field this row depends on and gives the command that reads it. |
| FAPI2-W4 | Report the whole profile | S | `getStatus` adds `pkceS256Required`, `tlsClientCertificateBoundAccessTokens`, `supportedTokenAuthMethods` and the signing-algorithm lists, so the endpoint can fail honestly on all eight requirements. |
| FAPI2-W5 | Decide whether FAPI 2.0 is a claim this deployment makes | M | **Gate 4 decision.** Enabling it means: one client with `private_key_jwt` + JWKS (**7523-W4**, which three other entries also want), PAR required, PKCE S256 required, DPoP required, rotation disabled, PS256/ES256 only — and that **breaks** the RFC 9700 §2.2.2 rotation lesson and the retired-grant exercises. The honest alternative is to teach FAPI 2.0 from the spec with the gap stated, as Module 05 does for mTLS. |
| FAPI2-W6 | Rewrite `FAPI-TUTORIAL.md` against real transcripts, or label them | M | ✅ **DONE 2026-08-14 (T2-1), which is also where this item's *only* schedule came from** — it had no tier row of its own and was reachable in the plan solely through §5.2 cluster 22, so the coverage check counted it without anybody having to do it. **The file is two documents and now says so in a table**: Parts 5–6 are **captured** (Part 6's DPoP failure responses were all run against this server, and Part 5 identified the hardcoded-literal bug before this audit did); Parts 3–4 are **`UNVERIFIED`**, because they describe a correctly configured FAPI 2.0 service and this is not one. Four live gaps enumerated: `fapiModes` absent, `fapi_scope` unregistered, `parRequired` false everywhere, `dpopNonceRequired` false. **The second is the trap and is now called out as one** — a missing FAPI mode gives you an error to look up, a missing scope attribute gives you a **200** and a flow that quietly is not FAPI. Two prerequisites that *are* now met were credited: client `2176571218` has `PRIVATE_KEY_JWT` + a JWK Set (T1-3) and `pkceRequired` (2026-08-13), so Steps 1, 2, 3 and 5 are runnable — what is not runnable is FAPI *enforcement* of them. |

**Ordering and gating.** FAPI2-W1 and EH-W1 are small, independent, and fix false reporting — they should go first
and neither touches the curriculum. FAPI2-W5 gates W3 and W6. `controllers/fapi.controller.ts` is **not** on the
`AGENTS.md` **Security-critical surfaces** list, and `AGENTS.md` explicitly excludes `fapi` — defensible for
ordinary changes, but this file emits security attestations, which is worth revisiting at Gate 4.
