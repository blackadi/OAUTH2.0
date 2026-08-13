# RFC 6749 — The OAuth 2.0 Authorization Framework

- **Verdict:** `IMPLEMENTED_VERIFIED`
- **Severity:** S3
- **Authlete version:** 3.0
- **Repo docs under test:** `AGENTS.md` (Quirks & gotchas, Token endpoint action coverage), `docs/API.md`, `CURL-TEST.md`, `docs/curriculum/modules/01`, `modules/02`

<thinking>
1. RFC 6749's AS-side MUSTs I can actually audit on this side of the boundary: §2.3.1 — the AS MUST
   support HTTP Basic for clients with a password, and a client MUST NOT use more than one auth method
   per request; §3.3 — omitted `scope` must either get a default or fail as invalid_scope; §4.1.2.1 —
   the AS MUST NOT redirect to an invalid/mismatched redirect URI, but otherwise reports errors *by*
   redirecting; §5.1 — a success response requires `access_token` and `token_type`; §5.2 — error codes,
   and 401 + `WWW-Authenticate` when the client attempted header auth.
2. Authlete boundary: nearly all of it is Authlete's. What is this server's: decoding Basic credentials
   and choosing between the two channels, the pre-flight validation before Authlete sees the request,
   and the status/header mapping. §4.1.2.1's redirect-vs-body split is Authlete's, and the repo has
   already characterised it.
3. Code: `token.service.ts:26-36` gives Basic priority over body credentials via `parseBasicAuth`.
   `token.controller.ts:54-64` returns 401 + `WWW-Authenticate: Basic` on `INVALID_CLIENT` only when an
   `Authorization` header was present, else 400 — exactly §5.2's shape. `validate.ts:39-43` checks only
   `client_id`, which is correct and heavily reasoned in its own comment.
4. Docs: `AGENTS.md`'s "Quirks & gotchas" explains both the validator's minimalism and Authlete's
   `response_type`-dependent error channel, with a verification date. Both claims check out against
   the code and against the spec text.
5. Delta: one real deviation — §2.3.1's "MUST NOT use more than one authentication method" is not
   enforced; the server silently prefers Basic. That is a defensible design (it matches what Authlete
   itself does per the strict-checking page) but it is a deviation and should be recorded as one.
6. Unsure: whether Authlete rejects dual-channel credentials when its strict-checking flag is on. Noted
   as a source gap rather than guessed.
</thinking>

## Normative requirements (AS side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | *"The authorization server MUST support the HTTP Basic authentication scheme for authenticating clients that were issued a client password."* | §2.3.1 | ✅ `services/token.service.ts:31-36` via `utils/basic-auth.ts:24-43` |
| 2 | Body-parameter client auth is *"NOT RECOMMENDED and SHOULD be limited to clients unable to … utilize HTTP Basic"* | §2.3.1 | ✅ supported as the secondary channel (`token.service.ts:28-29`); Authlete decides acceptance per the client's registered method |
| 3 | *"The client MUST NOT use more than one authentication method in each request."* | §2.3.1 | ✅ **enforced 2026-08-13 (6749-W1)** — `400 invalid_request` at both `/api/token` and `/api/par`, before any Authlete call; see F-1 |
| 4 | Omitted `scope` → default value or fail with invalid_scope | §3.3 | ⊘ Authlete's, via `Service.scopeRequired` |
| 5 | *"If the issued access token scope is different from the one requested … MUST include the `scope` response parameter"* | §3.3 | ⊘ Authlete's, in `responseContent` |
| 6 | *"MUST NOT automatically redirect the user-agent to the invalid redirection URI"* when redirect URI or client_id is missing/invalid | §4.1.2.1 | ✅ correct by delegation — the local validator refuses to answer at all (see F-2), and Authlete emits `400 [A009301]` as a body |
| 7 | Otherwise report authorization errors by redirecting with `error` | §4.1.2.1 | ✅ Authlete returns `LOCATION`; mapped to 302 at `controllers/authorization.controller.ts:39-42` |
| 8 | Success response requires `access_token` and `token_type` | §5.1 | ⊘ Authlete composes `responseContent`; relayed at `token.controller.ts:92-96` |
| 9 | *"If the client attempted to authenticate via the `Authorization` request header field, the authorization server MUST respond with an HTTP 401"* | §5.2 | ✅ `controllers/token.controller.ts:54-64` — 401 + `WWW-Authenticate: Basic realm="Authlete"` when a header was sent, else 400 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Grant processing, code/token issuance, scope policy | Authlete | `token.process`, `authorization.processRequest` |
| Basic-credential decoding and channel selection | **This server** | `services/token.service.ts:26-36`; `utils/basic-auth.ts` |
| Pre-flight parameter validation | **This server** | `utils/validate.ts:39-55` |
| `INVALID_CLIENT` → 401-vs-400 decision | **This server** | `controllers/token.controller.ts:54-64` |
| §4.1.2.1 redirect-vs-body error channel | **Authlete** | splits on `response_type` presence |
| Raw-body fidelity (parameter order and encoding) | **This server** | `token.service.ts:42` uses body-parser's `rawBody` |

