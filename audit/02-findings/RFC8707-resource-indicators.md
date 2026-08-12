# RFC 8707 — Resource Indicators for OAuth 2.0

- **Verdict:** `IMPLEMENTED_VERIFIED`
- **Severity:** **S3** (the spec works; the delta is the token-exchange path, carried by RFC 8693)
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/curriculum/modules/04-token-lifecycle-and-metadata/README.md:162-168`, `…/lab.md` Exercise 4, `docs/API.md:45`, `docs/curriculum/SPEC-INVENTORY.md`

<thinking>
1. RFC requirements on the AS: §2 — `resource` MAY appear in authorization and token requests, MAY repeat, and
   its value MUST be an absolute URI with no fragment and SHOULD have no query. An invalid, missing, unknown or
   malformed resource is `invalid_target`. §2.1/§2.2 — the AS SHOULD audience-restrict the issued token to the
   indicated resources, communicable as `aud`. If `resource` is omitted the AS MAY use no resource or a
   default. No metadata parameter is defined.
2. Authlete boundary: for the authorization and token flows, entirely Authlete's — `resource` rides inside the
   opaque `parameters` string, Authlete validates the URI rules and maps the value to `aud`. The AS-side
   surface is only where the repo constructs Authlete requests by hand: `IntrospectionRequest.resources` and
   `TokenCreateRequest.resources`.
3. Code: `resource` as a request parameter appears nowhere in an executable path — correct. `resources` is
   forwarded on introspection (`services/introspection.service.ts:33-37`) and on admin token creation
   (`services/token.operations.service.ts:80-84`). The token-exchange handler drops the `resources` Authlete
   resolved.
4. Docs: Module 04 Exercise 4 is a complete live demonstration — `resource` in, `aud` out, then both §2
   validation rules tripped and both answered `invalid_target`.
5. Delta: none on the main flow. The only gap is the exchange path, which is a deliberate defect owned by
   RFC 8693, so it is cross-referenced rather than double-counted.
6. Nothing unresolved. Worth stating what "verified" rests on: a lab transcript, not a test — noted below.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `resource` on an authorization request | §2.1 | ✅ Authlete's, via opaque passthrough — **verified live** (`modules/04…/lab.md:163`) |
| 2 | Accept `resource` on a token request | §2.2 | ✅ same — verified live (`lab.md:170-172`) |
| 3 | Accept multiple `resource` parameters | §2 | ⊘ Authlete's; `TokenResponse.resources` and `TokenCreateRequest.resources` are both arrays. Not exercised with more than one value here |
| 4 | Value MUST be an absolute URI | §2 | ✅ Authlete's — **verified live**, `invalid_target` `[A251307]` |
| 5 | Value MUST NOT include a fragment | §2 | ✅ Authlete's — **verified live**, `invalid_target` `[A251308]` |
| 6 | Value SHOULD NOT include a query | §2 | ⊘ Authlete's; not exercised |
| 7 | Invalid/unknown/malformed → `invalid_target` | §2, §5.2 | ✅ **verified live, both rules**, and delivered as an error *redirect* rather than a JSON body — correct per RFC 6749 §4.1.2.1 |
| 8 | SHOULD audience-restrict the issued token to the indicated resources | §2.1, §2.2 | ✅ **verified live** — `aud: ["https://api.example.com/orders"]` appears in the introspection response, and is absent without `resource` |
| 9 | If `resource` is omitted, the AS MAY proceed with no resource or a default | §2.1 | ✅ observed — no `aud` when omitted (`lab.md` Exercise 1 vs Exercise 4) |
| 10 | Audience restriction on an **exchanged** token | §2.2 + RFC 8693 §2.1 | ❌ **deliberate defect** — see `RFC8693-token-exchange.md` |
| 11 | Metadata parameter | — | ⊘ none defined by this RFC; correctly absent from discovery |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Parsing `resource`, enforcing the two URI rules, emitting `invalid_target` | Authlete | `authorization.processRequest`, `token.process` |
| Mapping resources to `aud` on the issued token | Authlete | verified via `/api/introspection/standard` output |
| Carrying `resource` to Authlete | Opaque passthrough | inside `parameters` — `services/authorization.service.ts:26-34`, `services/token.service.ts:42` |
| Asking "is this token valid for resource X" on introspection | **This server**, from the caller's body | `services/introspection.service.ts:33-37` |
| Setting resources on an administratively created token | **This server** | `services/token.operations.service.ts:80-84` |
| Preserving resources through a token exchange | **This server** | `controllers/token-exchange-response.handler.ts:47-52` — **dropped, deliberately** |

**One clarification worth recording**, because it looks like the anti-pattern the repo elsewhere fixed:
`introspection.service.ts:33-37` reads `resources` from the request **body**, whereas `dpop`/`htm`/`htu` are
taken from HTTP context. That is correct here — on Authlete's proprietary introspection API, `resources`
expresses *which resource the calling RS is asking about*, so it is legitimately caller-supplied. It is not in
the same category as `targetUri` at `:51`, which is a server-determined field and is flagged in
`RFC9449-dpop.md` F-1.

## What "verified" rests on

`modules/04…/lab.md` Exercise 4, run against this deployment, in three parts:

```
# with resource=https://api.example.com/orders
{"active":true,"scope":"profile",…,"aud":["https://api.example.com/orders"],"iss":"https://…",
 "auth_time":…,"acr":"pwd"}

