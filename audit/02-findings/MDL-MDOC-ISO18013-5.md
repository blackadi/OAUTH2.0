# mDL / mdoc — ISO/IEC 18013-5

- **Verdict:** `OUT_OF_SCOPE` — decision record required at Gate 4
- **Severity:** **S4**
- **Status:** **ISO/IEC standard — paywalled, and therefore NOT verified against its primary source.** See the Sources note; this is the only entry in the audit whose specification text I could not read.
- **Authlete version:** 3.0 — **no `llms.txt` page** (`00-inventory.md` §10: *"Group C; not documented"*)
- **Repo docs under test:** `docs/curriculum/SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 (*"Decision record needed"*)

<thinking>
1. What it is: the ISO standard defining the mobile driving licence and the underlying `mdoc` credential format —
   CBOR/COSE-based, unlike the JSON/JOSE world the rest of this repo lives in.
2. **I cannot read it.** ISO standards are sold, not published. Every other entry in this audit rests on primary
   text fetched this session; this one cannot, and the audit's anti-hallucination rule is explicit that I must say
   so rather than substitute plausible detail.
3. So the honest scope of this entry is: what can be established *without* the standard — that Authlete documents
   no mdoc surface, that the repo contains no CBOR/COSE code, and that HAIP (which I did read) names ISO mdoc as
   one of two acceptable credential formats.
4. Authlete boundary: none documented.
5. Code: nothing. No CBOR, no COSE, no mdoc.
6. The verdict is a scope ruling and it is uncontroversial. The value of the entry is (a) recording the unverifiable
   citation honestly, and (b) noting the one place mdoc *does* touch a spec this repo aspires to.
</thinking>

## What can be established without the standard text

| Question | Answer | Evidence |
|---|---|---|
| Does Authlete document an mdoc surface? | **No** | `llms.txt` has no mdoc/mDL page (`00-inventory.md` §10, `01-spec-matrix.md` §3) |
| Does the repo contain any mdoc code? | **No** | grep for `mdoc`, `mDL`, `18013`, `CBOR`, `COSE` over `server/src` and `client/src` — zero occurrences |
| Does any repo document claim it works? | **No** | `README.md` and `docs/` make no mDL claim |
| Does any spec this repo aspires to require it? | **Partly** | **HAIP** requires *"at least one of … IETF SD-JWT VC or ISO mdoc"* — so mdoc is one of two ways to satisfy HAIP, and SD-JWT VC is the other |
| Is the format compatible with this codebase's toolchain? | **No** | mdoc is CBOR/COSE; every credential and token format in this repo is JSON/JOSE (`jsonwebtoken`, `jose`-style handling throughout) |

That last row is the substantive finding, and it does not require the standard text to establish.

## Finding F-1 — the citation cannot be verified, and the audit must say so (S4)

Every other entry in this audit cites specification text fetched in this session, per the audit's own rule:
*"Every claim about Authlete or an RFC carries a URL you fetched in this session. Do not cite from memory."*

**ISO/IEC 18013-5 is sold by ISO and is not retrievable.** I did not fetch it, I am not citing its clauses, and I
am not restating its requirements from recall. What appears above is confined to facts about *this repo*, plus one
quoted requirement from HAIP, which I did read.

Consequences for the repo's own claims:

- `SPEC-INVENTORY.md` records this row as **"ISO/IEC 18013-5 · ISO"** with no date and no clause citations. That is the correct handling — it asserts nothing it cannot support.
- But `docs/curriculum/README.md:116-122` promises *"Every spec identifier here is verified against its primary source, labeled by type."* For a paywalled standard that promise cannot be kept, and the file does not carve out an exception. The honest fix is a labelled category — *"paywalled standard; identifier verified from secondary sources, clauses not cited"* — rather than either dropping the row or implying verification.

This is a small documentation-integrity point, and it is exactly the kind the repo's own accuracy rule exists for.

## Finding F-2 — mdoc is the credential format this codebase is least able to adopt (S4)

Worth recording because it changes the cost estimate a decision record needs. mdoc is **CBOR** with **COSE**
signatures. This repo's entire credential and token surface is JSON with JOSE: `jsonwebtoken` for local JWTs
(`utils/createLocalJWT.ts`), `crypto.subtle` for DPoP proofs (`client/src/services/dpop.service.ts`), Authlete for
everything else, and `docs/curriculum/scripts/sd-jwt.mjs` for selective disclosure.

So adopting mdoc would mean introducing a CBOR/COSE toolchain for one credential format — and **HAIP explicitly
accepts SD-JWT VC as the alternative**, which is the format the repo already teaches. There is therefore no
scenario in which mdoc is the cheaper path to any goal this repo has.

`01-spec-matrix.md` §3's gating condition for this row is *"requires a wallet"*, which is true and incomplete: it
also requires a format toolchain the repo has no other use for.

## Scope recommendation — document-only, and prefer SD-JWT VC if the question ever reopens

Recommend `OUT_OF_SCOPE`:

1. **No vendor surface.** Authlete documents none, so there is nothing to delegate to and everything would be ours.
2. **A wallet is required**, as with OID4VP — and issuance is blocked first (`OID4VCI-1.0.md` F-1).
3. **SD-JWT VC dominates it for every purpose here.** It satisfies HAIP's format requirement, it is JOSE-based, and the curriculum already teaches selective disclosure via RFC 9901.
4. **The standard is unreadable without purchase**, so even a document-only page could not be written to this repo's citation standard — which is itself a reason not to promise one.

That fourth point is a real constraint on the *shape* of the artifact: a HAIP or OID4VP page can quote its
specification; an mDL page cannot, and would have to be explicit that it describes the format from secondary
sources.

## Documentation delta

| Doc claim | Location | Reality | Verdict |
|---|---|---|---|
| Row exists as "ISO/IEC 18013-5", ISO, no date, no clauses | `SPEC-INVENTORY.md`, `01-spec-matrix.md` §3 | Correct and appropriately minimal | **Accurate** |
| "no page in `llms.txt`" / "Not documented" / "Decision record needed" | `01-spec-matrix.md` §3 | All three accurate | **Accurate** |
| Gating condition "requires a wallet" | `01-spec-matrix.md` §3 | True; omits the CBOR/COSE toolchain cost — F-2 | **Incomplete** / S4 |
| *"Every spec identifier here is verified against its primary source"* | `docs/curriculum/README.md:116-122` | Cannot hold for a paywalled standard, and no exception is stated — F-1 | **Overbroad** / S4 |
| Nothing claims mDL support | `README.md`, `docs/` | Correct | **Accurate** |

## Sources consulted

- **ISO/IEC 18013-5 was NOT fetched.** It is a paywalled ISO standard. No clause of it is cited in this entry, and no requirement is restated from memory. This is the only entry in the audit resting on no primary specification text, and the verdict is a scope ruling rather than a conformance measurement — which is what makes that acceptable here.
- OpenID4VC High Assurance Interoperability Profile 1.0 — `https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html`, fetched this session. The *"at least one of … IETF SD-JWT VC or ISO mdoc"* requirement is quoted from it.
- RFC 9901 (the JOSE-based alternative) — `https://www.rfc-editor.org/rfc/rfc9901.txt`
- Phase 0/1: `00-inventory.md` §10 (no `llms.txt` page), `01-spec-matrix.md` §3
- Code: grep for `mdoc`, `mDL`, `18013`, `CBOR`, `COSE` — zero occurrences in `server/src` and `client/src`

