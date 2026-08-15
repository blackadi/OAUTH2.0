# 01 — Specification matrix

**Phase 1.** One row per specification in scope, with the Authlete-side surface that Phase 2 will
audit the code against. **No verdicts appear in this file** — that is Phase 2.

- **Authlete version pinned:** 3.0 (see `00-inventory.md` §1)
- **SDK:** `@authlete/typescript-sdk@1.0.0`, read directly from `server/node_modules/`

## Provenance of each column

| Column | Source | Trust |
|---|---|---|
| Spec ID, exact title, status/type, date | `docs/curriculum/SPEC-INVENTORY.md`, verified against primary sources 2026-07-27 and fully re-verified 2026-08-02 | Accepted under the Gate 0 **delta-audit** ruling. §6 lists the rows selected for spot re-verification. |
| Authlete doc page | `developers.authlete.com/llms.txt`, resolved this session — no URL constructed by pattern | Fetched this session |
| Authlete-side surface (API, flags, fields, action values) | The **installed SDK's generated models**, which are Speakeasy output from Authlete's OpenAPI, plus the doc pages fetched this session | SDK is authoritative for the pinned version; doc pages are authoritative for division of labour and version floors |
| Minimum Authlete version | Authlete doc pages fetched this session | Stated only where the page states it |

Where a doc page and the SDK disagree, **both are recorded** and the disagreement is called out. Two
such disagreements already exist (§5).

---

## 1. Group A — core protocol

| Spec | Exact title | Status | Authlete page | Authlete-side surface | Min ver |
|---|---|---|---|---|---|
| RFC 6749 | The OAuth 2.0 Authorization Framework | Published RFC, Oct 2012 | `/protocols-and-flows/basic-oauth-oidc-flows/o-auth-2-0-basics` | `authorization.processRequest/issue/fail`, `token.process/issue/fail`. `AuthorizationResponseAction` 6 values; `TokenResponseAction` 9 values | — |
| RFC 6750 | The OAuth 2.0 Authorization Framework: Bearer Token Usage | Published RFC, Oct 2012 | `/configuration-reference/endpoints/protected-resource` | `userinfo.process` (`token`, `dpop`, `htm`, `htu`); §2.3 query params not supported by design in this repo | — |
| RFC 7009 | OAuth 2.0 Token Revocation | Published RFC, Aug 2013 | `/configuration-reference/tokens-and-claims/token-revocation-policy` | `revocation.process`; `RevocationResponseAction` = `INTERNAL_SERVER_ERROR, INVALID_CLIENT, BAD_REQUEST, OK` | — |
| RFC 7515 / 7517 / 7519 | JWS / JWK / JWT | Published RFCs, May 2015 | `/configuration-reference/key-management/*`, `/configuration-reference/metadata/publishing-a-jwk-set` | `jwkSetEndpoint.serviceJwksGetApi`; `joseObject.joseVerifyApi` | — |
| RFC 7636 | Proof Key for Code Exchange by OAuth Public Clients | Published RFC, Sep 2015 | `/protocols-and-flows/protocol-extensions/proof-key-for-code-exchange-pkce` | **Entirely inside Authlete** — rides in the opaque `parameters` string. Gates: `Service.pkceRequired`, `Service.pkceS256Required`, and the same two as client metadata | — |
| RFC 7662 | OAuth 2.0 Token Introspection | Published RFC, Oct 2015 | `/configuration-reference/endpoints/use-cases-for-two-introspection-apis` | **Two distinct APIs.** `introspection.standardProcess` is the RFC 7662-conformant one; `introspection.process` is **Authlete-proprietary**, for an RS holding an Authlete service token | — |
| RFC 8414 | OAuth 2.0 Authorization Server Metadata | Published RFC, Jun 2018 | `/configuration-reference/metadata/publishing-metadata` | `service.getConfiguration` (`pretty`) — one document serves both 8414 and OIDC Discovery | — |
| RFC 8252 | OAuth 2.0 for Native Apps | Published RFC (BCP 212), Oct 2017 | **no page** | `Service.loopbackRedirectionUriVariable` only | — |
| RFC 9700 | Best Current Practice for OAuth 2.0 Security (BCP 240) | Published RFC (BCP), Jan 2025 | **no page** | No vendor surface — spec-only; realised through other flags | — |
| OIDC Core 1.0 | OpenID Connect Core 1.0 incorporating errata set 2 | OpenID Final, errata set 2 Dec 2023 | `/protocols-and-flows/basic-oauth-oidc-flows/oidc-basiscs` | `authorization.*`, `userinfo.process/issue`. Flags: `claimShortcutRestrictive`, `idTokenAudType`, `idTokenReissuable` | — |
| OIDC Discovery 1.0 | OpenID Connect Discovery 1.0 incorporating errata set 2 | OpenID Final | `/configuration-reference/metadata/publishing-metadata` | `service.getConfiguration` | — |
| OIDC RP-Initiated Logout 1.0 | OpenID Connect RP-Initiated Logout 1.0 | OpenID Final, 12 Sep 2022 | **no page** | No Authlete API — wholly local (`services/logout.service.ts`) | — |

