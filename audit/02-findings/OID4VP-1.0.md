# OpenID for Verifiable Presentations 1.0 (OID4VP)

- **Verdict:** `OUT_OF_SCOPE` — decision record required at Gate 4
- **Severity:** **S4**
- **Status:** OpenID **Final**, **9 July 2025** — re-verified against the primary source this session
- **Authlete version:** 3.0 — **no vendor surface**, no `llms.txt` page (`01-spec-matrix.md` §3)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md`, `docs/curriculum/modules/09b-identity-and-credentials/`

<thinking>
1. Who has obligations: the specification defines **Wallet** and **Verifier** — the Verifier being *"a specific
   case of an OAuth 2.0 Client"*. I checked specifically whether an authorization server or credential issuer
   acquires any obligations, because that determines whether "out of scope" is a choice or a structural fact. It
   places **no direct requirements on either**.
2. Authlete boundary: none. No page, no SDK surface.
3. Code: nothing, correctly.
4. Docs: an inventory row and a Module 09b mention. Nothing claims it works.
5. Delta: none. The verdict is a scope ruling, not a conformance measurement.
6. So the useful contribution is the same one RFC 9901 needed: state *why* this component has no role, so the row
   stops reading as an unbuilt feature — and distinguish it from HAIP, where the repo *would* have obligations.
</thinking>

## Why this component has no OID4VP obligations

| Role | Obligations | Who plays it here |
|---|---|---|
| **Wallet** | Process the `dcql_query`, select candidate credentials, build the presentation | ❌ nobody — no wallet exists |
| **Verifier** (*"a specific case of an OAuth 2.0 Client"*) | Request, receive and validate presentations | ❌ nobody — the SPA is an OAuth client, not a credential verifier |
| Authorization server | **none** | this repo's server |
| Credential issuer | **none** | this repo, via OID4VCI — and disabled anyway |

The specification extends OAuth 2.0 *"exclusively to govern the request and presentation flow between these two
parties."* So this is structurally the same situation as RFC 9901 (`RFC9901-sd-jwt.md`): there is no conformance
surface, not merely an unimplemented one.

**The distinction that matters for Gate 4:** OID4VP is out of scope because the roles do not apply. HAIP
(`HAIP-1.0.md`) is different — it *does* place obligations on a credential issuer, which this repo aspires to be.
Grouping the two as "wallet stuff, skipped" would lose that.

## What implementing it would actually mean

Recorded so the decision record has a cost basis rather than a shrug:

1. **A verifier component.** Request presentations, parse DCQL, validate an SD-JWT+KB or mdoc presentation, check the Key Binding JWT's `aud`/`nonce`/`sd_hash`. That is a new application, not a feature — and the SD-JWT verification half is what `docs/curriculum/scripts/sd-jwt.mjs` demonstrates in miniature.
2. **A wallet, or a third-party one.** No wallet exists here, and OID4VP is untestable without one. `01-spec-matrix.md` §3 already records "requires a wallet" as the Group C gating condition.
3. **No Authlete assistance.** Unlike OID4VCI, there is no vendor API to delegate to, so every line would be ours — in a repo whose stated architecture is that Authlete owns protocol processing (`docs/README.md:31`).

## Scope recommendation — document-only, and say why the roles do not apply

Recommend `OUT_OF_SCOPE` with a decision record:

1. **The roles do not apply.** An authorization server has no OID4VP obligations, so there is nothing to conform to. This is the primary reason and it is structural.
2. **The prerequisite is a wallet**, which is outside this repo's scope by construction.
3. **The credential-issuance side is already blocked.** `verifiableCredentialsEnabled = false` (`OID4VCI-1.0.md` F-1), so even the issuance half of the wallet story does not run. Building presentation before issuance works would be backwards.
4. **The teaching goal is met more cheaply.** Module 09b covers credentials and `sd-jwt.mjs` demonstrates selective disclosure offline. A prose page on how presentation works, with the DCQL query shape and the Key Binding JWT's role, costs a page and teaches the concept.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"OpenID for Verifiable Presentations 1.0"*, Final, **9 Jul 2025** | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **Confirmed** against `openid.net/specs/openid-4-verifiable-presentations-1_0.html` this session | **Accurate** |
| "No vendor surface" / "requires a wallet" / "Decision record needed" | `01-spec-matrix.md` §3 | All three accurate | **Accurate** |
| Nothing claims OID4VP is implemented | `README.md`, `docs/` | Correct — a welcome contrast with Native SSO, VCI, FAPI 2.0 and MCP | **Accurate** |
| Nothing states that an AS has **no** OID4VP obligations | inventory row | The clearest fact about this row; without it the row reads as an unbuilt feature | **Omission** / S4 |

## Sources consulted

- OpenID for Verifiable Presentations 1.0 — `https://openid.net/specs/openid-4-verifiable-presentations-1_0.html`, fetched this session. **Title, Final status and date (9 July 2025) confirmed.** Confirmed the Wallet/Verifier role split, the Verifier as *"a specific case of an OAuth 2.0 Client"*, the `dcql_query` obligation on wallets, and that the document places **no** requirements on an authorization server or credential issuer.
- RFC 9901 (the presentation format OID4VP carries) — `https://www.rfc-editor.org/rfc/rfc9901.txt`
- OID4VCI 1.0 (the issuance half) — `https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html`
- Phase 0/1: `00-inventory.md` §10, `01-spec-matrix.md` §3
- Code: grep for `dcql`, `vp_token`, `presentation_definition` — zero occurrences repo-wide

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| VP-W1 | Write the decision record | S | Dated; states that the AS has no OID4VP obligations (roles are Wallet and Verifier), that a wallet is the prerequisite, and that issuance is blocked first. Revisit trigger: a wallet becomes available **and** OID4VCI is enabled. Filed in `audit/05-decision-records.md`. |
| VP-W2 | State the no-obligations fact in the inventory row | S | One clause, so the row stops reading as an unbuilt feature. Same treatment as **9901-W1**. |
| VP-W3 | Add a prose page on presentation | M | *Optional.* Module 09b explains the presentation leg — DCQL, the Key Binding JWT's `aud`/`nonce`/`sd_hash`, and why unlinkability matters — without runnable steps, labelled not-run-here as Module 05 does for mTLS. |
| VP-W4 | No implementation | — | Correct. |
