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
- **Provenance:** rows touched on **2026-08-14** additionally record *the URL fetched and the header line it
  said* — see **Provenance** at the end of this file. A status or date that cannot be traced to a fetched
  header is the one defect this file exists to prevent, and it has been committed here twice.
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
| RFC 7518 | JSON Web Algorithms (JWA) | Published RFC — **updated by RFC 9864** (Dec 2025) | May 2015 | `alg`/`enc` registry (ES256, RS256, …) | Names the algorithms JWS/JWE use | DPoP ES256 (`dpop.service.ts`) |
| RFC 7519 | JSON Web Token (JWT) | Published RFC — **updated by RFC 8725** (BCP 225) | May 2015 | Claims container + registered claims | `iss/sub/aud/exp/iat/nbf` semantics | ID tokens, JWT ATs, assertions |
| **RFC 8725** | JSON Web Token Best Current Practices | Published RFC (**BCP 225**, updates RFC 7519) | Feb 2020 | The normative countermeasures: §2.1 explicit typing, §3.1 *"Perform Algorithm Verification"*, §3.2 *"Use Appropriate Algorithms"*, §3.8 substitution attacks | Turns "pin the algorithm, never trust the header" from folklore into a citable requirement | Module 00's threat notes; Module 08 step 7; Module 06's `kid`/`jku` exercise |
| RFC 7638 | JSON Web Key (JWK) Thumbprint | Published RFC | Sep 2015 | Canonical hash of a JWK | DPoP `jkt` binding; key IDs | DPoP proof binding (RFC 9449) |
| **RFC 9864** | Fully-Specified Algorithms for JSON Object Signing and Encryption (JOSE) and CBOR Object Signing and Encryption (COSE) | Published RFC (Proposed Standard) — **updates RFC 7518, 8037, 9053** | **Dec 2025** | Algorithm identifiers that name *every* parameter, rather than leaving the curve to be negotiated | Removes the ambiguity in polymorphic identifiers like `ECDH-ES` | Nothing yet — see the note below |