## 2. Group B — extensions Authlete supports

| Spec | Exact title | Status | Authlete page | Authlete-side surface | Min ver |
|---|---|---|---|---|---|
| RFC 7521 | Assertion Framework for OAuth 2.0 Client Authentication and Authorization Grants | Published RFC, May 2015 | `/configuration-reference/endpoints/configuring-client-authentication` | Framework only; realised by 7523 | — |
| RFC 7522 | SAML 2.0 Profile for OAuth 2.0 … | Published RFC, May 2015 | **no page** | AS must validate SAML itself; Authlete's token-exchange path names it as AS responsibility | — |
| RFC 7523 | JSON Web Token (JWT) Profile for OAuth 2.0 Client Authentication and Authorization Grants | Published RFC, May 2015 | `/protocols-and-flows/advanced-flows/jwt-authorization-grant-rfc-7523-2-1`, `/configuration-reference/endpoints/client-authentication-using-private-key-jwt-method` | §2.1 grant: `TokenResponseAction.JWT_BEARER` + `joseObject.joseVerifyApi`. §2.2 client auth: `ClientAuthMethod.PRIVATE_KEY_JWT` / `CLIENT_SECRET_JWT` | — |
| RFC 7591 | OAuth 2.0 Dynamic Client Registration Protocol | Published RFC, Jul 2015 | `/api-reference/dynamic-client-registration/*` | `dynamicClientRegistration.register`; `Service.dcrScopeUsedAsRequestable`, `Service.dcrDuplicateSoftwareIdBlocked` | — |
| RFC 7592 | OAuth 2.0 Dynamic Client Registration Management Protocol | Published RFC — **Experimental** | same | `.get/.update/.delete`; `Service.unauthorizedOnClientConfigSupported`. `ClientRegistrationResponseAction` = 7 values | — |
| RFC 8628 | OAuth 2.0 Device Authorization Grant | Published RFC, Aug 2019 | `/protocols-and-flows/advanced-flows/oauth-2-0-device-authorization-grant-device-flow` | `deviceFlow.authorization/verification/complete`. Three separate action enums; `DeviceCompleteResponseAction` has **no `ACCESS_DENIED`** — it is a *request* `result` value | — |
| RFC 8693 | OAuth 2.0 Token Exchange | Published RFC, Jan 2020 | `/protocols-and-flows/advanced-flows/oauth-2-0-token-exchange-rfc-8693` | Authlete parses and returns **all** exchange params on `TokenResponse`; AS must mint via `token.management.create` with `grantType: TOKEN_EXCHANGE`. **See §5.1 — a doc/SDK contradiction on `issued_token_type`** | — |
| RFC 8707 | Resource Indicators for OAuth 2.0 | Published RFC, Feb 2020 | `/configuration-reference/tokens-and-claims/resource-indicators` | `resources` on `TokenResponse:177`, `TokenCreateRequest:133`, `IntrospectionRequest` | — |
| RFC 9068 | JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens | Published RFC, Oct 2021 | `/configuration-reference/tokens-and-claims/using-jwt-based-access-tokens` | Service-level JWT AT config; `jwtAccessToken` on `TokenCreateResponse:108` | 2.1+ |
| RFC 9101 | The OAuth 2.0 Authorization Framework: JWT-Secured Authorization Request (JAR) | Published RFC, Aug 2021 | `/configuration-reference/endpoints/jwt-secured-authorization-requests-jar`, `/configuration-reference/endpoints/using-request-objects` | `request` inside `parameters` at `authorization.processRequest`, or via PAR. Flags: `traditionalRequestObjectProcessingApplied`, `nbfOptional`, `frontChannelRequestObjectEncryptionRequired`, `requestObjectEncryptionAlgMatchRequired`, `requestObjectEncryptionEncMatchRequired`; client `requestObjectRequired`, `requestSignAlg`, `requestUris` | — |
| RFC 9126 | OAuth 2.0 Pushed Authorization Requests | Published RFC, Sep 2021 | `/configuration-reference/endpoints/pushed-authorization-requests-par` | `pushedAuthorization.create`. Request takes `parameters`, `clientId`, `clientSecret`, `clientCertificate`, `clientCertificatePath`. `PushedAuthorizationResponseAction` = 6 incl. `PAYLOAD_TOO_LARGE`. Gate field is **`parRequired`** (service + client) — the doc page's "`requirePAR`" is a console label, absent from the SDK | — |
| RFC 9207 | OAuth 2.0 Authorization Server Issuer Identification | Published RFC, Mar 2022 | flags page | `Service.issSuppressed` (default `false` ⇒ `iss` is emitted) | — |
| RFC 9396 | OAuth 2.0 Rich Authorization Requests | Published RFC, May 2023 | `/configuration-reference/tokens-and-claims/rich-authorization-requests-rar`, `/protocols-and-flows/protocol-extensions/rich-authorization-requests-rar-spec` | `authorizationDetails` (`AuthzDetails`) on authorization/token/token-create responses; client `authorizationDetailsTypes`; service `supportedAuthorizationDetailsTypes` | — |
| RFC 9449 | OAuth 2.0 Demonstrating Proof of Possession (DPoP) | Published RFC, Sep 2023 | `/configuration-reference/tokens-and-claims/using-dpop` | Request params `dpop`, `htm`, `htu`; `Service.dpopNonceRequired`, `Service.dpopNonceDuration`, client `dpopRequired`. **`UserinfoResponse` exposes no `cnf`** | **2.2+** |
| RFC 9470 | OAuth 2.0 Step Up Authentication Challenge Protocol | Published RFC, Sep 2023 | `/protocols-and-flows/advanced-flows/oauth-2-0-step-up-authentication-challenge-protocol-rfc-9470` | `acrs`/`acrEssential`/`maxAge` on `AuthorizationResponse`; `acr`/`authTime` on `authorization.issue`; challenge returned in `WWW-Authenticate` via `responseContent` | — |
| RFC 9701 | JWT Response for OAuth Token Introspection | Published RFC | `/configuration-reference/endpoints/jwt-response-for-oauth-token-introspection` | Triggered **by the request's `Accept: application/token-introspection+jwt`**, forwarded as `httpAcceptHeader`. Params `introspectionSignAlg`, `introspectionEncryptionAlg`, `introspectionEncryptionEnc`, `rsUri`. **AS must handle `StandardIntrospectionResponseAction.JWT`** | **3.0+** |
| RFC 9728 | OAuth 2.0 Protected Resource Metadata | Published RFC, Apr 2025 | **no page** (the `protected-resource` page does not cover it) | **No vendor surface** — wholly the AS's own document | — |
| CIBA Core 1.0 | OpenID Connect Client-Initiated Backchannel Authentication Flow – Core 1.0 | OpenID Final, Sep 2021 | `/protocols-and-flows/advanced-flows/client-initiated-backchannel-authentication-ciba` | `ciba.processAuthentication/issue/fail/complete`; four action enums; client `bcDeliveryMode`, `bcNotificationEndpoint`, `bcRequestSignAlg`, `bcUserCodeRequired` | — |
| JARM | JWT Secured Authorization Response Mode for OAuth 2.0 (JARM) incorporating errata set 1 | OpenID Final, 17 Aug 2025 | `/configuration-reference/endpoints/enabling-jarm` | **Authlete builds and signs the response object itself** once client `authorizationSignAlg` is set and the service has a JWK set. `response_mode=jwt` rides in `parameters`. **No AS code required on the AS side** | — |
| Grant Management | Grant Management for OAuth 2.0 (Draft) | **Active I-D** `oauth-v2-grant-management-03`, 9 May 2023 | `/protocols-and-flows/advanced-flows/grant-management-for-oauth-2-0` | `grantManagement.processRequest`; `GMResponseAction` = 7. **`GrantManagementAction` = `CREATE, QUERY, REPLACE, REVOKE, MERGE`** — the last three plus CREATE are authorization-request-side | — |
| OIDC Back-Channel Logout 1.0 | OpenID Connect Back-Channel Logout 1.0 incorporating errata set 1 | OpenID Final, 15 Dec 2023 | `/protocols-and-flows/protocol-extensions/openid-connect-back-channel-logout-1-0` | API `POST /api/{serviceId}/backchannel/logout/token` exists (`action` = `OK`/`SERVER_ERROR`/`CALLER_ERROR`) but is **not wrapped by SDK 1.0.0** — see §5.2 | — |
| OIDC Native SSO 1.0 | OpenID Connect Native SSO for Mobile Apps 1.0 | OpenID **2nd Implementer's Draft** (draft 07), approved 2025-10-17 | `/protocols-and-flows/advanced-flows/native-sso` | `nativeSso.process/logout`; `TokenResponseAction.NATIVE_SSO`; `Service.nativeSsoSupported` | — |
| CIMD | OAuth Client ID Metadata Document | **Active I-D** `draft-ietf-oauth-client-id-metadata-document` | `/protocols-and-flows/protocol-extensions/oauth-client-id-metadata-document-cimd` | `Service.clientIdMetadataDocumentSupported` (default `false`). Authlete fetches, registers and caches (≤86,400 s) entirely server-side; **no AS code required** | **3.0.22** |
| Parameterized scopes | *(Authlete feature, not an RFC)* | Vendor | `/configuration-reference/tokens-and-claims/using-parameterized-scopes` | Service scope config | — |
| Scope / client attributes | *(Authlete feature, not an RFC)* | Vendor | `/configuration-reference/tokens-and-claims/scope-attributes`, `/configuration-reference/client-management/client-attributes` | `attributes` on client + scope models | — |

