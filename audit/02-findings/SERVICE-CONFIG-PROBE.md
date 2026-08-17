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
| `authorizationCodeDuration: 0` | "NOT EVIDENCED" — `PROGRESS.md:1865` | **`0`** — confirmed |

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
4. **`introspection_endpoint_auth_methods_supported` is an empty array** — independent corroboration of the unauthenticated-introspection finding in B2, and the *"three-source divergence"* `PROGRESS.md:2092-2095` records for revocation.

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

## 21. The ninth pass — and the discovery that **this audit has been reading a different service than the public deployment**

*Written 2026-08-14, executing DR-11, DR-03 and DR-05. Three writes, each read → write → read-back → diffed
key-by-key. **Zero unexpected field changes across all three.***

### 21.1 The finding that had to come first

Probing the live Render deployment before writing anything showed its discovery document disagreeing with the
service this audit reads. Not slightly — **three independent ways**, which is what rules out a caching or
timing explanation:

| | Audited service **`3693555522`** | The live deployment's service |
|---|---|---|
| `issuer` | `https://blackadi.dev` | `https://blackadi.dev/` — **trailing slash** |
| endpoints | the ngrok tunnel | the Render host |
| discovery members | **62** | **59** |
| `id_token_signing_alg_values_supported` | 10, including **RS256/PS256** | 4 — **no RSA at all** |
| `token_endpoint_auth_methods_supported` | 5, including **`private_key_jwt`** | 3 — **no `private_key_jwt`** |
| `grant_management_actions_supported` | 5 | 3 — no `query`, no `revoke` |
| `scopes_supported` | — | carries `digital_credential`, which the audited service lacks |

**The live service lacks T1-2's RSA key and T1-3's `private_key_jwt` client** — two of Tier 1's headline
configuration fixes. So every configuration finding in this audit describes `3693555522`, and a reader who
assumed "the deployment" would have been wrong about which service was fixed.

**Ruled 2026-08-14: `3693555522` is canonical**, and the deployment is to be repointed at it
(`AUTHLETE_SERVICE_ID` + `AUTHLETE_BEARER_TOKEN` in the Render dashboard). No re-probing is owed; the audit's
evidence stands as written.

**The transferable lesson is about verification, not configuration.** The check that found this was comparing
*the document the deployment serves* against *the document the service generates* — two sources that should be
identical and were not. **Reading either one alone proves nothing about the other.** The same reasoning
retired a false conclusion minutes earlier: `POST /api/device/complete` on the deployment answered **404**,
which looks like `developmentOnly` firing, and the body said `[A227301] No record for the user code exists` —
Authlete's `USER_CODE_NOT_EXIST`. **The request had reached Authlete; the gate had not fired.** Right status,
wrong reason. Status codes are not evidence about which code path produced them.

### 21.2 DR-11 — `issuer` and every endpoint aligned

**15 fields written, 16 changed** (the fifteenth is `modifiedAt`), **0 unexpected**. `issuer` and all fourteen
URL-valued fields moved from `https://blackadi.dev` / the ngrok tunnel to `https://oauth2-0-ekh2.onrender.com`,
including **`deviceVerificationUri`** and `deviceVerificationUriComplete` — which closes **8628-W5**, since
RFC 8628 §3.2's human-facing URI is no longer on an ephemeral tunnel.

**Verified:** the generated document's `issuer` is exactly the host, and **all 13 URL members sit under it**, so
RFC 8414 §3.3 passes for the first time in this audit. **`DISCOVERY-…` F-1 and `8414-W1` close.**

Note the method: `service/update` has **replace semantics**, so the write sends the whole 132-field object
back with fifteen fields mutated. That is the same hazard `CLIENT-UPDATE-FIELD-LOSS` describes for clients —
here it is handled by construction rather than by an allowlist, which is why the diff shows nothing collateral.

### 21.3 DR-03 + DR-05 — VCI and CIMD enabled

**4 fields changed, 0 unexpected**: `verifiableCredentialsEnabled` false → **true**,
`clientIdMetadataDocumentSupported` false → **true**, `credentialIssuerMetadata` absent → populated,
`modifiedAt`. Discovery grew **62 → 64** members.

