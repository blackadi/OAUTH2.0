# OAuth Client ID Metadata Document (CIMD)

- **Verdict:** `MISCONFIGURED`
- **Severity:** **S3**
- **Status:** **Active Internet-Draft**, OAuth WG. Current revision is **`draft-ietf-oauth-client-id-metadata-document-02`, last updated 6 July 2026** — verified this session. `SPEC-INVENTORY.md` cites **`-01`** — see F-3.
- **Authlete version:** **3.0.22+** (`01-spec-matrix.md` §2) — the live service's exact patch level is unknown, which matters only here
- **Repo docs under test:** `docs/MCP-OAUTH-TUTORIAL.md`, `AGENTS.md` CIMD paragraph, `client/src/components/mcp/McpSection.tsx`, `docs/curriculum/modules/09a-interaction-extensions/quiz.md`

<thinking>
1. Requirements on the AS: when a `client_id` is an HTTPS URL, fetch the document at that URL; require a
   200 (all other responses are errors); **MUST NOT follow redirects**; validate that the `client_id` inside the
   document matches the URL by simple string comparison; SHOULD respect HTTP cache headers and MUST NOT cache
   errors; advertise `client_id_metadata_document_supported`.
2. Authlete boundary: **all of it**, server-side, gated by `Service.clientIdMetadataDocumentSupported`. The SDK
   also exposes per-request `cimdOptions` on `AuthorizationRequest` and `TokenRequest`.
3. Code: nothing to audit on the server, which is correct. `cimdOptions` is never set. The SPA has a CIMD tab
   that fetches a metadata document for display.
4. Docs: `AGENTS.md` describes the division of labour accurately. `MCP-OAUTH-TUTORIAL.md` claims MCP works "out
   of the box", which depends on this flag.
5. Delta: `clientIdMetadataDocumentSupported = false`, so no HTTPS-URL `client_id` is accepted; and the flag is
   read through an untyped cast because it is not in the SDK's typed model.
6. Two things needed checking rather than assuming: the current draft revision (the repo cites `-01`), and
   whether the flag's absence from the SDK model is a real fragility or a cosmetic one.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept an HTTPS URL as `client_id` and fetch the metadata document from it | draft-02 | ⊘ Authlete's — ❌ **disabled** (F-1) |
| 2 | Require HTTP 200; treat all other responses as errors | draft-02 | ⊘ Authlete's |
| 3 | **MUST NOT** automatically follow HTTP redirects when fetching | draft-02 | ⊘ Authlete's — unverifiable locally, and worth a note (F-2) |
| 4 | Validate that the document's `client_id` matches the URL by simple string comparison | draft-02 | ⊘ Authlete's |
| 5 | Client Identifier URL constraints: HTTPS, has a path, no userinfo, no fragment, no dot-segments | draft-02 | ⊘ Authlete's |
| 6 | MAY cache; SHOULD respect cache headers; MUST NOT cache errors | draft-02 | ⊘ Authlete's — `AGENTS.md` records a ≤86,400 s cache, from the Authlete page |
| 7 | Advertise `client_id_metadata_document_supported` | draft-02 | ❌ absent from the live discovery document, correctly, because the flag is `false` — F-1 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Detecting a URL `client_id`, fetching, validating, registering, caching | **Authlete, entirely server-side** | no AS code required |
| Enabling it | Service configuration | `clientIdMetadataDocumentSupported` — **`false`** (probe 1 §2) |
| Per-request overrides | **This server, if it chose to** | `cimdOptions` on `AuthorizationRequest` and `TokenRequest` (SDK models) — **never set** |
| Reporting the posture | **This server** | `controllers/fapi.controller.ts:31-33,79-81` — read via `as Record<string, unknown>` (F-2) |
| Displaying a client's CIMD document | **The SPA** | `client/src/services/mcp.service.ts` `fetchCimdMetadata`, `McpSection.tsx` CIMD tab |

`AGENTS.md`'s summary is accurate and worth keeping: *"Authlete handles CIMD entirely server-side … No new
endpoints or client code needed."* That is why there is no server-side code to audit, and it is the correct
architecture rather than a gap.

## Finding F-1 — CIMD is disabled, and the MCP tutorial's central claim depends on it (S3)

Probe 1 §2 and probe 3: `clientIdMetadataDocumentSupported = false`, and `client_id_metadata_document_supported`
is absent from the 62-member discovery document.

