# RFC 6750 — The OAuth 2.0 Authorization Framework: Bearer Token Usage

- **Verdict:** `IMPLEMENTED_VERIFIED`
- **Severity:** S3 (one finding, and it is not a 6750 conformance defect)
- **Authlete version:** 3.0
- **Repo docs under test:** `AGENTS.md` (token-presentation section), `docs/FAPI-TUTORIAL.md`, `docs/curriculum/modules/01`, `modules/05`

<thinking>
1. RFC 6750's requirements on the resource server: §2 — clients MUST NOT use more than one method, so
   the RS has to detect that; §2.1 — the `Authorization` header with the `Bearer` scheme, and RSs MUST
   support it; §2.2 — the form-encoded body method, valid only under four conditions including that GET
   MUST NOT be used; §2.3 — the query parameter, SHOULD NOT be used; §3/§3.1 — `WWW-Authenticate` MUST be
   included when credentials are absent or insufficient, with `invalid_request`→400,
   `invalid_token`→401, `insufficient_scope`→403.
2. Authlete boundary: Authlete validates the token and composes the challenge in `responseContent`. This
   server owns *extraction* — deciding what counts as a presented token — and the status mapping.
   UserInfo is the only protected resource here.
3. Code: `utils/extractAccessToken` handles this properly, and I mean properly: §2 multi-method
   detection, case-insensitive scheme per RFC 9110 §11.1, the §2.2 GET exclusion and content-type check,
   and §2.3 deliberately omitted with the RFC 9700 §4.3.2 citation in a comment. There is a dedicated
   test file with a suite per function.
4. Docs: `AGENTS.md`'s token-presentation section describes this behaviour in detail and — unusually —
   describes it *accurately*, including the deliberate §2.3 omission and the reasoning.
5. Delta: none on 6750 itself. The one defect I found in this area is an RFC 9449 `htu` bug that
   affects DPoP proof validation, not bearer-token presentation; it belongs to B4 and is recorded there.
6. Unsure: nothing. This is the best-implemented spec audited so far.
</thinking>

## Normative requirements (RS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | *"Clients MUST NOT use more than one method to transmit the token in each request."* | §2 | ✅ **Detected and rejected** — `utils/dpop.ts:132-137` throws `TokenPresentationError(400, "invalid_request", …)` when both header and body carry a token |
| 2 | Support the `Authorization` header with the `Bearer` scheme; *"Resource servers MUST support this method."* | §2.1 | ✅ `utils/dpop.ts:113-120` |
| 3 | Scheme matching (RFC 9110 §11.1 makes auth-scheme case-insensitive) | §2.1 + RFC 9110 | ✅ `utils/dpop.ts:116` lowercases before comparing |
| 4 | §2.2 form body valid only for `application/x-www-form-urlencoded`, and *"the `GET` method MUST NOT be used"* | §2.2 | ✅ `utils/dpop.ts:125` — `req.method !== "GET" && req.is("application/x-www-form-urlencoded")` |
| 5 | §2.3 query parameter *"SHOULD NOT be used"* | §2.3 | ✅ **Not implemented, deliberately**, citing RFC 9700 §4.3.2 — `utils/dpop.ts:100-102` |
| 6 | *"the resource server MUST include the HTTP `WWW-Authenticate` response header field"* when credentials are absent or insufficient | §3 | ✅ all four error branches echo `responseContent` into `WWW-Authenticate` — `controllers/userinfo.controller.ts:26,33,40,49` |
| 7 | `invalid_request`→400, `invalid_token`→401, `insufficient_scope`→403 | §3.1 | ✅ `BAD_REQUEST`→400, `UNAUTHORIZED`→401, `FORBIDDEN`→403 (`controllers/userinfo.controller.ts:25-56`), matching Authlete's mapping of those error codes |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Deciding what counts as a presented token | **This server** | `utils/dpop.ts:111-140` |
| Token validation, challenge composition | Authlete | `userinfo.process` |
| Status mapping and `WWW-Authenticate` relay | **This server** | `controllers/userinfo.controller.ts:25-56` |
| Detecting a DPoP §7.2 downgrade | **Authlete, by necessity** | `UserinfoResponse` exposes no `cnf` (verified in the SDK), so the server cannot check locally |

## What is exemplary here

Recording this at length because Phase 4 needs evidence about what *not* to rebuild.

`extractAccessToken` (`utils/dpop.ts:92-140`) is the strongest single function audited so far:

- **It returns `null` for an unrecognised scheme** rather than forwarding the raw header. The comment at `:104-106` records what it replaced: `authHeader.replace("Bearer ", "")`, which handed Authlete strings like `"Basic …"` to look up as tokens. That is a real class of bug, fixed and documented.
- **It enforces a client-side MUST on the server side.** §2 binds *clients*, but a resource server that silently prefers one method makes the violation invisible. Throwing 400 is the right call and is rare in practice.
- **The §2.3 omission is a decision, not an oversight**, with the superseding BCP quoted inline.
- **Test coverage is real:** `tests/unit/utils/dpop.test.ts` has five suites — `extractAccessToken` (`:37`), `dpopHttpTarget` (`:168`), `authChallenge` (`:200`), `isTokenPresentationError` (`:229`), `TokenPresentationError` (`:248`).

This is why the verdict is `IMPLEMENTED_VERIFIED` rather than `UNVERIFIED`: the requirements are
locally decidable and there is a unit test per function asserting them. No live call is needed, because
nothing here depends on Authlete's behaviour.

## Finding F-1 — `htu` carries the query string at four of five call sites (S2, **primary home is RFC 9449 / B4**)

Found while auditing this area; recorded here so it is not lost, and carried into B4 for its verdict.

`utils/dpop.ts:157-161` provides the correct splitter:

```
const path = req.originalUrl.split(/[?#]/)[0];
return { htu: `${origin}${path}`, targetUri: `${origin}${req.originalUrl}` };
```

Its own doc comment (`:145-150`) says: *"`htu` is the target URI with the query and fragment removed,
per RFC 9449 §4.2 … Sending the query string as `htu` (as this code used to) makes any request carrying a
query fail proof validation even when the client is correct."*

**Only `services/userinfo.service.ts:68` uses it.** Four call sites still hand-roll the broken form:

| Call site | Code |
|---|---|
| `services/token.service.ts:82` | `reqBody.htu = \`${protocol}://${host}${req.originalUrl}\`` |
| `services/par.service.ts:63` | same shape |
| `services/introspection.service.ts:63` | same shape |
| `middleware/require-grant-ownership.ts:69` | same shape |

`req.originalUrl` includes the query string in Express, so any DPoP-protected request carrying one sends
a mismatched `htu` and fails proof validation. `/api/gm/:grantId` is the most exposed — grant-management
queries are the shape most likely to carry query parameters, and that path is DPoP-capable via
`require-grant-ownership.ts:65-69`.

`AGENTS.md` documents the query-string rule as settled, describing the fix as though it were global. It
was applied to one of five sites.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Both schemes accepted case-insensitively; unrecognised scheme yields no token | `AGENTS.md` token-presentation section | Matches `utils/dpop.ts:113-120` exactly | **Accurate** |
| §2.3 query parameters not implemented, per RFC 9700 §4.3.2 | `AGENTS.md`; `utils/dpop.ts:100-102` | Accurate | **Accurate** |
| `Bearer` + a `DPoP` header → 400 `invalid_request`, rejected locally | `AGENTS.md` | Consistent with the multi-method rejection at `:132-137` | **Accurate** |
| `htu` excludes the query and fragment; full URI goes in `targetUri` | `AGENTS.md` | True of the helper, false of four of the five call sites | `DOC_INCORRECT` / S2 — a learner reading `AGENTS.md` would believe the repo handles this uniformly |

## Sources consulted

- RFC 6750 §§2, 2.1, 2.2, 2.3, 3, 3.1 — `https://www.rfc-editor.org/rfc/rfc6750.html`
- RFC 9700 §4.3.2 (the §2.3 supersession) — `https://www.rfc-editor.org/rfc/rfc9700.html`
- Code: `utils/dpop.ts:92-140,145-161`, `controllers/userinfo.controller.ts:25-56`, `services/userinfo.service.ts:60-72`, `services/token.service.ts:80-82`, `services/par.service.ts:63`, `services/introspection.service.ts:63`, `middleware/require-grant-ownership.ts:65-69`
- Tests: `tests/unit/utils/dpop.test.ts:37,168,200,229,248`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 6750-W1 | None for RFC 6750 | — | The spec is met. Recording "no work needed" is a finding. |
| 9449-W1 | Replace the four hand-rolled `htu` constructions with `dpopHttpTarget(req)` | S | All five call sites use the helper; a test issues a DPoP-protected request with a query string to each endpoint and asserts `htu` has no `?`. Set `targetUri` where the SDK accepts it. **`token.service.ts`, `par.service.ts`, `introspection.service.ts` are all security-critical — needs a plan.** Tracked to B4. |