## What is correct, and why it is worth recording

**The pre-flight validator is right to be minimal.** `utils/validate.ts:39-43` checks `client_id` and
nothing else, and its comment (`:14-38`) argues the case: a per-shape allowlist previously demanded
`response_type` and `redirect_uri`, which (a) refused the canonical JAR shape before Authlete saw it,
(b) required `redirect_uri` though §3.1.2.3 makes it optional when exactly one full URI is registered,
and (c) answered `400 {json}` where §4.1.2.1 wants an error redirect. All three of those readings are
correct against the spec text I fetched. The current form cannot go stale as request shapes are added.

**The sibling validators are correctly *not* minimal.** `validateTokenParams` requires `grant_type`
(§4 — unconditionally required) and `validateIntrospectionParams` requires `token` (RFC 7662 §2.1). The
distinction is principled rather than accidental.

**`INVALID_CLIENT` mapping matches §5.2 precisely**, including the conditional `WWW-Authenticate`. The
same shape is repeated at `controllers/revocation.controller.ts:30-43`, consistently.

**Raw-body preservation** (`token.service.ts:40-42`) keeps exact encoding and parameter order for
Authlete, which matters for signature-bearing parameters. Note this is also the mechanism that makes the
RFC 9700 F-1 logging defect leak secrets — the same design choice, opposite consequence.

## Finding F-1 — dual-channel client credentials are silently resolved, not rejected (S3) — ✅ **FIXED 2026-08-13 (6749-W1)**

> **Fixed banner.** Both endpoints that authenticate clients — `/api/token` and `/api/par` — now refuse a
> request presenting credentials on both channels with `400 invalid_request`, before any Authlete call
> (`hasDualChannelClientAuth()` in `utils/basic-auth.ts`). Read the rest of this finding as pre-fix state,
> **except the mechanism correction below, which still applies** and is the durable part.

§2.3.1: *"The client MUST NOT use more than one authentication method in each request."*

`services/token.service.ts:28-36` reads body credentials first, then overwrites them if a Basic header
parses:

```
let clientId   = (req.body.clientId ?? bodyClientId) as string | undefined;
let clientSecret = (req.body.clientSecret ?? bodyClientSecret) as string | undefined;
const basic = parseBasicAuth(req.headers.authorization);
if (basic) { clientId = basic.clientId; clientSecret = basic.clientSecret; }
```

A client sending **both** Basic and `client_secret_post` gets the Basic credentials used and the body
credentials ignored, with no error. §2.3.1 makes that request malformed.

This is a **deliberate, documented** choice: `AGENTS.md` states *"Basic wins if both are present,
matching `token.service.ts`"* for `par.service.ts`, so the behaviour is consistent across the two
endpoints by design. And contrast RFC 6750 §2, where the analogous multi-method rule **is** enforced
(`utils/dpop.ts:132-137` throws 400). So the codebase enforces the rule for token *presentation* and not
for client *authentication*.

Severity is S3 rather than S2 because the failure mode is a confusing silent success for a
misconfigured client, not a security bypass: whichever credential set is used must still be correct, and
Authlete validates it. But a learner comparing the two code paths would find an inconsistency the docs
do not explain.

> **⚠️ Mechanism corrected 2026-08-12 (T1-17). The outcome above is right; the layer is not.**
> This server does **not** resolve the conflict. The snippet quoted above sets the *top-level* `clientId` /
> `clientSecret`, but `parameters` is preferentially **`req.rawBody`** (`services/token.service.ts:42`), so
> body-supplied `client_id` / `client_secret` are forwarded to Authlete **untouched** — the `excluded` set that
> drops them runs only on the JSON fallback path. **This server therefore emits a dual-channel request, and
> Authlete picks the winner** (top-level, verified live — 6749-W1). "Basic silently wins" is accurate as an
> observation and wrong as an attribution.
>
> This is the **third** consequence of one design choice, and the pattern is now worth stating as a rule.
> Raw-body fidelity was adopted to preserve encoding and parameter order for signature-bearing parameters; it
> also made the RFC 9700 F-1 credential leak reach real traffic (the exclusion list never ran on the live
> path); and it is why client credentials cross the boundary twice here. **When a finding in
> `token.service.ts` or `revocation.service.ts` quotes a variable assignment, check what actually goes on the
> wire — `rawBody` bypasses the assignment.**

**Source gap — pursued, partially closed.** Authlete's
`/configuration-reference/endpoints/strict-checking-on-client-authentication-parameters` **was fetched
this session**. It establishes that from Authlete 2.0 onward verification is **method-dependent**: if the
client's registered method is `client_secret_basic` the secret must arrive in the `Authorization` header;
if `client_secret_post`, in the request body. That is the same two-channel rule `AGENTS.md` documents for
PAR.