## 3. Group C — environment-dependent

| Spec | Exact title | Status | Authlete page | Authlete-side surface | Prior ruling |
|---|---|---|---|---|---|
| RFC 8705 | OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens | Published RFC, Feb 2020 | `/configuration-reference/tokens-and-claims/issuing-mutual-tls-certificate-bound-access-tokens`, `/configuration-reference/endpoints/client-authentication-using-tls-client-auth-method` | `ClientAuthMethod.TLS_CLIENT_AUTH` / `SELF_SIGNED_TLS_CLIENT_AUTH`; `clientCertificate`, `clientCertificatePath` on PAR/token requests; client `tlsClientCertificateBoundAccessTokens` | **Declined** 2026-07-28. **But see §5.3 — the stated rationale may be factually wrong** |
| FAPI 1.0 Part 1 / Part 2 | Financial-grade API Security Profile 1.0 – Part 1: Baseline / Part 2: Advanced | OpenID Final, 12 Mar 2021 | `/protocols-and-flows/compliance-profiles/fapi-basics`, `/financial-grade-api-fapi-overview` | `Service.fapiModes`, `/validation-in-fapi-mode` | — |
| FAPI 2.0 Security Profile | FAPI 2.0 Security Profile | OpenID Final, 22 Feb 2025 | `/protocols-and-flows/compliance-profiles/fapi-2-0`, `/authorization-code-flow-in-fapi-2-0-security-profile` | `Service.fapiModes` incl. `FAPI2_SECURITY` | — |
| FAPI 2.0 Attacker Model | FAPI 2.0 Attacker Model | OpenID Final, 22 Feb 2025 | *(within FAPI pages)* | No configuration surface | — |
| FAPI 2.0 Message Signing | FAPI 2.0 Message Signing | OpenID Final, 25 Sep 2025 | `/protocols-and-flows/compliance-profiles/fapi-2-0-message-signing-profile-signing-authorization-requests` | `fapiModes` prefix `FAPI2_MESSAGE_SIGNING_*`; requires JAR + JARM + signed introspection | — |
| OpenID Federation | OpenID Federation 1.1 | OpenID Final, 5 May 2026 | `/api-reference/federation-endpoint/*` | `federation.configuration/registration`; `Service.supportedClientRegistrationTypes` | — |
| OID4VCI | OpenID for Verifiable Credential Issuance 1.0 | OpenID Final, 16 Sep 2025 | `/protocols-and-flows/verifiable-credentials/openid-for-verifiable-credential-issuance` | `verifiableCredentials.*` (8 methods used; **3 `*Parse*` APIs exist and are unused**) | — |
| HAIP 1.0 | **OpenID4VC High Assurance Interoperability Profile 1.0** | OpenID Final, **24 Dec 2025** | `/protocols-and-flows/compliance-profiles/haip-compliant-verifiable-credential-issuance` | Builds on OID4VCI config | **DR-14 — cost-declined**, on a three-link chain whose binding constraint is DR-02 |
| OID4VP | OpenID for Verifiable Presentations 1.0 | OpenID Final, 9 Jul 2025 | **no page** | No vendor surface | **Decision record needed** |
| mDL / mdoc | ISO/IEC 18013-5 | ISO — **paywalled; `iso.org` returns HTTP 403 to fetch, so no header line is recorded** | **no page in `llms.txt`** | Not documented | **DR-15 — declined.** Gating condition: requires a wallet **and** a CBOR/COSE toolchain, neither present; **SD-JWT VC satisfies the same HAIP requirement** at a fraction of the cost, and this repo already has an SD-JWT implementation |
| Hardware security keys | *(Authlete feature)* | Vendor | `/api-reference/hardware-security-key/*` | `hardwareSecurityKeys.create/get/delete/list`; note `HskGetListResponseAction` lacks `NOT_FOUND` **by design** | **Decision record needed** |
| RFC 9901 | Selective Disclosure for JSON Web Tokens | Published RFC, Nov 2025 | **no page** | No vendor surface — pure JOSE | Taught locally via `docs/curriculum/scripts/sd-jwt.mjs` |

