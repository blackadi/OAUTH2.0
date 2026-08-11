# OpenID Connect Client-Initiated Backchannel Authentication Flow — Core 1.0 (CIBA)

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Status:** OpenID **Final**, **1 September 2021** — re-verified against the primary source this session
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/CIBA-TUTORIAL.md`, `docs/curriculum/modules/09a-interaction-extensions/lab.md` Exercise 3, `AGENTS.md` CIBA paragraph

<thinking>
1. Requirements on the OP: the backchannel authentication endpoint accepts a form-encoded POST with
   `scope` (containing `openid`), a hint (`login_hint` / `login_hint_token` / `id_token_hint`), and client
   authentication; it responds **200** with `auth_req_id`, `expires_in`, and optionally `interval`. Errors use
   the token-endpoint error format. The OP then authenticates the user out of band and, in poll mode, the client
   polls the token endpoint with `grant_type=urn:openid:params:grant-type:ciba` receiving
   `authorization_pending` / `slow_down` until completion. Delivery mode is per-client.
2. Authlete boundary: `ciba.processAuthentication` → `issue` → (out-of-band auth) → `complete`, four action
   enums; the token endpoint natively handles the CIBA grant. The gates are the service's
   `supportedBackchannelTokenDeliveryModes` and, per client, **`bcDeliveryMode`**.
3. Code: `services/ciba.service.ts` + `controllers/ciba.controller.ts`. Two structural problems: the endpoint's
   request and response shapes are Authlete's, not CIBA's — and the `auth_req_id` is not in the authentication
   response at all, because it comes from the separate `/issue` call. Client authentication also ignores the
   `Authorization` header entirely.
4. Docs: Module 09a's Exercise 3 verifies all four error shapes and marks the success path `UNVERIFIED` with the
   precise reason (`bcDeliveryMode` unset).
5. Delta: the four verified refusals are genuine; the happy path cannot run; and the endpoint that *is*
   advertised in discovery does not speak the protocol.
6. Is `bcDeliveryMode` still unset? Confirmed by probe 3 — unset on all three clients, 2026-08-10, so the
   curriculum's 2026-07-28 marker is still accurate rather than merely stale.
</thinking>

## Normative requirements (OP side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Backchannel authentication endpoint accepts a form-encoded POST of the authentication request | CIBA §7.1 | ❌ requires JSON `{parameters}` — **F-1** |
| 2 | The client is authenticated at that endpoint as at the token endpoint | §7.1 | ⚠️ body credentials only; the `Authorization` header is ignored — **F-3** |
| 3 | Success is **200** with `auth_req_id` and `expires_in`, optionally `interval` | §7.3 | ❌ returns Authlete's envelope with a **`ticket`**, not `auth_req_id` — **F-2** |
| 4 | Errors in the token-endpoint error format | §13 | ❌ envelope, same defect as F-2 |
| 5 | Out-of-band user authentication, then completion | §7.1, §11 | ✅ `/api/ciba/complete` exists and maps `NO_ACTION` / `NOTIFICATION` correctly |
| 6 | Token endpoint supports `grant_type=urn:openid:params:grant-type:ciba` with `authorization_pending` / `slow_down` | §10.1, §11 | ✅ Authlete's, natively; the URN is in the live `grant_types_supported` |
| 7 | `backchannel_token_delivery_mode` is **REQUIRED** client metadata | §4 | ❌ **`bcDeliveryMode` unset on all three clients**, which are therefore non-conformantly registered for a grant type they all hold — F-4 |
| 8 | Advertise `backchannel_token_delivery_modes_supported` and the endpoint | §4 | ✅ live: `["poll","ping","push"]`, endpoint advertised — but see F-4 |
| 9 | `backchannel_user_code_parameter_supported` | §4 | ✅ live `true`; `bcUserCodeRequired = false` per client |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Parsing the request, resolving the hint, validating scope and client | Authlete | `ciba.processAuthentication` |
| Minting the `auth_req_id` | Authlete | `ciba.issue` — a **second** call, keyed by `ticket` |
| Authenticating the user out of band | **This server** (a deployment would use a push notification) | not implemented — no out-of-band authenticator exists |
| Completing the transaction | **This server** | `POST /api/ciba/complete` → `ciba.complete` |
| Polling | Authlete, at the token endpoint | no AS code needed |
| Ticket custody | **This server** | **violated** — F-2 |
| Delivery mode | Client configuration | `bcDeliveryMode` — unset |

## Finding F-1 — the advertised backchannel authentication endpoint cannot accept a CIBA request (S2)

`backchannel_authentication_endpoint = https://…/api/ciba/authentication` (probe 3), and
`services/ciba.service.ts:20-22`:

```ts
const { parameters, clientId, clientSecret } = req.body as {…};
if (!parameters) throw new AppError("Missing required body field: parameters", 400);
```