**One trap, and the schema is the only place it is stated.** `credentialIssuerMetadata.credentialsSupported`
is typed **`string`**, not an array — a *stringified* JSON object keyed by configuration id. Authlete's own
description says why: *"Due to a breaking change in December 2023, this was changed from a JSON array to a JSON
object."* The obvious array-of-objects shape is refused with **`[A126202]`**. `authorizationServers` is
deliberately omitted, per the schema's *"When the credential issuer works as an authorization server for
itself, this property should be omitted."*

**Verified:** `POST /vci/metadata` now answers **`OK`** with a conformant OID4VCI §12.2.4 document carrying all
three REQUIRED members — `credential_issuer`, `credential_endpoint`, `credential_configurations_supported`.
**`OID4VCI-1.0.md` F-1 closes**, and with it the second member of the *claimed-working / flag-off* pattern.

### 21.4 The verification that retires an `UNVERIFIED` marker

`POST /vci/deferred/parse` with a deliberately bogus access token now answers:

```
action: UNAUTHORIZED
[A375304] The access token does not exist.
```

Three things at once, and all three were `UNVERIFIED` when **VCI-W5** shipped on 2026-08-13. The endpoint is
live (`FORBIDDEN` would mean the feature is still off). **The deferred path validates the access token** —
which is the entire control VCI-W5 added, and the reason the two-call `parse → issue` shape was necessary. And
the `requestContent` this server synthesises (`{"transaction_id":"…"}`) is accepted, since Authlete parsed it
far enough to reach token validation. **`UNAUTHORIZED` → 401 is exactly the mapping `vci.controller.ts`
implements.**

### 21.5 Redirect URIs — additive, and one computed field moved

All four clients gained `https://oauth2-0-ekh2.onrender.com/callback`, **added to** their existing entries;
every `localhost` and the one ngrok URI survive, because Modules 02 and 03 depend on two of these clients and
`client/update` has replace semantics. Diffed per client: `redirectUris` and `modifiedAt` as intended — plus
**`derivedSectorIdentifier` on three of the four**, which was *not* intended and is worth stating rather than
waving through.

It went from a value to **unset**. That is Authlete recomputing it: OIDC Core §8.1 derives the sector
identifier from the redirect URIs' host, and a client whose URIs now span three hosts with no
`sectorIdentifierUri` has no single host to derive from.

**Impact today: none.** All four clients are `subjectType: PUBLIC`, so no pairwise `sub` is computed and the
sector identifier is unused — checked, not assumed. **Impact later: a precondition.** Switching any of these
clients to `PAIRWISE` now requires setting `sectorIdentifierUri` explicitly, where before the derivation would
have supplied one. Recorded so that a future pairwise experiment does not read as a regression caused by
something else.

### 21.6 One acceptance criterion that cannot be met — the third instance

**VCI-W2 wants `credential_issuer` in the AS discovery document.** It is **absent**, and there is no field to
set: the `Service` schema's credential-related properties are `verifiableCredentialsEnabled`,
`credentialJwksUri`, `credentialOfferDuration`, `credentialTransactionDuration`, `credentialJwks`,
`credentialDuration` and `credentialIssuerMetadata` — **none of which surfaces `credential_issuer` on the AS
side.** Setting `credentialIssuerMetadata.credentialIssuer` populates the *issuer* document, not the AS one.

**This is the third time an acceptance criterion has named a console change with no console field behind it** —
after **RPL-W4** (`postLogoutRedirectUris` is not an Authlete 3.0 client field) and **T1-13** (no service field
controls the userinfo/introspection signing-algorithm lists). The pattern is now established well enough to be
a rule: **check that the field exists before writing "set X" as a criterion.** VCI-W2's AS half is
`UNACHIEVABLE`; its issuer half is satisfied.

---

# Probe 10 — T2-17 batch 8, 2026-08-14 (read-only)

## 22. Two work items answered without a single write

Both were listed as needing a probe. Neither needed a change, and one of them contradicts the finding it
belongs to. **No service or client field was modified in this pass** — every call below is a read or an
`/auth/authorization` evaluation, which creates a ticket and nothing else.

