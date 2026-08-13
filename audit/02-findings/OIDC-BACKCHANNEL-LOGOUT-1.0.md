# OpenID Connect Back-Channel Logout 1.0 incorporating errata set 1

> ## ✅ F-1 AND F-2 CLOSED — 2026-08-13 (T1-14, T1-15)
>
> **F-1 — §2.6 is now complete.** All eleven steps run. `jwt.verify` receives `issuer` and `audience` from new
> configuration; `iat` is bounded to five minutes; `sub`-or-`sid` presence is *required* rather than skipped;
> a `nonce` claim is rejected. **Verified live against a locally-served JWKS**, not only in tests: a
> conformant token → 200, and wrong-`iss` / wrong-`aud` / no-`sub`-or-`sid` / `nonce`-present / stale-`iat`
> each → 400.
>
> **F-2 — the endpoint terminated the wrong session, and now terminates the right one.** `req.session.destroy()`
> ended the session of the *caller*, which is another OP's server posting server-to-server with no browser
> cookie. It destroyed nothing, answered 200, and the sending OP believed the user was logged out. Sessions
> are now looked up by `sub` in the session store (`utils/session-store.ts`). **The two supported stores return
> different shapes from `Store.all()`** — MemoryStore an object keyed by session id, connect-redis an array
> with `sess.id` attached — so a handler for one silently terminates nothing against the other; both are
> normalised, and a test drives the **real** MemoryStore rather than a reading of it.
>
> **Two adjacent items closed in the same change.** **BCL-W3**: an unset `JWKS_URI` threw into the catch-all
> that answered `400 invalid_request`, blaming the sender for our misconfiguration; misconfiguration is now
> **500**, checked *before* the token is read at all — because a server that cannot verify a signature must
> not render any verdict on the token, not even a true one. **BCL-W7**: `Cache-Control: no-store` (§2.8).
>
> **What is still not possible here**, and it is a vendor/config limit rather than a defect: no client
> registers a `backchannel_logout_uri` and no second OP exists, so the *delivery* half remains unexercised.
> A token carrying only `sid` is accepted and acts on nothing, because this OP issues no `sid` of its own
> (Session Management is declined, DR-08). **Severity S2 → S3**: what remains is unexercised delivery and
> the `sid` gap, neither of which is a live MUST violation.

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Status:** OpenID **Final**, *incorporating errata set 1*, **15 December 2023** — re-verified against the primary source this session
- **Authlete version:** 3.0 — the API exists (`POST /api/{serviceId}/backchannel/logout/token`); **SDK 1.0.0 does not wrap it** (`01-spec-matrix.md` §5.2)
- **Repo docs under test:** `docs/BACKCHANNEL-LOGOUT-TUTORIAL.md`, `docs/curriculum/modules/08-oidc-core-and-logout/lab.md` Exercise 6c, `AGENTS.md` Backchannel Logout paragraph

<thinking>
1. Two roles, and this repo plays both. **As OP** (§2.5): POST the logout token to each registered
   `backchannel_logout_uri` as `application/x-www-form-urlencoded` with a `logout_token` parameter. **As RP**
   (§2.6): validate the token through eleven steps — signature, `alg` not `none`, `iss`, `aud`, `iat`, `exp`,
   `sub`-or-`sid` present, the `events` claim, **no `nonce`** — and answer 200 on success or 400 on any failure.
   §2.4 lists the required claims. Metadata: `backchannel_logout_supported` /
   `backchannel_logout_session_supported` on the OP, `backchannel_logout_uri` on the client.
2. Authlete boundary: Authlete mints the logout token (the raw `fetch()` at `services/backchannel-logout.service.ts:34`
   is justified — the SDK has no wrapper, confirmed in Phase 1). Delivery is this server's. The receiving
   endpoint is entirely this server's.
3. Code: the **OP half is correct** — `issueAndDeliver` posts form-encoded with `logout_token`, exactly §2.5.
   The **RP half is not** — four of §2.6's checks are missing, and it destroys the wrong session.
4. Docs: Module 08 Exercise 6c and `PROGRESS.md` find the `JWKS_URI` problem and the missing `iss`/`aud` checks.
   `AGENTS.md` says the receiver *"properly destroys `req.session`"*, which is the part that is conceptually wrong.
5. Delta: the delivery half conforms and has nobody to deliver to; the receiving half has recipients and does not
   conform.
6. One thing I had to think through rather than read off: whether destroying `req.session` on a server-to-server
   POST does anything at all. It does not — there is no browser session on that request.
</thinking>

## Normative requirements

