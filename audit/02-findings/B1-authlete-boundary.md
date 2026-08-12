# B1 — The Authlete integration boundary

Not a specification; the contract every later verdict depends on. Audited first so B2–B7 need not
re-derive it.

- **Verdict:** `PARTIAL`
- **Severity:** S2 (highest individual finding in this entry)
- **Authlete version:** 3.0
- **Repo docs under test:** `AGENTS.md` (Token endpoint action coverage table), `docs/TICKET-PARAMETER.md`, `docs/ARCHITECTURE.md`, `docs/curriculum/modules/05-request-integrity-and-binding/`

<thinking>
1. Authlete's own contract, from the two pages fetched this session: call a Core API, read `action`,
   branch on it, build the HTTP response from `responseContent`. Explicitly: never branch on
   `resultCode`. For multi-step actions the AS does its own work (authenticate, consent) and then
   calls a second API carrying the `ticket`. The ticket is single-use, 24 h, and must never be
   exposed to a user agent.
2. Boundary: Authlete owns protocol decisions and response *content*; the AS owns HTTP status,
   headers, user authentication, consent, and ticket custody. So the auditable surface on this side is
   exactly three things — is every `action` handled, is the status mapping right, and is the ticket
   kept server-side.
3. Code: 36 switches + 2 if-chains, all with a `default`. I extracted all 46 SDK action enums and
   diffed them. 35 of 36 complete; one gap (`StandardIntrospectionResponseAction.JWT`, carried to the
   RFC 9701 entry). Two further boundary violations found that are not action-coverage issues:
   `jar.controller.ts:19` ignores `action` entirely, and `token.operations.service.ts:36` silently
   coerces unknown grant types.
4. Docs: `AGENTS.md`'s token-action table lists 9 actions + default and matches `TokenResponseAction`
   exactly — that claim is correct. `docs/TICKET-PARAMETER.md` explains ticket custody correctly but
   is orphaned (no inbound links), so nobody reaches it.
5. Delta: the action-coverage discipline is genuinely good — better than the repo claims for itself.
   The failures are localized: one endpoint that never branches, one silent enum coercion.
6. Unsure: whether Authlete populates the full `Service` model on `/auth/authorization` responses.
   Settled offline from the vendored spec — it does not; the object is trimmed to 4 keys.
</thinking>

## Authlete's stated contract

| Requirement | Source (fetched this session) |
|---|---|
| Branch on `action`; **never** use `resultCode` as a branching condition | `/get-started/concepts/action-handling` |
| Build the HTTP response from `responseContent`; the AS owns status and headers | same |
| Multi-step actions (`INTERACTION`, `NO_INTERACTION`, `PASSWORD`, …) require AS work before a second API call | same |
| Action lists in the docs are "not exhaustive" — consult the API reference per API | same |
| `ticket` is single-use, expires after 24 h, links the two calls | `/get-started/concepts/two-step-api-calls` |
| *"Do not expose them to user agents such as web browsers — for example, never use a ticket to manage browser sessions."* | same |

## Finding B1-1 — `POST /api/jar/process` ignores `action` entirely

**Severity S2.** `server/src/controllers/jar.controller.ts:19` is `return res.json(result)` — the raw
Authlete `AuthorizationResponse`, HTTP **200**, for every `action` value. `AuthorizationResponseAction`
includes `BAD_REQUEST` and `INTERNAL_SERVER_ERROR`
(`models/authorizationresponse.ts:34-39`), so a request object that fails signature validation, has a
`client_id` mismatch, or is expired returns **200 OK**.

The route is unauthenticated — `server/src/routes/jar.routes.ts:7` applies `generalLimiter` and
nothing else.

**What is actually disclosed.** I checked rather than assumed. The SDK types
`AuthorizationResponse.service` as the full `Service` model (`models/authorizationresponse.ts:87`),
which carries `apiSecret` (`models/service.ts:162`) and `jwks` — documented as *"must contain pairs of
public/private keys"* (`models/service.ts:728-738`). **Authlete does not return those.** Its own
published example for `POST /api/{serviceId}/auth/authorization` 200
(`docs/openapi-spec.json`, the vendored Authlete API Explorer spec) returns a `service` object of
exactly four keys — `apiKey`, `clientIdAliasEnabled`, `number`, `serviceName` — and no key material.
So this is **not** a key-disclosure bug. The SDK's typing is simply wider than the wire response.

What the endpoint does hand an unauthenticated caller, per that same example:

| Field | Why it matters |
|---|---|
| `ticket` | A live single-use Authlete credential. Authlete's documentation says never expose it. |
| `client` | `clientId`, `clientIdAlias`, `clientName`, `logo_uri`, `number` — a client-enumeration oracle |
| `scopes` | The service's full scope catalogue with descriptions |
| `service` | `apiKey`, `number`, `serviceName` |
| `resultCode` / `resultMessage` | Authlete internal diagnostics |

**Failure scenario.** `curl -X POST /api/jar/process -d '{"request":"<expired JWT>","clientId":"…"}'`
→ HTTP **200** with `action: "BAD_REQUEST"` in the body. Any caller that checks the HTTP status — which
is what `docs/curriculum/modules/05-request-integrity-and-binding/lab.md:200` teaches learners to do
with `curl -s` — reads a rejected request object as accepted.

**Aggravating:** no unit test (`controllers/jar.controller.ts` is on the no-test list), and no e2e or
integration coverage of `/api/jar/process` at all.

## Finding B1-2 — unknown grant types silently become `AUTHORIZATION_CODE`

**Severity S2.** `server/src/services/token.operations.service.ts:23-37`:

```
const key = raw?.toLowerCase().replace(/[^a-z0-9:._-]/g, "");
return GRANT_TYPE_MAP[key] || "AUTHORIZATION_CODE";
```

The map has 9 keys (`:25-33`). The SDK's `GrantType` enum has 10 members
(`models/granttype.ts`): `AUTHORIZATION_CODE, IMPLICIT, PASSWORD, CLIENT_CREDENTIALS, REFRESH_TOKEN,
CIBA, DEVICE_CODE, TOKEN_EXCHANGE, JWT_BEARER, PRE_AUTHORIZED_CODE`. Consequences:

| Input | Produced | Correct |
|---|---|---|
| `urn:ietf:params:oauth:grant-type:token-exchange` (RFC 8693 §2.1 canonical) | `AUTHORIZATION_CODE` | `TOKEN_EXCHANGE` |
| `urn:ietf:params:oauth:grant-type:device_code` (RFC 8628 §3.4 canonical) | `AUTHORIZATION_CODE` | `DEVICE_CODE` |
| `urn:openid:params:grant-type:ciba` | `AUTHORIZATION_CODE` | `CIBA` — **unreachable through this map** |
| omitted / empty | `AUTHORIZATION_CODE` | should be rejected |
| any typo (`refresh_tokens`) | `AUTHORIZATION_CODE` | should be rejected |

Only the short forms `token_exchange` and `device_code` are map keys, so the **canonical URNs that the
RFCs actually define** fall through to the fallback. The `as GrantType` cast at `:51` suppresses the
type error that would otherwise surface this.

**Failure scenario.** An administrator calls `POST /api/token/create` with
`grant_type=urn:ietf:params:oauth:grant-type:token-exchange`. A token is issued and reported as
`grantType: "AUTHORIZATION_CODE"`. Every downstream consumer — introspection output, the audit log,
`GET /api/token/list` — now misattributes the token's provenance, and `CIBA` cannot be recorded at all.

Mitigating: the path is admin-only (`requireBasicAuth`, fails closed) and the two hot callers bypass
the map with hard-coded values — `token-exchange-response.handler.ts:48` (`"TOKEN_EXCHANGE"`) and
`jwt-verification.service.ts:82` (`"JWT_BEARER"`). So this is a data-integrity defect on the admin
surface, not a token-issuance vulnerability.

## Finding B1-3 — `default` branches that echo the Authlete response

**Severity S4.** Two `default` branches send the whole Authlete object rather than a fixed message:
`controllers/revocation.controller.ts:54` (`res.status(500).send(result)`) and
`controllers/token-exchange-response.handler.ts:96` (500 that still sends the full
`tokenCreateResponse`). Both are unreachable given the SDK enums — `RevocationResponseAction` has
exactly the 4 handled members, `TokenCreateResponseAction` exactly the 4 handled members — so this is a
latent shape issue, not a live leak. Every other `default` sends a fixed string.

## What the boundary gets right

Worth recording, because it is the reason a rebuild is not indicated:

- **35 of 36 action mappings are complete** against the SDK enums (full diff in `01-spec-matrix.md` §6).
- Four cases that look like bugs are correct: `native-sso.controller.ts:26`'s `SERVER_ERROR` vs `:17`'s `INTERNAL_SERVER_ERROR`, `hsk.controller.ts:39`'s missing `NOT_FOUND`, `vci.controller.ts`'s asymmetric `ACCEPTED`/`UNAUTHORIZED` maps, and `device.controller.ts`'s absent `ACCESS_DENIED`.
- Every branch point has a `default`, so an action Authlete adds later fails loudly rather than silently.
- Ticket custody is correct everywhere except B1-1: `session.controller.ts` holds it in `req.session`, never in a URL or a response body.
- `token.management.controller.ts:164` branches on `resultCode`, which contradicts Authlete's guidance — but `TokenRevokeResponse` has no `action` field, so there is no alternative. The comment at `:162-163` says exactly that. Correct call, correctly documented.

