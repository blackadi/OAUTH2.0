# Model Context Protocol — Authorization (OAuth 2.1 profile)

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Status:** MCP specification, **`draft`** revision as served at `modelcontextprotocol.io/specification/draft/basic/authorization` this session. Not an RFC or an OpenID Final; it profiles OAuth 2.1 (`draft-ietf-oauth-v2-1-13`) plus eight published specs.
- **Authlete version:** 3.0 — **no single Authlete page**; a composite of RFC 8414, 9728, 7636, 8707, 9207, 7591 and CIMD
- **Repo docs under test:** `docs/MCP-OAUTH-TUTORIAL.md`, `README.md`, `client/src/components/mcp/McpSection.tsx`, `client/src/services/mcp.service.ts`, `docs/curriculum/SPEC-INVENTORY.md`

<thinking>
1. Requirements, split by role. **On the AS:** implement OAuth 2.1; provide at least one of RFC 8414 or OIDC
   Discovery; SHOULD support CIMD; SHOULD emit `iss` and MUST advertise
   `authorization_response_iss_parameter_supported` if it does; MAY support DCR. **On the MCP server (RS):** MUST
   implement RFC 9728; MUST validate that tokens were issued for it as audience per RFC 8707 §2; MUST return
   401/403/400 appropriately; SHOULD put `scope` in the `WWW-Authenticate` challenge. **On the client:** MUST use
   PRM for AS discovery, MUST support both discovery mechanisms, MUST send `resource` in **both** the
   authorization and token requests, MUST validate `iss` per RFC 9207 §2.4, MUST NOT put tokens in a query string.
2. Authlete boundary: everything the AS side needs already exists — the discovery document, `iss`, PKCE, resource
   indicators, DCR. CIMD is a service flag. So the AS half is a configuration-and-composition question, not a
   coding one.
3. Code: the root RFC 8414 path is served; PRM is implemented; the SPA's MCP service tries both discovery paths
   and sends `resource` on the authorization request. Two client MUSTs are unmet.
4. Docs: `MCP-OAUTH-TUTORIAL.md` claims MCP works "out of the box", and is orphaned from both tutorial indexes.
5. Delta: the AS half is largely satisfied by other specs' compliance; the *client* half — which this repo also
   ships, and which the tutorial teaches — misses two MUSTs.
6. Care needed on one point: this repo is not an MCP server. There is no MCP transport here, so the RS-side
   requirements are aspirational rather than violated. Saying that precisely is most of the value of this entry.
</thinking>

## Scope: what this repo actually is, relative to MCP

MCP names three roles. This repo occupies two of them and not the third:

| MCP role | Who plays it here |
|---|---|
| Authorization server | **This repo's server** — the substantive audit target |
| MCP client (OAuth 2.1 client) | **This repo's SPA**, via `mcp.service.ts` + `McpSection.tsx`'s five-step wizard |
| MCP server / resource server | **Nobody.** There is no MCP transport, no tool surface, no `/mcp` endpoint |

So the RS-side MUSTs (implement RFC 9728, validate token audience, `WWW-Authenticate` with `scope`) have no
implementation to be measured against. The repo does ship an RFC 9728 document
(`controllers/protected-resource-metadata.controller.ts`, audited in B3) describing UserInfo as the protected
resource — which is the closest thing it has to an MCP server, and is not one.

## Normative requirements

