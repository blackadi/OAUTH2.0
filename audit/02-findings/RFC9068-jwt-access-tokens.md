# RFC 9068 — JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens

- **Verdict:** `DOC_ONLY`
- **Severity:** **S3**
- **Authlete version required:** **2.1+** (`01-spec-matrix.md` §2); running 3.0
- **Repo docs under test:** `docs/curriculum/modules/04-token-lifecycle-and-metadata/README.md:145-160`, `…/lab.md:336-338`, `docs/STEP-UP-AUTH-TUTORIAL.md` Part 4, `docs/curriculum/GLOSSARY.md:60-64`, `docs/curriculum/SPEC-INVENTORY.md:105`

<thinking>
1. RFC requirements on the AS: §2.1 — `typ` SHOULD be `at+jwt`, `alg` MUST NOT be `none`. §2.2 — seven
   REQUIRED claims: `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`, `jti`. §2.2.1 — `auth_time`, `acr`, `amr`
   OPTIONAL. §2.2.3 — `scope` SHOULD be present when the request had one. §3 — with a `resource` parameter the
   `aud` SHOULD match it; **without one the AS MUST use a default resource indicator in `aud`**. §4 — the RS
   MUST reject a token whose `typ` is not `at+jwt`/`application/at+jwt`, MUST check `iss`, `aud`, signature and
   `exp`. §5 — the AS MUST use a distinct `aud` per resource to prevent cross-JWT confusion.
2. Authlete boundary: entirely Authlete's, gated by service configuration — `accessTokenSignAlg` turns JWT
   access tokens on, and `jwtAtClaims` / `TokenResponse.jwtAccessToken` are the SDK surfaces. No AS code.
3. Code: the service does not issue JWT access tokens (`accessTokenType = Bearer`, `accessTokenSignAlg`
   absent — probe 2), and no code reads `jwtAccessToken` at all. Separately, `utils/createLocalJWT.ts` mints a
   local ES256 JWT that a dev-only admin route hands out as an access token.
4. Docs: Module 04 teaches the profile properly and **states outright that it cannot be produced here**. The
   step-up tutorial shows a JWT AT payload with an honest conditional caveat.
5. Delta: docs↔code is clean on the main path — this is the rare case where a spec is taught, not implemented,
   and the docs say so. The delta is in the *local* JWT, which is a JWT presented as an access token and misses
   three of §2's requirements.
6. Which verdict? `ABSENT` would be wrong — it is documented, thoroughly. `MISCONFIGURED` overstates: nothing
   contradicts the spec, the feature is simply off, and Module 04 says so. `DOC_ONLY` is the exact fit.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | `typ` header `at+jwt` | §2.1 | ❌ no JWT AT is issued; the local dev JWT has `typ: JWT` — F-2 |
| 2 | `alg` MUST NOT be `none` | §2.1 | ✅ n/a for the main path; local JWT uses ES256 |
| 3 | `iss` REQUIRED | §2.2 | ⊘ Authlete's; ✅ in the local JWT |
| 4 | `exp` REQUIRED | §2.2 | ⊘; ✅ local (5 min) |
| 5 | `aud` REQUIRED | §2.2 | ⊘; ✅ local (caller-supplied) |
| 6 | `sub` REQUIRED | §2.2 | ⊘; ✅ local |
| 7 | `client_id` REQUIRED | §2.2 | ⊘; ❌ **absent from the local JWT** — F-2 |
| 8 | `iat` REQUIRED | §2.2 | ⊘; ✅ local |
| 9 | `jti` REQUIRED | §2.2 | ⊘; ❌ **absent from the local JWT** — F-2 |
| 10 | `auth_time`, `acr`, `amr` OPTIONAL | §2.2.1 | ✅ `acr`/`auth_time` supported both by Authlete (`TokenCreateRequest.acr`/`authTime`) and by the local JWT (`createLocalJWT.ts:24-25`); `amr` nowhere |
| 11 | `scope` SHOULD be present when requested | §2.2.3 | ⊘; ❌ absent from the local JWT |
| 12 | With `resource`, `aud` SHOULD match it | §3 | ✅ **Authlete does this for opaque tokens too** — verified live via introspection `aud` (`RFC8707-…`) |
| 13 | Without `resource`, the AS **MUST** use a default resource indicator in `aud` | §3 | ❌ no default configured; no `aud` at all when `resource` is omitted (observed, `modules/04…/lab.md` Ex 1) — moot while no JWT AT is issued, live the moment one is — F-3 |
| 14 | Distinct `aud` per resource (cross-JWT confusion) | §5 | ⊘ Authlete's |
| 15 | RS-side validation checks | §4 | ⊘ out of the AS's scope; the repo has no RS. Module 04 teaches them |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Issuing a JWT access token at all | **Service configuration** | `accessTokenSignAlg` — **absent**; `accessTokenType = Bearer` (probe 2) |
| Assembling §2.2's claims | Authlete | not exercised |
| Extra claims | **This server**, if it chose to | `TokenCreateRequest.jwtAtClaims` — never set |
| Reading the JWT form of an issued token | **This server**, if it chose to | `TokenResponse.jwtAccessToken` (`models/tokenresponse.ts:170`) — **never read** |
| The dev-only local JWT | **This server, entirely** | `utils/createLocalJWT.ts`; `controllers/token.management.controller.ts:250-256` |