> **RFC 8725 is the one to reach for in a review.** Modules 00, 06 and 08 all teach its content — reject
> `alg: none`, pin the algorithm from configuration rather than reading it from the header, never resolve a
> key from an attacker-controlled `kid`/`jku` — but a BCP number is what ends an argument with an architect
> who wants to "just use the library default." Cite **RFC 8725 §3.1** for algorithm verification and **§3.2**
> for algorithm choice.
>
> **RFC 9864 barely matters here, and it is worth knowing why.** It updates RFC 7518, **RFC 8037 and RFC
> 9053** with *fully-specified* algorithm identifiers and deprecates `ES256` — **in COSE registries only**.
> JOSE's `ES256` is unaffected, and RFC 9864 explicitly declines to register fully-specified RSA variants.
> Nothing in this curriculum's `ES256`/`RS256` usage changes, and **`alg: "none"` is not polymorphic**, so
> Module 00's citation of RFC 7518 §3.6 stands. It now has a row of its own because it updates three RFCs
> rather than one. **The row is annotated because the inventory promises to track updates, not because you
> need to act** — which is the honest reason to carry a row, and the reason to say so on it.
>
> **Its date was wrong here until 2026-08-14** — recorded as Oct 2025 against a verified **December 2025** —
> and so was its scope, given as RFC 7518 alone. Both were corrected from the header block of
> `https://www.rfc-editor.org/info/rfc9864`, fetched 2026-08-11. A date carried from recall in the file whose
> job is citation provenance is the defect this file exists to prevent.

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
| **RFC 9701** | JSON Web Token (JWT) Response for OAuth Token Introspection | Published RFC (Proposed Standard) | **Jan 2025** | The introspection response as a **signed JWT**, requested with `Accept: application/token-introspection+jwt` | Non-repudiable introspection — the RS can prove later what the AS said about a token. The signed-introspection leg of FAPI 2.0 Message Signing | **Live** — `introspection-standard.controller.ts` (`case "JWT"`), `introspection.service.ts` (forwards `httpAcceptHeader`). See the note below |
| RFC 7009 | OAuth 2.0 Token Revocation | Published RFC | Aug 2013 | Client revokes an access/refresh token | Logout/compromise response | `revocation.routes.ts`, `revocation.service.ts` |
| RFC 8414 | OAuth 2.0 Authorization Server Metadata | Published RFC | Jun 2018 | `/.well-known/oauth-authorization-server` | Client auto-config | `oauth-as-metadata.routes.ts` (root); see path quirk below |
| RFC 9728 | OAuth 2.0 Protected Resource Metadata | Published RFC | Apr 2025 | `/.well-known/oauth-protected-resource` | RS advertises its AS(es)/scopes; MCP discovery | **Served** at true root — `protected-resource-metadata.routes.ts` + controller (added 2026-07-28); also consumed client-side (`mcp.service.ts`) |
| RFC 7591 | OAuth 2.0 Dynamic Client Registration Protocol | Published RFC | Jul 2015 | Programmatic client registration | Onboarding without console | `dcr.routes.ts` (`/api/client/dcr/register`), `dcr.service.ts` |
| RFC 7592 | OAuth 2.0 Dynamic Client Registration Management Protocol | Published RFC (**Experimental** — *not* Standards Track) | Jul 2015 | Read/update/delete a registration | Lifecycle of DCR clients | `dcr.routes.ts` — **Authlete's management APIs are wired; RFC 7592's HTTP surface is not served.** See the note below |
| RFC 9068 | JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens | Published RFC | Oct 2021 | Structured `at+jwt` access tokens | Interop for self-contained ATs | JWT ATs via Authlete |
| RFC 8707 | Resource Indicators for OAuth 2.0 | Published RFC | Feb 2020 | `resource` parameter | Audience-restricting tokens per API | MCP `resource` (RFC 8707) in `mcp.service.ts`; Authlete |
| draft-ietf-oauth-client-id-metadata-document | OAuth Client ID Metadata Document (CIMD) | **Active Internet-Draft** — revision **‑02**, dated **6 Jul 2026**, expires 7 Jan 2027 | consulted **2026-08-14** | An HTTPS URL as `client_id`; the AS fetches client metadata from that URL | Client identification with no prior registration — the mechanism MCP clients rely on | **Enabled on this service since 2026-08-14** (DR-05). Authlete performs the fetch entirely server-side; no endpoint or client code here. Reported by `fapi.controller.ts` as `cimdSupported` |

> **RFC 9701 is reachable here, and the parameter that makes it reachable is not in the RFC.** Sending
> `Accept: application/token-introspection+jwt` to `/api/introspection/standard` returns a signed JWT — verified live
> 2026-08-13: `typ: token-introspection+jwt`, `alg: RS256`, `kid: rsa-1`, claims `iss`, `aud`, `iat`,
> `token_introspection`. **Authlete additionally requires `rsUri` in the request body**, without which it
> answers `[A404301]`. That 400 is passed through deliberately: `rsUri` becomes the `aud` naming the calling
> resource server, and this server has no honest way to guess it. Nor may it be sent unconditionally — a
> present `rsUri` outside a token's audience values makes Authlete report `active: false`. **A vendor
> requirement, not a normative one**, which is exactly the gap `CLAUDE.md` asks to be kept visible.
>
> **CIMD is cited at two different revisions by two different documents, and that is worth knowing before you
> read either.** The row above is the IETF draft at **‑02**. The **MCP specification cites `-00`**, and
> Authlete's support carries a **3.0.22 patch-level floor**. So "CIMD is supported" is three claims about
> three different things — the draft revision, the profile's pinned revision, and the vendor's implementation
> level — and they are not interchangeable. Draft-02 also **forbids following redirects** when fetching the
> document; Authlete performs that fetch, so this deployment cannot verify the rule is honoured. Same
> delegation as RFC 9449 §7.2 (`AGENTS.md`).

