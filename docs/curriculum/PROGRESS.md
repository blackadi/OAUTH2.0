# Progress Tracker

**The short version:** check off each module as you finish it, but only after you can honestly pass its
**self-assessment gate** — a plain-language "can you actually do this?" test. The gates matter more than the
checkboxes. Cumulative exams follow Modules 03, 07, and 11; a final exam precedes the capstone.

> How to grade yourself honestly: a gate is passed only if you can do it **without notes** and **explain
> why**, not just recite what. If you can describe *what* PKCE is but not *what breaks without it*, the gate
> is not passed yet.

## One-time setup

- [ ] Server running on `:3000` (`npm --prefix server run dev`)
- [ ] Dashboard running on `:3001` (`npm --prefix client run dev`)
- [ ] `docs/curriculum/scripts/curriculum.env` created and sourced
- [ ] `node docs/curriculum/scripts/decode-jwt.mjs` runs on a token you obtained

## Modules

| ✓ | Module | Self-assessment gate (do this without notes) |
|---|--------|----------------------------------------------|
| [x] | 00 · Web + JOSE | Given a raw JWT, decode it locally and explain why decoding ≠ trusting; name the three JWS parts and what each protects. |
| [x] | 01 · Delegation problem | Explain the password anti-pattern and name all six core roles + which endpoint each talks to. |
| [x] | 02 · OAuth core + threats | Draw the authorization-code flow at wire level; name two grants RFC 9700 deprecates and why. |
| [x] | 03 · PKCE + public clients | Explain the exact attack PKCE closes and why `state` doesn't close it; compute an `S256` challenge. |
| [x] | 04 · Token lifecycle + metadata | Introspect and revoke a token via `curl`; explain when to use a JWT AT vs. an opaque token. |
| [x] | 05 · Request integrity + binding | Explain what PAR, JAR, `iss`, mTLS, and DPoP each protect; reproduce the `ath`-vs-`sub` DPoP failure. |
| [x] | 06 · Machine + delegated grants | Choose a grant for a daemon; explain why a client-credentials token has no `sub`; given a token-exchange response, say whether you got impersonation or delegation and what a correct response would have contained. |
| [x] | 07 · OAuth 2.1 + Security BCP | Audit a deployment against RFC 9700 §2 from three sources and write findings with evidence, severity, and a defensible remediation order; state precisely what OAuth 2.1 does and does not do. |
| [x] | 08 · OIDC Core + logout | Explain why an access token doesn't authenticate a user and describe token substitution concretely; run all 13 OIDC Core §3.1.3.7 steps on a real ID token; `nonce` vs. `state`; name the four logout specs and what each cannot reach. |
| [x] | 09a · Interaction extensions | Name the four assumptions these extensions lift; explain what JARM adds over `state`/PAR/JAR and its three mandatory claims; pick poll/ping/push and defend it; write an RFC 9470 challenge and say what breaks without `acr_values`; judge RAR vs scopes. |
| [x] | 09b · Identity + credentials | Compute an SD-JWT digest that matches RFC 9901's own test vector; explain why the salt is load-bearing; strip a KB-JWT and say which verifier accepts it and why; name the one unlinkability property SD-JWT cannot provide; place OID4VCI/VP and federation in the graph. |
| [x] | 10 · FAPI + grant management | Name all six FAPI 2.0 attackers and four things the model puts out of scope; explain why FAPI 2.0 says an AS *shall not* rotate refresh tokens, and name the exception; show a deployment where every mechanism is supported and none required; run the grant lifecycle and say what a revocation does **not** revoke. |
| [x] | 11 · API security beyond the token | Find a BOLA in a code snippet and say why a valid token cannot stop it; name the three OWASP 2023 authorization failures and what the attacker changes in each; choose RBAC/ABAC/ReBAC and defend it; say what a gateway cannot enforce; write a regression test with its control assertion. |
| [x] | 12 · Capstone | Design a high-assurance multi-tenant authZ architecture, defending nine decisions against a **named** attacker model with an honest limitations section; then find **25** planted defects in the vulnerable variant, sever them correctly, and defend a remediation order — scoring 85+ on the rubric. |

## Assessment gates

- [ ] **[Cumulative Exam A](exams/exam-a.md)** (after Module 03) — foundations through PKCE · 15 items, 90 min
- [ ] **[Cumulative Exam B](exams/exam-b.md)** (after Module 07) — OAuth 2.0 complete, hardened, consolidated · 15 items, 2 h
- [ ] **[Cumulative Exam C](exams/exam-c.md)** (after Module 11) — OIDC, extensions, credentials, FAPI, API security · 15 items, 2 h
- [ ] **[Final Exam](exams/final-exam.md)** (before Module 12) — everything, almost all synthesis · 12 items, 2–3 h
- [ ] **[Capstone](modules/12-capstone/README.md)** — design + adversarial review, graded against the rubric

## Quiz tiers (what "passing" means)

Each module quiz has 15–20 items across four tiers. You have passed a module when you can:

- **Tier 1 — Recall:** name the roles, endpoints, parameters, and which spec defines what.
- **Tier 2 — Applied reasoning:** choose the right flow/grant/client-auth for a scenario and justify it.
- **Tier 3 — Trace & diagnose:** find the defect in a real HTTP exchange, log, Authlete flag, or code snippet.
- **Tier 4 — Adversarial & design:** exploit a misconfiguration or defend a design against a named attacker
  model. **Do not advance until you can pass Tier 4** — it is the whole point.

---

_The definition of done for the entire curriculum is at the bottom of [README.md](README.md). Measure yourself
against it before calling the capstone complete._

---

## Build Log (resume state for a fresh session)

> This section is the author's build tracker, not learner content. A fresh session should read it to know
> exactly what is written, what was verified, and what is still open. Newest entry first. Modules are written
> one per turn in order (00 → 12, with 09a/09b). Plan file:
> `/home/blackadi/.claude/plans/playful-stargazing-hoare.md`.

### Stage / module status

- [x] Stage 1 — plan (approved)
- [x] Stage 2 — scaffold + top-level docs (README, SPEC-INVENTORY, GLOSSARY, PROGRESS, scripts) — committed
- [x] **Module 00 — Web + JOSE Foundations** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 01 — The Delegation Problem** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 02 — OAuth Core + Threats** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 03 — PKCE + Public Clients** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 04 — Token Lifecycle + Metadata** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 05 — Request Integrity + Binding** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 06 — Machine + Delegated Grants** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 07 — OAuth 2.1 + the Security BCP** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 08 — OIDC Core + Logout** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 09a — Interaction Extensions** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 09b — Identity + Credentials** — README, lab, quiz, quiz-answers + `scripts/sd-jwt.mjs` written & committed
- [x] **Module 10 — FAPI + Grant Management** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 11 — API Security Beyond the Token** — README, lab, quiz, quiz-answers written & committed
- [x] **Module 12 — Capstone** — README (brief + rubric), lab (Aurora brief + Meridian vulnerable variant), quiz, quiz-answers written & committed
- [x] **STAGE 3 COMPLETE** — all 14 modules written, verified and committed
- [x] **Stage 4a — consistency pass** — run, 2 real errors found and fixed (see below)
- [x] **Stage 4b — the four exams written** (A, B, C, Final) under `exams/`, each with an answer key
- [x] **STAGE 4 COMPLETE — the curriculum is finished.**
- [x] **2026-08-04 — Module 05's Tier-3 finding fixed in the server; Exercise 5 rewritten** (below)
- [x] **2026-08-04 — signed JAR unblocked; Module 05 Exercise 2 rewritten around it** (below)
- [x] **2026-08-06 — the SDK 1.0.0 pin fixed Module 06's gate premise; Exercise 6 rebuilt** (below)
- [x] **2026-08-10 — RFC conformance audit (Phases 0–2 + Phase 3a); two exploitable S1s fixed; Module 08 Ex 6b rewritten** (below)
- [x] **2026-08-11 — Gate 4 approved; Phase 5 began. T0-1: the token and revocation endpoints stopped logging request bodies** (below)
- [x] **2026-08-11 — T0-5 + T0-6 (audit hygiene, 21 drifted citations); T0-2: `id_token_hint` is verified, not decoded** (below)
- [x] **2026-08-12 — T0-3: RP-Initiated Logout became two requests; Module 08 Ex 6b reframed around it** (below)
- [x] **2026-08-12 — T0-4: §3 per-client matching, and the Authlete field that does not exist. TIER 0 COMPLETE** (below)
- [x] **2026-08-12 — T1-1: both introspection endpoints protected; the last easily-exploitable S1 is closed** (below)
- [x] **2026-08-12 — T1-7: `prompt=none` answers properly, and the latent step-up S1 is retired** (below)
- [x] **2026-08-12 — T1-2 + T1-3: one RSA key and one `private_key_jwt` client; three specs unblocked, no code changed** (below)
- [x] **2026-08-12 — T1-4 + T1-6: four Module 09a markers retired; the 24-hour lifetime kept on purpose** (below)
- [x] **2026-08-12 — T1-5: `service.get()` works after six days down; T1-13 has no knob to turn** (below)
- [x] **2026-08-12 — B1-W6: the refresh flow reissues ID tokens again, via the API that exists for it** (below)
- [x] **2026-08-12 — T1-17: five unprobed behaviours, five answers, and no code owed** (below)
- [x] **2026-08-13 — T1-9 + T1-10 + 6749-W1: grant management became a real protected resource** (below)
- [x] **2026-08-13 — B1-W1 + B1-W2 + MS-W1: a debugging endpoint stopped handing out tickets** (below)
- [x] **2026-08-13 — T1-14 + T1-15: back-channel logout logged nobody out** (below)
- [x] **2026-08-13 — T1-16 + T1-18: one line, an honest 500, and a work item that could not do what it said** (below)
- [x] **2026-08-13 — T1-20 + the three S1 residues: CIBA could not authenticate its recommended client, and CI was not checking the client at all** (below)
- [x] **2026-08-13 — PKCE is enforced; the last open S1 is closed** (below)
- [x] **2026-08-13 — the two process findings became mechanisms** (below)
- [x] **2026-08-13 — the route-coverage backlog reached zero, and the checker was counting comments** (below)
- [x] **2026-08-13 — VCI-W5: the deferred credential endpoint authenticates somebody now** (below)
- [x] **2026-08-14 — P0, P1, T1-19 batch 1, FAPI2-W4: a fail-open default, and the wrong Authlete service** (below, backfilled)
- [x] **2026-08-14 — T1-19 batch 2 (FAPI1-W2, ATTR-W1, BCL-W6): and the SDK's two models do not agree** (below)
- [x] **2026-08-14 — T1-19 batch 3 (B1-W3, 9068-W2, 9101-W5): T1-19 closes; two criteria under-counted their own defect** (below)
- [x] **2026-08-14 — the P1 configuration changes had broken three labs, and the grep rule could not have caught it** (below)
- [x] **2026-08-14 — T1-11 + CU-W2: four endpoints stopped speaking the vendor's shape, and an admin PATCH stopped clearing what it did not name** (below)
- [x] **2026-08-14 — T2-1: the nine tutorials adopt the `UNVERIFIED` convention, and four of the audit's own "unreproducible" verdicts turned out to be stale** (below)
- [x] **2026-08-14 — T2-11: the step-up challenge is a 401, in all five places it is drawn — one of which nobody had checked** (below)
- [x] **2026-08-14 — T2-4 + T2-12: TLS 1.3 has a new RFC number, and Module 10's missing conformance row is PARTIAL rather than FAIL** (below)
- [x] **2026-08-14 — VCI-W6 closed: the credential issuer has a key, and Module 09b Ex 7 is a three-state exercise now** (below)
- [x] **2026-08-14 — T2-8: two of theme 2's four features were missing from README's tables entirely** (below)
- [x] **2026-08-14 — T2-10: three of the audit's own replacement line numbers had drifted again before anyone applied them** (below)
- [x] **2026-08-14 — T2-15: theme 3 stated honestly — PAR is conformant on the way out and not on the way in** (below)
- [x] **2026-08-14 — T2-16: the vendor features, and a fourth capability state that runs backwards** (below)
- [x] **2026-08-14 — T2-14: the audit's last two fetches, and both went against the audit** (below)
- [x] **2026-08-14 — CU-W1 proven: Authlete REPLACES, and the defect was never data loss** (below)

### 2026-08-14 — CU-W1: merge or replace, settled on a throwaway client

**Why this matters to a future session:** this was the audit's last unproven premise about Authlete, and the
answer changes what the `CLIENT-UPDATE-FIELD-LOSS` finding *is*.

**Method.** `client/create` a throwaway with 15 distinctive fields, read back what Authlete actually **stored**
(not what was sent), `client/update` with a body carrying **only `clientId` and a changed `clientName`**, read
back, diff, delete. **`0` of 15 fields survived unchanged.**

Twelve cleared or zeroed — `grantTypes`, `responseTypes`, `redirectUris`, `contacts`, `description`,
`applicationType`, `tosUri`, `policyUri` → absent; `pkceRequired`, `pkceS256Required`, `parRequired` → `false`;
`defaultMaxAge` → `0`. **The other two are the finding**: they reset not to empty but to Authlete's **non-empty
defaults**.

| Field | Was | After an update that omitted it |
|---|---|---|
| **`tokenAuthMethod`** | `CLIENT_SECRET_BASIC` | **`NONE`** — the client stops authenticating at all |
| `idTokenSignAlg` | `ES256` | `RS256` |

> ### The defect was never "data loss", and every document describing it said so
>
> `AGENTS.md`, this file and the finding entry all called it *"silently clears the rest"*. **The accurate
> phrasing is "resets to defaults — and for client authentication the default is the weakest available value."**
> Before CU-W2 shipped, **renaming a client through the admin surface could have converted a confidential client
> into one requiring no client authentication, withdrawn its PKCE requirement, and answered `200`** with nothing
> in the log. That is an authentication downgrade performed by an unrelated edit, not a support ticket.
>
> It is also the strongest possible argument for CU-W2's read-modify-write — worth recording even though the
> code was already correct under **either** answer, which is why CU-W2 correctly did not wait for this probe.

**Two process notes.** Authlete's `client/delete` requires the **`DELETE`** method: a `POST` returns **405**, and
the probe's first cleanup attempt failed on exactly that, leaving the throwaway client alive until a second pass
removed it (`DELETE` → `204`, then `client/get` → `404 [A001212]`). **Verify a cleanup ran; do not assume it
did** — the same class of mistake as reading a status code instead of a body. And all four real clients were
re-listed afterwards and are identical to the pre-probe snapshot.

**Verification.** No source change — 1081 server tests / 73 files unchanged. The service holds four clients, as
before.

### 2026-08-14 — T2-14: the last two fetches, and a misquotation nobody had noticed

**Why this matters to a future session: the audit's fetch budget is spent.** `RESUME.md` recorded *"two fetches
remain in the whole audit."* Both were made, and **both contradicted the audit rather than the curriculum**:

| Fetch | Result |
|---|---|
| **RFC 9101 §10.1** | *"Choice of Algorithms"* — and it carries **verbatim** the MUST-be-signed sentence Module 05 attributes to it. The Phase 2 entry had mapped that requirement to §6.2, *"JWS-Signed Request Object"*, which is a validation rule for a server *receiving* an object. Both sections are real; Module 05 cites the one carrying its quote. §10.8 *"Cross-JWT Confusion"* exists, settling a second claim |
| **RFC 8252 §7.3** | *"Loopback Interface Redirection"*, and the obligation is a **MUST**: *"The authorization server MUST allow any port to be specified at the time of the request for loopback IP redirect URIs…"* The finding's own reasoning had said the AS **"should"** treat the port as variable — an understatement of a MUST, in an entry whose whole verdict rests on that one obligation. `IMPLEMENTED_VERIFIED` stands and is stronger |

> ### A by-product neither item predicted, and it is the best find in the batch
>
> Asking the same RFC 9101 document *where the precedence rule actually lives* established three things at once:
> it is **§6.3** (*Request Parameter Assembly and Validation*), not §5; the phrase occurs **exactly once** in the
> whole document; and **the repo's quotation carried an extra word** — the RFC reads *"the parameters in the
> Request Object"*, and Module 05 had *"the parameters **included** in the Request Object"*.
>
> **Module 05's lab had it right and its README did not.** The lesson and the lab disagreed for a fortnight, and
> the lab was correct — the fifth time in this audit that the curriculum beat the audit's own reasoning, and
> again in a place where the audit worked from an earlier fetch list while the curriculum had read the document.
>
> The mnemonic now in the README: **§5 is where a request is *passed*; §6.3 is where the server *assembles and
> validates* it** — which is the only place a precedence rule could live. That makes the right section memorable
> instead of arbitrary.

**Two items reached files their criteria could not have named.** 9470-W4's code comments include
`utils/step-up.ts`, which **T1-7 created** after the item was written. Both of its code edits are
**comment-only**, so `session.controller.ts`'s plan-mode requirement does not apply — `CLAUDE.md` exempts a
semantics-free edit, and a citation in a comment is exactly that. The old numbers were wrong for a reason worth
keeping: **§2 is *Protocol Overview*, narrative with nothing to check against, and §3 is the challenge — a
message this code never sends.** Citing §3 for a *check* is the same AS/RS conflation T2-11 fixed, one layer down.

> **9449-W5 is the one with a live consequence.** RFC 9449 **§8 gives the AS `400 use_dpop_nonce`**; **§9 gives a
> resource server `401`**. `AGENTS.md` documented **401 for both**. A client that retries only on a 401 never
> retries at the token endpoint — so the wrong status does not mislabel the error, **it stops the nonce dance
> from ever starting.** Also corrected: a stale or mismatched nonce is refused with `use_dpop_nonce`, not
> `invalid_dpop_proof`. None of it is exercisable here — `dpopNonceRequired` is `false` — and the bullet now
> says so rather than reading as an observation.

Also landed: the Native SSO **two dates** (text 16 Jan 2025, approved 2025-10-17) with the reason both are
needed; **RFC 9440** named in Module 05's mTLS revisit trigger, with what its *Informational* status means — it
standardises the header, not any obligation to trust it, and §4 requires the origin to accept it only from a
proxy it authenticates; and the **six** attacker archetypes corrected in the audit's own entry, where the prose
said five while its table listed six and Module 10 had it right.

**Verification.** `typecheck` clean, 1081 server tests / 73 files, 109 client / 16, `check-docs` clean across
166 files. The only source changes are two comments.

### 2026-08-14 — T2-16: the vendor-feature pass, and *accepted but unadvertisable*

**Why this matters to a future session:** three things this repo implements are **Authlete features that no
specification defines** — Hardware Security Keys, parameterized scopes, and scope/client `attributes`. A
specification inventory that omits them is dishonest, and one that lists them like RFCs is worse. They now sit in
their own `SPEC-INVENTORY.md` section, *Vendor features — implemented here, defined by no specification*, which
states the reason they belong there at all: **the most useful thing to know about each is that there is no RFC to
check it against** — no interoperability guarantee, no second implementation, no normative text to appeal to.

`docs/API.md` gains the four **HSK** endpoints (shapes, required-vs-optional fields, action→status, admin auth
that fails closed) with `DELETE` in a ⚠️ box making a point the work item did not: **deleting a handle is not
deleting a key** — the key material lives in the HSM and this API never sees it, which is the whole reason for
the indirection. Plus the **`attributes`** shape with *two* vendor-assigned keys rather than one (`regex` on a
scope, and `fapi2=sp`, the second being the one `FAPI-TUTORIAL.md` Part 3 already depends on), the advice to
**prefix your own keys**, and a two-row table naming exactly what *no scope-management endpoint* blocks.

> ### The interesting half: Module 09a's taxonomy needed a fourth state, and it runs the other way
>
> The three it had — *supported but not required*, *permitted but not configured*, *advertised but unusable* —
> all describe a capability that **is listed** and delivers less than the listing implies. **Parameterized
> scopes are the inverse.** Authlete accepts `payment:123.50` against a scope registered with a `regex`
> attribute of `payment:.*`, and returns the granted value in a `dynamicScopes` field. The feature works. But
> `scopes_supported` can only list **literal strings** — there is no metadata member for a pattern.
>
> | State | The listing says | The reality is | Misreading it costs |
> |---|---|---|---|
> | supported but not required | available | available, and optional | a security finding you called a pass |
> | permitted but not configured | available | unavailable | an afternoon debugging your own request |
> | advertised but unusable | available | unavailable, and the AS said otherwise | trust in the metadata |
> | **accepted but unadvertisable** | **absent** | **available** | **a capability you never knew you had** |
>
> **So a client that discovers this AS correctly can never use the feature, and a client that hardcodes
> `payment:123.50` can** — the exact inverse of the advice every other module gives. And in a capability matrix
> it does not look like a green tick; **it looks like the feature is absent.** The last column is what makes the
> four legible as one taxonomy rather than four observations.
>
> This repo cannot demonstrate it — no scope-management endpoint, so scopes are console-only — and **that
> limitation is itself an instance of the same shape**: a feature the vendor supports, the documentation
> describes, and the deployment cannot reach.

**One deliberate departure.** HSK-W2 asked for a separate `docs/` page and did not get one: a page for four
endpoints nothing else in the repo consumes would be prose in search of a reader. Promote it if HSK ever gains a
consumer.

**Verification.** Documentation only — 1081 server tests / 73 files, 109 client / 16, `check-docs` clean across
166 files, route coverage 92 with an empty baseline.

### 2026-08-14 — T2-15: the wire-format gaps, stated until Tier 3 closes them

**Why this matters to a future session:** theme 3 of the audit is *"Authlete's envelope crossing the boundary"* —
PAR, CIBA and the device flow speak the vendor's shape on endpoints that advertise an RFC. T1-11 closed the
**response** half at PAR and Device on 2026-08-14. The **request** half is deferred, deliberately, so the honest
interim is to say so where a learner will read it. The tutorial halves shipped with T2-1; this is the rest.

**Module 05 gains a four-row table**, and the pattern in it is the point:

| | Status |
|---|---|
| PAR **response** | ✅ RFC 9126 §2.2's body exactly, since 2026-08-14 |
| PAR **request** | ❌ not §2's wire format — JSON with an Authlete-shaped `parameters` field; a conformant request gets `400 Missing required body field: parameters` |
| JAR **by value** | ✅ runs, and **asymmetrically** — `2176571218` has `requestSignAlg: ES256` + a JWK Set |
| JAR **by reference** | ❌ no client registers a `requestUris` entry, and `require_request_uri_registration` is in force |

> **An endpoint can be conformant on the way out and non-conformant on the way in**, and reading only the
> response tells you nothing about whether a conformant client could have reached it. That is the generalisation
> worth carrying out of theme 3, and it applies identically at CIBA and the device flow.

**Two of the five criteria were stale.** **9101-W4** said *"object signing symmetric-only until W3"* — but W3
shipped on 2026-08-12, so JAR by value now validates an **ES256** request object against a real registered key;
only by reference is unavailable. And **8628-W5** had already been closed by DR-11. The table also adds a
distinction no item asked for: **JAR's §5.2 `request_uri` is a different artefact from PAR's** — the client hosts
one, the AS mints the other.

**`AGENTS.md`'s CIBA paragraph** now states both departures — §7.1's form-encoded request, §7.3's `auth_req_id`
from the backchannel endpoint itself rather than a `ticket` plus a second call — and cross-references PAR and
Device, so theme 3 reads as one systemic finding rather than three unrelated notes.

> **7592-W3 is the sharpest of the five.** Every RFC 7592 *operation* is reachable and **none of its HTTP
> surface is**: no per-registration client configuration endpoint, no `GET`/`PUT`/`DELETE`, no
> `registration_client_uri`; four `POST` routes taking the registration access token in a JSON body instead. It
> sits beside the RFC 7591 half that **was** fixed the same week, which makes the pair easy to misread as
> finished — so `SPEC-INVENTORY.md` now says both: **the body is conformant, the endpoint is not.**

**Verification.** Documentation only — 1081 server tests / 73 files, 109 client / 16, `check-docs` clean across
166 files.

### 2026-08-14 — T2-10: the stale line numbers, and the corrections that went stale too

**Why this matters to a future session:** the plan's note on this item read *"prefer anchoring on the ⚠️ comment
text — these have drifted once already."* That was the finding, not a stylistic preference. **Three of the
bundle's replacement numbers had drifted a second time before anyone applied them:**

| The audit's correction | Actual, 2026-08-14 | Why it moved |
|---|---|---|
| `parseBearerError` at `introspection.controller.ts:20-36` | **`:45`** | T1-1's auth gate and the DPoP-nonce relay grew the file |
| the RFC 9470 branch at `:81-97` | **`case "FORBIDDEN"` at `:142-167`** | same |
| `ParSection.tsx:43` (the PKCE write) | **`:41`**, read back at `:34` | the component shifted by two lines |

So every reference fixed here carries a **content anchor** alongside the number — *"the `tokenCreateRequest`
literal"*, *"the `case \"FORBIDDEN\"` branch"*, *"under the ⚠️ comment naming §2.2.1"*. A `path:line` pointer
rots; a quoted comment does not.

**What landed:** the three token-exchange handler refs (`:47-52`, `:69-76`, `:32`) in `AGENTS.md`,
`TOKEN-EXCHANGE-TUTORIAL.md` ×2 and Module 06's lab ×2 — and Module 06's *"read those six lines"* becomes
**"read the create-request literal"**, because *six lines* was counting the ⚠️ comment the old number pointed
at. The introspection refs in `AGENTS.md`, Module 09a's lab and — a site no work item named — the step-up
tutorial's appendix, which cited `:114`, the **validation-error** branch. And Module 03's `ParSection.tsx` ref.

> **Two closures worth the detail.** **CUR-3c-W12 was closed by deleting its line numbers, not correcting
> them**: T2-1 and T2-11 had already invalidated the replacements (`:391`, `:182-183`) the week they were
> written, so seven tutorial citations across two findings now name a **section** — *"Part 5 → What the client
> learns"*. That is `audit/04-remediation-plan.md` §6.3's option (b), applied to findings rather than to this
> file. **CUR-3b-W4 was already satisfied, by deletion**: Module 05 carries no `dpop.service.ts:NNN` reference
> at all any more, which is more durable than renumbering a file that had already drifted twice.
>
> `03-curriculum-audit.md`'s copies of the wrong numbers were **deliberately left** — they quote them *as* the
> defect, the same reason `check-docs.mjs` needs a `PATHS_DISCUSSED_NOT_REFERENCED` list.

**Two rules for anyone doing this again:** *never cite a line number in a file you are actively rewriting*, and
*when a work item hands you a replacement number, re-derive it* — three of five here were wrong.

**Verification.** Documentation only — 1081 server tests / 73 files, 109 client / 16, `check-docs` clean across
166 files.

### 2026-08-14 — T2-8: the claimed-working/flag-off table, and the drift nobody was watching

**Why this matters to a future session:** theme 2 of the audit was *"four features claimed as working while
their service flag is off"* — Native SSO, FAPI 2.0, verifiable credentials, MCP/CIMD — recorded as **one**
systemic defect rather than four documentation slips, because nothing in the build, the tests or
`check-docs.mjs` can see a service flag.

**By the time the item was executed, two of the four had been switched on** (VCI via DR-03 + VCI-W6, CIMD via
DR-05) — so the live defect had inverted. It was no longer a false claim but **an absent one: `README.md` had
no VCI row and no MCP row at all.** *A feature missing from the table cannot be caught by re-reading the
table*, which is why this direction of drift survived a documentation pass that fixed the other two rows.

Both rows added, with the qualifications that make them honest rather than green:

| Row | Status |
|---|---|
| Verifiable Credentials (OID4VCI) | **Working** — flag on, credential issuer has a JWK Set, three discovery endpoints answer. **Issuance is not exercised**: it needs a wallet, and this repo does not contain one |
| MCP / CIMD | **Partial** — CIMD works (`clientIdMetadataDocumentSupported: true`). **MCP end to end does not**: OAuth 2.1's first MUST is that the AS reject `implicit` and `password`, both enabled here deliberately, and there is no `registration_endpoint` in the discovery document |

> ### The deliverable is the derivation, not the rows
>
> A note under the table names the five service fields every status depends on, gives the **read-only** command
> that prints them, and records the captured values with a date. Three details in that command are deliberate:
>
> - **It was run before being published**, and prints exactly the values the prose quotes. The first draft
>   printed Python's `False`/`True` while the prose said `false`/`true` — a mismatch a careful reader would
>   have caught and a sloppy one would have copied. `json.dumps` fixed it.
> - **It prints `<set>` rather than `credentialJwks` itself**, because that field holds a private scalar. A
>   diagnostic command in a public README should not teach people to `echo` their signing key.
> - **It is not a CI check**, on purpose. A service configuration change is not a reason to fail somebody's
>   pull request — the same argument that puts external link checking on a weekly schedule rather than per
>   push. `audit/04-remediation-plan.md` §7.3's scheduled discovery-diff check is the right mechanism and is
>   **still unbuilt**; it remains the only proposal in that plan that would have caught a defect *before* the
>   audit did.

**Verification.** Documentation only — 1081 server tests / 73 files, 109 client / 16, `check-docs` clean across
166 files.

### 2026-08-14 — VCI-W6: the credential-issuer JWK Set, verified rather than assumed

**Why this matters to a future session:** this was the last configuration gap standing between the deployment
and end-to-end credential issuance, and it was carried as *"blocked, needs the operator."* The operator set
`credentialJwks` on service `3693555522` — one EC P-256 key, `kid: vc-issuer-1`, `alg: ES256`. **All three
checks the resume file was carrying as owed now pass**, probed live against the deployment:

| Check | Before | Now |
|---|---|---|
| `GET /api/vci/jwks` | **500** `[A403201]` | **200** |
| `GET /api/vci/jwtissuer` | **500** `[A417202]` | **200** — same key set, wrapped in an `issuer` |
| only the **public** half published | n/a | ✅ members `alg,crv,kid,kty,use,x,y` — **`d` absent on both** |

> ### The third check is the one that needed doing properly, and a 200 could not make it
>
> **The stored service value contains the private scalar `d`** — it has to, because the issuer signs with it.
> Authlete strips it on the way out. But a credential-issuer JWKS endpoint that *echoed* `d` would publish the
> key every credential it ever signs is verified against, **and would still answer `200`**. So the check is to
> parse the body and assert on `d`/`p`/`q`/`dp`/`dq`/`qi`/`k`, which is what was done. Same rule this repo keeps
> paying for: **a status code is not evidence about the body.**

**The configuration-change grep rule earned its keep.** A flag has no symptom string, so `AGENTS.md`'s three
searches were run instead — the field name (`credentialJwks`), the vocabulary of it being off, and **the vendor
result codes that only occur while it is off** (`A403201`, `A417202`). The third found every affected line:
Module 09b's lab in eight places, its README status row, a `SPEC-INVENTORY.md` row, and four audit files. **The
symptom grep would have found nothing**, because the strings that changed were the ones that existed *because
the key was missing*.

**Module 09b Exercise 7 was rebuilt a second time, and is better again — the third time a fix has improved a
lab rather than retiring one.** The two-state *"enabling a feature is not the same as configuring it"* lesson
becomes **three dated states of the same three endpoints**:

```
feature off      ->  A364301 / A416301 / A402301   all NOT_FOUND              "VCI is off"
flag on, no key  ->  A403201 / A417202             INTERNAL_SERVER_ERROR      "no signing key"
key set          ->  200                                                      publishes the public half
```

**Each transition names a different missing value**, which is the concrete argument for reading vendor result
codes instead of HTTP statuses: pattern-matching on the status would have read "broken, broken, fixed" and
learned nothing. The tagline gains its third clause — *…and configuring it is not the same as configuring it
safely* — and the exercise now includes the private-member check as a step the learner runs.

Two smaller consequences worth keeping. The exercise's probe loop now prints the **same** value for all three
endpoints, so the lab says so: **a probe that cannot distinguish its inputs has stopped being a measurement.**
And the loop's own history is now the teaching point — it has been rewritten twice, once because `metadata`
started returning a document with no `resultCode` (raising `KeyError`), once because the other two joined it.

> **Closing the gap improved a diagnosis instead of deleting one.** The `UNVERIFIED` marker on *issuing an
> actual credential* used to blame the missing JWK Set — and that was **hiding the fact that nothing else was
> missing.** Issuance now needs only a **wallet this repo does not contain**. *"Runnable, with a client we do
> not have"* is a weaker claim than *"blocked by configuration"* and a far more useful one: it tells a reader
> what to build rather than what to switch on. **A blocked marker hides everything behind it.**

**Verification.** Documentation only — 1081 server tests / 73 files, 109 client / 16, `check-docs` clean across
166 files. The Authlete write was the operator's; this session's calls were all reads.

### 2026-08-14 — T2-4 and T2-12: two citation corrections, both against the audit's own criteria

**T2-4 — the TLS reconciliation.** Phase 4 §2.1's four fetches (2026-08-11) are now applied to Module 00.
Its two TLS citations lead with **RFC 9846 (Jul 2026)** and name RFC 8446 (Aug 2018) as the superseded number
most readers will recognise; RFC 9110 is sharpened to **Internet Standard, STD 97**. The edit comes with a note
that teaches the distinction instead of just making it: **the wire protocol did not change** — RFC 9846 is
`rfc8446bis`, same version number, backward compatible — so a document citing RFC 8446 is not wrong about TLS,
only about which document to point at. *Obsolescence lives in the Datatracker metadata, not in the RFC text*,
and a 2018 document cannot carry a forward reference to a 2026 one.

> **`SPEC-INVENTORY.md`'s TLS rows were correct and were left alone, as the item instructed — but its RFC 9864
> annotation was wrong twice, and this item is how that surfaced.** The date read **Oct 2025** against §2.1's
> verified **Dec 2025**, and the scope read *"updates RFC 7518"* where the header block says **7518, 8037 and
> 9053**. RFC 9864 now has a row of its own. **A date carried from recall, in the one file whose entire job is
> citation provenance** — exactly the defect that file exists to prevent, and a direct argument for T2-5's
> per-row *"URL fetched + header line read"* discipline. `alg: "none"` is not polymorphic, so Module 00's
> citation of RFC 7518 §3.6 stands unchanged.

