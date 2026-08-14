# RFC 7591 — Dynamic Client Registration · RFC 7592 — DCR Management Protocol

Paired because they share one router, one controller factory and one response builder. Separate verdicts.

- **Verdict — RFC 7591:** `PARTIAL`
- **Verdict — RFC 7592:** `PARTIAL`
- **Severity:** **S2** for both
- **Authlete version:** 3.0
- **Repo docs under test:** `AGENTS.md` (DCR bullet), `SPEC-INVENTORY.md:103-104,108-112`, `docs/API.md`, `CURL-TEST.md`, `modules/04`

<thinking>
1. RFC 7591's MUSTs: §3 — POST, `application/json`, TLS; the endpoint *"SHOULD allow registration
   requests with no authorization"* and MAY require an initial access token **in the form of an OAuth 2.0
   access token**; §3.2.1 — success is **201** with `application/json`, and the AS MUST return all
   registered metadata, with `client_id` REQUIRED, as **top-level members**; §3.2.2 — errors are 400 with
   a JSON object containing `error`.
   RFC 7592's MUSTs: §2 — *"The client MUST use its registration access token in all calls to this
   endpoint as an OAuth 2.0 Bearer Token"*; §2.1 read = **GET**; §2.2 update = **PUT**; §2.3 delete =
   **DELETE**, success 204 with `Cache-Control: no-store` and `Pragma: no-cache`; §3 — a non-existent
   client MUST get 401.
2. Authlete boundary: `dynamicClientRegistration.{register,get,update,delete}` do the work and return
   `responseContent` — the RFC-shaped body. `Service.unauthorizedOnClientConfigSupported` controls
   RFC 7592 §3's 401, and the live probe shows it is `True`. So Authlete's half is in good shape; the
   question is entirely what this server's HTTP surface does with it.
3. Code: the action→status map is complete and correct against `ClientRegistrationResponseAction`
   (7 members, all handled). But `buildResponse` wraps Authlete's `responseContent` inside the whole
   result object, and the three RFC 7592 operations are POSTs that read the registration access token
   from the request **body**.
4. Docs: `AGENTS.md` says *"The `responseContent` field is returned as the response body."* That is not
   what the code does — the body is the whole result with `responseContent` nested inside it.
5. Delta: RFC 7591's response shape is wrong (§3.2.1), and RFC 7592's method + token presentation are
   both wrong (§2, §2.1-2.3). Both are real interop breaks for a conforming DCR client.
6. Unsure: whether the discovery document advertises `registration_endpoint`. Named as a check.
</thinking>

## RFC 7591 — normative requirements

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | *"MUST accept HTTP POST … encoded in the entity body using the `application/json` format"* | §3 | ✅ `routes/dcr.routes.ts:12` |
| 2 | Endpoint *"SHOULD allow registration requests with no authorization"*; MAY require an initial access token **as an OAuth 2.0 access token** | §3 | ⚠️ requires **admin HTTP Basic** — see F-2 |
| 3 | Success: **201 Created**, `application/json` | §3.2.1 | ✅ `CREATED`→201 (`controllers/dcr.controller.ts:21`), `res.json` at `:53` |
| 4 | *"the authorization server MUST return all registered metadata about this client"*, `client_id` REQUIRED, as top-level members | §3.2.1 | ❌ **Unmet** — nested under `responseContent`; see F-1 |
| 5 | Errors: 400 with a JSON object containing `error` | §3.2.2 | ⚠️ status correct (`BAD_REQUEST`→400 at `:25`); body is the wrapped shape, so `error` is not top-level |

## RFC 7592 — normative requirements

| # | Requirement | Source | Status |
|---|---|---|---|
| 6 | *"The client MUST use its registration access token in all calls to this endpoint as an OAuth 2.0 Bearer Token"* | §2 | ❌ **Unmet** — read from the JSON body; see F-4 |
| 7 | Read = **GET** | §2.1 | ❌ `POST /api/client/dcr/get` (`routes/dcr.routes.ts:13`) |
| 8 | Update = **PUT** | §2.2 | ❌ `POST /api/client/dcr/update` (`:14`) |
| 9 | Delete = **DELETE**, success 204 | §2.3 | ⚠️ `POST /api/client/dcr/delete` (`:15`); 204 is mapped correctly (`:24`, body suppressed at `:34-36,52`) |
| 10 | Delete success carries `Cache-Control: no-store` and `Pragma: no-cache` | §2.3 | ❌ not set |
| 11 | Non-existent client → 401 | §3 | ✅ delegated; live `unauthorizedOnClientConfigSupported = True` |

## Finding F-1 — the registration response is not the client information response (S2)

`controllers/dcr.controller.ts:32-41`:

```
const body = result.responseContent
  ? { ...result, responseContent: safeParseJSON(result.responseContent) }
  : result;
```