> **DCR's two RFCs do not have the same status.** RFC 7591 (registration) is Standards Track; RFC 7592
> (the management lifecycle) is **Experimental**, and says so in its own header: *"not an Internet Standards
> Track specification."* This is not pedantry — it is why an authorization server may implement `register`
> and not `get`/`update`/`delete`, and why the registration access token is the least portable thing in the
> DCR story. Do not present the pair as equivalent in a review.
>
> **And this deployment implements the *capability* without serving the *protocol*** (7592-W3, stated
> 2026-08-14). RFC 7592 defines a **client configuration endpoint**: one URL per registration, addressed with
> `GET`, `PUT` and `DELETE`, authorized by the `registration_access_token` as a Bearer token, and discoverable
> as `registration_client_uri` in the registration response. What this repo serves instead is **four `POST`
> routes** — `/api/client/dcr/{register,get,update,delete}` — taking the registration access token in a JSON
> body. Every RFC 7592 *operation* is reachable; **none of RFC 7592's HTTP surface is**, so a conformant DCR
> client cannot manage its own registration here even though the underlying Authlete APIs are wired.
>
> Note this is the same shape as theme 3's wire-format findings and **not** the same thing as the RFC 7591
> half, which *was* fixed: since 2026-08-14 `register` returns §3.2.1's registration response as the body
> rather than nested inside a vendor envelope. **The body is conformant; the endpoint is not.** Keeping those
> two claims apart is the whole reason this row now says both.

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
| draft-ietf-oauth-attestation-based-client-auth | OAuth 2.0 Attestation-Based Client Authentication | **Active Internet-Draft** — revision **‑10**, dated **6 Jul 2026**, expires 7 Jan 2027; intended status Standards Track | consulted **2026-08-14** | `OAuth-Client-Attestation` + `-PoP` headers carrying a key-bound attestation | Client authentication for app instances that cannot hold a registered secret | **Withdrawn here, deliberately** — `ATTEST_JWT_CLIENT_AUTH` was removed from the service 2026-08-12 (DR-07) and no `challenge_endpoint` is advertised. The SDK cites this draft on `TokenRequest` and `PushedAuthorizationRequest` |

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
| OIDC Front-Channel Logout 1.0 | OpenID Connect Front-Channel Logout 1.0 | OpenID Final | **12 Sep 2022** | `frontchannel_logout_uri` rendered in an `<iframe>` per RP, so each RP clears its own login state | Browser-mediated multi-RP logout without an OP iframe on every RP page | **Not implemented** — `frontchannel_logout_supported` is ABSENT and no `frontchannel*` symbol exists in `server/src`. Declined, DR-08 |
| OIDC Back-Channel Logout 1.0 | OpenID Connect Back-Channel Logout 1.0 **incorporating errata set 1** | OpenID Final | **15 Dec 2023** | Server-to-server logout token; `events` claim; `nonce` **MUST NOT** be present (§2.4) | Logout without the browser | `backchannel-logout.service.ts`; `docs/BACKCHANNEL-LOGOUT-TUTORIAL.md` |
| OIDC Session Management 1.0 | OpenID Connect Session Management 1.0 | OpenID Final | **12 Sep 2022** | `check_session_iframe` — the RP polls the OP's session state through the browser, with no repeated authentication request | Detecting that the End-User's OP session ended without asking the OP on every page view | **Not implemented** — `check_session_iframe` is ABSENT. Declined, DR-08 |