**T2-12 — and its acceptance criteria were stale twice over.** The criterion said Module 10's missing
§5.3.2.1 row should read **FAIL**. It was already wrong when written — Phase 4 §2.2 had recorded `ES256` as
advertised — and became more wrong on 2026-08-12, when T1-2's single RSA key added **`PS256`**. The live list
is ten algorithms carrying **both** algorithms the profile permits:

```
id_token_signing_alg_values_supported =
  [PS384, RS384, HS256, HS512, ES256, RS256, HS384, PS256, PS512, RS512]
```

**So the service-level list cannot settle the row at all**, because `idTokenSignAlg` is pinned **per client**:
`ES256` on `4277838306`, `1678274156` and `2176571218`, and **`HS256` on `1523514379`** — the confidential
client the labs run on, using a symmetric algorithm that appears nowhere in the profile. The verdict is
**PARTIAL**.

> **The finding is better than the row it corrects: a conformance report written from discovery metadata alone
> scores this PASS.** So `lab.md`'s Exercise 7 now names **PARTIAL** and **NOT REACHABLE** as verdicts distinct
> from NOT EVIDENCED — *partial* means some principals satisfy it and others do not, *not reachable* means this
> configuration admits no measurement either way (§5.3.2.1 row 7, a requirement about a pushed request's
> contents on a service where PAR is optional), *not evidenced* means a measurement exists and you did not make
> it. Picking the wrong one is itself a reporting error.
>
> **The habit: ask which principal each `shall` binds.** Roughly half of §5.3.2's bind the **AS** (metadata,
> code lifetime, `iss`); the rest bind a **client configuration** (`tokenAuthMethod`, `pkceRequired`,
> `dpopRequired`, `idTokenSignAlg`). `/.well-known` answers only the first kind, and one `client/get/list`
> answers the second.

**And the evidence was already in the curriculum, unjoined.** `modules/05…/lab.md` explains that its Exercise 5
needs the confidential client because *"this service signs ID tokens with HS256, and Authlete refuses a
symmetric algorithm for a public client."* Module 05 had the algorithm, Module 10 had the requirement, and no
document put them in one sentence — in the module whose deliverable is a conformance report.

**Verification.** Documentation only; suites unchanged at 1081/73 and 109/16, `check-docs` clean across 166 files.

### 2026-08-14 — T2-11: the step-up challenge status, and a fifth carrier

**Why this matters to a future session:** step-up authentication is a challenge/response protocol, and **most
client libraries only inspect `WWW-Authenticate` on a 401**. Publish the challenge as 403 and a conformant
client never parses it, never learns `acr_values`, and never re-authorizes — the loop *never starts*, and the
user sees an unexplained failure instead of a re-authentication prompt. RFC 9470 §3's two examples are both
`401 Unauthorized` and the section never mentions 403; RFC 6750 §3.1 already assigns 403 to
`insufficient_scope`, while `insufficient_user_authentication` is about the authentication itself.

**No code changed, and the finding said so.** `introspection.controller.ts` answers this case with **403**, and
that is defensible: it is the **AS → resource server** introspection response, where Authlete's action is
`FORBIDDEN`. §3's challenge is the **resource server → client** response — and this repo implements no
resource server, so it never sends one. **The defect was always the conflation**, not the status code.

`STEP-UP-AUTH-TUTORIAL.md` Part 5 now opens with a two-participant diagram and a six-row table separating
**Response 1** (AS→RS, 403, this repo) from **Response 2** (RS→client, 401, *"your resource server"*). The
*"What the client learns"* table is **split**, which the work item asked for and which matters: `acr_values`
and `max_age` are §3's challenge parameters and hang off the 401; `acr` and `auth_time` are this AS's own
additions and now sit in a second table labelled *Response 1 only*, because a client acting on them is
trusting the AS's view of a token it already holds.

> ### "Everywhere" was four locations in the plan and turned out to be five
>
> The fifth is **`docs/DATA-FLOWS.md`**, whose step-up sequence diagram drew `RS-->>C: 403 Forbidden` with the
> challenge on it — the RS→client arrow that batch 3c had already identified as the *sharpest* form of this
> defect, in a document nobody had searched. **Why three passes missed it:** the original finding searched
> `STEP-UP-AUTH-TUTORIAL.md`, batch 3c searched the nine tutorials, batch 3b searched the modules, and a
> top-level architecture document that redraws every flow in the repo is none of those three. Recorded as the
> new **9470-W7**.
>
> **The rule that finds the next one: a defect stated as *a status code on a particular arrow* recurs wherever
> that arrow is drawn.** Grep the *shape* — `insufficient_user_authentication` beside a status — across
> `docs/`, rather than auditing document by document. Doing that also confirmed three places already have it
> right: `GLOSSARY.md` says 401, and `API.md` and `StepUpSection.tsx` describe the *introspection* 403, which
> is correct for what they document.

**One consistency decision worth recording.** The tutorial uses `urn:mace:incommon:iap:silver` as its strong
ACR in ten places, and this deployment registers `["pwd", "mfa"]`. Substituting `mfa` in only the transcripts
would have left two vocabularies in one file, so `silver` stays as the illustration throughout and the
substitution rule is stated **once** in the file's T2-1 box. Part 2's `acr_values_supported` block, which
claimed to show this server's metadata, was corrected to the live `["pwd", "mfa"]` — with the reason `mfa` is
registered *and deliberately unsatisfiable*: it is what makes the essential-ACR **refusal** path reachable.

**Verification.** Documentation only — 1081 server tests / 73 files and 109 client / 16 unchanged;
`check-docs.mjs` clean across 166 files.

### 2026-08-14 — T2-1: the nine tutorials adopt the `UNVERIFIED` convention

**Why this matters to a future session:** the audit called this *the single highest-leverage item in the
plan* — the aggregate behind **six S2 findings** — and its whole point is that a tutorial must say which of
its transcripts were **run** and which were **reasoned**. **5 markers across 3 files → 29 across 9.**

**The convention is defined once, in `docs/README.md`**, as three labels: **captured** (run on a stated date),
*illustrative* (right shape, placeholder values, nothing run), **`UNVERIFIED`** (this deployment cannot
produce it, and the marker names the setting responsible). Each tutorial then carries only its own facts, so
there are not nine near-duplicate boxes to drift apart. **None of the three words was invented here** —
`UNVERIFIED` is the curriculum's (`modules/09a…/lab.md`), *illustrative* is FAPI2-W6's own acceptance
criterion, and **captured** is `TOKEN-EXCHANGE-TUTORIAL.md`'s existing *"what this server actually returns
(captured 2026-08-06)"*. **That file was already the model**, which corrects the finding's own framing: the
convention was not "three files away in the curriculum", it was in a tutorial nobody had generalised from.

> ### The load-bearing step was probing, not writing
>
> Batch 3c's reproducibility table is dated **2026-08-13 and earlier**, and Tier 1 changed the deployment
> underneath it. **Four of nine verdicts were stale, every one in the *runnable* direction:**
>
> | File | 3c said | Live 2026-08-14 |
> |---|---|---|
> | `RAR-TUTORIAL.md` | three transcripts "cannot have been produced" — no type registered | **T1-6 registered `payment_initiation`.** The transcripts now come from the real 2026-08-12 round trip |
> | `CIBA-TUTORIAL.md` | "unreproducible — `bcDeliveryMode` unset on all three clients" | **T1-6 set `POLL` on `1523514379`.** The flow runs — on that client |
> | `FAPI-TUTORIAL.md` | "no client has a JWKS or `private_key_jwt`" | **T1-3 created `2176571218`** with both, so four of Part 4's six steps are runnable |
> | `MCP-OAUTH-TUTORIAL.md` | CIMD does nothing; issuer inconsistent | **DR-05 and DR-11 fixed both** |
>
> **Writing "unreproducible" from the audit's own table would have been wrong four times.** Only
> `NATIVE-SSO-TUTORIAL.md` is still wholly unrunnable, and it is the file marked that way throughout.

**Three defects no work item had named**, each found by checking a transcript against live configuration
rather than by reading it:

1. **`CIBA-TUTORIAL.md`'s every worked example 401s against the configuration the tutorial tells you to
   build.** Part 2 recommends `CLIENT_SECRET_BASIC` — citing Authlete's own guide, and because the
   backchannel and token endpoints must agree — and the one client here with `bcDeliveryMode` set is exactly
   that. Every example passed `clientId`/`clientSecret` in the **body**, which earns `[A157357]` for the
   *channel* before the secret is looked at. The Basic form is now primary, with a three-row channel table
   copied from `PAR-TUTORIAL.md`'s (which is excellent and was the model). **A consequence worth keeping:**
   Part 6's *"Wrong Client Secret"* demo therefore **passed for the wrong reason** — against a Basic client it
   401s whether the secret is right or wrong. A negative test that cannot distinguish its two failure causes
   is not a test.
2. **`RAR-TUTORIAL.md` showed a PAR response shape that has never existed** — `{"action":"CREATED",
   "request_uri":…}`, half Authlete's envelope and half RFC 9126 §2.2's body. A **T1-11 residue**: that pass
   updated six tutorials and did not reach a seventh file quoting PAR incidentally. **When a wire format
   changes, grep for the shape, not only for the endpoint's own tutorial.**
3. **`MCP-OAUTH-TUTORIAL.md` instructed you to set `resourceIndicatorsSupported`, which is not an Authlete
   field.** No `Service` property in 3.0.16 matches `resource` except `resourceSignatureKeyId`, and the string
   appears nowhere in the vendored OpenAPI document. **The fourth instance** of "set X in the console" for an
   X with no console field, after RPL-W4, T1-13 and VCI-W2's AS half. Struck through rather than deleted, so
   nobody re-adds it. Its sibling `resource_indicators_supported` is absent from the discovery document too —
   and **whether RFC 8707 registers such a member at all is marked `UNVERIFIED`** rather than asserted, since
   the RFC was not re-fetched for it.

**Six stale literals corrected**: five `expires_in: 3600` where the service's `accessTokenDuration` is
**86400**, and `FAPI-TUTORIAL.md`'s PAR `expires_in: 90` where `pushedAuthReqDuration` is **600**. Plus
`RAR-TUTORIAL.md`'s introspection block, which showed `authorization_details` at the top level where the live
response is `authorizationDetails.elements[]` with RFC 9396's common data fields flattened into an
**`otherFields` string** — so the tutorial taught one parser for two incompatible shapes.

**Four other IDs discharged**: 9396-W4 · FAPI2-W6 ⊃ 9126-W5 = CUR-3c-W7 (the `/api/authorize` →
`/api/authorization` path in two files) · the tutorial halves of 9126-W6 and CIBA-W5, whose `AGENTS.md` and
Module 05 halves stay in T2-15. **`FAPI2-W6` had no tier row of its own** — it existed in the plan only inside
§5.2's cluster 22 — so the coverage check counted it as covered without anything scheduling it. That failure
mode is now recorded in the plan.

**One thing deliberately not done.** `STEP-UP-AUTH-TUTORIAL.md` still prints its step-up challenge as **403**
where RFC 9470 §3 requires **401**, including the sequence-diagram arrow. That is **T2-11**, and leaving it
keeps T2-11 one reviewable change instead of half-absorbed here. The file's new box says what *is* and is not
runnable — `accessTokenSignAlg` is unset so Part 4's JWT payload cannot exist, and
`urn:mace:incommon:iap:silver` is not a registered ACR (`supportedAcrs` is `["pwd","mfa"]`, so use `mfa`) —
and records the T1-7 correction that `max_age` can only genuinely fail on the `prompt=none` path, because on a
login POST the user has just authenticated.

**Verification.** 1081 server tests / 73 files, 109 client / 16 — unchanged, this is a documentation change.
`check-docs.mjs` clean across **166 files**, now validating **1037 endpoint paths** (up from 997) and 274
anchors. Route coverage 92 routes, empty baseline. `docs/README.md` also gained the two tutorial-index rows
`STEP-UP-AUTH-TUTORIAL.md` and `MCP-OAUTH-TUTORIAL.md` were missing, which is part of CUR-3c-W14.

### 2026-08-14 — T1-11 + CU-W2: the wire format, and the client update that cleared fields

**Why this matters to a future session:** **T1-11 was the last open Tier 1 item, and it is closed.** Four
endpoints that advertise an RFC were answering with Authlete's internal envelope. And `CU-W2`, the
highest-severity open finding (S2, silent data loss on an admin write), is fixed — **without** waiting for the
live proof its own criteria said it was conditional on.

**T1-11 — the endpoints were returning the wrapper instead of the answer.** `/api/par`,
`/api/device/authorization`, `/api/client/dcr/*` and `/api/vci/deferred/issue` all sent camelCase field names
beside `action`, `resultCode` and `resultMessage`. A client reading RFC 9126 §2.2 looks for `request_uri`; it
received `requestUri`. **Authlete's `responseContent` already *is* the specification's body** — probe-confirmed
for device by 8628-W6 — so this forwards what the vendor produced rather than translating anything, which
`token.controller.ts` had done since the beginning. Extracted as `sendSpecBody` rather than copied four times.

**Four rules in that helper, and three of them are about when *not* to apply the pattern:**

1. **The envelope is the fallback, not an error.** No `responseContent` means no spec-shaped body exists, and
   Authlete's `resultMessage` beats an empty response.
2. **Error bodies go through it too** — `responseContent` on a failure carries the RFC's error object, the part
   a client is *required* to parse. Spec shape on success and envelope on failure is the worst of both.
3. **An endpoint with no specification shape keeps the envelope.** Only `DeviceAuthorizationResponse` has a
   `responseContent` member; `DeviceVerificationResponse` and `DeviceCompleteResponse` have **none** (2, 0, 0
   across the three SDK models), because those two are internal AS operations. **Applying the pattern to all
   three device endpoints would have sent `undefined`** — the audit's work item did not say this, and a
   grep of the SDK is what caught it.
4. **One of the four is not JSON.** `/api/vci/deferred/issue`'s `responseContent` on `UNAUTHORIZED` is a
   **`WWW-Authenticate` challenge string** — `Bearer error="invalid_token", error_description="[A375304] …"`,
   confirmed by live probe earlier today. RFC 6750 §3 puts that in the *header*, which is what
   `userinfo.controller.ts` already does with the identical shape. **"Return `responseContent` as the body" is
   the wrong instruction for exactly one of the four**, and only reading what the string contains reveals it.

The SPA moved in the same commit — `ParSection.tsx` (**five** sites, not the one the audit named),
`DeviceSection.tsx`, and `DcrSection.tsx`, whose unwrap and camelCase fallbacks are now deleted because the
ambiguity they existed for is gone. Six tutorials and two labs too, including two shell extractors that read
`['requestUri']` and `.deviceCode` and would have silently produced empty strings.

> **Two documentation outcomes worth noting.** `modules/05…/README.md` had printed
> `{"expires_in":600,"request_uri":…}` all along — **one doc was *ahead* of the code**, and this made it true
> rather than breaking it. And `DEVICE-FLOW-TUTORIAL.md` contained a note that *excused* the defect:
> *"This server exposes the Authlete shape directly so you can see what the SDK returns; a production device
> authorization endpoint would rename them."* The renaming was never needed — `responseContent` was right
> there. That note is now the boundary lesson it was reaching for, which is a better paragraph than either the
> excuse or a deletion.

**CU-W2 — `buildClientInput` names ~40 of 108 properties against a replace-semantics API.** So a `PATCH`
changing a client's name sent an object missing ~68 fields, and could clear `tokenAuthMethod`, `pkceRequired`
or `redirectUris` — **silently, with a 200**. `update()` is now read-modify-write.

> **The criterion said "conditional on CU-W1" and that was wrong.** CU-W1 is the live proof that Authlete
> replaces rather than merges, and it was never run. But **preserving unnamed fields is a no-op if Authlete
> merges and prevents data loss if it replaces** — the code is correct under both answers, so the unproven
> fact blocked nothing. An S2 sat open for two days behind a dependency it did not have.
>
> **And the SDK does the hard part already.** The criterion suggested routing fields through
> `additionalProperties` by hand; that is unnecessary, because `Client$inboundSchema` collects unmodelled
> members *into* it and `ClientInput$outboundSchema` ends in a `.transform` that spreads them *back* to the top
> level. The two are a **matched round-trip pair**, so all four properties SDK 1.0.0 omits survive with no
> special handling. `tests/unit/services/client-roundtrip.test.ts` asserts that pairing directly — because if
> either half changed, this method would delete `backchannelLogoutUri` from every client it touched, which is
> the same defect class reintroduced by its own fix.

**Verification:** typecheck both packages · lint (server 4 pre-existing warnings, client clean at
`--max-warnings 0`) · **1081 server tests / 73 files** (1067 before) · 109 client / 16 · `check-docs` 166 files ·
route coverage 92 routes. No `test:e2e`, no Authlete writes.

**Tier 1 is complete.** What remains in the plan is Tier 2's 11 open documentation items (T2-1 first — the
`UNVERIFIED` convention across nine tutorials) and Tier 3's decisions.

### 2026-08-14 — the P1 configuration changes had broken three labs

**Why this matters to a future session:** **the three Authlete writes earlier today shipped without their
paired doc changes, and invalidated correct curriculum on the day they landed.** `AGENTS.md` requires a
configuration decision to ship with its doc change in the same commit; it did not happen, and the drift sat on
`main` for two commits. Found while scoping T1-11 — not by any check.

**The rule that failed, and why it could not have worked.** `AGENTS.md` said *"grep the curriculum for the
symptom you changed"*. **A service flag has no symptom string.** The strings that go stale are the ones that
existed *because the feature was off*, and you cannot grep for output you are about to create. The rule is now
extended in `AGENTS.md` with the three searches that would have caught this — the flag name, the vocabulary of
being off (*"not enabled"*, *"switched off"*, *"disabled on this service"*), and the vendor result codes that
only occur while it is off.

**What DR-03 broke (VCI enabled) — Module 09b Exercise 7, rebuilt from fresh probes.** The exercise opened
*"**The feature is switched off at the Authlete service**, so every one of them refuses"* and was built on
four transcripts, two observations drawn from them, and two `UNVERIFIED` markers. All of it was false. Probed
live against service `3693555522` on a clean dev instance from current source:

| Endpoint | Before | Now |
|---|---|---|
| `/.well-known/openid-credential-issuer` | `404` | **`200`** |
| `/api/vci/metadata` | `A364301 \| NOT_FOUND` | **a conformant §12.2.4 document** — no `resultCode` at all |
| `/api/vci/jwtissuer` | `A416301 \| NOT_FOUND` | **`A417202 \| INTERNAL_SERVER_ERROR`** |
| `/api/vci/jwks` | `A402301 \| NOT_FOUND` | **`A403201 \| INTERNAL_SERVER_ERROR`** |
| `offer/create`, no auth | reached Authlete → `A366201 FORBIDDEN` | **`401 invalid_client`** locally |
| `offer/create`, admin auth | — | **`A366001 \| CREATED`** |
| `deferred/issue` + bogus token | `UNVERIFIED` | **`A375304 \| UNAUTHORIZED`** |

> **The replacement lesson is better than the one it replaces**, which is the argument for rebuilding a lab
> mechanism-first rather than retiring it. The old point was *"every VCI endpoint refuses because the feature
> is off"* — true, and shallow. The new point is **"enabling a feature is not the same as configuring it"**:
> the flag is on, the metadata document is real and conformant, and two of three discovery endpoints still
> fail because **a credential issuer with no JWK Set has nothing to sign with.** And the codes moved from
> `NOT_FOUND` to `INTERNAL_SERVER_ERROR`, which is the *honest* transition — with the feature off the document
> does not exist, so 404 is right; with the feature on and its key material missing the document should exist
> and cannot be built, which is a server fault. Most implementations would have kept returning 404.
>
> A second thing fell out: the old loop printed `d['resultCode']` unconditionally, so it now **raises
> `KeyError`** against `metadata`. When a feature comes on, the *shape* of the answer changes, not just its
> status — the lab says so, because that is a transferable lesson about reading vendor responses.

**And one transcript in that exercise had been stale even before DR-03.** It showed `offer/create` reaching
Authlete with **no credentials**, which the `requireBasicAuth` fail-open → fail-closed fix stopped some time
ago. So the block carried *two* independent staleness dates. The lab already had a note about the fail-open
history; it now also records that its transcripts were rewritten, and why no mechanical check could have said
so — **labs are prose.**

**What DR-05 and DR-11 broke.** `MCP-OAUTH-TUTORIAL.md`'s precondition table asserted
`clientIdMetadataDocumentSupported = false — CIMD is **off**` and `issuer = https://blackadi.dev` against an
ephemeral tunnel host; both rows now read as met, with the live values and the endpoint to re-check them from
(`GET /api/fapi/config` → `cimdSupported`). Its Prerequisites section told the reader to enable what is
already enabled. Two `iss` transcripts moved to the Render host: `modules/05/README.md:302` (an illustrative
composite, changed silently) and `modules/09a/lab.md:298` — **flagged inline**, because it sits in a block
labelled *"verified end to end 2026-08-12"* and the new value is read from the live discovery document rather
than from re-running the JARM flow, which needs interactive browser authorization. A transcript claiming
end-to-end verification has to be honest about which of its lines were.