A conformant client POSTs `scope=openid&login_hint=alice&binding_message=…` form-encoded and receives
`400 {"error":"invalid_request","error_description":"Missing required body field: parameters"}`.

**This is the third advertised endpoint in this audit with the same defect.** The pattern, now complete enough
to be a Phase 4 theme:

| Advertised endpoint | Request shape | Response shape |
|---|---|---|
| `/api/par` (`pushed_authorization_request_endpoint`) | JSON `{parameters}` | Authlete envelope |
| `/api/ciba/authentication` (`backchannel_authentication_endpoint`) | JSON `{parameters}` | Authlete envelope |
| `/api/device/authorization` (`device_authorization_endpoint`) | JSON `{parameters}` | Authlete envelope |
| `/api/token` | form-encoded ✅ | `responseContent` ✅ |
| `/api/gm/:grantId` (`grant_management_endpoint`) | n/a | `responseContent` ✅ |

Three of five protocol endpoints this AS advertises speak Authlete's internal envelope instead of the wire
format their specification defines. The two that get it right are in the same codebase, so this is a
consistency failure rather than a knowledge gap.

## Finding F-2 — the response returns a `ticket` where CIBA requires `auth_req_id` (S2)

`controllers/ciba.controller.ts` maps `USER_IDENTIFICATION` → 200 and sends the whole Authlete response via
`sendApiResponse`; `responseContent` is never read (grep: zero occurrences in the file). Per `AGENTS.md`, the
200 body carries `ticket`, `hintType`, `hint`, `deliveryMode`.

CIBA §7.3 requires the authentication response to carry **`auth_req_id`** — the handle the client polls with.
It is not in this response, because Authlete mints it on the *second* call (`ciba.issue`, exposed separately at
`POST /api/ciba/issue`). So a client must: call `/authentication`, receive a `ticket`, then call `/issue` with
that ticket to obtain `auth_req_id`. That two-step is Authlete's internal contract, not CIBA's.

**And it exposes a ticket to the client.** Authlete's own guidance, quoted in `B1-authlete-boundary.md`, is
*"Do not expose them to user agents such as web browsers — for example, never use a ticket to manage browser
sessions."* This is the same violation as B1-1 at `/api/jar/process`, on an endpoint that is advertised in
discovery. Worse here in one respect: `POST /api/ciba/issue` carries **no authentication at all** (`generalLimiter`
only, per `00-inventory.md` §3.3), so anyone holding a leaked ticket can mint the `auth_req_id` for someone
else's authentication request.

**Failure scenario.** A learner follows `docs/CIBA-TUTORIAL.md`, ships these endpoints, and a partner's CIBA
client — written against the OpenID spec — reads `auth_req_id` from the authentication response, finds
`undefined`, and cannot poll. The learner's own SPA works, because it was written against the same two-step
shape.

## Finding F-3 — the `Authorization` header is ignored for client authentication (S3)

