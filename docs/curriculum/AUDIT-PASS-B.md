# Audit Pass B — does this curriculum teach?

**Scope:** `docs/curriculum/` — 14 modules × 4 files, `GLOSSARY.md`, `README.md`, `exams/` (4 exams + 4 keys),
`scripts/`, with `SPEC-INVENTORY.md` and `PROGRESS.md` consulted for cross-checks.

**Question.** Pass A asked *is this correct?* and answered yes. This pass asks *does it teach?* Correct
material fails to teach when it uses a term it never introduced, asserts importance instead of demonstrating
a failure, strands an analogy, overloads a sitting, or labels four flavours of recall as four tiers of
difficulty.

**Method.** A literal cold read in ascending order. For each module N: read `README.md`, `lab.md`, `quiz.md`
and `quiz-answers.md` **in full**, write the findings, and only then open module N+1. Earlier material is
therefore in context and later material is not — which is the property the protocol exists to guarantee.
`GLOSSARY.md` and the curriculum `README.md` stay in the baseline throughout, because a learner has them at
every module. The exams were read last, for §4 only.

**Audit date:** 2026-08-02. **Facts assumed sound** per Pass A.

> **Remediation status: all five recommendations were implemented on 2026-08-02, after the audit was
> written.** The findings below are preserved as found — they are the record of what was wrong, not a
> description of the current state. **§8 lists what changed, file by file.** Where a finding says "absent"
> or "contradicts", read it as *was*, and check §8 for the fix.

> A prior `AUDIT-PASS-B.md` existed at this path and has been replaced. It declined the cold-read protocol,
> did not work the quizzes, sampled rather than read most labs, and contained a §6b auditing conformance
> against `docs/curriculum/STYLE.md` — a file that does not exist and is not tracked in git. Style-guide
> conformance is out of scope here; this pass judges the material on its own terms.

---

## 1. The instrument, and its one weakness

Each token a module uses is checked against what earlier modules **defined** — a bolded first use, a table
row, or an explained inline gloss. **Mere mention is not introduction**; that distinction is the whole
instrument. Tokens are classified:

| Class | Meaning | Severity |
|---|---|---|
| **Dangling** | Not in prior modules, not in `GLOSSARY.md` | Blocking |
| **Glossary-rescued** | Not in prior modules, but has a glossary row | Friction — costs a lookup |
| **Forward-tagged** | Flagged inline as "covered in Module X" | Fine *if the flag resolves* — every one was checked |
| **Assumed-external** | Non-OAuth background beyond Module 00's stated prerequisites | Judged case by case |

**The instrument's weakness, stated up front.** `GLOSSARY.md` is close to exhaustive — ~200 rows tagged by
introducing module, up to Module 11. Because the learner has it from day one, **it leaks forward and masks
most ordering problems.** That is why the dominant class below is *glossary-rescued*, and why the genuinely
dangling terms matter: they survived a near-exhaustive safety net.

**Coverage.** Every file named in Scope was read, including all four **exam answer keys** (1,112 lines) and
Module 12's `lab.md` in full — the Aurora brief and the complete Meridian Health document — so that its 25
planted defects could be checked one by one against what the curriculum actually teaches (§3, Module 12).
The only partial reads are body text in three lab files (09b, 10, 11) where the load-bearing questions —
declared prerequisites, console requirements, and toolchain — were answered exhaustively by grep rather than
by prose. Labs were **read, not executed**; the question posed is about prerequisite knowledge, and Pass A
already ran them.

---

## 2. Headline judgement

**This teaches, and it teaches unusually well.** That constrains everything below. Across fourteen modules I
could not find a "why this module exists" section that merely asserts importance — every one opens on a
specific failure and derives the mechanism from it. Module 03 derives PKCE from four requirements rather than
describing it. Module 06 defines impersonation as *"delegation with the audit trail deleted"* and makes that
the module's spine. Module 07 teaches a method rather than a mechanism, and the method transfers. Answer keys
explain why wrong options are wrong in thirteen of fourteen modules. The tiers genuinely escalate. The labs
are the strongest component: Module 06's Exercise 6 walks a learner from an OAuth-surface symptom to an SDK
schema mismatch to a single line of source, and Module 09a marks post-enablement transcripts `UNVERIFIED`
rather than printing outputs nobody observed.

So the findings are not "this is bad." They are four things:

1. **There are two module templates, and the switch at Module 06 is silent and lossy.** Template A (00–05)
   carries a plain-language analogy, a three-column bridge table ending in a *defining reference*, wire-level
   HTTP, and a spec delta. Template B (06–11) keeps the analogy (until 09b), adds ❌/✅ "Common mistakes" and
   a dependency-graph section — and **drops the bridge table and the wire level entirely**. §6 measures it.
2. **One of the five promised end-state capabilities has no source in the material** — and Module 12's own
   traceability table asserts coverage for it that does not exist, plus a second false row for capability 1.
3. **Two pieces of load-bearing background are never taught and are outside the stated prerequisites** — XSS
   and CORS. Both are required by quiz items and model answers.
4. **Three live statements tell the learner the four exams do not exist.** They do, they are the strongest
   assessment instrument in the curriculum, and they carry the closed-book assessment for three of the five
   capabilities.

**Is there a structural problem?** Yes — but it is a **template discontinuity**, not a sequencing problem.
The dependency graph is sound, every prerequisite resolves, and the module boundaries are in the right
places. I do not recommend restructuring the twelve-module spine, and §6 says why in detail.

---

## 3. Per-module cold read

Each module gets the seven assessments in the same order. Legend for the header line: **Why** = causal
motivation or assertion · **Bridge** = analogy mapped to terminology · **Wire** = raw HTTP in the lesson ·
**Load** = new defined terms / stated hours · **Delta** = genuine delta or restated features.

---

### Module 00 — Web + JOSE foundations

| Token used | Class | Where | Note |
|---|---|---|---|
| AS, Client, `code`, `state`, `scope`, token endpoint | Forward-tagged | README:150–180, diagram | Module states it is *"deliberately not about OAuth"*; all resolve in 01–02 |
| `at+jwt`, `dpop+jwt` | Forward-tagged | README:114 | Resolve in 04, 05 |
| RFC 7638 thumbprint | Introduced here | README:95 | Used in Module 05; correctly planted |

**Why:** causal — three distinct failures (who controls the bytes, decode≠verify, the TLS misconception).
**Bridge:** ✅ **the strongest in the curriculum** — a 3-column table (plain element / formal concept /
defining reference), ten rows, every element mapped. This is the model the rest should match.
**Wire:** ✅ three `http` blocks with a per-leg who-can-read-what annotation.
**Load:** ~28 terms / 3–4 h. Comfortable. **Delta:** genuine (before / adds / deprecates / unsolved).

**Quiz from 00 (16 items):** fully answerable. Q12/Q13 are labelled "DPoP preview" and **quote the RFC
requirement in the stem**, so they test JOSE structure-reading rather than DPoP knowledge — correctly
designed forward reach.

**Lab from 00:** completable. Requires `curl`, `node`, and a running server with Authlete credentials — all
declared. This is one of only **two** labs in the curriculum that declare their tools at all (see B-06).

> **Calibration finding.** **Tier 4 Q14** asks the learner to describe an RS256→HS256 confusion exploit
> step by step. Lab **Break 3** (`lab.md`:153–159) walks that exact reasoning to its conclusion, including
> the fix. It is Tier 4 by format and handed-over by content. Q15 and Q16 are genuine.

---

### Module 01 — The delegation problem

| Token used | Class | Where | Note |
|---|---|---|---|
| **`_csrf`** | **Dangling** | README:221, lab:110/113 | Appears in a wire trace and in three lab commands. CSRF is never defined; no glossary row |
| **`ticket`** | **Dangling** | quiz-answers:73, lab:130 | *"the `ticket` / `req.session.authorization` context"* in a model answer; no glossary row |
| `scope=openid` | Assumed | README:200/216, lab:157 | Used in the ROPC request; `openid` is not explained until Module 08 |
| `client_secret_basic` | Assumed | lab:271 | In a deployment note; client-auth methods are Module 02+ |
| introspection, revocation | Glossary-rescued **and pre-taught** | lab:63–64 | The lab's endpoint table gives each an inline gloss before use — good practice |
| `fapiModes: ["FAPI2_SECURITY"]` | Assumed | lab:271 | Deployment note; FAPI is Module 10 |

**Why:** causal — the budgeting-app/bank narrative, then five structural harms, each named.
**Bridge:** ✅ full table, eleven rows, every hotel element mapped to an RFC 6749 §1.1 definition quoted
verbatim. **Wire:** ✅ three `http` blocks contrasting anti-pattern / ROPC / delegated.
**Load:** ~24 terms / 2 h. Comfortable. **Delta:** genuine.

**Quiz from 00–01 (17 items):** fully answerable. Q12's model answer uses the untaught term `ticket`.

**Lab from 00–01:** completable. Break 1 needs a confidential client and the lab says where to create one.
The curriculum env is set up here, correctly, before anything depends on it.

> **Calibration finding.** **Q7**'s distractors are *"transmitted over HTTPS"*, *"unguessable"*, and
> *"longer than a password"*. None is a model a learner would actually hold — the item is Tier 1 recall with
> Tier 2 framing. Contrast **Q9**, which is excellent: A and B quote RFC 6749 §4.3's own permissive language,
> which is genuine and *superseded*, so a learner reasoning from the primary source alone gets it wrong.

---

### Module 02 — OAuth core + threats

| Token used | Class | Where | Note |
|---|---|---|---|
| **CORS** | **Assumed-external, load-bearing** | README:177–179 | Only *"CORS fixed that"*. Never defined, no glossary row. **Q18's model answer makes CORS the answer** to "what new requirement does the move impose" (key:176–179). See B-04 |
| **backend-for-frontend** | **Dangling** | quiz-answers:155 | Recommended as *the* SPA mitigation in a Tier 4 model answer. Never taught in any lesson; no glossary row. See B-05 |
| **attestation** | **Broken forward-tag** | quiz-answers:143 | *"(or attestation-based, Module 06)"*. The string `attestation` appears **nowhere** in Module 06. See B-05 |
| `private_key_jwt`, mTLS | Glossary-rescued | quiz-answers:144 | Tier 4 model answer recommends both, three and four modules early |
| `ASWebAuthenticationSession`, keychain isolation, XSS | Assumed-external | quiz-answers:143, 149 | Platform-specific; XSS's first use in the curriculum, undefined |
| `id_token`, `s_hash`, `acr` | Forward-tagged | lab:167–171 | *"Ignore them for now"* + names Modules 08/09a — **exemplary** |
| MFA, federation, step-up | Untagged forward refs | README:180 | One clause, no module pointers |

**Why:** causal, and the best-argued in the curriculum: the AS has exactly two options for the redirect, and
everything follows. **Bridge:** ✅ full table, ten rows. **Wire:** ✅ three `http` blocks, plus an eight-leg
annotated walkthrough. **Delta:** genuine.

**Load: ~52 terms / 4–5 h — the highest of the early modules.** The 17-attack table is explicitly framed as
an index ("use this table as your index for the next five modules"), which is fine. But the **two error-code
vocabularies — 7 redirect codes plus 6 token codes** — are tested as *Tier 1 recall* at Q4. That is real
memorisation load, and it is the part to worry about, not the attack table.

**Quiz from 00–02 (18 items):** Q1–Q16 fully answerable. Two exceptions, and they are different in kind:

- **Q17** is answerable at the level asked (grant, client type, client auth, worst attack), but the **model
  answer** requires four things the learner has not been given: `backend-for-frontend`, attestation,
  `private_key_jwt`, and mTLS. A learner self-grading against the key marks themselves down for omitting
  terms the curriculum has not supplied. *Model-answer gap, not a question gap.*
- **Q18** asks *"what new requirement does the move impose that implicit did not have."* The key's answer is
  **CORS**. A learner without prior web-platform background cannot produce it — the module gestures at CORS
  twice and never says what it is. **This is a module failure, not out of scope.**

**Lab from 00–02:** completable. Console settings are declared in a table (`fapiModes` empty, `IMPLICIT`,
`DEVICE_CODE`, `CLIENT_SECRET_BASIC`) with an instruction to turn `IMPLICIT` back off afterwards.