### 22.1 8707-W3 — RFC 8707 §2's remaining two rules, both satisfied

Five `/auth/authorization` calls against `1678274156`, varying only `resource`:

| `resource` | `action` | Result |
|---|---|---|
| one absolute URI | `INTERACTION` | accepted |
| **two values** | `INTERACTION` | **accepted** |
| **one carrying a query component** (`…/orders?v=1`) | `INTERACTION` | **accepted** |
| one carrying a fragment (control) | `LOCATION` | `error=invalid_target`, `[A251308] The value of a 'resource' includes a fragment component.` |
| a relative reference (control) | `LOCATION` | `error=invalid_target`, `[A251307] The value of a 'resource' is not an absolute URI.` |

**Both values survive, and so does the query component.** A request carrying
`resource=https://api.example.com/orders?v=1` **and** `resource=https://api.example.com/payments` comes back
with the AS echoing exactly:

```json
"resources": ["https://api.example.com/orders?v=1", "https://api.example.com/payments"]
```

That completes §2's rule set. §2 permits a query component and forbids only a fragment, and Authlete
implements precisely that distinction — the two controls prove the checks are live rather than absent, which
is what makes the two acceptances meaningful. **The multi-value case matters most**: RFC 8707 §2 allows more
than one `resource`, and an AS that silently kept only the first would produce a token audience-restricted to
half of what was asked for, with no error.

### 22.2 JARM-W2 — the anomaly is **not** error-path-only; it is one error code

JARM-W2 asked whether F-2's `form_post.jwt` anomaly is general or confined to the error path. **The lab's
careful caveat turns out to be too broad in one direction and too narrow in the other.** Six calls, varying
the client and the path:

| Client | `response_mode` | Path | `action` | `responseContent` |
|---|---|---|---|---|
| `4277838306` — no `authorizationSignAlg` | `form_post.jwt` | error `[A012305]` | **`LOCATION`** | **an HTML document** ← the anomaly |
| `4277838306` — no `authorizationSignAlg` | `query.jwt` | error `[A012305]` | `LOCATION` | a URL ✅ |
| `1523514379` — `ES256` | `form_post.jwt` | **success** | **`FORM`** | an HTML document ✅ |
| `1523514379` — `ES256` | `form_post.jwt` | **error** (`invalid_target`) | **`FORM`** | an HTML document ✅ |
| `1523514379` — `ES256` | `query.jwt` | success | `LOCATION` | a URL ✅ |
| `1523514379` — `ES256` | `query.jwt` | error | `LOCATION` | a URL ✅ |

**The success path is correct and so is the configured error path.** Row 3 and row 4 both answer `FORM`,
which is right: a `form_post` response mode is delivered as an HTML auto-submitting form with 200, not as a
redirect. This server handles it — `authorization.controller.ts` has a `case "FORM"`.

**The defect is one error code.** `[A012305]` is *"the authorization request required the authorization
response be encoded as JWT … but `authorization_signed_response_alg` … is not set"*. On that path alone
Authlete builds the `form_post` HTML body and then labels it `LOCATION`, so a compliant caller puts a whole
HTML document in a `Location` header. Every other combination picks the right action.

**Why the lab recorded it as it did, and why that is now the interesting part.** The lab's probe ran *before*
JARM-W1 set `authorizationSignAlg` on 2026-08-12, so **every** `form_post.jwt` request it could make was an
`[A012305]` request — the anomaly looked like the response mode's error path because no other error path was
reachable. Configuring JARM removed the only trigger. **A defect that disappears when you configure the
feature correctly is easy to mistake for a defect in the feature**, and the way to tell them apart was to
find a *second* error on the same mode, which row 4 is.

**Consequence for JARM-W6 (report upstream):** it now has a minimal reproduction — one client with
`responseModes` including `FORM_POST_JWT` and no `authorizationSignAlg`, one authorization request with
`response_mode=form_post.jwt`, observe `action: LOCATION` carrying `<html>…`. That is a better bug report
than the original observation, which could not say which of two conditions caused it.

