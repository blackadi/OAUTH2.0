# RFC 9701 — JWT Response for OAuth Token Introspection

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Authlete version:** **3.0+ required** (stated on Authlete's page, fetched this session)
- **Repo docs under test:** none exist — RFC 9701 has no row in `SPEC-INVENTORY.md`, no tutorial, and no mention in any of the 102 markdown files

<thinking>
1. RFC 9701's AS-side requirements: the RS signals intent with `Accept:
   application/token-introspection+jwt` (§4.1); the AS responds with a JWT and `Content-Type:
   application/token-introspection+jwt` (§5.1); the AS MUST authenticate the caller (§4.2); the JWT
   MUST carry `iss`, `aud`, `iat` and `token_introspection` (§5.2–5.3); for an invalid token the AS
   MUST set `active:false` and MUST NOT include other members (§5.3.8.2).
2. Authlete boundary: Authlete does the whole JWT construction. It is triggered *by the request*, not
   by configuration — the AS forwards the caller's Accept header as `httpAcceptHeader`, and Authlete
   returns `action: "JWT"` with the signed JWT in `responseContent`. The AS's entire job is: forward
   the header, handle the `JWT` action, set the right Content-Type. Requires a service JWK set.
3. Code: the forwarding is there and deliberate (`introspection.service.ts:124-127`, with a comment
   saying the header comes from the request, not the body). The handling is not:
   `introspection-standard.controller.ts:13-31` handles `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`, `OK`
   and nothing else. `StandardIntrospectionResponseAction` includes `JWT`. So `JWT` → `default:26` →
   500. And the `OK` branch hardcodes `application/json`, so even if `JWT` were routed there the
   Content-Type would violate §5.1.
4. Docs: nothing. Zero occurrences of "9701" anywhere in the repo.
5. Delta: (3) vs (1) — the success path returns 500. (4) vs everything — a Group B spec that Authlete
   supports natively, the code half-wires, and the curriculum never mentions, while `SPEC-INVENTORY.md`
   claims to list "every specification this curriculum touches."
6. Unsure: whether the live service has a JWK set registered (required for Authlete to sign). If it
   does not, Authlete would presumably return an error action rather than `JWT`, which changes the
   observed symptom but not the missing case. Resolvable only by a live call; recorded as such.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | RS signals intent via `Accept: application/token-introspection+jwt` | §4.1 | ✅ forwarded as `httpAcceptHeader` — `services/introspection.service.ts:124-127` |
| 2 | *"The AS MUST authenticate the caller at the token introspection endpoint."* | §4.2 | ❌ **Unmet** — see `RFC7662-token-introspection.md` F-1; the route has no middleware |
| 3 | Respond with the JWT, `Content-Type: application/token-introspection+jwt` | §5.1 | ❌ **Unmet** — no `JWT` case exists; the `OK` branch hardcodes `application/json` at `controllers/introspection-standard.controller.ts:23` |
| 4 | JWT MUST carry `iss`, `aud`, `iat`, `token_introspection` | §5.2–5.3 | ⊘ Authlete's job; unreachable because of #3 |
| 5 | Invalid token → `active:false`, no other members | §5.3.8.2 | ⊘ Authlete's job; unreachable because of #3 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Detecting the `Accept` header and forwarding it | **This server** | ✅ `services/introspection.service.ts:124-127` |
| Signing the JWT, assembling `token_introspection`, `iss`/`aud`/`iat` | Authlete | `introspection.standardProcess` |
| Choosing `introspectionSignAlg` / encryption params | **This server** (optional; Authlete defaults `RS256`) | never set — accepted in the body but **excluded** from forwarding at `services/introspection.service.ts:88-91` |
| **Handling `action: "JWT"`** | **This server** | ❌ not implemented |
| Setting the response Content-Type | **This server** | ❌ wrong |
| Registering a service JWK set | Service configuration | unknown on the live service |

Authlete's page confirms the trigger is the `Accept` header and that *"The AS must handle the response
action value `JWT`"*, and pins the feature at **Authlete 3.0 or later** — satisfied by the 3.0 pin.

## Finding F-1 — the RFC 9701 success path returns HTTP 500 (S2)

`server/node_modules/@authlete/typescript-sdk/src/models/standardintrospectionresponse.ts:14-18`
defines `StandardIntrospectionResponseAction` as `INTERNAL_SERVER_ERROR, BAD_REQUEST, OK, JWT`.

`server/src/controllers/introspection-standard.controller.ts:13-31` handles three of the four. `JWT`
falls to `default` at `:26` and returns **HTTP 500** with the body
`"Unknown introspection action from Authlete /introspection"`.

**The path is reachable, not theoretical.** `services/introspection.service.ts:124-127` forwards the
caller's `Accept` header verbatim:

```
// httpAcceptHeader from actual request header, not from body
const acceptHeader = req.headers["accept"] as string | undefined;
if (acceptHeader) { reqBody.httpAcceptHeader = acceptHeader; }
```

**Failure scenario.**
```
POST /api/introspection/standard
Accept: application/token-introspection+jwt
Content-Type: application/x-www-form-urlencoded

token=<a valid access token>
```
Authlete returns `action: "JWT"` with the signed introspection JWT in `responseContent`. This server
discards it and answers **500 "Unknown introspection action"**. A resource server that asked for a
signed response — the FAPI 2.0 Message Signing case — cannot introspect at all.

**Why it survived.** `curl` sends `Accept: */*` by default, and every recipe in `CURL-TEST.md` and the
curriculum uses either that or `application/json`. Nothing in the repo ever asks for the JWT form, and
there is no unit test for this controller (it is on the no-test list in `00-inventory.md` §8).

**Second-order defect.** Even routing `JWT` to the existing `OK` branch would be wrong: `:23` sets
`Content-Type: application/json`, and §5.1 requires `application/token-introspection+jwt`.

**Not in `PROGRESS.md`'s open-findings register** — this is a new finding.

## Finding F-2 — signing parameters are accepted then discarded (S3)

`services/introspection.service.ts:88-91` puts `introspectionSignAlg`,
`introspectionEncryptionAlg`, `introspectionEncryptionEnc`, `sharedKeyForSign`,
`sharedKeyForEncryption` and `publicKeyForEncryption` in the **excluded** set, so a caller that supplies
them has them dropped rather than forwarded to Authlete. Excluding them from the URL-encoded
`parameters` blob is *correct* — they are Authlete request fields, not OAuth parameters — but they are
then never set as top-level fields either. The effect is that the algorithm cannot be selected; Authlete's
default `RS256` always applies. That is defensible, but it should be a deliberate documented choice, and
right now it is indistinguishable from an oversight.

Note this is the same "server-determined fields never come from the body" discipline `AGENTS.md`
praises elsewhere — applied here by exclusion but not completed by explicit assignment.

## Finding F-3 — an entire supported spec is absent from the documentation (S3)

RFC 9701 appears **nowhere** in the repo: no `SPEC-INVENTORY.md` row, no tutorial, no glossary entry,
no module mention. Meanwhile:

- `docs/curriculum/SPEC-INVENTORY.md:3` claims to list *"every specification this curriculum touches."*
- `docs/curriculum/README.md:116-122` claims *"Every spec identifier here is verified against its primary source."*
- Module 10 teaches **FAPI 2.0 Message Signing**, whose non-repudiation story is *"JAR + JARM + signed introspection"* — the signed-introspection third of that sentence is RFC 9701, taught without its identifier.

So a learner completing Module 10 can describe signed introspection but cannot cite the RFC, and would
not know this deployment returns 500 for it.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "every specification this curriculum touches" | `SPEC-INVENTORY.md:3` | RFC 9701 is touched (Module 10, Message Signing) and absent | `DOC_INCORRECT` / S3 |
| FAPI 2.0 Message Signing = "JAR + JARM + signed introspection" | `SPEC-INVENTORY.md:230`, `modules/10…/README.md` | Accurate, but names no RFC for the third element | `S3` |
| — | — | No doc claims RFC 9701 works, so there is **no** false positive claim | — |

## Sources consulted

- RFC 9701 §§4.1, 4.2, 5.1, 5.2–5.3, 5.3.8.2 — `https://www.rfc-editor.org/rfc/rfc9701.html`
- Authlete, JWT Response for OAuth Token Introspection — `https://developers.authlete.com/configuration-reference/endpoints/jwt-response-for-oauth-token-introspection.md`
- SDK 1.0.0: `models/standardintrospectionresponse.ts:14-18`, `models/standardintrospectionrequest.ts:47,53,58,68,80,90`
- Code: `controllers/introspection-standard.controller.ts:13-31`, `services/introspection.service.ts:88-141`

## Open item requiring a live call

Whether the live service has a JWK set registered. Without one Authlete cannot sign, and would return
an error action instead of `JWT` — which changes the *observed* symptom (500 from `default` either way,
but for a different reason) without changing the missing case. One
`GET /api/.well-known/jwks.json` against the running server settles it and costs no Authlete quota
beyond a single discovery call. **Not performed** — recorded here as the named next action.

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9701-W1 | Handle `action: "JWT"` in `introspection-standard.controller.ts` | S | ✅ **DONE 2026-08-13.** `case "JWT"` → 200 with `Content-Type: application/token-introspection+jwt` and `responseContent` (the signed JWT) as the body. Verified live end to end: `typ: token-introspection+jwt`, `alg: RS256`, `kid: rsa-1`, claims `iss`, `aud`, `iat`, `token_introspection` — **and it signs with the RSA key T1-2 registered**, so an earlier configuration action is what made this one produce a signature at all. **The reachability half was not in the criteria and had to be probed**: the action requires `httpAcceptHeader` (already forwarded from the caller's `Accept` header) **and** `rsUri` in the body, without which Authlete answers `[A404301]`. That 400 is **passed through deliberately** — `rsUri` becomes the `aud` naming the calling resource server, and this server cannot honestly guess it. Nor may `rsUri` be sent unconditionally: the vendored spec says a present `rsUri` that is not among a token's audience values makes Authlete return `active: false`, so defaulting it would silently report audience-restricted tokens as inactive. |
| 9701-W2 | Close §4.2 caller authentication | — | Same work item as `7662-W1`; do not duplicate |
| 9701-W3 | Decide the signing-algorithm posture | S | Either forward `introspectionSignAlg` as a top-level field, or document that Authlete's default is deliberate. No third option. |
| 9701-W4 | Add RFC 9701 to `SPEC-INVENTORY.md` and name it in Module 10 | M | Row with exact title, status, date, verified against the primary source; Module 10's Message Signing section cites it for the signed-introspection element |
| 9701-W5 | Add a `curl` recipe exercising the JWT form | S | ✅ **DONE 2026-08-13**, in the same change as 9701-W1 so the documented output was never aspirational. The recipe decodes the JWT header and payload inline, states the `rsUri` requirement and shows the `[A404301]` you get without it. |

**Dependency.** 9701-W1 is independent and small. 9701-W2 is `7662-W1`. 9701-W4 depends on the Phase 3
spot re-verification, since RFC 9701 is one of the 10 rows selected for a from-scratch title/status check.