> **The two undated logout rows are dated, and the answer was the same date for both** (2026-08-14). Both
> documents were fetched individually — see the provenance table at the end of this file — and both are
> **Final, 12 September 2022**, the same day as RP-Initiated Logout. So all three OIDC logout specifications
> published together, which is worth knowing: they were designed as one family covering the three channels
> (redirect, iframe, back-channel), and treating them as independently-versioned documents is what made the
> missing dates look unremarkable for as long as they did.
>
> **Both rows now read *"not implemented"* rather than *"logout routes"*, and that was a second defect hiding
> under the first.** The implementation column pointed at this repo's logout routes for a specification whose
> mechanism this repo does not serve — `frontchannel_logout_supported` and `check_session_iframe` are both
> ABSENT from the discovery document. A row that is undated *and* claims an implementation reads as a
> supported feature nobody got round to citing; it was neither. Declined together in **DR-08**, because both
> are blocked on the same missing thing — **durable OP session identity** — as are back-channel logout's `sid`
> mode and Native SSO's `sid`. Build it for any one and all four reopen.
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
| Native SSO 1.0 | OpenID Connect Native SSO for Mobile Apps 1.0 | OpenID **2nd Implementer's Draft** (draft 07, text dated 16 Jan 2025) | approved 2025-10-17 | `device_secret`, `urn:openid:params:grant-type:device_secret` | SSO across native apps on one device | `docs/NATIVE-SSO-TUTORIAL.md`; Authlete |
| RFC 9470 | OAuth 2.0 Step Up Authentication Challenge Protocol | Published RFC | Sep 2023 | `acr_values`/`max_age` challenge; `insufficient_user_authentication` | Force stronger auth for sensitive ops | `session.controller.ts`, `introspection.controller.ts`; `docs/STEP-UP-AUTH-TUTORIAL.md` |
| RFC 9396 | OAuth 2.0 Rich Authorization Requests (RAR) | Published RFC | May 2023 | `authorization_details` (typed, fine-grained) | Beyond coarse `scope` | `rar` section; Authlete; `docs/RAR-TUTORIAL.md` |

## 9b. Identity & verifiable credentials (Module 09b)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OIDC Identity Assurance 1.0 | OpenID Connect for Identity Assurance 1.0 | OpenID Final | **1 Oct 2024** (errata set 1 revision dated **1 Jul 2026**) | `verified_claims` = `verification` + `claims`; trust frameworks, evidence | Provenance for identity claims — *accountability, not cryptography* | conceptual (09b) |
| **OpenID Federation 1.1** | OpenID Federation 1.1 | OpenID **Final** | **5 May 2026** | The **protocol-independent** half: entity statements, trust chains, `authority_hints`, metadata policy, trust marks, federation endpoints | Multilateral federation at scale (replaces bilateral registration) | `federation.routes.ts`, `federation.service.ts` — the **entity configuration endpoint** is this document's §9. Blocked on a federation JWK Set, see Module 09b |
| **OpenID Federation for OpenID Connect 1.1** | OpenID Federation for OpenID Connect 1.1 | OpenID Final (Standards Track) | **5 May 2026** | The **protocol-specific** half: entity type identifiers, RP/OP/AS metadata, Automatic and Explicit Registration, federation client authentication | The OIDC/OAuth application layer on top of the federation foundation | `POST /api/federation/registration` (Explicit Registration) is **this** document's, not 1.1's |
| OpenID Federation 1.0 | OpenID Federation 1.0 | OpenID Final — **split into the two 1.1 documents above** | 17 Feb 2026 | *(predecessor — contained both halves)* | — | see the note below before citing "1.1" |
| RFC 9901 | Selective Disclosure for JSON Web Tokens | Published RFC (Proposed Standard) | **Nov 2025** | Salted-digest selective disclosure; `_sd`, `_sd_alg`, Disclosures, KB-JWT | Minimal disclosure; a signature that survives claim removal | **No AS obligations at all** — RFC 9901's roles are Issuer, Holder and Verifier, and an authorization server is none of them unless it issues credentials under OID4VCI. Not absent from `server/`; *inapplicable* to it. Taught locally via `scripts/sd-jwt.mjs` (09b) |
| draft-ietf-oauth-sd-jwt-vc | SD-JWT-based Verifiable Digital Credentials (SD-JWT VC) | **Active Internet-Draft** (‑17, dated 6 Jul 2026; expires 7 Jan 2027) | consulted 2026-07-28 | `vct` claim; media type `application/dc+sd-jwt` (was `vc+sd-jwt`) | Type semantics on top of RFC 9901 | conceptual (09b) |
| OID4VCI 1.0 | OpenID for Verifiable Credential Issuance 1.0 | OpenID Final | **16 Sep 2025** | Credential offer, pre-authorized code grant, `tx_code`, credential endpoint | Issuing VCs into a wallet | `vci.routes.ts`; `.well-known/openid-credential-issuer`; `VciSection.tsx` — **enabled on this service since 2026-08-14** (DR-03); the metadata document is conformant, but the credential issuer has no JWK Set, so `/vci/jwks` and `/vci/jwtissuer` still fail |
| OID4VP 1.0 | OpenID for Verifiable Presentations 1.0 | OpenID Final | **9 Jul 2025** | `dcql_query`, REQUIRED fresh `nonce`, `vp_token`, `direct_post` | Presenting VCs; supplies the `nonce`/`aud` that RFC 9901 key binding consumes | **No AS obligations at all** — the protocol's parties are the **Wallet** and the **Verifier** (an OAuth *client*), with the Credential Issuer appearing only as whoever issued the credential being shown. This component is none of them. Not unbuilt; *inapplicable* (DR-13). Conceptual, 09b |

