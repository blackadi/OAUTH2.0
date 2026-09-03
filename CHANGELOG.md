# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Native SSO Phase 2 re-bound the device secret instead of verifying it**
  (`native-sso-response.handler.ts`): `deviceSecretHash` was recomputed from whatever `actor_token`
  arrived, so any secret "matched" the subject token's `ds_hash` and possession of an ID token was
  enough to obtain tokens for that user. Phase 2 now compares in constant time and refuses on mismatch;
  a subject token with no `ds_hash` is refused rather than treated as nothing to check. Found by
  `scripts/native-sso-verify.mjs`
- **`ath` and the DPoP proof at the introspection API** (`token.service.ts`, client): introspecting a
  DPoP-bound token sent no proof, so Authlete refused it with `[A065308]`. `introspectForToken` now
  sources the key from the session and sends the proof beside the admin credential

### Added

- **`scripts/native-sso-verify.mjs`**: end-to-end Native SSO probe — both phases, the `ds_hash` binding,
  `sid` continuity across two apps, and four negative cases including a forged subject token. 13/13
- **Native SSO enabled and verified** (2026-09-03), reversing DR-04. Discovery now advertises
  `native_sso_supported` and carries 67 members
- **JARM support in the SPA callback** (`utils/jarm.ts`): verifies the signed authorization response
  against the server JWKS before reading `code`/`state`/`iss`, and shows the JWT in the inspector
- **Request trace persistence** (`trace-store.ts`): the trace survives the front-channel redirect, so
  the callback page can compare both halves of an authorization-code flow

- **MCP (Model Context Protocol) OAuth 2.1 testing section**: Full client UI with 3 tabs (AS Metadata, Protected Resource Metadata, CIMD Metadata) and 5-step Full Flow Wizard (Discover → Register → Authorize → Token → UserInfo)
- **`/.well-known/oauth-authorization-server` endpoint**: RFC 8414 AS metadata served at root for MCP spec compliance
- **`McpSection.tsx`**: MCP discovery with dual well-known fallback, CIMD client registration, PKCE S256 + RFC 8707 resource indicator authorization URL builder, token exchange, and UserInfo
- **`mcp.service.ts`**: Service layer for MCP flows — `fetchAsMetadata()`, `fetchProtectedResourceMetadata()`, `fetchCimdMetadata()`, `buildAuthorizationUrl()`, `exchangeCode()`, `introspectToken()`, `fetchUserInfo()`
- **`MCP-OAUTH-TUTORIAL.md`**: Visual tutorial with airport analogy, step-by-step flow diagrams, common mistakes, and troubleshooting table
- **`consentedClaims` flow**: Claim-level consent propagated from authorization to userinfo — new `scope-claims.ts` utility, consent page checkboxes, session storage, Authlete API pass-through
- **`scope-claims.ts`**: OIDC scope-to-claims mapping utility (`claimsFromScopes()`, `claimLabel()`)

### Fixed

- **FAPI 2.0 wizard could not complete** (`use-fapi-flow.ts`, `CallbackPage.tsx`): the signed request
  object omitted `response_mode=jwt`, which the `fapi2: ms-authres` scope attribute makes mandatory, so
  every run ended in an `[A309301]` error redirect. The callback also could not read a JARM response
- **Native SSO step 3 was unreachable and would have crashed** (`use-fapi-flow.ts`, `trace-store.ts`):
  the callback dropped every flow on the dashboard, and the FAPI wizard lost both key pairs across the
  redirect. `navigateTo` now records where to return to, and the wizard restores its keys
- **An ID-token `subject_token` returned HTTP 500** (`token-exchange-response.handler.ts`): the whole
  JWT was passed as the token-create `subject`, earning `[A144103]`. Authlete leaves subject resolution
  to the AS for `subjectTokenType: ID_TOKEN`, so the `sub` claim is used — leaving Module 06 Exercise
  6c's deliberate substitution untouched
- **Token revoke bug** (`token.management.controller.ts:152`): `TokenRevokeResponse` has no `action` field — replaced `resultCode`-based switch with correct handling, sanitized response body to `{ count }`, improved catch block for `ResultError`
- **`revokeGrant()` bug** (`grant.service.ts:21`): Was calling `response.json()` on 204 No Content
- **Routes view gap**: `routes-list.routes.ts` static `ROUTES` array updated — 80+ endpoints now listed including Device Flow, Native SSO, JAR, Federation, VCI, Client Management, HSK, FAPI

