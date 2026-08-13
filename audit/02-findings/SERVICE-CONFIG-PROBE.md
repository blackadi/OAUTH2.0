# Live service configuration — observed evidence

Not a specification entry. A single authorised read-only probe whose results are referenced by several
findings, recorded once here rather than duplicated.

- **Probe:** `GET {AUTHLETE_BASE_URL}/api/{serviceId}/service/get`, raw HTTP, 2026-08-10
- **Result:** HTTP 200, **129 fields**
- **Redaction:** `jwks`, `jwksUri`, `directJwksEndpointEnabled` were present and are **not recorded here**. No key material or secret appears in this file.

## 1. `SPIFFE_JWT` — the SDK enum gap, now observed rather than inferred

> **⚠️ FIXED 2026-08-12 (T1-5). This section records the state on 2026-08-10 and its field count has since
> drifted.** The member was withdrawn and `service.get()` works; both FAPI endpoints return `200`. Two numbers
> below are superseded: the response carries **132** fields, not 129 (the Tier 1 writes added three), and the
> enum types **three** service fields, not the one named here. **§17–§19 are the current record.**

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
| `idTokenAudType` | `"string"` | ~~absent~~ → **`"string"`** (T1-4, 2026-08-12) | ✓ |
| `loopbackRedirectionUriVariable` | `true` | `True` | ✓ |
| `traditionalRequestObjectProcessingApplied` | `false` | `False` | ✓ |
| `nbfOptional` | `false` | `False` | ✓ |
| `unauthorizedOnClientConfigSupported` | `true` | `True` | ✓ |
| `idTokenReissuable` | `true` | ~~**`False`**~~ → **`True`** (B1-W6, 2026-08-12) — the flag was the only thing hiding a broken branch | ✓ |
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

> **⚠️ The last sentence of that paragraph was wrong, and finding out cost two work items.** *"The branch is
> correct and would work if the flag were on"* was an inference from reading it, never a test. T1-4 turned the
> flag on and **every refresh returned 400 carrying a valid token body** (B1-W6); the branch demanded a
> `ticket` Authlete does not send, and it was calling `/auth/token/issue` when this action's API is
> `/idtoken/reissue`. So the count is **three** claims, not two: *handled*, *exercisable* and **correct**.
> Fixed 2026-08-12 — `idTokenReissuable` is now `True` and kept; §20 records the write and
> `B1-authlete-boundary.md` F-9 the mechanism.

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
| `authorizationCodeDuration: 0` | "NOT EVIDENCED" — `PROGRESS.md:1688` | **`0`** — confirmed |

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

> **⚠️ Two changes since this table was written (2026-08-10). Both are recorded in full in probe 6 below.**
> A **fourth** client (`2176571218`, `private-key-jwt test client`) was registered on 2026-08-12 by **T1-3**;
> and client `1523514379` acquired a `jwks` at some point *before* that, written by the E2E suite. Neither
> row below is wrong for the date it carries, but neither is current.