Also corrected: the `SPEC-INVENTORY.md` OID4VCI rows (×2) and Module 09b's README status row, all of which
said *"disabled on this service"*. And `AGENTS.md`'s flags table recommended `clientIdMetadataDocumentSupported:
false` with no note that this deployment deliberately runs `true` — a reader following the table would have
"corrected" a live setting.

**One thing verified live and worth carrying:** `/api/fapi/config` now answers `mode: "disabled"` with
`specs.securityProfile: "None"` — the FAPI1-W2 change from earlier today, working against the real service,
where the old code would have said `"FAPI 2.0 Security Profile"` regardless. And
`grant_types_supported` lists exactly the five URNs B1-W3 added to `normalizeGrantType`
(`…:ciba`, `…:device_code`, `…:token-exchange`, `…:jwt-bearer`, `…:pre-authorized_code`), so that map's keys
match what this AS actually advertises rather than what the RFCs merely permit.

**Still open, and it is a real gap rather than drift:** the credential issuer has **no JWK Set**
(`credentialJwks` / `credentialJwksUri` unset), so `/vci/jwks` and `/vci/jwtissuer` return 500 and no
credential can be issued. That is now documented as the boundary of what Module 09b can verify, rather than
being invisible. Setting it is a service write and needs its own decision.

**Verification:** `check-docs` 167 files clean. No source changed, so the test suites are untouched at 1050/71
and 109/16. Probes were read-only GETs plus one `offer/create` POST (transient issuance state, no service or
client configuration written).

### 2026-08-14 — T1-19 batch 3: B1-W3, 9068-W2, 9101-W5 — and T1-19 closes

**Why this matters to a future session:** **T1-19 is complete — all 13 items.** These last three were held
for plan mode because each touches a file on `AGENTS.md`'s **Security-critical surfaces** list, and all three
turned out to be *one defect class*: **a value the caller controls, or a value nobody supplied, becoming a
server assertion.** None was exploitable. Each modelled the wrong habit in a repo that teaches OAuth.

**B1-W3 — `normalizeGrantType` ended `|| "AUTHORIZATION_CODE"`, and the default was the defect.**
`grantType` is Authlete's record of *what authorised a token*. Coercing an unrecognised — or entirely
absent — value did not fail to answer that question; it answered it **wrongly**, and the token carried the
answer for its whole life. A typo in the admin UI's free-text field minted a token whose provenance was a
fiction, with HTTP 200 and nothing in the log. Now `AppError(400)` — the same rule `utils/step-up.ts`
applies to an unknown `acr` and `require-basic-auth.ts` to unset management credentials: **an absent value
selects the safest behaviour, and for an assertion the safest behaviour is to make none.**

> **The criteria under-counted their own defect, which is worth noticing as a pattern.** They named three map
> additions. But **`CIBA` had no entry at all** — not a missing URN, a missing *grant type*, so every CIBA
> token was recorded as authorization-code — and `as GrantType` at the call site is *why* that survived: a
> `Record<string, string>` whose values are cast to an enum at the point of use cannot be checked against
> the enum it claims to produce. Dropping the cast and typing the map made the compiler find the tenth
> member. **A cast is not a type; it is a promise that nobody verifies.**

Canonical wire URNs added and **re-verified against the RFCs this session**: RFC 8628 (Standards Track, Aug
2019) §3.4 → `urn:ietf:params:oauth:grant-type:device_code`; RFC 8693 (Standards Track, Jan 2020) §2.1 →
`urn:ietf:params:oauth:grant-type:token-exchange`; plus `urn:openid:params:grant-type:ciba`. Only the short
forms `device_code`/`token_exchange` mapped before, and neither is what any client sends.

**Blast radius checked, not assumed.** `create()` has a second caller —
`controllers/token-exchange-response.handler.ts`, an `AGENTS.md` **Deliberate defect** whose Module 06
exercises depend on it working. It sends the camelCase `grantType: "TOKEN_EXCHANGE"`, which still resolves.
**Both sides now assert it**, because the handler's own characterization test mocks the service and so could
never have seen a resolver change break the lab. The SPA's free-text *Grant Type* input became a `Select`
over the ten members, so the new 400 is unreachable from the UI.

**9068-W2 — the one obtainable RFC 9068 specimen contradicted the lesson it illustrates.**
`GET /api/token/createLocalToken` is dev-only and admin-authenticated, but its token is **the only JWT in
this repo a learner can decode as an "access token"** — in a curriculum whose Module 04 objective is to state
§2's required claims and `typ` value. It emitted `typ: JWT` and five claims, missing `client_id`, `jti` and
`scope`. Now `typ: at+jwt` (§2.1 — `jsonwebtoken` defaults to `JWT`, which §4 check 1 makes a resource
server **MUST-reject**), all seven §2.2 REQUIRED claims, and `scope` when supplied. `clientId` is a
**required positional parameter, not an option**: an optional field would let the specimen stay
non-conformant by omission, which is exactly the defect. `jti` is a fresh UUID per call — §4's replay
guidance only works if tokens are distinguishable — and `scope` is omitted rather than emitted empty,
because `scope: ""` tells a resource server the token grants *nothing*, which is not the same as saying
nothing.

> **Two advertised no-ops turned up while wiring it.** `openapi.routes.ts` documented `acr` and `authTime` as
> query parameters of this endpoint, and `localSignedToken` took three arguments — so it dropped both before
> `createLocalJWT`, which has accepted them since the RFC 9470 step-up work, could see them. A fourth site
> for the audit's *advertised-but-unusable* theme, found by reading the spec entry beside the code rather
> than either alone. Both are wired, and **an unparseable `authTime` now stamps no claim rather than a
> number**: `Number("")` is `0`, which is finite, so the naive form would record `auth_time` as the Unix
> epoch — a **fabricated authentication time**, the precise thing 9470-W3 removed from the `prompt=none`
> path, and one a resource server enforces `max_age` against.

**And the item's own ordering note was wrong.** It exempted W2 from plan mode by judging the *file* —
`createLocalJWT.ts`, which is not on the surfaces list. The fix threads `client_id`/`scope` through
`token.operations.service.ts` **and** `token.management.controller.ts`, both listed under **Token
issuance**. *The trigger is the concern, and the concern travels with the parameter.* `audit/RESUME.md` §0
had inherited the same misgrouping.

**9101-W5 — the authorization request was the client's own object.** `authorization.service.ts` passed
`req.query` **itself**, mutated with a `parameters` key, as the Authlete `AuthorizationRequest` — so every
parameter the client sent was also offered as a top-level vendor field. **Not exploitable, and establishing
that is why this was S4:** the request type has exactly three members (`parameters`, `context`,
`cimdOptions`), the SDK's outbound `z.object` strips the rest, and there is **no `clientCertificate` member
on this request type**. What survived was `context` — the arbitrary text Authlete attaches to the ticket,
chosen by whoever wrote the URL. **`jar.service.ts` calls the same Authlete API and already built the request
from named fields**, so the fix made two siblings agree rather than importing a rule. `context` still travels
inside `parameters`, where the client put it; only the vendor field is refused. The `req.query` mutation is
gone too — nothing read it, and a service that quietly rewrites the request it was handed is a trap.

**A test that could not be written where it belonged, and why that is recorded.** The route-level 200 case
for `createLocalToken` is **deliberately absent**: signing needs `JWT_PRIVATE_KEY_PEM`, which the test
environment does not set, so a success assertion there would pass or fail depending on whose `.env` ran it —
the same environment-dependence that made P0's `NODE_ENV` test mock `dotenv`. The token's shape is asserted
against a real key in the unit test; the controller's parameter forwarding in a new
`tests/unit/controllers/token.management.controller.test.ts` with the service mocked. **Three places, each
asserting the thing it can actually see.**

**Verification:** typecheck both packages · lint (server 4 pre-existing warnings, client clean at
`--max-warnings 0`) · **1050 server tests / 71 files** (998 before) · 109 client / 16 · `check-docs` 167
files · route coverage 92 routes, empty baseline. No `test:e2e`, no Authlete writes.

**Next:** **P3** — T1-11's wire format (PAR, Device, DCR and `/api/vci/deferred/issue` return Authlete's
camelCase envelope instead of the RFC body). Server, SPA and lab transcripts ship together or the labs go
stale; `ParSection.tsx` and `DeviceSection.tsx` read the envelope fields today.

### 2026-08-14 — T1-19 batch 2: FAPI1-W2, ATTR-W1, BCL-W6

**Why this matters to a future session:** three small contained items, and the third turned up a fact about
the SDK that **contradicts a generalisation `AGENTS.md` had been carrying** — one that would have made this
fix silently break the feature it was tidying.

**FAPI1-W2 — `computeFapiMode` could not represent FAPI 1.0.** Authlete's `fapiModes` is a six-member closed
enum spanning both FAPI generations. The mapper recognised only `FAPI2_SECURITY` and the
`FAPI2_MESSAGE_SIGNING_*` prefix and returned `"disabled"` for everything else — so a service configured for
**FAPI 1.0 Baseline or Advanced was reported as having FAPI switched off**, by the endpoint whose entire job
is reporting the FAPI posture, for a profile `SPEC-INVENTORY.md` carries two rows for and Module 10 teaches.
The domain is now `sp` · `ms` · `fapi1-advanced` · `fapi1-baseline` · `unknown` · `disabled`. **The
`unknown`/`disabled` split is the half that is not about FAPI 1.0**: `"disabled"` is a statement about
configuration (no mode set), `"unknown"` about recognition (a mode set that we do not know). Collapsing the
second into the first asserts a posture nobody checked — FAPI2-W1's hardcoded-literal defect one layer down —
and it is what makes a seventh Authlete enum member land visibly instead of silently off. `specs.securityProfile`
now follows `mode` rather than being the constant `"FAPI 2.0 Security Profile"`, which was wrong the moment
`mode` could be a FAPI 1.0 value. Consumers moved in the same commit: `openapi.routes.ts`,
`FapiSection.tsx`'s badge, `operationDocs.ts`, `docs/FAPI-TUTORIAL.md`. **No curriculum transcript changed** —
`fapiModes` is absent on this service, so the live answer is still `mode: "disabled"` and Module 10's
Exercise 4 reads exactly what it always did.

**ATTR-W1 — the one `as any` in a ~40-field mapper.** `buildClientInput` coerces or casts every client
metadata field to a named type except `attributes`, which was forwarded with `as any` behind an
`Array.isArray` guard. So *any* array reached Authlete verbatim, and a **non-array was dropped without a
word** — a write that answers 200 and stores nothing. `clientAttributesSchema` now validates it and both
shapes are 400s. **Deliberately stricter than the SDK on one point:** `Pair` makes both members optional, so
`[{}]` satisfies it, but a keyless attribute is unaddressable and the namespace is not inert — Authlete
assigns meaning to some keys, which is how the `regex` *scope* attribute drives parameterized scopes. `value`
stays optional. Create and update share the mapper, so both are covered; a test asserts that.

**BCL-W6 — and the finding underneath it.** `backchannel-logout.service.ts` kept **two** raw `fetch()` calls
to Authlete. One is justified and stays: SDK 1.0.0 exposes no backchannel logout token API. The other
hand-rolled `/client/get/list` — its own URL, its own bearer header, its own guess at the response shape —
and nothing justified it. Moved to `authleteApi.client.list`.

> **The part worth carrying.** The compiler refused `client.backchannelLogoutUri`: **SDK 1.0.0's `Client`
> model does not have that field.** `AGENTS.md` said the SDK *"silently strips"* what it does not model —
> which, if true here, would have made `issueAndDeliverToAll` deliver logout tokens to **nobody**, silently,
> while still answering 200. **It is true of `Service` and false of `Client`.** `Service$inboundSchema` is a
> plain `z.object` and strips; `Client$inboundSchema` wraps itself in the SDK's `collectExtraKeys$` and
> *collects* unmodelled members into `client.additionalProperties`. `Client` carries **104** of Authlete
> 3.0.16's **108** properties; the four omitted are `backchannelLogoutUri`,
> `backchannelLogoutSessionRequired`, `spiffeId` and `spiffeBundleEndpoint` — the last two the client-side
> sibling of the `SPIFFE_JWT` enum gap that took `service.get()` down for six days.
>
> Established by **parsing a fixture through the real `Client$inboundSchema` and reading where the field
> landed**, not by reading the model's shape — the same "probe before writing" discipline, applied to a
> vendor library instead of a vendor API. A test now parses through that schema, so an SDK bump that changes
> the behaviour fails loudly rather than emptying the delivery list. **Rule: do not generalise one SDK
> model's tolerance to another; check which wrapper the schema uses.**

**Verification:** typecheck (both packages) · lint (server 4 pre-existing warnings, client clean at
`--max-warnings 0`) · **998 server tests / 70 files** (969 before) · 109 client / 16 · `check-docs` 167 files ·
route coverage 92 routes, empty baseline. `test:e2e` not run.

**Still open in T1-19:** **B1-W3** (`normalizeGrantType` total) and **9101-W5** (JAR built from named fields),
plus **9068-W2** (dev JWT §2-shaped) — which `audit/RESUME.md` §0 had grouped with the safe items, but which
threads `client_id`/`scope` through `token.operations.service.ts` and `token.management.controller.ts`, both
on the **Security-critical surfaces** list under Token issuance. All three need plan mode.

### 2026-08-14 — P0, P1, T1-19 batch 1, FAPI2-W4

> **Backfilled 2026-08-14** from commits `3725a76`, `dd7c1cd`, `ecfab07`, `960fcd6`, `3d0a736`. This day's
> work landed without a Build Log entry, so the resume state jumped from 2026-08-13 to batch 2. Written from
> the commits rather than from `audit/RESUME.md`, so nothing here is a paraphrase of a summary.

**Why this matters to a future session:** two findings here outrank every line of code in them. A missing
environment variable had disabled every security gate that reads one, and the audit had spent weeks
describing a **different Authlete service** from the one the public deployment used.

**P0 — `NODE_ENV` defaulted to `development`, so every gate reading it was off** (`3725a76`).
`app.config.ts` read `process.env.NODE_ENV || "development"` and the Render dashboard did not set it.
Verified from outside: `createLocalToken` → **401, not 404** (the dev gate did not fire), HSTS **absent**, an
error response carrying a **full stack trace**. So `middleware/development-only.ts` never fired, leaving
**`POST /api/device/complete` — which approves a pending device authorization as any subject the caller
names, with no authentication of that subject — reachable on the public internet.** That is RFC 8628 §5.5,
the S1 this audit records as *closed*: closed **in code**, disabled by deployment configuration.

> **The defect is not a forgotten variable. A missing value chose the permissive branch** — the same
> fail-open shape as `require-basic-auth.ts` returning *allow* when `MGMT_CLIENT_ID` was unset, which this
> repo had already fixed once. The rule now sits in `app.config.ts`, because the next such flag will look
> equally harmless: **an absent configuration value must select the safest behaviour.**

Default is `"production"`; `npm run dev` sets `development` explicitly; `render.yaml` pins it rather than
`sync: false`, so neither layer is load-bearing alone; `server.ts` warns loudly when the resolved environment
is `development`, naming the exposed surfaces. **The new test asserts the *default itself*** — the existing
`development-only` tests mock the config module and so could never see which value an absent `NODE_ENV`
produces. It also mocks `dotenv`, because `server/.env` sets `NODE_ENV=development` at module scope: without
that the cases passed alone and failed in the suite, i.e. the result depended on whose machine ran it.

**Two gaps of the same shape, both found while reviewing that one.** CI ran `typecheck` and `test` but
**never `lint`**, on either job, against `AGENTS.md`'s "all three clean" rule. The client's lint had never
run and was failing: 4 errors, 7 warnings. Two errors were an ESLint config bug (`no-undef` from
`js.configs.recommended` applied to TypeScript, so `JsonWebKey` and `RequestInit` were "undefined globals"
while `tsc` was happy); two were setState-inside-an-effect in `ParSection`, fixed rather than silenced. **One
warning was real drift:** `JarSection` still rendered `jarResult.requestObjectPayload`, a field B1-W2 had
removed from the server's allowlist the day before — dead UI that could no longer receive data. Typing the
response to mirror the server's `EXPOSED_FIELDS` makes that a compile error instead of an empty panel. Also:
root `.gitignore`, and `logs/` untracked (17 files scanned for credential-shaped strings first — T0-1 holds).

**P1 — the audit had been reading a different service from the deployment** (`dd7c1cd`). Found by comparing
the document the deployment **serves** against the document the service **generates**. Five independent
differences, which rules out caching: `issuer` differing by a trailing slash, ngrok versus Render endpoints,
**62 members against 59**, 10 `id_token` algorithms against 4 (**no RSA at all**), 5 client-auth methods
against 3 (**no `private_key_jwt`**). The live one lacked **T1-2's RSA key and T1-3's `private_key_jwt`
client** — two of Tier 1's headline fixes. **`3693555522` ruled canonical**; the deployment repointed.
**Reading either document alone proves nothing about the other.**

> **The same reasoning had just corrected a false conclusion.** `POST /api/device/complete` on the deployment
> answered **404**, which looks like the gate firing. The *body* said `[A227301] No record for the user code
> exists` — Authlete's `USER_CODE_NOT_EXIST`. The request had **reached Authlete**; the gate had not fired.
> **Right status, wrong reason. Check bodies whenever a status could come from two places.**

Three writes, each read → write → read-back → diffed key-by-key, **0 unexpected field changes**. **DR-11**:
`issuer` + all 14 URL fields → the Render host; **RFC 8414 §3.3 passes for the first time in this audit**, so
`DISCOVERY-…` F-1, `8414-W1` and **`8628-W5`** close — the stable host beat the tunnel, which improves on the
record's own recommendation. **DR-03 + DR-05**: VCI and CIMD enabled, discovery 62 → 64; `/vci/metadata`
answers `OK` with all three §12.2.4 REQUIRED members, so `OID4VCI-1.0.md` F-1 closes and the entry drops
`MISCONFIGURED`/S2 → `IMPLEMENTED_VERIFIED`/S4. **A trap stated only in the schema:**
`credentialIssuerMetadata.credentialsSupported` is typed **`string`** — a *stringified JSON object* keyed by
configuration id, not an array; Authlete changed it in December 2023 and the array form is refused with
`[A126202]`. **And it retired an `UNVERIFIED` marker:** `/vci/deferred/parse` with a deliberately bogus token
answers `UNAUTHORIZED`, `[A375304]` — confirming at once that the endpoint is live, that the deferred path
really does validate the access token (the entire control VCI-W5 added), and that the `requestContent` this
server synthesises is accepted. **VCI-W2's AS half is UNACHIEVABLE**: no `Service` property surfaces
`credential_issuer`. **Third criterion naming a console change with no console field**, after RPL-W4 and
T1-13 — *check the field exists before writing "set X" as a criterion.*

**Client redirect URIs** (`ecfab07`). All four clients gained the Render callback **additively** — every
`localhost` and the one ngrok URI survived, which matters because `client/update` has **replace semantics**
and Modules 02 and 03 depend on two of these clients. One unintended change, checked rather than assumed:
`derivedSectorIdentifier` went from a value to unset on three of the four. Authlete recomputing it — OIDC
Core §8.1 derives the sector identifier from the redirect URIs' host, and these now span three hosts with no
`sectorIdentifierUri` to disambiguate. **Impact today: none** — all four are `subjectType PUBLIC`, so no
pairwise `sub` is computed. **Impact later:** switching any of them to `PAIRWISE` now requires setting
`sectorIdentifierUri` explicitly.

**T1-19 batch 1 — and three of the five were one defect** (`960fcd6`): *an endpoint answering **200 with
HTML** where it meant "no".* **9728-W1**: RFC 9728 §3 builds the metadata URL by inserting
`/.well-known/oauth-protected-resource` **between the host and the path** of the resource identifier, and
this deployment's `resource` has a path — so a conforming client's request fell through to the SPA catch-all
and got a web page with status 200, *the same failure the route was created to fix, one URL along*. Both
forms now serve the document. **9126-W3**: a non-POST on `/api/par` is `405` with `Allow: POST`, not the
catch-all. **9728-W2**: `bearer_methods_supported` is `["header","body"]` — `extractAccessToken` reads
`access_token` from a form body per RFC 6750 §2.2 — and `query` stays absent, because RFC 9700 §4.3.2 forbids
it. **9470-W6**: `parseBearerError` split on *every* comma, including one inside a quoted value, which RFC
9110 §11.2 explicitly permits — so `error_description="Authentication is insufficient, re-authenticate"` was
cut in half and every later parameter lost. On the step-up path the description *is* the feature. **B1-W4**:
the two echoing `default` branches send a fixed body — a `default` branch means "an action nobody reviewed",
and an unreviewed Authlete response on a boundary is exactly what leaked a ticket from `/api/jar/process`.
Also `check-route-coverage.mjs` learned Express 5's `/prefix/{*name}`, **but only below a real literal
prefix** — without that guard the root catch-all `GET /{*path}` would match every path in every test and
become permanently unfalsifiable. 91 → 92 routes.

**FAPI2-W4 — seven of eight, and the eighth recorded as unreportable** (`3d0a736`). `/api/fapi/status` now
reports `pkceS256Required`, `tlsClientCertificateBoundAccessTokens` and `supportedTokenAuthMethods`.
`pkceS256Required` is separate from `pkceRequired` and both matter: §5.3.2.1 wants PKCE **with** S256, and a
deployment can require PKCE while permitting `plain`. The eighth — §5.3.2.2's PS256/ES256/EdDSA — **cannot**
be reported: no `Service` property carries the signing algorithms; they derive from the JWK Set and appear
only in the discovery document. `supportedSignatureAlgorithms` was tried and **the compiler refused it**,
which is the cheapest possible version of "probe before writing", so the test asserts that member is
**absent** to stop someone inventing it later.

**Verification across the day:** 951 → **969 server tests**; typecheck, lint, `check-docs` 167 files and
route coverage clean at each step.

**Still required, and only the operator can do it:** set `NODE_ENV=production` in the Render dashboard, and
rotate `AUTHLETE_BEARER_TOKEN`, which was invalid (`[A458101]`). **That invalid token is the only thing
masking the device-complete oracle — fixing the token without fixing `NODE_ENV` arms it.**

### 2026-08-13 — VCI-W5: the deferred credential endpoint authenticates somebody now

**Why this matters to a future session:** the defect the previous entry *found* is now **fixed**, and the fix
turned out to hinge on a vendor asymmetry that no amount of reading this server's code would have revealed.

**`POST /api/vci/deferred/issue` collected no access token.** It checked only that `req.body.order` carried a
`transactionId`, then issued a credential. A `transaction_id` is a **handle, not a credential** — OID4VCI §9.1
makes it REQUIRED so a wallet can name which pending request it is collecting. Its two siblings on the same
router both answered `401` without a token.

**The one fact that decided the design, and it is Authlete's, not ours:**

| Authlete API | Request model | Where a token can be validated |
|---|---|---|
| `/vci/single/issue` | `accessToken` **+** `order` | on that call |
| `/vci/batch/issue` | `accessToken` **+** `orders` | on that call |
| `/vci/deferred/issue` | `order` **only** | **nowhere** — no field for it |
| `/vci/deferred/parse` | `accessToken` + `requestContent` | **here, and only here** |

Verified against SDK 1.0.0 and the vendored `docs/openapi-spec.json` (3.0.16). So two of the three credential
endpoints could be written the obvious way and be safe; the third could not, because Authlete splits
authentication (`parse`) away from the operation (`issue`) on the deferred path alone. **Writing it by analogy
with its siblings produced an endpoint that looked finished and enforced nothing.** `deferredParse` was sitting
unused in the SDK the whole time — and this repo's own audit entry had recorded it as unused, two lines from the
claim that the module's auth tiers were correct.

`handleIssueDeferred` now calls `parse` first (`UNAUTHORIZED`→401) and issues only on `OK`. Two rules in the
code, both load-bearing:

1. **`requestIdentifier` comes from `parse`'s `info.identifier`, never from `req.body`.** It names the
   credential request Authlete resolved from the *validated* `transaction_id`; reading it from the body would
   let any valid token name any pending request. Same rule as `introspection.service.ts` and
   `userinfo.service.ts`, and there is a test that puts an attacker's value in the body and asserts it never
   reaches the call.
2. **`transactionId` is required; a bare `requestIdentifier` is refused.** That was the shape which bypassed
   validation, and it carries no `transaction_id` for `parse` to check.

Caller-settable order fields are an **allowlist** (`credentialPayload`, `credentialDuration`, `signingKeyId`),
so the next field the SDK adds cannot be forwarded by default — `jar.controller.ts`'s `EXPOSED_FIELDS` in the
opposite direction.

**Three things that came with it.**

**Module 09b Exercise 7's transcript broke, and was rebuilt rather than patched.** Its Observation 3 contrasted
`credential/batch` (token error) with `deferred/issue` (order error) to teach that *"some validation happens
before Authlete is consulted."* After the fix all three endpoints answer identically, so the contrast is gone —
the lab now teaches **why they agree**: that the disagreement *was* the defect, that an asymmetry is only
visible across a set, that the docs asserted the missing control, and that the vendor's API shape is why it
happened. Mechanism, not symptom, per the rule in `03-curriculum-audit.md`'s lab-breakage register. Two
pre-existing errors in the same block were fixed while it was open and both are called out in it: the batch
transcript showed `invalid_request` where the code emits `invalid_token`, and the adjacent note still described
`require-basic-auth.ts` as **fail-open**, which it has not been for days.

**The audit entry corrected itself in three places.** `OID4VCI-1.0.md` F-3 had generalised across *"three parse
APIs"* whose request models differ — *"the `issue` APIs accept the credential request directly, so a separate
parse step is optional"* is true of two and false of the third. **VCI-W4 said "keep the code as-is."** And the
documentation-delta table graded `AGENTS.md`'s VCI paragraph *"Matches the code"* by comparing it against
`vci.routes.ts`'s route table rather than against the handler. All three are annotated rather than overwritten,
and **F-6** records the gap. The transferable rule: *when a finding groups vendor APIs by name, check whether
their request models agree before reasoning about the group.*

**`verifiableCredentialsEnabled` is `false`, so the fixed path is UNVERIFIED live and says so.** `parse` answers
`FORBIDDEN` before it would return an `info.identifier`. The `requestContent` shape comes from the 3.0.16 schema
and §9.1's REQUIRED `transaction_id`; §9's normative sentence on authenticating the request was never quoted
verbatim, so **no MUST is cited anywhere** — the fix rests on the four independent facts above. Named next
action: re-run the path if VCI is ever enabled. No Authlete writes were made. The wire format stays Authlete's
(`{ order: { transactionId } }` rather than §9.1's `{ transaction_id }`) — **T1-11**'s scope, and this endpoint
is now a fourth site for it beside PAR, Device and DCR.

Server tests **939 → 951**; client 109 unchanged.

### 2026-08-13 — the route-coverage backlog reached zero, and the tool that measured it was wrong

**Why this matters to a future session:** the mechanism built in the previous entry was pointed at the
backlog it was built to describe, and the backlog is now **empty — 47 → 0, all 91 routes named by a test**.
Server tests **721 → 939** across **63 → 69** files. `scripts/route-coverage-baseline.json` is
`{"unreferenced": []}`, which is the intended terminal state: with nothing carried, any unreferenced route is
a regression and fails the build. **Do not repopulate it to accommodate a new endpoint.**

Six new integration files, worked in the triage's own order — group A (no test anywhere) first, then group B
by blast radius:

| File | Routes | What only a route-level test could see |
|---|---|---|
| `native-sso.routes.test.ts` | 2 | Both gate themselves by calling `requireBasicAuth` from *inside* the handler; the router declares nothing |
| `root.routes.test.ts` | 2 | The catch-all answers **200 HTML for any unmatched GET, including under `/api`**, and renders caller-controlled query parameters |
| `backchannel-logout.routes.test.ts` | 4 | Two opposite postures asserted against each other |
| `client.routes.test.ts` | 16 | All sixteen gate in-handler — an admin surface returning client secrets |
| `vci.routes.test.ts` | 10 | Three postures in one router, and the defect below |
| `admin-surfaces.routes.test.ts` | 16 | token / HSK / federation / JAR / device-consent / health / route index |

**The three results worth carrying, in ascending order of how much they cost to learn.**

**1. The instruction "assert the honest failure, do not invent a happy path" had teeth.** `nativeSsoSupported`
is `false`, so Authlete's answer at either native-SSO endpoint has never been observed. The block asserts the
two gates that run *before* any Authlete call — auth and validation, both deployment-independent — plus this
server's own action→status mapping, and labels the one `OK`→200 case as mapping only. `NATIVE-SSO-TUTORIAL.md`
is what the alternative looks like: four transcripts sharing one fabricated `device_secret`.

**2. A new defect, the same shape as `/api/jar/process`.** **`POST /api/vci/deferred/issue` authenticates
nobody.** `handleIssueDeferred` never collects an access token — its two siblings on the same router both do
and both answer `401` without one — and SDK 1.0.0's `VciDeferredIssueRequest` is `{ order? }`, with **no
`accessToken` field**, so Authlete cannot validate one either. Authlete splits the flow: `VciDeferredParseRequest`
*does* carry `accessToken` (*"The access token that came along with the deferred credential request"*) and
`/vci/deferred/parse` is where it is checked — and this server never calls it. **Both `AGENTS.md` and
`routes-list.routes.ts:381` claimed a Bearer token was required.** Not live-exploitable
(`verifiableCredentialsEnabled` is `false`). **Recorded, not fixed:** it changes access control, so it needs
plan mode. The evidence is in `AGENTS.md` under the VCI bullet's *Known gap*; a characterization block in
`tests/integration/vci.routes.test.ts` asserts the current behaviour and names the fix, so a silent change
fails loudly. **UNVERIFIED:** OID4VCI 1.0 §9's exact normative sentence was not quoted verbatim from the
primary source, so no MUST is cited — the finding rests on three items independent of the spec text.

**3. The checker was measuring the wrong thing, and the second-order bug was worse.** A comment in the new
native-SSO test cited `/api/jar/process` as the defect it was modelled on — and that prose mention alone moved
`/jar/process` out of the backlog, because `referenceMatcher` searched the whole file including comments.
Whole-line comments are now stripped before matching (trailing ones are not: cutting from the first `//` would
also eat the tail of any line holding a URL). **Fixing it immediately exposed that
`POST /api/backchannel_logout` — the endpoint the script was written because of, and the one that validated 5
of §2.6's 11 steps while logging nobody out — was referenced in the entire suite only inside two comments.**
Its eleven steps had a controller test; nothing drove the route. Covered rather than added to the baseline,
because growing the baseline to clear a failure is the one move the ratchet cannot defend against.

**The transferable rule:** *a tool that measures references must read only executable text* — and when a
measurement tool is corrected, re-run it before trusting the previous reading, because what it was hiding is
usually worse than the error you found.

### 2026-08-13 — turning the two process findings into things that cannot be forgotten

**Why this matters to a future session:** Phase 5 produced two observations that were worth more than any
individual fix. Both are now **mechanisms rather than advice**, because advice in a retrospective is read
once.

**Finding 1 — six work items prescribed remedies that could not achieve their stated outcome.** B1-W6 named
the wrong Authlete API; T1-13 a service knob that does not exist; 9449-W3 one of the **two** calls the
endpoint makes; 9701-W1 omitted both `rsUri` prerequisites; FED-W1 promised an entity statement needing
unmentioned configuration; 6749-W1 offered an escape clause that did not apply. **Every one was disproved by
a read-only probe in under a minute, before any code was written.**

The shared tell: **none of them named an endpoint.** A criterion phrased as *"issue from the fields Authlete
actually sends"* or *"return 200 with `application/entity-statement+jwt`"* describes a **result**, and
results do not tell you which call produces them. The convention is now recorded in two places a session
actually reads — `RESUME.md` §7 (working conventions) and `04-remediation-plan.md` §7.4 as **step 0**, ahead
of "plan first" — with the three questions that catch the class: *which call changes? is that the only call?
does the outcome need configuration nobody scheduled?*

**Finding 2 — a green suite proved nothing, four times.** `POST /api/backchannel_logout`, `POST
/api/jar/process` and `federation.service.ts` each had **no test naming them**; the third was *unmockable*,
because `tests/helpers/mock-authlete.ts` had no `federation` member while `AGENTS.md` described it as
covering every SDK method. And the client's 16 test files plus its `typecheck` script were never invoked by
CI at all, because `vite build` does not typecheck.

Reading code found those one at a time. **`scripts/check-route-coverage.mjs` asks the question that finds
them as a list**: which of the 91 routes does no test mention? Answer today: **47**.

It **ratchets** rather than failing red on day one, which is how a check survives contact:

```
✅ route coverage: 91 routes, no regressions. 47 carried as known debt (baseline), 2 exempt.
```

`scripts/route-coverage-baseline.json` records the debt; the check fails only for a route *outside* it, so
adding an endpoint without a test breaks the build while the backlog stays visible and shrinkable
(`--update-baseline` banks progress). **It was self-tested**: a throwaway route added to `health.routes.ts`
made it exit 1, and reverting made it exit 0 — a check never observed failing is not a check.

**What it deliberately does not claim.** A route *named* by a test is not a *tested* route; this measures
reference, not assertion quality. It is crude for the same reason `check-docs.mjs` only validates
mechanically-checkable drift: **a cheap check that is always right about a narrow thing beats a clever one
that is sometimes wrong.**

**Both checks are now in CI**, alongside the client `typecheck` and `test` gates added earlier the same day.
Five gates where there were two.


### 2026-08-13 — PKCE enforced, and the last open S1 closes

**Why this matters to a future session:** **`RFC7636-pkce.md` drops S1 → S3.** PKCE is now *required* on this
deployment, which is the claim the S1 rested on being false. `pkceRequired` and `pkceS256Required` are `true`
on the SPA client (`4277838306`) and the `private_key_jwt` client (`2176571218`).

**Verified live at all four clients, because the config saying `true` and Authlete refusing are two different
claims:**

| Request | Result |
|---|---|
| enforcing client, no `code_challenge` | refused — `[A124301]` |
| enforcing client, `code_challenge_method=plain` | refused — `[A124308] … must be 'S256'.` |
| enforcing client, `S256` | `INTERACTION` — proceeds |
| `1523514379` / `1678274156`, no challenge at all | `INTERACTION` — **deliberately still permitted** |

**The two exceptions are curriculum infrastructure and must not be "fixed".** Module 02 teaches the plain
code flow; Module 03 shows what it costs. **A lesson that criticises a flow needs a client that still
permits it.** Both are named in `AGENTS.md` with that instruction, and Module 03's setup table already
required `pkceRequired: false` for its client — the lab was right before the service was.

**One detail worth keeping:** the refusals arrive as **`action: LOCATION`** — an error *redirect* carrying
`error`, not a JSON body — because `response_type` is present. That is the `response_type`-dependent error
channel already documented under **Quirks & gotchas**, showing up in a new place. A learner expecting JSON
will read an empty body and conclude nothing happened.

**Module 03 gained the comparison**, which is a better lesson than the recommendation was: two clients on one
service now answer differently, so *"you should require PKCE"* becomes something you can observe rather than
accept. The module shows both error codes.

**What this closes.** The S1 register's last open entry with a live security consequence. **Gate 4 Q1 is
superseded** — it asked whether the entry stays S1 *until PKCE is actually required*; it now is. The
remaining departure is two documented teaching clients, which is the same standing as GM-W1's 24-hour token
lifetime: a recorded decision with a stated reason, not a gap.


### 2026-08-13 — T1-20, the S1 residues, and a CI gate that never fired

**Why this matters to a future session:** three things, and the third was found by accident while verifying
the first. **721 server tests / 63 files, 109 client tests / 16 files.**

**1. CIBA could not authenticate the client `AGENTS.md` tells you to configure.** That file recommends
`CLIENT_SECRET_BASIC` for CIBA, citing Authlete's own guide. `ciba.service.ts` read `clientId`/`clientSecret`
from the JSON body and **never looked at `Authorization: Basic`**, so that configuration could not work. The
guide and the code had disagreed since the endpoint was written.

It now uses the same three channels as `par.service.ts`, and **the negative control is the more interesting
half of the verification**:

| Presentation | Before | Now |
|---|---|---|
| `Authorization: Basic` | ignored — request failed as unauthenticated | **`USER_IDENTIFICATION`** |
| body `clientId`+`clientSecret`, `CLIENT_SECRET_BASIC` client | **succeeded** | **`401 [A157357]`** |

That second row is a fix, not a regression. The old code sent top-level credentials *regardless of how the
caller supplied them*, so it **silently converted** a `client_secret_post`-shaped request onto the
`client_secret_basic` channel — exactly the guessing `par.service.ts`'s comment forbids, and the reason
Authlete's error names *where* it expected the credentials. `appendToParams` moved to `utils/params.ts` so
the two services share one implementation; a second subtly-different copy is how this repo ended up with
**four** bearer parsers.

**2. The three open S1 residues are closed as documentation.** `README.md` now opens with *"Read this before
you copy anything"* — a table of the four deliberate departures (ROPC and implicit enabled, PKCE not
required, 24-hour tokens, the three token-exchange defects) each against what production would do. The
feature tables gained honest statuses: FAPI 2.0 **Not enabled** (`fapiModes` unset), Native SSO **Not
enabled**, Federation **Not enabled**, Backchannel Logout **Partial**, and a PKCE row stating plainly that it
is supported but not required, with the RFC 9700 §2.1.1 citation. **"Working" used to mean two different
things** — *the code path runs* and *the security control is on* — and the table conflated them.

**What is still genuinely open, and it is one thing:** `pkceRequired` is `false` on every client. The
configuration change was attempted on the two clients that are **not** load-bearing for teaching — `4277838306`
(the SPA's, which uses `pkce.ts`) and `2176571218` (T1-3's) — and was **blocked by this environment's write
policy**, not by any technical obstacle. `1523514379` and `1678274156` must keep PKCE optional: Module 02
teaches the plain code flow and Module 03 shows what it costs, which needs both states to exist.

**3. The CI gap, which is the finding with the longest reach.** Verifying the SPA change meant running
`tsc` on `client/`, which reported **4 pre-existing type errors**. They had survived because
**`.github/workflows/ci.yml`'s client job ran `npm run build` and nothing else** — and `vite build` does not
typecheck. So `client/package.json` had a `typecheck` script CI never invoked, and **16 client test files
that CI never ran**. The server job has gated typecheck, lint and test from the start; the client job gating
only the bundler is the asymmetry that hid them.

All four errors are fixed (`JsonWebKey & { kid?: string }` instead of a `Record` a real JWK cannot satisfy;
a body type that admits the optional keys the auth channel legitimately omits) and **both gates are now in
CI**. This is the fourth "what was supposed to have caught it" answer in five batches, and the first one
that was not about a missing test file but about a **gate that existed and was never wired**.

### 2026-08-13 — T1-16, T1-18: the fifth work item whose criteria named an unreachable outcome

**Why this matters to a future session:** `GET /.well-known/openid-federation` answered **400**, blaming the
caller for a fault that was entirely ours. It now answers **500 naming the missing configuration.** The fix is
one line. **What it does not do is make federation work**, and the work item said it would. **713 tests /
62 files.**

**The probe came before the code, and it is the reason this entry is not wrong.** FED-W1's acceptance criteria
read: *"Both `GET /.well-known/openid-federation` and `GET /api/federation/configuration` return 200 with
`application/entity-statement+jwt`."* Two calls to Authlete settled what actually happens:

| Call | Result |
|---|---|
| no `requestBody` — the old behaviour | **400** `[A258201] … Content-Type header is not specified.` The SDK sends no `Content-Type` when there is no body, so the SDK throws and the caller wears a 400 |
| `requestBody: {}` — the fix | **200 HTTP**, `action: INTERNAL_SERVER_ERROR` — `[A316201] Because a JWK Set for federation has not been set up, this service cannot generate entity configuration.` |

So the fix **changes the failure rather than removing it**. That is still worth shipping: an error that names
the missing setting sends an operator to the right place, and an error that says *"your request is malformed"*
sends them to inspect a request that was fine. Verified live at both routes.

**Two consequences worth carrying.**

**FED-W5 closed without its own change.** It existed as a fallback — *"report the failure as a server error
until W1 ships"*. Once the SDK stopped throwing, Authlete's `INTERNAL_SERVER_ERROR` reached the controller,
whose action mapping was **already correct**. Compare with **BCL-W3**, the same defect shape in the logout
receiver, which *did* need real work because the throw happened in our own code. **Same symptom, same rule,
different fix — the location of the throw is what decides which.**

**FED-W2 is blocked, and now precisely.** There is no entity statement to verify against §3 and there will not
be until a **federation JWK Set** is configured on the service. No work item schedules that, and it is feature
*enablement* rather than a fix, so it is not taken unilaterally — it belongs with the Theme 2 / Tier 3 family.
`README.md` makes no federation claim, so nothing is currently false.

**A coverage gap behind the coverage gap.** `federation.service.ts` had no tests — and *could not* have had
any, because `tests/helpers/mock-authlete.ts` had no `federation` member. `AGENTS.md` describes that helper as
covering *"every SDK method"*; it did not. Both are fixed. That is now the third untested surface found in
three batches (`/api/gm`'s middleware had partial coverage, `/api/backchannel_logout` had none, federation had
none and was unmockable). **When a defect has survived a long time, the useful question is not "how was this
missed" but "what was supposed to have caught it".**

### 2026-08-13 — T1-14, T1-15 (+BCL-W3, BCL-W7): back-channel logout logged nobody out

**Why this matters to a future session:** `POST /api/backchannel_logout` performed **five of OIDC
Back-Channel Logout §2.6's eleven validation steps**, and then destroyed the **wrong session**. Both are
fixed and both were verified live against a locally-served JWKS, not only in tests. **709 tests / 61 files.**

**Start with the coverage fact, because it explains how this survived.** The endpoint had **no unit and no
integration tests at all** — two E2E assertions, in the suite that is never run locally because it burns
Authlete quota. So every green run of the suite said precisely nothing about it. It now has 16 unit tests
plus 9 for the session helper. **When you find an old defect, ask what was supposed to have caught it.**

**Defect 1 — `jwt.verify` was called with `{ algorithms }` and nothing else.** No `issuer`, no `audience`, no
`iat` bound, no `sub`/`sid` presence check, no rejection of the forbidden `nonce`. Any OP whose key happened
to sit in the configured JWKS could log out any subject, and a token addressed to a different `aud` was
accepted. All five are now checked; each rejection was driven live:

| Token | Result |
|---|---|
| conformant | **200**, subject's sessions terminated |
| `iss` = someone else | 400 — *"jwt issuer invalid. expected: …"* |
| `aud` = someone else | 400 — *"jwt audience invalid. expected: …"* |
| no `sub` and no `sid` | 400 |
| carries `nonce` | 400 |
| `iat` 4000s old | 400 |
| `sid` only, no `sub` | **200**, acts on nothing (see below) |

**The generalised rule is in `AGENTS.md`, and its second clause is the one that gets skipped.** Pass `issuer`
and `audience` on every `jwt.verify` — *and* refuse the request when those expectations are unconfigured.
Omitting an option because its value is empty silently downgrades the check to "any issuer, any audience",
and looks identical in the code and in the logs. That is exactly why T0-2 declined to fall back to an unset
`JWT_ISSUER`. Two new settings carry the expectations, and they are **not** `JWT_ISSUER`: on this endpoint the
server is an **RP**, so `BACKCHANNEL_LOGOUT_ISSUER` is the *other* OP's issuer and `BACKCHANNEL_LOGOUT_AUDIENCE`
is our `client_id` **there**. Comparing an incoming token against our own identity would pass nothing
legitimate.

**Defect 2, and the more instructive one — it destroyed `req.session`.** That is the session of *the caller*.
A back-channel logout is a server-to-server POST carrying no browser cookie, so `req.session` was never the
user's session. The endpoint therefore **destroyed nothing, returned 200, and the sending OP believed the
user had been logged out.** `AGENTS.md` described this as *"properly destroys `req.session`"* — an accurate
description of the code and a perfect description of the bug. **A security feature that silently does nothing
is worse than one that visibly fails**, because nothing ever prompts anyone to look.

Sessions are now found by `sub` in the session store (`utils/session-store.ts`). **The detail that would have
shipped broken:** the two supported stores return **different shapes** from `Store.all()` —

| Store | `all(cb)` yields |
|---|---|
| express-session MemoryStore | an **object keyed by session id**; the values carry no `id` |
| connect-redis | an **array**, each element with `sess.id` attached |

— so a handler written against one silently terminates nothing against the other, which is the very failure
being fixed. Both were read rather than assumed, both are normalised, and a test drives the **real**
MemoryStore rather than a mock of it.

**What live verification could and could not reach, stated plainly.** No client registers a
`backchannel_logout_uri` and there is no second OP, so *delivery* stays unexercised. Receipt was proven by
standing up a local JWKS and driving all seven cases through the running server. The termination wiring was
proven by the log line `terminated sessions for subject {"destroyed":0,…}` — **`0`, not `null`**, which is
what shows `req.sessionStore` was reachable and enumerable in the real server; `null` is the code's signal
that the store could not be enumerated at all. That a *logged-in* session dies is covered by the real
MemoryStore test, not by the live run.

**A `sid`-only token is accepted and acts on nothing.** §2.6 step 5 asks only that `sub` *or* `sid` be
present, so rejecting it would be wrong. But this OP issues no `sid` into its own sessions (Session
Management is declined), so there is nothing to match. That is a gap in what can be acted on, logged at
`error`, not a reason to refuse a conformant token.

**Two adjacent fixes, same function.** **BCL-W3**: an unset `JWKS_URI` threw into the catch-all that answered
`400 invalid_request`, blaming the sender for our misconfiguration. It is now **500**, and the check runs
*before the token is read* — stronger than the work item asked, and deliberately: **a server that cannot
verify a signature must not render any verdict on the token, not even a true one.** So the "no events claim"
case became a 500 too, which is honest rather than sloppy. **BCL-W7**: `Cache-Control: no-store` (§2.8),
set before any branch so it is on the 400 and 500 paths as well.

**Curriculum — Module 08 Exercise 6c was already teaching all three of these defects**, so it was rebuilt
rather than patched: the transcript now shows the fixed statuses, and the prose walks the before/after and
the rule (*map a failure to the party that can fix it*). **It also carried a spec error that is now
corrected** — it claimed `jwt.verify` checks "no `issuer`, no `audience`, no `exp`". It checks `exp` by
default; the audit's own normative table said so and the lab contradicted it. Knowing which checks a library
gives you free and which it does not is the entire skill the exercise is teaching.

**Recorded, not fixed.** `JWT_ISSUER` is set to `https://blackadi.dev/` — **with a trailing slash** — while
the live issuer is `https://blackadi.dev` without one. It feeds `reqBody.iss` at
`token.management.controller.ts:266` (the dev JWT), so a consumer comparing that `iss` against the discovery
document would fail. It belongs with **9068-W2** in T1-19. It also sharpens T0-2's note, which recorded
`JWT_ISSUER` as merely *unset*: it is set, and wrong.