| # | Requirement | Role | Source | Status |
|---|---|---|---|---|
| 1 | Logout token carries `iss`, `aud`, `iat`, `exp`, `jti`, `events` | OP | §2.4 | ⊘ Authlete mints it |
| 2 | Token contains `sub` or `sid` (or both) | OP | §2.4 | ⊘ Authlete's; the AS supplies `subject` / `sessionId` (`services/backchannel-logout.service.ts`) |
| 3 | A `nonce` claim **MUST NOT** be present | OP | §2.4 | ⊘ Authlete's |
| 4 | POST to `backchannel_logout_uri`, `application/x-www-form-urlencoded`, `logout_token` parameter | OP | §2.5 | ✅ **correct** — `services/backchannel-logout.service.ts:89-96` |
| 5 | Validate the signature; reject `alg: none` | RP | §2.6 (2,3) | ✅ `controllers/logout.controller.ts:76,82` — `algorithms: ["RS256","ES256"]` excludes `none` |
| 6 | Validate `iss` | RP | §2.6 (4) | ✅ **2026-08-13** — `issuer` option, from `BACKCHANNEL_LOGOUT_ISSUER`; unset ⇒ 500, never skipped |
| 7 | Validate `aud` | RP | §2.6 (4) | ✅ **2026-08-13** — `audience` option, from `BACKCHANNEL_LOGOUT_AUDIENCE` |
| 8 | Validate `iat` | RP | §2.6 (4) | ✅ **2026-08-13** — bounded to ±300s. (`exp` was already covered by `jwt.verify`'s default, which **Module 08's lab denied**; the lab is corrected) |
| 9 | Verify `sub`, `sid`, or both are present | RP | §2.6 (5) | ✅ **2026-08-13** — required; absence is a 400 rather than a silent no-op |
| 10 | Verify the `events` claim | RP | §2.6 (6) | ✅ `:40-43` |
| 11 | Verify **no** `nonce` claim | RP | §2.6 (7) | ✅ **2026-08-13** — present ⇒ 400 |
| 12 | 200 on success, **400** on any validation failure | RP | §2.8 | ✅ `:83`, `:87` — and `PROGRESS.md` correctly notes the 400 is also returned for a *server* misconfiguration, which is a different defect (F-2) |
| 13 | `Cache-Control: no-store` on the response | RP | §2.8 (SHOULD) | ✅ **2026-08-13** (BCL-W7) — set on every response, verified live |
| 14 | Advertise `backchannel_logout_supported` | OP | §2 metadata | ❌ **absent** from the live discovery document — F-3 |
| 15 | Clients register `backchannel_logout_uri` | OP | §2 metadata | ❌ **no client has one** — F-4 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Minting the logout token | Authlete, via hand-rolled `fetch()` | `services/backchannel-logout.service.ts:28,34` — justified: the SDK has no wrapper (`01-spec-matrix.md` §5.2) |
| Enumerating clients to deliver to | **This server** | `:122-171` — a second `fetch()` that **duplicates `authleteApi.client.list`** and is *not* justified (B1/Phase 1 finding) |
| Delivering the token | **This server** | `:89-96` — conformant |
| Receiving and validating a token | **This server** | `controllers/logout.controller.ts:40-108` — F-1 |
| Terminating the user's session on receipt | **This server** | `:76-81` — wrong session, F-5 |

## Finding F-1 — four of §2.6's validation steps are missing (S2)

`controllers/logout.controller.ts:49-90` verifies the signature against `JWKS_URI` and checks the `events` claim.
It does not check `iss`, `aud`, `iat`, `sub`-or-`sid`, or the absence of `nonce`:

```ts
jwt.verify(logoutToken, publicKey, { algorithms: ["RS256", "ES256"] });   // :57
```

`jsonwebtoken` validates `exp` and `nbf` by default, so §2.6 step 4 is half-met; `iss` and `aud` are only checked
when the `issuer` and `audience` options are passed, and they are not. `PROGRESS.md:1272-1273` states this exactly:
*"passes no `issuer` or `audience`, so `iss` and `aud` are never checked and only the `events` claim is validated."*

**The `nonce` omission is the interesting one**, because §2.4 explains why the prohibition exists:

> A `nonce` Claim MUST NOT be present. Its use is prohibited to make a Logout Token syntactically invalid if used
> in a forged Authentication Response in place of an ID Token.

The prohibition is a type-confusion defence: it guarantees a logout token can never be mistaken for an ID token.
An RP that does not enforce step 7 gives up the RP-side half of that defence. `SPEC-INVENTORY.md:196-197` already
quotes this sentence and notes Module 08 leans on it — so the repo has the knowledge and the check is absent.

Missing `aud` is the most exploitable: any party whose key is in the configured JWKS can mint a token that logs
out any subject at this endpoint, because nothing requires the token to be addressed to *this* RP.

## Finding F-2 — a server misconfiguration is reported as a caller error (S2)

`:45-47` throws when `JWKS_URI` is unset, and the `catch` at `:84-88` returns
`400 {"error":"invalid_request","error_description":"Invalid logout token"}`. `JWKS_URI` **is** unset on this
deployment (`00-inventory.md` §7), so **every** request to this endpoint gets that response, blaming the caller's
token for the server's missing configuration.

