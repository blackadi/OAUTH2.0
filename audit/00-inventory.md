# 00 — Repo cartography and Authlete version pin

**Phase 0 of the RFC conformance audit.** Approved at Gate 0. No verdicts appear in this file; it
exists so that every later verdict is evaluated against a known Authlete version and a known code
surface.

- **Audit date:** 2026-08-10
- **Repo:** `/home/blackadi/Documents/OAUTH2.0`, branch `main`, at `b16f5da`
- **Authlete version pinned:** **3.0** (evidence in §1)
- **SDK:** `@authlete/typescript-sdk@1.0.0`, exact pin, resolved from `node_modules`

## Scope decisions taken at Gate 0

| Decision | Ruling |
|---|---|
| Audit depth | **Delta audit.** `SPEC-INVENTORY.md`, `AUDIT-PASS-A.md`, `AUDIT-PASS-B.md` are claims under test with targeted spot re-verification, not re-derived wholesale. |
| Live Authlete calls | **Targeted single calls, announced and justified before each.** `test:e2e` is not run. Unsettleable verdicts are `IMPLEMENTED_UNVERIFIED` with the missing evidence named. |
| Group C | **Inherit the mTLS decline** (`docs/curriculum/PROGRESS.md`, Module 05 decision record). Fresh decision records only where none exists. |

---

## 1. Authlete version pin: 3.0

Six independent signals, strongest first.

| # | Evidence | Location |
|---|---|---|
| 1 | Configured API host is `https://eu.authlete.com`, one of the four Authlete 3.0 clusters (`us`/`jp`/`eu`/`br`) named on Authlete's API reference | `server/.env` (host read only), `server/.env.example:7` |
| 2 | `AUTHLETE_SERVICE_ID` is a hard startup requirement — 3.0 embeds the service ID in the request path, 2.x did not | `server/src/config/authlete.config.ts:5`, `server/src/utils/env.ts:1-8` |
| 3 | The one hand-rolled Authlete call builds `${baseUrl}/api/${serviceId}/backchannel/logout/token`, verbatim the 3.0 path template `POST /api/{serviceId}/backchannel/logout/token` | `server/src/services/backchannel-logout.service.ts:28` |
| 4 | Auth is `Authorization: Bearer <service access token>`, the 3.0 scheme (2.x used API key + secret) | `server/src/services/authlete.service.ts:4-7` |
| 5 | Authlete's published OpenAPI specs are versioned `3.0.15` / `3.0.16` | `developers.authlete.com/llms.txt`, "OpenAPI Specs" section |
| 6 | SDK pinned exactly, no caret; `node_modules` resolves `1.0.0` | `server/package.json:19` |

### Sources fetched this session

| Purpose | URL |
|---|---|
| Canonical doc index | `https://developers.authlete.com/llms.txt` |
| 3.0 path template + cluster URLs | `https://developers.authlete.com/api-reference/back-channel-logout/backchannel-logout-token-issuing.md` |
| 3.0 base URL, `/api/{serviceId}/` shape, Bearer auth | `https://developers.authlete.com/get-started/quickstarts/getting-started.md` |
| Version/support matrix | `https://developers.authlete.com/deployment-and-operations/operational-policies/long-term-support-lts-policy.md` |

From the LTS page: 1.1 / 2.0 / 2.1 / 2.2 are in legacy grace period (EoL 2027-03-31); **2.3 is the
only LTS-eligible version** (active, patch `2.3.47`, EoL 2029-03-31); **3.0 released Nov 2024, active
development**, LTS eligibility TBA H2 2026.

### Consequence for the audit

Authlete 2.3-era guidance and the service-flag semantics tabulated in `AGENTS.md` are checked against
3.0 before being cited. Flag *names* are largely shared vocabulary across 2.x and 3.0, but that is
not assumed anywhere in this audit.

### One discrepancy to carry forward

`llms.txt` lists an `api-reference/back-channel-logout/` group, so **Authlete does expose a
backchannel-logout token API**. `AGENTS.md` and `server/src/services/backchannel-logout.service.ts`
claim the *SDK* does not wrap it — a narrower and different claim. Whether SDK 1.0.0 exposes it is a
Phase 2 (B6) question, not settled here.

---

## 2. Repo structure

Two independent npm packages, no monorepo tooling.

| Path | What | Entrypoint |
|---|---|---|
| `server/` | Express 5 + Authlete SDK | `src/server.ts` |
| `client/` | React OAuth debugger (Vite + SWC) | `src/main.tsx` |
| `docs/` | 93 markdown files incl. the 14-module curriculum | `docs/README.md` |
| `scripts/` | `check-docs.mjs` only | — |
| `docs/curriculum/scripts/` | `decode-jwt.mjs`, `sd-jwt.mjs` (lab tooling) | — |
| `audit/` | this audit | — |

### Surface counts

| Area | Count |
|---|---|
| HTTP route registrations | **79** (77 concrete paths + 2 catch-alls counted once) |
| Authlete SDK namespaces used | 21 (incl. 2 nested) |
| Distinct SDK methods called | 57, across 60 call sites |
| Raw `fetch()` calls to Authlete | 3, all in one file |
| `action` branch points | 36 `switch` + 2 if-chains; every one has a `default` |
| Server test files | 53 (unit 47 · integration 1 · e2e 1, + 5 provisioning scripts) |
| Client source files | 78 `.ts`/`.tsx`, incl. 21 services and 17 test files |
| Markdown in audit scope | 102 (`docs/` 93 · root 8 · `.github/` 1) |
| Curriculum volume | 14 modules × 4 files (21,226 lines) + 9 exam files (1,535) + 6 top-level (4,132) |

`node scripts/check-docs.mjs` passes clean (105 files, 16 source refs, 243 relative links, 237
anchors). **All drift found from here on is semantic, not mechanical.**