### Changed

- **OpenAPI spec full audit** (`openapi.routes.ts`): 15 missing endpoints added, duplicate path keys fixed, duplicate `healthRoutes` mount removed
- **Code deduplication** (net -361 lines): Extracted shared `requireBasicAuth` middleware (was 8 copies), `handleControllerError` utility (was 6 copies), `crypto-utils.ts` shared module for JWK/CryptoKeyPair/base64UrlEncode
- **Deleted dead code**: Unused hooks (`useApi`, `useClipboard`, `useLocalStorage`), unused types (`TokenInfo`, `AdminTokenResponse`), unused test fixtures
- **`userinfo.controller.ts`**: Uses `result.consentedClaims` when available, falls back to `result.claims`
- **`authorization.service.ts`**: Passes `consentedClaims` to Authlete's `/auth/authorization/issue` API
- **`consent.ejs`**: Added claim-level checkboxes with `name="consentedClaims"`
- **`session.controller.ts`**: Derives claims from scopes for consent view, captures selected claims from form
- **`express-session.d.ts`**: Added `consentedClaims?: string[]` to session data

### Documentation

- **Authlete doc audits completed**: CIMD (no implementation needed), Comprehensive API Protection (resource server concerns), Handling Request Parameters (fully implemented), Handling Responses from Authlete APIs (fixed tokenRevokeToken), Implementing an Authorization Endpoint (fully implemented), Ticket Parameter (fully implemented), When response_type Contains id_token (fully implemented), Requiring PKCE/S256 (fully implemented), Using Request Objects (fully implemented), Adding Custom Claims to UserInfo (implemented with consentedClaims), Access Token Verification (fully implemented), Client Attributes (fully implemented), Using Client ID Alias (fully implemented)
- **AGENTS.md**: Updated with MCP section details, section count (21), components, services

## [1.0.0] - 2026-07-25

### Added

- **RFC 7523 — JWT Bearer Grant**: Server-side JWT verification service, token endpoint integration, and client-side testing UI with error codes aligned to Authlete Java reference
- **RFC 9470 — Step-Up Authentication Challenge Protocol**: ACR binding to JWT access tokens, `prompt=login` re-auth flow, `insufficient_user_authentication` error handling, and `StepUpSection.tsx` testing UI
- **Authlete setup guides for all tutorials**: Step-by-step service configuration for Backchannel Logout, CIBA, and PAR tutorials including Console screenshots and field-level instructions
- **Part 7 (Client UI) for JWT Bearer tutorial**: Complete `AuthFlowsSection.tsx` walkthrough with copy-paste code and browser testing flow
- **Part 6 (SPA workflow) for CIBA tutorial**: Full React component integration with polling loop, timeout handling, and error display
- **Troubleshooting sections** expanded for CIBA and Backchannel Logout tutorials
- **CHANGELOG.md** following Keep a Changelog format

### Changed

- **CIBA tutorial**: Corrected client auth method from `CLIENT_SECRET_POST` to `CLIENT_SECRET_BASIC` throughout (per Authlete CIBA guide)
- **JWT Bearer tutorial**: Replaced placeholder error codes with real Authlete values (`UNSUPPORTED_GRANT_TYPE`, `INVALID_REQUEST_FORMAT`, `INVALID_REQUEST`, `UNAUTHORIZED_CLIENT`)
- **API.md**: Updated introspection endpoint with `acrValues`/`maxAge` parameters and 403 step-up response
- **DATA-FLOWS.md**: Added Step-Up Auth sequence diagram; updated Authorization Code Flow behaviors
- **COMPONENT-REFERENCE.md**: Added `StepUpSection.tsx`; updated section count to 10 OIDC sections
- **README.md**: Added Step-Up Auth to extensions table; updated test count to 329
- **AGENTS.md**: Added RFC 9470 quirks and CIBA auth method recommendation

### Fixed

- **Backchannel Logout tutorial**: Updated dead Authlete reference link to working developer docs URL
- **Backchannel Logout tutorial**: Added Authlete version requirement (3.0.32+) and token revocation note
- **CIBA tutorial**: Added critical rule about matching client auth methods between backchannel and token endpoints

### Security

- **RFC 9470**: Step-Up Authentication prevents credential stuffing by enforcing re-authentication when ACR requirements aren't met
- **RFC 7523**: JWT Bearer grant validation aligned with Authlete's implementation to prevent token injection
