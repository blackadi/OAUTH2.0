# OpenID for Verifiable Credential Issuance 1.0 (OID4VCI)

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S2**
- **Status:** OpenID **Final**, **16 September 2025** — re-verified against the primary source this session
- **Authlete version:** 3.0
- **Repo docs under test:** `README.md` feature tables, `docs/curriculum/modules/09b-identity-and-credentials/`, `client/src/components/oidc/VciSection.tsx`, `AGENTS.md` VCI paragraph

<thinking>
1. Requirements on the issuer: publish credential issuer metadata at `.well-known/openid-credential-issuer` with
   REQUIRED `credential_issuer`, `credential_endpoint` and `credential_configurations_supported`; expose a
   credential endpoint taking a bearer token; support the credential offer and the
   `urn:ietf:params:oauth:grant-type:pre-authorized_code` grant; optionally a nonce endpoint and a deferred
   endpoint. The AS and the credential issuer may be the same entity, linked by metadata.
2. Authlete boundary: `verifiableCredentials.*` — eight methods used, three `*Parse*` methods unused
   (`01-spec-matrix.md` §3). Authlete builds the metadata document; the AS routes and authenticates. The gate is
   `Service.verifiableCredentialsEnabled`.
3. Code: nine endpoints plus the root well-known path, three auth tiers, and a table-driven action→status mapper
   whose asymmetries `01-spec-matrix.md` §6 verified as correct against the SDK enums. Genuinely well-built.
4. Docs: `README.md` claims it works; a tutorial and a client section exist; Module 09b teaches it.
5. Delta: `verifiableCredentialsEnabled = false`, and `credential_issuer` is absent from the AS discovery
   document. Nothing can run — the same shape as Native SSO.
6. Nothing unresolved. What needed care was not overstating the code-side verdict: the routing, the auth tiers
   and the action mapping are right, and the audit should say so rather than folding them into the failure.
</thinking>

> **Correction, 2026-08-13.** Points 3 and 6 above are **partly wrong** and are left as written because the
> error is the useful part. *"Genuinely well-built"* and *"the routing, the auth tiers and the action mapping
> are right, and the audit should say so rather than folding them into the failure"* were both reached without
> driving a single route: they compare `routes/vci.routes.ts`'s table and `AGENTS.md`'s prose against each
> other. `POST /api/vci/deferred/issue` enforced nothing, which **F-6** now records. The instinct not to
> overstate a code failure was right; the evidence it rested on was a reading of two documents that agreed
> with each other and not with the handler.

## Normative requirements (issuer side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Publish credential issuer metadata at `.well-known/openid-credential-issuer` | §12.2.2 | ✅ served at **true root** (`routes/vci.routes.ts:40`, `generalLimiter`); ❌ content unobtainable — F-1 |
| 2 | Metadata REQUIRED members `credential_issuer`, `credential_endpoint`, `credential_configurations_supported` | §12.2.4 | ⊘ Authlete builds it; `credentialIssuerMetadata` is **absent** on the service (probe 3), so there is nothing to build from — F-1 |
| 3 | Credential endpoint: POST with a bearer access token | §8.2 | ✅ `POST /api/vci/credential/issue`, bearer-or-body (`controllers/vci.controller.ts`); ❌ unreachable — F-1 |
| 4 | Credential offer with `credential_issuer` and `credential_configuration_ids` | §4 | ✅ `POST /api/vci/offer/create` behind admin Basic auth; `credentialConfigurationIds` forwarded (`services/vci.service.ts:56`) |
| 5 | `urn:ietf:params:oauth:grant-type:pre-authorized_code` grant | §4.1.1 | ✅ **enabled** — in the live `grant_types_supported`, and `PRE_AUTHORIZED_CODE` is in every client's `grantTypes` (probe 2 §7) |
| 6 | `tx_code` support on the pre-authorized code grant | §4.1.1 | ✅ `txCode`, `txCodeInputMode`, `txCodeDescription` forwarded (`services/vci.service.ts`) |
| 7 | Nonce endpoint (`nonce_endpoint` metadata) | §7.2 | ❌ not implemented; and `VciSingleParseResponseAction` etc. are unused — see F-3 |
| 8 | Deferred credential endpoint | §3.1.2.3 | ⚠️ → ✅ `POST /api/vci/deferred/issue`, `OK`→200 / `ACCEPTED`→202 — but it **authenticated nobody** until 2026-08-13; see **F-6** |
| 9 | The AS protecting the issuer is identified in metadata (`authorization_servers`) | §3.2 | ❌ `credential_issuer` is **absent** from the AS's own discovery document (probe 3), so the two are not linked — F-2 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Building the credential issuer metadata document | Authlete | `verifiableCredentials.getMetadata` (`services/vci.service.ts:10-17`) |
| Issuing, batch-issuing, deferring credentials | Authlete | five further `verifiableCredentials.*` methods |
| Parsing credential requests | Authlete — **three `*Parse*` APIs exist and are unused.** For two of them that is harmless; for `VciDeferredParse` it was the whole defect — **F-6** | `VciSingleParse`, `VciBatchParse`, `VciDeferredParse` (`01-spec-matrix.md` §3, §6). `VciDeferredParse` is now called (2026-08-13) |
| Routing, three auth tiers, action→status mapping | **This server** | `controllers/vci.controller.ts:14-57`, `routes/vci.routes.ts:17-40` |
| Enabling the feature | Service configuration | `verifiableCredentialsEnabled` — **`false`** |
| The credential dataset itself | **This server**, in a real deployment | not implemented — there is no credential store |

