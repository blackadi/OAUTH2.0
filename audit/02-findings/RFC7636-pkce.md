# RFC 7636 — Proof Key for Code Exchange by OAuth Public Clients

> ## ✅ F-1 CLOSED IN BOTH HALVES — 2026-08-11 (FAPI2-W1) and 2026-08-12 (T1-5)
>
> F-1 had two independent defects and both are gone. The hardcoded `pkceRequired: true` literal was replaced
> with a live read (FAPI2-W1); the `service.get()` failure that made the live read unobservable was closed by
> withdrawing `SPIFFE_JWT` (T1-5). **`GET /api/fapi/config` now answers `"pkceRequired": false` — confirmed
> against the running server, not inferred.** So the "conformance theatre" this finding described is not merely
> corrected, it is **reversed**: the endpoint now reports the deployment's own failing control.
>
> **F-2 is closed as an observability matter too.** `pkceS256Required` is readable the same way; both flags are
> `false` (probe §2).
>
> **What remains is the substance, unchanged:** PKCE is **not required** on this service, which is what
> `RFC9700-security-bcp.md` F-1 and §2.1.1 turn on. **The severity ruling is Gate 4's question 1**, and its
> premise has now moved twice — the entry no longer contains any false claim, only an unenforced control. This
> banner deliberately does **not** downgrade the S1; that is the reviewer's call.