## 4. Newly discovered Authlete surface, absent from the repo entirely

Found in `llms.txt` and the comprehensive-protection page; **no mention anywhere in `docs/` or
`server/src`**. Each needs a scope ruling at Gate 4.

| Capability | Specs | Authlete surface |
|---|---|---|
| Shared Signals Framework / CAEP | RFC 8417 (SET), RFC 8935 (push), RFC 8936 (poll), RFC 9493 (subject identifiers), OpenID SSF 1.0, CAEP 1.0 | Named as supported on the comprehensive-protection page |
| FAPI 2.0 HTTP Signatures | RFC 9421 (HTTP Message Signatures), RFC 8941 (structured fields), RFC 9530 (digest fields) | Named as a profiled framework for request/response signing |
| Client certificate header forwarding | **RFC 9440 (`Client-Cert` header)** | Standardises exactly the reverse-proxy problem the mTLS decline cites as impossible — see §5.3 |
| Audit logs API | — | `/api-reference/audit-logs/*`; repo rolls its own Winston audit log instead |
| Authorization ticket info / update APIs | — | `AuthorizationTicketInfoResponseAction`, `AuthorizationTicketUpdateResponseAction`; SDK namespace `authorizationmanagement` — **never called** |

## 5. Recorded disagreements between sources