### 2026-08-13 — B1-W1, B1-W2, MS-W1 (= 9701-W1): the ticket leak and the last live 500

**Why this matters to a future session:** **`/api/jar/process` was unauthenticated and returned Authlete's
entire authorization response — including the `ticket`.** A ticket is a credential: whoever holds one can
drive an authorization to completion. It also returned the full `service` configuration and the `client`
object, and answered **200 for everything**, including `BAD_REQUEST`. It now requires admin Basic auth and
returns an allowlist. Separately, **`Accept: application/token-introspection+jwt` returned 500** — the only
live 500 among the FAPI 2.0 Message Signing requirements — and now returns a signed RFC 9701 JWT.
**684 tests / 59 files.**

**A correction I owe this log.** The plan for this batch asserted that `standardProcess` sends `{parameters}`
alone and therefore could never reach `action: JWT`. That was wrong — I had read only the first 80 lines of
`introspection.service.ts`; it has forwarded `httpAcceptHeader` and `rsUri` all along. The real defect was one
missing `case` in the controller. The fix got **smaller** than planned, and the lesson is the ordinary one:
read the whole function before describing what it does.

**What `/api/jar/process` returns now.** An **allowlist** — `action`, `resultCode`, `resultMessage`,
`responseContent`, `scopes` — not a denylist, so the next field the SDK adds cannot leak by default:

| | Before | Now |
|---|---|---|
| no credentials | 200, full response **including `ticket`** | **401**, Authlete never called |
| bad request object | **200** with `action: BAD_REQUEST` | **400**, `[A005328]` in `resultMessage` |
| `ticket` / `service` / `client` | returned | **never returned** |

**The work item said `action` + `responseContent` only. I kept `resultMessage` and `scopes` on purpose**, and
the reason generalises: **this endpoint has no specification shape.** No RFC defines `/api/jar/process` — it is
this repo's own debugging surface. So "return `responseContent` as the body", which is the right answer for
PAR and Device, is not even a meaningful instruction here. What B1-W1 is actually about is the credential leak
and the always-200. `resultMessage` and `scopes` are the endpoint's entire pedagogical value — they are how
Module 05's lab shows *why* a request object was refused — and they are not secrets. **When a work item
prescribes a shape, check whether the endpoint has one.**

`responseContent: null` is deliberately kept too. On a debugging surface, *"Authlete returned no content"* is
a fact worth seeing — it is precisely what made T1-7's `NO_INTERACTION` branch mislead everyone for months.

**Auth posture: admin, not client.** Client authentication was considered and rejected for the same reason
T1-1 recorded for introspection (**7662-W6**): nothing here can validate a client secret, so demanding one
would look like protection and provide none. The gate runs **before** the Authlete call. **This settles a
DR-12 dependency** — `jar.controller.ts` now makes an access-control decision, so it joins the
Security-critical surfaces list, alongside `middleware/require-basic-auth.ts`.

**RFC 9701 — reachable, conformant, and with a trap on either side.** Verified end to end:

```
Accept: application/token-introspection+jwt  +  rsUri
  -> 200  Content-Type: application/token-introspection+jwt
  -> {"alg":"RS256","typ":"token-introspection+jwt","kid":"rsa-1"}
     claims: iss, aud, iat, token_introspection
```

**It signs with `rsa-1`, the key T1-2 registered.** Before 2026-08-12 the service had no RSA key, so this path
could not have produced a signature even once handled — one configuration action quietly made a later code fix
possible.

Two things about `rsUri`, and they point in opposite directions:

1. **Without it the JWT form fails**, `[A404301] The URI of the resource server is required when a JWT
   introspection response is requested.` That 400 is **passed through unchanged**, deliberately: `rsUri`
   becomes the `aud`, naming the resource server that asked, and this server has no honest way to guess which
   one that is. Defaulting it would put a wrong `aud` on a token this OP signs.
2. **It must not be sent on the ordinary path.** The vendored 3.0.16 spec: *"If the `rsUri` request parameter
   is given and the token has audience values, Authlete checks if the value … is contained in the audience
   values. If not contained, Authlete generates an introspection response with the `active` property set to
   `false`."* An unconditional `rsUri` would therefore report audience-restricted tokens as **inactive** —
   a silent, wrong "this token is dead". The parameter is caller-supplied and stays that way.

**Two more hand-rolled auth readers retired.** `controllers/vci.controller.ts` had a fourth `startsWith("Bearer ")`
— its credential endpoints are protected resources, so they now use `extractAccessToken()` and accept the
`DPoP` scheme and case-insensitive schemes, both previously refused. And `middleware/require-basic-auth.ts`
matched `"Basic "` case-sensitively while its sibling `parseBasicAuth` never did; RFC 9110 §11.1 makes the
scheme case-insensitive, and the fix is strictly widening — it can only accept requests that should already
have been accepted.

**Deferred with a reason, not dropped.** T1-11's `responseContent`-as-body half for **PAR, Device and DCR**
(9126-W2, 8628-W3, 7591-W1) is scheduled as its own batch. The premise is probe-confirmed — PAR returns
exactly `{"expires_in":600,"request_uri":"urn:…"}` and Device exactly RFC 8628 §3.2's shape — but the change
**breaks the client SPA**, which reads camelCase envelope fields (`ParSection.tsx:112`,
`DeviceSection.tsx:159-160`). Server, SPA and lab transcripts belong in one commit; mixing them with a
credential-leak fix would make both harder to review.

### 2026-08-13 — T1-9, T1-10, 6749-W1: the token-presentation cluster

**Why this matters to a future session:** **`/api/gm/:grantId` is now a protected resource in the same sense
UserInfo is**, and the two answer identically because both route every presentation through
`utils/dpop.ts`. Before today a DPoP-bound token could not be spent there *at all*, while `Bearer` plus a
proof was accepted — wrong in both directions at once. Separately, **every `htu` in the server now comes from
`dpopHttpTarget()`**, so a DPoP proof no longer fails on any request carrying a query string. Four files on
the Security-critical surfaces list changed, so this went through plan mode. **665 tests / 58 files.**

**The headline is not the code, it is that two probes rewrote the design before a line was written.**
9449-W3's acceptance criteria describe one file. They are incomplete, and shipping them literally would have
produced a bug:

| Probe | Result | Consequence for the design |
|---|---|---|
| `/gm` with a bound token and **no** forwarded proof | `UNAUTHORIZED` — `[A281305] The access token is bound to a public key but the grant management request includes no DPoP header.` | `/api/gm` makes **two** Authlete calls and **both** check the binding. Fixing only the middleware moves the 401 one call later. `grant-management.service.ts` had to change too |
| the **same** proof sent to `/auth/introspection` and then `/gm` | both `OK` | One proof serves both calls; no re-minting, and Authlete does not treat the second use as a replay |

That is the third time in this phase that a symptom-derived work item named an incomplete or wrong remedy —
after B1-W6 (wrong API) and T1-13 (no knob). **The tell each time was the same: the acceptance criteria never
named the second call.** When an item says "fix the middleware", ask what the middleware is a gate *in front
of*.

**What `/api/gm` answers now**, all six verified live against Authlete, not only against mocks:

| Presentation | Before | Now |
|---|---|---|
| `DPoP <bound>` + proof | `401` — the endpoint was unreachable for bound tokens | **200** |
| `Bearer <bound>` + proof | accepted, proof honoured — the §7.2 downgrade | **400 `invalid_request`** |
| `DPoP <bound>`, no proof | `401 invalid_token`, *"invalid or expired"* | **401 `invalid_dpop_proof`** |
| no token | `401 invalid_token`, *"invalid or expired"* | **401, no error code**, `WWW-Authenticate: Bearer, DPoP` |
| `Bearer <bound>`, no proof | `401` from Authlete | unchanged — `[A065308]`, forwarded verbatim |
| proof signed by another key | `401` | unchanged — `[A065309]` |

**The two old messages were both lies, and that is worth more than the status codes.** A missing token is not
an "invalid or expired" token — there was no token to judge. RFC 6750 §3.1 says so directly: when a request
carries no authentication information the server *"SHOULD NOT include an error code"*. And a client that used
the `DPoP` scheme without a proof was told its token was expired, which sends a developer to look at token
lifetimes instead of at the header they forgot. **A wrong diagnosis costs more than a missing one.**

**`htu` (T1-9).** Five call sites built it inline as `` `${protocol}://${host}${req.originalUrl}` `` —
`originalUrl` includes the query string, and RFC 9449 §4.2 requires `htu` **without** query or fragment. So
any DPoP request with a query string failed proof validation while the client was entirely correct. All five
now call `dpopHttpTarget()`. Proven, not assumed: `GET /api/gm/{id}?verbose=true` with a valid proof returns
**200**. `targetUri` is sent only where the SDK model has the field — `IntrospectionRequest` and
`UserinfoRequest` yes, `TokenRequest`/`PushedAuthorizationRequest`/`GMRequest` no — checked in the models
rather than inferred from the endpoint's importance.

**9449-W2 rode along and is the quiet security fix.** `introspection.service.ts` read `targetUri` **from the
request body**, so a caller could choose the URI its own proof was validated against — the identical defect
already closed at UserInfo, where a proof minted for `/api/par` had returned `200`. The read is deleted, and
a comment now names the reason so it is not restored by someone tidying up.

**6749-W1 — enforced, after the probe removed the escape hatch.** RFC 6749 §2.3.1: *"The client MUST NOT use
more than one authentication method in each request."* The work item allowed for "no code change if Authlete
already rejects". **It does not**: a request with correct top-level credentials and a **wrong** body
`client_secret` is accepted and a token issued, because the top-level channel wins. Authlete's strict-checking
page turned out to govern only *method matching* and to say nothing about presenting both. So the rule is
enforced here or nowhere, and it is now enforced at `/api/token` **and** `/api/par` — the latter because
RFC 9126 §2 gives PAR the token endpoint's client authentication, and exempting it would have rebuilt the very
inconsistency being removed.

Two details in that check are deliberate. **A bare `client_id` beside a Basic header is not a second
method** — §2.3.1's methods differ in where the *secret* travels, and a public client legitimately sends
`client_id` alone; there is a negative-control test and a live check for it. And **the check runs before any
Authlete call**, the same gate-before-call arrangement T1-1 used for introspection.

**The mechanism correction is the part to carry forward.** `RFC6749-…` F-1 said this server resolves the
conflict — *"Basic silently wins"* — quoting the `clientId`/`clientSecret` assignment. It does not. That
assignment sets only the **top-level** fields, while `parameters` is preferentially `req.rawBody`, so body
credentials reached Authlete untouched and **both channels genuinely crossed the boundary**. Same outcome,
wrong layer. This is the **third** consequence of one design choice, after raw-body fidelity for signatures
and the RFC 9700 §4.2.4 credential leak where the exclusion list never ran on the live path. **Rule: when a
finding in `token.service.ts` or `revocation.service.ts` quotes a variable assignment, check what actually
goes on the wire.**

**T1-21 declined rather than deferred.** Forwarding the attestation headers at PAR is correct code on a path
that is unreachable **by construction** — T1-5 withdrew `ATTEST_JWT_CLIENT_AUTH` and `challenge_endpoint` is
absent, so no client, and no test, can ever exercise it. It attaches instead to T1-5's existing re-add
trigger. The cross-reference in its own row was also wrong: it does not gate `9126-W4`, which was merged into
`9449-W1` and shipped here.

**Curriculum.** Module 10's lab transcript for `-- no token --` changed, so it was updated **and taught**:
the `curl` now prints the status line and `WWW-Authenticate` rather than a body, followed by a short section
on why an empty error beats a wrong one, and on the `Bearer`/`DPoP` pairing. `AGENTS.md` gains the
two-protected-resource framing, the "forward the proof to *every* Authlete call" rule, the three fail-closed
error codes, and the dual-channel bullet. `docs/GRANT-MANAGEMENT.md` and `docs/API.md` gain the scheme table
and the revised error rows; the OpenAPI document now lists `dpopAuth` on both `/gm` operations.

**One finding recorded, not fixed.** `controllers/vci.controller.ts:8` is a **fourth** hand-rolled bearer
parser, `Bearer`-only and case-sensitive. No work item covers it, and VCI credential endpoints accept access
tokens — so it is plausibly the same §7.1 gap this change just closed twice. Left out to keep the batch
reviewable; it belongs in the next one.

### 2026-08-12 — T1-17: five unprobed behaviours, five answers, and no code owed

**Why this matters to a future session:** T1-17 was the only Tier 1 item that could **delete** work, and it
did. Five behaviours nobody had ever run now have transcripts. **No source file changed.** Every probe ran
against Authlete directly — so the answers describe the *vendor*, not this server's wrapper — except the last,
which was deliberately run through the server as well, because that is where its acceptance criteria pointed.

| # | Question | Answer | Consequence |
|---|---|---|---|
| **8628-W6** | Is the literal `USER_CODE` substituted in `deviceVerificationUriComplete`? | **Yes** | The "drop the field or template it correctly" branch never opens |
| **7523-W1** | Is a JWT-bearer assertion with **no `exp`** accepted? | **No** — `[A314305]` | **7523-W2 is belt-and-braces, not a gap** |
| **9449-W4** | Does `/auth/introspection` enforce `cnf.jkt` when **no** proof is sent? | **Yes** — `[A065308]` | **9449-W3 stays S2. T1-10 is not escalated** |
| **6749-W1** | Does Authlete reject dual-channel client credentials? | **No** — and the top-level channel wins | A ruling, not a defect. See below |
| **GM-W2** | Does the grant-management *authorization* side work? | **Yes, end to end** | **Documentation only (GM-W5); no code** |

**8628-W6 — substituted, and the response is already RFC-shaped.** One `/device/authorization` call with the
public client returned `verificationUriComplete = https://…/device?user_code=TDSHHXCP` against a configured
template ending `?user_code=USER_CODE`. The placeholder is real templating, not a literal. Worth more than the
work item asked: the same response's `responseContent` is
`{"device_code":…,"user_code":…,"verification_uri":…,"verification_uri_complete":…,"expires_in":600,"interval":5}`
— **exactly RFC 8628 §3.2's snake_case shape**. That is direct corroboration for **8628-W3** in T1-11: returning
`responseContent` verbatim does not merely tidy the wire format, it produces the conformant body outright.

**7523-W1 — Authlete requires `exp`, so the gap was hypothetical.** `RFC7523-…` F-1 named two possibilities
and declined to guess between them. It is the first: an assertion carrying `iss`, `sub`, `aud`, `iat`, `jti`
and a valid HS256 signature is refused with `action: BAD_REQUEST` and
`[A314305] The JWT specified by the 'assertion' request parameter does not contain the claim 'exp'.`, served as
`error: invalid_grant`. The control — the same assertion plus `exp` — returns `action: JWT_BEARER` and proceeds.
So **§3(4)'s presence requirement is met by the vendor, before `/jose/verify` is ever called**, and
`mandatoryClaims: ["iss","sub","aud"]` omitting `exp` never had the consequence F-1 feared. **7523-W2 survives
only as defence in depth**, and whoever picks it up should say so rather than describe it as closing a hole.
`[A314305]` is a **sixth error code Module 06 Exercise 4's table does not have** — that is where the transcript
belongs, and it is now a runnable row rather than a predicted one.

**9449-W4 — the binding holds with no proof, so the S1 escalation does not happen.** This is the one that
gated another item's severity, and it resolves in our favour. Minting a DPoP-bound token
(`client_credentials` + a proof; `token_type: DPoP` confirms the binding), then introspecting it three ways:

| Presentation | `action` | Message |
|---|---|---|
| correct proof (control) | `OK` | `[A056001] The access token is valid.` |
| **no `dpop` at all** | **`UNAUTHORIZED`** | **`[A065308] Expected a DPoP header but none was provided.`** |
| proof signed by a different key | `UNAUTHORIZED` | `[A065309] Thumbprint of the provided DPoP key does not match the expected DPoP thumbprint.` |

`RFC9449-…` F-2's case 3 — *"whether Authlete's `/auth/introspection` still enforces the `cnf.jkt` binding is
unknown"* — is closed: **it does, and it fails closed.** A stolen bound token presented as a plain `Bearer` at
`/api/gm/*` does **not** work, so sender-constraint is not defeated there and **F-2 stays S2**. This is the
same posture as UserInfo under a different code (`[A065308]` here, `[A089311]` there), and the challenge
Authlete returns already carries the `DPoP` scheme plus an accurate `algs` list — so `AGENTS.md`'s existing
rule (*forward `responseContent` verbatim; do not hand-write a DPoP challenge where Authlete answers*) applies
to this endpoint too. The `UNVERIFIED` comment at `middleware/require-grant-ownership.ts:64` can now be deleted
rather than re-dated, and **T1-10 remains a conformance fix, not a vulnerability fix.**

**6749-W1 — the vendor does not reject dual channels, and this server does not collapse them either.** Three
calls to `/auth/token` with credentials on **both** channels at once (top-level `clientId`/`clientSecret`, the
shape an AS derives from `Authorization: Basic`, plus `client_id`/`client_secret` inside `parameters`):

| Top-level | In `parameters` | Result |
|---|---|---|
| correct | correct | `OK` — token issued |
| correct | **wrong** | `OK` — token issued. The body secret is simply ignored |
| **wrong** | correct | `INVALID_CLIENT` — `[A157305] The client secret presented by the client does not match the expected one.` |

