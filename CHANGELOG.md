# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