The response body is Authlete's **entire result object** with the RFC-shaped document nested inside it. A
conforming DCR client receives:

```json
{ "resultCode": "…", "resultMessage": "…", "action": "CREATED",
  "responseContent": { "client_id": "…", "client_secret": "…",
                       "registration_access_token": "…", … } }
```

RFC 7591 §3.2.1 requires `client_id` and the rest of the registered metadata as **top-level members**.

**Failure scenario.** Any standards-based DCR client library — the kind an MCP client uses to
self-register — reads `response.client_id` and gets `undefined`. Registration appears to succeed with
HTTP 201 and yields no usable client. The client is registered on the Authlete side, so retrying creates
duplicates.

Secondary: it discloses Authlete's `resultCode` and `resultMessage` to every DCR caller, and
`/api/client/dcr/get|update|delete` need no admin credentials, so that diagnostic surface is reachable by
anyone holding a registration access token.

**`AGENTS.md` states the opposite of the code.** Its DCR bullet says *"The `responseContent` field is
returned as the response body."* If that were true, RFC 7591 §3.2.1 would be satisfied. The doc describes
the correct behaviour; the code does something else.

## Finding F-2 — registration is gated by admin Basic auth, not an initial access token (S3)

`controllers/dcr.controller.ts:48` calls `requireBasicAuth("dcr")`, so `POST /api/client/dcr/register`
requires `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`.

§3 says the endpoint *"SHOULD allow registration requests with no authorization"* and, where it does
restrict, *"MAY accept an initial access token in the form of an OAuth 2.0 access token"*. HTTP Basic with
deployment-wide management credentials is neither. So open registration is refused (contrary to the
SHOULD) and the permitted alternative is not what is implemented.

For a teaching deployment, refusing open registration is the responsible choice — an internet-reachable
open DCR endpoint is an abuse vector. The defect is that the deviation is undocumented and the mechanism
is non-standard. Recording it as S3 rather than S2: it does not break a conforming client that has been
given credentials, but a client implementing §3 as written cannot register.

## Finding F-4 — the registration access token is taken from the request body (S2)

`services/dcr.service.ts:28-45` reads it from the JSON body:

```
const { token, clientId } = req.body as { token?: string; clientId?: string };
if (!token) throw new AppError("Missing required body field: token", 400);
```

RFC 7592 §2: *"The client MUST use its registration access token in all calls to this endpoint as an
OAuth 2.0 Bearer Token."* A Bearer token goes in the `Authorization` header (RFC 6750 §2.1). Nothing here
reads that header for these three operations.

**Failure scenario.** A conforming RFC 7592 client sends
`GET {registration_client_uri}` with `Authorization: Bearer <rat>`. This server has no route for that
method and path; the SPA catch-all answers `GET` with **200 and HTML**. Even against the actual endpoint,
a client that put the token in the header gets `400 "Missing required body field: token"`.

Compounding: the repo already has the correct extractor for exactly this job —
`utils/dpop.ts:111-140`'s `extractAccessToken`, which handles the Bearer scheme case-insensitively and
enforces RFC 6750 §2's single-method rule. It is not used here.

## Finding F-5 — RFC 7592's HTTP surface is not RFC 7592 (S2)

Three fixed paths under `/api/client/dcr/`, all `POST`, versus the spec's **GET/PUT/DELETE on the
per-client client configuration endpoint** whose URI the AS returns as `registration_client_uri`.

So even with F-1 and F-4 fixed, a conforming client following `registration_client_uri` from the
registration response would be pointed at whatever Authlete put in that field — which this server does not
route. RFC 7592 is best described as **the Authlete APIs are correctly wired and the HTTP surface is a
custom RPC shape**, not an implementation of the protocol.

This is a defensible design for a debugging dashboard, and `SPEC-INVENTORY.md:108-112` already makes the
sharp point that RFC 7592 is **Experimental** and unevenly supported. What is missing is any statement
that *this* deployment does not implement its HTTP surface.

## What is correct

