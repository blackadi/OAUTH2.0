# OpenID Connect Session Management 1.0

- **Verdict:** `ABSENT` — a decision record is required at Gate 4
- **Severity:** **S4**
- **Status:** OpenID **Final**, **12 September 2022** — verified against the primary source this session. **This closes the second of the two undated rows `SPEC-INVENTORY.md:188` flagged.**
- **Authlete version:** 3.0 — no `llms.txt` page; no vendor surface found
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md:188`

<thinking>
1. Requirements on the OP: publish a `check_session_iframe` endpoint that answers cross-origin `postMessage`
   polls; return a `session_state` parameter *"in the Authentication Response"* — and the spec is explicit that
   when the OP supports session management it **MUST** return it in both successful and error responses; advertise
   `check_session_iframe` in discovery; answer `changed` / `unchanged` / `error` to a poll.
2. Authlete boundary: nothing found. `llms.txt` has no session-management page, `check_session_iframe` is absent
   from the SDK's service model surface as far as the Phase 1 sweep found, and Authlete does not generate a
   `session_state` parameter that this server ever sees.
3. Code: nothing. No iframe endpoint, no `session_state`, no polling handler.
4. Docs: mentioned only in `SPEC-INVENTORY.md`'s note about undated rows. No row of its own with an
   implementation column, no tutorial, no exercise.
5. Delta: none — absent and undocumented, consistently. The work is the decision record.
6. One thing to be careful about: this specification is widely regarded as superseded in practice by
   browser privacy changes, and I should say that as an argument rather than as a fact about the document's status,
   which is still Final.
</thinking>

## Normative requirements (OP side)

| # | Requirement | Source | Status |
|---|---|---|---|
| 1 | Publish a `check_session_iframe` that handles cross-origin `postMessage` | §2, §4 | ❌ absent |
| 2 | Return `session_state` in the Authentication Response — *"When the OP supports session management, it MUST also return the Session State as an additional `session_state` parameter"* | §3 | ❌ absent (and n/a while §1 is unmet) |
| 3 | Answer a poll with `changed` / `unchanged`, or `error` for a malformed request | §4 | ❌ absent |
| 4 | Advertise `check_session_iframe` in discovery | §5 | ❌ **absent** from the live discovery document (probe 3 — the member does not appear among the 62) |

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Computing `session_state` (a hash over client ID, origin and a browser-state salt) | **This server** | not implemented |
| Serving the iframe and answering `postMessage` | **This server** | not implemented |
| Any vendor support | **none found** | no `llms.txt` page; not raised by the Phase 1 SDK sweep |

This is the emptiest boundary in the audit after RFC 7522 — and unlike RFC 7522, it is not even named in
Authlete's documentation index. The Phase 1 reconciliation (`00-inventory.md` §10) listed the specs with no
vendor page; session management is absent from Authlete's surface entirely, so an implementation would be wholly
local.

## Finding F-1 — the same missing prerequisite, and the same browser constraint (S4)

Session Management shares both blockers already recorded for front-channel logout
(`OIDC-FRONTCHANNEL-LOGOUT-1.0.md` F-1):

1. **Durable OP session identity.** `session_state` is a value the OP must be able to recompute for a given client and browser session on every poll. This server's only session concept is an express-session cookie with no relationship to anything Authlete records.
2. **Third-party iframe and cookie access.** The mechanism is an invisible cross-origin iframe polling the OP; the OP must read its own cookie inside that iframe. Browsers have progressively restricted exactly this, which is the practical reason back-channel logout exists.

So the four-specs-one-prerequisite observation stands: front-channel logout, back-channel logout's `sid` mode,
Session Management, and Native SSO's `sid` all wait on durable OP session identity. Carried to Phase 4 as one
item rather than four.

## Scope recommendation — document-only

Recommend `OUT_OF_SCOPE` with a decision record:

1. **The mechanism it provides — "is the user still logged in?" — is already covered here by `prompt=none`**, which is the modern answer and which this repo teaches in Module 08 Exercise 5c. That the `prompt=none` path is currently broken (`OIDC-CORE-1.0.md` F-1) is an argument for fixing it, not for adding a second mechanism beside it.
2. **The polling design is browser-hostile.** Saying so is a judgement about deployability, not about the document: Session Management 1.0 is still **Final**, and a decision record must not imply it has been withdrawn.
3. **Cost is dominated by the shared prerequisite**, which should be built for back-channel `sid` mode and Native SSO first.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Named as one of two rows "confirmed … but undated" | `SPEC-INVENTORY.md:188` | Confirmed Final; **date is 12 September 2022** | **Accurate, now datable** |
| No implementation claim anywhere | — | Correct — nothing overclaims | **Accurate** |
| The spec has **no row of its own** in the inventory tables, only a mention in the note | `SPEC-INVENTORY.md:188` | For a spec in the OIDC logout/session family that the repo has considered enough to date, a row would be more consistent than a footnote | **Incomplete** / S4 |
| Nothing states that Authlete offers no surface for it | all docs | The absence is vendor-level as well as local — the more useful fact, as with RFC 7522 | **Omission** / S4 |

## Sources consulted

- OpenID Connect Session Management 1.0 §§2, 3, 4, 5 — `https://openid.net/specs/openid-connect-session-1_0.html`, fetched this session. **Title, Final status and date (12 September 2022) confirmed**; the `session_state` MUST, the `changed`/`unchanged`/`error` poll responses, and the `check_session_iframe` metadata definition quoted.
- Live probe 3 (2026-08-10): `check_session_iframe` does not appear among the 62 discovery members — `SERVICE-CONFIG-PROBE.md` §8
- Phase 0/1: `00-inventory.md` §10 and `01-spec-matrix.md` §8 (the specs with no Authlete page)
- Code: grep for `session_state`, `check_session_iframe` over `server/src` and `client/src` — zero occurrences

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| SM-W1 | Write the decision record | S | Dated; states that the mechanism is superseded in practice by `prompt=none` and by browser third-party-cookie restrictions **without** implying the document is anything other than Final; names durable OP session identity as the shared prerequisite; names the revisit trigger. Filed in `audit/05-decision-records.md`. |
| SM-W2 | Give it a proper `SPEC-INVENTORY.md` row | S | ✅ **DONE 2026-08-14 (T2-5).** Fetched `openid.net/specs/openid-connect-session-1_0.html`; header reads *"OpenID Connect Session Management 1.0"*, **Final**, **12 September 2022**. All four elements the criterion asked for are on the row: title, status/date, **mechanism** (`check_session_iframe` — the RP polls OP session state through the browser with no repeated authentication request, taken from the abstract) and **implementation** (*"Not implemented — `check_session_iframe` ABSENT. Declined, DR-08"*). The footnote-only treatment is gone. |
| SM-W3 | Fold into the Phase 4 shared-prerequisite item | S | Same item as **FCL-W4**. |

**Ordering.** All documentation; no code proposed. SM-W2 pairs with **FCL-W2** as one `SPEC-INVENTORY.md` edit.