## Finding F-1 — the feature is disabled and `README.md` claims it works (S2)

Probe 3:

```
verifiableCredentialsEnabled = false      # service
credentialIssuerMetadata     = <ABSENT>   # service
credential_issuer            = <ABSENT>   # AS discovery document
```

So `GET /.well-known/openid-credential-issuer` cannot return a conformant §12.2.4 document — there is no
configured metadata for Authlete to serve, and the feature switch is off. Nine endpoints, a client section with
its own UI, and a curriculum module sit on top of that.

`SPEC-INVENTORY.md` already records `verifiableCredentialsEnabled = false`, and probe 1 §3.6 tabulated the claim
against the flag. This entry assigns the verdict: **`MISCONFIGURED`**, because the code is present and correct
and the configuration contradicts the documentation.

It is the second member of the four-instance pattern named in `NATIVE-SSO-1.0.md` F-1 — *claimed working, flag
off* — alongside FAPI 2.0 and MCP/CIMD. Severity S2 for the same reason: `README.md`'s status table is where a
reader goes to learn what works.

## Finding F-2 — the AS and the credential issuer are not linked in metadata (S3)

§3.2: *"The same Authorization Server can protect one or more Credential Issuers"*, and the linkage runs through
metadata — the issuer's document names its `authorization_servers`, and a wallet starting from either side must
be able to reach the other.

Here the two are the *same deployment*, and neither points at the other: `credential_issuer` is absent from the
AS discovery document, and the issuer metadata document is unobtainable (F-1). A wallet given only this AS's
issuer identifier has no path to the credential endpoint.

Note the interaction with the B3 finding: the AS's `issuer` is `https://blackadi.dev` while every endpoint is on
an ngrok tunnel, so even once F-1 is fixed the issuer identifier a wallet records will not resolve to a
retrievable document. **OID4VCI cannot be made to work end to end until the issuer/host mismatch is fixed** —
that dependency belongs in the Gate 4 ordering.

## Finding F-3 — three parse APIs and the nonce endpoint are unused, and one of those is a gap (S4)

> **⚠️ Partly wrong, corrected 2026-08-13. The error is instructive and is kept rather than overwritten.**
> The paragraph below reasoned that the unused parse APIs are *"mostly correct architecture"* because
> *"the `issue` APIs accept the credential request directly."* **That is true of two of the three and false of
> the third.** `/vci/single/issue` and `/vci/batch/issue` accept `accessToken` alongside the order;
> **`/vci/deferred/issue` accepts `order` alone** and has no `accessToken` field at all, so for the deferred
> path `parse` is not an optional step — it is the only place a token can be validated. The generalisation was
> made across three APIs whose request models differ, and it converted a live authentication gap into a
> reassurance. See **F-6**.
>
> The mechanical tell: this finding says "three APIs" and then reasons about them as one. **When a finding
> groups vendor APIs by name, check whether their request models agree before reasoning about the group.**

`01-spec-matrix.md` §6 recorded `VciSingleParseResponseAction`, `VciBatchParseResponseAction` and
`VciDeferredParseResponseAction` as unused Authlete surface. Reading the code against §7.2 and §8.2, that is
mostly *correct architecture*: the `issue` APIs accept the credential request directly, so a separate parse step
is optional.

The genuine gap beside them is the **nonce endpoint** (§7.2, `nonce_endpoint` metadata, returning `c_nonce` with
`Cache-Control: no-store`). Holder key-proof freshness depends on it, and neither the endpoint nor the metadata
parameter exists here. While the feature is disabled this is unreachable; it becomes a real conformance item the
moment F-1 is fixed, so it is recorded now rather than discovered later — the same shape as
`RFC9068-…` F-3.

## Finding F-6 — `POST /api/vci/deferred/issue` authenticated nobody (S2 → ✅ fixed 2026-08-13)