| # | Requirement | Role | Status |
|---|---|---|---|
| 1 | Implement OAuth 2.1 with appropriate measures for confidential and public clients (**MUST**) | AS | ⚠️ **partly** — OAuth 2.1 folds in PKCE-always and forbids the implicit and password grants; this service enables `IMPLICIT` and `PASSWORD` and has `pkceRequired = false` (probe 1; `RFC9700-security-bcp.md`) — F-1 |
| 2 | Provide at least one of RFC 8414 metadata or OIDC Discovery (**MUST**) | AS | ✅ `GET /.well-known/oauth-authorization-server` at true root (`routes/oauth-as-metadata.routes.ts:9`), serving the discovery document |
| 3 | SHOULD support CIMD | AS | ❌ `clientIdMetadataDocumentSupported = false` — `CIMD-client-id-metadata-document.md` F-1 |
| 4 | MAY support DCR (deprecated, retained for compatibility) | AS | ✅ four DCR endpoints (B3), though `registration_endpoint` is **absent** from discovery (probe 3) — F-3 |
| 5 | SHOULD include `iss` in authorization responses; **MUST** advertise `authorization_response_iss_parameter_supported` if it does | AS | ✅ both — `iss` verified live, flag `true` (`RFC9207-issuer-identification.md`) |
| 6 | Access tokens **MUST NOT** be in a URI query string | client/AS | ✅ deliberately unsupported (`utils/dpop.ts:100-102`) |
| 7 | MCP servers **MUST** implement RFC 9728 | RS | ⊘ no MCP server exists; the AS ships a PRM document (B3) |
| 8 | MCP servers **MUST** validate that tokens were issued for them as audience (RFC 8707 §2) | RS | ⊘ n/a — and note the AS *can* audience-restrict: `resource` → `aud` verified live (`RFC8707-resource-indicators.md`) |
| 9 | Clients **MUST** use PRM for AS discovery | client | ✅ `mcp.service.ts:24-26` fetches `/.well-known/oauth-protected-resource` |
| 10 | Clients **MUST** support both discovery mechanisms | client | ✅ `mcp.service.ts:5-21` tries `/.well-known/oauth-authorization-server` then `/.well-known/openid-configuration` |
| 11 | Clients **MUST** use PKCE | client | ✅ `code_challenge` + `code_challenge_method=S256` (`mcp.service.ts:51-52`) |
| 12 | Clients **MUST** send `resource` in **both** authorization and token requests | client | ❌ **authorization only** — F-2 |
| 13 | Clients **MUST** validate `iss` per RFC 9207 §2.4 before sending the code to a token endpoint | client | ❌ absent — F-2 |
| 14 | 401 / 403 / 400 error mapping | RS | ⊘ n/a |

## Finding F-1 — "OAuth 2.1" is a MUST, and this service is configured against three of its rules (S2)

MCP §Overview: *"Authorization servers **MUST** implement OAuth 2.1 with appropriate security measures for both
confidential and public clients."* OAuth 2.1 consolidates the BCP-240 rules that RFC 9700 states normatively, and
`RFC9700-security-bcp.md` plus probe 1 establish that this service:

- enables the **implicit** grant (`IMPLICIT` in `supportedGrantTypes`; RFC 9700 §2.1.2 SHOULD NOT, removed in OAuth 2.1);
- enables the **password** grant (`PASSWORD`; RFC 9700 §2.4 MUST NOT, removed in OAuth 2.1) — and `PROGRESS.md:1959-1960` records a live transcript issuing a 24-hour access token and a 10-day refresh token from it;
- does **not require PKCE** (`pkceRequired = false`, `pkceS256Required = false`; `RFC7636-pkce.md` F-1), while OAuth 2.1 makes PKCE mandatory for all authorization-code clients.

For a teaching deployment that must demonstrate the retired grants, enabling them is a defensible choice — the
curriculum uses them as the "here is what was removed and why" exhibit. What is not defensible is claiming MCP
support on the same service, because MCP's first MUST is precisely that those things are not how the server
behaves. **The two goals are in direct conflict on one service**, and that is the finding: either MCP support is
scoped to a differently-configured service, or the claim is qualified.

## Finding F-2 — the SPA's MCP client misses two client-side MUSTs (S2)

**(a) `resource` is sent on the authorization request and not on the token request.**

```ts
// client/src/services/mcp.service.ts:54-55 — authorization request
if (params.resource) url.searchParams.set('resource', params.resource);

// :64-79 — token request
const body = new URLSearchParams({
  grant_type: 'authorization_code', code, client_id, redirect_uri, code_verifier,
});                                    // ← no `resource`, and none in the signature
```

