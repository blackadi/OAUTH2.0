# RFC 9901 — Selective Disclosure for JSON Web Tokens (SD-JWT)

- **Verdict:** `DOC_ONLY`
- **Severity:** **S4**
- **Status:** Published RFC, **Standards Track, November 2025** — re-verified against the primary source this session
- **Authlete version:** 3.0 — **no vendor surface**; pure JOSE, no `llms.txt` page
- **Repo docs under test:** `docs/curriculum/scripts/sd-jwt.mjs`, `docs/curriculum/modules/09b-identity-and-credentials/`, `docs/curriculum/SPEC-INVENTORY.md`

<thinking>
1. Who does what: the RFC defines Issuer, Holder and Verifier obligations — salted disclosure digests in `_sd`,
   the `_sd_alg` hash claim, `~`-separated disclosures, optional Key Binding JWT with `iat`/`aud`/`nonce`/`sd_hash`,
   and the Verifier's digest-recomputation checks. **The RFC assigns no role to an OAuth authorization server** —
   I confirmed that directly rather than inferring it.
2. Authlete boundary: none. No `llms.txt` page, no SDK surface, nothing in the service model. The only place
   SD-JWT could touch this deployment is as a credential *format* under OID4VCI — and VCI is disabled.
3. Code: nothing in `server/src`. One teaching script, `docs/curriculum/scripts/sd-jwt.mjs`.
4. Docs: `SPEC-INVENTORY.md` records it as "taught locally via the script", which is exactly what it is.
5. Delta: none. Code and docs agree, and the agreement is correct — an authorization server has no SD-JWT
   obligations to conform to.
6. So the only question worth answering is whether `DOC_ONLY` is the right verdict for a spec that *cannot* be
   implemented by this component. Reasoned below rather than asserted.
</thinking>

## Normative requirements — and why none of them fall on this server

| # | Requirement | Role | Falls on this repo? |
|---|---|---|---|
| 1 | Sign the Issuer-signed JWT; generate ≥128-bit salts; embed digests in `_sd`; set `_sd_alg` | Issuer | ❌ — no credential issuance happens here (OID4VCI disabled) |
| 2 | Optionally add decoy digests (§4.2.5) | Issuer | ❌ |
| 3 | Select disclosures; build the `~`-separated presentation; optionally mint a Key Binding JWT | Holder | ❌ — the Holder is a wallet |
| 4 | Verify the Issuer signature; recompute each disclosure digest; validate the Key Binding JWT and `sd_hash` | Verifier | ❌ — no verifier component exists |
| 5 | Any AS-side obligation | — | **None.** The RFC assigns no role to an OAuth authorization server |

That last row is the finding, and it is worth stating positively: **there is no conformance gap here, because
there is no conformance surface.** RFC 9901 is a JOSE data format. An authorization server acquires SD-JWT
obligations only when it also acts as a credential Issuer — which, for this deployment, would mean OID4VCI
issuing SD-JWT-VC credentials, and `verifiableCredentialsEnabled = false` (`OID4VCI-1.0.md` F-1).

## Authlete integration boundary

| Concern | Owner | Where |
|---|---|---|
| Anything in RFC 9901 | **nobody, in this deployment** | — |
| SD-JWT as a credential format | Would be Authlete's, under OID4VCI | unreachable while VCI is disabled |
| Teaching the format | **This repo** | `docs/curriculum/scripts/sd-jwt.mjs` |

`00-inventory.md` §10 and `01-spec-matrix.md` §8 both recorded RFC 9901 as having no Authlete page. Confirmed:
`llms.txt` has no entry, and the format appears nowhere in the SDK.

## Verdict reasoning — why `DOC_ONLY` and not `OUT_OF_SCOPE`

Both are defensible and the distinction matters for Phase 4's bookkeeping:

- `OUT_OF_SCOPE` implies a deliberate exclusion needing a decision record with revisit triggers. That fits mTLS (declinable capability) and Session Management (implementable but unwise).
- `DOC_ONLY` means documented but not implemented. That is the accurate description here — the repo *has* built the teaching artifact, and there is no implementation to defer, because the component has no role.