- **Verdict:** `MISCONFIGURED` *(was `IMPLEMENTED_UNVERIFIED`; changed by the live service probe, 2026-08-10 — see `SERVICE-CONFIG-PROBE.md`)*
- **Severity:** **S1** *(was S2)* — **F-1 closed; open on the unenforced control alone, pending Gate 4 Q1**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/PKCE-TUTORIAL.md`, `docs/curriculum/modules/03-pkce-and-public-clients/`, `README.md`, `docs/curriculum/SPEC-INVENTORY.md:92`

<thinking>
1. RFC 7636's AS-side MUSTs: §4.3–4.4 — the AS MUST associate `code_challenge` and
   `code_challenge_method` with the authorization code, and MUST return `invalid_request` if it does not
   support the requested transformation; §4.5–4.6 — at the token endpoint the AS recalculates the
   challenge from `code_verifier` and MUST return `invalid_grant` on mismatch; §4.1 — the verifier is
   43–128 unreserved characters; §7.2 — `plain` SHOULD NOT be used, and clients MUST NOT downgrade.
2. Authlete boundary: **all of it**. PKCE parameters ride inside the opaque `parameters` string, so this
   server never reads, validates or forwards them individually. The AS-side gates are
   `Service.pkceRequired` and `Service.pkceS256Required`, plus the same two as client metadata. The
   client half (generating the verifier and challenge) is in the SPA.
3. Code: confirmed by grep — `code_challenge`, `code_challenge_method` and `code_verifier` appear in
   `server/src` **only** in `routes/openapi.routes.ts:78,84,143` and `routes/routes-list.routes.ts:24,194`,
   i.e. documentation strings. No executable path touches them. That is correct architecture, not a gap.
4. Docs: `PKCE-TUTORIAL.md` and Module 03 teach it in depth, including the downgrade attack in both
   directions and the §4.1 charset bounds. `SPEC-INVENTORY.md:92` says "enforced by Authlete", which is
   accurate about where enforcement lives.
5. Delta: the conformance question is entirely "is the service configured to require it?" — and I cannot
   observe that, because `service.get()` throws. Worse, `/api/fapi/config` *asserts* `pkceRequired: true`
   from a hardcoded literal. So the repo reports a PKCE posture nobody has verified.
6. Unsure: the live values of `pkceRequired` / `pkceS256Required`. Resolvable by one live call to
   Authlete's `/service/get`, which is exactly the call that fails through the SDK — but would succeed
   via raw HTTP, since the failure is SDK-side Zod validation, not Authlete-side.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | AS MUST associate `code_challenge` and `code_challenge_method` with the authorization code | §4.3–4.4 | ⊘ Authlete's; rides inside `parameters` |
| 2 | If the AS does not support the requested transformation, it MUST return `invalid_request` | §4.4 | ⊘ Authlete's |
| 3 | At the token endpoint, recalculate the challenge from `code_verifier` and compare | §4.5–4.6 | ⊘ Authlete's |
| 4 | On mismatch, MUST return `invalid_grant` | §4.6 | ⊘ Authlete's |
| 5 | `code_verifier` is 43–128 unreserved characters | §4.1 | ⊘ Authlete's |
| 6 | `plain` SHOULD NOT be used; clients MUST NOT downgrade after trying `S256` | §7.2 | ⊘ Authlete's, gated by `Service.pkceS256Required` |
| 7 | *"Authorization servers MUST support PKCE"* | RFC 9700 §2.1.1 | ⊘ Authlete's — support is inherent; **requiring** it is configuration |

Every requirement is Authlete's. **That is the correct answer, not an evasion** — and it is precisely why
this spec's verdict turns entirely on configuration rather than code.

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Generating `code_verifier` / `code_challenge` | The client | `client/src/pkce.ts` (path confirmed 2026-08-10; `SPEC-INVENTORY.md:92` has it right) |
| Carrying the parameters to the AS | Opaque passthrough | inside `parameters` — `services/token.service.ts:42`, `services/authorization.service.ts:36` |
| Associating, recalculating, rejecting | Authlete | `authorization.processRequest`, `token.process` |
| **Requiring** PKCE / requiring S256 | Service + client configuration | `Service.pkceRequired`, `Service.pkceS256Required`; client `pkceRequired`, `pkceS256Required` (`services/client.management.service.ts:423-424`) |
| **Reporting** the posture | **This server** | `controllers/fapi.controller.ts:41,77` — broken, see F-1 |

Confirmed by grep: `code_challenge`, `code_challenge_method`, `code_verifier` appear in `server/src` only
as documentation strings (`routes/openapi.routes.ts:78,84,143`; `routes/routes-list.routes.ts:24,194`).
No executable path reads them. Correct by design.

## RESOLVED BY LIVE PROBE — the posture is now known, and it is off

`GET /api/{serviceId}/service/get`, 2026-08-10, raw HTTP, HTTP 200:

```
pkceRequired     = False
pkceS256Required = False
fapiModes        = <absent>
```

**PKCE is not required on this service, and S256 is not required either.** `controllers/fapi.controller.ts:41`
reports `pkceRequired: true`.

**Precision, because this is easy to overstate.** `pkceRequired = false` is *not itself* an RFC violation:

- RFC 9700 §2.1.1 requires the AS to **support** PKCE — it does, via Authlete.
- It requires the AS to **enforce** `code_verifier` *when a challenge was sent* — Authlete does.
- The MUST that says public clients **must use** PKCE binds *clients*, not the AS.

What `false` actually means is that a public client may **omit** PKCE and still receive an authorization
code. So the authorization-code interception attack that Module 03 is built around is open to any client
that simply does not send a challenge.

**Two consequences, and the second is the sharper one:**

1. **FAPI 2.0 makes PKCE with S256 mandatory.** `README.md` advertises FAPI 2.0 support. With `fapiModes` absent and `pkceS256Required = False`, there is no configuration behind that claim.
2. **The endpoint reports the opposite of the truth.** This is why the verdict is `MISCONFIGURED` at **S1** rather than a weak-posture note: the deployment does not merely have PKCE switched off, it *asserts* that PKCE is required. A reviewer using the repo's own reporting endpoint records a control that does not exist.

## Finding F-1 — the deployment reports a PKCE posture that is false (S1)

`controllers/fapi.controller.ts:41` returns **`pkceRequired: true`** from a hardcoded literal in
`GET /api/fapi/config`. The live value is read only at `:77` in `GET /api/fapi/status`, and both
endpoints call `authleteApi.service.get()` — which **throws**, because Authlete returns
`supportedTokenAuthMethods` containing `SPIFFE_JWT` and SDK 1.0.0's `ClientAuthMethod` is a strict
eight-member Zod enum with no such member (verified in `01-spec-matrix.md`; `SPIFFE` appears nowhere in
the SDK).

Net effect:

- `/api/fapi/status` — cannot report the real value; returns HTTP 200 with an error body and a stack trace.
- `/api/fapi/config` — reports `pkceRequired: true` **regardless of the truth**, because the literal is assembled before the throw matters.

**Failure scenario.** A reviewer follows Module 07's method — triangulate posture from advertised
metadata, stored configuration and observed behaviour — and queries `/api/fapi/config`. It answers
`pkceRequired: true`. If the service actually has `pkceRequired: false`, the reviewer records a passing
PKCE control on a deployment that does not enforce PKCE. This is the "conformance theatre" Module 07
teaches learners to recognise, produced by the repo's own reporting endpoint.

This is why the verdict is `IMPLEMENTED_UNVERIFIED` and the severity is S2 despite there being **no code
defect in the PKCE path itself**. The delegation is right; the observability is wrong and the fallback is
a fabricated `true`.

## Finding F-2 — `plain` versus `S256` cannot be confirmed either (S3)

§7.2 makes `plain` a SHOULD NOT, and `Service.pkceS256Required` is the flag that closes it.
`fapi.controller.ts` never reads `pkceS256Required` at all — it is absent from both the `config` literals
and the `status` reads. So the S256 posture is not merely unverified, it is not even asked for.

`client/src/pkce.ts` uses S256 on the client side, and Module 03 teaches the downgrade attack in
both directions, so the *teaching* is complete. The *deployment* has no way to show whether an attacker
could downgrade a request to `plain`.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| PKCE "enforced by Authlete" | `SPEC-INVENTORY.md:92` | Accurate about where enforcement lives; silent on whether it is switched on | **Accurate but incomplete** / S3 |
| `pkceRequired: true` | `controllers/fapi.controller.ts:41` (served as API output) | Hardcoded; live value unknown | `DOC_INCORRECT` / **S2** — a learner auditing this deployment records an unverified control as verified |
| Module 03 teaches the S256 charset bounds, the downgrade attack in both directions, and why `plain` is weak | `modules/03…/README.md:59-76` | Matches §4.1, §4.2, §7.2 as fetched | **Accurate** |
| PKCE listed among working features | `README.md` | True in the sense that the flow works; says nothing about enforcement | **Accurate** |

## Sources consulted

- RFC 7636 §§4.1, 4.2, 4.3–4.4, 4.5–4.6, 7.2 — `https://www.rfc-editor.org/rfc/rfc7636.html`
- RFC 9700 §2.1.1 (MUST support PKCE; MUST enforce the verifier) — `https://www.rfc-editor.org/rfc/rfc9700.html`
- Authlete PKCE page — `https://developers.authlete.com/protocols-and-flows/protocol-extensions/proof-key-for-code-exchange-pkce.md` *(listed in `llms.txt`; the requiring/S256 flags are documented on the two dedicated `requiring-clients-to-…` pages, not fetched — see below)*
- Code: `controllers/fapi.controller.ts:41,77`, `services/client.management.service.ts:423-424`, `routes/openapi.routes.ts:78,84,143`
- SDK 1.0.0: `models/clientauthmethod.ts`, `models/service.ts`