`PROGRESS.md:1268-1273` records this with the server log confirming the real cause
(*"JWKS_URI must be configured to verify backchannel logout tokens"*), and identifies it as the third instance of
one pattern — *"a server configuration error reported as a caller error"* — after Module 06's Zod failure and
this same file. §2.8 does require 400 for a validation failure, so the status is defensible; the `error_description`
is not, and the operator-visible symptom is a working endpoint that rejects everything.

## Finding F-3 — the OP does not advertise back-channel logout (S3)

Probe 3: `backchannel_logout_supported` and `backchannel_logout_session_supported` are both **absent** from the
live discovery document, while the repo ships three OP-side endpoints
(`/api/backchannel_logout/{issue,deliver,deliver-all}`) and a receiver. An RP performing discovery concludes the
OP does not support back-channel logout, which is the correct conclusion from the metadata and the wrong
conclusion about the code.

## Finding F-4 — the OP half is correct and has zero recipients (S3)

`issueAndDeliver` (`:64-111`) is conformant: it POSTs `logout_token` form-encoded to the client's
`backchannelLogoutUri`, returns per-client success/failure, and handles the no-URI case explicitly
(*"Client has no backchannelLogoutUri configured"*). `issueAndDeliverToAll` paginates every client at 100/page.

Probe 3: **no client has `backchannelLogoutUri`.** So `deliver-all` iterates all three clients and returns three
"no URI configured" results. The best-implemented part of this specification has never delivered a token.

**Sequencing note that matters.** Registering a `backchannel_logout_uri` is the obvious way to make this
demonstrable — and it is what turns `OIDC-RP-INITIATED-LOGOUT-1.0.md` F-3 (an unverified `id_token_hint` driving
`deliver-all`) from inert into a remote forced-logout primitive. **RPL-W2 must land first.**

## Finding F-5 — the receiver destroys the wrong session (S2)

```ts
// controllers/logout.controller.ts:93-100
const subject = payload.sub;
if (subject) {
  if (req.session) {
    req.session.destroy(…);
  }
}
```

Back-channel logout is a **server-to-server** POST from the OP. There is no user agent on that request and no
browser session attached to it — `req.session` is whatever express-session materialises for the OP's HTTP client,
which is unrelated to the end user's session. The `subject` is read, logged, and then *ignored*: nothing looks up
sessions belonging to that subject.

So even with `JWKS_URI` set and every §2.6 check in place, this endpoint would **not log the user out**. That is
the whole purpose of the specification — §2.5's rationale is logout *without* the browser — and it is the one
thing the endpoint does not do. Correct behaviour is to look sessions up by `sub` (or `sid`) in the session store
and destroy those; with the in-memory store that means an index, and with Redis a key pattern.

**`AGENTS.md` describes this as a feature:** *"The receiving endpoint at `POST /api/backchannel_logout` … handles
incoming logout tokens from other OPs — properly destroys `req.session`."* The word "properly" is doing the
damage: destroying `req.session` is not merely insufficient, it is the wrong object.

> **Field-name correction, 2026-08-12.** This entry cited **`backChannelLogoutUri`** (capital `C`) in 2
> places; Authlete's field is **`backchannelLogoutUri`**, confirmed against `docs/openapi-spec.json` 3.0.16,
> which defines exactly two client-level logout properties: `backchannelLogoutUri` and
> `backchannelLogoutSessionRequired`. All occurrences are corrected above. **The findings are unaffected** —
> the correctly-spelled key is also unset on all three clients — but the probe that established "absent"
> was reading a key that cannot exist, so it could not have returned anything else. Found while establishing
> `OIDC-RP-INITIATED-LOGOUT-1.0.md` F-4.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"incorporating errata set 1"*, Final, **15 Dec 2023** | `SPEC-INVENTORY.md:185` | **Confirmed** against the primary source this session | **Accurate** |
| §2.4's `nonce` MUST NOT, with the reason quoted | `SPEC-INVENTORY.md:196-197` | Quoted correctly — and the check is absent from the code | **Accurate doc, absent control** |
| "The SDK exposes no backchannel logout token API" | `AGENTS.md`; `01-spec-matrix.md` §5.2 | Confirmed — the raw `fetch()` at `:34` is justified | **Accurate** |
| Back-channel logout receipt cannot work (`JWKS_URI` unset), misreports why, and never checks `iss`/`aud` | `PROGRESS.md:1268-1273` | Confirmed line by line | **Accurate** |
| "properly destroys `req.session`" | `AGENTS.md` | The wrong session object; the user is not logged out — F-5 | `DOC_INCORRECT` / **S2** |
| The second `fetch()` duplicates `authleteApi.client.list` | `01-spec-matrix.md` §5.2 | Confirmed at `:122-171` | **Accurate** |
| Nothing notes that no client has a `backchannel_logout_uri`, so `deliver-all` is a no-op | `AGENTS.md`, `BACKCHANNEL-LOGOUT-TUTORIAL.md` | F-4 | **Omission** / S3 |
| Nothing notes that the OP does not advertise the capability | all docs | F-3 | **Omission** / S3 |

