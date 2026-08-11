# RFC 7009 — OAuth 2.0 Token Revocation

- **Verdict:** `IMPLEMENTED_VERIFIED` *(upgraded from `IMPLEMENTED_UNVERIFIED` by a live Authlete call, 2026-08-10)*
- **Severity:** S3 (the two remaining findings are hygiene, not conformance)
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/API.md`, `CURL-TEST.md`, `docs/curriculum/modules/04-token-lifecycle-and-metadata/`, `docs/curriculum/modules/10-fapi-and-grant-management/`

<thinking>
1. RFC 7009's AS-side requirements: §2.1 — `token` REQUIRED, `token_type_hint` OPTIONAL, client
   authenticates per RFC 6749 §2.3; §2.2 — return 200 *"if the token has been revoked successfully or
   if the client submitted an invalid token"*, because *"invalid tokens do not cause an error response
   since the client cannot handle such an error in a reasonable way"*; §2.2.1 — errors follow RFC 6749,
   plus `unsupported_token_type`, and 503 means the client may retry.
2. Authlete boundary: `revocation.process` does the lookup, the client authentication check and the
   response body. `RevocationResponseAction` = `INTERNAL_SERVER_ERROR, INVALID_CLIENT, BAD_REQUEST, OK`
   — four members. The AS maps those to status codes and sets cache headers. The subtle point is that
   §2.2's "200 on an invalid token" is Authlete's decision, not this server's: the server can only be
   correct if Authlete returns `OK` rather than `BAD_REQUEST` for an unknown token.
3. Code: `revocation.controller.ts:12-56` handles all four actions. `OK` → 200 with an empty body when
   there is no `responseContent` (`:21`), which is right. `INVALID_CLIENT` → 401 with
   `WWW-Authenticate: Basic` when an `Authorization` header was sent, else 400 (`:30-43`) — the same
   shape as the token endpoint, and defensible under RFC 6749 §5.2. `Cache-Control: no-store` and
   `Pragma: no-cache` on every branch. Empty body → 400 `invalid_request` (`:60-65`).
4. Docs: `API.md` and `CURL-TEST.md` document it; Module 04's objectives include "why unknown-token
   revocation returns 200", which is exactly §2.2. That claim is correct.
5. Delta: no conformance gap found in the mapping. What is missing is *proof*: the e2e block exists but
   is never run per the standing rule, so §2.2's behaviour has not been observed against Authlete. That
   is precisely the difference between `IMPLEMENTED_VERIFIED` and `IMPLEMENTED_UNVERIFIED`.
6. Unsure: whether Authlete returns `OK` or `BAD_REQUEST` for a syntactically valid but unknown token.
   Resolvable by one live call; not made.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | `token` REQUIRED | §2.1 | ✅ empty body → 400 `invalid_request` (`controllers/revocation.controller.ts:60-65`); missing `token` → Authlete `BAD_REQUEST` |
| 2 | `token_type_hint` OPTIONAL, values `access_token` / `refresh_token` | §2.1 | ✅ passed through in `parameters` |
| 3 | Client authenticates per RFC 6749 §2.3 | §2.1 | ✅ delegated — `INVALID_CLIENT` → 401/400 (`:30-43`) |
| 4 | 200 on successful revocation **and** on an invalid token | §2.2 | ✅ **Verified live** — Authlete returns `action: "OK"` for a never-issued token; mapped to 200 at `:13-21` |
| 5 | Invalid tokens must not produce an error response | §2.2 | ✅ **Verified live** — same call, no error emitted |
| 6 | `unsupported_token_type` error available | §2.2.1 | ✅ arrives as `BAD_REQUEST` + Authlete's `responseContent` (`:23-28`) |
| 7 | Errors otherwise per RFC 6749 §5.2 | §2.2.1 | ✅ Authlete composes the body |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Token lookup and revocation | Authlete | `services/revocation.service.ts:82` |
| Client authentication | Authlete | via `parameters` / Basic header |
| **§2.2's "200 for an invalid token"** | **Authlete** | Determines conformance; this server cannot compensate |
| Status mapping, cache headers | This server | `controllers/revocation.controller.ts:12-56` |
| Client attestation headers | This server | forwarded at `services/revocation.service.ts:33-34,73-74` |

Authlete's revocation policy page (`/configuration-reference/tokens-and-claims/token-revocation-policy`)
is listed in `llms.txt` and was **not fetched** — see "Source gap" below.

## What is correct

- **All four action values handled** (`RevocationResponseAction` is exactly those four), so the `default` at `:51` is unreachable.
- **Empty success body.** `:21` returns `res.status(200).end()` when Authlete gives no `responseContent`. RFC 7009 §2.2 expects an empty 200; sending `{}` or a message would be a (minor) deviation, and the code avoids it.
- **Cache headers on every branch** (`:15-16`, `:26-27`, `:31-33`, `:46-48`). Not mandated by RFC 7009 but correct for a credential-bearing endpoint.
- **`INVALID_CLIENT` → 401 only when credentials were actually presented.** `:36` checks for an `Authorization` header before adding `WWW-Authenticate`, mirroring `token.controller.ts:54-64`. This is the RFC 6749 §5.2 shape ("If the client attempted to authenticate via the `Authorization` request header field, the authorization server MUST respond with an HTTP 401").
- **Test coverage of the mapping exists:** `tests/unit/services/revocation.service.test.ts`, integration block at `tests/integration/routes.test.ts:205`, e2e block at `tests/e2e/e2e.test.ts:461` (Basic auth, public client, missing token).

## Why the verdict is `UNVERIFIED` rather than `VERIFIED`

The unit and integration tests run against `tests/helpers/mock-authlete.ts`. They prove **this server's
status mapping**, which is what they are for. They cannot prove requirement #4, because the mock returns
whatever the test tells it to — the question is what *Authlete* returns for a syntactically valid but
unknown token.

The e2e suite would settle it, and `CLAUDE.md` forbids running it. So the honest verdict is
`IMPLEMENTED_UNVERIFIED` with the missing evidence named, not `IMPLEMENTED_VERIFIED`.

**Named next action:** one `POST /api/revocation` with a well-formed but never-issued token string,
against the live service, asserting HTTP 200. One Authlete call. **Not performed.**

## Finding F-1 — no rate limiter on the revocation endpoint (S3)

`server/src/routes/revocation.routes.ts:6` registers the handler with no middleware. Revocation is a
state-changing, credential-accepting endpoint. RFC 7009 §5 does not mandate throttling, so this is not a
conformance defect — but it is inconsistent with the rest of the repo (`tokenLimiter` 20/min on
`/api/token`, `generalLimiter` on most extension endpoints) and it permits unthrottled brute-force
probing of client credentials, since `INVALID_CLIENT` is distinguishable from `OK`.

Grouped with `7662-W2`, which has the same shape on the introspection endpoints.

## Finding F-2 — `default` echoes the whole Authlete response (S4)

`controllers/revocation.controller.ts:54` — `res.status(500).send(result)`. Unreachable given the
four-member enum. Same item as `B1-W4`.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Unknown-token revocation returns 200 | `modules/04…/README.md:59-77` (objective), quiz + answers | Correct per §2.2, and correctly mapped in code | **Accurate** |
| Revocation recipes | `CURL-TEST.md`, `docs/API.md` | Match the implementation | **Accurate** |
| Grant revocation "leaves access tokens alive 24 h" | `PROGRESS.md` open findings | A **Grant Management** issue, not RFC 7009 — `/api/gm/:grantId` DELETE, not `/api/revocation`. Belongs to B6 | Correctly scoped elsewhere |

No `DOC_INCORRECT` finding for RFC 7009. This is the cleanest spec audited so far.

## Sources consulted

- RFC 7009 §§2.1, 2.2, 2.2.1 — `https://www.rfc-editor.org/rfc/rfc7009.html`
- RFC 6749 §5.2 (401-on-Authorization-header rule, applied at `:36`) — via the RFC 7009 §2.2.1 reference
- SDK 1.0.0: `models/revocationresponse.ts` (`RevocationResponseAction`, four members)
- Code: `controllers/revocation.controller.ts:1-72`, `routes/revocation.routes.ts:6`, `services/revocation.service.ts:33-34,46-47,73-74,82`

