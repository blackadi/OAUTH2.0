# Grant Management for OAuth 2.0

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Status:** **Active Internet-Draft** `oauth-v2-grant-management-03`, **9 May 2023** — re-verified against the primary source this session
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/GRANT-MANAGEMENT.md`, `docs/curriculum/modules/10-fapi-and-grant-management/`, `AGENTS.md` Grant Management paragraph, `README.md` feature table

<thinking>
1. Requirements on the AS: §5.2 — `grant_management_action` (`create`/`merge`/`replace`) and `grant_id` on the
   authorization request; §5.5 — the AS must return `grant_id` in the token response when an action was
   requested; §6.4 — query is `GET {endpoint}/{grant_id}` with a `grant_management_query`-scoped bearer token;
   §6.5 — revoke is `DELETE`, answering 204 with an empty body, and *"The AS MUST revoke the grant and all
   refresh tokens issued based on that particular grant, it should revoke all access tokens issued based on that
   particular grant."* §7.1 — three metadata parameters. §5.1 — *"Grant management is restricted to confidential
   only clients due to security reasons."*
2. Authlete boundary: `grantManagement.processRequest` with `gmAction` `QUERY`/`REVOKE` for the management API;
   `create`/`replace`/`merge` are authorization-request-side and ride inside `parameters`, so they need no AS
   code — the same shape as JARM. Authlete does **not** check grant ownership, and its response carries no owner
   information.
3. Code: the management API is implemented well — correct methods, correct scopes, `responseContent` returned
   verbatim, and a purpose-built ownership middleware that closes a real vulnerability Authlete leaves open.
   Two problems: a duplicated bearer parser, and the authorization-request side is neither exercised nor
   documented while the AS advertises all five actions.
4. Docs: `AGENTS.md` describes the ownership middleware and its deliberate strictness precisely. `PROGRESS.md`
   records the revocation finding with unusual precision.
5. Delta: (a) revocation leaves access tokens alive 24 h — a SHOULD, not a MUST, and its severity comes from the
   token lifetime; (b) five actions advertised, two implemented, three undocumented; (c) §5.1's
   confidential-clients-only restriction is not enforced and two of three clients are public.
6. The repo's own finding #2 is stated so carefully that my job is to confirm it rather than restate it. What is
   new is §5.1 and the advertised-actions gap.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `grant_management_action` = `create` / `merge` / `replace` on the authorization request | §5.2 | ⊘ Authlete's, inside `parameters` — **never exercised or documented** — F-2 |
| 2 | Accept `grant_id` on the authorization request | §5.2 | ⊘ Authlete's; snake_case `grant_id` appears nowhere in `server/src` (`00-inventory.md` §6) — correct, but see F-2 |
| 3 | Return `grant_id` in the token response when an action was requested | §5.5 | ⊘ Authlete's; `token.controller.ts:52` forwards `responseContent` verbatim, so this would work — unverified |
| 4 | Query: `GET {endpoint}/{grant_id}`, `grant_management_query` scope, bearer token | §6.4 | ✅ `routes/grant-management.routes.ts:11`; scope enforced via introspection (`middleware/require-grant-ownership.ts:62`) |
| 5 | Revoke: `DELETE`, 204 with an empty body | §6.5 | ✅ `routes/grant-management.routes.ts:16`; `NO_CONTENT` → 204 empty (`controllers/grant-management.controller.ts:30-31`) |
| 6 | Revoke **MUST** kill the grant and all refresh tokens | §6.5 | ✅ **verified live** — `[A053305] The refresh token … does not exist.` |
| 7 | Revoke **should** kill all access tokens | §6.5 | ❌ access token stays `active: true` for 24 h — F-1 |
| 8 | Advertise `grant_management_endpoint`, `grant_management_action_required`, `grant_management_actions_supported` | §7.1 | ✅ all three live — but the third advertises five actions — F-2 |
| 9 | *"Grant management is restricted to confidential only clients"* | §5.1 | ❌ not enforced; two of three clients are public — F-3 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| `create` / `replace` / `merge` on the authorization request | Authlete, opaque passthrough | no AS code needed |
| Minting and returning `grant_id` | Authlete | `responseContent` on the token response |
| Query / revoke execution | Authlete | `grantManagement.processRequest` |
| **Checking that the caller owns the grant** | **This server** — Authlete does not do it, and its response carries no owner data | `middleware/require-grant-ownership.ts` |
| Scope enforcement | Authlete, at this server's request | `introspectionRequest.scopes = [requiredScope]` (`:62`) |
| Returning the §6.4 body | **This server** | `controllers/grant-management.controller.ts:26` — `responseContent` verbatim ✅ |

## What this spec gets right, and it is the strongest object-level control in the repo

`middleware/require-grant-ownership.ts` introspects the presented token *before* the grant-management call and
requires `result.grantId === req.params.grantId`, returning 403 otherwise. The file's own comment records why:

> Authlete's /gm API validates the access token (signature, expiry, scope) but does NOT check that the grant
> being addressed belongs to the caller … Without this, any holder of a `grant_management_revoke` token could
> enumerate grant IDs and read or destroy every other user's grant. **That was verified end to end: one user's
> token deleted another's.**

Three details are right that are easy to get wrong: it fails closed on an introspection error (`:78-82`); a
token with no grant and a token bound to a different grant get an *identical* response, so the endpoint is not
an existence oracle (`:110-124`); and the deliberate departure from the spec — a client-credentials token has no
grant, so machine-to-machine grant management is refused — is documented in both the code and `AGENTS.md`.
`docs/GRANT-MANAGEMENT.md` and the `AGENTS.md` paragraph both describe this accurately.

## Finding F-1 — revocation leaves access tokens alive for 24 hours (S2, confirmed from the repo's own evidence)

`PROGRESS.md:359-367` records this from a live Module 10 run: after `DELETE /api/gm/<grant_id>` → 204, the
grant's refresh token is gone (`[A053305]`) but its access token still introspects `active: true` with ~24 hours
remaining.

**I confirm the analysis and the precision of its framing.** §6.5, verbatim from the draft fetched this session:
*"The AS MUST revoke the grant and all refresh tokens issued based on that particular grant, it should revoke
all access tokens issued based on that particular grant."* So the MUST is satisfied and the SHOULD is not — not
a MUST violation, and the register says so explicitly rather than inflating it.

What makes it S2 is the interaction the register also names: `accessTokenDuration = 86400` (confirmed by probe
3). A tolerable SHOULD-gap on a 5-minute token becomes a 24-hour window in which a user who has withdrawn
consent is still exposed. The register's conclusion — *"Cheapest remediation is to shorten the lifetime, not to
implement access-token revocation"* — is right, and it is the same lever as `OIDC-W4`.

One addition: this is an Authlete-side behaviour, not a repo defect. `grantManagement.processRequest` with
`gmAction: "REVOKE"` is the only call available, and the repo makes it correctly. If the SHOULD is to be
satisfied locally, it would mean listing the grant's access tokens and deleting each — `token.management.list` +
`delete` exist — which is materially more work than shortening a lifetime, for a SHOULD.

## Finding F-2 — the AS advertises five grant-management actions and exercises two (S3)

Probe 3:

```
grant_management_actions_supported = ["create", "merge", "query", "replace", "revoke"]
grant_management_action_required   = false
grant_management_endpoint          = https://…/api/gm
```

The repo implements the **management API** half — `query` and `revoke` — and nothing on the
**authorization-request** side. `01-spec-matrix.md` §6 identified this precisely: `GrantManagementAction`'s
`CREATE`, `REPLACE` and `MERGE` members are unused, and snake_case `grant_management_action` and `grant_id`
appear nowhere in `server/src`.

**The important nuance, which changes the remedy:** those three actions need **no AS code**. Like JARM, they
ride inside the opaque `parameters` string, Authlete processes them, and §5.5's `grant_id` comes back in the
token response — which `token.controller.ts:52` already forwards verbatim. So this is very likely a
*documentation and verification* gap rather than an implementation gap: the flow may already work and has never
been tried.

That distinction matters because the naive reading ("three actions unimplemented") would schedule code work
that is probably unnecessary. **Named next action:** one authorization request with
`grant_management_action=create`, then read the token response for `grant_id`, then `GET /api/gm/{grant_id}`.
Three commands settle whether the authorization-request side works, and they would turn Module 10's grant
material from half a feature into the whole one.

## Finding F-3 — §5.1's confidential-clients-only restriction is not enforced (S3)

The draft, §5.1: *"Grant management is restricted to confidential only clients due to security reasons."*

On this deployment: `grant_management_query` and `grant_management_revoke` are in the service's
`scopes_supported` (probe 2), and of the three registered clients **two are `PUBLIC` with
`tokenAuthMethod: NONE`** (probe 2 §7). Nothing in `require-grant-ownership.ts` or in the service configuration
restricts these scopes to confidential clients, so a public client can be granted them.

The practical exposure is limited by the ownership middleware — a public client's token still cannot touch
another grant — so this is S3, not S2. But the draft's restriction exists because a public client cannot keep a
secret, and a grant-management token in a public client is a revocation capability sitting in a browser or a
mobile binary. Authlete's scope model can restrict a scope to particular clients; nothing here does.

## Finding F-4 — a second, divergent bearer-token parser (S4)

`services/grant-management.service.ts:47-53` defines its own `extractBearerToken`, distinct from the exported one
at `middleware/require-grant-ownership.ts:27-33`. Both are case-sensitive on `"Bearer "`, contrary to
RFC 9110 §11.1; the middleware's version trims and rejects an empty remainder, the service's does not.

This is the third bearer/Basic parser in the codebase, and `AGENTS.md` already has a rule for exactly this:
*"Do not hand-roll `authorization.split(":")` again."* The DPoP work item **9449-W3** replaces the middleware's
parser with `extractAccessToken()` from `utils/dpop.ts`; the service's copy should go the same way in the same
change. Note that neither accepts the `DPoP` scheme, which is the substance of `RFC9449-dpop.md` F-2.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Draft revision `-03`, 9 May 2023 | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §2 | **Confirmed** against `openid.net/specs/oauth-v2-grant-management-03.html` this session | **Accurate** |
| `requireGrantOwnership` runs first, introspects, requires the grant to match, 403 otherwise; Authlete validates the token but not ownership | `AGENTS.md` | Matches the code exactly, including the reasoning | **Accurate — exemplary** |
| "deliberately stricter than Grant Management for OAuth 2.0: a client-credentials token has no grant, so machine-to-machine grant management is not supported" | `AGENTS.md` | Correct, and correctly labelled as a departure | **Accurate** |
| Revocation leaves access tokens alive 24 h; MUST satisfied, should not | `PROGRESS.md:359-367` | **Confirmed** against §6.5 verbatim | **Accurate — the most precisely-stated finding in the register** |
| Grant Management listed as **"Working"** | `README.md:92-130` | True of the half that is implemented; the AS advertises five actions and three are unexercised | **Accurate but incomplete** / S3 — F-2 |
| Nothing states that §5.1 restricts grant management to confidential clients | `docs/GRANT-MANAGEMENT.md`, `AGENTS.md`, Module 10 | F-3 | **Omission** / S3 |
| Nothing states that `create`/`replace`/`merge` need no AS code and may already work | Module 10, `GRANT-MANAGEMENT.md` | F-2 | **Omission** / S3 |

## Sources consulted

- Grant Management for OAuth 2.0, `oauth-v2-grant-management-03`, 9 May 2023 — `https://openid.net/specs/oauth-v2-grant-management-03.html`, fetched this session. Quoted verbatim: §5.2's three actions, §5.5's `grant_id` obligation, §6.4's query shape, **§6.5's MUST/should sentence**, §7.1's three metadata parameters, §5.1's confidential-client restriction.
- Live probes 2 and 3 (2026-08-10): `grant_management_endpoint`, `grant_management_actions_supported`, `grant_management_action_required`, `scopes_supported`, `accessTokenDuration`, per-client `clientType` — `SERVICE-CONFIG-PROBE.md` §6–§8
- SDK 1.0.0: `GMResponseAction` (7 members), `GrantManagementAction` (`CREATE, QUERY, REPLACE, REVOKE, MERGE`) — `01-spec-matrix.md` §6
- Repo-sourced live evidence: `PROGRESS.md:359-367` (revocation transcript, `[A053305]`)
- Code: `middleware/require-grant-ownership.ts` (whole file), `services/grant-management.service.ts:16-53`, `controllers/grant-management.controller.ts:15-55,77-100`, `routes/grant-management.routes.ts:11,16`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| GM-W1 | Shorten `accessTokenDuration` | S | The §6.5 SHOULD-gap stops being a 24-hour exposure. Same lever as **OIDC-W4**; console change. Preferred over implementing access-token revocation, per the register's own reasoning. |
| GM-W2 | Establish whether the authorization-request side already works | S | Three commands: `grant_management_action=create` → read `grant_id` from the token response → `GET /api/gm/{grant_id}`. Result recorded in Module 10 and in `PROGRESS.md`. **Do this before scheduling any code work** — the actions likely need none. |
| GM-W3 | Restrict the two grant-management scopes to confidential clients | S | Per §5.1. Either Authlete scope-to-client restriction, or a documented decision to allow public clients in a teaching deployment, with the draft's reasoning quoted. |
| GM-W4 | Remove the duplicate bearer parser | S | `services/grant-management.service.ts` uses the shared extractor; folded into **9449-W3** so both parsers are replaced in one change. |
| GM-W5 | Document the two halves and the advertised five actions | S | `docs/GRANT-MANAGEMENT.md` and Module 10 distinguish the management API from the authorization-request side, note that all five actions are advertised, and record GM-W2's result. |

**Ordering and gating.** GM-W2 first — it is three commands and it determines whether anything else is needed.
GM-W4 rides with 9449-W3, which touches `middleware/require-grant-ownership.ts` (on the **Security-critical
surfaces** list, under Access control) and therefore needs a plan. GM-W1 and GM-W3 are configuration.