`ciba.service.ts:29-33` passes `clientId`/`clientSecret` from the **body** and nothing else. There is no
`parseBasicAuth` call, so a client registered for `CLIENT_SECRET_BASIC` — which is what
[Authlete's CIBA guide recommends](https://developers.authlete.com/guides/flows-and-protocols/grant-types-and-token-flows/how-to-implement-ciba-with-authlete),
as `AGENTS.md` itself notes — cannot authenticate here at all. It will earn
`[A157357] The client identifier is not found at the expected location`, the exact error the two-channel logic
in `services/par.service.ts:39-54` exists to prevent.

`AGENTS.md` documents the recommended configuration (`CLIENT_SECRET_BASIC`, matching the token endpoint) without
noting that this service cannot serve it. The PAR fix was never propagated: `parseBasicAuth` is used by
`token.service.ts` and `par.service.ts` and by nothing else.

## Finding F-4 — CIBA cannot complete on this deployment, and the curriculum says so precisely (S3, configuration)

Probe 3, all three clients: **`bcDeliveryMode` absent**, `bcNotificationEndpoint` absent, `bcRequestSignAlg`
absent, `bcUserCodeRequired: false` — while all three have the `CIBA` grant type and the service enables all
three delivery modes (`supportedBackchannelTokenDeliveryModes = ["POLL","PING","PUSH"]`,
`backchannelAuthReqIdDuration = 600`, `backchannelPollingInterval = 5`).

`modules/09a…/lab.md:441-446` states it exactly:

> **`UNVERIFIED` — `bcDeliveryMode` was unset as of 2026-07-28**, so this sequence has not been run end to end.
> Everything in 3a and 3c **is** verified, including all four error shapes.

**Probe 3 converts that from "was unset" to "still unset, observed 2026-08-10."** The marker is accurate, not
stale — worth recording, because an `UNVERIFIED` note whose premise has silently changed is worse than no note.
One client field makes Exercise 3's success path runnable.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Four CIBA endpoints, action→status maps, client creds in the body | `AGENTS.md` CIBA paragraph | Matches the code exactly | **Accurate** |
| "**Recommended Authlete config:** Client Auth Method = `CLIENT_SECRET_BASIC` … backchannel auth endpoint and token endpoint must use the same client auth method" | `AGENTS.md` | The recommendation is Authlete's, and **this server cannot honour it** — it never reads the Basic header — F-3 | `DOC_INCORRECT` / S3 |
| The authentication endpoint "returns `USER_IDENTIFICATION` → 200 with `ticket`, `hintType`, `hint`, `deliveryMode`" | `AGENTS.md` | Accurate as a description of this server; silent on the fact that CIBA §7.3 requires `auth_req_id` there | **Accurate but incomplete** / **S2** — F-2 |
| All four error shapes verified | `modules/09a…/lab.md` Ex 3a/3c | Verified refusals, correctly separated from the unverified success path | **Accurate — exemplary** |
| `UNVERIFIED` marker naming `bcDeliveryMode` | `lab.md:441-446` | Confirmed still unset by probe 3 | **Accurate** |
| Nothing states that the CIBA endpoint takes a JSON body rather than the CIBA wire format | `CIBA-TUTORIAL.md`, `AGENTS.md` | F-1. Contrast `modules/04…/lab.md:340`, which flags exactly this for the DCR wrapper | **Omission** / **S2** |
| Nothing notes that `POST /api/ciba/issue` is unauthenticated | `AGENTS.md` ("No admin auth required — client authentication is via `clientId`/`clientSecret` in the request body") | True of `/authentication`; `/issue` takes only a `ticket` and authenticates nothing | **Omission** / **S2** — F-2 |

## Sources consulted

- CIBA Core 1.0 §§4, 7.1, 7.3, 10.1, 11, 13 — `https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html`, fetched this session. **Title, Final status and date confirmed: 1 September 2021.** §7.1 requires `application/x-www-form-urlencoded` with UTF-8 and *"one (and only one) of the hints"*; §7.3 requires HTTP 200 with `auth_req_id` (minimum 128 bits of entropy) and `expires_in`, `interval` optional; §13 maps `invalid_request`/`invalid_scope`/`unknown_user_id`/… to 400, `invalid_client` to 401, `access_denied` to 403; §4 makes `backchannel_token_delivery_mode` **REQUIRED** client metadata and `backchannel_token_delivery_modes_supported` REQUIRED OP metadata.
- Authlete CIBA guide (linked from `AGENTS.md`, resolved via `llms.txt` in Phase 1) — the `CLIENT_SECRET_BASIC` recommendation
- Live probes 2 and 3 (2026-08-10): `backchannel_authentication_endpoint`, `backchannel_token_delivery_modes_supported`, `backchannel_user_code_parameter_supported`, `supportedBackchannelTokenDeliveryModes`, `backchannelAuthReqIdDuration`, `backchannelPollingInterval`, per-client `bcDeliveryMode` / `bcNotificationEndpoint` / `bcRequestSignAlg` / `bcUserCodeRequired` — `SERVICE-CONFIG-PROBE.md` §8
- SDK 1.0.0: the four CIBA action enums (`01-spec-matrix.md` §6)
- Code: `services/ciba.service.ts` (whole file), `controllers/ciba.controller.ts:14-48`, `routes/ciba.routes.ts:12-15`, `utils/basic-auth.ts`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| CIBA-W1 | Accept the CIBA wire format at `/api/ciba/authentication` | M | A form-encoded authentication request is accepted, and exactly one of `login_hint` / `login_hint_token` / `id_token_hint` is required per §7.1; the JSON `{parameters}` shape is retained for the SPA and labs. Sibling of **9126-W1** and **8628-W1** — do the three as one pattern. |
| CIBA-W2 | Return `auth_req_id`, never a `ticket` | M | The endpoint calls `processAuthentication` **and** `issue` internally and answers with `{auth_req_id, expires_in, interval}`; `ticket` never leaves the server. `POST /api/ciba/issue` becomes admin-only or is removed. |
| CIBA-W3 | Use `parseBasicAuth` for CIBA client authentication | S | Same three-channel logic as `par.service.ts:39-54`, with a unit test per channel. Makes `AGENTS.md`'s recommended `CLIENT_SECRET_BASIC` configuration actually work. |
| CIBA-W4 | Set `bcDeliveryMode` on one client | S | Module 09a Exercise 3's success path becomes runnable and one `UNVERIFIED` marker is retired. Console change. |
| CIBA-W5 | State the wire-format gap until W1/W2 ship | S | `CIBA-TUTORIAL.md` and `AGENTS.md` say plainly that these are Authlete-shaped debug endpoints, in the style of `modules/04…/lab.md:340`. |

**Ordering and gating.** W3 touches client authentication, which is on the **Security-critical surfaces** list,
so it needs a plan. W4 is configuration, independent, and the cheapest way to retire an `UNVERIFIED` marker.
W2 subsumes an authentication change to `/api/ciba/issue` and should be planned with W1.
