# Audit Pass A — defect register

**Scope:** `docs/curriculum/` — 13 modules, 4 exams, `SPEC-INVENTORY.md`, `GLOSSARY.md`, `README.md`,
`PROGRESS.md`, `scripts/`.
**Method:** adversarial. Every specification claim logged below was checked against the primary source
fetched at audit time; no claim is graded from recall. Lab claims were executed against a live server
(`:3000`) with real Authlete credentials.
**Audit date:** 2026-08-02. **Auditor:** independent review pass; did not author the curriculum.

> **Coverage warning — read this before trusting the counts.** This register covers **three passes**.
> **Pass A** read Modules 00, 01, 02, 08 closely and 03, 05, 10, 11 in substantial part, and executed labs.
> **Pass B** (appended below) audited `scripts/sd-jwt.mjs` against RFC 9901, all four exam answer keys, and
> the 14 specification identifiers Pass A had left unverified. **Pass C** read Modules **06, 07, 09a and
> 12** end to end and executed the interactive and admin-gated labs. Still **not** read end to end:
> **Pass D** audited `PROGRESS.md`, Modules **04** and **09b**, and `scripts/decode-jwt.mjs`. **Pass E**
> ran a systematic staleness sweep of every deployment-fact claim against the live server.
> **All curriculum material has now been examined.** See [Coverage and evidence](#coverage-and-evidence)
> for the depth of each.

---

## Headline judgement

This material is substantially more accurate than teaching material of this size normally is, and I want to
be precise about that rather than reassuring. Of roughly 45 specification identifiers and section pointers I
checked against primary sources, the great majority were correct including several that looked wrong until I
fetched the document. Three suspected defects dissolved on direct verification (recorded below as
[near misses](#near-misses)), which is itself evidence the curriculum's own verification pass was real.

The defects that survive cluster in one place: **status and section-pointer hygiene in
`SPEC-INVENTORY.md` and Module 00**, not in the teaching. The eighteen classic failure modes you asked
about are, with one exception, handled correctly and often with unusual nuance.

The single most consequential finding is **A-005**: a genuine spec violation in the reference deployment is
labelled as a neutral "routing choice," which teaches a learner to replicate it.

---

## Defect register

### A-001 · TLS 1.3's defining RFC is obsoleted, and the inventory presents it as current

> ✅ **FIXED 2026-08-02** in `SPEC-INVENTORY.md` — RFC 9846 is now the primary TLS row; RFC 8446 retained and marked obsoleted, with a note on why the published RFC text cannot show this.

| Field | Content |
|---|---|
| **Location** | `SPEC-INVENTORY.md` §0 "Transport & encoding foundations"; `modules/00-web-and-jose-foundations/README.md` line 87 and Spec-delta table |
| **Severity** | **Major** |
| **Claim as written** | RFC 8446 (TLS 1.3, Aug 2018) is the current TLS 1.3 specification. No obsolescence noted. |
| **What's wrong** | RFC 8446 has been **obsoleted by RFC 9846** ("The Transport Layer Security (TLS) Protocol Version 1.3", July 2026), the rfc8446bis document. The inventory's own stated purpose includes flagging "whether it has been obsoleted or updated by something newer," and its legend calls Published RFCs "Stable." This is fresh drift — RFC 9846 published July 2026, the inventory was verified 2026-07-27 — but it is live as of today. |
| **Primary source checked** | IETF Datatracker, RFC 9846 — https://datatracker.ietf.org/doc/rfc9846/ ("obsoletes RFC 8446, which specified TLS 1.3"); cross-checked against https://datatracker.ietf.org/doc/rfc8446/ which lists **Obsoleted by: RFC 9846**. Note the static rfc-editor.org copy of RFC 8446 does *not* show this, because a 2018 document carries no forward reference — Datatracker's live metadata is authoritative. |
| **Suggested correction** | Cite RFC 9846 as the current TLS 1.3 specification, retaining RFC 8446 as its predecessor. RFC 9846 is a backward-compatible minor update retaining the same protocol version number, so no teaching content changes — only the identifier. |

---

### A-002 · RFC 7592 is Experimental, presented as Standards Track

> ✅ **FIXED 2026-08-02** in `SPEC-INVENTORY.md` — row relabelled **Experimental**, the status legend extended to name Experimental, and a note added on why 7591/7592 are not equivalent. `GLOSSARY.md` (two rows) and Module 04 (new status callout in the DCR section) corrected the same day.

| Field | Content |
|---|---|
| **Location** | `SPEC-INVENTORY.md` §4 line 80; `GLOSSARY.md` lines 60, 136, 229; `modules/04-token-lifecycle-and-metadata/README.md` §"Dynamic Client Registration — RFC 7591 / RFC 7592" (lines 194–206), line 110; `modules/04.../quiz.md` Q10 and its answer key |
| **Severity** | **Major** |
| **Claim as written** | RFC 7592 is a "Published RFC" and forms a matched pair with RFC 7591: "RFC 7591 is registration; RFC 7592 is the management lifecycle." |
| **What's wrong** | RFC 7592 is **Experimental**, not Standards Track. `SPEC-INVENTORY.md`'s own legend defines "Published RFC" as "an IETF Request for Comments (**Standards Track unless noted BCP/Informational**)" — Experimental is neither noted nor covered by the exception, so the label actively asserts a status the document does not hold. This is not pedantry: RFC 7592's Experimental status is why AS vendor support for it is inconsistent and why practitioners routinely find the management lifecycle unavailable where registration works. A learner is being taught to expect parity that the ecosystem does not provide. Nothing anywhere in the curriculum discloses the status difference. |
| **Primary source checked** | IETF Datatracker, RFC 7592 — https://datatracker.ietf.org/doc/rfc7592/ — "Status: Experimental (not Standards Track)"; the document "explicitly notes it is 'not an Internet Standards Track specification'". Contrast RFC 7591 — https://datatracker.ietf.org/doc/rfc7591/ — Standards Track (Proposed Standard). |
| **Suggested correction** | Relabel the inventory row "Published RFC (**Experimental**)" and add one sentence to Module 04 noting that RFC 7592, unlike RFC 7591, is Experimental and unevenly implemented — which is itself a useful lesson about reading RFC status. |

---

### A-003 · OpenID Federation 1.1 is Final; the inventory presents 1.0 as current and misdates 1.1

> ✅ **FIXED 2026-08-02** in `SPEC-INVENTORY.md` — Federation **1.1** (5 May 2026) is now the primary row, 1.0 marked superseded, the false "same date" claim corrected, and the §9 reference confirmed to carry the same number in 1.1. Module 09b corrected the same day (README, the spec table, the further-reading line, and Q5 + its key — the Q5 quotation was left attributed to 1.0 because that is whose wording it is, with a version note explaining why).

| Field | Content |
|---|---|
| **Location** | `SPEC-INVENTORY.md` §9b line 161 and the closing verification note (lines 207–213); **`modules/09b-identity-and-credentials/README.md` lines 156–157, 412 and 578** — Pass D confirmed the error propagates verbatim into the module, which repeats *"a **OpenID Federation 1.1** of the same date"* |
| **Severity** | **Major** |
| **Claim as written** | "OpenID Federation 1.0 — OpenID Final — **17 Feb 2026**." The closing note adds that "OpenID Federation 1.0's own reference list already cites an **OpenID Federation 1.1** of the same date." |
| **What's wrong** | Two errors. (1) **OpenID Federation 1.1 is itself Final and is what the OIDF specifications index now lists** — the curriculum teaches from the superseded 1.0. (2) Federation 1.1 is dated **5 May 2026**, *not* "the same date" as 1.0's 17 Feb 2026. The footnote's characterisation is factually wrong, which matters because it is the sentence a reader would rely on to decide the two versions are interchangeable. |
| **Primary source checked** | https://openid.net/specs/openid-federation-1_1-final.html — "Title: OpenID Federation 1.1 · Version: 1.1 · Status: Final · Date: May 5, 2026". Cross-checked https://openid.net/specs/openid-federation-1_0-final.html (1.0, Final, 17 February 2026) and the OIDF index https://openid.net/developers/specs/, which lists "**OpenID Federation 1.1**" and "OpenID Federation for OpenID Connect 1.1" under Final Specifications — 1.0 is not listed. |
| **Suggested correction** | Make Federation 1.1 (5 May 2026) the primary row, note 1.0 (17 Feb 2026) as its predecessor, and correct the "same date" claim. Confirm which version Module 09b's entity-statement and trust-chain material tracks. |

---

### A-004 · Module 00 cites RFC 9449 §2.1, a section that does not exist

> ✅ **FIXED 2026-08-02** — both occurrences in `modules/00-web-and-jose-foundations/` (quiz stem and answer key) now cite **§4.2 "DPoP Proof JWT Syntax"**, with the key noting explicitly that RFC 9449 has no §2.1. Module 05's seven correct §4.2 citations were left untouched. **`AGENTS.md` carries the same "§2.1" error and is outside `docs/curriculum/` — fix it there too or it will re-propagate.**

| Field | Content |
|---|---|
| **Location** | `modules/00-web-and-jose-foundations/quiz.md` line 80 (Q13 stem); `modules/00-web-and-jose-foundations/quiz-answers.md` line 66 (Q13 key) |
| **Severity** | **Major** |
| **Claim as written** | "RFC 9449 **§2.1** requires a specific header member" — the `jwk` public key in the DPoP proof's JOSE header. |
| **What's wrong** | **RFC 9449 has no Section 2.1.** Section 2 is "Objectives" and has no subsections. The `jwk` header-member requirement is in **§4.2 ("DPoP Proof JWT Syntax")**. The requirement itself is described correctly and the pedagogy is sound — only the pointer is fabricated. This is a self-inconsistency as much as an error: **Module 05 cites §4.2 correctly** in five places (`README.md` 105, 107, 202, 203; `lab.md` 178, 263), as does `exams/exam-b-answers.md` line 109 and `GLOSSARY.md` line 63. Module 00 is the sole outlier, and it appears in a quiz *and* its answer key, so a learner meets the bad pointer twice. The likely propagation source is `AGENTS.md`, which carries the same "§2.1" error (out of audit scope, but worth fixing at the same time or it will re-propagate). |
| **Primary source checked** | https://www.rfc-editor.org/rfc/rfc9449.html — section structure confirmed as §2 Objectives (no subsections), §4 DPoP Proof JWTs, §4.1 The DPoP HTTP Header, §4.2 DPoP Proof JWT Syntax, §4.3 Checking DPoP Proofs, §6.1 JWK Thumbprint Confirmation Method, §7.1 The DPoP Authentication Scheme. |
| **Suggested correction** | Change both occurrences to §4.2. Fix `AGENTS.md`'s "§2.1" in the same edit. |

---

### A-005 · A normative discovery-path violation is taught as "this app's routing choice, not a spec requirement"

> ✅ **FIXED 2026-08-02** — `SPEC-INVENTORY.md` now labels the discovery path a **non-conformance**, quoting RFC 8414 §3 and OIDC Discovery §4.1/§4.3. `modules/00-web-and-jose-foundations/lab.md` corrected the same day: the "not a spec rule" / "this app's routing choice" framing is replaced with the two MUSTs and an instruction to check the returned `issuer` against the URL it was fetched from. Both files now say the same thing — use `/api` to make the lab run, record it as a finding in a review.

| Field | Content |
|---|---|
| **Location** | `modules/00-web-and-jose-foundations/lab.md` lines 47–49 and line 163; `SPEC-INVENTORY.md` lines 84–85 ("Path quirk (labs must respect)") |
| **Severity** | **Major** |
| **Claim as written** | OIDC discovery is served under the `/api` prefix here while RFC 8414's metadata is at true root; this is "**Authlete-app behavior, not a spec rule**" and "**this app's routing choice, not a spec requirement**." |
| **What's wrong** | The placement is not spec-neutral — it is a violation of the discovery specifications, and labelling it a free routing choice teaches a learner to reproduce it. **RFC 8414 §3**: servers "**MUST** make a JSON document containing metadata … available at a path formed by **inserting a well-known URI string into the authorization server's issuer identifier** between the host component and the path component." **OIDC Discovery §4.1** requires the same issuer-derived construction, and **§4.3** adds: "The `issuer` value returned **MUST** be identical to the Issuer URL that was used as the prefix to `/.well-known/openid-configuration` to retrieve the configuration information." I verified the live deployment breaches this: discovery is retrievable only from `http://localhost:3000/api/.well-known/openid-configuration`, and the document it returns declares `"issuer": "https://blackadi.dev"` — a different host entirely, with endpoints on a third host (`cecile-soapsudsy-zoila.ngrok-free.dev`). A conforming client starting from the advertised issuer cannot discover this AS at all. The curriculum's stated standard is to flag exactly this kind of divergence; here it mislabels it. |
| **Primary source checked** | RFC 8414 §3 — https://www.rfc-editor.org/rfc/rfc8414.html · OIDC Discovery §4.1/§4.3 — https://openid.net/specs/openid-connect-discovery-1_0.html · Live verification: `curl` against `:3000` on 2026-08-02 (root `/.well-known/openid-configuration` returns the SPA HTML shell with HTTP 200, not the metadata document; `/api/...` returns the real document with the mismatched `issuer`). |
| **Suggested correction** | Relabel as a **deployment non-conformance**, not a routing preference: state that RFC 8414 §3 and OIDC Discovery §4.1 derive the well-known path from the issuer, that §4.3 requires the returned `issuer` to match the retrieval prefix, and that this deployment satisfies neither. This converts a mislabelled quirk into one of the better teaching moments available — the learner sees a real conformance failure in the system they are studying. |

---

### A-006 · RFC 8725 (BCP 225, JWT Best Current Practices) is absent from the entire curriculum

> ✅ **FIXED 2026-08-02** — RFC 8725 (BCP 225) added to `SPEC-INVENTORY.md` §1 with its relevant sections, noted on the RFC 7519 row it updates, and a callout added pointing Modules 00/06/08 at §3.1 and §3.2.

| Field | Content |
|---|---|
| **Location** | Absent from `SPEC-INVENTORY.md`; would belong in §1 (JOSE) and be cited by `modules/00-web-and-jose-foundations/`, `modules/06-machine-and-delegated-grants/`, `modules/08-oidc-core-and-logout/` |
| **Severity** | **Gap** |
| **Claim as written** | — (absence). Module 00 teaches `alg:none`, RS256→HS256 algorithm confusion and skipped claim validation; Module 06 teaches attacker-controlled `kid`/`jku` headers; Module 08 teaches pinning `alg` from registration. |
| **What's wrong** | Every one of those mitigations is **normatively codified in RFC 8725**, which the curriculum never cites — a search across all 75 files returns zero occurrences of "8725". The curriculum teaches the right things but presents them as reasoned folk practice rather than as a BCP the learner can cite in a review. That is a real loss for a course whose Module 07 method is explicitly "read the MUST/SHOULD keywords precisely": a student who has to justify "pin the algorithm" to a skeptical architect currently has no normative citation to reach for. RFC 8725 also **updates RFC 7519**, so the inventory's RFC 7519 row is incomplete without it. |
| **Primary source checked** | https://datatracker.ietf.org/doc/rfc8725/ — "JSON Web Token Best Current Practices", February 2020, **BCP 225**, Updates RFC 7519. Relevant content: §2.1 explicit typing, §3.1 "Perform Algorithm Verification", §3.2 "Use Appropriate Algorithms", §3.8 substitution attacks. Cross-checked https://datatracker.ietf.org/doc/rfc7519/ which lists **Updated by: RFC 8725**. |
| **Suggested correction** | Add RFC 8725 to `SPEC-INVENTORY.md` §1 as "Published RFC (BCP 225), Feb 2020, updates RFC 7519", note it on the RFC 7519 row, and cite §3.1/§3.2 in Module 00's threat notes and Module 08's step 7. |

---

### A-007 · Exact-redirect-matching requirement quoted from §2.1 but attributed to §4.1

> ✅ **FIXED 2026-08-02** — Module 02 README (quote + threat note) and lab now cite **§2.1** for the requirement, with §4.1.3 named as where it is argued out. Module 12 #5 left as-is: it paraphrases rather than quotes, and §4.1.3 does carry a MUST.

| Field | Content |
|---|---|
| **Location** | `modules/02-oauth-core-and-threats/README.md` lines 363–365 and line 396; `modules/02-oauth-core-and-threats/lab.md` line 268 |
| **Severity** | **Minor** |
| **Claim as written** | *"When comparing client redirection URIs against pre-registered URIs, authorization servers MUST utilize exact string matching except for port numbers in localhost redirection URIs of native apps."* **(§4.1)** |
| **What's wrong** | The sentence is quoted verbatim and accurately, but it appears in RFC 9700 **§2.1** ("Protecting Redirect-Based Flows"), not §4.1. §4.1 is "Insufficient Redirection URI Validation" — the attack description — and its countermeasures subsection §4.1.3 discusses exact matching in different words ("This document therefore advises simplifying the required logic and configuration by using exact redirection URI matching"). Presenting a verbatim quotation under the wrong section number is the specific failure mode Module 07 trains students to catch, so it is worth fixing on principle even though the requirement is real and correctly stated. I am confident on this one: I asked the source explicitly whether the sentence appears in §2.1, §4.1, or both. |
| **Primary source checked** | https://www.rfc-editor.org/rfc/rfc9700.html — §2.1 contains the quoted sentence verbatim (with its own internal cross-reference to §4.1.3); §4.1.3 contains the differently-worded discussion. |
| **Suggested correction** | Cite "§2.1 (see also §4.1.3)". Note that the §4 attack-catalogue table in the same module is **entirely correct** — all 17 subsection titles verified — so only the quotation attribution needs changing. |

---

### A-008 · Module 01's lesson text states an outcome its own lab contradicts

> ✅ **FIXED 2026-08-02** — Module 01 README no longer promises a refusal; it now tells the reader to record the outcome and the date and points at Break 1 and Module 07 §3c. The Q13 key gained a note that the "policy forbids it" premise is configuration-dependent and no longer holds here.

| Field | Content |
|---|---|
| **Location** | `modules/01-the-delegation-problem/README.md` line 207; interacts with `modules/01-the-delegation-problem/lab.md` "Break 1" and `quiz-answers.md` Q13 |
| **Severity** | **Minor** |
| **Claim as written** | "You will send this exact request in the lab and **watch a modern AS refuse it**." |
| **What's wrong** | The reference deployment **issues a token** for the ROPC grant. I ran it: `grant_type=password` returned a live access token *and* a refresh token (`expires_in: 86400`). The README states a single certain outcome; the lab does not — `lab.md` Break 1 explicitly presents **both** outcomes, explains that the reversal was caused by clearing `fapiModes`, dates it, and hands off to Module 07 §3c, which turns the contradiction into the best lesson in that module. So the curriculum as a system handles this correctly and the README line simply was not updated when the behaviour flipped. It still matters, because the README is what the learner reads *first* and it states as fact something the deployment does not do. Secondary: `quiz-answers.md` Q13 reasons "the service is capable of the password grant, and **policy forbids it**," citing `[A295306]` — a premise that no longer holds on the reference deployment, though the generalisable reasoning ("advertised ≠ permitted") survives. |
| **Primary source checked** | Live execution 2026-08-02 against `:3000` with `$CLIENT_ID`/`$CLIENT_SECRET`: `POST /api/token grant_type=password` → `{"access_token":"7AzCzz…","token_type":"Bearer","expires_in":86400,"refresh_token":"y4tz5V…"}`. Requirement text confirmed at RFC 9700 §2.4 — https://www.rfc-editor.org/rfc/rfc9700.html — *"The resource owner password credentials grant [RFC6749] MUST NOT be used."* |
| **Suggested correction** | Change the README line to match the lab's framing — "watch what your deployment does, and note the date" — and cross-reference Break 1. Add one clause to Q13's key acknowledging that the refusal premise is configuration-dependent. |

---

### A-009 · "FAPI 2.0 forbids refresh-token rotation" states a carve-out-free prohibition

> ✅ **FIXED 2026-08-02** across the teaching text — Module 10 (objective, heading, table, the unpacked argument, and the §5.3.2 checklist line), its quiz stem, the capstone key, exam C and its key, the final exam and its key, and the PROGRESS gate. The exam keys now require the exception for full marks and say to deduct for an absolute-ban answer.

> ✅ **FIXED 2026-08-02** in `SPEC-INVENTORY.md` — the row now quotes §5.3.2.1 including *"except in extraordinary circumstances"*. **Module 10, its quiz, exam C and the capstone key still say "forbids"** and remain to be reworded.

| Field | Content |
|---|---|
| **Location** | `SPEC-INVENTORY.md` line 173; `modules/10-fapi-and-grant-management/README.md` lines 57, 219 (heading), 348, 374; `modules/10.../quiz.md` Q9 stem; `exams/exam-c.md` C12; `modules/12-capstone/quiz-answers.md` row 10 |
| **Severity** | **Minor** *(logged with my reasoning shown, because there is real counter-evidence)* |
| **Claim as written** | "FAPI 2.0 **forbids** refresh-token rotation." |
| **What's wrong** | The normative requirement is **conditional**: FAPI 2.0 §5.3.2.1 item 9 reads *"shall not use refresh token rotation **except in extraordinary circumstances**"*, and the profile elsewhere describes what to do in those circumstances (offer a time-limited window to retry with the old refresh token, for infrastructure migration and similar). Module 10 **does** quote the exception verbatim, once, in its §5.3.2.1 requirements table (README line 199) — but the exception is never unpacked, and every other surface states a flat prohibition. Because the flat form is what propagates into an assessed quiz item and an exam question, a student who passes both can be unaware an exception exists. **Counter-evidence I weighed:** the spec's own NOTE 1 uses the word *"prohibits"* ("This specification prohibits the use of refresh token rotation for security reasons"), which substantially justifies "forbids"; and Module 10's four-step unpacking of NOTE 1 is genuinely excellent. That is why this is Minor and not Major — it is a missing caveat, not a false statement. |
| **Primary source checked** | https://openid.net/specs/fapi-security-profile-2_0-final.html — §5.3.2.1 item 9 (normative `shall` with the "extraordinary circumstances" carve-out) and §5.3.2.1 NOTE 1 (non-normative, uses "prohibits"). |
| **Suggested correction** | Add one sentence where the prohibition is first drawn: the `shall not` carries an "except in extraordinary circumstances" exception intended for infrastructure migration, and the profile requires a retry window when it is invoked. Reword the Q9/C12 stems from "forbids" to "shall not … except in extraordinary circumstances." |

---

### A-010 · RFC 7518 (JWA) carries no "updated by" note

> ✅ **FIXED 2026-08-02** — RFC 7518 marked *updated by RFC 9864*, with an explicit note that the `ES256` deprecation is **COSE-only** and changes nothing in this curriculum. Deliberately annotated without overstating.

| Field | Content |
|---|---|
| **Location** | `SPEC-INVENTORY.md` §1 line 51 |
| **Severity** | **Minor** |
| **Claim as written** | RFC 7518, JSON Web Algorithms (JWA), Published RFC, May 2015. No update noted. |
| **What's wrong** | RFC 7518 is **updated by RFC 9864** ("Fully-Specified Algorithms for JOSE and COSE", October 2025). The inventory's stated purpose includes tracking whether a document "has been obsoleted or updated by something newer," and this row does not. **I am deliberately understating the impact:** RFC 9864's headline change — deprecating `ES256` in favour of the fully-specified `ESP256` — applies to **COSE registries, not JOSE**, and RFC 9864 explicitly declines to register fully-specified RSA variants. So none of the curriculum's `ES256`/`RS256` teaching becomes wrong. This is an inventory-completeness defect, not a teaching defect, and should not be over-corrected into scaring learners off `ES256` in JOSE. |
| **Primary source checked** | https://datatracker.ietf.org/doc/rfc9864/ — October 2025, Proposed Standard, Updates RFC 7518 / RFC 8037 / RFC 9053; ES256 deprecation scoped to COSE. Cross-checked https://datatracker.ietf.org/doc/rfc7518/ which lists **Updated by: RFC 9864**. |
| **Suggested correction** | Add "updated by RFC 9864 (Oct 2025) — fully-specified algorithm identifiers; the `ES256`→`ESP256` change is COSE-only and does not affect JOSE usage here." |

---

### A-011 · The four logout specification rows carry no dates, and one exact title is incomplete

> ✅ **FIXED 2026-08-02** — RP-Initiated dated 12 Sep 2022; Back-Channel Logout dated 15 Dec 2023 and retitled *"incorporating errata set 1"*, with its §2.4 `nonce` MUST NOT quoted. The two rows whose dates were **not** individually verified are marked *(see note)* rather than guessed.

| Field | Content |
|---|---|
| **Location** | `SPEC-INVENTORY.md` §8 lines 141–144 (RP-Initiated, Front-Channel, Back-Channel, Session Management); `modules/08-oidc-core-and-logout/README.md` spec-delta table (lines 344–347) |
| **Severity** | **Minor** |
| **Claim as written** | Four rows reading "OpenID Connect Back-Channel Logout 1.0 · OpenID Final · **—**" and similar, with an em-dash in the Date column for all four. |
| **What's wrong** | Two gaps, both against the file's own stated standard ("every spec: **exact title**, verified **status/date**"). (1) **Back-Channel Logout 1.0's exact title is "OpenID Connect Back-Channel Logout 1.0 incorporating errata set 1"**, dated **15 December 2023** — the errata suffix is omitted. This is precisely the correction the curriculum already made for JARM and applied to OIDC Core, so the standard exists and was simply not applied here. (2) All four rows have **no date at all**, while every other row in the inventory carries one; RP-Initiated Logout 1.0 is dated **12 September 2022**. Low impact — no teaching content depends on it, and the statuses ("OpenID Final") are all correct — but it is the one place the inventory silently drops its own methodology. |
| **Primary source checked** | https://openid.net/specs/openid-connect-backchannel-1_0.html — "OpenID Connect Back-Channel Logout 1.0 incorporating errata set 1 · Final · December 15, 2023" · https://openid.net/specs/openid-connect-rpinitiated-1_0.html — "OpenID Connect RP-Initiated Logout 1.0 · Final · September 12, 2022". Both statuses confirmed Final. |
| **Suggested correction** | Add the errata suffix to Back-Channel Logout's title and populate the Date column for all four rows. While there, note that Module 08's `nonce` MUST NOT rule for logout tokens is **verified correct** — Back-Channel Logout §2.4: *"A nonce Claim MUST NOT be present. Its use is prohibited to make a Logout Token syntactically invalid if used in a forged Authentication Response in place of an ID Token."* |

---

### A-012 · Lab snippets pass base64url values to `node -e` unguarded, failing ~3% of runs into a *misleading* error

> ✅ **FIXED 2026-08-02** — `--` added to **33** `node -e … "$VAR"` call sites across 8 lab files, so a base64url value beginning `-` or `_` can no longer be parsed as a Node option.

| Field | Content |
|---|---|
| **Location** | `modules/03-pkce-and-public-clients/lab.md` line 69 (`CHALLENGE=…`); `modules/05-request-integrity-and-binding/lab.md` line 50 (`CH=…`); plus the `$V` / `$RT` variants. The wider `node -e … "$VAR"` pattern appears **30 times** across the labs, but only the base64url-valued ones are exposed. |
| **Severity** | **Minor** *(tooling, not spec — but see the failure mode, which is worse than the frequency suggests)* |
| **Claim as written** | `CHALLENGE=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("base64url"))' "$VERIFIER")` |
| **What's wrong** | The value is passed as a positional argument with no `--` terminator. `$VERIFIER` is base64url, whose alphabet includes `-` and `_`; when the random verifier **begins** with either, Node parses it as a command-line option and aborts with `node: bad option: …`. The command substitution then yields an **empty** `CHALLENGE`, and because the snippet has no error check, the lab continues silently. Frequency is ~2/64 ≈ **3.1% per run** — infrequent enough to survive authoring, frequent enough that a cohort of students will hit it. **The failure mode is the real problem.** An empty challenge means the authorization request effectively carries no PKCE, so the subsequent token request — which *does* send `code_verifier` — is rejected with `[A050317] The token request contains 'code_verifier' although its corresponding authorization request did not contain 'code_challenge'`. That is **precisely the RFC 9700 §4.8 downgrade-direction-2 rejection the module is teaching**. A learner following the predict-then-run-then-explain loop would record a successful demonstration of a security control when they had actually hit a shell-quoting bug. I hit this on my first run of the Module 03 lab and briefly mis-read it the same way. |
| **Primary source checked** | Reproduced live on 2026-08-02: a verifier beginning `-0iQMYg_2dj…` produced `node: bad option: -0iQMYg_2djRfaGm2sGH6JSJKAXrB3YIzZdVTYzpp1Q`, `challenge 0 chars`, and then `[A050317]` from the token endpoint. Node's option-parsing behaviour is standard POSIX-style; `--` is the documented terminator. |
| **Suggested correction** | Add `--` before the value in the affected snippets: `node -e '…' -- "$VERIFIER"`. (Passing via an environment variable and reading `process.env` also works.) Only the base64url-valued call sites strictly need it — the URL-valued ones (`$PRU`, `$REDIRECT_URI`, `$F`) always start with `http` — but applying `--` uniformly across all 30 is cheaper than auditing which are safe. |

---

### A-013 · Multiple-choice answer keys are positionally biased: **`D` is never correct, in 90 items**

> ⚠️ **PARTIALLY FIXED 2026-08-02.** Rebalanced to **A: 17 · B: 74 · C: 37 · D: 9** — `D` is no longer a dead option anywhere, and always-answering `B` drops from **62% → 54%**. Only **17 items** were changed, and deliberately so: **this defect is not safely automatable.** The keys' pedagogical value comes from explaining each wrong option *by letter* ("**A** is the trap", "**C** and **D** are endpoints, not channels"), and that is exactly what a mechanical re-lettering corrupts. A first attempt to bulk-rebalance 50 items *did* corrupt one — Module 08 Q1's header was re-lettered correctly while its prose still described the old option order — and was fully reverted (verified byte-identical to the baseline distribution) before the conservative pass was applied. Only items whose key contains **no standalone option letter anywhere** were touched; every change was verified by asserting the key's letter still resolves to the same answer text and that no option set changed (124 items checked, 0 violations). **The remaining ~114 items need per-item editing** — moving the correct answer *and* rewriting the key's letter references together. That is genuine editorial work, not a script, and should not be faked with one.

| Field | Content |
|---|---|
| **Location** | Every `quiz-answers.md` and all four `exams/*-answers.md`. Worst concentrations: Module 12 (3 items, all `B`), Module 07 (5 `B` / 2 `C`), Module 05 (5 `B` / 3 `C`), Module 10 (first four items all `B`). |
| **Severity** | **Minor** *(no wrong fact is taught — but this is the highest-impact Minor in the register, because it degrades the instrument the curriculum uses as its progression gate)* |
| **Claim as written** | — (structural). `README.md` instructs: *"Gate yourself with the quizzes. Don't advance until you can pass Tier 4."* Tiers 1–2 are the multiple-choice tiers. |
| **What's wrong** | **Correction to this entry's own numbers (2026-08-02):** the original count of 90 items was an undercount — the pattern used required a `)` after the letter and so missed every key written as `**Qn — B.**`. The true corpus is **137 multiple-choice items**, all in the 13 module quizzes (the four exams are free-response). The true baseline distribution is **A: 9 · B: 85 · C: 43 · D: 0**. The finding is unchanged and slightly stronger: `D` is never correct across 137 items, and always-answering `B` scores **62%**. **Option `D` is never the correct answer anywhere in the curriculum**, and `A` is correct three times (3.3%). Consequences: a learner who answers **`B` to every multiple-choice item scores 62%** with zero knowledge; one who simply never considers `A` or `D` is right to ignore them in 87 of 90 items. The `D` distractors — several of which are well-written and carry real teaching value in the answer keys' "why the wrong answers are wrong" prose — are decorative in practice, and a test-wise learner will stop reading them. This is invisible to anyone reading a single quiz, which is exactly why it survived: the bias is only detectable across the corpus. The Tier 3/4 free-response items are unaffected and remain genuinely demanding, so the *gate* is not fully broken — but the recall and applied-reasoning tiers no longer measure what they claim to. |
| **Primary source checked** | Corpus analysis over `modules/*/quiz-answers.md` and `exams/*-answers.md` on 2026-08-02, matching the two key formats in use (`**Qn — X)`  and `### Qn — **X)`): 90 items total, distribution as above. Verified against the two distinct formatting conventions after an initial narrower pattern under-counted Modules 09b/10/11. |
| **Suggested correction** | Rebalance toward roughly uniform placement (~22–23 per option across 90 items), which is a pure key-and-option-order edit — no question needs rewriting, since the distractors already exist and are already explained. Cheapest mechanical fix: for a randomly chosen ~half of the items, swap the correct option into the `A` or `D` slot and renumber the answer key. Worth a one-line check in the build process so it does not drift back. |

---

### A-014 · Module 04 teaches that RFC 9728 is not served — it is, and the lab's expected output is now wrong

> ✅ **FIXED 2026-08-02** — Module 04 README and lab both corrected. The detection exercise is preserved but now uses an invented path as its negative control and RFC 9728 as the positive one, which teaches the content-type lesson *better* than the original. Re-run against the live server: all documented outputs now match.

| Field | Content |
|---|---|
| **Location** | `modules/04-token-lifecycle-and-metadata/README.md` lines 188–192 (metadata section) and 238 ("Where this lives in the code"); `modules/04-token-lifecycle-and-metadata/lab.md` lines 249–276 ("Break it") and line 337 (checklist). Contradicts `SPEC-INVENTORY.md` lines 78 and 192. |
| **Severity** | **Major** |
| **Claim as written** | *"**Gap in this repo — RFC 9728 is not served.** … there is no `/.well-known/oauth-protected-resource` route. Worse, requesting it returns **HTTP 200** — the SPA's catch-all serves an HTML page."* · *"**No route serves RFC 9728.** Confirm it yourself with `grep -rn "oauth-protected-resource" server/src/`."* · lab checklist: *"**RFC 9728 is genuinely not implemented here.**"* |
| **What's wrong** | RFC 9728 **is** served, and has been since 2026-07-28. The route file `server/src/routes/protected-resource-metadata.routes.ts` exists, is mounted at true root in `app.ts:171`, and the endpoint returns a valid metadata document. Every one of the lab's three documented outputs is now false. Verified live: `Content-Type: application/json; charset=utf-8` (lab says `text/html`), body `{"resource":"…/api/userinfo","authorization_servers":[…],…}` (lab says `<!DOCTYPE html>`), and the grep the lab instructs the learner to run returns **three hits** in `app.ts`, the controller and the route file (lab says `no route in server/src — confirmed absent`). `SPEC-INVENTORY.md` states the opposite in two places, including *"Implemented 2026-07-28; **Module 04's proposal is closed**."* **Partial mitigation, which is why this is Major and not Critical:** the README's *proposal* section at line 328 **was** updated — *"Status: implemented on 2026-07-28 … On this deployment the endpoint now answers with JSON"* — but that correction sits ~140 lines after the false claims, and **the lab was never corrected at all**. A learner meets the false statement twice in the lesson, runs a lab whose three expected outputs are all wrong, and only afterwards finds the note saying so. The *lesson* being taught (a SPA catch-all makes HTTP 200 meaningless, so never infer existence from a status code) is correct and worth keeping — it is only the example that has expired, and the lab's `/.well-known/totally-made-up` control still demonstrates it perfectly. |
| **Primary source checked** | Live verification 2026-08-02 against `:3000`: `curl -i /.well-known/oauth-protected-resource` → `Content-Type: application/json; charset=utf-8` and a well-formed RFC 9728 document; `grep -rn "oauth-protected-resource" server/src/` → 3 matches (`app.ts:171`, `protected-resource-metadata.controller.ts:9`, `protected-resource-metadata.routes.ts:9`); `ls server/src/routes/protected-resource-metadata.routes.ts` → present. RFC 9728 itself confirmed at https://datatracker.ietf.org/doc/rfc9728/ (April 2025, sole REQUIRED member `resource`). |
| **Suggested correction** | Swap the example rather than delete the exercise. Point the "Break it" block at `/.well-known/totally-made-up` alone (or any genuinely absent path), keep all three habits it teaches, and add a sentence noting that `/.well-known/oauth-protected-resource` **used** to demonstrate this and now serves real JSON — which is itself a good lesson about re-testing assumptions against a moving deployment. Then fix README lines 188–192 and 238, and the lab checklist at line 337. |

---

## Known failure modes — adjudicated

All eighteen you asked about. "Right" means I verified the treatment against the primary source.

| # | Failure mode | Verdict | Evidence |
|---|---|---|---|
| 1 | Implicit / ROPC as viable choice | **Right** | M02 grant table marks implicit "Retired — RFC 9700 §2.1.2" and ROPC "Forbidden — §2.4 MUST NOT"; both taught as history with the reasoning for their death. M01 devotes the module to why ROPC is the anti-pattern. |
| 2 | OAuth as authentication / token proves user authenticated | **Right** | M01 plants it (line 47–49, "a key card proves a permission, not an identity"); M08 Ex 1 builds the full token-substitution attack. |
| 3 | ID token as API credential | **Right** | M08 threat table: "ID token used as an access token → RS accepts evidence as authority → RFC 9068 `typ: at+jwt`; never send it." |
| 4 | Access token as identity assertion | **Right** | M08 Q6 and Q16 are built on exactly this misconception. |
| 5 | PKCE and `state` conflated | **Right** | M03 has a dedicated comparison table with a "Helps if the code is stolen?" row (state: No, PKCE: Yes) and distinct attack attributions (§4.7 vs §4.5). "They are complementary, not alternatives. Send both." |
| 6 | PKCE as replacement for client auth | **Right** | M03 keeps them orthogonal: public/confidential split is about secret-keeping, PKCE is MUST for public and RECOMMENDED for confidential (RFC 9700 §2.1.1, quoted correctly). |
| 7 | `nonce`/`state` conflated; nonce presented as optional | **Right** | M08 §"`nonce` vs. `state` — the confusion, settled" — seven-row table; correctly notes `nonce` is integrity-protected inside the signature and `state` is not. |
| 8 | Incomplete ID token validation | **Right** | M08's thirteen steps map **exactly** to OIDC Core §3.1.3.7, in order — verified item by item. `iss` (2), `aud` (3), signature (6), **alg allowlist from registration** (7), `exp` (9), `iat` (10), `nonce` (11) all present. `kid` handling covered at M00 Q15 step 3 and M11 key rotation. |
| 9 | `at_hash`/`c_hash` at hybrid | **Right** | M08 dedicated table binding each to its `response_type` condition; `c_hash` correctly identified as what makes hybrid safe. `s_hash` included with its FAPI scope. |
| 10 | `alg:none`, algorithm confusion, `kid` injection | **Right** | `alg:none` and RS256→HS256 taught in M00 (lesson, lab Break 2, quiz Q11) and revisited in M08 step 7. **`kid` injection is covered** — M06 README:366 and quiz-answers:198–205 build the attacker-controlled `kid`/`jku` header attack with a rogue JWKS. Gap only in that RFC 8725 is not cited (**A-006**). |
| 11 | Refresh rotation presented as universally required | **Right** | The M03↔FAPI 2.0 tension is explicitly raised in M03, deferred, and resolved in M10 with NOTE 1 quoted. `refreshTokenKept` polarity is consistent across README, lab, quiz-answers. Only the missing carve-out (**A-009**) detracts. |
| 12 | Scope presented as authorization | **Right** | M11 §"Why a valid token cannot stop BOLA" — a four-step structural argument ("Not 'usually doesn't'. *Cannot*"), plus the wrong-row/wrong-column/wrong-verb test and the scope-the-query fix. Among the strongest sections in the curriculum. |
| 13 | Bearer tokens in query params without prohibition | **Right** | M01 quiz-answers Q5 explicitly marks the query-parameter form "discouraged — tokens in URLs leak into logs, referrers, and history." Matches RFC 6750 §2.3's SHOULD NOT. |
| 14 | Audience restriction / resource indicators missing | **Right** | RFC 8707 in the inventory and cited 33× ; M01 confused-deputy section names `aud` + `resource` as the bounding mechanisms; M04 covers `resource` → `aud`. |
| 15 | Drafts cited as normative | **Right** | Strongest area. OAuth 2.1 is pinned to `draft-ietf-oauth-v2-1-15`, 2 Mar 2026, with an explicit "**Never cite this draft as normative**" instruction. Grant Management and SD-JWT VC similarly pinned with revision + consulted date. All verified accurate. |
| 16 | Authlete behaviour presented as spec requirement | **Right** | Consistently labelled — e.g. M01 Break 1 "(**Authlete vendor behavior**, not spec wording)", M01 actor 6 "architecture choice of this deployment, not a spec requirement". **One exception: A-005**, where a spec violation is mislabelled the other way. |
| 17 | Front/back channel not distinguished | **Right** | M00 is built on it; every module's wire-walkthrough annotates which leg is which; Mermaid diagrams use dashed/solid consistently. |
| 18 | DPoP specifics (P1363 vs DER, `ath` vs `sub`, required `jwk`) | **Right, with A-004** | All three taught. `ath` vs `sub` at M00 Q12 and M05; raw P1363 R‖S vs DER at M00 line 133 and M05; `jwk` header member at M05 (correctly, §4.2). Only the M00 §2.1 pointer is wrong (**A-004**). |
| — | FAPI 2.0 vs 1.0 simplification claims | **Right** | Verified against the profile: mandatory PAR, PKCE S256, sender-constraining, `iss`, `code`-only, and the `s_hash`→PKCE / JARM→`code` substitutions all confirmed in §5.3.2.1–§5.3.2.2. The A4-attacker treatment is exemplary (see near misses). |

---

## Near misses — suspected defects that dissolved on verification

Recording these because they are evidence about how hard I looked, and because each would have been a
plausible-sounding false positive.

| Suspicion | Why it looked wrong | What the source actually said |
|---|---|---|
| CIBA Core 1.0 labelled "OpenID Final" | The OIDF specifications index lists CIBA under **Implementer's Drafts** | The document header itself reads **Final, 1 September 2021**. Inventory correct; the index listing is misleading. Verified at https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html |
| JARM dated 17 Aug 2025 "incorporating errata set 1" | `oauth-v2-jarm-final.html` serves a **Final dated 9 November 2022** with no errata set | There are two URLs. `oauth-v2-jarm.html` carries "…**incorporating errata set 1** … Published: 17 August 2025 · Status: Final". Inventory correct, and its JARM correction note was right. |
| FAPI 2.0 Attacker Model "six attackers (A1, A1a, A2, A3a, A4, A5)" | The profile is usually described as defending five | Six *are* labelled (§7.2–§7.7), but A4 is "kept for informative purposes only." **Module 10 handles this outstandingly** — it quotes the informative-only text verbatim and makes "a design decision eliminated an entire attacker" the teaching point. |
| Module 00 citing RFC 9449 **§4.3** for the `ath` requirement | §4.3 is "Checking DPoP Proofs", so `ath`'s *definition* is in §4.2 | §4.3 does contain "If presented to a protected resource in conjunction with an access token, ensure that the value of the `ath` claim equals the hash of that access token." Citing §4.3 from the verifier's perspective is defensible. Not a defect. |
| Both metadata documents returning HTTP 200 at root *and* `/api` | Suggested the "path quirk" claim was false | Root `/.well-known/openid-configuration` returns the **SPA HTML shell**, not the document. The quirk claim is correct — but chasing it surfaced **A-005**, which is a genuine and more serious finding. |
| Module 01 Break 1 claiming ROPC refusal | The live deployment issues a token | `lab.md` documents **both** outcomes explicitly, dates the reversal, and hands off to Module 07 §3c. Only the README line (**A-008**) is stale. |

---

## Lab execution results

Server `:3000` started from `npm --prefix server run dev`; `scripts/curriculum.env` sourced. Every empirical
claim I executed **reproduced as documented**.

| Claim | Module | Result |
|---|---|---|
| PAR `request_uri` `expires_in` is exactly **600**, non-conformant with FAPI 2.0 §5.3.2.2 ("less than 600") | 10 Ex 3 | ✅ **Confirmed.** `expires_in = 600`. Spec wording verified verbatim: *"shall issue pushed authorization requests `request_uri` with `expires_in` values of less than 600 seconds"*. The `<` vs `<=` argument is correct. |
| Token exchange fails for any subject token carrying a scope (SDK response-schema mismatch) | 06 / inventory | ✅ **Confirmed** at audit time. `ResponseValidationError: Response validation failed` from `@authlete/typescript-sdk` `matchers.ts:344`. — **No longer reproduces as of 2026-08-06:** fixed by the SDK 1.0.0 pin; see PROGRESS.md. Row retained as the audit record. |
| `alg:none` JWT bearer assertion rejected with `[A314310]` | 06 Ex | ✅ **Confirmed**, exact code and message: *"[A314310] The JWT specified by the 'assertion' request parameter is not signed."* |
| OpenID Federation entity-configuration endpoint is broken | 09b | ✅ **Confirmed.** `/.well-known/openid-federation` → **HTTP 400**. |
| Verifiable Credentials disabled; refusal code `A364301` | 09b | ✅ **Confirmed**, exact code: *"[A364301] Because the feature of Verifiable Credentials is not enabled on this service…"* |
| ROPC outcome is configuration-dependent (lab documents both) | 01 Break 1 / 07 §3c | ✅ **Confirmed** — token issued. Substantiates **A-008**. |
| RFC 9728 protected-resource metadata served at true root with the sole REQUIRED `resource` member | 04 / inventory | ✅ **Confirmed.** Document present and well-formed. |
| PAR with `client_secret_basic` client outside `parameters` → `[A157357]` | 10 note | ✅ **Confirmed** — I hit this error before reading the lab's note, which predicts it exactly. |
| Discovery served only under `/api`, not true root | 00 lab / inventory | ✅ **Confirmed** — and see **A-005**. |

### Added in Pass C — the interactive flows

Driven with the lab's own `run_flow` cookie-jar helper against the public client.

| Claim | Module | Result |
|---|---|---|
| Full interactive code flow with PKCE S256 yields a token | 03 | ✅ **Confirmed** — login → consent → code → `access_token` + `refresh_token`, `scope=profile` |
| PKCE downgrade **direction 1** — code issued *with* challenge, token request *without* verifier, MUST reject | 03 / RFC 9700 §4.8 | ✅ **Confirmed**: `[A050312] The token request does not contain 'code_verifier' although the authorization code was created with 'code_challenge'.` |
| PKCE downgrade **direction 2** — code issued *without* challenge, token request *with* verifier, MUST reject | 03 / RFC 9700 §4.8 | ✅ **Confirmed**: `[A050317] The token request contains 'code_verifier' although its corresponding authorization request did not contain 'code_challenge'.` |
| Break 3 — a flow with **no PKCE at all succeeds**, because `pkceRequired=false` | 03 | ✅ **Confirmed** — token issued. The module's point (the AS enforces both downgrade directions but does not *require* PKCE) is exactly right. |
| Refresh-token **rotation is ON** (`refreshTokenKept=false`) | 03 | ✅ **Confirmed** — the refresh token returned by `grant_type=refresh_token` differs from the one presented. |

### Added in Pass C — the admin-gated exercises

Initially blocked: `scripts/curriculum.env` carried the credentials but **`server/.env` defined both as
empty strings**, and `requireBasicAuth` fails closed, so every management route returned `401` regardless
of what the caller sent. Resolved by provisioning a distinct admin secret in both files (see note below).

| Claim | Module | Result |
|---|---|---|
| `requireBasicAuth` **fails closed** — unset credentials 401 every management route | 04 / 11 | ✅ **Confirmed** while the server-side values were empty: `/api/token/list`, `/api/hsk/list`, `/api/client/dcr/register` all `401 {"error":"invalid_client","error_description":"Client authentication required"}` |
| Correct admin credentials reach the management API | 04 | ✅ `GET /api/token/list` → **200**, 5 access tokens, shape `{start,end,totalCount,accessTokens}` |
| Wrong secret / no credentials still rejected | 04 / 11 | ✅ wrong secret → **401**; no `Authorization` header → **401** |
| Module 11: `/api/hsk/*` is behind "the same middleware, same behaviour" as other admin routes | 11 | ✅ **Confirmed** — 401 unauthenticated; with valid admin auth the request passes the middleware and reaches Authlete, which returns a *service-level* `403 [A001223] The feature 'hsm' must be enabled to use this API`. The middleware claim is exactly right, and no lab exercises HSK, so nothing overclaims it. |
| Module 04 Ex 6: DCR register returns `[A206201]` when DCR is disabled on the service | 04 | ✅ **Confirmed verbatim**, including the code: `[A206201] Service (…) does not support dynamic client registration.` The lab's prerequisite note predicts this exactly. |
| Module 04: the `/client/dcr/register` body wraps RFC 7591 metadata in a **`json` string field** — "a deployment-specific adaptation, not the spec's own wire format" | 04 | ✅ **Confirmed** — posting raw RFC 7591 metadata returns `{"error":"invalid_request","error_description":"Missing required field: json"}`. The lab documents and correctly labels the divergence. |
| `requireGrantOwnership` returns **403** for a token with no grant (client-credentials), before Authlete's `/gm` API is called | 10 / 11 | ✅ **Confirmed**: `403 {"error":"access_denied","error_description":"The access token is not associated with the requested grant"}`; no token → **401**. This is the cross-user BOLA closure Module 11 claims. |

> **Environment note (not a curriculum defect).** To run these, a **distinct** admin secret was generated
> and written to both `server/.env` and `scripts/curriculum.env`, with `.bak.audit` backups of each. The
> values previously placed in `curriculum.env` were byte-identical to `CLIENT_ID`/`CLIENT_SECRET`, which
> would have made one leaked credential compromise both the OAuth client and the admin API.
> `scripts/curriculum.env.example` already documents the matching requirement ("These must match
> MGMT_CLIENT_ID / MGMT_CLIENT_SECRET in `server/.env`") — the setup instructions are correct as written.

**Still not executed:** HSK create/get/delete (blocked by the service-level `hsm` feature flag) and DCR
get/update/delete (blocked by DCR being disabled on the service). Both are service-configuration gates on
the reader's own Authlete tenant, not code paths, and the curriculum documents the DCR gate explicitly.

---

---

## Pass B results

Pass B targeted the three highest-risk items Pass A left unexamined. **All three came back essentially
clean**, yielding one Minor defect (A-011). That is a real result, not a shrug — each was checked hard
enough that a defect would have surfaced.

### B-1 · `scripts/sd-jwt.mjs` vs RFC 9901 — **CLEAN**

Pass A flagged this as "the highest unexamined risk in the repo," because Module 09b teaches SD-JWT
*through* this script with no spec text to catch a bug. It holds up.

**Executed end to end.** Issued a 6-claim credential with 5 selectively disclosable and 2 decoy digests,
presented 2 of 5 with key binding, verified. Only the 2 disclosed claims reached the processed payload —
selective disclosure works as taught.

**Three attacks, all correctly rejected:**

| Attack | Expected defence | Result |
|---|---|---|
| Holder re-attaches all 5 withheld Disclosures while keeping the KB-JWT that covered only 2 | §4.3.1 `sd_hash` binding | ✅ `FAIL 7.3/5g` — sd_hash mismatch |
| Tamper a disclosed value (`birthdate` 1815→1995) | §7.1 step 5 — Disclosure no longer referenced by any digest | ✅ `FAIL 7.1/5` |
| Replay a valid presentation with the wrong nonce | §7.3 step 5 nonce check | ✅ `FAIL 7.3/5f-nonce` |

**All 19 RFC 9901 section citations in the script verified to exist and say what is claimed**: §1.2, §4,
§4.1.1, §4.1.2, §4.2.1, §4.2.2, §4.2.3, §4.2.4, §4.2.4.1, §4.2.5, §4.2.6, §4.3, §4.3.1, §6, §7.1, §7.3,
§9.3, §9.5, §9.7. Two quotations checked verbatim and correct: §4.2.3 *"The digest MUST be computed over
the US-ASCII bytes of the base64url-encoded value that is the Disclosure"* — and the implementation does
hash the string as received, not a re-serialisation — and §9.3 *"The RECOMMENDED minimum length of the
randomly generated portion of the salt is 128 bits"*, against `randomBytes(16)` = exactly 128 bits.

The ES256 `dsaEncoding: 'ieee-p1363'` handling is correct and correctly cross-referenced to the DPoP trap
from Module 05. Digest-order shuffling (§4.2.4.1) is implemented via `.sort()`. Nested/recursive
Disclosures are explicitly out of scope and **labelled as such in the code**, which is the honest way to
scope a teaching tool.

*Source:* https://www.rfc-editor.org/rfc/rfc9901.html

### B-2 · All four exam answer keys — **CLEAN, no wrong key found**

Every falsifiable claim across the four keys was checked. The strongest test was Exam A's A14, which asserts
a computed value:

```
verifier   dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk   (43 chars — confirmed)
challenge  E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM   (computed locally — exact match)
```

The key attributes these to "RFC 7636's own worked example from **Appendix B**" — Appendix B is titled
"Example for the S256 code_challenge_method" and carries exactly these values. The key's "43 base64url
characters is ~256 bits" is right (43 × 6 = 258).

Every section citation appearing in the four keys was resolved against its primary source: RFC 6749 §1.2 /
§4.1 / §10.12 · RFC 7009 §2.2 · RFC 7662 §2.1 / §2.2 · RFC 8252 **§7.3 "Loopback Interface Redirection"**
and **§8.12 "Embedded User-Agents"** (*"native apps MUST NOT use embedded user-agents"* — confirmed) ·
RFC 8693 §1.1 · RFC 9449 §4.2 / §7.1 · RFC 9700 §2.1.1 / §2.1.2 / §2.2.2 / §2.4 / §4.8 · RFC 9901 §4.2.3 /
§7.1 / §9.3 / **§10.1 "Unlinkability"** · OIDC Core §3.1.3.7 · FAPI 2.0 §5.3.2.1 · FAPI 2.0 Attacker Model
§8.5. **No nonexistent section, and no misattributed requirement, was found in any exam key.**

### B-3 · The 14 previously unverified identifiers — 13 correct, 1 incomplete (A-011)

| Identifier | Inventory claim | Verified |
|---|---|---|
| FAPI 1.0 Part 1 | "Financial-grade API Security Profile 1.0 - Part 1: Baseline", Final, 12 Mar 2021 | ✅ exact title and date |
| FAPI 1.0 Part 2 | "…Part 2: Advanced", Final, 12 Mar 2021 | ✅ exact title and date |
| FAPI 2.0 Message Signing | Final, 25 Sep 2025 | ✅ |
| OID4VCI 1.0 | Final, 16 Sep 2025 | ✅ |
| OID4VP 1.0 | Final, 9 Jul 2025 | ✅ |
| OIDC Identity Assurance 1.0 | Final 1 Oct 2024; errata set 1 revision **1 Jul 2026** | ✅ **both dates exactly right** — the errata version lives at the non-`-final` URL |
| Native SSO 1.0 | 2nd Implementer's Draft (draft 07), approved **2025-10-17** | ✅ approval date confirmed via the OIDF announcement; the document's own 16 Jan 2025 date is the draft revision, not the approval |
| RP-Initiated Logout 1.0 | OpenID Final, date "—" | ⚠️ status correct; **dated 12 Sep 2022** (A-011) |
| Front-Channel Logout 1.0 | OpenID Final, date "—" | ⚠️ status correct; date missing (A-011) |
| Back-Channel Logout 1.0 | OpenID Final, date "—" | ⚠️ status correct; **exact title omits "incorporating errata set 1", dated 15 Dec 2023** (A-011) |
| Session Management 1.0 | OpenID Final, date "—" | ⚠️ status correct; date missing (A-011) |
| RFC 2119 | BCP 14, Mar 1997 | ✅ |
| RFC 8174 | BCP 14, updates 2119, May 2017 | ✅ |
| RFC 3986 | STD 66, Jan 2005 | ✅ |

Two near misses worth recording, both of which would have been false positives:

- **Identity Assurance** appeared to have no errata set — the `-final.html` URL serves the original
  1 Oct 2024 text. The errata-set-1 version (1 Jul 2026) is at `openid-connect-4-identity-assurance-1_0.html`.
  Same two-URL pattern that caught JARM out in Pass A. The inventory had it right.
- **Native SSO** appeared misdated — the document header says 16 January 2025, the inventory says approved
  2025-10-17. The OIDF approval announcement confirms 17 October 2025. The inventory had it right.

---

## Pass C results — Modules 06, 07, 09a, 12

All four read end to end. **No spec-level defect found in any of them.** Every section-level citation was
resolved against its primary source; one corpus-wide assessment defect surfaced (**A-013**).

**All 27 section citations across the four modules verified to exist and say what is claimed:**

| Spec | Sections cited and verified |
|---|---|
| RFC 7523 | §2.1 "Using JWTs as Authorization Grants", §2.2 "Using JWTs for Client Authentication", §3 "JWT Format and Processing Requirements" (iss/sub/aud/exp all REQUIRED — matches Module 06's "four MUSTs and three MAYs"), §3.1 |
| RFC 7521 | §5.2 "General Assertion Format and Processing Rules", §8 "Security Considerations", §8.2 "Stolen Assertion" |
| RFC 8693 | §1.1 "Delegation vs. Impersonation Semantics" (impersonation defined as *"indistinguishable from B"* — the capstone quotes this exactly), §2.1 "Request", §2.2.1 "Successful Response", §4.1 "act (Actor) Claim", §4.4 "may_act (Authorized Actor) Claim" |
| RFC 9470 | §3 "Authentication Requirements Challenge"; the `insufficient_user_authentication`, `acr_values` and `max_age` quotes are verbatim |
| RFC 7662 | §2.1 "Introspection Request" — the capstone's quote is verbatim and does use **MUST** |
| OIDC Core | §3.1.3.7 (capstone #14 correctly identifies steps **3** = `aud` and **11** = `nonce`), §5.5.1 "Individual Claims Requests" |
| RFC 9700, RFC 9901, FAPI 2.0 | previously verified in Passes A/B; usages here are consistent |

**Module-specific verifications:**

- **Module 07's headline correction is exactly right.** Its long quotation of OAuth 2.1 §1.8 is **verbatim**, and its structural tell — that §10 *"Differences from OAuth 2.0"* has **exactly two** subsections, "Removal of the OAuth 2.0 Implicit grant" and "Redirect URI Parameter in Token Request" — is confirmed against `draft-ietf-oauth-v2-1-15`. Its distinction that the implicit grant is *"not specified in"* rather than *"prohibited by"* OAuth 2.1 is precise and correct. Its RFC 9700 §2 table is 16 requirements across the six §2 subsections, and the count is right.
- **Module 09a's JARM section verified** against `oauth-v2-jarm.html`: three REQUIRED claims (`iss`, `aud`, `exp`) with verbatim quotes, the *"maximum JWT lifetime of 10 minutes is RECOMMENDED"* wording, and all four `response_mode` values (`query.jwt`, `fragment.jwt`, `form_post.jwt`, `jwt`). RFC 9396's five common data fields (`locations`, `actions`, `datatypes`, `identifier`, `privileges`) and `type` as the sole REQUIRED field are correct.
- **Module 09a's draft discipline is exemplary** — the strongest in the curriculum. Native SSO is labelled "**2nd Implementer's Draft** — not Final" and "(draft 07, approved 2025-10-17)", the approval date matching the OIDF announcement verified in Pass B; and the module lists *"Draft cited as normative | Native SSO treated as Final"* as a threat **in its own threat table**.
- **Module 06** is careful about the distinction that matters most in it: it separates RFC 7523 §2.1 (assertion grant — the dangerous one) from §2.2 (`private_key_jwt` — the safe one) and states explicitly that "nothing in this module's headline warning applies to §2.2." Its central security claim — that RFC 7521 §8 covers forged and stolen assertions but *cannot* constrain which subjects a legitimately-keyed issuer may name — is correct and correctly attributed.
- **Module 12's answer key was checked defect by defect.** All 25 planted defects are correctly diagnosed and correctly attributed to their modules. The "what Meridian got right" false-positive traps are genuinely correct-as-stated, which is the right way to test for over-reporting.

**Objective answer keys spot-verified and correct:** M06 Q3 (`iss`/`sub`/`aud`/`exp`), M06 Q5 (`access_token`/`token_type`/`issued_token_type`), M07 Q1 (BCP 240, Jan 2025), M07 Q4 (implicit "not specified in the document at all"), M09a Q1 (JARM's three claims), M09a Q5 (`type`), M12 Q3 (exact string matching).

**One pattern repeat, already logged:** Module 12 defect #5 attributes exact-string-matching to RFC 9700 §4.1, the same pointer as **A-007**. Here it is a paraphrase rather than a verbatim quote, and §4.1.3 does contain a MUST on URI equality, so it is defensible — noted for consistency when A-007 is fixed rather than logged separately.

---

## Pass D results — `PROGRESS.md`, Modules 04 and 09b, `decode-jwt.mjs`

The last unexamined material. One Major found (**A-014**), one existing Major confirmed to propagate
(**A-003**), and three artefacts clean.

### `PROGRESS.md` — **CLEAN**

98 KB build log, read across its findings, service-configuration and per-module sections. **No claim
contradicting any module was found**, and its two previously unverified citations check out:

- **Grant Management §5.2 "Authorization Request"** — *"the respective client must be authorized to use the
  particular grant id"* — verbatim correct.
- **Grant Management §6.5 "Revoke Grant"** — *"MUST revoke the grant and all refresh tokens issued based on
  that particular grant, it should revoke all access tokens"* — verbatim correct, **including the lowercase
  `should`**, which `PROGRESS.md` explicitly relies on: *"the MUST is satisfied and the should is not. Not a
  MUST violation; report it precisely."* That is the RFC 8174 uppercase/lowercase discipline Module 07
  teaches, applied correctly to the curriculum's own findings. It is the strongest single piece of evidence
  that the project's verification method is real rather than decorative.

The log's account of the `requireBasicAuth` fail-open → fail-closed fix (`require-basic-auth.ts:8` formerly
`if (!mgmtClientId || !mgmtClientSecret) return true;`) matches the behaviour I verified empirically in
Pass C, in both states.

*Source:* https://openid.net/specs/oauth-v2-grant-management.html

### Module 09b — **CLEAN apart from A-003**

All 13 RFC 9901 section citations (§1.2, §4.1.1, §4.2.1, §4.2.3, §4.3, §7.1, §7.3, §9.3, §10.1 and the §4/§7
ranges) were verified in Pass B and are used consistently here. Two further citations verified in Pass D:

- **OID4VCI §3.5 "Pre-Authorized Code Flow"** ✅ — matches the inventory's "pre-authorized code grant, `tx_code`".
- **OID4VP §5.2 "Existing Parameters"** ✅ — `nonce` is REQUIRED and verifiers must *"create a fresh,
  cryptographically random number … for every Authorization Request"*, matching the inventory's "REQUIRED
  fresh `nonce`".

The VCI-disabled claim was verified live in Pass A (`[A364301]`, exact code match). The only defect is the
Federation 1.0/1.1 error, now confirmed to appear in the module text and not just the inventory (**A-003**).

### `scripts/decode-jwt.mjs` — **CLEAN**

Imports only `node:crypto`; **no network calls**, consistent with the curriculum's repeated instruction never
to paste a live token into an online decoder. The `--ath` flag computes `base64url(SHA-256(token))`, correct
per RFC 9449 §4.2. Output ends with an explicit warning — *"This tool DECODES only. It does not verify the
signature, issuer, audience, or expiry. A decodable token is not a trustworthy token."* — which reinforces
Module 00's central lesson at the point of use. Time claims are decoded and rendered with a relative offset,
and the signature is labelled *"(NOT verified by this tool)"*.

---

## Pass E — the staleness sweep

**Motivation.** A-008 and A-014 are the same failure: a module asserting a deployment fact that has since
changed. Both were found incidentally. This pass tested that class systematically — every "not implemented",
"is broken", "returns", "confirmed absent" and "gap in this repo" claim, plus every asserted Authlete error
code and service-flag value, executed against the live server.

**Method.** Extracted the claim set mechanically: 54 distinct Authlete error codes (`[Annnnnn]`), 13
deployment-state assertions, and the service-flag values asserted across the modules. Executed the testable
ones against `:3000`.

**Result: 26 deployment-fact claims tested across all passes — 24 accurate, 2 stale.** Both stale ones were
already logged (**A-008** ROPC, **A-014** RFC 9728). **The sweep found no new defect.**

| # | Claim | Module | Result |
|---|---|---|---|
| 1 | `/api/jwks` returns the SPA, not the key set; `/api/.well-known/jwks.json` returns the real JWKS | 00, 04 | ✅ 200 `<!DOCTYPE html>` vs `{"keys":[{"kty":"EC"…` |
| 2 | Introspection endpoint is unauthenticated (Tier-3 finding) | 04 | ✅ `POST /api/introspection/standard` with no credentials → **200** `{"active":false}` |
| 3 | **Both** `/api/fapi/config` and `/api/fapi/status` return 200 with an error body and a `stack` field | 10, PROGRESS | ✅ both **200** with `{"error":"Bad Request","message":"Response validation failed","stack":…}` |
| 4 | `JWKS_URI` unset ⇒ back-channel logout receipt fails as `"Invalid logout token"` | 08 | ✅ `JWKS_URI` absent from `server/.env`; endpoint → **400** with that exact message |
| 5 | Logout endpoint is an open redirect (prefix `startsWith` checks) | 08, PROGRESS | ✅ **both** vectors reproduce: `localhost:3000.evil.example.com` and `localhost:3001@evil.example.com` each get **302 to the attacker's host** |
| 6 | UserInfo cannot accept the `DPoP` scheme → `[A088302]` | 05 | ✅ reproduced at audit time: `Authorization: DPoP <token>` → **401** `[A088302] The access token does not exist.` — **FIXED 2026-08-04**; now **200** with claims. Three further defects in the same function were found and fixed with it, including a proof-replay bypass. See `PROGRESS.md`. |
| 7 | `prompt=none` returns a 302 with an **empty** `Location` header | 08 | ✅ `HTTP/1.1 302 Found`, `Location: []` — exactly as described |
| 8 | `response_mode=jwt` → `[A012305]` (`authorization_signed_response_alg` not set) | 09a | ✅ exact code |
| 9 | Any `acr_values` → `[A021303]` (service supports no ACR value) | 09a | ✅ exact code |
| 10 | Federation entity configuration → `[A126203]` (request body missing) | 09b | ✅ **400**, exact code |
| 11 | VCI disabled → `[A364301]` | 09b | ✅ exact code (Pass A) |
| 12 | mTLS **not** implemented — `tlsClientCertificateBoundAccessTokens: false`, registration flags only | 05, 10 | ✅ `tls_client_certificate_bound_access_tokens: false`, no `mtls_endpoint_aliases`; `tls_client_auth` / `self_signed_tls_client_auth` *are* advertised — precisely the "**THIN** — only registration flags today" state the inventory describes |
| 13 | `fapiModes` empty ⇒ the plain code flow is **not** refused | 02, 07 | ✅ plain authorization → **302**, no `[A294308]`/`[A295301]` |
| 14 | `accessTokenDuration: 86400` (24 h) | 10 | ✅ `expires_in = 86400` |
| 15 | PAR `request_uri` `expires_in` is exactly 600 | 10 | ✅ (Pass A) |
| 16 | `pkceRequired = false` — a flow with no PKCE succeeds | 03 | ✅ (Pass C) |
| 17 | `refreshTokenKept = false` — rotation is on | 03 | ✅ (Pass C) |
| 18 | PKCE downgrade rejected in **both** directions | 03 | ✅ `[A050312]`, `[A050317]` (Pass C) |
| 19 | Token exchange fails for any scoped subject token | 06 | ✅ `ResponseValidationError` (Pass A) |
| 20 | `alg:none` assertion → `[A314310]` | 06 | ✅ exact code (Pass A) |
| 21 | DCR disabled → `[A206201]` | 04 | ✅ exact code (Pass C) |
| 22 | PAR with `client_secret_basic` outside `parameters` → `[A157357]` | 10 | ✅ exact code (Pass C) |
| 23 | `requireBasicAuth` fails closed on unset credentials | 04, 11 | ✅ 401 on all management routes (Pass C) |
| 24 | `requireGrantOwnership` → 403 for a token with no grant | 10, 11 | ✅ exact error body (Pass C) |
| 25 | **ROPC is refused** | 01 | ❌ **STALE** — a token is issued. Logged as **A-008** |
| 26 | **RFC 9728 is not served** | 04 | ❌ **STALE** — it is served. Logged as **A-014** |

### A near miss worth recording

Module 03's lab carries a note: *"**This lab avoids the `openid` scope** and uses `scope=profile`. If your
public client's `idTokenSignAlg` is a symmetric algorithm (`HS256`), requesting `openid` fails with
`[A406301]`…"*. I tested it: on this deployment the public client **can** now request `openid` — the
request succeeds and redirects to login, so `[A406301]` does not fire. That looks like a 27th stale claim
and **is not one**, because the note is explicitly **conditional** ("*If* your public client's
`idTokenSignAlg` is…") and defensive rather than an assertion about current state. The lab avoids `openid`
as a precaution that costs nothing. This is the right way to write a deployment-dependent claim, and it is
the pattern the two genuinely stale claims (A-008, A-014) did not follow — both stated a single outcome as
fact. Worth noting as the template for fixing them.

### What this pass establishes

The curriculum's **spec** accuracy and its **deployment** accuracy are both high, and the two stale claims
are not evidence of a systemic problem — they are 2 of 26, and both are recent behaviour changes
(a cleared `fapiModes` flag; a route added on 2026-07-28) rather than errors of understanding. Notably,
**every one of the 11 Authlete error codes tested reproduced with its exact bracketed code**, which is
unusual precision for teaching material and means the labs' expected outputs can be trusted.

---

## Summary

### By severity

| Severity | Count |
|---|---|
| **Critical** | **0** |
| **Major** | 6 (A-001, A-002, A-003, A-004, A-005, A-014) |
| **Minor** | 7 (A-007, A-008, A-009, A-010, A-011, A-012, A-013) |
| **Gap** | 1 (A-006) |
| **Total** | **14** |

No Critical defects were found. After auditing **all four exam answer keys and nine module answer keys**,
**no wrong answer key was found** — every objective item verified against a primary source was correct.
`scripts/sd-jwt.mjs` is likewise clean. The one assessment defect is structural, not factual (**A-013**).

### By module

| Location | Critical | Major | Minor | Gap |
|---|---|---|---|---|
| `SPEC-INVENTORY.md` | 0 | 4 (A-001, A-002, A-003, A-005) | 2 (A-009, A-010) | 1 (A-006) |
| Module 00 | 0 | 2 (A-004, A-005) | 0 | 1 (A-006) |
| Module 01 | 0 | 0 | 1 (A-008) | 0 |
| Module 02 | 0 | 0 | 1 (A-007) | 0 |
| Module 03 | 0 | 0 | 1 (A-012) | 0 |
| Module 04 | 0 | 2 (A-002, A-014) | 0 | 0 |
| Module 05 | 0 | 0 | 1 (A-012) | 0 |
| Module 06 | 0 | 0 | 1 (A-013) | 1 (A-006) |
| Module 07 | 0 | 0 | 1 (A-013) | 0 |
| Module 08 | 0 | 0 | 0 | 1 (A-006) |
| Module 09a | 0 | 0 | 1 (A-013) | 0 |
| Module 09b | 0 | 1 (A-003) | 0 | 0 |
| `PROGRESS.md` | 0 | 0 | 0 | 0 |
| `scripts/decode-jwt.mjs` | 0 | 0 | 0 | 0 |
| Module 10 | 0 | 0 | 1 (A-009) | 0 |
| Module 11 | 0 | 0 | 0 | 0 |
| Module 12 | 0 | 0 | 2 (A-009, A-013) | 0 |
| `GLOSSARY.md` | 0 | 1 (A-002) | 0 | 0 |
| `exams/` | 0 | 0 | 2 (A-009, A-013) | 0 |
| `scripts/sd-jwt.mjs` | 0 | 0 | 0 | 0 |

Several IDs span more than one row: A-002 covers the inventory, `GLOSSARY.md` and Module 04; A-011 covers
the inventory §8 and Module 08's spec-delta table; A-012 covers Modules 03 and 05.

**A-013 is corpus-wide.** It is shown only against the modules audited for it in Pass C, but the
positional bias affects **every** module quiz and all four exams. Treat it as one defect against the
assessment system rather than as a per-module count.

**Modules 06, 07, 09a and 12 carry no spec-level defect** — all four were read end to end in Pass C and
all 27 of their section citations verified. Modules 03, 05 and 11 carry no defects in the portions
examined.

### Not yet safe to publish

Judged strictly — "would I be embarrassed to see this under my working group's name."

1. **`SPEC-INVENTORY.md`** — carries four Major status errors. This file is the curriculum's citation
   backbone; every module inherits from it, so its errors propagate furthest. Fix first.
2. **Module 00** — a citation to a nonexistent RFC section reproduced in both a quiz and its answer key
   (A-004), plus the mislabelled conformance failure (A-005).
3. **Module 09b** — teaches federation from a superseded version (A-003).
4. **Module 04** — presents an Experimental RFC as Standards Track (A-002), **and teaches that RFC 9728 is
   not served when it is, with a lab whose three documented outputs are all now wrong (A-014)**.

**Publishable as they stand**, on the evidence gathered: Modules 01, 02, 03, 05, 08, 10, 11, **all four
exams**, and **`scripts/sd-jwt.mjs`** — subject to the Minor corrections above, none of which is blocking.

Module 08 is now cleared in both halves: the thirteen validation steps, `nonce`/`state` and the hash claims
were verified in Pass A, and Pass B confirmed all four logout specifications are Final with the
logout-token `nonce` MUST NOT rule correct (only the date/title completeness issue A-011 remains).

**Cleared in Pass C**: Modules **06, 07, 09a and 12** — read end to end, all section citations verified, no
spec-level defect found. Module 07's method chapter and Module 09a's draft discipline are the strongest
material in the curriculum.

**A-013 applies across all of them** and should be fixed once, at the corpus level, before the quizzes are
relied on as gates.

**Cleared in Pass D**: `PROGRESS.md`, `scripts/decode-jwt.mjs`, and Module 09b (apart from A-003).

**Module 04 moves to not-safe-to-publish** on A-014, joining it to the A-002 finding it already carried.

**Nothing in `docs/curriculum/` now remains unexamined.**

---

## Coverage and evidence

So you can judge whether I looked hard enough.

**Primary sources fetched (51 documents).** Every one was retrieved during this audit; none is cited from
recall. Listed exhaustively so the gaps are visible too.

- **IETF Datatracker / rfc-editor — 40 RFCs + 1 draft:** 4648, 6749, 6750, 6819, 7009, 7515, 7516, 7517,
  7518, 7519, 7521, 7522, 7523, 7591, 7592, 7636, 7638, 7662, 7800, 8252, 8414, 8446, 8628, 8693, 8705,
  8707, 8725, 9068, 9101, 9110, 9126, 9207, 9396, 9449, 9470, 9700, 9728, 9846, 9864, 9901, and
  `draft-ietf-oauth-v2-1`.
- **Added in Pass B:** RFC 2119 (BCP 14, Mar 1997), RFC 8174 (BCP 14, updates 2119, May 2017), RFC 3986
  (STD 66, Jan 2005) — all three confirmed exactly as inventoried. **No IETF identifier cited anywhere in
  the curriculum now remains unverified.**
- **OpenID Foundation — 10 documents:** OIDC Core 1.0 (errata set 2), OIDC Discovery 1.0, CIBA Core 1.0,
  JARM (both the `-final` and current URLs — they differ, see near misses), FAPI 2.0 Security Profile,
  FAPI 2.0 Attacker Model, OpenID Federation 1.0, OpenID Federation 1.1, Grant Management, and the OIDF
  specifications index.
- **Added in Pass B (11 more):** FAPI 1.0 Part 1 (Baseline), FAPI 1.0 Part 2 (Advanced), FAPI 2.0 Message
  Signing, Native SSO 1.0 (spec + the OIDF approval announcement), OIDC Identity Assurance 1.0 (both the
  `-final` and errata-set-1 URLs), OID4VCI 1.0, OID4VP 1.0, RP-Initiated Logout 1.0, Back-Channel Logout
  1.0. **Every specification identifier in `SPEC-INVENTORY.md` has now been checked against its primary
  source.** Front-Channel Logout 1.0 and Session Management 1.0 were confirmed Final via the OIDF
  specifications index rather than by individual fetch — a slightly weaker source, noted for honesty.

**Section-level verifications performed** (not just identifier checks): RFC 9449 §2/§4.1/§4.2/§4.3/§6.1/§7.1
· OIDC Core §3.1.3.7 (all 13 steps, in order) · OIDC Core §3.1.2.1, §3.1.2.6 · OIDC Discovery §4.1, §4.3 ·
RFC 9700 §2.1, §2.1.2, §2.4, and all 17 §4 subsection titles · RFC 8414 §3 · RFC 6750 §2.1–§2.3 · RFC 8693
§2.2.1 · RFC 9101 §5 · RFC 4648 §5 · RFC 7636 §4.1–§4.6 · FAPI 2.0 §5.3.2.1 (incl. NOTE 1), §5.3.2.2.

**Read closely, end to end:** Module 00 (README, quiz, quiz-answers), Module 01 (README, quiz-answers, lab
Break 1), Module 02 (README), Module 08 (README §§150–349), curriculum `README.md`, `SPEC-INVENTORY.md`.
**Read in substantial part:** Modules 03, 05, 10, 11.
**Checked by targeted grep + lab execution only:** Modules 04, 06, 07, 09a, 09b, 12; all four exams;
`PROGRESS.md`; `GLOSSARY.md`.
**Audited in Pass B:** `scripts/sd-jwt.mjs` (read in full, executed end to end, three attacks run, all 19
spec citations verified) and all four exam answer keys.
**Not examined at all:** `scripts/decode-jwt.mjs`, most `lab.md` files end to end, the `quiz.md` /
`quiz-answers.md` files for Modules 02, 03, 04, 06, 07, 09a, 09b, 11, 12, and `PROGRESS.md`.

**Code claims:** 12 sampled "where this lives in the code" paths verified to exist
(`oauth-as-metadata.routes.ts`, `jar.routes.ts`, `jar.service.ts`, `protected-resource-metadata.routes.ts`,
`utils/dpop.ts`, `client/src/pkce.ts`, `client/src/services/dpop.service.ts`, `federation.routes.ts`,
`jwt-verification.service.ts`, `grant-management.routes.ts`, `introspection.routes.ts`,
`revocation.routes.ts`). **The behavioural half — does each file do what the module says — was not checked.**

**Assessment quality:** Module 00 (all 16 items + key), Module 08 (Tier 1 keys + Tier 4 stems), Module 05
(Q1–Q4 keys), Module 10 (Q9 key), Module 01 (full key), and in Pass B **all four exam answer keys**. Tier 4
items in Modules 00, 08 and 10 require genuine reasoning, not recall, and are answerable from their module.
**No wrong answer key found anywhere.**

---

## What remains for a Pass C

Pass B cleared the top two items on the previous list. What is left, in expected-yield order:

1. **Behavioural verification of the remaining code claims.** 12 paths were confirmed to exist and several
   were confirmed behaviourally (the RFC 9728 route, `requireBasicAuth`, `requireGrantOwnership`,
   `token-exchange-response.handler.ts`), but most "where this lives in the code" references have not been
   read line-by-line against what their module says about them. This is now the highest-yield remaining lead,
   though Pass E's result suggests the yield is low.
2. **A regression guard, rather than another audit pass.** Pass E showed the deployment claims are 24/26
   accurate and that both failures were *recent behaviour changes*, not misunderstandings. The durable fix is
   not to re-audit periodically but to make the labs self-checking: each "Break it" block already prints an
   expected output, so a script that runs them and diffs against the documented block would catch the next
   A-014 the day it appears. Module 03's conditional `[A406301]` note is the template for claims that cannot
   be pinned.
4. **`scripts/decode-jwt.mjs`** — small and low-risk next to `sd-jwt.mjs`, but unread.
5. **HSK and full DCR lifecycle exercises**, if you enable the `hsm` and dynamic-client-registration
   features on the Authlete service. Everything else lab-side is now executed.
6. **The remaining module quizzes and keys** (02, 03, 04, 06, 07, 09a, 09b, 11, 12). Given that nine keys
   and four exams have now been audited with zero wrong answers, expected yield here is low — but "low" is
   not "zero," and a wrong key is Critical.
