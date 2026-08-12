# RFC 9126 — OAuth 2.0 Pushed Authorization Requests

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Authlete version:** 3.0 (no minimum stated on the PAR page)
- **Repo docs under test:** `docs/PAR-TUTORIAL.md`, `docs/FAPI-TUTORIAL.md` Step 3, `docs/curriculum/modules/05-request-integrity-and-binding/lab.md` Exercise 1, `docs/curriculum/SPEC-INVENTORY.md:133`

<thinking>
1. RFC MUSTs on the AS: §2.1 authenticate the client as at the token endpoint, reject a request that itself
   carries `request_uri`, validate the pushed parameters as an authorization request; §2.2 on success return
   **201** with a JSON body whose members are `request_uri` and `expires_in`, the URI containing
   cryptographically strong randomness and bound to the posting client; §2.3 errors in the token-endpoint
   error format, with 405/413/429 named; §4 the client MUST use a `request_uri` once and the AS SHOULD treat
   it as one-time use; §5 advertise `pushed_authorization_request_endpoint` and
   `require_pushed_authorization_requests`.
2. Authlete boundary: `/pushed_auth_req` does the validation, the randomness, the binding and the expiry.
   Its page states the AS should hand the client `responseContent` — *"whose value is intended to be used as
   a pushed authorization response from the PAR EP to the client"* — and the vendored spec shows that value
   is literally `{"expires_in":600,"request_uri":"urn:…"}`, i.e. the §2.2 body, pre-built. So on this spec the
   AS's remaining jobs are tiny: accept the wire format, set the status, emit `responseContent`.
3. Code: the status mapping is right (`par.controller.ts:10-20`). The other two are not. The endpoint accepts
   only a JSON object with a `parameters` member (`par.service.ts:14-22`, `validation.ts:64-68`), and it
   returns the whole Authlete envelope rather than `responseContent` (`par.controller.ts:30`). The token
   endpoint next door does it correctly (`token.controller.ts:52` — `result.responseContent ?? result`).
4. Docs: `PAR-TUTORIAL.md` documents the endpoint as built, envelope and all, so it is internally honest;
   `FAPI-TUTORIAL.md:377-384` invents a third shape that is neither; Module 05 shows the real envelope but
   captions it as satisfying §2.2.
5. Delta: (3) vs (1) on both the request and the response format; (4) vs (1) in the tutorials; (4) vs (3) in
   FAPI-TUTORIAL only.
6. Was `/api/par` ever meant to be the client-facing endpoint, or is it an Authlete-shaped debug proxy? That
   changes the severity completely. Settled by probe 2: `pushed_authorization_request_endpoint` in the
   advertised metadata **is** `…/api/par`. It is the real endpoint.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Authenticate the client as at the token endpoint | §2.1 | ✅ `par.service.ts:39-54`, three channels, verified 2026-08-05 |
| 2 | Reject a pushed request that itself carries `request_uri` | §2.1 | ⊘ Authlete's |
| 3 | Validate the pushed parameters as an authorization request | §2.1 | ⊘ Authlete's |
| 4 | On success, **201** | §2.2 | ✅ `par.controller.ts:12`; observed `status=201` at `modules/05…/lab.md:101` |
| 5 | Body contains `request_uri` **and** `expires_in` as top-level JSON members | §2.2 | ❌ **F-2** — body is Authlete's envelope; neither member is top-level |
| 6 | `request_uri` cryptographically strong, bound to the posting client | §2.2 | ⊘ Authlete's |
| 7 | One-time use | §4 | ⊘ Authlete's — **verified live**: replay → `invalid_request_uri` `[A008303]` (`modules/05…/lab.md:143-151`) |
| 8 | Errors in the token-endpoint error format | §2.3 | ⚠️ Authlete's `responseContent` carries it, but the envelope wraps it — same defect as #5 |
| 9 | 413 on an oversized payload | §2.3 | ✅ `par.controller.ts:16` maps `PayloadTooLarge` |
| 10 | 405 on a non-POST request | §2.3 | ❌ absent — only POST is registered (`par.routes.ts:7`); a GET falls through to the SPA catch-all (`default.routes.ts:6`) |
| 11 | 429 when rate-limited | §2.3 | ✅ `generalLimiter`, 60/min (`par.routes.ts:7`) |
| 12 | Advertise `pushed_authorization_request_endpoint` | §5 | ✅ Authlete's — live value `…/api/par` |
| 13 | Advertise `require_pushed_authorization_requests` | §5 | ✅ Authlete's — live value `false` |
| 14 | Accept the request as `application/x-www-form-urlencoded` authorization parameters | §2.1 | ❌ **F-1** |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Client authentication channel selection | **This server** | `par.service.ts:39-54` |
| Validation, randomness, client binding, expiry, one-time use | Authlete | `pushedAuthorization.create` |
| Building the §2.2 response body | **Authlete** — it arrives pre-built in `responseContent` | vendored spec, `/api/{serviceId}/pushed_auth_req` 200 example |
| Emitting that body and the status | **This server** | `par.controller.ts:30` — **wrong** |
| Accepting the RFC wire format | **This server** | `par.service.ts:14-22` — **wrong** |
| `request_uri` lifetime | Authlete service config | `pushedAuthReqDuration = 600` (probe 2) |