## Documentation delta

| Claim | Location | Reality | Verdict |
|---|---|---|---|
| Token endpoint handles every Authlete action value (9 + default) | `AGENTS.md` "Token endpoint action coverage" | Matches `TokenResponseAction` exactly | **Accurate** |
| `jar.service.ts` "does no key handling" | `modules/05…/README.md:265` | True, and correct — Authlete validates the signature | **Accurate** |
| Lab teaches `curl -s POST /api/jar/process` and reading the JSON | `modules/05…/lab.md:193-200` | The endpoint returns 200 on failure, so the lab cannot teach failure detection by status | `DOC_INCORRECT` / S3 — a learner copying this ships an endpoint that reports success on rejection |
| Ticket custody rules | `docs/TICKET-PARAMETER.md` | Correct, but **orphaned** — zero inbound links | `S4` |

## Sources consulted

- Authlete, Action Handling — `https://developers.authlete.com/get-started/concepts/action-handling.md`
- Authlete, Two-step API Calls — `https://developers.authlete.com/get-started/concepts/two-step-api-calls.md`
- Authlete, Flags Supported in Authlete — `https://developers.authlete.com/configuration-reference/error-handling-debugging/flags-supported-in-authlete.md`
- SDK 1.0.0 models: `authorizationresponse.ts:34-39,87,260`, `service.ts:162,728-738`, `granttype.ts`, `tokencreateresponse.ts`, `revocationresponse.ts`
- Vendored Authlete API Explorer spec: `docs/openapi-spec.json`, `/api/{serviceId}/auth/authorization` 200 example

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| B1-W1 | Map `action` to a status in `jar.controller.ts` and stop returning the raw response | S | `BAD_REQUEST`→400, `INTERNAL_SERVER_ERROR`→500, `LOCATION`/`FORM`/`NO_INTERACTION`/`INTERACTION`→200; response body carries `action` + `responseContent` only, never `ticket`, `service` or `client`. Unit test per action value. |
| B1-W2 | Decide and enforce an auth posture for `/api/jar/process` | S | Either client authentication or admin Basic auth; documented either way. It is a debugging surface, so "admin-only" is defensible — "unauthenticated" is not, while it emits tickets. |
| B1-W3 | Make `normalizeGrantType` total | S | Unknown/missing grant type throws `AppError(400)` instead of defaulting; add the two canonical URNs and `urn:openid:params:grant-type:ciba`→`CIBA`; drop the `as GrantType` cast so the enum is checked. Test asserts rejection, not coercion. |
| B1-W4 | Fix the two echoing `default` branches | S | Send a fixed error body; assert in test. |
| B1-W5 | Update Module 05 lab §JAR to match real behaviour, and link `TICKET-PARAMETER.md` from `docs/README.md` | S | Lab shows the real status codes after B1-W1; doc index reaches the ticket explainer. |
| **B1-W6** | **Fix the `ID_TOKEN_REISSUABLE` branch — it requires a `ticket` Authlete does not send** | S | 📋 Security-critical surface (`controllers/token.controller.ts`). **Found 2026-08-12 during T1-4** by setting `idTokenReissuable = true` and exercising the branch for the first time. Authlete answers a refresh request with `action: ID_TOKEN_REISSUABLE`, **`subject: "admin"`, `responseContent` = a complete valid token JSON, and no `ticket`** (verified against `/auth/token` directly). The handler at `:157-163` guards on `if (!ticket)` and falls through to `res.status(400).send(result.responseContent)` — so **every refresh-token request returns HTTP 400 carrying a successful token response**, and the ID token the flag exists to reissue is never produced. Acceptance: the branch issues from the fields Authlete actually sends, a refresh returns **200** with an `id_token`, and a unit test drives the ticket-less response shape. **Until then `idTokenReissuable` must stay `false`** — see the note on OIDC-W5. |

**Ordering note.** B1-W1 and B1-W3 both touch behaviour but neither file is on the
`AGENTS.md` **Security-critical surfaces** list — `jar.controller.ts` is not listed, and
`token.operations.service.ts` **is** (under Token issuance). So **B1-W3 requires its own plan before
editing**; B1-W1 does not.