### 5.1 `issued_token_type` — **RESOLVED by live call: Authlete's documentation is wrong**

- **Authlete doc page** (`/protocols-and-flows/advanced-flows/oauth-2-0-token-exchange-rfc-8693`, fetched this session): *"Authlete provides `issued_token_type` in the token exchange response — the AS does not supply it."*
- **SDK 1.0.0:** `issuedTokenType` / `issued_token_type` appears **nowhere** in the package. `TokenCreateResponse` has no such field and no `responseContent` envelope.

**Live probe, 2026-08-10, authorised.** `POST {base}/api/{serviceId}/auth/token/create` with
`{"grantType":"TOKEN_EXCHANGE","clientId":<confidential test client>,"subject":"audit-probe-8693"}`:

```
HTTP 200
response keys: accessToken, action, clientId, clientIdentifier, expiresAt, expiresIn,
               forExternalAttachment, grantType, refreshToken, resultCode, resultMessage,
               subject, tokenId, tokenType
keys matching issued*/tokenType*: ["tokenType"]     # value "Bearer"
responseContent present: false
expiresIn: 86400
```

**Conclusion: the SDK is right and Authlete's documentation is wrong for Authlete 3.0 / SDK 1.0.0.**
There is no `issued_token_type` anywhere in the response, and no `responseContent` envelope that could
carry a pre-built RFC 8693 body. `tokenType: "Bearer"` is RFC 6749's `token_type`, a **different**
parameter from RFC 8693 §2.2.1's `issued_token_type`; conflating the two is exactly the mistake the doc
sentence invites.

