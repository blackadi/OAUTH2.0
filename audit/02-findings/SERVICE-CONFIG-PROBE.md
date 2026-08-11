# Live service configuration — observed evidence

Not a specification entry. A single authorised read-only probe whose results are referenced by several
findings, recorded once here rather than duplicated.

- **Probe:** `GET {AUTHLETE_BASE_URL}/api/{serviceId}/service/get`, raw HTTP, 2026-08-10
- **Result:** HTTP 200, **129 fields**
- **Redaction:** `jwks`, `jwksUri`, `directJwksEndpointEnabled` were present and are **not recorded here**. No key material or secret appears in this file.

## 1. `SPIFFE_JWT` — the SDK enum gap, now observed rather than inferred

```
supportedTokenAuthMethods = ['NONE', 'CLIENT_SECRET_BASIC', 'CLIENT_SECRET_POST',
  'CLIENT_SECRET_JWT', 'PRIVATE_KEY_JWT', 'TLS_CLIENT_AUTH',
  'SELF_SIGNED_TLS_CLIENT_AUTH', 'ATTEST_JWT_CLIENT_AUTH', 'SPIFFE_JWT']
```

Nine members. SDK 1.0.0's `ClientAuthMethod` (`models/clientauthmethod.ts`) has **eight** — the same list
minus `SPIFFE_JWT` — and is a strict `z.nativeEnum`, so one unrecognised value rejects the entire
129-field response.

**`AGENTS.md`'s diagnosis is confirmed exactly.** Two things are now established that were previously
inference:

1. The offending value is really on the wire, and it is really the last member of that array.
2. **The raw HTTP call succeeds (HTTP 200).** The failure is therefore SDK-side response validation, not an Authlete error and not a service misconfiguration. Any remediation that needs the service configuration can read it over raw HTTP today.

## 2. Live flag values versus `AGENTS.md`'s recommended values

`AGENTS.md`'s table is explicitly a set of *recommendations*, so divergence is not automatically a
defect. It matters because `GET /api/fapi/config` reports several of these as facts.

| Flag | `AGENTS.md` recommends | **Live** | Diverges |
|---|---|---|---|
| `pkceRequired` | *(not tabulated)* | **`False`** | — |
| `pkceS256Required` | *(not tabulated)* | **`False`** | — |
| `scopeRequired` | `true` | **`False`** | ✗ |
| `claimShortcutRestrictive` | `true` | `True` | ✓ |
| `refreshTokenKept` | `true` | **`False`** | ✗ |
| `refreshTokenIdempotent` | `true` | **`False`** | ✗ |
| `dcrScopeUsedAsRequestable` | `true` | **`False`** | ✗ |
| `missingClientIdAllowed` | `false` | `False` | ✓ |
| `issSuppressed` | `false` | `False` | ✓ |
| `idTokenAudType` | `"string"` | **absent** | ✗ |
| `loopbackRedirectionUriVariable` | `true` | `True` | ✓ |
| `traditionalRequestObjectProcessingApplied` | `false` | `False` | ✓ |
| `nbfOptional` | `false` | `False` | ✓ |
| `unauthorizedOnClientConfigSupported` | `true` | `True` | ✓ |
| `idTokenReissuable` | `true` | **`False`** | ✗ |
| `clientIdMetadataDocumentSupported` | `false` | `False` | ✓ |
| `dpopNonceRequired` | *(not tabulated)* | `False` | — |
| `parRequired` | *(not tabulated)* | `False` | — |
| `nativeSsoSupported` | *(not tabulated)* | **`False`** | — |

**Eight of sixteen tabulated flags match the recommendation; six diverge.** The divergences are the
interesting half.

## 3. What the probe settles, finding by finding

### 3.1 PKCE is not required, and the repo reports that it is

`pkceRequired = False`, `pkceS256Required = False`. `controllers/fapi.controller.ts:41` returns a
hardcoded `pkceRequired: true`.

Precision matters here. `pkceRequired = false` is **not** by itself an RFC violation: RFC 9700 §2.1.1
requires the AS to *support* PKCE (it does) and to *enforce* `code_verifier` when a challenge was sent
(Authlete does). The MUST that binds *clients* is theirs to keep. What `false` means is that a client may
**omit** PKCE entirely and still get a code.