## Finding F-1 — the advertised PAR endpoint cannot accept a conformant PAR request (S2)

RFC 9126 §2.1: the client posts the authorization request parameters to the PAR endpoint in
`application/x-www-form-urlencoded` form — the same parameters it would otherwise put in the authorization
URL. This server requires a **JSON object with a `parameters` member** holding those parameters as a
pre-encoded string:

```ts
// server/src/services/par.service.ts:20-22
if (!parameters) {
  throw new AppError("Missing required body field: parameters", 400);
}
```

`parSchema` (`utils/validation.ts:64-68`) makes `parameters` a required string, and `par.controller.ts:26`
enforces it before the service is reached. So a conformant client sending

```http
POST /api/par HTTP/1.1
Content-Type: application/x-www-form-urlencoded

response_type=code&client_id=4277838306&scope=openid&code_challenge=…&code_challenge_method=S256
```

receives `400 {"error":"invalid_request","error_description":"Missing required body field: parameters"}`
(`par.controller.ts:34-38`). Express parses that body fine — there is simply no `parameters` key in it.

**This is a conformance failure rather than a design choice because the endpoint is advertised as the real
one.** Probe 2:

```
pushed_authorization_request_endpoint = https://cecile-soapsudsy-zoila.ngrok-free.dev/api/par
```

A client that discovers this AS per RFC 8414, finds a PAR endpoint, and uses it as RFC 9126 specifies, fails
100% of the time. The shape being demanded is Authlete's *internal* request shape — `/pushed_auth_req` takes
`parameters` as one field — pushed out to the client. That inverts the whole point of the integration
boundary: the vendor's envelope should stop at the vendor.

**Failure scenario.** A learner completes `docs/PAR-TUTORIAL.md`, ships the endpoint, and hands the URL to a
partner using a standard OAuth library. Every PAR request 400s. The learner then debugs their client, because
the tutorial they followed told them the JSON shape was correct.

## Finding F-2 — the response body is Authlete's envelope, not RFC 9126 §2.2's (S2)

```ts
// server/src/controllers/par.controller.ts:30
sendApiResponse(res, mapActionToStatus(result.action), result);
```

`result` is the SDK `PushedAuthorizationResponse`. What reaches the client, per Authlete's own published
example for `POST /api/{serviceId}/pushed_auth_req` (vendored at `docs/openapi-spec.json`) and confirmed by
the transcript at `modules/05…/lab.md:96-101`:

```json
{ "resultCode": "A245001",
  "resultMessage": "[A245001] Successfully registered a request object for client (5921531358155430), URI is urn:…",
  "action": "CREATED",
  "requestUri": "urn:ietf:params:oauth:request_uri:CAK9…",
  "responseContent": "{\"expires_in\":600,\"request_uri\":\"urn:ietf:params:oauth:request_uri:CAK9…\"}" }
```

Three things are wrong with that as a §2.2 response:

1. **`request_uri` is not a top-level member.** It is present twice — as camelCase `requestUri`, and as a string inside `responseContent`. A conformant client reads neither.
2. **`expires_in` is not a top-level member at all.** §2.2 makes it REQUIRED.
3. **Authlete's internal diagnostics are forwarded**: `resultCode`, `resultMessage`, and `action`. The `resultMessage` includes Authlete's internal numeric client key. The caller is the authenticated client, so this is not a disclosure to a stranger — but it is vendor detail crossing a boundary it should not cross, and it is the same class of leak that B1-1 flags at `/api/jar/process`.

**The correct value is already in hand.** Authlete's PAR page states the AS should return `responseContent`:
*"whose value is intended to be used as a pushed authorization response from the PAR EP to the client."* And
the repo already knows this pattern — `token.controller.ts:52,62,68` all send `result.responseContent ?? result`.
PAR is the outlier, not the norm.

## Finding F-3 — the DPoP `htu` sent for PAR includes the query string (S3)

```ts
// server/src/services/par.service.ts:60-63
requestBody.htm = req.method;
const protocol = req.protocol;
const host = req.get("host") || "";
requestBody.htu = `${protocol}://${host}${req.originalUrl}`;
```

RFC 9449 §4.2 defines `htu` as the target URI *"without query and fragment parts"*, and §4.3 check 9 says the
comparison ignores them. `utils/dpop.ts:157-161` implements exactly that split and is **not used here** — PAR
builds its own. `PushedAuthorizationRequest` has no `targetUri` member (SDK
`models/pushedauthorizationrequest.ts`), so unlike UserInfo there is no second field to carry the full URI
either.

Today `POST /api/par` carries no query string, so the value is right by accident. Any request with one —
`POST /api/par?trace=1` — sends an `htu` the client's correctly-built proof cannot match, and Authlete
rejects a valid proof. Same defect at `token.service.ts:82`, `introspection.service.ts:63` and
`require-grant-ownership.ts:69`; treated as one work item in the RFC 9449 entry (**9449-W1**).

## Finding F-4 — three SDK fields Authlete accepts at `/pushed_auth_req` are never forwarded (S4)

`clientCertificate`, `clientCertificatePath`, `oauthClientAttestation`, `oauthClientAttestationPop` and the
per-request `dpopNonceRequired` override all exist on `PushedAuthorizationRequest` and none is set.
`AGENTS.md` already records the first and the attestation pair as a known gap. Adding the per-request
`dpopNonceRequired` is the **only** way to exercise the RFC 9449 §8 nonce path on this service without
changing the service flag — see RFC 9449 F-3. Not a defect on its own; recorded because it is the cheapest
route to a verified nonce transcript.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| The PAR request is a JSON body with `parameters` | `PAR-TUTORIAL.md:191-197`, and the same shape at `modules/05…/lab.md:91-93` | Accurate about this server; **never says this is not the RFC 9126 wire format** | `DOC_INCORRECT` by omission / **S2** — a learner ships an endpoint no conformant client can call |
| Diagram: `POST /api/par` with `parameters: response_type=code&client_id=…` then `201 Created + request_uri` | `PAR-TUTORIAL.md:106,110` | The diagram shows the RFC shape; the curl three sections later shows the JSON shape. Both are labelled the same flow | `DOC_INCORRECT` / S3 |
| `HTTP/1.1 201 Created` / `DPoP-Nonce: <serverNonce>` / `{"requestUri":"…","expires_in":90}` | `FAPI-TUTORIAL.md:377-384` | **A shape the server never emits.** `requestUri` is Authlete's spelling, `expires_in` is the RFC's, and the two never appear together at the top level. `expires_in` is 600 live, not 90. The `DPoP-Nonce` header cannot appear at all (`dpopNonceRequired = False`) | `DOC_INCORRECT` / **S2** |
| `GET /api/authorize?client_id=…&request_uri=…` | `FAPI-TUTORIAL.md:390` | The path is `/api/authorization` (`routes/authorization.routes.ts:7`). `/api/authorize` 404s into the SPA catch-all | `DOC_INCORRECT` / S3 |
| "**201 Created**, as RFC 9126 §2.2 requires, with a 600-second lifetime — the top of the spec's *'between 5 and 600 seconds'* range" | `modules/05…/lab.md:103-104` | Status and range both correct and correctly quoted. But the transcript directly above it is the envelope, captioned as satisfying §2.2 when only its status does | **Accurate on the status, incomplete on the body** / S3 |
| `request_uri` reuse → `invalid_request_uri` | `modules/05…/lab.md:143-151` | Reproduced live, exact Authlete code `[A008303]` | **Accurate** |
| "Different components can handle each step. An SPA can call PAR from JavaScript" | `PAR-TUTORIAL.md:144` | True here only because the endpoint takes JSON — i.e. the non-conformance is being presented as a feature | S3, folded into the F-1 doc item |
| `SPEC-INVENTORY.md:133` — PAR implemented in `par.routes.ts`, `par.service.ts` | `:133` | Accurate as a pointer; carries no conformance claim | **Accurate** |

## Sources consulted

- RFC 9126 §§2.1, 2.2, 2.3, 4, 5, 7.3 — `https://www.rfc-editor.org/rfc/rfc9126.txt`, `https://www.rfc-editor.org/rfc/rfc9126.html` (ToC and §2.2/§2.3/§4 quoted verbatim this session)
- RFC 9449 §4.2, §4.3 — `https://www.rfc-editor.org/rfc/rfc9449.txt`
- Authlete, Pushed Authorization Requests (PAR) — `https://developers.authlete.com/configuration-reference/endpoints/pushed-authorization-requests-par.md`
- Vendored Authlete API spec: `docs/openapi-spec.json`, `POST /api/{serviceId}/pushed_auth_req` 200 example
- SDK 1.0.0: `models/pushedauthorizationrequest.ts`, `models/pushedauthorizationresponse.ts`
- Live probe 2 (2026-08-10): `service/configuration`, `service/get` — see `SERVICE-CONFIG-PROBE.md` §5–§6
- Code: `controllers/par.controller.ts:10-20,26,30,34-38`, `services/par.service.ts:14-22,39-54,60-63`, `utils/validation.ts:64-68`, `utils/http-utils.ts:3-12`, `controllers/token.controller.ts:52`, `routes/par.routes.ts:7`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9126-W1 | Accept the RFC 9126 wire format at `/api/par` | M | A form-encoded body of authorization parameters is accepted and forwarded as `parameters`; the existing JSON `{parameters}` shape stays supported for the SPA and the labs; unit test covers both. `parseBasicAuth` continues to own the credential channel. |
| 9126-W2 | Return `responseContent` as the body | S | 201 body is exactly `{"expires_in":…,"request_uri":"urn:…"}`; error bodies are Authlete's `responseContent` verbatim; `resultCode`/`resultMessage`/`action` never reach the client. Follows `token.controller.ts:52`. Route test asserts the top-level members. |
| 9126-W3 | Add a 405 handler for non-POST on `/api/par` | S | `GET /api/par` → 405 with `Allow: POST`, not the SPA catch-all. |
| 9126-W4 | Use `dpopHttpTarget()` in `par.service.ts` | S | Merged into **9449-W1**. |
| 9126-W5 | Rewrite `FAPI-TUTORIAL.md` Step 3 against a real transcript | S | Every header and body reproducible; the `DPoP-Nonce` line removed or gated on the nonce flag; `/api/authorize` → `/api/authorization`. |
| 9126-W6 | State the wire-format gap in `PAR-TUTORIAL.md` and Module 05, then remove it | S | Until W1 ships, both documents say plainly that this endpoint takes an Authlete-shaped JSON body and is not callable by a conformant PAR client. After W1, the text and the diagram agree. |

**Ordering.** W2 before W1: it is three lines, it is the same pattern as the token endpoint, and it is what a
conformant client needs *after* W1 lets it in. Neither file is on the `AGENTS.md` **Security-critical
surfaces** list — `par.service.ts` **is** listed (under Client authentication), so **W1 requires its own plan
before editing**; W2 touches only `par.controller.ts` and does not.