**Three consequences carried into B5:**

1. RFC 8693 §2.2.1 makes `issued_token_type` **REQUIRED** in the response. Since Authlete does not supply it, **the authorization server must synthesize it.** The repo's omission is therefore a genuine AS-side conformance gap, not a discarded vendor value.
2. Module 06 Exercise 6a's framing needs to say precisely this. "Authlete gives it to you and the handler drops it" would be wrong; "Authlete never gives it to you, and the handler does not add it" is right — and the fact that Authlete's own documentation claims otherwise is a better teaching point than the original exercise.
3. **`expiresIn: 86400` is confirmed live**, independently corroborating `AGENTS.md`'s claim that the token-exchange handler passes no lifetime and the resulting tokens live 24 h.

Cleanup: the probe token was deleted (`DELETE /auth/token/delete/{tokenId}` → HTTP 204). Note the delete
API rejects `POST` with 405 — only `DELETE` works.

### 5.2 Backchannel-logout token API — Authlete has it, the SDK does not

`llms.txt` lists `/api-reference/back-channel-logout/backchannel-logout-token-issuing`, confirming the
API exists at `POST /api/{serviceId}/backchannel/logout/token`. A grep of SDK 1.0.0 for
`logout/token`, `backchannelLogoutToken` and a listing of `src/sdk/` (24 namespaces, no
backchannel-logout entry) returns nothing. **`AGENTS.md`'s narrower claim — that the *SDK* exposes no
such API — is confirmed correct.** The raw `fetch()` at `services/backchannel-logout.service.ts:34`
is therefore justified; the second `fetch()` at `:128` is not, because it duplicates
`authleteApi.client.list`.

### 5.3 The mTLS decline's rationale versus RFC 9440

