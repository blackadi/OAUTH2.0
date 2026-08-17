# OpenID Connect Front-Channel Logout 1.0

- **Verdict:** `ABSENT` — a decision record is required at Gate 4
- **Severity:** **S4**
- **Status:** OpenID **Final**, **12 September 2022** — verified against the primary source this session. **This closes one of the two undated rows `SPEC-INVENTORY.md:188` flagged.**
- **Authlete version:** 3.0 — no `llms.txt` page; the only vendor surface is the client metadata field
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md:184,188`

<thinking>
1. Requirements on the OP: render `<iframe src="frontchannel_logout_uri">` for each RP with a registered URI;
   append `iss` and `sid` query parameters, and *"if either is included, both MUST be"*; honour
   `frontchannel_logout_session_required`; advertise `frontchannel_logout_supported` and
   `frontchannel_logout_session_supported`.
2. Authlete boundary: essentially nothing. Authlete stores `frontChannelLogoutUri` as client metadata; the
   iframe-rendering page is the OP implementation's own work, and `sid` requires session identifiers the OP must
   itself track.
3. Code: nothing. No iframe-rendering page, no `frontChannelLogoutUri` read anywhere, no `sid` tracking.
4. Docs: one `SPEC-INVENTORY` row, undated, marked *(see note)*, with the honest admission that the date was not
   verified. No tutorial, no module exercise.
5. Delta: none between code and docs — both say absent. The audit's rule generates the work: a Group B skip needs
   a written decision record, and none exists.
6. Nothing unresolved. The one useful contribution beyond "absent" is the date, and the observation that the
   `sid` requirement is the real blocker.
</thinking>

## Normative requirements (OP side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Render an iframe per RP: `<iframe src="frontchannel_logout_uri">` | §2 | ❌ absent — no such page exists |
| 2 | Append `iss` and `sid`; *"if either is included, both MUST be"* | §2 | ❌ absent |
| 3 | Honour `frontchannel_logout_session_required` | §3 | ❌ absent; no client sets it |
| 4 | Advertise `frontchannel_logout_supported` / `frontchannel_logout_session_supported` | §3 | ❌ both **absent** from the live discovery document (probe 3) |
| 5 | Issue `sid` in ID Tokens when session-based front-channel logout is supported | §3 | ❌ no `sid` is issued; the only `sessionId` this server generates is the Native SSO UUID (`services/authorization.service.ts:133-137`), which is per-authorization and unrelated |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Storing `frontChannelLogoutUri` | Authlete client metadata | present in the model; **absent on all three clients** (probe 3) |
| Rendering the iframe page | **This server** | not implemented |
| Tracking a session identifier to put in `sid` | **This server** | not implemented — the blocker (F-1) |
| Advertising support | Authlete, from service config | not enabled |

There is no `llms.txt` page for front-channel logout, so — as with RFC 9728 and RP-Initiated Logout — the code
can only be audited against the specification itself.

## Finding F-1 — the real prerequisite is session identity, not an iframe page (S4)

Recorded because it changes the cost estimate a decision record needs. The iframe page is trivial: a server-rendered
list of `<iframe>` elements. What front-channel logout actually requires is a **stable session identifier** that
appears in ID Tokens as `sid` and can be matched later — §2's `iss`/`sid` pair and
`frontchannel_logout_session_supported` both depend on it.

This server has no such identifier. `req.session` is an express-session cookie with no relationship to anything
Authlete records, and the one `sessionId` it does generate (`services/authorization.service.ts:133-137`) is a
fresh UUID per authorization created only for Native SSO — see `NATIVE-SSO-1.0.md` F-2, which flags the same
absence from the other direction.

So front-channel logout, back-channel logout's session-based mode
(`backchannel_logout_session_supported`, `OIDC-BACKCHANNEL-LOGOUT-1.0.md` F-3), Session Management 1.0, and
Native SSO's `sid` all wait on **one** missing piece: a durable OP session identity. That is the finding worth
carrying to Phase 4 — four specs, one prerequisite — rather than four separate "not implemented" rows.

## Scope recommendation — document-only

I recommend `OUT_OF_SCOPE` with a written decision record, on three grounds:

1. **Front-channel logout is the weaker of the two mechanisms and the specification community knows it.** It depends on third-party iframe loads and third-party cookies, which modern browsers restrict; back-channel logout exists because of that.
2. **Back-channel logout is already implemented here** (its OP half conformantly), so the teaching goal — "how does an OP log a user out of every RP?" — is met by the mechanism worth teaching. Adding front-channel would mostly teach a technique that no longer works reliably in a browser.
3. **The prerequisite is shared and should be built for a better reason.** If durable session identity is built, it should be built for back-channel logout's `sid` mode and Native SSO, both of which are already implemented and blocked; front-channel would then be nearly free, and can be revisited *then*.

That is a judgement, not a finding — Gate 4's to accept or reject.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Row present, title *"OpenID Connect Front-Channel Logout 1.0"*, Final, date *(see note)* | `SPEC-INVENTORY.md:184` | Title and Final status confirmed; **the date is 12 September 2022** | **Accurate, now datable** — S4 |
| "the two unverified rows marked *(see note)* rather than guessed" | `SPEC-INVENTORY.md:188,279` | Exactly the right call at the time. This entry supplies the missing date rather than leaving it open | **Accurate — the discipline worked** |
| Row's implementation column reads "logout routes" | `SPEC-INVENTORY.md:184` | Misleading: no route implements front-channel logout. `logout.routes.ts` serves RP-Initiated and the back-channel receiver only | `DOC_INCORRECT` / S4 |
| No tutorial, no module exercise, no claim that it works | — | Correct — nothing overclaims | **Accurate** |

## Sources consulted

- OpenID Connect Front-Channel Logout 1.0 §§2, 3 — `https://openid.net/specs/openid-connect-frontchannel-1_0.html`, fetched this session. **Title, Final status and date (12 September 2022) confirmed**; the `iss`/`sid` pairing rule (*"if either is included, both MUST be"*) and both OP metadata definitions quoted.
- Live probe 3 (2026-08-10): `frontchannel_logout_supported` and `frontchannel_logout_session_supported` absent; per-client `frontChannelLogoutUri` absent — `SERVICE-CONFIG-PROBE.md` §8, §10
- Code: grep for `frontchannel` / `frontChannelLogoutUri` over `server/src` and `client/src` — zero occurrences; `services/authorization.service.ts:133-137` (the only session identifier this server generates)

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| FCL-W1 | Write the decision record | S | Dated; states that the OP-side prerequisite is durable session identity, not the iframe page; names the browser third-party-cookie constraint; names the revisit trigger (durable `sid` built for back-channel `sid` mode or Native SSO). Filed in `audit/05-decision-records.md`, cross-linked from Module 08. |
| FCL-W2 | Date the `SPEC-INVENTORY.md` row | S | ✅ **DONE 2026-08-14 (T2-5).** Fetched **both** `openid-connect-frontchannel-1_0.html` and `…-final.html` per this file's own `-final` trap; **identical at both** — *"OpenID Connect Front-Channel Logout 1.0"*, **Final**, **12 September 2022**. The *(see note)* qualifier is gone and the obsolete note replaced. **The date turned out to be shared with Session Management and RP-Initiated Logout** — all three OIDC logout specifications published the same day, which is recorded because it explains why three missing dates looked like three separate small gaps. |
| FCL-W3 | Fix the row's implementation column | S | ✅ **DONE 2026-08-14 (T2-5), and it was the worse half of the pair.** The column pointed at *"logout routes"* for a mechanism this repo does not serve — `frontchannel_logout_supported` is **ABSENT** and no `frontchannel*` symbol exists in `server/src`. An undated row that also claims an implementation reads as *a supported feature nobody got round to citing*; it was neither. Now **"Not implemented"** with the DR-08 cross-reference. **This ID is absent from cluster 29's list of fifteen** — DR-08 owed it to T2-5 and nothing else would have caught it. |
| FCL-W4 | Carry the shared-prerequisite finding to Phase 4 | S | One item — "durable OP session identity" — listed as the blocker for front-channel logout, back-channel `sid` mode, Session Management and Native SSO's `sid`, instead of four independent gaps. |

**Ordering.** All four are documentation. No code is proposed.