So no decision record is required for this row, which is a departure from how I have treated other unimplemented
specs. The reason is that a decision record answers *"why did you not build this?"*, and for RFC 9901 the honest
answer is *"an authorization server cannot"* — which belongs in the inventory row, not in a decision register.
Gate 4 can overrule; I would keep the register for genuine choices.

## Finding F-1 — the teaching script is the whole implementation, and it is unaudited (S4)

`docs/curriculum/scripts/sd-jwt.mjs` (listed in `00-inventory.md` §2 alongside `decode-jwt.mjs` as lab tooling) is
the only SD-JWT code in the repo. It is a curriculum artifact, not a server component, and:

- it is **not covered by any test** — the `scripts/` directory is outside both Vitest configs (`00-inventory.md` §8);
- it was **not read line-by-line in this entry**. Its correctness against §4.2.3 (disclosure hashing), §4.2.4 (digest embedding) and §7.3 (verifier checks) is a **Phase 3** item, because a script that demonstrates a security format incorrectly teaches the format incorrectly — the same standard applied to `client/src/services/dpop.service.ts`, whose signature-format and `ath` details were checked in B4.

Recorded at S4 because nothing in the running server depends on it; flagged so Phase 3 does not skip it on the
grounds that this entry "covered" RFC 9901.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"Selective Disclosure for JSON Web Tokens"*, Published RFC, **Nov 2025** | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **Confirmed** against `rfc-editor.org/rfc/rfc9901.txt` this session, including Standards Track status | **Accurate** — notable, because `01-spec-matrix.md` §7 flagged this row for re-verification precisely because a Nov 2025 publication was recent enough that its status might have moved. It has not. |
| "No vendor surface — pure JOSE" | `01-spec-matrix.md` §3 | Confirmed | **Accurate** |
| "Taught locally via `docs/curriculum/scripts/sd-jwt.mjs`" | `01-spec-matrix.md` §3 | Confirmed | **Accurate** |
| Nothing states that an AS has no RFC 9901 role at all | inventory row | The clearest fact about this spec's relationship to this codebase | **Omission** / S4 |

## Sources consulted

- RFC 9901 §§3.1–3.4, 4.1, 4.1.1, 4.2.1–4.2.6, 4.3, 7.1–7.3, 9.3, and the full ToC — `https://www.rfc-editor.org/rfc/rfc9901.txt`, fetched this session. Confirmed the party-obligation split and that **no role is assigned to an OAuth authorization server**.
- OID4VCI 1.0 (the only route by which SD-JWT could reach this deployment) — `https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html`
- Live probe 3 (2026-08-10): `verifiableCredentialsEnabled = false` — `SERVICE-CONFIG-PROBE.md` §9
- Phase 0/1: `00-inventory.md` §2, §8, §10; `01-spec-matrix.md` §3, §7, §8
- Grep: `sd-jwt`, `_sd`, `sd_hash` — zero occurrences in `server/src` and `client/src`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| 9901-W1 | State in the inventory row that an AS has no RFC 9901 obligations | S | ✅ **DONE 2026-08-14 (T2-5).** Clause applied verbatim — roles Issuer / Holder / Verifier, this component none of them unless it issues credentials under OID4VCI, and the row now says *"Not absent from `server/`; **inapplicable** to it"*, which is the distinction the item exists to draw. Provenance fetched while there: `datatracker.ietf.org/doc/rfc9901/` reads *"RFC – Proposed Standard (November 2025)"*, so **the date was already correct** and the vaguer *"Std Track"* label was sharpened to Proposed Standard. A row confirmed rather than corrected is still a result — it separates *checked* from *never checked*. |
| 9901-W2 | Audit `sd-jwt.mjs` against §§4.2.3, 4.2.4 and 7.3 | M | **Phase 3 item.** Salt entropy ≥128 bits (§9.3), digests computed over the base64url-encoded disclosure string, `_sd_alg` set, and the verifier path recomputing digests rather than trusting them. Same standard as the DPoP client service. |
| 9901-W3 | No implementation | — | Correct: there is nothing for an authorization server to implement. |
| 9901-W4 | No decision record | — | Deliberate departure — see the verdict reasoning above. Gate 4 to confirm. |