Nothing on the main path requires AS code. `SPEC-INVENTORY.md:105`'s "JWT ATs via Authlete" is the right
description of the division of labour; the row simply does not say the switch is off.

## Finding F-1 — the profile is taught and cannot be produced here, and the curriculum says so (S3)

Probe 2:

```
accessTokenType    = Bearer
accessTokenSignAlg = <absent>
```

So every access token this deployment issues is opaque, and no `at+jwt` can appear. Module 04's lab is explicit
about it (`lab.md:336-338`):

> **Access tokens are opaque here** (service configuration). RFC 9068 `at+jwt` access tokens are taught in the
> lesson but cannot be produced on this deployment without changing the AS's access-token signing settings, so
> no lab step claims to show one.

**That is the correct handling of an unrunnable spec, and it is the standard the rest of the repo should be
held to.** Compare `docs/FAPI-TUTORIAL.md:377-384`, which prints a PAR response the server cannot emit
(`RFC9126-…` F-2). Same repo, same class of problem, opposite discipline. The severity here is S3 only because
the feature is advertised as "taught, not runnable" rather than as working — a learner is not misled, but
neither can they verify anything, and Module 04's four objectives about JWT ATs (`README.md:70`) are met by
prose alone.

One nuance the curriculum could use, and does not have: **Authlete honours `resource` → `aud` even for opaque
tokens**, surfaced through introspection (verified in `modules/04…/lab.md:180-184`). So the audience-restriction
lesson *is* runnable here; only the self-contained-token half is not. Those are separable and the lab currently
lumps them.

## Finding F-2 — the dev-only local JWT is presented as an access token and misses three §2 requirements (S3)

`utils/createLocalJWT.ts:12-33` mints:

```ts
const payload = { iss, sub, aud, iat: now, exp: now + 300 };
if (options?.acr !== undefined) payload.acr = options.acr;
if (options?.authTime !== undefined) payload.auth_time = options.authTime;
const token = jwt.sign(payload, privateKey, { algorithm: "ES256", keyid: "jeQR9…" });
```

Served by `POST /api/token/createLocalToken` (`controllers/token.management.controller.ts:250-256`), which 404s
unless `NODE_ENV === "development"`, behind admin Basic auth, and exposed in the SPA (`AdminSection.tsx:135`).

Against §2 it is **not** an RFC 9068 JWT access token:

| Requirement | Status |
|---|---|
| `typ: at+jwt` (§2.1) | ❌ `jsonwebtoken` emits `typ: JWT`. §4 check 1 makes an RS **MUST-reject** this |
| `client_id` (§2.2) | ❌ absent |
| `jti` (§2.2) | ❌ absent |
| `scope` (§2.2.3) | ❌ absent |
| `iss`, `sub`, `aud`, `iat`, `exp` | ✅ present |
| `acr`, `auth_time` (§2.2.1) | ✅ optional, supported |

**Failure scenario.** The file's own header says `DEV-ONLY: Bypasses Authlete token issuance`, and the route is
gated, so this is not a production defect. It is a *teaching* defect: this is the only JWT in the repo that a
learner can obtain and decode as an "access token", in a curriculum whose Module 04 objective is *"State the
required claims and the `typ` header value of an RFC 9068 JWT access token"* (`README.md:70`). A learner who
decodes the one available specimen finds four of those requirements missing and nothing telling them so.
Adding `typ`, `client_id`, `jti` and `scope` is a handful of lines and turns the specimen into a worked example
of §2.2 instead of a counter-example.

Note also that §5's cross-JWT-confusion guidance bites here: `aud` is whatever the admin caller passes
(`AdminSection.tsx:135`), with no validation that it is an absolute URI or a known resource.

## Finding F-3 — §3's default-`aud` MUST is unsatisfied, and is latent rather than live (S4)

