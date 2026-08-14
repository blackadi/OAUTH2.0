# RFC 9101 — The OAuth 2.0 Authorization Framework: JWT-Secured Authorization Request (JAR)

- **Verdict:** `PARTIAL`
- **Severity:** **S2** (inherited from B1-1, which is the JAR debug endpoint)
- **Authlete version:** 3.0 (no minimum stated on the JAR page)
- **Repo docs under test:** `docs/curriculum/modules/05-request-integrity-and-binding/README.md`, `…/lab.md` Exercise 2, `docs/curriculum/SPEC-INVENTORY.md:134`, `client/src/components/oidc/JarSection.tsx`

<thinking>
1. RFC MUSTs on the AS: §6.3 the `client_id` request parameter and the Request Object's `client_id` claim
   MUST be identical, and the AS MUST use only the parameters in the Request Object even when the same
   parameter appears in the query; §6.2 validate the JWS signature, reject `alg: none` where a signature is
   required; §5 `request` and `request_uri` are mutually exclusive and MUST NOT appear inside the object
   itself; §7 the error codes `invalid_request_object`, `invalid_request_uri`, `request_not_supported`,
   `request_uri_not_supported`; §4 a signed object SHOULD carry `iss` and `aud`.
2. Authlete boundary: everything above. The object rides inside `parameters` at `/auth/authorization`, or is
   pushed through `/pushed_auth_req` and fetched back by `request_uri`. Authlete validates the signature and
   decodes the payload (returning `requestObjectPayload`). The AS-side surface is only: pass the parameters
   through untouched, and handle the resulting `action`. The gates are service `requestObjectRequired`,
   `traditionalRequestObjectProcessingApplied`, `nbfOptional`, the three encryption-match flags, and per
   client `requestObjectRequired`, `requestSignAlg`, `requestUris`.
3. Code: two paths. The real one is `GET /api/authorization`, where `authorization.service.ts:26-39`
   rebuilds the query into `parameters` and forwards it — `request` needs no special handling and gets none,
   which is correct. The second is `POST /api/jar/process`, a debug endpoint that ignores `action` entirely
   (B1-1). `utils/validate.ts:14-40` deliberately validates only `client_id`, which is what makes the
   canonical JAR shape reachable at all — and the comment cites §5 and §6.3 correctly.
4. Docs: Module 05 Exercise 2 is the most thorough material in the repo — unsigned object refused, the "which
   JWKS?" trap, key registration, four failure modes, and §6.3 precedence demonstrated. Its claims match the
   RFC text I fetched.
5. Delta: not in the code that matters (the real path is correct) but in (a) the debug endpoint's status
   handling, and (b) configuration — by-reference JAR is unreachable for every registered client, and
   asymmetric signing is unreachable too, which no document says.
6. Was the `request_uri` fetched by Authlete or by the AS? The Authlete page does not say outright; the
   examples pass `request_uri` through to `/auth/authorization`, and nothing in `server/src` fetches a URL for
   this purpose. Recorded as Authlete's with the page's ambiguity noted, not asserted beyond the evidence.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | `client_id` parameter and the Request Object's `client_id` claim MUST be identical | §6.3 | ⊘ Authlete's; `utils/validate.ts:19-21` cites the rule and requires the parameter |