It does **not** address the dual-channel case: what Authlete does when both channels are populated, or
when a body `client_id` disagrees with the Basic header. So §2.3.1's MUST NOT remains unenforced by
either party as far as documentation shows.

One structural observation, stated as an observation and not a conclusion: on the token endpoint
`token.service.ts:63-67` passes `clientId`/`clientSecret` as **top-level** Authlete fields while
`parameters` is the **raw body** (`:42`) — which for a `client_secret_post` client also contains
`client_id`/`client_secret`. Authlete therefore sees credentials in both places on every
`client_secret_post` token request. Whether that is benign depends on precedence rules Authlete does not
publish. **Resolvable only by probe; not attempted.**

## Finding F-2 — the §4.1.2.1 error channel is Authlete's, and the repo has already characterised it (S4, informational)

`AGENTS.md` records, verified 2026-08-04: with `response_type` present and another parameter invalid,
Authlete returns `302` to the redirection URI with `error`, `state` and `iss`; with `response_type`
**absent**, it returns `400 [A009301]` as a body, because without it the AS cannot determine the response
mode.

I confirm this is the correct reading of §4.1.2.1: the spec's redirect requirement presupposes a
determinable response, and its "MUST NOT redirect" clause covers the missing/invalid-client_id case. No
defect. Recorded so B3 does not re-litigate it.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| `validateAuthorizationParams` checks `client_id` and nothing else, deliberately | `AGENTS.md` Quirks | Matches `utils/validate.ts:39-43`; the three cited reasons all check out against §3.1.2.3, §4.1.2.1 and RFC 9101 §5 | **Accurate** |
| Authlete's authorization-error channel splits on `response_type` | `AGENTS.md` Quirks | Consistent with §4.1.2.1 | **Accurate** |
| "Basic wins if both are present, matching `token.service.ts`" | `AGENTS.md` PAR table | True — but presented as a resolution rule without noting §2.3.1 makes the request malformed | `S3` — incomplete rather than wrong |
| Token endpoint action coverage table (9 actions + default) | `AGENTS.md` | Matches `TokenResponseAction` exactly | **Accurate** |

## Sources consulted

- RFC 6749 §§2.3.1, 3.3, 4.1.2.1, 5.1, 5.2 — `https://www.rfc-editor.org/rfc/rfc6749.html`
- Code: `services/token.service.ts:26-36,40-42`, `utils/basic-auth.ts:24-43`, `utils/validate.ts:14-55`, `controllers/token.controller.ts:47-96`, `controllers/authorization.controller.ts:32-53`, `controllers/revocation.controller.ts:30-43`
- SDK 1.0.0: `models/tokenresponse.ts` (`TokenResponseAction`), `models/authorizationresponse.ts:34-39`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 6749-W1 | Fetch Authlete's strict-checking page; if Authlete does not reject dual-channel credentials, decide whether this server should | S | ✅ **DONE 2026-08-13 — probed, then ruled, then shipped.** The ruling was **reject**, on the ground that it is the only option making this server stricter than the vendor rather than merely agreeing with it, and that the codebase already enforced RFC 6750 §2's identical rule for token *presentation* while ignoring this one. `hasDualChannelClientAuth()` (`utils/basic-auth.ts`) refuses the shape at `token.controller.ts` and `par.controller.ts` with `400 invalid_request` before any Authlete call; PAR is included because RFC 9126 §2 gives it the token endpoint's client authentication, and exempting it would have rebuilt the inconsistency. **A bare `client_id` beside a Basic header is deliberately *not* a second method** — §2.3.1's methods differ in where the *secret* travels, and a public client legitimately sends `client_id` alone; there is a negative-control test and a live check for it. Nothing in `docs/`, the labs or the SPA sent both channels, so nothing broke. **Probe evidence, retained:** **Authlete does not reject dual presentation, and the top-level channel wins:** both channels correct → token issued; top-level correct + body secret **wrong** → **token issued**, the body value ignored; top-level **wrong** + body correct → `INVALID_CLIENT` `[A157305]`. The [strict-checking page](https://developers.authlete.com/configuration-reference/endpoints/strict-checking-on-client-authentication-parameters) was fetched and is **silent on the question** — it governs *method matching* only, and states no precedence rule — so the probe is the authority, not the page. **The "no code change if Authlete already rejects" escape does not apply.** Remaining choice, unchanged in substance: keep Basic-wins as inherited vendor behaviour and document it, or reject dual presentation locally with `400 invalid_request` — the only option that makes this server stricter than Authlete rather than merely agreeing with it. See the correction under F-1. |
| 6749-W2 | Note the §2.3.1 rule in `AGENTS.md`'s Basic-wins paragraph | S | The paragraph says *why* Basic wins **and** that §2.3.1 makes the dual-channel request malformed, so the choice reads as a deliberate tolerance rather than an oversight |

No behavioural defect found. RFC 6749 is the second spec in this batch needing no fix.