The inherited decision record (`PROGRESS.md`, Module 05) declines RFC 8705 because *"TLS is terminated
by the platform in every deployment of this repo, so a client certificate can never reach Node."*
Authlete's comprehensive-protection page names **RFC 9440 — Client Certificate HTTP Header Field**,
whose entire purpose is to carry a client certificate across exactly that TLS-terminating hop, and the
SDK accepts `clientCertificate` / `clientCertificatePath` on both the PAR and token requests.

Per the Gate 0 ruling I am **not reopening the decline** — the conclusion may well still be right on
cost grounds. But the *stated reason* appears to be factually wrong, and a decision record with a wrong
reason is itself a documentation defect in a teaching repo. Logged for B4 as a claim to test, not as a
reopened decision.

### 5.4 Minor naming discrepancies (SDK is authoritative)

| Concept | Authlete doc page says | SDK 1.0.0 says |
|---|---|---|
| PAR gate flag | `requirePAR` | **`parRequired`** (service and client) |
| RFC 9701 encryption params | `introspectionEncAlg`, `introspectionEncEnc` | **`introspectionEncryptionAlg`, `introspectionEncryptionEnc`** |
| Refresh-token rotation | flags page renders the label as "Enable Token Rotation" | `Service.refreshTokenKept`: *"If `true`, a refresh token used to get a new access token remains valid after its use"* (`models/service.ts:634-642`) ⇒ `true` = **not** rotated. **`AGENTS.md` is correct**; the console label is the trap |

---

## 6. Action-enum coverage: SDK enums versus the code's handled sets

Extracted all **46 action enums** from `server/node_modules/@authlete/typescript-sdk/src/models/*.ts`
and diffed each against the handled set recorded in `00-inventory.md` §5.

**Result: 35 of 36 mappings are complete. One gap.**

### The gap

`StandardIntrospectionResponseAction` = `INTERNAL_SERVER_ERROR, BAD_REQUEST, OK, **JWT**`
(`models/standardintrospectionresponse.ts:14-18`).

`server/src/controllers/introspection-standard.controller.ts:13-31` handles `BAD_REQUEST` (`:14`),
`INTERNAL_SERVER_ERROR` (`:18`) and `OK` (`:22`) only. **`JWT` falls through to `default` at `:26`
and returns HTTP 500** with the body `"Unknown introspection action from Authlete /introspection"`.

The path is **reachable, not theoretical**: `server/src/services/introspection.service.ts:124-127`
deliberately forwards the caller's `Accept` header as `httpAcceptHeader`, which is precisely the
RFC 9701 trigger. So a resource server sending
`Accept: application/token-introspection+jwt` to `POST /api/introspection/standard` gets a 500 instead
of the signed introspection JWT. A default `Accept: */*` — what `curl` sends — does not trigger it,
which is why it has survived.

Carried into **B2** for a verdict and severity. Not present in `PROGRESS.md`'s open-findings register.

### Confirmations worth recording (behaviour that looks wrong and is right)

| Observation | SDK evidence | Conclusion |
|---|---|---|
| `native-sso.controller.ts:26` uses `SERVER_ERROR` where `:17` uses `INTERNAL_SERVER_ERROR` | `NativeSsoLogoutResponseAction` = `OK, SERVER_ERROR, CALLER_ERROR`; `NativeSsoResponseAction` = `OK, INTERNAL_SERVER_ERROR, CALLER_ERROR` | **Correct** — the two APIs genuinely use different literals |
| `hsk.controller.ts:39` list map has no `NOT_FOUND` | `HskGetListResponseAction` = `SUCCESS, INVALID_REQUEST, SERVER_ERROR` | **Correct** |
| `vci.controller.ts` `BATCH_ISSUE_MAP` lacks `ACCEPTED`; `DEFERRED_ISSUE_MAP` lacks `UNAUTHORIZED` | `VciBatchIssueResponseAction` has no `ACCEPTED`; `VciDeferredIssueResponseAction` has no `UNAUTHORIZED` | **Both correct** |
| `device.controller.ts` complete map has no `ACCESS_DENIED` | `DeviceCompleteResponseAction` = `SERVER_ERROR, USER_CODE_NOT_EXIST, USER_CODE_EXPIRED, INVALID_REQUEST, SUCCESS` | **Correct** — `ACCESS_DENIED` is a request `result`, as `AGENTS.md` states |
| `token.management.controller.ts:164` switches on `resultCode`, not `action` | `TokenRevokeResponse` has no `action` field | **Correct**, though it violates Authlete's own guidance that `resultCode` must never be a branching condition — no alternative exists |