Two real consequences:

- **FAPI 2.0 makes PKCE with S256 mandatory.** `README.md` advertises FAPI 2.0 support. With `fapiModes` absent (§3.4 below) and `pkceS256Required = False`, that claim has no configuration behind it.
- **The false report is the sharper defect.** `/api/fapi/config` asserts `pkceRequired: true` on a service where it is `false`. A reviewer following Module 07's triangulation method records a passing PKCE control that does not exist.

### 3.2 Refresh-token rotation is ON, which satisfies one spec and contradicts another

`refreshTokenKept = False` ⇒ refresh tokens **are** rotated (the SDK's own doc comment at
`models/service.ts:634-642`: *"If `true`, a refresh token used to get a new access token remains valid
after its use"*).

- **RFC 9700 §2.2.2** — *"Refresh tokens for public clients MUST be sender-constrained or use refresh token rotation"* → **satisfied**, via rotation.
- **FAPI 2.0 §5.3.2.1**, as `AGENTS.md` cites it — *shall not* rotate except in extraordinary circumstances → **contradicted**.

Both are true simultaneously. This is a genuinely good teaching artifact: the same switch is required by
BCP 240 and discouraged by FAPI 2.0, and which one governs depends on the profile you claim. Module 03's
objectives already name "the rotation-vs-FAPI-2.0 tension" — the live config is a worked example of it.

### 3.3 `idTokenReissuable = False` makes a handled action unreachable

Per Authlete's flags page, `idTokenReissuable` controls whether `/auth/token` can return
`ID_TOKEN_REISSUABLE`. It is `False`, so the branch at `controllers/token.controller.ts:153-178` is **dead
code on this service**. `AGENTS.md`'s token-action coverage table lists it without noting that.

Not a defect — the branch is correct and would work if the flag were on. Recorded because "handled" and
"exercisable" are different claims, and the curriculum should not conflate them.

### 3.4 FAPI is off, confirming the build log

`fapiModes` and `supportedServiceProfiles` are both **absent**, so `computeFapiMode`
(`fapi.controller.ts:5-20`) returns `"disabled"`. This confirms `PROGRESS.md`'s record that `fapiModes`
was cleared and never re-enabled, and its conclusion that **no lab step in the curriculum shows FAPI
being enforced.** Now observed, not just reported.

### 3.5 Three previously `UNVERIFIED` items are now settled

| Item | Previous state | Observed |
|---|---|---|
| `supportedAcrs` | `UNVERIFIED` — `modules/09a…/lab.md:533` | **absent** — confirmed unset |
| `supportedAuthorizationDetailsTypes` | `UNVERIFIED` — `modules/09a…/lab.md:610` | **absent** — confirmed unset |
| `authorizationCodeDuration: 0` | "NOT EVIDENCED" — `PROGRESS.md:729` | **`0`** — confirmed |

The five Module 09a console settings were indeed never applied. Those lab exercises remain correctly
marked `UNVERIFIED`; the probe converts "we could not check" into "we checked, and it is unset."

### 3.6 Features advertised as working that the service disables

| Feature | `README.md` / docs claim | Live flag |
|---|---|---|
| Native SSO | `README.md` lists it as **"Working"**; `docs/NATIVE-SSO-TUTORIAL.md` is a full tutorial | `nativeSsoSupported = False` |
| Verifiable Credentials | 9 endpoints + tutorial | `verifiableCredentialsEnabled = False` (already recorded in `SPEC-INVENTORY.md`) |
| MCP "out of the box" via CIMD | `docs/MCP-OAUTH-TUTORIAL.md` | `clientIdMetadataDocumentSupported = False` |
| FAPI 2.0 | `README.md` "Working" | `fapiModes` absent |

Carried to B6/B7 for verdicts. The pattern is consistent enough to be a Phase 4 theme: **the code surface
exists, the service configuration does not enable it, and the feature table says "Working."**

### 3.7 The discovery non-conformance, with a concrete value

`issuer = https://blackadi.dev`, while discovery is reachable only at
`http://localhost:3000/api/.well-known/openid-configuration`.

`SPEC-INVENTORY.md:114-127` already labels this a non-conformance against RFC 8414 §3 and OIDC Discovery
§4.1/§4.3. The probe supplies the missing specific: the advertised `issuer` is not merely on a different
path, it is on a **different host**. A conforming client starting from `https://blackadi.dev` would fetch
`https://blackadi.dev/.well-known/openid-configuration` and find nothing. Carried to **B3**.

### 3.8 Grant types enabled

```
supportedGrantTypes = ['AUTHORIZATION_CODE','IMPLICIT','PASSWORD','CLIENT_CREDENTIALS',
                       'REFRESH_TOKEN','CIBA','DEVICE_CODE','TOKEN_EXCHANGE',
                       'JWT_BEARER','PRE_AUTHORIZED_CODE']
```

All ten SDK `GrantType` members are enabled, including `IMPLICIT` (RFC 9700 §2.1.2 SHOULD NOT) and
`PASSWORD` (§2.4 MUST NOT). Consistent with a teaching deployment that must be able to demonstrate the
retired grants — and it confirms `CIBA` is a live grant type, which sharpens finding **B1-2**: the repo's
`GRANT_TYPE_MAP` cannot produce `CIBA`, for a grant the service actually supports.

### 3.9 An ephemeral tunnel in the service configuration

`deviceVerificationUri = https://cecile-soapsudsy-zoila.ngrok-free.dev/device`

The user-facing URI that RFC 8628 §3.2 requires be shown on the device points at an ngrok dev tunnel. It
will 404 once that tunnel expires, so the device flow's human-facing leg is time-bombed. Not a secret and
not a spec violation, but a live config defect worth one line in B6. `AGENTS.md` correctly notes
`deviceVerificationUri` is mandatory; nothing notes that this one is disposable.

## 4. Verdict changes triggered by this probe

| Spec | Was | Now | Why |
|---|---|---|---|
| RFC 7636 (PKCE) | `IMPLEMENTED_UNVERIFIED` / S2 | **`MISCONFIGURED` / S1** | Not required, and falsely reported as required |
| RFC 9700 §2.2.2 | unverified | satisfied via rotation | `refreshTokenKept = False` |
| RFC 9700 F-4 (unobservable posture) | open | **resolved** | Readable over raw HTTP; the values are recorded above |
| B7 `SPIFFE_JWT` | inferred from the SDK | **observed on the wire** | §1 |

---

# Probe 2 — endpoints, request objects, response modes, DPoP nonce (B4)

A second authorised read-only pass, run for batch B4 because six verdicts turn on configuration the first
probe did not record. Three calls, all `GET`, all read-only:

| Call | Result |
|---|---|
| `GET /api/{serviceId}/service/get` | HTTP 200, 129 fields |
| `GET /api/{serviceId}/service/configuration` | HTTP 200, **62 members** — the discovery document Authlete generates |
| `GET /api/{serviceId}/client/get/list?start=0&end=20` | HTTP 200, **3 clients** |

**Redaction:** `jwks`, `jwksUri`, client secrets and `clientIdAlias` were present in the responses and are
**not recorded here**. Numeric `clientId` values are public identifiers and already appear in the repo
(`services/par.service.ts:30`).

## 5. Every OAuth endpoint is advertised on a disposable tunnel

```
issuer                                = https://blackadi.dev
authorization_endpoint                = https://cecile-soapsudsy-zoila.ngrok-free.dev/api/authorization
token_endpoint                        = …/api/token
userinfo_endpoint                     = …/api/userinfo
introspection_endpoint                = …/api/introspection
revocation_endpoint                   = …/api/revocation
pushed_authorization_request_endpoint = …/api/par
jwks_uri                              = …/api/.well-known/jwks.json
```

§3.9 of probe 1 recorded one ngrok URL, on `deviceVerificationUri`, and called it "a live config defect worth
one line in B6." It is larger than that: **every endpoint in the advertised metadata points at the same
ephemeral tunnel**, and none of them is on the advertised `issuer` host. Two consequences that later findings
depend on:

1. `/api/par` **is** the advertised RFC 9126 PAR endpoint, so its request and response shapes are conformance-relevant, not merely a debug convenience (see `RFC9126-…`).
2. The RFC 9207 `iss` value is internally consistent with the advertised `issuer` — the mix-up defence is not itself broken — but the trust anchor it depends on (RFC 8414 §3 issuer↔metadata correspondence, the B3 finding) is what fails. See `RFC9207-…` F-2.

## 6. Request objects (JAR) and response modes (JARM)

| Discovery member | Live value |
|---|---|
| `request_parameter_supported` | `true` |
| `request_uri_parameter_supported` | `true` |
| `require_signed_request_object` | `false` |
| `require_request_uri_registration` | **`true`** |
| `request_object_signing_alg_values_supported` | `HS256…HS512, RS*, PS*, ES*, ES256K, EdDSA` (14) |
| `response_modes_supported` | `query, fragment, form_post,` **`query.jwt, fragment.jwt, form_post.jwt, jwt`** |
| `authorization_signing_alg_values_supported` | `HS256, HS512, ES256, HS384` |
| `authorization_encryption_alg_values_supported` | 17 values |
| `dpop_signing_alg_values_supported` | `RS*, PS*, ES*, ES256K, EdDSA` (11) |
| `authorization_response_iss_parameter_supported` | `true` |
| `require_pushed_authorization_requests` | `false` |
| `tls_client_certificate_bound_access_tokens` | `false` |
| `mtls_endpoint_aliases` | **absent** |
| `token_endpoint_auth_methods_supported` | `none, client_secret_basic, client_secret_post, client_secret_jwt, private_key_jwt,` **`tls_client_auth, self_signed_tls_client_auth`**, `attest_jwt_client_auth,` **`spiffe_jwt`** |
| `code_challenge_methods_supported` | `plain, S256` |

Service fields behind those:

```
pushedAuthReqDuration                      = 600      requestObjectRequired                = False
parRequired                                = False    nbfOptional                          = False
requestObjectAudienceChecked               = True     traditionalRequestObjectProcessingApplied = False
authorizationResponseDuration              = 600      authorizationSignatureKeyId          = <absent>
supportedResponseModes                     = <absent> supportedRequestObjectSignAlgs       = <absent>
dpopNonceRequired                          = False    dpopNonceDuration                    = 0
tlsClientCertificateBoundAccessTokens      = False    accessTokenType                      = Bearer
frontChannelRequestObjectEncryptionRequired = False   accessTokenSignAlg                   = <absent>
```

`supportedResponseModes` is absent on the service yet `response_modes_supported` in the generated document
lists all seven — so **Authlete advertises the four JARM modes by default**, not because anyone enabled them.

## 7. The three registered clients

| | `Testing App` | `test` | `DPOP` |
|---|---|---|---|
| `clientId` | 4277838306 | 1523514379 | 1678274156 |
| type / auth | PUBLIC / `NONE` | CONFIDENTIAL / `CLIENT_SECRET_BASIC` | PUBLIC / `NONE` |
| `authorizationSignAlg` | absent | absent | absent |
| `authorizationEncryptionAlg` / `Enc` | absent | absent | absent |
| `requestObjectRequired` | `False` | `False` | `False` |
| `requestSignAlg` | absent | absent | absent |
| `requestUris` | **absent** | **absent** | **absent** |
| `jwksUri` | absent | absent | absent |
| `parRequired` | `False` | `False` | `False` |
| `pkceRequired` / `pkceS256Required` | `False` / `False` | `False` / `False` | `False` / `False` |
| `dpopRequired` | `False` | `False` | `False` |
| `tlsClientCertificateBoundAccessTokens` | `False` | `False` | `False` |
| `authorizationDetailsTypes` | absent | absent | absent |
| `idTokenSignAlg` | `ES256` | **`HS256`** | `ES256` |

**Six facts the B4 verdicts rest on:**

1. **No client can consume JARM.** `authorizationSignAlg` is unset on all three, which is exactly the `[A012305]` that `modules/09a-interaction-extensions/lab.md:138-142` records. The AS advertises four JARM response modes anyway.
2. **JAR by reference cannot work for any client.** `require_request_uri_registration = true` and no client has `requestUris`, so RFC 9101 §5.2.2 is unreachable on this deployment regardless of code.
3. **JAR by value works only for `test`, and only with HS\*.** No client has `jwks`/`jwksUri`/`requestSignAlg`, so there is no public key for Authlete to verify an asymmetrically-signed object against; the confidential client's secret is the only usable key. `modules/05…/lab.md:265` ("generate a client key and register it") is doing real work — it registers one for the exercise.
4. **The DPoP nonce path is unreachable.** `dpopNonceRequired = False` with `dpopNonceDuration = 0`, and no call site sets the SDK's per-request `dpopNonceRequired` override, so Authlete never returns a `dpopNonce` and `utils/dpop.ts:3-7` never fires. Whether `0` means "disabled" or "use the default" is not stated on the flags page and does not matter while the boolean is off.
5. **mTLS is off everywhere but still advertised.** `tls_client_certificate_bound_access_tokens = false`, no `mtls_endpoint_aliases`, no client with `tlsClientCertificateBoundAccessTokens` — yet `token_endpoint_auth_methods_supported` offers `tls_client_auth` and `self_signed_tls_client_auth`. See `RFC8705-…` F-1.
6. `idTokenSignAlg: HS256` on client `1523514379` is confirmed, matching `PROGRESS.md`'s outstanding item. `ES256` on the other two — so the HS256 issue is one client, not both as `PROGRESS.md` records ("both test clients").

---

# Probe 3 — OIDC, CIBA, device flow, RAR, logout (OIDC Core + B6)

A third authorised read-only pass for the OIDC Core entry and batch B6: the same three `GET` calls, printing the
fields probes 1 and 2 did not. Same redaction rules — no key material, no secrets.

## 8. OIDC Core and Discovery members

```
subject_types_supported             = ["public", "pairwise"]
claims_parameter_supported          = true
claims_supported                    = 20 claims (sub, name, given_name, family_name, middle_name, nickname,
                                      preferred_username, profile, picture, website, email, email_verified,
                                      gender, birthdate, zoneinfo, locale, phone_number,
                                      phone_number_verified, address, updated_at)
supportedClaimTypes                 = ["NORMAL"]
acr_values_supported                = <ABSENT>
id_token_signing_alg_values_supported   = ["HS256", "HS512", "ES256", "HS384"]     # no RS256
userinfo_signing_alg_values_supported   = ["HS256", "HS512", "ES256", "HS384", "none"]
prompt_values_supported             = ["none", "login", "consent", "select_account", "create"]
end_session_endpoint                = https://cecile-soapsudsy-zoila.ngrok-free.dev/api/logout
backchannel_logout_supported        = <ABSENT>
backchannel_logout_session_supported = <ABSENT>
frontchannel_logout_supported       = <ABSENT>
registration_endpoint               = <ABSENT>
introspection_endpoint_auth_methods_supported = []          # empty array
idTokenDuration = 86400   accessTokenDuration = 86400   refreshTokenDuration = 864000
claimShortcutRestrictive = true   idTokenAudType = <ABSENT>   idTokenReissuable = false
```

Four of these are load-bearing for later verdicts:

1. **`id_token_signing_alg_values_supported` omits RS256**, which OIDC Discovery §3 makes a MUST (*"The algorithm RS256 MUST be included."*). See `OIDC-CORE-1.0.md` F-2 — and note B3's discovery entry does not mention it.
2. **`backchannel_logout_supported` and `frontchannel_logout_supported` are both absent** while the repo implements three back-channel logout endpoints plus a receiver. Carried to the logout batch.
3. **`registration_endpoint` is absent** while four DCR endpoints exist. Carried to the DCR entry for a follow-up.
4. **`introspection_endpoint_auth_methods_supported` is an empty array** — independent corroboration of the unauthenticated-introspection finding in B2, and the *"three-source divergence"* `PROGRESS.md:956-959` records for revocation.

## 9. CIBA, device flow, RAR and grant management — service side

```
backchannel_authentication_endpoint         = https://…/api/ciba/authentication
backchannel_token_delivery_modes_supported  = ["poll", "ping", "push"]
supportedBackchannelTokenDeliveryModes      = ["POLL", "PING", "PUSH"]
backchannel_user_code_parameter_supported   = true
backchannelAuthReqIdDuration = 600     backchannelPollingInterval = 5
backchannelBindingMessageRequiredInFapi = false

device_authorization_endpoint  = https://…/api/device/authorization
deviceVerificationUri          = https://…/device
deviceVerificationUriComplete  = https://…/device?user_code=USER_CODE
deviceFlowCodeDuration = 600   deviceFlowPollingInterval = 5
userCodeCharset = BASE20       userCodeLength = 0        # ⇒ Authlete's default (8 for BASE20)

supportedAuthorizationDetailsTypes    = <ABSENT>
authorization_details_types_supported = <ABSENT>

grant_management_endpoint          = https://…/api/gm
grant_management_actions_supported = ["create", "merge", "query", "replace", "revoke"]
grant_management_action_required   = false

nativeSsoSupported = false      native_sso_supported = <ABSENT>
verifiableCredentialsEnabled = false     credential_issuer = <ABSENT>
supportedClientRegistrationTypes = ["AUTOMATIC", "EXPLICIT"]
```

## 10. The three clients — CIBA, logout and RAR fields

Every one of the following is **absent on all three clients**:

| Client metadata | Consequence |
|---|---|
| `bcDeliveryMode` | CIBA Core §4 makes it **REQUIRED** client metadata. All three clients hold the `CIBA` grant type, so all three are non-conformantly registered and no CIBA flow can complete. `CIBA-core-1.0.md` F-4 |
| `bcNotificationEndpoint`, `bcRequestSignAlg` | ping/push modes unavailable |
| `backChannelLogoutUri` | **the repo's `deliver-all` has zero recipients** — carried to the logout batch |
| `frontChannelLogoutUri` | front-channel logout unavailable |
| `postLogoutRedirectUris` | RP-Initiated Logout has no registered redirect targets, which is *why* `logout.service.ts` validates against `ALLOWED_ORIGINS` instead — carried to the logout batch, where the open-redirect finding lives |
| `authorizationDetailsTypes` | RAR unavailable per client as well as per service. `RFC9396-…` F-1 |
| `defaultAcrs` | no default ACR; with `supportedAcrs` absent too, `acr` is asserted by this server alone |

Present: `bcUserCodeRequired: false`, `subjectType: PUBLIC`, `authTimeRequired: false`, `defaultMaxAge: 0` on all
three; `derivedSectorIdentifier: localhost` on two.

**The five Module 09a console settings, re-checked.** `modules/09a…/lab.md` marks five items `UNVERIFIED` with
the note *"was unset as of 2026-07-28"* (`:36` framing, `:285` JARM, `:441` CIBA, `:533` ACR, `:610` RAR). Probe 3
confirms **all five are still unset on 2026-08-10**. The markers are accurate, not stale — which matters, because
an `UNVERIFIED` note whose premise has silently changed is worse than no note at all.

## Sources

- Live probe 1: `GET /api/{serviceId}/service/get` — HTTP 200, 129 fields, 2026-08-10, authorised, read-only
- Live probe 2, 2026-08-10, authorised, read-only: `service/get`, `service/configuration` (62 members), `client/get/list` (3 clients)
- Live probe 3, 2026-08-10, authorised, read-only: the same three endpoints, printing the OIDC / CIBA / device / RAR / logout fields above
- SDK 1.0.0: `models/clientauthmethod.ts`, `models/service.ts:634-642`, `models/granttype.ts`
- Authlete flags page — `https://developers.authlete.com/configuration-reference/error-handling-debugging/flags-supported-in-authlete.md`
- RFC 9700 §§2.1.1, 2.1.2, 2.2.2, 2.4 — `https://www.rfc-editor.org/rfc/rfc9700.html`
