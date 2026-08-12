# FAPI 2.0 Message Signing

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S2**
- **Status:** OpenID **Final**, **25 September 2025** — re-verified against the primary source this session
- **Authlete version:** 3.0 (`Service.fapiModes`, prefix `FAPI2_MESSAGE_SIGNING_*`)
- **Repo docs under test:** `docs/FAPI-TUTORIAL.md`, `client/src/data/operationDocs.ts:760`, `docs/curriculum/SPEC-INVENTORY.md:230`, `docs/curriculum/modules/10-fapi-and-grant-management/`

<thinking>
1. Three AS-facing shall statements, one per mechanism: §5.3.1 — support, **require** and verify signed request
   objects per RFC 9101 **at the PAR endpoint**; §5.4.1 — support, **require** and issue signed authorization
   responses via JARM; §5.5.1 — sign introspection responses issued in JWT format per RFC 9701. No algorithm
   restriction and no RFC 9421 requirement in this document, which I checked rather than assumed (the Phase 0
   reconciliation had listed RFC 9421 under "FAPI 2.0 HTTP Signatures" as newly-discovered Authlete surface, and
   this document is not where that lives).
2. Authlete boundary: all three are Authlete's, gated by `fapiModes` with the `FAPI2_MESSAGE_SIGNING_*` prefix.
   Zero AS code — the same shape as JARM alone.
3. Code: `computeFapiMode` recognises the prefix (`fapi.controller.ts:11-13`), and that is the whole of it.
4. Docs: the tutorial and the SPA's operation docs describe the mode; `SPEC-INVENTORY.md:230` summarises it as
   "JAR + JARM + signed introspection", which is exactly right.
5. Delta: all three prerequisites are independently broken — JAR unusable for want of client keys, JARM unusable
   for want of `authorizationSignAlg`, and RFC 9701 returns **500** because the `JWT` action is unhandled. So this
   profile sits on top of three findings already raised, and its value here is showing they compose.
6. That composition is the finding. Message Signing is the only entry in the audit whose every requirement was
   already independently found broken — which makes it the best single demonstration of why the audit's
   per-spec verdicts need a synthesis pass.
</thinking>

## Normative requirements (AS side) versus the live configuration

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | *"shall support, require use of, and verify signed request objects according to JAR [RFC9101] **at the PAR endpoint**"* | §5.3.1 | ❌ triply blocked — F-1 |
| 2 | *"shall support, require use of, and issue signed authorization responses via JWT Secured Authorization Response Mode"* | §5.4.1 | ❌ no client has `authorizationSignAlg` (`JARM-…` F-1) |
| 3 | *"shall sign introspection responses that are issued in JWT format according to [RFC9701]"* | §5.5.1 | ❌ **the endpoint returns HTTP 500** for the JWT case (`RFC9701-…`, B2) — F-2 |
| — | `fapiModes` includes a `FAPI2_MESSAGE_SIGNING_*` mode | — | ❌ `fapiModes` absent ⇒ `computeFapiMode` returns `"disabled"` |
| — | The Security Profile's own requirements, which Message Signing builds on | FAPI 2.0 SP §5.3.2.1 | ❌ seven of eight unmet (`FAPI-2.0-SECURITY-PROFILE.md`) |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Verifying signed request objects at PAR | Authlete | available; unusable — F-1 |
| Building and signing JARM responses | Authlete | available; unusable — `JARM-…` F-1 |
| Signing introspection responses | Authlete, via `StandardIntrospectionResponseAction.JWT` | **available and unreachable** — the AS drops the action, F-2 |
| Enabling the mode | Service configuration | `fapiModes` — absent |
| Any AS code | **none required** | `fapi.controller.ts:11-13` reports the mode and nothing else |

## Finding F-1 — §5.3.1 is blocked three ways at once (S2)

*"shall support, require use of, and verify signed request objects … at the PAR endpoint."* Each clause fails
independently:

| Clause | Blocker | Recorded in |
|---|---|---|
| **support** signed request objects | ~~no client has `jwks`, `jwksUri` or `requestSignAlg`~~ → **satisfied 2026-08-12 (T1-3)**: one client signs request objects with `ES256` against a registered key, verified live, so the non-repudiation objection no longer applies to *this* clause. Still ❌ on **require** — `requestObjectRequired` is false everywhere | `RFC9101-…` F-3 |
| **require use of** | `requestObjectRequired = false` service-wide and on every client; `require_signed_request_object = false` | `RFC9101-…` requirement 8 |
| **at the PAR endpoint** | PAR is optional (`parRequired = false`) — and the advertised PAR endpoint cannot accept a conformant PAR request at all, because it requires an Authlete-shaped JSON body | `RFC9126-…` F-1 |

The third is the one worth dwelling on: even with client keys registered and `requestObjectRequired` set, a
conformant FAPI client pushing a signed request object to `/api/par` receives
`400 {"error":"invalid_request","error_description":"Missing required body field: parameters"}`. So §5.3.1 is not
merely unconfigured here — the endpoint it names is not reachable by the clients the profile is written for.

## Finding F-2 — §5.5.1's mechanism exists in Authlete and is discarded by this server (S2)

`StandardIntrospectionResponseAction` has four members — `INTERNAL_SERVER_ERROR`, `BAD_REQUEST`, `OK`, **`JWT`** —
and `controllers/introspection-standard.controller.ts:13-31` handles three. `JWT` falls to `default` at `:26` and
returns **HTTP 500** with `"Unknown introspection action from Authlete /introspection"`.

The trigger is reachable and not theoretical: `services/introspection.service.ts:124-127` deliberately forwards
the caller's `Accept` header as `httpAcceptHeader`, which is exactly how RFC 9701 requests a signed response. So a
resource server asking for `application/token-introspection+jwt` — the thing §5.5.1 requires the AS to sign —
gets a 500.

This was found in Phase 1 (`01-spec-matrix.md` §6) as the single action-coverage gap out of 36 mappings, and given
a verdict in B2 (`RFC9701-jwt-introspection-response.md`). Its FAPI significance is what this entry adds: it is
not just an unhandled enum member, it is **the one Message Signing requirement whose failure is a live 500 rather
than a disabled flag**. Everything else in this profile is off; this one is broken.

Also relevant: `introspection_signing_alg_values_supported = [HS256, HS512, ES256, HS384, "none"]` (probe 3). The
list advertises **`none`** for signed introspection responses — for a profile whose entire purpose is
non-repudiation, and whose sibling FAPI 1.0 Part 2 forbids `none` outright.

## Finding F-3 — this profile is the audit's clearest case for a synthesis pass (S3)

Message Signing has three requirements. Every one was already found broken, independently, in a different batch:

| Requirement | Blocked by | Batch |
|---|---|---|
| §5.3.1 JAR at PAR | `RFC9101-…` F-3 (no client keys), `RFC9126-…` F-1 (PAR wire format) | B4 |
| §5.4.1 JARM | `JARM-…` F-1 (no `authorizationSignAlg`) | B4 |
| §5.5.1 signed introspection | `RFC9701-…` (unhandled `JWT` action → 500) | B2 |
| Underlying profile | `FAPI-2.0-SECURITY-PROFILE.md` (7 of 8 unmet) | B7 |

None of those four findings mentions Message Signing, and this entry adds no new defect of its own. What it adds
is the observation that they **compose into a claimed capability**: `client/src/data/operationDocs.ts:760` tells a
user that the mode `"ms"` *"adds Message Signing (JARM + signed request objects with nbf)"*, and
`docs/FAPI-TUTORIAL.md` presents the mode as selectable configuration.

That is the argument for Phase 4 aggregating by *capability* as well as by spec: four separately-reasonable
findings, each S2 or S3, that together mean a documented mode cannot function in any respect. A per-spec register
alone would not surface it.