# Probe 11 — T2-17 batch 8, the two writes, 2026-08-15

## 23. The DPoP nonce dance, observed — and back-channel logout advertised

### 23.1 9449-W6 — the nonce transcript this audit had never been able to produce

**Method.** `dpopNonceRequired: false → true` and `dpopNonceDuration: 0 → 300`, three `client_credentials`
token calls each carrying a fresh ES256 DPoP proof, then both fields restored. Read → write → probe → revert
→ diff: **0 unexpected field changes**, both values back to `false` / `0`.

| # | Proof carries | `action` | `resultCode` | Body / header |
|---|---|---|---|---|
| 1 | **no `nonce`** | `BAD_REQUEST` | `A254307` | `{"error":"use_dpop_nonce", …}` **+ a `DPoP-Nonce`** |
| 2 | the nonce from 1 | **`OK`** | `A052001` | success — **and a `DPoP-Nonce` again** |
| 3 | a bogus `nonce` | `BAD_REQUEST` | `A254307` | `{"error":"use_dpop_nonce", …}` |

**Both halves of 9449-W5's correction are now observed rather than argued.** That item fixed `AGENTS.md`
from the specification alone and marked the area unexercisable. It was right twice:

- **§8's status is 400 at the authorization server.** Authlete answers `BAD_REQUEST`, which
  `token.controller.ts` maps to `400`. The old *"401 for both"* claim would have left a client that only
  retries on 401 never retrying at the token endpoint — the nonce dance could not have started.
- **A stale or mismatched nonce is `use_dpop_nonce`, not `invalid_dpop_proof`.** Row 3 confirms it. Reserve
  `invalid_dpop_proof` for a proof that is genuinely malformed.

**Three things the specification does not tell you, all worth keeping.**

1. **The nonce is time-based, not one-time.** All three calls returned the *same* `DPoP-Nonce`, including
   the successful one. It is valid for `dpopNonceDuration` (300 s here), so a client caches it and reuses it
   rather than re-fetching per request. A client written to expect a fresh nonce per response would work,
   but one written to expect *rotation* — treating a repeated nonce as a replay — would be wrong.
2. **A nonce is returned on success at the token endpoint**, which is what `AGENTS.md` says token/PAR
   endpoints may do and protected resources may not. Confirmed for the token endpoint.
3. **`A254307`'s message is inaccurate for the absent case, and the code does not distinguish it.** Both
   row 1 and row 3 give `[A254307] DPoP nonce error: The value of the 'nonce' claim in the DPoP proof JWT is
   different from the expected one.` — but **row 1 sent no `nonce` claim at all**. There is nothing
   *different from expected* about a claim that is absent. Anyone debugging a first-contact request will
   read that message and go looking for a wrong value they never sent. Vendor behaviour; the `error` code is
   correct in both cases, which is the part a client acts on.

**The relay is already correct here.** `token.controller.ts:69` calls `setDpopNonce(res, result.dpopNonce)`
**before** the `switch`, so every branch — `OK`, `BAD_REQUEST` and the rest — emits the header. Placing it
before the switch rather than per-branch is why row 1 and row 2 both carry it. `par.controller.ts`,
`userinfo.controller.ts`, `introspection.controller.ts` and `require-grant-ownership.ts` do the same through
the same helper.

**The live posture is unchanged.** `dpopNonceRequired` is `false` again, so none of the above is reachable on
this deployment — it is now *documented from observation* rather than from reading, which is the whole
difference between this and 9449-W5.

### 23.2 BCL-W5 — advertised, and one client registered

| Target | Before | After |
|---|---|---|
| `service.backchannelLogoutSupported` | `false` | **`true`** |
| `client 1523514379 .backchannelLogoutUri` | absent | `https://oauth2-0-ekh2.onrender.com/api/backchannel_logout` |

Both writes `200`; **0 unexpected field changes** on either object. The client canaries held —
`tokenAuthMethod` is still `CLIENT_SECRET_BASIC` and `authorizationSignAlg` still `ES256`, which matters
because `client/update` **replaces** rather than merges (CU-W1) and those are the two fields a careless
update resets to Authlete's weakest defaults.