---

## 3. Endpoint → file map

Mounting order is `server/src/app.ts:144-175`. Global middleware precedes it at `app.ts:52-131`
(static, security headers, CORS, request-id, per-request logger, morgan, metrics, audit, body
parsers, cookie parser, session). Error handler last at `app.ts:178`.
`app.use("/api", requestTimeout(30000))` at `app.ts:143` covers every `/api` path including the
`/api/device/*` routes declared inside the root-mounted device router.

### 3.1 True root

| Method | Path | Route decl | Handler | Middleware |
|---|---|---|---|---|
| GET | `/.well-known/openid-credential-issuer` | `routes/vci.routes.ts:40` | inline, `serviceInstance.getMetadata(true)` at `:43-55` | `generalLimiter` |
| GET | `/.well-known/openid-federation` | `routes/federation.routes.ts:16` | `controllers/federation.controller.ts:34` | `generalLimiter` |
| GET | `/.well-known/oauth-authorization-server` | `routes/oauth-as-metadata.routes.ts:9` | `controllers/discovery.controller.ts:8` | `generalLimiter` |
| GET | `/.well-known/oauth-protected-resource` | `routes/protected-resource-metadata.routes.ts:8` | `controllers/protected-resource-metadata.controller.ts:19` | `generalLimiter` |
| GET | `/metrics` | `routes/metrics.routes.ts:6` | inline, `getMetrics()` | none |
| GET | `/{*path}` | `routes/default.routes.ts:6` | `controllers/default.controller.ts:4` | none |

**Carried forward:** OIDC Discovery and JWKS are served **only under `/api`** —
`GET /api/.well-known/openid-configuration` (`routes/discovery.routes.ts:6`) and
`GET /api/.well-known/jwks.json` (`routes/jwks.routes.ts:6`). The repo already records this as a
non-conformance in `docs/curriculum/SPEC-INVENTORY.md:114-127`; Phase 2 batch B3 assigns it a verdict
and severity.

### 3.2 OAuth / OIDC protocol endpoints

| Method | Path | Route decl | Handler | Middleware |
|---|---|---|---|---|
| GET | `/api/authorization` | `routes/authorization.routes.ts:7` | `controllers/authorization.controller.ts:15` | `authLimiter` (60/min) |
| POST | `/api/token` | `routes/token.routes.ts:16` | `controllers/token.controller.ts:24` | `tokenLimiter` (20/min, skipped for `Basic ` — `middleware/rate-limit.ts:8`) |
| POST, GET | `/api/userinfo` | `routes/userinfo.routes.ts:6,7` | `controllers/userinfo.controller.ts:18` | none |
| POST | `/api/introspection` | `routes/introspection.routes.ts:7` | `controllers/introspection.controller.ts:39` | **none** |
| POST | `/api/introspection/standard` | `routes/introspection.routes.ts:8` | `controllers/introspection-standard.controller.ts:9` | **none** |
| POST | `/api/revocation` | `routes/revocation.routes.ts:6` | `controllers/revocation.controller.ts:8` | **none** |
| GET | `/api/.well-known/openid-configuration` | `routes/discovery.routes.ts:6` | `controllers/discovery.controller.ts:8` | none |
| GET | `/api/.well-known/jwks.json` | `routes/jwks.routes.ts:6` | `controllers/jwks.controller.ts:8` | none |
| POST | `/api/par` | `routes/par.routes.ts:7` | `controllers/par.controller.ts:24` | `generalLimiter` |
| POST | `/api/jar/process` | `routes/jar.routes.ts:7` | `controllers/jar.controller.ts:7` | `generalLimiter` |
| GET | `/api/gm/:grantId` | `routes/grant-management.routes.ts:11` | `controllers/grant-management.controller.ts:10` | `requireGrantOwnership("grant_management_query")` |
| DELETE | `/api/gm/:grantId` | `routes/grant-management.routes.ts:16` | `controllers/grant-management.controller.ts:64` | `requireGrantOwnership("grant_management_revoke")` |

### 3.3 Extensions

| Group | Endpoints | Files | Auth |
|---|---|---|---|
| CIBA | `POST /api/ciba/{authentication,issue,fail,complete}` | `routes/ciba.routes.ts:12-15` → `controllers/ciba.controller.ts:71,83,95,107` | `generalLimiter`; client creds in body |
| Device (API) | `POST /api/device/{authorization,verification,complete}` | `routes/device.routes.ts:14-16` → `controllers/device.controller.ts:64,76,88` | **none** |
| Device (browser) | `GET /device`, `POST /device`, `POST /device/consent` | `routes/device.routes.ts:19-21` → `controllers/device-session.controller.ts:10,26,63` | `generalLimiter`, `csrfProtection` |
| DCR | `POST /api/client/dcr/{register,get,update,delete}` | `routes/dcr.routes.ts:12-15` → `controllers/dcr.controller.ts:46,60,73,86` | `register` only: `requireBasicAuth("dcr")` at `:48` |
| Federation | `GET /api/federation/configuration`, `POST /api/federation/registration` | `routes/federation.routes.ts:11,12` → `controllers/federation.controller.ts:34,54` | registration: basic auth at `:56` |
| Native SSO | `POST /api/nativesso`, `POST /api/nativesso/logout` | `routes/native-sso.routes.ts:10,11` → `controllers/native-sso.controller.ts:37,49` | basic auth at `:39`, `:51` |
| HSK | `POST /api/hsk/create`, `GET /api/hsk/get/:handle`, `DELETE /api/hsk/delete/:handle`, `GET /api/hsk/list` | `routes/hsk.routes.ts:12-15` → `controllers/hsk.controller.ts:50,63,77,91` | basic auth on all four |
| VCI | 4 discovery GETs, 2 offer POSTs, 3 credential POSTs | `routes/vci.routes.ts:17-35` → `controllers/vci.controller.ts:79,93,107,121,131,144,160,194` | discovery public; offers basic auth; credential bearer-or-body |