> **Best item in the early curriculum: Q16.** It derives PKCE's four requirements — fresh per request,
> one-way transform, server-side binding, non-downgradable — *before PKCE is taught*, and explicitly rules
> out `state` as a substitute. Module 03 then opens by stating the same four. That is deliberate sequencing
> and it works.

---

### Module 03 — PKCE + public clients

| Token used | Class | Where | Note |
|---|---|---|---|
| **XSS** | **Assumed-external, load-bearing** | README:241, 344–346 | *"ask yourself what an XSS bug would do to it; that question is the heart of Tier 4."* Never defined anywhere in the curriculum; no glossary row; outside Module 00's stated prerequisites. **Q17's stem requires the learner to "address the XSS threat model explicitly."** See B-04 |
| **backend-for-frontend** | **First defined in a quiz stem** | quiz:129–131 | The stem's parenthetical is the only definition anywhere. Module 02's key recommended it one module *earlier*; Module 05's key later cites *"Module 03's Q17"* as the source |
| CSP, `HttpOnly`, `SameSite`, `Secure` | Assumed-external | quiz-answers:167, 179 | Web-platform knowledge in a model answer |
| `private_key_jwt`, mTLS | Glossary-rescued | README:137 | First concrete naming, in a table cell, undefined |
| FAPI 2.0 §5.3.2.1 | Glossary-rescued, **untagged** | README:208 | The rotation tension is raised with no "Module 10" pointer, unlike every other forward reference in this module |
| `parRequired` | Untagged | lab:33 | PAR is Module 05 |
| attestation (Play Integrity / App Attest) | Assumed-external | quiz-answers:139 | Second appearance, still untaught |

**Why:** causal, and **the strongest derivation in the curriculum** — four requirements stated, then *"those
four requirements are PKCE."* **Bridge:** ✅ full table, nine rows. **Wire:** ✅ one annotated block marking
the three PKCE additions. **Load:** ~26 / 3 h. **Delta:** genuine.

**Quiz from 00–03 (18 items):** answerable, except that **Q17 requires XSS**, which the curriculum never
teaches. **Lab from 00–03:** completable; needs a public client, and the required client fields are given in
a table with the exact error each wrong value produces.

> **B-07 — a live defect in the answer key.** **Q9**'s correct answer is **D** ("Either sender-constrain it
> or rotate it on every use"). The key (`quiz-answers.md`:47) then says: *"**A, C, and D** are all variations
> of the same trap — they improve storage or shorten lifetime."* It should read **A, B, and C**. A learner
> self-grading reads the right answer labelled a trap. One-word fix, real damage.

> **Weakest Tier 4 in the first half: Q18.** The first third — *"explain why both positions are correct"* —
> is recall of README:207–213, which states both branches and the FAPI tension in the same words. The two
> named deployments and the monitoring half are genuine application. Not pure recall, but the item leads with
> its own answer.

---

### Module 04 — Token lifecycle + metadata

| Token used | Class | Where | Note |
|---|---|---|---|
| `dpop_signing_alg_values_supported` | Glossary-rescued | README:252 | DPoP is Module 05 |
| RFC 9470 step-up, `insufficient_user_authentication` | Forward-tagged | README:241 | *"That is Module 09a; note it and move on"* — **exemplary** |
| BOLA | Forward-tagged | README:282, diagram:326 | Named in the wire walkthrough and the decision diagram, resolved in Module 11 |
| `acr`, `auth_time` | Untagged | lab:49, 177 | Appear in live introspection output with no pointer |
| **MCP** | **Broken forward-tag** | README:360, 370 | *"until Module 09a's MCP material."* Module 09a has none. See B-03 |

**Why:** causal — two designs, one decision, and every operational property follows.
**Bridge:** ✅ full table, nine rows; the "door, not the desk" reframing of the hotel is a genuinely good
move. **Wire:** ✅ one block, and it is the resource server's side of the story, which no earlier module
showed. **Load:** ~34 / 4 h. **Delta:** genuine.

**Quiz from 00–04 (18 items):** fully answerable. **Lab from 00–04:** completable; the DCR exercise is marked
optional and the module states DCR is not enabled on the service.

> **B-08 — Module 04 contradicts itself and the glossary about RFC 9728, and the contradiction is a live
> instruction.** README:188–191 records protected-resource metadata as **served since 2026-07-28**, and
> `lab.md`:249–292 was correctly rewritten to use an invented path as the negative control. But the README's
> own **Lab** paragraph still tells the learner to *"prove that `/.well-known/oauth-protected-resource` does
> not exist despite returning HTTP 200"* (README:338), and **`GLOSSARY.md`:135** still lists the endpoint as
> *"**not served** (gap, Module 04)."* Two stale spots, one of them a live instruction that the same file
> contradicts two screens earlier. A related stale line sits in Module 05 (README:410): *"Also outstanding
> from Module 04: the RFC 9728 protected-resource-metadata route, still awaiting a decision."*

> Module 04 also keeps a full **"Source change — serving RFC 9728 (done)"** proposal in the lesson
> (README:341–370), including an *"If you decline: the lab stays as written"* branch. It is labelled as a
> worked example of scoping a change, which is defensible — but the un-taken branch is a build artefact that
> reads as a live option to a learner.

---

### Module 05 — Request integrity + binding

| Token used | Class | Where | Note |
|---|---|---|---|
| **`claims` (request parameter)** | **Dangling** | README:24, 126 | Listed among the parameters PAR protects, and again in Q12's key. No glossary row for the *request parameter* (only for claims-in-tokens). First defined at 09a:251 |
| non-repudiation | Glossary-rescued | README:35, 147 | Glossary tags it Module 10 |
| XSS | Assumed-external | README:46 | Third undefined use |
| backend-for-frontend | Dangling, again | quiz-answers:173 | Q17's model answer recommends it and cites *"Module 03's Q17"* — a quiz stem — as the reference |
| FAPI 2.0 | Forward-tagged | README:148 | Correctly, to Module 10 |
| `private_key_jwt` | Forward-tagged | lab:128 | *"You will meet client signing keys again in Module 06"* |
| PKI, X.509, DER/ASN.1 | Assumed-external | README:207–228, lab:247 | DER/ASN.1 get enough inline gloss to work |

**Why:** causal — two unexamined assumptions, two families of defence.
**Bridge:** ✅ full table, ten rows — **and this is the last one.** **Wire:** ✅ one block, a hardened
PAR+PKCE+DPoP flow annotated against Module 02's. **Load:** ~38 / 5 h; heavy but chunked into five named
mechanisms. **Delta:** genuine.

**Quiz from 00–05 (19 items — the longest):** fully answerable. **Lab from 00–05:** completable, and it is
the best JOSE lab in the curriculum: the learner computes an RFC 7638 thumbprint by hand and matches it
against `cnf.jkt` rather than taking the AS's word for it.

> **The running example is signed off here.** README:73: *"The hotel, last time."* Module 08 then reopens it
> (*"The hotel again, and now we care who you are"*), Module 09a replaces it with a bank, and 09b onward drops
> analogies entirely. Four transitions. The sign-off is what a learner remembers, and it is wrong.

> **Best assessment in the curriculum.** Tier 2's distractors are the strongest set anywhere — Q2 (`typ, alg,
> kid` vs `typ, alg, jwk`, which is the exact bug documented in `AGENTS.md`), Q3 (`jkt` / `cnf` / `x5t#S256`
> / `x5c`, where `cnf` is the container rather than the member), Q10 (all four options are real DPoP claims;
> only `htu`+`htm` answer cross-endpoint replay). And Q19's closing line is the best sentence in the
> assessment layer: *"for any security control, write the test that fails when the control is absent — not
> the test that passes when it is present."*

---

### Module 06 — Machine + delegated grants

**The template changes here, silently.** Gone: "Specification pass + the bridge", "Wire-level walkthrough",
"Threat notes". New: "Where this sits in the dependency graph", "Common mistakes" (❌/✅ code pairs), "What
just happened?", "Onward". Nothing announces the change.

| Token used | Class | Where | Note |
|---|---|---|---|
| **attestation** | **Never appears** | — | Module 02's Tier 4 key promised it here. Confirmed absent by grep. See B-05 |
| `private_key_jwt`, `client_secret_jwt` | Introduced here | README:150–156 | Correctly, in a two-column §2.1-vs-§2.2 table, and tied forward to Module 10 |
| `jku` | Assumed | README:367, Q12 | Used in a vulnerable code sample; the comment *"attacker-controlled"* carries it |
| SAML 2.0 | Assumed-external | README:315, 321 | Flagged explicitly as not wired up |

**Why:** causal — three meanings of "authorized", and the module's spine (*impersonation is delegation with
the audit trail deleted*) is the best single sentence in the curriculum.

**Bridge:** ⚠️ **partial — the table is gone.** The analogy survives (company cheque / notarised letter /
power of attorney) and each bullet leads with the formal term in bold, so it is not *stranded*. But the
plain-element → formal-concept → **defining-reference** mapping is dropped, and with it the habit of
attaching every analogy element to a citable section.

**Wire:** ❌ **absent — zero `http` blocks.** RFC 8693's request and response are taught as parameter tables
only; the learner never sees a token-exchange request on the wire *in the lesson*. The lab compensates in
practice (37 `curl` invocations) but the lesson no longer models the artefact.

**Load:** ~40 / 4 h. **Delta:** genuine, and **the best-formatted one** — spec / status / adds / would break
without it.

**Quiz from 00–06 (18 items):** fully answerable, and the best-built quiz so far. Q9 is a *ranking* item
(four options, best to worst, justify the worst) and Q10 asks the learner to *extract the principle* and name
where the module both honours and violates it. The key explains every wrong option as a bulleted list.

**Lab from 00–06:** completable. This is the **first lab using `grep -oP`** (lab:161, 169) — see B-06.

> **B-09 — wrong module pointer in the key.** `quiz-answers.md`:102 says *"Module 05's step-up mechanism
> (RFC 9470)."* Step-up is **Module 09a**; Module 05 covers PAR, JAR, `iss`, DPoP and mTLS and contains no
> step-up material. A learner following the pointer finds nothing.

> **The lab is the best in the curriculum.** Exercise 6 walks from a non-OAuth 400 with a stack trace, to
> calling Authlete directly and finding `A311001 … processed successfully`, to reproducing a Zod schema
> mismatch in six lines, to the single line of source (`result.subject || subjectToken`) that puts a live
> access token in a `sub` claim. Exercise 5 forces a written prediction *before* Exercise 6 runs, which
> converts a demonstration into a test.

---

### Module 07 — OAuth 2.1 + the Security BCP

| Token used | Class | Where | Note |
|---|---|---|---|
| — | — | — | **No unintroduced tokens found.** The module is an explicit synthesis of 02–06 and says so |

**Why:** causal — the gap between *"I know what PKCE does"* and *"I can tell you whether this is safe to
ship."* The opening enumerates five findings the learner already made, one per module, and points out that
nobody has yet asked what the *posture* is.