So §2.3.1's *"The client MUST NOT use more than one authentication method in each request"* is unenforced at
**both** layers, and Authlete's precedence is top-level-wins — identical to what `AGENTS.md` documents for this
server. Authlete's [strict-checking page](https://developers.authlete.com/configuration-reference/endpoints/strict-checking-on-client-authentication-parameters)
was fetched and is **silent on the question**: it governs *method matching* (*"Authlete version 2.0 and later
strictly check client type and client authentication method settings"*), says nothing about presenting both,
and states no precedence rule. The probe is therefore the authority, not the page.

**And the probe corrected the finding's mechanism.** `RFC6749-…` F-1 says this server resolves the conflict —
*"Basic silently wins"*, quoting the `clientId`/`clientSecret` assignment. It does not. `parameters` is
preferentially **`req.rawBody`** (`token.service.ts:42`), so body-supplied `client_id`/`client_secret` are
forwarded to Authlete **untouched**; the `excluded` set that drops them runs only on the JSON fallback path.
This server therefore *emits* the dual-channel request I probed, and **Authlete** picks the winner. Same
observable outcome, different layer — and it is the **third** consequence of one design choice, after raw-body
fidelity for signatures and the RFC 9700 F-1 credential leak. **Rule: when a finding quotes a variable
assignment in these two services, check what actually goes on the wire — `rawBody` bypasses the assignment.**
The decision left for Gate 4 is unchanged in substance but narrower in scope: **reject dual presentation
locally with 400 `invalid_request`, or document Basic-wins as inherited vendor behaviour.** Rejecting is the
only option that makes this server *stricter* than Authlete rather than merely agreeing with it.

**GM-W2 — the whole authorization side already worked; nobody had tried it.** `GRANT-MANAGEMENT.md` F-2
predicted this ("*this is very likely a documentation and verification gap*") and the prediction was right.
Four calls, no browser, no code change:

1. `/auth/authorization` with `grant_management_action=create` in `parameters` → `action: INTERACTION` + ticket.
2. `/auth/authorization/issue` (subject `admin`) → `LOCATION` with a code.
3. `/auth/token` → `action: OK`, and the response body carries **`grant_id`** alongside
   `access_token, token_type, expires_in, scope, refresh_token, id_token`. **§5.5 is satisfied**, and
   `token.controller.ts:52` forwards `responseContent` verbatim, so it is satisfied *through this server* with
   no work at all.
4. `POST /gm` with `gmAction: QUERY` → `[A277001]` and `{"scopes":[{"scope":"grant_management_query openid"}]}`.

Then the half the acceptance criteria actually named — **`GET /api/gm/{grant_id}` through this server**, which
is the first time `requireGrantOwnership` has ever been exercised against a real grant-bearing token:

| Request | Result |
|---|---|
| correct grant + `Bearer` | **200** with the grant document |
| wrong grant id + the same token | **403** `access_denied` — *"The access token is not associated with the requested grant"* |
| `DPoP` scheme, same (unbound) token | **401** `invalid_token` — *"Access token is invalid or expired"* |

The third row is **9449-W3/F-2 case 1 reproduced on demand**, and it exposes something the finding did not
name: the refusal message is **wrong about why**. The token is neither invalid nor expired — the extractor did
not recognise the scheme. When T1-10 lands, that string is part of the fix, not just the `startsWith("Bearer ")`
check above it. **GM-W2 is closed and GM-W5 is confirmed as pure documentation**: `docs/GRANT-MANAGEMENT.md`
and Module 10 record that all five advertised actions are real, that three of them need no AS code, and that
the grant query works end to end.

**Two things found in passing, both cheap and both worth keeping.**

**The issuer/host mismatch is live and visible in one call.** `/service/configuration` reports
`issuer = https://blackadi.dev` while `token_endpoint = https://cecile-soapsudsy-zoila.ngrok-free.dev/api/token`.
That is **DR-11 / 8414-W1 / 8414-W2** observed rather than inferred, and it is why the JWT-bearer `aud` in the
probe had to be `https://blackadi.dev` — a reader following Module 06's lab against the tunnel host would fail
with `[A314314]` and have no idea why.

**The vendored 3.0.16 spec's `/gm` request schema is internally inconsistent.** It declares
`required: ["token"]` while its properties define `accessToken` and no `token` at all. Harmless — the SDK
models the properties, and the call works — but it is a second instance of the standing rule that **Authlete's
schema predicts nothing**, this time within a single object.

**What this leaves.** T1-17 is complete; **all five results are recorded whichever way they came out**, which
was the point. Net effect on the plan: 7523-W2 downgraded to defence-in-depth, 9449-W3 held at S2, GM-W2
closed, GM-W5 confirmed documentation-only, 8628-W6 closed with no follow-up, and 6749-W1 reduced to a
one-line Gate 4 ruling with both options costed.

### 2026-08-12 — B1-W6: the `ID_TOKEN_REISSUABLE` branch was calling the wrong API

**Why this matters to a future session:** **`idTokenReissuable` is now `true` and it stays true.** A refresh
request carrying `openid` returns **200 with a reissued `id_token`**, where until today it returned **400
carrying a valid token body**. `token.controller.ts` and `token.operations.service.ts` are both on the
Security-critical surfaces list, so this went through plan mode.

**The finding is about the work item, not just the code.** B1-W6 was written from the symptom — *"it requires a
`ticket` Authlete does not send"* — and its acceptance criteria followed: *"the branch issues from the fields
Authlete actually sends."* That reads as *call `/auth/token/issue` with better arguments*, and **no arrangement
of arguments to that API would ever have worked**, because it is the ticket-consuming API and this action has no
ticket. There is a dedicated one, and the vendored 3.0.16 spec is explicit: `POST /idtoken/reissue`, *"expected
to be called only when the value of the `action` parameter in a response from the `/auth/token` API is
ID_TOKEN_REISSUABLE"*. **The repo already wrapped it** — `TokenManagementService.reissueIdToken()`, written for
the admin route — so the fix reached for an existing method and widened its signature rather than adding one.

Set this beside probe §15's lesson. *Handled*, *exercisable* and *correct* were three different claims; so were
***the fields are wrong*** and ***the API is wrong***. A symptom-derived work item can name a remedy that
cannot work, and the tell was available all along: the acceptance criteria never said which endpoint.

**What `/auth/token` actually sends on this action**, read directly from Authlete rather than through the
server, because that is the only way to be sure what the branch has to work with:

| Field | Value |
|---|---|
| `ticket` | **ABSENT** — the whole defect |
| `subject` | `"admin"` |
| `accessToken`, `refreshToken` | present |
| `jwtAccessToken`, `idToken` | ABSENT |
| `responseContent` | `access_token`, `token_type`, `expires_in`, `scope`, `refresh_token` — **no `id_token`** |

**Three decisions worth knowing, in descending order of how easily they are undone.**

**1. `idTokenAudType` had to be sent, and it is a trap.** The reissue *request* has its own, and the spec says
it *"takes precedence over the `idTokenAudType` property of Service"* and **defaults to `"array"` on
omission**. T1-4 set the service to `"string"` deliberately (Mistake #7 / FAPI WG Nov 2024). Omitting the
parameter would have produced array-`aud` ID tokens **on exactly one code path** while every other ID token
here stayed a string — a configuration decision silently reversed for one call site, and nothing would have
failed. It is sent from a named constant that says it must move with the service flag. Verified live: string.

**2. A failed reissue returns 200 with the tokens Authlete already issued**, logged at `error`. The access and
refresh tokens exist by the time this action arrives, and no specification requires an `id_token` on a refresh,
so enabling a flag must not break a refreshing client on a server-side fault. This is safe *because*
`responseContent` carries no `id_token` — the degrade path cannot return a stale one, which is the fact that
had to be checked before choosing it. Deliberately different from `token.management.controller.ts`'s 400/500
mapping, where the caller asked to reissue and has no tokens riding on the answer.

**3. Every field is server-derived.** `sub` comes from `result.subject`, the tokens from the Authlete response,
and **nothing from `req.body`** — a client able to set `sub` could name any subject in an ID token this OP
signs, and `claims`/`idtHeaderParams` would let it choose the payload and the JWS header. Locked by a test that
puts an attacker's `sub`, tokens and claims in the body and asserts none of them reach the call.

**Verified live, and one claim deliberately left open.** Authorization-code flow with `openid offline_access`,
then a refresh: 200, `id_token` present, `aud` a **string**, `sub`/`iss`/`acr` unchanged, `iat` and `exp`
advancing — checked against a deliberate **4-second gap**, because a same-second refresh proves nothing about
freshness — and `auth_time` correctly holding the **original** authentication time. The reissued token **drops
`nonce` and `s_hash`**. Whether dropping `nonce` conforms to **OIDC Core §12.2 is `UNVERIFIED`**: that section
was not fetched for this change, and the behaviour is Authlete's either way. Named next action rather than a
guess — and note that ROPC is a dead end for testing this, because Authlete strips `openid` from the password
grant, so the action is only reachable through a real code flow.

**Verification.** `typecheck` clean · `lint` 0 errors / 4 pre-existing warnings · **644 tests / 58 files**
(was 635) — six controller cases including the body-injection regression, three service cases covering both
argument shapes. `check-docs.mjs` clean. Consumers updated in the same commit: `AGENTS.md` (the action-coverage
table row was wrong, plus a new note), `docs/DATA-FLOWS.md`'s flow diagram (it named `/auth/token/issue` with a
ticket), `B1-authlete-boundary.md` (**F-9**, new), `SERVICE-CONFIG-PROBE.md` §2/§3.3/§20, `OIDC-CORE-1.0.md`
(**OIDC-W5 closed**), the plan's T1-4 row and `RESUME.md`.

### 2026-08-12 — T1-5: the enum gap is closed, and T1-13 turned out to have no knob

**Why this matters to a future session:** **`authleteApi.service.get()` works.** `GET /api/fapi/config` and
`GET /api/fapi/status` return **200** with live values for the first time since 2026-08-06 — so the two
`fapi.controller.ts` call sites, Module 10 Exercise 4, and every document describing them have all changed
together. And **T1-13 is closed as unachievable rather than shipped**: `none` cannot be withdrawn from the
UserInfo or introspection signing-algorithm lists, because no Authlete 3.0 service field controls either one.

**The ruling that gated this.** DR-07 asked whether to drop `SPIFFE_JWT`, whose only cost was retiring a
working exercise. It was **approved with the curriculum rebuilt in the same commit**, and approved *after* a
read-only proof rather than on the mechanism — which is the part worth copying. The proof: one raw-HTTP
`service/get`, then filter the member out **in memory** and run the SDK's own
`Service$inboundSchema.safeParse` in-process. No write, no curriculum edit, and a definite answer.

**Four things the proof established that six documents had wrong or missing.**

| | Recorded belief | Measured |
|---|---|---|
| how many fields | "the whole **129**-field response" | **132** — the Tier 1 writes added three, and nine documents still said 129 |
| how many Zod issues | never captured; only `message: "Response validation failed"` | **exactly one**, at `supportedTokenAuthMethods.8`. Zod aggregates issues, so *one* is itself proof that nothing else in 132 fields fails |
| which fields carry the gap | `supportedTokenAuthMethods` | **three** — `supportedRevocationAuthMethods` and `supportedIntrospectionAuthMethods` share the enum. Both absent here, so the drop was one field; set either and it breaks again |
| is anything else waiting to break | unknown | **no.** Of 16 enum-typed fields reachable from `Service`, the other 15 match Authlete 3.0.16 member-for-member, and no field is Authlete-nullable while the SDK refuses null |

**The write, and the surprise in it.** `supportedTokenAuthMethods` went from nine members to five —
`SPIFFE_JWT` plus the three the ruling withdrew (`TLS_CLIENT_AUTH`, `SELF_SIGNED_TLS_CLIENT_AUTH`,
`ATTEST_JWT_CLIENT_AUTH`). Written by read → patch → write-all → read-back → key-by-key diff, as every write
in this audit is: **132 → 132 fields, two keys moved** (`supportedTokenAuthMethods`, `modifiedAt`). The
surprise was downstream: discovery went **64 → 62 members**, because withdrawing attestation also removed
`client_attestation_signing_alg_values_supported` and its `_pop_` sibling. **One withdrawal removed three
advertisements** — those two members exist only to describe that method. Note the 62 is not the audit's
earlier 62: that one lacked `acr_values_supported` and `authorization_details_types_supported`, which T1-6
added and which are still there.

**The asymmetry worth carrying into any SDK work.** The schema models **185** of Authlete's **193** service
properties and *silently strips* the 8 it does not know (`z.object` default, no `.strict()`), while one
unknown **value** in a modelled field is fatal. Tolerant of new fields, brittle about new values — so any
client-auth method Authlete ships is a breaking change for every TypeScript SDK caller whose service enables
it. Authlete's own OpenAPI document declares `SPIFFE_JWT`: **the vendor's specification is ahead of the
vendor's SDK**, so nothing was misconfigured. The authorization server was asked to stop advertising a real
capability so a client library could read its configuration, and that cost belongs in the report.

**CIMD-W3's premise was false, and that is a one-line fix.** `fapi.controller.ts` read
`clientIdMetadataDocumentSupported` through `(service as Record<string, unknown>)`, recorded as an SDK gap.
SDK 1.0.0 models the field in **both** the `Service` type and `Service$inboundSchema`. Typed access now, with
a comment saying so.

**T1-13: `none` is fixed vendor output.** The work item said *"drop `none` from
`userinfo_signing_alg_values_supported` and `introspection_signing_alg_values_supported` — console change"*.
There is no such console setting: **no Authlete 3.0 `Service` property lists either set of algorithms.** They
are derived from the service JWK Set, and `none` is unconditional — Authlete's own `service/configuration`
example in `docs/openapi-spec.json` carries it too. Established by *writing* the only candidates
(`userInfoSignatureKeyId`, `introspectionSignatureKeyId` → `rsa-1`) rather than by reading the schema: both
lists changed, losing `ES256` because pinning the RSA key drops the EC key as a candidate, and **`none`
survived both**. Reverted; only `modifiedAt` moved. This is **RPL-W4's shape a second time** — a work item
naming a knob the vendor does not have — and the sharper reading is that the advertisement is *accurate*:
`Client.userInfoSignAlg` accepts `NONE`, so an unsigned UserInfo response is a real selectable outcome, and
for introspection there is no client-side field at all, so the list describes the default unsigned response.
**JOSE-W2 and MS-W3 become documentation items.**

**Curriculum and docs, in the same commit** (`AGENTS.md`'s rule, and DR-07 said so explicitly): Module 10
Exercise 4 **rebuilt, not retired** — it now walks *three* answers to one request (invisible 200 → honest 500
→ live data) and lands on the closed-enum lesson, with the withdrawal verifiable in one `curl`; Exercise 7's
finding 4 changed from *"the endpoints fail"* to *"they under-report"* (six of eight §5.3.2.1 requirements,
and `dpopEnabled` is really `dpopNonceRequired`); the module README's capability table; `quiz-answers.md` Q12
(the two defects now have two dates); `AGENTS.md` (the `service.get()` note, a new bullet on the five
advertised methods, the PAR attestation gap, and the T1-13 finding); `docs/FAPI-TUTORIAL.md` Part 5 and
Part 7. **`AGENTS.md`'s claim that this is "an SDK enum gap, not a config error" was true and is now
historical.**

**One drift found by the §7.4 grep.** `FAPI-TUTORIAL.md`'s Part 7 troubleshooting entry still said the
endpoints *"return HTTP 200 with that error body"* — stale since the 2026-08-11 status clamp, which updated
Part 5 and missed Part 7. Same class as the Module 10 miss that produced CUR-3b-W2: **the fix updated the
place that explained the defect and not the place that helped you diagnose it.**

**Verification.** `typecheck` clean · `lint` 0 errors / 4 pre-existing warnings · **635 tests / 58 files,
unchanged** — no test asserts the broken shape, because `fapi.routes.test.ts` mocks `service.get()` and has
always exercised the working path. `check-docs.mjs` clean. Endpoints confirmed live, not inferred.

### 2026-08-12 — T1-4 + T1-6: four labs completed, and two changes deliberately not kept

**Why this matters to a future session:** **Module 09a has no `UNVERIFIED` markers left**, and each was
retired by *running the success path*, not by asserting it. Two intended changes were applied, verified and
then **reverted on purpose** — both reversions are the finding, not a failure.

**Service configuration now** (`supportedAcrs` and the RAR type are new; discovery went 62 → **64** members):

| Field | Value | Note |
|---|---|---|
| `accessTokenDuration` / `idTokenDuration` | **86400** | shortened to 3600, verified, **reverted** — see below |
| `refreshTokenDuration` | 864000 | untouched |
| `idTokenAudType` | **`"string"`** | new. ID-token `aud` is a bare string where it was `["…"]` |
| `idTokenReissuable` | **false** | set true, **broke the refresh grant**, reverted — see below |
| `supportedAcrs` | **`["pwd","mfa"]`** | new |
| `supportedAuthorizationDetailsTypes` | **`["payment_initiation"]`** | new |
| client `1523514379` | `authorizationSignAlg: ES256`, `bcDeliveryMode: POLL`, `authorizationDetailsTypes: [payment_initiation]` | new; 48 → 51 fields, no collateral change |

**The four labs, each with a live transcript now in `modules/09a…/lab.md`:**

- **JARM** — `response_mode=query.jwt` returns **one** query parameter carrying `{aud, state, code, iss, exp}`,
  ES256, signed with the service's `kid: "1"` and verified against the published JWKS. Its `exp` is **600 s**,
  not the deployment's 86400: the response JWT is a transport wrapper and is bounded like one.
- **CIBA** — the whole poll sequence. `NO_ACTION` **is** success in poll mode; `authorization_pending` is a
  **400**, so a polling loop must not treat 400 as terminal; and the `auth_req_id` is **single-use**, which
  answers Exercise 3d's standing question.
- **ACR** — both halves. `acr_values=pwd` succeeds and reaches the ID token *and* introspection; an
  **essential** `mfa` is refused with `unmet_authentication_requirements` `[A060305]` and **no code issued**.
  `mfa` was registered *because* nothing can satisfy it — an unregistered value fails earlier, for a different
  reason, and would demonstrate a different lesson.
- **RAR** — the round trip works, and **Exercise 5a's control had to be re-pointed**: its "unknown type" case
  used `payment_initiation`, the very type 5b now registers, so it would have quietly become a success. A
  control that has stopped being a control is worse than no control. It now uses `account_information`.

**Two reversions, and why each is the right outcome:**

1. **The 24-hour lifetime stays, deliberately.** `accessTokenDuration` → 3600 was applied and verified
   (`expires_in: 3600`, ID-token life 3600). Then the blast radius was enumerated: **~55** deployment-specific
   references, and two of them are *arguments*, not transcripts — **Module 07's audit lab** ranks the 24-hour
   lifetime as finding (iv), and **Module 10's thesis** (*individually acceptable settings combine into a
   defect*) uses the 24-hour token × the grant-revocation SHOULD-gap as its worked example. At one hour both
   largely evaporate. So **GM-W1 and FAPI1-W3 stay open by decision**, recorded here rather than silently, and
   OIDC-W4 closes on its *"record it as a deliberate teaching choice"* branch. The write is proven and
   reversible; re-doing it is one field plus the documentation pass.
2. **`idTokenReissuable` uncovered a broken handler.** Setting it `true` made the `ID_TOKEN_REISSUABLE` action
   reachable for the first time — and the branch is wrong. Authlete sends that action with `subject` and a
   complete `responseContent` but **no `ticket`**; `token.controller.ts:157-163` guards on `if (!ticket)` and
   falls through to `res.status(400).send(result.responseContent)`. **Every refresh request returned HTTP 400
   carrying a valid token response**, and no ID token was ever reissued. Reverted within the session. New work
   item **B1-W6**, which needs plan mode — it is token issuance.

   The general lesson is worth more than the bug: the probe entry had already recorded this branch as *"dead
   code on this service"* and noted that **handled ≠ exercisable**. There is a third claim: **handled,
   exercisable, and *correct*.** A config flag was the only thing hiding a defect, and turning it on is the
   only way that was ever going to surface.

**One more finding, from a failed test rather than a passing one.** `NO_INTERACTION` is **not** only the
`prompt=none` path: a request with *no* `prompt` parameter reaches it whenever it asks for `offline_access`,
because OIDC Core §11 requires explicit consent (verified across all four combinations). So **before T1-7,
every `offline_access` request without `prompt=consent` also got the empty-`Location` 302** — a second live
symptom of that S1, on a request shape nobody was looking at. T1-7 fixed both; only one was known. The audit's
own framing in `OIDC-CORE-1.0.md` F-1 and `RFC9470-…` F-3 is corrected accordingly.

**`aud` changed shape**, so Module 08's lesson inverted: it taught *"`aud` is an array here, and `AGENTS.md`
recommends a string"*. Both are legal, and the pair now teaches something better — a validator written
`claims.aud === clientId` was broken a fortnight ago and works today, while `claims.aud.includes(...)` was
fine then and **throws now**. One console flag, two naive validators broken in opposite directions, no
specification changed.

### 2026-08-12 — T1-2 + T1-3: two configuration writes, and an `UNVERIFIED` marker that was wrong for a fortnight

**Why this matters to a future session:** **no source file changed.** Two Authlete writes closed four work
items (**OIDC-W2 = FAPI1A-W2**, **7523-W4 = 9101-W3**) and made three specifications runnable that previously
had no path at all. The suite is untouched at **635 tests / 58 files**; that number staying still is the
evidence that this was configuration, not code.

**What was written.** Both through raw HTTP, because `service.get()` throws on this service (the `SPIFFE_JWT`
enum gap) and the SDK's outbound schemas strip fields they do not model:

| | Change | Read-back diff |
|---|---|---|
| **T1-2** | one RSA-2048 key (`kid: "rsa-1"`, `use: "sig"`, **no `alg`**) appended to the service JWK Set | 129 fields round-tripped; **`jwks` + `modifiedAt`, nothing else** |
| **T1-3** | a fourth client, `2176571218` — CONFIDENTIAL, `tokenAuthMethod: PRIVATE_KEY_JWT`, EC P-256 public JWKS, `requestSignAlg: ES256` | created `201`, all 12 sent fields present on read-back |

**Three things worth carrying:**

1. **Omitting `alg` is the whole trick.** RFC 7517 §4.4 makes `alg` OPTIONAL (fetched and verified), so
   Authlete offered every algorithm the key supports: `id_token_signing_alg_values_supported` went from four
   entries to ten, gaining RS256 *and* PS256 — one key, OIDC Discovery §3's `MUST` **and** FAPI §5.2.2's
   requirement. Pinning `alg: RS256` would have satisfied only the first. **Four** advertised lists changed,
   not one, because all four are derived from the same key set. The cost: the FAPI-discouraged `RS256` comes
   along and cannot be separated.
2. **Advertised was checked against usable.** The audit's Theme 1 is *"advertised but unusable"*, so shipping
   six new algorithm names and calling it done would have been the audit committing its own finding. RS256
   was proved by issuing an ID token (`{"kid":"rsa-1","alg":"RS256"}`) and validating it; `private_key_jwt`
   by authenticating on two grant types; the request-object signature by **flipping one byte** and getting
   `[A005328]`. **PS256 is still only advertised**, and that is stated rather than glossed.
3. **An `UNVERIFIED` marker was wrong, and three documents inherited it.** Module 08 §3d said *"Both clients
   here are still `HS256`"* and marked its asymmetric branch unverified since 2026-07-28. Only the
   *confidential* client is HS256 — both public clients have been ES256 the whole time, a fact recorded in
   the audit's own `OIDC-CORE-1.0.md` F-2 two paragraphs above the clause that contradicted it. The
   remediation plan's §6.2 then listed the branch as "completed by OIDC-W2". **Nothing was blocking it; the
   two-command check had simply never been run.** It runs now — all thirteen `§3.1.3.7` steps `PASS`. The
   marker is retired by *running the branch*, not by the RSA key.

**Curriculum, in the same commit** (the §7.4 grep found two hits the lab-breakage register had missed):

- **Module 00 Ex 2** — CUR-3a-W3. Selects by `kty === "EC"`, no `keys[0]`, no `key count: 1`, plus two
  sentences on why you never index into a JWKS.
- **Module 08 §3d** — real ES256 transcript; the marker retired; a new note that the validator's
  `keys.length === 1` fallback can no longer fire, so `kid` selection is finally load-bearing. *A fallback
  that always fires is a check you are not running.*
- **Module 08 §6d** — **the transcript inverted.** It printed the RS256-less list and reasoned about the
  violation; both transcripts are now shown, dated, as one exercise about metadata being *derived*.
- **Module 05** — new **Step 4b**: asymmetric JAR against the pre-registered client, and the
  `[A005336]` vs `[A008311]` contrast Step 3 had only described in prose. Step 3 was **kept** — generating a
  key and checking `d` is absent is the exercise, and 9101-W3's *"replace it"* wording would have deleted the
  teaching to satisfy the work item.
- **Module 06 Ex 4** — §2.2 for real, where the lab previously stopped at *"That is Module 10's territory."*
  Two behaviours established while writing it: this deployment accepts **either** the issuer or the token
  endpoint as `aud` (anything else → `[A157318]`), and **`jti` replay is not enforced** — the same assertion
  authenticates twice, which RFC 7523 §3/§6 permit.
- **Module 10**, **Module 11**, `docs/DEVELOPMENT.md`, `curriculum.env.example` — the "neither client has a
  JWKS" claim, the "one EC P-256 key" claim, and the two new env variables.

**Two live-drift findings.** Client `1523514379` had acquired a JWKS between the 2026-08-10 probe and now —
written by `tests/e2e/e2e.test.ts:1169`, which registers a public key whose private half it then discards. It
is inert, it is **left in place**, and it means the **E2E suite mutates shared service state**: no client
snapshot in the audit survives a test run. And the first `PKJWT_PRIVATE_JWK` was echoed to a terminal by an
unquoted `.env` value, so **the client key was rotated** (`pkjwt-1` → `pkjwt-2`) rather than kept.

**Open, deliberately.** PS256 unexercised; `none` still advertised for UserInfo (T1-13); by-reference JAR
still unreachable (9101-W2); `private_key_jwt` available but required of nobody, which is the FAPI gap and
not this item's job.

### 2026-08-12 — T1-7: `prompt=none` gives a real answer, and the trap behind the obvious fix

**Why this matters to a future session:** **the latent S1 is retired, not deferred.** The register is now
8 found / 5 downgraded-or-retired / 3 open, and none of the three is directly exploitable. `prompt=none`
returns a code or a §3.1.2.6 error, and **`EXCEEDS_MAX_AGE` is reachable for the first time**.

Two findings in one code path, and the audit was emphatic that fixing either alone was worse than fixing
neither (`OIDC-CORE-1.0.md` OIDC-W1: *"Same change as 9470-W3 — do not split"*). It was right, and the reason
is worth carrying.

**The visible bug.** `case "NO_INTERACTION"` did `res.redirect(result.responseContent ?? "")`. Authlete
answers `prompt=none` with `NO_INTERACTION`, a ticket, and **`responseContent: null`** — a *"you decide"*
answer, not a redirect URL. So every silent-renewal request got a **302 with an empty `Location`**: neither
success nor one of OIDC Core §3.1.2.6's four errors, and no client error handler can classify it.

**The trap.** The controller already contained `prompt=none` logic — inside `case "INTERACTION"`, which such
a request never reaches. Dead code that read as a feature. And it opened by **inventing an authentication
event**: `acr: "pwd"` with no evidence a password was used, `auth_time: now` for an event at an unknown
earlier time, both passed to Authlete to be stamped on the tokens — with no `max_age` and no essential-`acr`
check anywhere on that path, because those run on the login POST that `prompt=none` bypasses. **Routing
`NO_INTERACTION` into that block — the obvious one-line fix — would have armed a step-up bypass.** A resource
server enforcing RFC 9470 would have accepted freshness the OP fabricated: a security control silently not
applied, which is worse than the visible bug, and it would have arrived labelled as progress.

**What shipped.** `decideWithoutInteraction` follows Authlete's contract — `NOT_LOGGED_IN` →
`CONSENT_REQUIRED` → step-up → issue — and the fabrication block is deleted. The decision runs through a new
pure function, **`server/src/utils/step-up.ts`**, whose whole rule is one sentence: *an authentication this
OP did not observe is one it will not assert.* An unknown `acr` does not satisfy an essential `acr` request;
an unknown `auth_time` does not satisfy a `max_age`. "We cannot prove it" is answered as "no", never as "skip
the check". `session.controller.ts` was refactored onto the same function, so there is one implementation of
the check rather than two that can drift. The dead `INTERACTION` branch **delegates** instead of being
deleted, so it cannot diverge if Authlete's action ever changes.

**A finding about the plan itself: T1-8 was subsumed, and its framing was wrong.** 9470-W2 says the `max_age`
check "cannot fail" because `authTime` is set immediately before it is read. True — and **correct**: that is
the login POST, where the End-User has just actively authenticated, so any maximum age is satisfied by
construction. The place `max_age` must be able to fail is the path that does *not* re-authenticate, and that
path did not exist until this change built it. Recorded in the entry rather than closed silently.

**Verified live**, with a real session and cookie jar: no session → `login_required` (with `state` and `iss`
echoed); session + stored consent → a real code; `max_age=3600` → a code; **`max_age=0` against a
two-second-old session → refused**. No Authlete token call was needed for any of it.

**Module 08 Exercise 5c/5d is now the best exercise in the module**, because the trap is the lesson. 5c gains
the real transcript including the `max_age=0` row; 5d keeps its diagnosis, then asks the reader to compare
their proposed `NO_INTERACTION` branch against the dead code — and shows why the obvious answer would have
been a regression. It closes on the term the audit uses: a **latent** finding is one that is not exploitable
in the code as it stands but is armed by a change someone is already planning. Those are worth hunting
precisely because the fix that activates them looks like an improvement. Q13's answer key gains a bonus mark
for spotting it.

**Checked and deliberately not changed:** `modules/05…/lab.md:32` also warns about an empty `Location`, but
from a different cause (`parRequired: true` makes the AS return a 400 body, not a redirect) — unaffected.
`modules/02…/README.md:263` and `GLOSSARY.md:85` remain accurate.

**Verification.** typecheck clean; lint 0 errors (same 4 pre-existing warnings); **635 tests / 58 files**, up
from 613 — 15 on the pure checker plus 8 controller cases including the two fail-closed-on-absence paths.
`check-docs.mjs` clean at 167 files. `test:e2e` not run. No Authlete probe and no service write.

### 2026-08-12 — T1-1: the introspection oracle is closed, and 21 lab commands grew a `-u`

**Why this matters to a future session:** **every introspection call in this repo now needs
`-u "$MGMT_CLIENT_ID:$MGMT_CLIENT_SECRET"`** — six module labs, both root scripts, three tutorials and the
SPA. And the S1 register is down to four open, none of them directly exploitable.

Both endpoints carried **no middleware at all**: no authentication, no rate limiter. Anyone who could reach
the server could post a string and learn whether it was a live token, then harvest `sub`, `scope`,
`client_id` and `exp` from the hits. RFC 7662 §2.1 names exactly this — *"To prevent token scanning attacks,
the endpoint MUST also require some form of authorization"*. The proprietary `/api/introspection` was the
richer leak: it also returns the RFC 9470 `acr`, `auth_time` and step-up challenge, so it disclosed **how
strongly a user authenticated and when**.

**What shipped:** admin Basic auth (`requireBasicAuth`, which fails closed) plus `generalLimiter` on both.
Four decisions worth knowing:

- **The gate runs before the Authlete call.** That is what closes the oracle — not the status code. A check
  that authenticates *after* the lookup still leaks through timing and error shape. Asserted directly: the
  tests require that Authlete is never called on a rejected request.
- **It is admin auth, not client auth, and the entry says so plainly.** §2.1 requires "some form of
  authorization" and names client authentication only as an example, so the MUST is met. But nothing in this
  server can validate a client secret — only Authlete can — and **whether Authlete's `standardProcess`
  rejects bad client credentials is unestablished**. Demanding a credential nothing validates would look like
  protection and provide none. Recorded as **7662-W6**, a behavioural probe.
- **7662-W3 was satisfied by deleting code, not by adopting `parseBasicAuth`.** The old block decoded
  `Authorization: Basic` and forwarded it to Authlete as `client_id`/`client_secret`. Once the header carries
  *admin* credentials, doing that would ship this deployment's management secret to the vendor labelled as
  somebody's client secret. Client credentials still work — they belong in the body.
- **Two different 401s now exist on `/api/introspection`,** and the docs teach the difference: ours is
  `WWW-Authenticate: Basic realm="introspection"` ("you may not ask"), Authlete's is
  `Bearer error="invalid_token"` ("the answer is no"). Verified live, both.

**The curriculum cost was the real work: 21 call sites.** Most was mechanical, but **a regex sweep was the
wrong tool and nearly caused a defect** — it added credentials to Module 07 Exercise 5a's *deliberately
unauthenticated* call, destroying the contrast the exercise is built on. Caught by re-reading every hit.
Worth remembering: a mechanical edit across a curriculum will silently "fix" the examples that are supposed
to be broken.

**Two exercises inverted and were reframed rather than deleted.** Module 04's *"Break it — is the
introspection endpoint protected?"* used to reproduce the finding live; it now shows the `401` as the after,
keeps the exploit reasoning as the before, and gains three audit questions the fix invites — does the check
run before the work, does it fail closed, and is it the *right* credential. Module 07's Exercise 5a compared
two sibling endpoints with "opposite postures"; they now have the same posture, and the exercise gained a
better lesson: `introspection_endpoint_auth_methods_supported: []` is *still* accurate, because no **client**
auth method is supported there — so metadata can be accurate about a capability and silent about a control.

**Three citations were wrong before this change**, all in `docs/STEP-UP-AUTH-TUTORIAL.md`:
`introspection.controller.ts:47` pointed at a 400-return rather than the step-up parser, the client
`token.service.ts:117` pointed at an unrelated line, and a test-count claim said 5 where the file has 4. That
is the third consecutive session in which the pre-existing citation drift outnumbered the drift the change
itself caused.

**Verification.** typecheck clean; lint 0 errors (same 4 pre-existing warnings); **612 tests / 57 files**, up
from 589 — 20 of them a new `tests/unit/routes/introspection.routes.test.ts` covering both endpoints, five
rejection shapes, the fails-closed case, a 429, and a regression that the admin credentials never reach
Authlete. `check-docs.mjs` clean. Client builds; 109 client tests green. `test:e2e` not run. Live: both
endpoints 401 unauthenticated with the right challenge, 200 authenticated, and no Authlete call on rejection.

### 2026-08-12 — T0-4: §3 matches per client now, and the field Authlete does not have

**Why this matters to a future session:** **Tier 0 is complete.** Next is Tier 1, starting with T1-1 — the
introspection endpoints still carry no middleware at all, which is the last easily-exploitable open S1.
Also: **`GET`/`POST /api/logout` no longer redirect anywhere unless the request identifies a client.**

RP-Initiated Logout §3 asks for two things and the deployment was meeting one:

> …does not exactly match one of the **previously registered** `post_logout_redirect_uris` values.

*"Exactly match"* was fixed on 2026-08-10 (origin comparison, replacing a `startsWith` open redirect).
*"Previously registered"* was not: the list came from `ALLOWED_ORIGINS`, a **deployment-wide** env var, so
every client shared one list and any client could be sent to any other client's target. That is a different
security model, and a weaker one.

**The plan was to register the URIs on the clients and then match against them. The first half is
impossible.** Authlete 3.0 has **no client field for post-logout redirect URIs**. Checked three ways against
the vendored `docs/openapi-spec.json` (API Explorer 3.0.16): **0 of the `Client` schema's 108 properties**
contain "post"; **0 of 33 schemas** define a post-logout member; `ClientExtension` carries only scopes and
durations. Its only client-level logout fields are `backchannelLogoutUri` and
`backchannelLogoutSessionRequired`.

**And the write appeared to succeed.** Sending `postLogoutRedirectUris` through `client/update` returned
**HTTP 200** with the field silently discarded — no error, no warning. A before/after key-by-key diff of all
three clients showed nothing changed but `modifiedAt`. **A vendor that accepts and discards is worse than one
that rejects**: a 400 costs minutes, a 200 costs an afternoon and then resurfaces as "logout stopped
redirecting" with nothing pointing at the cause. The rule to carry: **when a configuration write is
load-bearing for a security decision, read it back.**

**What shipped instead.** The registry is the deployment's own — `POST_LOGOUT_REDIRECT_URIS`, a JSON
`clientId → string[]` — and the comparison is `===` per element. The departure from §3 is now *where the
registration is stored*, not what the rule is. Four decisions:

- **Client identity comes from `client_id`, else the `aud` of a *verified* `id_token_hint`.** §2 makes
  `client_id` OPTIONAL precisely because the hint can name the RP, and §3 needs that identity. So T0-2's
  verifier gained a verified `audience` alongside `subject`, and the hint is now verified whenever it could
  supply either piece — not only when the session lacks a subject. An `aud` naming several clients yields no
  client.
- **No client ⇒ no redirect.** An unidentified client has an empty registered set, and §3's answer for an
  empty set is to refuse. Not caution — conformance.
- **All the `new URL()` parsing is gone.** It existed to compare *origins* safely. Matching whole registered
  URIs needs a string comparison, and a check with no parser cannot have a parser bug. Both 2026-08-10
  payloads are still refused, now because nobody registered them.
- **The non-production `localhost` clause is gone**, so `http://localhost:31337/bye` — Module 08 Ex 6b's "row
  that still redirects" — is refused. There is no environment where an unregistered URI redirects.

**Two more findings fell out of this, both worth more than the fix.** `SERVICE-CONFIG-PROBE.md` §10 recorded
`postLogoutRedirectUris` as client metadata that was merely *unset*; it is not a field at all, so that row was
withdrawn. And the audit spelled Authlete's back-channel field **`backChannelLogoutUri`** (capital `C`) in
three places — the real name is **`backchannelLogoutUri`**. The BCL conclusion survives, because the correctly
spelled key is also unset, but the probe was reading a key that *cannot* exist and so could not have returned
anything else. Both are the audit correcting itself, the pattern `RESUME.md` §2.5 tracks: **every instance so
far arose where the audit reasoned from a name it had inferred rather than one it had read.**

A third is recorded but not fixed: `audit/02-findings/CLIENT-UPDATE-FIELD-LOSS.md`. `buildClientInput` names
roughly forty of Authlete's 108 `Client` fields, and the SDK's `ClientInput` strips unknown keys — so an admin
`PATCH /api/client/update/:clientId` may silently clear what it does not name. The full-object round trip is
**verified** lossless; whether a *partial* update clears the rest is marked **`UNVERIFIED`**, because the test
is destructive on a shared service. **CU-W1 settles it on a throwaway DCR client and gates whether CU-W2 is
needed at all.**

**Module 08 Ex 6b keeps its shape and gains its best lesson.** The POST loop now sends `client_id`; row 4
flips 302 → 200. A new four-line block shows the same URI accepted for one client, refused for no client,
refused for an unknown client, and refused with a trailing slash — three §3 lessons in one transcript. The
exercise closes on the vendor gap: **a specification's MUST can be unsatisfiable in the form the specification
imagines, because your IdP does not model the field.** The honest response is to implement the *property* the
requirement exists to provide, record precisely where you depart and why, and make that a stored fact rather
than folklore. The two-findings table is now three, with the two clauses of §3 separated.

**Verification.** typecheck clean; lint 0 errors (the same 4 pre-existing warnings); **589 tests / 56 files**,
up from 569. `check-docs.mjs` clean. `test:e2e` not run. Live: both Ex 6b loops plus the four-case client
matrix, re-run against a local server. Authlete calls: 1 read + 3 writes + 1 verification read = **5**, all
announced, net effect `modifiedAt` only.

**Citations re-anchored by content.** `logout.service.ts` moved this time — the change is inside the matcher,
above everything cited — so 13 references were re-resolved by matching content, not by offset. Two of them
described code that **no longer exists**: `ALLOWED_ORIGINS` and `NODE_ENV` are no longer read by the logout
service at all, so those `00-inventory.md` entries were rewritten rather than renumbered. That is the case
§7.4 step 7 warns about — sometimes the target is gone, not moved.

### 2026-08-12 — T0-3: logout stopped happening on a `GET`, and Module 08 Ex 6b grew a second half

**Why this matters to a future session:** **`GET /api/logout` no longer logs anybody out.** Anything that
drove logout with a bare `GET` — a script, a lab step, a smoke test, an `<img>` tag — now gets a confirmation
page. Tier 0 is down to **T0-4 alone**, and T0-4 is blocked on a console change (RPL-W4).

RP-Initiated Logout 1.0 §2:

> At the Logout Endpoint, the OP SHOULD ask the End-User whether to log out of the OP as well. Furthermore,
> the OP **MUST** ask the End-User this question if an `id_token_hint` was not provided or if the supplied
> ID Token does not belong to the current OP session.

The server never asked. It destroyed the session on a bare `GET` with **no middleware at all** — so
`<img src="http://localhost:3000/api/logout">` on any page logged its viewer out. That is a MUST violation on
its own, and it also made the 2026-08-10 open redirect reachable without the victim intending to log out.

`GET /api/logout` now renders `views/logout-confirm.ejs`: a question, a CSRF token, and every RP parameter
replayed as a hidden field. `POST /api/logout` — behind the same `middleware/csrf.ts` the device flow's
browser paths use — does the verifying, delivering, destroying and redirecting. Four decisions worth knowing:

- **The question is unconditional**, which meets §2's SHOULD as well as its MUST. The narrower reading (skip
  the page when a verified hint names the session's subject) was considered and rejected: it leaves a `GET`
  that still destroys a session, so a captured `id_token_hint` would stay a forced-logout primitive.
- **Parameters are read body-first, query second.** §2 blesses both GET and POST for the logout request, so
  the form body is the spec-shaped source. Merging widens nothing — unlike `introspection.service.ts`'s
  server-determined fields, nothing here is a value a caller must not choose.
- **The CSRF token is single-use and the logout destroys the session holding it**, so a scripted logout needs
  one `GET` per `POST`. Verified live: a reused token returns `403`. Every consumer recipe was rewritten to
  do the two-step (`CURL-TEST.md` §11/§13d, `test-all.sh`, `docs/BACKCHANNEL-LOGOUT-TUTORIAL.md`).
- **The rate limiter was deliberately not added.** F-1's second aggravating factor ("no rate limiter") stays
  open and recorded rather than being closed outside RPL-W3's acceptance criteria.

**`docs/DATA-FLOWS.md` had documented this page and a `POST /api/logout` since before either existed.** The
change makes it true. Its other branch — a `400` on an invalid `post_logout_redirect_uri` — described
behaviour that has never existed either, and was corrected in the same pass: an invalid redirect does not fail
the logout, it just lands you on the signed-out page. Documentation ahead of the code rather than behind it is
a drift class no checker catches, and this is the second time this endpoint has produced one.

**Module 08 Exercise 6b was reframed, not retired**, and it is a better exercise for it. Its five-URI loop
used to *discriminate* redirect-from-render; under a confirm-on-`GET` rule every row returns `200`, which
would have left the exercise teaching nothing. It now runs twice:

1. the original `GET` loop, whose five identical `200`s **are** the new lesson (§2, and the CSRF consequence);
2. a new `POST` loop that preserves the original discrimination exactly — rows 1 and 4 redirect, rows 2, 3
   and 5 do not.

Plus a third snippet proving the single-use token. **All three transcripts were run against a live local
server**, not reasoned about; none of the three paths makes an Authlete call (no `id_token_hint`, no
`backchannel=true`), and the server makes none at boot. The exercise closes on a new table separating the two
findings this one endpoint carries — §3's *"exactly match"* (fixed 2026-08-10, cost the attacker the
destination) and §2's *"MUST ask"* (fixed here, cost the attacker the trigger) — with the point that neither
fix subsumes the other.

**Verification.** typecheck clean; lint 0 errors (the same 4 pre-existing warnings); **569 tests / 56 files**,
up from 553 / 55 — a new `tests/unit/routes/logout.routes.test.ts` (10) plus 7 service tests. Reverting to a
one-shot `GET` fails 8 of them. `check-docs.mjs` clean at 166 files. `test:e2e` not run; its logout assertion
accepts `[200, 302]` and is unaffected.

**Citations re-anchored by content, per the §7.4 checklist.** `logout.service.ts` was edited so that **not one
cited line moved** — the parameter read stayed two lines and both new blocks were appended after everything
cited. `logout.controller.ts` shifted uniformly by +19 below the new export, which was *verified line by line
rather than assumed*: 13 citations across `00-inventory.md`, `OIDC-BACKCHANNEL-LOGOUT-1.0.md`,
`JOSE-rfc7515-7517-7519.md` and this file. **Two were already wrong before this change** —
`RESUME.md`'s §6 S1 table (then at `:243`) still carried the pre-2026-08-10 range `:33-63`, and `JOSE:145` pointed at a `jwt.decode` in
`logout.service.ts` that T0-2 deleted. Both fixed. `check-docs.mjs` sees neither class: it validates only that
a `server/`|`client/` ref is not past EOF.

**One thing found and not fixed, for T2-2.** `exams/final-exam.md:76` still states that the logout endpoint
"validates `post_logout_redirect_uri` with a `startsWith` prefix check" — stale since 2026-08-10, and **not**
in T2-2's current scope, which names Module 10 ×5 plus `final-exam-answers.md:227-229`. The question and its
answer key drifted apart. Add it to T2-2.

### 2026-08-11 — T0-2: `id_token_hint` became a signed assertion again, and BCL-W5 is unblocked

**Why this matters to a future session:** **a client may now register a `backchannel_logout_uri`.** That was
gated on `RPL-W2`, and `RPL-W2` is done.

`logout.service.ts` used `jwt.decode` on `id_token_hint` and took `payload.sub` as the End-User — and that
subject drives back-channel logout delivery. So anyone could hand-craft an **unsigned** JWT naming any subject
and call `GET /api/logout?backchannel=true&id_token_hint=<forged>` to force that user out of every RP with a
registered logout URI. It was inert only because no client had registered one; registering the first would have
turned it into a remote forced-logout primitive. RP-Initiated Logout §2 defines the hint as an *"ID Token
previously issued by the OP"* — an assertion, whose value is its signature.

The verifier is a **pure** function, `utils/verify-id-token-hint.ts`, so all 21 of its branches are testable
without network or SDK access. Five decisions in it are worth knowing:

- **Keys come from Authlete's service JWKS, not `JWKS_URI`** — that env var is unset here (it is the root of
  BCL-W3), so reusing it would have broken the feature for an unrelated reason.
- **The expected `iss` comes from live discovery, not `JWT_ISSUER`** — which is also unset, and using it would
  have silently disabled the `iss` check. Both are cached for five minutes.
- **Algorithms are pinned to the nine asymmetric ones `jsonwebtoken@9` supports.** `alg: none` and the `HS*`
  family are refused. **Consequence:** client `1523514379` signs ID tokens with `HS256` (probe 2 §7), which is
  symmetric, so *its* hints are now ignored. Logout still works for its users via the session cookie. The real
  fix is moving that client to `ES256` — one console field, adjacent to T1-5.
- **`exp` is deliberately not enforced.** A hint is an old token by definition — sessions here last 30 minutes.
  The signature is what proves the OP issued it. Reported as `hintExpired` in the log. *`UNVERIFIED`: whether
  §2 says anything explicit about expired hints was not checked against the primary source.*
- **`aud` is pinned only when `client_id` is supplied**, because §2 makes `client_id` OPTIONAL.

**Failure is never an error to the caller**: the session is still destroyed, the cookie cleared, the redirect
validated. There is simply no subject, so nothing is delivered.

**Verified by reintroducing the bug** — restoring the trust-the-payload behaviour fails 4 of the new service
tests, including the forged `alg: none` case. **553 tests (was 526), 55 files.**

### 2026-08-11 — Phase 5 began, and the first thing it closed was a credential leak

**Why this matters to a future session:** **Gate 4 is approved and Phase 5 (execution) is under way.**
The ordered plan is `audit/04-remediation-plan.md` §7 — four tiers, 55 numbered actions — and its §7.4 is a
per-commit checklist that is now mandatory rather than advisory. `audit/RESUME.md` §1 tracks which action
is next. **Tier 0 is the only tier that ships before anything else**, and T0-1 is done.

**T0-1 (9700-W1 + 9700-W2) — `token.service.ts` and `revocation.service.ts` wrote the raw request body to
the log.** `log(..., { length, body: parameters })`, where `parameters` is preferentially `req.rawBody`, so
the exclusion list that strips `client_secret` only ever ran on the fallback path. Depending on the grant,
`logs/app-*.log` therefore held **client secrets, end-user passwords (ROPC), authorization codes, PKCE
`code_verifier`s, refresh tokens, JWT `assertion`s and token-exchange `subject_token`/`actor_token`** — at
`info`, the rotating file transport's production level, retained 14 days. Not debug-only. Both sites now log
`{ length }` only, which is the pattern `introspection.service.ts` already used three files away.

Two things about it are worth carrying forward:

- **The edits were line-preserving on purpose.** Both blocks were four lines and remain four (a comment plus
  a three-line call). ~14 citations across `audit/` point *below* `token.service.ts:60` and ~8 below
  `revocation.service.ts:67`, and `scripts/check-docs.mjs` only catches refs *past EOF* — so deleting one
  line would have silently created ~20 off-by-one citations instead of one visible failure.
- **The test was checked by reintroducing the bug.** `tests/unit/services/credential-logging.test.ts` drives
  six grant shapes and both client-auth channels through a spy logger, asserts on distinctive *values*
  rather than parameter names (asserting `code` false-positives on *"URL-en**code**d"* and
  *"de**code**d Basic auth"*), and asserts in the other direction that the length **is** still logged so
  "log nothing at all" cannot pass instead. Putting `body: parameters` back fails 11 of its 12 tests.

**526 tests (was 514), 54 files.** Curriculum impact was nil and was confirmed *before* the change by the
phrase grep §7.4 step 2 requires — the step that was skipped on 2026-08-10 and cost Module 10 five stale
references.

### 2026-08-11 — Phase 3 complete, and the two Tier-0 fixes that report honestly

**Why this matters to a future session:** the audit's **Phase 3 is done** — batches 3a, 3b, 3c and 3d are
all in `audit/03-curriculum-audit.md`, and `audit/RESUME.md` §8 is written as the Phase 4 brief. Headline:
across ~31,500 lines the curriculum produced **0×S1 and 0×S2**; the nine tutorials under `docs/` produced
**6×S2**. Same subject matter, same deployment — the curriculum marks what was run versus what was
reasoned, and the tutorials never did (`CUR-3c-W1`, the highest-leverage item in Phase 3).