| | `Testing App` | `test` | `DPOP` |
|---|---|---|---|
| `clientId` | 4277838306 | 1523514379 | 1678274156 |
| type / auth | PUBLIC / `NONE` | CONFIDENTIAL / `CLIENT_SECRET_BASIC` | PUBLIC / `NONE` |
| `authorizationSignAlg` | absent | absent | absent |
| `authorizationEncryptionAlg` / `Enc` | absent | absent | absent |
| `requestObjectRequired` | `False` | `False` | `False` |
| `requestSignAlg` | absent | absent | absent |
| `requestUris` | **absent** | **absent** | **absent** |
| `jwks` | absent | ⚠️ **present since some E2E run** — see probe 6 | absent |
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
3. **JAR by value works only for `test`, and only with HS\*.** No client has `jwks`/`jwksUri`/`requestSignAlg`, so there is no public key for Authlete to verify an asymmetrically-signed object against; the confidential client's secret is the only usable key. **⚠️ Superseded 2026-08-12 — see §14.** Client `2176571218` now has both, and an ES256 request object validates against it. `modules/05…/lab.md:265` ("generate a client key and register it") is doing real work — it registers one for the exercise.
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
id_token_signing_alg_values_supported   = ["HS256", "HS512", "ES256", "HS384"]     # no RS256  ⚠️ superseded, probe 6
userinfo_signing_alg_values_supported   = ["HS256", "HS512", "ES256", "HS384", "none"]        # ⚠️ superseded, probe 6
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
4. **`introspection_endpoint_auth_methods_supported` is an empty array** — independent corroboration of the unauthenticated-introspection finding in B2, and the *"three-source divergence"* `PROGRESS.md:1915-1918` records for revocation.

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
| `backchannelLogoutUri` | **the repo's `deliver-all` has zero recipients** — carried to the logout batch. **⚠️ Casing corrected 2026-08-12:** this row and `OIDC-BACKCHANNEL-LOGOUT-1.0.md` said `backChannelLogoutUri` (capital `C`). Authlete's field is `backchannelLogoutUri`. The **conclusion holds** — the correctly-spelled key is also unset on all three — but the probe was testing a key that cannot exist, so it would have read "absent" whatever the truth was. Same class as the audit's other self-corrections; see `RESUME.md` §2.5 |
| `frontChannelLogoutUri` | front-channel logout unavailable |
| ~~`postLogoutRedirectUris`~~ | **⚠️ Withdrawn 2026-08-12 — this row tested a field Authlete does not define.** It was never client metadata that happened to be unset: the `Client` schema has no post-logout property at all (0 of 108), and a write is accepted with `200` and discarded. The inference drawn from it — *"which is why `logout.service.ts` validates against `ALLOWED_ORIGINS` instead"* — was accidentally right for the wrong reason. See `OIDC-RP-INITIATED-LOGOUT-1.0.md` **F-4** |
| `authorizationDetailsTypes` | RAR unavailable per client as well as per service. `RFC9396-…` F-1 |
| `defaultAcrs` | no default ACR; with `supportedAcrs` absent too, `acr` is asserted by this server alone |

Present: `bcUserCodeRequired: false`, `subjectType: PUBLIC`, `authTimeRequired: false`, `defaultMaxAge: 0` on all
three; `derivedSectorIdentifier: localhost` on two.

**The five Module 09a console settings, re-checked.** `modules/09a…/lab.md` marks five items `UNVERIFIED` with
the note *"was unset as of 2026-07-28"* (`:36` framing, `:285` JARM, `:441` CIBA, `:533` ACR, `:610` RAR). Probe 3
confirms **all five are still unset on 2026-08-10**. The markers are accurate, not stale — which matters, because
an `UNVERIFIED` note whose premise has silently changed is worse than no note at all.

---

# Probe 6 — the Tier 1 configuration writes (T1-2, T1-3), 2026-08-12

The second pass that wrote, after T0-4's. Authorised, and every write read back and diffed key-by-key before
anything was claimed — which is the rule T0-4 produced when Authlete accepted a nonexistent field with `200`.
Raw HTTP throughout: `service.get()` throws on this service (§1), and the SDK's outbound schemas strip keys
they do not model, so the SDK could not have round-tripped either object safely.

## 11. What was written

| # | Call | Result |
|---|---|---|
| T1-2 | `POST service/update`, all **129** fields, `jwks` gaining one RSA-2048 key (`kid: "rsa-1"`, `use: "sig"`, **no `alg`**) | `200`. Diff over the union of both field sets: **`jwks`, `modifiedAt` — nothing else** |
| T1-3 | `POST client/create` | `201`, `clientId 2176571218`, 53 fields |
| T1-3 | `POST client/update/2176571218` ×3 | `200` each. Two were an `idTokenSignAlg` flip to `RS256` and back, to prove RS256 is issuable; one rotated the client key. All three round-tripped 53 fields with only the intended field and `modifiedAt` moving |

## 12. The discovery diff — one key changed four advertised lists

62 members before, 62 after. Four changed, all the same way:

```
id_token_signing_alg_values_supported
  before ["HS256","HS512","ES256","HS384"]
  after  ["PS384","RS384","HS256","HS512","ES256","RS256","HS384","PS256","PS512","RS512"]

authorization_signing_alg_values_supported     same before, same after
userinfo_signing_alg_values_supported          + the same six, "none" still present
introspection_signing_alg_values_supported     + the same six, "none" still present
```