# resource with a fragment
…?error=invalid_target&error_description=%5BA251308%5D+The+value+of+a+%27resource%27+includes+a+fragment+component.…

# resource not an absolute URI
…?error=invalid_target&error_description=%5BA251307%5D+The+value+of+a+%27resource%27+is+not+an+absolute+URI.…
```

That is requirement 4, 5, 7 and 8 demonstrated end to end, with the spec-defined error code and the correct
delivery channel. **It is a lab transcript, not an automated test** — there is no unit, integration or E2E
coverage asserting that `aud` appears when `resource` is sent. So the verdict is `IMPLEMENTED_VERIFIED` on
reproducible evidence, with a regression risk nothing in CI would catch (work item 8707-W1).

## Finding F-1 — the `resources` Authlete resolves are dropped on the exchange path (S2, owned by RFC 8693)

Recorded here for completeness of the RFC 8707 row and **not counted twice**. `TokenResponse.resources`
(SDK `models/tokenresponse.ts:177`) carries the `resource` values from the exchange request;
`token-exchange-response.handler.ts:47-52` does not forward them, though `TokenCreateRequest.resources`
exists and `token.operations.service.ts:80-84` would forward it if supplied. Net effect: `resource` works
everywhere in this server **except** through a token exchange, where it silently does nothing.

The full analysis, including the finding that RFC 8693's sibling `audience` parameter has no Authlete field at
all, is in `RFC8693-token-exchange.md` F-1.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "Audience restriction — `resource`, RFC 8707 (Standards Track, February 2020)" | `modules/04…/README.md:162` | Title, track and date all confirmed against the RFC fetched this session | **Accurate** |
| `invalid_target`: *"The requested resource is invalid, missing, unknown, or malformed."* | `modules/04…/README.md:168` | Quoted verbatim and correctly | **Accurate** |
| "`aud` is now present. Compare with Exercise 1, where it was absent." | `modules/04…/lab.md:180-184` | Reproduced | **Accurate** |
| "§2 requires the value to be an **absolute URI** with **no fragment**" | `modules/04…/lab.md:187` | Correct. §2 also says a query component SHOULD NOT be included — not mentioned, and not exercised | **Accurate but incomplete** / S4 |
| Both failures delivered as a redirect, not a JSON body, because the redirect URI had already been validated | `modules/04…/lab.md:205-210` | Correct, and consistent with the vendor behaviour recorded in `AGENTS.md` (error channel splits on `response_type`) | **Accurate** |
| Bracketed codes are vendor behaviour; `invalid_target` is spec-defined | `modules/04…/lab.md:340` | Correct attribution | **Accurate** |
| "The fragment rule exists because a fragment never reaches the server…" | `modules/04…/lab.md:208-210` | Sound reasoning, consistent with §2's rationale | **Accurate** |
| `docs/API.md:45` — "`resource` — Resource indicator (RFC 8707)" | `:45` | Accurate | **Accurate** |
| Nothing states that `resource` is inert through a token exchange | Module 04 | Module 06 Part 12 covers it; Module 04, which teaches the parameter, does not cross-reference | **Omission** / S3 |

## Sources consulted

- RFC 8707 §§2, 2.1, 2.2, 3, 5.1, 5.2 and full ToC — `https://www.rfc-editor.org/rfc/rfc8707.txt`
- RFC 9068 §3 (the `resource`→`aud` correspondence for JWT ATs) — `https://www.rfc-editor.org/rfc/rfc9068.txt`
- SDK 1.0.0: `models/tokenresponse.ts:172-179`, `models/tokencreaterequest.ts:133`, `models/introspectionrequest.ts`
- Live evidence: `modules/04…/lab.md` Exercise 4 transcripts (this deployment); live probe 2 for `accessTokenType = Bearer`
- Code: `services/introspection.service.ts:33-37`, `services/token.operations.service.ts:80-84`, `controllers/token-exchange-response.handler.ts:47-52`
- Grep: `resource` as a request parameter appears in `server/src` only as documentation strings (`routes/openapi.routes.ts:153`) — correct, it rides inside `parameters`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 8707-W1 | Add automated coverage for `resource` → `aud` | S | An integration test asserts that a token request carrying `resource` produces an introspection response with the matching `aud`, and that an invalid value yields `invalid_target`. Today the only evidence is a lab transcript. |
| 8707-W2 | Cross-reference the exchange gap from Module 04 | S | One line in Exercise 4: `resource` is honoured on the authorization and token endpoints and **not** through a token exchange, pointing at Module 06 Exercise 6b. |
| 8707-W3 | Exercise the multi-value and query-component cases | S | A second `resource` value, and one with a query, each with the observed result — completing §2's rule set. |
| 8707-W4 | No change to the `resource` code path | — | Correct as delegated. The only defect is the deliberate one in the exchange handler. |

**Ordering.** All three are additive and independent. None touches a file on the **Security-critical surfaces**
list.