MCP is explicit: the `resource` parameter *"**MUST** be included in both authorization requests and token
requests"*, and *"MCP clients **MUST** send this parameter regardless of whether authorization servers support
it."* Consequence on a conformant AS: the token request is unaudienced, so the issued token may carry a broader
`aud` than the authorization implied — the exact confused-deputy exposure RFC 8707 exists to close, and which
Module 04 Exercise 4 teaches by sending `resource` on **both** requests (`modules/04…/lab.md:163-172`). So the
lab does it correctly and the MCP service does not.

**(b) `iss` is never validated.** `mcp.service.ts` has no `iss` handling, and the callback that receives the code
(`client/src/pages/CallbackPage.tsx:38-40`) reads only `code`, `state`, `error`. MCP restates RFC 9207 §2.4 as a
client **MUST**, adds that the client must record the issuer *before* redirecting, and specifies the four-case
table for present/absent `iss` against `authorization_response_iss_parameter_supported`. None of that exists.
Since this AS advertises `authorization_response_iss_parameter_supported = true` and does emit `iss`, the client's
required action here is unambiguous: compare, and reject on mismatch.

This is the third client-side control the repo teaches and does not implement — with RFC 9207 §2.4 and OIDC Core
§5.3.2's `sub` check. All three are one work item (**OIDC-W3**).

## Finding F-3 — `registration_endpoint` is absent from discovery while four DCR endpoints exist (S3)

Probe 3: `registration_endpoint` does not appear among the 62 discovery members. MCP treats DCR as a **MAY** and
deprecated in favour of CIMD, so this is not an MCP violation — but MCP's client-registration flow selects among
CIMD, pre-registration and DCR by what the AS advertises, and this AS advertises **none** of the three
(`client_id_metadata_document_supported` absent, `registration_endpoint` absent). An MCP client following the
specification's selection priority has only pre-registration left, which for a `client_id` it does not already
hold means it cannot register at all.

Carried as a cross-reference: the DCR entry in B3 covers the endpoints themselves; this is the metadata half, and
it belongs to whichever fix advertises them.

## Finding F-4 — the MCP tutorial is orphaned and overclaims (S3)

`00-inventory.md` §9 records `docs/MCP-OAUTH-TUTORIAL.md` as **absent from both tutorial indexes while
`README.md`/`CHANGELOG.md` claim it shipped** — one of five orphaned documents. Its headline claim is *"this
server supports MCP flows out of the box"*.

Against this audit: the AS half is largely satisfied *by other specs' compliance* (discovery ✅, `iss` ✅, PKCE
available ✅, resource indicators ✅, DCR endpoints ✅) and contradicted on three OAuth 2.1 rules (F-1); CIMD is off;
and the client half misses two MUSTs (F-2). "Out of the box" is therefore wrong in a specific and fixable way, and
the tutorial is the one document a reader would use to try it.

