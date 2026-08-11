# FAPI 2.0 Attacker Model

- **Verdict:** `DOC_ONLY`
- **Severity:** **S4**
- **Status:** OpenID **Final**, **22 February 2025** — verified against the primary source this session
- **Authlete version:** 3.0 — **no configuration surface** (`01-spec-matrix.md` §3 records this correctly)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md`, `docs/curriculum/modules/10-fapi-and-grant-management/`, `01-spec-matrix.md` §7

<thinking>
1. What the document is: an analysis document defining five attacker archetypes (A1 web attacker, A1a web attacker
   as AS, A2 network attacker, A3a authorization-endpoint attacker, A4 token-endpoint attacker, A5 resource-server
   attacker) that justify FAPI 2.0's requirements. It is not an implementation profile. One normative statement
   touches implementations: the token endpoint address must be obtained from an authoritative source over a
   protected channel — and even that is stated as something the Security Profile mandates.
2. Authlete boundary: none, and correctly so. There is no flag for an attacker model.
3. Code: nothing to audit. That is the right answer, not a gap.
4. Docs: `SPEC-INVENTORY.md` flagged this row for re-verification because it suspected *"a superseded document
   still served at the old URL"* — a specific, testable concern I should resolve rather than restate.
5. Delta: the interesting question is not conformance but whether the repo's *threat modelling* uses the document,
   given that Module 10 teaches FAPI and Module 02 teaches threats.
6. Care needed: it would be easy to write this row off as "not applicable" and move on. The one substantive thing
   an audit can contribute is checking the superseded-document suspicion and checking whether the single normative
   statement holds here.
</thinking>

## What this document requires, and of whom

| # | Content | Falls on this repo? |
|---|---|---|
| 1 | Defines attacker archetypes **A1** (web attacker), **A1a** (web attacker acting as an authorization server), **A2** (network attacker), **A3a** (authorization-endpoint attacker), **A4** (token-endpoint attacker), **A5** (resource-server attacker) | ❌ analysis, not requirements |
| 2 | Justifies the FAPI 2.0 Security Profile's shall statements against those capabilities | ❌ — the requirements live in the Security Profile (`FAPI-2.0-SECURITY-PROFILE.md`) |
| 3 | *"the FAPI 2.0 Security Profile mandates that the token endpoint address is obtained from an authoritative source and via a protected channel"* — the one implementation-facing statement | ⚠️ **yes, and it is not satisfied** — F-1 |

So there is no conformance surface beyond item 3. `DOC_ONLY` is the accurate verdict: the document is referenced
by the curriculum and there is nothing to implement.

## Finding F-1 — the one implementation-facing statement is unsatisfied, for a reason already recorded (S3)

The Attacker Model's single normative pointer is that the token endpoint address must come from an authoritative
source over a protected channel — the defence against **A1a**, an attacker acting as an authorization server, and
the reason mix-up attacks are in scope.

On this deployment the authoritative source is the AS metadata document, and:

```
issuer         = https://blackadi.dev
token_endpoint = https://cecile-soapsudsy-zoila.ngrok-free.dev/api/token
```

The metadata is **not retrievable at the issuer** — B3's finding, sharpened by probe 2 §5. So a client cannot
obtain the token endpoint address from an authoritative source at all: it must be told the ngrok host out of band,
which is precisely the position A1a exploits. `RFC9207-issuer-identification.md` F-2 makes the same point from the
`iss` side: the mechanism is intact, its trust anchor is not.

This is not a new finding — it is the B3 issuer/host mismatch, seen through the Attacker Model's lens. Recording it
here matters for one reason: it converts that mismatch from a metadata-tidiness defect into a **named attacker
capability**, which is a stronger argument for fixing it than "RFC 8414 §3 says the paths should correspond."

## Finding F-2 — the superseded-document suspicion is not confirmed (S4)

`01-spec-matrix.md` §7 selected this row for re-verification because `SPEC-INVENTORY.md` *"flags a superseded
document still served at the old URL."*

Fetched this session: `https://openid.net/specs/fapi-attacker-model-2_0-final.html` serves **"FAPI 2.0 Attacker
Model", Final, 22 February 2025** — the same title, status and date the inventory records. **The suspicion is not
borne out at this URL**, and the row is accurate as written.