**The six additions come from one key with no `alg` member.** RFC 7517 §4.4 makes `alg` OPTIONAL (verified
against the primary source this session), so Authlete offers every algorithm the key can compute. Pinning
`alg: RS256` would have satisfied OIDC Discovery §3 and left FAPI's PS256 absent — the audit's prediction that
*"one registered RSA key fixes both"* holds **only** for an unpinned key, which neither `OIDC-CORE-1.0.md` F-2
nor `FAPI-1.0-PART-2-ADVANCED.md` F-2 said.

Two consequences worth carrying. The discouraged `RS256` (FAPI §5.2.2) arrives with the required `PS256` and
cannot be separated without giving up the latter. And **the local JWKS endpoint follows automatically** —
`GET /api/.well-known/jwks.json` returns two public keys with no private components, because
`jwks.service.ts` proxies Authlete's key set rather than holding its own.

## 13. Advertised versus usable — checked, not assumed

Theme 1 is *"advertised but unusable"*, so a change that only adds advertisements would be the audit
committing its own finding. Each was exercised:

| Claim | Evidence |
|---|---|
| RS256 is issuable | client flipped to `RS256`, code flow run, ID token header `{"kid":"rsa-1","alg":"RS256"}`, validated `ACCEPT` against the published key |
| ES256 ID tokens verify against the JWKS | `$PUB_CLIENT_ID`, `kid: "1"`, all thirteen `§3.1.3.7` steps `PASS` |
| `private_key_jwt` authenticates | `client_credentials` **and** `authorization_code`, both `200` |
| the request-object signature is really checked | one flipped byte → `400 [A005328]` |
| `PS256` is issuable | ❌ **not checked.** Advertised only |

## 14. Client `1523514379`'s orphaned JWKS

Found while taking the T1-3 baseline. The client carries an EC P-256 public key, `kid: "e2e-test-key"`,
registered by `server/tests/e2e/e2e.test.ts:1169` — which generates a keypair per run and registers only the
public half, so **the private key no longer exists anywhere**.

Three things follow, and the third is the one worth keeping:

1. `RFC9101-…` F-3 and `RFC7523-…` F-3 both say *"no client has `jwks`"*. **Wording falsified, substance
   intact** — no *usable* client key existed, which is what both findings turn on.
2. **Left in place deliberately.** Removing it means a write to the client 14 E2E blocks and several labs
   depend on, to delete something inert. T0-4's lesson was that writes to shared client state are where
   afternoons go.
3. **The E2E suite mutates shared service state as a side effect of running.** Every "the clients are
   configured as follows" claim in this audit therefore has a shelf life, and no `client/get` snapshot taken
   before an E2E run describes the service after one. That is a property of the audit's evidence base, not of
   this client.

---

# Probe 7 — the Tier 1 configuration block (T1-4, T1-6), 2026-08-12

Same discipline as probe 6: read the whole object, patch, write, re-read, diff key-by-key.

## 15. What was written, and the two surprises

| # | Change | Outcome |
|---|---|---|
| T1-4 | `accessTokenDuration`/`idTokenDuration` 86400 → 3600 | applied, verified live, **then reverted** — see OIDC-W4 |
| T1-4 | `idTokenAudType` absent → `"string"` | ✅ kept. ID-token `aud` is now a bare string |
| T1-4 | `idTokenReissuable` false → true | ⚠️ applied, **broke the refresh grant**, reverted. **B1-W6** |
| T1-6 | `supportedAuthorizationDetailsTypes` → `["payment_initiation"]` | ✅ |
| T1-6 | `supportedAcrs` → `["pwd","mfa"]` | ✅ **despite being `readOnly` in the schema** |
| T1-6 | client `1523514379`: `authorizationSignAlg`, `bcDeliveryMode`, `authorizationDetailsTypes` | ✅ 48 → 51 fields, no collateral change |

Discovery went **62 → 64 members**, gaining `acr_values_supported` and `authorization_details_types_supported`.

**Surprise 1 — `readOnly` in the vendored schema does not mean read-only.** `Service.supportedAcrs` carries
`"readOnly": true` in `docs/openapi-spec.json` (3.0.16), and the write was accepted and persisted, and shows
up in the discovery document. Set this beside T0-4's opposite result — a field **absent** from the schema
accepted with `200` and silently **discarded**. Together they say something sharper than either alone:
**the vendored schema predicts neither what will be stored nor what will be ignored.** The only reliable test
is write-then-read-back, which is why this audit does it every time.