### 3.4 Admin

All guarded by **in-handler** `requireBasicAuth(...)`, not route middleware, and **none carries a
rate limiter**. `middleware/require-basic-auth.ts:57-64` fails closed when `MGMT_CLIENT_ID` or
`MGMT_CLIENT_SECRET` is unset.

- Token management, 7 endpoints: `routes/token.routes.ts:17-26` → `controllers/token.management.controller.ts:12,54,91,137,153,210,250`. `createLocalToken` 404s unless `NODE_ENV==="development"` (`:256`).
- Client management, 16 endpoints: `routes/client.routes.ts:23-38` → `controllers/client.management.controller.ts:10-256`.
- Backchannel logout, 3 endpoints: `routes/backchannel-logout.routes.ts:11,14,17` → `controllers/backchannel-logout.controller.ts:10,41,67`.

### 3.5 Browser / EJS and ops

Login and consent: `GET|POST /api/session/login` (`routes/session.routes.ts:8,9`),
`GET|POST /api/session/consent` (`:11,12`) → `controllers/session.controller.ts:46,60,203,222`.
`POST /api/session/login` carries `loginLimiter` (5/min) **plus** an independent in-process
brute-force limiter at `controllers/session.controller.ts:14-39` (5 attempts, 60 s ban, 429 at `:21`).

`GET /api/logout` (`routes/logout.routes.ts:21` → `controllers/logout.controller.ts:28`, the confirmation
page) and `POST /api/logout` (`routes/logout.routes.ts:22` → `controllers/logout.controller.ts:9`) and
`POST /api/backchannel_logout` (`:10` → `:21`) carry **no middleware at all**.

Ops: `GET /api/health{,/all,/authlete}` (`routes/health.routes.ts:6-8`), `GET /api/metrics`,
`GET /api/fapi/{config,status}` (`routes/fapi.routes.ts:6,7` — **no auth**),
`GET /api/openapi.json` (`routes/openapi.routes.ts:1973`), `GET /api/routes{,.json}`
(`routes/routes-list.routes.ts:516,521`).

---

## 4. Authlete SDK call surface

Client constructed once at `server/src/services/authlete.service.ts:4-7`
(`new Authlete({ bearer, serverURL })`), `serviceId` exported at `:9`. Every service takes it as
`private authleteApi: Authlete = defaultApi` so tests can inject a double.

| Namespace | Methods | Call sites |
|---|---|---|
| `authorization` | `processRequest`, `fail`, `issue` | `services/authorization.service.ts:36,48,119`; `services/jar.service.ts:12` |
| `token` | `process`, `fail`, `issue` | `services/token.service.ts:97,106,115` |
| `token.management` | `create`, `update`, `delete`, `list`, `reissueIdToken`, `revoke` | `services/token.operations.service.ts:92,136,145,156,174,189` |
| `userinfo` | `process`, `issue` | `services/userinfo.service.ts:79,92` |
| `introspection` | `process`, `standardProcess` | `services/introspection.service.ts:68,135`; `middleware/require-grant-ownership.ts:74` |
| `revocation` | `process` | `services/revocation.service.ts:82` |
| `pushedAuthorization` | `create` | `services/par.service.ts:71` |
| `ciba` | `processAuthentication`, `issue`, `fail`, `complete` | `services/ciba.service.ts:28,41,50,69` |
| `deviceFlow` | `authorization`, `verification`, `complete` | `services/device.service.ts:24,37,56` |
| `grantManagement` | `processRequest` | `services/grant-management.service.ts:16` (`QUERY`), `:34` (`REVOKE`) |
| `dynamicClientRegistration` | `register`, `get`, `update`, `delete` | `services/dcr.service.ts:20,42,68,90` |
| `client` | `list`, `get`, `create`, `update`, `delete` | `services/client.management.service.ts:33,53,77,99,118` |
| `client.management` | 11 methods (lock flag, secrets, authorizations, granted/requestable scopes) | `services/client.management.service.ts:142-380` |
| `service` | `getConfiguration`, `get` | `services/discovery.service.ts:13`; **`controllers/fapi.controller.ts:25,60`** |
| `federation` | `configuration`, `registration` | `services/federation.service.ts:14,34` |
| `nativeSso` | `process`, `logout` | `services/native-sso.service.ts:44,64` |
| `hardwareSecurityKeys` | `create`, `get`, `delete`, `list` | `services/hsk.service.ts:29,42,55,64` |
| `verifiableCredentials` | 8 methods | `services/vci.service.ts:11,20,29,77,105,114,123,132` |
| `jwkSetEndpoint` | `serviceJwksGetApi` | `services/jwks.service.ts:9` |
| `joseObject` | `joseVerifyApi` | `services/jwt-verification.service.ts:41` (`mandatoryClaims: ["iss","sub","aud"]`, `signedByClient: true`) |
| `lifecycle` | `getApiLifecycleHealthcheck` | `services/health.service.ts:38` |

### Raw `fetch()` to Authlete

All in `server/src/services/backchannel-logout.service.ts`:

| Line | Target | Note |
|---|---|---|
| `:34` | `${baseUrl}/api/${serviceId}/backchannel/logout/token` (built `:28`) | Authlete called by hand; local response type at `:3-9` with `action: "OK" \| "SERVER_ERROR" \| "CALLER_ERROR"` |
| `:128` | `${baseUrl}/api/${serviceId}/client/get/list?start=&end=` (built `:127`) | **Duplicates `authleteApi.client.list`** — paginated 100/page at `:122-171`. Not an SDK gap. |
| `:90` | `tokenRes.backchannelLogoutUri` | Not Authlete — outbound `logout_token` delivery to the RP |