> **✅ FIXED 2026-08-13 (VCI-W5).** Recorded in full because three separate documents — this entry's F-3, its
> VCI-W4, and `AGENTS.md` — each contained enough to find it, and none of them did.

`handleIssueDeferred` collected **no access token**: no `extractBearerToken` call, no body fallback, nothing.
It checked only that `req.body.order` carried a `transactionId` or a `requestIdentifier`, then called
`verifiableCredentials.deferredIssue({ serviceId, order })`. Its two siblings on the same router both answered
`401` without a token.

**And there was no field to carry one.** SDK 1.0.0's `VciDeferredIssueRequest` is
`{ order?: CredentialIssuanceOrder }`; the vendored `docs/openapi-spec.json` (3.0.16) confirms
`/vci/deferred/issue` takes `order` alone. So the token was not dropped in transit — it was never collected,
and Authlete could not have validated one had it been.

| Authlete API | Request model | Where a token can be checked |
|---|---|---|
| `/vci/single/issue` | `accessToken` **+** `order` | on that call |
| `/vci/batch/issue` | `accessToken` **+** `orders` | on that call |
| `/vci/deferred/issue` | `order` **only** | nowhere |
| `/vci/deferred/parse` | `accessToken` + `requestContent` | **here, and only here.** `UNAUTHORIZED` is a member of `VciDeferredParseResponseAction` for exactly this purpose |

**Failure scenario.** A `transaction_id` is a handle, not a credential — OID4VCI §9.1 makes it REQUIRED so a
wallet can name which pending request it is collecting. Anyone who obtained or guessed one reached credential
issuance. **Not live-exploitable on this deployment**: `verifiableCredentialsEnabled` is `false`, which is why
this is S2 rather than S1 — the same standing as `NATIVE-SSO-1.0.md` F-1.

**UNVERIFIED:** §9's exact normative sentence on authenticating the Deferred Credential Request was not quoted
verbatim from the primary source, so no MUST is cited. The finding does not need one: the two sibling
endpoints, the unused `parse` API, and `AGENTS.md`'s own claim that the endpoint required a Bearer token are
each independent of the spec text. §9.1's REQUIRED `transaction_id` **is** confirmed.

**Why it survived**, which is the part worth carrying:

1. **No test named the route.** Found by `node scripts/check-route-coverage.mjs --triage`, which asks *"which
   routes does no test mention?"* — not by reading code. The controller had a unit test; a controller test
   calls the handler directly and cannot see a missing gate.
2. **Two documents asserted the missing control.** `AGENTS.md` and `routes/routes-list.routes.ts:381` both said
   "requires Bearer token". A documented control is a hypothesis, never evidence.
3. **The siblings were correct, so nothing looked wrong in isolation.** The defect was an *asymmetry*, and an
   asymmetry is only visible across the set. The fix therefore asserts all three endpoints as one posture
   (`tests/integration/vci.routes.test.ts`).
4. **This entry reasoned past it twice** — F-3's generalisation across three differently-shaped request models,
   and VCI-W4's "keep the code as-is" nine lines under a boundary row naming `VciDeferredParse` as unused.

**The fix.** `parse` first, mapped `OK`→200 / `BAD_REQUEST`→400 / `UNAUTHORIZED`→401 / `FORBIDDEN`→403; issue
only on `OK`; `requestIdentifier` taken from `parse`'s `info.identifier` and **never** from `req.body` (else any
valid token could name any pending request); `transactionId` required and a bare `requestIdentifier` refused,
that being the shape which bypassed validation. The wire format stays Authlete's — **T1-11**'s scope, with this
endpoint now a fourth site alongside PAR, Device and DCR.

## What this spec gets right

Recorded because the code quality here is high and the verdict is about configuration:

- **Three auth tiers, correctly separated — for eight of the nine endpoints.** Discovery public, offer creation behind admin Basic auth, credential issuance on an access token: the right partition, and a wallet must reach discovery without a token and must not be able to mint offers. **`POST /api/vci/deferred/issue` was the ninth and it enforced nothing** — see **F-6**. This bullet read as an unqualified pass until 2026-08-13, and the sentence it was checked against was `AGENTS.md`'s description rather than the route's behaviour.
- **Table-driven action mapping** (`controllers/vci.controller.ts:14-57`, six maps) with an unmapped action falling through to 500. `01-spec-matrix.md` §6 verified the two apparent asymmetries — `BATCH_ISSUE_MAP` lacking `ACCEPTED`, `DEFERRED_ISSUE_MAP` lacking `UNAUTHORIZED` — as **correct**, because the corresponding SDK enums lack those members.
- The `pre-authorized_code` grant is enabled service-wide and on every client, so the offer half of the flow has real configuration behind it.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title, Final, **16 Sep 2025** | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **Confirmed** against `openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html` this session | **Accurate** |
| Nine endpoints, three auth categories, action→status maps | `AGENTS.md` VCI paragraph | ❌ **it did not.** `AGENTS.md` placed `deferred/issue` in the access-token category; the handler collected no token. Graded *Accurate* here by comparing the paragraph against the route **table** rather than against the handler — F-6. Corrected 2026-08-13 | ~~**Accurate**~~ → `DOC_INCORRECT` / **S2**, fixed |
| Verifiable Credentials presented as a shipped feature (9 endpoints + tutorial) | `README.md`, `VciSection.tsx` | `verifiableCredentialsEnabled = false` — nothing runs | `DOC_INCORRECT` / **S2** |
| `verifiableCredentialsEnabled = false` already recorded | `SPEC-INVENTORY.md` | Accurate — the repo knew, and the feature table did not | **Accurate** |
| Module 09b has two `UNVERIFIED` markers (`README.md:203,608`, `lab.md:556`) | `00-inventory.md` §9 | Not re-examined here; carried to Phase 3. Consistent with a disabled feature | **Deferred to Phase 3** |
| Nothing states that the AS discovery document omits `credential_issuer` | all docs | F-2 | **Omission** / S3 |
| Nothing notes the missing nonce endpoint | all docs | F-3 | **Omission** / S4 |

## Sources consulted

- OpenID for Verifiable Credential Issuance 1.0 §§3.1.2.3, 3.2, 4, 4.1.1, 7.2, 8.2, 12.2.2, 12.2.4 — `https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html`, fetched this session. Quoted: the well-known path, the three REQUIRED metadata members, the pre-authorized code grant URN, the nonce endpoint definition, and *"The same Authorization Server can protect one or more Credential Issuers."*
- Live probes 2 and 3 (2026-08-10): `verifiableCredentialsEnabled`, `credentialIssuerMetadata`, `credential_issuer`, `grant_types_supported`, per-client `grantTypes` — `SERVICE-CONFIG-PROBE.md` §6–§9
- SDK 1.0.0: eight `verifiableCredentials.*` methods used, three `*Parse*` unused; the six VCI action enums (`01-spec-matrix.md` §3, §6)
- Code: `services/vci.service.ts:10-40,56`, `controllers/vci.controller.ts:14-57`, `routes/vci.routes.ts:17-40`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| VCI-W1 | Decide: enable VCI, or stop presenting it as shipped | M | **Gate 4 decision.** If enabled: `verifiableCredentialsEnabled = true`, `credentialIssuerMetadata` configured, and `GET /.well-known/openid-credential-issuer` returns a §12.2.4 document with all three REQUIRED members. If not: `README.md` and `VciSection.tsx` say "implemented, service flag off", and Module 09b carries the same banner. |
| VCI-W2 | Link the AS and the issuer | S | Conditional on W1: `credential_issuer` present in the AS discovery document and `authorization_servers` in the issuer document. **Blocked on the B3 issuer/host fix** — otherwise the linkage points somewhere unretrievable. |
| VCI-W3 | Add the nonce endpoint | M | Conditional on W1: `nonce_endpoint` in the issuer metadata, returning `c_nonce` with `Cache-Control: no-store` per §7.2. |
| VCI-W4 | ~~Keep the code as-is~~ — **withdrawn 2026-08-13** | — | **This work item was wrong, and its evidence was already in this file.** It asserted that "routing, auth tiers and action mapping are correct" nine lines below a boundary-table row recording `VciDeferredParse` as *existing and unused*. Those two facts are the same fact, and joining them is the finding. Superseded by **VCI-W5**. |
| VCI-W5 | ~~`POST /api/vci/deferred/issue` authenticates nobody~~ **✅ FIXED 2026-08-13** | M | Was: the handler collected no access token, and `VciDeferredIssueRequest` has no `accessToken` field, so nothing on the path could validate one — a caller holding a `transactionId` reached issuance. Now: `parse` first (`UNAUTHORIZED`→401), `requestIdentifier` from `info.identifier` and never from the body, a bare `requestIdentifier` refused. **Criteria met:** `verifiableCredentials.deferredParse` is called before `deferredIssue`; no token → 401 with neither API reached; `parse`→`UNAUTHORIZED` → 401 with `deferredIssue` unreached. Live path **UNVERIFIED** (`verifiableCredentialsEnabled` is `false`). |

**Ordering.** W1 gates everything and depends on the B3 issuer fix to be meaningful. None of these files is on
the `AGENTS.md` **Security-critical surfaces** list, and `AGENTS.md` explicitly excludes `vci` — correctly, since
Authlete performs credential issuance.
