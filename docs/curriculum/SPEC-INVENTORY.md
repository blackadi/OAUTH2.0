# Specification Inventory

**The short version:** every specification this curriculum touches, with its exact title, current status,
date, what problem it solved, what it fixed, and where it lives in this repo's code. Use it as a lookup
table and as a map from "what the spec says" to "what runs here."

## How to read this table

- **Status / type** is labeled precisely, because it changes how much you should trust a requirement:
  - **Published RFC** — an IETF Request for Comments (Standards Track unless noted BCP/Informational). Stable.
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

## 0. Transport & encoding foundations (Module 00)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 8446 | The Transport Layer Security (TLS) Protocol Version 1.3 | Published RFC | Aug 2018 | Modern transport encryption between two endpoints | Eavesdropping/tampering on the wire (not at the endpoints) | all HTTPS transport; production/tunnel deployment |
| RFC 9110 | HTTP Semantics | Published RFC (Internet Standard) | Jun 2022 | Version-independent HTTP methods, status, headers | Common vocabulary for every request/response | every route in `server/src` |
| RFC 4648 | The Base16, Base32, and Base64 Data Encodings | Published RFC | Oct 2006 | base64url (§5) — URL-safe, usually unpadded | The encoding of every JOSE segment | `scripts/decode-jwt.mjs`; `dpop.service.ts` |

## 1. JOSE — the cryptographic envelope (Module 00)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 7515 | JSON Web Signature (JWS) | Published RFC | May 2015 | Detached/compact signatures over JSON | Integrity + origin auth for tokens | ID tokens, JWT ATs, DPoP proofs, JAR (via Authlete + `client/src/services/dpop.service.ts`) |
| RFC 7516 | JSON Web Encryption (JWE) | Published RFC | May 2015 | Encrypted JSON payloads | Confidentiality of claims/request objects | Encrypted request objects (Brazil flags in `AGENTS.md`) |
| RFC 7517 | JSON Web Key (JWK) | Published RFC | May 2015 | Key representation + JWK Set | Publishing/consuming signing keys | JWKS via Authlete; `utils/jwksClient` |
| RFC 7518 | JSON Web Algorithms (JWA) | Published RFC | May 2015 | `alg`/`enc` registry (ES256, RS256, …) | Names the algorithms JWS/JWE use | DPoP ES256 (`dpop.service.ts`) |
| RFC 7519 | JSON Web Token (JWT) | Published RFC | May 2015 | Claims container + registered claims | `iss/sub/aud/exp/iat/nbf` semantics | ID tokens, JWT ATs, assertions |
| RFC 7638 | JSON Web Key (JWK) Thumbprint | Published RFC | Sep 2015 | Canonical hash of a JWK | DPoP `jkt` binding; key IDs | DPoP proof binding (RFC 9449) |

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
| RFC 7636 | Proof Key for Code Exchange by OAuth Public Clients | Published RFC | Sep 2015 | `code_challenge`/`code_verifier` (S256) | Closes authorization-code interception on public/native clients | `client/src/services/pkce.ts`; enforced by Authlete; `docs/PKCE-TUTORIAL.md` |

## 4. Token lifecycle & metadata (Module 04)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 7662 | OAuth 2.0 Token Introspection | Published RFC | Oct 2015 | RS asks AS "is this token active?" | Validating opaque/reference tokens | `introspection.routes.ts`, `introspection.service.ts` |
| RFC 7009 | OAuth 2.0 Token Revocation | Published RFC | Aug 2013 | Client revokes an access/refresh token | Logout/compromise response | `revocation.routes.ts`, `revocation.service.ts` |
| RFC 8414 | OAuth 2.0 Authorization Server Metadata | Published RFC | Jun 2018 | `/.well-known/oauth-authorization-server` | Client auto-config | `oauth-as-metadata.routes.ts` (root); see path quirk below |
| RFC 9728 | OAuth 2.0 Protected Resource Metadata | Published RFC | Apr 2025 | `/.well-known/oauth-protected-resource` | RS advertises its AS(es)/scopes; MCP discovery | **Consumed** client-side (`client` `mcp.service.ts`); **not served** by this AS → gap addressed in Module 04 |
| RFC 7591 | OAuth 2.0 Dynamic Client Registration Protocol | Published RFC | Jul 2015 | Programmatic client registration | Onboarding without console | `dcr.routes.ts` (`/api/client/dcr/register`), `dcr.service.ts` |
| RFC 7592 | OAuth 2.0 Dynamic Client Registration Management Protocol | Published RFC | Jul 2015 | Read/update/delete a registration | Lifecycle of DCR clients | `dcr.routes.ts` (`get`/`update`/`delete`) |
| RFC 9068 | JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens | Published RFC | Oct 2021 | Structured `at+jwt` access tokens | Interop for self-contained ATs | JWT ATs via Authlete |
| RFC 8707 | Resource Indicators for OAuth 2.0 | Published RFC | Feb 2020 | `resource` parameter | Audience-restricting tokens per API | MCP `resource` (RFC 8707) in `mcp.service.ts`; Authlete |