**Bridge:** ⚠️ partial. The building-inspector analogy has three elements (which items are load-bearing,
don't trust the paperwork, write actionable findings) and is bridged by one line — *"RFC 9700 §2 is the
checklist. The rest of this module is the other three things."* The three do map onto the three following
sections in order, so the mapping is recoverable; it is left to the reader.

**Wire:** ❌ absent — **and appropriately.** This module adds no mechanism.
**Load:** ~22 / 3 h. Comfortable, and deliberately so. **Delta:** genuine.

**Quiz from 00–07 (18 items):** fully answerable. **Tier 2 is half free-response** (Q8 ranking, Q9 three
questions to ask a vendor, Q10 find-two-errors-and-rewrite), which is the right instrument for a method
module.

**Lab from 00–07:** completable, and it produces a **deliverable** rather than answers — a conformance report
in `my-audit.md`, correctly gitignored. Needs Authlete console read access, which the lab extracts from
`server/.env`. `$AS` is used at lab:487 and is not in the "Before you start" list, but it *is* exported by
`curriculum.env.example`, so the command works.

> **B-01 (first of three occurrences).** README:366: *"**Cumulative Exam B is due after this module** and has
> not been written yet — see the Build Log in `PROGRESS.md`."* `exams/exam-b.md` exists: 15 items, 100 points,
> with a 283-line answer key. See §7.1.

> **Best Tier 4 in the curriculum: Q17.** It asks the learner to *construct* conformance theatre — the
> smallest set of configuration changes that flips the most rows to PASS while closing zero attack paths —
> and then to design the three audit questions that defeat their own construction. The key's answer is that
> each question attacks a distinct substitution checklists invite: capability-for-enforcement,
> existence-for-adoption, documentation-for-decision. That generalises far beyond OAuth.

---

### Module 08 — OIDC Core + logout

| Token used | Class | Where | Note |
|---|---|---|---|
| **`sid`** | **Dangling** | README:308, 317 | *"MUST identify the session by `sub` and/or `sid`"*, then *"a session store queryable by `sub`/`sid`."* No definition; `GLOSSARY.md` mentions it only *inside* the Logout-token row (line 81) and gives it no row of its own |
| third-party cookies | Assumed-external | README:301, 303, 346 | **Load-bearing** — it is the reason two of the four logout specs are judged unusable |
| iframe, `check_session_iframe` | Assumed-external | README:278, 303 | Named in a table, never explained |
| `events` claim | Introduced here | README:307 | Explained inline |
| errata sets | Introduced here | README:349–351 | With a genuinely useful citation note |

**Why:** causal, and **the single best-motivated opening in the curriculum** — a seven-line code block that
*"runs, returns the right user, passes code review, and will pass your tests,"* followed by three numbered
reasons it is an authentication bypass.

**Bridge:** ⚠️ partial — the analogy is present and each bullet leads with the formal term ("The key card is
an access token", "The signed registration slip is an ID token"), so it is bridged inline. No reference
column.

**Wire:** ❌ **absent, and this is the costliest absence in the curriculum.** Module 08 introduces
`scope=openid`, `nonce`, the ID token, `at_hash`/`c_hash`/`s_hash`, and five response types — and **never
shows an OIDC authorization request or token response as HTTP.** Capability 1 of the five is *draw the flow
at wire level and name every parameter's purpose*; the OAuth variant is drilled three times and the OIDC
variant not once. The lab shows a decoded ID token payload and a hybrid fragment redirect, which is partial
compensation.

**Load: ~46 terms / 4–5 h.** Thirteen numbered validation steps, four logout specifications, three hash
claims, five response types, four `prompt` values and four §3.1.2.6 errors. Heavy. See B-10.
**Delta:** genuine, with the valuable observation that all six documents are OpenID **Final**, not RFCs, and
a note to cite the errata set.

**Quiz from 00–08 (19 items):** fully answerable. **Tier 2 is entirely free-response** — a deliberate and
good choice, which means Module 08 has no Tier 2 MCQ distractors to assess. Q17(c) explicitly requires
Module 06 (*"how this interacts with Module 06's assertion-grant finding if both are enabled on one client"*)
and the key's answer — one leaked secret yields impersonation on both sides of the trust boundary with no
artefact recording it — is the best cross-module synthesis in the curriculum.

**Lab from 00–08:** completable, and unusually considerate: it **pre-warns about the `loginLimiter` 429
cascade** and explains that the error surfaces three steps downstream of its cause. Uses `grep -oP` (4×) and
`openssl rand` (1×). Exercise 3d is honestly marked `UNVERIFIED` because the ES256 branch was not exercised.

---

### Module 09a — Interaction extensions

| Token used | Class | Where | Note |
|---|---|---|---|
| `claims` parameter, `"essential": true` | Introduced here | README:251 | Retroactively covers Module 05's use — four modules late, and in one clause |
| keychain access groups, shared entitlements | Assumed-external | README:326 | Explicitly flagged as outside OAuth's model |
| `backchannelUserCodeParameterSupported`, `nativeSsoSupported` | Introduced inline | README:199, 322 | Authlete flags, explained in place |
| **MCP** | **Absent** | — | Module 04 promised *"Module 09a's MCP material."* There is none. See B-03 |

**Why:** causal for four of five. **Bridge:** ⚠️ partial — bank analogy, five bullets, each leading with the
formal term. **Wire:** ❌ absent (two bare HTTP lines in the RFC 9470 challenge example, in an untagged
block). **Load: ~44 terms / 5 h across five independent extensions.** Joint peak with 08 and 09b. See B-10.
**Delta:** genuine, with correct status labelling throughout (Native SSO as 2nd Implementer's Draft, JARM
with errata set 1).

**Quiz from 00–09a (19 items):** fully answerable. Tier 2 is entirely free-response again. **Q19** is the
best-designed item in the module: it takes the module's own meta-lesson (*every extension was one unset field
away*) and asks what that implies for auditing — specifically why a discovery-derived capability matrix is
inadequate, and how to present "permitted but not configured" differently from Module 07's "supported but not
required" to a team that has to act. That is genuine synthesis with Module 07.

**Lab from 00–09a:** completable. Requires four Authlete console changes, each declared, and the cleanup
section tells the learner which are safe to leave on and which is not (`bcDeliveryMode` makes the client able
to trigger authentication prompts). Uses `grep -oP` (2×). **The `UNVERIFIED` discipline here is a standard
worth naming:** every refusal is a verbatim live transcript; every post-enablement step that was not observed
says so and calls the described output *"the specification's promise rather than an observation."*

> **The weakest "why" in the curriculum, quoted in full**, and it is the fifth item of five:
>
> > *"A fifth, briefly: **one app per device.** **Native SSO** lets several native apps from one vendor share
> > an authentication without each running its own browser flow."*
>
> This is the one place a mechanism is introduced by saying what it *does* rather than what *fails without
> it*. Every other motivation in fourteen modules names a specific attack or limitation first. The contrast
> is the point: the bar is high enough that the weakest example is one sentence about an optional
> implementer's-draft extension.

---

### Module 09b — Identity + credentials

| Token used | Class | Where | Note |
|---|---|---|---|
| RFC 7800 (`cnf` for key binding) | Cited bare | README:290 | The only citation in the curriculum given by number with no status label. No glossary row |
| eIDAS, trust framework | Assumed-external | README:130 | In a JSON example; contextually clear |
| `direct_post`, `direct_post.jwt` | Introduced here | README:409 | Tied back to CIBA's motivation — a good link |
| decoy digest | Introduced in the **lab** | lab:107, 130, 151 | Not in the README; the glossary attributes it to 09b, which the lab satisfies |

**Why:** causal — four unexamined assumptions in a table, each with "what breaks it". Two of the four "what
breaks it" cells are *scenarios* rather than attacks (*"A border kiosk with no network"*), which the brief
allows as limitations.

**Bridge:** ❌ **no analogy at all.** First module with none.
**Wire:** ❌ absent.
**Load: ~48 terms / 4 h — the heaviest term-density per hour in the curriculum.** Four independent
specification families (Identity Assurance, Federation, SD-JWT, OID4VCI/VP) plus SD-JWT VC. See B-10.
**Delta:** ⚠️ present but the thinnest in the curriculum — a two-column "Adds over what you already knew"
with no status column (status lives in a separate table above, so the information is there, split).

**Quiz from 00–09b (18 items):** fully answerable, and unusually well built. **Q6** (*why does a Disclosure
contain a salt at all*) and **Q8** (*the unlinkability claim*) are the two best Tier 2 MCQ items in the
curriculum — both have a distractor that names the shallow model out loud. Tier 3 has four items where every
other module has five.

**Lab from 00–09b:** completable and, uniquely, **self-contained** — `scripts/sd-jwt.mjs` runs locally with
no server and no Authlete dependency for Exercises 1–6. Exercise 1 reproduces RFC 9901's own published test
vector, which gives the learner a fixed reference to fall back on. The instruction to read the 330-line
script before attacking it is good practice.

> **The absence of an analogy is most costly here.** Salted digests, decoy digests, `sd_hash` over a selected
> subset, and four kinds of unlinkability are the most abstract constructions in the curriculum, and this is
> the module that drops the device used to make Modules 00–05 concrete. Module 09b *does* substitute a strong
> alternative — deriving SD-JWT from four requirements, exactly as Module 03 derived PKCE — so it is not
> undefended. But requirement-derivation and analogy do different jobs: derivation shows *why the shape is
> forced*, analogy gives you *something to hold onto when you have forgotten the derivation*.

> **Toolchain break.** Exercise 1 line 64 uses `basenc --base64url`. `basenc` is GNU coreutils ≥ 8.31 and is
> **not present on macOS**. It is the second command in the module's core content. See B-06.

---

### Module 10 — FAPI + grant management

| Token used | Class | Where | Note |
|---|---|---|---|
| `--require-claims` | Backward-tag | README:172 | Refers to a Module 09b lab flag; **verified to resolve** (09b lab:433, `sd-jwt.mjs`:390) |
| open banking | Assumed-external | README:227, 466 | Domain context, used throughout without definition |

**Why:** causal, and **structurally the most interesting in the curriculum** — the hole is in the *method*
taught two modules earlier, not in a mechanism: *"a checklist tells you whether you did the listed things. It
cannot tell you whether the list is the right list."*

**Bridge:** ❌ no analogy. **Defensible** — an attacker model is already the plain-language version, and a
hotel metaphor would be worse than none. It is not *said* to be a decision, though, so it reads as an
omission.
**Wire:** ❌ absent — defensible; this module is about a profile, not a flow.
**Load:** ~36 / 5–6 h. Manageable; the six attackers and three goals are heavily scaffolded.

**Delta:** ⚠️ **no `## Spec delta` heading** — but the content is present and is **the best delta in the
curriculum**: §5.5 Table 1 reproduced with the specification's own quoted *reasons* for each change, which is
exactly "what changed and what drove it." The "table to internalise" supplies status and date. So this is a
heading inconsistency, not a content gap.

**Quiz from 00–10 (18 items):** fully answerable. Tier 2 returns to MCQ, with strong distractors — **Q1**
offers the CIA triad against FAPI's three goals, and **Q3** tests *"exactly 600"* versus *"less than 600"*,
which is the pedantic point the lesson made and the number the lab measures. **Q18** is explicitly
cross-module (*"using what you know from Modules 04, 07 and 10"*).

**Lab from 00–10:** completable, and it produces a conformance report. Uses `python3` (14×) and `grep -oP`
(4×) — see B-06. The setup includes two warnings that would each cost an hour (`decision=approve`, not
`approved=true`; and stored consent short-circuiting the consent page) — the kind of thing that otherwise
sends a learner searching.

---

### Module 11 — API security beyond the token

| Token used | Class | Where | Note |
|---|---|---|---|
| mass assignment | Introduced here | README:106 | Explained inline |
| SSRF | Assumed-external | README:83, quiz Q3 | A row in the OWASP table and a quiz distractor; never explained |
| GraphQL resolver, gRPC | Assumed-external | README:224 | Listed as entry points |
| service mesh | Assumed-external | quiz-answers | Infrastructure vocabulary |

**Why:** causal, and it lands the hardest single point in the curriculum: *"A perfect FAPI 2.0 deployment is
exactly as vulnerable as a bad one."* The four-row OAuth-answers / OAuth-does-not-answer table is the
clearest framing device in the material.

**Bridge:** ❌ no analogy. **Wire:** ✅ one `http` block (the BOLA request) — the minimum needed, and used
well as the module's opening image. **Load:** ~30 / 4 h. Comfortable.

**Delta:** ❌ **the weakest in the curriculum.** Module 11 has no `## Spec delta` section *and* no equivalent
content. The OWASP table lists ten items but never says what the 2023 edition **changed** from 2019, despite
README:73 warning that *"the 2019 list differs and citing it dates you."* That is a delta the module gestures
at and does not supply.

**Quiz from 00–11 (18 items):** fully answerable. **Lab from 00–11:** completable; heaviest `python3`
dependence (10×) with zero `node -e`, plus `grep -oP` (3×). Exercise 6, *"Find the BOLA in code review,"* is
the single most direct instrument for capability 5 anywhere in the curriculum.

> **B-11 — two Tier 2 items are Tier 1 recall wearing a Tier 2 label.**
>
> - **Q8** — *"Which model can express: you may read a document if you own the folder containing it, or it
>   was shared with you transitively?"* README:187 reads: *"You may read a document if you own the folder it
>   is in, or someone shared it with you, transitively → **ReBAC**."* Near-verbatim.
> - **Q9** — *"Which of these can an API gateway enforce?"* The three wrong options are the three cells
>   explicitly marked ❌ in the README's gateway table (lines 207–208), read ten minutes earlier.
>
> Both keys are good — they explain every wrong option. The defect is item difficulty, not key quality.
> Rewrite as scenarios (give a data model, ask which model fits *and where it is enforced*) or relabel Tier 1.
> Note the contrast with **Q14**, which is excellent: *"What is wrong with the finding **as written**?"* is
> review discipline, not recall.

---

### Module 12 — Capstone

| Token used | Class | Where | Note |
|---|---|---|---|
| Aurora brief, Meridian Health document | Introduced in `lab.md` | — | Self-contained |

**Why:** N/A — replaced by "How this module is different", which correctly frames the shift from mechanism to
judgement and names the two things that change: no right answers, only defensible ones; and *"you will be
wrong about something, and the rubric is built to surface it."*
**Bridge / Wire / Load / Delta:** N/A for a capstone.

**Quiz from 00–12 (18 items):** answerable, and Q16/Q17 correctly require the learner's **own Part A design**
as input, which is the only honest way to assess a design capability. **Q18** is the best closing item
available: *Meridian is not the work of careless people* — it contains PAR, `private_key_jwt`, DCR with a
JWKS URI, tenant-scoped queries, 404-not-403 — *yet the platform is comprehensively insecure. Explain how
that happens.* That asks about process and incentives rather than mechanisms, which is the right last
question.

**Lab:** completable. The Meridian document is self-contained, and the **25-defect count is stated** so that
"I found them all" is falsifiable. The rubric's false-positive penalty (−1 per unevidenced claim) and the
warning that *"the single most common way to overscore yourself is generosity on rejected alternatives and
limitations"* are both good design.

> **Three defects in the capstone's own framing.**
>
> **B-01 (second occurrence)** — README:31: *"**Those are not written yet**"* about all four exams, followed
> by *"Do the capstone now; the exams will slot in behind it as extra practice, not as a prerequisite."*
>
> **B-02 (a)** — README:151 maps *"Place an unfamiliar extension in the dependency graph"* → *"quiz Tier 2."*
> Module 12's Tier 2 is Q6–Q10, all five of which are Meridian-document defects (24-hour tokens, `X-User-Id`
> trust, the missing `act` claim, a step-up challenge without `acr_values`, weakest-link analysis).
> **None involves placing an extension anywhere.**
>
> **B-02 (b) — a second false row, not previously noticed.** README:148 maps *"Draw the code+PKCE flow at
> wire level, naming every parameter"* → *"Part A decisions 1 and 4; quiz Tier 1."* Module 12's Tier 1 is
> Q1–Q5, all five Meridian defects (FAPI supported≠required, ROPC, wildcard redirect, HS256 ID tokens, token
> vs grant revocation). **None asks the learner to draw a flow or name a parameter.** Part A decisions 1 and 4
> ask for grant/client-auth and PAR/JAR/JARM choices — design decisions, not a wire trace. So the traceability
> table asserts coverage that does not exist for **two** of the six rows, including the capability the
> curriculum is otherwise best at building.