## Requirement #4 — resolved by live call

Authlete's `token-revocation-policy` page was fetched first, to avoid spending a call
(`https://developers.authlete.com/configuration-reference/tokens-and-claims/token-revocation-policy.md`).
**It does not address unknown-token behaviour at all** — nothing about unissued, unknown or
already-revoked tokens, and no reference to RFC 7009 §2.2. Vendor documentation exhausted, so the call
was made.

**Live probe, 2026-08-10, authorised.** `POST {base}/api/{serviceId}/auth/revocation`, client
authenticated with the confidential test client, body
`parameters=token=AUDIT_PROBE_never_issued_0000000000000000&token_type_hint=access_token`:

```
HTTP 200
{ "action": "OK",
  "resultCode": "A113001",
  "resultMessage": "[A113001] The token has been revoked successfully." }
```

**Authlete returns `OK` for a token it never issued**, which `controllers/revocation.controller.ts:13-21`
maps to HTTP 200 with an empty body. RFC 7009 §2.2 is satisfied end to end, and requirements #4 and #5
are now **verified rather than assumed**. Verdict upgraded to `IMPLEMENTED_VERIFIED`.

Worth noting for the curriculum: Authlete's `resultMessage` says the token *"has been revoked
successfully"* about a token that never existed. That is the RFC-mandated behaviour — §2.2 is explicit
that *"invalid tokens do not cause an error response since the client cannot handle such an error in a
reasonable way"* — but the message is a good illustration of why `resultMessage` is a diagnostic string
and not a fact about the world. Module 04 already teaches this requirement; the live transcript is
better evidence than the prose.

**Also carried forward:** that a vendor leaves a conformance-relevant behaviour undocumented is itself a
Phase 4 observation. Every Authlete-based deployment is guessing at this until it probes.

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| ~~7009-W1~~ | ~~Verify §2.2 behaviour~~ | — | **Done** — live probe above; verdict upgraded |
| 7009-W2 | Add a rate limiter | S | Same change as `7662-W2`; 429 asserted |
| 7009-W3 | Fix the echoing `default` | S | Same as `B1-W4` |

No behavioural fix is proposed, because none is warranted. Recording that plainly is part of the audit's
value: three of the seven B2 specs did not need work, and this is the first.