Discovery now carries **`backchannel_logout_supported: true`**, and the document is at **65 members**.
`backchannel_logout_session_supported` is **absent**, consistent with `backchannelLogoutSessionSupported`
remaining `false` — Session Management and `sid` are declined together under DR-08, so advertising session
support would have been the false half of a true claim.

> **What this does and does not establish.** F-4's delivery path is now executable: a client with a
> `backchannel_logout_uri` exists, so `issueAndDeliverToAll` has somebody to deliver to. **The somebody is
> this deployment itself** — a loopback, because there is no third-party RP to register. That makes the path
> *demonstrable*, not *interoperable*. Recorded as such deliberately: writing "back-channel logout works" on
> the strength of a loopback would be the *advertised but unusable* defect this audit found four times, and
> the discovery document is exactly where such a claim would mislead.

## 24. The three configuration-gated `UNVERIFIED` markers, 2026-08-17

Three markers in `docs/` survived only because a service flag was off. Each was taken to a terminal state:
`dpopNonceRequired` and `nativeSsoSupported` **declined** (DR-20, DR-04 re-ruled), `accessTokenSignAlg`
**deferred** (DR-09 upheld). All three were probed by set → probe → revert, and **every revert was confirmed
by a read-back, not by the write's status code**.

> **A methodological note that belongs before the transcripts, because it changed two conclusions.** Two of
> the markers told the reader *"turn this flag on and you will see X."* **Neither instruction produces X.**
> A marker that names a remedy nobody has executed is a hypothesis wearing the costume of a finding — and
> because it reads as actionable, it is *less* likely to be re-checked than a plain "unknown".

### 24.1 DR-20 — `dpopNonceRequired`, and the two things §23.1 could not have seen

§23.1 (2026-08-15) observed the nonce dance at the **token** endpoint with `client_credentials`. Two
questions it did not reach decide whether the flag can be left on:

**Method.** `dpopNonceRequired: false → true`, `dpopNonceDuration: 0 → 300`; probes; both restored.
Read → write → read-back → probe → revert → read-back. **0 unexpected field changes** in both directions,
and the revert re-read confirmed `false` / `0`. Client `1678274156` was **driven, never written**.

| # | Call | Proof carries | Result |
|---|---|---|---|
| A1 | `/auth/token`, `authorization_code` | **no `nonce`** | `BAD_REQUEST` `A254307`, `{"error":"use_dpop_nonce"}` **+ `dpopNonce`** |
| A2 | `/auth/token`, **the same code again** | that nonce | **`OK` `A050001`** — access + refresh + ID token |
| B1 | `/pushed_auth_req` | **no `nonce`** | `BAD_REQUEST` **`A350308`** + `dpopNonce` |
| B2 | `/pushed_auth_req` | that nonce | **`CREATED` `A245001`**, and **`dpopNonce` present on the success too** |
| C1 | `/auth/token`, no DPoP header at all | — | **`OK`** — unaffected |

**A2 is the important row: an authorization code SURVIVES a `use_dpop_nonce` refusal.** The refusal happens
before the code is redeemed, so the retry the specification asks for is genuinely available. That removes the
obvious objection to enabling the flag — and makes the actual objection (§24.2) the only one.

**B1/B2 settle `FAPI-TUTORIAL.md`'s PAR block.** That block used to show a `DPoP-Nonce` header on the
`201 Created`, and the 2026-08-14 correction removed it as *"`UNVERIFIED`, and not producible here"*. Both
halves were right about **this** deployment and the second was misleading about the protocol: with the flag
on, Authlete returns a nonce on the PAR **success** response, exactly as the deleted block showed. The block
was not wrong; it was unreachable. Note also that PAR's nonce error code is **`A350308`**, *not* the token
endpoint's `A254307` — two codes for one condition, and §23.1 had only seen one of them.

### 24.2 Why DR-20 declines anyway — the SPA discards the nonce it is sent

`dpopNonceRequired` costs nothing to any caller that retries. **This repo contains no such caller.**