> **Answer-key inconsistency.** Module 12's key explains distractors for Q1, Q2 and Q3 and **does not** for
> Q4, Q5, Q9 or Q10 — it states only why the right answer is right. Every other module's key is consistent on
> this. Q4 is the one where it matters: option B (*"cannot be validated offline"*) is false in an interesting
> way that the key never exploits, and C and D (*"limited to 1-hour lifetimes"*, *"cannot carry a nonce"*) are
> filler.

#### All 25 planted defects are findable from taught material — checked individually

This was the largest open question in the audit, because the capstone is where a learner decides they are
done. I traced each of the 25 defects in the answer key's inventory to the module that teaches it, and
**every one resolves.** The key's own module attributions are accurate. A representative sample of the
tightest cases:

| # | Defect | Taught where | Verdict |
|---|---|---|---|
| 1 | FAPI 2.0 compliance claim is false (supported ≠ required) | 10 README "Common mistakes", first entry | ✅ verbatim |
| 2 | Two trusted issuers, no `iss` **validation** | 05 README:157–161, RFC 9207 §2.4 client MUST | ✅ |
| 13 | Session established from an access token via UserInfo | 08's opening code block, the module's whole premise | ✅ |
| 18 | Token exchange yields impersonation, no `act` | 06 README:284–293 + "Common mistakes" | ✅ |
| 19 | Static shared API key, annual rotation, cross-tenant read | 01 spec delta (ad-hoc API keys), 06 (over-broad machine token), 11 (key rotation) | ✅ but **thinnest** — assembled from three modules, none of which treats the static-API-key anti-pattern directly |
| 20 | Step-up challenge omits `acr_values` | 09a README:240–243, named *"the single most common RFC 9470 implementation mistake"* | ✅ verbatim |
| 25 | Full headers logged on 4xx/5xx, capturing `Authorization` | 05 quiz Q18 is this scenario exactly | ✅ verbatim |