| 2 | The AS MUST use **only** the parameters in the Request Object, even if duplicated in the query | §6.3 | ⊘ Authlete's — gated by `traditionalRequestObjectProcessingApplied`, live value **`False`** = JAR-compatible mode ✅ |
| 3 | Validate the JWS signature of a signed Request Object | §6.2 | ⊘ Authlete's |
| 4 | Reject `alg: none` where a signature is required | §6.2 | ⊘ Authlete's — demonstrated live (`modules/05…/lab.md:208`) |
| 5 | `request` and `request_uri` MUST NOT both be used; neither may appear inside the object | §5, §5.2.2 | ⊘ Authlete's |
| 6 | Support the error codes `invalid_request_object`, `invalid_request_uri`, `request_not_supported`, `request_uri_not_supported` | §7 | ⊘ Authlete's, delivered via `responseContent`; ❌ **not on the `/api/jar/process` path** — see F-1 |
| 7 | A signed object SHOULD carry `iss` and `aud` | §4 | ⊘ Authlete's; `requestObjectAudienceChecked = True` live, so `aud` **is** checked. `JarSection.tsx:108-109` enforces `iss`/`aud`/`client_id` client-side |
| 8 | Advertise `request_parameter_supported`, `request_uri_parameter_supported`, `require_signed_request_object`, `request_object_signing_alg_values_supported` | §9.2 | ✅ Authlete's — all four present live |
| 9 | Pass the request through without mangling it | implicit | ✅ `authorization.service.ts:26-34` |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Signature/encryption validation, claim extraction, precedence | Authlete | `authorization.processRequest` |
| Fetching a `request_uri`'s content | Authlete (per its examples; the page does not state it outright) | — |
| Passing `request` through untouched | **This server** | `authorization.service.ts:26-39`; `jar.service.ts:8-15` |
| Handling the resulting `action` | **This server** | ✅ `authorization.controller.ts:32-142`; ❌ `jar.controller.ts:19` |
| Enabling signed objects at all | Service + client config | `requestObjectRequired`, `requestSignAlg`, `requestUris`, `nbfOptional` |

## Finding F-1 — `POST /api/jar/process` returns 200 for a rejected request object (S2, = B1-1)

Already carried as **B1-1**; restated here with the RFC-specific consequence rather than re-counted.
`jar.controller.ts:19` is `return res.json(result)` for every `action`, so RFC 9101 §7's error codes —
`invalid_request_object` above all — are delivered inside a **200 OK** body. The endpoint is unauthenticated
(`jar.routes.ts:7`, `generalLimiter` only) and the body includes the live Authlete `ticket`.

The RFC-specific sharpening: this is the one endpoint in the repo whose entire purpose is *"did my request
object validate?"*, and it answers that question only in a field the lab teaches learners to read with
`curl -s` (`modules/05…/lab.md:193-200`). Every other consumer of an HTTP API — every library, every proxy,
every monitoring probe — reads the status line and concludes the object was accepted.

## Finding F-2 — JAR by reference is unreachable for every registered client (S3, configuration)

Probe 2:

```
require_request_uri_registration = true          # discovery
requestUris                      = <absent>      # all three clients
```

RFC 9101 §5.2.2 lets a client pass `request_uri` instead of `request`. Authlete advertises support
(`request_uri_parameter_supported = true`) *and* requires pre-registration, and no client has a registered
`requestUris` entry. So the by-reference half of the specification cannot be exercised on this deployment at
all — not because of a code gap, but because no client is configured for it. `client.management.service.ts:433-479`
can set `requestUris`, so closing it is a one-field change.

Note the interaction with PAR, which is not a coincidence: the `request_uri` **PAR** hands back
(`urn:ietf:params:oauth:request_uri:…`) is exempt from registration — it is minted by the AS, not the client.
That is why Module 05 Exercise 1 works while §5.2.2 is unavailable. Two mechanisms, one parameter name; the
curriculum should say so explicitly, and currently does not.

## Finding F-3 — asymmetric request-object signing is unreachable for every registered client (S3, configuration) — ✅ **FIXED 2026-08-12 (T1-3)**