Two Tier-0 findings shipped ahead of Gate 4 because both fix **false reporting** and neither depends on
the `SPIFFE_JWT` decision:

- **EH-W1 — `middleware/errorHandler.ts` served failures as HTTP 200.** It derived the status from the
  thrown error, and the SDK's `AuthleteError` subclasses carry the status of the response they were
  *reading* — so a `200` whose body fails Zod validation arrived as `statusCode: 200` and was emitted
  verbatim. A success status carrying an error body that called itself a Bad Request, across **all 57 SDK
  call sites**. `errorStatusFrom()` now trusts an error-supplied status only inside 400–599; `AppError`
  keeps its deliberate values. The sweep found the repo had already met this SDK behaviour once and
  handled it locally (`jwks.controller.ts:17` catches `statusCode === 204`), and that
  `health.service.ts:45-51` builds its own result and is untouched by the clamp.
- **FAPI2-W1+ — `GET /api/fapi/config` asserted six controls it never read.** All six were the *opposite*
  of the live configuration, on the endpoint whose job is to report that configuration. Now read from the
  service. Two are not passthroughs: `supportedTokenAuthMethods` replaces the scalar `requiredClientAuth`
  (client auth is pinned per client, and FAPI 2.0 permits mTLS *or* `private_key_jwt`), and
  `refreshTokenRotation` is `refreshTokenKept === false` — a kept refresh token is one that is *not*
  rotated.

**Module 10 Exercise 4 was reframed, not retired**, per `ERRORHANDLER-STATUS-INVERSION.md` F-2: the
endpoints still fail (the enum gap is untouched), so the exercise now separates *two defects with one
visible symptom* — the one that made the failure silent, and the one that makes it fail. The old 200 is
kept as a dated historical transcript, the pattern Module 05 uses for the UserInfo `Bearer`-prefix bug.
**Dropping `SPIFFE_JWT` is still what would retire the exercise.** 514 tests (was 504).

### 2026-08-10 — the conformance audit, and the two S1 fixes it forced early

**Why this matters to a future session:** the audit lives in `audit/` and is resumable from
`audit/RESUME.md` — read that before touching it. Phases 0–2 are complete (**55 per-spec findings** in
`audit/02-findings/`, 8×S1 · 20×S2 · 17×S3 · 11×S4). Phase 3 batch 3a (Modules 00–03) is in
`audit/03-curriculum-audit.md`; batches 3b/3c are re-scoped by risk in `RESUME.md` §4. **Do not re-probe
Authlete or re-fetch the ~45 specifications listed in `RESUME.md` §2.3.**

Two of the eight S1 findings were exploitable in a deployed instance, so they were fixed ahead of the
remediation plan rather than waiting for Gate 4:

1. **The logout open redirect** — see the (now struck-through) entry in the findings register below. `startsWith`
   → parse-and-compare-origins, 14 regression tests.
2. **`POST /api/device/complete` was reachable in every environment** with no auth, no limiter and no gate,
   approving any live `userCode` as any `subject`. Now development-only via the new
   `middleware/development-only.ts` (the same 404 shape `createLocalToken` already used), plus a new
   `deviceCodeLimiter` (5/min) on both user-code paths sized against RFC 8628 §5.1's own worked example.
   `generalLimiter` added to `/api/device/authorization`, which had none. Gate asserted in the new
   `tests/unit/routes/device.routes.test.ts`.

**Curriculum consequence, and the pattern to remember:** fixing #1 changed **Module 08 Exercise 6b's
transcript** — two of five rows flipped from `302` to `200`. The exercise was **rewritten around the fix**, not
deleted: it now shows the old code, explains why prefix matching accepted an attacker's host as a subdomain
label and as userinfo, shows the parse-then-compare replacement, and points at the one row that *still*
redirects in dev. Same treatment Module 05 Exercise 5 got in August. Module 08's README and verification block
were updated to match.

`AGENTS.md` gained a Quirks entry for the origin-matching rule, a corrected device-flow security note, two new
rows in **Security-critical surfaces** (`logout.service.ts`/`logout.controller.ts`; `device.routes.ts`/
`development-only.ts` — the audit found the list did not cover either), and refreshed test counts, which were
already stale by ~21 tests before this change (now 504 across 53 files).

**Still open on the logout path, deliberately:** ~~`id_token_hint` is decoded but never verified~~ — **`RPL-W2`
shipped 2026-08-11 as T0-2**, so the hint is now verified against the OP's JWKS with `iss` and `aud`; an
unverifiable hint yields no subject and delivers nothing. **This unblocks `BCL-W5`: a client may now register a
`backchannel_logout_uri`.** What remains is the §2 confirmation step (`RPL-W3`, queued as T0-3) and §3's
per-client registered-URI matching (`RPL-W1`, queued as T0-4).

### 2026-08-06 — the SDK pin fixed the defect Module 06's gate was built on; Exercise 6 rebuilt

**Why this matters to a future session:** the server is a moving target under the curriculum. Fixing a defect
can invalidate an exercise that was *correct when written*, and nothing in the build or test suites will tell
you — the labs are prose, so a stale lab is silent.

Pinning `@authlete/typescript-sdk` to `1.0.0` fixed the `subjectTokenInfo.scopes` schema mismatch (finding
above). That defect was Exercise 6's opening step: *"6a — Exchange your user token. It fails."* It now returns
`200` with a token, so the gate collapsed at step one, and 6b's whole "call Authlete yourself and find out
whose fault it is" diagnosis went with it.

**Re-verified before rewriting — all still reproduce (live and in source):**

| Finding | Evidence, 2026-08-06 |
|---|---|
| Four parameters silently discarded | `actor_token`, `resource`, `audience`, `requested_token_type` → four identical 200s; root cause unchanged in `token-exchange-response.handler.ts`'s `tokenCreateRequest` literal |
| `issued_token_type` missing (RFC 8693 §2.2.1 REQUIRED) | absent from the response; built at `handler.ts:48-55`, which also adds non-spec `client_id`/`subject` |
| A live credential in `subject` | `handler.ts:27` — `result.subject \|\| subjectToken`. Confirmed live: the returned `subject` is **byte-identical** to the subject token sent, and still `active` |
| `resource` does not audience-restrict | introspection of the resulting token → no `aud` |

**What changed.** Old 6a (the failure) and 6b (the Authlete-vs-SDK diagnosis and Zod reproducer) deleted. Old
6c → **6a**, reframed: the exchange simply succeeds, and the response is read against RFC 8693 §2.2.1. Old 6d →
**6b**, old 6e → **6c**, both unchanged in substance. Every `Lab 6c/6d/6e` reference in `quiz-answers.md`
renumbered; the Verification-block checkbox for the dead step replaced. Exercise 2's stated purpose was
*"you need a user token for Exercise 6"* — no longer true, since 6a deliberately exchanges the subject-less
client-credentials token — so it now stands on the Exercise 1 contrast it was really teaching.

Q14 (the staging-passed-for-the-wrong-reason scenario) was **kept and marked historical** rather than deleted:
a quiz question may pose history, a lab may not, and its final insight is the most transferable thing in the
module. Its answer carries a dated resolution note.

**Checked and deliberately not changed:** Module 10's `Response validation failed` content is a *different*
defect — `/api/fapi/config` and `/api/fapi/status`, both confirmed still returning `200` with a stack trace on
1.0.0 — so Exercise 4's tail and Q12 stand. `AUDIT-PASS-A.md` got a one-line dated annotation only; it is an
audit snapshot that was accurate when taken, and rewriting it would falsify the record.

**Lesson for the next server change:** after touching server behaviour, grep the curriculum for the symptom
you just changed. `grep -rn "<the error string>" docs/curriculum/modules` would have caught this in seconds.

### 2026-08-04 — the authorization endpoint rejected the canonical JAR shape; Exercise 2 now runs it

**Why this matters to a future session:** Module 05 Exercise 2 used to stop at the `alg:none` rejection and note
that "the signed-JAR path is not exercised". It now registers a client signing key and runs the signed path end
to end, including the RFC 9101 §6.3 precedence proof. That claim in "What was real vs. simulated" is gone.

**What was wrong.** `validateAuthorizationParams` (`server/src/utils/validate.ts`) had a branch for `request_uri`
(PAR) and none for `request` (JAR), so the canonical RFC 9101 §5 shape was refused locally:

```
GET /api/authorization?client_id=<id>&request=<signed jwt>
{"error":"invalid_request","error_description":"Missing required parameter: response_type"}
```

Isolated exactly: **identical signed object**, the only difference being duplicate outer `response_type` and
`redirect_uri` added to satisfy the validator — with them, an authorization code came back. Two more defects sat
in the same eight lines: `redirect_uri` was demanded unconditionally though RFC 6749 §3.1.2.3 makes it optional
when one full URI is registered, and answering with JSON short-circuits RFC 6749 §4.1.2.1's error redirect.

**The fix** is a deletion, not an addition: the validator now checks `client_id` only — the one parameter
required in every shape. A per-shape allowlist has to grow with every new shape and had already missed one. See
**AGENTS.md → Quirks & gotchas**.

**Verified live** with ephemeral clients created and deleted through the management API (**DCR is disabled on
this service — `[A206201] Service (3693555522) does not support dynamic client registration.`** — so
`/client/dcr/register` is not an option; use `POST /api/client/create` + `DELETE /api/client/delete/:id`):

| Check | Result |
|---|---|
| canonical JAR shape, `client_id` + `request` only | **authorization code**, `state` from inside the object |
| exchange that code | `access_token`, `scope="profile"` from the object |
| no `redirect_uri` anywhere, one registered | **code issued** — was refused before |
| `alg:none`, JWKS registered, `requestSignAlg` unset | `[A008311]` (unchanged — this is why the exercise says not to pin it) |
| no `client_id` | still `400` locally, Authlete never called |
| plain full-parameter request | unchanged (regression) |
| **missing `response_type`** | **`400 [A009301]` body, NOT an error redirect** |

**The last row is an honest miss.** The plan predicted the fix would make that case conformant with RFC 6749
§4.1.2.1. It does not: Authlete answers with a body, not a redirect. What the change *did* achieve there is
removing a duplicate, inconsistent local error channel — the error now comes from the one authoritative
validator with a real vendor code. Authlete's channel splits on `response_type`: present → `302` with `error` +
`state` + `iss`; absent → `400` body, since without it the response mode is unknown. Recorded in AGENTS.md.

