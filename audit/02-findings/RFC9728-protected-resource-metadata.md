# RFC 9728 — OAuth 2.0 Protected Resource Metadata

- **Verdict:** `PARTIAL`
- **Severity:** S3
- **Authlete version:** 3.0 — **no vendor surface**; `llms.txt` has no page for RFC 9728, so this is entirely the AS's own document
- **Repo docs under test:** `AGENTS.md` (PRM bullet), `SPEC-INVENTORY.md:102,247`, `docs/DEVELOPMENT.md`, `modules/04`, `modules/09a`

<thinking>
1. RFC 9728's MUSTs: §2 — `resource` is the only REQUIRED member; `authorization_servers`,
   `bearer_methods_supported` OPTIONAL, `scopes_supported` RECOMMENDED; `bearer_methods_supported` values
   are `header`/`body`/`query` mapping to RFC 6750 §2.1/§2.2/§2.3. §3 — the document MUST be at a URL formed
   by inserting the well-known string into the **resource identifier** between the host and *the path
   and/or query components, if any*. §3.2 — 200 + `application/json`.
2. Authlete boundary: none. Authlete does not implement RFC 9728, so every requirement is local. The
   implementation derives its values from the live discovery document, which is a good design choice.
3. Code: `protected-resource-metadata.controller.ts` is careful — it enforces the REQUIRED member and
   returns 500 rather than emit a document without it, sets `no-store`, and uses `.type("application/json")`.
4. Docs: `AGENTS.md` describes it accurately, including the 500-rather-than-emit decision.
5. Delta: two real gaps. The §3 path-insertion rule is not honoured when the resource identifier has a
   path — which is the default case here, because `resource` defaults to the UserInfo endpoint. And
   `bearer_methods_supported` understates what the server accepts.
6. Unsure: whether the deployment intends `resource` to be the UserInfo endpoint or the issuer. The code
   prefers UserInfo; that choice is what triggers the §3 path problem.
</thinking>

## Normative requirements

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | `resource` — *"REQUIRED. The protected resource's resource identifier"* | §2 | ✅ enforced; 500 rather than emitting a document without it — `controllers/protected-resource-metadata.controller.ts:35-40` |
| 2 | `authorization_servers` OPTIONAL | §2 | ✅ `:44` |
| 3 | `scopes_supported` RECOMMENDED | §2 | ✅ `:48-50`, only when the discovery document actually has it |
| 4 | `bearer_methods_supported` values from `header`/`body`/`query` | §2 | ⚠️ hardcoded `["header"]`; the server also accepts `body` — see F-2 |
| 5 | *"MUST make a JSON document … available at a URL formed by inserting a well-known URI string into the protected resource's resource identifier between the host component and the path and/or query components, if any"* | §3 | ❌ **Unmet when `resource` has a path** — see F-1 |
| 6 | *"A successful response MUST use the 200 OK HTTP status code and return a JSON object using the `application/json` content type"* | §3.2 | ✅ `:59` — `.status(200).type("application/json").json(metadata)` |
| 7 | Normal HTTP caching applies | §7.10 | ✅ `Cache-Control: no-store` at `:58` — conservative but valid |

## Finding F-1 — the well-known URL ignores the resource identifier's path component (S3)

§3 requires the well-known string to be inserted **between the host and the path**, so a resource
identifier with a path yields a path-suffixed metadata URL.

The default `resource` here is the **UserInfo endpoint** (`:30-33`):

```
const resource =
  protectedResource.resource ||
  (discovery?.userinfo_endpoint as string | undefined) ||
  (discovery?.issuer as string | undefined);
```

So `resource` is typically something like `https://<host>/api/userinfo` — an identifier **with a path**.
Per §3 the document must then be served at:

```
https://<host>/.well-known/oauth-protected-resource/api/userinfo
```

The route serves only the bare form (`routes/protected-resource-metadata.routes.ts:8`):

```
https://<host>/.well-known/oauth-protected-resource
```

**Failure scenario.** An RFC 9728 client holding the resource identifier `https://host/api/userinfo`
constructs the path-suffixed URL per §3, requests it, and gets the SPA catch-all
(`routes/default.routes.ts:6`) — **HTTP 200 with HTML**. That is precisely the failure mode the
controller's own doc comment (`:12-13`) says it was written to prevent: *"the SPA catch-all answered the
path with 200 and HTML, which is worse than a 404 because a discovering client sees success."* The fix
closed that hole for the bare path and left it open for the path-suffixed form the spec actually
prescribes for this resource identifier.