## Proposed work items

| ID | Item | Effort | Acceptance criteria |
|---|---|---|---|
| MDL-W1 | Write the decision record | S | Dated; states the four grounds above, including that the standard is paywalled and a citation-standard page cannot be written; names SD-JWT VC as the preferred format for any HAIP ambition. Revisit trigger: an ecosystem requirement for mdoc specifically. |
| MDL-W2 | Carve out the paywalled-standard case in the curriculum's verification promise | S | `docs/curriculum/README.md:116-122` gains a category for standards whose text is not publicly retrievable, so the promise stays true — F-1. |
| MDL-W3 | Record the toolchain cost in the inventory row | S | ✅ **DONE 2026-08-14 (T2-5).** Applied verbatim to `01-spec-matrix.md` §3 — **not** `SPEC-INVENTORY.md`, which has no mdoc row and should not gain one, since `mdoc`/`18013`/`mDL` appear nowhere in `docs/`. **The provenance attempt is itself recorded, because it failed:** `iso.org/standard/69084.html` returns **HTTP 403** to an automated fetch and the text is paywalled regardless, so **no header line exists to cite** and the row says so. Identifier and title come from the ISO catalogue listing, **labelled a secondary source**. That is the honest third option against dropping the row or dressing a secondary source as a header — and it is the concrete evidence **MDL-W2** needs, which stays open. |
| MDL-W4 | No implementation | — | Correct. |

**Ordering.** All documentation. MDL-W2 is the only one with reach beyond this row — it touches the curriculum's
master accuracy claim, and should be reviewed alongside the per-row provenance discipline proposed in **FED-W4**.