> ### "Superseded by 1.1" was too simple, and citing 1.1 alone will send a reader to the wrong document
>
> **Corrected 2026-08-14 (FED-W3).** This file used to carry one 1.1 row and mark 1.0 *"superseded by 1.1 —
> cite 1.1 unless an ecosystem pins 1.0."* The version and date were right. **The relationship was not.**
>
> On 5 May 2026 the OpenID Foundation published **two** Final documents, and between them they replace 1.0:
> **OpenID Federation 1.1** (protocol-independent) and **OpenID Federation for OpenID Connect 1.1**
> (protocol-specific). Both say, in their own abstracts, that they *"introduce no new functionality not
> present in OpenID Federation 1.0"* — so **1.1 is a split, not an upgrade**. Nothing changed except which
> document a requirement lives in.
>
> **That is precisely why the shorthand is dangerous.** This repo has two federation surfaces and they now sit
> in *different documents*: the entity configuration endpoint is **1.1 §9**, while Explicit Registration —
> `POST /api/federation/registration` — is in **Federation for OpenID Connect 1.1**. A reviewer told to
> "cite 1.1" for a registration requirement would search a document that does not contain it, find nothing,
> and reasonably conclude the requirement was dropped. **When a specification splits, "superseded by" stops
> being a usable summary**; name the half.

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
| OID4VCI | OID4VCI 1.0 | Nine endpoints exist and delegate to Authlete. **Verifiable credentials were enabled 2026-08-14 (DR-03) and a credential-issuer JWK Set was set the same day (VCI-W6).** `/vci/metadata` returns a conformant §12.2.4 document, `offer/create` answers `A366001 CREATED`, and `/vci/jwks` + `/vci/jwtissuer` now answer **200** — publishing the **public half only**, `d` absent, verified rather than assumed. **These three endpoints have given three different answers in three days**: `A364301`/`A416301`/`A402301` (`NOT_FOUND` — feature off) → `A403201`/`A417202` (`INTERNAL_SERVER_ERROR` — on, no key) → `200`. Each transition named a different missing value, which is the argument for reading vendor codes rather than statuses | Module 09b verifies the metadata document, all three states, that `/vci/jwks` leaks no private key member, and that the deferred path validates its access token (`A375304`). **Issuance itself still needs a wallet this repo does not contain** — no longer a configuration gap |
| OpenID Federation entity configuration | OpenID Federation **1.1** §9 *("Obtaining Federation Entity Configuration Information" — same number in 1.0; protocol-independent, so this half is genuinely 1.1's)* | Endpoint exists at the correct well-known path. The SDK call no longer omits the request body (T1-16), so the failure is now honest: Authlete answers `[A316201]` because the service has **no federation JWK Set** | **Blocked on a configuration decision**, not on code — see FED-W2 |
| OID4VP | OID4VP 1.0 | **Not a gap.** The roles are Wallet and Verifier; an AS is neither, so there is nothing here to build | Taught from the spec; the key-binding half is exercised locally via `sd-jwt.mjs` |

## Vendor features — implemented here, defined by no specification

**These three are Authlete features, and this table would be dishonest without them.** Every other row above
names a specification; these name a *vendor*. They are included because the repo implements them, a reader will
meet them, and **the most useful thing to know about each is that there is no RFC to check it against** — no
interoperability guarantee, no second implementation, and no normative text to appeal to in a review.

| Capability | Defined by | Reality here | Where |
|---|---|---|---|
| **Hardware Security Keys (HSK)** | Authlete only | Four admin endpoints wrapping `hardwareSecurityKeys.*`. Nothing else in the repo consumes a handle. `DELETE` destroys the handle **on the service** | `docs/API.md` → *Hardware Security Keys*; the key/`kid` concepts are Modules 00 and 05 |
| **Parameterized scopes** | Authlete only | A `regex` attribute on a *scope* turns it into a pattern (`payment:123.50` matching `payment:.*`); the granted value returns in a **`dynamicScopes`** response field. **Not reachable through this server** — there is no scope-management endpoint, so scopes are console-only | Module 04's note; `PARAMETERIZED-SCOPES.md` |
| **Scope & client `attributes`** | Authlete only | Key/value pairs on scopes and clients. **The namespace is not inert**: `regex` makes a parameterized scope and `fapi2=sp` makes Authlete enforce FAPI per request. Client `attributes` are validated rather than cast since 2026-08-14 | `docs/API.md` → *The `attributes` field* |

> ### The one that is worth a paragraph: parameterized scopes are *"accepted but unadvertisable"*
>
> A parameterized scope is the **inverse** of the *advertised but unusable* pattern this audit found four times.
> Authlete will accept `payment:123.50` against a registered `payment:.*` — the feature works — but
> `scopes_supported` in the discovery document can only list **literal** scope strings. There is no metadata
> member for a pattern. So a client that discovers this AS correctly, reads `scopes_supported`, and requests
> only what it finds there **can never use the feature**, and a client that hardcodes `payment:123.50` works.
>
> **That inverts the usual advice.** Everywhere else in this curriculum, discovery is the trustworthy source and
> hardcoding is the mistake. Here, conforming to discovery is what loses you the capability — which is why
> Module 09a's taxonomy needed a fourth term rather than a footnote.

---

## Provenance — the URL fetched and the header line it said

**Added 2026-08-14 (FED-W4).** Every row below was changed or created in one pass, and each records **the URL
actually fetched and what its header block said**. This exists because the audit found that *"where a status,
date or version was taken from recall or from a sibling document rather than a fetched header, it was
wrong"* — Native SSO's date, Federation's version, CIMD's revision, an absent attestation row, and, in this
very file, RFC 9864's date and scope. **A citation you cannot trace is a citation you cannot check.**

| Row | URL fetched | Header line read | Outcome |
|---|---|---|---|
| RFC 9701 | `rfc-editor.org/info/rfc9701` | *"JSON Web Token (JWT) Response for OAuth Token Introspection"*, Proposed Standard, **January 2025** | **New row.** No obsoletes/updates |
| RFC 9901 | `datatracker.ietf.org/doc/rfc9901/` | *"Selective Disclosure for JSON Web Tokens"*, **RFC – Proposed Standard (November 2025)**, IETF stream | Date **confirmed**; "Std Track" sharpened to Proposed Standard |
| CIMD | `datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/` | *"OAuth Client ID Metadata Document"*, Active Internet-Draft, revision **02**, **6 July 2026**, expires 7 Jan 2027 | **New row.** Revision matched the criterion |
| Attestation-based client auth | `datatracker.ietf.org/doc/draft-ietf-oauth-attestation-based-client-auth/` | *"OAuth 2.0 Attestation-Based Client Authentication"*, Active Internet-Draft, revision **10**, **2026-07-06**, intended status Standards Track | **New row.** Revision matched |
| Front-Channel Logout 1.0 | `openid.net/specs/openid-connect-frontchannel-1_0.html` **and** `…-final.html` | *"OpenID Connect Front-Channel Logout 1.0"*, **Final**, **12 September 2022** — identical at both URLs | Date filled; implementation column corrected |
| Session Management 1.0 | `openid.net/specs/openid-connect-session-1_0.html` | *"OpenID Connect Session Management 1.0"*, **Final**, **12 September 2022** | Date filled; row rebuilt from a footnote |
| OpenID Federation 1.1 | `openid.net/specs/openid-federation-1_1.html` **and** `…-final.html` | *"OpenID Federation 1.1"*, **Final**, **5 May 2026** — identical at both URLs | Version/date **confirmed**; the *"superseded"* framing corrected |
| Federation for OpenID Connect 1.1 | `openid.net/specs/openid-federation-connect-1_1.html` | *"OpenID Federation for OpenID Connect 1.1"*, Standards Track, **5 May 2026** | **New row** — the half nobody had noticed was separate |
| OpenID Federation 1.0 | `openid.net/specs/openid-federation-1_0.html` | *"OpenID Federation 1.0"*, **Final**, **17 February 2026** | Date **confirmed**; relationship to 1.1 rewritten |
| HAIP 1.0 | `openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html` | *"OpenID4VC High Assurance Interoperability Profile 1.0"*, **Final**, **24 December 2025** | Applied to `audit/01-spec-matrix.md` §3 — see below |
| OID4VP 1.0 | `openid.net/specs/openid-4-verifiable-presentations-1_0.html` | *"OpenID for Verifiable Presentations 1.0"*, **Final**, **9 July 2025**; roles **Wallet**, **Verifier**, Credential Issuer | Date **confirmed**; no-obligations clause added |
| ISO/IEC 18013-5 (mdoc) | `iso.org/standard/69084.html` | **NOT FETCHED — HTTP 403.** No header line was read | See the note below. Nothing is cited from it |

> **Four things this table records that a "verified ✅" stamp could not.**
>
> **1. Two rows were confirmed, not corrected — and that is a result.** RFC 9901's November 2025 and OID4VP's
> 9 July 2025 were already right. A provenance pass that only surfaced errors would tell you nothing about the
> rows it left alone; this one distinguishes *checked and correct* from *never checked*.
>
> **2. The `-final.html` trap was tested twice and did not fire.** Front-Channel Logout and Federation 1.1
> serve the same document at both URLs. The trap is real — it caught JARM and Identity Assurance — but it is
> not universal, which is why the rule is *fetch both and take the later* rather than *always use one*.
>
> **3. The mdoc row is the honest failure, and it is left visible on purpose.** `iso.org` returns **HTTP 403**
> to an automated fetch, and the standard's text is paywalled regardless. So **no header line exists to
> record**, and nothing in this repo cites the document's content — deliberately. The identifier and title
> (*ISO/IEC 18013-5:2021, "Personal identification — ISO-compliant driving licence — Part 5: Mobile driving
> licence (mDL) application"*) come from the **ISO catalogue listing, a secondary source, and are labelled as
> such**. This is the one place where this curriculum's *"verified against the primary source"* promise
> **cannot** be kept. Recording the 403 is the alternative to the two dishonest options: dropping the row, or
> citing a secondary source as though it were a header. **MDL-W2 — carving a paywalled-standard category into
> `docs/curriculum/README.md`'s verification promise — is still open**, and this row is its evidence.
>
> **4. Two of the fifteen rows were not in this file at all.** HAIP and mdoc live in `audit/01-spec-matrix.md`
> §3, not here — the work item called the whole batch a "`SPEC-INVENTORY.md` pass", and for thirteen of
> fifteen it was. **Check which table a row is actually in before planning an edit to it.**

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
| RFC 7518 carried no update note | **Updated by RFC 9864** (**Dec 2025** — the Oct 2025 date carried here until 2026-08-14 was wrong), with a note that the `ES256` deprecation is **COSE-only** and changes nothing here. RFC 9864 now has its own §1 row, since it updates RFC 7518, 8037 and 9053 | Completeness — deliberately annotated *without* overstating the impact |
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
