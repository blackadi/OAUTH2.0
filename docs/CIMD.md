# OAuth Client ID Metadata Document (CIMD)

- [What is CIMD?](#what-is-cimd)
- [Why Authlete implements this entirely server-side, and this server implements none of it](#why-authlete-implements-this-entirely-server-side-and-this-server-implements-none-of-it)
- [Metadata Document Requirements](#metadata-document-requirements)
- [Configuration Reference](#configuration-reference)
- [Where This Repo Uses It](#where-this-repo-uses-it)
- [Error Scenarios and Caveats](#error-scenarios-and-caveats)
- [Security Considerations](#security-considerations)
- [References](#references)

---

## What is CIMD?

CIMD lets a client identify itself with an HTTPS URL instead of a pre-registered `client_id`. **The URL *is* the
`client_id`, permanently, for every request that client ever makes — no new identifier is minted.** The client
publishes a JSON metadata document at that URL (name, redirect URIs, grant types, token endpoint auth method,
scopes, …), and the authorization server fetches it in place of a registration record the first time it sees
that client ID.

It solves the same problem RFC 7591 Dynamic Client Registration solves — a client showing up with no prior
registration — without a registration round trip, and without the authorization server having to hold a durable
secret for a client that has no safe place to keep one (an MCP client shipped as a local binary, for example).
CIMD clients are necessarily public: the metadata document may not declare `client_secret_basic`,
`client_secret_post`, `client_secret_jwt`, or a `client_secret` value at all. PKCE is what proves possession
instead.

---

## Why Authlete implements this entirely server-side, and this server implements none of it

This file is a **reference**, not a tutorial like `CIBA-TUTORIAL.md` or `DEVICE-FLOW-TUTORIAL.md` — there is no
flow of this server's own to walk through. `grep -rn "cimd" server/src -i` turns up exactly two hits: a doc
comment on `AuthorizationRequest`'s `cimdOptions` member (`services/authorization.service.ts`, never set) and a
boolean readout in `controllers/fapi.controller.ts` (below). **No route, no controller, no request/response
cycle belongs to this repo.**

The mechanism activates automatically, inside Authlete, whenever a `client_id` value begins with `https://` and
the service has `clientIdMetadataDocumentSupported: true`. Authlete fetches the URL, validates the metadata, and
registers the client — the authorization and token processing that follows is indistinguishable, from this
server's point of view, from a client that was pre-registered in the console. What CIMD actually changes is the
*shape `client_id` is allowed to take* wherever this server already forwards one to Authlete: the authorization
endpoint, the token endpoint, device authorization, CIBA. **Not** PAR — `PushedAuthorizationRequest` is the one
request type in the SDK with no `cimdOptions` member at all.

`cimdOptions` (on `AuthorizationRequest`, `TokenRequest`, `DeviceAuthorizationRequest` and
`BackchannelAuthenticationRequest`) is a *per-request override* of the service-level flags below — useful, for
example, to force Authlete to re-fetch a metadata document Authlete would otherwise still be treating as cached.
Nothing in `server/src` ever constructs one; every CIMD behaviour observable in this repo comes from the
service-level configuration alone.

---

## Metadata Document Requirements

Rules Authlete enforces on the `client_id` URL and the document it serves (per Authlete's CIMD documentation,
consulted 2026-09-08 — see [References](#references)):

| Rule | Detail |
|---|---|
| Scheme | `https` required, unless `cimdHttpPermitted` is set (service-level) or `httpPermitted` is set on the request (see [Configuration Reference](#configuration-reference)) |
| Path | A path component is required; it must not contain a `.` or `..` segment |
| Fragment / userinfo | Not allowed in the `client_id` URL |
| Query component | Discouraged; requires `cimdQueryPermitted` (service) or `queryPermitted` (per-request) |
| Self-consistency | The metadata document's own `client_id` field **must equal the URL it was fetched from** — this is the integrity check that stops a document meant for one client being served at (or redirected to) another's URL |
| Client authentication | `client_secret_basic`, `client_secret_post`, `client_secret_jwt`, and any `client_secret` field are prohibited — a CIMD client is necessarily public (or uses an asymmetric method; this repo has never exercised anything but the public case, so treat anything beyond that as `UNVERIFIED`) |
| Cache validity | Capped at 86400 seconds (1 day), regardless of what caching headers the document's own HTTP response sends |

---

## Configuration Reference

All flags live on the Authlete `Service`, not on a client. **Verified live against this deployment's own
service, 2026-09-08:**

| Flag | Purpose | This deployment |
|---|---|---|
| `clientIdMetadataDocumentSupported` | The master switch — without it, an `https://` `client_id` is just a normal (unregistered) client ID and the request fails the ordinary way | ✅ `true` — enabled 2026-08-14 (DR-05) |
| `cimdHttpPermitted` | Allow `http://` client IDs, not just `https://` — meant for local development, not recommended in production without an allowlist | `false` |
| `cimdQueryPermitted` | Allow a query component in the `client_id` URL | `false` |
| `cimdAllowlistEnabled` + `cimdAllowlist` | Restrict CIMD to a fixed set of hosts/URIs | `false` / unset — **any** syntactically valid HTTPS URL meeting the rules above is currently accepted, not a curated list |
| `cimdAlwaysRetrieved` | Force a re-fetch on every use instead of honoring the RFC 9111 HTTP-cache expiry stored from the last fetch | `false` — metadata is cached until it expires, same as any HTTP resource |
| `cimdMetadataPolicyEnabled` + `cimdMetadataPolicy` | Apply an [OpenID Federation 1.0 §6.1 metadata policy](https://openid.net/specs/openid-federation-1_0.html#name-metadata-policy) to fetched metadata before it is used | `false` / unset |

**Only the master switch is surfaced by this server**, and by two different endpoints in two different shapes:

- `GET /api/fapi/config` → `cimdSupported` — a computed boolean (`service.clientIdMetadataDocumentSupported === true`), `controllers/fapi.controller.ts:70`
- `GET /api/fapi/status` → `clientIdMetadataDocumentSupported` — the raw field, passed through as-is, `controllers/fapi.controller.ts:130-131`

The five refinement flags above are not reported anywhere in this repo — check them via the Authlete Console or
a direct `service.get()` call, not by asking this server.

**One caching subtlety worth knowing**, from the SDK's own documentation of `cimdAlwaysRetrieved`/
`alwaysRetrieved`: metadata retrieval happens only on the *initiating request of an authorization flow* — in the
authorization code flow that's the authorization request, not the later token request; in the client-credentials
flow, where the token request *is* the initiating request, that is where retrieval happens instead.

---

## Where This Repo Uses It

- **`MCP-OAUTH-TUTORIAL.md` Step 2 ("Client Registration (CIMD)") is the only place this repo exercises the
  mechanism**, and it runs entirely client-side — `client/src/services/mcp.service.ts`'s `fetchCimdMetadata()`,
  surfaced in `McpSection.tsx`'s CIMD Metadata tab. See that tutorial for the walkthrough; this file does not
  duplicate it.
- **That section previously misdescribed the mechanism.** It read *"Server: 'I've registered you as
  client_id: abc123'"* — implying CIMD mints a new opaque ID the way DCR does. It does not: the URL itself is
  the permanent `client_id`. Fixed alongside this document.
- **DR-05** (`audit/05-decision-records.md`) records why CIMD was enabled here: this deployment's discovery
  document has no `registration_endpoint` member (no RFC 7591 DCR advertised), so **CIMD is currently the only
  registration path open to an MCP client on this deployment.** DR-05 also separates that from a second,
  independent claim — "this deployment is MCP-conformant" — which CIMD alone does not establish; see
  [Error Scenarios and Caveats](#error-scenarios-and-caveats).

---

## Error Scenarios and Caveats

- **One of the draft's MUST NOTs is delegated to Authlete and cannot be verified here (CIMD-W4).**
  `draft-ietf-oauth-client-id-metadata-document-02` §3 requires the authorization server not to automatically
  follow HTTP redirects when fetching the metadata document — the attack it prevents is an attacker parking a
  URL they control, having it redirect to somebody else's real metadata, and getting registered as *that*
  client's `client_id` against *that* client's redirect URIs. **This deployment never performs the fetch —
  Authlete does, on our behalf — and nothing in any response tells us whether a redirect was followed.** The
  rule is neither met nor unmet by anything in this repo; it is inherited. Same treatment as RFC 9449 §7.2's
  downgrade check (`AGENTS.md`): delegation is only sound while the vendor holds up its end, and unlike §7.2 this
  one has **not** been probe-confirmed. `UNVERIFIED` against draft-02 §3.
- **CIMD being enabled does not make an "MCP-conformant" claim true.** MCP requires OAuth 2.1, and this
  deployment's `grant_types_supported` still advertises `implicit` and `password` — both retired by OAuth 2.1 —
  deliberately, for the curriculum modules that teach what OAuth 2.1 removed and why (`AGENTS.md`). DR-05 treats
  "CIMD enabled" and "MCP conformant" as two separate decisions on purpose; do not conflate them the way an
  earlier draft of `MCP-OAUTH-TUTORIAL.md` did.
- **No allowlist is active on this deployment.** With `cimdAllowlistEnabled: false`, any syntactically valid
  HTTPS URL that meets the shape rules above is eligible — not a pre-approved set of hosts. That is inherent to
  what CIMD is *for* (no pre-registration), not a misconfiguration, but it does mean the redirect-uri check,
  PKCE, and the shape rules above are carrying the security weight here, not a curated client list.

---

## Security Considerations

- **CIMD clients are necessarily public.** There is no secret to steal because the metadata document is
  forbidden from declaring one — PKCE (S256) is the only proof of possession available, and it is the control
  that actually protects the authorization code for a CIMD client.
- **The self-consistency check (the document's `client_id` must equal its own fetch URL) is the main
  anti-spoofing control this repo can see.** It stops a metadata document written for one URL from being
  attributed to another.
- **The redirect-following restriction is the control this repo cannot see** — see
  [Error Scenarios and Caveats](#error-scenarios-and-caveats). Do not write a test asserting it and do not claim
  conformance to draft-02 §3 from this codebase alone.
- **"No allowlist" is a trust decision, not a bug.** Anyone who can serve HTTPS content at a URL that passes the
  shape rules can identify as a "registered" client here. Whether that is acceptable depends entirely on what a
  CIMD client is authorized to do once registered — the same `redirect_uri`, scope, and consent checks that
  apply to every other client still apply to one identified this way.

---

## References

**Specification**

- [draft-ietf-oauth-client-id-metadata-document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
  — **Active Internet-Draft**, revision **02**, dated **6 July 2026**, expires **7 January 2027**, intended
  Standards Track. Consulted 2026-09-08.

**Authlete documentation** — vendor behavior, not normative spec.

- [OAuth Client ID Metadata Document (CIMD)](https://developers.authlete.com/protocols-and-flows/protocol-extensions/oauth-client-id-metadata-document-cimd)
  — the page this document is drawn from. States CIMD support since Authlete **3.0.22**. Consulted 2026-09-08.

**Internal**

- `audit/05-decision-records.md` → **DR-05** — the decision to enable CIMD on this deployment, and the separate
  ruling that qualifies the MCP conformance claim.
- `docs/agents/quirks.md` — CIMD-W4, the delegated redirect-following MUST NOT.
- `docs/curriculum/SPEC-INVENTORY.md` — CIMD's row in the full spec matrix, including the draft-revision
  mismatch between this table, the MCP specification (which cites `-00`), and Authlete's own 3.0.22 floor.
- [`MCP-OAUTH-TUTORIAL.md`](MCP-OAUTH-TUTORIAL.md) — the only place this repo exercises CIMD end to end.