**Surprise 2 — a flag was the only thing hiding a broken code path.** `idTokenReissuable = false` is recorded
in §3.3 as making `token.controller.ts`'s `ID_TOKEN_REISSUABLE` branch *"dead code on this service"*, with the
note that "handled" and "exercisable" are different claims. Turning it on showed a third claim was also
different: **handled, exercisable, and *correct*.** Authlete sends that action with `subject` and a complete
`responseContent` but **no `ticket`**; the branch demands a ticket and falls through to a 400 carrying the
successful body. Every refresh request broke. Reverted; **B1-W6**.

## 16. `NO_INTERACTION` is not only the `prompt=none` path

Found while testing T1-4. A perfectly ordinary authorization request — no `prompt` parameter at all — reaches
Authlete's `NO_INTERACTION` action if it asks for **`offline_access`**:

| Request | Result |
|---|---|
| `scope=openid profile` | redirect to login (interactive) |
| `scope=openid profile offline_access` | `302 …?error=consent_required` |
| `scope=openid profile offline_access` + `prompt=consent` | redirect to login (interactive) |
| `scope=openid profile offline_access` + `prompt=login` | `302 …?error=consent_required` |

That is **OIDC Core §11** being enforced — `offline_access` requires explicit consent, so without
`prompt=consent` the OP cannot proceed silently — and `consent_required` is the correct one of §3.1.2.6's four
errors.

**The consequence is for the audit's own framing.** `OIDC-CORE-1.0.md` F-1 and `RFC9470-…` F-3 both describe
`NO_INTERACTION` as the `prompt=none` path. It is not: this second route reaches the same branch, which means
**before T1-7 every `offline_access` request without `prompt=consent` also received the empty-`Location` 302** —
a second live symptom of that S1 that nobody had noticed, on a request shape with no `prompt` parameter in it.
T1-7 fixed both; only one was known.

---

# Probe 8 — T1-5 and T1-13, 2026-08-12

Same discipline: read the whole object, patch, write, re-read, diff key-by-key. **The read-only half ran
first and on purpose** — T1-5's cost was retiring a working exercise, so the mechanism was *proved* before
anything was written.

## 17. `service.get()` works, and the proof cost nothing

**The offline half.** SDK 1.0.0's `Service$inboundSchema` diffed against `docs/openapi-spec.json` (3.0.16),
which settles the question the six-day outage never answered — *is `SPIFFE_JWT` the only thing wrong?*

| Failure class | Result |
|---|---|
| unknown keys | harmless — plain `z.object`, no `.strict()`/`.passthrough()`. The SDK models **185** of Authlete's **193** `Service` properties and **strips** the other 8 |
| enum member gaps | **`ClientAuthMethod` is the only one.** 16 enum-typed fields reachable from `Service`; the other 15 match member-for-member (`GrantType` 10=10, `ResponseType` 8=8, `JwsAlg` 15=15, `FapiMode` 6=6, `Prompt` 5=5, `DeliveryMode` 3=3, …). `TrustAnchor` is two optional strings |
| nullability | **zero** fields Authlete declares `nullable: true` while the SDK refuses null |

**The gap sits in three fields, not one** — `ClientAuthMethod` types `supportedTokenAuthMethods`,
`supportedRevocationAuthMethods` **and** `supportedIntrospectionAuthMethods`. Every document in this repo
named only the first.

**The live half — one `service/get`, then all parsing in memory.** No write.

```
HTTP 200 · 132 fields          ← nine documents said "129"; the Tier 1 writes added three
supportedTokenAuthMethods         [… 9 members, "SPIFFE_JWT" last]
supportedRevocationAuthMethods     ABSENT
supportedIntrospectionAuthMethods  ABSENT

as-is:              PARSE FAILED — 1 issue
   · supportedTokenAuthMethods.8: invalid_enum_value — received 'SPIFFE_JWT'
without SPIFFE_JWT: PARSE OK
```

**Zod aggregates issues, so *exactly one* is itself the proof** that nothing else in 132 fields fails — the
offline diff and the live parse agree. The 2026-08-10 run had captured only `message: "Response validation
failed"`, which is why this was six days of inference. Both siblings being absent collapsed the three-field
hazard to a single-field write.

## 18. What was written, and the withdrawal that removed three advertisements