> **Fixed banner.** Client `2176571218` was registered with an EC P-256 JWK Set **and**
> `requestSignAlg: ES256`. **Verified live**: an ES256-signed request object returns `action: INTERACTION`
> with a ticket, against the *registered* key and with no ephemeral registration step — which is exactly
> **9101-W3's** acceptance criterion. Two controls were run rather than assumed:
>
> | Object | Result |
> |---|---|
> | ES256, signed with the registered key | `INTERACTION` + ticket |
> | ES256, **one byte flipped in the signature** | `400 invalid_request_object` — `[A005328] The signature of the request object … was not verified` |
> | `alg: none`, same client | `BAD_REQUEST` — `[A005336]` *client-level* algorithm mismatch |
>
> The negative control matters: acceptance alone would not have distinguished "the signature was verified"
> from "the signature was ignored." And `[A005336]` is a **different** code from the `[A008311]` the other
> clients get for the identical object — the client-level pin fires before the service-level check, which
> `modules/05…/lab.md` Step 3 had described in prose and can now show as a transcript (new Step 4b).
>
> **F-2 is untouched.** By-*reference* JAR is still unreachable: `require_request_uri_registration = true` and
> no client has `requestUris`. That is **9101-W2**, and registering a key did nothing for it. The rest of this
> finding describes the pre-fix state.

No client has `jwks`, `jwksUri` or `requestSignAlg` (probe 2) — see `RFC7523-…` F-3's correction for the
`jwks` half, which drifted before T1-3 rather than at it. Authlete advertises 14
`request_object_signing_alg_values_supported`, of which only the three `HS*` entries are usable here, and only
for the one confidential client (`1523514379`) whose secret can serve as the MAC key. The two public clients
have no secret and no key, so they cannot produce a verifiable request object by any algorithm.

