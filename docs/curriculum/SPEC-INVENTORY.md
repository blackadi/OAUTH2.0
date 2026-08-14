# Specification Inventory

**The short version:** every specification this curriculum touches, with its exact title, current status,
date, what problem it solved, what it fixed, and where it lives in this repo's code. Use it as a lookup
table and as a map from "what the spec says" to "what runs here."

## How to read this table

- **Status / type** is labeled precisely, because it changes how much you should trust a requirement:
  - **Published RFC** — an IETF Request for Comments (Standards Track unless the row notes
    BCP/Informational/**Experimental**). Stable. Note that "published" says nothing about *maturity*:
    RFC 7592 is published and **Experimental**, which is why vendor support for it is uneven.
  - **OpenID Final** — an OpenID Foundation Final Specification. Stable, IPR-protected.
  - **OpenID Implementer's Draft** — stable enough to build on, but *not* final; wording can still change.
  - **Active Internet-Draft** — work in progress. **Never cite a draft requirement as normative.** Revision
    and consulted date are given so you know exactly what was read.
- **Verified:** every row was checked against its primary source (rfc-editor.org / datatracker.ietf.org /
  openid.net) on **2026-07-27**. Where a source disagreed with prior assumptions, the source won.
- **Authlete caveat:** the "Where in this repo" column points at code that delegates to the Authlete API.
  Much OAuth/OIDC behavior is enforced *inside Authlete*, controlled by service flags (see `AGENTS.md`), not
  in this server's TypeScript. Modules flag every place a behavior is Authlete's doing rather than a
  normative requirement of the spec.

---

## 0a. Supporting references (cited across modules)

Not subjects in their own right, but cited by name in the modules — so they belong here rather than nowhere.
**Added in the Stage 4 consistency pass**, which found them cited but uninventoried.

| Identifier | Exact title | Status / type | Date | Why the curriculum cites it |
|---|---|---|---|---|
| RFC 2119 | Key words for use in RFCs to Indicate Requirement Levels | Published RFC (**BCP 14**) | Mar 1997 | MUST/SHOULD/MAY. Module 07's whole review method rests on reading these precisely |
| RFC 8174 | Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words | Published RFC (**BCP 14**, updates 2119) | May 2017 | Only **uppercase** key words are normative — lowercase "should" is prose |
| RFC 3986 | Uniform Resource Identifier (URI): Generic Syntax | Published RFC (**STD 66**) | Jan 2005 | The `unreserved` character set in RFC 7636's `code_verifier` ABNF (Module 03) |
| RFC 7800 | Proof-of-Possession Key Semantics for JSON Web Tokens (JWTs) | Published RFC (Std Track) | Apr 2016 | Defines the **`cnf` claim** (§3.1) that DPoP (`jkt`), mTLS (`x5t#S256`) and SD-JWT key binding (`jwk`) all use — Modules 05, 09b, 10 |

## 0. Transport & encoding foundations (Module 00)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| **RFC 9846** | The Transport Layer Security (TLS) Protocol Version 1.3 | Published RFC | **Jul 2026** | Modern transport encryption between two endpoints | Eavesdropping/tampering on the wire (not at the endpoints) | all HTTPS transport; production/tunnel deployment |
| RFC 8446 | The Transport Layer Security (TLS) Protocol Version 1.3 | Published RFC — **obsoleted by RFC 9846** | Aug 2018 | *(superseded)* | — | cite RFC 9846 instead |
| RFC 9110 | HTTP Semantics | Published RFC (Internet Standard) | Jun 2022 | Version-independent HTTP methods, status, headers | Common vocabulary for every request/response | every route in `server/src` |
| RFC 4648 | The Base16, Base32, and Base64 Data Encodings | Published RFC | Oct 2006 | base64url (§5) — URL-safe, usually unpadded | The encoding of every JOSE segment | `scripts/decode-jwt.mjs`; `dpop.service.ts` |

> **TLS 1.3's defining RFC changed, and the protocol did not.** RFC 9846 (July 2026) is `rfc8446bis`: it
> obsoletes RFC 8446, **retains the same wire version number**, and is backward compatible — it tightens
> requirements and clarifies ambiguities rather than changing the protocol. So nothing this curriculum
> teaches about TLS changes; only the identifier you cite does. Note also that the *published* RFC 8446
> document cannot tell you this — a 2018 document carries no forward reference. **Obsolescence lives in the
> Datatracker metadata, not in the RFC text**, which is a general lesson: check
> `datatracker.ietf.org/doc/rfcNNNN/`, not just the rendered RFC.

## 1. JOSE — the cryptographic envelope (Module 00)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 7515 | JSON Web Signature (JWS) | Published RFC | May 2015 | Detached/compact signatures over JSON | Integrity + origin auth for tokens | ID tokens, JWT ATs, DPoP proofs, JAR (via Authlete + `client/src/services/dpop.service.ts`) |
| RFC 7516 | JSON Web Encryption (JWE) | Published RFC | May 2015 | Encrypted JSON payloads | Confidentiality of claims/request objects | Encrypted request objects (Brazil flags in `AGENTS.md`) |
| RFC 7517 | JSON Web Key (JWK) | Published RFC | May 2015 | Key representation + JWK Set | Publishing/consuming signing keys | JWKS via Authlete; `utils/jwksClient` |
| RFC 7518 | JSON Web Algorithms (JWA) | Published RFC — **updated by RFC 9864** (Oct 2025) | May 2015 | `alg`/`enc` registry (ES256, RS256, …) | Names the algorithms JWS/JWE use | DPoP ES256 (`dpop.service.ts`) |
| RFC 7519 | JSON Web Token (JWT) | Published RFC — **updated by RFC 8725** (BCP 225) | May 2015 | Claims container + registered claims | `iss/sub/aud/exp/iat/nbf` semantics | ID tokens, JWT ATs, assertions |
| **RFC 8725** | JSON Web Token Best Current Practices | Published RFC (**BCP 225**, updates RFC 7519) | Feb 2020 | The normative countermeasures: §2.1 explicit typing, §3.1 *"Perform Algorithm Verification"*, §3.2 *"Use Appropriate Algorithms"*, §3.8 substitution attacks | Turns "pin the algorithm, never trust the header" from folklore into a citable requirement | Module 00's threat notes; Module 08 step 7; Module 06's `kid`/`jku` exercise |
| RFC 7638 | JSON Web Key (JWK) Thumbprint | Published RFC | Sep 2015 | Canonical hash of a JWK | DPoP `jkt` binding; key IDs | DPoP proof binding (RFC 9449) |

> **RFC 8725 is the one to reach for in a review.** Modules 00, 06 and 08 all teach its content — reject
> `alg: none`, pin the algorithm from configuration rather than reading it from the header, never resolve a
> key from an attacker-controlled `kid`/`jku` — but a BCP number is what ends an argument with an architect
> who wants to "just use the library default." Cite **RFC 8725 §3.1** for algorithm verification and **§3.2**
> for algorithm choice.
>
> **RFC 9864 barely matters here, and it is worth knowing why.** It updates RFC 7518 with *fully-specified*
> algorithm identifiers and deprecates `ES256` — **in COSE registries only**. JOSE's `ES256` is unaffected,
> and RFC 9864 explicitly declines to register fully-specified RSA variants. Nothing in this curriculum's
> `ES256`/`RS256` usage changes. The row is annotated because the inventory promises to track updates, not
> because you need to act.

## 2. OAuth 2.0 core & threat model (Modules 01–02)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 6749 | The OAuth 2.0 Authorization Framework | Published RFC | Oct 2012 | Delegated authorization; auth-code, implicit, ROPC, client-credentials grants | Removes the password anti-pattern | authorization/token flow via Authlete; `controllers/authorization.*`, `token.controller.ts` |
| RFC 6750 | The OAuth 2.0 Authorization Framework: Bearer Token Usage | Published RFC | Oct 2012 | How to present a bearer token (`Authorization: Bearer`) | Standard resource access | `routes/userinfo.routes.ts` |
| RFC 6819 | OAuth 2.0 Threat Model and Security Considerations | Published RFC (Informational) | Jan 2013 | Systematic threat catalogue | Baseline attacker model | threat framing (superseded in practice by RFC 9700) |
| RFC 8628 | OAuth 2.0 Device Authorization Grant | Published RFC | Aug 2019 | `device_code`/`user_code` grant for input-constrained devices | OAuth on TVs/CLIs | `device.routes.ts`, `device.service.ts`; `docs/DEVICE-FLOW-TUTORIAL.md` |

## 3. PKCE & public clients (Module 03)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 7636 | Proof Key for Code Exchange by OAuth Public Clients | Published RFC | Sep 2015 | `code_challenge`/`code_verifier` (S256) | Closes authorization-code interception on public/native clients | `client/src/pkce.ts`; enforced by Authlete; `docs/PKCE-TUTORIAL.md` |
| RFC 8252 | OAuth 2.0 for Native Apps | Published RFC (**BCP 212**) | Oct 2017 | External user-agent requirement; three redirect strategies (private-use scheme, claimed `https`, loopback) | Credential capture by embedded webviews; redirect hijacking on mobile | `loopbackRedirectionUriVariable` flag (`AGENTS.md`); Module 03 |

## 4. Token lifecycle & metadata (Module 04)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 7662 | OAuth 2.0 Token Introspection | Published RFC | Oct 2015 | RS asks AS "is this token active?" | Validating opaque/reference tokens | `introspection.routes.ts`, `introspection.service.ts` |
| RFC 7009 | OAuth 2.0 Token Revocation | Published RFC | Aug 2013 | Client revokes an access/refresh token | Logout/compromise response | `revocation.routes.ts`, `revocation.service.ts` |
| RFC 8414 | OAuth 2.0 Authorization Server Metadata | Published RFC | Jun 2018 | `/.well-known/oauth-authorization-server` | Client auto-config | `oauth-as-metadata.routes.ts` (root); see path quirk below |
| RFC 9728 | OAuth 2.0 Protected Resource Metadata | Published RFC | Apr 2025 | `/.well-known/oauth-protected-resource` | RS advertises its AS(es)/scopes; MCP discovery | **Served** at true root — `protected-resource-metadata.routes.ts` + controller (added 2026-07-28); also consumed client-side (`mcp.service.ts`) |
| RFC 7591 | OAuth 2.0 Dynamic Client Registration Protocol | Published RFC | Jul 2015 | Programmatic client registration | Onboarding without console | `dcr.routes.ts` (`/api/client/dcr/register`), `dcr.service.ts` |
| RFC 7592 | OAuth 2.0 Dynamic Client Registration Management Protocol | Published RFC (**Experimental** — *not* Standards Track) | Jul 2015 | Read/update/delete a registration | Lifecycle of DCR clients | `dcr.routes.ts` (`get`/`update`/`delete`) |
| RFC 9068 | JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens | Published RFC | Oct 2021 | Structured `at+jwt` access tokens | Interop for self-contained ATs | JWT ATs via Authlete |
| RFC 8707 | Resource Indicators for OAuth 2.0 | Published RFC | Feb 2020 | `resource` parameter | Audience-restricting tokens per API | MCP `resource` (RFC 8707) in `mcp.service.ts`; Authlete |

> **DCR's two RFCs do not have the same status.** RFC 7591 (registration) is Standards Track; RFC 7592
> (the management lifecycle) is **Experimental**, and says so in its own header: *"not an Internet Standards
> Track specification."* This is not pedantry — it is why an authorization server may implement `register`
> and not `get`/`update`/`delete`, and why the registration access token is the least portable thing in the
> DCR story. Do not present the pair as equivalent in a review.

> **Discovery-path divergence — this deployment is non-conformant, and you should recognise why.**
> `/.well-known/openid-configuration` is served under the **`/api`** prefix here, while RFC 8414's
> `/.well-known/oauth-authorization-server` is at **true root**. That is not a free routing choice.
> **RFC 8414 §3**: an AS "**MUST** make a JSON document containing metadata … available at a path formed by
> **inserting a well-known URI string into the authorization server's issuer identifier** between the host
> component and the path component." **OIDC Discovery §4.1** requires the same issuer-derived construction,
> and **§4.3** adds that the returned `issuer` value "**MUST** be identical to the Issuer URL that was used
> as the prefix to `/.well-known/openid-configuration` to retrieve the configuration information."
>
> This deployment satisfies neither: discovery is retrievable only from `…/api/.well-known/openid-configuration`,
> and the document it returns declares an `issuer` on a *different host* again. A conforming client starting
> from the advertised issuer cannot discover this authorization server at all. **Labs must respect the
> `/api` path to work here; reviews must record it as a finding.** Both statements are true at once, and
> holding them together is the point.

## 5. Request integrity & token binding (Module 05)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 9126 | OAuth 2.0 Pushed Authorization Requests (PAR) | Published RFC | Sep 2021 | Client pushes the request; gets a `request_uri` | Front-channel tampering/leakage of params | `par.routes.ts`, `par.service.ts`; `docs/PAR-TUTORIAL.md` |
| RFC 9101 | The OAuth 2.0 Authorization Framework: JWT-Secured Authorization Request (JAR) | Published RFC | Aug 2021 | Signed `request`/`request_uri` object | Integrity/authenticity of the auth request | `jar.routes.ts`, `jar.service.ts` (no tutorial yet — Module 05 adds one) |
| RFC 9207 | OAuth 2.0 Authorization Server Issuer Identification | Published RFC | Mar 2022 | `iss` in the authorization response | Mix-up attacks (wrong-AS confusion) | Authlete `issSuppressed=false` (`AGENTS.md`) |
| RFC 8705 | OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens | Published RFC | Feb 2020 | `tls_client_auth`/`self_signed_tls_client_auth`; `cnf`/`x5t#S256` | Sender-constrained tokens via client cert | **THIN** — only registration flags today; Module 05/10 implements (gated) |
| RFC 9449 | OAuth 2.0 Demonstrating Proof of Possession (DPoP) | Published RFC | Sep 2023 | Per-request proof-of-possession JWT (`jkt`, `ath`, nonce) | Bearer-token theft/replay | `client/src/services/dpop.service.ts`, `server/src/utils/dpop.ts`; `docs/FAPI-TUTORIAL.md` |

## 6. Machine & delegated grants (Module 06)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 7521 | Assertion Framework for OAuth 2.0 Client Authentication and Authorization Grants | Published RFC | May 2015 | Generic assertion grant/auth framework | Basis for JWT/SAML bearer | conceptual; underpins RFC 7523 usage |
| RFC 7522 | SAML 2.0 Profile for OAuth 2.0 Client Authentication and Authorization Grants | Published RFC | May 2015 | SAML assertion → OAuth token | Enterprise SSO bridging | conceptual (not wired) |
| RFC 7523 | JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication and Authorization Grants | Published RFC | May 2015 | JWT bearer grant + `private_key_jwt` client auth | Keyed client auth; trust federation | `jwt-verification.service.ts`; token `JWT_BEARER`; `docs/JWT-BEARER-TUTORIAL.md` |
| RFC 8693 | OAuth 2.0 Token Exchange | Published RFC | Jan 2020 | `grant_type=token-exchange`; `actor_token`/`may_act` | Impersonation vs. delegation; identity chaining | token `TOKEN_EXCHANGE`; `docs/TOKEN-EXCHANGE-TUTORIAL.md` — **partial, see below** |

> **JARM correction (2026-07-28).** Two earlier claims in this file were wrong. (1) The **title** carried a
> "Financial-grade API:" prefix it no longer has, and no errata/date; it is *"JWT Secured Authorization Response
> Mode for OAuth 2.0 (JARM) incorporating errata set 1"*, Final, 17 August 2025. (2) It was listed as an
> implementation gap requiring code. On the **AS side it is a configuration gap**: requesting `response_mode=jwt`
> returns `[A012305] … the 'authorization_signed_response_alg' metadata of the client … is not set`, and the
> authorization server already builds and signs the response object. A **client** consuming JARM does need new
> code, and the dashboard SPA has none. Verified live during the Module 09a build.

> **RFC 8693 is only partly implemented here, and the gaps are silent.** Verified during the Module 06 build:
> `actor_token`, `resource`, `audience`, and `requested_token_type` are accepted and discarded, so a
> delegation request returns an impersonation token with **no `act`** and HTTP 200; the REQUIRED
> `issued_token_type` (§2.2.1) is absent from the success response; and an SDK response-schema mismatch makes
> the whole grant fail for any subject token that carries a scope. Do not read the table row above as "this
> works." Details and reproductions in
> [Module 06](modules/06-machine-and-delegated-grants/lab.md#exercise-6--ask-for-delegation-receive-impersonation)
> and in `PROGRESS.md`.

## 7. Consolidation — OAuth 2.1 & the Security BCP (Module 07)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 9700 | Best Current Practice for OAuth 2.0 Security (BCP 240) | Published RFC (BCP) | Jan 2025 | Consolidated, current attack catalogue + mitigations | Supersedes RFC 6819 in practice; mandates PKCE, exact redirect matching, no implicit/ROPC | attack catalogue mapped across Modules 02–06 |
| draft-ietf-oauth-v2-1 | The OAuth 2.1 Authorization Framework | **Active Internet-Draft** — `draft-ietf-oauth-v2-1-15`, dated **2 March 2026**, expires 3 September 2026 | consulted 2026-07-28 | Requires PKCE; does **not specify** implicit or ROPC; restricts redirect matching to exact strings (§1.8). §10 "Differences from OAuth 2.0" has only two subsections | Simplifies + hardens the baseline | — (not a normative target; taught as direction of travel) |

> **Title correction (2026-07-28):** the document's own title is *"The OAuth 2.1 Authorization Framework"* —
> not "The OAuth 2.0 Authorization Framework (OAuth 2.1)", as this row previously read. **Never cite this
> draft as normative**; cite RFC 9700 (BCP 240) for the requirement and mention OAuth 2.1 as direction of
> travel, always with the revision and the date consulted. Module 07 covers the discipline.

## 8. OpenID Connect core & logout (Module 08)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OIDC Core 1.0 | OpenID Connect Core 1.0 incorporating errata set 2 | OpenID Final (errata set 3 in draft) | errata set 2, Dec 2023 | ID token, `nonce`, UserInfo, hybrid flow, `acr`/`amr` | Authentication on top of OAuth | ID token/UserInfo/hybrid via Authlete; `userinfo.*` |
| OIDC Discovery 1.0 | OpenID Connect Discovery 1.0 incorporating errata set 2 | OpenID Final | errata set 2 | `/.well-known/openid-configuration` | OP metadata discovery | `discovery.routes.ts`, `discovery.service.ts` |
| OIDC RP-Initiated Logout 1.0 | OpenID Connect RP-Initiated Logout 1.0 | OpenID Final | **12 Sep 2022** | `end_session_endpoint` flow | RP-triggered logout | logout routes; `LogoutSection.tsx` |
| OIDC Front-Channel Logout 1.0 | OpenID Connect Front-Channel Logout 1.0 | OpenID Final | *(see note)* | iframe-based multi-RP logout | Browser-mediated logout | logout routes |
| OIDC Back-Channel Logout 1.0 | OpenID Connect Back-Channel Logout 1.0 **incorporating errata set 1** | OpenID Final | **15 Dec 2023** | Server-to-server logout token; `events` claim; `nonce` **MUST NOT** be present (§2.4) | Logout without the browser | `backchannel-logout.service.ts`; `docs/BACKCHANNEL-LOGOUT-TUTORIAL.md` |
| OIDC Session Management 1.0 | OpenID Connect Session Management 1.0 | OpenID Final | *(see note)* | RP polls OP session state | Session-change detection | conceptual |

> **Note on the two undated logout rows.** Front-Channel Logout 1.0 and Session Management 1.0 were confirmed
> **Final** via the OpenID Foundation specifications index rather than by fetching each document, so their
> publication dates are **not yet verified to this file's standard** and are marked *(see note)* rather than
> guessed. Everything else in this table has been fetched individually. If you need either date for a
> citation, fetch the document — do not copy a date from a secondary source.
>
> **Back-Channel Logout's exact title includes "incorporating errata set 1."** The errata suffix is part of
> the title, exactly as with JARM and OIDC Core, and dropping it is the same error this file corrected for
> JARM. Its §2.4 is also the source of a rule Module 08 leans on: *"A `nonce` Claim MUST NOT be present. Its
> use is prohibited to make a Logout Token syntactically invalid if used in a forged Authentication Response
> in place of an ID Token."*

## 9a. Interaction extensions (Module 09a)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| JARM | JWT Secured Authorization Response Mode for OAuth 2.0 (JARM) *incorporating errata set 1* | OpenID **Final** | errata set 1, **17 Aug 2025** | Signed/encrypted authorization **response** (`response_mode=jwt`); `iss`/`aud`/`exp` claims; four `response_mode` values | Response tampering, mix-up (strong form), response replay | **Supported by the AS; not configured.** Needs only the client's `authorization_signed_response_alg`. No `server/src` change — see note below |
| CIBA Core 1.0 | OpenID Connect Client-Initiated Backchannel Authentication Flow – Core 1.0 | OpenID Final | Sep 2021 | Decoupled auth (poll/ping/push), `auth_req_id` | Auth without a browser redirect | `ciba.routes.ts`, `ciba.service.ts`; `docs/CIBA-TUTORIAL.md` |
| Native SSO 1.0 | OpenID Connect Native SSO for Mobile Apps 1.0 | OpenID **2nd Implementer's Draft** (draft 07) | approved 2025-10-17 | `device_secret`, `urn:openid:params:grant-type:device_secret` | SSO across native apps on one device | `docs/NATIVE-SSO-TUTORIAL.md`; Authlete |
| RFC 9470 | OAuth 2.0 Step Up Authentication Challenge Protocol | Published RFC | Sep 2023 | `acr_values`/`max_age` challenge; `insufficient_user_authentication` | Force stronger auth for sensitive ops | `session.controller.ts`, `introspection.controller.ts`; `docs/STEP-UP-AUTH-TUTORIAL.md` |
| RFC 9396 | OAuth 2.0 Rich Authorization Requests (RAR) | Published RFC | May 2023 | `authorization_details` (typed, fine-grained) | Beyond coarse `scope` | `rar` section; Authlete; `docs/RAR-TUTORIAL.md` |

## 9b. Identity & verifiable credentials (Module 09b)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OIDC Identity Assurance 1.0 | OpenID Connect for Identity Assurance 1.0 | OpenID Final | **1 Oct 2024** (errata set 1 revision dated **1 Jul 2026**) | `verified_claims` = `verification` + `claims`; trust frameworks, evidence | Provenance for identity claims — *accountability, not cryptography* | conceptual (09b) |
| **OpenID Federation 1.1** | OpenID Federation 1.1 | OpenID **Final** | **5 May 2026** | Entity statements, trust chains, `authority_hints`, metadata policy — consolidates the protocol-independent half of 1.0 | Multilateral federation at scale (replaces bilateral registration) | `federation.routes.ts`, `federation.service.ts` — **configuration endpoint is broken**, see Module 09b |
| OpenID Federation 1.0 | OpenID Federation 1.0 | OpenID Final — **superseded by 1.1** | 17 Feb 2026 | *(predecessor)* | — | cite 1.1 unless an ecosystem pins 1.0 |
| RFC 9901 | Selective Disclosure for JSON Web Tokens | Published RFC (Std Track) | Nov 2025 | Salted-digest selective disclosure; `_sd`, `_sd_alg`, Disclosures, KB-JWT | Minimal disclosure; a signature that survives claim removal | **not in `server/`** — taught locally via `scripts/sd-jwt.mjs` (09b) |
| draft-ietf-oauth-sd-jwt-vc | SD-JWT-based Verifiable Digital Credentials (SD-JWT VC) | **Active Internet-Draft** (‑17, dated 6 Jul 2026; expires 7 Jan 2027) | consulted 2026-07-28 | `vct` claim; media type `application/dc+sd-jwt` (was `vc+sd-jwt`) | Type semantics on top of RFC 9901 | conceptual (09b) |
| OID4VCI 1.0 | OpenID for Verifiable Credential Issuance 1.0 | OpenID Final | **16 Sep 2025** | Credential offer, pre-authorized code grant, `tx_code`, credential endpoint | Issuing VCs into a wallet | `vci.routes.ts`; `.well-known/openid-credential-issuer`; `VciSection.tsx` — **enabled on this service since 2026-08-14** (DR-03); the metadata document is conformant, but the credential issuer has no JWK Set, so `/vci/jwks` and `/vci/jwtissuer` still fail |
| OID4VP 1.0 | OpenID for Verifiable Presentations 1.0 | OpenID Final | **9 Jul 2025** | `dcql_query`, REQUIRED fresh `nonce`, `vp_token`, `direct_post` | Presenting VCs; supplies the `nonce`/`aud` that RFC 9901 key binding consumes | conceptual (09b) |

## 10. FAPI & grant management (Module 10)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| FAPI 1.0 Part 1 | Financial-grade API Security Profile 1.0 - Part 1: Baseline | OpenID Final | **12 Mar 2021** | Baseline read-access hardening profile | Interop security floor | `docs/FAPI-TUTORIAL.md` |
| FAPI 1.0 Part 2 | Financial-grade API Security Profile 1.0 - Part 2: Advanced | OpenID Final | **12 Mar 2021** | JAR + JARM + `s_hash` + MTLS; hybrid flow | Write-access, high-value APIs | `docs/FAPI-TUTORIAL.md` |
| FAPI 2.0 Security Profile | FAPI 2.0 Security Profile | OpenID Final | **22 Feb 2025** | Mandatory PAR + PKCE S256 + sender-constraining + `iss`; *"shall not use refresh token rotation **except in extraordinary circumstances**"* (§5.3.2.1); `code` only | High-assurance baseline, derived from an attacker model rather than a threat list | FAPI 2.0/DPoP section; `docs/FAPI-TUTORIAL.md`. **Current URL: `openid.net/specs/fapi-security-profile-2_0.html`** |
| FAPI 2.0 Attacker Model | FAPI 2.0 Attacker Model | OpenID Final | **22 Feb 2025** | Six attackers (A1, A1a, A2, A3a, A4, A5), three security goals, explicit exclusions | Makes the security claim falsifiable | threat model (Module 10). **⚠ `fapi-2_0-attacker-model.html` still serves a superseded Dec 2022 draft whose numbering differs (A5/A7 → A4/A5); the Final is at `fapi-attacker-model-2_0.html`** |
| FAPI 2.0 Message Signing | FAPI 2.0 Message Signing | OpenID Final | **25 Sep 2025** | Non-repudiation via JAR + JARM + signed introspection | Provable "who sent what", when a dispute must be settled | uses JAR + JARM + introspection |
| Grant Management | Grant Management for OAuth 2.0 **(Draft)** | **Active Internet-Draft** (`oauth-v2-grant-management-03`; intended status Standards Track, FAPI WG) | **9 May 2023** | `grant_id`, `grant_management_action` (`create`/`merge`/`replace`), query/revoke API, two scopes | Managing long-lived consent; concurrent grants | `grant-management.routes.ts`; `docs/GRANT-MANAGEMENT.md` — **verified working end to end** (Module 10) |

## 11. API security beyond the token (Module 11)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OWASP API Security Top 10 | OWASP API Security Top 10 – 2023 edition | Community standard (current edition; the 2019 edition differs — cite the year) | 2023 | Ranked API risk catalogue. **API1 Broken Object Level Authorization**, API2 Broken Authentication, **API3 Broken Object Property Level Authorization**, API4 Unrestricted Resource Consumption, **API5 Broken Function Level Authorization**, API6 Unrestricted Access to Sensitive Business Flows, API7 SSRF, API8 Security Misconfiguration, API9 Improper Inventory Management, API10 Unsafe Consumption of APIs | The authorization defects a valid token cannot stop — **three of the top five**, none addressed by OAuth | Verified live in Module 11 against `/api/gm/:grantId` (API1) and `/api/client/*` (API5+API8); detection side in `docs/MONITORING.md`, `audit-log.ts`, `rate-limit.ts` |

---

## Not-yet-in-repo (gaps this curriculum addresses)

| Capability | Spec | Reality here | Plan |
|---|---|---|---|
| JARM | JARM (OpenID Final, errata set 1) | **AS side: supported, unconfigured** (one client metadata field). Client side: absent — the SPA cannot consume a `response` JWT | **Configure** on the AS (no code); a client-side consumer remains a genuine gap |
| mTLS / cert-bound tokens | RFC 8705 | Thin — registration flags only | ❌ **Declined 2026-07-28** — TLS is terminated by the platform in every deployment of this repo, so a client certificate can never reach Node. Taught from the spec in Modules 05/10, labelled not-run-here. See the decision record in Module 05 |
| Protected Resource Metadata endpoint | RFC 9728 | ✅ **Now served** at true root | Implemented 2026-07-28; Module 04's proposal is closed |
| Dedicated resource server endpoint | RFC 6750 | None; use UserInfo + Introspection as RS stand-ins | Teach with existing endpoints |
| SD-JWT | RFC 9901 | Absent from `server/` and `client/` — and does not need to be there; it is pure JOSE | **Taught locally** with `scripts/sd-jwt.mjs` (issue / present / verify + §7.1 trace). No source change proposed |
| OID4VCI | OID4VCI 1.0 | Nine endpoints exist and delegate to Authlete. **Verifiable credentials were enabled 2026-08-14 (DR-03).** `/vci/metadata` returns a conformant §12.2.4 document and `offer/create` answers `A366001 CREATED`; `/vci/jwks` and `/vci/jwtissuer` still fail with `A403201` / `A417202` because the credential issuer has no JWK Set. The pre-DR-03 refusals were `A364301`, `A416301`, `A402301`, `A366201` — all `NOT_FOUND`/`FORBIDDEN`, i.e. *"the feature is off"*, a different diagnosis from today's | Module 09b now verifies the metadata document, both remaining refusals, and that the deferred path validates its access token (`A375304`). Issuing a credential still needs a credential-issuer JWK Set |
| OpenID Federation entity configuration | OpenID Federation **1.1** §9 *("Obtaining Federation Entity Configuration Information" — same number in 1.0)* | Endpoint exists at the correct well-known path but is **broken** — the SDK call omits the request body | Diagnosed as Module 09b's Tier-3 finding; **not fixed** (server source) |
| OID4VP | OID4VP 1.0 | No verifier implementation | Taught from the spec; the key-binding half is exercised locally via `sd-jwt.mjs` |

**§10 corrections, 2026-07-28.** Three errors were found and fixed while writing Module 10: FAPI 2.0 Message
Signing was dated "approved 2025-07-29" and is in fact **published 25 Sep 2025**; the FAPI 1.0 Parts had no
dates and are both **12 Mar 2021**; and Grant Management was labelled an "OpenID 2nd Implementer's Draft",
which **the document header does not support** — it identifies itself as Internet-Draft
`oauth-v2-grant-management-03` and its own title ends in *"(Draft)"*. Also note the FAPI 2.0 URLs moved
(`fapi-2_0-*` → `fapi-*-2_0`), and the old attacker-model URL still serves a superseded draft with **different
attacker numbering** — see the row above.

### Corrections, 2026-08-02 (independent audit pass)

Four status errors were found by an external review and are fixed above. All four are the same *class* —
a row that was correct when written and went stale, or a status label that was more confident than the
source supported — which is why the verification note now carries a **re-check date** rather than a
one-time "verified" stamp.

| Was | Now | Why it mattered |
|---|---|---|
| RFC 8446 listed as the current TLS 1.3 spec | **RFC 9846** (Jul 2026) is current; 8446 marked obsoleted | The inventory promises to flag obsolescence, and this is exactly the field the *published* RFC text cannot tell you |
| RFC 7592 labelled "Published RFC" (= Standards Track by this file's own legend) | **Experimental**, and the legend now names Experimental explicitly | Experimental is why AS support for the DCR management lifecycle is uneven — a real interop fact, not a formality |
| OpenID Federation **1.0** presented as current | **1.1** (5 May 2026) is the Final; 1.0 marked superseded | Module 09b teaches federation from this row |
| Federation 1.1 described as "of the same date" as 1.0 | 1.0 = 17 Feb 2026, **1.1 = 5 May 2026** | The claim that they share a date is what made "either is fine" look safe |
| Discovery `/api` prefix called a "path quirk" | Labelled a **non-conformance** against RFC 8414 §3 and OIDC Discovery §4.1/§4.3 | A learner told it was a free routing choice would reproduce it |
| **RFC 8725 (BCP 225) absent entirely** | Added to §1, and noted on the RFC 7519 row it updates | Modules 00/06/08 teach its content as reasoned practice with no citable BCP behind it |
| RFC 7518 carried no update note | **Updated by RFC 9864** (Oct 2025), with a note that the `ES256` deprecation is **COSE-only** and changes nothing here | Completeness — deliberately annotated *without* overstating the impact |
| FAPI 2.0 row read "**forbids** refresh-token rotation" | Quotes the actual §5.3.2.1 text, including *"except in extraordinary circumstances"* | The carve-out exists and is operationally real (infrastructure migration) |
| Four logout rows had no dates; Back-Channel Logout's title dropped its errata suffix | RP-Initiated dated **12 Sep 2022**; Back-Channel **15 Dec 2023** and retitled *"incorporating errata set 1"*; the two unverified rows marked *(see note)* rather than guessed | Same errata-suffix precision this file already applies to JARM and OIDC Core |

_Rows verified against primary sources on 2026-07-27; §9b re-verified 2026-07-28; **full re-verification of
every identifier on 2026-08-02**, when the corrections above were applied. The 2026-08-02 pass fetched every
IETF identifier from `datatracker.ietf.org` (not the rendered RFC text — see the TLS note in §0 for why) and
every OpenID specification from `openid.net`, and found no further status errors._

> **Two traps this file has now been bitten by twice — check both before citing an OpenID spec.**
> **(1) `-final.html` is not always current.** JARM's `oauth-v2-jarm-final.html` serves the **Nov 2022**
> Final, while `oauth-v2-jarm.html` serves *"incorporating errata set 1"*, **17 Aug 2025**. Identity
> Assurance behaves the same way (`-final` = 1 Oct 2024; the errata-set-1 revision of 1 Jul 2026 is at the
> unsuffixed URL). Fetch both and take the later.
> **(2) A document's own date is not its approval date.** Native SSO's text is dated 16 Jan 2025; the
> **2nd Implementer's Draft was approved 2025-10-17**. Cite the approval for status, the header for content.
>
> Report any drift you find while working through the modules — a wrong citation here propagates into every
> module that cites it._