| # | Change | Outcome |
|---|---|---|
| T1-5 | `supportedTokenAuthMethods` 9 members → **5** (`NONE`, `CLIENT_SECRET_BASIC`, `CLIENT_SECRET_POST`, `CLIENT_SECRET_JWT`, `PRIVATE_KEY_JWT`) | ✅ `200`, persisted. Diff: **132 → 132 fields, 2 keys** — that field and `modifiedAt` |
| T1-5 | verify the SDK now parses the live response | ✅ `Service$inboundSchema.safeParse` OK; `GET /api/fapi/config` and `/api/fapi/status` both **200** with live values, confirmed against the running server |
| T1-13 | `userInfoSignatureKeyId`, `introspectionSignatureKeyId` → `rsa-1` | ⚠️ applied, **did not achieve the goal**, reverted — see below |

**Discovery went 64 → 62 members, and two of the three losses were not asked for:**

```
token_endpoint_auth_methods_supported
  before [none, client_secret_basic, client_secret_post, client_secret_jwt, private_key_jwt,
          tls_client_auth, self_signed_tls_client_auth, attest_jwt_client_auth, spiffe_jwt]
  after  [none, client_secret_basic, client_secret_post, client_secret_jwt, private_key_jwt]

client_attestation_signing_alg_values_supported      14 algorithms → ABSENT
client_attestation_pop_signing_alg_values_supported  11 algorithms → ABSENT
```

**Withdrawing one auth method removed three advertisements.** Both attestation algorithm lists exist only to
describe `attest_jwt_client_auth`; they are derived, not independently configured — which also settles what
`ATTESTATION-BASED-CLIENT-AUTH.md` F-1 could only list. **Do not read the new 62 as the audit's earlier 62:**
that one lacked `acr_values_supported` and `authorization_details_types_supported`, which T1-6 added and which
are still present. Two different 62s.

## 19. T1-13 — `none` is fixed vendor output, and the write is what proves it

The work item said *"drop `none` from `userinfo_signing_alg_values_supported` and
`introspection_signing_alg_values_supported` — console change"*. **There is no such setting.** No Authlete 3.0
`Service` property lists either set: of 193 properties, the only related ones are the key *selectors*
`userInfoSignatureKeyId` and `introspectionSignatureKeyId`. Both lists are derived from the service JWK Set,
and Authlete's own `service/configuration` example inside `docs/openapi-spec.json` carries `"none"` too.

Establishing that by *reading the schema* would repeat the mistake this audit has made five times, so the only
candidates were written:

```
userInfoSignatureKeyId = introspectionSignatureKeyId = "rsa-1"   → 200, persisted (132 → 134 fields)

userinfo_signing_alg_values_supported
  before [PS384, RS384, HS256, HS512, ES256, RS256, HS384, none, PS256, PS512, RS512]
  after  [PS384, RS384, HS256, HS512,        RS256, HS384, none, PS256, PS512, RS512]
```

**Both lists changed and `none` survived both.** `ES256` left because pinning the RSA key drops the EC key as
a candidate — so the write *did* reach the lists, which is what makes the negative result evidence rather than
an assumption. Reverted; the diff against the pre-write snapshot moved **only `modifiedAt`**.

**Two consequences.** This is **RPL-W4's shape a second time** — a work item naming a knob the vendor does not
have (`OIDC-RP-INITIATED-LOGOUT-1.0.md` F-4). And the advertisement is *accurate*: `Client.userInfoSignAlg`
accepts `NONE`, so an unsigned UserInfo response is a real selectable outcome; for introspection the `Client`
schema has **no** signing property at all, so the list describes the default unsigned response and nothing on
either side can narrow it. **JOSE-W2 and MS-W3 become documentation items** (`JOSE-rfc7515-7517-7519.md`,
`FAPI-2.0-MESSAGE-SIGNING.md`).

---

# Probe 9 — B1-W6, 2026-08-12

## 20. `idTokenReissuable` is on, and this time it stays on

| # | Change | Outcome |
|---|---|---|
| B1-W6 | `idTokenReissuable` false → **true** | ✅ `200`, persisted. Diff: **132 → 132 fields, 2 keys** — that flag and `modifiedAt` |

Discovery is unchanged at 62 members: the flag governs an action on `/auth/token`, not an advertisement.
**T1-4 made this same write and reverted it**; the difference is that the branch it exercises now works
(`B1-authlete-boundary.md` F-9).

