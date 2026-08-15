# RFC 9396 — OAuth 2.0 Rich Authorization Requests (RAR)

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S3**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/RAR-TUTORIAL.md`, `docs/curriculum/modules/09a-interaction-extensions/lab.md` Exercise 5, `docs/curriculum/SPEC-INVENTORY.md`

<thinking>
1. RFC MUSTs on the AS: §2 — `authorization_details` is a JSON array of objects, each with a REQUIRED `type`;
   §2.2 defines the common fields. §3 — the AS **MUST refuse** any unknown type or non-conforming object and
   respond `invalid_authorization_details`. §3.1 — `authorization_details` and `scope` may coexist and both MUST
   be processed. §7 — the AS MUST return the granted `authorization_details` in the token response. §9 — it is a
   top-level claim in a JWT AT and a top-level member of the introspection response. §10 — advertise
   `authorization_details_types_supported`.
2. Authlete boundary: parsing, type validation, the error, token-response inclusion and introspection are all
   Authlete's. What the AS owns is exactly one thing that matters: **rendering the requested detail objects on
   the consent screen** so the resource owner can consent to structure rather than to a scope string.
3. Code: that one thing is done, and done well — `authorization.controller.ts:84` stores
   `result.authorizationDetails`, `session.controller.ts:212,219` passes it to the view, and
   `views/consent.ejs:33-40` renders each object with its `type` as a badge. Nothing hand-parses the JSON.
4. Docs: Module 09a verifies the four refusals and marks the success path `UNVERIFIED` with the exact reason.
5. Delta: no code defect. `supportedAuthorizationDetailsTypes` is unset, so §3's MUST-refuse applies to
   *everything* — the spec is correctly implemented and comprehensively unusable.
6. Nothing unresolved. The one judgement call is severity: an unset allowlist is a configuration state, and the
   curriculum is honest about it, so S3 rather than S2.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | `authorization_details` is a JSON array of objects, each with a REQUIRED `type` | §2, §2.1 | ⊘ Authlete's — carried inside the opaque `parameters` string |
| 2 | Common data fields `locations`, `actions`, `datatypes`, `identifier`, `privileges` | §2.2 | ⊘ Authlete's; `consent.ejs` renders whatever fields arrive |
| 3 | **MUST refuse an unknown type**, responding `invalid_authorization_details` | §3 | ✅ Authlete's — **verified live**, four refusals (`modules/09a…/lab.md` Ex 5a). With no registered types, this refuses everything — F-1 |
| 4 | `authorization_details` and `scope` both processed when both present | §3.1 | ⊘ Authlete's; untestable while F-1 stands |
| 5 | The AS MUST return the **granted** details in the token response | §7 | ⊘ Authlete's; the token controller forwards `responseContent` verbatim (`token.controller.ts:52`), so this would work |
| 6 | Top-level claim in a JWT AT | §9.1 | ⊘ n/a — no JWT ATs on this service (`RFC9068-…`) |
| 7 | Top-level member of the introspection response | §9.2 | ⊘ Authlete's; `IntrospectionResponse.authorizationDetails` exists and is never read by this server, but `/api/introspection/standard` forwards Authlete's own body |
| 8 | Advertise `authorization_details_types_supported` | §10 | ❌ **absent** from the live discovery document — F-1 |
| 9 | Present the requested details to the resource owner for consent | §3 (implicit), §12 | ✅ **this server's own work, and it is done** — `views/consent.ejs:33-40` |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Parsing and validating `authorization_details`; emitting `invalid_authorization_details` | Authlete | `authorization.processRequest` |
| The type allowlist | Service configuration | `supportedAuthorizationDetailsTypes` — **absent** |
| Per-client restriction | Client configuration | `authorizationDetailsTypes` — absent on all three clients; settable at `services/client.management.service.ts:475-478` |
| **Rendering the details for consent** | **This server** | `controllers/authorization.controller.ts:84` → `controllers/session.controller.ts:212,219` → `views/consent.ejs:33-40` |
| Returning granted details on the token response and introspection | Authlete | `responseContent` passthrough |

Note the naming detail the inventory already recorded: the repo uses Authlete's camelCase `authorizationDetails`
throughout and the snake_case `authorization_details` appears **nowhere** in `server/src`. That is correct — the
wire-format name only ever exists inside `parameters` and inside Authlete's `responseContent`.

## Finding F-1 — RAR is correctly implemented and cannot be used at all (S3, configuration)

Probe 3:

```
supportedAuthorizationDetailsTypes  = <absent>     # service
authorization_details_types_supported = <ABSENT>   # generated discovery document
authorizationDetailsTypes           = <absent>     # all three clients
```

§3 requires the AS to *"refuse to process any unknown authorization details type"* and answer
`invalid_authorization_details`. With no registered types, **every** type is unknown, so every RAR request is
refused — correctly, per the spec, and to no useful end. §10's metadata parameter is absent for the same reason,
so a client cannot discover which types to use, because there are none.

This is the cleanest example in the audit of a distinction Module 09a itself draws
(`modules/09a…/lab.md:120-124`): *"**'Permitted but not configured' is a third state**, distinct from Module 07's
'supported but not required.' … Permitted-but-not-configured is an availability one — the mechanism is allowed
and cannot run. Both look like a green tick in a capability matrix."* RAR is exactly that, and unlike JARM
(`JARM-…` F-1) the AS does **not** over-advertise: `authorization_details_types_supported` is honestly absent.
That is why this is S3 and JARM's equivalent is also S3 — but for opposite reasons. Here the metadata tells the
truth.

**One registered type makes the whole spec runnable**, including the consent-screen rendering that is already
built and has never been seen working.

## Finding F-2 — the consent screen is the repo's real RAR contribution and is untested (S4)

`views/consent.ejs:33-40` renders each detail object in a card with its `type` as a badge — the piece §3 and §12
leave to the AS, and the piece that makes RAR meaningful rather than decorative (the resource owner consents to
structure, not to a scope string). It is also:

- unreachable today, because no request carrying `authorization_details` survives validation (F-1);
- covered by no test — `controllers/session.controller.ts` is on the no-unit-test list (`00-inventory.md` §8), and there is no view-rendering test anywhere.

So the one part of RAR this server owns has never executed. Recorded at S4 because the code is short and looks
right; it becomes the acceptance criterion for the F-1 fix.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"OAuth 2.0 Rich Authorization Requests"*, Standards Track, May 2023 | `SPEC-INVENTORY.md` | **Confirmed** against `rfc-editor.org/rfc/rfc9396.txt` this session | **Accurate** |
| Four refusals verified; success path marked `UNVERIFIED` naming `supportedAuthorizationDetailsTypes` | `modules/09a…/lab.md:610-613` | Confirmed **still unset** by probe 3 (2026-08-10), so the marker is accurate rather than stale | **Accurate — exemplary** |
| "Permitted but not configured is a third state … Both look like a green tick in a capability matrix" | `modules/09a…/lab.md:120-124` | The best framing of this class of finding in the repo; RAR is its clearest instance | **Accurate** |
| `docs/RAR-TUTORIAL.md` presents RAR end to end | whole file | **Not read line-by-line in this entry** — the tutorial's testable claims are carried to Phase 3. What is certain is that no transcript in it can have been produced on this service while F-1 holds | **Deferred to Phase 3** |
| Nothing states that the consent-screen rendering has never run | Module 09a, `RAR-TUTORIAL.md` | F-2 | **Omission** / S4 |

## Sources consulted

- RFC 9396 §§2, 2.1, 2.2, 3, 3.1, 3.2, 4, 7, 9.1, 9.2, 10, 12 and full ToC — `https://www.rfc-editor.org/rfc/rfc9396.txt` (§3's MUST-refuse sentence and §7's MUST-return sentence quoted verbatim this session)
- Live probes 2 and 3 (2026-08-10): `authorization_details_types_supported`, `supportedAuthorizationDetailsTypes`, per-client `authorizationDetailsTypes` — `SERVICE-CONFIG-PROBE.md` §6–§8
- SDK 1.0.0: `AuthzDetails` on the authorization, token and token-create models (`01-spec-matrix.md` §2)
- Code: `controllers/authorization.controller.ts:84`, `controllers/session.controller.ts:212,219`, `views/consent.ejs:33-40`, `services/client.management.service.ts:475-478`
- Grep: snake_case `authorization_details` appears nowhere in `server/src` (`00-inventory.md` §6) — correct

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9396-W1 | Register one `authorization_details` type on the service and one client | S | ✅ **DONE 2026-08-12 (T1-6)** — `payment_initiation` on both. Every clause verified: the request is accepted, `authorization_details_types_supported` appears in discovery (62 → 64 members, with `acr_values_supported`), and the granted details return on the token response **and** on introspection. **The round trip exposed a new instance of theme 3**: the token response is RFC 9396-shaped, while introspection returns Authlete's internal envelope — `{elements:[…]}` with the RFC's *common data fields* (`instructedAmount`, `creditorAccount`) flattened into a **string** called `otherFields`. A resource server reusing one parser across both responses fails, and the fields it most needs are inside that string. Recorded in Module 09a 5b; belongs with **T2-15**'s wire-format statements. |
| 9396-W2 | Add a consent-render test | S | A unit or view test asserts that a detail object's `type`, `actions` and `locations` reach `consent.ejs`. |
| 9396-W3 | Keep the refusal exercise | — | Module 09a's four verified refusals stay; they demonstrate §3's MUST and are the only RAR behaviour ever observed here. |
| 9396-W4 | Audit `RAR-TUTORIAL.md` against real behaviour | M | ✅ **DONE 2026-08-14 (T2-1).** **The item's own premise inverted between writing and doing it.** "Any transcript in it predates a runnable configuration" was true when written and false by the time it was executed: W1 registered `payment_initiation` on 2026-08-12, so the three transcripts are now derived from the live round trip in `modules/09a…/lab.md` 5b rather than merely labelled — which is the outcome the item hoped for in its second clause. Three defects came out with them. `expires_in` read **3600** where `accessTokenDuration` is **86400**. The PAR block showed `{"action":"CREATED","request_uri":…}` — **half Authlete's envelope and half RFC 9126 §2.2's body, a shape no version of this server ever emitted** (a T1-11 residue). And the introspection block showed `authorization_details` at the top level, where the live response is `authorizationDetails.elements[]` with `instructedAmount`/`creditorAccount` flattened into an **`otherFields` string** — so the tutorial taught one parser for two incompatible shapes. Part 7's four other type names now carry an `UNVERIFIED` marker naming `[A249302]`, since only one type is registered. |

**Ordering.** W1 first — it unblocks W2 and W4 and costs a console edit. No work item touches a file on the
`AGENTS.md` **Security-critical surfaces** list, though W2 exercises `session.controller.ts`, which is on it.