### Unused Authlete surface confirmed by the enum sweep

`AuthorizationTicketInfoResponseAction`, `AuthorizationTicketUpdateResponseAction`,
`VciSingleParseResponseAction`, `VciBatchParseResponseAction`, `VciDeferredParseResponseAction`, and
`GrantManagementAction`'s `CREATE` / `REPLACE` / `MERGE` members. The last of these is the precise
shape of the Grant Management gap: the repo implements the **management API** (`QUERY`/`REVOKE`) and
none of the **authorization-request side** (`grant_id`, `grant_management_action`).

---

## 7. Rows selected for spot re-verification in Phase 3

Under the delta ruling, 10 highest-risk `SPEC-INVENTORY.md` rows get their primary source re-fetched.
Chosen for staleness risk, or because a Phase 2 verdict depends on the row being right.

1. **RFC 9846 / RFC 8446** — the file's own headline correction; a date-sensitive claim.
2. **RFC 9701** — no row exists at all; needs a title/status/date from scratch.
3. **JARM** — errata-set title and the `-final.html`-is-not-current trap.
4. **Grant Management** — I-D revision `-03` dated 9 May 2023; drafts expire.
5. **OIDC Native SSO 1.0** — 2nd Implementer's Draft approval date vs document date.
6. **OpenID Federation 1.1** — asserted Final 5 May 2026, superseding 1.0.
7. **FAPI 2.0 Attacker Model** — the file flags a superseded document still served at the old URL.
8. **RFC 7592** — Experimental status, load-bearing for the DCR verdict.
9. **CIMD** — Active I-D with no inventory row; Authlete pins 3.0.22.
10. **RFC 9901** — Nov 2025 publication; recent enough that status may have moved.

## 8. Source gaps to close during Phase 2

Recorded honestly rather than filled with plausible detail:

- **RFC 9728** has no Authlete page; the code can only be audited against the RFC.
- **RFC 8252, RFC 9700, OID4VP, mDL** have no Authlete page. Boundary column reads "no vendor surface".
- The **DPoP page does not name its service flags**; `dpopNonceRequired` / `dpopNonceDuration` / client `dpopRequired` come from the SDK, not the page.
- The **JARM page states no minimum version and no error code**; `PROGRESS.md` reports `[A012305]` from live testing, which Phase 2 will treat as repo-sourced evidence rather than vendor documentation.
- **Authlete version floors** are stated for only four specs (DPoP 2.2+, JWT AT 2.1+, RFC 9701 3.0+, CIMD 3.0.22). The live service's exact 3.0 patch level is unknown, which matters only for CIMD.

## Self-check for Phase 1

- [x] Every spec in the skill's Group A/B/C inventory appears exactly once, plus the 8 additions ruled in at Gate 0.
- [x] No verdicts written.
- [x] Every Authlete claim traces to `llms.txt`-resolved page fetched this session, or to the installed SDK with a `file:line`.
- [x] Disagreements between sources recorded rather than smoothed (§5, four of them).
- [x] Source gaps stated rather than filled (§8).
- [ ] **Not satisfied:** exact titles/statuses/dates for most rows are carried from `SPEC-INVENTORY.md` rather than re-fetched. This is the Gate 0 delta ruling working as intended; §7 lists the 10 rows that will be re-fetched.
