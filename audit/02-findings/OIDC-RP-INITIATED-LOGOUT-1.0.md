# OpenID Connect RP-Initiated Logout 1.0

> ## ⚠️ REMEDIATED as far as the vendor permits (2026-08-10 open redirect, 2026-08-11 hint verification, 2026-08-12 confirmation step **and** per-client matching) — severity **S1 → S4**. All five work items closed; one residue is a vendor limitation
>
> **This entry's findings and work items below describe the pre-fix code.** They are kept as the evidence.
> Read this banner first; `04-remediation-plan.md` §1.1 row 2 is the authority on current state.
>
> **What shipped (2026-08-10).** `isAllowedPostLogoutRedirectUri` (then at `:90-127`, now `:131-138`)
> parses the value with `new URL()` and compares **origins exactly**: `LOGOUT_REDIRECT_URI` by full-URI
> equality, `ALLOWED_ORIGINS` entries by origin, plus a non-production `hostname === "localhost"` clause so the
> labs keep working. A malformed allowlist entry is **dropped** rather than widening the allowlist. Unparseable
> values and non-http(s) schemes are refused. **Both verified payloads are now refused** — F-1's
> `http://localhost:3000.evil.example.com/bye` (where the allowed origin was a prefix of the attacker's
> hostname) and `http://localhost:3001@evil.example.com/` (where everything before `@` is userinfo). 14
> regression tests in `server/tests/unit/services/logout.service.test.ts`.
>
> **What did *not* ship, and this is the important part: the fix is not RPL-W1.** RP-Initiated Logout §3 wants
> exact matching against each client's **registered** `post_logout_redirect_uris`. No client here registers
> any, so the deployment kept an **environment-driven** allowlist. Both designs are safe; only one is §3.
> RPL-W1 is therefore still open and is sequenced in `04-remediation-plan.md` as **T0-4**, deliberately behind
> **RPL-W4** (register the URIs first — matching an empty set would break the SPA's logout).
>
> | Item | State |
> |---|---|
> | The open redirect (F-1's exploitable half) | ✅ **closed 2026-08-10** |
> | **RPL-W1** — match the client's registered set | ✅ **DONE 2026-08-12 (T0-4)** — `isAllowedPostLogoutRedirectUri` is now `===` against the identified client's set; `ALLOWED_ORIGINS`, `LOGOUT_REDIRECT_URI` and the non-production `localhost` clause no longer authorise anything. Client identity comes from `client_id`, else a verified hint's `aud`; **no client ⇒ no redirect** |
> | **RPL-W2** — verify `id_token_hint` before trusting `sub` | ✅ **DONE 2026-08-11 (T0-2)** — `utils/verify-id-token-hint.ts`, called at `logout.service.ts:176`. Signature against the OP's own JWKS, `iss` from live discovery, `aud` pinned when `client_id` is supplied; `alg: none` and `HS*` refused. **This unblocks BCL-W5** — a client may now register a `backchannel_logout_uri` |
> | **RPL-W3** — the §2 confirmation MUST (F-2) | ✅ **DONE 2026-08-12 (T0-3)** — `GET /api/logout` renders `views/logout-confirm.ejs` with a CSRF token and destroys nothing; `POST /api/logout` does the work, behind `csrfProtection`. The question is asked **unconditionally**, satisfying §2's SHOULD as well as its MUST. `docs/DATA-FLOWS.md`'s long-standing description of a confirmation page and a `POST /api/logout` is now true |
> | **RPL-W4** — register `postLogoutRedirectUris` | ⚠️ **CLOSED 2026-08-12, but not as written — see F-4.** Authlete 3.0 has **no client field for post-logout redirect URIs**, so there is nothing to register on the client. The registry is the deployment's own `POST_LOGOUT_REDIRECT_URIS`, and the three clients are populated there |
> | **RPL-W5** — name the departure from §3 in `AGENTS.md` | ✅ **DONE 2026-08-12** — the bullet now states the rule, the vendor gap behind it, and the three things not to undo. The departure it records has changed shape: it is no longer *"we match origins, not registered values"* but *"we match registered values, held here rather than in client metadata"* |
>
> Both `services/logout.service.ts` and `controllers/logout.controller.ts` were added to `AGENTS.md`'s
> Security-critical surfaces list in the same change, which closes half of `RESUME.md` §5.3.
>
> **Severity.** S1 → S2 (2026-08-11) → S3 (2026-08-12, confirmation) → **S4** (2026-08-12, per-client
> matching). The exploitable open redirect is gone, the `id_token_hint` forgery route is gone, the CSRF-able
> `GET` is gone, and the redirect decision is now per-client and exact. **The residue is not a defect of this
> implementation**: §3's registration model cannot be honoured on Authlete 3.0 in the form the specification
> describes, because the vendor has no client field for it (F-4). The security property §3 exists to provide
> — a client may only be returned to a URI registered *for that client* — is met.
>
> **What is deliberately still open, so it stays visible:** `GET`/`POST /api/logout` carry **no rate
> limiter** (F-1's second aggravating factor). T0-3 shipped RPL-W3's acceptance criteria and nothing else;
> adding a limiter was considered and left out rather than folded in silently.
>
> **One citation in this entry could not be renumbered — it had to be reworded.** F-1 quoted
> `PROGRESS.md:401`'s *"Fix is one line…"*, and that sentence was **deleted** when the fix was recorded. See
> the note at F-1's end. This is the drift class that produced this banner in the first place.

- **Verdict:** `PARTIAL` — and the remaining gap is the vendor's, not the code's (F-4)
- **Severity:** **S4** — was S1, then S2, then S3; see the banner above
- **Original severity:** **S1** (F-1's open redirect, fixed 2026-08-10)
- **Status:** OpenID **Final**, **12 September 2022** — re-verified against the primary source this session
- **Authlete version:** 3.0 — **no Authlete API**; this specification is implemented wholly in local code
- **Repo docs under test:** `docs/curriculum/modules/08-oidc-core-and-logout/lab.md` Exercise 6b, `AGENTS.md` logout paragraph, `client/src/components/oidc/LogoutSection.tsx`, `docs/curriculum/SPEC-INVENTORY.md:183`

<thinking>
1. Requirements on the OP: §2 — `id_token_hint` RECOMMENDED, everything else OPTIONAL; the OP *"MUST ask the
   End-User this question if an `id_token_hint` was not provided or if the supplied ID Token does not belong to
   the current OP session."* §3 — *"The OP also MUST NOT perform post-logout redirection if the
   `post_logout_redirect_uri` value supplied does not exactly match one of the previously registered
   `post_logout_redirect_uris` values"*, and `state` is echoed. §2.1 — `end_session_endpoint` is REQUIRED
   metadata.
2. Authlete boundary: **none**. There is no Authlete logout API; `services/logout.service.ts` is the whole
   implementation. So every defect here is this repo's own, and every requirement is this repo's to meet.
3. Code: three MUST-level failures in 35 lines — prefix matching instead of exact matching against registered
   values, no confirmation step, and an `id_token_hint` that is decoded but never verified.
4. Docs: Module 08 Exercise 6b *finds* the open redirect and `PROGRESS.md` records it with live payloads.
   `AGENTS.md` describes the validation as if it were adequate.
5. Delta: the spec requires exact matching against **registered** values; no client here registers any, so the
   conforming behaviour is to never redirect. The code instead redirects to attacker-controlled hosts.
6. Nothing unresolved — the two bypass payloads were verified live by the repo, and I can trace both through
   the code line by line.
</thinking>

## Normative requirements (OP side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Accept `id_token_hint`, `logout_hint`, `client_id`, `post_logout_redirect_uri`, `state`, `ui_locales` | §2 | ⚠️ four of six read (`services/logout.service.ts:16-17`); `logout_hint` and `ui_locales` ignored (both OPTIONAL, so acceptable) |
| 2 | **MUST NOT** redirect unless `post_logout_redirect_uri` **exactly matches** a **previously registered** value | §3 | ⚠️ **fixed as far as the vendor permits, 2026-08-12** (was ❌ prefix matching, then origin matching against env vars). Now `===` against the **identified client's** set, and no client ⇒ no redirect. *"Exactly match"* ✅; *"previously registered"* ⚠️ — the registry is this deployment's, because Authlete 3.0 has no field for it. **`RPL-W1`**, F-1, F-4 |
| 3 | The OP **MUST** ask the End-User to confirm when no `id_token_hint` was supplied, or the ID Token is not for the current session | §2 | ✅ **fixed 2026-08-12** (was ❌ never asked; the session was destroyed unconditionally on a bare `GET`) — `GET /api/logout` renders a confirmation page, `POST /api/logout` acts; asked unconditionally, so §2's SHOULD is met too. **`RPL-W3`**, F-2 |
| 4 | Echo `state` on the post-logout redirect | §3 | ✅ `:75-77`, URL-encoded, with correct `?`/`&` separator handling |
| 5 | Advertise `end_session_endpoint` (REQUIRED) | §2.1 | ✅ live: `https://…/api/logout` (probe 3) |
| 6 | An `id_token_hint` is an ID Token — i.e. a signed assertion | §2 | ✅ **fixed 2026-08-11** (was ❌ `jwt.decode` only) — verified against the OP's JWKS with `iss`, and `aud` when `client_id` is given (`utils/verify-id-token-hint.ts`); **`RPL-W2`**, F-3 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Everything | **This server** | `services/logout.service.ts`, `controllers/logout.controller.ts:9-19,28-38` |
| Advertising `end_session_endpoint` | Authlete, from service config | value points at `/api/logout` |
| Terminating the Authlete-side session | *nobody* | no Authlete logout API exists; `nativeSso.logout` is a different feature |
| Verifying an `id_token_hint` | Authlete, indirectly | the OP's JWKS and issuer come from `jwks.service` / `discovery.service` (T0-2), cached 5 min |
| **Storing `post_logout_redirect_uris`** | **This server, by necessity** | Authlete 3.0 models no such client field — **F-4**. The registry is `POST_LOGOUT_REDIRECT_URIS` |

There is no vendor to delegate to and no vendor to blame. `01-spec-matrix.md` §1 records this correctly:
*"No Authlete API — wholly local."*

**One correction to that framing, added 2026-08-12.** *"Wholly local"* is right about the protocol and was
read as meaning the vendor is irrelevant here. It is not: **the vendor's data model decides whether §3 is
reachable at all**, and it is not (F-4). "No API to call" and "no constraint from the vendor" are different
claims, and this entry conflated them.

## Finding F-1 — the logout endpoint is an open redirect, and it survives production (S1) — ✅ **FIXED 2026-08-10**

> **Status:** closed by `isAllowedPostLogoutRedirectUri` in `services/logout.service.ts` — the value is now parsed
> with `new URL()` and compared by **exact origin**, with unparseable values and non-http(s) schemes refused. Both
> verified payloads are covered by regression tests. The finding text below is preserved as the historical record.
> **RPL-W1 done; RPL-W2/W3/W4 remain open** — in particular §3's per-client registered-URI requirement is still
> not met, because no client registers any.

`services/logout.service.ts:62-71`:

```ts
const allowedRedirectUri = process.env.LOGOUT_REDIRECT_URI || "http://localhost:3000";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()));
const isAllowed =
  post_logout_redirect_uri === allowedRedirectUri ||
  (process.env.NODE_ENV !== "production" && post_logout_redirect_uri.startsWith("http://localhost:")) ||
  [...allowedOrigins].some((origin) => post_logout_redirect_uri?.startsWith(origin));
```

The third clause is `startsWith` against each allowed **origin**, and it is **not gated on `NODE_ENV`**. With
`ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001` — the default in `AGENTS.md` — both of these pass:

| Payload | Why it passes | Result |
|---|---|---|
| `http://localhost:3000.evil.example.com/bye` | `startsWith("http://localhost:3000")` — the attacker's host merely *begins* with the allowed origin | **302 to the attacker** |
| `http://localhost:3001@evil.example.com/` | `startsWith("http://localhost:3001")`; everything before `@` is userinfo, so the real host is `evil.example.com` | **302 to the attacker** |

Both were **verified live** by the repo (`PROGRESS.md:1341-1356`, `modules/08…/lab.md:638-660`). With
`ALLOWED_ORIGINS=https://app.example.com` in production, `https://app.example.com.evil.net/` passes identically.

**Against the specification this is not a hardening gap, it is a MUST violation twice over.** §3:

> The OP also MUST NOT perform post-logout redirection if the `post_logout_redirect_uri` value supplied does not
> exactly match one of the previously registered `post_logout_redirect_uris` values.

- **"exactly match"** — prefix matching is precisely what the word "exactly" excludes.
- **"previously registered"** — probe 3 confirms **no client has `postLogoutRedirectUris`**. So on this deployment the set of registered values is empty for every client, and the conforming behaviour is to *never* redirect. The code has substituted a deployment-wide env allowlist for a per-client registration, which is a different security model with a weaker check.

Two aggravating factors:

1. **`GET /api/logout` carries no middleware at all** — no CSRF, no rate limiter, no authentication (`00-inventory.md` §3.5). So the redirect is reachable by any third-party page. *(Half closed 2026-08-12: `csrfProtection` now runs on both methods and the redirect is reachable only from a submitted confirmation form. **The rate limiter is still absent** — see F-2's banner.)*
2. **`AGENTS.md` presents this as working validation**: *"Logout endpoint validates `post_logout_redirect_uri` against `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` env vars."* True as a description of the mechanism, and it reads as an assurance.

**The fix is small and the repo already knew it.** The `PROGRESS.md` entry as it stood on 2026-08-10 read *"Fix is one line — exact comparison against a registered set."* **That sentence no longer exists**: the entry was rewritten when the fix shipped, and now records the fix instead (`PROGRESS.md:1341-1356`, with both fixes recorded at `:1622` — the 2026-08-10 origin comparison and its supersession by T0-4). Quoted here from the pre-fix revision (`git show b5e60d4~1:docs/curriculum/PROGRESS.md`, line 401) because the prediction is part of the finding's evidence. Note the contrast that same entry draws, which survives the rewrite at `PROGRESS.md:1346-1347`: the **authorization** endpoint gets exact matching right (400, no `Location`). Two redirect-validating code paths, one correct.

## Finding F-2 — the OP never asks the user to confirm logout (S2) — ✅ **FIXED 2026-08-12 (T0-3 / RPL-W3)**

> **Status:** closed. RP-Initiated Logout is now two requests. `GET /api/logout` renders
> `server/src/views/logout-confirm.ejs` — a question carrying a CSRF token, with every RP parameter replayed as
> a hidden field — and destroys nothing, delivers nothing, redirects nowhere. `POST /api/logout` does all of
> that, behind the same `middleware/csrf.ts` the device flow's browser paths use. Routes at
> `server/src/routes/logout.routes.ts:21-22`; the render is `showConfirmation` in `services/logout.service.ts:296`.
>
> **The question is asked unconditionally**, which satisfies §2's SHOULD as well as its MUST. The narrower
> reading — skip the page when a verified hint names the current session's subject — was considered and
> rejected: it leaves a `GET` that still destroys a session, so a captured `id_token_hint` would remain a
> forced-logout primitive. The failure scenario below is dead either way: `<img src="…/api/logout">` now
> renders a page nobody sees.
>
> Three consequences recorded because they surprise people. Parameters are read **body-first, query second**
> (§2 blesses both GET and POST for the request itself). The CSRF token is **single-use, and the logout
> destroys the session holding it**, so a scripted logout needs one `GET` per `POST` — verified live, a reused
> token returns `403`. And the confirmation page shows the destination only when
> `isAllowedPostLogoutRedirectUri` would honour it, so an unvetted URI is never echoed back at the user.
>
> 10 route tests in `server/tests/unit/routes/logout.routes.test.ts` plus 7 service tests. Reverting to a
> one-shot `GET` fails 8 of them. Module 08 Exercise 6b was **reframed, not retired** — its `GET` loop now
> demonstrates this fix and its new `POST` loop preserves the original open-redirect discrimination.
>
> **Still open on this endpoint:** no rate limiter (F-1's aggravating factor 1, second half). T0-3 shipped
> RPL-W3's acceptance criteria and deliberately nothing else.
>
> The finding text below is preserved as the historical record, with its **pre-fix** line numbers.

§2, quoted from the primary source this session:

> At the Logout Endpoint, the OP SHOULD ask the End-User whether to log out of the OP as well. Furthermore, the
> OP **MUST** ask the End-User this question if an `id_token_hint` was not provided or if the supplied ID Token
> does not belong to the current OP session.

`services/logout.service.ts:56-59` destroys the session and clears the cookie **before** any decision, on a bare
`GET`, with no confirmation page and no CSRF token. The `views/logout.ejs` render at `:89-94` happens *after* the
session is already gone — it is a confirmation of a completed logout, not a request for consent to one.

**Failure scenario.** `<img src="https://as.example/api/logout">` on any page the user visits logs them out of
the OP. That is the exact scenario the MUST exists to prevent: logout is a state-changing operation triggered by
a GET, so without confirmation it is CSRF-able by construction. The impact is nuisance rather than compromise —
which is why S2 and not S1 — but it also makes the F-1 open redirect trivially reachable, because the attacker
does not need the victim to intend to log out.

## Finding F-3 — `id_token_hint` is decoded but never verified (S2) — ✅ **FIXED 2026-08-11 (T0-2 / RPL-W2)**

> **Status:** closed. `utils/verify-id-token-hint.ts` verifies the hint's signature against the OP's own JWKS
> (Authlete's service key set, **not** `JWKS_URI`, which is unset here), checks `iss` against the live discovery
> document, and pins `aud` to `client_id` when the caller supplies it. `alg: none` and the whole `HS*` family are
> refused by an allowlist of the nine asymmetric algorithms `jsonwebtoken@9` can verify. An unverifiable hint
> yields **no subject**, so nothing is delivered; logout itself still completes. Called at
> `services/logout.service.ts:176`. 21 unit tests on the verifier plus 6 on the service; restoring the old
> trust-the-payload behaviour fails 4 of them, including the forged `alg: none` case.
>
> **`BCL-W5` is unblocked** — this was the item that had to land before any client could register a
> `backchannel_logout_uri`.
>
> **Two consequences to know about.** `idTokenSignAlg` is **`HS256` on client `1523514379`** (probe 2 §7);
> HS256 is symmetric, so that client's hints are now ignored and its users log out via the session cookie
> instead. Moving it to `ES256` is one console field, adjacent to **T1-5**. And **`exp` is deliberately not
> enforced** — a hint is an old token by definition — which is stated in the code as this deployment's decision;
> whether §2 addresses expired hints explicitly is marked `UNVERIFIED` there.
>
> The finding text below is preserved as the historical record, with its **pre-fix** line numbers.

`services/logout.service.ts:22-32` uses `jwt.decode` — no signature verification, no `iss`/`aud` check, no
expiry check — and takes `payload.sub` as the subject. That subject is then used to trigger back-channel logout
delivery (`:44-46`).

So an unauthenticated caller can hand-craft an unsigned JWT naming any subject and call
`GET /api/logout?backchannel=true&id_token_hint=<forged>` to trigger back-channel logout **for that user across
every registered RP**. §2 defines `id_token_hint` as *"ID Token previously issued by the OP"* — an assertion,
whose value is its signature.

**Currently inert, and that is luck, not design.** Probe 3 shows no client has `backChannelLogoutUri`, so
`issueAndDeliverToAll` has zero recipients (see `OIDC-BACKCHANNEL-LOGOUT-1.0.md` F-4). The moment one client
registers one — the obvious first step to making back-channel logout demonstrable — this becomes a remote
forced-logout primitive against arbitrary users. Recorded at S2 for that reason, and it should be fixed **before**
any back-channel logout URI is registered, not after.

## Finding F-4 — §3's registration model is unreachable: Authlete 3.0 has no client field for `post_logout_redirect_uris` (S3) — ⚠️ **MITIGATED 2026-08-12, not fixable as specified**

**§3 requires two things of a redirect target, and the second one has nowhere to live on this vendor.**

> The OP also MUST NOT perform post-logout redirection if the `post_logout_redirect_uri` value supplied does
> not exactly match one of the **previously registered** `post_logout_redirect_uris` values.

*"Exactly match"* is a comparison and is now met. *"Previously registered"* presumes a place to register, and
Authlete 3.0 does not model one.

**Evidence — three independent checks, all against `docs/openapi-spec.json` (Authlete API Explorer, 3.0.16),
2026-08-12:**

| Check | Result |
|---|---|
| `Client` schema properties containing *"post"* | **0 of 108** |
| Schemas anywhere defining a post-logout member | **0 of 33** |
| `ClientExtension` — the usual escape hatch | `requestableScopes`, `requestableScopesEnabled`, `accessTokenDuration`, `refreshTokenDuration`, `idTokenDuration`, `tokenExchangePermitted` — no logout member |

The only client-level logout fields Authlete defines are **`backchannelLogoutUri`** and
**`backchannelLogoutSessionRequired`**, and the only logout *paths* are `/backchannel/logout/token` and
`/nativesso/logout`. Neither concerns post-logout redirection.

**Confirmed live, and this is the part worth remembering.** A `client/update` carrying
`postLogoutRedirectUris` alongside the complete existing object returns **HTTP 200** and the field is
**silently discarded** — no error, no warning, no `resultCode` hinting at it. Run on all three clients; a
before/after diff showed the field absent and every other key byte-identical, with only `modifiedAt` moved.

> **A vendor that accepts and discards is worse than one that rejects.** A `400` would have taken minutes to
> diagnose. A `200` looks like success, and the failure only surfaces later as "logout redirects stopped
> working" with no signal pointing at the cause. When a configuration write is load-bearing for a security
> decision, **read it back** — do not trust the status code.

**Mitigation (RPL-W1, shipped).** The deployment holds the registry itself, in `POST_LOGOUT_REDIRECT_URIS`
(`{"<clientId>": ["<uri>", …]}`), and `registeredPostLogoutRedirectUris` reads it. So:

| §3 clause | Status |
|---|---|
| *"exactly match"* | ✅ `===` per element, byte for byte |
| *"one of the … values"* | ✅ a set, matched by membership |
| *"previously registered"* | ✅ registered before use, ⚠️ **here, not in client metadata** |
| *"post_logout_redirect_uris"* (per client) | ✅ per client — an unidentified client has an empty set and is never redirected |

**Why this is S3 and not higher.** No attacker gains anything: the security property §3 exists to provide is
met, and met more strictly than before, since a client can no longer borrow another client's targets. What is
lost is *interoperability* — an RP cannot self-register a post-logout URI through DCR, and an operator
configuring this deployment must know to edit an environment variable rather than the client. Both are real,
and both are the vendor's constraint rather than this code's.

**What would close it.** Nothing in this repository. Either Authlete adds the field, or the deployment moves
to an OP that models it. Recorded so the next person does not spend the afternoon this one cost.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title, Final, **12 Sep 2022** | `SPEC-INVENTORY.md:183` | **Confirmed** against `openid.net/specs/openid-connect-rpinitiated-1_0.html` this session | **Accurate** |
| Open redirect found, two payloads, "survives `NODE_ENV=production`", "Fix is one line — exact comparison against a registered set" | `PROGRESS.md:1341-1356`; `modules/08…/lab.md:638-660` | Confirmed by reading the code; matches §3 | **Accurate — and the analysis is better than the code** |
| "Logout endpoint validates `post_logout_redirect_uri` against `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` env vars" | `AGENTS.md` | Describes the mechanism; reads as assurance, and the mechanism is the defect | `DOC_INCORRECT` / **S1** |
| Nothing states that §3 requires matching against **registered client metadata**, not an env allowlist | all docs | F-1 — this is the design error beneath the string-matching bug | **Omission** / **S1** — ✅ **closed 2026-08-12**: stated in `AGENTS.md`, `docs/API.md`, `docs/DATA-FLOWS.md`, `server/.env.example`, `client/README.md`, `CURL-TEST.md` and Module 08 (README + lab Ex 6b) |
| Nothing states that Authlete cannot store `post_logout_redirect_uris` at all | all docs, and this entry until now | F-4 — the audit assumed the field existed and was merely unset. It does not exist | **Omission** / S3 — ✅ **closed 2026-08-12** |
| Nothing notes the §2 confirmation MUST | all docs | F-2 | **Omission** / S2 — ✅ **closed 2026-08-12**: `AGENTS.md` Quirks, `docs/API.md`, `docs/DATA-FLOWS.md`, `client/README.md`, `CURL-TEST.md` §11, `docs/BACKCHANNEL-LOGOUT-TUTORIAL.md`, Module 08 README + lab Ex 6b |
| A confirmation page and a `POST /api/logout` documented, though neither existed | `docs/DATA-FLOWS.md:159-166` (pre-fix numbering) | The diagram described the conforming design the code did not implement — documentation ahead of code rather than behind it, which no checker can catch | ✅ **made true 2026-08-12**, and the diagram's other branch (a `400` on an invalid redirect that never existed) corrected in the same pass |
| Nothing notes that `id_token_hint` is unverified | all docs | F-3 | **Omission** / S2 |

## Sources consulted

- OpenID Connect RP-Initiated Logout 1.0 §§2, 2.1, 3, 6 — `https://openid.net/specs/openid-connect-rpinitiated-1_0.html`, fetched this session. §3's exact-match MUST NOT and §2's confirmation MUST quoted verbatim.
- Live probe 3 (2026-08-10): `end_session_endpoint`, per-client `postLogoutRedirectUris` (absent on all three) — `SERVICE-CONFIG-PROBE.md` §8, §10
- Repo-sourced live evidence: `PROGRESS.md:1341-1356` (both bypass payloads, verified), `modules/08…/lab.md:638-660`
- Code: `services/logout.service.ts` (whole file, esp. `:16-17,22-32,44-46,56-59,62-71,75-77`), `controllers/logout.controller.ts:9-19,28-38`, `routes/logout.routes.ts:21-22`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| RPL-W1 | **Replace prefix matching with exact matching against registered `post_logout_redirect_uris`** | S | ✅ **DONE 2026-08-12 (T0-4).** Both verified payloads are refused; the comparison is `===` against the client's registered set; no URI ⇒ no redirect, per §3. **One criterion could not be met as written** — *"obtained from the client metadata"* — because Authlete 3.0 has no such metadata (F-4); the set comes from `POST_LOGOUT_REDIRECT_URIS` instead. |
| RPL-W2 | Verify `id_token_hint` before trusting `sub` | S | ✅ **DONE 2026-08-11 (T0-2).** Signature verified against the OP's JWKS, plus `iss` and `aud`; an unverifiable hint yields "no subject" rather than an attacker-chosen one. **Must land before any client registers a `backchannel_logout_uri`.** |
| RPL-W3 | Add a confirmation step | M | ✅ **DONE 2026-08-12 (T0-3).** A GET renders a confirm page carrying a CSRF token; the session is destroyed only on POST. Satisfies §2's MUST — and its SHOULD, since the question is unconditional — and closes the CSRF-able GET. |
| RPL-W4 | Register `postLogoutRedirectUris` on the clients | S | ⚠️ **CLOSED 2026-08-12 — the premise was wrong.** There is no client field to register into (F-4); the attempt returned 200 and was discarded. The three clients are registered in `POST_LOGOUT_REDIRECT_URIS` instead, which is what gives RPL-W1 something to match. |
| RPL-W5 | Correct `AGENTS.md` and Module 08 | S | ✅ **DONE 2026-08-12.** The departure is named — but it is now *where the registry lives*, not *what the rule is*. Module 08 Ex 6b teaches the vendor gap as its closing lesson. |

**Ordering and gating.** W4 then W1 — matching an empty set would break the SPA's logout flow. W2 before any
back-channel logout URI is registered; ✅ satisfied, W2 landed 2026-08-11 and no URI is registered yet. W3 is
independent of all three and shipped 2026-08-12.

*(The paragraph here used to argue that `services/logout.service.ts` belonged on the `AGENTS.md` **Security-critical
surfaces** list. That was raised at Gate 4 and **accepted** — both it and `controllers/logout.controller.ts` were
added on 2026-08-10, alongside `routes/device.routes.ts`. See `04-remediation-plan.md` §6.4 and DR-12.)*