Two honest limits on that conclusion:

1. I checked one URL. The JARM precedent (`SPEC-INVENTORY.md:287-288` — `-final.html` served a stale Final while the unsuffixed URL served errata set 1) means the *inverse* case is possible: an unsuffixed `fapi-attacker-model-2_0.html` could carry later errata. Not fetched, so not ruled out.
2. The original note's wording is not reproduced in `SPEC-INVENTORY.md`'s visible rows, so I cannot tell which document the author thought was superseded. If the concern was the *Security Profile*'s URL, that **is** real: `fapi-2_0-security-profile-final.html` returns **404**, and the document is served at `fapi-security-profile-2_0-final.html` (noted in `FAPI-2.0-SECURITY-PROFILE.md`'s sources). A transposed slug would explain the note exactly.

So: the row is accurate, and the concern behind it may have been about the sibling document's URL rather than this
one. Recorded rather than resolved, with the specific next check named.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Title *"FAPI 2.0 Attacker Model"*, Final, **22 Feb 2025** | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | **Confirmed** at `fapi-attacker-model-2_0-final.html` this session | **Accurate** |
| "No configuration surface" | `01-spec-matrix.md` §3 | Confirmed — it is an analysis document | **Accurate** |
| "the file flags a superseded document still served at the old URL" | `01-spec-matrix.md` §7 (describing `SPEC-INVENTORY.md`) | Not confirmed for this document — F-2. The 404 on the Security Profile's `-final` slug is a better candidate | **Unconfirmed** / S4 |
| Nothing uses the A1–A5 archetypes in the repo's threat material | Module 02 (threats), Module 10 (FAPI) | Not read line-by-line here — carried to Phase 3. The archetypes are the vocabulary FAPI 2.0's requirements are justified in, so Module 10 teaching FAPI without them is a pedagogical gap rather than a conformance one | **Deferred to Phase 3** |

## Sources consulted

- FAPI 2.0 Attacker Model — `https://openid.net/specs/fapi-attacker-model-2_0-final.html`, fetched this session. **Title, Final status and date (22 February 2025) confirmed.** The five archetypes and the single implementation-facing statement about the token endpoint address are quoted above.
- FAPI 2.0 Security Profile — `https://openid.net/specs/fapi-security-profile-2_0-final.html` (and the 404 at `fapi-2_0-security-profile-final.html`)
- Live probe 2 (2026-08-10): `issuer` versus `token_endpoint` — `SERVICE-CONFIG-PROBE.md` §5
- Cross-references: `DISCOVERY-rfc8414-oidc-discovery.md` (B3), `RFC9207-issuer-identification.md` F-2

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| AM-W1 | Cite the Attacker Model when fixing the issuer/host mismatch | S | The B3 remediation's rationale names **A1a** and the "authoritative source over a protected channel" statement, so the fix is justified by a threat rather than by a path convention. |
| AM-W2 | Close the superseded-URL question | S | Fetch the unsuffixed `fapi-attacker-model-2_0.html`; and correct whichever row prompted the note — most likely the Security Profile's slug, which 404s in the `-final`-suffixed form this repo would naturally construct. Retires one of the ten `01-spec-matrix.md` §7 spot-check rows. |
| AM-W3 | Use A1–A5 as Module 10's vocabulary | M | **Phase 3 suggestion, not a conformance item.** Module 10 justifies FAPI 2.0's shall statements in terms of the archetypes they defend against, which is what the document exists for. |
| AM-W4 | No implementation | — | Correct: there is nothing to implement. |