```
client/src/services/token.service.ts:36   if (!response.ok) throw new Error(await response.text());
client/src/services/token.service.ts:38   const dpopNonce = response.headers.get('dpop-nonce') || undefined;
```

The throw is on the line **before** the header read, and `http.ts` repeats the shape at nine call sites. So
on a `400 use_dpop_nonce` the SPA discards the `DPoP-Nonce` that came with it. `sessionStorage.dpop_nonce` is
written only from a **success** response, so it is never populated — and the failure is therefore **permanent,
not first-request-only**. Every DPoP path in the SPA (`FapiSection`, `ParSection`, `RarSection`,
`CallbackPage`) fails on every attempt, forever.

**This is what makes the existing marker's advice wrong.** `PAR-TUTORIAL.md` told the reader: *"To make the
section runnable yourself: Service Settings → … → Require Nonce, plus a non-zero duration."* Following it does
not make the section runnable — it makes the SPA's DPoP flows permanently fail, and the reader will read
`A254307`'s misleading *"different from the expected one"* text while debugging a nonce they never sent.

**Revisit trigger:** the SPA's HTTP layer reads `DPoP-Nonce` from error responses and retries once. That is a
change to `client/src/services/dpop.service.ts` and the shared HTTP layer — the former is a **Security-critical
surface** (*DPoP / proof-of-possession*). Once it exists, enabling costs nothing and DR-20 should be reopened.

### 24.3 DR-04 — Native SSO, and the marker whose question had a third answer

`NATIVE-SSO-TUTORIAL.md:33` asked whether a device-secret exchange reaches
`token-exchange-response.handler.ts` (`action: TOKEN_EXCHANGE`) *"rather than handling Native SSO natively and
answering `OK`"*, and instructed: *"Settle it by enabling the flag and reading `action`."*

**Method.** `nativeSsoSupported: false → true` and `device_sso` added to `supportedScopes`; a **throwaway
confidential client** created, used and deleted (the CU-W1 pattern — the four real clients were never
written); both service fields restored. **0 unexpected field changes**; revert confirmed by read-back;
client re-read returned **404**.

| Step | Call | Result |
|---|---|---|
| 1 | `/auth/authorization`, `scope=openid device_sso` | `INTERACTION`, **`nativeSsoRequested: true`** |
| 2 | `/auth/authorization/issue` **with `sessionId`** | `LOCATION` + code |
| 3 | `/auth/token` (`authorization_code`) | **`NATIVE_SSO` `A050002`** — `responseContent` **undefined**, `deviceSecret` **ABSENT**, `sessionId` present |
| 4 | `/nativesso`, AS-minted `deviceSecret` + `deviceSecretHash` | **`OK` `A501001`** — `device_secret` returned; ID token carries **`sid`** and **`ds_hash`**, and `ds_hash` equals our `base64url(SHA-256(secret))` |
| 5 | `/auth/token`, token exchange with `actor_token_type=urn:openid:params:token-type:device-secret` | **`NATIVE_SSO` `A311002`** — and here `deviceSecret` **IS** present |

**The answer is `NATIVE_SSO`, which is neither option the marker offered.** Both phases route to
`case "NATIVE_SSO"` (`token.controller.ts:173`) → `handleNativeSso`. The device-secret exchange therefore
**never reaches `token-exchange-response.handler.ts` at all**, so that handler's two deliberate defects —
dropping `actor_token`, omitting `issued_token_type` — are **irrelevant to Native SSO**. The marker's warning
pointed at the wrong file. *(Same shape as JARM-W2, where the answer was also neither option.)*

**Three things the flag alone does not give you, in the order they bite.**

1. **`sessionId` is mandatory.** Without it, `/auth/authorization/issue` answers `LOCATION` carrying
   `error=server_error` — **`[A499201]` *"The 'sessionId' parameter must be provided … when the authorization
   request requests a Native SSO-compliant ID token."*** `authorization.service.ts:135` already supplies one
   (`crypto.randomUUID()` when `nativeSsoRequested`), so **this server clears the bar and a naive probe does
   not**. Recorded because the first two probe runs failed here and the *downstream* symptom was
   `[A050305] No such authorization code` — a code extracted from an error redirect that carried none.
   **Right-looking failure, wrong cause**, and the same trap as `device/complete`'s two different 404s.
