# OpenID Connect Core 1.0 incorporating errata set 2

- **Verdict:** `PARTIAL`
- **Severity:** **S2**
- **Status of the specification:** OpenID **Final**, *incorporating errata set 2*, **15 December 2023** — re-verified against the primary source this session
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/curriculum/modules/08-oidc-core-and-logout/` (all four files), `docs/curriculum/SPEC-INVENTORY.md:195-196`, `AGENTS.md` flags table

> **Batch note.** This entry was missing from B3, which covered RFC 8414, 9728, OIDC Discovery, 7591, 7592 and
> 8252 but never emitted an OIDC Core row. Written now so no spec in the inventory is silently dropped.

<thinking>
1. Requirements on the OP: §2 — five REQUIRED ID Token claims (`iss`, `sub`, `aud`, `exp`, `iat`), `auth_time`
   REQUIRED when `max_age` is used or requested as essential, `nonce` MUST be echoed when sent, `acr`/`amr`/`azp`
   OPTIONAL. §3.1.2.1 — `scope` MUST contain `openid`; `response_type`, `client_id`, `redirect_uri` REQUIRED;
   with `prompt=none` the OP MUST NOT display UI and MUST return an error if no user is authenticated.
   §3.1.2.6 — exactly four error codes for that case. §5.3.2 — the UserInfo `sub` MUST equal the ID Token's.
   §5.4 — claims requested by scope go to UserInfo when the access token comes from the token endpoint.
   §3.1.3.7 — thirteen validation steps, performed by the **Client**.
2. Authlete boundary: nearly all of it. The OP-side work this server owns is user authentication, consent,
   passing `subject`/`consentedClaims`/`acr`/`authTime` to `/auth/authorization/issue`, and mapping actions to
   HTTP. `claimShortcutRestrictive` is the §5.4 switch; `idTokenAudType` and `idTokenReissuable` are the other
   two levers.
3. Code: the flow is real and Module 08 verifies it end to end. One action is mishandled — `NO_INTERACTION` —
   and that is exactly the case §3.1.2.6 legislates for.
4. Docs: Module 08 is the most rigorously verified module in the repo. It quotes all thirteen §3.1.3.7 steps,
   reproduces the ID-token claim set, and *finds* the `prompt=none` defect itself.
5. Delta: (a) `prompt=none` returns neither success nor one of the four errors; (b) the OP advertises an ID
   Token signing algorithm set that omits RS256, which OIDC Discovery §3 makes a MUST; (c) 24-hour ID tokens;
   (d) the SPA does not perform §5.3.2's `sub` check, which the lab notes.
6. Nothing unresolved — the `prompt=none` mechanism is settled by the repo's own live diagnosis plus Authlete's
   published `NO_INTERACTION` description, both of which I read this session.
</thinking>

## Normative requirements (OP side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | ID Token contains `iss`, `sub`, `aud`, `exp`, `iat` | §2 | ✅ Authlete's — **verified live** (`modules/08…/lab.md:174-203` maps every claim to its requirement) |
| 2 | `auth_time` REQUIRED when `max_age` is used | §2 | ✅ **verified live** — `auth_time = iat`, delta 0 with `max_age=0` (`lab.md:520-536`) |
| 3 | `nonce` echoed when sent, absent when not | §2 | ✅ **verified live, both directions** (`lab.md:498-518`) |
| 4 | `scope` MUST contain `openid` for an OIDC request | §3.1.2.1 | ✅ Authlete's — verified by contrast (`lab.md:83-107`: no ID token without `openid`) |
| 5 | With `prompt=none`, no UI, and an error if no user is authenticated | §3.1.2.1 | ✅ **fixed 2026-08-12** (was ❌ 302 with an empty `Location`) — `NO_INTERACTION` decides and returns a code or a §3.1.2.6 error. **`OIDC-W1`**, F-1 |
| 6 | The error MUST be one of `interaction_required`, `login_required`, `account_selection_required`, `consent_required` | §3.1.2.6 | ❌ none is ever returned — F-1 |
| 7 | UserInfo `sub` equals the ID Token `sub` | §5.3.2 | ✅ OP side correct (both `admin`, verified `lab.md:620-637`); ❌ the repo's own client never checks it — F-4 |
| 8 | Scope-requested claims come from UserInfo when the AT is issued from the token endpoint | §5.4 | ✅ `claimShortcutRestrictive = true` live — matches `AGENTS.md`'s recommendation |
| 9 | `claims` request parameter with essential claims | §5.5 | ✅ Authlete's; `claims_parameter_supported = true` live; consented claims forwarded (`services/authorization.service.ts:90-95`) |
| 10 | Thirteen ID-Token validation steps | §3.1.3.7 | ⊘ **client-side by definition**; Module 08 Exercise 3 implements and runs all thirteen |
| 11 | `id_token_signing_alg_values_supported` MUST include RS256 | OIDC Discovery §3 | ❌ live value is `[HS256, HS512, ES256, HS384]` — F-2 |
| 12 | `subject_types_supported` | Discovery §3 | ✅ `["public","pairwise"]`; all three clients are `PUBLIC` |
| 13 | `acr_values_supported` | Discovery §3 | ❌ absent — see `RFC9470-…` F-5 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| ID Token construction, signing, claim assembly | Authlete | `authorization.issue` |
| §5.4 claim routing | Service flag | `claimShortcutRestrictive = true` |
| `aud` as string vs array | Service flag | `idTokenAudType` — **absent** live (`AGENTS.md` recommends `"string"`) |
| ID Token reissuance on refresh | Service flag | `idTokenReissuable = false` → the handled `ID_TOKEN_REISSUABLE` action is dead on this service (probe 1 §3.3) |
| End-user authentication and consent | **This server** | `controllers/session.controller.ts`, `views/login.ejs`, `views/consent.ejs` |
| `subject`, `consentedClaims`, `acr`, `authTime` | **This server** | `services/authorization.service.ts:79-107` |
| Action → HTTP mapping, incl. `NO_INTERACTION` | **This server** | `controllers/authorization.controller.ts:32-144` — **F-1** |
| The thirteen validation steps | **The client** | `modules/08…/lab.md:204-399` (lab script); **not** in the SPA |

## Finding F-1 — `prompt=none` returns a dead redirect instead of one of §3.1.2.6's four errors (S2) — ✅ **FIXED 2026-08-12 (T1-7)**

> **Status:** closed, **together with `RFC9470-…` F-3**, which is the only safe way to close it.
> `case "NO_INTERACTION"` now calls `decideWithoutInteraction` — Authlete's documented contract: decide
> without UI, then issue or fail. Order: `NOT_LOGGED_IN` → `CONSENT_REQUIRED` →
> `checkStepUpRequirements` (`utils/step-up.ts`) → issue.
>
> Verified live: `prompt=none` with no session now returns
> `302 …?error=login_required&…&state=p1&iss=…`; with a session and stored consent it returns a real code;
> with `max_age=0` against a two-second-old session it refuses. The empty `Location` is gone.
>
> **The dead `INTERACTION` + `prompt=none` branch was not deleted — it delegates to the same function**, so
> the two cannot diverge if Authlete's action ever changes. The finding text below is the historical record.
>
> **⚠️ Correction to this finding's framing, found 2026-08-12 during T1-4.** Both this entry and
> `RFC9470-…` F-3 describe `NO_INTERACTION` as *the `prompt=none` path*. **It is not the only one.** A request
> carrying **no `prompt` parameter at all** reaches the same action if it asks for `offline_access`, because
> OIDC Core §11 requires explicit consent for it — verified live, all four combinations, in
> `SERVICE-CONFIG-PROBE.md` §16. So **before T1-7 every `offline_access` request without `prompt=consent`
> also got the empty `Location`**: a second live symptom of this S1, on a request shape nobody was looking at.
> T1-7 fixed both, and the fix returns `consent_required` — correctly, one of §3.1.2.6's four.

Reproduced in the repo's own lab (`modules/08…/lab.md:538-560`):

```
HTTP/1.1 302 Found
Location:
```

Not a success, not an error — an empty redirect, with or without an established session. The mechanism, from
the lab's own diagnosis at `:560-575` and confirmed by Authlete's published action description
(`docs/openapi-spec.json`: *"When the value of `action` is `NO_INTERACTION` … the service must follow the steps
described below"*): Authlete answers `prompt=none` with `NO_INTERACTION`, `responseContent: null` and a ticket,
meaning *decide without showing UI, then call issue or fail*. `controllers/authorization.controller.ts:50-53`
treats it as though `responseContent` held a redirect URL, so `res.redirect(null ?? "")` emits `Location:` empty.

§3.1.2.1 requires the OP not to display UI **and** to return an error when it cannot proceed silently; §3.1.2.6
enumerates the only four acceptable errors. This returns none of them.

**Failure scenario.** `prompt=none` is how every SPA performs a silent session check. A client here receives a
302 to nowhere: it cannot classify the outcome as "still signed in", "needs login", or "needs consent", so
silent renewal is impossible and the failure is unattributable. `PROGRESS.md:1209-1210` puts it well — *"breaks
every client that relies on silent renewal, in a way the client cannot classify."*

**Two things make this more than a one-line fix**, and both must be in the same change:

1. The controller *does* contain `prompt=none` handling — at `authorization.controller.ts:96-131`, inside `case "INTERACTION"`, which a `prompt=none` request never reaches. Dead code that reads as a feature.
2. **That dead code fabricates the authentication event.** `:107-112` invents `acr: "pwd"` and `auth_time: now` when the session has no recorded context. Routing `NO_INTERACTION` into it without deleting that fallback converts a broken-but-honest endpoint into a working-but-lying one. Full analysis in `RFC9470-step-up-authentication.md` F-3; the work item is **9470-W3**.

## Finding F-2 — the advertised ID Token signing algorithms omit RS256 (S3) — ✅ **FIXED 2026-08-12 (T1-2)**

> **Fixed banner.** One RSA-2048 key (`kid: "rsa-1"`, `use: "sig"`, **no `alg` member**) was appended to the
> service JWK Set on 2026-08-12. `service/update` round-tripped all **129 fields**; a key-by-key diff shows
> **`jwks` and `modifiedAt` changed and nothing else**. `id_token_signing_alg_values_supported` is now
> `[PS384, RS384, HS256, HS512, ES256, RS256, HS384, PS256, PS512, RS512]` — **RS256 present, Discovery §3's
> MUST satisfied**, and PS256 with it, which closes **FAPI1A-W2** in the same write. **OIDC-W2 is closed.**
> The paragraphs below describe the pre-fix state.
>
> **Three things this turned up that the finding did not predict.** (1) The recomputation is not confined to
> ID tokens: `userinfo_`, `introspection_` and `authorization_signing_alg_values_supported` gained the same
> six entries, because all four are derived from the same key set — so one key changed four advertised
> lists. (2) Omitting `alg` is what yields six algorithms from one key (RFC 7517 §4.4, verified against the
> primary source this session: *"Use of this member is OPTIONAL"*); pinning `alg: RS256` would have
> satisfied Discovery and left FAPI's PS256 absent. (3) **Advertised was checked against usable**, per this
> audit's own Theme 1: a client set to `RS256` was issued an ID token headed `{"kid":"rsa-1","alg":"RS256"}`
> which verified against the published key. Nine of the ten advertised algorithms remain unexercised.

Live before the fix: `id_token_signing_alg_values_supported = ["HS256","HS512","ES256","HS384"]`.

OIDC Discovery 1.0 §3, quoted verbatim from the primary source this session: *"The algorithm RS256 MUST be
included."* It is not. The list is generated by Authlete from the service's key set, so the fix is a registered
RSA key, not code.

`modules/08…/lab.md:758-772` already finds this, quotes the same sentence, and rates it *"A conformance defect,
low severity — RS256 is not otherwise needed here — but exactly the kind of thing an interop test suite fails
you on."* I agree with the severity and record it here because **B3's discovery entry does not mention it** —
this row is where it belongs.

Related and separate: `userinfo_signing_alg_values_supported` includes **`none`**, and client `1523514379` signs
ID Tokens with **HS256** (probe 2 §7 — the other two use ES256, so `PROGRESS.md`'s "both test clients" is one
client). HS256 means the ID Token's integrity rests on a secret the client already holds, so it cannot be
verified by any third party — acceptable for a confidential-client demo.

> **The clause that used to end that paragraph was wrong, and it survived three phases of the audit.** It read
> *"and the reason Module 08's asymmetric validation branch (`lab.md:365-399`) remains unexercised."* The
> branch was never blocked: only the **confidential** client is `HS256`, and the two public clients have been
> `ES256` throughout — a fact recorded two paragraphs up, in this same finding. The lab's own `UNVERIFIED`
> marker made the same error (*"Both clients here are still `HS256`"*), and `04-remediation-plan.md` §6.2
> then inherited it as *"Module 08 asymmetric ID-token validation | **OIDC-W2** | the branch has never run"*.
> **Nothing was blocking it and nobody had run it.** Run 2026-08-12 against `$PUB_CLIENT_ID`: all thirteen
> applicable steps `PASS`. The marker is retired — but by *running the branch*, not by OIDC-W2, which is a
> different claim from the one §6.2 makes.

## Finding F-3 — 24-hour ID Tokens (S3)

`idTokenDuration = 86400` (probe 2). An ID Token is an authentication receipt consumed once at sign-in; a
24-hour lifetime turns it into a long-lived bearer of identity claims, and §3.1.3.7 step 9 (*"Check `iat` claim
isn't too distant"*) becomes the only thing bounding replay — a check the spec leaves to client policy.
`PROGRESS.md:1759` records this as *"flagged as a Module 07 report item rather than a Module 08 finding"*, which
is a reasonable call; it is recorded here so the OIDC Core row is complete. Note `accessTokenDuration` is also
86400 and `refreshTokenDuration` 864000 (10 days).

## Finding F-4 — the repo's own client does not perform the §5.3.2 `sub` check (S3)

`modules/08…/lab.md:632-637` makes the case exactly right — *"the access token and the ID token are separate
artefacts, and a mismatch means they describe different people … two lines and it is the difference between
'I fetched a profile' and 'I fetched *this user's* profile'"* — and then leaves it as a mental template. The
SPA fetches UserInfo and never compares `sub`.

This is the third instance of the same pattern: the repo teaches a client-side control it does not itself
implement (RFC 9207 §2.4 `iss` validation — `RFC9207-…` F-1; JARM response verification — `JARM-…` F-3; this).
All three land in the same file, `client/src/pages/CallbackPage.tsx`, and should be one work item.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"incorporating errata set 2"*, Final, 15 Dec 2023 | `SPEC-INVENTORY.md:195-196` | **Confirmed** against `openid.net/specs/openid-connect-core-1_0.html` this session | **Accurate** |
| All thirteen §3.1.3.7 steps quoted and implemented as a runnable validator | `modules/08…/lab.md:204-399` | The RFC confirms thirteen steps, performed by the Client | **Accurate** |
| `nonce` echoed / absent, both observed | `lab.md:498-518` | Matches §2's MUST | **Accurate** |
| `auth_time` present with `max_age`, equal to `iat` | `lab.md:520-536` | Matches §2's condition | **Accurate** |
| `prompt=none` → 302 with empty `Location`; four §3.1.2.6 errors named | `lab.md:538-575` | Reproduced; the repo found this itself | **Accurate** — and the defect is real, F-1 |
| RS256 omission, with the Discovery §3 quote | `lab.md:758-772` | Verbatim-correct quote; live value confirms | **Accurate** |
| §5.3.2 `sub` check explained as the client's job | `lab.md:632-637` | Correct; not implemented in the SPA — F-4 | **Accurate, gap unstated** / S3 |
| `claimShortcutRestrictive: true` — "Only embed scope-requested claims in ID token when no AT issued (OIDC Core §5.4)" | `AGENTS.md` flags table | Matches §5.4 as quoted, and the live value is `true` | **Accurate** |
| `idTokenAudType: "string"` recommended | `AGENTS.md` flags table | Live value **absent**, so the recommendation is unapplied | **Divergence** / S4 (already in probe 1 §2) |
| `idTokenReissuable: true` recommended | `AGENTS.md` flags table | Live `false` → the `ID_TOKEN_REISSUABLE` branch is dead on this service | **Divergence** / S4 (probe 1 §3.3) |

## Sources consulted

- OpenID Connect Core 1.0 incorporating errata set 2 §§2, 3.1.2.1, 3.1.2.6, 3.1.3.7, 5.3.2, 5.4, 5.5 — `https://openid.net/specs/openid-connect-core-1_0.html` (§5.4 and §5.3.2 quoted verbatim this session)
- OpenID Connect Discovery 1.0 incorporating errata set 2 §3 (`id_token_signing_alg_values_supported`, `claims_parameter_supported`, `subject_types_supported`, `acr_values_supported`), §§4.1, 4.3 — `https://openid.net/specs/openid-connect-discovery-1_0.html`
- Vendored Authlete API spec: `docs/openapi-spec.json`, `NO_INTERACTION` action description
- Live probes 2 and 3 (2026-08-10): the OIDC discovery members and service/client fields above — `SERVICE-CONFIG-PROBE.md` §5–§8
- Code: `controllers/authorization.controller.ts:32-144` (esp. `:50-53`, `:96-131`), `services/authorization.service.ts:79-107`, `controllers/session.controller.ts`, `controllers/userinfo.controller.ts`, `client/src/pages/CallbackPage.tsx:38-40`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| OIDC-W1 | Handle `NO_INTERACTION` per Authlete's contract | M | ✅ **DONE 2026-08-12 (T1-7), shipped with 9470-W3 as one change.** **Same change as 9470-W3 — do not split.** `prompt=none` returns one of §3.1.2.6's four errors via `authorization.fail`, or issues silently when a real session and consent exist; the fabricated `acr`/`auth_time` fallback is deleted; `acrs`/`acrEssential`/`maxAge` are honoured on this path. Unit tests per outcome. |
| OIDC-W2 | Register an RSA key so `id_token_signing_alg_values_supported` includes RS256 | S | ✅ **DONE 2026-08-12 (T1-2).** RSA-2048, `kid: "rsa-1"`, no `alg` member, appended to the service JWK Set by raw `service/update` (129 fields round-tripped; only `jwks` and `modifiedAt` moved). Discovery lists **RS256 and PS256**, so **FAPI1A-W2 closed with it**, and three sibling alg lists changed too. Verified from the discovery document, not the console, per §7.2's Tier 1 exit criterion — and then verified *usable* by issuing an RS256 ID token. The acceptance criterion's second clause was **wrong**: it did not "unblock Module 08's asymmetric validation branch", which was never blocked (see F-2's banner). Curriculum landed in the same commit: **CUR-3a-W3**, Module 08 §3d and §6d, Module 11. |
| OIDC-W3 | Implement the three client-side checks the curriculum teaches | M | `CallbackPage.tsx` validates `iss` (RFC 9207 §2.4), compares UserInfo `sub` to the ID Token `sub` (§5.3.2), and — if JARM is enabled — verifies the `response` JWT. One work item covering **9207-W1**, this, and **JARM-W3**. |
| OIDC-W4 | Review the three 24-hour lifetimes | S | ✅ **CLOSED 2026-08-12 (T1-4) by the second of its two branches — reviewed, and deliberately kept.** All three were shortened live (`accessTokenDuration`/`idTokenDuration` → 3600) and **reverted the same session**, because enumerating the blast radius showed it is not 36 transcripts but ~55 deployment-specific references, two of which are load-bearing pedagogy rather than output: **Module 07's audit lab** ranks the 24-hour lifetime as finding (iv), and **Module 10's thesis** — *individually acceptable settings combine into a defect* — uses the 24-hour token plus the grant-revocation SHOULD-gap as its worked example. At one hour both largely evaporate. The rationale is recorded in `PROGRESS.md`; **GM-W1 and FAPI1-W3 stay open with it**, which is the honest outcome rather than a silent one. The change was verified before reverting (`expires_in: 3600`, ID-token life 3600), so re-doing it is a one-field write plus the documentation pass. |
| OIDC-W5 | Apply or retire the two divergent flags | S | ⚠️ **HALF DONE 2026-08-12 (T1-4), and the other half is blocked by a code defect.** `idTokenAudType` → **`"string"`**, applied and verified: ID-token `aud` is now a bare string where it was `["…"]`, matching `AGENTS.md`'s recommendation and the Nov 2024 FAPI WG decision. **`idTokenReissuable` cannot be enabled yet.** Setting it `true` made the handled `ID_TOKEN_REISSUABLE` action reachable for the first time — and the branch is **broken**: it requires a `ticket` Authlete does not send, so every refresh request returned **HTTP 400 carrying a valid token body**, with no ID token reissued. Reverted to `false` within the session; recorded as **B1-W6**. **This is the item's own premise inverted** — it assumed "unreachable" meant untested-but-correct; the flag was in fact the only thing hiding the defect. ✅ **COMPLETED 2026-08-12 (B1-W6):** the branch now calls `POST /idtoken/reissue` — the API that exists for this action — instead of the ticket-consuming `/auth/token/issue`, and **`idTokenReissuable` is `true` and kept**. A refresh returns 200 with a reissued `id_token` whose `aud` is a string, `iat` advances and `auth_time` holds the original authentication time. Both flags are now applied, so **OIDC-W5 is closed**. See `B1-authlete-boundary.md` F-9. |

**Ordering and gating.** OIDC-W1 is the priority and touches `controllers/authorization.controller.ts` and
`controllers/session.controller.ts`, both on the **Security-critical surfaces** list — it needs a plan, and it
is the same plan as 9470-W3. OIDC-W2/W4/W5 are configuration. OIDC-W3 is client-side.
