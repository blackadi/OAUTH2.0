# RFC 8414 — OAuth 2.0 Authorization Server Metadata · OIDC Discovery 1.0

Paired in one entry because this deployment serves **one document** at two paths from one handler
(`controllers/discovery.controller.ts:8`). Each spec gets its own verdict.

- **Verdict — RFC 8414:** `MISCONFIGURED`
- **Verdict — OIDC Discovery 1.0:** `MISCONFIGURED`
- **Severity:** **S2** for both
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md:114-127`, `docs/API.md`, `docs/MCP-OAUTH-TUTORIAL.md`, `modules/04-token-lifecycle-and-metadata/`

<thinking>
1. RFC 8414's MUSTs: §3 — the document MUST be available at a path formed by inserting the well-known
   string into the **issuer identifier** between host and path; §3.2 — 200 + `application/json`;
   §3.3 — the returned `issuer` MUST be identical to the issuer into which the well-known string was
   inserted, and *"If these values are not identical, the data contained in the response MUST NOT be
   used."* OIDC Discovery §4.1/§4.3 impose the same construction and the same identity check.
2. Authlete boundary: Authlete composes the whole document via `service.getConfiguration`. The
   **issuer value is service configuration**, and **where the document is served is entirely this
   server's routing.** So the conformance question is purely local: does the URL the document is served
   from match the issuer inside it?
3. Code: two routes, one handler. True root `/.well-known/oauth-authorization-server`
   (`oauth-as-metadata.routes.ts:9-13`) and `/api/.well-known/openid-configuration`
   (`discovery.routes.ts:6`). No `action` branching — always 200 (`discovery.controller.ts:13`).
4. Live probe: `issuer = https://blackadi.dev`. The document is retrievable at
   `http://localhost:3000/...`. Those are different hosts, so §3.3's identity check fails outright.
5. Delta: this is not a "path quirk". §3.3 makes the document **unusable** by a conforming client, and
   §4.3 says the same. The repo already labels it a non-conformance; what was missing was the concrete
   issuer value and the consequence.
6. Unsure: nothing. The probe supplied the missing fact.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | *"MUST make a JSON document … available at a path formed by inserting a well-known URI string into the authorization server's issuer identifier between the host component and the path component"* | RFC 8414 §3 | ❌ **Unmet** — served on `localhost:3000`, issuer is `https://blackadi.dev` |
| 2 | Same issuer-derived construction for `/.well-known/openid-configuration` | OIDC Discovery §4.1 | ❌ **Unmet** — served under an extra `/api` prefix *and* on a different host |
| 3 | Queried with HTTP `GET` | RFC 8414 §3.1 | ✅ `oauth-as-metadata.routes.ts:9`, `discovery.routes.ts:6` |
| 4 | *"A successful response MUST use the 200 OK HTTP status code and return a JSON object using the `application/json` content type"* | RFC 8414 §3.2 | ✅ see "What is correct" below |
| 5 | *"The `issuer` value returned MUST be identical to the authorization server's issuer identifier value into which the well-known URI string was inserted … If these values are not identical, the data contained in the response MUST NOT be used."* | RFC 8414 §3.3 | ❌ **Unmet — and this is the severe one** |
| 6 | *"MUST be identical to the Issuer URL that was used as the prefix to `/.well-known/openid-configuration`"* | OIDC Discovery §4.3 | ❌ **Unmet** |

## Finding F-1 — the discovery document is unusable by a conforming client (S2)

Live probe (`SERVICE-CONFIG-PROBE.md` §3.7): **`issuer = https://blackadi.dev`**.

The document is retrievable only at:
- `http://localhost:3000/.well-known/oauth-authorization-server` — correct *path*, wrong host
- `http://localhost:3000/api/.well-known/openid-configuration` — wrong host **and** wrong path

RFC 8414 §3.3 does not merely discourage this. It says that when the values differ, *"the data contained
in the response **MUST NOT** be used."* A conforming client is **required to discard** this document.

**Failure scenario, end to end.** A conforming client is given the issuer `https://blackadi.dev`. Per §3
it constructs `https://blackadi.dev/.well-known/oauth-authorization-server` and fetches it. Either it
404s, or — if that host is live — it returns something unrelated to this deployment. There is **no path**
by which a spec-following client discovers this authorization server. If an operator hands the client the
real URL out of band, §3.3 then obliges the client to reject the document because the `issuer` inside it
does not match the URL it came from.

So automated discovery is not degraded here, it is **non-functional**. Every client that works against
this deployment today does so because it was hand-configured.

**What `SPEC-INVENTORY.md` already gets right, and what it was missing.** Lines 114-127 correctly label
this a non-conformance against RFC 8414 §3 and OIDC Discovery §4.1/§4.3, and correctly say a conforming
client "cannot discover this authorization server at all." It says the document "declares an `issuer` on a
*different host* again" without naming it. The probe supplies the value, which turns a general statement
into a reproducible finding.

## Finding F-2 — OIDC Discovery is served only under `/api` (S2, same root cause)

`GET /api/.well-known/openid-configuration` (`routes/discovery.routes.ts:6`) is the **only** location.
Even if the host were right, §4.1's construction inserts the well-known string between host and path — it
never yields an `/api` prefix. RFC 8414's document, by contrast, *is* at the true root
(`app.ts:170`), so the two paths are non-conformant for different reasons: one host-only, one host + path.