> **Path quirk (labs must respect):** `/.well-known/openid-configuration` is served under the **`/api`**
> prefix here, while RFC 8414's `/.well-known/oauth-authorization-server` is at **true root**.

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
| RFC 8693 | OAuth 2.0 Token Exchange | Published RFC | Jan 2020 | `grant_type=token-exchange`; `actor_token`/`may_act` | Impersonation vs. delegation; identity chaining | token `TOKEN_EXCHANGE`; `docs/TOKEN-EXCHANGE-TUTORIAL.md` |

## 7. Consolidation — OAuth 2.1 & the Security BCP (Module 07)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| RFC 9700 | Best Current Practice for OAuth 2.0 Security (BCP 240) | Published RFC (BCP) | Jan 2025 | Consolidated, current attack catalogue + mitigations | Supersedes RFC 6819 in practice; mandates PKCE, exact redirect matching, no implicit/ROPC | attack catalogue mapped across Modules 02–06 |
| draft-ietf-oauth-v2-1 | The OAuth 2.0 Authorization Framework (OAuth 2.1) | **Active Internet-Draft** (‑15, 2026; ‑14 dated 2025-10-20) | consulted 2026-07-27 | Consolidates 6749/6750/7636/8252 etc.; drops implicit & ROPC; PKCE mandatory | Simplifies + hardens the baseline | — (not a normative target; taught as direction of travel) |

## 8. OpenID Connect core & logout (Module 08)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OIDC Core 1.0 | OpenID Connect Core 1.0 incorporating errata set 2 | OpenID Final (errata set 3 in draft) | errata set 2, Dec 2023 | ID token, `nonce`, UserInfo, hybrid flow, `acr`/`amr` | Authentication on top of OAuth | ID token/UserInfo/hybrid via Authlete; `userinfo.*` |
| OIDC Discovery 1.0 | OpenID Connect Discovery 1.0 incorporating errata set 2 | OpenID Final | errata set 2 | `/.well-known/openid-configuration` | OP metadata discovery | `discovery.routes.ts`, `discovery.service.ts` |
| OIDC RP-Initiated Logout 1.0 | OpenID Connect RP-Initiated Logout 1.0 | OpenID Final | — | `end_session_endpoint` flow | RP-triggered logout | logout routes; `LogoutSection.tsx` |
| OIDC Front-Channel Logout 1.0 | OpenID Connect Front-Channel Logout 1.0 | OpenID Final | — | iframe-based multi-RP logout | Browser-mediated logout | logout routes |
| OIDC Back-Channel Logout 1.0 | OpenID Connect Back-Channel Logout 1.0 | OpenID Final | — | Server-to-server logout token | Logout without the browser | `backchannel-logout.service.ts`; `docs/BACKCHANNEL-LOGOUT-TUTORIAL.md` |
| OIDC Session Management 1.0 | OpenID Connect Session Management 1.0 | OpenID Final | — | RP polls OP session state | Session-change detection | conceptual |

## 9a. Interaction extensions (Module 09a)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| JARM | Financial-grade API: JWT Secured Authorization Response Mode for OAuth 2.0 (JARM) | OpenID Final | — | Signed/encrypted authorization **response** (`response_mode=jwt`) | Response tampering, mix-up, leakage | **ABSENT** — Module 09a implements (gated) |
| CIBA Core 1.0 | OpenID Connect Client-Initiated Backchannel Authentication Flow – Core 1.0 | OpenID Final | Sep 2021 | Decoupled auth (poll/ping/push), `auth_req_id` | Auth without a browser redirect | `ciba.routes.ts`, `ciba.service.ts`; `docs/CIBA-TUTORIAL.md` |
| Native SSO 1.0 | OpenID Connect Native SSO for Mobile Apps 1.0 | OpenID **2nd Implementer's Draft** (draft 07) | approved 2025-10-17 | `device_secret`, `urn:openid:params:grant-type:device_secret` | SSO across native apps on one device | `docs/NATIVE-SSO-TUTORIAL.md`; Authlete |
| RFC 9470 | OAuth 2.0 Step Up Authentication Challenge Protocol | Published RFC | Sep 2023 | `acr_values`/`max_age` challenge; `insufficient_user_authentication` | Force stronger auth for sensitive ops | `session.controller.ts`, `introspection.controller.ts`; `docs/STEP-UP-AUTH-TUTORIAL.md` |
| RFC 9396 | OAuth 2.0 Rich Authorization Requests (RAR) | Published RFC | May 2023 | `authorization_details` (typed, fine-grained) | Beyond coarse `scope` | `rar` section; Authlete; `docs/RAR-TUTORIAL.md` |