Other `fetch()` in the tree: `server/src/utils/jwksClient.ts:30` (configured `JWKS_URI`) and three
browser-side calls in EJS views. No `axios`, no `node-fetch`, no `http.request` in `server/src`.

---

## 5. `action` branching map

Every branch point, with the action literals handled and the HTTP status each maps to. All have a
`default`.

| File | Switch line | Actions → status | `default` |
|---|---|---|---|
| `controllers/authorization.controller.ts` | `:32` | `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500, `LOCATION`→302, `FORM`→200, `NO_INTERACTION`→302, `INTERACTION`→session/consent logic `:55-140` | 500 text `"Unknown authorization action"` `:142` |
| `controllers/authorization-response.handler.ts` | `:5` | `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500, `LOCATION`→302, `FORM`→200 | 500 `:23` |
| `controllers/authorization-fail-response.handler.ts` | `:5` | `INTERNAL_SERVER_ERROR`→500, `BAD_REQUEST`→400, `LOCATION`→302, `FORM`→200 | 500 `:29` |
| `controllers/token.controller.ts` | `:47` | `BAD_REQUEST`→400, `INVALID_CLIENT`→401-or-400, `INTERNAL_SERVER_ERROR`→500, `JWT_BEARER`, `OK`→200, `PASSWORD`, `TOKEN_EXCHANGE`, `NATIVE_SSO`, `ID_TOKEN_REISSUABLE` | 500 text `"Unknown token action"` `:180` |
| `controllers/token-issue-response.handler.ts` | `:7` | `INTERNAL_SERVER_ERROR`→500, `OK`→200 | 500 `:20` |
| `controllers/token-fail-response.handler.ts` | `:7` | `INTERNAL_SERVER_ERROR`→500, `BAD_REQUEST`→400 | 500 `:20` |
| `controllers/token-exchange-response.handler.ts` | `:61` | `OK`→200, `BAD_REQUEST`→400, `FORBIDDEN`→403, `INTERNAL_SERVER_ERROR`→500 | 500 **but still sends the full body** `:96` |
| `controllers/native-sso-response.handler.ts` | `:42` | `OK`→200, `CALLER_ERROR`→400, `INTERNAL_SERVER_ERROR`→500 | 500 `:58` |
| `services/jwt-verification.service.ts` | `:92` | `OK`, `BAD_REQUEST`→400 | 500 `:104` |
| `controllers/userinfo.controller.ts` | `:25` | `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500, `FORBIDDEN`→403, `OK`→200 | 500 `:144` |
| `controllers/userinfo-issue-response.handler.ts` | `:8` | + `JSON`→200 `application/json`, `JWT`→200 `application/jwt` | 500 `:47` |
| `controllers/introspection.controller.ts` | `:57` | `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500, `FORBIDDEN`→403 (RFC 9470 structured body `:84-97`), `OK`→200 | 500 `:107` |
| `controllers/introspection-standard.controller.ts` | `:13` | `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500, `OK`→200 | 500 `:26` |
| `controllers/revocation.controller.ts` | `:12` | `OK`→200, `BAD_REQUEST`→400, `INVALID_CLIENT`→401-or-400, `INTERNAL_SERVER_ERROR`→500 | 500 **sending the whole result object** `:51` |
| `controllers/par.controller.ts` | `:11` | SDK enum: `Created`→201, `BadRequest`→400, `Unauthorized`→401, `Forbidden`→403, `PayloadTooLarge`→413, `InternalServerError`→500 | 500 `:18` |
| `controllers/dcr.controller.ts` | `:20` | `CREATED`→201, `OK`/`UPDATED`→200, `DELETED`→204, `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `INTERNAL_SERVER_ERROR`→500 | 500 `:28` |
| `controllers/ciba.controller.ts` | `:15,25,34,43` | auth: `USER_IDENTIFICATION`→200 …; issue: `INVALID_TICKET`→400, `OK`→200; fail: `FORBIDDEN`→403 …; complete: `NO_ACTION`/`NOTIFICATION`→200, `SERVER_ERROR`→500 | 500 each `:20,29,38,47` |
| `controllers/device.controller.ts` | `:14,24,34` | auth: `OK`→200 …; verification: `VALID`→200, `NOT_EXIST`→404, `EXPIRED`→400; complete: `SUCCESS`→200, `USER_CODE_NOT_EXIST`→404, `USER_CODE_EXPIRED`→400, `INVALID_REQUEST`→400, `SERVER_ERROR`→500 | 500 each `:19,29,40` |
| `controllers/hsk.controller.ts` | `:9,19,29,39` | `SUCCESS`→201/200/204/200, `INVALID_REQUEST`→400, `NOT_FOUND`→404 (absent on `list`), `SERVER_ERROR`→500 | 500 each |
| `controllers/federation.controller.ts` | `:13,22` | config: `OK`→200 `application/entity-statement+jwt`, `NOT_FOUND`→404; registration: + `BAD_REQUEST`→400 | 500 `:17,27` |
| `controllers/native-sso.controller.ts` | `:17,26` | `OK`→200, `CALLER_ERROR`→400, `INTERNAL_SERVER_ERROR`→500 / **`SERVER_ERROR`**→500 (different literal) | 500 `:21,30` |
| `controllers/grant-management.controller.ts` | `:23,77` | `OK`→200/204, `NO_CONTENT`→204, `UNAUTHORIZED`→401, `FORBIDDEN`→403, `NOT_FOUND`→404, `CALLER_ERROR`→400, `AUTHLETE_ERROR`→500 | 500 `:51,100` |
| `middleware/require-grant-ownership.ts` | `:86` | introspection response: `OK`→proceed, `UNAUTHORIZED`→401, `FORBIDDEN`→403, `BAD_REQUEST`→400; ownership check `:112` → 403 | 500, fails closed `:104` |
| `controllers/token.management.controller.ts` | `:21,100,164,219` | create/update/reissue action maps; **revoke switches on `result.resultCode`, not `action`** (`:164`, comment `:162-163`) | 500 each |
| `controllers/vci.controller.ts` | `:14` `statusForAction()` | 6 table-driven maps `:19-57`; unmapped or missing action ⇒ 500 | fallback 500 |

