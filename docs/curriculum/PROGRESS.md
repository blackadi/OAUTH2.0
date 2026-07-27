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
| [ ] | 00 · Web + JOSE | Given a raw JWT, decode it locally and explain why decoding ≠ trusting; name the three JWS parts and what each protects. |
| [ ] | 01 · Delegation problem | Explain the password anti-pattern and name all six core roles + which endpoint each talks to. |
| [ ] | 02 · OAuth core + threats | Draw the authorization-code flow at wire level; name two grants RFC 9700 deprecates and why. |
| [ ] | 03 · PKCE + public clients | Explain the exact attack PKCE closes and why `state` doesn't close it; compute an `S256` challenge. |
| [ ] | 04 · Token lifecycle + metadata | Introspect and revoke a token via `curl`; explain when to use a JWT AT vs. an opaque token. |
| [ ] | 05 · Request integrity + binding | Explain what PAR, JAR, `iss`, mTLS, and DPoP each protect; reproduce the `ath`-vs-`sub` DPoP failure. |
| [ ] | 06 · Machine + delegated grants | Distinguish impersonation from delegation in a token-exchange response; choose a grant for a daemon. |
| [ ] | 07 · OAuth 2.1 + Security BCP | Map five RFC 9700 attacks to the module that defends each; state what OAuth 2.1 removes. |
| [ ] | 08 · OIDC Core + logout | Explain why an access token doesn't authenticate a user; validate an ID token step by step; `nonce` vs. `state`. |
| [ ] | 09a · Interaction extensions | Explain what JARM adds over `state`; pick poll/ping/push for a CIBA scenario; force a step-up challenge. |
| [ ] | 09b · Identity + credentials | Explain selective disclosure in SD-JWT; place OID4VCI/VP and federation in the graph. |
| [ ] | 10 · FAPI + grant management | State the FAPI 2.0 attacker model in your own words; explain why refresh-token rotation is forbidden. |
| [ ] | 11 · API security beyond the token | Find a BOLA in a code snippet; explain why a valid token can't stop it; choose RBAC vs. ABAC vs. ReBAC. |
| [ ] | 12 · Capstone | Design a high-assurance multi-tenant authZ architecture and defend it; then find the flaws in the vulnerable variant. |

## Assessment gates

- [ ] **Cumulative Exam A** (after Module 03) — foundations through PKCE
- [ ] **Cumulative Exam B** (after Module 07) — full OAuth 2.0 + hardening + consolidation
- [ ] **Cumulative Exam C** (after Module 11) — OIDC, extensions, FAPI, API security
- [ ] **Final Exam** (before Module 12) — everything, with a self-grading rubric
- [ ] **Capstone** — design + adversarial review, graded against the rubric

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