The five-step wizard in `McpSection.tsx` (Discover → Register → Authorize with PKCE+Resource → Token → UserInfo)
is a genuinely good teaching artifact — it walks the real MCP discovery chain. Fixing F-2 makes it correct rather
than illustrative.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| ~~"this server supports MCP flows out of the box"~~ | `docs/MCP-OAUTH-TUTORIAL.md:3` **only** — ~~`README.md`~~ | F-1, F-2, CIMD off | ✅ **FIXED 2026-08-11 (T0-5)** — replaced by a three-row precondition table naming the OAuth 2.1 conflict, the issuer inconsistency and CIMD being off, plus the absent `registration_endpoint`. **Correction to this row: `README.md` never carried the claim** — it mentions neither MCP nor CIMD (`grep -rni "model context\|cimd" README.md` → nothing, checked 2026-08-11). The attribution here was wrong, which means **MCP-W3's `README.md` half is a no-op** and T0-5 closed the claim completely rather than partially |
| MCP listed as a shipped feature | `README.md` | Fourth member of the *claimed working, flag off* pattern (`NATIVE-SSO-1.0.md` F-1) | `DOC_INCORRECT` / S2 |
| `mcp.service.ts` "`buildAuthorizationUrl()` (PKCE S256 + RFC 8707 resource indicator)" and `exchangeCode()` | `AGENTS.md` | Accurate as written — and the accuracy is the problem: `resource` is described only on the authorization side, matching the code and missing the MUST | **Accurate but incomplete** / **S2** |
| `GET /.well-known/oauth-authorization-server` serves RFC 8414 metadata at root | `AGENTS.md`; `routes/oauth-as-metadata.routes.ts:9` | Confirmed. Note the asymmetry: the 8414 path is at true root while OIDC Discovery is only under `/api` (B3) | **Accurate** |
| "Requires CIMD enabled in Authlete (`clientIdMetadataDocumentSupported: true`)" | `AGENTS.md` MCP paragraph | **Correct and load-bearing** — states the prerequisite the tutorial's headline ignores | **Accurate** |
| Tutorial absent from both tutorial indexes | `00-inventory.md` §9 | Confirmed | **S4**, folded into F-4 |

## Sources consulted

- MCP Authorization specification, `draft` revision — `https://modelcontextprotocol.io/specification/draft/basic/authorization`, fetched this session. Quoted: the OAuth 2.1 MUST, the discovery-mechanism MUST, the CIMD SHOULD, the RFC 9728 MUST for MCP servers, the `iss` SHOULD plus the `authorization_response_iss_parameter_supported` MUST, the RFC 9207 §2.4 client validation table, the resource-parameter MUSTs (*"included in both authorization requests and token requests"*, *"regardless of whether authorization servers support it"*), the token-usage rules, and the 401/403/400 table.
- RFC 8707 §2, RFC 9207 §2.4, RFC 9728, RFC 7636 — as cited in the corresponding audit entries
- Live probes 1–3 (2026-08-10): `supportedGrantTypes`, `pkceRequired`, `clientIdMetadataDocumentSupported`, `authorization_response_iss_parameter_supported`, `registration_endpoint` — `SERVICE-CONFIG-PROBE.md` §2, §8
- Code: `routes/oauth-as-metadata.routes.ts:9`, `client/src/services/mcp.service.ts:5-21,24-26,39,51-55,64-79`, `client/src/pages/CallbackPage.tsx:38-40`, `controllers/protected-resource-metadata.controller.ts`, `utils/dpop.ts:100-102`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| MCP-W1 | Send `resource` on the token request | S | `exchangeCode` takes and sends `resource`; the wizard's token step shows it; the resulting token's `aud` is checked via introspection, mirroring `modules/04…/lab.md:180-184`. **Smallest fix with a real MUST behind it.** |
| MCP-W2 | Validate `iss` in the MCP client and the callback | M | Same work item as **OIDC-W3** / **9207-W1**: record the issuer before redirecting, then apply MCP's four-case table. |
| MCP-W3 | Qualify or scope the "out of the box" claim | S | The tutorial states plainly which MCP requirements this deployment meets, which it does not (OAuth 2.1 grant configuration, CIMD off), and that the retired grants are enabled deliberately for teaching. Then link it from both tutorial indexes. |
| MCP-W4 | Advertise a registration mechanism | S | Either `client_id_metadata_document_supported` (CIMD-W2) or `registration_endpoint`, so an MCP client has a registration path. Configuration, not code. |
| MCP-W5 | Decide whether MCP support is a claim this service can make | S | **Gate 4 decision.** A teaching service that must demonstrate implicit and password grants cannot simultaneously claim OAuth 2.1 conformance. Options: qualify the claim (cheapest), or document a second service configuration profile for MCP. |

**Ordering.** MCP-W1 is a few lines and independent. MCP-W2 rides with OIDC-W3. MCP-W5 frames W3 and should be
decided first at Gate 4. No server-side code change is proposed — the AS-side gaps are configuration and claims.