### If-chains rather than switches

- `controllers/device-session.controller.ts:38,47,54` — `VALID` / `EXPIRED` / else. **All three render 200** with a different `error` string; no non-200 is ever emitted from the verification step.
- `controllers/backchannel-logout.controller.ts:24,27,30` — `OK`→200, `CALLER_ERROR`→400, else 500. `handleDeliver` (`:55`) maps `result.success ? 200 : 502`.
- `services/backchannel-logout.service.ts:71` — `action !== "OK" || !logoutToken` ⇒ failure.

### No action branching at all

`controllers/discovery.controller.ts:8` (always 200 at `:13`), `controllers/jwks.controller.ts:8`
(special-cases SDK `statusCode === 204` → 200 `{keys:[]}` at `:17-21`),
**`controllers/jar.controller.ts:7` — `res.json(result)` at `:19`, returning the raw Authlete
response with 200 regardless of `action`**, `controllers/protected-resource-metadata.controller.ts:19`,
`controllers/health.controller.ts`, `controllers/default.controller.ts:4`,
`controllers/fapi.controller.ts`.

---

## 6. Spec markers present in and absent from source

### Present in executable paths

| Marker | `path:line` |
|---|---|
| `urn:ietf:params:oauth:grant-type:jwt-bearer` | `services/token.operations.service.ts:32` |
| `urn:ietf:params:oauth:grant-type:pre-authorized_code` | `services/token.operations.service.ts:33` |
| non-URN grant keys (`authorization_code`, `client_credentials`, `password`, `refresh_token`, `implicit`, `token_exchange`, `device_code`) | `services/token.operations.service.ts:25-31` |
| **`GRANT_TYPE_MAP` fallback → `AUTHORIZATION_CODE` for any unrecognised grant type** | `services/token.operations.service.ts:36` |
| `insufficient_user_authentication` | `controllers/introspection.controller.ts:12,16,82,84,87` (substring match on `responseContent` at `:84`) |
| `acr_values`, `max_age` (RFC 9470 challenge parsing) | `controllers/introspection.controller.ts:14,18,23,24,82,91,92`; `parseBearerError` `:20-36` |
| `maxAge` / `acr` / `acrs` / `acrEssential` | `controllers/session.controller.ts:111,121-156,162`; `controllers/authorization.controller.ts:90-92,109`; `services/authorization.service.ts:101-106`; `services/introspection.service.ts:38-43`. Satisfied ACR hard-coded `"pwd"` at `session.controller.ts:111`, `authorization.controller.ts:109` |
| `invalid_dpop_proof` | `services/userinfo.service.ts:41` |
| DPoP header read (never from body) | `services/token.service.ts:76`; `services/par.service.ts:57`; `services/introspection.service.ts:57`; `services/userinfo.service.ts:33,67-72`; `middleware/require-grant-ownership.ts:65-69` |
| `DPoP-Nonce` emission | `utils/dpop.ts:5,11-15,83`; called from `token.controller.ts:45`, `par.controller.ts:29`, `introspection.controller.ts:55`, `userinfo.controller.ts:23`, `require-grant-ownership.ts:84` |
| `htm`/`htu`/`targetUri` split (RFC 9449 §4.2) | `utils/dpop.ts:157-161` (query/fragment stripped at `:159`) + 5 service call sites |
| `resources` (RFC 8707) | `services/introspection.service.ts:33-37`; `services/token.operations.service.ts:80-84` |
| `authorizationDetails` (RAR, camelCase) | `controllers/authorization.controller.ts:84`; `controllers/session.controller.ts:212,219`; `views/consent.ejs:33,36`; `services/client.management.service.ts:475-478` |
| `request` / `request_uri` (JAR/PAR) | `services/jar.service.ts:10`; `controllers/jar.controller.ts:9`; `utils/validate.ts:19,21` |
| Client attestation headers | `services/token.service.ts:86-89`; `services/revocation.service.ts:33-34,73-74` |
| `access_token` in form body (RFC 6750 §2.2) | `utils/dpop.ts:126`; §2.3 query param deliberately unsupported `:100-102` |
| `logout_token`, back-channel event URI | `controllers/logout.controller.ts:42,45,59`; `services/backchannel-logout.service.ts:95` |
| `grantId` / `gmAction` (`"QUERY"`/`"REVOKE"`) | `services/grant-management.service.ts:20-21,38-39`; `middleware/require-grant-ownership.ts:44,112-115` |

### Documentation-only (present in `openapi.routes.ts` / `routes-list.routes.ts`, not in a code path)

`code_challenge`, `code_challenge_method`, `code_verifier` (`routes/openapi.routes.ts:78,84,143`;
`routes/routes-list.routes.ts:24,194`) — **no PKCE parameter is read, validated or forwarded by
hand**; it rides inside the opaque `parameters` string. Also `subject_token`, `subject_token_type`
(`:147-148`), the three grant-type URNs in the OpenAPI `enum` only (`:133,135,136`), and `assertion`,
`auth_req_id`, `device_code`, `resource` as token params (`:150-153`).

### Comment-only

`actor_token` (`controllers/token-exchange-response.handler.ts:39`) and `issued_token_type` (`:63`)
appear **only in comments** — deliberately not forwarded / not emitted. `subjectToken` at `:21,32` is
live and used as the **`subject` fallback**.

### Absent from `server/src` entirely

Verified by case-insensitive fixed-string grep over all of `server/src` including `views/`:

`authorization_details` (snake_case) · `grant_id` · `grant_management_action` · `response_mode` and
every JARM value (`jwt`, `query.jwt`, `fragment.jwt`, `form_post.jwt`) · `jarm` ·
`authorization_signed_response_alg` · `form_post` · `client_assertion` · `client_assertion_type` ·
`tls_client_auth` · `self_signed_tls_client_auth` · populated `clientCertificate` (comment-only at
`services/userinfo.service.ts:61`, `services/introspection.service.ts:20`; body-key exclusion list at
`services/revocation.service.ts:46-47`) · `cnf` · `jkt` as a token binding (the two matches at
`services/token.service.ts:86,88` are the local `attJkt` attestation variable) · `use_dpop_nonce` ·
`nonce` as an OIDC request parameter.

---

## 7. Config and flag surface

### Env vars — 17 distinct, 4 hard-required at import

Required, throws via `utils/env.ts:1-8`: `SESSION_SECRET` (`config/app.config.ts:25`),
`AUTHLETE_BASE_URL` / `AUTHLETE_SERVICE_ID` / `AUTHLETE_BEARER_TOKEN`
(`config/authlete.config.ts:4-6`).

Optional in `config/`: `PROTECTED_RESOURCE_IDENTIFIER` (`app.config.ts:17`),
`PROTECTED_RESOURCE_DOCUMENTATION` (`:18`), `PORT` (`:22`), `NODE_ENV` (`:23,28`),
`MORGAN_FORMAT` (`:24`), `LOG_LEVEL` (`:27`), `REDIS_URL` (`:29`), `JWT_PRIVATE_KEY_PEM` /
`JWT_PUBLIC_KEY_PEM` / `JWT_ISSUER` (`authlete.config.ts:10-12`), `JWKS_URI` (`:16` — but
`controllers/logout.controller.ts:64-66` **throws** if unset when verifying a logout token).

Read outside `config/`: `ALLOWED_ORIGINS` (`app.ts:78` — **CORS only since 2026-08-12**; the logout service
no longer reads it),
`MGMT_CLIENT_ID` / `MGMT_CLIENT_SECRET` (`middleware/require-basic-auth.ts:27,46,47`),
`AUTH_USERS` (`services/login.service.ts:4`, falls back to `admin:password` with a warning at `:7-8`),
`LOGOUT_REDIRECT_URI` (`services/logout.service.ts:235`) and `LOGOUT_CLIENT_ID` (`:263`) — **both display
only since 2026-08-12**: the first is the "Return to application" link on the signed-out page, the second the
client shown on it. Neither authorises a redirect.
**`POST_LOGOUT_REDIRECT_URIS`** (`services/logout.service.ts:91`) is what does — a JSON `clientId → string[]`
registry, per RP-Initiated Logout §3. `NODE_ENV` is **no longer read** by the logout service; its non-production
`http://localhost:` clause was removed with RPL-W1.

`configDotenv()` is invoked once, at `config/app.config.ts:1-2`.

### Authlete service flags actually read

Only two call sites, both `authleteApi.service.get()` in `controllers/fapi.controller.ts`:

`fapiModes` (`:29,64,71`, via `computeFapiMode` `:5-20` testing `"FAPI2_SECURITY"` and prefix
`"FAPI2_MESSAGE_SIGNING_"`), `dpopNonceRequired` (`:30,65,72`), `dpopNonceDuration` (`:73`),
`issuer` (`:70`), `scopeRequired` (`:74`), `refreshTokenKept` (`:75`),
`refreshTokenIdempotent` (`:76`), `pkceRequired` (`:77`), `parRequired` (`:78`),
`clientIdMetadataDocumentSupported` (`:31-33,79-81`, read via `as Record<string, unknown>` cast —
**not in the SDK's typed model**).

`GET /api/fapi/config` additionally returns **hard-coded values it never reads**:
`requiredClientAuth: "PRIVATE_KEY_JWT"` (`:38`), `parRequired: true` (`:40`),
`pkceRequired: true` (`:41`), `refreshTokenRotation: false` (`:42`), `scopeRequired: true` (`:43`) —
which can contradict the live values `/api/fapi/status` reports.

### Client metadata fields settable

All in the `payload → input` mapper at `services/client.management.service.ts:391-493`: identity and
display (`:391-402`), sector (`:403-404`), client auth (`:405-406`), ID token (`:407-409`), UserInfo
(`:410-412`), **authorization-response signing/encryption `:413-415`** (JARM-adjacent, settable but
never used), request object (`:416-418`), auth policy incl. `parRequired`, `pkceRequired`,
`pkceS256Required`, `dpopRequired`, `tlsClientCertificateBoundAccessTokens` (`:419-427`), software
(`:428-430`), arrays incl. `grantTypes`, `responseTypes`, `requestUris`, `defaultAcrs`,
`authorizationDetailsTypes` (`:433-479`), CIBA (`:482-485`), `attributes` / `locked` (`:488-493`).

---

## 8. Test surface

Runner Vitest 4.1.9; configs `server/vitest.config.ts`, `server/vitest.e2e.config.ts`.

| Directory | Test files |
|---|---|
| `tests/unit/services/` | 24 |
| `tests/unit/controllers/` | 10 |
| `tests/unit/utils/` | 7 |
| `tests/unit/middleware/` | 6 |
| `tests/unit/routes/` | 4 |
| `tests/integration/` | 1 (`routes.test.ts`, 27 nested blocks) |
| `tests/e2e/` | 1 (`e2e.test.ts`, 34 spec-named blocks) + 5 provisioning scripts |
| **Total** | **53** |

Shared doubles: `tests/helpers/mock-authlete.ts` (SDK double), `tests/setup.ts`.

### Coverage gaps relevant to the audit

Controllers with **no unit test**: `client.management`, `device-session`, `discovery`, `default`,
`federation`, `grant-management`, `health`, `introspection-standard`, `jar`, `jwks`, `logout`,
`native-sso`, `native-sso-response.handler`, `par`, `revocation`, `session`, `token.management`,
`token-fail-response.handler`, `token-issue-response.handler`, `userinfo`,
`userinfo-issue-response.handler`, `authorization-response.handler`. `fapi` and
`protected-resource-metadata` have route-level tests only.

Services with no unit test: `federation.service.ts`, `native-sso.service.ts`.

Zod schemas with no test: `federationRegistrationSchema`, `nativeSsoProcessSchema`,
`nativeSsoLogoutSchema` (`server/src/utils/validation.ts:110,118,129`).

### Characterization test that locks deliberate behaviour

`tests/unit/controllers/token-exchange-response.handler.test.ts:73` — "characterization of deliberate
gaps", with nested blocks at `:87` (Module 06 Ex 6b, dropped params), `:127` (Ex 6a, RFC 8693 §2.2.1
violation), `:161` (Ex 6c, subject-token fallback), `:177` (action mapping).