2. **NEW — `handleNativeSso` cannot complete Phase 1, and returns HTTP 500.** Step 3 shows Authlete returns
   **no `deviceSecret`** on the first authorization-code exchange; SDK 1.0.0's own model says the AS *"is free
   to generate a new device secret"*. But `controllers/native-sso-response.handler.ts:22-28` reads
   `result.deviceSecret` and, finding it absent, answers
   `500 {"error":"server_error","error_description":"Missing accessToken or deviceSecret for Native SSO"}`.
   **The server never mints a device secret and never computes `deviceSecretHash`.** So Phase 1 — the only way
   to bootstrap Native SSO — is a guaranteed 500 the moment the flag goes on. Step 4 proves the rest of the
   chain works *once the AS mints one*, which is what turns this from a guess into a scoped work item.
   **Not fixed, deliberately:** DR-04 declines the feature, and fixing it would ship half of a declined
   feature. Recorded in `NATIVE-SSO-1.0.md`.
3. **Public clients cannot do Phase 2 here.** Step 5 first answered
   **`[A311304] This service does not allow public clients to make token exchange requests`** —
   `tokenExchangeByConfidentialClientsOnly` is `true`. Native SSO exists **for native mobile apps**, which are
   public clients, so on this service the flag would advertise a capability the target client type cannot use.
   `Part 6`'s checklist does not mention client type. (A wrong `audience` also earns **`[A311337]`**: it must be
   the OP's issuer, not the client id.)

**Discovery:** with the flag on, `native_sso_supported: true` appears and the document goes **66 → 67**
members; it was the *only* member that moved. Reverted.

> **DR-04's second ground is now proven rather than predicted.** The record said *"enabling the flag first
> would produce a two-app sequence that half-works — worse teaching material than a stated gap."* It does not
> even half-work: it produces a **500 on the first request**, from code that looks correct and compiles. The
> decline stands, on stronger evidence than it was made with.

### 24.4 One adjacent reading, not attributable

The discovery document is at **66 members** (`service/configuration`, `/api/.well-known/openid-configuration`
and `/.well-known/oauth-authorization-server` all agree). `AGENTS.md` and `RESUME.md` record **65** as of
2026-08-15. Both probes above reverted with **0 field diffs**, so neither caused it, and no member list from
2026-08-15 was kept to diff against — **so the extra member cannot be attributed here.** Recorded as an
observation, not a finding. `AGENTS.md`'s own rule applies: *count it, do not quote it.*

### 24.5 DR-09 — `accessTokenSignAlg`: the instruction was right, and the tokens would be non-conformant

**Method.** `accessTokenSignAlg: unset → ES256`; **one** access token minted through
`/auth/authorization` → `/auth/authorization/issue` (with `acr: "pwd"` and an `authTime`, as
`services/authorization.service.ts` does) → `/auth/token`, with **no `resource` parameter**; field unset
again. Client `1678274156` driven, never written. **0 unexpected field changes** in both directions, and a
**post-revert token re-measured at 43 characters / 0 dots** — opaque again, proven rather than assumed.

| | Before | With `accessTokenSignAlg: ES256` |
|---|---|---|
| access token | 43 chars, 0 dots | **500 chars, 2 dots** |
| `jwtAccessToken` on the token response | absent | **present** |
| header | — | `{"alg":"ES256","typ":"at+jwt","kid":"1"}` |
| payload claims | — | `acr, auth_time, client_id, exp, grant_type, iat, iss, jti, scope, sub` |

**`STEP-UP-AUTH-TUTORIAL.md`'s instruction is correct — the only one of today's three that was.**
*"Set `accessTokenSignAlg` to make Part 4 literal."* Part 4 prints eight claims; **all eight are present**,
`typ` is `at+jwt` per RFC 9068 §2.1, `acr` is `"pwd"`, and `auth_time` equals the epoch passed to
`/auth/authorization/issue` exactly. Two claims are present that Part 4 does not show: `jti`, and a
**`grant_type`** claim RFC 9068 does not define.

