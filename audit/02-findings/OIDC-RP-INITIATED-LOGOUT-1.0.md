# OpenID Connect RP-Initiated Logout 1.0

> ## ⚠️ PARTIALLY FIXED 2026-08-10 — the open redirect is closed; severity **S1 → S2**. Three work items remain
>
> **This entry's findings and work items below describe the pre-fix code.** They are kept as the evidence.
> Read this banner first; `04-remediation-plan.md` §1.1 row 2 is the authority on current state.
>
> **What shipped (2026-08-10).** `isAllowedPostLogoutRedirectUri` (`server/src/services/logout.service.ts:33-70`)
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
> | **RPL-W1** — match the client's registered set | ⬜ open — **T0-4**, after RPL-W4 |
> | **RPL-W2** — verify `id_token_hint` before trusting `sub` | ⬜ open — **T0-2**. `logout.service.ts:89` still calls `jwt.decode`, never `jwt.verify`, so the subject is attacker-chosen. **Blocks BCL-W5** |
> | **RPL-W3** — the §2 confirmation MUST (F-2) | ⬜ open — **T0-3**. `docs/DATA-FLOWS.md:159-166` already documents a confirmation page and a `POST /api/logout` that do not exist |
> | **RPL-W4** — register `postLogoutRedirectUris` | ⬜ open — console change, prerequisite for RPL-W1 |
> | **RPL-W5** — name the departure from §3 in `AGENTS.md` | ⬜ open — T2-17, pair with T0-4 |
>
> Both `services/logout.service.ts` and `controllers/logout.controller.ts` were added to `AGENTS.md`'s
> Security-critical surfaces list in the same change, which closes half of `RESUME.md` §5.3.
>
> **Severity.** S1 → **S2**: the exploitable open redirect is gone, and what remains is a real but
> non-exploitable conformance gap (§3's registered-set matching, §2's confirmation) plus RPL-W2, which is
> tracked as its own Tier-0 item. RPL-W2 alone would justify S2 on its own.
>
> **One citation in this entry could not be renumbered — it had to be reworded.** F-1 quoted
> `PROGRESS.md:401`'s *"Fix is one line…"*, and that sentence was **deleted** when the fix was recorded. See
> the note at F-1's end. This is the drift class that produced this banner in the first place.

- **Verdict:** `PARTIAL`
- **Severity:** **S2** — was S1; see the banner above
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
| 2 | **MUST NOT** redirect unless `post_logout_redirect_uri` **exactly matches** a **previously registered** value | §3 | ❌ **prefix matching against env vars; no client registers any URI** — F-1 |
| 3 | The OP **MUST** ask the End-User to confirm when no `id_token_hint` was supplied, or the ID Token is not for the current session | §2 | ❌ never asks; the session is destroyed unconditionally at `:56` — F-2 |
| 4 | Echo `state` on the post-logout redirect | §3 | ✅ `:75-77`, URL-encoded, with correct `?`/`&` separator handling |
| 5 | Advertise `end_session_endpoint` (REQUIRED) | §2.1 | ✅ live: `https://…/api/logout` (probe 3) |
| 6 | An `id_token_hint` is an ID Token — i.e. a signed assertion | §2 | ❌ `jwt.decode` only, no signature check — F-3 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Everything | **This server** | `services/logout.service.ts`, `controllers/logout.controller.ts:9-19` |
| Advertising `end_session_endpoint` | Authlete, from service config | value points at `/api/logout` |
| Terminating the Authlete-side session | *nobody* | no Authlete logout API exists; `nativeSso.logout` is a different feature |

There is no vendor to delegate to and no vendor to blame. `01-spec-matrix.md` §1 records this correctly:
*"No Authlete API — wholly local."*

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

Both were **verified live** by the repo (`PROGRESS.md:495-510`, `modules/08…/lab.md:638-660`). With
`ALLOWED_ORIGINS=https://app.example.com` in production, `https://app.example.com.evil.net/` passes identically.

**Against the specification this is not a hardening gap, it is a MUST violation twice over.** §3:

> The OP also MUST NOT perform post-logout redirection if the `post_logout_redirect_uri` value supplied does not
> exactly match one of the previously registered `post_logout_redirect_uris` values.

- **"exactly match"** — prefix matching is precisely what the word "exactly" excludes.
- **"previously registered"** — probe 3 confirms **no client has `postLogoutRedirectUris`**. So on this deployment the set of registered values is empty for every client, and the conforming behaviour is to *never* redirect. The code has substituted a deployment-wide env allowlist for a per-client registration, which is a different security model with a weaker check.

Two aggravating factors:

1. **`GET /api/logout` carries no middleware at all** — no CSRF, no rate limiter, no authentication (`00-inventory.md` §3.5). So the redirect is reachable by any third-party page.
2. **`AGENTS.md` presents this as working validation**: *"Logout endpoint validates `post_logout_redirect_uri` against `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` env vars."* True as a description of the mechanism, and it reads as an assurance.

**The fix is small and the repo already knew it.** The `PROGRESS.md` entry as it stood on 2026-08-10 read *"Fix is one line — exact comparison against a registered set."* **That sentence no longer exists**: the entry was rewritten when the fix shipped, and now records the fix instead (`PROGRESS.md:495-510`, with the `**Fix:**` sentence at `:502`). Quoted here from the pre-fix revision (`git show b5e60d4~1:docs/curriculum/PROGRESS.md`, line 401) because the prediction is part of the finding's evidence. Note the contrast that same entry draws, which survives the rewrite at `PROGRESS.md:500-501`: the **authorization** endpoint gets exact matching right (400, no `Location`). Two redirect-validating code paths, one correct.

## Finding F-2 — the OP never asks the user to confirm logout (S2)

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

## Finding F-3 — `id_token_hint` is decoded but never verified (S2)

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

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title, Final, **12 Sep 2022** | `SPEC-INVENTORY.md:183` | **Confirmed** against `openid.net/specs/openid-connect-rpinitiated-1_0.html` this session | **Accurate** |
| Open redirect found, two payloads, "survives `NODE_ENV=production`", "Fix is one line — exact comparison against a registered set" | `PROGRESS.md:495-510`; `modules/08…/lab.md:638-660` | Confirmed by reading the code; matches §3 | **Accurate — and the analysis is better than the code** |
| "Logout endpoint validates `post_logout_redirect_uri` against `ALLOWED_ORIGINS` and `LOGOUT_REDIRECT_URI` env vars" | `AGENTS.md` | Describes the mechanism; reads as assurance, and the mechanism is the defect | `DOC_INCORRECT` / **S1** |
| Nothing states that §3 requires matching against **registered client metadata**, not an env allowlist | all docs | F-1 — this is the design error beneath the string-matching bug | **Omission** / **S1** |
| Nothing notes the §2 confirmation MUST | all docs | F-2 | **Omission** / S2 |
| Nothing notes that `id_token_hint` is unverified | all docs | F-3 | **Omission** / S2 |

## Sources consulted

- OpenID Connect RP-Initiated Logout 1.0 §§2, 2.1, 3, 6 — `https://openid.net/specs/openid-connect-rpinitiated-1_0.html`, fetched this session. §3's exact-match MUST NOT and §2's confirmation MUST quoted verbatim.
- Live probe 3 (2026-08-10): `end_session_endpoint`, per-client `postLogoutRedirectUris` (absent on all three) — `SERVICE-CONFIG-PROBE.md` §8, §10
- Repo-sourced live evidence: `PROGRESS.md:495-510` (both bypass payloads, verified), `modules/08…/lab.md:638-660`
- Code: `services/logout.service.ts` (whole file, esp. `:16-17,22-32,44-46,56-59,62-71,75-77`), `controllers/logout.controller.ts:9-19`, `routes/logout.routes.ts:7`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| RPL-W1 | **Replace prefix matching with exact matching against registered `post_logout_redirect_uris`** | S | Both verified payloads are refused; the comparison is `===` against the client's registered set, obtained from the client metadata rather than from `ALLOWED_ORIGINS`; no URI ⇒ no redirect, per §3. Tests cover both bypasses and the userinfo-`@` form. **Highest-priority item in this batch.** |
| RPL-W2 | Verify `id_token_hint` before trusting `sub` | S | Signature verified against the OP's JWKS, plus `iss` and `aud`; an unverifiable hint yields "no subject" rather than an attacker-chosen one. **Must land before any client registers a `backchannel_logout_uri`.** |
| RPL-W3 | Add a confirmation step | M | A GET renders a confirm page carrying a CSRF token; the session is destroyed only on POST. Satisfies §2's MUST and closes the CSRF-able GET. |
| RPL-W4 | Register `postLogoutRedirectUris` on the clients | S | Gives RPL-W1 something to match against. Console change, and it is a prerequisite for W1 being useful rather than simply refusing everything. |
| RPL-W5 | Correct `AGENTS.md` and Module 08 | S | The env-allowlist model is named as a departure from §3, and the paragraph stops reading as assurance. |

**Ordering and gating.** W4 then W1 — matching an empty set would break the SPA's logout flow. W2 before any
back-channel logout URI is registered. `services/logout.service.ts` is **not** on the `AGENTS.md`
**Security-critical surfaces** list; given that it decides where a user agent is sent after session
destruction and reads an unverified assertion, that is a second gap in the list worth raising at Gate 4
alongside `routes/device.routes.ts`.