---

## 9. Document → claim map

102 markdown files in scope: `docs/` 93, root 8, `.github/` 1.

### Highest claim density

| File | Location | Claim |
|---|---|---|
| `README.md` | `:92-130` | Three feature-status tables asserting **"Working"** for FAPI 2.0 + DPoP, Native SSO, Grant Management, DCR, ROPC |
| `docs/curriculum/README.md` | `:116-122` | **"Every spec identifier here is verified against its primary source, labeled by type … drafts are never presented as normative."** The master claim under test. |
| `docs/curriculum/SPEC-INVENTORY.md` | whole file | Per-spec status/date/title, verified 2026-07-27, fully re-verified 2026-08-02 |
| `docs/README.md` | `:31` | "This server handles HTTP. Authlete handles OAuth. Together, they give you a complete, spec-compliant authorization server" |
| `docs/API.md` | whole file | Complete reference for "40+ endpoints" |
| `docs/MCP-OAUTH-TUTORIAL.md` | whole file | "this server supports MCP flows out of the box" |

### Curriculum structure

14 modules, each exactly `README.md` + `lab.md` + `quiz.md` + `quiz-answers.md`:
00 Web + JOSE Foundations · 01 The Delegation Problem · 02 OAuth Core + Threats · 03 PKCE + Public
Clients · 04 Token Lifecycle + Metadata · 05 Request Integrity + Binding · 06 Machine + Delegated
Grants · 07 OAuth 2.1 + the Security BCP · 08 OIDC Core + Logout · 09a Interaction Extensions ·
09b Identity + Credentials · 10 FAPI + Grant Management · 11 API Security Beyond the Token ·
12 Capstone. Plus 4 cumulative exams with answer keys (`docs/curriculum/exams/`).

### Self-flagged uncertainty

**28 `UNVERIFIED` markers; zero `TODO`/`FIXME`/`TBD`/`XXX`.** Largest cluster:
`docs/curriculum/modules/09a-interaction-extensions/lab.md:36,285,441,533,610` — JARM
(`authorizationSignAlg`), CIBA (`bcDeliveryMode`), ACR (`supportedAcrs`) and RAR
(`supportedAuthorizationDetailsTypes`) console settings never applied, so five exercises have no
post-enablement transcript. Others: `docs/DEVICE-FLOW-TUTORIAL.md:185,619`;
`docs/FAPI-TUTORIAL.md:218,690`; `docs/TOKEN-EXCHANGE-TUTORIAL.md:602`;
`modules/08-oidc-core-and-logout/lab.md:392`; `modules/09b-identity-and-credentials/README.md:203,608`
and `lab.md:556`; `modules/11-api-security-beyond-the-token/lab.md:440,651`.

### The repo's own open-findings register

`docs/curriculum/PROGRESS.md` records **12 open findings** that the audit must confirm or refute
rather than rediscover:

1. Both FAPI reporting endpoints return **HTTP 200 with a stack trace** (`service.get()` throws).
2. Grant revocation leaves access tokens alive 24 h.
3. OpenID Federation entity-configuration endpoint broken, and misreports why (`services/federation.service.ts:14`, missing `requestBody`).
4. `prompt=none` returns 302 with an empty `Location` (`controllers/authorization.controller.ts:50-53`), plus dead `prompt=none` code at `:96`.
5. Logout endpoint is an **open redirect** surviving `NODE_ENV=production`.
6. Back-channel logout receipt cannot work (`JWKS_URI` unset) and never checks `iss`/`aud`.
7–9. The three deliberate token-exchange gaps (`controllers/token-exchange-response.handler.ts:27,29-34,48-55`).
10. Introspection endpoint unauthenticated (RFC 7662 §2.1 MUST).
11–12. Remaining items in the same register.

Also outstanding per `PROGRESS.md`: `idTokenSignAlg: HS256` on both test clients; `fapiModes` never
re-enabled, so **no lab step shows FAPI being enforced**; the five Module 09a console settings
"requested 2026-07-28, NOT YET APPLIED"; `authorizationCodeDuration: 0` recorded as NOT EVIDENCED.

### Orphaned documents

| File | Lines | Status |
|---|---|---|
| `docs/TICKET-PARAMETER.md` | 290 | Zero inbound links or prose mentions anywhere |
| `docs/curriculum/AUDIT-PASS-B.md` | 1,482 | Zero mentions; largest single doc file |
| `docs/curriculum/AUDIT-PASS-A.md` | 748 | Prose mention only, at `PROGRESS.md:1124`; never a link |
| `docs/MCP-OAUTH-TUTORIAL.md` | 293 | Absent from both tutorial indexes while `README.md`/`CHANGELOG.md` claim it shipped |
| `CHANGELOG.md` | 73 | Self-referential only |

---

