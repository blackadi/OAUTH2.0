# Cumulative Exam C — OIDC, extensions, credentials, FAPI, API security

**Take after Module 11.** Covers Modules 08–11. **15 items, 100 points, 2 hours, closed book.**
Answers: [exam-c-answers.md](exam-c-answers.md).

---

## Section 1 — OIDC Core and logout (25 points)

**C1 (8 pts).** An application logs users in like this:

```js
const profile = await fetch('/userinfo', {
  headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json());
session.user = profile.sub;
```

Name the vulnerability class, describe a concrete attack, and give the fix. Then state the general principle
in one sentence — the one that explains *why* an access token cannot do this job.

**C2 (9 pts).** You are handed an ID token. List the validation steps you would perform, in order. You do not
need all thirteen from OIDC Core §3.1.3.7, but you must include the ones that defeat: **substitution**,
**forgery**, **algorithm confusion**, **replay**, and **injection** — and say which step defeats which.

**C3 (4 pts).** `nonce` and `state` are both random values echoed back. Give the key structural asymmetry
between them, and what follows from it.

**C4 (4 pts).** Name the four logout specifications and, for each, one thing it **cannot** reach.

## Section 2 — Extensions (20 points)

**C5 (6 pts).** Module 09a framed four extensions as lifting four assumptions the earlier modules had baked
in. Name the four assumptions and the extension that lifts each.

**C6 (7 pts).** JARM. State the three mandatory claims in the response JWT, explain what JARM adds over
`state` **and** over PAR/JAR, and give the reason `iss` inside a signature is structurally stronger than `iss`
as a query parameter.

**C7 (7 pts).** A CIBA deployment sends a push notification saying "Approve login?" with no further context.
Explain the threat this creates, why it has **no analogue** in a redirect flow, and what `binding_message`
does and does not fix.

## Section 3 — Credentials (20 points)

**C8 (8 pts).** Derive SD-JWT's construction from requirements. Start from "a signature covers the whole
payload, so removing a claim breaks it" and reach salted digests, justifying each step. Your answer must
explain why the salt is load-bearing.

**C9 (6 pts).** A verifier implements: verify the issuer signature; if a KB-JWT is present, check it; decode
each disclosure and merge the values. Name **two** defects, and say which is worse and why.

**C10 (6 pts).** State the one unlinkability property SD-JWT **cannot** provide, why it cannot, and what a
deployment can do about verifier-to-verifier correlation.

## Section 4 — FAPI and API security (25 points)

**C11 (7 pts).** Name the FAPI 2.0 attacker model's six attackers and, for each, its distinguishing
capability in one line. Then name **three** things the model puts out of scope, and explain why an explicit
exclusions list makes the security claim **stronger**.

**C12 (5 pts).** Why does FAPI 2.0 **forbid** refresh-token rotation? Give the argument in steps.

**C13 (6 pts).** Name the three OWASP API Security Top 10 (2023) items that are authorization failures, give
each one's identifier, and state what the attacker changes in the request for each.

**C14 (7 pts).** Explain structurally why a valid, sender-constrained, audience-restricted access token cannot
prevent BOLA. Then give the code pattern you would mandate instead of an ownership check, and say why it is
better than a correct check.

## Section 5 — Integrative (10 points)

**C15 (10 pts).** A team says: *"We're FAPI 2.0 certified and we run the conformance suite in CI, so our API
is secure."*

Write the reply. Cover: what certification and conformance genuinely evidence; the specific section of the
FAPI 2.0 attacker model that limits the claim; at least **two** classes of vulnerability that would pass every
conformance test; and the one question you would ask them next.