**Curriculum note.** Exercise 2's biggest trap is **service JWKS vs client JWKS** — uploading keys to the
service (published at `/api/.well-known/jwks.json`, the AS's *own* signing keys) does nothing for JAR, which
needs the *client's* public key on the client record. Opposite directions. Confirmed at rewrite time that both
lab clients had `jwks: null`. Every Exercise 2 transcript was captured from real runs and every snippet was then
executed verbatim to confirm it is copy-pasteable.

### 2026-08-04 — the UserInfo DPoP defect was fixed, and Module 05 Exercise 5 rewritten around the fix

**Why this matters to a future session:** Module 05 Exercise 5 used to teach a *live* server bug. It no longer
reproduces. The exercise now demonstrates the working path plus two conformant breaks. If you are reading an
older transcript that shows `[A088302] The access token does not exist.` from `Authorization: DPoP <token>`,
that output is historical.

**What was fixed.** Four defects in `userinfo.service.ts`, detailed in the findings section below. The reported
one was the scheme parse; the serious one was a **DPoP proof-replay bypass** — the request body was spread into
the Authlete request, so a client could supply the `htu` its own proof would be validated against. Verified
exploit: a proof minted for `/api/par` returned `200` at `/api/userinfo`.

**Verified live before and after** (~30 Authlete calls total across two probe runs, well under the rate limit),
using the confidential client — note that `openid` scope on the *public* client still fails with `[A406301]`
because this service signs ID tokens with HS256. 14 post-fix assertions, all passing:

| Presentation | Result |
|---|---|
| `DPoP <bound>` + valid proof | **200** + claims ← the fix |
| `dpop <bound>` + valid proof | 200 (RFC 9110 §11.1 case-insensitive) |
| `Bearer <bound>`, no proof | 401 `[A089311]` — Authlete enforces RFC 9449 §7.2 |
| `Bearer <bound>` + proof | 400 `invalid_request` — rejected locally |
| `DPoP <bound>`, no proof | 401 `invalid_dpop_proof` — rejected locally, no Authlete call |
| body-smuggled `dpop`/`htu` for `/par` | 401 — **was 200 before the fix** |
| `GET /userinfo?x=1` + valid proof | 200 — `htu` no longer carries the query |
| `Basic …` / no header | 401, `WWW-Authenticate: Bearer, DPoP`, no error code (RFC 6750 §3.1) |
| `Bearer <unbound>` | 200 (regression check) |
| form body `access_token` | 200 — **was 500 before the fix** |
| header **and** body token | 400 `invalid_request` (RFC 6750 §2) |
| `DPoP <unbound>` + unrelated proof | **200** — no `cnf`, so nothing to bind; documented, not "fixed" |

**Two plan assumptions turned out to be wrong, and the code is better for it.** (a) I expected to have to
hand-build a `DPoP` `WWW-Authenticate` challenge with `algs` sourced from discovery. Authlete already emits
`DPoP error="…",algs="RS256 … EdDSA"` itself, so that work was dropped — no discovery call, no cache, and
Authlete's `responseContent` is still forwarded verbatim. (b) I expected §7.2 might need local enforcement,
since `UserinfoResponse` carries no `cnf`. Authlete enforces it; the compliance is delegated by design.

**One trap worth knowing.** Editing three files in quick succession left `ts-node-dev` with two module
instances of `utils/dpop.ts` loaded, so `err instanceof TokenPresentationError` silently returned false and
every local rejection fell through to the global error handler — no `WWW-Authenticate` header (breaking
RFC 6750 §3's MUST) and a leaked stack trace. A clean restart fixed it, and the code now uses
`isTokenPresentationError()`, a discriminant-based guard, so the failure cannot recur.

### Stage 4a — consistency pass: what was checked and what was found

Seven checks, run mechanically over all 60 curriculum markdown files rather than by reading.

| Check | Result |
|---|---|
| **Internal links resolve** | ✅ 0 broken out of every relative link in 60 files |
| **Referenced code paths exist** | ✅ 4 flagged, **all legitimate**: two learner output files that do not exist until the learner writes them (`my-audit.md`, `my-fapi-audit.md`), one path cited *deliberately as wrong* in a correction record (`client/src/services/pkce.ts`), and one file that the gated RFC 9728 proposal says would be created |
| **Cited line numbers within file bounds** | ✅ 0 past EOF |
| **Cited line numbers point at the right code** | ❌ **1 real error — fixed** (below) |
| **Distinctive bolded terms present in GLOSSARY** | ✅ 62/62 found; GLOSSARY is 207 rows |
| **No module depends on a later concept** | ✅ 169 forward references, all *labelled previews* (`→ Module NN`, "you'll meet this again in", "It **feeds** Module NN", "Onward") — the intended pattern. No lab step or argument requires an unexplained later mechanism |
| **Every RFC cited appears in SPEC-INVENTORY** | ❌ **4 missing — fixed** (below). No inventory row is uncited |
| **Cross-module factual claims** | ✅ all 8 ("Module 03 proved…", "Module 05 established…") checked against the verified records in this log; all accurate |

**Error 1 — a fabricated transcript, now corrected.** Module 09b's lab showed a `grep -n` output for
`federation.service.ts` that I wrote from expectation rather than from running the command: it claimed the
`federation.configuration({ serviceId })` call is at **line 16**. It is at **line 14**; line 16 is `});`, and
the real grep prints **two** lines (12 and 14). Fixed in the lab, and the `federation.service.ts:16` citation
was corrected to `:14` in the findings section of this file. **This is the only invented output found in the
whole curriculum**, and it is exactly the class of error Stage 4 exists to catch — every other transcript in
every lab was pasted from a command that actually ran.

**Error 2 — four cited RFCs were not in the inventory.** RFC 2119, RFC 8174, RFC 3986 and RFC 7800 were cited
by name in modules while the inventory claimed to list "every specification this curriculum touches". All four
were verified against rfc-editor.org (titles, BCP/STD numbers, dates) and added as a new **§0a Supporting
references** section. RFC 7800 is the substantive one — it defines the `cnf` claim that DPoP (`jkt`), mTLS
(`x5t#S256`) and SD-JWT key binding (`jwk`) all depend on, so Modules 05, 09b and 10 all rest on it.

**Also resolved:** Stage 1's critique item 5 ("`AGENTS.md` says 21 sections but there are 20") is **no longer
true** — `AGENTS.md:137` says 20, and `client/src/App.tsx` has exactly 20 `sectionComponents` entries. No edit
needed; the item is closed.
- [ ] Stage 4 — consistency pass **+ backfill all four exams** (decided 2026-07-28, see below)

### Gated source changes — BOTH RESOLVED 2026-07-28

**1. RFC 9728 Protected Resource Metadata — ✅ IMPLEMENTED.** Served at true root by
`src/routes/protected-resource-metadata.routes.ts` + `protected-resource-metadata.controller.ts`. Derives
`resource`, `authorization_servers`, `scopes_supported` and `dpop_signing_alg_values_supported` from the live
discovery document so they cannot drift; `resource` defaults to the UserInfo endpoint and is overridable via
`PROTECTED_RESOURCE_IDENTIFIER`. Returns **500 rather than emitting a document without the sole REQUIRED
member**. Verified live: the path now answers `200 application/json` where it previously returned **200 with
HTML** from the SPA catch-all — a discovering client saw success and got a web page. 8 new tests.
Module 04's proposal section is now marked done; its detection exercise still reads as the before-picture.

**2. mTLS / RFC 8705 — ❌ DECLINED, with reasons.** Not deferred. The full decision record lives at the end
of [Module 05's README](modules/05-request-integrity-and-binding/README.md), with the original proposal kept
in a collapsed block. Summary: **TLS is terminated before the request reaches this server in every deployment
of this repo** — `server.ts` is a plain `app.listen`, `render.yaml` declares a platform-fronted `type: web`
service, and the dev issuer is behind a tunnel — so a client certificate can never arrive. The SDK was
*not* the obstacle (`clientCertificate` is supported on token, PAR and introspection requests alike, and the
service already lists `TLS_CLIENT_AUTH`/`SELF_SIGNED_TLS_CLIENT_AUTH`); an earlier draft of the proposal
implied otherwise and was wrong. That left a dev-only, flag-gated capability that could never run in
production, exercises one module, and needs maintaining forever — which loses on cost/benefit given Module 10
already teaches mTLS from the spec and the config surface, and DPoP demonstrates sender-constraining here for
real. Revisit conditions are listed in the record.

### Previously awaiting a decision — gated source changes

**JARM is no longer one of them.** Module 09a established that the authorization server already builds and
signs JARM responses: `response_mode=jwt` returns `[A012305] … the 'authorization_signed_response_alg' metadata
of the client … is not set`, i.e. **a configuration gap, not an implementation gap, on the AS side.** No
`server/src` change is needed and the proposal to "implement JARM" is withdrawn. What *does* remain a genuine
gap is **client-side consumption** — the dashboard SPA cannot parse or verify a `response` JWT — which is
optional for the curriculum since the labs verify JARM with a standalone script. SPEC-INVENTORY has been
corrected in two places (the spec's title was also wrong).

> Superseded by the section above; kept for the reasoning that led to each. **Neither is open any more.**

1. **RFC 9728 Protected Resource Metadata** (Module 04) — one additive route + controller + config value +
   unit test at true root, beside `oauthAsMetadataRoutes`. Small.
2. **mTLS / RFC 8705** (Module 05) — dev TLS listener requesting a client certificate, a local-CA script,
   certificate pass-through to Authlete on token/PAR/introspection calls, `cnf["x5t#S256"]` in introspection
   output, and registration examples for `tls_client_auth` / `self_signed_tls_client_auth`. **Substantially
   larger**; my recommendation is to treat it as its own piece of work rather than a curriculum side effect.
   If declined, Module 10 teaches mTLS against the spec and the Authlete configuration surface, labelled as
   not-run-here.

Each is written up in full at the end of its module README —
[RFC 9728](modules/04-token-lifecycle-and-metadata/README.md#proposed-source-change--serve-rfc-9728-needs-your-approval)
and [mTLS](modules/05-request-integrity-and-binding/README.md#proposed-source-change--implement-mtls-needs-your-approval).

### Findings worth acting on outside the curriculum

> **⚠️ The two Module 11 findings were FIXED on 2026-07-28** — see the ✅ notes on each. Twelve remain open.
> They are listed first.
> Four of the rest are in one file (`token-exchange-response.handler.ts`, 89 lines) and three more are in the
> logout/authorization path. None were fixed — all are server source, and the standing rule is to surface
> rather than repair. Each is taught as a Tier-3 exercise in the module that found it.

- **✅ FIXED — Cross-user BOLA on `/api/gm/:grantId`, with a write primitive.** Verified live on an isolated
  two-user instance (`PORT=3005 AUTH_USERS="alice:…;bob:…"`; nothing on :3000 or in Authlete's config was
  changed, and the instance was killed afterwards). With **valid, correctly scoped, unexpired** tokens:
  **bob's token read alice's grant → 200 with alice's contents**, alice's token read bob's grant → 200 with
  *bob's* contents (they were deliberately given different scopes, which proves the object **is** resolved
  correctly and only ownership is unchecked), and **bob's token `DELETE`d alice's grant → 204, after which
  alice's grant returned 404.** Any holder of a `grant_management_revoke` token can enumerate grant IDs and
  destroy every consent on the service. Scope enforcement itself works (a query-only token gets 401 on
  `DELETE`), which is the point: **every OAuth control passed and the outcome is still catastrophic.**
  *Attribution, stated to the confidence the evidence supports:* `grant-management.service.ts:10-26` forwards
  only `{accessToken, gmAction, grantId}` and relays the answer; a **direct call to Authlete's `/gm` API with
  bob's token and alice's grant ID returns `action: OK` / `[A277001]`**, so the check is not made upstream
  either. No service- or client-level setting governing grant ownership exists on this deployment
  (`grantManagementActionRequired`, `grantManagementEndpoint`, `supportedGrantManagementActions` are the only
  grant switches). **Whether this is an Authlete defect or a missing configuration is `UNVERIFIED` — raise
  with the vendor, do not assert.** What is not ambiguous is the expectation: Grant Management §5.2 says
  *"the respective client must be authorized to use the particular grant id"*, and a grant is defined
  throughout as belonging to a client **and** a resource owner.
- **✅ FIXED — Unauthenticated read of a confidential client's secret.** `GET /api/client/get/<clientId>` with **no
  credentials of any kind** returns the full client object including `clientSecret` in plaintext — the
  credential that PKCE, PAR and DPoP exist to protect. Also unauthenticated: `GET /api/client/auth/list/<subject>`
  (enumerate any subject's authorized clients), `GET /api/client/scopes/granted/<clientId>/<subject>`, and
  `GET /api/token/list` (returned **65** access tokens on this service). Cause is **not** a missing check —
  `requireBasicAuth("client_management")` is imported and called in every one of the sixteen controllers;
  `require-basic-auth.ts:8` does `if (!mgmtClientId || !mgmtClientSecret) return true;`, i.e. **fail-open on
  absent configuration**, and `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are empty in `server/.env`. Verified that
  setting both restores 401. `AGENTS.md` **does** document that unset MGMT vars leave management routes
  unprotected, so this is a known dev default rather than a hidden bug — but the documentation says
  "unprotected" where the behaviour is "hands a confidential client's secret to anonymous callers", and the
  fail-open design is itself the defect (a missing security config should refuse to start). Taught as
  Module 11's Lab 1.

- ~~**Both FAPI reporting endpoints return HTTP 200 with an error body and a stack trace.**~~
  **RESOLVED in two halves — 2026-08-11 (EH-W1) and 2026-08-12 (T1-5).** Both `GET /api/fapi/config` and
  `GET /api/fapi/status` answered **200** with
  `{"error":"Bad Request","message":"Response validation failed","stack":"ResponseValidationError: …"}` — an
  SDK `ResponseValidationError` from `serviceGet`, surfaced verbatim. Three defects in one response: a
  monitor checking status codes reported them healthy forever, `stack` leaked absolute filesystem paths on
  unauthenticated endpoints, and **the deployment could not report its own FAPI posture**, so Module 10's lab
  had to read the Authlete service configuration directly. The status clamp fixed the *invisibility*; the
  `SPIFFE_JWT` withdrawal fixed the *failure*. Both now return **200** with live values (`mode: "disabled"`).
  It was the **fourth instance of "a server-side failure reported as a caller error"** after Modules 06, 08
  and 09b, and Module 10 Exercise 4 keeps all three states as its subject.
- **Grant revocation leaves access tokens alive for 24 hours.** Verified end to end in Module 10: after
  `DELETE /api/gm/<grant_id>` → **204**, the grant's refresh token is correctly gone
  (`[A053305] The refresh token … does not exist.`) but its access token still introspects `active: true`
  with a full 24 hours remaining. Grant Management §6.5 says the AS *"MUST revoke the grant and all refresh
  tokens … it should revoke all access tokens"* — so **the MUST is satisfied and the should is not.** Not a
  MUST violation; report it precisely. Its severity comes from the *interaction* with
  `accessTokenDuration: 86400`: the `should` is only tolerable because access tokens are assumed short-lived,
  and here they are not, so a user who withdraws consent stays exposed for a day. Cheapest remediation is to
  shorten the lifetime, not to implement access-token revocation.
- **The OpenID Federation entity-configuration endpoint cannot work, and misreports why.**
  `federation.service.ts:14` calls `authleteApi.federation.configuration({ serviceId })` with **no
  `requestBody`**. The SDK types that field as optional (`requestBody?: FederationConfigurationApiRequestBody`
  where the type is `{}`), so omitting it compiles and passes review — but Authlete requires a body. Both
  `GET /.well-known/openid-federation` and `GET /api/federation/configuration` therefore return **400** with
  `[A126203] The request body is missing or empty.` Verified two ways during the Module 09b build: the repo's
  failure, and a **direct call to Authlete with `{}` returning HTTP 200 and the real diagnosis** —
  `[A316201] Because a JWK Set for federation has not been set up, this service cannot generate entity
  configuration.` So there are two stacked faults and the code one **hides** the configuration one. Two extra
  defects in the same response: it is an unhandled SDK `ResultError` reaching the generic error handler, so a
  federation endpoint answers `{"error":"Bad Request"}` rather than a typed error; and the body includes a
  **`stack` field with absolute filesystem paths**, returned to an unauthenticated caller on a public
  discovery endpoint. Fix is `requestBody: {}` plus action handling plus suppressing `stack`. **Third instance
  of the same class** after Module 06 (Zod failure → `"Bad Request"`) and Module 08 (unset `JWKS_URI` →
  `"Invalid logout token"`): *a server configuration error reported as a caller error.* For contrast,
  `POST /api/federation/registration` in the same file is written correctly.
- ✅ **FIXED 2026-08-12 (T1-7) — see the Build Log entry above; the paragraph below is the original report.**
- **`prompt=none` returns a 302 with an empty `Location` header.** `authorization.controller.ts:50-53` treats
  Authlete's `NO_INTERACTION` action as though `responseContent` held a redirect URL. It does not: verified by
  calling `/auth/authorization/authorization` directly, `NO_INTERACTION` comes back with
  `responseContent: null` and a **ticket**, meaning *"decide without showing UI, then call issue or fail."* So
  `res.redirect(null ?? "")` emits `Location: `. OIDC Core §3.1.2.6 requires one of `login_required`,
  `consent_required`, `interaction_required`, `account_selection_required`. **Second half of the defect:** the
  controller *does* contain `prompt === "none"` handling at line 96 — inside `case "INTERACTION"`, which a
  `prompt=none` request never reaches, because the AS answers it with `NO_INTERACTION`. Dead code that reads
  as a feature. Not exploitable; breaks every client that relies on silent renewal, in a way the client cannot
  classify.
- **~~The logout endpoint is an open redirect, and it survives production.~~ ✅ FIXED 2026-08-10.**
  `logout.service.ts` validated `post_logout_redirect_uri` with two `startsWith` prefix checks. Verified live:
  `http://localhost:3000.evil.example.com/bye` and `http://localhost:3001@evil.example.com/` both got a **302
  to the attacker's host**. The middle clause was gated on `NODE_ENV !== "production"`, but the
  `allowedOrigins.some(o => uri.startsWith(o))` clause was not — so with `ALLOWED_ORIGINS=https://app.example.com`,
  `https://app.example.com.evil.net/` also passed. RFC 9700 §2.1 forbids exactly this. Note the contrast: the
  *authorization* endpoint got exact matching right all along (400, no `Location`).
  **First fix (2026-08-10):** `isAllowedPostLogoutRedirectUri` parsed the value with `new URL()` and compared
  **origins exactly** — `LOGOUT_REDIRECT_URI` by full URI, `ALLOWED_ORIGINS` by origin, plus a non-production
  `hostname === "localhost"` clause. Both payloads refused. 14 regression tests in
  `tests/unit/services/logout.service.test.ts`; Module 08 Exercise 6b rewritten around the defect and the
  parse-don't-prefix rule rather than deleted.
  **Superseded 2026-08-12 by T0-4, and this bullet said otherwise until 2026-08-12** — found while re-anchoring
  a citation, which is what that checklist step is for. §3 wants exact matching against the client's
  **registered** `post_logout_redirect_uris`; Authlete 3.0 has no field to hold them (a write returns 200 and is
  discarded), so the registry is the deployment's own `POST_LOGOUT_REDIRECT_URIS` and matching is `===` against
  the identified client's set. **No `new URL()` parsing, no origin comparison and no `localhost` clause remain**,
  and `ALLOWED_ORIGINS`/`LOGOUT_REDIRECT_URI` no longer authorise anything. Both payloads are still refused —
  now because nobody registered them. See `audit/02-findings/OIDC-RP-INITIATED-LOGOUT-1.0.md` (RPL-W1…W5, all
  closed) and the T0-3 / T0-4 entries above.
- **Back-channel logout receipt cannot work, and misreports why.** `JWKS_URI` is unset, so
  `logout.controller.ts:64` throws and the `catch` returns `{"error":"invalid_request","error_description":
  "Invalid logout token"}` — blaming the caller's input for a server configuration problem. Confirmed against
  the server log (*"JWKS_URI must be configured to verify backchannel logout tokens"*). Two structural defects
  beyond the config: (1) `jwt.verify(token, key, { algorithms })` passes no `issuer` or `audience`, so `iss`
  and `aud` are never checked and only the `events` claim is validated — OIDC Back-Channel Logout also
  requires rejecting a token carrying `nonce`; (2) it calls `req.session.destroy()`, but a back-channel logout
  is a server-to-server POST with no browser cookie, so `req.session` belongs to nobody — acting on a logout
  token needs a session store queryable by `sub`/`sid`. Fixing the config alone would turn a no-op into a
  cross-RP forced-logout primitive.

- ~~**Token exchange is broken for any scoped subject token.**~~ **RESOLVED 2026-08-06.** The SDK's
  `TokenResponse` schema typed `subjectTokenInfo.scopes` as `string[]`; Authlete returns
  `[{"name":"profile","defaultEntry":false}]`. Zod rejected the response inside `tokenProcess`, so the
  controller never ran and the client got `{"error":"Bad Request","message":"Response validation failed"}`
  plus a stack trace — not an OAuth error at all. Verified three ways during the Module 06 build: the failure
  with a scoped subject token; a direct call to Authlete's `/auth/token` with identical parameters returning
  `[A311001] … processed successfully`; and a standalone `TokenResponse$inboundSchema.safeParse` reproducing
  the exact Zod issue. A **scopeless** subject token succeeded, which is why any smoke test built on a bare
  `client_credentials` token passed.
  **Fixed by pinning the SDK to `1.0.0`** (`e122a5b`), where `TokenInfo.scopes` is `Array<Scope>`. Confirmed
  two ways on 2026-08-06: the recorded Authlete payload now parses through 1.0.0's schema, and a live exchange
  with a scoped subject token returns `200` with `scope: profile`. The earlier remediation note — *"needs a
  `patches/` entry alongside the existing `clientCreate.js` patch"* — is obsolete twice over: `patches/` and
  `patch-package` are gone, and the `clientCreate` 201 fix is native to 1.0.0. See `docs/DEVELOPMENT.md` →
  **SDK Version Pin**. **Curriculum impact:** this was Module 06 Exercise 6's entry point; the gate was
  rebuilt around the three findings that still reproduce (see the Build Log entry for 2026-08-06).
- **The token-exchange handler discards four request parameters.**
  `token-exchange-response.handler.ts`'s `tokenCreateRequest` literal builds its `token.create` request from exactly `grantType`,
  `clientId`, `scopes`, `subject`. Verified live: `actor_token`, `resource`, `audience`, and
  `requested_token_type` all produce byte-identical 200 responses, and introspection of the `resource` case
  shows **no `aud`** (the same parameter does produce `aud` on the authorization-code path — Module 04). The
  consequence that matters: **a delegation request is answered with an impersonation token, HTTP 200, no
  `act`, no error.** RFC 8693 §1.1 defines impersonation as being *"indistinguishable from B"* — which is
  exactly what the downstream service gets.
- **`issued_token_type` is missing from the token-exchange success response.** RFC 8693 §2.2.1 marks it
  **REQUIRED**. `token-exchange-response.handler.ts`'s response body emits `access_token`, `token_type`, `expires_in`,
  `scope`, plus two parameters that are not in the spec (`client_id`, `subject`). Since
  `requested_token_type` is also ignored, the client has no way to learn what it actually received.
- **A live access token is written into a `sub` claim.** `token-exchange-response.handler.ts`'s `result.subject || subjectToken` does
  `result.subject || subjectToken`. When Authlete resolves no subject — correct for a client-credentials
  subject token — the fallback stores **the credential string itself** as the new token's subject. Verified:
  `sub == subject_token` on the exchanged token, and that value still introspects `active: true`. It is
  returned to the client in the response body as `subject` and by introspection as `sub`, i.e. placed in a
  field whose entire contract is "safe to copy into logs." (Checked and *not* over-claimed: this repo's audit
  logger takes `user` from the session, not from a token subject, so that particular log is unaffected.)
  Correct behavior is to fail closed.
- **~~UserInfo cannot accept a DPoP-bound token.~~ FIXED 2026-08-04.** `userinfo.service.ts:21` did
  `authHeader.replace("Bearer ", "")`, so `Authorization: DPoP <token>` — the scheme RFC 9449 §7.1 **requires**
  for DPoP-bound tokens — passed the literal string `"DPoP <token>"` to Authlete, which answered `[A088302] The
  access token does not exist.` The token endpoint issued a `token_type: DPoP` token with a valid `cnf.jkt` and
  the resource endpoint could not accept it.

  Investigating it turned up **three further defects in the same 14-line block**, two of them worse than the
  reported one:
  1. **A DPoP proof-replay bypass (the serious one).** `req.body` was spread wholesale into the Authlete
     request, so a POST client could supply its own `dpop`, `htm` and `htu`. Since Authlete validates the
     proof's `htu` against *the value the server sends*, a client choosing that value defeats the RFC 9449
     §4.3 binding check outright. **Verified exploit:** a proof minted for `/api/par` (with a matching
     body-supplied `htu`) returned `200` and full claims at `/api/userinfo`. `introspection.service.ts:19-22`
     already blocked this and said so in a comment; userinfo never got the same treatment.
  2. **`htu` included the query string.** RFC 9449 §4.2 defines `htu` as the target URI *without* query and
     fragment, and the Authlete SDK offers a separate `targetUri` for the full URI. Any request carrying a
     query string failed proof validation even when the client was correct.
  3. **RFC 6750 §2.2 form-body presentation returned `500`.** `access_token` in a form body left
     `UserinfoRequest.token` undefined, producing an unhandled Zod error instead of a `401`.

  Also fixed, because the server fix left them non-conformant: `client/src/services/token.service.ts`
  (`userInfoWithDpop` sent `Authorization: Bearer` with a proof attached — the §7.2 downgrade shape) and
  `docs/FAPI-TUTORIAL.md` (documented that combination as correct).

  All parsing now lives in `server/src/utils/dpop.ts`. See **AGENTS.md → DPoP & Client Auth** for the full
  behavioural contract. Module 05 Exercise 5 was rewritten around the fix — it now spends the bound token
  successfully and breaks it two conformant ways instead of reproducing a defect.
- **The introspection endpoint is unauthenticated.** `POST /api/introspection/standard` (and
  `/api/introspection`) answer fully with no client credentials and no bearer token. RFC 7662 §2.1: *"To
  prevent token scanning attacks, the endpoint MUST also require some form of authorization to access this
  endpoint."* Verified repeatedly during the Module 04 build. It is taught as the module's Tier-3 finding
  rather than silently fixed, but it is a real defect in the server and worth a separate issue.

### Service configuration — resolved, and what is still outstanding

**RESOLVED 2026-07-27.** `fapiModes` and `supportedServiceProfiles` were cleared on service `local-testing`
(API key `3693555522`). The full authorization-code flow now runs end to end. For the record, that one
setting — **not** `require_pushed_authorization_requests` — was the cause of every earlier failure:

| Symptom while `fapiModes = ["FAPI2_SECURITY"]` | Observed error |
|---|---|
| Plain `GET /api/authorization` refused | `[A294308] The authorization request was sent without PAR.` |
| `client_secret_basic` refused | `[A295301] The client authentication method … is not allowed.` |
| `password` grant refused | `[A295306] The grant type ('password') is not allowed.` |

> **`fapiModes` was NOT re-enabled for Module 10.** Confirmed absent again on 2026-07-28. Module 10 was
> therefore written as an audit of a *supported-but-not-required* deployment rather than a demonstration of
> FAPI enforcement — which is defensible (it is the commonest real posture) but means **no lab step in the
> curriculum shows FAPI being enforced**. Setting `fapiModes = ["FAPI2_SECURITY"]` would flip most of the
> Module 10 report's FAIL rows at once and is the highest-value single console change outstanding. Note it
> would also re-break Modules 03–09's labs, so set it *after* working through those, or expect the three
> symptoms in the table above to return.

**Public client — RESOLVED 2026-07-27.** Client `4277838306` now reads `clientType: PUBLIC`,
`tokenAuthMethod: NONE`, `parRequired: false`. The Module 03 labs run against it.

**Token exchange — RESOLVED 2026-07-28.** Client `1523514379` now has
`extension.tokenExchangePermitted: true`; the repo owner made the console change during the Module 06 build.
Before that, every exchange returned `[A311305] This service does not allow unpermitted clients to make token
exchange requests.`, because the service sets `tokenExchangeByPermittedClientsOnly: true`. Module 06's lab
documents both states. Service-level grant types already included `TOKEN_EXCHANGE` and `JWT_BEARER`, and the
client already had both in its `grantTypes` — the per-client permission flag was the only gate.

**Module 09a config — requested 2026-07-28, NOT YET APPLIED.** The repo owner chose "set all five." As of the
end of that turn none had landed. Each unblocks exactly one thing:

| Where | Field | Set to | Unblocks |
|---|---|---|---|
| Service | `supportedAcrs` | `pwd`, `mfa` | RFC 9470 step-up (lab 4b) — currently `[A021303]` |
| Service | `supportedAuthorizationDetailsTypes` | `payment_initiation` | RAR success path (lab 5b) — currently `[A249302]` |
| Client `1523514379` | `authorizationSignAlg` | `ES256` | JARM (lab 2c) — currently `[A012305]` |
| Client `1523514379` | `bcDeliveryMode` | `POLL` | CIBA (lab 3d) — currently `[A169301]` |
| Both clients | `idTokenSignAlg` | `ES256` | Module 08 lab 3d + public-client `openid` |

**Still outstanding:**

- **`idTokenSignAlg: HS256` on BOTH clients — still outstanding as of 2026-07-28.** The repo owner chose
  "set both clients to ES256" when asked during the Module 08 build, but the change had not landed by the end
  of that turn, so Module 08 shipped with its ES256/JWKS exercise (3d) marked `UNVERIFIED` and no transcript.
  Two consequences while it stands: (1) the public client `4277838306` **cannot request `openid` at all** —
  `[A406301] The algorithm is symmetric (HS256), but the client type of the client … is not 'confidential'.`
  (verified again this session); (2) on the confidential client, HS256 means the client secret both verifies
  **and forges** ID tokens — demonstrated live in Module 08 lab B6, where a token with `sub` changed to
  `ceo@example.com` and re-signed with the client secret passed all thirteen validation steps. **Flipping both
  clients to `ES256` unblocks lab 3d and public-client OIDC, and removes the forgery capability.** Module 09a
  does not depend on it; Module 10 (FAPI) does.
- ~~`GET /api/fapi/config` still fails~~ **FIXED 2026-08-12.** The body was an SDK `ResponseValidationError`
  from `serviceGet`. Two guesses recorded here were wrong and one was right: `fapiModes` did **not** cause it
  (cleared, failure persisted); the HTTP **200** *was* "a second, separate bug" (the error handler's status
  derivation, EH-W1); and the cause was one unrecognised `supportedTokenAuthMethods` member, `SPIFFE_JWT`,
  withdrawn from the service by T1-5. Both endpoints now answer 200 with live values.

Nothing on the Authlete service was changed by the curriculum build; the repo owner made the console change.

*(Gated source changes — JARM, mTLS, RFC 9728 PRM — are still proposed inside Modules 05/09a/10 as planned;
this is a configuration issue, not one of those.)*

### The cumulative exams — WRITTEN (Stage 4b, 2026-07-28)

All four are now in [`exams/`](exams/), each with a separate answer key. They were deliberately backfilled
after all fourteen modules existed, which had one real benefit: an exam written last can draw on framings the
earlier module quizzes could not have known about — Exam A's A13, for instance, poses a Module-07-shaped
question that is answerable from Modules 02–03.

| Exam | After | Covers | Items | Time |
|---|---|---|---|---|
| [A](exams/exam-a.md) | Module 03 | 00–03 | 15 | 90 min |
| [B](exams/exam-b.md) | Module 07 | 00–07, weighted to 04–07 | 15 | 2 h |
| [C](exams/exam-c.md) | Module 11 | 08–11 | 15 | 2 h |
| [Final](exams/final-exam.md) | before 12 | everything, almost all synthesis | 12 | 2–3 h |

**Design decisions, for a future editor.** (1) Exams test *integration*, which is the thing a module quiz
structurally cannot — every exam has items requiring two or more modules, and those carry the most marks.
(2) **Answer keys point back at modules rather than re-teaching**, and each ends with a missed-item → module
table; the stated output of an exam is that list, not the score. (3) Closed book, with two exceptions
(`curl`, and `[lab]`-marked items) because those measure typing rather than understanding. (4) Three items
depend on material taught *later* than the module the exam follows; each is marked inline and optional.
(5) The Final's self-grading rubric targets the same two inflation risks the capstone rubric names — being
generous to yourself on *rejected alternatives* and on *limitations*.

Module 07's quiz Tier 4 was the interim stand-in for Exam B while it was unwritten; Exam B now says so and
does not duplicate it.

### Both serious findings fixed — 2026-07-28

The repo owner approved fixing the two red findings after Stage 4. Design decisions were theirs: a **strict
grant match** for the BOLA (the caller's token must have been issued under the grant it addresses — a
client-credentials token is therefore denied, which removes machine-to-machine grant management by design),
and **fail-closed at runtime** for admin auth rather than a hard startup failure.

- **BOLA** → new `server/src/middleware/require-grant-ownership.ts`, wired into both `/api/gm/:grantId`
  routes. Introspects the bearer token *before* the grant-management call. Middleware rather than service, so
  it cannot be bypassed by a future handler and the existing service tests stay untouched. Mismatch and
  no-grant-binding return an **identical** 403 body, so a caller cannot tell them apart. 403 rather than 404
  is correct here: the check runs before any Authlete lookup, so the response is the same whether or not the
  grant exists — there is no oracle for a lying 404 to hide.
- **Fail-open auth** → `require-basic-auth.ts` rewritten. Unset credentials now deny, with a response
  byte-identical to "no credentials supplied" (telling an anonymous caller the server is misconfigured is free
  recon) and a distinct `log.error` plus a one-off startup warning from `server.ts`. Also fixed in the same
  function: non-constant-time comparison (now `timingSafeEqual`) and `split(":")` truncating secrets that
  contain a colon. Added the missing `checkAuth` to `GET /api/token/createLocalToken`, the one admin route
  that had none — `AGENTS.md` already claimed it was protected.

**Verified live, both exploits re-run against the original repro.** Admin: unauthenticated
`GET /api/client/get/<id>` → **401**, zero `clientSecret` occurrences in the body; `client/list`,
`client/auth/list/:subject`, `token/list`, `hsk/list` and `token/createLocalToken` all **401**; the startup
warning fires. BOLA (two users on an isolated `PORT=3005` instance): alice reads her own grant → **200**
(feature intact), bob reads alice's grant → **403**, bob deletes alice's grant → **403**, and **alice's grant
survived** → 200. Before the fix those were 200, 200 and 204-then-destroyed.

**Gate:** `typecheck` 0 errors, `lint` 0 errors, **366 tests / 47 files, 0 failures** (was 318/44). 30 new
middleware tests plus 7 integration regressions, including "bob's token → 403 and
`grantManagement.processRequest` never called" and "MGMT unset → 401". Four existing tests that *asserted the
vulnerable behaviour* — two literally named *"skips auth when MGMT vars not set"* — were rewritten to assert
401.

**Not run, per the standing rule: `test:e2e`.** Two test names in section 17 were updated blind; their
assertions still expect the old 404/204 and will need adjusting to 403 when someone next runs the suite. The
insufficient-scope case also moves 401 → 403, since introspection now returns `FORBIDDEN` before the GM call.

**Action required at deploy:** `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are still empty in `server/.env`, so the
SPA's four Admin sections now return 401 until they are set — locally and in Render.

### Module 12 — Capstone — done / verified / uncertain

- **Done:** the capstone is a different artifact from the other thirteen — it teaches nothing new and measures
  whether the rest transferred. `README.md` — the brief, the **nine decisions** a design must make and defend,
  and a **100-point rubric** deliberately weighted so the two criteria people skip (*rejected alternatives*
  and *an honest limitations section*, 14 points together) are what separate an architecture document from a
  list of technologies; an absent limitations section scores zero on that line however good the rest is. Also
  a score-to-reading table, an explicit "how to grade yourself honestly" sequence (write Part A **before**
  reading Part B, score **before** reading the model answer), and a mapping from every clause of the
  curriculum README's definition of done to where the capstone tests it. `lab.md` — **Part A: Aurora**, a
  multi-tenant clinical platform brief with four client types, three API tiers and five non-negotiable
  constraints, containing **three deliberate tensions** a strong answer must name (offline validation vs
  demonstrable revocation; self-service onboarding vs strong client auth; attributability vs service
  accounts). **Part B: Meridian Health v4.2**, a complete, plausible, real-shaped architecture document for
  the same brief with **exactly 25 planted defects** spanning Modules 01–11. `quiz.md` + `quiz-answers.md`
  (18 items across 4 tiers), where Tier 4 asks the learner to attack **their own** design rather than
  Meridian's.
- **Verified (self-consistency, since this module has nothing to run):** all **25 defects re-read against the
  Meridian text one by one** and confirmed present, each mapped to its module and given a severity as
  *strength × reachability* rather than by modal verb. The count is stated identically in three places
  (README, lab, answer key) and the rubric line scores `round(found / 25 × 20)` so the totals still sum to
  100. **Seven deliberately correct passages** are planted as false-positive traps — PAR + `private_key_jwt`
  + DCR-with-JWKS for partners, `typ: at+jwt`/RS256, a tenant-scoped query, 404-not-403, and an explicit
  response projection — and the rubric deducts for reporting them; quiz Q15 makes mis-reporting one of them
  an explicit exercise. Every spec citation in the answer key (RFC 9700 §2.1.2/§2.4/§4.1, RFC 8707, RFC 7662
  §2.1, RFC 9068, RFC 8693 §1.1, RFC 9449, RFC 9470, RFC 9901 §7.1/5 + §7.3/1 + §9.5, OIDC Core §3.1.3.7,
  FAPI 2.0 §5.3.2.1, Grant Management §6.5) reuses wording already verified against primary sources in
  Modules 01–11 — **no new spec claims were introduced**, deliberately, so the capstone cannot contradict the
  inventory.
- **Design decisions worth recording for a future editor:** (1) the defect count was raised from 20 to **25**
  after the Meridian document was drafted and the planted defects were actually counted — the number is
  stated because "I found them all" is otherwise unfalsifiable, so it must stay accurate if the document is
  ever edited; (2) the answer key's remediation order is argued by *exposure removed per unit of effort* and
  explicitly notes two places where a different order is equally defensible, so a learner who disagrees with
  reasons is not marked wrong; (3) Meridian is deliberately written as competent-but-insecure — quiz Q18 asks
  *how a document like this happens*, which is the most transferable question in the curriculum and the real
  ending of the course.
- **Uncertain / notes:** **nothing in this module was executed** — it is a paper exercise by design, and the
  Meridian document is fictional. Its code snippets are illustrative and are **not** drawn from this repo,
  though several defects deliberately mirror real ones found during the build (the fail-open and BOLA themes
  from Module 11, the userinfo-login bug from Module 08) so a learner who did the labs has seen the shapes
  before. The **four exams were backfilled in Stage 4b** and now exist under `exams/`; the capstone README
  requires the Final as a prerequisite, since the capstone is open-book by construction and the Final is
  where three of the five promised capabilities get their only closed-book assessment. *(Until Pass B this
  section and two module READMEs still described the exams as unwritten — corrected 2026-08-02.)* The
  rubric's score bands are a judgement call and are labelled as such.

### Module 11 — done / verified / uncertain

- **Done:** `README.md` — the module's thesis is that Modules 00–10 answered *"can I trust this token?"* until
  the answer was provable, and the question was never sufficient. Opens with a request that passes **every**
  control in the curriculum — DPoP-bound, audience-restricted, correctly scoped — and asks whether account
  `91847` belongs to the caller. Contains: the OWASP 2023 list with the **three** authorization failures
  marked and the observation that API2, the one this curriculum spent eleven modules on, is *one item out of
  ten and not the first*; **BOLA/BOPLA/BFLA distinguished by what the attacker changes** — "wrong row, wrong
  column, wrong verb", with the fix location for each; a four-step argument for why a valid token **cannot**
  prevent BOLA (issued before the request exists / scopes are type-level / ownership is application data /
  therefore the check is yours), including why RAR only moves the goalposts; **owner-scoped queries over
  ownership checks** — make the insecure version unrepresentable, tied back to FAPI 2.0 choosing PKCE over
  `c_hash`; 404-not-403 as the same anti-oracle reasoning as RFC 7662; scopes/claims/RAR as three
  granularities with the rule *scopes gate the endpoint, claims feed the policy, the data layer enforces the
  object*; RBAC/ABAC/ReBAC keyed on "can your rule be expressed without reference to the specific object?",
  with the observation that **pure RBAC has a BOLA by construction**; the gateway/service split as a
  capability boundary rather than a preference; and short sections on key rotation and on certification being
  *evidence about the protocol layer and silence about the application layer*. `lab.md` — six exercises, two
  of them live exploits. `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added ten concepts to
  GLOSSARY and expanded the OWASP row in SPEC-INVENTORY to the full enumerated list.
- **Verified against the live server (every lab command executed):** **BFLA** — unauthenticated
  `GET /api/client/get/<id>` returns `clientSecret` in plaintext; `/api/client/auth/list/admin` enumerates a
  subject's clients; `/api/token/list` reports **65** access tokens; cause traced to
  `require-basic-auth.ts:8` fail-open, and confirmed that setting `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET`
  restores **401**. **BOLA** — full cross-user read *and* delete, on an isolated `PORT=3005` instance with two
  demo users, as described in the findings section above; the two grants were given **different scopes** so
  the output proves correct object resolution with absent ownership checking. **Attribution** established by
  a direct Authlete `/gm` call returning `action: OK` `[A277001]`, plus a search of service and client
  configuration for any ownership switch (none). Also verified: grant management is correctly restricted to
  confidential clients (`[A285311]` on the public client) — a control that *does* work, and worth showing
  next to two that do not. **Verified (primary source):** the complete OWASP API Security Top 10 **2023
  edition** identifiers and titles, quoted from `owasp.org/API-Security/editions/2023/`.
- **Environment discipline:** the two-user instance ran on `PORT=3005` with `AUTH_USERS` passed inline —
  **no file was edited, no Authlete configuration was changed**, `server/.env` was untouched, and the process
  was confirmed dead afterwards (`:3005` → connection refused, `:3000` → 200). Test grants were revoked and
  all extracted credentials deleted from the scratchpad. The lab tells the learner to do the same.
- **Uncertain / notes:** **the BOLA attribution is deliberately `UNVERIFIED`** — the behaviour is confirmed
  exhaustively, but whether the missing ownership check is an Authlete defect or a configuration gap could not
  be determined from the available surface, and the lab makes writing the finding *at that confidence* an
  exercise (Tier-3 Q14 tests exactly this). A **cross-client** BOLA could not be tested: only one confidential
  client exists and grant management is confidential-only, so the second principal had to be a second *user*
  rather than a second client; cross-client remains untested and is called out as such. `docs/MONITORING.md`
  is used for the detection exercise but Prometheus/Grafana were **not** started, so Exercise 5's answers
  reason from the metric and audit-log definitions in code rather than from observed dashboards — labelled
  accordingly. The three code-review snippets in Exercise 6 are written for the module, not drawn from this
  repo.

### Module 10 — done / verified / uncertain

- **Done:** `README.md` — the module's thesis is that Module 07 taught auditing against a *checklist* and this
  one asks the question a checklist cannot answer: **how do you know the list is complete?** FAPI 2.0 is
  presented as the only spec in the curriculum that makes a **falsifiable** claim — attacker model, stated
  goals, formal analysis — and therefore the only one that can be *wrong*. Contains: all three security goals
  and all six attackers quoted; the observation that **A4 is defined and then declared irrelevant** because a
  design decision eliminated it, which is what a mature threat model looks like; §8's exclusions with §8.5
  ("implementation errors") called out as the section that separates a proof about a spec from a claim about
  your code — every finding in this curriculum lives there; the **FAPI 1.0 → 2.0 table quoted verbatim** with
  the argument that 2.0 is *smaller* because it was derived rather than accreted; the insight that dropping
  the hybrid flow was a **failure-visibility** decision (*"nonce/signature check can be skipped by clients,
  PKCE cannot"*), which generalises; the refresh-token-rotation prohibition unpacked in four steps, resolving
  the tension Module 03 left open; Message Signing scoped to non-repudiation; and grant management with the
  MUST/should asymmetry as the centrepiece. `lab.md` — seven exercises producing a conformance report.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added ten concepts, two parameters and one acronym
  row to GLOSSARY.
- **Verified against the live server (every lab command executed):** **the anti-FAPI flow** — one
  authorization-code flow with no PAR, no PKCE, `client_secret_basic`, yielding
  `{"access_token":…,"token_type":"Bearer","expires_in":86400,…}`, i.e. four `shall` requirements breached and
  a **24-hour bearer token** issued with no warning. `iss` **is** present (the deployment's one clean PASS).
  **PAR `expires_in` = 600**, where §5.3.2.2 requires *less than* 600 — non-conformant by one second, and
  corroborated by `pushedAuthReqDuration: 600` read from the service. `authorizationCodeDuration: 0` recorded
  as **NOT EVIDENCED** (service default; not observable from configuration) rather than guessed either way.
  Advertised metadata read as an attacker would: `require_pushed_authorization_requests: false`,
  `code_challenge_methods_supported` includes `plain`, `token_endpoint_auth_methods_supported` includes
  `none`, `response_types_supported` includes the implicit forms. **Grant management verified end to end** —
  `grant_management_action=create` → a token response with a sixth member, `grant_id`; then query → **200**
  with scopes and claims, no token → **401**, unknown grant → **404**, revoke → **204** empty, re-query →
  **404**; scope enforcement confirmed with a `profile`-only token → 401. Then the revocation gap above.
  Both FAPI endpoints confirmed returning **200** with a stack trace. **Verified (primary sources, this
  session):** FAPI 2.0 Security Profile and Attacker Model both **Final, 22 Feb 2025**, read off the document
  headers; the complete §5.3.2.1 and §5.3.2.2 `shall` lists, NOTE 1 on rotation, and the §5.5 comparison table
  — all quoted from the HTML rather than a summariser. Attacker Model §5.2–5.4 goals, §6 scope exclusions,
  §7.2–§7.7 all six attackers, §8.2–§8.6 limitations. FAPI 2.0 Message Signing **Final, 25 Sep 2025**. FAPI
  1.0 Parts 1 and 2 **Final, 12 Mar 2021**. Grant Management **`oauth-v2-grant-management-03`, 9 May 2023**,
  §5.2 parameters, §6.1 scopes, §6.5 revocation sentence and the token-vs-grant note.
- **A citation trap caught mid-build, now taught in the lab:** `openid.net/specs/fapi-2_0-attacker-model.html`
  still serves a **December 2022 Internet-Draft** in which the token-endpoint and resource-server attackers are
  **A5 and A7**; in the Final (`fapi-attacker-model-2_0.html`) they are **A4 and A5**. I fetched the draft
  first and would have published the wrong numbering. The FAPI 2.0 URLs moved generally (`fapi-2_0-*` →
  `fapi-*-2_0`). Also noted as an editorial artefact in the Final itself: §8.2 still refers to "(A3a/A5/A7)",
  the old numbering, while §7 defines A1/A1a/A2/A3a/A4/A5.
- **Three SPEC-INVENTORY errors found and corrected:** Message Signing was dated "approved 2025-07-29" and is
  **published 25 Sep 2025**; the FAPI 1.0 Parts had no dates and are both **12 Mar 2021**; and Grant Management
  was labelled an **"OpenID 2nd Implementer's Draft"**, which the document header does not support — it is
  Internet-Draft `oauth-v2-grant-management-03` and its own title ends in *"(Draft)"*. The module and
  inventory now say so.
- **Uncertain / notes:** **FAPI is entirely off on this service** (`fapiModes` and `supportedServiceProfiles`
  both absent), so **no lab step shows FAPI enforcement** — the module is deliberately built as an audit of a
  supported-but-not-required deployment, which is the commonest real posture, and says so up front. Turning
  `fapiModes` on remains the single highest-value console change and would let a future pass verify the
  enforcement side. **`private_key_jwt` still cannot be exercised** — the service advertises it but neither
  client has a JWKS (same limitation Module 06 recorded). **mTLS is still not implemented**; the module
  teaches it from the spec and the config surface, labelled not-run-here, and the gated proposal stands. The
  `authorizationCodeDuration` row is the one requirement I could not evidence in either direction. The lab's
  transcript is deployment-specific by design, as Module 07's was. Redaction: the service's
  `grantManagementEndpoint`, `pushed_authorization_request_endpoint` and the confidential client's registered
  `redirectUris` all contain a live tunnel hostname, and the flow produces a real `grant_id` — all redacted in
  the committed lab.

### Module 09b — done / verified / uncertain

- **Done:** `README.md` — organised around **four unexamined assumptions** that every module 01–09a shared
  (the issuer is reachable at time of use → OID4VCI/VP; you already have a relationship with it → Federation;
  its word needs no account → Identity Assurance; claims travel all-or-nothing → SD-JWT), with the point made
  up front that these are four *different kinds* of problem — cryptographic, governance, topology,
  architecture — and are worth keeping apart. Contains: the **issuer/holder/verifier ↔ OAuth role mapping**
  with the observation that resource owner and client *fuse* into the holder, which makes the holder a
  plausible attacker and is why every §7.1 check exists; identity assurance framed as **provenance, not
  cryptography** (two identically-signed tokens, wildly different assurance); federation with trust chains
  drawn as **discovery walking up, policy flowing down**; SD-JWT **derived from four requirements** rather
  than asserted, with the salt introduced as the answer to "claim value spaces are tiny"; key binding named as
  the **fourth appearance of commit-then-prove**; the three §7.1 checks a naïve verifier omits; and the
  unlinkability §10.1 says *cannot* be achieved. `lab.md` — eight exercises, six of which need no server.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added seven roles, fifteen concepts, seven
  claims/parameters and seven acronyms to GLOSSARY. **New lab asset: `scripts/sd-jwt.mjs`** (~350 lines, no
  dependencies) — `keygen`/`digest`/`issue`/`inspect`/`present`/`verify`, where `verify` prints a numbered
  PASS/FAIL trace following §7.1 and §7.3 step by step.
- **Verified locally (every lab command executed):** the tool's digest **matches RFC 9901 §4.2.3's own
  published test vector** (`X9yH0Ajrdm1Oij4tWso9UzzKJvPoDxwmuEcO3XAdRC0`), reproduced twice — once via the
  script, once via `openssl dgst | basenc --base64url`. A six-claim credential issued with 2 decoys → `_sd`
  holds 8 digests; `vct`/`iss`/`iat`/`cnf` stay in the clear. A presentation of **2 of 6** claims verified
  with all §7.1 and §7.3/5 steps PASS, and the processed payload contains **no name, birthdate or email**.
  Six attacks, all executed: **(1) KB stripping → REJECTED by the strict verifier and ACCEPTED by the
  permissive one** — the module's headline, and §9.5's warning reproduced exactly; (2) cross-verifier replay →
  caught by `aud`; (3) forged disclosure value → caught at **§7.1/5, not at the signature check**; (4) a
  **whitespace-only re-serialization** (identical value) → rejected, demonstrating §4.2.3; (5) an
  **hour-expired credential accepted** when `exp` was made selectively disclosable and withheld, then rejected
  once `--require-claims exp` states the §9.7 defence; (6) digest reuse left as reasoning. Unlinkability
  measured directly: two presentations disclosing **disjoint** claims share a **byte-identical issuer-signed
  JWT** and identical `cnf.jwk`. **Verified against the live server:** five distinct VCI refusals —
  `A364301`/`A416301`/`A402301` (NOT_FOUND → 404 on metadata/jwtissuer/jwks), `A366201` and `A383201`
  (FORBIDDEN → 403 on offer/create and credential/issue) — plus local pre-Authlete validation on
  `credential/batch` and `deferred/issue`; and the full federation diagnosis above. **Verified (primary
  sources, this session):** RFC 9901 title/Standards Track/Nov 2025, §1.2 all seven terms quoted, §4 both
  serialization formats and the empty-last-element rule, §4.1.1 the `sha-256` default, §4.1.2 `cnf`, §4.2.1/
  §4.2.2/§4.2.3 (including the "not the bytes encoded by" sentence), §4.2.4.1 order-hiding, §4.2.4.2 the
  three-dots key, §4.2.5 decoys, §4.3 all four REQUIRED claims + `typ`, §4.3.1 `sd_hash`, **all of §7.1's
  numbered steps and §7.3's eight**, §9.3 salt, §9.5 KB stripping, §9.7 the five security-critical claims,
  §10.1 all four unlinkability types — pulled from `rfc9901.txt` and quoted byte-exactly rather than via a
  summariser. OpenID Federation 1.0 Final **17 Feb 2026** (read off the document header), §1.2 terms, §3.1.2
  `authority_hints`, §9's well-known construction rule, the `entity-statement+jwt` type. OID4VCI 1.0 Final
  **16 Sep 2025**, §2 definitions, the pre-authorized URN, §3.5 `tx_code` quoted. OID4VP 1.0 Final
  **9 Jul 2025**, §2 definitions, §5.2 `nonce`. SD-JWT VC **‑17, 6 Jul 2026**, `vct` and
  `application/dc+sd-jwt`. Identity Assurance **Final 1 Oct 2024**, errata set 1 revision **1 Jul 2026**.
- **A bug found in my own tooling, and fixed before shipping:** the first `sd-jwt.mjs` checked `exp` on the
  **raw** issuer-signed payload. §7.1/6 requires it on the **processed** payload, so a disclosed-and-expired
  credential passed. Caught by testing the §9.7 case in both directions; fixed, and `--require-claims` added
  so the lab can demonstrate the defence and not merely the attack.
- **Uncertain / notes:** **`UNVERIFIED` — everything past the VCI refusals.** Verifiable credentials are
  disabled on the service, so no lab step shows a real credential offer or issuance; the lab says so inline
  and verifies only the surface, the auth model and the refusal semantics. **OID4VP is not run at all** — no
  verifier implementation exists here; it is taught from the spec, and the KB-JWT half is exercised locally
  instead. **Identity Assurance's detailed schema is deliberately not quoted**: the required/optional members
  of `verification` and the full `evidence` type enumeration are normatively defined in a *separate referenced
  schema document* that was not read, so the README marks that gap `UNVERIFIED` rather than asserting a list.
  The `evidence` values named (`document`, `electronic_record`, `vouch`, `electronic_signature`) are labelled
  illustrative. One low-severity observation recorded in the lab rather than as a finding, because
  `AGENTS.md` already documents it: `MGMT_CLIENT_ID`/`MGMT_CLIENT_SECRET` are unset, and
  `require-basic-auth.ts` returns *allow* when they are — so the "admin" VCI offer endpoints answered with no
  credentials. **Fail-open**, by documented design; flagged as a Module 07 audit item. Also noted for
  Stage 4: OpenID Federation 1.0's own reference list cites an **OpenID Federation 1.1** of the same date, so
  the inventory row should be re-checked if any later module leans on federation.
  > **Resolved 2026-08-02 — and the "same date" part of this note was wrong.** Federation **1.1** is Final,
  > published **5 May 2026**; 1.0 is 17 Feb 2026. They are eleven weeks apart, not the same date. 1.1 is now
  > the primary row in `SPEC-INVENTORY.md` and Module 09b cites it. The instinct to re-check was right; the
  > fact recorded alongside it was not, which is why this log line is corrected in place rather than deleted.

### Module 09a — done / verified / uncertain

- **Done:** `README.md` — organised around **four unexamined assumptions** the earlier modules baked in (the
  response is trustworthy → JARM; there is a browser → CIBA; one authentication covers the session → RFC 9470;
  scopes describe authority well enough → RAR), plus Native SSO's "one app per device" as a fifth. Contains:
  JARM framed as **completing Module 05's triangle** (PAR = request confidentiality, JAR = request integrity,
  JARM = response integrity) with all three mandatory claims quoted and the observation that `iss` inside a
  signature makes mix-up *structurally impossible* rather than merely detectable; the four `response_mode`
  values and three client metadata parameters; CIBA with a dark mermaid showing the
  consumption-device/authentication-device split, a poll/ping/push decision table, and **the threat that has no
  redirect analogue** — the prompt is unsolicited, so `binding_message` cannot do what people think it does;
  RFC 9470's full round trip with the error and both challenge parameters quoted, and the observation that
  omitting `acr_values` converts a recoverable state into a dead end; RAR with all five common data fields
  quoted, three properties scopes cannot provide, and an explicit "when not to use it"; and Native SSO with a
  prominent not-Final caveat. `lab.md` — five exercises on one repeated shape: **request → read the refusal →
  find the one field → enable → re-run.** `quiz.md` + `quiz-answers.md` (19 items across 4 tiers). Added six
  concepts and four parameter groups to GLOSSARY.
- **Verified against the live server (every refusal executed):** **JARM** — `response_mode=jwt` and
  `query.jwt` → `[A012305]`, naming `authorization_signed_response_alg` **in spec vocabulary**. **CIBA** →
  `[A169301] The backchannel token delivery mode of the client application is not set.` **Step-up** —
  `acr_values=pwd` *and* an essential `acr` claim both → `[A021303] ACR values cannot be specified by any means
  ('claim', 'acr_values' or 'default_acr_values') because this service supports no ACR value.` **RAR** — four
  malformations, four distinct diagnostics under one spec error code: `[A249302]` unsupported type,
  `[A249301]` absent type, `[A249304]` malformed JSON, `[A249304]` not-an-array. CIBA sub-endpoints with a
  bogus ticket: `issue` → **400** `[A181201]`, `fail` → **403** `[A185001]`, `complete` → **500** `[A186202]`;
  and the CIBA token grant → a clean `invalid_grant [A200304]`. Full service and client configuration read for
  Exercise 1's inventory. **Verified (primary sources, this session):** JARM — title, Final status, **errata
  set 1 dated 17 Aug 2025**, the three mandatory claims quoted, all four `response_mode` values, all three
  client metadata parameters. RFC 9470 — title, Standards Track, Sep 2023, the `insufficient_user_authentication`
  definition, both challenge parameters, §3 on `acr`/`auth_time`, and the example header. RFC 9396 — title,
  Standards Track, May 2023, the `authorization_details` and `type` definitions, all five common data fields,
  `invalid_authorization_details`, and the scope-coexistence sentences.
- **Two findings, plus a corrected inventory entry:** (1) a **vendor anomaly** — `response_mode=form_post.jwt`
  produces a 302 whose `Location` is a URL-encoded HTML document, traced by direct API call to Authlete
  returning `action: LOCATION` with HTML in `responseContent`, so the repo's controller behaved correctly and
  the fault is upstream; scoped explicitly to the **error** path, since the success path cannot be observed
  until JARM is configured. (2) the **CIBA endpoints return Authlete's internal envelope** (`resultCode`,
  `resultMessage`, `action`, `clientId`) with the real OAuth error JSON-escaped inside a `responseContent`
  string — unlike the token endpoint, which is correct; and `complete` maps a nonexistent ticket to **500**.
  (3) **ACR theatre**, established by holding two verified facts together: `supportedAcrs` is absent, yet live
  ID tokens carry `acr: "pwd"` — the value is not wrong, it is unaccountable.
- **Uncertain / notes:** **`UNVERIFIED` — every post-enablement step.** None of the five requested settings had
  landed by the end of the turn, so the lab shows **no success transcripts** for JARM, CIBA, step-up or RAR;
  each is marked `UNVERIFIED on this deployment as of 2026-07-28` inline, and the lab states up front that
  refusals are observed and enablement steps are the spec's promise. This is the largest UNVERIFIED surface of
  any module so far and the main reason to re-run Module 09a's lab once the console changes land. Native SSO is
  **not run at all** (`nativeSsoSupported: false`) and is labelled a 2nd Implementer's Draft throughout.
  `verify-jarm.mjs` is an adaptation of Module 08's validator whose asymmetric branch is likewise unexercised.

### Module 08 — done / verified / uncertain

- **Done:** `README.md` — opens on the one-line login bug (`loginAs(profile.sub)` from an access token) and
  takes three paragraphs to say exactly why it is an authentication bypass rather than asserting "use an ID
  token"; the access-token-vs-ID-token table with the two rows that generate most bugs; every REQUIRED and
  conditional claim quoted from OIDC Core §2; **the thirteen §3.1.3.7 validation steps grouped into four
  jobs** (envelope / issuer+audience defeats substitution / authenticity defeats forgery / currency defeats
  replay / request-binding defeats injection) with commentary on the three that trip people — step 6's TLS
  shortcut and its precondition, step 7 as *the* algorithm-confusion defence, step 8 as the reason HS256 does
  not scale; a `nonce`-vs-`state` table settling the standing confusion (the key asymmetry: `nonce` is inside
  the signature, `state` is not); `at_hash`/`c_hash`/`s_hash` as the same commit-then-prove pattern; the
  response-type table with why hybrid exists and why FAPI 2.0 dropped it; `prompt`/`max_age` with the four
  §3.1.2.6 errors; and **the four logout specs in one table** keyed on who gets told and whether a live
  browser is needed. `lab.md` — six exercises; the learner **writes** a 13-step validator rather than using a
  library. `quiz.md` + `quiz-answers.md` (19 items across 4 tiers). Added seven concepts, three claims and
  three parameters to GLOSSARY.
- **Verified against the live server (every lab command executed):** adding `openid` to `scope` turns a
  5-key token response into a 6-key one. ID token decodes as `alg: HS256`, **no `kid`**, with
  `iss/sub/aud/exp/iat/auth_time/nonce/acr/s_hash`; `aud` is an **array** (`idTokenAudType` unset, so not the
  `"string"` form `AGENTS.md` recommends). **The validator was written and run: all ten applicable steps PASS**
  on a live token, including HMAC-with-client-secret per step 8. Six forgeries: tampered `sub` with the
  original signature → step 6 FAIL; **`alg:none` → step 7 FAIL *and* step 6 FAIL, in that order**; wrong `aud`
  → step 3 FAIL twice; expired → step 9; `nonce` mismatch → step 11; and **`sub` changed to `ceo@example.com`
  and re-signed with the client secret → ACCEPT, all checks passed** — the module's headline, a correct
  validator losing to a symmetric-algorithm choice. Hybrid `response_type=code id_token` → both artefacts in
  the **fragment** and **`c_hash` appears**. `nonce` echoed when sent, absent when not. `max_age=0` →
  `auth_time == iat`. UserInfo returns the profile claims. `[A406301]` reproduced on the public client.
  **Verified (primary sources, this session):** OIDC Core 1.0 *"incorporating errata set 2"* (15 Dec 2023) —
  §2's five REQUIRED claims and the `auth_time`/`nonce`/`acr`/`amr`/`azp` conditions quoted; **all thirteen
  §3.1.3.7 steps quoted**; §3.1.2.1 on `prompt=none`; §3.1.2.6's four error definitions; §3.1.3.6 `at_hash`;
  §3.3.2.11 `c_hash`; §5.3.2's `sub` check. OIDC Discovery 1.0 errata set 2 — the
  `id_token_signing_alg_values_supported` definition including *"The algorithm RS256 MUST be included."*
- **Three new findings, all verified, none fixed** (see the findings section above for the full write-ups):
  `prompt=none` → 302 with an **empty `Location`** (and the `prompt=none` handling is dead code in an
  unreachable branch); the logout endpoint is an **open redirect** via `startsWith` prefix matching, which
  **survives `NODE_ENV=production`**; and back-channel logout receipt cannot work (`JWKS_URI` unset) while
  reporting a server config error as *"Invalid logout token"*, plus two structural defects in the handler.
  Also a low-severity discovery-conformance gap: `id_token_signing_alg_values_supported` omits RS256.
- **Uncertain / notes:** **`UNVERIFIED` — the ES256/JWKS validation path.** The repo owner chose to set both
  clients to `ES256`; as of writing both are still `HS256`, so lab Exercise 3d gives the commands and the live
  JWKS contents (one EC P-256 key, `kid: "1"`) but **shows no transcript**, and is marked `UNVERIFIED on this
  deployment as of 2026-07-28` inline. Everything in 3a–3c is verified. Flipping the flag makes 3d a
  two-minute exercise and also unblocks `openid` on the public client. **The lab trips the rate limiter** —
  `loginLimiter` is 5/min and this lab runs the most flows of any; hit it during verification, and the failure
  surfaces three steps downstream as an empty redirect then a confusing `403 no ticket in session`, so the lab
  now warns about it explicitly and uses it as a diagnostic lesson. The ID token's 24-hour lifetime
  (`idTokenDuration: 86400`) is flagged as a Module 07 report item rather than a Module 08 finding.

### Module 07 — done / verified / uncertain

- **Done:** `README.md` — the module adds no mechanism; it adds a **review method**. Contains: the observation
  that Module 02 only gave you half of RFC 9700 (the §4 attack catalogue) and this module gives the other half
  (§2's sixteen requirements, all quoted verbatim in one table with normative strength and the module that
  taught each mechanism); how to read MUST/SHOULD/RECOMMENDED as a reviewer, with the rule that *a SHOULD
  without a written rationale is a finding and a SHOULD with one is a decision*; **what OAuth 2.1 actually
  changes**, framed as requires/omits/restricts from §1.8 quoted verbatim, plus the correction that it does
  not *prohibit* implicit — it does not specify it; draft-citation discipline; **three-source triangulation**
  (advertised / configured / observed) with a dark mermaid, each source's failure mode, and a worked example
  of each drawn from Modules 02, 04 and 06; severity as **strength × reachability** with a 2×3 table; and
  **conformance theatre** named as the meta-threat in three shapes. `lab.md` — six exercises producing an
  actual conformance report as the deliverable, plus three self-directed breaks. `quiz.md` +
  `quiz-answers.md` (18 items across 4 tiers; Tier 4 doubles as interim Cumulative Exam B). Added six terms
  to GLOSSARY. Added `docs/curriculum/.gitignore` for the learner's `my-audit.md`.
- **Verified against the live server (every lab command executed):** the full advertised/configured evidence
  base as printed. **§2.1 PASS** — registered URI + `x` and an unrelated `http://evil.example.com/cb` both →
  **400 with no `Location` header**, which evidences the exact-matching MUST and the open-redirect MUST NOT at
  once. **§2.1.1 FAIL** — public client, no PKCE parameters at all → access token **plus a refresh token**.
  **§2.1.2** — `response_type=token` → live 24 h access token in the URL **fragment**. **§2.4 FAIL —
  `grant_type=password` returns an access token and a 10-day refresh token.** **§2.2.2 PASS** — refresh
  rotation confirmed *by observation* (new refresh token returned), not by reading `refreshTokenKept`.
  **§2.3** — `resource` produces `aud` on the client-credentials path (so it works on two of three paths and
  is discarded on token exchange, per Module 06) and is absent when not requested; `accessTokenDuration`
  86400, `refreshTokenDuration` 864000. **§2.5 / RFC 7662 §2.1** — introspection with **no credentials** →
  200 with full metadata, while revocation with no credentials → `[A116302]`, with `client_id` only →
  `[A157357]`, and with full credentials → 200 and the token dies. Both endpoints advertise an **empty**
  auth-methods array, so the metadata misdescribes revocation — a three-source divergence found in the lab
  itself. **Verified (primary sources, this session):** RFC 9700 §2's complete subsection list (2.1, 2.1.1,
  2.1.2, 2.2, 2.2.1, 2.2.2, 2.3, 2.4, 2.5, 2.6) and the normative sentences in each, quoted; §2.2.1, §2.2.2,
  §2.3, §2.5 and §2.6 pulled a second time from `rfc9700.txt` for full sentences. `draft-ietf-oauth-v2-1-15`,
  dated **2 March 2026**, expiring 3 September 2026, title *"The OAuth 2.1 Authorization Framework"*; §1.8
  quoted verbatim (fetched twice, identical); §10 confirmed to have exactly two subsections, 10.1 and 10.2.
  SPEC-INVENTORY's draft row was **corrected** — wrong title and imprecise date.
- **Corrected two stale claims in Module 01's lab** (not silently — the reversal is now taught):
  ROPC was recorded as *refused* with `[A295306]`, which was true when written and is false now, because
  clearing `fapiModes` removed a restriction that had been blocking it incidentally. The lab now shows both
  outcomes, tells the learner to record which they saw **with the date**, and forward-links to Module 07 §3c.
  The stale "Deployment note for Module 02" about `require_pushed_authorization_requests` was rewritten to
  record that the original diagnosis was wrong and `fapiModes` was the real cause.
- **Uncertain / notes:** the lab's transcript is **deployment-specific by design** — it is a template for
  auditing *a* server, and it says so twice; a learner on a different service will get different rows, which
  is the intent but does make this the least reproducible lab in the curriculum. The OAuth 2.1 §10 content was
  fetched three times and the fetcher summarised rather than quoted on two of them; **only §1.8 is quoted
  verbatim**, and the §10 claim is limited to its subsection titles and count, which came back identically
  each time. The severity ranking in Exercise 6b is explicitly labelled *a* defensible order, not *the*
  answer, and item 3 is flagged as arguable. `my-audit.md` is now gitignored, but nothing stops a learner
  writing their report elsewhere — the redaction warning is the only control.

### Module 06 — done / verified / uncertain

- **Done:** `README.md` — the module is organised around one question, *where does the authority come from?*,
  and the three answers (the client's own registration / a trusted issuer's signature / an existing token).
  Contains: why a client-credentials token has no `sub` and why that absence is the whole semantics; RFC
  7523's **two** jobs (§2.1 grant vs §2.2 client auth) laid out side by side, because conflating them means
  having the security properties backwards; the trust shift that makes the AS a *relying party*, and the
  control the specs deliberately leave to the deployment — which subjects an issuer may assert; RFC 8693's
  impersonation-vs-delegation definitions quoted verbatim, with the observation that impersonation is
  *"indistinguishable"* by design, i.e. delegation with the audit trail deleted; `act` nesting for identity
  chains and `may_act` as the pre-authorisation; and a dark mermaid keyed on the single optional parameter
  (`actor_token`) that changes the meaning of the whole request. `lab.md` — six exercises plus three breaks.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added three roles, six concepts, seven parameters
  and two claims to GLOSSARY. **No new SPEC-INVENTORY rows needed** — §6 already carried RFC 7521/7522/7523/8693
  and all four were re-verified against primary sources this session.
- **Verified against the live server (every lab command executed):** client credentials → `expires_in: 86400`,
  **no `refresh_token`**, and introspection with **no `sub`** — contrasted against an authorization-code token
  carrying `sub`/`auth_time`/`acr`. `scope=openid profile` → `scope: "profile"`, HTTP 200, **silently
  dropped**. Public client → `unauthorized_client [A052301]`. JWT bearer: an HS256 assertion signed with the
  client secret → access token; changing one field to `sub: alice` → **an access token introspecting as
  `"sub": "alice"` for a user who never authenticated** (the module's headline); `iss` set to a nonexistent
  issuer → **still accepted**, proving the trust anchor is the client's key, not `iss`. Five assertion breaks,
  all `invalid_grant`: `[A314310]` unsigned, `Invalid assertion` (wrong key), `[A314314]` wrong audience,
  `[A314309]` expired, and the repo's own "'sub' claim failed to be extracted" — the split between bracketed
  Authlete codes (phase 1, claims) and bare sentences (phase 2, signature, `jwt-verification.service.ts:55`
  and `:77`) is taught as a diagnostic. A valid `client_assertion` against a `client_secret_basic` client →
  `[A157357]`, i.e. auth method is pinned per client. Token exchange: the scoped-subject-token failure, the
  Authlete-direct call proving Authlete is fine (`[A311001]`), the standalone Zod reproduction, the scopeless
  success, four identical 200s for `actor_token`/`resource`/`audience`/`requested_token_type`, no `aud` on the
  `resource` case, and `sub == subject_token` still `active: true`. Breaks: `[A311306]` nonexistent subject
  token, `[A250302]` missing `subject_token_type`, `[A244305]` no client identification.
  **Verified (primary sources, this session):** RFC 8693 title/Standards Track/Jan 2020, §1.1 both definitions
  quoted verbatim, §2.1 full parameter table with REQUIRED/OPTIONAL status, §2.2.1 the three REQUIRED
  parameters and the conditional-`scope` sentence, §2.2.2 `invalid_target`, §4.1 `act` and §4.4 `may_act`
  definitions quoted. RFC 7523 title/Standards Track/May 2015, both URNs, §3's four MUSTs and three MAYs
  quoted individually, §3.1 `invalid_grant` sentence, and the with-or-without-client-authentication sentence.
  RFC 7521 title/Standards Track/May 2015, §3 Issuer/Relying Party/Subject definitions, §5.2 validation list
  including the mandatory-audience sentence, §8.1–8.3. RFC 6749 §4.4 confidential-clients-only sentence, the
  §4.4 opening paragraph, §4.4.3 refresh-token SHOULD NOT, §2.1 client types, and §3.3's
  scope-divergence MUST.
- **Uncertain / notes:** **`act` is never produced on this deployment**, so no lab step shows a real delegated
  token — the module gate was rewritten accordingly, from "read `act` out of a response" to "say which one you
  got and what a correct response would have contained," which is arguably the better test but is a change
  from the original plan. **RFC 7522 (SAML) is not wired up** and nothing claims to run it; it is taught only
  to make the framework/binding split legible. **§2.2 (`private_key_jwt`) is not exercised** — no client here
  is registered for it; the lab demonstrates the *pinning* refusal instead and defers the real thing to Module
  10. The assertion grant is verified against the client's own secret via HS256, which is a property of this
  client's registration (`client_secret_basic`), not of RFC 7523 — flagged in the lab. Exercise 2's condensed
  auth-code flow needed a `case` branch because stored consent (24 h, in-memory) makes the login leg redirect
  either to the consent page or straight to the callback; both paths were observed. The lab tells the learner
  to read `AUTHLETE_BEARER_TOKEN` from `server/.env` for Exercise 6b — necessary to prove the fault is in the
  SDK and not Authlete, and the only lab in the curriculum that touches the management API.
  **Superseded 2026-08-06:** that sub-exercise was removed with the SDK fix, so no lab reads
  `AUTHLETE_BEARER_TOKEN` or touches the management API any more, and the redaction concern it carried is gone.

### Module 05 — done / verified / uncertain

- **Done:** `README.md` — two unexamined assumptions (the request is not trustworthy; possession is not
  entitlement) drive the whole module; PAR vs JAR as a genuine design choice rather than two names for one
  thing; mix-up and why PKCE does not stop it; DPoP built up claim by claim with each element tied to the
  attack it defends; a DPoP-vs-mTLS comparison table; and the observation that PKCE → DPoP is the same
  commit-then-prove pattern one level up (third occurrence in the curriculum, named as a pattern). `lab.md` —
  five exercises plus a four-way DPoP break. `quiz.md` + `quiz-answers.md` (19 items across 4 tiers). Added
  five terms to GLOSSARY. Contains the gated mTLS proposal.
- **Verified against the live server (every lab command executed):** PAR → **201** with
  `urn:ietf:params:oauth:request_uri:…` and `expires_in: 600`; the handle drives a complete authorization
  flow carrying only `client_id` + `request_uri` through the browser; **reuse → `invalid_request_uri`
  `[A008303]`** (RFC 9126 §4 single-use enforced). JAR: `alg:none` request object → **`[A008311]` "the service
  is configured to conform to JAR … request objects must be always signed."** `iss` present on success **and**
  error redirects; `authorization_response_iss_parameter_supported: true`. DPoP: proof built by hand
  (64-byte raw P1363 signature confirmed), token exchange → **`token_type: DPoP`**, introspection →
  `cnf: {"jkt": …}`, and **an independently computed RFC 7638 thumbprint matched the `jkt` exactly**. Four
  break cases: DER signature → `[A254301] Signed JWT rejected: Invalid signature`; `kid` without `jwk` →
  `[A254303] The DPoP header did not include a public key in JWK format.`; wrong `htu` → `[A254301]` htu
  mismatch; correct proof → success. Resource access with `Authorization: DPoP` → `[A088302]` (the server bug
  above). **Verified (primary sources):** RFC 9126 title/date, §2.2 201 requirement, unguessability and
  client-binding sentences, the 5–600 s guidance, §4 single-use sentence, and the client-authentication
  sentence — all quoted verbatim. RFC 9101 title/date, §5 parameter-precedence sentence, §10.1 signing
  requirement, §4 `iss`/`aud` guidance, §10.8 on `oauth-authz-req+jwt`. RFC 9207 title/date, §2 definition and
  AS requirement (including error responses), §2.4 client extraction and rejection requirements, §3 metadata
  name. RFC 9449 title/date, §4.2 header and claim requirements and the `ath` definition, §6.1 `jkt`
  definition, §7 and §7.1 scheme and `ath` requirements. RFC 8705 title/date, §2.1/§2.2/§3, both auth-method
  values, the `x5t#S256` definition, and the protected-resource verification sentence.
- **Uncertain / notes:** **the signed-JAR path is not exercised** — the lab's public client has no registered
  JWKS, so only the `alg:none` rejection is demonstrated; labelled in the lab as a client-configuration limit,
  not a spec or server limit. **mTLS is not implemented and nothing claims to run it.** The `htu` this server
  compares against is derived from its own `Host` header and omitted the port on this deployment
  (`http://localhost/api/par`) — noted in the lab as deployment behaviour, and flagged as the shape of a
  classic false failure behind a proxy. Bracketed Authlete codes are labelled vendor behavior throughout.

### Module 04 — done / verified / uncertain

- **Done:** `README.md` — the self-contained-vs-reference decision framed as a real trade-off (latency,
  revocation lag, availability); RFC 7662 with both anti-oracle rules quoted; RFC 7009 including the cascade
  **SHOULD**; RFC 9068's `typ: at+jwt` and seven required claims, with token confusion explained; RFC 8707
  `resource` → `aud`; a table separating the **three** metadata documents by consumer; RFC 7591/7592 and the
  registration access token; a flowchart converging both token formats on the same three RS checks; and the
  gated RFC 9728 proposal. `lab.md` — six exercises. `quiz.md` + `quiz-answers.md` (18 items across 4 tiers).
  Added eight terms to GLOSSARY.
- **Verified against the live server (every lab command executed):** `/api/introspection/standard` →
  `{"active":true,"scope":"profile","client_id":…,"token_type":"Bearer","exp":…,"sub":"admin","iss":…,
  "auth_time":…,"acr":"pwd"}`; `/api/introspection` → Authlete's richer object (`existent`/`usable`/
  `sufficient`/`refreshable`/`scopes`/`grantType`/`consentedClaims`/`scopeDetails`). Revocation → 200, then
  introspection → `{"active":false}`. Garbage token: revoke → **200**, introspect → **200
  `{"active":false}`** — both anti-oracle rules confirmed. **`resource=https://api.example.com/orders` →
  `aud":["https://api.example.com/orders"]` in the introspection response.** Both RFC 8707 violations →
  `invalid_target`, delivered as a **redirect**: `[A251308]` (fragment) and `[A251307]` (not absolute).
  AS metadata at true root and OIDC discovery under `/api` are **byte-identical key sets** on this
  deployment. `/.well-known/oauth-protected-resource` → **200 `text/html`** (SPA catch-all), as does an
  invented path; `grep -rn "oauth-protected-resource" server/src/` finds nothing. DCR → `[A206201] Service
  does not support dynamic client registration.` **Verified (primary sources):** RFC 7662 title/date, §2.1
  endpoint-protection sentence and §2.2 not-active sentence quoted verbatim, full member list; RFC 7009
  title/date, §2.2 200-on-invalid sentence and the cascade SHOULD quoted verbatim; RFC 9068 title/date, §2.1
  `typ` requirement quoted, all seven §2.2 required claims; RFC 8707 title/date, §2 absolute-URI/no-fragment
  and multiple-occurrence sentences and the `invalid_target` definition quoted; RFC 9728 title, Apr 2025, §3
  path, sole REQUIRED field `resource`, and the `WWW-Authenticate` sentence quoted.
- **Uncertain / notes:** **the introspection endpoint is unauthenticated** — surfaced above as a real finding
  and taught as the module's Tier-3 exercise, not fixed. The DCR exercise is marked optional because the
  service does not have dynamic registration enabled, so its output is described from the spec rather than
  claimed as observed; the one thing verified about it is the **request shape**, which wraps RFC 7591 metadata
  in a `{"json": "…"}` field — a deployment adaptation, labelled as such. `at+jwt` access tokens **cannot** be
  produced on this deployment (opaque tokens), so RFC 9068 is taught but no lab step claims to show one. The
  identical AS-metadata/OIDC-discovery documents are labelled a deployment simplification, explicitly not a
  spec equivalence.

### Module 03 — done / verified / uncertain

- **Done:** `README.md` — derives PKCE from four requirements rather than asserting it (fresh per request /
  one-way front-channel value / bound at the server / not downgradable); public-vs-confidential table; a
  `state`-vs-PKCE table that settles the most common confusion; the §4.8 downgrade rule **in both
  directions**; RFC 8252 native-app hardening (embedded-webview prohibition + the three redirect strategies);
  and the public-client refresh-token rule with the FAPI 2.0 tension spelled out. `lab.md` — six exercises.
  `quiz.md` + `quiz-answers.md` (18 items across 4 tiers). Added RFC 8252 to SPEC-INVENTORY and five terms to
  GLOSSARY.
- **Verified against the live server (every lab command executed against public client `4277838306`):**
  S256 pair generation and the round-trip check; full flow → token with **no client secret in the request**
  (`access_token, token_type, expires_in, scope, refresh_token`, `scope=profile`). Breaks: no verifier →
  `invalid_grant [A050312]`; wrong verifier → `invalid_grant [A050315]`; **no PKCE at all → ACCESS TOKEN
  ISSUED** (43 chars) from a bare `client_id` replay, which is the module's headline demonstration;
  `code_challenge_method=plain` → accepted; verifier-without-challenge → `invalid_grant [A050317]`, so this
  deployment enforces **both** directions of RFC 9700 §4.8; `refresh_token` grant → the refresh token
  **rotated** (consistent with the service's `refreshTokenKept = false`, read from `/service/get`).
  **Verified (primary sources):** RFC 7636 title/status/date, §4.1 ABNF and the 43–128 bound quoted verbatim,
  §4.2 S256 formula, §4.3 `plain` default, §4.6 `invalid_grant` requirement; RFC 8252 title/BCP 212/Oct 2017,
  §7.1–§7.3, §8.12 embedded-user-agent prohibition and the §7.3 loopback-port sentence quoted verbatim;
  RFC 9700 §2.1.1 (S256 recommendation), §2.2.2 (public-client refresh tokens), §4.8 (downgrade) quoted
  verbatim. Service flags read directly: `pkceRequired`/`pkceS256Required`/`refreshTokenKept` all `false`.
- **Uncertain / notes:** the lesson's modulo-bias observation about `client/src/pkce.ts` is my own arithmetic
  (66-character alphabet, `% 66` on a byte ⇒ ~6.039 vs 6.044 bits/char, ~386 vs ~387 bits over 64
  characters) — presented as *not* exploitable, and used deliberately to teach calibrated severity judgement
  rather than as a finding. Two behaviors are labelled non-normative: refresh-token rotation (service
  config) and the bracketed Authlete error codes. The lab **cannot** verify the `pkceRequired=true` fix,
  since that is a console change on the reader's own service; it is described as configuration guidance, not
  as an exercise with a claimed output. Corrected the SPEC-INVENTORY path for PKCE: it is
  `client/src/pkce.ts`, not `client/src/services/pkce.ts`.

### Module 02 — done / verified / uncertain

- **Done:** `README.md` — derives the code-vs-token choice from the front-channel constraint; full
  parameter-by-parameter walk of RFC 6749 §4.1.1–§4.1.4; "why a code, not a token" comparison; the grant
  catalogue keyed on *human present?* + *can the client keep a secret?*; the device grant (RFC 8628) with its
  four polling error codes quoted; the two error channels (§4.1.2.1 vs §5.2) and the rule that an error may
  only be redirected to an already-validated URI; the complete RFC 9700 §4 attack catalogue (17 rows) mapped
  to the module that defends each; and what `state` does *not* do, as the setup for Module 03. `quiz.md` +
  `quiz-answers.md` (18 items across 4 tiers). Added authorization code / code interception / polling to
  `GLOSSARY.md`.
- **Done (second pass, after `fapiModes` was cleared):** `lab.md` — the full code flow driven leg by leg with
  `curl` + a cookie jar; local decode of the real tokens; five break-it exercises (code replay, mismatched
  `redirect_uri` at the token endpoint, unregistered `redirect_uri` at the authorization endpoint, the
  implicit grant, the device grant).
- **Verified against the live server (every lab command was executed):** full flow → `302` to
  `/api/session/login` → 64-char CSRF → login `302` to `/api/session/consent?…&scopes=openid,profile` →
  consent `302` to the callback with `code` (43 chars) + `state` + `iss` → token exchange returns
  `access_token, token_type, expires_in, scope, refresh_token, id_token`. The **access token is opaque**
  (43 chars, no dots) so `decode-jwt.mjs` prints its "not a JWS … introspect it instead" path; the **ID token
  decodes** as `alg:HS256` with `iss/sub/aud/exp/iat/auth_time/acr:"pwd"/s_hash`; `GET /api/userinfo` with the
  access token returns the profile claims. Breaks: replay → `invalid_grant [A050305] No such authorization
  code.`; mismatched redirect → `invalid_grant [A050309]`; unregistered redirect → **400 with no `Location`
  header**, `[A011304]`; `response_type=token` → live access token in the URL **fragment** alongside
  `token_type/expires_in/scope/iss`; device authorization → `userCode`, `interval:5`, `expiresIn:600`, and
  polling → `authorization_pending [A242307]`.
- **Verified (primary sources, this session):** RFC 6749 §3.1.1 "Response Type", §3.3 "Access Token Scope",
  §4.1 + §4.1.1–§4.1.4 titles, §4.2, §4.4, §5.1, §5.2, §6, §10.12 "Cross-Site Request Forgery"; the six §5.2
  error codes and the seven §4.1.2.1 error codes (both enumerated from the RFC). RFC 8628 title, Standards
  Track, August 2019, §3.1/§3.2/§3.4/§3.5, the grant-type URN, and all four polling error definitions quoted
  verbatim. RFC 9700 §2 and §4 subsection lists in full, plus the PKCE sentence (§2.1.1) and the exact-string
  redirect-matching sentence (§4.1) quoted verbatim. **Verified against the live server:** the three FAPI 2.0
  symptoms in the BLOCKER table, plus `[A157302]` on the public client, plus `fapiModes`/`parRequired` read
  from `/service/get`.
- **Uncertain:** `state`'s §10.12 purpose is cited by section number and title only — the fetched text of that
  paragraph came back paraphrased, so nothing from §10.12 is quoted verbatim. Two behaviors are labelled in
  the lab as **Authlete-specific, not normative**: opaque (non-JWT) access tokens, and the fact that a
  *failed* token exchange does **not** consume the authorization code (only a successful one does) — verified
  by retrying the same code with the correct `redirect_uri` after a mismatch and getting tokens. Break 4
  requires the learner to temporarily enable the `IMPLICIT` grant; the lab says so twice and tells them to
  turn it back off.

### Module 01 — done / verified / uncertain

- **Done:** full lesson (`README.md`) — the password anti-pattern and its five structural harms, deriving the
  role separation from the "client never touches the credential" constraint, the six-actor cast (four RFC 6749
  §1.1 roles + user agent + Authlete as policy engine, both explicitly flagged as *not* spec roles), an
  endpoint→actor→channel table, credential-vs-token across five properties, and a dark-theme mermaid diagram
  contrasting the anti-pattern with delegation. `lab.md` — actor inventory from live metadata, the credential
  boundary in `login.ejs:18`, server-side enforcement, three break-it exercises. `quiz.md` +
  `quiz-answers.md` (17 items across 4 tiers). Added a **Concepts** table + `User agent` / `Policy engine`
  rows to `GLOSSARY.md`. No new SPEC-INVENTORY rows needed (RFC 6749/6750/9700 already present).
- **Verified (ran against the live server on :3000):** discovery one-liner prints issuer + all six endpoints +
  `grant_types_supported`; `curl "$API/session/login" | grep -o '<form[^>]*>'` →
  `action="/api/session/login"`; `grep -n 'action=' server/src/views/consent.ejs` → line 13; POST of **valid**
  credentials to `/api/session/login` with a fresh CSRF token → **401** `"Missing authorization context -
  session not found"`; `GET /api/session/consent` → **403** `"Unauthorized - no ticket in session"`; ROPC
  token request (both `client_secret_basic` and `client_secret_post`) → `[A295306] The grant type ('password')
  is not allowed.`; `Authorization: Bearer <password>` on `/api/userinfo` → **401** with
  `WWW-Authenticate: Bearer error="invalid_token" … [A088302]`. Spec citations verified against rfc-editor.org
  this session: RFC 6749 §1.1 role definitions (quoted verbatim), §1.2, §2.1, §3.1, §3.2, §4.3 (both quoted
  sentences); RFC 6750 title/date, §2.1, §3, §3.1 `invalid_token` definition; RFC 9700 title, BCP 240,
  January 2025, **§2.4** *"The resource owner password credentials grant [RFC6749] MUST NOT be used."* and
  §2.1.2 on the implicit grant.
- **Uncertain / notes:** the ROPC lab documents **both** outcomes (refused here; if a learner's deployment
  permits it, they analyse what they did and did not gain) because the refusal is Authlete policy, not
  something the spec makes observable. Three deployment issues surfaced that affect *later* modules, not this
  one — see **Open decisions** above; the most consequential is service-level mandatory PAR, which means no
  Module 02 lab can complete a plain authorization-code flow until that is resolved. Error strings with
  bracketed codes are labelled in-lab as Authlete vendor behavior, distinct from the spec-defined status codes
  and `WWW-Authenticate` structure.

### Module 00 — done / verified / uncertain

- **Done:** full lesson (`README.md`) covering front/back channel, TLS scope, JOSE stack, decode≠verify;
  `lab.md` (discovery + JWKS + AS-metadata inspection, local decode, three break-it exercises); `quiz.md` +
  `quiz-answers.md` (16 items across 4 tiers, incl. two DPoP JOSE-precision Tier-3 items previewing Module 05).
  Added transport/encoding foundations (RFC 8446, 9110, 4648) to SPEC-INVENTORY §0.
- **Verified (ran against the live server on :3000 / locally):** `GET /api/health` → 200; `GET
  /api/.well-known/openid-configuration` → JSON (issuer/jwks_uri/endpoints); `GET
  /api/.well-known/jwks.json` → 1 EC P-256 ES256 sig key (fields kty/use/crv/kid/x/y/alg); `GET
  /.well-known/oauth-authorization-server` → JSON. `decode-jwt.mjs` sample decode + `--ath`; Break 1 (tamper
  claim, keep sig → decodes as `sub:attacker`) and Break 2 (`alg:none`) both run as written. Spec dates
  verified against primary sources (RFC 8446 Aug 2018, RFC 9110 Jun 2022, RFC 4648 Oct 2006, JOSE RFC
  7515–7519/7638).
- **Uncertain / notes:** the running server advertises a tunnel hostname + issuer `https://blackadi.dev` in
  discovery (deployment-specific) — lab notes this and uses `localhost` directly; JWKS lives at
  `/api/.well-known/jwks.json` (the `/api/jwks` path is the SPA fallback — corrected before writing). Two
  Tier-3 quiz items reference DPoP (`ath` vs `sub`, required `jwk` header) as forward previews but embed the
  RFC 9449 requirement in the question so they stay self-contained.