## 10. Specification scope, reconciled against `llms.txt`

All 25 seed URLs in the audit skill resolve against the canonical index. Three corrections:

- **RAR has two pages**: `/configuration-reference/tokens-and-claims/rich-authorization-requests-rar` (the seed) and `/protocols-and-flows/protocol-extensions/rich-authorization-requests-rar-spec`.
- **JARM has a page** not in the seed list: `/configuration-reference/endpoints/enabling-jarm`. JARM is the repo's largest single implementation gap, so it is a first-class audit row.
- **RFC 9701** is documented as `/configuration-reference/endpoints/jwt-response-for-oauth-token-introspection`.

### Added to scope — in the skill's inventory, no `SPEC-INVENTORY.md` row

| Spec / capability | Authlete surface | Why |
|---|---|---|
| RFC 9701 JWT Introspection Response | `jwt-response-for-oauth-token-introspection` | Repo has `/api/introspection/standard` with no verdict on which RFC it implements |
| CIMD | `oauth-client-id-metadata-document-cimd` | Cited by module material (`modules/09a-interaction-extensions/quiz.md`) with **no inventory row** — a hole in the repo's own completeness claim |
| Parameterized scopes | `using-parameterized-scopes` | Group B; never mentioned in repo docs |
| Scope / client attributes | `scope-attributes`, `client-attributes` | Group B; `services/client.management.service.ts:488` sets `attributes` undocumented |
| Hardware security keys | `api-reference/hardware-security-key/*` | Group C; 4 endpoints implemented, zero docs, zero inventory row |
| HAIP | `haip-compliant-verifiable-credential-issuance` | Group C; decision record needed |
| MCP / OAuth 2.1 | no single page (composite of 8414 + 8707 + 7636 + 9728 + CIMD) | `docs/MCP-OAUTH-TUTORIAL.md` claims out-of-the-box support |
| Attestation-based client auth | **no page in `llms.txt`** | Headers forwarded at `services/token.service.ts:86-89`; unverifiable against Authlete docs |

### Outside Authlete's documented surface

`llms.txt` has **no page** for mDL/mdoc, OID4VP, RFC 8252, RFC 9700, or RFC 9068 by number
(`using-jwt-based-access-tokens` covers 9068's substance). These remain audit rows; their
Authlete-boundary column will read "no vendor surface — spec-only" rather than being invented.

### Identifiers cited in docs with no `SPEC-INVENTORY.md` row

RFC 8037 and RFC 9053 (both only in `AUDIT-PASS-A.md`), `draft-ietf-oauth-security-topics` (the
pre-RFC-9700 draft name, in `modules/02-oauth-core-and-threats/quiz-answers.md`), and
`draft-ietf-oauth-client-id-metadata-document-01`. Only the last is cited by module material, making
it the genuine gap.

---

## 11. Phase 2 batch order

| Batch | Contents | Why here |
|---|---|---|
| **B1** | Authlete `action` handling contract, two-step `ticket` linkage, service flags, result codes | Every later verdict depends on the boundary. Settles `jar.controller.ts:19` and the `GRANT_TYPE_MAP` fallback. |
| **B2** | RFC 6749, 6750, 7636, 7662, 9701, 7009, 9700 | Token issuance and presentation — where a defect is S1. Includes the unauthenticated introspection endpoint. |
| **B3** | RFC 8414, 9728, OIDC Discovery, OIDC Core, 7591, 7592, 8252 | Contains the recorded `/api`-prefix non-conformance; needs a verdict and severity. |
| **B4** | RFC 9126, 9101, 9207, 9449, 8705 (inherited decline), JARM | Largest gap cluster. |
| **B5** | RFC 7521, 7522, 7523, 8693, 8707, 9068, 9470 | Contains the three deliberate token-exchange defects — confirm, do not "fix". |
| **B6** | CIBA, RFC 8628, 9396, Native SSO, Grant Management, the four logout specs, OIDC Federation, OID4VCI, RFC 9901, CIMD, MCP | Mostly `CODE_ONLY` / config-gap territory; the 09a `UNVERIFIED` cluster. |
| **B7** | FAPI 1.0, FAPI 2.0 SP / Attacker Model / Message Signing, HAIP, mDL, OID4VP, HSK, parameterized scopes, scope/client attributes | Group C decision records, plus the `service.get()` SDK enum gap. |

---

## 12. Open questions carried into Phase 1

1. ~~**`SPIFFE_JWT` on the live service.**~~ **CLOSED 2026-08-12 (T1-5, DR-07).** Removing it did un-break `service.get()` and both FAPI endpoints — verified by an in-memory parse of the live response *before* the write. The working assumption ("leave it") was overturned, and the feared cost did not arrive: Module 10 Exercise 4 was **rebuilt** around the closed-enum mechanism rather than retired. §7's note that `clientIdMetadataDocumentSupported` is read through a cast *because the SDK lacks the field* was also wrong — **the SDK has it** (CIMD-W3).
2. **The five Module 09a console settings** are assumed still unapplied. The audit reports the configuration gap rather than assuming a fix.
3. **Orphaned docs** (`TICKET-PARAMETER.md`, `AUDIT-PASS-B.md`) are assumed an S4 finding to fix in Phase 5, not deliberate.

## Self-check for Phase 0

- [x] Authlete version pinned with six cited pieces of evidence, four external sources fetched this session.
- [x] Every codebase claim carries `path:line`.
- [x] Every external claim carries a URL fetched this session; no Authlete URL constructed by pattern — all resolved through `llms.txt`.
- [x] No verdicts written (correct for Phase 0).
- [x] Spec scope reconciled against `llms.txt`, with additions and exclusions stated and reasoned.
- [ ] *Not applicable at Phase 0:* verdict coverage, decision records, `DOC_INCORRECT` consequences, rebuild assessment — Phases 2–4.