## 9b. Identity & verifiable credentials (Module 09b)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OIDC Identity Assurance 1.0 | OpenID Connect for Identity Assurance 1.0 | OpenID Final (errata set 1) | Oct 2024 | `verified_claims`, trust frameworks | KYC-grade verified identity | conceptual (09b) |
| OpenID Federation 1.0 | OpenID Federation 1.0 | OpenID Final | Feb 2026 | Trust chains, entity statements | Multilateral federation at scale | OIDC Federation section |
| RFC 9901 | Selective Disclosure for JWTs (SD-JWT) | Published RFC (Std Track) | Nov 2025 | Selective disclosure of JWT claims (salted digests) | Minimal disclosure / holder privacy | conceptual (09b) |
| draft-ietf-oauth-sd-jwt-vc | SD-JWT-based Verifiable (Digital) Credentials (SD-JWT VC) | **Active Internet-Draft** (‑17, 2026) | consulted 2026-07-27 | Credential format on SD-JWT | Interop VC format | conceptual (09b) |
| OID4VCI 1.0 | OpenID for Verifiable Credential Issuance 1.0 | OpenID Final | Sep 2025 | OAuth-protected credential issuance API | Issuing VCs | `vci.routes.ts`; `.well-known/openid-credential-issuer`; `VciSection.tsx` |
| OID4VP 1.0 | OpenID for Verifiable Presentations 1.0 | OpenID Final | Jul 2025 | Presenting VCs to a verifier | Credential presentation | conceptual (09b) |

## 10. FAPI & grant management (Module 10)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| FAPI 1.0 Part 1 | Financial-grade API Security Profile 1.0 – Part 1: Baseline | OpenID Final | — | Baseline read-access hardening profile | Interop security floor | `docs/FAPI-TUTORIAL.md` |
| FAPI 1.0 Part 2 | Financial-grade API Security Profile 1.0 – Part 2: Advanced | OpenID Final | — | Signed requests/responses, sender-constrained tokens | Write-access, high-value APIs | `docs/FAPI-TUTORIAL.md` |
| FAPI 2.0 Security Profile | FAPI 2.0 Security Profile | OpenID Final | Feb 2025 | Simplified, formally-verified profile (PAR + PKCE + sender-constraining) | High-assurance baseline; forbids refresh rotation | FAPI 2.0/DPoP section; `docs/FAPI-TUTORIAL.md` |
| FAPI 2.0 Attacker Model | FAPI 2.0 Attacker Model | OpenID Final | Feb 2025 | Explicit attacker capabilities the profile defends | Makes security claims testable | threat model (Module 10) |
| FAPI 2.0 Message Signing | FAPI 2.0 Message Signing | OpenID Final | approved 2025-07-29 | Non-repudiation via JAR + JARM + signed introspection | Signed requests/responses when required | uses JAR + JARM + introspection |
| Grant Management | Grant Management for OAuth 2.0 | OpenID **2nd Implementer's Draft** | 2023 | `grant_id`, query/revoke/replace/merge a grant | Managing long-lived consent | `grant-management.routes.ts`; `docs/GRANT-MANAGEMENT.md` |

## 11. API security beyond the token (Module 11)

| Identifier | Exact title | Status / type | Date | What it adds | What it fixes / enables | Where in this repo |
|---|---|---|---|---|---|---|
| OWASP API Security Top 10 | OWASP API Security Top 10 – 2023 | Community standard (current edition) | 2023 | Ranked API risk catalogue (BOLA, BFLA, BOPLA, SSRF, …) | Authorization defects a valid token can't stop | mapped to `docs/MONITORING.md`, audit-log/rate-limit middleware |

---

## Not-yet-in-repo (gaps this curriculum addresses)

| Capability | Spec | Reality here | Plan |
|---|---|---|---|
| JARM | JARM (OpenID Final) | Absent (no code/section/tutorial) | **Implement** in Module 09a (gated) |
| mTLS / cert-bound tokens | RFC 8705 | Thin — registration flags only | **Implement** in Module 05/10 (gated) |
| Protected Resource Metadata endpoint | RFC 9728 | Consumed client-side; not served | **Serve** it in Module 04 (small, gated) |
| Dedicated resource server endpoint | RFC 6750 | None; use UserInfo + Introspection as RS stand-ins | Teach with existing endpoints |

_All entries verified against primary sources on 2026-07-27. Report any drift you find while working
through the modules — a wrong citation here propagates into every module that cites it._