`AGENTS.md`'s own flags table sets the expectation correctly — *"Set `true` only if targeting MCP or CIMD-aware
ecosystems"* — and `docs/MCP-OAUTH-TUTORIAL.md` claims *"this server supports MCP flows out of the box"*
(`00-inventory.md` §9). Those two statements are in tension: the MCP specification says authorization servers and
clients **SHOULD** support CIMD, and the SPA ships a CIMD tab plus a five-step wizard around it. With the flag
off, an HTTPS-URL `client_id` is rejected as an unknown client.

Severity S3 rather than S2 because CIMD is a **SHOULD** in the MCP spec, not a MUST, and MCP's client-registration
section explicitly permits pre-registration and DCR as alternatives — so "MCP out of the box" is not *only* a
CIMD claim. The MCP-level verdict is in `MCP-OAUTH.md`; this row records the flag.

This is the fourth member of the *claimed working, flag off* pattern (`NATIVE-SSO-1.0.md` F-1).

## Finding F-2 — the flag is read through an untyped cast, and the §3 redirect rule is unverifiable (S4)

Two related observations about the boundary rather than the spec:

**(a) The flag is not in the SDK's typed model.** `controllers/fapi.controller.ts:31-33,79-81` reads it as
`(service as Record<string, unknown>).clientIdMetadataDocumentSupported`, which `00-inventory.md` §7 already
flags. So the repo's only report of its CIMD posture bypasses type checking — and, worse, sits in the two
endpoints that currently return HTTP 200 with a stack trace because `service.get()` throws on `SPIFFE_JWT`
(`AGENTS.md`; `RFC7636-pkce.md` F-1). Net effect: the deployment cannot report its own CIMD posture at all, by
two independent mechanisms.

> **⚠️ (a) IS WRONG, and both of its mechanisms are gone (corrected 2026-08-12, T1-5).** **The premise is
> false: SDK 1.0.0 *does* model the field**, in both the `Service` type (`models/service.ts:1505`) and
> `Service$inboundSchema`. The cast was never covering an SDK gap — it was covering nothing — so the fix is
> typed access, one line, with a comment saying so. **CIMD-W3 ✅ closed**, and it never needed to wait on the
> `SPIFFE_JWT` decision. `00-inventory.md` §7 and this paragraph both took the cast as evidence *of* a gap,
> which is the same reasoning error as reading a lab's own `UNVERIFIED` marker as evidence about the deployment
> (`04-remediation-plan.md` §6.2): **a cast is evidence that somebody thought there was a gap.**
>
> The second mechanism is also closed — `service.get()` parses since `SPIFFE_JWT` was withdrawn, and both
> endpoints report `clientIdMetadataDocumentSupported: false` from the live service. So the deployment *can*
> now report its CIMD posture, and the posture it reports is "off", which is CIMD-W2's decision to make.

**(b) The `MUST NOT follow redirects` rule is delegated and unverified.** Draft-02 requires the AS not to follow
HTTP redirects when fetching a Client ID Metadata Document — a defence against an attacker parking a URL that
redirects to someone else's metadata. Authlete performs the fetch, so this is entirely vendor behaviour; nothing
in this repo can test it, and Authlete's CIMD page (fetched in Phase 1) does not state it. Recorded as a
**delegated MUST with no local evidence**, in the same spirit as RFC 9449 §7.2's delegation at UserInfo — the
difference being that §7.2 was verified live and this cannot be until the flag is on.

## Finding F-3 — the cited draft revision is stale (S4)

| Source | Revision | Date |
|---|---|---|
| `datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/`, fetched this session | **-02** | **6 July 2026** |
| `SPEC-INVENTORY.md` | **-01** | — |
| MCP authorization spec (fetched this session) references | **-00** | — |

For an **active** Internet-Draft this matters more than for a published RFC: drafts change normative text between
revisions, and `docs/curriculum/README.md:116-122` promises drafts are labelled by revision precisely so a reader
knows which text is meant. `00-inventory.md` §10 identified `draft-ietf-oauth-client-id-metadata-document-01` as
the *one* genuinely missing inventory row — so the row needs creating **and** bumping in the same edit.

