# RFC 8628 — OAuth 2.0 Device Authorization Grant

- **Verdict:** `PARTIAL`
- **Severity:** **S1**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/DEVICE-FLOW-TUTORIAL.md`, `AGENTS.md` Device Flow paragraph, `docs/curriculum/modules/09a-interaction-extensions/`, `client/src/components/oidc/DeviceSection.tsx`

<thinking>
1. RFC MUSTs on the AS: §3.1 — the device authorization endpoint takes a form-encoded POST; confidential clients
   authenticate as at the token endpoint, public clients send `client_id`. §3.2 — respond 200 `application/json`
   with REQUIRED `device_code`, `user_code`, `verification_uri`, `expires_in`, and OPTIONAL
   `verification_uri_complete`, `interval` (default 5). §3.3 — the device shows `user_code` and
   `verification_uri` to the user. §3.4/§3.5 — the token endpoint handles the device-code grant and the four
   polling errors. §5.1 — *"it is recommended that the server rate-limit user code attempts"*, with a worked
   entropy calculation. §4 — advertise `device_authorization_endpoint`.
2. Authlete boundary: three APIs plus the token endpoint. Authlete's page states it *"creates another content of
   a device authorization response and send it back to the authorization server. The authorization server passes
   the device authorization response back to the client"* — i.e. `responseContent` is meant to be returned
   verbatim. The user-facing verification page and, critically, **authenticating the user before completion**,
   are the AS's own work.
3. Code: the action→status maps are exactly right (all three, including the `ACCESS_DENIED`-is-a-request-value
   subtlety). Everything else about the three API endpoints is wrong in the same way as PAR and CIBA — and one
   of them is worse than a shape problem, because it has no authentication and no rate limiter.
4. Docs: `AGENTS.md` documents the missing authentication explicitly and calls the endpoints "local testing
   surfaces". `routes/device.routes.ts` has no environment gate, so they are not local.
5. Delta: request shape, response shape, and an unauthenticated approval endpoint reachable in production.
6. Does `deviceVerificationUriComplete`'s literal `USER_CODE` get substituted? Authlete's device-flow page says
   nothing about it — recorded as unconfirmed rather than assumed either way.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Device authorization endpoint takes a form-encoded POST | §3.1 | ❌ requires JSON `{parameters}` — **F-1** |
| 2 | Confidential clients authenticate as at the token endpoint; public clients send `client_id` | §3.1 | ⚠️ body credentials only; the `Authorization` header is never read (same as CIBA F-3) |
| 3 | Respond 200 `application/json` with `device_code`, `user_code`, `verification_uri`, `expires_in` | §3.2 | ❌ returns Authlete's envelope in camelCase — **F-2** |
| 4 | `verification_uri_complete` and `interval` OPTIONAL | §3.2, §3.3.1 | ⚠️ configured; the `interval` is 5 and `verification_uri_complete` carries a literal placeholder — **F-5** |
| 5 | The device displays `user_code` and `verification_uri` | §3.3 | ⚠️ `verification_uri` points at an ephemeral tunnel — **F-4** |
| 6 | Token endpoint handles `grant_type=urn:ietf:params:oauth:grant-type:device_code` | §3.4 | ✅ Authlete's, natively; the URN is in the live `grant_types_supported` |
| 7 | `authorization_pending`, `slow_down`, `access_denied`, `expired_token` | §3.5 | ✅ Authlete's; `ACCESS_DENIED` correctly modelled as a *request* value, not a response action (`01-spec-matrix.md` §6) |
| 8 | **Rate-limit user code attempts** | §5.1 | ❌ **no rate limiter on any `/api/device/*` route** — F-3 |
| 9 | The AS authenticates the user before recording approval | §3.3, §5.3, §5.5 | ❌ **`POST /api/device/complete` authenticates nobody** — F-3 |
| 10 | Advertise `device_authorization_endpoint` | §4 | ✅ live: `https://…/api/device/authorization` |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Generating `device_code` / `user_code`, lifetimes, polling interval | Authlete | `deviceFlow.authorization`; service settings below |
| Building the §3.2 response body | **Authlete**, returned verbatim per its own page | `responseContent` — **never read** (F-2) |
| Verifying a submitted user code | Authlete | `deviceFlow.verification` |
| **Authenticating the end user** | **This server** | `POST /device/consent` ✅ / `POST /api/device/complete` ❌ |
| Recording approval or denial | Authlete | `deviceFlow.complete` |
| Polling | Authlete, at the token endpoint | no AS code needed |
| Rate-limiting code entry | **This server** | not implemented — F-3 |

Live service settings (probe 3): `deviceAuthorizationEndpoint` and `deviceVerificationUri` set,
`deviceVerificationUriComplete = https://…/device?user_code=USER_CODE`, `deviceFlowCodeDuration = 600`,
`deviceFlowPollingInterval = 5`, `userCodeCharset = BASE20`, `userCodeLength = 0` (⇒ Authlete's default, 8 for
BASE20 per `AGENTS.md`). All of `AGENTS.md`'s stated mandatory fields are present, so the flow's configuration
is complete — which is what makes F-3 exploitable rather than theoretical.

## Finding F-3 — an unauthenticated endpoint approves any pending device authorization as any subject (S1) — ✅ **FIXED 2026-08-10**

> **Status:** closed. `POST /api/device/complete` is now gated by `middleware/development-only.ts` (a flat `404`
> unless `NODE_ENV=development`), and `deviceCodeLimiter` (5/min) covers both user-code paths per §5.1 while
> `generalLimiter` covers `/api/device/authorization`. Asserted in `tests/unit/routes/device.routes.test.ts`.
> **8628-W1 and 8628-W2 done**; W3–W6 remain open. The finding text below is preserved as the historical record —
> note that the endpoint is still unauthenticated *within* development, which is why the gate rather than the
> authentication is the fix.

`routes/device.routes.ts:14-16`:

```ts
router.post("/api/device/authorization", deviceAuthorizationController.handle);
router.post("/api/device/verification", deviceVerificationController.handle);
router.post("/api/device/complete",     deviceCompleteController.handle);
```

**No middleware at all** — no authentication, no rate limiter, no CSRF, and no environment gate. The browser
paths immediately below get `generalLimiter` and `csrfProtection`; these three get nothing.
`services/device.service.ts:47-64` forwards `userCode`, `result` and `subject` straight to
`deviceFlow.complete`, so:

```
POST /api/device/complete
{"userCode":"<any live code>","result":"AUTHORIZED","subject":"admin"}
```

records approval for that device authorization **as the subject the caller names**. The device's next token poll
then succeeds and it receives an access token issued for that subject. No credential is presented at any point.

Chained with the missing rate limiter this is a complete account-takeover path against the device flow:

1. `POST /api/device/verification` has no rate limiter, so `user_code` values can be enumerated. RFC 8628 §5.1 anticipates exactly this — an 8-character BASE20 code carries *"roughly 34.5 bits of entropy"* and the RFC's own calculation assumes *"the rate-limiting interval and validity period would need to only allow 5 attempts"* to reach a 2⁻³² guessing probability. With unlimited attempts over a 600-second window, that assumption is void.
2. Any code found live is then approved via `/api/device/complete` as an arbitrary `subject`.

The attacker does not even need step 1 in the common case: a device shows its `user_code` on a screen (§5.5,
"Session Spying"), and anyone who reads it can approve it as someone else without ever touching the device.

**`AGENTS.md` documents the gap and understates its reach.** It says:

> **Security note:** `/api/device/*` carries no rate limiter and `/api/device/complete` has no authentication at
> all — it approves any live `userCode` as any `subject`. Those are local testing surfaces; the authenticated
> path is `POST /device/consent`.

The description is exactly right; *"local testing surfaces"* is not. Nothing scopes these routes to development
— compare `POST /api/token/createLocalToken`, which 404s unless `NODE_ENV === "development"`
(`controllers/token.management.controller.ts:256`). On any deployed instance these three routes are live. That
is why this is S1 rather than a documented-and-accepted testing convenience: the mitigation the note relies on
does not exist in code.

## Finding F-1 — the advertised device authorization endpoint cannot accept a §3.1 request (S2)

`services/device.service.ts:9-22` requires JSON `{parameters}`, while §3.1 specifies a form-encoded POST and
`device_authorization_endpoint` is advertised in discovery. A conformant device receives
`400 {"error":"invalid_request","error_description":"Missing required body field: parameters"}`.

Third instance of the pattern tabulated in `CIBA-core-1.0.md` F-1 — PAR, CIBA and Device all take Authlete's
internal request shape on an endpoint the AS advertises as the real one.

## Finding F-2 — the response is Authlete's envelope in camelCase, not §3.2's JSON (S2)

`controllers/device.controller.ts` maps `OK` → 200 and hands the whole Authlete response to `sendApiResponse`;
`responseContent` appears nowhere in the file (grep: zero occurrences). Per `AGENTS.md` the 200 body carries
`deviceCode`, `userCode`, `verificationUri`, `expiresIn`, `interval`.

§3.2's members are `device_code`, `user_code`, `verification_uri`, `expires_in`, `interval` — snake_case, and the
first four are REQUIRED. A conformant device reads `response.device_code` and gets `undefined`, so it cannot
poll; `interval` is the only member whose name happens to match.

**Authlete already supplies the right body.** Its device-flow page, fetched this session, states that Authlete
*"creates another content of a device authorization response and send it back to the authorization server. The
authorization server passes the device authorization response back to the client."* That content is
`responseContent`, and the controller ignores it — while `controllers/token.controller.ts:52` and
`controllers/grant-management.controller.ts:26` in the same codebase do it correctly.

## Finding F-4 — the user-facing verification URI points at an ephemeral tunnel (S2)

`deviceVerificationUri = https://cecile-soapsudsy-zoila.ngrok-free.dev/device` (probe 1 §3.9, probe 3).

§3.3 has the device display this URI for the user to visit on a second device. An ngrok free-tier tunnel
disappears when the process restarts, at which point every device in the field displays a URI that 404s and the
flow has no recovery path — the user cannot be redirected, because the device is showing a printed string.
Probe 2 §5 established that *all* the service's endpoints are on this tunnel, but this is the one a human is
asked to type, which makes it the most visible failure.

## Finding F-5 — `verification_uri_complete` carries a literal `USER_CODE` placeholder, and I could not confirm the substitution (S3)

`deviceVerificationUriComplete = https://…/device?user_code=USER_CODE` (probe 3).

§3.3.1 exists so a device can render a QR code that carries the code, and the URI *"should include the
`user_code` or equivalent disambiguating information."* If Authlete substitutes the actual code for the literal
`USER_CODE`, this is correct and idiomatic. If it does not, every QR code emitted by this service sends the user
to a page pre-filled with the string `USER_CODE`.

**Authlete's device-flow page, fetched this session, says nothing about the placeholder** — it defers service
settings to other pages. So I am recording this as unconfirmed rather than guessing. One `/device/authorization`
call and a look at the returned `verification_uri_complete` settles it; the repo has never exercised this field
(no mention in `DEVICE-FLOW-TUTORIAL.md` beyond `AGENTS.md`'s "optional").

## What this spec gets right

Worth recording because the action mapping here is better than in most of the repo, and `01-spec-matrix.md` §6
verified it against the SDK enums:

- All three action maps are complete: authorization (`OK`/`BAD_REQUEST`/`UNAUTHORIZED`/`INTERNAL_SERVER_ERROR`), verification (`VALID`/`NOT_EXIST`→404/`EXPIRED`→400/`INTERNAL_SERVER_ERROR`), complete (`SUCCESS`/`USER_CODE_NOT_EXIST`→404/`USER_CODE_EXPIRED`→400/`INVALID_REQUEST`→400/`SERVER_ERROR`).
- `ACCESS_DENIED` is correctly **absent** from the complete map, because `DeviceCompleteResponseAction` has no such member — it is a *request* `result` value. `AGENTS.md` explains this precisely and it is one of the four "looks like a bug, is correct" cases from B1.
- The authenticated browser path (`POST /device/consent`, with `generalLimiter` + `csrfProtection`) is the design the spec wants; the defect is that the unauthenticated API path exists alongside it.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Action→status maps "match the SDK's action enums exactly" | `AGENTS.md` | Confirmed against the SDK | **Accurate** |
| `ACCESS_DENIED` is a request `result`, not a response action | `AGENTS.md` | Confirmed | **Accurate** |
| `deviceVerificationUri` and a positive `deviceFlowCodeDuration` are mandatory | `AGENTS.md` | Confirmed live (both set) | **Accurate** |
| "`/api/device/*` carries no rate limiter and `/api/device/complete` has no authentication at all — it approves any live `userCode` as any `subject`" | `AGENTS.md` | **Exactly right** | **Accurate** |
| "Those are local testing surfaces" | `AGENTS.md` | ❌ No environment gate exists (`routes/device.routes.ts:14-16`); the routes are live wherever the server is deployed | `DOC_INCORRECT` / **S1** — the sentence is what makes an S1 read as accepted risk |
| The device authorization response is `{deviceCode, userCode, verificationUri, expiresIn, interval}` | `AGENTS.md` | Accurate about this server; §3.2 requires snake_case, and Authlete supplies it | **Accurate but incomplete** / **S2** |
| Nothing states that `/api/device/authorization` takes a JSON body rather than RFC 8628's wire format | `DEVICE-FLOW-TUTORIAL.md`, `AGENTS.md` | F-1 | **Omission** / S2 |
| Two `UNVERIFIED` markers in the device tutorial | `DEVICE-FLOW-TUTORIAL.md:185,619` | Not re-examined in this entry — carried to Phase 3 | — |

## Sources consulted

- RFC 8628 §§3.1, 3.2, 3.3, 3.3.1, 3.4, 3.5, 4, 5.1, 5.3, 5.5, 6.1 and full ToC — `https://www.rfc-editor.org/rfc/rfc8628.txt` (§3.2's member list and §5.1's entropy calculation quoted verbatim this session)
- Authlete, OAuth 2.0 Device Authorization Grant — `https://developers.authlete.com/protocols-and-flows/advanced-flows/oauth-2-0-device-authorization-grant-device-flow.md` (confirms `responseContent` is meant to be returned verbatim; **states nothing** about the `USER_CODE` placeholder or about rate limiting — recorded as a source gap)
- Live probes 1–3 (2026-08-10): `device_authorization_endpoint`, `deviceVerificationUri`, `deviceVerificationUriComplete`, `deviceFlowCodeDuration`, `deviceFlowPollingInterval`, `userCodeCharset`, `userCodeLength` — `SERVICE-CONFIG-PROBE.md` §3.9, §8
- SDK 1.0.0: the three device action enums (`01-spec-matrix.md` §6)
- Code: `routes/device.routes.ts:14-21`, `services/device.service.ts` (whole file), `controllers/device.controller.ts:13-41`, `controllers/device-session.controller.ts`, `controllers/token.management.controller.ts:256` (the environment gate that this route lacks)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 8628-W1 | **Close `POST /api/device/complete`** | S | **Highest priority in B6.** Either gate all three `/api/device/*` routes on `NODE_ENV === "development"` (matching `createLocalToken`), or require admin Basic auth on `/complete`, or delete it in favour of `POST /device/consent`. A test asserts an unauthenticated call is refused. Then correct `AGENTS.md`'s "local testing surfaces" sentence to describe what the code actually does. |
| 8628-W2 | Rate-limit the device routes | S | `/api/device/verification` and `POST /device` carry a limiter sized against §5.1's calculation (the RFC's own worked example allows ~5 attempts); a brute-force test shows the lockout. |
| 8628-W3 | Return `responseContent` at `/api/device/authorization` | S | The 200 body is exactly §3.2's JSON with snake_case members; `resultCode`/`resultMessage`/`action` never reach the device. Same one-line pattern as `token.controller.ts:52`. |
| 8628-W4 | Accept the §3.1 wire format | M | Form-encoded accepted; JSON `{parameters}` retained for the SPA. One change with **9126-W1** and **CIBA-W1**. |
| 8628-W5 | Move `deviceVerificationUri` off the ephemeral tunnel | S | A stable host, or the tutorial states that the device flow's human-facing leg is time-bombed and how to re-point it. |
| 8628-W6 | Establish whether `USER_CODE` is substituted | S | One `/device/authorization` call; the answer goes into `AGENTS.md`. If it is not substituted, drop the field or template it correctly. |

**Ordering and gating.** W1 first, and it is small. None of these files is on the `AGENTS.md`
**Security-critical surfaces** list — which is worth flagging at Gate 4: `routes/device.routes.ts` decides
whether an unauthenticated caller can approve an authorization, and the list does not cover it. That looks like
a gap in the list rather than in the code.
