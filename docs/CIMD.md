# OAuth Client ID Metadata Document (CIMD)

- [The short version](#the-short-version)
- [What is CIMD?](#what-is-cimd)
- [Why Authlete implements this entirely server-side, and this server implements none of it](#why-authlete-implements-this-entirely-server-side-and-this-server-implements-none-of-it)
- [Metadata Document Requirements](#metadata-document-requirements)
- [Configuration Reference](#configuration-reference)
- [Where This Repo Uses It](#where-this-repo-uses-it)
- [How to Test It](#how-to-test-it)
- [Error Scenarios and Caveats](#error-scenarios-and-caveats)
- [Security Considerations](#security-considerations)
- [References](#references)

---

## The short version

- **What it is:** a way for a client to say "I am `https://myapp.com/client.json`" instead of a
  pre-registered client ID — and to prove it by actually publishing that JSON at that URL.
- **Why use it:** it lets a client show up with *zero prior registration* and no client secret to manage
  — exactly the shape of an MCP client shipped as a local binary or browser app, which has nowhere safe to
  keep a secret anyway.
- **Where it's used here:** nowhere on the server side — Authlete does the fetching. In this repo it
  surfaces in one place: the MCP section's **CIMD Metadata** tab (a preview) and the Full Flow Wizard's
  Step 2 **CIMD URL** field (the real thing, sent to Authlete when you click Authorize). See
  [`MCP-OAUTH-TUTORIAL.md`](MCP-OAUTH-TUTORIAL.md) for the walkthrough.
- **How to create the URI:** host a JSON document at any HTTPS URL you control, where the document's own
  `client_id` field equals that exact URL, and the URL has a path (not just a bare origin), no query, no
  fragment, and no `client_secret*` fields. Full rules: [Metadata Document Requirements](#metadata-document-requirements).
- **How to test it:** [How to Test It](#how-to-test-it) below — includes a live, reproduced example of
  Authlete rejecting a bad one.

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

### Why This RFC Exists (Plain English)

Forget OAuth jargon for a second. Every authorization server needs to answer one question before it hands
out a token: **"do I know who's asking?"** The traditional answer is a phone book — someone (a developer, an
admin) fills out a form ahead of time, the AS writes down a `client_id` and usually a secret, and from then
on the AS looks the asker up in that phone book.

That works fine when there's a small, known set of apps. It breaks down for something like MCP, where the
whole point is that **any** AI tool, written by **anyone**, might want to connect to **any** MCP server it
has never talked to before — there is no admin who can pre-approve every combination, and a lot of these
clients (a CLI tool, a browser extension, a script someone downloaded) have nowhere safe to keep a secret
even if one were issued.

CIMD's answer: **stop keeping a phone book — let the client host its own entry, and just look it up live.**
Instead of registering in advance, the client says "I am this exact URL," and the URL itself serves the
same information a registration form would have collected. The AS fetches it the moment it is needed. No
admin step, no secret to protect, and it scales to strangers by design — which is exactly the trust model
MCP needs.

---

## Why Authlete implements this entirely server-side, and this server implements none of it

**How Authlete handles it, in one paragraph, before the detail below:** you never write code for this.
Authlete watches the `client_id` value on every request that reaches it. The moment that value starts with
`https://` **and** the service has `clientIdMetadataDocumentSupported: true`, Authlete itself — not this
server, not your code — fetches that URL, checks the document against the rules below, and treats the
client as registered for that one request and every one after it. If the fetch or the checks fail, Authlete
refuses the request and tells you why (see [How to Test It](#how-to-test-it) for a real, reproduced
example). That is the entire mechanism. This repository never sees the metadata document at all.

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

## How to Test It

Two things get confused a lot, so first, the one fact that matters more than any step below:

> **Previewing a document is not the same as testing CIMD.** The "CIMD Metadata" tab in this app's MCP
> section, and `fetchCimdMetadata()` (`client/src/services/mcp.service.ts`) behind it, do a plain browser
> `GET` on whatever URL you type in. That never reaches Authlete — it only checks the JSON is well-formed.
> **The only thing that actually tests CIMD is sending that URL to Authlete as a `client_id` in a real
> authorization request** — that is the one moment Authlete fetches and validates it (the SDK's own docs
> for `cimdAlwaysRetrieved`/`alwaysRetrieved` call this "the initiating request of an authorization flow").

### Option A — no coding, no terminal, just a browser (recommended if this is your first time)

You need two things: a place to host a small JSON file over HTTPS, and a browser. **GitHub Gist** is the
easiest free option and needs no server of your own.

1. **Go to [gist.github.com](https://gist.github.com)** and sign in (a free GitHub account is enough).
2. **Create a new Gist.** Filename: `client.json`. Content — paste this in as a placeholder for now:

   ```json
   {
     "client_id": "PLACEHOLDER",
     "client_name": "My Test Client",
     "redirect_uris": ["http://localhost:3001/callback"],
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"],
     "token_endpoint_auth_method": "none",
     "scope": "openid"
   }
   ```

   Click **Create secret gist** (or public — either works, CIMD doesn't care).
3. **Get the raw URL.** On the page GitHub just showed you, click the **Raw** button. Copy the URL from
   your browser's address bar — it looks like
   `https://gist.githubusercontent.com/<you>/<hash>/raw/<hash2>/client.json`.

   **This is the step people skip and then wonder why it fails:** the document's own `client_id` field
   must equal this exact URL (that's the self-consistency rule in
   [Metadata Document Requirements](#metadata-document-requirements)). So go back into the Gist, click
   **Edit**, replace `"PLACEHOLDER"` with the raw URL you just copied, and save. Copy the raw URL again
   (editing a Gist can change the hash in it) — that final URL is your CIMD URL.
4. **Build the test link.** Take this template and replace `YOUR_CIMD_URL_HERE` with the raw URL from
   step 3 (URL-encode it — replace every `:` with `%3A` and every `/` with `%2F`):

   ```
   http://localhost:3000/api/authorization?response_type=code&client_id=YOUR_CIMD_URL_HERE&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback&scope=openid&state=test123&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
   ```

   (Against the hosted reference deployment instead of your own machine, swap `http://localhost:3000` for
   `https://oauth2-0-ekh2.onrender.com` — but see the warning box in
   [`MCP-OAUTH-TUTORIAL.md`](MCP-OAUTH-TUTORIAL.md) first.)
5. **Paste the whole thing into your browser's address bar and press Enter.**
6. **Read the result — this is the entire point of the test:**
   - ✅ **You land on a login page** (a form asking for a username and password). That means Authlete
     fetched your Gist, accepted it as valid, and treated your Gist's URL as a real, working `client_id` —
     exactly as if you had registered it in the Authlete Console by hand. You don't need to actually log
     in for the CIMD test to count as passed; reaching this page *is* the pass.
   - ❌ **You see a raw text error on the page** instead, something like
     `{"error":"invalid_client_metadata", ...}`. Authlete rejected your document — see the field-by-field
     rules in [Metadata Document Requirements](#metadata-document-requirements) (self-consistency mismatch
     is the most common mistake — double-check step 3).

### Option B — using `curl`, for a raw look at the HTTP exchange

Same idea, scriptable, and useful for capturing the exact response body:

```bash
curl -s -G http://localhost:3000/api/authorization \
  --data-urlencode "response_type=code" \
  --data-urlencode "client_id=https://your-host.example/path/client.json" \
  --data-urlencode "redirect_uri=http://localhost:3001/callback" \
  --data-urlencode "scope=openid" \
  --data-urlencode "state=teststate" \
  --data-urlencode "code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" \
  --data-urlencode "code_challenge_method=S256"
```

**Reproduced live 2026-09-11** against this repo's own dev server — the success case first, using an
already-registered client (`4277838306`) as a stand-in for what a *valid* CIMD document also produces
(Authlete treats both identically once accepted):

```
HTTP/1.1 303 See Other
Location: /api/session/login?response_type=code&client_id=4277838306&redirect_uri=...
```

A `303` redirect to `/api/session/login` is success — a browser would show the login form. Then the
failure case, using a URL (`https://www.google.com/`) that does not serve CIMD JSON at all:

```json
{"error":"invalid_client_metadata","error_description":"[A505302] Failed to read the client's metadata document retrieved from 'https://www.google.com/': Invalid JSON","error_uri":"https://docs.authlete.com/#A505302"}
```

The result code `[A505302]` is Authlete naming the exact failure — proof it genuinely fetched the URL
rather than short-circuiting. A document that parses as JSON but fails the self-consistency check (its
`client_id` field doesn't match the fetch URL) or declares a forbidden client-secret method is expected to
fail the same way, with a different `error_description` — that specific case was not reproduced today, so
treat it as documented-but-`UNVERIFIED` against a live response until you've seen one.

### Once you've registered via the Wizard instead

The Full Flow Wizard (MCP section, below the three lookup tabs) does steps 4-6 above for you: paste your
CIMD URL into **Step 2 → CIMD URL**, click **CIMD (URL as client_id)** to preview it, then **Authorize** in
**Step 3** — that click is what actually sends it to Authlete. No URL-encoding or template-filling required.

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