**Two of the key's severity arguments lean on undefined background** — #5 and #15/#16 invoke XSS and SSRF
respectively (*"one XSS or one abandoned subdomain"*, *"one SSRF (API7) makes it a token-scanning oracle"*).
In both cases the **defect** is findable without that vocabulary (an abandoned subdomain suffices for #5;
Module 04's own lab finding suffices for #15), so this does not block anyone — but it is the third and fourth
place those two undefined terms carry weight, which reinforces B-04 rather than adding to it.

**The false-positive traps are well chosen.** Seven correct things are planted — PAR + `private_key_jwt` for
partners, DCR with a JWKS URI, `typ: at+jwt`, the tenant-scoped query *shape*, 404-not-403, the explicit
response projection, and issuer-signature verification. Q13's key makes the sharpest point in the module:
*"the shape of the fix is right and the inputs are wrong."* And Q15 penalises a plausible, confidently-wrong
finding, with the reason stated in operational terms — *"in a real engagement it is the finding that costs
you the room."*

---

## 4. Assessment calibration

### Do the tiers actually escalate?

**Yes, in all fourteen.** The tiers escalate in *cognitive operation*, not prose length:

| Tier | Operation | Instrument |
|---|---|---|
| 1 | Recall | MCQ against spec text |
| 2 | Apply a model to a scenario | MCQ with named-misconception distractors, or free response |
| 3 | Read code or a transcript and diagnose | Always a code block or a live output |
| 4 | Design, attack, or judge | Free response, frequently requiring the learner's own prior work |

Tier 3 is consistently code-or-transcript reading. That is the right instrument for capability 5 and it is
rarer in teaching material than it should be — roughly 65 items across fourteen modules, every one of them a
snippet or a response body rather than a description of one.

**Two format choices worth naming.** Modules **08** and **09a** make Tier 2 entirely free-response. That is a
deliberate and good decision for material where the interesting failure is "I recognise the term" — but it
means those two modules contribute no Tier 2 distractors to assess, and the brief's distractor question does
not apply to them.

**One genuine exception:** Module 11's Q8 and Q9 are Tier 1 recall labelled Tier 2 (B-11).

### Tier 2 distractor quality

Strong across the board, and frequently excellent. The pattern that works — used deliberately — is a
distractor that **names the shallow model out loud**, with the key then saying "A is the trap" and explaining
the misconception. The best instances:

| Item | Why it works |
|---|---|
| **01 Q9** | A and B quote RFC 6749 §4.3's own permissive text — genuine, and superseded by a 2025 BCP |
| **02 Q6** | "Invent a service-account user" is a real and widespread anti-pattern, not a straw man |
| **02 Q7** | "Embedded webview" is a Module 01 failure wearing a Module 03 costume |
| **03 Q7** | The key names it: *"`state` is the single most common wrong answer"* |
| **04 Q6** | A is *"the trap for the security-minded reader"* — the strongest revocation story, ignoring the stated constraints |
| **05 Q2** | `typ, alg, kid` vs `typ, alg, jwk` — the exact bug documented in `AGENTS.md` |
| **05 Q3** | `jkt` / `cnf` / `x5t#S256` / `x5c` — three near-misses, one of which is the container rather than the member |
| **05 Q10** | All four options are real DPoP claims; only `htu`+`htm` answer cross-endpoint replay |
| **09b Q6** | "To make each Disclosure unique so the `_sd` array can be sorted" — a plausible structural read |
| **09b Q9** | "A stronger signature algorithm" is the exact misconception `verified_claims` invites |
| **10 Q1** | The CIA triad against FAPI's three goals |
| **10 Q3** | "exactly 600" vs "less than 600" — the pedantic point tested, and measured in the lab |

**Items where every wrong answer is obviously wrong** (asked for by number):

| Item | Problem |
|---|---|
| **11 Q8** | Near-verbatim from README:187. RBAC/ABAC/Scope-based are eliminated by a table read ten minutes earlier |
| **11 Q9** | The three wrong options are the three ❌ cells in the README's gateway table |
| **01 Q7** | "transmitted over HTTPS" / "unguessable" / "longer than a password" — none is a model anyone holds |
| **12 Q4** | "cannot carry a `nonce`" and "limited to 1-hour lifetimes" are filler; option B is the only one with pull and the key does not address it |

**Four weak items out of roughly 55 Tier 2 MCQs.** Two of the four are in the same module.

### Do Tier 4 items require synthesis?

**Genuinely cross-module, and often explicitly so.** Representative:

- **02 Q16** — derives PKCE's four requirements *before* PKCE is taught, and rules out `state` as a substitute
- **05 Q18** — four artefact types across Modules 02–05 against one attacker capability (log read access)
- **06 Q18** — four-service chain requiring PKCE (03), `resource` (04), DPoP (05) and exchange (06), and asks
  *"name the one design decision you are least confident about"*
- **07 Q17** — construct conformance theatre, then design the three questions that defeat your own construction
- **08 Q17(c)** — *"how this interacts with Module 06's assertion-grant finding if both are enabled on one client"*
- **09a Q19** — turn the module's meta-lesson into an audit method, contrasted with Module 07's
- **09b Q17** — key binding (RFC 9901) vs DPoP (Module 05), three structural differences
- **10 Q18** — *"using what you know from Modules 04, 07 and 10"*
- **12 Q16/Q17** — attack *your own* Part A design with FAPI 2.0's attacker model

**Weakest Tier 4 items, both in the first half:**

- **00 Q14** — the RS256→HS256 exploit is walked to its conclusion in the lab's Break 3, including the fix.
- **03 Q18** — the *"why both positions are correct"* third is recall of README:207–213 in the same words.
  The two-deployment split and the monitoring half are genuine.

Two soft items out of 45+ Tier 4 items is a good ratio, and both are in modules where Tier 4 is doing less
work because the material is still foundational.

### Do the answer keys explain why wrong answers are wrong?

**Thirteen of fourteen, consistently.** Two formats are in use and both work:

- **Modules 00–05** explain distractors in running prose (*"A/C are the shallow trap: 'it's HTTPS so it's
  fine' confuses transport protection with endpoint/user exposure"*).
- **Modules 06–11** use an explicit per-option bulleted list under each answer, which is easier to scan and
  harder to skip. Module 06's key is the model: every one of A/B/C/D gets a line, and Q2's key notes that
  getting the answer backwards means *"you have the security properties backwards too."*

**Exceptions:** Module 12's Tier 1 Q4/Q5 and Tier 2 Q9/Q10 state only why the right answer is right. And
Module 03's Q9 key contains a live error that mislabels the correct answer as a trap (B-07).

### The exams and their keys

Read in full, questions and keys. They are the strongest assessment instrument in the curriculum and they do
exactly what `exams/README.md` claims: fewer MCQs, more tracing and design, integrative items that name no
module, and closed-book rules with two narrow exceptions (`curl`, and `[lab]`-marked items). Three items
reach forward and each says so inline, as promised — A13, A14 (`[lab]`) and B5's FAPI half.

**The keys are the best-engineered part of the assessment layer.** Every one allocates marks per element
rather than per item, names what full marks requires, and ends with a *"where your misses point"* table
mapping each item back to a module. Several go further and mark the *anticipated wrong answer*: A1 says
*"do not accept `code_challenge`"* as the removable parameter; C12 says *"deduct one if the candidate asserts
a flat prohibition"* on refresh-token rotation; F11 awards **zero** for a severity-ordered list with no
effort or dependency reasoning; F12 deducts for a limitations section that is really a roadmap. The Final's
self-grading rubric names the two inflation risks explicitly and is the same pair the capstone rubric names.

**I specifically checked all four keys for the model-answer overreach found at Module 02 Q17** — a key
demanding terms the modules had not supplied. **The exam keys do not have it.** Every model answer across
A, B, C and the Final draws on material taught before the exam is due. That is a better result than the
module keys achieve.

Two defects, both new:

> **B-16 — the Final's F2 key contradicts the curriculum's own running count.** F2 asks: *"This curriculum
> names one pattern four times: commit to a secret on one channel, prove it on another. Identify all four
> occurrences."* The key's four are **PKCE (03), DPoP (05), `at_hash`/`c_hash`/`s_hash` (08), key binding
> (09b)**.
>
> But the curriculum numbers the pattern explicitly, three separate times, and gets a different list:
>
> | Where | Text | Implies |
> |---|---|---|
> | `03/README.md`:49–51 | *"the same pattern as **Module 02's code-vs-token split**, applied one level deeper… You will see it **a third time in Module 05**"* | 02 = 1st, 03 = 2nd, 05 = 3rd |
> | `05/README.md`:53 | *"this is PKCE's commit-then-prove idea again… **third time in this curriculum**"* | confirms 05 = 3rd |
> | `09b/README.md`:282, 302, 553 | *"for the **fourth time**"*, *"**Fourth occurrence** of the same pattern"*, *"same pattern, **4th time**"* | 09b = 4th |
>
> The curriculum's four are **02, 03, 05, 09b**. The key's four are **03, 05, 08, 09b**. It drops the
> code-vs-token split — which Modules 02, 03 and 05 all name as the origin of the pattern — and substitutes
> Module 08's hash claims, which Module 08 does call *"the same pattern"* (README:481–482) but which the
> running count never enumerates.
>
> **A learner who tracked the count exactly as instructed answers 02/03/05/09b and loses 1.5 of 9 marks for
> following the material.** The key accepts mTLS as an alternative to DPoP but not the split as an
> alternative to the hash claims. Fix: accept either list, or renumber the four occurrences consistently
> across 02/03/05/08/09b — there are arguably five, and saying so would be better than picking four twice.

> **B-06 extends into the exams.** Exam A's **A14** is `[lab]`-marked, so tools are permitted — but the key's
> worked solution (lines 204–206) is `openssl dgst -sha256 -binary | basenc --base64url`. **Exam A is taken
> after Module 03**, where the only declared tools are `curl` and `node`, and `basenc` is GNU coreutils
> ≥ 8.31 — absent on macOS. The same command reappears in Module 09b's lab nine modules later. No `node -e`
> equivalent is offered in either place, though every lab from 00 to 09a demonstrates one.

The Final is almost entirely synthesis. **F12** — *write the limitations section for a design you consider
good* — is marked as the most important item on the exam, with the line *"a design you cannot criticise is a
design you do not understand."* That is the right last thing to ask.

---

## 5. The end-state test

The curriculum `README.md`:21–25 promises that, **without reference material**, a finisher can do five
things. Tracing each to named sources:

### Capability 1 — Draw the authorization-code flow with PKCE at wire level, naming every parameter's purpose

**Well sourced — for OAuth.** ✅ / ⚠️

| Source | Contribution |
|---|---|
| **02** README "Wire-level walkthrough" (246–298) | Eight-leg annotated HTTP trace, who-can-read-what per leg |
| **02** README "parameter by parameter" (109–117) | Every request parameter: required?, what it does, what breaks without it |
| **03** README "Wire-level walkthrough" (244–284) | The same flow with the three PKCE additions marked |
| **02** lab Ex 1 (four legs by hand), **03** lab Ex 1–2 | Learner drives every leg with `curl` |
| **Exam A1 (12 pts)** | *"From memory, write out an authorization-code flow with PKCE for a public client as a sequence of HTTP messages"* — the capability, tested verbatim, closed book |
| **Exam A2 (8 pts)** | Eight parameters, purpose and failure mode each |

This is the best-built capability of the five. **The caveat is the OIDC variant.** Module 08 has no
wire-level section, so a graduate asked to draw `scope=openid` + `nonce` + the ID token response has
practised the tables but never the trace — and OIDC is the flow most learners will actually implement.
**Module 12's traceability table claims Tier 1 covers this; it does not** (B-02b).

### Capability 2 — Explain why an access token does not authenticate a user

**Well sourced, arguably over-sourced.** ✅

| Source | Contribution |
|---|---|
| **01** README:47–49 | The flag is planted: *"plant the flag now"* |
| **08** README "Why this module exists" (21–59) | The seven-line broken code block, three numbered reasons, token substitution named |
| **08** README "Access token vs ID token" (104–117) | Nine-row contrast, with the two rows that generate most bugs called out |
| **08** lab Ex 1c | Hands-on, including the *"but introspection returned `sub`"* objection and its three answers |
| **08** quiz Q6 (Tier 2), Q16 (Tier 4 — write the attack in full) | |
| **Exam C1 (8 pts)**, **Final F3(a)** | Closed book |
| **12** Part B | Meridian §5 contains this exact defect; quiz Q11 |

### Capability 3 — Select grants, client auth and token binding for an arbitrary architecture, and defend each against a *named* attacker model

**Sourced, with one seam.** ✅ / ⚠️

| Source | Contribution |
|---|---|
| **02** README "grant catalogue — choose by two questions" (161–180) | The selection heuristic |
| **02** quiz Q17 (Tier 4) | Four-component product: grant + client type + client auth + worst attack |
| **03** §"Public vs confidential"; **05** §"DPoP vs mTLS" (218–231) | The binding decision, argued on cost and ecosystem rather than strength |
| **06** §"The three machine grants, keyed on one question" | Machine-side selection |
| **10** Part 1 "The six attackers (§7)" | **The only place a named attacker model is taught** |
| **05** Q17, **09b** Q18, **11** Q17 | Per-client-class decisions with defence |
| **Final F8, F9, F10 (25 pts)** | CLI tool; sender-constraining across three client classes; third-party SSO |
| **12** Part A decisions 1–3 + the 8-point "Attacker model stated and used" criterion | The full capability, assessed |

**The seam:** the *named attacker model* half is taught once, in Module 10, and every instrument that
requires it (Final F12, capstone Part A, capstone Q16) sits after it. That ordering is correct — but it means
Modules 02–09b ask the learner to "defend the choice" against threats they name ad hoc, and the discipline of
enumerating a *model* arrives at module eleven of fourteen. It works; it is just later than the promise
implies.

### Capability 4 — Place an unfamiliar OAuth extension correctly in the dependency graph

**❌ No source. This is the most important finding in §5.**

The word "unfamiliar" appears exactly twice in the curriculum: in the promise (`README.md`:24) and in Module
12's claim that quiz Tier 2 tests it (`12/README.md`:151), which it does not.

What exists instead:

| What exists | Why it is not the capability |
|---|---|
| "Where this sits in the dependency graph" in Modules 06–11 | **Authored exposition.** The curriculum places the extension *for* the learner |
| **09a** learning objective 6 — *"Place all five extensions on the table without notes"* | Recall of five **taught** extensions |
| **Exam C5** — *"Name the four assumptions and the extension that lifts each"* | Same: recall of taught material |
| **09a** README:51–53 — *"knowing which one a given problem calls for"* | Selection among taught options, not placement of an unknown one |
| **09b** README:53 — *"Place OID4VCI and OID4VP in the dependency graph"* | Same, for two taught specs |

**There is no exercise anywhere in which a learner is handed an extension they were not taught and asked to
place it.** The curriculum has the raw material to do this well — it teaches the "which assumption does this
lift?" frame (09a), the "what changed and what drove it" frame (10), and status discipline (07) — but it
never turns those into a transferable drill. A graduate can recite the graph they were given; nothing
establishes they can extend it.

**And there is a ready-made candidate the curriculum already leaves uncovered:** MCP and CIMD (B-03). The repo
has a full MCP surface — `McpSection.tsx`, `mcp.service.ts`, `docs/MCP-OAUTH-TUTORIAL.md`, RFC 8414 metadata
at root — and the curriculum never teaches it, while Module 04 promises it to a module that does not have it.
That is one gap that could close another.

### Capability 5 — Find an authorization flaw in a code review

**Very well sourced.** ✅ The strongest capability after #1.

| Source | Contribution |
|---|---|
| **Tier 3 of all fourteen quizzes** (~65 items) | Every one is read-this-code-or-transcript-and-diagnose |
| **11** lab Ex 6 — *"Find the BOLA in code review"* | The capability, named and drilled |
| **06, 08, 09a, 09b, 10, 11** README "Common mistakes" | ❌/✅ code pairs — 30+ paired examples |
| **08** Q11–Q15, **09b** Q11–Q14, **11** Q11–Q15 | Concentrated code-defect batteries |
| **Final F4, F6, F7** | Closed-book diagnosis from symptoms alone |
| **12** Part B | 25 planted defects, several in code, with false positives penalised |

The false-positive penalty in the capstone rubric (−1 per unevidenced claim), Module 11 Q14 (*"what is wrong
with the finding **as written**"*) and Module 12 Q15 (assess a confidently-wrong finding) are what lift this
above "spot the bug" into review discipline.

### Summary

| # | Capability | Verdict |
|---|---|---|
| 1 | Wire-level code+PKCE flow | ✅ Strong (OAuth); **OIDC variant untraced**; Module 12's traceability row is false |
| 2 | Access token ≠ authentication | ✅ Strong |
| 3 | Select grants/auth/binding vs a named attacker | ✅ Sourced; attacker-model discipline arrives at Module 10 |
| 4 | **Place an unfamiliar extension** | ❌ **No source**; Module 12's traceability row is false |
| 5 | Find an authorization flaw in code review | ✅ Strong |

**Four of five are genuinely built. One is asserted.** And three of the five (1, 3, 5) do their **closed-book**
assessment primarily in the exams — which is why B-01 is ranked first in §7.

---

## 6. The structural verdict

### It is a template discontinuity, not decay — and the distinction changes the remedy

Section presence across all fourteen module READMEs, measured rather than asserted:

```bash
for d in modules/*/; do f="$d/README.md"
  printf '%-4s plain=%s bridge=%s http=%s delta=%s mistakes=%s\n' "$(basename $d | cut -c1-3)" \
    "$(grep -c '^## Plain-language pass' $f)" "$(grep -c '^## Specification pass' $f)" \
    "$(grep -c '^```http' $f)" "$(grep -c '^## Spec delta' $f)" "$(grep -c '^## Common mistakes' $f)"
done
```

| Module | Analogy | Bridge table | `http` blocks | Spec delta | Common mistakes |
|---|---|---|---|---|---|
| 00 | ✅ | ✅ | 3 | ✅ | — |
| 01 | ✅ | ✅ | 3 | ✅ | — |
| 02 | ✅ | ✅ | 3 | ✅ | — |
| 03 | ✅ | ✅ | 1 | ✅ | — |
| 04 | ✅ | ✅ | 1 | ✅ | — |
| 05 | ✅ | ✅ | 1 | ✅ | — |
| 06 | ✅ | **❌** | **0** | ✅ | ✅ |
| 07 | ✅ | **❌** | **0** | ✅ | ✅ |
| 08 | ✅ | **❌** | **0** | ✅ | ✅ |
| 09a | ✅ | **❌** | **0** | ✅ | ✅ |
| 09b | **❌** | **❌** | **0** | ✅ | ✅ |
| 10 | **❌** | **❌** | **0** | ❌ (content present, no heading) | ✅ |
| 11 | **❌** | **❌** | 1 | **❌ (no content either)** | ✅ |
| 12 | n/a | n/a | 0 | n/a | — |

Read the table by column and the picture is not gradual decline. **There are two templates and the switch is
at Module 06, in one step.**

- **Template A (00–05):** plain-language analogy → three-column bridge ending in a *defining reference* →
  wire-level HTTP → spec delta → "Threat notes" prose. Six modules, perfectly consistent.
- **Template B (06–11):** plain-language analogy (until 09b) → "Common mistakes" ❌/✅ code pairs → "Threat
  model" table → "Where this sits in the dependency graph" → "What just happened?" → "Onward". Six modules,
  also consistent.

Template B adds two genuinely good devices — the ❌/✅ pairing (30+ paired examples, and the single best
instrument for capability 5) and the explicit dependency-graph section. It drops two: the bridge table and
the wire level. Neither drop is announced, and neither is argued for.

**Why the direction is wrong.** The dropped devices exist to make abstraction concrete. They are fully
deployed for the authorization-code flow — the most concrete, most widely known material in the curriculum —
and fully withdrawn for token exchange, thirteen-step ID-token validation, JARM/CIBA/RAR, and salted-digest
selective disclosure. A learner gets the most support where they need it least.

**What is *not* wrong**, stated precisely because it constrains the remedy:

- **Sequencing is sound.** The dependency graph in the curriculum README matches the prerequisites declared
  in each module, and every prerequisite resolves. No module needs to move.
- **Module boundaries are right.** The 09a/09b split (interaction shape vs. what is asserted) is a genuinely
  good cut, and 07 as a mid-course method hinge is better than the usual "put the BCP at the end."
- **Some absences are correct.** Module 07 adds no mechanism, so it needs no wire trace. Module 10 is about a
  profile, and an attacker model is already the plain-language version — a hotel metaphor would be worse than
  none. Both should *say so* in one line, so the omission reads as a decision.
- **The labs carry the wire level.** Module 06's lab has 37 `curl` invocations. The artefact is missing from
  the *lesson*, not from the *module*.
- **Template B's substitutes are real.** Requirement-derivation (09b derives SD-JWT exactly as 03 derives
  PKCE), "What actually runs in this repo" honesty tables, and the `UNVERIFIED` discipline are not filler.

So this does not warrant restructuring. It warrants **merging the two templates** where the loss is
load-bearing — which is a small number of places, named in §7.3.

### Cognitive load, and where to split

| Module | New defined terms | Stated hours | Verdict |
|---|---|---|---|
| **02** | ~52 | 4–5 h | High, but it is the spine; the 17-attack table is an index. **Leave it** — but the 13 error codes tested at Tier 1 Q4 are the real load, and could move to Tier 3 recognition |
| **08** | ~46 | 4–5 h | **Split at "The logout family."** ID-token validation and the four logout specs share only a session |
| **09a** | ~44 | 5 h | **Split at "RFC 9470."** JARM+CIBA lift *interaction* assumptions; step-up+RAR lift *authority* assumptions |
| **09b** | ~48 | 4 h | **Densest per hour in the curriculum. Split at "SD-JWT — deriving selective disclosure."** Assurance + federation are governance and topology; SD-JWT + VC + OID4VCI/VP are cryptography and protocol. Two sittings, not one |

The 09a/09b split precedent already exists in the curriculum's own structure, so a 08a/08b and 09b-i/09b-ii
split would not be a novel move.

---

## 7. The five changes that would most improve learning outcomes

Ranked by learning impact, not by lines touched.

### 1. Stop telling learners the exams do not exist. *(One hour. Highest return in this audit.)*

Three live statements direct a learner away from a complete, high-quality assessment layer:

| Location | Text | Reality |
|---|---|---|
| `modules/07/README.md`:366 | *"Cumulative Exam B is due after this module and **has not been written yet**"* | `exams/exam-b.md` — 15 items, 100 pts, 283-line key |
| `modules/12/README.md`:31 | *"**Those are not written yet**"* (all four) | All four exist with keys |
| `PROGRESS.md`:492 | *"The **four exams are still unwritten** (Stage 4)"* | Contradicted by `PROGRESS.md`:89 in the same file |

Module 12 goes further and instructs the learner to skip them: *"Do the capstone now; the exams will slot in
behind it as extra practice, not as a prerequisite."* But `exams/README.md` states the exams test *"what the
module quizzes structurally cannot,"* and §5 above shows that capabilities 1, 3 and 5 do their **closed-book**
assessment there. A learner following the modules as written completes the curriculum having never sat the
only closed-book, cross-module, integrative assessment in it — and the promise is explicitly *"without
reference material."*

**Fix:** delete the three stale claims; change Module 07's note to "Sit Exam B now"; change Module 12's to
"Sit the Final before starting"; reconcile `PROGRESS.md`:492 against :89. Keep `exam-b.md`:6, which correctly
uses the past tense.

### 2. Build capability 4, or drop it — and fix both false traceability rows. *(Half a day either way.)*

*"Place an unfamiliar OAuth extension correctly in the dependency graph"* has no source (§5), and Module 12's
traceability table asserts coverage for it **and** for capability 1 that does not exist (B-02a, B-02b). Two
honest options:

- **Build it.** Add one Tier 4 item to Module 09a and one Final-exam item that hand the learner an extension
  the curriculum never taught — with only its abstract — and require five answers: which assumption does it
  lift, which module's material does it presuppose, what would break without it, what is its status, and
  where does it sit relative to PAR/JAR/JARM. **The obvious candidate is MCP + CIMD**, which closes B-03 at
  the same time: the repo already has the whole surface, the curriculum never covers it, and Module 04
  currently promises it to a module that does not have it. Other candidates: Token Status List, OAuth 2.0 for
  Browser-Based Apps, DPoP nonce negotiation. This is a ~40-line addition and it converts an authored graph
  into a transferable skill. The frames it needs (09a's "which assumption?", 10's "what changed and why",
  07's status discipline) are already taught.
- **Or drop it** from `README.md`:24 and `12/README.md`:151. An unclaimed capability is better than an unmet
  one.

Either way, **fix `12/README.md`:148 and :151.** A traceability table that asserts coverage it does not have
is worse than no table, because it is the artefact a learner uses to decide they are done.

Recommendation: build it. It is the cheapest of the five capabilities to add and the only one missing.

### 3. Merge the two templates where the loss is load-bearing. *(~1.5 days.)*

The template discontinuity (§6) is the structural finding, but the remedy should be targeted, not uniform.
Four places, in priority order:

- **Wire-level walkthrough for Module 08 — do this first.** One OIDC authorization request (`scope=openid`,
  `nonce`, `state`), the redirect, the token response carrying `id_token`, and the decoded ID token with each
  claim annotated by which of the thirteen steps checks it. **This directly repairs the only hole in
  capability 1**, and the material already exists in the lab's Exercise 1d and 3c.
- **Wire-level walkthrough for Module 06.** One annotated `POST /api/token` token-exchange request showing
  `grant_type`, `subject_token(_type)`, `actor_token(_type)`, `resource`, `scope`, and the response showing
  `access_token`, `token_type`, **`issued_token_type`** — with the discarded-parameter annotation that is the
  module's whole point. Source material exists in the lab's Exercise 6.
- **Bridge tables for 06, 08 and 09a.** These three already have an analogy; they are missing only the
  three-column mapping ending in a defining reference. Reuse the Module 00/05 format verbatim. For 06:
  company cheque → client credentials → RFC 6749 §4.4 · notarised letter → assertion as authorization grant →
  RFC 7523 §2.1 · "who the notary may vouch for" → subject restriction (*no standard mechanism — deployment
  policy*) · solicitor signing "Alice" → impersonation → RFC 8693 §1.1 · "J. Smith for Alice" → delegation /
  `act` → §1.1, §4.1 · permission slip in advance → `may_act` → §4.4.
- **One-line notes for 10 and 11** saying no analogy is offered and why, so the omission reads as a decision.
  And **give Module 11 a spec delta** — one table on what the 2023 OWASP edition changed from 2019, which the
  module already says matters and does not supply.

Nothing here moves a module, changes a prerequisite, or touches the assessment layer.

### 4. Pay the prerequisite debt: XSS and CORS. *(Half a day. This is the pure cold-read finding.)*

Module 00 states its prerequisites as *"None. Comfort with a terminal and a rough idea of what an HTTP
request looks like will help."* Two pieces of web-security background are then treated as known, never
defined, given no glossary row, and made load-bearing by quiz items:

| Term | Where it is load-bearing | What is assessed on it |
|---|---|---|
| **XSS** | 03 README:241 (*"the heart of Tier 4"*), 03:344–346, 05:46, 04 Q17 key, 03 Q15 key | **03 Q17's stem** requires the learner to *"address the XSS threat model explicitly"* |
| **CORS** | 02 README:177–179 (*"CORS fixed that"* — the historical justification for the implicit grant) | **02 Q18's model answer** makes CORS *the* answer to "what new requirement does the move impose" |

`grep -rn "cross-site scripting\|Cross-Origin Resource Sharing" docs/curriculum/` returns nothing, and
neither has a `GLOSSARY.md` row.

**Fix, cheapest first:** two glossary rows and three sentences each — XSS in Module 03 where the SPA storage
question is raised, CORS in Module 02 where the implicit grant's history is told. Alternatively, amend Module
00's prerequisites to name the web-security background actually assumed. The first is better: the curriculum's
own standard is that nothing appears before the problem that motivates it, and both terms have a problem
sitting right there.

**Batch with this**, since they are the same class of defect and the same fix:

| ID | Dangling term | Where |
|---|---|---|
| B-05a | `_csrf` — appears in a wire trace and three lab commands; CSRF never defined | 01 README:221, lab:110/113 |
| B-05b | `ticket` — used in a model answer; no glossary row | 01 quiz-answers:73 |
| B-05c | `sid` — named as a logout-token session identifier; mentioned only *inside* the glossary's Logout-token row | 08 README:308, 317 |
| B-05d | `claims` **request parameter** — listed among what PAR protects; defined four modules later | 05 README:24, 126 |
| B-05e | **backend-for-frontend** — recommended in three answer keys (02, 03, 05) and a live capstone option; first *defined* inside a Module 03 quiz stem; Module 05's key cites that stem as the source | 02 key:155, 03 quiz:129, 05 key:173 |
| B-05f | **attestation** — Module 02's key tags it *"Module 06"*; absent from Module 06 entirely | 02 key:143 |

Each is one glossary row, or two sentences, or a retargeted pointer.

### 5. Fix what is simply wrong: three key defects and the toolchain. *(Half a day, batched.)*

**Three answer-key defects.** These actively teach the wrong thing to a self-grading learner, which is the
only mode the curriculum offers:

| ID | Defect | Location |
|---|---|---|
| **B-07** | Module 03 Q9's key says *"A, C, and D are all variations of the same trap"* — **D is the correct answer.** Should read A, B, C | `03/quiz-answers.md`:47 |
| **B-09** | Module 06's key attributes step-up authentication (RFC 9470) to *"Module 05"*. It is Module 09a | `06/quiz-answers.md`:102 |
| **B-16** | The Final's F2 key lists four occurrences of commit-then-prove that disagree with the curriculum's own thrice-stated running count; a learner who followed the count loses marks | `final-exam-answers.md`:26–31 vs `03`:49–51, `05`:53, `09b`:282/302/553 |
| **B-12** | Module 12's key explains distractors for Q1–Q3 and not for Q4, Q5, Q9, Q10, against the standard every other module holds | `12/quiz-answers.md` |

**Toolchain drift, measured.** Only Modules **00 and 01** declare their tools (`curl`, `node`, the dashboard).
No lab from 02 onward has a Tools line. What the labs actually use:

| Tool | Where | Uses | Problem |
|---|---|---|---|
| `node -e` | labs 00–09a | 4→19 each | The declared tool. **Zero uses in 09b, 10, 11** |
| **`python3`** | labs **09b, 10, 11** | 7, 14, 10 | **A complete tool switch at 09b**, not a drift. A learner set up per Module 00 has `node` |
| **`grep -oP`** | labs 06, 07, 08, 09a, 10, 11 | 2, 4, 4, 2, 4, 3 | GNU/PCRE only — fails on stock macOS/BSD `grep` with `invalid option -- P`. First bites at Module 06 |
| **`basenc`** | lab 09b; **`exam-a-answers.md`:205** | 1 + 1 | GNU coreutils ≥ 8.31; **absent on macOS**. In 09b it is Exercise 1's second command; in Exam A it is the worked solution to A14 — **due after Module 03**, six modules before `basenc` first appears in a lab |
| `openssl` | labs 08, 09b; `exam-a-answers.md` | | Usually present; undeclared everywhere |

This is the one place where the honest answer to *"could a learner complete module N's lab without external
searching?"* is **no** — not for a knowledge reason but a toolchain one, on macOS, with error messages that
point nowhere useful.

**Fix:** either add `python3`, GNU `grep`, `basenc` and `openssl` to the setup prerequisites in the curriculum
README and Module 00's lab, or (better) rewrite the 19 `grep -oP` uses, the 31 `python3` blocks and the one
`basenc` call in `node -e`, which the first ten labs already demonstrate. A single declared toolchain is worth
more than either.

**Also batch here:** the RFC 9728 contradiction (B-08) — Module 04 README:338's live instruction, `GLOSSARY.md`:135's
*"not served (gap, Module 04)"*, and Module 05 README:410's *"still awaiting a decision"*. Three lines, one fact.

---

## Findings index

| ID | Finding | Impact |
|---|---|---|
| **B-01** | Three live statements tell the learner the four exams are unwritten; they exist and carry the closed-book assessment for capabilities 1, 3 and 5 | **Critical** |
| **B-02** | Capability 4 has no source; Module 12's traceability table asserts coverage for it **and** for capability 1 that does not exist | **Critical** |
| **B-03** | Module 04 promises *"Module 09a's MCP material"*; 09a has none. MCP and CIMD are never taught, though the repo has a full MCP surface | **Major** |
| **B-04** | XSS and CORS are load-bearing, never defined, absent from the glossary, and outside Module 00's stated prerequisites — and each is required by a quiz item or model answer | **Major** |
| **B-06** | Undeclared toolchain: only labs 00–01 declare tools; `python3` replaces `node -e` entirely at 09b; `grep -oP` in six labs; `basenc` in 09b Exercise 1 | **Major** |
| **B-13** | Two templates, switched at Module 06 with no announcement: the bridge table and wire-level HTTP are dropped for all eight later modules; the analogy is dropped at 09b | **Major** |
| **B-05** | Six dangling or mis-tagged terms: `_csrf`, `ticket`, `sid`, `claims` (request parameter), backend-for-frontend, attestation | Moderate |
| **B-07** | Module 03 Q9's answer key labels the correct answer (D) as a trap | Moderate |
| **B-08** | Module 04's Lab paragraph, `GLOSSARY.md`:135 and Module 05:410 all contradict Module 04's own statement that RFC 9728 is served | Moderate |
| **B-09** | Module 06's key attributes RFC 9470 step-up to Module 05; it is Module 09a | Moderate |
| **B-10** | Cognitive-load peaks: 02 (~52/4–5 h), 08 (~46/4–5 h), 09a (~44/5 h), 09b (~48/4 h — densest). Split points recommended in §6 | Moderate |
| **B-11** | Module 11 Q8/Q9 are Tier 1 recall labelled Tier 2, near-verbatim from README tables | Moderate |
| **B-16** | The Final's F2 key contradicts the curriculum's own thrice-stated count of the commit-then-prove pattern; following the material costs marks | Moderate |
| **B-12** | Module 12's answer key explains distractors for Q1–Q3 only, against the standard every other module holds | Minor |
| **B-14** | Module 11 is the only mechanism-bearing module with no spec-delta content; Module 10 has the content under a different heading | Minor |
| **B-15** | Module 04 retains a "Source change (done)" proposal including an un-taken *"If you decline"* branch inside the lesson | Minor |

**Two things that were checked and came back clean**, and are worth recording because they were the audit's
largest open risks:

| Checked | Result |
|---|---|
| **All 25 capstone defects against taught material** | **All 25 resolve.** The key's module attributions are accurate. #19 is the thinnest (assembled from three modules) and #5/#15/#16's severity arguments lean on undefined XSS/SSRF, but no defect is unfindable |
| **All four exam keys for model-answer overreach** | **None found**, other than B-16's count. Every model answer draws on material taught before the exam is due — a better result than the module keys achieve |

---

## Appendix A — Every item I could not answer from the material

Attempting each module's quiz using only Modules 00–N, and the exams using everything. Out of roughly 250
quiz items and 57 exam items, **one** was not answerable from the material as taught:

| Item | Why | Class |
|---|---|---|
| **02 Q18** (Tier 4), the *"new requirement"* half | The model answer is **CORS**, which the module mentions twice and never defines | **Module failed to teach it** — not out of scope |

Four further items are answerable, but their **model answers** use material the modules had not supplied.
The question is answerable; only full marks against the key are not:

| Item | What the key uses that was not taught | Class |
|---|---|---|
| **02 Q17** (Tier 4) | `backend-for-frontend` as the recommended SPA mitigation | Dangling — B-05e |
| **02 Q17** (Tier 4) | *"attestation-based, Module 06"* as an iOS client-auth option | Broken forward-tag — B-05f |
| **02 Q17** (Tier 4) | `private_key_jwt` and mTLS as client-auth choices | Glossary-rescued; taught in 05/06 |
| **01 Q12** (Tier 3) | `ticket` as the name for the pending-authorization context | Dangling — B-05b |

And one item's **stem** requires untaught background:

| Item | What the stem requires | Class |
|---|---|---|
| **03 Q17** (Tier 4) | *"address the XSS threat model explicitly"* | Assumed-external, undefined — B-04 |

One exam item is answerable but **penalises the learner for following the material**:

| Item | The conflict | Class |
|---|---|---|
| **Final F2** (9 pts) | The key's four occurrences of commit-then-prove are 03/05/08/09b; the curriculum's own count, stated three times, is 02/03/05/09b | Internal contradiction — B-16 |

Three exam items reach forward and **say so inline**, as `exams/README.md` promises: **A13** (framed the way
Module 07 will teach; the reasoning is available from 02–03), **A14** (`[lab]`-marked, tools permitted), and
**B5** (the FAPI half needs Module 10 — *"skip it if you have not read that yet"*). All three are correctly
handled. A14 is nonetheless the one place the exams inherit the toolchain problem (B-06).

**All 25 of the capstone's planted defects are findable from taught material** — traced individually in §3.

**Nothing else was unanswerable, and nothing was out of scope.** That is a strong result and it is the reason
§7 contains no "the quizzes test untaught material" entry.

---

## Appendix B — Disproof commands

Every negative claim above asserts an absence. Each is disprovable with one command; all were run on
2026-08-02 and all returned empty unless noted.

```bash
cd docs/curriculum

# B-04 — XSS and CORS are never defined and have no glossary row
grep -rn "cross-site scripting\|Cross-Site Scripting" --include=*.md .        # empty
grep -rn "Cross-Origin Resource Sharing" --include=*.md .                     # empty
grep -n "XSS\|CORS" GLOSSARY.md                                               # empty

# B-05e — backend-for-frontend is never taught in a lesson
grep -rn "backend-for-frontend\|Backend-for-Frontend" modules/*/README.md GLOSSARY.md   # empty

# B-05f — attestation is absent from Module 06
grep -rn "attestation" modules/06-machine-and-delegated-grants/               # empty

# B-05b, B-05d — no glossary row for `ticket` or the `claims` request parameter
grep -n "ticket" GLOSSARY.md                                                  # empty
grep -n '^| `claims`' GLOSSARY.md                                             # empty

# B-05c — `sid` has no row of its own
grep -n '`sid`' GLOSSARY.md          # one hit, inside the Logout-token row (line 81)

# B-03 — MCP appears only in Module 04's README and SPEC-INVENTORY; CIMD only in the glossary
grep -rn "MCP" --include=*.md . | grep -v AUDIT-        # 2 hits in 04/README, 2 in SPEC-INVENTORY
grep -rln "CIMD" --include=*.md . | grep -v AUDIT-      # GLOSSARY.md only

# B-13 — measured section presence (the table in §6)
for d in modules/*/; do f="$d/README.md"; printf '%-4s %s %s %s %s\n' \
  "$(basename $d | cut -c1-3)" "$(grep -c '^## Plain-language pass' $f)" \
  "$(grep -c '^## Specification pass' $f)" "$(grep -c '^```http' $f)" \
  "$(grep -c '^## Spec delta' $f)"; done

# B-06 — toolchain, labs and exams
for f in modules/*/lab.md; do printf '%3s %3s %3s %s\n' "$(grep -c 'node -e' $f)" \
  "$(grep -c 'python3' $f)" "$(grep -c -- 'grep -oP' $f)" "$f"; done
grep -rn "basenc" modules/ exams/          # 09b lab:64 and exam-a-answers.md:205
grep -rn "Tools:" modules/*/lab.md         # 00 and 01 only

# B-16 — the curriculum's own count of commit-then-prove, versus the Final's key
grep -rn "third time\|Fourth occurrence\|fourth time\|4th time" modules/*/README.md
sed -n '24,37p' exams/final-exam-answers.md

# B-01 — the exams exist
ls exams/                                                      # 4 exams + 4 keys + README
grep -rn "not been written\|not written yet\|still unwritten" modules/ PROGRESS.md
```

---

*Pass B examined pedagogy, not facts. Where this register disagrees with a reading of the material, the
material is the evidence: every claim above cites a file and line, and every negative claim is disprovable
with a single command.*

---

## 8. Remediation — what was changed, 2026-08-02

All five recommendations were implemented. 36 files, +839 / −118 lines. Every claim below is verifiable with
the commands in §9.

### R1 — the exams (B-01)

| File | Was | Now |
|---|---|---|
| `07/README.md`:366 | *"Cumulative Exam B … has not been written yet"* | *"Sit Cumulative Exam B now"*, with its scope, length, closed-book rule, and a note that B5's FAPI half reaches forward |
| `12/README.md`:30 | *"Those are not written yet … the exams will slot in behind it as extra practice, not as a prerequisite"* | *"Sit the Final before you start this. It is a prerequisite, not extra practice"* — with the reason: the capstone is open-book by construction, the Final is not |
| `PROGRESS.md`:492 | *"The four exams are still unwritten (Stage 4)"* | Records that they were backfilled in Stage 4b, and that this section was itself corrected in Pass B |

### R2 — capability 4 (B-02, B-03)

**Built rather than dropped.** Module 09a gains **Q20**, the only item in the curriculum that hands the
learner a specification it never taught — a factual brief on **CIMD** and the **MCP authorization profile**,
with an instruction not to look them up — and asks the five placement questions the module's own frames
support: which assumption it lifts, which modules it presupposes, what breaks without it, what its status is,
and where it sits relative to DCR and `private_key_jwt`. A sixth question asks what about the brief should
have raised suspicion; the key's answer is the SSRF-by-design in dereferencing an attacker-supplied
`client_id`, which resolves to Module 06's `jku` bug.

That choice closes **B-03** at the same time: MCP was the extension Module 04 promised to a module that did
not have it, and it is now the extension that module hands you cold.

| File | Change |
|---|---|
| `09a/quiz.md` | Q20 added; header now 20 items, with a note that Q20 tests a promised capability |
| `09a/quiz-answers.md` | Q20 key (+65 lines) — one competent reading, explicitly not the only one, graded on frames rather than content |
| `09a/README.md` | Learning objective 7 added: the transferable form of objective 6 |
| `12/README.md`:144–156 | **Both false traceability rows corrected.** The table now says where each capability is *actually* tested, and states that two of the six are tested elsewhere |
| `04/README.md`:360, 370 | MCP forward reference retargeted to 09a Q20; the "if you decline" branch replaced with the decision taken |
| `README.md`:24 | The capability now names where it is drilled |

### R3 — the template merge (B-13, B-14)

| Module | Added |
|---|---|
| **08** | **Wire-level walkthrough** — the OIDC flow as HTTP, marking the two added parameters, plus the decoded ID token annotated with the validation step that checks each claim. This repairs the only hole in capability 1. **Bridge table**, 12 rows |
| **06** | **Wire-level walkthrough** — a correct delegation request, the RFC 8693 §2.2.1 response, the resulting `act`/`aud` claims, and the silent-discard response beside it. **Bridge table**, 17 rows, two of which deliberately have no reference because no specification defines them |
| **09a** | **Bridge table**, 22 rows. **Wire-level** — the JARM response beside Module 02's unprotected one |
| **09b** | **Plain-language pass** — the sealed-dossier analogy, which §3 called the costliest absence in the curriculum. **Bridge table**, 18 rows, naming the two places the analogy breaks down |
| **10, 11** | One-line notes stating that no analogy is offered **and why** — an attacker model and `GET /accounts/91848` are already the plain-language version. The omission now reads as a decision |
| **11** | **Spec delta** — the OWASP 2019 → 2023 diff the module previously gestured at, with what drove each change and three lessons that generalise past OWASP |

Measured before and after:

| Device | Before | After |
|---|---|---|
| Analogy | 00–09a (10) | 00–09b (12); 10/11 documented as deliberate |
| Bridge table | 00–05 (6) | 00–06, 08, 09a, 09b (10); 07 bridged in one line |
| Wire-level `http` | 00–05, 11 | + 06, 08, 09a |
| Spec delta | 00–09b | + 11 |

### R4 — the prerequisite debt (B-04, B-05)

Every term is now **taught in a lesson at the point the problem arises**, not just glossed:

| Term | Taught in | Glossary |
|---|---|---|
| **CORS** | `02/README.md` — a block explaining same-origin, `Access-Control-Allow-Origin` and preflight, *then* why implicit existed and why it no longer needs to. Framed as "a correct answer to a constraint that expired" | ✅ |
| **XSS** | `03/README.md` — a new section, *"The limit of all of this: XSS"*, placed immediately after the refresh-token discussion and before Tier 4 depends on it | ✅ |
| **backend-for-frontend** | `03/README.md` — its own section, with what it buys under XSS stated in exactly the terms of the section above it, and what it costs | ✅ |
| **CSRF / `_csrf`** | `01/README.md` — a note at the wire trace where `_csrf` first appears, tying it forward to `state` | ✅ |
| **`sid`** | `08/README.md` — `sub` names the person, `sid` names one of their sessions; why both are permitted and why an RP must handle either | ✅ |
| **`claims`** (request parameter) | `05/README.md` — glossed inline where PAR's protection list first names it, tagged forward to 09a | ✅ |
| **`ticket`** | Glossary only, labelled **Authlete vendor concept**; `01/quiz-answers.md` no longer uses it undefined | ✅ |
| **attestation** | `02/quiz-answers.md` — the broken "Module 06" pointer replaced with an accurate parenthetical saying it is a platform service, not an OAuth client-authentication method, and out of scope | n/a |

Module 02's Q17 key also gains a **marking note** stating that DPoP, BFFs and XSS are not yet taught at that
point and are credit rather than requirements — which is what the finding was actually about.

### R5 — the corrections (B-06 … B-16)

| ID | Fix |
|---|---|
| **B-07** | `03/quiz-answers.md`:47 — *"A, C, and D"* → *"A, B, and C"*, with which trap each belongs to |
| **B-09** | `06/quiz-answers.md`:102 — step-up reattributed from Module 05 to Module 09a |
| **B-08** | `04/README.md`:338 rewritten to describe the exercise that exists; `GLOSSARY.md`:135 now records PRM as **served**; `05/README.md`:410 marked as the proposal as it originally read |
| **B-11** | Module 11 Q8 and Q9 **rewritten as scenarios.** Q8 is now a claims-processing rule requiring a two-hop traversal, asking for the model *and the tier it is enforced in*; Q9 is a runbook exercise — two lists, and the one item no gateway could ever take over. Both keys rewritten |
| **B-12** | `12/quiz-answers.md` — distractor explanations added for Q4, Q5, Q9 and Q10. Q4's now exploits option B, which is false in an interesting way |
| **B-16** | **Renumbered to five.** Module 08 is now explicitly the fourth occurrence; 09b the fifth, with a paragraph on what grows across the set (the interval between commitment and proof, from one request to years) and why the last needs `nonce` and `aud`. `03`, `05`, `09b` counts aligned; the Final's F2 stem and key updated, and the key now accepts a defended four-item answer |
| **B-06** | **All 19 `grep -oP` uses replaced** with the portable form labs 01–03 already used, and the two `code=` extractions with the `node`/`URL` form used everywhere else. **Both `basenc` calls replaced** with `node` — and the replacements verified to reproduce RFC 9901 §4.2.3's and RFC 7636 Appendix B's own published test vectors. Tools declared in `00/lab.md` (a table covering the whole curriculum) and in `README.md`. `python3` retained in labs 09b/10/11 and now declared rather than assumed |
| — | One pre-existing rendering bug fixed: unescaped `\|\|` inside a table cell in `06/lab.md`:779 |

### Citation pass over the new material

Writing R3 and R4 introduced roughly 90 new spec references, some from recall — which is exactly what
`CLAUDE.md` forbids. Every one was subsequently checked against its primary source on **2026-08-02**. Two
were wrong.

| Claim | Verdict |
|---|---|
| **OWASP API Top 10 2019 and 2023** — all twenty titles and the ten-row mapping | ✅ **Verified** against `owasp.org/API-Security/editions/2019/` and `/2023/`. Every title verbatim, every position correct. The API3 merge is OWASP's own statement |
| The *"what drove the change"* rationales | ⚠️ **Over-claimed as OWASP's framing.** Only the API3 merge is the project's own words. Corrected: the module now separates what is citable from what is commentary |
| **JARM** `iss`/`aud`/`exp` cited as §4.1 | ❌ **Wrong — it is §2.1.** Corrected |
| **JARM** `response_mode` values cited as §4.3 | ❌ **Wrong — it is §2.3 (§2.3.1–2.3.4).** Corrected |
| **JARM** `authorization_signed_response_alg` cited as §3 | ✅ Verified |
| **CIBA Core** §7.1 (`login_hint`/`binding_message`/`user_code`), §7.3 (`auth_req_id`), §10.1 (polling) | ✅ All three verified |
| **CIBA Core** §2 for consumption/authentication device | ⚠️ Not verified — section number **removed** rather than guessed |
| **RFC 9396 §2.2** for the five common data fields | ✅ Verified |
| **CIMD** — status, mechanism, required members | ✅ Verified as `draft-ietf-oauth-client-id-metadata-document-01`, 2 Mar 2026. Q20's brief now carries the revision and date, which it should have from the start given that part 4 asks about draft discipline |
| **MCP** — OAuth 2.1 roles, RFC 9728 MUST, RFC 8707 MUST, PKCE S256, CIMD as SHOULD | ✅ Verified against revision **2025-11-25**. Three facts added that sharpen the item: authorization is **OPTIONAL** in MCP; DCR is **MAY**, retained *"for backwards compatibility"*; and MCP pins CIMD **`-00`** while the current revision is **`-01`** |
| Q20 key's SSRF claim — *"the thing that should have made you suspicious"* | ✅ **Vindicated by both sources.** CIMD has a *"Server Side Request Forgery (SSRF) Attacks"* section; MCP has *"Authorization Server Abuse Protection"* warning that a malicious client can make the AS fetch *"arbitrary URLs, such as requests to private administration endpoints."* Both now cited in the key |

Two corrections beyond the citations came out of the same pass. The Q20 key's caching point was **softened**:
CIMD does specify `SHOULD cache … respecting HTTP cache headers`, so "unbounded caching" would be a false
positive — the key now models saying *"I cannot tell from this brief"* instead. And a fourth suspicious
element was **added** (`localhost` redirect-URI impersonation, which CIMD acknowledges it cannot prevent),
because it sharpens the item's real conclusion: **CIMD authenticates the document, never the caller.**

### Cold read of the new material

The new sections were then read in sequence against what precedes them. Findings: all Q20 brief terms resolve
to Modules 01–07; Module 09b's bridge front-loads that module's vocabulary *with definitions attached*, which
is what Template A's bridges do; SSRF is expanded on first use. Two refinements applied — Modules 08 and 09b
now flag that their bridge tables cite step numbers arriving later in the same module, so a learner is not
puzzled by "step 3" before the thirteen steps exist.

### What was deliberately not done

- **No module was split.** B-10 identified load peaks in 02, 08, 09a and 09b, and §6 recommended against
  restructuring. The split points remain in §6 as guidance for anyone running this as taught sessions.
- **Module 07 keeps its one-line bridge** rather than a table. Its analogy has three elements which map onto
  the three following sections in order; a table would restate the structure the prose already gives.
- **Module 10 keeps its delta content under "Part 2 — FAPI 1.0 → 2.0"** rather than a `## Spec delta`
  heading. The content is the best in the curriculum; only the heading differs, and the heading is not the
  thing that teaches.

---

## 9. Verifying the remediation

```bash
cd docs/curriculum

# R1 — no stale exam claims anywhere
grep -rn "not been written\|not written yet\|still unwritten" modules/ PROGRESS.md   # empty

# R2 — capability 4 has a source, and the traceability table points at it
grep -n "Q20" modules/09a-interaction-extensions/quiz.md | head -3
grep -n "09a-interaction-extensions/quiz.md" modules/12-capstone/README.md

# R3 — section presence (compare against the table in §6)
for d in modules/*/; do f="$d/README.md"; printf '%-4s plain=%s bridge=%s http=%s delta=%s\n' \
  "$(basename $d | cut -c1-3)" "$(grep -c '^## Plain-language pass' $f)" \
  "$(grep -c '^## Specification pass' $f)" "$(grep -c '^```http' $f)" \
  "$(grep -c '^## Spec delta' $f)"; done

# R4 — every term now taught in a lesson AND glossed
grep -c "Cross-site scripting (XSS)"        modules/03-pkce-and-public-clients/README.md
grep -c "Cross-Origin Resource Sharing"     modules/02-oauth-core-and-threats/README.md
grep -c "backend-for-frontend (BFF)"        modules/03-pkce-and-public-clients/README.md
grep -c "cross-site request forgery (CSRF)" modules/01-the-delegation-problem/README.md
grep -cE "XSS|CORS|Cross-Site Request Forgery|Backend-for-frontend|Ticket|\`sid\`" GLOSSARY.md

# R5 — toolchain: no GNU-only tools remain
grep -rn -- "grep -oP" modules/ exams/     # empty
grep -rn "basenc"      modules/ exams/     # empty
# and the node replacements reproduce the specs' own test vectors:
node -e 'const c=require("crypto");console.log(c.createHash("sha256").update(process.argv[1],"ascii").digest("base64url"))' \
  -- 'WyJfMjZiYzRMVC1hYzZxMktJNmNCVzVlcyIsICJmYW1pbHlfbmFtZSIsICJNw7ZiaXVzIl0'
# → X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0   (RFC 9901 §4.2.3)

# B-16 — one consistent count of five
grep -rn "second appearance of\|third of five\|Fourth occurrence\|fifth time\|5th time" modules/*/README.md

# integrity: fences balanced, tables well-formed, relative links resolve
for f in $(find . -name '*.md' -not -name 'AUDIT-*'); do \
  n=$(grep -c '^```' "$f"); [ $((n % 2)) -ne 0 ] && echo "ODD: $f"; done
```

### The toolchain rewrite, verified against the live server

R5 replaced 21 commands across the labs and one exam key. Because a rewritten command that *looks* right and
silently returns nothing is worse than the GNU-only command it replaced, all three substitution forms were
executed against the running server on **2026-08-02**:

| Substitution | Sites | How it was verified | Result |
|---|---|---|---|
| `grep -oP 'name="_csrf" value="\K[^"]+'` → `grep -o … \| cut -d'"' -f4` | 16 | Both forms run against the **live login page** and their output compared | **Byte-identical** — 64-char token, same value |
| `echo "$CB" \| grep -oP 'code=\K[^&]+'` → `node -e … searchParams.get("code")` | 3 | Module 10's `flow()` driver **extracted verbatim from `lab.md`** and run end to end; the extracted code then redeemed at the token endpoint | 43-char code extracted from a real callback; **access token issued** |
| `openssl dgst … \| basenc --base64url` → `node -e … digest("base64url")` | 2 | Compared against **`scripts/sd-jwt.mjs digest`** and against **RFC 9901 §4.2.3's published vector** | **All three agree** |

The middle row is the one that mattered: it exercises both rewritten forms inside a real multi-leg flow with
a cookie jar, which is the only place the CSRF extraction can fail in a way isolated testing would miss. The
driver was extracted from the lab file with `sed` rather than retyped, so what ran is exactly what a learner
will run.

**Cost and cleanup:** roughly six Authlete calls — well inside the ~15-call window `AGENTS.md` warns about,
and nowhere near `test:e2e`, which was not run. Both access tokens minted during the test were revoked, with
`active: false` confirmed by introspection afterwards, as the labs themselves instruct.

**Still not executed:** the labs' Authlete-console-dependent exercises (Module 09a's four enablement steps,
Module 09b's VCI and federation endpoints), which need service configuration this test did not change. Those
remain `UNVERIFIED` in the labs, which is how they were already labelled.

**What this remediation did not do:** re-audit. §3's per-module findings describe the material as it was
read, and the fixes above were written against those findings rather than against a fresh cold read. A third
pass over the changed sections — particularly Module 09b's new analogy and Module 09a's Q20, both of which
are new *teaching* rather than corrections — would be the honest next step before treating the curriculum as
settled.