§3: *"If the request does not include a 'resource' parameter, the authorization server MUST use a default
resource indicator in the 'aud' claim."* Observed behaviour without `resource` is **no `aud` at all**
(`modules/04…/lab.md` Exercise 1 vs Exercise 4). While tokens are opaque this is unreachable — §3 constrains
JWT access tokens. It becomes a live conformance gap the moment `accessTokenSignAlg` is set, which is exactly
what work item 9068-W1 would do. Recorded now so that turning JWT ATs on does not quietly introduce a MUST
violation.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| "Access tokens are opaque here (service configuration)… no lab step claims to show one" | `modules/04…/lab.md:336-338` | Confirmed by probe 2 | **Accurate — exemplary** |
| RFC 9068 §2.2's required claims and the `typ` header taught as an objective | `modules/04…/README.md:70,145-160` | Matches the RFC fetched this session | **Accurate** |
| "`typ` may be `JWT`, `at+jwt` (RFC 9068 access token), or `dpop+jwt` (RFC 9449 proof)" | `modules/00…/README.md:114` | Correct | **Accurate** |
| A sample `at+jwt` is provided for offline decoding | `modules/00…/lab.md:99` | A static sample, not from this server — appropriate, and it is the only conformant specimen a learner sees | **Accurate** |
| JWT access token payload example including `client_id` | `STEP-UP-AUTH-TUTORIAL.md:144-155` | The example is **more** conformant than anything the repo produces: it has `client_id`, `scope`, `iss`, `exp`, `iat` — but no `jti`, and it is not labelled as illustrative-only | **Incomplete** / S3 |
| "Authlete — embeds these claims in the JWT access token (**when `accessTokenSignAlg` is configured**)" | `STEP-UP-AUTH-TUTORIAL.md:168` | The caveat is correct and load-bearing; `accessTokenSignAlg` is unset, so the tutorial's Part 4 describes an unreachable state | **Accurate caveat, unreachable body** / S3 |
| "Authlete embeds `acr` and `auth_time` in JWT access tokens automatically when the server passes them in `/auth/authorization/issue`" | `STEP-UP-AUTH-TUTORIAL.md:409` | True of JWT ATs; on this deployment the claims surface through **introspection** instead, which is RFC 9470 §6.2 and works — verified | **Accurate but misleading here** / S3 |
| Glossary: self-contained token / revocation lag / token confusion mitigated by §2.1 `typ` | `GLOSSARY.md:60-64` | All three accurate and well-attributed | **Accurate** |
| `SPEC-INVENTORY.md:105` — "JWT ATs via Authlete" | `:105` | Accurate about the boundary; silent on the switch being off | **Incomplete** / S4 |
| Nothing says the one obtainable "JWT access token" in the repo is not RFC 9068-shaped | `createLocalJWT.ts`, Module 04 | F-2 | **Omission** / S3 |

## Sources consulted

- RFC 9068 §§2.1, 2.2, 2.2.1, 2.2.2, 2.2.3, 3, 4, 5 and full ToC — `https://www.rfc-editor.org/rfc/rfc9068.txt`
- RFC 8707 §2 (the `resource`→`aud` relationship) — `https://www.rfc-editor.org/rfc/rfc8707.txt`
- RFC 9470 §6.1 (`auth_time`/`acr` in JWT ATs per RFC 9068 §2.2.1) — `https://www.rfc-editor.org/rfc/rfc9470.txt`
- Live probe 2 (2026-08-10): `accessTokenType`, `accessTokenSignAlg` — `SERVICE-CONFIG-PROBE.md` §6
- SDK 1.0.0: `models/tokenresponse.ts:170`, `models/tokencreaterequest.ts:146` (`jwtAtClaims`), `models/tokencreateresponse.ts:108`
- Code: `utils/createLocalJWT.ts:12-33`, `controllers/token.management.controller.ts:250-256`, `services/token.operations.service.ts:72,197-207`, `client/src/components/admin/AdminSection.tsx:135`
- Grep: `jwtAccessToken` is never read in `server/src`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9068-W1 | Decide whether to turn JWT access tokens on | M | A Gate 4 decision. If yes: set `accessTokenSignAlg`, satisfy §3's default-`aud` MUST (F-3), and Module 04 gains a real `at+jwt` transcript. If no: Module 04's objectives are re-scoped to "explain and validate" rather than "produce", and `SPEC-INVENTORY.md:105` records the switch as off. **Interacts with Module 04's opaque-token exercises and with `docs/STEP-UP-AUTH-TUTORIAL.md` Part 4 — check both before flipping.** |
| 9068-W2 | Make the local dev JWT §2-shaped | S | `typ: at+jwt` in the header, plus `client_id`, `jti` and `scope`; the file comment cites §2.1/§2.2. A unit test asserts the header and the seven claims. Keeps the dev-only gate. |
| 9068-W3 | Separate the two halves of the Module 04 lesson | S | Audience restriction (runnable here, via introspection) is distinguished from self-contained tokens (not runnable), so learners know which claim they can verify. |
| 9068-W4 | Label the step-up tutorial's JWT payload as illustrative | S | Part 4 states that this deployment conveys `acr`/`auth_time` through introspection (RFC 9470 §6.2), not in a JWT AT, and points at the §6.1 path as the alternative. |

**Ordering.** W2, W3 and W4 are independent and safe. W1 gates whether F-3 becomes live and should not be
taken alone: `utils/createLocalJWT.ts` is not on the **Security-critical surfaces** list, but W1 changes the
format of every access token this deployment issues, which is Token issuance in substance and needs a plan.