Worth noting for the curriculum: the MCP specification currently cites **-00**, so a learner comparing the two
documents will see three different revisions referenced across the repo, the MCP spec, and the WG. That is a
teachable fact about drafts rather than an error, if stated.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "Authlete handles CIMD entirely server-side … No new endpoints or client code needed" | `AGENTS.md` | Confirmed against the SDK and the Authlete page | **Accurate** |
| `clientIdMetadataDocumentSupported: false` recommended, *"Set `true` only if targeting MCP"* | `AGENTS.md` flags table | Matches the live value | **Accurate** |
| "this server supports MCP flows out of the box" | `docs/MCP-OAUTH-TUTORIAL.md` | Depends on a flag that is off; CIMD is a SHOULD, so partly defensible — see `MCP-OAUTH.md` | `DOC_INCORRECT` / S3 |
| Cited as `draft-ietf-oauth-client-id-metadata-document-01` | `SPEC-INVENTORY.md` | Current is **-02** (6 Jul 2026) — F-3 | `DOC_INCORRECT` / S4 |
| Cited by `modules/09a…/quiz.md` with **no inventory row** | `00-inventory.md` §10 | Confirmed still the case | **Omission** / S4 |
| Authlete requires **3.0.22+** | `01-spec-matrix.md` §2 | Carried from the Authlete page; the live patch level is unknown, so enabling the flag may or may not be possible | **Unverified prerequisite** / S4 |

## Sources consulted

- `draft-ietf-oauth-client-id-metadata-document`, revision **-02**, 6 July 2026 — `https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/`, fetched this session. Quoted: the 200-only rule, *"NOT automatically follow HTTP redirects"*, the `client_id`-matches-URL validation, the URL constraints, the caching rules, and `client_id_metadata_document_supported`.
- MCP authorization specification (its CIMD position and the `-00` citation) — `https://modelcontextprotocol.io/specification/draft/basic/authorization`
- Live probes 1 and 3 (2026-08-10): `clientIdMetadataDocumentSupported`, and `client_id_metadata_document_supported` absent from discovery — `SERVICE-CONFIG-PROBE.md` §2, §8
- Phase 1: `01-spec-matrix.md` §2 (Authlete 3.0.22 floor, server-side handling, ≤86,400 s cache)
- Code: `controllers/fapi.controller.ts:31-33,79-81`, `client/src/services/mcp.service.ts` (`fetchCimdMetadata`), SDK `cimdOptions` on `models/authorizationrequest.ts` and `models/tokenrequest.ts`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| CIMD-W1 | Create the missing inventory row at revision **-02** | S | ✅ **DONE 2026-08-14 (T2-5).** Fetched `datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/`; *"OAuth Client ID Metadata Document"*, Active Internet-Draft, revision **02**, **6 July 2026**, expires 7 Jan 2027 — revision and date confirmed exactly, one of only four criteria in this batch that needed no correction. Row added to §4 beside RFC 7591/7592, carrying all five elements asked for: draft name, revision, date, status, the **Authlete 3.0.22 floor** and the **MCP-cites-`-00`** note. **One thing the criterion could not have known:** it was written while the flag was off, and **DR-05 enabled `clientIdMetadataDocumentSupported` on 2026-08-14**, so the row states the feature is live rather than prospective. The accompanying note makes the three-revision point explicit — the draft is at `-02`, MCP pins `-00`, Authlete gates on 3.0.22 — because *"CIMD is supported"* is three non-interchangeable claims. The note also states draft-02's **no-redirect rule** as a delegated MUST, matching RFC 9449 §7.2's treatment — but **CIMD-W4 stays open**, since its criterion names `AGENTS.md` and that line is not written. |
| CIMD-W2 | Decide whether to enable the flag | S | **Gate 4 decision, paired with the MCP verdict.** If enabled: confirm the service's patch level meets 3.0.22, then an HTTPS-URL `client_id` completes an authorization and `client_id_metadata_document_supported` appears in discovery. If not: `MCP-OAUTH-TUTORIAL.md` stops saying "out of the box". |
| CIMD-W3 | Stop reading the flag through an untyped cast | S | ✅ **DONE 2026-08-12 (T1-5).** Neither branch of the stated criterion applied: **the SDK already had the field**, in the `Service` type and the inbound schema both, so the cast came out and the read is typed. The acceptance criteria were written from the cast's existence rather than from the SDK — see the correction under F-1(a). It did **not** need to ride with the `SPIFFE_JWT` decision. |
| CIMD-W4 | Record the redirect rule as a delegated MUST | S | One line in `AGENTS.md`: draft-02 forbids following redirects when fetching a CIMD document, Authlete performs the fetch, and this deployment has no way to verify it. Same treatment as RFC 9449 §7.2's delegation. |

**Ordering.** CIMD-W1 is documentation and independent. CIMD-W2 pairs with the MCP decision. ~~CIMD-W3 waits on the
`SPIFFE_JWT` decision in B7, because both touch the same broken call.~~ **CIMD-W3 ✅ shipped 2026-08-12** — the
dependency was imaginary, since the two changes touch the same *file* and not the same defect.
