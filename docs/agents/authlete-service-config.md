<!-- Loaded on demand, not by default. `AGENTS.md` is the obligation; this file is the explanation. -->

# Authlete service configuration

> **Read this when** you are about to change a service flag in the Authlete console, or need to
> know what a flag's live value is and why. **Verify live values against the service, never from
> this table** — it records the reasoning, not the current state.

## Authlete service configuration

The Authlete service (configured via the [Authlete web console](https://console.authlete.com/)) controls most OAuth/OIDC spec behavior through boolean flags. These flags address common spec implementation mistakes documented in [OAuth & OIDC Implementation Mistakes](https://darutk.medium.com/oauth-oidc-mistakes-7f3bb909518b).

| Flag | Recommended | Rationale | Article Ref |
|------|------------|-----------|-------------|
| `scopeRequired` | `true` | Reject authorization requests without `scope` per RFC 6749 §3.3 | Mistake #1 |
| `claimShortcutRestrictive` | `true` | Only embed scope-requested claims in ID token when no AT issued (OIDC Core §5.4) | Mistake #2 |
| `refreshTokenKept` | `true` | Disable refresh token rotation (FAPI 2.0 §5.3.2.1 forbids it) | Mistake #3 |
| `refreshTokenIdempotent` | `true` | Idempotent refresh token handling within 60s window | Mistake #3 |
| `dcrScopeUsedAsRequestable` | `true` | Honor `scope` metadata in DCR to restrict client scopes (RFC 7591) | Mistake #4 |
| `missingClientIdAllowed` | `false` | Require `client_id` in token requests; never look up from auth code (RFC 6749 §4.1.3) | Mistake #5 |
| `issSuppressed` | `false` | Include `iss` response param for mix-up attack prevention (RFC 9207) | Mistake #6 |
| `idTokenAudType` | `"string"` | Use single string for `aud` claim (FAPI WG decision Nov 2024) | Mistake #7 |
| `loopbackRedirectionUriVariable` | `true` | Treat loopback redirect ports as variable (RFC 8252 §7.3) | Mistake #8 |
| `traditionalRequestObjectProcessingApplied` | `false` | Use RFC 9101 JAR processing (not legacy OIDC Core §6) | Mistake #9 |
| `nbfOptional` | `false` | Require `nbf` on request objects, which is what FAPI 1.0 Advanced needs to bound their lifetime. **The bound is 60 *minutes*, not 60 seconds** — [FAPI 1.0 Part 2 §5.2.2](https://openid.net/specs/openid-financial-api-part-2-1_0.html): *"shall require the request object to contain an `exp` claim that has a lifetime of no longer than **60 minutes** after the `nbf` claim"*, and *"an `nbf` claim that is no longer than **60 minutes** in the past."* This row read *"≤60s"* until 2026-08-14 (FAPI1-W1) — a 60× error in the repo's most-read reference file. Correct flag, correct requirement, wrong number | Mistake #13 |
| `unauthorizedOnClientConfigSupported` | `true` | Return proper 401 for non-existent DCR clients (RFC 7592) | Mistake #11 |
| `idTokenReissuable` | `true` | Enable ID token reissuance during refresh token flow (OIDC Core §12.2) | Mistake #16 |
| `clientIdMetadataDocumentSupported` | `false` in general — **`true` here since 2026-08-14 (DR-05)** | Enable OAuth Client ID Metadata Document (CIMD) — allows HTTPS URLs as client_id with auto-fetched metadata. `false` is the right default for a service not targeting MCP; **this deployment targets it deliberately**, so do not "correct" the live value back. Verify with `GET /api/fapi/config` → `cimdSupported`, never from this table. | CIMD spec |

**Brazil-specific flags** (set only if targeting Brazil's API ecosystem):

| Flag | Recommended | Rationale |
|------|------------|-----------|
| `dcrDuplicateSoftwareIdBlocked` | `true` | Reject DCR with duplicate `software_id` (Brazil local rule) |
| `frontChannelRequestObjectEncryptionRequired` | `true` | Encrypt front-channel request objects |
| `requestObjectEncryptionAlgMatchRequired` | `true` | Enforce `alg` match in encrypted request objects |
| `requestObjectEncryptionEncMatchRequired` | `true` | Enforce `enc` match in encrypted request objects |

### `supportedClaims` must match what the server can produce

`supportedClaims` becomes `claims_supported` in the discovery document, and a client reads it to decide
what to ask for. It listed **20** claims on service `2147478188` while the server could produce **11**,
so nine were advertised and served by nothing: `address`, `birthdate`, `gender`, `middle_name`,
`phone_number`, `phone_number_verified`, `picture`, `profile`, `website`.

Trimmed to the truth on 2026-09-01. **Omitting a claim you have no value for is correct** — OIDC Core
§5.1, *"If a Claim is not returned, that Claim Name SHOULD be omitted"* — so the responses were right
all along; the advertisement was not.

| | where |
|---|---|
| the list | `SERVED_CLAIMS` in `server/src/utils/demo-claims.ts` |
| aligning the service to it | `node scripts/fapi2-align-supported-claims.mjs --apply` |
| catching drift either way | `node scripts/check-claims-supported.mjs` |

**Adding a claim is three edits, in order:** a `case` in `claimValuesFor`, the name in `SERVED_CLAIMS`,
then the align script. Stop after one and `demo-claims.test.ts` fails; stop after two and
`check-claims-supported.mjs` reports it. Nothing catches the reverse — a claim removed in the Authlete
console — until that check is run, which is why it reads the live document rather than a baseline.

**How this was found, and why no gate saw it.** A configuration change has no error string, so the
grep `curriculum-contract.md` prescribes finds nothing. It took a conformance run:
`fapi2-security-profile-final-test-claims-parameter-identity-claims` warned that *"the server did not
return all the requested claims … As the server listed the claims in `claims_supported`, it should have
returned them"*. The check now measures the two sides against each other instead of waiting for that.

### Token endpoint action coverage

The token controller (`src/controllers/token.controller.ts`) handles every Authlete action value.

| Action | Behavior |
|--------|----------|
| `BAD_REQUEST` | 400 with response content |
| `INVALID_CLIENT` | 401 (with Basic auth) or 400 |
| `INTERNAL_SERVER_ERROR` | 500 |
| `JWT_BEARER` | Verify JWT bearer assertion, return token |
| `OK` | 200 with access token |
| `PASSWORD` | Local credential validation → `token.issue()` or `token.fail()` |
| `TOKEN_EXCHANGE` | Create exchanged token via token management API |
| `ID_TOKEN_REISSUABLE` | Reissue ID token during refresh flow → **`token.management.reissueIdToken()`** (`POST /idtoken/reissue`), **not** `token.issue()` — there is no ticket. See the note below |
| `default` | 500 (logged as unknown action) |