Two clean resolutions, both cheap:
- Register the path-suffixed route as well, or
- Set `PROTECTED_RESOURCE_IDENTIFIER` to a **path-less** resource identifier (e.g. `https://<host>`), for which the bare well-known URL is correct.

The second is a one-line env change and is probably right: this deployment stands in for a resource
server rather than being one, and a path-less identifier is the honest description.

## Finding F-2 — `bearer_methods_supported` understates what the server accepts (S4)

`:45` hardcodes `bearer_methods_supported: ["header"]`. But `utils/dpop.ts:125-129` accepts
`access_token` in a form-encoded body — RFC 6750 §2.2, which RFC 9728 §2 calls `"body"`.

The error direction is safe: a client reading `["header"]` uses the header, which works. But the document
is inaccurate, and a learner comparing metadata to behaviour finds a mismatch. Either advertise
`["header", "body"]`, or stop accepting the body method — the latter arguably better, since RFC 6750 §2.2
itself says the form method *"SHOULD NOT be used except in application contexts where participating
browsers do not have access to the `Authorization` request header field."*

## Finding F-3 — the document faithfully advertises a broken authorization server (S2, inherited)

`:44` sets `authorization_servers: [discovery.issuer]`, which on the live service is
`["https://blackadi.dev"]` — a host from which no discovery document is retrievable
(`DISCOVERY-rfc8414-oidc-discovery.md` F-1).

This is **not a PRM defect**. Deriving the value from the live discovery document is exactly right, and it
is why the value cannot drift. The finding is recorded here because it shows how the discovery
misconfiguration propagates: a client that correctly finds the PRM document is then correctly pointed at
an authorization server it cannot discover. Fixing 8414-W1 fixes this row with no PRM change.

## What is exemplary

- **It refuses to emit a non-conformant document.** `:35-40` returns 500 when no `resource` can be determined, rather than shipping a document missing the sole REQUIRED member. That is the right trade and it is rare.
- **Values are derived from the live discovery document** (`:22-25, 44, 48-52`), so `scopes_supported` and `dpop_signing_alg_values_supported` cannot drift from what the AS actually advertises.
- **Served at the true root**, not under `/api` — the one metadata document in this repo that gets its location right.
- **Tested:** `tests/unit/routes/protected-resource-metadata.test.ts:26`, the only metadata endpoint with a dedicated test.
- The doc comment (`:6-17`) explains *why* the route exists, including the catch-all-returns-200 hazard.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| PRM served at true root; derives values from live discovery; returns 500 rather than emitting a document without the sole REQUIRED member | `AGENTS.md` PRM bullet | All three accurate | **Accurate** |
| RFC 9728 "✅ **Now served** at true root … Module 04's proposal is closed" | `SPEC-INVENTORY.md:102,247` | True for the bare path; §3's path-insertion rule for a path-bearing resource identifier is not met | **Accurate but incomplete** / S3 |
| `resource` "defaults to this deployment's UserInfo endpoint and is overridable with `PROTECTED_RESOURCE_IDENTIFIER`" | `AGENTS.md` | Accurate — and the default is what triggers F-1 | **Accurate**, consequence undocumented |

## Sources consulted

- RFC 9728 §§2, 3, 3.2, 7.10 — `https://www.rfc-editor.org/rfc/rfc9728.html`
- RFC 6750 §2.2 (the `body` method) — `https://www.rfc-editor.org/rfc/rfc6750.html`
- `llms.txt` — confirmed **no Authlete page** for RFC 9728; the `protected-resource` page was fetched and covers RFC 6749/6750/7662 only
- Code: `controllers/protected-resource-metadata.controller.ts:6-65`, `routes/protected-resource-metadata.routes.ts:8`, `config/app.config.ts:17-18`, `utils/dpop.ts:125-129`, `routes/default.routes.ts:6`
- Live probe: `issuer` (`SERVICE-CONFIG-PROBE.md`)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9728-W1 | Make the well-known URL match the resource identifier | S | Either set `PROTECTED_RESOURCE_IDENTIFIER` to a path-less identifier (preferred), or add the path-suffixed route. Test: constructing the §3 URL from the advertised `resource` returns the document, not the SPA catch-all. |
| 9728-W2 | Correct `bearer_methods_supported` | S | Either `["header","body"]`, or drop RFC 6750 §2.2 support and keep `["header"]`. Assert in the existing route test. |
| 9728-W3 | Note the §3 path rule in `AGENTS.md` | S | The PRM bullet states that the well-known URL depends on whether `resource` carries a path |
| — | `authorization_servers` | — | No PRM work. Closed by `8414-W1`. |