## Sources consulted

- OpenID Connect Back-Channel Logout 1.0 incorporating errata set 1 §§2.4, 2.5, 2.6, 2.8, and the OP/client metadata definitions — `https://openid.net/specs/openid-connect-backchannel-1_0.html`, fetched this session. §2.4's `nonce` prohibition and §2.6's eleven validation steps quoted.
- Live probe 3 (2026-08-10): `backchannel_logout_supported`, `backchannel_logout_session_supported`, per-client `backchannelLogoutUri` — `SERVICE-CONFIG-PROBE.md` §8, §10
- Repo-sourced live evidence: `PROGRESS.md:1268-1273`
- Code: `controllers/logout.controller.ts:40-108`, `services/backchannel-logout.service.ts:28,34,64-111,122-171`, `utils/jwksClient.ts:30`, `config/authlete.config.ts:16`
- Phase 1: `01-spec-matrix.md` §5.2 (the SDK-gap confirmation)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| BCL-W1 | Complete the §2.6 validation | S | ✅ **DONE 2026-08-13 (T1-14)**, exactly as specified, plus the configuration that makes `issuer`/`audience` meaningful — see **JOSE-W1** for the generalised rule. 16 unit tests including the different-`aud` case, and all six rejection paths re-run live against a locally-served JWKS. **The endpoint had no unit or integration coverage whatsoever before this** — only two E2E assertions in a suite that is never run locally, which is why a green suite said nothing about it. |
| BCL-W2 | Terminate the **user's** session, not the request's | M | ✅ **DONE 2026-08-13 (T1-15).** `destroySessionsForSubject` (`utils/session-store.ts`) enumerates the store, matches `session.user`, and destroys each; a test seeds a **real** `express-session` MemoryStore and proves alice's two sessions die while bob's survives. `AGENTS.md`'s *"properly destroys `req.session`"* is corrected — it did precisely that, and that was the bug. **`sid` is deliberately not matched**: this OP issues no `sid` of its own, so there is nothing to match against; a `sid`-only token is accepted (§2.6 step 5 is satisfied) and acts on nothing, logged at `error`. **The finding the work item did not predict:** the two supported stores return **different shapes** from `Store.all()`, so a naive implementation silently terminates nothing on one of them. |
| BCL-W3 | Distinguish server misconfiguration from a bad token | S | ✅ **DONE 2026-08-13**, with T1-14/T1-15 since it is the same function. Unset `JWKS_URI` — or either new expectation — yields **500 `server_error`** and an operator-facing log naming which knob is missing. **The check runs before the token is parsed**, which is stronger than the criteria asked: a server that cannot verify a signature must not render *any* verdict on the token, so even the `events`-claim rejection became a 500 rather than a true-but-unearned 400. `FED-W5` is the same bug in the federation service and stays in **T1-18**. Same fix pattern as the two sibling instances `PROGRESS.md:1239-1241` names. |
| BCL-W4 | Configure `JWKS_URI`, or state that receipt is not runnable | S | ⚠️ **Half done 2026-08-13 — the tutorial now says so plainly**, and the endpoint says so itself with a `500` naming the missing setting rather than blaming the token. **The receipt path was also proven runnable**: T1-14's verification stood up a local JWKS and drove all seven cases through the live server, so "not runnable" is now "not configured", which is a different and much smaller claim. Configuring it permanently is a deployment decision, not a code one. |
| BCL-W5 | Advertise the capability and register one `backchannel_logout_uri` | S | `backchannel_logout_supported: true` in discovery and one client with a URI, so F-4's code path executes for the first time. **Blocked on RPL-W2** — do not register a URI while `id_token_hint` is unverified. |
| BCL-W6 | Replace the duplicate client-listing `fetch()` with `authleteApi.client.list` | S | The only remaining raw `fetch()` to Authlete is the justified one at `:34`. |
| BCL-W7 | Add `Cache-Control: no-store` to the receiver's response | S | ✅ **DONE 2026-08-13**, with T1-14/T1-15 — same function, and set before any branch so it is present on the 400 and 500 paths too. Verified live. |

**Ordering and gating.** RPL-W2 → BCL-W5. BCL-W1 and BCL-W2 both touch `controllers/logout.controller.ts`,
which is **not** on the `AGENTS.md` **Security-critical surfaces** list despite validating a signed assertion and
terminating sessions — the third such gap in the list found in this batch.