- **Action mapping is complete.** All 7 `ClientRegistrationResponseAction` members are handled (`:20-30`), and `DELETED`→204 correctly suppresses the body (`:34-36`).
- **`unauthorizedOnClientConfigSupported = True`** on the live service, so Authlete satisfies §3's 401-for-unknown-client requirement.
- **Zod validation** on all four operations (`utils/validation.ts`, tested at `tests/unit/utils/validation.test.ts`).
- **Test coverage exists:** `tests/unit/controllers/dcr.controller.test.ts:31` plus 4 nested; `tests/unit/services/dcr.service.test.ts`; integration at `tests/integration/routes.test.ts:267-290`; e2e at `tests/e2e/e2e.test.ts:985`.
- **Dependency injection** via `createDcrControllers(dcrServiceInstance)` (`:43`) — the cleanest testability pattern in the controller layer.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "The `responseContent` field is returned as the response body" | `AGENTS.md` DCR bullet | The body is the whole result with `responseContent` nested | `DOC_INCORRECT` / **S2** — the doc describes conformant behaviour the code does not have |
| Action→status mapping table | `AGENTS.md` DCR bullet | Matches the code and the SDK enum exactly | **Accurate** |
| "`get`/`update`/`delete` use the registration access token in the request body (no admin auth)" | `AGENTS.md` DCR bullet | **Accurate as a description** — and it documents the §2 violation without flagging it as one | **Accurate but not labelled** / S3 |
| RFC 7592 is Experimental, so AS support is uneven | `SPEC-INVENTORY.md:108-112` | Correct and well argued | **Accurate** |
| RFC 7591/7592 rows point at `dcr.routes.ts` as the implementation | `SPEC-INVENTORY.md:103-104` | True for RFC 7591's request side; RFC 7592's HTTP surface is not implemented | **Overstated** / S3 |

## Sources consulted

- RFC 7591 §§3, 3.1, 3.2.1, 3.2.2 — `https://www.rfc-editor.org/rfc/rfc7591.html`
- RFC 7592 §§2, 2.1, 2.2, 2.3, 3 — `https://www.rfc-editor.org/rfc/rfc7592.html`
- RFC 6750 §2.1 (Bearer presentation) — `https://www.rfc-editor.org/rfc/rfc6750.html`
- Live probe: `unauthorizedOnClientConfigSupported = True` (`SERVICE-CONFIG-PROBE.md`)
- Code: `routes/dcr.routes.ts:12-15`, `controllers/dcr.controller.ts:19-99`, `services/dcr.service.ts:14-50`, `routes/default.routes.ts:6`
- SDK 1.0.0: `models/clientregistrationresponse.ts` (`ClientRegistrationResponseAction`, 7 members)

**Named check, not performed:** whether the discovery document includes `registration_endpoint`, and what
value Authlete puts in `registration_client_uri`. Both are visible in a single `GET` of the discovery
document plus one DCR registration — worth doing before 7592-W3.

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 7591-W1 | Return `responseContent` **as** the body | S | ✅ **DONE 2026-08-14** (T1-11, under plan mode) — **and 7591-W3 is satisfied by it rather than needing its own edit**, which is the cleaner of the two outcomes that item allowed for: `AGENTS.md` already *claimed* the body was `responseContent`, so making the code match turned a false sentence true. `buildResponse` returned `{ ...envelope, responseContent: <parsed> }` — the RFC 7591 §3.2.1 registration response **nested inside** the vendor envelope — so a conforming client found `action` at the top level and had to unwrap a vendor field to reach `client_id`. `DcrSection.tsx`'s unwrap is deleted along with its camelCase fallbacks, which existed only because it was ambiguous which shape you would get. Earlier note kept for the record: ⬜ **DEFERRED to batch 3, 2026-08-13, with a reason.** The premise is confirmed by probe — Authlete's `responseContent` is the spec-shaped body at every endpoint checked — but this change is part of a cluster that **breaks the client SPA**: `ParSection.tsx:112` reads `d.requestUri` and `DeviceSection.tsx:159-160` read `userCode`/`deviceCode`, all camelCase Authlete-envelope fields. DCR is the cheap one of the three (`DcrSection.tsx:59` already unwraps `responseContent`), but shipping it alone would leave the three sibling endpoints inconsistent. Scheduled as one batch with the SPA and the lab transcripts. **7591-W3's `AGENTS.md` correction must land with it**, not before. |
| 7591-W2 | Document the admin-Basic deviation from §3 | S | `docs/API.md` and `AGENTS.md` state that open registration is deliberately refused and that admin Basic stands in for §3's initial access token |
| 7592-W1 | Accept the registration access token as a Bearer header | M | All three operations read `Authorization: Bearer` via the existing `extractAccessToken`; the body form kept as a documented fallback if labs depend on it. **Client-authentication surface — needs a plan.** |
| 7592-W2 | Add RFC 7592-shaped methods | M | `GET`/`PUT`/`DELETE` on a client-configuration path; `DELETE` success sets `Cache-Control: no-store` and `Pragma: no-cache`. Keep the POST paths as aliases so labs keep working. |
| 7592-W3 | State plainly that RFC 7592's HTTP surface is not implemented | S | `SPEC-INVENTORY.md:104` distinguishes "the Authlete management APIs are wired" from "the RFC 7592 protocol is served" |
| 7591-W3 | Fix the `AGENTS.md` claim | S | Either after 7591-W1 the doc becomes true, or the doc is corrected first. Do not leave them disagreeing. |

**Sequencing.** 7591-W1 is the highest-value item here — it is small, and it is the difference between a
DCR endpoint a standard client can use and one only this repo's SPA can use. It must land together with
the `AGENTS.md` correction so code and doc never disagree.
