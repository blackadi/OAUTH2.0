# RFC 9470 — OAuth 2.0 Step Up Authentication Challenge Protocol

- **Verdict:** `PARTIAL`
- **Severity:** **S3** — was S2 with a latent **S1** (F-3). **The latent S1 is retired**, not downgraded: the change that would have activated it (`OIDC-W1`) was built correctly instead, on 2026-08-12. What remains is documentation (F-4's citations, 9470-W1/W4/W6)
- **Authlete version:** 3.0
- **Repo docs under test:** `docs/STEP-UP-AUTH-TUTORIAL.md` (esp. Parts 4–6), `docs/curriculum/modules/09a-interaction-extensions/README.md:304`, `AGENTS.md` RFC 9470 paragraph, `docs/curriculum/SPEC-INVENTORY.md`

<thinking>
1. RFC requirements: §3 — the resource server's challenge is **HTTP 401** with
   `WWW-Authenticate: Bearer error="insufficient_user_authentication"`, optionally carrying `acr_values` and/or
   `max_age`; both examples in §3 are 401 and 403 is never mentioned. §4 — the client re-authorizes using those
   values. §6.1/§6.2 — `acr` and `auth_time` are conveyed either as RFC 9068 §2.2.1 JWT claims or as
   introspection response members. §7 — `acr_values_supported` from OIDC Discovery. The AS-side obligation is
   to attest *when* and *how* the user authenticated, truthfully.
2. Authlete boundary: Authlete returns `acrs`, `acrEssential` and `maxAge` on the authorization response,
   accepts `acr` and `authTime` on `/auth/authorization/issue`, generates the `insufficient_user_authentication`
   challenge in `responseContent`, and surfaces `acr`/`auth_time` on introspection. The AS owns the
   authentication event itself: deciding which ACR was satisfied, when it happened, and whether the request's
   requirements are met.
3. Code: three places. `session.controller.ts:108-164` records the event and checks ACR/max_age;
   `authorization.service.ts:100-107` passes them to Authlete; `introspection.controller.ts:76-101` parses the
   challenge back out. All three are real, and two of them contain a branch that cannot fire.
4. Docs: `STEP-UP-AUTH-TUTORIAL.md` is detailed and mostly right, but it prints the challenge as **403** twice
   and calls it RFC 9470-conforming.
5. Delta: (a) 403 vs §3's 401, in both code and docs; (b) the max_age comparison is against a value overwritten
   moments earlier, so it always passes; (c) the `prompt=none` path fabricates the authentication event, and is
   currently unreachable for an unrelated reason.
6. The interesting question is not "is the check wrong" but "can it ever run". Tracing that is what turned up
   F-3, and F-3 is the one finding in this batch that could become S1 through someone else's bug fix.
</thinking>

## Normative requirements

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | The challenge is **401** with `WWW-Authenticate: Bearer error="insufficient_user_authentication"` | §3 | ❌ **403** — F-1 |
| 2 | The challenge MAY carry `acr_values` and/or `max_age` | §3 | ✅ parsed and re-emitted (`introspection.controller.ts:85-92`) |
| 3 | The client re-authorizes using the challenge values | §4 | ✅ documented (`STEP-UP-AUTH-TUTORIAL.md` Part 6) and driven by `StepUpSection.tsx` |
| 4 | `acr` and `auth_time` conveyed in a JWT AT (§6.1) **or** on introspection (§6.2) | §6 | ✅ **§6.2 verified live** — `"auth_time":…,"acr":"pwd"` in the introspection response (`modules/04…/lab.md:180-184`). §6.1 unavailable (no JWT ATs — `RFC9068-…`) |
| 5 | The AS honours an essential `acr` it cannot satisfy by failing the request | §5 + OIDC | ✅ `ACR_NOT_SATISFIED` (`session.controller.ts:125-137`) |
| 6 | The AS honours `max_age` | §4, §5 + OIDC Core §3.1.2.1 | ❌ **the check can never fail** — F-2 |
| 7 | The authentication event reported to the AS must be the real one | §6, and the entire point of the spec | ❌ **fabricated on the `prompt=none` path** — F-3 (latent) |
| 8 | Advertise `acr_values_supported` | §7 | ❌ `supportedAcrs` absent (probe 1), so the value is not advertised — F-5 |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Returning `acrs` / `acrEssential` / `maxAge` on the authorization response | Authlete | stored at `authorization.controller.ts:90-92` |
| **Deciding which ACR was satisfied, and when** | **This server** | `session.controller.ts:110-111` — hardcoded `"pwd"`, `authTime = now` |
| **Enforcing the requirements** | **This server** | `session.controller.ts:121-157` |
| Binding `acr` / `authTime` to the tokens | Authlete, from `/auth/authorization/issue` | `services/authorization.service.ts:100-107` |
| Generating the `insufficient_user_authentication` challenge | Authlete | `responseContent` on `FORBIDDEN` |
| Turning that into an HTTP response | **This server** | `introspection.controller.ts:76-101` — **F-1** |
| Surfacing `acr` / `auth_time` to an RS | Authlete | `IntrospectionResponse.acr` / `.authTime` |

**The AS owns the part that matters.** Authlete can only stamp what it is told; the truthfulness of `acr` and
`auth_time` is entirely this server's responsibility. That is why F-3 is the most serious finding here even
though it is currently unreachable.

## Finding F-1 — the step-up challenge is a 403 where §3 requires 401 (S2)

`introspection.controller.ts:84-96` answers the `insufficient_user_authentication` case with **403** and a JSON
body, and `docs/STEP-UP-AUTH-TUTORIAL.md` Part 5 prints that twice under the heading *"it returns an error
conforming to RFC 9470"*:

```text
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  error_description="[A341302] The authentication context class 'pwd' is insufficient…",
  acr_values="urn:mace:incommon:iap:silver"
```

RFC 9470 §3's two examples are both `HTTP/1.1 401 Unauthorized`, and the section never mentions 403. The choice
is deliberate in the RFC: RFC 6750 §3.1 assigns 403 to `insufficient_scope`, and `insufficient_user_authentication`
is about the *authentication* being inadequate, which is 401 territory.

**Being fair about what this endpoint is.** `/api/introspection` is Authlete's proprietary introspection API,
called by a resource server, and Authlete's action here is `FORBIDDEN`. Mapping `FORBIDDEN` → 403 *for the
introspection response to the RS* is a defensible reading of the vendor contract. The defect is the conflation:
the tutorial presents this exact response as the challenge **the protected resource sends to the client**, and
its "What the client learns" table (`:238-244`) tells the reader the *client* consumes these fields. At that
point the status code is the RS→client status, and it must be 401.

**Failure scenario.** A learner builds a resource server from Part 5, returning 403 with the challenge header.
A conformant client — and most client libraries, which only inspect `WWW-Authenticate` on a 401 — never parses
it, so the step-up loop never starts. The user sees an unexplained failure instead of a re-authentication
prompt. The whole protocol is a challenge/response, and getting the challenge status wrong disables it.

## Finding F-2 — the `max_age` check compares a value against itself (S2)

`session.controller.ts`, in one handler, with `authz` bound at `:70` to the *same object* as
`req.session.authorization`:

```ts
// :70
const authz = req.session.authorization;
…
// :110-116  — the session's authTime is overwritten with "now"
const authTimeNow = Math.floor(Date.now() / 1000);
if (req.session.authorization) {
  req.session.authorization.authTime = authTimeNow;
}
…
// :143-157  — and then compared against "now"
if (authz?.maxAge && authz.authTime) {
  const elapsed = authTimeNow - authz.authTime;      // always 0
  if (elapsed > authz.maxAge) { … "EXCEEDS_MAX_AGE" … }
}
```

`elapsed` is always `0`, so `EXCEEDS_MAX_AGE` is **unreachable**. The comment at `:142` says *"On first login
there is no previous authTime, so this always passes"* — which is true of a first login and is not the reason
it always passes.

**Why S2 and not S1.** On this path the user has just authenticated, so `auth_time = now` is *correct* and no
wrong token is issued. Nothing is currently mis-attested. What is wrong is that the repo's `max_age`
enforcement is decorative: the branch exists, is tested by no test, is documented as a working control
(`STEP-UP-AUTH-TUTORIAL.md:186-188` shows "Check maxAge requirement" as a step in the sequence diagram), and
cannot fire. The moment session reuse is introduced — which F-3 is about — it is the only thing standing
between a stale authentication and a token that claims freshness, and it will not stand.

## Finding F-3 — the `prompt=none` path fabricates the authentication event, and fixing an unrelated open finding activates it (S2 now, **S1 if activated**) — ✅ **FIXED 2026-08-12 (T1-7)**

> **Status:** closed, and the latent S1 is **retired rather than downgraded** — the activation route
> (`OIDC-W1`) was built correctly instead of being built at all. The two shipped as one change, exactly as
> this finding demanded.
>
> The fabrication block is **deleted**. The decision now runs through `checkStepUpRequirements`
> (`server/src/utils/step-up.ts`), a pure function shared with the login path, whose rule is that **absence
> is answered as "no"**: an unknown `acr` does not satisfy an essential `acrs`, and an unknown `authTime`
> does not satisfy a `maxAge`. A `prompt=none` request that depends on neither is issued *without*
> `acr`/`authTime`, so Authlete stamps nothing it was not given.
>
> Verified live: `max_age=0` against a two-second-old session is refused; `max_age=3600` succeeds. **That is
> the first time `EXCEEDS_MAX_AGE` has been reachable on this deployment** — see the 9470-W2 note below.
> 15 unit tests on the checker plus 8 controller cases.
>
> The finding text below is the historical record.

`authorization.controller.ts:96-131` handles `prompt=none` with an existing session, and at `:107-112`:

```ts
if (!req.session.stepUp) {
  req.session.stepUp = {
    acr: "pwd",
    authTime: Math.floor(Date.now() / 1000),
  };
}
```

If the session has no recorded authentication context, this **invents one**: ACR `"pwd"` with no evidence a
password was used, and `auth_time = now` for an authentication that happened at some unknown earlier point.
`authorization.service.ts:100-107` then passes both to `/auth/authorization/issue`, and Authlete stamps them on
the tokens. On this path there is **no** `maxAge` check and **no** `acrs`/`acrEssential` check — those live only
in `session.controller.ts`, on the login POST, which `prompt=none` bypasses entirely.

**It is unreachable today, for a reason recorded elsewhere in the repo.** `docs/curriculum/PROGRESS.md:1331-1340`
reports, from live testing, that Authlete answers `prompt=none` with `NO_INTERACTION` and
`responseContent: null` plus a ticket, that `authorization.controller.ts:50-53` mishandles that as a redirect
(emitting `Location:` empty), and that *"the controller does contain `prompt === "none"` handling at line 96 —
inside `case "INTERACTION"`, which a `prompt=none` request never reaches … Dead code that reads as a feature."*
Authlete's own API description confirms the mechanism: *"When the value of `action` is `NO_INTERACTION` … the
service must follow the steps described below"* — decide without UI, then call issue or fail.

**This is the finding.** The repo's open-findings register lists the empty-`Location` bug as an item to fix.
Fixing it *alone* — routing `NO_INTERACTION` into the `prompt=none` logic — activates a code path that:

1. attests `acr: "pwd"` for an authentication method it has not checked;
2. attests `auth_time: now` for an event that did not just happen;
3. ignores `max_age` completely, so a client asking for recent authentication gets a token asserting it;
4. ignores an essential `acr`, so `ACR_NOT_SATISFIED` never fires on this path.

A resource server enforcing a step-up requirement would then accept a token whose freshness is fabricated. That
is a silently-failing security control — the exact failure mode `modules/05…/lab.md:790-798` teaches learners
to fear (*"A security control that is silently not applied is worse than one that is visibly broken"*).

**So the two must be fixed together**, and `AGENTS.md`'s rule applies directly: a change described in an earlier
plan's follow-up section is not an approved change. The empty-`Location` fix is currently written up as a
one-line repair; it is not.

## Finding F-4 — the RFC 9470 section citations are wrong in code and docs (S3)

The repo's master claim is that every spec identifier is verified against its primary source
(`docs/curriculum/README.md:116-122`), so a wrong section number is a defect against the repo's own standard.
Actual structure: §3 challenge · §4 authorization request · §5 authorization response · §6 claim conveyance
(§6.1 JWT ATs, §6.2 introspection) · §7 metadata.

| Citation | Where | Should be |
|---|---|---|
| "RFC 9470 §2: Check if the authorization request requires specific ACRs" | `session.controller.ts:118` | §4 (request) / §6 (claims). §2 is "Protocol Overview" |
| "RFC 9470 §3: Check maxAge" | `session.controller.ts:140` | §4. §3 is the challenge, which this code does not emit |
| "Check ACR requirements (RFC 9470 §2)" / "Check maxAge requirement (RFC 9470 §3)" | `STEP-UP-AUTH-TUTORIAL.md:186-188` | same |

## Finding F-5 — `acr_values_supported` is not advertised (S3)

§7 points at OIDC Discovery's `acr_values_supported`. The service's `supportedAcrs` is **absent** (probe 1 §3.5,
already recorded as a settled `UNVERIFIED` item), so the discovery document advertises no ACR values while the
server hardcodes exactly one (`"pwd"`, at `session.controller.ts:111` and `authorization.controller.ts:109`).
A client cannot discover what to ask for, and the tutorial's re-authorization examples use
`urn:mace:incommon:iap:silver` — a value this deployment can never satisfy, which is precisely why the ACR
mismatch is demonstrable but the ACR *success* path is not.

## Finding F-6 — `parseBearerError` splits on commas without respecting quoted strings (S4)

`introspection.controller.ts:27`: `responseContent.replace(/^Bearer\s+/i, "").split(/,\s*/)`. A comma inside a
quoted `error_description` — likely, given Authlete's messages list ACR values — splits the description in two.
The fragment after the comma has no `=` and is skipped (`:30`), so `error_description` is silently truncated.
`acr_values` and `max_age` still parse if they follow. RFC 9110 §11.2's auth-param grammar is quoted-string
aware; this parser is not.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| The challenge, twice, as `HTTP/1.1 403 Forbidden`, "conforming to RFC 9470" | `STEP-UP-AUTH-TUTORIAL.md:196-234` | §3's examples are both 401; 403 appears nowhere in §3 | `DOC_INCORRECT` / **S2** — F-1 |
| "What the client learns" table treats the 403 body as the client's input | `STEP-UP-AUTH-TUTORIAL.md:238-244` | Makes the RS/AS conflation explicit | `DOC_INCORRECT` / S2 |
| Sequence diagram step "Check maxAge requirement (RFC 9470 §3)" | `STEP-UP-AUTH-TUTORIAL.md:186-188` | The check exists and cannot fail — F-2; and the citation is wrong — F-4 | `DOC_INCORRECT` / **S2** |
| "`session.controller.ts` records `authTime` (current epoch) and `acr` ('pwd' for password auth)" | `STEP-UP-AUTH-TUTORIAL.md:166` | Accurate for the login path | **Accurate** |
| "Authlete embeds these claims in the JWT access token (when `accessTokenSignAlg` is configured)" | `STEP-UP-AUTH-TUTORIAL.md:168` | Correct caveat; on this deployment the claims arrive via §6.2 introspection instead | **Accurate**, cross-ref `RFC9068-…` |
| `acr` and `auth_time` visible on introspection | `modules/04…/lab.md:180-184` | **Verified live** — §6.2 satisfied | **Accurate** |
| "Where do `acr` and `auth_time` come from? … For a JWT access token they are claims in the token; for [an opaque one, introspection]" | `modules/09a…/README.md:304` | Correct, and the clearest statement of §6.1 vs §6.2 in the repo | **Accurate** |
| `AGENTS.md`'s RFC 9470 paragraph: ACR/`auth_time` binding, `ACR_NOT_SATISFIED`, `EXCEEDS_MAX_AGE`, `introspection.controller.ts:47` parsing | `AGENTS.md` | Behaviour described correctly, but `EXCEEDS_MAX_AGE` is unreachable (F-2) and the line reference is stale — `parseBearerError` is at `:20-36`, the FORBIDDEN branch at `:76` | `DOC_INCORRECT` / S3 |
| Nothing anywhere notes that the `prompt=none` step-up path fabricates the authentication event | all docs; `PROGRESS.md:1331-1340` records the dead code but not what it *does* | F-3 | **Omission** / **S2**, latent S1 |

## Sources consulted

- RFC 9470 §§3, 4, 5, 6, 6.1, 6.2, 7 and full ToC — `https://www.rfc-editor.org/rfc/rfc9470.txt`, `https://www.rfc-editor.org/rfc/rfc9470.html` (§3 and §6.2 quoted verbatim this session, including both 401 examples)
- RFC 9068 §2.2.1 (`auth_time`, `acr`, `amr`) — `https://www.rfc-editor.org/rfc/rfc9068.txt`
- RFC 6750 §3.1 (the 403/`insufficient_scope` pairing that §3 deliberately departs from) — via `RFC6750-bearer-token-usage.md`
- Vendored Authlete API spec: `docs/openapi-spec.json`, `NO_INTERACTION` action description
- Repo-sourced live evidence: `docs/curriculum/PROGRESS.md:1331-1340` (`NO_INTERACTION` returns `responseContent: null` + ticket; the `:96` branch is unreachable)
- Live probe 1 (2026-08-10): `supportedAcrs` absent — `SERVICE-CONFIG-PROBE.md` §3.5
- Code: `controllers/session.controller.ts:70,108-164`, `controllers/authorization.controller.ts:50-53,90-92,96-131,107-112`, `services/authorization.service.ts:100-107`, `controllers/introspection.controller.ts:20-36,76-101`, `services/introspection.service.ts:38-43`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9470-W1 | Correct the challenge status in the tutorial, and separate AS-to-RS from RS-to-client | S | Part 5 shows the introspection response (403, Authlete's `FORBIDDEN`) and, separately, the **401** challenge an RS must send its client, quoting §3. The "What the client learns" table hangs off the 401. |
| 9470-W2 | Make the `max_age` check able to fail | M | Compare against the authentication time *before* it is overwritten — capture the prior `authTime` first, or move the check ahead of `:115`. A unit test drives `EXCEEDS_MAX_AGE`, which no test does today. | **⚠️ Framing corrected 2026-08-12 (T1-7).** The login-path check is vacuous — `authTime` is set to `authTimeNow` immediately before it is read — but on inspection that is **correct, not broken**: this is the login POST, where the End-User has just actively authenticated, and a fresh authentication satisfies any `max_age` by construction. **The path where `max_age` must be able to fail is `prompt=none`, which did not exist until T1-7 built it.** So this item is subsumed: `EXCEEDS_MAX_AGE` is now reachable and tested (`authorization.controller.test.ts`). No further code change is owed. |
| 9470-W3 | **Fix the `prompt=none` handling and the fabricated event together** | M | ✅ **DONE 2026-08-12 (T1-7), with OIDC-W1 as one change.** `NO_INTERACTION` is handled per Authlete's contract (decide, then issue or fail; OIDC Core §3.1.2.6 errors — `login_required` / `consent_required` / `interaction_required` / `account_selection_required`), **and** the `stepUp` fallback is deleted rather than carried over: no session context ⇒ `login_required`, never an invented `acr`/`auth_time`. `acrs`/`acrEssential`/`maxAge` are checked on this path too. **Do not ship the first half alone.** |
| 9470-W4 | Fix the six section citations | S | §4 for request handling, §6 for claim conveyance, §3 only where a challenge is emitted. Two in `session.controller.ts`, two in the tutorial, plus the stale `AGENTS.md` line reference. |
| 9470-W5 | Set `supportedAcrs` and advertise `acr_values_supported` | S | ✅ **DONE 2026-08-12 (T1-6)** — `["pwd","mfa"]`; `acr_values_supported` now appears in discovery. **Both halves verified live**: `acr_values=pwd` succeeds and the value reaches the ID token *and* introspection; an **essential** `acr` of `mfa` is refused with `unmet_authentication_requirements` / `[A060305]`, **no code issued**. That second half is the first live confirmation that this deployment refuses rather than approximating — the failure mode **T1-7** rebuilt `utils/step-up.ts` to prevent. **`mfa` was registered deliberately although nothing can satisfy it**: an *unregistered* value fails earlier and for a different reason, so registering it is what makes the essential-ACR refusal path reachable. ⚠️ **The `readOnly` trap:** `supportedAcrs` is marked `readOnly: true` in the vendored 3.0.16 schema and Authlete **accepted and persisted the write anyway** — `SERVICE-CONFIG-PROBE.md` §15. |
| 9470-W6 | Make `parseBearerError` quoted-string aware | S | An `error_description` containing a comma survives intact; test covers it. |

**Ordering and gating.** **W3 is the priority and must be planned as one change** — `controllers/session.controller.ts`
(ACR / `auth_time` binding) and `controllers/authorization.controller.ts` are both on the `AGENTS.md`
**Security-critical surfaces** list, so W2 and W3 each require a plan before editing. W1, W4 and W6 are safe
now. W5 is console configuration.