## Named next action to reach `VERIFIED`

The blocking fact is a single unknown: the live values of `pkceRequired` and `pkceS256Required`.

**One raw-HTTP call to `GET /api/{serviceId}/service/get` settles it** — and it will succeed where the
SDK fails, because the failure is SDK-side Zod validation of the response, not an Authlete error. That
also independently confirms the `SPIFFE_JWT` diagnosis by showing the offending value on the wire.
**Not performed** — requires authorisation, and it is the same call B7 needs, so it should be run once
for both.

Authlete's two dedicated pages —
`/configuration-reference/endpoints/requiring-clients-to-use-pkce-for-their-authorization-requests` and
`/configuration-reference/endpoints/requiring-clients-to-specify-s256-when-using-pkce` — were **not
fetched** and should be, to confirm the exact flag names before any remediation.

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 7636-W1 | Remove the hardcoded `pkceRequired` (and the four sibling literals) from `fapi.controller.ts:38-43` | S | `config` either reports the live value or omits the field; it never asserts an unread one. Same item as `9700-W4`. |
| 7636-W2 | Read `pkceS256Required` and surface it | S | Both `config` and `status` report it |
| 7636-W3 | Establish the live PKCE posture | S | One `service/get` probe; result recorded in the audit and in `PROGRESS.md`'s service-configuration section |
| 7636-W4 | No change to the PKCE code path | — | Correct as delegated. Recording that is the finding. |

**Blocked on B7.** 7636-W1 and 7636-W2 both depend on `service.get()` working, which is the
`SPIFFE_JWT` enum gap — and `AGENTS.md` warns that fixing the local half retires Module 10 Exercise 4.
Sequence accordingly at Gate 4.