> **⚠️ And the flag still must not be set — 9068-F3 is now observed rather than predicted.** With no
> `resource` parameter the token carries **no `aud`**. RFC 9068 **§2.2 lists `aud` as REQUIRED** and **§3**
> requires a default resource indicator when `resource` is absent. So enabling this flag makes **every access
> token this deployment issues** violate a MUST — and it would be invisible, because nothing in this repo
> validates `aud` and every token would keep working. **The choice is between an honest gap and a silent
> violation**, which is a stronger argument for DR-09's defer than the one DR-09 was ruled on.
>
> The prerequisite is now specific: satisfy §3's default `aud` first. It is not "decide to flip a flag."

**Blast radius, measured rather than recalled.** DR-09 named two couplings; `grep` for opaque-token claims
returns **86 lines across 13 files** — `modules/04…/lab.md`'s `# → 43 chars, opaque`, five assertions in
Module 04's README, plus Modules 02, 03, 06, 08 and 10, `AUDIT-PASS-A/B.md` and `PROGRESS.md`.

## Sources

- Live probe 1: `GET /api/{serviceId}/service/get` — HTTP 200, 129 fields, 2026-08-10, authorised, read-only
- Live probe 2, 2026-08-10, authorised, read-only: `service/get`, `service/configuration` (62 members), `client/get/list` (3 clients)
- Live probe 3, 2026-08-10, authorised, read-only: the same three endpoints, printing the OIDC / CIBA / device / RAR / logout fields above
- Live probe 6, 2026-08-12, authorised, **read-write** (T1-2, T1-3): `service/get`, `service/update`, `service/configuration`, `client/get/list`, `client/create`, `client/get`, `client/update`, plus live OAuth flows against the local server. Pre-write snapshots of `service/get`, `service/configuration` and `client/get/list` were taken first. **No key material or secret is recorded in this file**; the RSA key is identified by `kid` only
- Live probe 9, 2026-08-12, authorised, **read-write** (B1-W6): `service/get` ×2, `service/update` ×1, one direct `POST /auth/token` with a refresh token to read the raw `ID_TOKEN_REISSUABLE` response, plus three authorization-code flows and their refreshes against the local server. Pre-write snapshot taken first. Tokens appear truncated or by length only; no `client_secret` or key material is recorded
- Live probe 8, 2026-08-12, authorised, **read-write** (T1-5, T1-13): `service/get` ×5, `service/configuration` ×4, `service/update` ×3 (one of them a revert), plus `GET /api/fapi/config` and `GET /api/fapi/status` against the running server. The read-only proof ran **before** any write. Pre-write snapshots of `service/get` and `service/configuration` taken first; all schema parsing done locally against `Service$inboundSchema`. **No key material or secret is recorded here** — keys appear by `kid` only
- Live probe 11, 2026-08-17, authorised, **read-write** (§24 — DR-20, DR-04, DR-09): `service/get` ×many, `service/update` ×8 (four of them reverts), `service/configuration` ×3, `client/create` + `client/delete` ×4 (throwaway clients, all re-read as **404** after deletion), plus `auth/authorization`, `auth/authorization/issue`, `auth/token`, `pushed_auth_req` and `nativesso`. Pre-write snapshot taken before each write; **every revert verified by a read-back rather than by the write's status**. The four registered clients were driven but **never written**. No key material, `client_secret` or device secret is recorded here — tokens appear truncated or by length only
- `RFC 7517` §4.4 — `https://www.rfc-editor.org/rfc/rfc7517.html` — *"Use of this member is OPTIONAL"* (JSON Web Key, Standards Track, May 2015), fetched 2026-08-12
- SDK 1.0.0: `models/clientauthmethod.ts`, `models/service.ts:634-642`, `models/granttype.ts`
- Authlete flags page — `https://developers.authlete.com/configuration-reference/error-handling-debugging/flags-supported-in-authlete.md`
- RFC 9700 §§2.1.1, 2.1.2, 2.2.2, 2.4 — `https://www.rfc-editor.org/rfc/rfc9700.html`