This is exactly what `modules/05…/lab.md:231` ("Step 2 — the trap: which JWKS?") and `:265` ("Step 3 —
generate a client key and register it") are working around: the lab registers a key for the exercise. That is
good pedagogy and it hides a deployment fact — after the lab, nothing persists, and the default state of this
service is that JAR-by-value works only symmetrically, only for one client.

FAPI 1.0 Advanced and FAPI 2.0 Message Signing both require asymmetric request objects. `README.md` advertises
FAPI 2.0 support. Carried to B7 alongside the `fapiModes`-absent finding.

## Finding F-4 — `authorization.service.ts` forwards the whole query object to Authlete (S4)

```ts
// server/src/services/authorization.service.ts:34-39
reqBody.parameters = params.toString();
const response = await this.authleteApi.authorization.processRequest({
  serviceId: serviceId,
  authorizationRequest: reqBody,      // reqBody IS req.query, mutated
});
```

`reqBody` is `req.query` itself, with a `parameters` key added — so every query parameter the client sent is
also offered to Authlete as a top-level `AuthorizationRequest` field. **I checked whether this is exploitable
and it is not.** `AuthorizationRequest` has exactly three members — `parameters`, `context`, `cimdOptions`
(SDK `models/authorizationrequest.ts:12-43`) — and Speakeasy's `z.object` outbound schema strips everything
else. In particular there is **no `clientCertificate` member on this request type**, so the injection that
would matter for RFC 8705 is impossible here.

What does survive is `context`: `GET /api/authorization?context=…` sets the arbitrary text Authlete attaches
to the ticket. It is client-controlled data stored encrypted against the ticket and readable only through
Authlete's ticket-info API, which this repo never calls. Harmless today, and it is still the same anti-pattern
the repo deliberately fixed in `userinfo.service.ts:60-65` and `introspection.service.ts:19-24`: build the
Authlete request from named fields, never by spreading client input. Recorded at S4 as a consistency item, not
a vulnerability.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| An unsigned request object is refused | `modules/05…/lab.md:208` | Matches §6.2 and reproduced live | **Accurate** |
| "the object outranks the URL" — §6.3 precedence demonstrated | `modules/05…/lab.md:358` | Matches §6.3 verbatim (*"MUST only use the parameters in the Request Object"*) and the live `traditionalRequestObjectProcessingApplied = False` | **Accurate** |
| `jar.service.ts` "does no key handling" | `modules/05…/README.md:265` | True — Authlete validates | **Accurate** (already recorded in B1) |
| Lab teaches `curl -s POST /api/jar/process` and reading the JSON | `modules/05…/lab.md:193-200` | The endpoint answers 200 on rejection | `DOC_INCORRECT` / S3 (= B1-1's doc item) |
| Nothing states that by-reference JAR is unusable here | Module 05 throughout | `require_request_uri_registration = true` with no client `requestUris` | **Omission** / S3 — F-2 |
| Nothing states that only `HS*` object signing is usable, and only for one client | Module 05 throughout | No client key material registered | **Omission** / S3 — F-3 |
| `SPEC-INVENTORY.md:134` — "no tutorial yet — Module 05 adds one" | `:134` | Module 05 exists and covers it well | **Accurate**, wording now stale / S4 |
| `JarSection.tsx` requires `iss`, `aud`, `client_id` in the pasted JWT | `client/src/components/oidc/JarSection.tsx:108-109` | Matches §4's SHOULD and §6.3's MUST | **Accurate** |

## Sources consulted

- RFC 9101 §§4, 5, 5.2.2, 6.2, 6.3, 7, 9.2 and full ToC — `https://www.rfc-editor.org/rfc/rfc9101.txt`
- Authlete, JWT-Secured Authorization Requests (JAR) — `https://developers.authlete.com/configuration-reference/endpoints/jwt-secured-authorization-requests-jar.md`
- SDK 1.0.0: `models/authorizationrequest.ts:12-43`, `models/authorizationresponse.ts`
- Live probe 2 (2026-08-10) — `SERVICE-CONFIG-PROBE.md` §6–§7
- Code: `services/jar.service.ts:8-15`, `controllers/jar.controller.ts:19`, `routes/jar.routes.ts:7`, `services/authorization.service.ts:26-39`, `utils/validate.ts:14-40`, `services/client.management.service.ts:416-418,433-479`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9101-W1 | *(= B1-W1/B1-W2)* Map `action` to a status in `jar.controller.ts` and stop emitting the raw response | S | See B1. `BAD_REQUEST` → 400 carrying `responseContent`; `ticket`, `service`, `client` never in the body. |
| 9101-W2 | Register a `requestUris` entry on one client and add a §5.2.2 lab step | M | A by-reference JAR request completes; the lab shows registration being enforced (`require_request_uri_registration`) and distinguishes a client-hosted `request_uri` from PAR's. |
| 9101-W3 | Register an asymmetric key on one client and set `requestSignAlg` | S | ✅ **DONE 2026-08-12 (T1-3), = 7523-W4.** An ES256-signed request object validates against the registered key, with a tampered-signature control to prove the check is real. **The acceptance criterion's second clause was deliberately not followed**: Step 3 was *kept*, not replaced. Generating a key locally, checking `d` is absent before pasting it, and watching the error move is the exercise — replacing it with "here is the registered key" would have deleted the teaching to satisfy the work item. The registered client is added as **Step 4b** instead, which also makes Step 3's pinned-algorithm warning demonstrable. |
| 9101-W4 | Say in Module 05 which JAR halves this deployment can and cannot run | S | Two sentences: by-reference unavailable until W2; object signing symmetric-only until W3. |
| 9101-W5 | Build the Authlete authorization request from named fields | S | ✅ **DONE 2026-08-14**, under plan mode. `authorization.service.ts` sends `{ parameters }` and nothing else, matching **`jar.service.ts`** — which calls the *same* Authlete API and already did it right, so this made two siblings agree rather than importing a rule from `userinfo.service.ts`. Tests assert `?context=` and `?cimdOptions=` do not reach Authlete as vendor fields, that the sent object's keys are exactly `["parameters"]`, and that `context` **is** still present inside `parameters` — dropping it there would change what the client asked for; only the vendor field is refused. **One thing the criteria did not name:** the old line mutated `req.query`/`req.body` in place by adding a `parameters` key. Nothing read it — `authorization.controller.ts` takes `prompt` and `properties` off `req.query` directly, both verified — but a service that quietly rewrites the Express request it was handed is a trap for the next reader, so the mutation is gone and two tests assert the request object is untouched on both the GET and POST paths. |

**Ordering.** W5 touches `services/authorization.service.ts`, which **is** on the `AGENTS.md`
**Security-critical surfaces** list (Authorization & consent) — it needs its own plan before editing, small as
it is. W1 does not. W2/W3 are console configuration, not code.