**What `/auth/token` returns on this action**, read directly rather than through the server — the field set is
the whole finding:

```
action        : ID_TOKEN_REISSUABLE
ticket       : ABSENT          <-- the defect: the branch demanded one
subject      : "admin"
accessToken  : present         refreshToken : present
jwtAccessToken: ABSENT         idToken      : ABSENT
responseContent keys: [access_token, token_type, expires_in, scope, refresh_token]   <-- NO id_token
```

**Live end-to-end** (authorization-code flow with `openid offline_access`, then `grant_type=refresh_token`
through this server): **200** with a reissued `id_token`, where B1-W6's report was a **400** carrying a valid
token body.

| Claim | ID token before refresh | Reissued | Verdict |
|---|---|---|---|
| `aud` type | `"1523514379"` (string) | `"1523514379"` (**string**) | ✅ and it is not free — see below |
| `iat` | 1786539229 | **1786539233** | ✅ advances; checked against a deliberate 4-second gap, because a same-second refresh proves nothing |
| `auth_time` | 1786539229 | **1786539229** | ✅ holds the *original* authentication time |
| `sub` / `iss` / `acr` | `admin` / `https://blackadi.dev` / `pwd` | unchanged | ✅ |
| `nonce`, `s_hash` | present | **dropped** | ⚠️ `UNVERIFIED` against OIDC Core §12.2 — not fetched for this change |

**The `aud` row is the trap worth carrying.** The reissue request has its **own** `idTokenAudType`, which
*"takes precedence over the `idTokenAudType` property of Service"* and **defaults to `"array"` on omission**.
T1-4 set the service to `"string"` on purpose, so a naive fix that omitted the parameter would have produced
array-`aud` ID tokens on exactly one code path while every other ID token stayed a string. **A vendor default
can silently reverse a configuration decision for a single call site** — set this beside §15's `readOnly`
surprise and T0-4's silent discard: three different ways the vendor's shape does not match its documentation's
implication.

---

## Sources

- Live probe 1: `GET /api/{serviceId}/service/get` — HTTP 200, 129 fields, 2026-08-10, authorised, read-only
- Live probe 2, 2026-08-10, authorised, read-only: `service/get`, `service/configuration` (62 members), `client/get/list` (3 clients)
- Live probe 3, 2026-08-10, authorised, read-only: the same three endpoints, printing the OIDC / CIBA / device / RAR / logout fields above
- Live probe 6, 2026-08-12, authorised, **read-write** (T1-2, T1-3): `service/get`, `service/update`, `service/configuration`, `client/get/list`, `client/create`, `client/get`, `client/update`, plus live OAuth flows against the local server. Pre-write snapshots of `service/get`, `service/configuration` and `client/get/list` were taken first. **No key material or secret is recorded in this file**; the RSA key is identified by `kid` only
- Live probe 9, 2026-08-12, authorised, **read-write** (B1-W6): `service/get` ×2, `service/update` ×1, one direct `POST /auth/token` with a refresh token to read the raw `ID_TOKEN_REISSUABLE` response, plus three authorization-code flows and their refreshes against the local server. Pre-write snapshot taken first. Tokens appear truncated or by length only; no `client_secret` or key material is recorded
- Live probe 8, 2026-08-12, authorised, **read-write** (T1-5, T1-13): `service/get` ×5, `service/configuration` ×4, `service/update` ×3 (one of them a revert), plus `GET /api/fapi/config` and `GET /api/fapi/status` against the running server. The read-only proof ran **before** any write. Pre-write snapshots of `service/get` and `service/configuration` taken first; all schema parsing done locally against `Service$inboundSchema`. **No key material or secret is recorded here** — keys appear by `kid` only
- `RFC 7517` §4.4 — `https://www.rfc-editor.org/rfc/rfc7517.html` — *"Use of this member is OPTIONAL"* (JSON Web Key, Standards Track, May 2015), fetched 2026-08-12
- SDK 1.0.0: `models/clientauthmethod.ts`, `models/service.ts:634-642`, `models/granttype.ts`
- Authlete flags page — `https://developers.authlete.com/configuration-reference/error-handling-debugging/flags-supported-in-authlete.md`
- RFC 9700 §§2.1.1, 2.1.2, 2.2.2, 2.4 — `https://www.rfc-editor.org/rfc/rfc9700.html`
