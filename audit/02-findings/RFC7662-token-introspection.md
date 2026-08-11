# RFC 7662 — OAuth 2.0 Token Introspection

- **Verdict:** `PARTIAL`
- **Severity:** **S1**
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/API.md`, `CURL-TEST.md`, `docs/curriculum/modules/04-token-lifecycle-and-metadata/`, `docs/STEP-UP-AUTH-TUTORIAL.md`

<thinking>
1. RFC 7662's AS-side MUSTs: §2.1 requires `token`; §2.1 requires the endpoint itself to be protected
   ("MUST also require some form of authorization to access this endpoint, such as client
   authentication") explicitly to stop token scanning; §2.2 requires `active` in the response; §2.3
   returns 401 when the caller is not authorized. Note the asymmetry the spec is careful about: an
   *inactive token* is not an error (200 `{"active":false}`), but an *unauthorized caller* is (401).
2. Authlete boundary: Authlete exposes **two** introspection APIs, and only one is RFC 7662.
   `introspection.standardProcess` is the conformant one; `introspection.process` is proprietary, built
   for a resource server that holds an Authlete service token. Authlete validates the token and
   composes the body. **Protecting the endpoint is entirely the AS's job** — Authlete has no way to
   authenticate the RS calling this server.
3. Code: both routes are registered with **no middleware whatsoever** (`introspection.routes.ts:7,8`)
   — no auth, no rate limiter. The standard path decodes Basic credentials only *if present*
   (`introspection.service.ts:105-113`) and forwards them to Authlete; absence is not an error. And
   that decoding is hand-rolled with `split(":")`, which `AGENTS.md` explicitly forbids.
4. Docs: `PROGRESS.md` already records "introspection endpoint unauthenticated (RFC 7662 §2.1 MUST)"
   as an open finding, so the *headline* is known. What is not recorded: it applies to both endpoints,
   there is no rate limiter either, and the Basic-auth decoder is broken for secrets containing colons.
5. Delta: (3) vs (1) — §2.1's endpoint-protection MUST is unmet. (3) vs `AGENTS.md` — a documented
   repo rule is violated in a file the same document lists as security-critical.
6. Unsure: nothing material. The route table and service code are unambiguous.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `token` (REQUIRED) at the introspection endpoint | §2.1 | ✅ `routes/introspection.routes.ts:8`; `utils/validate.ts:51-55` provides `validateIntrospectionParams` |
| 2 | *"the endpoint MUST also require some form of authorization to access this endpoint, such as client authentication"* | §2.1 | ❌ **Unmet** — `routes/introspection.routes.ts:7,8` register no middleware; credentials are optional at `services/introspection.service.ts:107` |
| 3 | Return `active` (REQUIRED) in the response | §2.2 | ✅ Authlete composes `responseContent`; relayed at `controllers/introspection-standard.controller.ts:22-24` |
| 4 | An inactive token is **not** an error — 200 `{"active": false}` | §2.2 | ✅ `OK` → 200 |
| 5 | Unauthorized caller → 401 | §2.3 | ⚠️ `UNAUTHORIZED` → 401 is mapped (`introspection.controller.ts:64`) but unreachable for endpoint-level auth, since no caller is ever rejected |
| 6 | Prevent token scanning | §2.1 rationale | ❌ **Unmet** — unauthenticated **and** unrated |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Choosing between the two introspection APIs | **This server** | `introspection.service.ts:68` (proprietary) vs `:135` (RFC 7662) |
| Token validation, `active` computation, body composition | Authlete | `introspection.standardProcess` |
| **Authenticating the calling resource server** | **This server** | not implemented |
| Rate limiting the endpoint | **This server** | not implemented |
| Client credential decoding | **This server** | `introspection.service.ts:107-112` — hand-rolled, see F-3 |

Confirmed this session: `/auth/introspection` is *"Authlete-specific… for resource servers"*, and
`/auth/introspection/standard` is the *"RFC 7662-compliant"* one
(`/configuration-reference/endpoints/use-cases-for-two-introspection-apis`).

## Finding F-1 — both introspection endpoints are unauthenticated (S1)

`server/src/routes/introspection.routes.ts:7-8` registers both handlers with no middleware. Any
network-reachable caller can submit an arbitrary token string and learn whether it is active, its
scopes, subject, client, and expiry.

**Failure scenario.** An attacker with a token of unknown provenance — scraped from a log, a referrer
header, a mobile app bundle — posts it to `/api/introspection/standard` and receives
`{"active":true,"scope":"…","sub":"…","exp":…}`. Repeated, this is a token-validity oracle and a
subject-enumeration oracle. RFC 7662 §2.1 names exactly this ("token scanning") as the reason the
endpoint MUST be protected.

**The proprietary endpoint is the worse of the two.** `/api/introspection` is designed for a caller
that holds an Authlete service token and accepts binding-verification inputs. Exposing it
unauthenticated hands out Authlete's richer diagnostic view — including the RFC 9470 `acr`/`auth_time`
and step-up challenge details assembled at `controllers/introspection.controller.ts:84-97` — with no
caller identity at all.

**Neither endpoint has a rate limiter**, so the oracle is also unthrottled. Every other sensitive
surface in this repo has at least `generalLimiter`.

## Finding F-2 — RFC 9470 step-up data is emitted to an unauthenticated caller (S2)

`controllers/introspection.controller.ts:84-97` parses Authlete's `WWW-Authenticate` and returns a
structured body carrying `acr_values`, `max_age`, `acr` and `auth_time`. That is correct RFC 9470
behaviour toward a *legitimate* resource server, and an information leak toward anyone else. It is a
consequence of F-1, not an independent defect, but it raises F-1's impact: the endpoint discloses how
strongly a user authenticated and when.

## Finding F-3 — hand-rolled Basic-auth decoding, contrary to a documented repo rule (S2)

`server/src/services/introspection.service.ts:107-112`:

```
if (authorization?.startsWith("Basic ")) {
  const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf-8");
  const [clientId, clientSecret] = credentials.split(":");
```

`AGENTS.md` states, of `parseBasicAuth` (`server/src/utils/basic-auth.ts:24-43`): *"It splits on the
first colon (a secret may contain colons) … **Do not hand-roll `authorization.split(":")` again.**"*
And `services/introspection.service.ts` is listed in the same document under **Security-critical
surfaces → Token presentation & introspection**.

Two concrete defects versus `parseBasicAuth`:

| Input | `parseBasicAuth` | `introspection.service.ts:109` |
|---|---|---|
| secret `a:b:c` | `clientSecret = "a:b:c"` (first-colon split, `:35-39`) | `clientSecret = "a"` — **truncated** |
| header `basic dXNlcjpwYXNz` (lowercase scheme) | accepted — RFC 9110 §11.1, `:27-29` | **not matched**; credentials silently dropped |

**Failure scenario.** A resource server whose client secret contains a colon authenticates to
`/api/introspection/standard` with correct credentials. The truncated secret is forwarded to Authlete,
Authlete rejects it, and the RS sees an authentication failure it cannot diagnose — while the identical
credentials work at `/api/token` and `/api/par`, which both use `parseBasicAuth`.

Note the irony with F-1: this code path exists to support client authentication, yet nothing requires
it, so the bug is currently masked by the larger problem.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Introspection endpoint documented without an auth requirement | `docs/API.md`, `CURL-TEST.md` | Matches the code, but teaches a §2.1 violation as normal | `DOC_INCORRECT` / **S1** — a learner copying `CURL-TEST.md`'s introspection recipe ships an unauthenticated token-validity oracle |
| "introspection endpoint unauthenticated (RFC 7662 §2.1 MUST)" | `PROGRESS.md` open findings | **Confirmed.** Incomplete: applies to both endpoints, and omits the missing rate limiter | Accurate but partial |
| Module 04 teaches "why the endpoint must be protected" as a learning objective | `modules/04…/README.md:59-77` | The lesson states the requirement the deployment violates | Consistent *if* the lab names the local violation; **B2b/Phase 3 must check whether it does** |
| Two-endpoint distinction (proprietary vs RFC 7662) | not stated anywhere in `docs/` | The repo exposes both and documents neither as distinct | `S3` — learners cannot tell which endpoint is the standard one |

## Sources consulted

- RFC 7662 §§2.1–2.3 — `https://www.rfc-editor.org/rfc/rfc7662.html`
- Authlete, Use cases for two introspection APIs — `https://developers.authlete.com/configuration-reference/endpoints/use-cases-for-two-introspection-apis.md`
- Code: `routes/introspection.routes.ts:1-11`, `services/introspection.service.ts:88-141`, `controllers/introspection.controller.ts:57-107`, `controllers/introspection-standard.controller.ts:13-31`, `utils/basic-auth.ts:24-43`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 7662-W1 | Require caller authentication on both introspection endpoints | M | Unauthenticated request → 401 with `WWW-Authenticate`. Decide the credential: client auth for `/introspection/standard` (spec-shaped), admin Basic for `/introspection` (it is a diagnostic surface). Integration test per endpoint. **Security-critical file — needs its own plan.** |
| 7662-W2 | Add a rate limiter to both endpoints | S | `generalLimiter` at minimum; 429 asserted in test |
| 7662-W3 | Replace the hand-rolled decoder with `parseBasicAuth` | S | Colon-bearing secret round-trips; lowercase `basic` accepted. Unit test both. **Security-critical file — needs its own plan.** |
| 7662-W4 | Document the two-endpoint distinction | S | `docs/API.md` states which endpoint is RFC 7662 and which is Authlete-proprietary, and what each is for |
| 7662-W5 | Update `CURL-TEST.md` + Module 04 to show authenticated introspection | M | Every recipe sends credentials; the lab names the pre-fix violation as a finding rather than modelling it |

**Curriculum dependency.** Module 11 exercises use unauthenticated admin-surface access as live
exploits, and Module 04's objectives include "why the endpoint must be protected". Before 7662-W1
lands, `grep -rn "introspection" docs/curriculum/modules` to find every lab step whose expected output
changes from 200 to 401.