**One correction to the SPA's description while I am here.** `operationDocs.ts:760` says Message Signing adds
*"JARM + signed request objects with nbf"*. Per §5.3.1/§5.4.1/§5.5.1 it adds **three** mechanisms — the third,
signed introspection responses, is omitted. And the `nbf` requirement it names belongs to FAPI **1.0** Part 2
§5.2.2 (the 60-minute bound), not to Message Signing, which states no algorithm or lifetime constraints.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"FAPI 2.0 Message Signing"*, Final, **25 Sep 2025** | `SPEC-INVENTORY.md:230`, `01-spec-matrix.md` §3 | **Confirmed** against `openid.net/specs/fapi-message-signing-2_0-final.html` this session | **Accurate** |
| "Non-repudiation via JAR + JARM + signed introspection" | `SPEC-INVENTORY.md:230` | Matches §5.3.1/§5.4.1/§5.5.1 exactly — all three mechanisms named | **Accurate** |
| `fapiModes` prefix `FAPI2_MESSAGE_SIGNING_*`; "requires JAR + JARM + signed introspection" | `01-spec-matrix.md` §3 | Confirmed | **Accurate** |
| The mode `"ms"` *"adds Message Signing (JARM + signed request objects with nbf)"* | `client/src/data/operationDocs.ts:760` | Omits signed introspection; attributes an `nbf` bound that belongs to FAPI 1.0 Part 2 | `DOC_INCORRECT` / S3 |
| "Configure FAPI modes in the Authlete console" | `operationDocs.ts:760` | True, and the sentence implies the mode would then work — three prerequisites are broken | **Accurate but misleading** / S3 |
| Nothing states that all three Message Signing mechanisms are independently unavailable | `FAPI-TUTORIAL.md`, Module 10 | F-3 | **Omission** / S3 |

## Sources consulted

- FAPI 2.0 Message Signing §§5.3.1, 5.4.1, 5.5.1 — `https://openid.net/specs/fapi-message-signing-2_0-final.html`, fetched this session. All three shall statements quoted verbatim; confirmed the document states **no** algorithm restriction and does **not** reference RFC 9421.
- FAPI 2.0 Security Profile §5.3.2.1 — `https://openid.net/specs/fapi-security-profile-2_0-final.html`
- FAPI 1.0 Part 2 §5.2.2 (the `nbf` bound `operationDocs.ts` misattributes) — `https://openid.net/specs/openid-financial-api-part-2-1_0.html`
- Live probes 1–3 (2026-08-10): `fapiModes`, `requestObjectRequired`, `require_signed_request_object`, `parRequired`, `introspection_signing_alg_values_supported`, per-client `requestSignAlg` / `authorizationSignAlg` / `jwksUri` — `SERVICE-CONFIG-PROBE.md` §2–§10
- SDK 1.0.0: `models/standardintrospectionresponse.ts:14-18` (the four action members)
- Code: `controllers/fapi.controller.ts:11-13`, `controllers/introspection-standard.controller.ts:13-31`, `services/introspection.service.ts:124-127`, `client/src/data/operationDocs.ts:760`
- Cross-references: `RFC9701-jwt-introspection-response.md`, `RFC9101-jwt-secured-authorization-request.md`, `RFC9126-pushed-authorization-requests.md`, `JARM-authorization-response-mode.md`, `FAPI-2.0-SECURITY-PROFILE.md`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| MS-W1 | Handle `StandardIntrospectionResponseAction.JWT` | S | `application/token-introspection+jwt` on `/api/introspection/standard` returns 200 with the signed JWT and `Content-Type: application/token-introspection+jwt`, not 500. **The only live 500 among this profile's requirements** — same item as the RFC 9701 entry's work list. |
| MS-W2 | Correct the SPA's Message Signing description | S | `operationDocs.ts:760` names all three mechanisms and drops the misattributed `nbf` bound. |
| MS-W3 | Drop `none` from the introspection signing algorithms | S | `introspection_signing_alg_values_supported` no longer advertises `none` for a non-repudiation mechanism. Console change. |
| MS-W4 | Treat Message Signing as one capability at Gate 4 | S | The remediation plan lists it once, with its four prerequisite findings as dependencies, rather than as a fifth independent item. **This is F-3's real recommendation.** |
| MS-W5 | Decide the mode's fate with the Security Profile's | S | = **FAPI2-W5**. Message Signing builds on the Security Profile; enabling it separately is not meaningful. |

**Ordering and gating.** MS-W1 is independent, small, and fixes a live 500 — it should go early regardless of any
FAPI decision. MS-W4/W5 are Gate 4 framing. `controllers/introspection-standard.controller.ts` is **not** on the
`AGENTS.md` **Security-critical surfaces** list, though `controllers/introspection.controller.ts` is — worth
aligning at Gate 4, since both shape introspection output.