Note the asymmetry is invisible from the code, because both routes call the same handler. Fixing the host
alone fixes RFC 8414 and leaves OIDC Discovery broken.

## Finding F-3 — the route comment misattributes the spec (S4)

`routes/oauth-as-metadata.routes.ts:7-8`:

```
// MCP spec (RFC 8414) requires /.well-known/oauth-authorization-server
// This serves the same OpenID Connect Discovery document for compatibility.
```

RFC 8414 is not "the MCP spec"; MCP *references* RFC 8414. Serving the OIDC Discovery document at the
RFC 8414 path is common and defensible — the member sets overlap heavily — but the second line is the more
useful caveat and it is stated as an aside. In a teaching repo the comment should say that the two specs
define overlapping-but-distinct documents and that this deployment deliberately serves one for both.

## What is correct

- **Content type.** I checked rather than assumed: `service.getConfiguration` is declared `Promise<{ [k: string]: any }>` and decoded with `M.json(200, z.record(z.any()))` (`src/funcs/serviceGetConfiguration.ts:178`), so it returns a **parsed object**. `res.status(200).send(object)` therefore emits `application/json`, satisfying §3.2. My initial hypothesis was that `pretty: true` produced a string served as `text/html`; that was wrong.
- **One handler, two paths** is the right structure — it makes drift between the two documents impossible.
- **`generalLimiter`** on the root route.
- **No action branching needed**: `getConfiguration` has no `action` field; SDK errors throw into the error handler.

## Related dead code (S4)

`controllers/protected-resource-metadata.controller.ts:23-25` defends against the discovery document
arriving *"as a JSON string or as an object"*. Given the SDK's typed object decoder, the string branch is
unreachable. Harmless, but the comment asserts a vendor behaviour that does not occur.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| The `/api` discovery prefix is a non-conformance against RFC 8414 §3 and OIDC Discovery §4.1/§4.3 | `SPEC-INVENTORY.md:114-127` | **Correct**, and correctly labelled after an earlier revision called it a "path quirk" | **Accurate** |
| "Labs must respect the `/api` path to work here; reviews must record it as a finding" | `SPEC-INVENTORY.md:126` | Exactly the right framing | **Accurate** |
| "this server supports MCP flows out of the box" | `docs/MCP-OAUTH-TUTORIAL.md` | MCP discovery starts from RFC 8414/9728 metadata. With §3.3 failing and `clientIdMetadataDocumentSupported = False`, an MCP client cannot discover or register here | `DOC_INCORRECT` / **S2** — a learner would ship an MCP integration that cannot bootstrap |
| "MCP spec (RFC 8414)" | `oauth-as-metadata.routes.ts:7` | Misattribution | `S4` |

## Sources consulted

- RFC 8414 §§3, 3.1, 3.2, 3.3 — `https://www.rfc-editor.org/rfc/rfc8414.html`
- OIDC Discovery §4.1/§4.3 — via `SPEC-INVENTORY.md`'s citation, corroborated by RFC 8414 §3.3's identical rule. **Not fetched directly this session** — see source gap
- Live probe: `service/get` → `issuer` (`SERVICE-CONFIG-PROBE.md`)
- Code: `controllers/discovery.controller.ts:8-20`, `services/discovery.service.ts:9-19`, `routes/discovery.routes.ts:6`, `routes/oauth-as-metadata.routes.ts:7-13`, `app.ts:152,170`
- SDK 1.0.0: `src/funcs/serviceGetConfiguration.ts:178`, `src/sdk/service.ts:106-115`

**Source gap.** OIDC Discovery 1.0 §4.1/§4.3 were **not fetched** from `openid.net` this session; the
requirement is carried from `SPEC-INVENTORY.md` (verified 2026-08-02) and corroborated by RFC 8414 §3.3's
equivalent rule. Fetch before the Phase 3 write-up, since OIDC Discovery is not on the §7 spot-check list
and should be.

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 8414-W1 | Decide the deployment's real issuer and make the document self-consistent | M | Either set the service `issuer` to the host that actually serves the document, or serve the document at the declared issuer. Then `issuer` == the prefix of the retrieval URL, and §3.3 passes. This is a **service-configuration** change plus possibly a deployment change, not only code. |
| 8414-W2 | Serve OIDC Discovery at the true root | S | `GET /.well-known/openid-configuration` at root, from the same handler. Keep the `/api` path as a documented alias so existing labs keep working. |
| 8414-W3 | Rewrite the route comment | S | States that RFC 8414 and OIDC Discovery are distinct overlapping documents and that one is served for both deliberately |
| 8414-W4 | Remove the dead string branch in the PRM controller, or justify it | S | Either deleted, or the comment cites the SDK type that makes it necessary |
| 8414-W5 | Correct `docs/MCP-OAUTH-TUTORIAL.md` | M | States the two preconditions MCP discovery needs here — a self-consistent issuer and `clientIdMetadataDocumentSupported = true` — and that neither holds on the reference service |

**Curriculum dependency.** `SPEC-INVENTORY.md:126` deliberately instructs labs to use the `/api` path.
8414-W2 adds a root path without removing that one, so labs keep passing — but Module 04's metadata
exercises should be updated to make the learner *observe* the §3.3 mismatch, since that is a better lesson
than routing trivia. Check with `grep -rn "well-known" docs/curriculum/modules` before landing.
